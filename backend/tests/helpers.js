import jwt from 'jsonwebtoken';
import crypto from 'crypto';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';
// Tests wipe the database they run against, so they only use TEST_DATABASE_URL
if (!process.env.TEST_DATABASE_URL) {
  throw new Error('Set TEST_DATABASE_URL to an empty Postgres database (it is wiped by the tests)');
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
// config.js reads these once at import, so tests fix them here
process.env.FACULTY_INVITE_CODE ??= 'test-invite-code';
process.env.CORS_ORIGINS ??= 'https://rollone.example';
process.env.ALLOW_SELF_ENROLLMENT ??= 'false';

const { query, closePool } = await import('../db/index.js');
const { migrate } = await import('../db/migrate.js');
const { createUser } = await import('../repositories/users.js');
const { createStudent, enrollFaceEmbedding } = await import('../repositories/students.js');
const { createClassroom } = await import('../repositories/classrooms.js');
const { createSession } = await import('../repositories/sessions.js');
const { createCourse, createEnrollment } = await import('../repositories/courses.js');

export { query, closePool };

export async function resetDatabase() {
  await query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: () => {} });
}

export async function truncateAll() {
  await query(`TRUNCATE users, classrooms, courses, students, enrollments, faculty_assignments,
               sessions, claims, attendance_records RESTART IDENTITY CASCADE`);
}

const unique = () => crypto.randomBytes(4).toString('hex');

export const makeFaculty = (overrides = {}) =>
  createUser({ name: 'Prof', email: `prof-${unique()}@campus.edu`, password: 'password-123', ...overrides });

export const makeStudent = async ({ password = 'student-pass-1', embedding, ...overrides } = {}) => {
  const student = await createStudent({ rollNumber: `2023UGCS${unique()}`, name: 'Student', password, ...overrides });
  if (embedding) await enrollFaceEmbedding(student.id, embedding);
  return student;
};

export const makeClassroom = () =>
  createClassroom({ roomCode: `L-${unique()}`, building: 'Main', floor: 3, capacity: 80, latitude: 22.77618, longitude: 86.14325, radiusMeters: 40 });

export async function makeSession({ faculty, classroom, course, branch = 'CSE', requirePin = false } = {}) {
  faculty ||= await makeFaculty();
  classroom ||= await makeClassroom();
  return createSession({
    courseCode: course?.courseCode || 'CS401',
    courseName: course?.courseName || 'Operating Systems',
    courseId: course?.id,
    branch,
    facultyId: faculty.id,
    classroomId: classroom.id,
    requirePin
  });
}

export const makeCourse = () =>
  createCourse({ courseCode: `CS${unique()}`, courseName: 'OS', department: 'CSE', semester: 4, academicYear: '2026-27' });

export const enroll = (student, course, branch = 'CSE') =>
  createEnrollment({ studentId: student.id, courseId: course.id, branch, academicYear: '2026-27' });

export const facultyToken = (user) => jwt.sign({ id: user.id }, process.env.JWT_SECRET);
export const studentToken = (student) =>
  jwt.sign({ studentId: student.id, rollNumber: student.rollNumber, role: 'student' }, process.env.JWT_SECRET);

// A unit vector, so cosine similarity against itself is 1
export const embedding = (seed = 1) => {
  const v = Array.from({ length: 512 }, (_, i) => Math.sin(i * seed + seed));
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map((x) => x / norm);
};
