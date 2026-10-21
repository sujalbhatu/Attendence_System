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
let bridgedSub = null; // the subscriber connection our pattern subscription lives on
let bridging = null;
const withHandler = new WeakSet();
export const liveStats = { published: 0, delivered: 0 };

const onMessage = (_pattern, channel, message) => {
  const sessionId = channel.slice(CHANNEL_PREFIX.length);
  try {
    liveStats.delivered++;
    local.emit(sessionId, JSON.parse(message));
  } catch {
    // ignore malformed messages
  }
};

// One pattern subscription per process. It only counts once the subscribe has succeeded,
// and it is tied to the subscriber connection it was made on, so a failed attempt or a
// new connection (after closeRedis/initRedis) subscribes again instead of being assumed.
async function ensureBridge() {
  const sub = await getSubscriber();
  if (!sub || bridgedSub === sub) return;
  if (!bridging) {
    bridging = (async () => {
      if (!withHandler.has(sub)) {
        sub.on('pmessage', onMessage);
        withHandler.add(sub);
      }
      await sub.psubscribe(`${CHANNEL_PREFIX}*`);
      bridgedSub = sub;
    })().catch((err) => {
      console.error('[LIVE] Redis subscribe failed, using local events:', err.message);
    }).finally(() => {
      bridging = null;
    });
  }
  await bridging;
}

const isBridged = async () => {
  const sub = await getSubscriber();
  return !!sub && bridgedSub === sub;
};

export async function publishSessionEvent(sessionId, event) {
  const payload = { ...event, sessionId: String(sessionId), at: Date.now() };
  liveStats.published++;
  const redis = getRedis();
  if (redis && redisReady()) {
    await ensureBridge();
  }
  // Publish through Redis only when this process is listening on it too; otherwise a
  // message could go out on a channel no one here subscribed to and be lost.
  if (redis && redisReady() && (await isBridged())) {
    try {
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
  await ensureBridge();
  const key = String(sessionId);
  local.on(key, handler);
  return () => local.off(key, handler);
}

export const usingRedisBridge = () => !!bridgedSub;
