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

export const updateClassroom = async (req, res) => {
  try {
    const classroom = await patchClassroom(req.params.id, req.body);
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
