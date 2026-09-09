import mongoose from 'mongoose';

const AttendanceRecordSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  rollNumber: { type: String, required: true },
  studentName: { type: String, required: true },
  courseCode: { type: String, required: true },
  roomCode: { type: String, required: true },
  status: { type: String, enum: ['PRESENT', 'ABSENT', 'LATE', 'FLAGGED'], default: 'PRESENT' },
  
  verificationMetrics: {
    cosineSimilarity: { type: Number, required: true },
    threshold: { type: Number, default: 0.65 },
    livenessScore: { type: Number, default: 1.0 },
    livenessPassed: { type: Boolean, default: true },
    distanceMeters: { type: Number, default: 0 }
  },

  markedAt: { type: Date, default: Date.now }
});

// CRITICAL: Compound Unique Index enforces zero duplicate attendance under extreme concurrency!
AttendanceRecordSchema.index({ sessionId: 1, studentId: 1 }, { unique: true });
AttendanceRecordSchema.index({ sessionId: 1, markedAt: -1 });

export default mongoose.model('AttendanceRecord', AttendanceRecordSchema);
