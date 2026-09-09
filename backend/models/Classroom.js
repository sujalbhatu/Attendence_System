import mongoose from 'mongoose';

const ClassroomSchema = new mongoose.Schema({
  roomCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
  building: { type: String, required: true, trim: true },
  floor: { type: Number, default: 1 },
  capacity: { type: Number, default: 70 },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  radiusMeters: { type: Number, default: 35.0 }, // default 35 meters geofence
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Classroom', ClassroomSchema);
