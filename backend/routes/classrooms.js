import express from 'express';
import { getClassrooms, createClassroom, updateClassroom, deleteClassroom } from '../controllers/classroomController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.get('/', protect, getClassrooms);
router.post('/', protect, createClassroom);
router.put('/:id', protect, updateClassroom);
router.delete('/:id', protect, deleteClassroom);

export default router;
