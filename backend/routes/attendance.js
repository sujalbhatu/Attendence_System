import express from 'express';
import multer from 'multer';
import { claimAttendance, verifyBiometrics, getLiveRoster } from '../controllers/attendanceController.js';

const upload = multer({ dest: 'uploads/' });
const router = express.Router();

router.post('/claim', claimAttendance); // Phase 1: Rapid Presence Claim
router.post('/verify', upload.array('images', 16), verifyBiometrics); // Phase 2: Biometric Verification
router.get('/live-roster/:sessionId', getLiveRoster); // Teacher live ticker feed

export default router;
