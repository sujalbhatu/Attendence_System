import { getRedis, redisReady, rkey } from '../lib/redis.js';

// Per-session arrival counter for flattening the 10:00 AM thundering herd.
// With Redis the counter is shared, so every API instance hands out slots from the
// same sequence; without it each process keeps its own Map (the old behaviour).
const sessionCounters = new Map();
const COUNTER_TTL_MS = 3 * 60 * 60 * 1000; // a lecture never runs longer than this

const LUA_INCR_TTL = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return n
`;

const nextLocal = (key) => {
  const n = (sessionCounters.get(key) || 0) + 1;
  sessionCounters.set(key, n);
  return n;
};

// Every 25 students share a 1.5 s slice, plus up to 600 ms of jitter, capped at 6 s.
export const delayForArrival = (arrival, jitterMs = Math.floor(Math.random() * 600)) =>
  Math.min(6000, Math.floor((arrival - 1) / 25) * 1500 + jitterMs);

export class StaggerService {
  /**
   * Assigns a staggered upload window (0 to 6000 ms) to spread face uploads
   * evenly across the ML pipeline.
   */
  static async assignUploadDelay(sessionId) {
    const key = String(sessionId);
    const redis = getRedis();
    let arrival;
    if (redis && redisReady()) {
      try {
        arrival = Number(await redis.eval(LUA_INCR_TTL, 1, rkey('stagger', key), COUNTER_TTL_MS));
      } catch {
        arrival = undefined; // fall back below
      }
    }
    if (!arrival) arrival = nextLocal(key);
    return delayForArrival(arrival);
  }

  static async resetSession(sessionId) {
    const key = String(sessionId);
    sessionCounters.delete(key);
    const redis = getRedis();
    if (redis && redisReady()) await redis.del(rkey('stagger', key)).catch(() => {});
  }
}
