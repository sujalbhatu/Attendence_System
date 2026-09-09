import Course from '../models/Course.js';
import Enrollment from '../models/Enrollment.js';
import Student from '../models/Student.js';
import FacultyAssignment from '../models/FacultyAssignment.js';
import AttendanceRecord from '../models/AttendanceRecord.js';
import Session from '../models/Session.js';

export const createCourse = async (req, res) => {
  try {
    const course = await Course.create(req.body);
    res.status(201).json({ course });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getCourses = async (req, res) => {
  try {
    const { department, semester, academicYear } = req.query;
    const filter = {};
    if (department) filter.department = department;
    if (semester) filter.semester = semester;
    if (academicYear) filter.academicYear = academicYear;

    const courses = await Course.find(filter).sort({ courseCode: 1 });
    res.json({ courses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getCourseById = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ error: 'Course not found' });

    const enrolledCount = await Enrollment.countDocuments({ courseId: course._id, status: 'active' });
    res.json({ course, enrolledCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const enrollStudents = async (req, res) => {
  try {
    const { id } = req.params;
    let { rollNumbers, branch, academicYear, csv } = req.body;

    if (csv) {
      rollNumbers = csv.split('\n').map(r => r.trim().toUpperCase()).filter(r => r);
    }

    if (!rollNumbers || !Array.isArray(rollNumbers)) {
      return res.status(400).json({ error: 'Provide rollNumbers array or csv string' });
    }

    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ error: 'Course not found' });

    let success = 0;
    let skipped = 0;
    const errors = [];

    for (const roll of rollNumbers) {
      const student = await Student.findOne({ rollNumber: roll });
      if (!student) {
        errors.push(`Student ${roll} not found`);
        skipped++;
        continue;
      }

      try {
        await Enrollment.create({
          studentId: student._id,
          courseId: course._id,
          branch,
          academicYear
        });
        success++;
      } catch (err) {
        if (err.code === 11000) {
          skipped++;
        } else {
          errors.push(`Error enrolling ${roll}: ${err.message}`);
          skipped++;
        }
      }
    }

    res.json({ success, skipped, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getCourseEnrollments = async (req, res) => {
  try {
    const { id } = req.params;
    const enrollments = await Enrollment.find({ courseId: id, status: 'active' })
      .populate('studentId', 'rollNumber name email');

    // Need attendance stats per student
    const sessions = await Session.find({ courseId: id });
    const sessionIds = sessions.map(s => s._id);

    const stats = [];
    for (const enr of enrollments) {
      const presentCount = await AttendanceRecord.countDocuments({
        studentId: enr.studentId._id,
        sessionId: { $in: sessionIds },
        status: 'PRESENT'
      });
      const totalSessions = sessionIds.length;
      
      stats.push({
        student: enr.studentId,
        branch: enr.branch,
        enrolledAt: enr.enrolledAt,
        attendance: {
          present: presentCount,
          total: totalSessions,
          percentage: totalSessions > 0 ? (presentCount / totalSessions) * 100 : 0
        }
      });
    }

    res.json({ enrollments: stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getMyAssignments = async (req, res) => {
  try {
    const assignments = await FacultyAssignment.find({ facultyId: req.user._id })
      .populate('courseId');
    res.json({ assignments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const assignFaculty = async (req, res) => {
  try {
    const { id } = req.params;
    const { facultyId, branch, academicYear } = req.body;

    const assignment = await FacultyAssignment.create({
      facultyId,
      courseId: id,
      branch,
      academicYear
    });

    res.status(201).json({ assignment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
