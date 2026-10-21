/**
 * k6: a class of 120 checks in within ~15 seconds.
 *
 *   k6 run -e BASE=http://127.0.0.1:3101 -e LABEL=redis-on loadtest/checkin.js
 *
 * Each iteration is one student: scan (POST /claim with a live QR token computed the
 * same way the projector does), wait the upload slot the server assigns, then the face
 * check (POST /verify with 12 frames, like the phone sends). Uses loadtest/.fixture.json
 * from setup.mjs. 120 arrivals at 8/s = 15 s.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import crypto from 'k6/crypto';
import exec from 'k6/execution';

const fixture = JSON.parse(open('./.fixture.json'));
const frame = open(__ENV.FRAME || './frame.jpg', 'b');
const BASE = __ENV.BASE || 'http://127.0.0.1:3101';
const STUDENTS = fixture.students.length;

const claimMs = new Trend('claim_ms', true);
const verifyMs = new Trend('verify_ms', true);
const checkinMs = new Trend('checkin_total_ms', true);
const present = new Rate('marked_present');
const failures = new Counter('checkin_failures');

export const options = {
  scenarios: {
    class_of_120: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.RATE) || 8, // students per second
      timeUnit: '1s',
      duration: `${Math.ceil(STUDENTS / (Number(__ENV.RATE) || 8))}s`,
      preAllocatedVUs: STUDENTS,
      maxVUs: STUDENTS,
      gracefulStop: '120s' // let every student who arrived finish, however slow the server is
    }
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'max']
};

// token = first 8 hex of HMAC-SHA256(secret, `${sessionId}:${floor(now/4s)}`), uppercased
const liveToken = () => {
  const step = Math.floor(Date.now() / (fixture.intervalSeconds * 1000));
  return crypto.hmac('sha256', fixture.totpSecret, `${fixture.sessionId}:${step}`, 'hex').toUpperCase().slice(0, 8);
};

export default function () {
  const i = exec.scenario.iterationInTest;
  if (i >= STUDENTS) return;
  const student = fixture.students[i];
  const auth = { Authorization: `Bearer ${student.token}` };
  const t0 = Date.now();

  const claim = http.post(
    `${BASE}/api/attendance/claim`,
    JSON.stringify({ sessionId: fixture.sessionId, scannedToken: liveToken(), clientGps: fixture.gps }),
    { headers: { ...auth, 'Content-Type': 'application/json' }, tags: { step: 'claim' } }
  );
  claimMs.add(claim.timings.duration);
  if (!check(claim, { 'claim 200': (r) => r.status === 200 })) {
    failures.add(1, { step: 'claim', status: String(claim.status) });
    console.warn(`FAIL claim ${claim.status} ${String(claim.body).slice(0, 120)}`);
    present.add(false);
    return;
  }
  const { claimTicket, assignedDelayMs } = claim.json();

  // The phone waits its assigned upload slot before sending frames (thundering-herd stagger)
  sleep((assignedDelayMs || 0) / 1000);

  const files = [];
  for (let f = 0; f < 12; f++) files.push(http.file(frame, `frame_${f}.jpg`, 'image/jpeg'));
  const verify = http.post(`${BASE}/api/attendance/verify`, multipart(claimTicket, files), {
    headers: { ...auth, 'Content-Type': `multipart/form-data; boundary=${BOUNDARY}` },
    tags: { step: 'verify' },
    timeout: '60s'
  });
  verifyMs.add(verify.timings.duration);
  const ok = check(verify, {
    'verify 200': (r) => r.status === 200,
    'marked PRESENT': (r) => r.status === 200 && r.json('status') === 'PRESENT'
  });
  present.add(ok);
  if (!ok) {
    failures.add(1, { step: 'verify', status: String(verify.status) });
    console.warn(`FAIL verify ${verify.status} ${String(verify.body).slice(0, 120)}`);
  }
  checkinMs.add(Date.now() - t0);
}

// Hand-built multipart body so all 12 frames share the field name "images" (what multer expects)
const BOUNDARY = '----rollone-k6-boundary';
function multipart(claimTicket, files) {
  const chunks = [`--${BOUNDARY}\r\nContent-Disposition: form-data; name="claimTicket"\r\n\r\n${claimTicket}\r\n`];
  for (const f of files) {
    chunks.push(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="images"; filename="${f.filename}"\r\nContent-Type: image/jpeg\r\n\r\n`);
    chunks.push(f.data);
    chunks.push('\r\n');
  }
  chunks.push(`--${BOUNDARY}--\r\n`);
  return joinBinary(chunks);
}

function joinBinary(chunks) {
  const arrays = chunks.map((c) => (typeof c === 'string' ? strToBytes(c) : new Uint8Array(c)));
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out.buffer;
}

function strToBytes(s) {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

export function handleSummary(data) {
  const m = data.metrics;
  const pick = (name) => m[name] && m[name].values;
  const summary = {
    label: __ENV.LABEL || 'run',
    students: STUDENTS,
    iterations: pick('iterations') && pick('iterations').count,
    interrupted: pick('iterations_interrupted') ? pick('iterations_interrupted').count : 0,
    duration_s: data.state.testRunDurationMs / 1000,
    checkins_per_s: pick('marked_present') ? (pick('marked_present').passes / (data.state.testRunDurationMs / 1000)) : 0,
    marked_present_rate: pick('marked_present') && pick('marked_present').rate,
    http_req_failed_rate: pick('http_req_failed') && pick('http_req_failed').rate,
    requests_per_s: pick('http_reqs') && pick('http_reqs').rate,
    claim_ms: pick('claim_ms'),
    verify_ms: pick('verify_ms'),
    checkin_total_ms: pick('checkin_total_ms')
  };
  return {
    stdout: JSON.stringify(summary, null, 2) + '\n',
    [`./loadtest/results-${summary.label}.json`]: JSON.stringify(summary, null, 2)
  };
}
