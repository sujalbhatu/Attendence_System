/**
 * First-scan self-enrollment (ALLOW_SELF_ENROLLMENT=true). A separate file because
 * config.js reads the flag once, and node --test runs each file in its own process.
 */
process.env.ALLOW_SELF_ENROLLMENT = 'true';

const { test, before, beforeEach, after, mock } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const request = (await import('supertest')).default;
const axios = (await import('axios')).default;
const { resetDatabase, truncateAll, closePool, query, makeStudent, makeSession, studentToken, embedding } = await import('./helpers.js');
const { createApp } = await import('../app.js');

const app = createApp();

before(resetDatabase);
beforeEach(truncateAll);
after(closePool);

test('a first scan enrolls the face and is recorded as FLAGGED for faculty review', async () => {
  const student = await makeStudent();
  const session = await makeSession();
  await query(
    `INSERT INTO claims (claim_ticket, session_id, student_id, roll_number) VALUES ('tkt_first', $1, $2, $3)`,
    [session.id, student.id, student.rollNumber]
  );
  mock.method(axios, 'post', async () => ({ data: { matched: false, liveness: { is_live: true, score: 0.9 }, embedding: embedding(3) } }));

  const res = await request(app)
    .post('/api/attendance/verify')
    .set('Authorization', `Bearer ${studentToken(student)}`)
    .field('claimTicket', 'tkt_first')
    .attach('images', Buffer.from('fake'), { filename: 'f.jpg', contentType: 'image/jpeg' });

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.status, 'FLAGGED');
  const { rows: [record] } = await query('SELECT status, flag_reason FROM attendance_records');
  assert.deepEqual(record, { status: 'FLAGGED', flag_reason: 'FIRST_SELF_ENROLLMENT' });
  const { rows: [s] } = await query('SELECT is_enrolled, enrollment_source, array_length(face_embedding, 1) AS dims FROM students');
  assert.deepEqual(s, { is_enrolled: true, enrollment_source: 'SELF_SCAN', dims: 512 });
  const { rows: [se] } = await query('SELECT present_count, flagged_count FROM sessions');
  assert.deepEqual(se, { present_count: 0, flagged_count: 1 });
});
