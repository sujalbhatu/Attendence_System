import express from 'express';
import multer from 'multer';
import { getStudents, getStudentByRoll, createStudent, enrollFace, resetStudentPassword, deleteStudent } from '../controllers/studentController.js';
import { protect, requireRole } from '../middleware/auth.js';

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 2 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype))
});
const router = express.Router();

router.get('/', protect, getStudents);
router.get('/roll/:rollNumber', protect, getStudentByRoll);
router.post('/', protect, createStudent);
router.post('/:studentId/enroll', protect, upload.array('images', 5), enrollFace); // faculty-supervised enrollment
router.post('/:studentId/reset-password', protect, resetStudentPassword);
router.delete('/:id', protect, requireRole('admin', 'faculty'), deleteStudent);

export default router;
