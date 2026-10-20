import { CORS_ORIGINS, IS_PROD, SEED_DEMO } from './config.js'; // loads .env and fails fast on missing secrets
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
import crypto from 'crypto';
import User from './models/User.js';
import Classroom from './models/Classroom.js';
import Course from './models/Course.js';
import FacultyAssignment from './models/FacultyAssignment.js';
import Enrollment from './models/Enrollment.js';
import Student from './models/Student.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Behind Nginx: trust the first proxy so req.ip is the real client IP (used by rate limits).
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Middlewares
// The React app is served from the same origin as /api (Nginx in production, the Vite
// proxy in development), so cross-origin access is only granted to listed origins.
app.use(cors({
  origin: CORS_ORIGINS.length ? CORS_ORIGINS : false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '100kb' }));

// Basic security headers (Nginx can add more, e.g. HSTS).
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

// Request logging in dev (query strings are dropped so tokens never reach logs)
app.use((req, res, next) => {
  if (!IS_PROD && req.method !== 'OPTIONS') {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
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

// Seed demo faculty, classroom and courses — development only, and only with SEED_DEMO=true.
// The demo password comes from SEED_FACULTY_PASSWORD or is generated and printed once.
async function seedDefaults() {
  try {
    let facultyId = null;
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      const seedPassword = process.env.SEED_FACULTY_PASSWORD || crypto.randomBytes(9).toString('base64url');
      const user = await User.create({
        name: 'Dr. Rajesh Sharma',
        email: 'faculty@campus.edu',
        password: seedPassword,
        role: 'faculty',
        department: 'Computer Science & Engineering'
      });
      facultyId = user._id;
      console.log(`[SEED] Created demo faculty account: faculty@campus.edu / ${seedPassword}`);
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
    if (SEED_DEMO) await seedDefaults();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[READY] CampusTrack Gateway listening on http://0.0.0.0:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[FATAL] MongoDB connection failed:', err.message);
    process.exit(1);
  });
