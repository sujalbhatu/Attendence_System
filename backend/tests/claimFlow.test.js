/**
 * Controller-level tests for the claim → PIN → verify flow, with in-memory
 * fakes in place of the Mongoose models, the ML service and the config.
 * Run: npm test   (uses node --test --experimental-test-module-mocks)
 */
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { TokenService } from '../services/tokenService.js';

const url = (p) => new URL(p, import.meta.url).href;
const oid = () => crypto.randomBytes(12).toString('hex');

// ---------- in-memory fakes ----------
const db = { sessions: new Map(), students: new Map(), claims: [], records: [] };

const query = (value) => {
  const q = Promise.resolve(value);
  q.select = () => q;
  q.populate = () => q;
  return q;
};

class FakeClaim {
  constructor(data) {
    Object.assign(this, { _id: oid(), status: 'AWAITING_BIOMETRICS', pinAttempts: 0, assignedDelayMs: 0 }, data);
  }
  async save() {
    if (!db.claims.includes(this)) db.claims.push(this);
    return this;
  }
  static findOne(filter) {
    return query(db.claims.find((c) => Object.entries(filter).every(([k, v]) => String(c[k]) === String(v))) || null);
  }
  static async deleteOne({ _id }) {
    db.claims = db.claims.filter((c) => c._id !== _id);
  }
  static async findOneAndUpdate(filter, update) {
    const c = db.claims.find((x) => x._id === filter._id && x.status === filter.status);
    if (!c) return null;
    c.pinAttempts += update.$inc.pinAttempts;
    return c;
  }
}

const FakeSession = {
  findById: (id) => query(db.sessions.get(String(id)) || null),
  findByIdAndUpdate: async () => {},
  findOne: () => query(null)
};

const FakeStudent = {
  findById: (id) => query(db.students.get(String(id)) || null)
};

const FakeRecord = {
  exists: async ({ sessionId, studentId }) =>
    db.records.some((r) => String(r.sessionId) === String(sessionId) && String(r.studentId) === String(studentId)),
  create: async (doc) => {
    if (db.records.some((r) => String(r.sessionId) === String(doc.sessionId) && String(r.studentId) === String(doc.studentId))) {
      const err = new Error('duplicate'); err.code = 11000; throw err;
    }
    const rec = { ...doc, markedAt: new Date() };
    db.records.push(rec);
    return rec;
  }
};

const mlCalls = [];
let mlResponse = { matched: true, similarity: 0.82, liveness: { is_live: true, score: 0.95 }, embedding: [0.1, 0.2] };

class FakeFormData {
  constructor() { this.fields = {}; }
  append(k, v) { this.fields[k] = v; }
  getHeaders() { return {}; }
}

mock.module(url('../models/Session.js'), { defaultExport: FakeSession });
mock.module(url('../models/Student.js'), { defaultExport: FakeStudent });
mock.module(url('../models/Claim.js'), { defaultExport: FakeClaim });
mock.module(url('../models/AttendanceRecord.js'), { defaultExport: FakeRecord });
mock.module(url('../config.js'), {
  namedExports: {
    TOKEN_GRACE_MS: 1500, PIN_GRACE_MS: 2000, PIN_WINDOW_MS: 15000, MAX_PIN_ATTEMPTS: 2,
    CLAIM_TTL_MS: 60000, ALLOW_SELF_ENROLLMENT: true, ML_SERVICE_URL: 'http://ml.test'
  }
});
mock.module('axios', { defaultExport: { post: async (u, form) => { mlCalls.push(form.fields); return { data: mlResponse }; } } });
mock.module('form-data', { defaultExport: FakeFormData });
mock.module('fs', { defaultExport: { createReadStream: (p) => p, unlink: (p, cb) => cb && cb() } });

const ctrl = await import('../controllers/attendanceController.js');

// ---------- helpers ----------
const SECRET = 'c'.repeat(64);
let session, student;

const res = () => {
  const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};
const call = async (fn, req) => { const r = res(); await fn(req, r); return r; };
const freshToken = (nowMs = Date.now()) => TokenService.generateToken(SECRET, session._id, 4, nowMs);

beforeEach(() => {
  db.sessions.clear(); db.students.clear(); db.claims = []; db.records = []; mlCalls.length = 0;
  mlResponse = { matched: true, similarity: 0.82, liveness: { is_live: true, score: 0.95 }, embedding: [0.1, 0.2] };
  session = {
    _id: oid(), status: 'ACTIVE', totpSecret: SECRET, tokenIntervalSeconds: 4, requirePin: false,
    requireLiveness: true, courseCode: 'CS401', classroomId: { roomCode: 'L-302' }
  };
  student = { _id: oid(), rollNumber: '2023UGCS042', name: 'Test Student', isEnrolled: true, faceEmbedding: [0.1, 0.2], save: async () => {} };
  db.sessions.set(session._id, session);
  db.students.set(student._id, student);
});

// ---------- tests ----------
test('fresh token → claim accepted with a ticket and an upload slot', async () => {
  const r = await call(ctrl.claimAttendance, { body: { sessionId: session._id, scannedToken: freshToken().token }, student });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.status, 'CLAIM_ACCEPTED');
  assert.match(r.body.claimTicket, /^tkt_/);
});

test('token from two windows ago → TOKEN_EXPIRED', async () => {
  const r = await call(ctrl.claimAttendance, { body: { sessionId: session._id, scannedToken: freshToken(Date.now() - 9000).token }, student });
  assert.equal(r.statusCode, 400);
  assert.equal(r.body.code, 'TOKEN_EXPIRED');
});

test('PIN sessions: claim first, then PIN; wrong PINs lock the claim', async () => {
  session.requirePin = true;
  const claim = await call(ctrl.claimAttendance, { body: { sessionId: session._id, scannedToken: freshToken().token }, student });
  assert.equal(claim.body.status, 'PIN_REQUIRED');
  const ticket = claim.body.claimTicket;

  const live = freshToken().pin;
  const prev = TokenService.generateToken(SECRET, session._id, 4, Date.now() - 4000).pin;
  const wrong = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((d) => d !== live && d !== prev);

  const first = await call(ctrl.submitPin, { body: { claimTicket: ticket, pin: wrong }, student });
  assert.equal(first.body.code, 'PIN_MISMATCH');
  assert.equal(first.body.attemptsLeft, 1);

  const second = await call(ctrl.submitPin, { body: { claimTicket: ticket, pin: wrong }, student });
  assert.equal(second.body.code, 'PIN_LOCKED');
  assert.equal(db.claims.length, 0);

  const again = await call(ctrl.claimAttendance, { body: { sessionId: session._id, scannedToken: freshToken().token }, student });
  const ok = await call(ctrl.submitPin, { body: { claimTicket: again.body.claimTicket, pin: freshToken().pin }, student });
  assert.equal(ok.body.status, 'CLAIM_ACCEPTED');
});

test('verify ignores a client attempt to switch liveness off', async () => {
  const c = await call(ctrl.claimAttendance, { body: { sessionId: session._id, scannedToken: freshToken().token }, student });
  const r = await call(ctrl.verifyBiometrics, {
    body: { claimTicket: c.body.claimTicket, requireLiveness: 'false' },
    files: [{ path: '/tmp/frame0.jpg' }],
    student
  });
  assert.equal(r.body.status, 'PRESENT');
  assert.equal(mlCalls[0].require_liveness, 'true');
  assert.equal(db.records.length, 1);
});

test("a student cannot use someone else's claim ticket", async () => {
  const c = await call(ctrl.claimAttendance, { body: { sessionId: session._id, scannedToken: freshToken().token }, student });
  const intruder = { _id: oid(), rollNumber: 'X', name: 'Other' };
  const r = await call(ctrl.verifyBiometrics, { body: { claimTicket: c.body.claimTicket }, files: [{ path: '/tmp/f.jpg' }], student: intruder });
  assert.equal(r.body.code, 'CLAIM_EXPIRED');
  assert.equal(db.records.length, 0);
});

test('first-scan self-enrollment is recorded as FLAGGED for faculty review', async () => {
  student.faceEmbedding = null;
  student.isEnrolled = false;
  const c = await call(ctrl.claimAttendance, { body: { sessionId: session._id, scannedToken: freshToken().token }, student });
  const r = await call(ctrl.verifyBiometrics, { body: { claimTicket: c.body.claimTicket }, files: [{ path: '/tmp/f.jpg' }], student });
  assert.equal(r.body.status, 'FLAGGED');
  assert.equal(db.records[0].flagReason, 'FIRST_SELF_ENROLLMENT');
  assert.equal(student.enrollmentSource, 'SELF_SCAN');
});

test('a spoof (no blink) is rejected and nothing is recorded', async () => {
  mlResponse = { matched: false, liveness: { is_live: false, reason: 'No natural blink detected' } };
  const c = await call(ctrl.claimAttendance, { body: { sessionId: session._id, scannedToken: freshToken().token }, student });
  const r = await call(ctrl.verifyBiometrics, { body: { claimTicket: c.body.claimTicket }, files: [{ path: '/tmp/f.jpg' }], student });
  assert.equal(r.body.code, 'SPOOF_DETECTED');
  assert.equal(db.records.length, 0);
});

test('already marked → 409 on a second claim', async () => {
  db.records.push({ sessionId: session._id, studentId: student._id });
  const r = await call(ctrl.claimAttendance, { body: { sessionId: session._id, scannedToken: freshToken().token }, student });
  assert.equal(r.statusCode, 409);
});
