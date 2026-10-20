# RollOne (CampusTrack) — Biometric Attendance Platform

Phone-based lecture attendance: the projector shows a rotating QR code, students check in from their phones, and a face-verification service with blink liveness confirms who they are.

## How a check-in works

1. **Projector.** The faculty opens the projector view. It exchanges the faculty login for a short-lived projector token and opens a Server-Sent Events stream. Every 4 s, aligned to the rotation boundary, the server pushes `HMAC-SHA256(sessionSecret, sessionId:timeStep)` — the first 8 hex characters are the QR token, the next ones give a 1–9 Line-of-Sight PIN.
2. **Claim (`POST /api/attendance/claim`).** The student is logged in (JWT), so identity never comes from a typed roll number. The scanned token is checked at scan time: it is valid only inside its own 4 s window, plus `TOKEN_GRACE_MS` (default 1.5 s) after rotation for network delay. Then the geofence (Haversine, 35 m) and the "already marked" check run, and the server returns a claim ticket.
3. **PIN (`POST /api/attendance/claim/pin`, only if the session requires it).** A separate step, so tapping the PIN doesn't have to fit inside the token window. It must match the digit on screen now; 2 wrong attempts destroy the claim.
4. **Verify (`POST /api/attendance/verify`).** After a staggered delay (25 students per 1.5 s slot + jitter), the phone uploads a burst of 320×320 JPEG frames. The Python service checks blink liveness (always on — the client cannot turn it off), computes a FaceNet embedding and compares it with the enrolled one (cosine ≥ 0.65).
5. **Commit.** A compound unique index on (sessionId, studentId) makes marking idempotent under concurrent retries.

## Security model

- Session secrets are `select: false` and never leave the server; the QR feed needs a projector token scoped to one session.
- Students get a temporary password from faculty (Students page: add student or Reset password) and must set their own on first login before marking attendance. There is no roll-number default password.
- Face templates and password hashes are `select: false` and never returned by the API.
- Faculty sign-up is invite-only (`FACULTY_INVITE_CODE`); the role is always `faculty`.
- `JWT_SECRET` is required — the server refuses to start without it. Tokens are accepted only in the `Authorization` header.
- Per-account rate limits on claim/PIN/verify and on logins (students share one campus IP, so limits are not per-IP).
- Faces are enrolled by faculty. Optional first-scan self-enrollment (off by default; `ALLOW_SELF_ENROLLMENT=true`) records attendance as `FLAGGED` for faculty review.

## Services

| Service | Stack | Port |
| --- | --- | --- |
| Frontend | React 19 + Vite | 5173 (dev) |
| API gateway | Node.js + Express + MongoDB | 3001 |
| ML engine | Python + PyTorch FaceNet (InceptionResnetV1) | 5001 |

## Setup

```bash
cd backend && cp .env.example .env   # fill in MONGODB_URI and JWT_SECRET
npm install && npm start
npm test                             # token window, PIN, claim/verify flow, rate limits (Node 22.3+)
```

For a local demo database, set `SEED_DEMO=true` (development only); the demo faculty password is printed once in the server log.

## After deploying these security fixes

1. Set a new random `JWT_SECRET` (this logs everyone out, including any old stolen tokens).
2. Change the old demo faculty password: `npm run set-faculty-password -- faculty@campus.edu "<new password>"`.
3. Set `FACULTY_INVITE_CODE` if you want faculty sign-up to stay open.
