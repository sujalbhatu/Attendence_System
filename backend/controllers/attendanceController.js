import crypto from 'crypto';
import Session from '../models/Session.js';
import Classroom from '../models/Classroom.js';
import Student from '../models/Student.js';
import Claim from '../models/Claim.js';
import AttendanceRecord from '../models/AttendanceRecord.js';
import { TokenService } from '../services/tokenService.js';
import { GeofenceService } from '../services/geofenceService.js';
import { StaggerService } from '../services/staggerService.js';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

const getMLUrl = () => process.env.ML_SERVICE_URL || 'http://127.0.0.1:5005';

/**
 * Phase 1: Rapid Presence Claim (< 2ms gatekeeper)
 */
export const claimAttendance = async (req, res) => {
  try {
    const { sessionId, rollNumber, scannedToken, candidatePin, clientGps } = req.body;

    if (!sessionId || !rollNumber || !scannedToken) {
      return res.status(400).json({ error: 'Missing required parameters (sessionId, rollNumber, scannedToken)' });
    }

    // 1. Verify Active Session
    const session = await Session.findById(sessionId).populate('classroomId');
    if (!session || session.status !== 'ACTIVE') {
      return res.status(400).json({ code: 'SESSION_INACTIVE', error: 'Lecture session is not currently active' });
    }

    // 2. Cryptographic Rotating Token Verification
    const tokenCheck = TokenService.verifyToken(
      session.totpSecret,
      session._id.toString(),
      scannedToken,
      candidatePin,
      session.tokenIntervalSeconds || 4,
      session.requirePin === true
    );

    if (!tokenCheck.valid) {
      let errorMsg = 'Scanned QR code expired (> 4.5s old). Please scan the live projected code.';
      if (tokenCheck.reason === 'PIN_MISMATCH') {
        errorMsg = 'Line-of-Sight PIN mismatch. Look at the teacher projector screen and tap the current PIN.';
      } else if (tokenCheck.reason === 'PIN_REQUIRED') {
        errorMsg = 'Line-of-Sight PIN is required. Look at the projector screen and tap the PIN.';
      }

      return res.status(400).json({
        code: tokenCheck.reason || 'TOKEN_EXPIRED',
        error: errorMsg
      });
    }

    // 3. Geofence Verification (if classroom has coordinates)
    const classroom = session.classroomId;
    let geoResult = { valid: true, effectiveDistance: 0 };
    if (classroom.latitude && classroom.longitude) {
      if (!clientGps || !clientGps.latitude || !clientGps.longitude) {
        return res.status(403).json({
          code: 'GPS_REQUIRED',
          error: 'Classroom requires GPS location. Please allow location permissions in your browser.'
        });
      }

      geoResult = GeofenceService.validateGeofence(
        clientGps.latitude,
        clientGps.longitude,
        clientGps.accuracyMeters,
        classroom.latitude,
        classroom.longitude,
        classroom.radiusMeters || 35.0
      );

      if (!geoResult.valid) {
        return res.status(403).json({
          code: 'GEOFENCE_VIOLATION',
          error: `Location outside classroom bounds. You are ~${geoResult.effectiveDistance}m away (max radius: ${geoResult.maxRadius}m).`
        });
      }
    }

    // 4. Student Lookup & Duplicate Check
    const cleanRoll = rollNumber.trim().toUpperCase();
    const student = await Student.findOne({ rollNumber: cleanRoll });
    if (!student) {
      return res.status(404).json({ code: 'STUDENT_NOT_FOUND', error: `No student enrolled with roll number ${cleanRoll}` });
    }

    const alreadyMarked = await AttendanceRecord.findOne({ sessionId: session._id, studentId: student._id });
    if (alreadyMarked) {
      return res.status(409).json({
        code: 'ALREADY_MARKED',
        error: `Attendance already marked as PRESENT for ${cleanRoll}`,
        record: alreadyMarked
      });
    }

    // 5. Check or Create Ephemeral Claim Ticket
    let claim = await Claim.findOne({ sessionId: session._id, studentId: student._id });
    if (!claim) {
      const claimTicket = `tkt_${crypto.randomBytes(8).toString('hex')}`;
      const assignedDelayMs = StaggerService.assignUploadDelay(session._id);

      claim = await Claim.create({
        claimTicket,
        sessionId: session._id,
        studentId: student._id,
        rollNumber: cleanRoll,
        clientGps: {
          latitude: clientGps?.latitude,
          longitude: clientGps?.longitude,
          accuracyMeters: clientGps?.accuracyMeters
        },
        assignedDelayMs
      });
    }

    res.status(200).json({
      status: 'CLAIM_ACCEPTED',
      claimTicket: claim.claimTicket,
      assignedDelayMs: claim.assignedDelayMs,
      expiresInSeconds: 60,
      student: {
        id: student._id,
        rollNumber: student.rollNumber,
        name: student.name,
        isEnrolled: student.isEnrolled
      },
      classroom: {
        roomCode: classroom.roomCode,
        building: classroom.building
      }
    });

  } catch (err) {
    res.status(500).json({ error: `Claim failed: ${err.message}` });
  }
};

/**
 * Phase 2: Decoupled Biometric Verification (FaceNet + Active Blink)
 */
export const verifyBiometrics = async (req, res) => {
  try {
    const { claimTicket, requireLiveness } = req.body;
    if (!claimTicket) {
      return res.status(400).json({ error: 'claimTicket is required' });
    }

    const claim = await Claim.findOne({ claimTicket });
    if (!claim) {
      return res.status(400).json({
        code: 'CLAIM_EXPIRED',
        error: 'Attendance claim ticket expired or invalid. Please scan the QR code again.'
      });
    }

    const session = await Session.findById(claim.sessionId).populate('classroomId');
    const student = await Student.findById(claim.studentId);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No face images uploaded' });
    }

    const mlUrl = getMLUrl();

    // Forward face burst images to ML Service
    const form = new FormData();
    for (const f of req.files) {
      form.append('images', fs.createReadStream(f.path));
    }
    if (student.faceEmbedding && student.faceEmbedding.length > 0) {
      form.append('enrolled_embedding', JSON.stringify(student.faceEmbedding));
    }
    form.append('threshold', '0.65');
    form.append('require_liveness', requireLiveness === 'false' ? 'false' : 'true');

    const mlRes = await axios.post(`${mlUrl}/verify`, form, {
      headers: form.getHeaders(),
      timeout: 15000
    });

    // Cleanup temp images
    req.files.forEach((f) => fs.unlink(f.path, () => {}));

    const { matched, similarity, liveness, embedding: probeEmbedding, error: mlError } = mlRes.data;

    // Check liveness validation first
    if (liveness && liveness.is_live === false) {
      return res.status(400).json({
        code: 'SPOOF_DETECTED',
        error: mlError || `Liveness verification failed: ${liveness.reason || 'No natural blink detected'}`,
        liveness
      });
    }

    // Auto-enroll new student on first successful live scan
    if (!student.faceEmbedding || student.faceEmbedding.length === 0) {
      if (probeEmbedding && probeEmbedding.length > 0) {
        student.faceEmbedding = probeEmbedding;
        student.isEnrolled = true;
        student.enrolledAt = new Date();
        await student.save();
        console.log(`[AUTO-ENROLL] Registered initial 512-d FaceNet embedding for ${student.rollNumber}`);
      } else {
        return res.status(400).json({
          code: 'NO_FACE_DETECTED',
          error: 'Could not detect face in camera frame. Center your face in good lighting and try again.'
        });
      }
    } else {
      // Enrolled student matching verification
      if (!matched) {
        return res.status(400).json({
          code: 'BIOMETRIC_MISMATCH',
          error: mlError || `Face verification failed. Similarity (${similarity}) below threshold (0.65).`,
          similarity,
          liveness
        });
      }
    }

    // Adaptive Rolling Centroid — evolve stored embedding toward verified probe
    // Updates on genuine matches (>= 0.75) to naturally absorb mobile lens and lighting differences
    const CENTROID_CONFIDENCE_THRESHOLD = 0.75;
    const BLEND_ALPHA = 0.05; // 5% new face, 95% stored template
    if (
      student.faceEmbedding &&
      student.faceEmbedding.length > 0 &&
      probeEmbedding &&
      probeEmbedding.length === student.faceEmbedding.length &&
      typeof similarity === 'number' &&
      similarity >= CENTROID_CONFIDENCE_THRESHOLD
    ) {
      try {
        // Exponential moving average: e_new = (1 - α) * e_old + α * e_probe
        const blended = student.faceEmbedding.map(
          (val, i) => (1 - BLEND_ALPHA) * val + BLEND_ALPHA * probeEmbedding[i]
        );

        // L2-normalize to keep vector on the unit hypersphere
        const norm = Math.sqrt(blended.reduce((sum, v) => sum + v * v, 0));
        const normalized = norm > 0 ? blended.map((v) => v / norm) : blended;

        student.faceEmbedding = normalized;
        student.embeddingVersion = (student.embeddingVersion || 1) + 1;
        student.embeddingUpdatedAt = new Date();
        await student.save();

        console.log(
          `[ADAPTIVE-CENTROID] Updated embedding for ${student.rollNumber} ` +
            `(v${student.embeddingVersion}, similarity: ${similarity.toFixed(4)})`
        );
      } catch (centroidErr) {
        // Non-fatal: log but don't block attendance
        console.error(`[ADAPTIVE-CENTROID] Failed for ${student.rollNumber}:`, centroidErr.message);
      }
    }

    // Atomic Commit to Permanent Ledger
    try {
      const record = await AttendanceRecord.create({
        sessionId: session._id,
        studentId: student._id,
        rollNumber: student.rollNumber,
        studentName: student.name,
        courseCode: session.courseCode,
        roomCode: session.classroomId.roomCode,
        status: 'PRESENT',
        verificationMetrics: {
          cosineSimilarity: similarity || 1.0,
          threshold: 0.65,
          livenessScore: liveness?.score || 1.0,
          livenessPassed: liveness?.is_live !== false
        }
      });

      // Increment session present counter
      await Session.findByIdAndUpdate(session._id, { $inc: { 'stats.presentCount': 1 } });
      // Delete temporary claim
      await Claim.findByIdAndDelete(claim._id);

      return res.status(200).json({
        status: 'PRESENT',
        message: 'Attendance recorded successfully',
        student: {
          rollNumber: student.rollNumber,
          name: student.name
        },
        metrics: {
          similarity: similarity || 1.0,
          markedAt: record.markedAt
        }
      });

    } catch (dbErr) {
      if (dbErr.code === 11000) {
        // Idempotency: Duplicate key caught by MongoDB compound index
        return res.status(200).json({
          status: 'PRESENT',
          message: 'Attendance already recorded for this session'
        });
      }
      throw dbErr;
    }

  } catch (err) {
    console.error('[VERIFY ERROR]', err.response?.data || err.message);
    if (req.files) {
      req.files.forEach((f) => fs.unlink(f.path, () => {}));
    }
    const errMsg = err.response?.data?.error || err.message;
    res.status(500).json({ error: `Verification failed: ${errMsg}` });
  }
};

/**
 * Real-time Roster Feed for Teacher's Screen
 */
export const getLiveRoster = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Check session to see if courseId exists
    const session = await Session.findById(sessionId);
    
    let enrolledCount = 0;
    if (session && session.courseId) {
       const { default: Enrollment } = await import('../models/Enrollment.js');
       enrolledCount = await Enrollment.countDocuments({ courseId: session.courseId, status: 'active' });
    }
    
    const records = await AttendanceRecord.find({ sessionId })
      .sort({ markedAt: -1 })
      .select('rollNumber studentName status verificationMetrics markedAt');

    res.json({
      count: records.length,
      enrolledCount,
      roster: records
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
