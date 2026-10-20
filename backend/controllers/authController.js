import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { UNIQUE_VIOLATION } from '../db/index.js';
import { findUserByEmail, createUser, verifyUserPassword } from '../repositories/users.js';
import { JWT_SECRET, FACULTY_INVITE_CODE } from '../config.js';

const generateToken = (id) => jwt.sign({ id }, JWT_SECRET, { expiresIn: '7d' });

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  department: user.department
});

const inviteCodeMatches = (candidate) => {
  if (!FACULTY_INVITE_CODE || !candidate) return false;
  const a = Buffer.from(String(candidate));
  const b = Buffer.from(FACULTY_INVITE_CODE);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/**
 * Faculty sign-up is invite-only, and the role is always "faculty":
 * a client can never make itself an admin by sending { role: 'admin' }.
 */
export const register = async (req, res) => {
  try {
    const { name, email, password, department, inviteCode } = req.body;

    if (!FACULTY_INVITE_CODE) {
      return res.status(403).json({ error: 'Faculty sign-up is disabled. Ask an administrator for an account.' });
    }
    if (!inviteCodeMatches(inviteCode)) {
      return res.status(403).json({ error: 'Invalid faculty invite code' });
    }
    if (!name || !email || !password || String(password).length < 8) {
      return res.status(400).json({ error: 'Name, email and a password of at least 8 characters are required' });
    }

    const existing = await findUserByEmail(String(email));
    if (existing) {
      return res.status(400).json({ error: 'Account already exists with this email' });
    }

    const user = await createUser({ name, email: String(email), password: String(password), role: 'faculty', department });
    res.status(201).json({ token: generateToken(user.id), user: publicUser(user) });
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      return res.status(400).json({ error: 'Account already exists with this email' });
    }
    res.status(500).json({ error: err.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await verifyUserPassword(String(email || ''), String(password || ''));
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    res.json({ token: generateToken(user.id), user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getMe = async (req, res) => {
  res.json({ user: req.user });
};
