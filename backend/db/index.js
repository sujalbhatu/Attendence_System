import pg from 'pg';
import { Pool as NeonPool, Client as NeonClient } from '@neondatabase/serverless';

// PG_OVER_WEBSOCKET=true swaps in Neon's pg-compatible WebSocket driver (port 443), for
// networks that block outbound Postgres on 5432. Servers that can reach 5432 keep plain pg.
// Read at call time, so it works however late .env is loaded.
const overWebSocket = () => process.env.PG_OVER_WEBSOCKET === 'true';
export const createClient = (options) => new (overWebSocket() ? NeonClient : pg.Client)(options);

let pool = null;

export function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set (see backend/.env.example)');
    }
    const Pool = overWebSocket() ? NeonPool : pg.Pool;
    pool = new Pool({
      connectionString,
      max: Number(process.env.PG_POOL_MAX) || 10
    });
  }
  return pool;
}

export const query = (text, params) => getPool().query(text, params);

// Runs fn(client) inside BEGIN/COMMIT, rolling back if it throws
export async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// Postgres error codes we handle explicitly
export const UNIQUE_VIOLATION = '23505';
export const INVALID_TEXT_REPRESENTATION = '22P02'; // e.g. a malformed UUID

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value) => typeof value === 'string' && UUID_RE.test(value);
