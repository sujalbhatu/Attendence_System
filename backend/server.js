import { SEED_DEMO } from './config.js'; // loads .env and fails fast on missing secrets
import { createApp } from './app.js';
import { getPool } from './db/index.js';
import { migrate } from './db/migrate.js';
import { initRedis } from './lib/redis.js';
import { seedDemoData } from './db/seed.js';
import { deleteExpiredClaims } from './repositories/attendance.js';

const PORT = process.env.PORT || 3001;
const CLAIM_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

async function start() {
  await getPool().query('SELECT 1');
  console.log('[INFO] Connected to PostgreSQL');

  // Applies any new db/migrations/*.sql files (safe to run on every start)
  await migrate();

  // Optional: shared state for rate limits, claims and live updates across instances
  if (await initRedis()) console.log('[INFO] Redis enabled');
  if (SEED_DEMO) await seedDemoData();

  // Postgres has no TTL index, so expired claims are swept periodically
  // (reads already ignore expired claims; this just keeps the table small)
  setInterval(() => {
    deleteExpiredClaims().catch((err) => console.error('[CLAIM CLEANUP]', err.message));
  }, CLAIM_CLEANUP_INTERVAL_MS).unref();

  createApp().listen(PORT, '0.0.0.0', () => {
    console.log(`[READY] CampusTrack Gateway listening on http://0.0.0.0:${PORT}`);
  });
}

start().catch((err) => {
  console.error('[FATAL] Startup failed:', err.message);
  process.exit(1);
});
