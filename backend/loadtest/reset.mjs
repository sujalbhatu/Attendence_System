// Clears the load-test lecture between k6 runs (same students, same session).
import 'dotenv/config';
import fs from 'fs';
import jwt from 'jsonwebtoken';
if (!process.env.LOADTEST_DATABASE_URL) throw new Error('Set LOADTEST_DATABASE_URL');
if (/production/i.test(process.env.LOADTEST_DATABASE_URL)) throw new Error('Refusing: looks like production');
process.env.DATABASE_URL = process.env.LOADTEST_DATABASE_URL;
const { query, closePool } = await import('../db/index.js');
await query('DELETE FROM attendance_records');
await query('DELETE FROM claims');
await query(`UPDATE sessions SET present_count = 0, flagged_count = 0, status = 'ACTIVE', concluded_at = NULL`);

// Redis keeps the upload-slot counter (3 h TTL) and the cached session; without clearing
// them every student of the next run would count as arrival 121+ and get the 6 s slot.
const { initRedis, closeRedis } = await import('../lib/redis.js');
const { StaggerService } = await import('../services/staggerService.js');
const { invalidateActiveSession } = await import('../services/sessionCache.js');
await initRedis();
const { rows: sessions } = await query('SELECT id FROM sessions');
for (const { id } of sessions) {
  await StaggerService.resetSession(id);
  await invalidateActiveSession(id);
}
await closeRedis();

// Re-sign the student tokens so a fixture built hours ago still works
const fixturePath = new URL('./.fixture.json', import.meta.url);
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
for (const s of fixture.students) {
  const { studentId, rollNumber, role } = jwt.decode(s.token);
  s.token = jwt.sign({ studentId, rollNumber, role }, process.env.JWT_SECRET, { expiresIn: '2h' });
}
fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2));
console.log('load-test lecture reset, tokens refreshed');
await closePool();
