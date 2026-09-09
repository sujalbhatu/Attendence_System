import express from 'express';
import { protect } from '../middleware/auth.js';
import {
  createCourse,
  getCourses,
  getCourseById,
  enrollStudents,
  getCourseEnrollments,
  getMyAssignments,
  assignFaculty
} from '../controllers/courseController.js';

const router = express.Router();

router.use(protect);

router.get('/my-assignments', getMyAssignments);
router.route('/')
  .post(createCourse)
  .get(getCourses);

router.route('/:id')
  .get(getCourseById);

router.post('/:id/enroll', enrollStudents);
router.get('/:id/enrollments', getCourseEnrollments);
router.post('/:id/assign-faculty', assignFaculty);

export default router;
