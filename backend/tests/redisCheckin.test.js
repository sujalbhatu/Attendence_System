/**
 * Redis-backed check-in state (step 2): the shared upload-slot counter and the
 * active-session cache. Runs on ioredis-mock unless REDIS_URL points at a server.
 */
import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

// Must be set before helpers.js initialises Redis, hence the dynamic imports below
process.env.REDIS_URL ||= 'mock';
const { resetDatabase, truncateAll, closePool, makeFaculty, makeSession, facultyToken } = await import('./helpers.js');
const { createApp } = await import('../app.js');
const { getRedis, rkey } = await import('../lib/redis.js');
const { StaggerService, delayForArrival } = await import('../services/staggerService.js');
const { getActiveSession, cacheStats } = await import('../services/sessionCache.js');

const app = createApp();

before(resetDatabase);
beforeEach(truncateAll);
after(closePool);

describe('upload-slot stagger', () => {
  test('the arrival counter is shared and expires', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000001';
    await StaggerService.resetSession(sessionId);
    const delays = [];
    for (let i = 0; i < 30; i++) delays.push(await StaggerService.assignUploadDelay(sessionId));
    // first 25 arrivals land in the 0-600 ms slice, the 26th onward in the next 1.5 s slice
    assert.ok(delays.slice(0, 25).every((d) => d < 600), JSON.stringify(delays.slice(0, 25)));
    assert.ok(delays.slice(25).every((d) => d >= 1500 && d < 2100), JSON.stringify(delays.slice(25)));
    assert.equal(Number(await getRedis().get(rkey('stagger', sessionId))), 30);
    assert.ok((await getRedis().pttl(rkey('stagger', sessionId))) > 0, 'counter has a TTL');

    await StaggerService.resetSession(sessionId);
    assert.equal(await getRedis().get(rkey('stagger', sessionId)), null);
  });

  test('delayForArrival caps at 6 s', () => {
    assert.equal(delayForArrival(1, 0), 0);
    assert.equal(delayForArrival(26, 0), 1500);
    assert.equal(delayForArrival(1000, 0), 6000);
  });
});

describe('active-session cache', () => {
  test('second read is a cache hit and returns the same session and secret', async () => {
    const session = await makeSession();
    const before = { ...cacheStats };
    const a = await getActiveSession(session.id);
    const b = await getActiveSession(session.id);
    assert.equal(a.session.id, session.id);
    assert.equal(b.totpSecret, a.totpSecret);
    assert.equal(cacheStats.misses - before.misses, 1);
    assert.equal(cacheStats.hits - before.hits, 1);
  });

  test('toggling the PIN invalidates the cache, so the next scan sees the new mode', async () => {
    const faculty = await makeFaculty();
    const session = await makeSession({ faculty, requirePin: false });
    assert.equal((await getActiveSession(session.id)).session.requirePin, false);

    const res = await request(app)
      .put(`/api/sessions/${session.id}/toggle-pin`)
      .set('Authorization', `Bearer ${facultyToken(faculty)}`);
    assert.equal(res.status, 200);
    assert.equal((await getActiveSession(session.id)).session.requirePin, true);
  });

  test('concluding invalidates the cache, so scans stop immediately', async () => {
    const faculty = await makeFaculty();
    const session = await makeSession({ faculty });
    assert.ok(await getActiveSession(session.id));

    const res = await request(app)
      .put(`/api/sessions/${session.id}/conclude`)
      .set('Authorization', `Bearer ${facultyToken(faculty)}`);
    assert.equal(res.status, 200);
    assert.equal(await getActiveSession(session.id), null);
  });
});
