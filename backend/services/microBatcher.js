/**
 * Dynamic micro-batcher.
 *
 * Collects work items and flushes them as one batch when either
 *   - the batch reaches `size` items, or
 *   - the oldest waiting item has waited `wait` ms,
 * whichever comes first. `size` and `wait` adapt to load:
 *   - quiet (items arrive far apart): size 1, wait ~minWaitMs, so a lone student
 *     is never held back;
 *   - busy (a class scanning at once): the batch grows toward maxBatch and the wait
 *     toward maxWaitMs, so one call carries many items.
 * Latency is bounded: no item waits longer than maxWaitMs before its batch is sent,
 * and at most `maxInFlight` batches run at once (the rest queue in arrival order).
 */
export class MicroBatcher {
  constructor(flushFn, {
    maxBatch = 16,
    minWaitMs = 2,
    maxWaitMs = 40,
    maxInFlight = 2,
    rateWindowMs = 250
  } = {}) {
    this.flushFn = flushFn;
    this.opts = { maxBatch, minWaitMs, maxWaitMs, maxInFlight, rateWindowMs };
    this.queue = [];
    this.timer = null;
    this.inFlight = 0;
    this.arrivals = []; // timestamps within the last rateWindowMs
    this.ratePerMs = 0;
    this.stats = { items: 0, batches: 0, sizes: new Map(), waits: [], flushMs: [] };
  }

  // Current targets, derived from the arrival rate: expect `rate * wait` items per window.
  targets() {
    const { maxBatch, minWaitMs, maxWaitMs } = this.opts;
    const expectedInMaxWait = this.ratePerMs * maxWaitMs;
    const size = Math.max(1, Math.min(maxBatch, Math.round(expectedInMaxWait)));
    // Only wait long when enough items are expected to make it worthwhile
    const wait = size <= 1 ? minWaitMs : Math.min(maxWaitMs, Math.max(minWaitMs, size / Math.max(this.ratePerMs, 1e-6)));
    return { size, wait };
  }

  // Arrival rate over a short sliding window: reacts within a fraction of a second when
  // a class starts scanning, and decays to zero just as fast when it stops.
  noteArrival(now) {
    const cutoff = now - this.opts.rateWindowMs;
    this.arrivals.push(now);
    while (this.arrivals.length && this.arrivals[0] < cutoff) this.arrivals.shift();
    this.ratePerMs = this.arrivals.length / this.opts.rateWindowMs;
  }

  submit(item) {
    const now = Date.now();
    this.noteArrival(now);
    return new Promise((resolve, reject) => {
      this.queue.push({ item, resolve, reject, enqueuedAt: now });
      this.schedule();
    });
  }

  schedule() {
    if (this.inFlight >= this.opts.maxInFlight || this.queue.length === 0) return;
    const { size, wait } = this.targets();
    if (this.queue.length >= size) {
      this.flush(size);
      return;
    }
    if (!this.timer) {
      const age = Date.now() - this.queue[0].enqueuedAt;
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flush(this.opts.maxBatch);
      }, Math.max(0, wait - age));
    }
  }

  async flush(limit) {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.queue.length === 0 || this.inFlight >= this.opts.maxInFlight) return;
    const batch = this.queue.splice(0, Math.min(limit, this.opts.maxBatch));
    this.inFlight++;
    const startedAt = Date.now();
    this.record(batch, startedAt);
    queueMicrotask(() => this.schedule()); // use the second slot if more items are waiting
    try {
      const results = await this.flushFn(batch.map((b) => b.item));
      batch.forEach((b, i) => {
        const r = results[i];
        if (r instanceof Error) b.reject(r);
        else b.resolve(r);
      });
    } catch (err) {
      batch.forEach((b) => b.reject(err));
    } finally {
      this.stats.flushMs.push(Date.now() - startedAt);
      if (this.stats.flushMs.length > 5000) this.stats.flushMs.splice(0, 2500);
      this.inFlight--;
      this.schedule();
    }
  }

  record(batch, startedAt) {
    this.stats.items += batch.length;
    this.stats.batches++;
    this.stats.sizes.set(batch.length, (this.stats.sizes.get(batch.length) || 0) + 1);
    for (const b of batch) this.stats.waits.push(startedAt - b.enqueuedAt);
    if (this.stats.waits.length > 5000) this.stats.waits.splice(0, 2500);
  }

  summary() {
    const pct = (arr, p) => {
      if (!arr.length) return null;
      const s = [...arr].sort((a, b) => a - b);
      return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
    };
    const { items, batches, sizes, waits, flushMs } = this.stats;
    return {
      items,
      batches,
      avgBatchSize: batches ? +(items / batches).toFixed(2) : 0,
      maxBatchSize: sizes.size ? Math.max(...sizes.keys()) : 0,
      sizeHistogram: Object.fromEntries([...sizes.entries()].sort((a, b) => a[0] - b[0])),
      queueWaitMs: { p50: pct(waits, 50), p95: pct(waits, 95), max: waits.length ? Math.max(...waits) : null },
      flushMs: { p50: pct(flushMs, 50), p95: pct(flushMs, 95) },
      current: { ...this.targets(), queued: this.queue.length, inFlight: this.inFlight }
    };
  }
}
