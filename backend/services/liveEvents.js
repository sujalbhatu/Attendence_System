import { EventEmitter } from 'events';
import { getRedis, getSubscriber, redisReady, rkey } from '../lib/redis.js';

/**
 * Live lecture events (check-ins, PIN mode changes, conclude) for the projector.
 *
 * Listeners always attach to a local EventEmitter. With Redis, publishing goes through
 * a Redis channel and one pattern subscription per process re-emits locally, so a
 * check-in handled by instance B reaches a projector connected to instance A. Without
 * Redis, events are emitted locally only (correct for a single process).
 */
const local = new EventEmitter();
local.setMaxListeners(0);

const CHANNEL_PREFIX = rkey('live', '');
let bridged = false;
export const liveStats = { published: 0, delivered: 0 };

async function ensureBridge() {
  if (bridged) return;
  const sub = await getSubscriber();
  if (!sub) return;
  bridged = true;
  await sub.psubscribe(`${CHANNEL_PREFIX}*`);
  sub.on('pmessage', (_pattern, channel, message) => {
    const sessionId = channel.slice(CHANNEL_PREFIX.length);
    try {
      liveStats.delivered++;
      local.emit(sessionId, JSON.parse(message));
    } catch {
      // ignore malformed messages
    }
  });
}

export async function publishSessionEvent(sessionId, event) {
  const payload = { ...event, sessionId: String(sessionId), at: Date.now() };
  liveStats.published++;
  const redis = getRedis();
  if (redis && redisReady()) {
    try {
      await ensureBridge();
      await redis.publish(CHANNEL_PREFIX + String(sessionId), JSON.stringify(payload));
      return;
    } catch {
      // fall through to local delivery
    }
  }
  local.emit(String(sessionId), payload);
}

// Returns an unsubscribe function.
export async function subscribeSession(sessionId, handler) {
  await ensureBridge().catch(() => {});
  const key = String(sessionId);
  local.on(key, handler);
  return () => local.off(key, handler);
}

export const usingRedisBridge = () => bridged;
