import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from './index.js';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const LOCK_ID = 7_465_321; // any constant; stops two servers migrating at once

// Applies every db/migrations/*.sql file that hasn't run yet, in name order, each in its own transaction.
// Uses the direct (unpooled) connection when there is one: the advisory lock is session-level,
// and a pooler in transaction mode (Neon's -pooler host) can't hold it reliably.
export async function migrate({ log = console.log } = {}) {
  const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set (see backend/.env.example)');
  }
  const client = createClient({ connectionString });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.name));
    const files = (await fs.readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        log(`[MIGRATE] Applied ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    await client.end();
  }
}

// `npm run migrate`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await import('dotenv/config');
  const { closePool } = await import('./index.js');
  try {
    await migrate();
    console.log('[MIGRATE] Database is up to date');
  } catch (err) {
    console.error(`[MIGRATE] ${err.message}`);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}
