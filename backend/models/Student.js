import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const StudentSchema = new mongoose.Schema({
  rollNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  // select:false — password hashes and face templates are never returned by a
  // query (or a populate) unless the caller asks with .select('+field').
  password: { type: String, default: null, select: false },
  mustChangePassword: { type: Boolean, default: false },
  email: { type: String, lowercase: true, trim: true },
  department: { type: String, default: 'Computer Science & Engineering' },
  batch: { type: String, default: '2023-2027' },
  section: { type: String, default: 'A' },
  faceEmbedding: {
    type: [Number], // 512-dimensional FaceNet vector
    default: null,
    select: false
  },
  photoUrl: { type: String, default: null },
  isEnrolled: { type: Boolean, default: false },
  enrolledAt: { type: Date, default: null },
  enrollmentSource: { type: String, enum: ['FACULTY', 'SELF_SCAN', null], default: null },
  embeddingVersion: { type: Number, default: 1 },
  embeddingUpdatedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

StudentSchema.index({ department: 1, batch: 1 });

StudentSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Requires the document to have been loaded with .select('+password').
StudentSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password || !candidatePassword) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model('Student', StudentSchema);
