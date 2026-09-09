import crypto from 'crypto';

export class TokenService {
  /**
   * Generates HMAC-SHA256 rotating TOTP token (8-char uppercase hex)
   * Token rotates every `intervalSeconds` (default: 4 seconds).
   */
  static generateToken(totpSecret, sessionId, intervalSeconds = 4) {
    const nowMs = Date.now();
    const timeStep = Math.floor(nowMs / (intervalSeconds * 1000));
    
    const message = `${sessionId}:${timeStep}`;
    const hmac = crypto.createHmac('sha256', totpSecret);
    hmac.update(message);
    const fullHex = hmac.digest('hex').toUpperCase();
    const token = fullHex.substring(0, 8);

    // Line-of-sight visual PIN (1-9) derived deterministically from the hash
    const pin = (parseInt(fullHex.substring(8, 12), 16) % 9) + 1;

    return {
      token,
      pin,
      timeStep,
      timestamp: nowMs,
      expiresInMs: (intervalSeconds * 1000) - (nowMs % (intervalSeconds * 1000))
    };
  }

  /**
   * Validates token with +/- 1 window drift tolerance.
   * Uses crypto.timingSafeEqual to eliminate timing side-channel attacks.
   */
  static verifyToken(totpSecret, sessionId, candidateToken, candidatePin, intervalSeconds = 4, requirePin = false) {
    if (!candidateToken) return { valid: false, reason: 'TOKEN_MISSING' };
    const cleanToken = String(candidateToken).trim().toUpperCase();

    const nowMs = Date.now();
    const currentStep = Math.floor(nowMs / (intervalSeconds * 1000));

    // Allow current step and previous 2 steps (up to ~12s grace period for scan + PIN tap + network latency)
    const allowedSteps = [currentStep, currentStep - 1, currentStep - 2];

    for (const step of allowedSteps) {
      const message = `${sessionId}:${step}`;
      const hmac = crypto.createHmac('sha256', totpSecret);
      hmac.update(message);
      const fullHex = hmac.digest('hex').toUpperCase();
      const expectedToken = fullHex.substring(0, 8);
      const tokenPin = (parseInt(fullHex.substring(8, 12), 16) % 9) + 1;

      const bufCandidate = Buffer.from(cleanToken);
      const bufExpected = Buffer.from(expectedToken);

      if (bufCandidate.length === bufExpected.length && crypto.timingSafeEqual(bufCandidate, bufExpected)) {
        // Enforce Line-of-Sight PIN ONLY IF requirePin is active
        if (requirePin) {
          if (candidatePin === undefined || candidatePin === null || candidatePin === '') {
            return { valid: false, reason: 'PIN_REQUIRED' };
          }

          // Current live PIN visible on the projector screen right now
          const liveMessage = `${sessionId}:${currentStep}`;
          const liveHmac = crypto.createHmac('sha256', totpSecret).update(liveMessage).digest('hex').toUpperCase();
          const livePin = (parseInt(liveHmac.substring(8, 12), 16) % 9) + 1;

          // Previous tick PIN in case screen just rotated while student was tapping
          const prevMessage = `${sessionId}:${currentStep - 1}`;
          const prevHmac = crypto.createHmac('sha256', totpSecret).update(prevMessage).digest('hex').toUpperCase();
          const prevPin = (parseInt(prevHmac.substring(8, 12), 16) % 9) + 1;

          const candidateNum = parseInt(candidatePin, 10);
          // Valid if student tapped the PIN of the scanned token window, the currently active screen window, or the previous window
          if (candidateNum !== tokenPin && candidateNum !== livePin && candidateNum !== prevPin) {
            return { valid: false, reason: 'PIN_MISMATCH', expectedPin: livePin };
          }
        }

        return { valid: true, step };
      }
    }

    return { valid: false, reason: 'TOKEN_EXPIRED' };
  }
}
