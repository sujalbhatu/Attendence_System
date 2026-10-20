import jwt from 'jsonwebtoken';
import Student from '../models/Student.js';
import Enrollment from '../models/Enrollment.js';
import Session from '../models/Session.js';
import AttendanceRecord from '../models/AttendanceRecord.js';
import { JWT_SECRET } from '../config.js';

// Older accounts may still have their roll number (lower-case) as the password.
// New students get a temporary password from faculty instead (Students page), because
// anyone who knows a roll number could otherwise claim an account before its owner.
const defaultPasswordFor = (rollNumber) => rollNumber.toLowerCase();

const signStudentToken = (student) =>
  jwt.sign(
    { studentId: student._id, rollNumber: student.rollNumber, role: 'student' },
    JWT_SECRET,
    { expiresIn: student.mustChangePassword ? '1h' : '30d' }
  );

const publicStudent = (student) => ({
  id: student._id,
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
    const student = await Student.findOne({ rollNumber: cleanRoll }).select('+password');
    // No password yet means faculty hasn't issued one: there is no default to guess
    if (!student || !student.password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await student.comparePassword(String(password));
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Catch accounts that were defaulted before this rule existed.
    if (!student.mustChangePassword && String(password) === defaultPasswordFor(cleanRoll)) {
      student.mustChangePassword = true;
      await student.save();
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

    const student = await Student.findById(req.student._id).select('+password');
    if (!(await student.comparePassword(String(currentPassword || '')))) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    if (String(newPassword).toLowerCase() === defaultPasswordFor(student.rollNumber)) {
      return res.status(400).json({ error: 'Choose a password that is different from your roll number' });
    }

    student.password = String(newPassword);
    student.mustChangePassword = false;
    await student.save();

    res.json({ token: signStudentToken(student), mustChangePassword: false, student: publicStudent(student) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getMyCourses = async (req, res) => {
  try {
    const enrollments = await Enrollment.find({ studentId: req.student._id, status: 'active' })
      .populate('courseId');

    const courseStats = [];
    for (const enr of enrollments) {
      if (!enr.courseId) continue;

      const sessions = await Session.find({ courseId: enr.courseId._id, branch: enr.branch }).select('_id');
      const sessionIds = sessions.map((s) => s._id);

      const presentCount = await AttendanceRecord.countDocuments({
        studentId: req.student._id,
        sessionId: { $in: sessionIds },
        status: 'PRESENT'
      });

      courseStats.push({
        enrollmentId: enr._id,
        course: enr.courseId,
        branch: enr.branch,
        academicYear: enr.academicYear,
        attendance: {
          present: presentCount,
          total: sessions.length,
          percentage: sessions.length > 0 ? (presentCount / sessions.length) * 100 : 0
        }
      });
    }

    res.json({ courses: courseStats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getCourseAttendance = async (req, res) => {
  try {
    const { courseId } = req.params;

    const enrollments = await Enrollment.find({ studentId: req.student._id, courseId, status: 'active' });
    if (!enrollments.length) {
      return res.status(403).json({ error: 'Not enrolled in this course' });
    }

    const branches = enrollments.map((e) => e.branch);
    const sessions = await Session.find({ courseId, branch: { $in: branches } }).sort({ sessionDate: -1 });
    const sessionIds = sessions.map((s) => s._id);

    const records = await AttendanceRecord.find({
      studentId: req.student._id,
      sessionId: { $in: sessionIds }
    }).populate('sessionId', 'sessionDate courseCode courseName status concludedAt');

    res.json({ attendance: records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
