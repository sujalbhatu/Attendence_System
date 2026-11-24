/**
 * Editing a classroom's geofence (PUT /api/classrooms/:id).
 * Run: TEST_DATABASE_URL=postgres://... npm test   (the database is wiped)
 */
import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { resetDatabase, truncateAll, closePool, makeFaculty, makeClassroom, facultyToken } from './helpers.js';
import { createApp } from '../app.js';
import { validateClassroomChanges } from '../controllers/classroomController.js';

const app = createApp();

before(resetDatabase);
beforeEach(truncateAll);
after(closePool);

const edit = async (body, { classroom, auth = true } = {}) => {
  classroom ||= await makeClassroom();
  let req = request(app).put(`/api/classrooms/${classroom.id}`);
  if (auth) req = req.set({ Authorization: `Bearer ${facultyToken(await makeFaculty())}` });
  return { res: await req.send(body), classroom };
};

describe('PUT /api/classrooms/:id', () => {
  test('changes the radius and re-centres the room', async () => {
    const { res } = await edit({ radiusMeters: 60, latitude: 22.7801, longitude: 86.1449 });
    assert.equal(res.status, 200);
    assert.equal(res.body.classroom.radiusMeters, 60);
    assert.equal(res.body.classroom.latitude, 22.7801);
    assert.equal(res.body.classroom.longitude, 86.1449);
  });

  test('accepts numbers sent as strings', async () => {
    const { res } = await edit({ radiusMeters: '75' });
    assert.equal(res.status, 200);
    assert.equal(res.body.classroom.radiusMeters, 75);
  });

  test('leaves fields that were not sent unchanged', async () => {
    const { res, classroom } = await edit({ radiusMeters: 25 });
    assert.equal(res.status, 200);
    assert.equal(res.body.classroom.latitude, classroom.latitude);
    assert.equal(res.body.classroom.longitude, classroom.longitude);
  });

  for (const [name, body] of [
    ['a radius below 10 m', { radiusMeters: 9 }],
    ['a radius above 2000 m', { radiusMeters: 2001 }],
    ['a radius that is not a number', { radiusMeters: 'wide' }],
    ['an empty radius', { radiusMeters: '' }],
    ['a null radius', { radiusMeters: null }],
    ['a latitude out of range', { latitude: 91 }],
    ['a longitude out of range', { longitude: -181 }],
  ]) {
    test(`rejects ${name} with 400 and changes nothing`, async () => {
      const { res, classroom } = await edit(body);
      assert.equal(res.status, 400);
      assert.match(res.body.error, /radiusMeters|latitude|longitude/);
      const after = await request(app).get('/api/classrooms')
        .set({ Authorization: `Bearer ${facultyToken(await makeFaculty())}` });
      const room = after.body.classrooms.find((c) => c.id === classroom.id);
      assert.equal(room.radiusMeters, classroom.radiusMeters);
      assert.equal(room.latitude, classroom.latitude);
    });
  }

  test('needs a faculty login', async () => {
    const { res } = await edit({ radiusMeters: 50 }, { auth: false });
    assert.equal(res.status, 401);
  });
});

describe('POST /api/classrooms', () => {
  const create = async (body) => request(app).post('/api/classrooms')
    .set({ Authorization: `Bearer ${facultyToken(await makeFaculty())}` })
    .send({ roomCode: 'L-901', building: 'Main', latitude: 22.776, longitude: 86.143, ...body });

  test('saves a custom radius', async () => {
    const res = await create({ radiusMeters: 250 });
    assert.equal(res.status, 201);
    assert.equal(res.body.classroom.radiusMeters, 250);
  });

  test('defaults to 35 m when no radius is sent', async () => {
    const res = await create({});
    assert.equal(res.status, 201);
    assert.equal(res.body.classroom.radiusMeters, 35);
  });

  for (const [name, body] of [
    ['a radius below 10 m', { radiusMeters: 5 }],
    ['a radius above 2000 m', { radiusMeters: 5000 }],
    ['a latitude out of range', { latitude: 120 }],
  ]) {
    test(`rejects ${name} with 400`, async () => {
      const res = await create(body);
      assert.equal(res.status, 400);
    });
  }
});

describe('validateClassroomChanges', () => {
  test('accepts the range limits themselves', () => {
    assert.deepEqual(validateClassroomChanges({ radiusMeters: 10, latitude: -90, longitude: 180 }).changes,
      { radiusMeters: 10, latitude: -90, longitude: 180 });
    assert.equal(validateClassroomChanges({ radiusMeters: 2000 }).error, undefined);
  });

  test('passes other fields through untouched', () => {
    assert.deepEqual(validateClassroomChanges({ building: 'LHC' }).changes, { building: 'LHC' });
  });
});
