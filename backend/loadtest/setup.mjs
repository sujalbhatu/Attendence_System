/**
 * Builds a 120-student lecture for the k6 load test, on a THROWAWAY database.
 *
 *   DATABASE_URL=<neon load-test branch> ML_URL=http://127.0.0.1:5006 \
 *     node loadtest/setup.mjs <face.jpg> [students=120]
 *
 * Creates a faculty, a classroom, a course, N enrolled students whose face template is
 * the embedding of <face.jpg> (computed by the real ML service), and one ACTIVE lecture
 * with liveness off (a benchmark can't blink). Writes loadtest/.fixture.json (gitignored)
 * with what k6 needs: session id + token secret and one login token per student.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import FormData from 'form-data';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [imagePath, nArg] = process.argv.slice(2);
const N = Number(nArg) || 120;
if (!imagePath) throw new Error('usage: node loadtest/setup.mjs <face.jpg> [students]');
if (!process.env.LOADTEST_DATABASE_URL) throw new Error('Set LOADTEST_DATABASE_URL to a throwaway database branch');
if (/production/i.test(process.env.LOADTEST_DATABASE_URL)) throw new Error('Refusing: looks like production');
process.env.DATABASE_URL = process.env.LOADTEST_DATABASE_URL;
process.env.DATABASE_URL_UNPOOLED = process.env.LOADTEST_DATABASE_URL_UNPOOLED || process.env.LOADTEST_DATABASE_URL;

const { query, closePool } = await import('../db/index.js');
const { migrate } = await import('../db/migrate.js');
const { createUser } = await import('../repositories/users.js');
const { createStudent, enrollFaceEmbedding } = await import('../repositories/students.js');
const { createClassroom } = await import('../repositories/classrooms.js');
const { createSession, getSessionSecret } = await import('../repositories/sessions.js');
const { createCourse, createEnrollment } = await import('../repositories/courses.js');

const ML = process.env.ML_URL || process.env.ML_SERVICE_URL || 'http://127.0.0.1:5006';

await migrate({ log: () => {} });
await query(`TRUNCATE users, classrooms, courses, students, enrollments, faculty_assignments,
             sessions, claims, attendance_records RESTART IDENTITY CASCADE`);

// Face template = embedding of the benchmark image, from the real model
const form = new FormData();
form.append('images', fs.readFileSync(imagePath), { filename: 'face.jpg', contentType: 'image/jpeg' });
const { data: emb } = await axios.post(`${ML}/embed`, form, { headers: form.getHeaders() });

const faculty = await createUser({ name: 'Load Test Faculty', email: 'loadtest@rollone.test', password: 'unused-' + Date.now(), role: 'faculty' });
const classroom = await createClassroom({ roomCode: 'LT-1', building: 'Load Test', floor: 1, capacity: N, latitude: 22.77618, longitude: 86.14325, radiusMeters: 50 });
const course = await createCourse({ courseCode: 'LT101', courseName: 'Load Test', department: 'CSE', semester: 1, academicYear: '2026-27' });

const students = [];
for (let i = 1; i <= N; i++) {
  const s = await createStudent({ rollNumber: `LT${String(i).padStart(3, '0')}`, name: `Student ${i}`, password: 'loadtest-pass-1' });
  await enrollFaceEmbedding(s.id, emb.embedding, 'FACULTY');
  await createEnrollment({ studentId: s.id, courseId: course.id, branch: 'CSE', academicYear: '2026-27' });
  students.push(s);
}

const session = await createSession({ courseCode: 'LT101', courseName: 'Load Test', courseId: course.id, branch: 'CSE', facultyId: faculty.id, classroomId: classroom.id, requirePin: false });
await query('UPDATE sessions SET require_liveness = false WHERE id = $1', [session.id]);
const { totp_secret } = await getSessionSecret(session.id);

// Same claims the student login issues (controllers/studentPortalController.js)
const studentToken = (s) => jwt.sign({ studentId: s.id, rollNumber: s.rollNumber, role: 'student' }, process.env.JWT_SECRET, { expiresIn: '2h' });
const fixture = {
  sessionId: session.id,
  totpSecret: totp_secret,
  intervalSeconds: 4,
  gps: { latitude: 22.77618, longitude: 86.14325, accuracyMeters: 5 },
  students: students.map((s) => ({ roll: s.rollNumber, token: studentToken(s) }))
};
fs.writeFileSync(path.join(here, '.fixture.json'), JSON.stringify(fixture));
console.log(`fixture: ${N} students, session ${session.id}`);
await closePool();
