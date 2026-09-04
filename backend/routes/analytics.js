import express from 'express';
import Student from '../models/Student.js';
import Attendance from '../models/Attendance.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.use(authMiddleware);

// GET /overview
router.get('/overview', async (req, res) => {
  try {
    const { section } = req.query;
    const today = new Date().toISOString().split('T')[0];
    
    let studentQuery = {};
    if (section) studentQuery.section = section;
    
    const totalStudents = await Student.countDocuments(studentQuery);
    
    let attendanceQuery = { date: today };
    if (section) {
      const students = await Student.find(studentQuery).select('_id');
      const studentIds = students.map(s => s._id);
      attendanceQuery.studentId = { $in: studentIds };
    }
    
    const presentToday = await Attendance.countDocuments(attendanceQuery);
    const absentToday = totalStudents - presentToday;
    const attendanceRate = totalStudents > 0 ? (presentToday / totalStudents) * 100 : 0;
    
    res.json({
      success: true,
      data: {
        totalStudents,
        presentToday,
        absentToday,
        attendanceRate
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /trends
router.get('/trends', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let dateQuery = {};
    if (startDate || endDate) {
      if (startDate) dateQuery.$gte = startDate;
      if (endDate) dateQuery.$lte = endDate;
    }
    
    const attendances = await Attendance.find(Object.keys(dateQuery).length ? { date: dateQuery } : {});
    
    const grouped = {};
    attendances.forEach(att => {
      if (!grouped[att.date]) {
        grouped[att.date] = new Set();
      }
      grouped[att.date].add(att.studentId.toString());
    });
    
    const totalStudents = await Student.countDocuments();
    
    const trends = Object.keys(grouped).map(date => {
      const present = grouped[date].size;
      const rate = totalStudents > 0 ? (present / totalStudents) * 100 : 0;
      return {
        date,
        present,
        total: totalStudents,
        rate
      };
    }).sort((a, b) => a.date.localeCompare(b.date));
    
    res.json({ success: true, data: trends });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /low-attendance
router.get('/low-attendance', async (req, res) => {
  try {
    const thirtyDaysAgoDate = new Date();
    thirtyDaysAgoDate.setDate(thirtyDaysAgoDate.getDate() - 30);
    const startDate = thirtyDaysAgoDate.toISOString().split('T')[0];
    
    const students = await Student.find().select('_id name rollNumber section');
    const attendances = await Attendance.find({ date: { $gte: startDate } });
    
    // Group attendance by student
    const attendanceCount = {};
    attendances.forEach(att => {
      const id = att.studentId.toString();
      attendanceCount[id] = (attendanceCount[id] || 0) + 1;
    });
    
    // Assume 30 total possible days for calculation, or actual days passed
    // Here we just assume 30 for simplicity, or unique dates in the range
    const uniqueDates = new Set(attendances.map(a => a.date)).size;
    const totalDays = uniqueDates > 0 ? uniqueDates : 30; // fallback to 30 if no records
    
    const lowAttendanceStudents = students.map(student => {
      const id = student._id.toString();
      const present = attendanceCount[id] || 0;
      const rate = totalDays > 0 ? (present / totalDays) * 100 : 0;
      return {
        _id: student._id,
        name: student.name,
        rollNumber: student.rollNumber,
        section: student.section,
        attendanceRate: rate
      };
    }).filter(s => s.attendanceRate < 75);
    
    res.json({ success: true, data: lowAttendanceStudents });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /sections
router.get('/sections', async (req, res) => {
  try {
    const sections = await Student.distinct('section');
    res.json({ success: true, data: sections });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /export
router.get('/export', async (req, res) => {
  try {
    const { startDate, endDate, section } = req.query;
    
    let query = {};
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = startDate;
      if (endDate) query.date.$lte = endDate;
    }
    
    let attendances = await Attendance.find(query).populate('studentId', 'name rollNumber section');
    
    if (section) {
      attendances = attendances.filter(record => 
        record.studentId && record.studentId.section === section
      );
    }
    
    let csv = 'Date,Time,Student Name,Roll Number,Section,Confidence\n';
    
    attendances.forEach(att => {
      const student = att.studentId || {};
      csv += `${att.date},${att.time},${student.name || 'N/A'},${student.rollNumber || 'N/A'},${student.section || 'N/A'},${att.confidence || ''}\n`;
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="attendance.csv"');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
