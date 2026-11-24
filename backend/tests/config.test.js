/**
 * The claim sweep must stay rare enough that an idle Neon database can suspend
 * (Neon scales to zero after 5 idle minutes). No database needed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const cleanupMinutes = (value) => {
  const env = { ...process.env, JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long', CLAIM_CLEANUP_MINUTES: value ?? '' };
  const out = spawnSync(process.execPath, ['--input-type=module', '-e',
    "const c = await import('./config.js'); console.log(c.CLAIM_CLEANUP_MINUTES)"], { env, encoding: 'utf8', cwd: new URL('..', import.meta.url) });
  return Number(out.stdout.trim());
};

test('expired claims are swept hourly by default', () => {
  assert.equal(cleanupMinutes(undefined), 60);
});

test('the sweep can be tuned but never runs more often than every 10 minutes', () => {
  assert.equal(cleanupMinutes('120'), 120);
  assert.equal(cleanupMinutes('5'), 10);
});
