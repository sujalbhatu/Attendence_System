import crypto from 'crypto';
import Student from '../models/Student.js';
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
    const filter = {};
    if (department) filter.department = department;
    if (batch) filter.batch = batch;

    const students = await Student.find(filter).sort({ rollNumber: 1 });
    res.json({ students });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getStudentByRoll = async (req, res) => {
  try {
    const student = await Student.findOne({ rollNumber: String(req.params.rollNumber).toUpperCase() })
      .select('rollNumber name department batch section isEnrolled enrolledAt');
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    res.json({ student });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const createStudent = async (req, res) => {
  try {
    const { rollNumber, name, email, department, batch, section } = req.body;
    const existing = await Student.findOne({ rollNumber: rollNumber.toUpperCase() });
    if (existing) {
      return res.status(400).json({ error: 'Student with this roll number already exists' });
    }

    // The faculty hands this to the student once; the student must change it on first login
    const temporaryPassword = generateTemporaryPassword();
    const student = await Student.create({
      rollNumber: rollNumber.toUpperCase(),
      name,
      email,
      password: temporaryPassword,
      mustChangePassword: true,
      department: department || 'Computer Science & Engineering',
      batch: batch || '2023-2027',
      section: section || 'A'
    });

    res.status(201).json({ student, temporaryPassword });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const resetStudentPassword = async (req, res) => {
  try {
    const student = await Student.findById(req.params.studentId);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    const temporaryPassword = generateTemporaryPassword();
    student.password = temporaryPassword;
    student.mustChangePassword = true;
    await student.save();
    res.json({ rollNumber: student.rollNumber, temporaryPassword });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const enrollFace = async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await Student.findById(studentId);
    if (!student) {
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

    student.faceEmbedding = embedding;
    student.isEnrolled = true;
    student.enrolledAt = new Date();
    student.enrollmentSource = 'FACULTY';
    await student.save();

    // Clean up temporary uploads
    req.files.forEach((f) => fs.unlink(f.path, () => {}));

    res.json({
      message: 'Face enrolled successfully',
      student: {
        id: student._id,
        rollNumber: student.rollNumber,
        name: student.name,
        isEnrolled: true,
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
    await Student.findByIdAndDelete(req.params.id);
    res.json({ message: 'Student removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
