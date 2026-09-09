import Session from '../models/Session.js';
import Classroom from '../models/Classroom.js';
import AttendanceRecord from '../models/AttendanceRecord.js';
import Course from '../models/Course.js';
import Enrollment from '../models/Enrollment.js';
import { TokenService } from '../services/tokenService.js';

export const createSession = async (req, res) => {
  try {
    const { courseCode, courseName, classroomId, requirePin, courseId, branch } = req.body;
    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
      return res.status(404).json({ error: 'Classroom not found' });
    }

    let finalCourseCode = courseCode ? courseCode.toUpperCase() : '';
    let finalCourseName = courseName || '';
    let finalBranch = branch || '';

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
    const session = await Session.findById(req.params.id)
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
 * Server-Sent Events (SSE) stream pushing 4-second rotating token
 * to the teacher's projector screen.
 */
export const streamQRFeed = async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session || session.status !== 'ACTIVE') {
      return res.status(404).json({ error: 'Active session not found' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const intervalSeconds = session.tokenIntervalSeconds || 4;

    const pushToken = async () => {
      try {
        const currentSession = await Session.findById(session._id).select('requirePin status totpSecret');
        if (!currentSession || currentSession.status !== 'ACTIVE') {
          clearInterval(timer);
          return;
        }
        const tokenData = TokenService.generateToken(currentSession.totpSecret, currentSession._id.toString(), intervalSeconds);
        const payload = {
          sessionId: currentSession._id,
          token: tokenData.token,
          pin: tokenData.pin,
          timestamp: tokenData.timestamp,
          expiresInMs: tokenData.expiresInMs,
          requirePin: !!currentSession.requirePin
        };
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch {}
    };

    pushToken();
    const timer = setInterval(pushToken, intervalSeconds * 1000);

    req.on('close', () => {
      clearInterval(timer);
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const togglePinRequirement = async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
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
    const session = await Session.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    session.status = 'CONCLUDED';
    session.concludedAt = new Date();
    await session.save();

    let presentCount = 0;
    let absentCount = 0;
    let totalCount = 0;

    // Auto-absent logic
    if (session.courseId) {
      const enrollments = await Enrollment.find({ 
        courseId: session.courseId, 
        branch: session.branch,
        status: 'active' 
      }).populate('studentId');

      totalCount = enrollments.length;

      const presentRecords = await AttendanceRecord.find({ 
        sessionId: session._id, 
        status: 'PRESENT' 
      });
      const presentStudentIds = presentRecords.map(r => r.studentId.toString());
      presentCount = presentRecords.length;

      const absentRecordsToCreate = [];
      for (const enr of enrollments) {
        if (!presentStudentIds.includes(enr.studentId._id.toString())) {
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
        await AttendanceRecord.insertMany(absentRecordsToCreate);
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

export const exportSessionCSV = async (req, res) => {
  try {
    const { id } = req.params;
    const session = await Session.findById(id).populate('classroomId').populate('facultyId');
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const records = await AttendanceRecord.find({ sessionId: id }).sort({ rollNumber: 1 });

    let csv = 'Roll Number,Student Name,Course Code,Course Name,Room,Status,Biometric Confidence,Liveness Status,Marked At\n';
    records.forEach((r) => {
      const similarityPct = r.verificationMetrics?.cosineSimilarity != null
        ? (r.verificationMetrics.cosineSimilarity * 100).toFixed(1) + '%' 
        : 'N/A';
      const livenessStr = r.verificationMetrics?.livenessPassed !== false ? 'PASSED (Live Blink)' : 'FLAGGED';
      const timeStr = r.markedAt ? new Date(r.markedAt).toLocaleString() : '';
      
      csv += `"${r.rollNumber || ''}","${r.studentName || ''}","${r.courseCode || session.courseCode}","${session.courseName || ''}","${r.roomCode || session.classroomId?.roomCode || ''}","${r.status || 'PRESENT'}","${similarityPct}","${livenessStr}","${timeStr}"\n`;
    });

    const filename = `attendance_${session.courseCode || 'lecture'}_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
