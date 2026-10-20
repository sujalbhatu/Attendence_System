import jwt from 'jsonwebtoken';
import {
  findSessionById,
  findOwnedSession,
  getSessionSecret,
  createSession as insertSession,
  listFacultySessions,
  toggleRequirePin
} from '../repositories/sessions.js';
import { findClassroomById } from '../repositories/classrooms.js';
import { findCourseById } from '../repositories/courses.js';
import { concludeWithAbsentees, sessionRecordsByRoll } from '../repositories/attendance.js';
import { TokenService } from '../services/tokenService.js';
import { StaggerService } from '../services/staggerService.js';
import { invalidateActiveSession } from '../services/sessionCache.js';
import { publishSessionEvent, subscribeSession } from '../services/liveEvents.js';
import { JWT_SECRET } from '../config.js';

const PROJECTOR_TOKEN_TTL = '4h';

export const createSession = async (req, res) => {
  try {
    const { courseCode, courseName, classroomId, requirePin, courseId, branch } = req.body;
    const classroom = await findClassroomById(classroomId);
    if (!classroom) {
      return res.status(404).json({ error: 'Classroom not found' });
    }

    let finalCourseCode = courseCode ? courseCode.toUpperCase() : '';
    let finalCourseName = courseName || '';
    const finalBranch = branch || '';

    let course = null;
    if (courseId) {
      course = await findCourseById(courseId);
      if (course) {
        finalCourseCode = course.courseCode.toUpperCase();
        finalCourseName = course.courseName;
      }
    }

    const populated = await insertSession({
      courseCode: finalCourseCode,
      courseName: finalCourseName,
      courseId: course?.id || null,
      branch: finalBranch,
      facultyId: req.user.id,
      classroomId: classroom.id,
      requirePin: requirePin === true
    });

    res.status(201).json({ session: populated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getSession = async (req, res) => {
  try {
    const session = await findOwnedSession(req.params.id, req.user);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({ session });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getFacultySessions = async (req, res) => {
  try {
    const sessions = await listFacultySessions(req.user.id, 20);
    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Short-lived, single-purpose token for the projector screen.
 * EventSource cannot send an Authorization header, so the QR feed URL carries
 * this token instead of the faculty login token: it only unlocks one session's
 * QR stream and expires after a few hours.
 */
export const issueProjectorToken = async (req, res) => {
  try {
    const session = await findOwnedSession(req.params.id, req.user);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (session.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Session is no longer active' });
    }
    const projectorToken = jwt.sign(
      { sid: session.id, scope: 'projector' },
      JWT_SECRET,
      { expiresIn: PROJECTOR_TOKEN_TTL }
    );
    res.json({ projectorToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Server-Sent Events stream pushing the rotating token to the projector.
 * Pushes are aligned to rotation boundaries (setTimeout to the next window
 * instead of a free-running setInterval), so the code on screen is always the
 * current window's code for its whole display time.
 */
export const streamQRFeed = async (req, res) => {
  try {
    let claims;
    try {
      claims = jwt.verify(String(req.query.pt || ''), JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Projector link expired. Reopen the projector from your dashboard.' });
    }
    if (claims.scope !== 'projector' || claims.sid !== req.params.id) {
      return res.status(401).json({ error: 'Projector link is not valid for this session.' });
    }

    const session = await findSessionById(req.params.id);
    if (!session || session.status !== 'ACTIVE') {
      return res.status(404).json({ error: 'Active session not found' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // tell Nginx not to buffer the stream
    res.flushHeaders();

    const intervalSeconds = session.tokenIntervalSeconds || 4;
    let timer = null;
    let closed = false;

    const pushToken = async () => {
      if (closed) return;
      let nextDelay = intervalSeconds * 1000;
      try {
        const current = await getSessionSecret(session.id);
        if (!current || current.status !== 'ACTIVE') {
          res.write('event: concluded\ndata: {}\n\n');
          res.end();
          closed = true;
          return;
        }
        const tokenData = TokenService.generateToken(current.totp_secret, session.id, intervalSeconds);
        res.write(`data: ${JSON.stringify({
          sessionId: session.id,
          token: tokenData.token,
          pin: tokenData.pin,
          timestamp: tokenData.timestamp,
          expiresInMs: tokenData.expiresInMs,
          requirePin: !!current.require_pin
        })}\n\n`);
        // Wake up just after the next rotation boundary.
        nextDelay = tokenData.expiresInMs + 25;
      } catch (err) {
        console.error('[QR FEED]', err.message);
      }
      if (!closed) timer = setTimeout(pushToken, nextDelay);
    };

    pushToken();

    // Live check-ins and mode changes, pushed the moment they happen (no roster polling)
    const unsubscribe = await subscribeSession(session.id, (event) => {
      if (closed) return;
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      if (event.type === 'concluded') {
        closed = true;
        if (timer) clearTimeout(timer);
        res.end();
      }
    });

    req.on('close', () => {
      closed = true;
      if (timer) clearTimeout(timer);
      unsubscribe();
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const togglePinRequirement = async (req, res) => {
  try {
    const session = await findOwnedSession(req.params.id, req.user);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const requirePin = await toggleRequirePin(session.id);
    await invalidateActiveSession(session.id);
    publishSessionEvent(session.id, { type: 'pin-mode', requirePin }).catch(() => {});

    res.json({
      message: `Line-of-Sight PIN is now ${requirePin ? 'ENABLED' : 'DISABLED'}`,
      requirePin
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const concludeSession = async (req, res) => {
  try {
    const session = await findOwnedSession(req.params.id, req.user);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Auto-absent: every enrolled student without any record (PRESENT or FLAGGED) gets ABSENT,
    // in the same transaction that concludes the session.
    const stats = await concludeWithAbsentees(session);
    await Promise.all([StaggerService.resetSession(session.id), invalidateActiveSession(session.id)]);
    publishSessionEvent(session.id, { type: 'concluded' }).catch(() => {});
    const concluded = await findSessionById(session.id);

    res.json({
      message: 'Session concluded successfully',
      session: concluded,
      stats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const csvCell = (value) => {
  let text = String(value ?? '');
  // Neutralize spreadsheet formula injection (cells starting with = + - @).
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

export const exportSessionCSV = async (req, res) => {
  try {
    const session = await findOwnedSession(req.params.id, req.user);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const records = await sessionRecordsByRoll(session.id);

    let csv = 'Roll Number,Student Name,Course Code,Course Name,Room,Status,Biometric Confidence,Liveness Status,Marked At\n';
    records.forEach((r) => {
      const similarityPct = r.verificationMetrics?.cosineSimilarity != null
        ? (r.verificationMetrics.cosineSimilarity * 100).toFixed(1) + '%'
        : 'N/A';
      const livenessStr = r.verificationMetrics?.livenessPassed !== false ? 'PASSED (Live Blink)' : 'FLAGGED';
      const timeStr = r.markedAt ? new Date(r.markedAt).toLocaleString() : '';

      csv += [
        r.rollNumber,
        r.studentName,
        r.courseCode || session.courseCode,
        session.courseName,
        r.roomCode || session.classroomId?.roomCode,
        r.status || 'PRESENT',
        similarityPct,
        livenessStr,
        timeStr
      ].map(csvCell).join(',') + '\n';
    });

    const filename = `attendance_${session.courseCode || 'lecture'}_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
