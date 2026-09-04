import express from 'express';
import multer from 'multer';
import fs from 'fs';
import { Blob } from 'buffer';
import Student from '../models/Student.js';
import Attendance from '../models/Attendance.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.use(authMiddleware);

// GET / - List all students
router.get('/', async (req, res) => {
  try {
    const { section, search } = req.query;
    let query = {};
    
    if (section) {
      query.section = section;
    }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { rollNumber: { $regex: search, $options: 'i' } }
      ];
    }
    
    const students = await Student.find(query).select('-embedding');
    res.json({ success: true, data: students });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:id - Get single student
router.get('/:id', async (req, res) => {
  try {
    const student = await Student.findById(req.params.id).select('-embedding');
    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }
    res.json({ success: true, data: student });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /enroll - Multipart upload to enroll student
router.post('/enroll', upload.array('images', 10), async (req, res) => {
  try {
    const { name, rollNumber, section } = req.body;
    const files = req.files;

    if (!name || !rollNumber || !section) {
      return res.status(400).json({ success: false, error: 'Name, rollNumber, and section are required' });
    }

    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one image is required' });
    }

    const formData = new FormData();
    formData.append('userId', req.user._id.toString());

    files.forEach((file) => {
      const fileData = fs.readFileSync(file.path);
      const blob = new Blob([fileData], { type: file.mimetype });
      formData.append('images', blob, file.originalname);
    });

    const response = await fetch('http://localhost:5001/enroll', {
      method: 'POST',
      body: formData
    });

    const mlResult = await response.json();

    if (!mlResult.success) {
      return res.status(400).json({ success: false, error: 'ML enrollment failed' });
    }

    const embeddingBuffer = Buffer.from(mlResult.embedding, 'base64');

    const newStudent = new Student({
      name,
      rollNumber,
      section,
      embedding: embeddingBuffer,
      photoCount: files.length,
      enrolledBy: req.user._id
    });

    await newStudent.save();

    // Clean up
    files.forEach(file => {
      try { fs.unlinkSync(file.path); } catch (e) {}
    });

    const studentResponse = newStudent.toObject();
    delete studentResponse.embedding;

    res.status(201).json({ success: true, data: studentResponse });
  } catch (error) {
    // Clean up on error
    if (req.files) {
      req.files.forEach(file => {
        try { fs.unlinkSync(file.path); } catch (e) {}
      });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /:id - Update student
router.put('/:id', async (req, res) => {
  try {
    const { name, section, rollNumber } = req.body;
    
    const updatedStudent = await Student.findByIdAndUpdate(
      req.params.id,
      { $set: { name, section, rollNumber } },
      { new: true, runValidators: true }
    ).select('-embedding');

    if (!updatedStudent) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    res.json({ success: true, data: updatedStudent });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /:id - Delete student and their attendance
router.delete('/:id', async (req, res) => {
  try {
    const studentId = req.params.id;
    const deletedStudent = await Student.findByIdAndDelete(studentId);
    
    if (!deletedStudent) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    await Attendance.deleteMany({ studentId });

    res.json({ success: true, message: 'Student and related attendance records deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
