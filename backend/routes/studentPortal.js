import express from 'express';
import { studentProtect, studentProtectAllowPasswordChange } from '../middleware/studentAuth.js';
import {
  studentLogin,
  changePassword,
  getMyCourses,
  getCourseAttendance
} from '../controllers/studentPortalController.js';
import { rateLimit, byIpAndField } from '../middleware/rateLimit.js';

const router = express.Router();

// Keyed by IP + roll number so one classroom's shared Wi-Fi IP isn't blocked as a whole.
const loginLimiter = rateLimit({ name: 'student-login', windowMs: 15 * 60 * 1000, max: 10, keyFn: byIpAndField('rollNumber') });

router.post('/login', loginLimiter, studentLogin);
router.post('/change-password', studentProtectAllowPasswordChange, changePassword);

router.get('/my-courses', studentProtect, getMyCourses);
router.get('/attendance/:courseId', studentProtect, getCourseAttendance);

export default router;
