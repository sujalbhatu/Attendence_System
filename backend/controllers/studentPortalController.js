import jwt from 'jsonwebtoken';
import {
  verifyStudentPassword,
  markMustChangePassword,
  checkStudentPassword,
  setStudentPassword
} from '../repositories/students.js';
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
  isEnrolled: student.isEnrolled
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
