import bcrypt from 'bcryptjs';
import { query, isUuid } from '../db/index.js';

const PUBLIC_COLUMNS = 'id, name, email, role, department, created_at';

// API shape: the frontend reads `_id`, so keep it alongside `id`
export const toUser = (r) => r && ({
  _id: r.id,
  id: r.id,
  name: r.name,
  email: r.email,
  role: r.role,
  department: r.department,
  createdAt: r.created_at
});

export async function findUserById(id) {
  if (!isUuid(id)) return null;
  const { rows } = await query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id]);
  return toUser(rows[0]);
}

export async function findUserByEmail(email) {
  const { rows } = await query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE email = $1`, [email.toLowerCase().trim()]);
  return toUser(rows[0]);
}

// Returns the user only if the password matches
export async function verifyUserPassword(email, password) {
  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS}, password_hash FROM users WHERE email = $1`,
    [email.toLowerCase().trim()]
  );
  const row = rows[0];
  if (!row || !(await bcrypt.compare(password, row.password_hash))) return null;
  return toUser(row);
}

export async function createUser({ name, email, password, role = 'faculty', department }, db = { query }) {
  const passwordHash = await bcrypt.hash(password, 10);
  const { rows } = await db.query(
    `INSERT INTO users (name, email, password_hash, role, department)
     VALUES ($1, $2, $3, $4, COALESCE($5, 'Computer Science & Engineering'))
     RETURNING ${PUBLIC_COLUMNS}`,
    [name, email.toLowerCase().trim(), passwordHash, role, department || null]
  );
  return toUser(rows[0]);
}

export async function countUsers() {
  const { rows } = await query('SELECT count(*)::int AS n FROM users');
  return rows[0].n;
}

export async function setUserPassword(email, password) {
  const passwordHash = await bcrypt.hash(password, 10);
  const { rowCount } = await query('UPDATE users SET password_hash = $2 WHERE email = $1', [email.toLowerCase().trim(), passwordHash]);
  return rowCount > 0;
}
