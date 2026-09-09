import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import classroomRoutes from './routes/classrooms.js';
import studentRoutes from './routes/students.js';
import sessionRoutes from './routes/sessions.js';
import attendanceRoutes from './routes/attendance.js';
import courseRoutes from './routes/courses.js';
import studentPortalRoutes from './routes/studentPortal.js';
import User from './models/User.js';
import Classroom from './models/Classroom.js';
import Course from './models/Course.js';
import FacultyAssignment from './models/FacultyAssignment.js';
import Enrollment from './models/Enrollment.js';
import Student from './models/Student.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Request logging in dev
app.use((req, res, next) => {
  if (req.method !== 'OPTIONS') {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  }
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'CampusTrack Gateway',
    timestamp: new Date(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/classrooms', classroomRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/student-portal', studentPortalRoutes);

// Seed default faculty & sample classroom
async function seedDefaults() {
  try {
    let facultyId = null;
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      const user = await User.create({
        name: 'Dr. Rajesh Sharma',
        email: 'faculty@campus.edu',
        password: 'password123',
        role: 'faculty',
        department: 'Computer Science & Engineering'
      });
      facultyId = user._id;
      console.log('[SEED] Created default faculty account: faculty@campus.edu / password123');
    } else {
      const user = await User.findOne({ email: 'faculty@campus.edu' });
      if (user) facultyId = user._id;
    }

    const roomCount = await Classroom.countDocuments();
    if (roomCount === 0) {
      await Classroom.create({
        roomCode: 'L-302',
        building: 'Main Academic Block (CSE)',
        floor: 3,
        capacity: 80,
        latitude: 22.77618,
        longitude: 86.14325,
        radiusMeters: 40.0
      });
      console.log('[SEED] Created sample classroom: L-302');
    }

    const courseCount = await Course.countDocuments();
    if (courseCount === 0) {
      const coursesToSeed = [
        { courseCode: 'CS401', courseName: 'Operating Systems', department: 'CSE', semester: 4, academicYear: '2026-27' },
        { courseCode: 'CS402', courseName: 'Computer Networks', department: 'CSE', semester: 4, academicYear: '2026-27' },
        { courseCode: 'CS403', courseName: 'DBMS', department: 'CSE', semester: 4, academicYear: '2026-27' },
        { courseCode: 'MA301', courseName: 'Discrete Mathematics', department: 'CSE', semester: 4, academicYear: '2026-27' }
      ];
      
      const createdCourses = await Course.insertMany(coursesToSeed);
      console.log('[SEED] Created sample courses for 2026-27');

      if (facultyId) {
        for (const c of createdCourses) {
          await FacultyAssignment.create({
            facultyId: facultyId,
            courseId: c._id,
            branch: 'CSE',
            academicYear: '2026-27'
          });
        }
      }

      let sujal = await Student.findOne({ rollNumber: '2023UGCS042' });
      if (!sujal) {
         sujal = await Student.create({
             rollNumber: '2023UGCS042',
             name: 'Sujal Bhatu',
             email: '2023ugcs042@nitjsr.ac.in',
             department: 'CSE'
         });
      }
      
      if (sujal) {
        for (const c of createdCourses) {
          await Enrollment.create({
            studentId: sujal._id,
            courseId: c._id,
            branch: 'CSE',
            academicYear: '2026-27'
          });
        }
        console.log('[SEED] Enrolled 2023UGCS042 in courses');
      }
    }
  } catch (err) {
    console.error('[SEED ERROR]', err.message);
  }
}

// Connect to MongoDB & Start Server
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/campustrack';

mongoose
  .connect(MONGO_URI)
  .then(async () => {
    console.log('[INFO] Connected to MongoDB Atlas (campustrack)');
    await seedDefaults();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[READY] CampusTrack Gateway listening on http://0.0.0.0:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[FATAL] MongoDB connection failed:', err.message);
    process.exit(1);
  });
