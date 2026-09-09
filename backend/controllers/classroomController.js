import Classroom from '../models/Classroom.js';

export const getClassrooms = async (req, res) => {
  try {
    const classrooms = await Classroom.find({ isActive: true }).sort({ roomCode: 1 });
    res.json({ classrooms });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const createClassroom = async (req, res) => {
  try {
    const { roomCode, building, floor, capacity, latitude, longitude, radiusMeters } = req.body;
    const existing = await Classroom.findOne({ roomCode: roomCode.toUpperCase() });
    if (existing) {
      return res.status(400).json({ error: 'Classroom with this room code already exists' });
    }

    const classroom = await Classroom.create({
      roomCode: roomCode.toUpperCase(),
      building,
      floor: floor || 1,
      capacity: capacity || 70,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      radiusMeters: parseFloat(radiusMeters) || 35.0
    });

    res.status(201).json({ classroom });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateClassroom = async (req, res) => {
  try {
    const classroom = await Classroom.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ classroom });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteClassroom = async (req, res) => {
  try {
    await Classroom.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: 'Classroom archived' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
