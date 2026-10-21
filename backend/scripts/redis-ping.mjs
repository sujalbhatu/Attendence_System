// Checks REDIS_URL from .env: connect, PING, SET/GET with TTL, and round-trip latency.
// Never prints the URL or credentials.
import 'dotenv/config';
import Redis from 'ioredis';

const url = process.env.REDIS_URL;
if (!url || url === 'mock') {
  console.log('REDIS_URL not set (or mock)');
  process.exit(1);
}
const redis = new Redis(url, { maxRetriesPerRequest: 1, connectTimeout: 8000, lazyConnect: true, retryStrategy: () => null });
redis.on('error', () => {});
try {
  const t0 = Date.now();
  await redis.connect();
  console.log(`connected in ${Date.now() - t0} ms (tls=${url.startsWith('rediss://')})`);
  console.log('PING ->', await redis.ping());
  await redis.set('rollone:ping-check', '1', 'PX', 5000);
  console.log('SET/GET ->', await redis.get('rollone:ping-check'), 'ttl ms', await redis.pttl('rollone:ping-check'));
  const rtts = [];
  for (let i = 0; i < 20; i++) {
    const s = process.hrtime.bigint();
    await redis.ping();
    rtts.push(Number(process.hrtime.bigint() - s) / 1e6);
  }
  rtts.sort((a, b) => a - b);
  console.log(`PING round trip: p50 ${rtts[9].toFixed(1)} ms, p95 ${rtts[18].toFixed(1)} ms`);
  const info = await redis.info('server');
  console.log('server version', /redis_version:(\S+)/.exec(info)?.[1]);
} catch (err) {
  console.log('FAILED:', err.code || '', err.message.replace(url, '<REDIS_URL>'));
  process.exitCode = 1;
} finally {
  redis.disconnect();
}
