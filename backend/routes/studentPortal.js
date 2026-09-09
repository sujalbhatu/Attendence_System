import express from 'express';
import { studentProtect } from '../middleware/studentAuth.js';
import {
  studentLogin,
  getMyCourses,
  getCourseAttendance
} from '../controllers/studentPortalController.js';

const router = express.Router();

router.post('/login', studentLogin);

router.use(studentProtect);
router.get('/my-courses', getMyCourses);
router.get('/attendance/:courseId', getCourseAttendance);

export default router;
