import crypto from 'crypto';

/**
 * Rotating QR tokens (TOTP-style).
 *
 * token = first 8 hex chars of HMAC-SHA256(secret, `${sessionId}:${timeStep}`)
 * pin   = digit 1-9 derived from the next 4 hex chars of the same HMAC
 *
 * Validity rule: a token is valid only during its own rotation window
 * (default 4 s). The previous window's token is accepted for `graceMs` after
 * the rotation, so a student who scanned just before the code changed is not
 * rejected because of network delay. Nothing older is ever accepted.
 */

const hmacHex = (secret, sessionId, step) =>
  crypto.createHmac('sha256', secret).update(`${sessionId}:${step}`).digest('hex').toUpperCase();

const tokenFromHex = (hex) => hex.substring(0, 8);
const pinFromHex = (hex) => (parseInt(hex.substring(8, 12), 16) % 9) + 1;

// Constant-time comparison so response timing never leaks how many characters matched.
const safeEqual = (a, b) => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
};

// Steps a candidate may belong to at `nowMs`: the current one, plus the previous
// one only during the first `graceMs` after a rotation.
const acceptableSteps = (nowMs, intervalSeconds, graceMs) => {
  const intervalMs = intervalSeconds * 1000;
  const currentStep = Math.floor(nowMs / intervalMs);
  const msIntoStep = nowMs - currentStep * intervalMs;
  const grace = Math.max(0, Math.min(graceMs, intervalMs - 1));
  return msIntoStep < grace ? [currentStep, currentStep - 1] : [currentStep];
};

export class TokenService {
  static generateToken(totpSecret, sessionId, intervalSeconds = 4, nowMs = Date.now()) {
    const intervalMs = intervalSeconds * 1000;
    const timeStep = Math.floor(nowMs / intervalMs);
    const hex = hmacHex(totpSecret, sessionId, timeStep);
    return {
      token: tokenFromHex(hex),
      pin: pinFromHex(hex),
      timeStep,
      timestamp: nowMs,
      expiresInMs: intervalMs - (nowMs % intervalMs)
    };
  }

  static verifyToken(totpSecret, sessionId, candidateToken, { intervalSeconds = 4, graceMs = 1500, nowMs = Date.now() } = {}) {
    if (!candidateToken) return { valid: false, reason: 'TOKEN_MISSING' };
    const clean = String(candidateToken).trim().toUpperCase();

    for (const step of acceptableSteps(nowMs, intervalSeconds, graceMs)) {
      const expected = tokenFromHex(hmacHex(totpSecret, sessionId, step));
      if (safeEqual(clean, expected)) {
        return { valid: true, step, ageMs: nowMs - step * intervalSeconds * 1000 };
      }
    }
    return { valid: false, reason: 'TOKEN_EXPIRED' };
  }

  static verifyPin(totpSecret, sessionId, candidatePin, { intervalSeconds = 4, graceMs = 2000, nowMs = Date.now() } = {}) {
    const pin = parseInt(candidatePin, 10);
    if (!Number.isInteger(pin) || pin < 1 || pin > 9) return { valid: false, reason: 'PIN_REQUIRED' };

    for (const step of acceptableSteps(nowMs, intervalSeconds, graceMs)) {
      if (pinFromHex(hmacHex(totpSecret, sessionId, step)) === pin) {
        return { valid: true, step };
      }
    }
    return { valid: false, reason: 'PIN_MISMATCH' };
  }
}
