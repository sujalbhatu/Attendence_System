import bcrypt from 'bcryptjs';
import { query, isUuid } from '../db/index.js';

// password_hash and face_embedding are never in this list, so they can't leak into a response
const PUBLIC_COLUMNS = `id, roll_number, name, email, department, batch, section, photo_url,
  is_enrolled, enrolled_at, enrollment_source, embedding_version, embedding_updated_at, must_change_password, created_at,
  (password_hash IS NOT NULL) AS can_sign_in, (face_pending IS NOT NULL) AS face_pending, face_pending_at`;

export const toStudent = (r) => r && ({
  _id: r.id,
  id: r.id,
  rollNumber: r.roll_number,
  name: r.name,
  email: r.email,
  department: r.department,
  batch: r.batch,
  section: r.section,
  photoUrl: r.photo_url,
  isEnrolled: r.is_enrolled,
  enrolledAt: r.enrolled_at,
  enrollmentSource: r.enrollment_source,
  embeddingVersion: r.embedding_version,
  embeddingUpdatedAt: r.embedding_updated_at,
  mustChangePassword: r.must_change_password,
  canSignIn: r.can_sign_in,
  facePending: !!r.face_pending,
  facePendingAt: r.face_pending_at,
  // NONE: nothing yet, PENDING: self-registered and waiting for faculty, ENROLLED: ready for check-in
  faceStatus: r.is_enrolled ? 'ENROLLED' : r.face_pending ? 'PENDING' : 'NONE',
  createdAt: r.created_at
});

export async function findStudentById(id) {
  if (!isUuid(id)) return null;
  const { rows } = await query(`SELECT ${PUBLIC_COLUMNS} FROM students WHERE id = $1`, [id]);
  return toStudent(rows[0]);
}

export async function findStudentByRoll(rollNumber) {
  const { rows } = await query(`SELECT ${PUBLIC_COLUMNS} FROM students WHERE roll_number = $1`, [rollNumber.trim().toUpperCase()]);
  return toStudent(rows[0]);
}

export async function listStudents({ department, batch } = {}) {
  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS} FROM students
     WHERE ($1::text IS NULL OR department = $1) AND ($2::text IS NULL OR batch = $2)
     ORDER BY roll_number`,
    [department ?? null, batch ?? null]
  );
  return rows.map(toStudent);
}

export async function createStudent({ rollNumber, name, email, department, batch, section, password, mustChangePassword = false }) {
  const passwordHash = password ? await bcrypt.hash(password, 10) : null;
  const { rows } = await query(
    `INSERT INTO students (roll_number, name, email, department, batch, section, password_hash, must_change_password)
     VALUES ($1, $2, $3, COALESCE($4, 'Computer Science & Engineering'), COALESCE($5, '2023-2027'), COALESCE($6, 'A'), $7, $8)
     RETURNING ${PUBLIC_COLUMNS}`,
    [rollNumber.trim().toUpperCase(), name, email ? email.toLowerCase().trim() : null,
      department || null, batch || null, section || null, passwordHash, mustChangePassword]
  );
  return toStudent(rows[0]);
}

export async function setStudentPassword(id, password, { mustChangePassword }) {
  const passwordHash = await bcrypt.hash(password, 10);
  const { rows } = await query(
    `UPDATE students SET password_hash = $2, must_change_password = $3 WHERE id = $1 RETURNING ${PUBLIC_COLUMNS}`,
    [id, passwordHash, mustChangePassword]
  );
  return toStudent(rows[0]);
}

export async function markMustChangePassword(id) {
  const { rows } = await query(
    `UPDATE students SET must_change_password = true WHERE id = $1 RETURNING ${PUBLIC_COLUMNS}`,
    [id]
  );
  return toStudent(rows[0]);
}

// Returns the student only if they have a password and it matches
export async function verifyStudentPassword(rollNumber, password) {
  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS}, password_hash FROM students WHERE roll_number = $1`,
    [rollNumber.trim().toUpperCase()]
  );
  const row = rows[0];
  if (!row || !row.password_hash || !(await bcrypt.compare(password, row.password_hash))) return null;
  return toStudent(row);
}

export async function checkStudentPassword(id, password) {
  const { rows } = await query('SELECT password_hash FROM students WHERE id = $1', [id]);
  const hash = rows[0]?.password_hash;
  return !!hash && bcrypt.compare(password, hash);
}

// Only the verification path reads the embedding
export async function getFaceEmbedding(id) {
  const { rows } = await query('SELECT face_embedding FROM students WHERE id = $1', [id]);
  return rows[0]?.face_embedding || null;
}

// source is 'FACULTY' (supervised enrollment) or 'SELF_SCAN' (first scan, flagged for review)
export async function enrollFaceEmbedding(id, embedding, source = 'FACULTY', db = { query }) {
  const { rows } = await db.query(
    `UPDATE students
     SET face_embedding = $2, is_enrolled = true, enrolled_at = now(), enrollment_source = $3,
         embedding_version = 1, embedding_updated_at = now(),
         face_pending = NULL, face_pending_thumb = NULL, face_pending_at = NULL
     WHERE id = $1 RETURNING ${PUBLIC_COLUMNS}`,
    [id, embedding, source]
  );
  return toStudent(rows[0]);
}

export async function updateFaceEmbedding(id, embedding, db = { query }) {
  const { rows } = await db.query(
    `UPDATE students
     SET face_embedding = $2, embedding_version = embedding_version + 1, embedding_updated_at = now()
     WHERE id = $1 RETURNING embedding_version`,
    [id, embedding]
  );
  return rows[0]?.embedding_version;
}

/**
 * Saves a phone self-registration for faculty approval. Only works once: not if the
 * student already has a face on file, and not while an earlier one is still pending.
 */
export async function submitPendingFace(id, embedding, thumb) {
  const { rows } = await query(
    `UPDATE students SET face_pending = $2, face_pending_thumb = $3, face_pending_at = now()
     WHERE id = $1 AND NOT is_enrolled AND face_pending IS NULL
     RETURNING ${PUBLIC_COLUMNS}`,
    [id, embedding, thumb]
  );
  return toStudent(rows[0]);
}

export async function getPendingFaceThumb(id) {
  if (!isUuid(id)) return null;
  const { rows } = await query('SELECT face_pending_thumb FROM students WHERE id = $1 AND face_pending IS NOT NULL', [id]);
  return rows[0] ? rows[0].face_pending_thumb || '' : null;
}

// Faculty approves in person: the pending face becomes the check-in template
export async function approvePendingFace(id) {
  if (!isUuid(id)) return null;
  const { rows } = await query(
    `UPDATE students
     SET face_embedding = face_pending, is_enrolled = true, enrolled_at = now(), enrollment_source = 'SELF_PHONE',
         embedding_version = 1, embedding_updated_at = now(),
         face_pending = NULL, face_pending_thumb = NULL, face_pending_at = NULL
     WHERE id = $1 AND face_pending IS NOT NULL
     RETURNING ${PUBLIC_COLUMNS}`,
    [id]
  );
  return toStudent(rows[0]);
}

// Faculty rejects: the student may register again
export async function rejectPendingFace(id) {
  if (!isUuid(id)) return null;
  const { rows } = await query(
    `UPDATE students SET face_pending = NULL, face_pending_thumb = NULL, face_pending_at = NULL
     WHERE id = $1 AND face_pending IS NOT NULL
     RETURNING ${PUBLIC_COLUMNS}`,
    [id]
  );
  return toStudent(rows[0]);
}

export async function deleteStudent(id) {
  if (!isUuid(id)) return;
  await query('DELETE FROM students WHERE id = $1', [id]);
}
