/**
 * One-time copy of the RollOne data from MongoDB (Atlas) into PostgreSQL.
 *
 *   MONGODB_URI=... DATABASE_URL=... npm run migrate:from-mongo
 *
 * - Creates the Postgres schema first (same migrations the server runs).
 * - Refuses to run if Postgres already has users, so it can't double-import.
 * - Everything is copied in one transaction: either all of it lands or none of it.
 * - Mongo ObjectIds become new UUIDs; references are rewritten through an id map.
 * - Student passwords that were the old default (their own roll number) are cleared,
 *   so those students must get a new password from their faculty.
 * - Claims are not copied: they expire after 60 seconds anyway.
 */
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const COLLECTIONS = ['users', 'classrooms', 'courses', 'students', 'enrollments',
  'facultyassignments', 'sessions', 'attendancerecords'];

export async function copyAll(mongoDb, client, { log = console.log } = {}) {
  const ids = new Map(); // "collection:ObjectId" -> uuid
  const newId = (collection, oid) => {
    const id = crypto.randomUUID();
    ids.set(`${collection}:${oid}`, id);
    return id;
  };
  const ref = (collection, oid) => (oid ? ids.get(`${collection}:${oid}`) ?? null : null);
  const docs = {};
  for (const name of COLLECTIONS) {
    docs[name] = await mongoDb.collection(name).find({}).toArray();
  }
  const counts = {};
  const skipped = [];

  for (const u of docs.users) {
    await client.query(
      `INSERT INTO users (id, name, email, password_hash, role, department, created_at)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'Computer Science & Engineering'), COALESCE($7, now()))`,
      [newId('users', u._id), u.name, String(u.email).toLowerCase().trim(), u.password,
        u.role === 'admin' ? 'admin' : 'faculty', u.department, u.createdAt]
    );
  }
  counts.users = docs.users.length;

  for (const c of docs.classrooms) {
    await client.query(
      `INSERT INTO classrooms (id, room_code, building, floor, capacity, latitude, longitude, radius_meters, is_active, created_at)
       VALUES ($1, $2, $3, COALESCE($4, 1), COALESCE($5, 70), $6, $7, COALESCE($8::float8, 35), COALESCE($9, true), COALESCE($10, now()))`,
      [newId('classrooms', c._id), String(c.roomCode).toUpperCase(), c.building, c.floor, c.capacity,
        c.latitude, c.longitude, c.radiusMeters, c.isActive, c.createdAt]
    );
  }
  counts.classrooms = docs.classrooms.length;

  for (const c of docs.courses) {
    await client.query(
      `INSERT INTO courses (id, course_code, course_name, credits, department, semester, academic_year, created_at)
       VALUES ($1, $2, $3, COALESCE($4, 4), $5, $6, $7, COALESCE($8, now()))`,
      [newId('courses', c._id), String(c.courseCode).toUpperCase(), c.courseName, c.credits, c.department,
        c.semester, c.academicYear, c.createdAt]
    );
  }
  counts.courses = docs.courses.length;

  let clearedDefaultPasswords = 0;
  for (const s of docs.students) {
    let passwordHash = s.password || null;
    // The old login set a student's password to their lower-case roll number on first login
    if (passwordHash && (await bcrypt.compare(String(s.rollNumber).toLowerCase(), passwordHash))) {
      passwordHash = null;
      clearedDefaultPasswords++;
    }
    const embedding = Array.isArray(s.faceEmbedding) && s.faceEmbedding.length > 0 ? s.faceEmbedding : null;
    await client.query(
      `INSERT INTO students (id, roll_number, name, password_hash, must_change_password, email, department, batch, section,
                             face_embedding, photo_url, is_enrolled, enrolled_at, enrollment_source, embedding_version,
                             embedding_updated_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'Computer Science & Engineering'), COALESCE($8, '2023-2027'),
               COALESCE($9, 'A'), $10, $11, $12, $13, $14, COALESCE($15, 1), $16, COALESCE($17, now()))`,
      [newId('students', s._id), String(s.rollNumber).toUpperCase(), s.name, passwordHash, !!s.mustChangePassword,
        s.email || null, s.department, s.batch, s.section, embedding, s.photoUrl || null,
        !!embedding && s.isEnrolled !== false, s.enrolledAt || null,
        ['FACULTY', 'SELF_SCAN'].includes(s.enrollmentSource) ? s.enrollmentSource : null, s.embeddingVersion, s.embeddingUpdatedAt || null, s.createdAt]
    );
  }
  counts.students = docs.students.length;

  for (const e of docs.enrollments) {
    const studentId = ref('students', e.studentId);
    const courseId = ref('courses', e.courseId);
    if (!studentId || !courseId) { skipped.push(`enrollment ${e._id}: missing student or course`); continue; }
    await client.query(
      `INSERT INTO enrollments (id, student_id, course_id, branch, academic_year, status, enrolled_at)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'active'), COALESCE($7, now()))
       ON CONFLICT (student_id, course_id) DO NOTHING`,
      [newId('enrollments', e._id), studentId, courseId, e.branch, e.academicYear, e.status, e.enrolledAt]
    );
  }
  counts.enrollments = docs.enrollments.length;

  for (const a of docs.facultyassignments) {
    const facultyId = ref('users', a.facultyId);
    const courseId = ref('courses', a.courseId);
    if (!facultyId || !courseId) { skipped.push(`faculty assignment ${a._id}: missing faculty or course`); continue; }
    await client.query(
      `INSERT INTO faculty_assignments (id, faculty_id, course_id, branch, academic_year, assigned_at)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, now()))
       ON CONFLICT DO NOTHING`,
      [newId('facultyassignments', a._id), facultyId, courseId, a.branch, a.academicYear, a.assignedAt]
    );
  }
  counts.facultyAssignments = docs.facultyassignments.length;

  for (const s of docs.sessions) {
    const facultyId = ref('users', s.facultyId);
    const classroomId = ref('classrooms', s.classroomId);
    if (!facultyId || !classroomId) { skipped.push(`session ${s._id}: missing faculty or classroom`); continue; }
    await client.query(
      `INSERT INTO sessions (id, course_code, course_name, course_id, branch, faculty_id, classroom_id, session_date, status,
                             totp_secret, token_interval_seconds, require_pin, require_liveness, present_count, flagged_count,
                             concluded_at, created_at)
       VALUES ($1, $2, $3, $4, COALESCE($5, ''), $6, $7, COALESCE($8, now()), COALESCE($9, 'CONCLUDED'),
               $10, COALESCE($11, 4), COALESCE($12, false), COALESCE($13, true), COALESCE($14, 0), COALESCE($15, 0), $16,
               COALESCE($17, now()))`,
      [newId('sessions', s._id), String(s.courseCode).toUpperCase(), s.courseName, ref('courses', s.courseId), s.branch,
        facultyId, classroomId, s.sessionDate, s.status,
        s.totpSecret || crypto.randomBytes(32).toString('hex'), s.tokenIntervalSeconds, s.requirePin, s.requireLiveness,
        s.stats?.presentCount, s.stats?.flaggedCount, s.concludedAt || null, s.createdAt]
    );
  }
  counts.sessions = docs.sessions.length;

  for (const r of docs.attendancerecords) {
    const sessionId = ref('sessions', r.sessionId);
    if (!sessionId) { skipped.push(`attendance ${r._id}: missing session`); continue; }
    const m = r.verificationMetrics || {};
    await client.query(
      `INSERT INTO attendance_records (id, session_id, student_id, roll_number, student_name, course_code, room_code, status,
                                       flag_reason, cosine_similarity, threshold, liveness_score, liveness_passed, distance_meters,
                                       marked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 'PRESENT'), $9, COALESCE($10::float8, 0), COALESCE($11::float8, 0.65),
               $12::float8, COALESCE($13, true), COALESCE($14::float8, 0), COALESCE($15, now()))
       ON CONFLICT (session_id, student_id) DO NOTHING`,
      [newId('attendancerecords', r._id), sessionId, ref('students', r.studentId), r.rollNumber, r.studentName,
        r.courseCode, r.roomCode, r.status, r.flagReason || null, m.cosineSimilarity, m.threshold, m.livenessScore ?? null,
        m.livenessPassed, m.distanceMeters, r.markedAt]
    );
  }
  counts.attendanceRecords = docs.attendancerecords.length;

  log('[COPY] Rows read from MongoDB:', counts);
  if (clearedDefaultPasswords) {
    log(`[COPY] Cleared ${clearedDefaultPasswords} student password(s) that were just the roll number; reset them from the Students page`);
  }
  for (const s of skipped) log(`[COPY] Skipped ${s}`);
  return { counts, skipped, clearedDefaultPasswords };
}

async function main() {
  await import('dotenv/config');
  const { MongoClient } = await import('mongodb');
  const { getPool, withTransaction, closePool } = await import('../db/index.js');
  const { migrate } = await import('../db/migrate.js');

  if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI to the Atlas connection string');

  await migrate();
  const { rows } = await getPool().query('SELECT count(*)::int AS n FROM users');
  if (rows[0].n > 0) {
    throw new Error('Postgres already has data (users table is not empty). Use an empty database.');
  }

  const mongo = new MongoClient(process.env.MONGODB_URI);
  try {
    await mongo.connect();
    const db = mongo.db(); // the database named in the URI
    console.log(`[COPY] Reading from MongoDB database "${db.databaseName}"`);
    await withTransaction((client) => copyAll(db, client));
    console.log('[COPY] Done. All data committed to PostgreSQL.');
  } finally {
    await mongo.close();
    await closePool();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`[COPY] Failed, nothing was written: ${err.message}`);
    process.exit(1);
  });
}
