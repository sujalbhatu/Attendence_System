import { findSessionById, getSessionSecret } from '../repositories/sessions.js';
import { getRedis, redisReady, rkey } from '../lib/redis.js';

/**
 * Cache-aside for the live lecture a scan refers to.
 *
 * Every scan, PIN and face check needs the session (room, geofence, PIN mode) and its
 * token secret: two Postgres queries. During a 120-student check-in that's the same
 * row read hundreds of times in 15 seconds, so with Redis the pair is cached for a
 * short TTL. Only ACTIVE sessions are cached, and every write that changes what a scan
 * depends on (toggle PIN, conclude) deletes the key, on every instance at once because
 * the cache is shared. Without Redis this is a straight pass-through.
 */
const TTL_MS = 30 * 1000;
export const cacheStats = { hits: 0, misses: 0 };

const key = (id) => rkey('session', id);

async function loadFromDb(sessionId) {
  const secret = await getSessionSecret(sessionId);
  if (!secret || secret.status !== 'ACTIVE') return null;
  const session = await findSessionById(sessionId);
  return session && { session, totpSecret: secret.totp_secret };
}

export async function getActiveSession(sessionId) {
  const redis = getRedis();
  if (!redis || !redisReady()) return loadFromDb(sessionId);

  try {
    const cached = await redis.get(key(sessionId));
    if (cached) {
      cacheStats.hits++;
      return JSON.parse(cached);
    }
  } catch {
    return loadFromDb(sessionId); // Redis hiccup: read through
  }

  cacheStats.misses++;
  const loaded = await loadFromDb(sessionId);
  if (loaded) await redis.set(key(sessionId), JSON.stringify(loaded), 'PX', TTL_MS).catch(() => {});
  return loaded;
}

export async function invalidateActiveSession(sessionId) {
  const redis = getRedis();
  if (redis && redisReady()) await redis.del(key(sessionId)).catch(() => {});
}
