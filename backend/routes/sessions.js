import express from 'express';
import { 
  createSession, 
  getSession, 
  getFacultySessions, 
  streamQRFeed, 
  concludeSession, 
  exportSessionCSV,
  togglePinRequirement
} from '../controllers/sessionController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/', protect, createSession);
router.get('/my', protect, getFacultySessions);
router.get('/:id', getSession); // Public for student scan confirmation
router.get('/:id/qr-feed', streamQRFeed); // Public SSE for projector screen
router.put('/:id/conclude', protect, concludeSession);
router.put('/:id/toggle-pin', protect, togglePinRequirement);
router.get('/:id/export-csv', protect, exportSessionCSV);

export default router;
