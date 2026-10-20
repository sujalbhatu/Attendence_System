import mongoose from 'mongoose';
import crypto from 'crypto';

const SessionSchema = new mongoose.Schema({
  courseCode: { type: String, required: true, uppercase: true, trim: true },
  courseName: { type: String, required: true, trim: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
  branch: { type: String, default: '' },
  facultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  classroomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', required: true },
  sessionDate: { type: Date, default: Date.now },
  status: { type: String, enum: ['ACTIVE', 'CONCLUDED'], default: 'ACTIVE' },

  // Rotating cryptographic security parameters.
  // select:false — the secret is never returned by any query unless a caller
  // explicitly asks for it with .select('+totpSecret').
  totpSecret: {
    type: String,
    select: false,
    default: () => crypto.randomBytes(32).toString('hex')
  },
  tokenIntervalSeconds: { type: Number, default: 4 }, // 4-second rotating token
  requirePin: { type: Boolean, default: false }, // Optional Line-of-Sight PIN challenge
  requireLiveness: { type: Boolean, default: true }, // Decided by the server, never by the client

  stats: {
    presentCount: { type: Number, default: 0 },
    flaggedCount: { type: Number, default: 0 }
  },

  concludedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

SessionSchema.index({ facultyId: 1, sessionDate: -1 });
SessionSchema.index({ status: 1 });

export default mongoose.model('Session', SessionSchema);
