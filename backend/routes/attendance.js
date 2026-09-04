import express from 'express';
import multer from 'multer';
import fs from 'fs';
import { Blob } from 'buffer';
import Student from '../models/Student.js';
import Attendance from '../models/Attendance.js';
import Session from '../models/Session.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.use(authMiddleware);

// POST /recognize
router.post('/recognize', upload.fields([
  { name: 'image', maxCount: 1 }, 
  { name: 'image2', maxCount: 1 },
  { name: 'images', maxCount: 10 }
]), async (req, res) => {
  const imageFile = req.files && req.files['image'] ? req.files['image'][0] : null;
  const image2File = req.files && req.files['image2'] ? req.files['image2'][0] : null;
  const burstFiles = req.files && req.files['images'] ? req.files['images'] : [];

  try {
    if (!imageFile && burstFiles.length === 0) {
      return res.status(400).json({ success: false, error: 'Image file(s) required' });
    }

    const students = await Student.find({ embedding: { $exists: true } });
    
    const gallery = students.map(student => ({
      id: student._id.toString(),
      name: student.name,
      embedding: student.embedding.toString('base64')
    }));

    const formData = new FormData();
    formData.append('gallery', JSON.stringify(gallery));
    if (req.body.threshold) {
      formData.append('threshold', req.body.threshold);
    }
    if (req.body.liveness) {
      formData.append('liveness', req.body.liveness);
    }
    if (req.body.mode) {
      formData.append('mode', req.body.mode);
    }

    // Append burst frames if present
    if (burstFiles.length > 0) {
      burstFiles.forEach(bf => {
        const bdata = fs.readFileSync(bf.path);
        const bb = new Blob([bdata], { type: bf.mimetype });
        formData.append('images', bb, bf.originalname);
      });
    } else if (imageFile) {
      const fileData = fs.readFileSync(imageFile.path);
      const blob = new Blob([fileData], { type: imageFile.mimetype });
      formData.append('image', blob, imageFile.originalname);

      if (image2File) {
        const file2Data = fs.readFileSync(image2File.path);
        const blob2 = new Blob([file2Data], { type: image2File.mimetype });
        formData.append('image2', blob2, image2File.originalname);
      }
    }

    const response = await fetch('http://localhost:5001/recognize', {
      method: 'POST',
      body: formData
    });

    const mlResult = await response.json();

    if (!mlResult.success) {
      return res.status(400).json({ success: false, error: mlResult.error || 'ML recognition failed' });
    }

    if (mlResult.spoof_detected) {
      return res.json({
        success: true,
        matched: false,
        spoof_detected: true,
        message: `⚠️ Spoof Rejected: ${mlResult.reason || 'Screen or static photo detected'}`,
        confidence: 0.0
      });
    }

    if (mlResult.matched) {
      const studentId = mlResult.studentId || mlResult.student_id;
      const studentName = mlResult.studentName || mlResult.student_name;
      const confidence = mlResult.confidence;
      
      const studentDoc = await Student.findById(studentId);
      const rollNumber = studentDoc ? studentDoc.rollNumber : '';
      
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0];
      const timeStr = today.toTimeString().split(' ')[0];

      try {
        const attendance = new Attendance({
          studentId,
          date: dateStr,
          time: timeStr,
          confidence
        });
        await attendance.save();
        
        return res.json({ 
          success: true, 
          matched: true, 
          studentId, 
          studentName, 
          rollNumber,
          confidence,
          message: 'Attendance recorded'
        });
      } catch (err) {
        if (err.code === 11000) {
          return res.json({ 
            success: true, 
            matched: true, 
            studentId, 
            studentName, 
            rollNumber,
            confidence,
            message: 'Attendance already recorded for today'
          });
        }
        throw err;
      }
    }

    res.json({ 
      success: true, 
      matched: false, 
      confidence: mlResult.confidence || 0,
      candidate: mlResult.studentName || mlResult.student_name || null,
      message: 'No matching student found' 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (imageFile && imageFile.path) {
      try { fs.unlinkSync(imageFile.path); } catch (e) {}
    }
    if (image2File && image2File.path) {
      try { fs.unlinkSync(image2File.path); } catch (e) {}
    }
    burstFiles.forEach(bf => {
      try { fs.unlinkSync(bf.path); } catch (e) {}
    });
  }
});

// POST /session/start
router.post('/session/start', async (req, res) => {
  try {
    const { section } = req.body;
    if (!section) {
      return res.status(400).json({ success: false, error: 'Section is required' });
    }

    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    
    const totalStudents = await Student.countDocuments({ section });

    const session = new Session({
      teacherId: req.user._id,
      section,
      date: dateStr,
      totalStudents
    });

    await session.save();
    res.status(201).json({ success: true, data: session });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /session/:id/end
router.post('/session/:id/end', async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    if (session.status === 'completed') {
      return res.status(400).json({ success: false, error: 'Session already completed' });
    }

    const students = await Student.find({ section: session.section }).select('_id');
    const studentIds = students.map(s => s._id);

    const presentCount = await Attendance.countDocuments({
      studentId: { $in: studentIds },
      date: session.date
    });

    session.endTime = new Date();
    session.presentCount = presentCount;
    session.status = 'completed';

    await session.save();
    res.json({ success: true, data: session });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /today/:section
router.get('/today/:section', async (req, res) => {
  try {
    const section = req.params.section;
    const today = new Date().toISOString().split('T')[0];

    const students = await Student.find({ section }).select('_id name rollNumber');
    const studentIds = students.map(s => s._id);

    const attendances = await Attendance.find({
      date: today,
      studentId: { $in: studentIds }
    }).populate('studentId', 'name rollNumber section');

    res.json({ success: true, data: attendances });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /history
router.get('/history', async (req, res) => {
  try {
    const { startDate, endDate, section } = req.query;
    
    let query = {};
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = startDate;
      if (endDate) query.date.$lte = endDate;
    }

    let attendances = await Attendance.find(query).populate('studentId', 'name rollNumber section');

    if (section) {
      attendances = attendances.filter(record => 
        record.studentId && record.studentId.section === section
      );
    }

    res.json({ success: true, data: attendances });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
