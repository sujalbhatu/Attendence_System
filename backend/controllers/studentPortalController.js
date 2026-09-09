import jwt from 'jsonwebtoken';
import Student from '../models/Student.js';
import Enrollment from '../models/Enrollment.js';
import Session from '../models/Session.js';
import AttendanceRecord from '../models/AttendanceRecord.js';

export const studentLogin = async (req, res) => {
  try {
    const { rollNumber, password } = req.body;
    if (!rollNumber || !password) {
      return res.status(400).json({ error: 'Please provide rollNumber and password' });
    }

    const cleanRoll = rollNumber.trim().toUpperCase();
    const student = await Student.findOne({ rollNumber: cleanRoll });
    
    if (!student) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!student.password) {
      student.password = cleanRoll.toLowerCase();
      await student.save();
    }

    const isMatch = await student.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { studentId: student._id, rollNumber: student.rollNumber, role: 'student' },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '30d' }
    );

    res.json({
      token,
      student: {
        id: student._id,
        rollNumber: student.rollNumber,
        name: student.name,
        email: student.email
      }
    });
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
      
      const totalSessions = await Session.countDocuments({ courseId: enr.courseId._id, branch: enr.branch });
      const sessions = await Session.find({ courseId: enr.courseId._id, branch: enr.branch });
      const sessionIds = sessions.map(s => s._id);

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
          total: totalSessions,
          percentage: totalSessions > 0 ? (presentCount / totalSessions) * 100 : 0
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
    
    // Get all sessions for this course + branch combination that the student is enrolled in
    const branches = enrollments.map(e => e.branch);
    
    const sessions = await Session.find({ courseId, branch: { $in: branches } }).sort({ sessionDate: -1 });
    const sessionIds = sessions.map(s => s._id);

    const records = await AttendanceRecord.find({
      studentId: req.student._id,
      sessionId: { $in: sessionIds }
    }).populate('sessionId', 'sessionDate courseCode courseName status concludedAt');

    res.json({ attendance: records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
