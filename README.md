# CampusTrack — University-Scale O(1) Biometric Attendance Platform

A production-grade, $O(1)$ distributed biometric attendance platform designed for college lecture halls. Handles peak 10:00 AM morning concurrency (3,000+ students across 50 classrooms) on inexpensive standard campus hardware without cloud GPU clusters.

## Architecture

* **Phase 1: Rapid Presence Claim (< 2ms):**
  * Teacher projector displays a 4-second rotating HMAC-SHA256 QR code + Line-of-Sight PIN.
  * Student phone scans and transmits a 0.5 KB claim payload (`{ rollNumber, token, gps }`).
  * Server validates token and geofence, returning a temporary claim reservation ticket.
* **Phase 2: Decoupled Biometric Verification:**
  * Staggered upload slot assignment flattens the thundering herd.
  * Student performs front-camera active blink verification.
  * Vectorized PyTorch FaceNet (InceptionResnetV1) worker pool executes batch matching against 512-d embeddings.
  * MongoDB atomic commit enforces 1 attendance record per student per session (`unique: { sessionId: 1, studentId: 1 }`).

## Services & Ports

* **Frontend:** `https://localhost:5173` / `https://<LAN-IP>:5173` (Vite + React 19 + HTTPS)
* **Backend Gateway:** `http://localhost:3001` (Node.js + Express + MongoDB Atlas)
* **ML Biometric Engine:** `http://localhost:5001` (Python 3.11 + PyTorch + FaceNet)

## Default Faculty Credentials

* **Email:** `faculty@campus.edu`
* **Password:** `password123`
