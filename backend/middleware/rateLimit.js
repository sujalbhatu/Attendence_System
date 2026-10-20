import { getRedis, redisReady, rkey } from '../lib/redis.js';

/**
 * Fixed-window rate limiter.
 *
 * With Redis (REDIS_URL set) the counter lives in Redis, so the limit holds across
 * every Node process behind the load balancer. One Lua script does INCR and sets the
 * window's expiry on the first hit, atomically: parallel requests can't both see
 * "first hit" or skip the expiry.
 *
 * Without Redis, or if Redis is unreachable, it falls back to the per-process Map
 * (the limit then applies per process, which is still better than none).
 *
 * `keyFn` decides who is being limited. Students on campus Wi-Fi share one
 * public IP, so student routes are keyed by account, not by IP.
 */
const LUA_INCR_WINDOW = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { count, ttl }
`;

export const rateLimit = ({
  name = 'default',
  windowMs,
  max,
  keyFn,
  message = 'Too many requests. Please wait a moment and try again.'
}) => {
  const hits = new Map();

  // Drop expired windows periodically so the map cannot grow without bound.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, windowMs);
  sweep.unref?.();

  const reject = (res, retryAfterMs) => {
    res.setHeader('Retry-After', Math.max(1, Math.ceil(retryAfterMs / 1000)));
    return res.status(429).json({ code: 'RATE_LIMITED', error: message });
  };

  const inMemory = (key, res, next) => {
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) return reject(res, entry.resetAt - now);
    next();
  };

  return (req, res, next) => {
    const key = keyFn(req);
    const redis = getRedis();
    if (!redis || !redisReady()) return inMemory(key, res, next);

    redis
      .eval(LUA_INCR_WINDOW, 1, rkey('rl', name, key), windowMs)
      .then(([count, ttl]) => {
        if (count > max) return reject(res, ttl);
        next();
      })
      .catch(() => inMemory(key, res, next)); // Redis hiccup: degrade, don't block logins
  };
};

export const byIp = (req) => req.ip;
export const byIpAndField = (field) => (req) => `${req.ip}:${String(req.body?.[field] || '').trim().toLowerCase()}`;
export const byStudent = (req) => `student:${req.student?.id || req.ip}`;
