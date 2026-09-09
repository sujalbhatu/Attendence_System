import express from 'express';
import multer from 'multer';
import { getStudents, getStudentByRoll, createStudent, enrollFace, deleteStudent } from '../controllers/studentController.js';
import { protect } from '../middleware/auth.js';

const upload = multer({ dest: 'uploads/' });
const router = express.Router();

router.get('/', protect, getStudents);
router.get('/roll/:rollNumber', getStudentByRoll); // Public for mobile lookup
router.post('/', protect, createStudent);
router.post('/:studentId/enroll', protect, upload.array('images', 5), enrollFace);
router.delete('/:id', protect, deleteStudent);

export default router;
