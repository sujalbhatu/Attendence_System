import crypto from 'crypto';
import { query, isUuid } from '../db/index.js';
import { toClassroom } from './classrooms.js';

// totp_secret is deliberately left out; only getSessionSecret reads it
const SESSION_COLUMNS = `se.id, se.course_code, se.course_name, se.course_id, se.branch, se.faculty_id,
  se.classroom_id, se.session_date, se.status, se.token_interval_seconds, se.require_pin, se.require_liveness,
  se.present_count, se.flagged_count, se.concluded_at, se.created_at`;

const JOINED_COLUMNS = `${SESSION_COLUMNS},
  cl.room_code AS cl_room_code, cl.building AS cl_building, cl.floor AS cl_floor, cl.capacity AS cl_capacity,
  cl.latitude AS cl_latitude, cl.longitude AS cl_longitude, cl.radius_meters AS cl_radius_meters,
  cl.is_active AS cl_is_active, cl.created_at AS cl_created_at,
  u.name AS u_name, u.email AS u_email, u.department AS u_department`;

const JOINS = `FROM sessions se
  JOIN classrooms cl ON cl.id = se.classroom_id
  JOIN users u ON u.id = se.faculty_id`;

// Same shape the Mongo version returned with .populate('classroomId').populate('facultyId')
export const toSession = (r) => r && ({
  _id: r.id,
  id: r.id,
  courseCode: r.course_code,
  courseName: r.course_name,
  courseId: r.course_id,
  branch: r.branch,
  facultyId: r.u_name !== undefined
    ? { _id: r.faculty_id, id: r.faculty_id, name: r.u_name, email: r.u_email, department: r.u_department }
    : r.faculty_id,
  classroomId: r.cl_room_code !== undefined
    ? toClassroom({
        id: r.classroom_id, room_code: r.cl_room_code, building: r.cl_building, floor: r.cl_floor,
        capacity: r.cl_capacity, latitude: r.cl_latitude, longitude: r.cl_longitude,
        radius_meters: r.cl_radius_meters, is_active: r.cl_is_active, created_at: r.cl_created_at
      })
    : r.classroom_id,
  sessionDate: r.session_date,
  status: r.status,
  tokenIntervalSeconds: r.token_interval_seconds,
  requirePin: r.require_pin,
  requireLiveness: r.require_liveness,
  stats: { presentCount: r.present_count, flaggedCount: r.flagged_count },
  concludedAt: r.concluded_at,
  createdAt: r.created_at
});

export async function findSessionById(id) {
  if (!isUuid(id)) return null;
  const { rows } = await query(`SELECT ${JOINED_COLUMNS} ${JOINS} WHERE se.id = $1`, [id]);
  return toSession(rows[0]);
}

export async function getSessionSecret(id) {
  if (!isUuid(id)) return null;
  const { rows } = await query('SELECT totp_secret, status, require_pin, token_interval_seconds FROM sessions WHERE id = $1', [id]);
  return rows[0] || null;
}

// Only the faculty who created a session (or an admin) may read or change it
export async function findOwnedSession(id, user) {
  const session = await findSessionById(id);
  if (!session) return null;
  return user.role === 'admin' || session.facultyId.id === user.id ? session : null;
}

export async function createSession({ courseCode, courseName, courseId, branch, facultyId, classroomId, requirePin }) {
  const { rows } = await query(
    `INSERT INTO sessions (course_code, course_name, course_id, branch, faculty_id, classroom_id, require_pin, totp_secret)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [courseCode, courseName, courseId || null, branch || '', facultyId, classroomId, !!requirePin,
      crypto.randomBytes(32).toString('hex')]
  );
  return findSessionById(rows[0].id);
}

export async function listFacultySessions(facultyId, limit = 20) {
  const { rows } = await query(
    `SELECT ${JOINED_COLUMNS} ${JOINS} WHERE se.faculty_id = $1 ORDER BY se.created_at DESC LIMIT $2`,
    [facultyId, limit]
  );
  return rows.map(toSession);
}

export async function toggleRequirePin(id) {
  const { rows } = await query(
    'UPDATE sessions SET require_pin = NOT require_pin WHERE id = $1 RETURNING require_pin',
    [id]
  );
  return rows[0]?.require_pin;
}

