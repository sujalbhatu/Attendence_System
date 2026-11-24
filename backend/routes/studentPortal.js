import express from 'express';
import multer from 'multer';
import { studentProtect, studentProtectAllowPasswordChange } from '../middleware/studentAuth.js';
import {
  studentLogin,
  changePassword,
  getMyCourses,
  getCourseAttendance,
  getMe,
  registerOwnFace
} from '../controllers/studentPortalController.js';
import { rateLimit, byIpAndField } from '../middleware/rateLimit.js';

const router = express.Router();

// Keyed by IP + roll number so one classroom's shared Wi-Fi IP isn't blocked as a whole.
const loginLimiter = rateLimit({ name: 'student-login', windowMs: 15 * 60 * 1000, max: 10, keyFn: byIpAndField('rollNumber') });

router.post('/login', loginLimiter, studentLogin);
router.post('/change-password', studentProtectAllowPasswordChange, changePassword);

// Phone face registration: 3 small JPEGs, once per student
const faceUpload = multer({
  dest: 'uploads/',
  limits: { fileSize: 1024 * 1024, files: 5, fieldSize: 100 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype))
});
const faceLimiter = rateLimit({ name: 'student-face-register', windowMs: 15 * 60 * 1000, max: 10, keyFn: (req) => req.student?.id || req.ip });

router.get('/me', studentProtect, getMe);
router.post('/register-face', studentProtect, faceLimiter, faceUpload.array('images', 5), registerOwnFace);
router.get('/my-courses', studentProtect, getMyCourses);
router.get('/attendance/:courseId', studentProtect, getCourseAttendance);

export default router;
