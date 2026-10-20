/**
 * Live lecture events (step 3). With Redis (mock here), a check-in published by one
 * "instance" reaches a projector stream subscribed through another connection.
 */
import { test, describe, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import request from 'supertest';
import axios from 'axios';
import jwt from 'jsonwebtoken';

process.env.REDIS_URL ||= 'mock';
const {
  resetDatabase, truncateAll, closePool, makeFaculty, makeStudent, makeSession, studentToken, embedding
} = await import('./helpers.js');
const { createApp } = await import('../app.js');
const { publishSessionEvent, subscribeSession, usingRedisBridge, liveStats } = await import('../services/liveEvents.js');
const { getSessionSecret } = await import('../repositories/sessions.js');
const { TokenService } = await import('../services/tokenService.js');

const app = createApp();
const gps = { latitude: 22.77618, longitude: 86.14325, accuracyMeters: 5 };

before(resetDatabase);
beforeEach(truncateAll);
after(closePool);

// Generous timeout: the verify request itself makes several database round trips
const nextEvent = (sessionId, type, timeoutMs = 20000) =>
  new Promise(async (resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${type} event`)), timeoutMs);
    const off = await subscribeSession(sessionId, (e) => {
      if (e.type !== type) return;
      clearTimeout(timer);
      off();
      resolve(e);
    });
  });

describe('live events', () => {
  test('publish reaches subscribers through the Redis bridge', async () => {
    const got = nextEvent('s-1', 'ping');
    await publishSessionEvent('s-1', { type: 'ping', n: 1 });
    const e = await got;
    assert.equal(e.n, 1);
    assert.equal(e.sessionId, 's-1');
    assert.equal(usingRedisBridge(), true);
    assert.ok(liveStats.delivered >= 1);
  });

  test('a verified check-in is published with its record', async () => {
    const student = await makeStudent({ embedding: embedding() });
    const session = await makeSession();
    const { totp_secret } = await getSessionSecret(session.id);
    const { token } = TokenService.generateToken(totp_secret, session.id, 4);

    const claimed = await request(app)
      .post('/api/attendance/claim')
      .set('Authorization', `Bearer ${studentToken(student)}`)
      .send({ sessionId: session.id, scannedToken: token, clientGps: gps });
    assert.equal(claimed.status, 200, JSON.stringify(claimed.body));

    const live = nextEvent(session.id, 'checkin');
    const restore = mock.method(axios, 'post', async () => ({
      data: { matched: true, similarity: 0.9, liveness: { is_live: true, score: 0.9 }, embedding: embedding(2) }
    }));
    try {
      const verified = await request(app)
        .post('/api/attendance/verify')
        .set('Authorization', `Bearer ${studentToken(student)}`)
        .field('claimTicket', claimed.body.claimTicket)
        .attach('images', Buffer.from('x'), { filename: 'f.jpg', contentType: 'image/jpeg' });
      assert.equal(verified.status, 200, JSON.stringify(verified.body));
    } finally {
      restore.mock.restore();
    }
    const e = await live;
    assert.equal(e.record.rollNumber, student.rollNumber);
    assert.equal(e.record.status, 'PRESENT');
  });

  test('the projector SSE stream carries the check-in and ends on conclude', async () => {
    const faculty = await makeFaculty();
    const session = await makeSession({ faculty });
    const pt = jwt.sign({ scope: 'projector', sid: session.id }, process.env.JWT_SECRET, { expiresIn: '5m' });

    const server = app.listen(0);
    const { port } = server.address();
    const body = await new Promise((resolve, reject) => {
      let data = '';
      const req = http.get(`http://127.0.0.1:${port}/api/sessions/${session.id}/qr-feed?pt=${pt}`, (res) => {
        assert.equal(res.headers['content-type'], 'text/event-stream');
        res.setEncoding('utf8');
        res.on('data', async (chunk) => {
          data += chunk;
          // once the first token has been pushed, simulate a check-in then conclude
          if (data.includes('"token"') && !data.includes('event: checkin')) {
            await publishSessionEvent(session.id, { type: 'checkin', record: { _id: 'r1', rollNumber: 'X1' } });
            await publishSessionEvent(session.id, { type: 'concluded' });
          }
        });
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      setTimeout(() => { req.destroy(); reject(new Error('stream did not end: ' + data)); }, 8000);
    });
    server.close();
    assert.match(body, /event: checkin\ndata: .*"rollNumber":"X1"/);
    assert.match(body, /event: concluded/);
  });
});
