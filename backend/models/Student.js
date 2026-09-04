import mongoose from 'mongoose';

const studentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  rollNumber: {
    type: String,
    required: true,
    unique: true
  },
  section: {
    type: String,
    required: true
  },
  embedding: {
    type: Buffer
  },
  photoCount: {
    type: Number,
    default: 0
  },
  enrolledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

const Student = mongoose.model('Student', studentSchema);
export default Student;
