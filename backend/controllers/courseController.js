import { UNIQUE_VIOLATION, isUuid } from '../db/index.js';
import {
  createCourse as insertCourse,
  listCourses,
  findCourseById,
  countActiveEnrollments,
  enrollRollNumbers,
  courseEnrollmentStats,
  listFacultyAssignments,
  createFacultyAssignment
} from '../repositories/courses.js';

export const createCourse = async (req, res) => {
  try {
    const { courseCode, courseName, credits, department, semester, academicYear } = req.body;
    if (!courseCode || !courseName || !department || !semester || !academicYear) {
      return res.status(400).json({ error: 'courseCode, courseName, department, semester and academicYear are required' });
    }
    const course = await insertCourse({ courseCode: String(courseCode), courseName, credits, department, semester, academicYear });
    res.status(201).json({ course });
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      return res.status(400).json({ error: 'This course already exists for that academic year' });
    }
    res.status(500).json({ error: err.message });
  }
};

export const getCourses = async (req, res) => {
  try {
    const { department, semester, academicYear } = req.query;
    const courses = await listCourses({
      department: department || undefined,
      semester: semester ? Number(semester) : undefined,
      academicYear: academicYear || undefined
    });
    res.json({ courses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getCourseById = async (req, res) => {
  try {
    const course = await findCourseById(req.params.id);
    if (!course) return res.status(404).json({ error: 'Course not found' });

    const enrolledCount = await countActiveEnrollments(course.id);
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
      rollNumbers = String(csv).split('\n').map(r => r.trim().toUpperCase()).filter(r => r);
    }

    if (!rollNumbers || !Array.isArray(rollNumbers)) {
      return res.status(400).json({ error: 'Provide rollNumbers array or csv string' });
    }
    if (!branch || !academicYear) {
      return res.status(400).json({ error: 'branch and academicYear are required' });
    }

    const course = await findCourseById(id);
    if (!course) return res.status(404).json({ error: 'Course not found' });

    // One INSERT ... SELECT for the whole list; existing enrollments are skipped
    const result = await enrollRollNumbers(course.id, rollNumbers, { branch, academicYear });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getCourseEnrollments = async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return res.json({ enrollments: [] });
    // Attendance per student is computed in one query
    const enrollments = await courseEnrollmentStats(req.params.id);
    res.json({ enrollments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getMyAssignments = async (req, res) => {
  try {
    const assignments = await listFacultyAssignments(req.user.id);
    res.json({ assignments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const assignFaculty = async (req, res) => {
  try {
    const { id } = req.params;
    const { facultyId, branch, academicYear } = req.body;
    if (!isUuid(id) || !isUuid(String(facultyId)) || !branch || !academicYear) {
      return res.status(400).json({ error: 'facultyId, branch and academicYear are required' });
    }

    const assignment = await createFacultyAssignment({
      facultyId,
      courseId: id,
      branch,
      academicYear
    });

    res.status(201).json({ assignment });
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      return res.status(400).json({ error: 'This faculty is already assigned to the course' });
    }
    res.status(500).json({ error: err.message });
  }
};
