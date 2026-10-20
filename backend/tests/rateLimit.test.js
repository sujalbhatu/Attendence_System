import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit } from '../middleware/rateLimit.js';

const fakeRes = () => {
  const res = { statusCode: 200, headers: {}, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  return res;
};

test('allows up to max requests per key, then returns 429', () => {
  const limiter = rateLimit({ windowMs: 60000, max: 3, keyFn: (req) => req.key });
  let passed = 0;
  for (let i = 0; i < 5; i++) {
    const res = fakeRes();
    limiter({ key: 'student:1' }, res, () => { passed++; });
    if (i >= 3) assert.equal(res.statusCode, 429);
  }
  assert.equal(passed, 3);

  // A different student on the same campus IP is unaffected.
  let otherPassed = false;
  limiter({ key: 'student:2' }, fakeRes(), () => { otherPassed = true; });
  assert.equal(otherPassed, true);
});
