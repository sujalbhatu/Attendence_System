import mongoose from 'mongoose';

const ClaimSchema = new mongoose.Schema({
  claimTicket: { type: String, required: true, unique: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  rollNumber: { type: String, required: true },
  clientGps: {
    latitude: { type: Number },
    longitude: { type: Number },
    accuracyMeters: { type: Number }
  },
  tokenStep: { type: Number }, // rotation window the scanned token belonged to
  assignedDelayMs: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['AWAITING_PIN', 'AWAITING_BIOMETRICS', 'VERIFIED', 'EXPIRED'],
    default: 'AWAITING_BIOMETRICS'
  },
  pinDeadline: { type: Date, default: null },
  pinAttempts: { type: Number, default: 0 },
  claimedAt: { type: Date, default: Date.now },
  expireAt: { type: Date, default: () => new Date(Date.now() + 60 * 1000) } // 60s TTL
});

// MongoDB TTL index deletes expired claims. The TTL monitor only runs every ~60 s,
// so controllers also check expireAt explicitly instead of trusting deletion timing.
ClaimSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });
ClaimSchema.index({ sessionId: 1, studentId: 1 });

export default mongoose.model('Claim', ClaimSchema);
