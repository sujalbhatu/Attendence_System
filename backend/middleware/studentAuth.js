import jwt from 'jsonwebtoken';
import Student from '../models/Student.js';

export const studentProtect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    
    if (decoded.role !== 'student') {
        return res.status(403).json({ message: 'Not authorized as a student' });
    }

    req.student = await Student.findById(decoded.studentId).select('-password');
    if (!req.student) {
        return res.status(401).json({ message: 'Not authorized, student not found' });
    }
    
    next();
  } catch (error) {
    console.error('Student auth error:', error);
    res.status(401).json({ message: 'Not authorized, token failed' });
  }
};
