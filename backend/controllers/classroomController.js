import { UNIQUE_VIOLATION } from '../db/index.js';
import {
  listActiveClassrooms,
  findClassroomByCode,
  createClassroom as insertClassroom,
  updateClassroom as patchClassroom
} from '../repositories/classrooms.js';

export const getClassrooms = async (req, res) => {
  try {
    const classrooms = await listActiveClassrooms();
    res.json({ classrooms });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const createClassroom = async (req, res) => {
  try {
    const { roomCode, building, floor, capacity, latitude, longitude, radiusMeters } = req.body;
    if (!roomCode || !building || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'roomCode, building, latitude and longitude are required' });
    }
    const { error: badValue } = validateClassroomChanges({ latitude, longitude, radiusMeters });
    if (badValue) return res.status(400).json({ error: badValue });
    const existing = await findClassroomByCode(String(roomCode));
    if (existing) {
      return res.status(400).json({ error: 'Classroom with this room code already exists' });
    }

    const classroom = await insertClassroom({
      roomCode: String(roomCode),
      building,
      floor: floor || 1,
      capacity: capacity || 70,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      radiusMeters: parseFloat(radiusMeters) || 35.0
    });

    res.status(201).json({ classroom });
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      return res.status(400).json({ error: 'Classroom with this room code already exists' });
    }
    res.status(500).json({ error: err.message });
  }
};

// Numeric fields an edit may change, with the range each must fall in
const LIMITS = {
  radiusMeters: { min: 10, max: 2000, label: 'radiusMeters must be between 10 and 2000 metres' },
  latitude: { min: -90, max: 90, label: 'latitude must be between -90 and 90' },
  longitude: { min: -180, max: 180, label: 'longitude must be between -180 and 180' }
};

// Returns { changes } with numbers parsed, or { error } for the first bad field
export function validateClassroomChanges(body = {}) {
  const changes = { ...body };
  for (const [field, { min, max, label }] of Object.entries(LIMITS)) {
    if (body[field] === undefined) continue;
    const raw = body[field];
    const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      return { error: label };
    }
    changes[field] = value;
  }
  return { changes };
}

export const updateClassroom = async (req, res) => {
  try {
    const { changes, error } = validateClassroomChanges(req.body);
    if (error) return res.status(400).json({ error });
    const classroom = await patchClassroom(req.params.id, changes);
    if (!classroom) return res.status(404).json({ error: 'Classroom not found' });
    res.json({ classroom });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteClassroom = async (req, res) => {
  try {
    await patchClassroom(req.params.id, { isActive: false });
    res.json({ message: 'Classroom archived' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
