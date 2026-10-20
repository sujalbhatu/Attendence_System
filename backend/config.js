import 'dotenv/config';

/**
 * Central configuration. Every security-relevant setting is read here once,
 * so there are no scattered `process.env.X || 'fallback'` secrets in the code.
 */

const requireEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    console.error(`[FATAL] Missing required environment variable ${name}. Add it to backend/.env`);
    process.exit(1);
  }
  return value;
};

const intEnv = (name, fallback) => {
  const parsed = parseInt(process.env[name], 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const boolEnv = (name, fallback) => {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return value.toLowerCase() === 'true';
};

export const IS_PROD = process.env.NODE_ENV === 'production';

// Fail fast: never sign tokens with a guessable default secret.
export const JWT_SECRET = requireEnv('JWT_SECRET');

// QR token: valid only inside its own 4 s rotation window. The previous window's
// token is still accepted for TOKEN_GRACE_MS after rotation to absorb network delay
// between the projector refresh and the phone's request. Set to 0 for a strict 4 s.
export const TOKEN_GRACE_MS = intEnv('TOKEN_GRACE_MS', 1500);

// Line-of-Sight PIN: the student types the digit shown on the projector right now.
export const PIN_GRACE_MS = intEnv('PIN_GRACE_MS', 2000);
export const PIN_WINDOW_MS = intEnv('PIN_WINDOW_MS', 15000); // time allowed to tap the PIN after scanning
export const MAX_PIN_ATTEMPTS = intEnv('MAX_PIN_ATTEMPTS', 2);
export const CLAIM_TTL_MS = intEnv('CLAIM_TTL_MS', 60000);

// First-scan self-enrollment by a logged-in student. The record is saved as FLAGGED
// so faculty can review it. Set to false to require faculty-supervised enrollment only.
export const ALLOW_SELF_ENROLLMENT = boolEnv('ALLOW_SELF_ENROLLMENT', true);

// Faculty sign-up is invite-only. Leave empty to disable public sign-up entirely.
export const FACULTY_INVITE_CODE = process.env.FACULTY_INVITE_CODE || '';

// Comma-separated list of browser origins allowed to call the API cross-origin.
// Empty = same-origin only (the React app is served behind the same Nginx host).
export const CORS_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// Demo data is only seeded in development and only when explicitly asked for.
export const SEED_DEMO = !IS_PROD && boolEnv('SEED_DEMO', false);

export const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:5005';
