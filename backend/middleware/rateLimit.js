/**
 * Minimal fixed-window rate limiter (in-memory, per process).
 *
 * `keyFn` decides who is being limited. Students on campus Wi-Fi share one
 * public IP, so student routes are keyed by account, not by IP.
 * For several Node processes, move the counters to Redis (INCR + EXPIRE).
 */
export const rateLimit = ({ windowMs, max, keyFn, message = 'Too many requests. Please wait a moment and try again.' }) => {
  const hits = new Map();

  // Drop expired windows periodically so the map cannot grow without bound.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, windowMs);
  sweep.unref?.();

  return (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ code: 'RATE_LIMITED', error: message });
    }
    next();
  };
};

export const byIp = (req) => req.ip;
export const byIpAndField = (field) => (req) => `${req.ip}:${String(req.body?.[field] || '').trim().toLowerCase()}`;
export const byStudent = (req) => `student:${req.student?._id || req.ip}`;
