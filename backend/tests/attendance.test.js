import { test, describe, before, beforeEach, after, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import axios from 'axios';
import {
  resetDatabase, truncateAll, closePool, query,
  makeFaculty, makeStudent, makeSession, makeCourse, enroll,
  facultyToken, studentToken, embedding
} from './helpers.js';
import { createApp } from '../app.js';
import { TokenService } from '../services/tokenService.js';
import { migrate } from '../db/migrate.js';
import { getSessionSecret } from '../repositories/sessions.js';
import { deleteExpiredClaims } from '../repositories/attendance.js';
import { MAX_PIN_ATTEMPTS } from '../config.js';

const app = createApp();
const fakeImage = [Buffer.from('fake'), { filename: 'f.jpg', contentType: 'image/jpeg' }];
const gps = { latitude: 22.77618, longitude: 86.14325, accuracyMeters: 5 };

before(resetDatabase);
beforeEach(truncateAll);
afterEach(() => mock.restoreAll());
after(closePool);

async function liveCode(session, nowMs = Date.now()) {
  const { totp_secret } = await getSessionSecret(session.id);
  return TokenService.generateToken(totp_secret, session.id, 4, nowMs);
}
const liveToken = async (session, nowMs) => (await liveCode(session, nowMs)).token;

const claim = async (student, session, body = {}) =>
  request(app)
    .post('/api/attendance/claim')
    .set('Authorization', `Bearer ${studentToken(student)}`)
    .send({ sessionId: session.id, scannedToken: await liveToken(session), clientGps: gps, ...body });

const verify = (student, claimTicket) =>
  request(app)
    .post('/api/attendance/verify')
    .set('Authorization', `Bearer ${studentToken(student)}`)
    .field('claimTicket', claimTicket)
    .attach('images', ...fakeImage);

const mlReturns = (data) => mock.method(axios, 'post', async () => ({ data }));

const submitPin = (student, claimTicket, pin) =>
  request(app)
    .post('/api/attendance/claim/pin')
    .set('Authorization', `Bearer ${studentToken(student)}`)
    .send({ claimTicket, pin });

describe('scan to PRESENT', () => {
  test('claim, then verify, marks the student present and bumps the counter', async () => {
    const student = await makeStudent({ embedding: embedding() });
    const session = await makeSession();

    const claimed = await claim(student, session);
    assert.equal(claimed.status, 200, JSON.stringify(claimed.body));
    assert.equal(claimed.body.status, 'CLAIM_ACCEPTED');
    assert.match(claimed.body.claimTicket, /^tkt_/);
    assert.equal(claimed.body.student.rollNumber, student.rollNumber);

    mlReturns({ matched: true, similarity: 0.82, liveness: { is_live: true, score: 0.9 }, embedding: embedding(2) });
    const verified = await verify(student, claimed.body.claimTicket);
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    assert.equal(verified.body.status, 'PRESENT');

    const { rows: [record] } = await query('SELECT * FROM attendance_records WHERE session_id = $1', [session.id]);
    assert.equal(record.student_id, student.id);
    assert.equal(record.cosine_similarity, 0.82);
    const { rows: [s] } = await query('SELECT present_count FROM sessions WHERE id = $1', [session.id]);
    assert.equal(s.present_count, 1);
    const { rows: claims } = await query('SELECT * FROM claims');
    assert.equal(claims.length, 0, 'claim is consumed');
    // similarity >= 0.75, so the stored template moved toward the probe
    const { rows: [st] } = await query('SELECT embedding_version FROM students WHERE id = $1', [student.id]);
    assert.equal(st.embedding_version, 2);
  });

  test('a QR code from two windows ago is rejected', async () => {
    const student = await makeStudent();
    const session = await makeSession();
    const res = await claim(student, session, { scannedToken: await liveToken(session, Date.now() - 9000) });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'TOKEN_EXPIRED');
  });

  test('a code that is not a session id is rejected', async () => {
    const student = await makeStudent();
    const session = await makeSession();
    const res = await claim(student, session, { sessionId: '64f0c0ffee0000000000abcd' });
    assert.equal(res.body.code, 'INVALID_QR');
  });

  test('scanning from outside the geofence is rejected', async () => {
    const student = await makeStudent();
    const session = await makeSession();
    const res = await claim(student, session, { clientGps: { latitude: 22.8, longitude: 86.2, accuracyMeters: 5 } });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'GEOFENCE_VIOLATION');
  });

  test('claiming twice reuses the same live ticket', async () => {
    const student = await makeStudent();
    const session = await makeSession();
    const first = await claim(student, session);
    const second = await claim(student, session);
    assert.equal(first.body.claimTicket, second.body.claimTicket);
  });

  test('an expired claim is replaced with a fresh ticket', async () => {
    const student = await makeStudent();
    const session = await makeSession();
    const first = await claim(student, session);
    await query(`UPDATE claims SET expire_at = now() - interval '1 second'`);
    const second = await claim(student, session);
    assert.notEqual(first.body.claimTicket, second.body.claimTicket);
  });

  test('cannot claim after already being marked present', async () => {
    const student = await makeStudent({ embedding: embedding() });
    const session = await makeSession();
    const claimed = await claim(student, session);
    mlReturns({ matched: true, similarity: 0.7, liveness: { is_live: true } });
    await verify(student, claimed.body.claimTicket);

    const again = await claim(student, session);
    assert.equal(again.status, 409);
    assert.equal(again.body.code, 'ALREADY_MARKED');
  });

  test('two verifications racing for the same student record one row', async () => {
    const student = await makeStudent({ embedding: embedding() });
    const session = await makeSession();
    const claimed = await claim(student, session);
    mlReturns({ matched: true, similarity: 0.7, liveness: { is_live: true } });

    const results = await Promise.all([
      verify(student, claimed.body.claimTicket),
      verify(student, claimed.body.claimTicket)
    ]);
    assert.ok(results.some((r) => r.body.status === 'PRESENT'));
    const { rows: [counts] } = await query(
      `SELECT (SELECT count(*) FROM attendance_records)::int AS records,
              (SELECT present_count FROM sessions WHERE id = $1) AS present`,
      [session.id]
    );
    assert.equal(counts.records, 1);
    assert.equal(counts.present, 1);
  });

  test('a face mismatch does not mark attendance', async () => {
    const student = await makeStudent({ embedding: embedding() });
    const session = await makeSession();
    const claimed = await claim(student, session);
    mlReturns({ matched: false, similarity: 0.3, liveness: { is_live: true } });
    const res = await verify(student, claimed.body.claimTicket);
    assert.equal(res.body.code, 'BIOMETRIC_MISMATCH');
    const { rows } = await query('SELECT count(*)::int AS n FROM attendance_records');
    assert.equal(rows[0].n, 0);
  });
});

describe('Line-of-Sight PIN', () => {
  test('claim first, then the PIN; two wrong PINs lock the claim', async () => {
    const student = await makeStudent({ embedding: embedding() });
    const session = await makeSession({ requirePin: true });

    const claimed = await claim(student, session);
    assert.equal(claimed.body.status, 'PIN_REQUIRED', JSON.stringify(claimed.body));
    assert.equal(claimed.body.attemptsAllowed, MAX_PIN_ATTEMPTS);
    const ticket = claimed.body.claimTicket;

    // Verify is not allowed before the PIN
    const early = await verify(student, ticket);
    assert.equal(early.body.code, 'CLAIM_EXPIRED');

    // The PIN on screen changes every 4 s, so pick a digit that is wrong right now (not the
    // current, previous or next window's PIN) just before each submit, not once up front.
    const wrongPin = async () => {
      const now = Date.now();
      const near = await Promise.all([now - 4000, now, now + 4000].map(async (t) => (await liveCode(session, t)).pin));
      return [1, 2, 3, 4, 5, 6, 7, 8, 9].find((d) => !near.includes(d));
    };

    const first = await submitPin(student, ticket, await wrongPin());
    assert.equal(first.body.code, 'PIN_MISMATCH');
    assert.equal(first.body.attemptsLeft, 1);

    const second = await submitPin(student, ticket, await wrongPin());
    assert.equal(second.body.code, 'PIN_LOCKED');
    const { rows } = await query('SELECT count(*)::int AS n FROM claims');
    assert.equal(rows[0].n, 0, 'the locked claim is deleted');

    const again = await claim(student, session);
    const ok = await submitPin(student, again.body.claimTicket, (await liveCode(session)).pin);
    assert.equal(ok.body.status, 'CLAIM_ACCEPTED', JSON.stringify(ok.body));

    mlReturns({ matched: true, similarity: 0.7, liveness: { is_live: true } });
    const verified = await verify(student, again.body.claimTicket);
    assert.equal(verified.body.status, 'PRESENT');
  });

  test('parallel wrong guesses cannot exceed the attempt limit', async () => {
    const student = await makeStudent();
    const session = await makeSession({ requirePin: true });
    const claimed = await claim(student, session);
    const live = (await liveCode(session)).pin;
    const prev = (await liveCode(session, Date.now() - 4000)).pin;
    const wrong = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((d) => d !== live && d !== prev);

    const results = await Promise.all(Array.from({ length: 5 }, () => submitPin(student, claimed.body.claimTicket, wrong)));
    const mismatches = results.filter((r) => r.body.code === 'PIN_MISMATCH').length;
    assert.ok(mismatches <= MAX_PIN_ATTEMPTS - 1, `${mismatches} guesses got a retry`);
    assert.ok(results.some((r) => r.body.code === 'PIN_LOCKED' || r.body.code === 'CLAIM_EXPIRED'));
  });

  test('a PIN entered after the window is refused', async () => {
    const student = await makeStudent();
    const session = await makeSession({ requirePin: true });
    const claimed = await claim(student, session);
    await query(`UPDATE claims SET pin_deadline = now() - interval '1 second'`);
    const res = await submitPin(student, claimed.body.claimTicket, (await liveCode(session)).pin);
    assert.equal(res.body.code, 'PIN_TIMEOUT');
  });

  test('turning the PIN on and off is limited to the owner', async () => {
    const faculty = await makeFaculty();
    const session = await makeSession({ faculty });
    const other = await request(app).put(`/api/sessions/${session.id}/toggle-pin`).set('Authorization', `Bearer ${facultyToken(await makeFaculty())}`);
    assert.equal(other.status, 404);
    const on = await request(app).put(`/api/sessions/${session.id}/toggle-pin`).set('Authorization', `Bearer ${facultyToken(faculty)}`);
    assert.equal(on.body.requirePin, true);
  });
});

describe('concluding a lecture', () => {
  test('enrolled students who did not scan are marked ABSENT', async () => {
    const faculty = await makeFaculty();
    const course = await makeCourse();
    const [present, absent1, absent2, otherBranch] = await Promise.all([
      makeStudent({ embedding: embedding() }), makeStudent(), makeStudent(), makeStudent()
    ]);
    await Promise.all([enroll(present, course), enroll(absent1, course), enroll(absent2, course), enroll(otherBranch, course, 'ECE')]);
    const session = await makeSession({ faculty, course });

    const claimed = await claim(present, session);
    mlReturns({ matched: true, similarity: 0.7, liveness: { is_live: true } });
    await verify(present, claimed.body.claimTicket);

    const res = await request(app)
      .put(`/api/sessions/${session.id}/conclude`)
      .set('Authorization', `Bearer ${facultyToken(faculty)}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.stats, { present: 1, absent: 2, total: 3 });
    assert.equal(res.body.session.status, 'CONCLUDED');

    const csv = await request(app)
      .get(`/api/sessions/${session.id}/export-csv`)
      .set('Authorization', `Bearer ${facultyToken(faculty)}`);
    assert.equal(csv.status, 200);
    assert.equal(csv.text.trim().split('\n').length, 4, 'header + 3 students');

    const { rows } = await query(
      'SELECT student_id, status FROM attendance_records WHERE session_id = $1 ORDER BY status',
      [session.id]
    );
    assert.deepEqual(rows.map((r) => r.status), ['ABSENT', 'ABSENT', 'PRESENT']);
  });

  test('the student portal shows attendance per course', async () => {
    const faculty = await makeFaculty();
    const course = await makeCourse();
    const student = await makeStudent({ embedding: embedding() });
    await enroll(student, course);

    for (let i = 0; i < 2; i++) {
      const session = await makeSession({ faculty, course });
      if (i === 0) {
        const claimed = await claim(student, session);
        mlReturns({ matched: true, similarity: 0.7, liveness: { is_live: true } });
        await verify(student, claimed.body.claimTicket);
        mock.restoreAll();
      }
      await request(app).put(`/api/sessions/${session.id}/conclude`).set('Authorization', `Bearer ${facultyToken(faculty)}`);
    }

    const res = await request(app)
      .get('/api/student-portal/my-courses')
      .set('Authorization', `Bearer ${studentToken(student)}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.courses.length, 1);
    assert.deepEqual(res.body.courses[0].attendance, { present: 1, total: 2, percentage: 50 });

    const detail = await request(app)
      .get(`/api/student-portal/attendance/${course.id}`)
      .set('Authorization', `Bearer ${studentToken(student)}`);
    assert.equal(detail.body.attendance.length, 2);
    assert.ok(detail.body.attendance[0].sessionId.sessionDate);
  });
});

describe('database plumbing', () => {
  test('migrations are idempotent', async () => {
    await migrate({ log: () => {} });
    const { rows } = await query('SELECT count(*)::int AS n FROM schema_migrations');
    assert.equal(rows[0].n, 1);
  });

  test('expired claims are swept', async () => {
    const student = await makeStudent();
    const session = await makeSession();
    await claim(student, session);
    await query(`UPDATE claims SET expire_at = now() - interval '1 second'`);
    assert.equal(await deleteExpiredClaims(), 1);
  });

  test('deleting a student keeps the attendance history', async () => {
    const student = await makeStudent({ embedding: embedding() });
    const session = await makeSession();
    const claimed = await claim(student, session);
    mlReturns({ matched: true, similarity: 0.7, liveness: { is_live: true } });
    await verify(student, claimed.body.claimTicket);

    await query('DELETE FROM students WHERE id = $1', [student.id]);
    const { rows } = await query('SELECT roll_number, student_id FROM attendance_records');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].roll_number, student.rollNumber);
    assert.equal(rows[0].student_id, null);
  });

  test('health check reports the database', async () => {
    const res = await request(app).get('/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.database, 'connected');
  });

  test('old MongoDB ids are a 404, not a 500', async () => {
    const faculty = await makeFaculty();
    const res = await request(app)
      .get('/api/sessions/64f0c0ffee0000000000abcd')
      .set('Authorization', `Bearer ${facultyToken(faculty)}`);
    assert.equal(res.status, 404);
  });
});
