import express from 'express';
import {
  createSession,
  getSession,
  getFacultySessions,
  issueProjectorToken,
  streamQRFeed,
  concludeSession,
  exportSessionCSV,
  togglePinRequirement
} from '../controllers/sessionController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/', protect, createSession);
router.get('/my', protect, getFacultySessions);
router.get('/:id', protect, getSession);
router.post('/:id/projector-token', protect, issueProjectorToken);
router.get('/:id/qr-feed', streamQRFeed); // authenticated by the short-lived projector token (?pt=)
router.put('/:id/conclude', protect, concludeSession);
router.put('/:id/toggle-pin', protect, togglePinRequirement);
router.get('/:id/export-csv', protect, exportSessionCSV);

export default router;
