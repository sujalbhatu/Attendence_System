import fs from 'fs';
import { isUuid } from '../db/index.js';
import { findOwnedSession } from '../repositories/sessions.js';
import { getActiveSession } from '../services/sessionCache.js';
import { publishSessionEvent } from '../services/liveEvents.js';
import { verifyFace } from '../services/verifyQueue.js';
import { getFaceEmbedding } from '../repositories/students.js';
import {
  hasAttendanceRecord,
  startClaim,
  findLiveClaim,
  promoteClaim,
  recordWrongPin,
  deleteClaim,
  commitAttendance,
  liveRoster,
  countActiveEnrollmentsForSession
} from '../repositories/attendance.js';
import { TokenService } from '../services/tokenService.js';
import { GeofenceService } from '../services/geofenceService.js';
import { StaggerService } from '../services/staggerService.js';
import {
  TOKEN_GRACE_MS,
  PIN_GRACE_MS,
  PIN_WINDOW_MS,
  MAX_PIN_ATTEMPTS,
  CLAIM_TTL_MS,
  ALLOW_SELF_ENROLLMENT
} from '../config.js';

const MATCH_THRESHOLD = 0.65;

const acceptedResponse = (claim, student, classroom) => ({
  status: 'CLAIM_ACCEPTED',
  claimTicket: claim.claimTicket,
  assignedDelayMs: claim.assignedDelayMs,
  expiresInSeconds: Math.max(0, Math.round((claim.expireAt.getTime() - Date.now()) / 1000)),
  student: {
    id: student.id,
    rollNumber: student.rollNumber,
    name: student.name,
    isEnrolled: student.isEnrolled
  },
  classroom: classroom ? { roomCode: classroom.roomCode, building: classroom.building } : null
});

// Moves a claim into the biometric phase and gives it a staggered upload slot.
const promoteToBiometrics = async (claim, sessionId) =>
  promoteClaim(claim.id, { assignedDelayMs: await StaggerService.assignUploadDelay(sessionId), ttlMs: CLAIM_TTL_MS });

// The session with its classroom, plus the secret that only token checks may read.
// Cached in Redis for a few seconds when enabled (see services/sessionCache.js).
const loadActiveSession = (sessionId) => getActiveSession(sessionId);

/**
 * Phase 1: presence claim.
 * The student is identified by their login token (never by a typed roll number).
 * The scanned QR token is checked against its own 4 s window, as of the moment the scan
 * reached the server (req.receivedAt), not after the DB lookups below.
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
    if (!isUuid(String(sessionId))) {
      return res.status(400).json({ code: 'INVALID_QR', error: 'This QR code is not a valid RollOne session code.' });
    }

    const loaded = await loadActiveSession(String(sessionId));
    if (!loaded) {
      return res.status(400).json({ code: 'SESSION_INACTIVE', error: 'Lecture session is not currently active' });
    }
    const { session, totpSecret } = loaded;

    const tokenCheck = TokenService.verifyToken(totpSecret, session.id, scannedToken, {
      intervalSeconds: session.tokenIntervalSeconds || 4,
      graceMs: TOKEN_GRACE_MS,
      nowMs: req.receivedAt ?? Date.now()
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

    if (await hasAttendanceRecord(session.id, student.id)) {
      return res.status(409).json({ code: 'ALREADY_MARKED', error: `Attendance already marked for ${student.rollNumber}` });
    }

    const needsPin = session.requirePin;
    const { claim, reused } = await startClaim({
      sessionId: session.id,
      studentId: student.id,
      rollNumber: student.rollNumber,
      clientGps,
      tokenStep: tokenCheck.step,
      status: needsPin ? 'AWAITING_PIN' : 'AWAITING_BIOMETRICS',
      pinWindowMs: needsPin ? PIN_WINDOW_MS : null,
      assignedDelayMs: needsPin ? 0 : await StaggerService.assignUploadDelay(session.id),
      ttlMs: CLAIM_TTL_MS
    });

    // Idempotent: a second scan while already in the biometric phase returns the same ticket.
    if (reused || !needsPin) {
      return res.status(200).json(acceptedResponse(claim, student, classroom));
    }

    return res.status(200).json({
      status: 'PIN_REQUIRED',
      claimTicket: claim.claimTicket,
      pinWindowSeconds: Math.round(PIN_WINDOW_MS / 1000),
      attemptsAllowed: MAX_PIN_ATTEMPTS
    });
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
    const claim = await findLiveClaim(claimTicket, req.student.id);
    if (!claim) {
      return res.status(400).json({ code: 'CLAIM_EXPIRED', error: 'Your scan expired. Please scan the QR code again.' });
    }

    const loaded = await loadActiveSession(claim.sessionId);
    if (!loaded) {
      return res.status(400).json({ code: 'SESSION_INACTIVE', error: 'Lecture session is not currently active' });
    }
    const { session, totpSecret } = loaded;

    if (claim.status === 'AWAITING_BIOMETRICS') {
      return res.status(200).json(acceptedResponse(claim, req.student, session.classroomId));
    }
    if (!claim.pinDeadline || claim.pinDeadline.getTime() < now) {
      await deleteClaim(claim.id);
      return res.status(400).json({ code: 'PIN_TIMEOUT', error: 'Took too long to enter the PIN. Please scan again.' });
    }

    const pinCheck = TokenService.verifyPin(totpSecret, session.id, pin, {
      intervalSeconds: session.tokenIntervalSeconds || 4,
      graceMs: PIN_GRACE_MS,
      nowMs: req.receivedAt ?? Date.now()
    });

    if (!pinCheck.valid) {
      const attempts = (await recordWrongPin(claim.id)) ?? MAX_PIN_ATTEMPTS;
      if (attempts >= MAX_PIN_ATTEMPTS) {
        await deleteClaim(claim.id);
        return res.status(400).json({ code: 'PIN_LOCKED', error: 'Wrong PIN. Please scan the QR code again.' });
      }
      return res.status(400).json({
        code: pinCheck.reason,
        error: 'Wrong PIN. Look at the projector and tap the digit shown now.',
        attemptsLeft: MAX_PIN_ATTEMPTS - attempts
      });
    }

    const promoted = await promoteToBiometrics(claim, session.id);
    if (!promoted) {
      return res.status(400).json({ code: 'CLAIM_EXPIRED', error: 'Your scan expired. Please scan the QR code again.' });
    }
    return res.status(200).json(acceptedResponse(promoted, req.student, session.classroomId));
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

    const claim = await findLiveClaim(claimTicket, req.student.id);
    if (!claim || claim.status !== 'AWAITING_BIOMETRICS') {
      cleanupUploads();
      return res.status(400).json({
        code: 'CLAIM_EXPIRED',
        error: 'Attendance claim ticket expired or invalid. Please scan the QR code again.'
      });
    }

    const session = (await loadActiveSession(claim.sessionId))?.session;
    if (!session || session.status !== 'ACTIVE') {
      cleanupUploads();
      return res.status(400).json({ code: 'SESSION_INACTIVE', error: 'Lecture session is not currently active' });
    }

    const student = req.student;
    const storedEmbedding = await getFaceEmbedding(student.id);

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No face images uploaded' });
    }

    const wasEnrolled = Array.isArray(storedEmbedding) && storedEmbedding.length > 0;
    if (!wasEnrolled && !ALLOW_SELF_ENROLLMENT) {
      cleanupUploads();
      return res.status(400).json({
        code: 'NOT_ENROLLED',
        error: 'Your face is not enrolled yet. Ask your faculty to enroll you, then try again.'
      });
    }

    const requireLiveness = session.requireLiveness !== false;

    // Through the micro-batching face-check queue (services/verifyQueue.js)
    const mlData = await verifyFace({
      files: req.files,
      enrolledEmbedding: wasEnrolled ? storedEmbedding : null,
      threshold: MATCH_THRESHOLD,
      requireLiveness
    });
    cleanupUploads();

    const { matched, similarity, liveness, embedding: probeEmbedding, error: mlError } = mlData;

    // Fail closed: no liveness result from the ML service counts as a failed check
    if (requireLiveness && liveness?.is_live !== true) {
      return res.status(400).json({
        code: 'SPOOF_DETECTED',
        error: mlError || `Liveness verification failed: ${liveness?.reason || 'No natural blink detected'}`,
        liveness
      });
    }

    let status = 'PRESENT';
    let flagReason = null;
    const face = {};

    if (!wasEnrolled) {
      // Self-enrollment by the logged-in owner of this account. Saved as FLAGGED
      // so faculty can confirm the face belongs to the student.
      if (!probeEmbedding || probeEmbedding.length === 0) {
        return res.status(400).json({
          code: 'NO_FACE_DETECTED',
          error: 'Could not detect a face. Center your face in good lighting and try again.'
        });
      }
      face.selfEnroll = probeEmbedding;
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
      probeEmbedding.length === storedEmbedding.length &&
      typeof similarity === 'number' &&
      similarity >= CENTROID_CONFIDENCE_THRESHOLD
    ) {
      const blended = storedEmbedding.map((val, i) => (1 - BLEND_ALPHA) * val + BLEND_ALPHA * probeEmbedding[i]);
      const norm = Math.sqrt(blended.reduce((sum, v) => sum + v * v, 0));
      face.centroid = norm > 0 ? blended.map((v) => v / norm) : blended;
    }

    // Record, session counter, face template and claim cleanup are one transaction
    const result = await commitAttendance({
      session,
      student,
      claimId: claim.id,
      status,
      flagReason,
      metrics: {
        cosineSimilarity: typeof similarity === 'number' ? similarity : 1.0,
        threshold: MATCH_THRESHOLD,
        livenessScore: liveness?.score ?? 1.0,
        livenessPassed: liveness?.is_live !== false
      },
      face
    });

    if (result.alreadyMarked) {
      // Idempotency: the UNIQUE (session_id, student_id) constraint rejected a duplicate.
      return res.status(200).json({ status: 'PRESENT', message: 'Attendance already recorded for this session' });
    }

    // Push to every projector showing this lecture (any instance, via Redis Pub/Sub)
    publishSessionEvent(session.id, { type: 'checkin', record: result.record }).catch(() => {});

    return res.status(200).json({
      status,
      message: status === 'PRESENT'
        ? 'Attendance recorded successfully'
        : 'Attendance recorded. Your face was enrolled and will be confirmed by your faculty.',
      student: { rollNumber: student.rollNumber, name: student.name },
      metrics: { similarity: typeof similarity === 'number' ? similarity : null, markedAt: result.record.markedAt }
    });
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
    const session = await findOwnedSession(req.params.sessionId, req.user);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const enrolledCount = await countActiveEnrollmentsForSession(session);
    const records = await liveRoster(session.id);

    res.json({ count: records.length, enrolledCount, roster: records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
