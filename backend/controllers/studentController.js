import crypto from 'crypto';
import { UNIQUE_VIOLATION } from '../db/index.js';
import {
  listStudents,
  findStudentById,
  findStudentByRoll,
  createStudent as insertStudent,
  setStudentPassword,
  enrollFaceEmbedding,
  deleteStudent as removeStudent
} from '../repositories/students.js';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

const getMLUrl = () => process.env.ML_SERVICE_URL || 'http://127.0.0.1:5005';

// 10 characters from an alphabet without look-alikes (0/O, 1/l/I)
const generateTemporaryPassword = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(10), (b) => alphabet[b % alphabet.length]).join('');
};

export const getStudents = async (req, res) => {
  try {
    const { department, batch } = req.query;
    const students = await listStudents({ department: department || undefined, batch: batch || undefined });
    res.json({ students });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getStudentByRoll = async (req, res) => {
  try {
    const found = await findStudentByRoll(String(req.params.rollNumber));
    if (!found) {
      return res.status(404).json({ error: 'Student not found' });
    }
    const { id, _id, rollNumber, name, department, batch, section, isEnrolled, enrolledAt } = found;
    res.json({ student: { _id, id, rollNumber, name, department, batch, section, isEnrolled, enrolledAt } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const createStudent = async (req, res) => {
  try {
    const { rollNumber, name, email, department, batch, section } = req.body;
    if (!rollNumber || !name) {
      return res.status(400).json({ error: 'rollNumber and name are required' });
    }
    const existing = await findStudentByRoll(String(rollNumber));
    if (existing) {
      return res.status(400).json({ error: 'Student with this roll number already exists' });
    }

    // The faculty hands this to the student once; the student must change it on first login
    const temporaryPassword = generateTemporaryPassword();
    const student = await insertStudent({
      rollNumber: String(rollNumber),
      name,
      email,
      password: temporaryPassword,
      mustChangePassword: true,
      department,
      batch,
      section
    });

    res.status(201).json({ student, temporaryPassword });
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      return res.status(400).json({ error: 'Student with this roll number already exists' });
    }
    res.status(500).json({ error: err.message });
  }
};

export const resetStudentPassword = async (req, res) => {
  try {
    const found = await findStudentById(req.params.studentId);
    if (!found) {
      return res.status(404).json({ error: 'Student not found' });
    }
    const temporaryPassword = generateTemporaryPassword();
    const student = await setStudentPassword(found.id, temporaryPassword, { mustChangePassword: true });
    res.json({ rollNumber: student.rollNumber, temporaryPassword });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const enrollFace = async (req, res) => {
  try {
    const { studentId } = req.params;
    const found = await findStudentById(studentId);
    if (!found) {
      (req.files || []).forEach((f) => fs.unlink(f.path, () => {}));
      return res.status(404).json({ error: 'Student not found' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No face images uploaded' });
    }

    // Forward face crops to ML Service to extract 512-d embedding
    const form = new FormData();
    for (const f of req.files) {
      form.append('images', fs.createReadStream(f.path));
    }

    const mlRes = await axios.post(`${getMLUrl()}/embed`, form, {
      headers: form.getHeaders(),
      timeout: 10000
    });

    const { embedding } = mlRes.data;

    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error('ML service returned no embedding');
    }
    const student = await enrollFaceEmbedding(found.id, embedding, 'FACULTY');

    // Clean up temporary uploads
    req.files.forEach((f) => fs.unlink(f.path, () => {}));

    res.json({
      message: 'Face enrolled successfully',
      student: {
        id: student.id,
        rollNumber: student.rollNumber,
        name: student.name,
        isEnrolled: student.isEnrolled,
        enrolledAt: student.enrolledAt
      }
    });
  } catch (err) {
    if (req.files) {
      req.files.forEach((f) => fs.unlink(f.path, () => {}));
    }
    res.status(500).json({ error: `Face enrollment failed: ${err.message}` });
  }
};

export const deleteStudent = async (req, res) => {
  try {
    await removeStudent(req.params.id);
    res.json({ message: 'Student removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
