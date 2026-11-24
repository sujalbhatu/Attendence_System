/**
 * A student registers their own face from their phone after the first login; it waits
 * for faculty approval before any check-in can use it.
 * Run: TEST_DATABASE_URL=postgres://... npm test   (the database is wiped)
 */
import { test, describe, before, beforeEach, after, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import axios from 'axios';
import {
  resetDatabase, truncateAll, closePool, query,
  makeFaculty, makeStudent, makeSession, facultyToken, studentToken, embedding
} from './helpers.js';
import { createApp } from '../app.js';
import { TokenService } from '../services/tokenService.js';
import { getSessionSecret } from '../repositories/sessions.js';

const app = createApp();
const jpg = (n) => [Buffer.from(`fake-jpeg-${n}`), { filename: `f${n}.jpg`, contentType: 'image/jpeg' }];
const THUMB = 'data:image/jpeg;base64,' + Buffer.from('thumb').toString('base64');
const gps = { latitude: 22.77618, longitude: 86.14325, accuracyMeters: 5 };

before(resetDatabase);
beforeEach(truncateAll);
afterEach(() => mock.restoreAll());
after(closePool);

const mlEmbeds = (vec = embedding(5)) => mock.method(axios, 'post', async () => ({ data: { embedding: vec } }));
const asStudent = (s) => ({ Authorization: `Bearer ${studentToken(s)}` });
const asFaculty = (u) => ({ Authorization: `Bearer ${facultyToken(u)}` });

const register = (student, { photos = 3, thumb = THUMB } = {}) => {
  let req = request(app).post('/api/student-portal/register-face').set(asStudent(student)).field('thumb', thumb);
  for (let i = 0; i < photos; i++) req = req.attach('images', ...jpg(i));
  return req;
};

const me = async (student) => (await request(app).get('/api/student-portal/me').set(asStudent(student))).body.student;

describe('student registers their own face', () => {
  test('a new student starts with no face, registers, and is then PENDING', async () => {
    mlEmbeds();
    const student = await makeStudent();
    assert.equal((await me(student)).faceStatus, 'NONE');

    const res = await register(student);
    assert.equal(res.status, 201);
    assert.equal(res.body.student.faceStatus, 'PENDING');
    assert.equal((await me(student)).faceStatus, 'PENDING');

    // nothing is usable for check-in yet
    const { rows } = await query('SELECT face_embedding, is_enrolled FROM students WHERE id = $1', [student.id]);
    assert.equal(rows[0].face_embedding, null);
    assert.equal(rows[0].is_enrolled, false);
  });

  test('a student can only register once while it is pending', async () => {
    mlEmbeds();
    const student = await makeStudent();
    await register(student);
    const again = await register(student);
    assert.equal(again.status, 409);
    assert.equal(again.body.code, 'FACE_PENDING');
  });

  test('a student whose face is already on file cannot replace it', async () => {
    mlEmbeds();
    const student = await makeStudent({ embedding: embedding(1) });
    const res = await register(student);
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'FACE_ALREADY_ENROLLED');
  });

  test('needs 3 photos and a preview image', async () => {
    mlEmbeds();
    const student = await makeStudent();
    assert.equal((await register(student, { photos: 2 })).status, 400);
    assert.equal((await register(student, { thumb: 'not-an-image' })).status, 400);
    assert.equal((await me(student)).faceStatus, 'NONE');
  });

  test('needs a student login', async () => {
    const res = await request(app).post('/api/student-portal/register-face').field('thumb', THUMB);
    assert.equal(res.status, 401);
  });
});

describe('faculty approves or rejects in person', () => {
  test('faculty sees the preview, approves, and the face becomes the check-in template', async () => {
    mlEmbeds(embedding(7));
    const student = await makeStudent();
    const faculty = await makeFaculty();
    await register(student);

    const preview = await request(app).get(`/api/students/${student.id}/pending-face`).set(asFaculty(faculty));
    assert.equal(preview.status, 200);
    assert.equal(preview.body.thumb, THUMB);

    const ok = await request(app).post(`/api/students/${student.id}/approve-face`).set(asFaculty(faculty));
    assert.equal(ok.status, 200);
    assert.equal(ok.body.student.faceStatus, 'ENROLLED');
    assert.equal(ok.body.student.enrollmentSource, 'SELF_PHONE');

    const { rows } = await query('SELECT face_embedding, face_pending, face_pending_thumb FROM students WHERE id = $1', [student.id]);
    assert.equal(rows[0].face_embedding.length, 512);
    assert.equal(rows[0].face_pending, null);
    assert.equal(rows[0].face_pending_thumb, null); // preview deleted after the decision
  });

  test('reject clears it and the student may register again', async () => {
    mlEmbeds();
    const student = await makeStudent();
    const faculty = await makeFaculty();
    await register(student);
    const no = await request(app).post(`/api/students/${student.id}/reject-face`).set(asFaculty(faculty));
    assert.equal(no.status, 200);
    assert.equal(no.body.student.faceStatus, 'NONE');
    assert.equal((await register(student)).status, 201);
  });

  test('approve or preview without a pending face is a 404', async () => {
    const student = await makeStudent();
    const faculty = await makeFaculty();
    assert.equal((await request(app).post(`/api/students/${student.id}/approve-face`).set(asFaculty(faculty))).status, 404);
    assert.equal((await request(app).get(`/api/students/${student.id}/pending-face`).set(asFaculty(faculty))).status, 404);
  });

  test('a student cannot approve their own face', async () => {
    mlEmbeds();
    const student = await makeStudent();
    await register(student);
    const res = await request(app).post(`/api/students/${student.id}/approve-face`).set(asStudent(student));
    assert.equal(res.status, 401);
    assert.equal((await me(student)).faceStatus, 'PENDING');
  });
});

describe('check-in while the face is pending', () => {
  test('verify tells the student to ask faculty for approval', async () => {
    mlEmbeds();
    const student = await makeStudent();
    await register(student);
    mock.restoreAll();

    const session = await makeSession();
    const { totp_secret } = await getSessionSecret(session.id);
    const claimed = await request(app).post('/api/attendance/claim').set(asStudent(student))
      .send({ sessionId: session.id, scannedToken: TokenService.generateToken(totp_secret, session.id, 4).token, clientGps: gps });
    assert.equal(claimed.status, 200);

    const res = await request(app).post('/api/attendance/verify').set(asStudent(student))
      .field('claimTicket', claimed.body.claimTicket).attach('images', ...jpg(1));
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'FACE_PENDING');
    assert.match(res.body.error, /approve/i);
  });
});
