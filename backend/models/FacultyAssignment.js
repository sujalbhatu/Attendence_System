import mongoose from 'mongoose';

const FacultyAssignmentSchema = new mongoose.Schema({
  facultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  branch: { type: String, required: true, trim: true },
  academicYear: { type: String, required: true, trim: true },
  assignedAt: { type: Date, default: Date.now }
});

FacultyAssignmentSchema.index({ facultyId: 1, courseId: 1, branch: 1, academicYear: 1 }, { unique: true });

export default mongoose.model('FacultyAssignment', FacultyAssignmentSchema);
