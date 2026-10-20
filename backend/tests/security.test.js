/**
 * The security fixes, checked end to end against a real Postgres database.
 * Run: TEST_DATABASE_URL=postgres://... npm test   (the database is wiped)
 */
import { test, describe, before, beforeEach, after, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import axios from 'axios';
import {
  resetDatabase, truncateAll, closePool, query,
  makeFaculty, makeStudent, makeSession, facultyToken, studentToken, embedding
} from './helpers.js';
import { createApp } from '../app.js';

const app = createApp();
const SECRET = process.env.JWT_SECRET;
const fakeImage = [Buffer.from('fake'), { filename: 'f.jpg', contentType: 'image/jpeg' }];
const asFaculty = (user) => ({ Authorization: `Bearer ${facultyToken(user)}` });
const asStudent = (student) => ({ Authorization: `Bearer ${studentToken(student)}` });

before(resetDatabase);
beforeEach(truncateAll);
afterEach(() => mock.restoreAll());
after(closePool);

async function insertClaim(student, session, { ticket = `tkt_${student.id}`, expired = false } = {}) {
  await query(
    `INSERT INTO claims (claim_ticket, session_id, student_id, roll_number, expire_at)
     VALUES ($1, $2, $3, $4, now() + ($5 || ' seconds')::interval)`,
    [ticket, session.id, student.id, student.rollNumber, expired ? '-1' : '60']
  );
  return ticket;
}

const verify = (student, claimTicket, fields = {}) => {
  let req = request(app).post('/api/attendance/verify').set(asStudent(student)).field('claimTicket', claimTicket);
  for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
  return req.attach('images', ...fakeImage);
};

describe('session details and totpSecret', () => {
  test('GET /api/sessions/:id needs a faculty login', async () => {
    const session = await makeSession();
    const res = await request(app).get(`/api/sessions/${session.id}`);
    assert.equal(res.status, 401);
  });

  test('another faculty cannot read my session', async () => {
    const session = await makeSession();
    const res = await request(app).get(`/api/sessions/${session.id}`).set(asFaculty(await makeFaculty()));
    assert.equal(res.status, 404);
  });

  test('the owner gets the session without totpSecret', async () => {
    const faculty = await makeFaculty();
    const session = await makeSession({ faculty });
    const res = await request(app).get(`/api/sessions/${session.id}`).set(asFaculty(faculty));
    assert.equal(res.status, 200);
    assert.equal(res.body.session._id, session.id);
    assert.equal(res.body.session.classroomId.roomCode, session.classroomId.roomCode);
    assert.ok(!JSON.stringify(res.body).toLowerCase().includes('totp'), 'no secret in the response');
  });

  test('a faculty session list never includes the secret', async () => {
    const faculty = await makeFaculty();
    await makeSession({ faculty });
    const res = await request(app).get('/api/sessions/my').set(asFaculty(faculty));
    assert.equal(res.body.sessions.length, 1);
    assert.ok(!JSON.stringify(res.body).toLowerCase().includes('totp'));
  });
});

describe('projector QR feed', () => {
  test('the feed without a projector token is rejected', async () => {
    const session = await makeSession();
    const res = await request(app).get(`/api/sessions/${session.id}/qr-feed`);
    assert.equal(res.status, 401);
  });

  test('a projector token for one session does not open another', async () => {
    const [a, b] = [await makeSession(), await makeSession()];
    const pt = jwt.sign({ sid: a.id, scope: 'projector' }, SECRET);
    const res = await request(app).get(`/api/sessions/${b.id}/qr-feed?pt=${pt}`);
    assert.equal(res.status, 401);
  });

  test('a faculty login token is not accepted as a projector token', async () => {
    const faculty = await makeFaculty();
    const session = await makeSession({ faculty });
    const res = await request(app).get(`/api/sessions/${session.id}/qr-feed?pt=${facultyToken(faculty)}`);
    assert.equal(res.status, 401);
  });

  test('only the owner can get a projector token, and it expires', async () => {
    const faculty = await makeFaculty();
    const session = await makeSession({ faculty });
    const denied = await request(app).post(`/api/sessions/${session.id}/projector-token`).set(asFaculty(await makeFaculty()));
    assert.equal(denied.status, 404);

    const ok = await request(app).post(`/api/sessions/${session.id}/projector-token`).set(asFaculty(faculty));
    assert.equal(ok.status, 200);
    const decoded = jwt.verify(ok.body.projectorToken, SECRET);
    assert.equal(decoded.sid, session.id);
    assert.equal(decoded.scope, 'projector');
    assert.ok(decoded.exp - decoded.iat <= 4 * 3600);
  });

  test('a valid projector token streams the rotating code', async () => {
    const faculty = await makeFaculty();
    const session = await makeSession({ faculty });
    const { body } = await request(app).post(`/api/sessions/${session.id}/projector-token`).set(asFaculty(faculty));

    const server = app.listen(0);
    try {
      const { port } = server.address();
      const controller = new AbortController();
      const res = await fetch(`http://127.0.0.1:${port}/api/sessions/${session.id}/qr-feed?pt=${body.projectorToken}`, { signal: controller.signal });
      assert.equal(res.status, 200);
      const reader = res.body.getReader();
      const { value } = await reader.read();
      const event = JSON.parse(new TextDecoder().decode(value).replace(/^data: /, ''));
      assert.match(event.token, /^[0-9A-F]{8}$/);
      assert.equal(event.sessionId, session.id);
      controller.abort();
    } finally {
      server.close();
    }
  });
});

describe('claim and verify use the logged-in student', () => {
  test('claim without a student login is rejected', async () => {
    const session = await makeSession();
    const res = await request(app).post('/api/attendance/claim')
      .send({ sessionId: session.id, rollNumber: '2023UGCS042', scannedToken: 'X' });
    assert.equal(res.status, 401);
  });

  test('a faculty token cannot claim attendance', async () => {
    const res = await request(app)
      .post('/api/attendance/claim')
      .set(asFaculty(await makeFaculty()))
      .send({ sessionId: crypto.randomUUID(), scannedToken: 'X' });
    assert.equal(res.status, 403);
  });

  test("verify won't accept another student's claim ticket", async () => {
    const [victim, attacker] = [await makeStudent(), await makeStudent()];
    const ticket = await insertClaim(victim, await makeSession());
    const res = await verify(attacker, ticket);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'CLAIM_EXPIRED');
  });

  test('an expired claim ticket is rejected even before cleanup deletes it', async () => {
    const student = await makeStudent({ embedding: embedding() });
    const ticket = await insertClaim(student, await makeSession(), { expired: true });
    const res = await verify(student, ticket);
    assert.equal(res.body.code, 'CLAIM_EXPIRED');
  });

  test('a student who must change their password cannot claim yet', async () => {
    const student = await makeStudent({ mustChangePassword: true });
    const session = await makeSession();
    const res = await request(app).post('/api/attendance/claim').set(asStudent(student))
      .send({ sessionId: session.id, scannedToken: 'X' });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'PASSWORD_CHANGE_REQUIRED');
  });
});

describe('enrollment and liveness are decided by the server', () => {
  test('a student with no enrolled face is refused, not enrolled', async () => {
    const student = await makeStudent();
    const ticket = await insertClaim(student, await makeSession());
    const ml = mock.method(axios, 'post', async () => ({ data: {} }));

    const res = await verify(student, ticket);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'NOT_ENROLLED');
    assert.equal(ml.mock.callCount(), 0);
    const { rows } = await query('SELECT face_embedding, is_enrolled FROM students WHERE id = $1', [student.id]);
    assert.equal(rows[0].face_embedding, null);
    assert.equal(rows[0].is_enrolled, false);
  });

  test('requireLiveness=false from the client is ignored', async () => {
    const student = await makeStudent({ embedding: embedding() });
    const ticket = await insertClaim(student, await makeSession());
    let sentForm;
    mock.method(axios, 'post', async (url, form) => {
      sentForm = form;
      return { data: { matched: true, similarity: 0.7, liveness: { is_live: true } } };
    });

    const res = await verify(student, ticket, { requireLiveness: 'false' });
    assert.equal(res.body.status, 'PRESENT');
    const parts = sentForm._streams.filter((s) => typeof s === 'string').join('');
    assert.match(parts, /name="require_liveness"\r\n\r\ntrue/);
  });

  test('a missing liveness result fails closed', async () => {
    const student = await makeStudent({ embedding: embedding() });
    const ticket = await insertClaim(student, await makeSession());
    mock.method(axios, 'post', async () => ({ data: { matched: true, similarity: 0.9 } }));

    const res = await verify(student, ticket);
    assert.equal(res.body.code, 'SPOOF_DETECTED');
    const { rows } = await query('SELECT count(*)::int AS n FROM attendance_records');
    assert.equal(rows[0].n, 0);
  });

  test('a spoof (no blink) is rejected and nothing is recorded', async () => {
    const student = await makeStudent({ embedding: embedding() });
    const ticket = await insertClaim(student, await makeSession());
    mock.method(axios, 'post', async () => ({ data: { matched: false, liveness: { is_live: false, reason: 'No natural blink detected' } } }));

    const res = await verify(student, ticket);
    assert.equal(res.body.code, 'SPOOF_DETECTED');
    const { rows } = await query('SELECT count(*)::int AS n FROM attendance_records');
    assert.equal(rows[0].n, 0);
  });
});

describe('faculty sign-up', () => {
  test('needs the invite code', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'A', email: 'a@x.com', password: 'longenough1', inviteCode: 'guess' });
    assert.equal(res.status, 403);
  });

  test('role in the body is ignored', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Mallory', email: 'm@x.com', password: 'longenough1', role: 'admin', inviteCode: 'test-invite-code' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.user.role, 'faculty');
    const { rows } = await query(`SELECT role FROM users WHERE email = 'm@x.com'`);
    assert.equal(rows[0].role, 'faculty');

    const login = await request(app).post('/api/auth/login').send({ email: 'M@x.com', password: 'longenough1' });
    assert.equal(login.status, 200);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.token}`);
    assert.equal(me.body.user.email, 'm@x.com');
    assert.ok(!JSON.stringify(me.body).includes('password'));
  });
});

describe('student accounts and data', () => {
  test('roll number lookup needs a faculty login', async () => {
    const student = await makeStudent();
    const res = await request(app).get(`/api/students/roll/${student.rollNumber}`);
    assert.equal(res.status, 401);
  });

  test('password hash and face embedding never leave the server', async () => {
    const faculty = await makeFaculty();
    const student = await makeStudent({ embedding: embedding() });

    const one = await request(app).get(`/api/students/roll/${student.rollNumber}`).set(asFaculty(faculty));
    const all = await request(app).get('/api/students').set(asFaculty(faculty));
    assert.equal(one.status, 200);
    assert.equal(all.body.students.length, 1);
    for (const body of [one.body, all.body]) {
      const text = JSON.stringify(body).replace(/mustChangePassword|embeddingVersion|embeddingUpdatedAt/g, '');
      assert.ok(!/password|embedding"|\$2[aby]\$/i.test(text), text);
    }
  });

  test('a student without a password cannot log in with their roll number', async () => {
    const student = await makeStudent({ password: null });
    const res = await request(app)
      .post('/api/student-portal/login')
      .send({ rollNumber: student.rollNumber, password: student.rollNumber.toLowerCase() });
    assert.equal(res.status, 401);
    const { rows } = await query('SELECT password_hash FROM students WHERE id = $1', [student.id]);
    assert.equal(rows[0].password_hash, null, 'no default password is set');
  });

  test('an old roll-number password still works once but forces a change', async () => {
    const student = await makeStudent();
    await query(`UPDATE students SET password_hash = $2 WHERE id = $1`,
      [student.id, (await import('bcryptjs')).default.hashSync(student.rollNumber.toLowerCase(), 4)]);
    const res = await request(app)
      .post('/api/student-portal/login')
      .send({ rollNumber: student.rollNumber, password: student.rollNumber.toLowerCase() });
    assert.equal(res.status, 200);
    assert.equal(res.body.mustChangePassword, true);
    const decoded = jwt.decode(res.body.token);
    assert.ok(decoded.exp - decoded.iat <= 3600, 'short-lived token until the password is changed');
  });

  test('new students get a temporary password they must change', async () => {
    const faculty = await makeFaculty();
    const created = await request(app)
      .post('/api/students')
      .set(asFaculty(faculty))
      .send({ rollNumber: '2023ugcs777', name: 'New' });
    assert.equal(created.status, 201);
    assert.equal(created.body.student.rollNumber, '2023UGCS777');
    assert.equal(created.body.temporaryPassword.length, 10);

    const login = await request(app)
      .post('/api/student-portal/login')
      .send({ rollNumber: '2023UGCS777', password: created.body.temporaryPassword });
    assert.equal(login.status, 200);
    assert.equal(login.body.mustChangePassword, true);
    const auth = { Authorization: `Bearer ${login.body.token}` };

    const blocked = await request(app).get('/api/student-portal/my-courses').set(auth);
    assert.equal(blocked.body.code, 'PASSWORD_CHANGE_REQUIRED');

    const rollAsPassword = await request(app).post('/api/student-portal/change-password').set(auth)
      .send({ currentPassword: created.body.temporaryPassword, newPassword: '2023ugcs777' });
    assert.equal(rollAsPassword.status, 400);

    const changed = await request(app).post('/api/student-portal/change-password').set(auth)
      .send({ currentPassword: created.body.temporaryPassword, newPassword: 'my-own-password' });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.mustChangePassword, false);

    const ok = await request(app).get('/api/student-portal/my-courses').set({ Authorization: `Bearer ${changed.body.token}` });
    assert.equal(ok.status, 200);
  });

  test('faculty can reset a forgotten password', async () => {
    const faculty = await makeFaculty();
    const student = await makeStudent();
    const res = await request(app).post(`/api/students/${student.id}/reset-password`).set(asFaculty(faculty));
    assert.equal(res.status, 200);
    assert.equal(res.body.rollNumber, student.rollNumber);

    const oldLogin = await request(app).post('/api/student-portal/login')
      .send({ rollNumber: student.rollNumber, password: 'student-pass-1' });
    assert.equal(oldLogin.status, 401);
    const newLogin = await request(app).post('/api/student-portal/login')
      .send({ rollNumber: student.rollNumber, password: res.body.temporaryPassword });
    assert.equal(newLogin.body.mustChangePassword, true);
  });
});

describe('secrets, tokens in URLs, CORS', () => {
  test('no JWT_SECRET means no server', () => {
    const env = { ...process.env };
    delete env.JWT_SECRET;
    const run = spawnSync(process.execPath, ['-e', "import('./config.js')"], {
      cwd: new URL('..', import.meta.url), env: { ...env, DOTENV_CONFIG_PATH: '/nonexistent' }, encoding: 'utf8'
    });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /JWT_SECRET/);
  });

  test('a token signed with the old fallback secret is rejected', async () => {
    const faculty = await makeFaculty();
    const forged = jwt.sign({ id: faculty.id }, 'campustrack_jwt_secret');
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${forged}`);
    assert.equal(res.status, 401);
  });

  test('token in the query string is not accepted', async () => {
    const faculty = await makeFaculty();
    const res = await request(app).get(`/api/auth/me?token=${facultyToken(faculty)}`);
    assert.equal(res.status, 401);
  });

  test('a student token cannot be used as a faculty token', async () => {
    const res = await request(app).get('/api/auth/me').set(asStudent(await makeStudent()));
    assert.equal(res.status, 401);
  });

  test('unknown origins get no CORS headers', async () => {
    const res = await request(app).get('/health').set('Origin', 'https://evil.example');
    assert.equal(res.headers['access-control-allow-origin'], undefined);
  });

  test('configured origins are allowed', async () => {
    const res = await request(app).get('/health').set('Origin', 'https://rollone.example');
    assert.equal(res.headers['access-control-allow-origin'], 'https://rollone.example');
  });
});

describe('live roster', () => {
  test('needs a faculty login', async () => {
    const session = await makeSession();
    const res = await request(app).get(`/api/attendance/live-roster/${session.id}`);
    assert.equal(res.status, 401);
  });

  test("another faculty can't read my roster", async () => {
    const session = await makeSession();
    const res = await request(app).get(`/api/attendance/live-roster/${session.id}`).set(asFaculty(await makeFaculty()));
    assert.equal(res.status, 404);
  });

  test('the owner sees the roster', async () => {
    const faculty = await makeFaculty();
    const session = await makeSession({ faculty });
    const res = await request(app).get(`/api/attendance/live-roster/${session.id}`).set(asFaculty(faculty));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { count: 0, enrolledCount: 0, roster: [] });
  });
});
