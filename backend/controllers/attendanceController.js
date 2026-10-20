import crypto from 'crypto';
import mongoose from 'mongoose';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import Session from '../models/Session.js';
import Student from '../models/Student.js';
import Claim from '../models/Claim.js';
import AttendanceRecord from '../models/AttendanceRecord.js';
import { TokenService } from '../services/tokenService.js';
import { GeofenceService } from '../services/geofenceService.js';
import { StaggerService } from '../services/staggerService.js';
import {
  TOKEN_GRACE_MS,
  PIN_GRACE_MS,
  PIN_WINDOW_MS,
  MAX_PIN_ATTEMPTS,
  CLAIM_TTL_MS,
  ALLOW_SELF_ENROLLMENT,
  ML_SERVICE_URL
} from '../config.js';

const MATCH_THRESHOLD = 0.65;

const newClaimTicket = () => `tkt_${crypto.randomBytes(12).toString('hex')}`;

const isExpired = (claim, now = Date.now()) => !claim.expireAt || claim.expireAt.getTime() <= now;

const acceptedResponse = (claim, student, classroom) => ({
  status: 'CLAIM_ACCEPTED',
  claimTicket: claim.claimTicket,
  assignedDelayMs: claim.assignedDelayMs,
  expiresInSeconds: Math.max(0, Math.round((claim.expireAt.getTime() - Date.now()) / 1000)),
  student: {
    id: student._id,
    rollNumber: student.rollNumber,
    name: student.name,
    isEnrolled: student.isEnrolled
  },
  classroom: classroom ? { roomCode: classroom.roomCode, building: classroom.building } : null
});

// Moves a claim into the biometric phase and gives it a staggered upload slot.
const promoteToBiometrics = async (claim, sessionId) => {
  claim.status = 'AWAITING_BIOMETRICS';
  claim.assignedDelayMs = StaggerService.assignUploadDelay(sessionId);
  claim.expireAt = new Date(Date.now() + CLAIM_TTL_MS);
  await claim.save();
  return claim;
};

/**
 * Phase 1: presence claim.
 * The student is identified by their login token (never by a typed roll number).
 * The scanned QR token is checked against its own 4 s window here, at scan time.
 * If the session needs the Line-of-Sight PIN, that is a separate step (submitPin),
 * so the PIN tap no longer has to fit inside the token window.
 */
export const claimAttendance = async (req, res) => {
  try {
    const { sessionId, scannedToken, clientGps } = req.body;
    const student = req.student;

    if (!sessionId || !scannedToken) {
      return res.status(400).json({ error: 'Missing required parameters (sessionId, scannedToken)' });
    }
    if (!mongoose.isValidObjectId(sessionId)) {
      return res.status(400).json({ code: 'INVALID_QR', error: 'This QR code is not a valid RollOne session code.' });
    }

    const session = await Session.findById(sessionId).select('+totpSecret').populate('classroomId');
    if (!session || session.status !== 'ACTIVE') {
      return res.status(400).json({ code: 'SESSION_INACTIVE', error: 'Lecture session is not currently active' });
    }

    const tokenCheck = TokenService.verifyToken(session.totpSecret, session._id.toString(), scannedToken, {
      intervalSeconds: session.tokenIntervalSeconds || 4,
      graceMs: TOKEN_GRACE_MS
    });
    if (!tokenCheck.valid) {
      return res.status(400).json({
        code: tokenCheck.reason,
        error: 'This QR code has expired. Scan the code currently on the projector.'
      });
    }

    // Geofence (only when the classroom has coordinates)
    const classroom = session.classroomId;
    if (classroom?.latitude && classroom?.longitude) {
      if (!clientGps?.latitude || !clientGps?.longitude) {
        return res.status(403).json({
          code: 'GPS_REQUIRED',
          error: 'Classroom requires GPS location. Please allow location permissions in your browser.'
        });
      }
      const geo = GeofenceService.validateGeofence(
        clientGps.latitude,
        clientGps.longitude,
        clientGps.accuracyMeters,
        classroom.latitude,
        classroom.longitude,
        classroom.radiusMeters || 35.0
      );
      if (!geo.valid) {
        return res.status(403).json({
          code: 'GEOFENCE_VIOLATION',
          error: `Location outside classroom bounds. You are ~${geo.effectiveDistance}m away (max radius: ${geo.maxRadius}m).`
        });
      }
    }

    const alreadyMarked = await AttendanceRecord.exists({ sessionId: session._id, studentId: student._id });
    if (alreadyMarked) {
      return res.status(409).json({ code: 'ALREADY_MARKED', error: `Attendance already marked for ${student.rollNumber}` });
    }

    const now = Date.now();
    let claim = await Claim.findOne({ sessionId: session._id, studentId: student._id });
    if (claim && isExpired(claim, now)) {
      await Claim.deleteOne({ _id: claim._id });
      claim = null;
    }

    // Idempotent: a second scan while already in the biometric phase returns the same ticket.
    if (claim && claim.status === 'AWAITING_BIOMETRICS') {
      return res.status(200).json(acceptedResponse(claim, student, classroom));
    }

    if (!claim) {
      claim = new Claim({
        claimTicket: newClaimTicket(),
        sessionId: session._id,
        studentId: student._id,
        rollNumber: student.rollNumber,
        clientGps: {
          latitude: clientGps?.latitude,
          longitude: clientGps?.longitude,
          accuracyMeters: clientGps?.accuracyMeters
        }
      });
    }
    claim.tokenStep = tokenCheck.step;
    claim.expireAt = new Date(now + CLAIM_TTL_MS);

    if (session.requirePin) {
      claim.status = 'AWAITING_PIN';
      claim.pinDeadline = new Date(now + PIN_WINDOW_MS);
      claim.pinAttempts = 0;
      await claim.save();
      return res.status(200).json({
        status: 'PIN_REQUIRED',
        claimTicket: claim.claimTicket,
        pinWindowSeconds: Math.round(PIN_WINDOW_MS / 1000),
        attemptsAllowed: MAX_PIN_ATTEMPTS
      });
    }

    await promoteToBiometrics(claim, session._id);
    return res.status(200).json(acceptedResponse(claim, student, classroom));
  } catch (err) {
    console.error('[CLAIM ERROR]', err.message);
    res.status(500).json({ error: 'Claim failed. Please try again.' });
  }
};

/**
 * Phase 1b: Line-of-Sight PIN.
 * The PIN must match the digit on the projector right now (or the one just before
 * it, within PIN_GRACE_MS). Wrong guesses are counted atomically; after
 * MAX_PIN_ATTEMPTS the claim is destroyed and the student must scan again.
 */
export const submitPin = async (req, res) => {
  try {
    const { claimTicket, pin } = req.body;
    if (!claimTicket) {
      return res.status(400).json({ error: 'claimTicket is required' });
    }

    const now = Date.now();
    const claim = await Claim.findOne({ claimTicket: String(claimTicket), studentId: req.student._id });
    if (!claim || isExpired(claim, now)) {
      return res.status(400).json({ code: 'CLAIM_EXPIRED', error: 'Your scan expired. Please scan the QR code again.' });
    }

    const session = await Session.findById(claim.sessionId).select('+totpSecret').populate('classroomId');
    if (!session || session.status !== 'ACTIVE') {
      return res.status(400).json({ code: 'SESSION_INACTIVE', error: 'Lecture session is not currently active' });
    }

    if (claim.status === 'AWAITING_BIOMETRICS') {
      return res.status(200).json(acceptedResponse(claim, req.student, session.classroomId));
    }
    if (claim.status !== 'AWAITING_PIN') {
      return res.status(400).json({ code: 'CLAIM_EXPIRED', error: 'Your scan expired. Please scan the QR code again.' });
    }
    if (!claim.pinDeadline || claim.pinDeadline.getTime() < now) {
      await Claim.deleteOne({ _id: claim._id });
      return res.status(400).json({ code: 'PIN_TIMEOUT', error: 'Took too long to enter the PIN. Please scan again.' });
    }

    const pinCheck = TokenService.verifyPin(session.totpSecret, session._id.toString(), pin, {
      intervalSeconds: session.tokenIntervalSeconds || 4,
      graceMs: PIN_GRACE_MS
    });

    if (!pinCheck.valid) {
      // Atomic increment so parallel guesses cannot exceed the attempt limit.
      const updated = await Claim.findOneAndUpdate(
        { _id: claim._id, status: 'AWAITING_PIN' },
        { $inc: { pinAttempts: 1 } },
        { new: true }
      );
      const attempts = updated ? updated.pinAttempts : MAX_PIN_ATTEMPTS;
      if (attempts >= MAX_PIN_ATTEMPTS) {
        await Claim.deleteOne({ _id: claim._id });
        return res.status(400).json({ code: 'PIN_LOCKED', error: 'Wrong PIN. Please scan the QR code again.' });
      }
      return res.status(400).json({
        code: pinCheck.reason,
        error: 'Wrong PIN. Look at the projector and tap the digit shown now.',
        attemptsLeft: MAX_PIN_ATTEMPTS - attempts
      });
    }

    await promoteToBiometrics(claim, session._id);
    return res.status(200).json(acceptedResponse(claim, req.student, session.classroomId));
  } catch (err) {
    console.error('[PIN ERROR]', err.message);
    res.status(500).json({ error: 'PIN check failed. Please try again.' });
  }
};

/**
 * Phase 2: biometric verification (FaceNet + active blink liveness).
 * Liveness is decided by the session, never by the client.
 */
export const verifyBiometrics = async (req, res) => {
  const cleanupUploads = () => (req.files || []).forEach((f) => fs.unlink(f.path, () => {}));

  try {
    const { claimTicket } = req.body;
    if (!claimTicket) {
      cleanupUploads();
      return res.status(400).json({ error: 'claimTicket is required' });
    }

    const claim = await Claim.findOne({ claimTicket: String(claimTicket), studentId: req.student._id });
    if (!claim || isExpired(claim) || claim.status !== 'AWAITING_BIOMETRICS') {
      cleanupUploads();
      return res.status(400).json({
        code: 'CLAIM_EXPIRED',
        error: 'Attendance claim ticket expired or invalid. Please scan the QR code again.'
      });
    }

    const session = await Session.findById(claim.sessionId).populate('classroomId');
    if (!session || session.status !== 'ACTIVE') {
      cleanupUploads();
      return res.status(400).json({ code: 'SESSION_INACTIVE', error: 'Lecture session is not currently active' });
    }

    const student = await Student.findById(req.student._id).select('+faceEmbedding');
    if (!student) {
      cleanupUploads();
      return res.status(404).json({ error: 'Student not found' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No face images uploaded' });
    }

    const wasEnrolled = Array.isArray(student.faceEmbedding) && student.faceEmbedding.length > 0;
    if (!wasEnrolled && !ALLOW_SELF_ENROLLMENT) {
      cleanupUploads();
      return res.status(400).json({
        code: 'NOT_ENROLLED',
        error: 'Your face is not enrolled yet. Ask your faculty to enroll you, then try again.'
      });
    }

    const requireLiveness = session.requireLiveness !== false;

    const form = new FormData();
    for (const f of req.files) {
      form.append('images', fs.createReadStream(f.path));
    }
    if (wasEnrolled) {
      form.append('enrolled_embedding', JSON.stringify(student.faceEmbedding));
    }
    form.append('threshold', String(MATCH_THRESHOLD));
    form.append('require_liveness', requireLiveness ? 'true' : 'false');

    const mlRes = await axios.post(`${ML_SERVICE_URL}/verify`, form, {
      headers: form.getHeaders(),
      timeout: 15000
    });
    cleanupUploads();

    const { matched, similarity, liveness, embedding: probeEmbedding, error: mlError } = mlRes.data;

    if (requireLiveness && liveness && liveness.is_live === false) {
      return res.status(400).json({
        code: 'SPOOF_DETECTED',
        error: mlError || `Liveness verification failed: ${liveness.reason || 'No natural blink detected'}`,
        liveness
      });
    }

    let status = 'PRESENT';
    let flagReason = null;

    if (!wasEnrolled) {
      // Self-enrollment by the logged-in owner of this account. Saved as FLAGGED
      // so faculty can confirm the face belongs to the student.
      if (!probeEmbedding || probeEmbedding.length === 0) {
        return res.status(400).json({
          code: 'NO_FACE_DETECTED',
          error: 'Could not detect a face. Center your face in good lighting and try again.'
        });
      }
      student.faceEmbedding = probeEmbedding;
      student.isEnrolled = true;
      student.enrolledAt = new Date();
      student.enrollmentSource = 'SELF_SCAN';
      await student.save();
      status = 'FLAGGED';
      flagReason = 'FIRST_SELF_ENROLLMENT';
    } else if (!matched) {
      return res.status(400).json({
        code: 'BIOMETRIC_MISMATCH',
        error: mlError || `Face verification failed. Similarity (${similarity}) below threshold (${MATCH_THRESHOLD}).`,
        similarity,
        liveness
      });
    }

    // Adaptive rolling centroid: on strong matches, nudge the stored template toward
    // the new probe (EMA) so it absorbs lighting and camera differences over time.
    const CENTROID_CONFIDENCE_THRESHOLD = 0.75;
    const BLEND_ALPHA = 0.05;
    if (
      wasEnrolled &&
      Array.isArray(probeEmbedding) &&
      probeEmbedding.length === student.faceEmbedding.length &&
      typeof similarity === 'number' &&
      similarity >= CENTROID_CONFIDENCE_THRESHOLD
    ) {
      try {
        const blended = student.faceEmbedding.map((val, i) => (1 - BLEND_ALPHA) * val + BLEND_ALPHA * probeEmbedding[i]);
        const norm = Math.sqrt(blended.reduce((sum, v) => sum + v * v, 0));
        student.faceEmbedding = norm > 0 ? blended.map((v) => v / norm) : blended;
        student.embeddingVersion = (student.embeddingVersion || 1) + 1;
        student.embeddingUpdatedAt = new Date();
        await student.save();
      } catch (centroidErr) {
        console.error(`[ADAPTIVE-CENTROID] Failed for ${student.rollNumber}:`, centroidErr.message);
      }
    }

    try {
      const record = await AttendanceRecord.create({
        sessionId: session._id,
        studentId: student._id,
        rollNumber: student.rollNumber,
        studentName: student.name,
        courseCode: session.courseCode,
        roomCode: session.classroomId?.roomCode || 'N/A',
        status,
        flagReason,
        verificationMetrics: {
          cosineSimilarity: typeof similarity === 'number' ? similarity : 1.0,
          threshold: MATCH_THRESHOLD,
          livenessScore: liveness?.score ?? 1.0,
          livenessPassed: liveness?.is_live !== false
        }
      });

      const counter = status === 'PRESENT' ? 'stats.presentCount' : 'stats.flaggedCount';
      await Session.findByIdAndUpdate(session._id, { $inc: { [counter]: 1 } });
      await Claim.deleteOne({ _id: claim._id });

      return res.status(200).json({
        status,
        message: status === 'PRESENT'
          ? 'Attendance recorded successfully'
          : 'Attendance recorded. Your face was enrolled and will be confirmed by your faculty.',
        student: { rollNumber: student.rollNumber, name: student.name },
        metrics: { similarity: typeof similarity === 'number' ? similarity : null, markedAt: record.markedAt }
      });
    } catch (dbErr) {
      if (dbErr.code === 11000) {
        // Idempotency: the compound unique index (sessionId, studentId) rejected a duplicate.
        await Claim.deleteOne({ _id: claim._id });
        return res.status(200).json({ status: 'PRESENT', message: 'Attendance already recorded for this session' });
      }
      throw dbErr;
    }
  } catch (err) {
    console.error('[VERIFY ERROR]', err.response?.data || err.message);
    cleanupUploads();
    const mlMessage = err.response?.data?.error;
    res.status(500).json({ error: mlMessage ? `Verification failed: ${mlMessage}` : 'Verification failed. Please try again.' });
  }
};

/**
 * Live roster for the projector. Only the faculty who owns the session (or an admin) can read it.
 */
export const getLiveRoster = async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!mongoose.isValidObjectId(sessionId)) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const filter = req.user.role === 'admin' ? { _id: sessionId } : { _id: sessionId, facultyId: req.user._id };
    const session = await Session.findOne(filter);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    let enrolledCount = 0;
    if (session.courseId) {
      const { default: Enrollment } = await import('../models/Enrollment.js');
      enrolledCount = await Enrollment.countDocuments({ courseId: session.courseId, status: 'active' });
    }

    const records = await AttendanceRecord.find({ sessionId })
      .sort({ markedAt: -1 })
      .select('rollNumber studentName status flagReason verificationMetrics markedAt');

    res.json({ count: records.length, enrolledCount, roster: records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
