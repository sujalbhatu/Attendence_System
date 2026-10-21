import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Uses the in-memory ioredis-mock, so no Redis server is needed.
process.env.REDIS_URL = 'mock';
const { initRedis, closeRedis, getRedis, rkey } = await import('../lib/redis.js');
const { rateLimit } = await import('../middleware/rateLimit.js');

const fakeRes = () => {
  const res = { statusCode: 200, headers: {}, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  return res;
};

// The Redis path is async: resolve when the limiter either calls next() or responds.
const hit = (limiter, req) =>
  new Promise((resolve) => {
    const res = fakeRes();
    const origJson = res.json;
    res.json = (b) => { origJson(b); resolve({ passed: false, res }); return res; };
    limiter(req, res, () => resolve({ passed: true, res }));
  });

before(async () => { await initRedis(); });
after(async () => { await closeRedis(); });

test('the Redis limiter allows max requests per key, then returns 429 with Retry-After', async () => {
  const limiter = rateLimit({ name: 't1', windowMs: 60000, max: 3, keyFn: (req) => req.key });
  const results = [];
  for (let i = 0; i < 5; i++) results.push(await hit(limiter, { key: 'student:1' }));
  assert.deepEqual(results.map((r) => r.passed), [true, true, true, false, false]);
  assert.equal(results[4].res.statusCode, 429);
  assert.equal(results[4].res.body.code, 'RATE_LIMITED');
  assert.ok(Number(results[4].res.headers['Retry-After']) >= 1);

  const other = await hit(limiter, { key: 'student:2' });
  assert.equal(other.passed, true, 'another student on the same IP is unaffected');
});

test('two limiter instances with the same name share one counter (as two Node processes would)', async () => {
  const a = rateLimit({ name: 'shared', windowMs: 60000, max: 4, keyFn: (req) => req.key });
  const b = rateLimit({ name: 'shared', windowMs: 60000, max: 4, keyFn: (req) => req.key });
  const order = [a, b, a, b, a, b];
  const passed = [];
  for (const lim of order) passed.push((await hit(lim, { key: 'ip:1' })).passed);
  assert.deepEqual(passed, [true, true, true, true, false, false]);
});

test('parallel requests never exceed the limit', async () => {
  const limiter = rateLimit({ name: 'burst', windowMs: 60000, max: 10, keyFn: () => 'same' });
  const results = await Promise.all(Array.from({ length: 50 }, () => hit(limiter, {})));
  assert.equal(results.filter((r) => r.passed).length, 10);
});

test('the window key gets an expiry', async () => {
  const limiter = rateLimit({ name: 'ttl', windowMs: 30000, max: 5, keyFn: () => 'k' });
  await hit(limiter, {});
  const ttl = await getRedis().pttl(rkey('rl', 'ttl', 'k'));
  assert.ok(ttl > 0 && ttl <= 30000, `ttl was ${ttl}`);
});
