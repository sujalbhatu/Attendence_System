import express from 'express';
import multer from 'multer';
import { claimAttendance, submitPin, verifyBiometrics, getLiveRoster } from '../controllers/attendanceController.js';
import { protect } from '../middleware/auth.js';
import { studentProtect } from '../middleware/studentAuth.js';
import { rateLimit, byStudent } from '../middleware/rateLimit.js';

// Face bursts are small JPEGs (~15 KB each); cap size and type so the route can't be used to fill the disk.
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 1024 * 1024, files: 16 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype))
});

// Keyed by student account, not IP: a whole class shares one campus Wi-Fi IP.
const studentLimiter = rateLimit({ name: 'student-attendance', windowMs: 60 * 1000, max: 20, keyFn: byStudent });

const router = express.Router();

router.post('/claim', studentProtect, studentLimiter, claimAttendance); // Phase 1: presence claim (token checked at scan time)
router.post('/claim/pin', studentProtect, studentLimiter, submitPin); // Phase 1b: Line-of-Sight PIN
router.post('/verify', studentProtect, studentLimiter, upload.array('images', 16), verifyBiometrics); // Phase 2: face + liveness
router.get('/live-roster/:sessionId', protect, getLiveRoster); // Faculty projector feed

export default router;
