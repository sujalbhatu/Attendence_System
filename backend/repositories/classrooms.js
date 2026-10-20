import { query, isUuid } from '../db/index.js';

const COLUMNS = 'id, room_code, building, floor, capacity, latitude, longitude, radius_meters, is_active, created_at';

export const toClassroom = (r) => r && ({
  _id: r.id,
  id: r.id,
  roomCode: r.room_code,
  building: r.building,
  floor: r.floor,
  capacity: r.capacity,
  latitude: r.latitude,
  longitude: r.longitude,
  radiusMeters: r.radius_meters,
  isActive: r.is_active,
  createdAt: r.created_at
});

export async function listActiveClassrooms() {
  const { rows } = await query(`SELECT ${COLUMNS} FROM classrooms WHERE is_active ORDER BY room_code`);
  return rows.map(toClassroom);
}

export async function findClassroomById(id) {
  if (!isUuid(id)) return null;
  const { rows } = await query(`SELECT ${COLUMNS} FROM classrooms WHERE id = $1`, [id]);
  return toClassroom(rows[0]);
}

export async function findClassroomByCode(roomCode) {
  const { rows } = await query(`SELECT ${COLUMNS} FROM classrooms WHERE room_code = $1`, [roomCode.trim().toUpperCase()]);
  return toClassroom(rows[0]);
}

export async function createClassroom({ roomCode, building, floor, capacity, latitude, longitude, radiusMeters }) {
  const { rows } = await query(
    `INSERT INTO classrooms (room_code, building, floor, capacity, latitude, longitude, radius_meters)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLUMNS}`,
    [roomCode.trim().toUpperCase(), building, floor, capacity, latitude, longitude, radiusMeters]
  );
  return toClassroom(rows[0]);
}

// Only these fields can be edited (no mass assignment of arbitrary columns)
const EDITABLE = {
  building: 'building',
  floor: 'floor',
  capacity: 'capacity',
  latitude: 'latitude',
  longitude: 'longitude',
  radiusMeters: 'radius_meters',
  isActive: 'is_active'
};

export async function updateClassroom(id, changes) {
  if (!isUuid(id)) return null;
  const sets = [];
  const values = [id];
  for (const [key, column] of Object.entries(EDITABLE)) {
    if (changes[key] !== undefined) {
      values.push(changes[key]);
      sets.push(`${column} = $${values.length}`);
    }
  }
  if (sets.length === 0) return findClassroomById(id);
  const { rows } = await query(`UPDATE classrooms SET ${sets.join(', ')} WHERE id = $1 RETURNING ${COLUMNS}`, values);
  return toClassroom(rows[0]);
}

export async function countClassrooms() {
  const { rows } = await query('SELECT count(*)::int AS n FROM classrooms');
  return rows[0].n;
}
