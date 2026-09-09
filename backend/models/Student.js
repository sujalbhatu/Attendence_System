import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const StudentSchema = new mongoose.Schema({
  rollNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  password: { type: String, default: null },
  email: { type: String, lowercase: true, trim: true },
  department: { type: String, default: 'Computer Science & Engineering' },
  batch: { type: String, default: '2023-2027' },
  section: { type: String, default: 'A' },
  faceEmbedding: {
    type: [Number], // 512-dimensional FaceNet vector
    default: null
  },
  photoUrl: { type: String, default: null },
  isEnrolled: { type: Boolean, default: false },
  enrolledAt: { type: Date, default: null },
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

StudentSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model('Student', StudentSchema);
