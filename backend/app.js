import { CORS_ORIGINS, IS_PROD } from './config.js'; // loads .env and fails fast on missing secrets
import express from 'express';
import cors from 'cors';
import { query } from './db/index.js';
import { getRedis } from './lib/redis.js';
import { verifyQueue, batchMode } from './services/verifyQueue.js';
import authRoutes from './routes/auth.js';
import classroomRoutes from './routes/classrooms.js';
import studentRoutes from './routes/students.js';
import sessionRoutes from './routes/sessions.js';
import attendanceRoutes from './routes/attendance.js';
import courseRoutes from './routes/courses.js';
import studentPortalRoutes from './routes/studentPortal.js';

// The Express app without listening, so tests can drive it with supertest.
export function createApp() {
  const app = express();

  // Behind Nginx: trust the first proxy so req.ip is the real client IP (used by rate limits).
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // The React app is served from the same origin as /api (Nginx in production, the Vite
  // proxy in development), so cross-origin access is only granted to listed origins.
  app.use(cors({
    origin: CORS_ORIGINS.length ? CORS_ORIGINS : false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
  app.use(express.json({ limit: '100kb' }));

  // Basic security headers (Nginx can add more, e.g. HSTS).
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  // Request logging in dev (query strings are dropped so tokens never reach logs)
  app.use((req, res, next) => {
    if (!IS_PROD && process.env.NODE_ENV !== 'test' && req.method !== 'OPTIONS') {
      console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
    }
    next();
  });

  // Health check
  app.get('/health', async (req, res) => {
    let database = 'connected';
    try {
      await query('SELECT 1');
    } catch {
      database = 'disconnected';
    }
    // Redis is optional: "off" when not configured, never a reason to fail health
    let redis = 'off';
    const r = getRedis();
    if (r) {
      try {
        await r.ping();
        redis = 'connected';
      } catch {
        redis = 'unreachable';
      }
    }
    res.status(database === 'connected' ? 200 : 503).json({
      status: database === 'connected' ? 'ok' : 'degraded',
      service: 'CampusTrack Gateway',
      timestamp: new Date(),
      database,
      redis,
      faceQueue: { batchMode, ...verifyQueue.summary() }
    });
  });

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/classrooms', classroomRoutes);
  app.use('/api/students', studentRoutes);
  app.use('/api/sessions', sessionRoutes);
  app.use('/api/attendance', attendanceRoutes);
  app.use('/api/courses', courseRoutes);
  app.use('/api/student-portal', studentPortalRoutes);

  return app;
}
