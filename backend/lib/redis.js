import Redis from 'ioredis';

/**
 * Optional Redis connection, shared by the whole process.
 *
 *  REDIS_URL unset or 'off' -> null: callers fall back to their in-process behaviour
 *  REDIS_URL=mock    -> in-memory ioredis-mock (tests, no server needed)
 *  REDIS_URL=redis://… or rediss://… -> a real server (TLS for rediss)
 *
 * Every key the app writes starts with KEY_PREFIX so one Redis can be shared.
 */
export const KEY_PREFIX = process.env.REDIS_PREFIX || 'rollone:';

let client = null;
let subscriber = null;
let initialised = false;

async function create(url) {
  if (url === 'mock') {
    const { default: RedisMock } = await import('ioredis-mock');
    return new RedisMock();
  }
  const c = new Redis(url, {
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false, // fail fast instead of queueing when Redis is down
    connectTimeout: 5000,
    lazyConnect: false
  });
  c.on('error', (err) => {
    if (!c._rolloneLoggedError) console.error('[REDIS]', err.message);
    c._rolloneLoggedError = true;
  });
  c.on('ready', () => {
    c._rolloneLoggedError = false;
  });
  // Wait (briefly) for the first connection: callers check redisReady() and would
  // otherwise skip Redis for the first requests after start-up. If Redis is down we
  // still start; ioredis keeps reconnecting and callers use their fallbacks meanwhile.
  await new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      c.off('ready', done);
      c.off('error', done);
      resolve();
    };
    const timer = setTimeout(done, 5000);
    c.once('ready', done);
    c.once('error', done);
  });
  return c;
}

// Resolves the shared client once; returns null when Redis isn't configured.
export async function initRedis() {
  if (initialised) return client;
  initialised = true;
  const url = process.env.REDIS_URL;
  if (!url || url === 'off') return null;
  client = await create(url);
  return client;
}

// Synchronous accessor for code paths that run after start-up.
export const getRedis = () => client;

// True when the client exists and is connected (ioredis-mock is always ready).
export const redisReady = () => !!client && (client.status === undefined || client.status === 'ready');

// Pub/Sub needs its own connection: a subscribed client can't run normal commands.
// It queues commands until connected (the shared client fails fast instead), so a
// psubscribe issued right after start-up isn't rejected before the socket is ready.
// ioredis re-subscribes on its own after a reconnect.
export async function getSubscriber() {
  if (!client) return null;
  if (!subscriber) {
    subscriber = typeof client.duplicate === 'function' && client.options
      ? client.duplicate({ enableOfflineQueue: true, maxRetriesPerRequest: null })
      : client.duplicate();
    subscriber.on?.('error', () => {}); // the shared client already logs connection errors
  }
  return subscriber;
}

// quit() is rejected on a connection that isn't up (offline queue off) and would leave
// the socket open, keeping the process alive; disconnect() those instead.
const close = (c) => {
  if (!c) return undefined;
  if (c.status === undefined || c.status === 'ready') return c.quit();
  return c.disconnect();
};

export async function closeRedis() {
  await Promise.allSettled([close(client), close(subscriber)]);
  client = null;
  subscriber = null;
  initialised = false;
}

export const rkey = (...parts) => KEY_PREFIX + parts.join(':');
