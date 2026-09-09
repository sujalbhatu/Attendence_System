import mongoose from 'mongoose';

const CourseSchema = new mongoose.Schema({
  courseCode: { type: String, required: true, uppercase: true, trim: true },
  courseName: { type: String, required: true, trim: true },
  credits: { type: Number, default: 4 },
  department: { type: String, required: true, trim: true },
  semester: { type: Number, required: true, min: 1, max: 8 },
  academicYear: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now }
});

CourseSchema.index({ courseCode: 1, academicYear: 1 }, { unique: true });

export default mongoose.model('Course', CourseSchema);
