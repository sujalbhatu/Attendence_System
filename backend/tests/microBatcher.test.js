import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MicroBatcher } from '../services/microBatcher.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('a lone item is not held back', async () => {
  const b = new MicroBatcher(async (items) => items.map((x) => x * 2), { minWaitMs: 2, maxWaitMs: 40 });
  const t0 = Date.now();
  assert.equal(await b.submit(21), 42);
  assert.ok(Date.now() - t0 < 30, 'answered well inside the max wait');
  assert.equal(b.summary().maxBatchSize, 1);
});

test('a burst is grouped into batches no larger than maxBatch, results in order', async () => {
  const sizes = [];
  const b = new MicroBatcher(async (items) => {
    sizes.push(items.length);
    await sleep(15); // a "model call"
    return items.map((x) => `r${x}`);
  }, { maxBatch: 8, maxWaitMs: 30, maxInFlight: 2 });

  // 40 arrivals ~1 ms apart, like a class scanning at once
  const pending = [];
  for (let i = 0; i < 40; i++) {
    pending.push(b.submit(i));
    await sleep(1);
  }
  const results = await Promise.all(pending);
  assert.deepEqual(results, Array.from({ length: 40 }, (_, i) => `r${i}`));
  assert.ok(Math.max(...sizes) <= 8);
  assert.ok(sizes.length < 40, `expected batching, got ${sizes.length} calls`);
  const s = b.summary();
  assert.equal(s.items, 40);
  assert.ok(s.avgBatchSize > 1.5, `avg batch ${s.avgBatchSize}`);
});

test('no item waits much longer than maxWaitMs before its batch is sent', async () => {
  const b = new MicroBatcher(async (items) => items, { maxBatch: 100, maxWaitMs: 25, maxInFlight: 4 });
  const pending = [];
  for (let i = 0; i < 30; i++) {
    pending.push(b.submit(i));
    await sleep(2);
  }
  await Promise.all(pending);
  assert.ok(b.summary().queueWaitMs.max <= 25 + 15, JSON.stringify(b.summary().queueWaitMs));
});

test('at most maxInFlight batches run at once', async () => {
  let running = 0;
  let peak = 0;
  const b = new MicroBatcher(async (items) => {
    running++;
    peak = Math.max(peak, running);
    await sleep(20);
    running--;
    return items;
  }, { maxBatch: 2, maxWaitMs: 5, maxInFlight: 2 });
  await Promise.all(Array.from({ length: 20 }, (_, i) => b.submit(i)));
  assert.ok(peak <= 2, `peak ${peak}`);
});

test('an Error result rejects only its own item; a thrown flush rejects the batch', async () => {
  const b = new MicroBatcher(async (items) => items.map((x) => (x === 2 ? new Error('bad') : x)), { maxBatch: 4, maxWaitMs: 10 });
  const r = await Promise.allSettled([1, 2, 3].map((x) => b.submit(x)));
  assert.deepEqual(r.map((x) => x.status), ['fulfilled', 'rejected', 'fulfilled']);

  const failing = new MicroBatcher(async () => { throw new Error('ML down'); }, { maxWaitMs: 5 });
  await assert.rejects(failing.submit(1), /ML down/);
});
