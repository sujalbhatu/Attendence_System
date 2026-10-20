import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import Session from '../models/Session.js';
import Classroom from '../models/Classroom.js';
import AttendanceRecord from '../models/AttendanceRecord.js';
import Course from '../models/Course.js';
import Enrollment from '../models/Enrollment.js';
import { TokenService } from '../services/tokenService.js';
import { StaggerService } from '../services/staggerService.js';
import { JWT_SECRET } from '../config.js';

const PROJECTOR_TOKEN_TTL = '4h';

// Only the faculty who created a session (or an admin) may read or change it.
const ownedSessionFilter = (id, user) =>
  user.role === 'admin' ? { _id: id } : { _id: id, facultyId: user._id };

const findOwnedSession = (id, user) => {
  if (!mongoose.isValidObjectId(id)) return null;
  return Session.findOne(ownedSessionFilter(id, user));
};

export const createSession = async (req, res) => {
  try {
    const { courseCode, courseName, classroomId, requirePin, courseId, branch } = req.body;
    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
      return res.status(404).json({ error: 'Classroom not found' });
    }

    let finalCourseCode = courseCode ? courseCode.toUpperCase() : '';
    let finalCourseName = courseName || '';
    const finalBranch = branch || '';

    if (courseId) {
      const course = await Course.findById(courseId);
      if (course) {
        finalCourseCode = course.courseCode.toUpperCase();
        finalCourseName = course.courseName;
      }
    }

    const session = await Session.create({
      courseCode: finalCourseCode,
      courseName: finalCourseName,
      courseId: courseId || null,
      branch: finalBranch,
      facultyId: req.user._id,
      classroomId: classroom._id,
      requirePin: requirePin === true
    });

    const populated = await Session.findById(session._id)
      .populate('classroomId')
      .populate('facultyId', 'name email department');

    res.status(201).json({ session: populated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getSession = async (req, res) => {
  try {
    const query = findOwnedSession(req.params.id, req.user);
    const session = query && await query
      .populate('classroomId')
      .populate('facultyId', 'name email department');
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
    const sessions = await Session.find({ facultyId: req.user._id })
      .populate('classroomId')
      .sort({ createdAt: -1 })
      .limit(20);
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
      { sid: session._id.toString(), scope: 'projector' },
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

    const session = await Session.findById(req.params.id);
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
        const current = await Session.findById(session._id).select('+totpSecret requirePin status');
        if (!current || current.status !== 'ACTIVE') {
          res.write('event: concluded\ndata: {}\n\n');
          res.end();
          closed = true;
          return;
        }
        const tokenData = TokenService.generateToken(current.totpSecret, current._id.toString(), intervalSeconds);
        res.write(`data: ${JSON.stringify({
          sessionId: current._id,
          token: tokenData.token,
          pin: tokenData.pin,
          timestamp: tokenData.timestamp,
          expiresInMs: tokenData.expiresInMs,
          requirePin: !!current.requirePin
        })}\n\n`);
        // Wake up just after the next rotation boundary.
        nextDelay = tokenData.expiresInMs + 25;
      } catch (err) {
        console.error('[QR FEED]', err.message);
      }
      if (!closed) timer = setTimeout(pushToken, nextDelay);
    };

    pushToken();

    req.on('close', () => {
      closed = true;
      if (timer) clearTimeout(timer);
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const togglePinRequirement = async (req, res) => {
  try {
    const session = await findOwnedSession(req.params.id, req.user);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    session.requirePin = !session.requirePin;
    await session.save();

    res.json({
      message: `Line-of-Sight PIN is now ${session.requirePin ? 'ENABLED' : 'DISABLED'}`,
      requirePin: session.requirePin
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

    session.status = 'CONCLUDED';
    session.concludedAt = new Date();
    await session.save();
    StaggerService.resetSession(session._id);

    let presentCount = 0;
    let absentCount = 0;
    let totalCount = 0;

    // Auto-absent: every enrolled student without any record (PRESENT or FLAGGED) gets ABSENT.
    if (session.courseId) {
      const enrollments = await Enrollment.find({
        courseId: session.courseId,
        branch: session.branch,
        status: 'active'
      }).populate('studentId', 'rollNumber name');

      totalCount = enrollments.length;

      const existingRecords = await AttendanceRecord.find({ sessionId: session._id }).select('studentId status');
      const studentsWithRecord = new Set(existingRecords.map((r) => r.studentId.toString()));
      presentCount = existingRecords.filter((r) => r.status === 'PRESENT').length;

      const absentRecordsToCreate = [];
      for (const enr of enrollments) {
        if (!enr.studentId) continue;
        if (!studentsWithRecord.has(enr.studentId._id.toString())) {
          absentRecordsToCreate.push({
            sessionId: session._id,
            studentId: enr.studentId._id,
            rollNumber: enr.studentId.rollNumber,
            studentName: enr.studentId.name,
            courseCode: session.courseCode,
            roomCode: 'N/A',
            status: 'ABSENT',
            verificationMetrics: { cosineSimilarity: 0, threshold: 0.65, livenessScore: 0, livenessPassed: false, distanceMeters: 0 }
          });
          absentCount++;
        }
      }

      if (absentRecordsToCreate.length > 0) {
        // ordered:false — one duplicate (e.g. a late concurrent check-in) must not abort the rest.
        await AttendanceRecord.insertMany(absentRecordsToCreate, { ordered: false }).catch((err) => {
          if (err.code !== 11000 && !err.writeErrors) throw err;
        });
      }
    }

    res.json({
      message: 'Session concluded successfully',
      session,
      stats: session.courseId ? { present: presentCount, absent: absentCount, total: totalCount } : null
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
    const query = findOwnedSession(req.params.id, req.user);
    const session = query && await query.populate('classroomId').populate('facultyId', 'name email');
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const records = await AttendanceRecord.find({ sessionId: session._id }).sort({ rollNumber: 1 });

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
