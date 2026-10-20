import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import { resetDatabase, truncateAll, closePool, query, embedding } from './helpers.js';
import { withTransaction } from '../db/index.js';
import { copyAll } from '../scripts/migrate-from-mongo.js';

before(resetDatabase);
beforeEach(truncateAll);
after(closePool);

// Stand-in for a mongodb Db with the same documents Mongoose wrote
const fakeMongo = (collections) => ({
  collection: (name) => ({ find: () => ({ toArray: async () => collections[name] || [] }) })
});

test('copies every collection and rewires references', async () => {
  const facultyId = new ObjectId(), roomId = new ObjectId(), courseId = new ObjectId();
  const goodStudent = new ObjectId(), defaultPwStudent = new ObjectId(), sessionId = new ObjectId();
  const hash = await bcrypt.hash('secret-pass', 4);

  const mongo = fakeMongo({
    users: [{ _id: facultyId, name: 'Prof', email: 'Prof@Campus.edu', password: hash, role: 'faculty' }],
    classrooms: [{ _id: roomId, roomCode: 'l-302', building: 'Main', latitude: 22.7, longitude: 86.1, radiusMeters: 40 }],
    courses: [{ _id: courseId, courseCode: 'cs401', courseName: 'OS', department: 'CSE', semester: 4, academicYear: '2026-27' }],
    students: [
      { _id: goodStudent, rollNumber: '2023UGCS001', name: 'A', password: hash, faceEmbedding: embedding(), isEnrolled: true, enrollmentSource: 'SELF_SCAN' },
      { _id: defaultPwStudent, rollNumber: '2023UGCS002', name: 'B', password: await bcrypt.hash('2023ugcs002', 4), faceEmbedding: [] }
    ],
    enrollments: [
      { _id: new ObjectId(), studentId: goodStudent, courseId, branch: 'CSE', academicYear: '2026-27', status: 'active' },
      { _id: new ObjectId(), studentId: new ObjectId(), courseId, branch: 'CSE', academicYear: '2026-27' } // orphan
    ],
    facultyassignments: [{ _id: new ObjectId(), facultyId, courseId, branch: 'CSE', academicYear: '2026-27' }],
    sessions: [{
      _id: sessionId, courseCode: 'CS401', courseName: 'OS', courseId, branch: 'CSE', facultyId, classroomId: roomId,
      status: 'CONCLUDED', totpSecret: 'abc', requirePin: true, stats: { presentCount: 0, flaggedCount: 1 }
    }],
    attendancerecords: [
      { _id: new ObjectId(), sessionId, studentId: goodStudent, rollNumber: '2023UGCS001', studentName: 'A',
        courseCode: 'CS401', roomCode: 'L-302', status: 'FLAGGED', flagReason: 'FIRST_SELF_ENROLLMENT',
        verificationMetrics: { cosineSimilarity: 0.81, threshold: 0.65, livenessScore: 0.9, livenessPassed: true } },
      { _id: new ObjectId(), sessionId, studentId: defaultPwStudent, rollNumber: '2023UGCS002', studentName: 'B',
        courseCode: 'CS401', roomCode: 'N/A', status: 'ABSENT', verificationMetrics: { cosineSimilarity: 0 } }
    ]
  });

  const result = await withTransaction((client) => copyAll(mongo, client, { log: () => {} }));
  assert.equal(result.clearedDefaultPasswords, 1);
  assert.equal(result.skipped.length, 1);

  const { rows: [u] } = await query('SELECT email FROM users');
  assert.equal(u.email, 'prof@campus.edu');

  const { rows: students } = await query('SELECT roll_number, password_hash, is_enrolled, enrollment_source, array_length(face_embedding, 1) AS dims FROM students ORDER BY roll_number');
  assert.equal(students[0].dims, 512);
  assert.equal(students[0].is_enrolled, true);
  assert.equal(students[0].enrollment_source, 'SELF_SCAN');
  assert.ok(await bcrypt.compare('secret-pass', students[0].password_hash), 'existing bcrypt hashes still work');
  assert.equal(students[1].password_hash, null, 'roll-number password cleared');
  assert.equal(students[1].is_enrolled, false);

  const { rows: records } = await query(
    `SELECT a.status, a.flag_reason, s.roll_number, se.course_code, cl.room_code
     FROM attendance_records a
     JOIN students s ON s.id = a.student_id
     JOIN sessions se ON se.id = a.session_id
     JOIN classrooms cl ON cl.id = se.classroom_id
     ORDER BY s.roll_number`
  );
  assert.deepEqual(records.map((r) => [r.roll_number, r.status, r.flag_reason, r.room_code]), [
    ['2023UGCS001', 'FLAGGED', 'FIRST_SELF_ENROLLMENT', 'L-302'],
    ['2023UGCS002', 'ABSENT', null, 'L-302']
  ]);

  const { rows: [counts] } = await query(
    `SELECT (SELECT count(*) FROM enrollments)::int AS enrollments,
            (SELECT count(*) FROM faculty_assignments)::int AS assignments,
            (SELECT flagged_count FROM sessions) AS flagged,
            (SELECT require_pin FROM sessions) AS pin,
            (SELECT require_liveness FROM sessions) AS liveness`
  );
  assert.deepEqual(counts, { enrollments: 1, assignments: 1, flagged: 1, pin: true, liveness: true });
});

test('a failure part-way leaves Postgres empty', async () => {
  const mongo = fakeMongo({
    users: [{ _id: new ObjectId(), name: 'Prof', email: 'p@x.com', password: 'h' }],
    classrooms: [{ _id: new ObjectId(), roomCode: 'L1', building: 'B', latitude: null, longitude: 1 }] // violates NOT NULL
  });
  await assert.rejects(withTransaction((client) => copyAll(mongo, client, { log: () => {} })));
  const { rows } = await query('SELECT count(*)::int AS n FROM users');
  assert.equal(rows[0].n, 0);
});
