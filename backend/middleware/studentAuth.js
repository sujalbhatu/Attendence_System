import jwt from 'jsonwebtoken';
import Student from '../models/Student.js';
import { JWT_SECRET } from '../config.js';

const verifyStudent = ({ allowPasswordChange }) => async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ code: 'LOGIN_REQUIRED', error: 'Please log in with your roll number' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'student') {
      return res.status(403).json({ code: 'NOT_STUDENT', error: 'Not authorized as a student' });
    }

    // password and faceEmbedding are select:false, so they are not loaded here.
    req.student = await Student.findById(decoded.studentId);
    if (!req.student) {
      return res.status(401).json({ code: 'LOGIN_REQUIRED', error: 'Student account not found' });
    }

    // Checked against the database, not the token, so old tokens issued before
    // a forced password change are caught too.
    if (req.student.mustChangePassword && !allowPasswordChange) {
      return res.status(403).json({
        code: 'PASSWORD_CHANGE_REQUIRED',
        error: 'Set a new password before marking attendance.'
      });
    }

    next();
  } catch (error) {
    return res.status(401).json({ code: 'LOGIN_REQUIRED', error: 'Session expired. Please log in again.' });
  }
};

export const studentProtect = verifyStudent({ allowPasswordChange: false });
export const studentProtectAllowPasswordChange = verifyStudent({ allowPasswordChange: true });
