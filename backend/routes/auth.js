import express from 'express';
import { register, login, getMe } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { rateLimit, byIp, byIpAndField } from '../middleware/rateLimit.js';

const router = express.Router();

const loginLimiter = rateLimit({ name: 'faculty-login', windowMs: 15 * 60 * 1000, max: 10, keyFn: byIpAndField('email') });
const registerLimiter = rateLimit({ name: 'faculty-register', windowMs: 60 * 60 * 1000, max: 5, keyFn: byIp });

router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.get('/me', protect, getMe);

export default router;
