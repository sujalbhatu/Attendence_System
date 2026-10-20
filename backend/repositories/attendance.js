import crypto from 'crypto';
import { query, withTransaction } from '../db/index.js';
import { enrollFaceEmbedding, updateFaceEmbedding } from './students.js';

export const toClaim = (r) => r && ({
  _id: r.id,
  id: r.id,
  claimTicket: r.claim_ticket,
  sessionId: r.session_id,
  studentId: r.student_id,
  rollNumber: r.roll_number,
  tokenStep: r.token_step === null ? null : Number(r.token_step),
  assignedDelayMs: r.assigned_delay_ms,
  status: r.status,
  pinDeadline: r.pin_deadline,
  pinAttempts: r.pin_attempts,
  claimedAt: r.claimed_at,
  expireAt: r.expire_at
});

export const toRecord = (r) => r && ({
  _id: r.id,
  id: r.id,
  sessionId: r.session_id,
  studentId: r.student_id,
  rollNumber: r.roll_number,
  studentName: r.student_name,
  courseCode: r.course_code,
  roomCode: r.room_code,
  status: r.status,
  flagReason: r.flag_reason,
  verificationMetrics: {
    cosineSimilarity: r.cosine_similarity,
    threshold: r.threshold,
    livenessScore: r.liveness_score,
    livenessPassed: r.liveness_passed,
    distanceMeters: r.distance_meters
  },
  markedAt: r.marked_at
});

export async function hasAttendanceRecord(sessionId, studentId) {
  const { rowCount } = await query(
    'SELECT 1 FROM attendance_records WHERE session_id = $1 AND student_id = $2',
    [sessionId, studentId]
  );
  return rowCount > 0;
}

/**
 * Starts (or restarts) this student's claim for a session after a valid QR scan.
 * One claim per student per session (UNIQUE), so concurrent scans can't create two.
 *  - no claim, or an expired one: a fresh ticket in the given phase
 *  - a live claim waiting for its PIN: same ticket, PIN window and attempts restart
 *  - a live claim already in the biometric phase: returned unchanged (same ticket and upload slot)
 */
export async function startClaim({ sessionId, studentId, rollNumber, clientGps, tokenStep, status, pinWindowMs, assignedDelayMs, ttlMs }) {
  const ticket = `tkt_${crypto.randomBytes(16).toString('hex')}`;
  const { rows } = await query(
    `INSERT INTO claims (claim_ticket, session_id, student_id, roll_number, client_latitude, client_longitude,
                         client_accuracy_m, token_step, status, pin_deadline, pin_attempts, assigned_delay_ms, expire_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
             CASE WHEN $10::int IS NULL THEN NULL ELSE now() + make_interval(secs => $10::int / 1000.0) END,
             0, $11, now() + make_interval(secs => $12::int / 1000.0))
     ON CONFLICT (session_id, student_id) DO UPDATE
       SET claim_ticket = CASE WHEN claims.expire_at <= now() THEN EXCLUDED.claim_ticket ELSE claims.claim_ticket END,
           client_latitude = EXCLUDED.client_latitude,
           client_longitude = EXCLUDED.client_longitude,
           client_accuracy_m = EXCLUDED.client_accuracy_m,
           token_step = EXCLUDED.token_step,
           status = EXCLUDED.status,
           pin_deadline = EXCLUDED.pin_deadline,
           pin_attempts = 0,
           assigned_delay_ms = EXCLUDED.assigned_delay_ms,
           claimed_at = now(),
           expire_at = EXCLUDED.expire_at
       WHERE NOT (claims.expire_at > now() AND claims.status = 'AWAITING_BIOMETRICS')
     RETURNING *`,
    [ticket, sessionId, studentId, rollNumber, clientGps?.latitude ?? null, clientGps?.longitude ?? null,
      clientGps?.accuracyMeters ?? null, tokenStep ?? null, status, pinWindowMs ?? null, assignedDelayMs ?? 0, ttlMs]
  );
  if (rows[0]) return { claim: toClaim(rows[0]), reused: false };
  // The conditional update skipped a live claim that is already waiting for biometrics
  const existing = await query('SELECT * FROM claims WHERE session_id = $1 AND student_id = $2', [sessionId, studentId]);
  return { claim: toClaim(existing.rows[0]), reused: true };
}

// Only returns the claim if it belongs to this student and hasn't expired
export async function findLiveClaim(claimTicket, studentId) {
  const { rows } = await query(
    'SELECT * FROM claims WHERE claim_ticket = $1 AND student_id = $2 AND expire_at > now()',
    [String(claimTicket), studentId]
  );
  return toClaim(rows[0]);
}

// AWAITING_PIN -> AWAITING_BIOMETRICS with an upload slot and a fresh expiry
export async function promoteClaim(claimId, { assignedDelayMs, ttlMs }) {
  const { rows } = await query(
    `UPDATE claims SET status = 'AWAITING_BIOMETRICS', assigned_delay_ms = $2,
            expire_at = now() + make_interval(secs => $3::int / 1000.0)
     WHERE id = $1 AND status = 'AWAITING_PIN' RETURNING *`,
    [claimId, assignedDelayMs, ttlMs]
  );
  if (rows[0]) return toClaim(rows[0]);
  // A parallel correct PIN promoted it first
  const current = await query('SELECT * FROM claims WHERE id = $1', [claimId]);
  return toClaim(current.rows[0]);
}

// Counts a wrong PIN in one statement, so parallel guesses can't get past the attempt limit
export async function recordWrongPin(claimId) {
  const { rows } = await query(
    `UPDATE claims SET pin_attempts = pin_attempts + 1 WHERE id = $1 AND status = 'AWAITING_PIN' RETURNING pin_attempts`,
    [claimId]
  );
  return rows[0]?.pin_attempts ?? null;
}

export async function deleteClaim(claimId) {
  await query('DELETE FROM claims WHERE id = $1', [claimId]);
}

export async function deleteExpiredClaims() {
  const { rowCount } = await query('DELETE FROM claims WHERE expire_at < now()');
  return rowCount;
}

/**
 * Commits a verified attendance in one transaction: insert the record, bump the session's
 * present or flagged counter, save the face template and delete the claim. If two
 * verifications for the same student race, the UNIQUE (session_id, student_id) constraint
 * lets only one insert through and the other sees `alreadyMarked`.
 *
 * face: { selfEnroll: embedding } stores a first-scan template (status FLAGGED),
 *       { centroid: embedding } replaces the template with the blended one.
 */
export async function commitAttendance({ session, student, claimId, status = 'PRESENT', flagReason = null, metrics, face = {} }) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO attendance_records (session_id, student_id, roll_number, student_name, course_code, room_code,
                                       status, flag_reason, cosine_similarity, threshold, liveness_score, liveness_passed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (session_id, student_id) DO NOTHING
       RETURNING *`,
      [session.id, student.id, student.rollNumber, student.name, session.courseCode,
        session.classroomId?.roomCode || 'N/A', status, flagReason,
        metrics.cosineSimilarity, metrics.threshold, metrics.livenessScore, metrics.livenessPassed]
    );

    await client.query('DELETE FROM claims WHERE id = $1', [claimId]);

    if (rows.length === 0) {
      return { alreadyMarked: true };
    }

    const counter = status === 'PRESENT' ? 'present_count' : 'flagged_count';
    await client.query(`UPDATE sessions SET ${counter} = ${counter} + 1 WHERE id = $1`, [session.id]);

    if (face.selfEnroll) {
      await enrollFaceEmbedding(student.id, face.selfEnroll, 'SELF_SCAN', client);
    } else if (face.centroid) {
      await updateFaceEmbedding(student.id, face.centroid, client);
    }
    return { record: toRecord(rows[0]) };
  });
}

export async function liveRoster(sessionId) {
  const { rows } = await query(
    `SELECT id, roll_number, student_name, status, flag_reason, cosine_similarity, threshold, liveness_score,
            liveness_passed, distance_meters, marked_at, session_id, student_id, course_code, room_code
     FROM attendance_records WHERE session_id = $1 ORDER BY marked_at DESC`,
    [sessionId]
  );
  return rows.map(toRecord);
}

export async function sessionRecordsByRoll(sessionId) {
  const { rows } = await query(
    'SELECT * FROM attendance_records WHERE session_id = $1 ORDER BY roll_number',
    [sessionId]
  );
  return rows.map(toRecord);
}

/**
 * Concludes a session and marks every enrolled student who didn't check in as ABSENT,
 * as one set-based INSERT ... SELECT inside a transaction.
 */
export async function concludeWithAbsentees(session) {
  return withTransaction(async (client) => {
    await client.query(
      `UPDATE sessions SET status = 'CONCLUDED', concluded_at = COALESCE(concluded_at, now()) WHERE id = $1`,
      [session.id]
    );
    if (!session.courseId) return null;

    const { rowCount: absent } = await client.query(
      `INSERT INTO attendance_records (session_id, student_id, roll_number, student_name, course_code, room_code,
                                       status, cosine_similarity, threshold, liveness_score, liveness_passed)
       SELECT $1, s.id, s.roll_number, s.name, $2, 'N/A', 'ABSENT', 0, 0.65, 0, false
       FROM enrollments e JOIN students s ON s.id = e.student_id
       WHERE e.course_id = $3 AND e.branch = $4 AND e.status = 'active'
       ON CONFLICT (session_id, student_id) DO NOTHING`,
      [session.id, session.courseCode, session.courseId, session.branch]
    );

    const { rows } = await client.query(
      `SELECT count(*) FILTER (WHERE status = 'PRESENT')::int AS present,
              (SELECT count(*) FROM enrollments
               WHERE course_id = $2 AND branch = $3 AND status = 'active')::int AS total
       FROM attendance_records WHERE session_id = $1`,
      [session.id, session.courseId, session.branch]
    );
    return { present: rows[0].present, absent, total: rows[0].total };
  });
}

// A student's records for a course, newest session first, with the session's basics attached
export async function studentCourseRecords(studentId, courseId, branches) {
  const { rows } = await query(
    `SELECT a.*, se.session_date AS se_session_date, se.course_code AS se_course_code,
            se.course_name AS se_course_name, se.status AS se_status, se.concluded_at AS se_concluded_at
     FROM attendance_records a
     JOIN sessions se ON se.id = a.session_id
     WHERE a.student_id = $1 AND se.course_id = $2 AND se.branch = ANY($3)
     ORDER BY se.session_date DESC`,
    [studentId, courseId, branches]
  );
  return rows.map((r) => ({
    ...toRecord(r),
    sessionId: {
      _id: r.session_id,
      id: r.session_id,
      sessionDate: r.se_session_date,
      courseCode: r.se_course_code,
      courseName: r.se_course_name,
      status: r.se_status,
      concludedAt: r.se_concluded_at
    }
  }));
}

export async function countActiveEnrollmentsForSession(session) {
  if (!session.courseId) return 0;
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM enrollments WHERE course_id = $1 AND status = 'active'`,
    [session.courseId]
  );
  return rows[0].n;
}
