import mongoose from 'mongoose';

const EnrollmentSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  branch: { type: String, required: true, trim: true },
  academicYear: { type: String, required: true, trim: true },
  status: { type: String, enum: ['active', 'dropped'], default: 'active' },
  enrolledAt: { type: Date, default: Date.now }
});

EnrollmentSchema.index({ courseId: 1, branch: 1, status: 1 });
EnrollmentSchema.index({ studentId: 1, courseId: 1 }, { unique: true });

export default mongoose.model('Enrollment', EnrollmentSchema);
