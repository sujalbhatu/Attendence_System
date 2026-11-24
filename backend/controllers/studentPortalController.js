import jwt from 'jsonwebtoken';
import {
  verifyStudentPassword,
  markMustChangePassword,
  checkStudentPassword,
  setStudentPassword,
  findStudentById,
  submitPendingFace
} from '../repositories/students.js';
import { embedUploadedFaces } from '../services/faceEmbed.js';
import fs from 'fs';
import { studentCourseStats, activeEnrollmentBranches } from '../repositories/courses.js';
import { studentCourseRecords } from '../repositories/attendance.js';
import { JWT_SECRET } from '../config.js';
import { isUuid } from '../db/index.js';

// Older accounts may still have their roll number (lower-case) as the password.
// New students get a temporary password from faculty instead (Students page), because
// anyone who knows a roll number could otherwise claim an account before its owner.
const defaultPasswordFor = (rollNumber) => rollNumber.toLowerCase();

const signStudentToken = (student) =>
  jwt.sign(
    { studentId: student.id, rollNumber: student.rollNumber, role: 'student' },
    JWT_SECRET,
    { expiresIn: student.mustChangePassword ? '1h' : '30d' }
  );

const publicStudent = (student) => ({
  id: student.id,
  rollNumber: student.rollNumber,
  name: student.name,
  email: student.email,
  isEnrolled: student.isEnrolled,
  faceStatus: student.faceStatus
});

export const studentLogin = async (req, res) => {
  try {
    const { rollNumber, password } = req.body;
    if (!rollNumber || !password) {
      return res.status(400).json({ error: 'Please provide rollNumber and password' });
    }

    const cleanRoll = String(rollNumber).trim().toUpperCase();
    // No password yet means faculty hasn't issued one: there is no default to guess
    let student = await verifyStudentPassword(cleanRoll, String(password));
    if (!student) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Catch accounts that were defaulted before this rule existed.
    if (!student.mustChangePassword && String(password) === defaultPasswordFor(cleanRoll)) {
      student = await markMustChangePassword(student.id);
    }

    res.json({
      token: signStudentToken(student),
      mustChangePassword: student.mustChangePassword,
      student: publicStudent(student)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const student = req.student;
    if (!(await checkStudentPassword(student.id, String(currentPassword || '')))) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    if (String(newPassword).toLowerCase() === defaultPasswordFor(student.rollNumber)) {
      return res.status(400).json({ error: 'Choose a password that is different from your roll number' });
    }

    const updated = await setStudentPassword(student.id, String(newPassword), { mustChangePassword: false });
    res.json({ token: signStudentToken(updated), mustChangePassword: false, student: publicStudent(updated) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Fresh account state for the phone (face status changes when faculty approves)
export const getMe = async (req, res) => {
  try {
    const student = await findStudentById(req.student.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    res.json({ student: publicStudent(student) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const THUMB_PREFIX = 'data:image/jpeg;base64,';
const MAX_THUMB_CHARS = 60000; // ~45 KB image

/**
 * First-login face registration from the student's own phone. Saved as PENDING:
 * check-ins stay blocked until faculty approves it in person on the Students page.
 */
export const registerOwnFace = async (req, res) => {
  const files = req.files || [];
  const discard = () => files.forEach((f) => fs.unlink(f.path, () => {}));
  try {
    const student = await findStudentById(req.student.id);
    if (!student) { discard(); return res.status(404).json({ error: 'Student not found' }); }
    if (student.faceStatus !== 'NONE') {
      discard();
      return res.status(409).json({
        code: student.faceStatus === 'PENDING' ? 'FACE_PENDING' : 'FACE_ALREADY_ENROLLED',
        error: student.faceStatus === 'PENDING'
          ? 'Your face is already registered and waiting for your faculty to approve it.'
          : 'Your face is already on file. Ask your faculty if it needs to be captured again.'
      });
    }
    if (files.length < 3) {
      discard();
      return res.status(400).json({ error: 'Take 3 photos of your face.' });
    }
    const thumb = String(req.body.thumb || '');
    if (!thumb.startsWith(THUMB_PREFIX) || thumb.length > MAX_THUMB_CHARS) {
      discard();
      return res.status(400).json({ error: 'Missing or invalid preview image.' });
    }

    let embedding;
    try {
      embedding = await embedUploadedFaces(files); // deletes the uploads
    } catch {
      return res.status(502).json({ error: 'Could not read your face. Try again in good light, face centred.' });
    }

    const saved = await submitPendingFace(student.id, embedding, thumb);
    if (!saved) return res.status(409).json({ error: 'Your face was already registered.' });
    res.status(201).json({ student: publicStudent(saved) });
  } catch (err) {
    discard();
    res.status(500).json({ error: err.message });
  }
};

export const getMyCourses = async (req, res) => {
  try {
    // Every course with its attendance %, in one query
    const courses = await studentCourseStats(req.student.id);
    res.json({ courses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getCourseAttendance = async (req, res) => {
  try {
    const { courseId } = req.params;

    const branches = isUuid(courseId) ? await activeEnrollmentBranches(req.student.id, courseId) : [];
    if (!branches.length) {
      return res.status(403).json({ error: 'Not enrolled in this course' });
    }

    const attendance = await studentCourseRecords(req.student.id, courseId, branches);
    res.json({ attendance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
