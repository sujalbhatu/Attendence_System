# FaceTrack — Smart Biometric Attendance Platform

An enterprise-grade, AI-powered face recognition attendance platform built with **React 19**, **Node.js/Express**, **Python/Flask (FaceNet PyTorch)**, and **MongoDB Atlas**.

---

## Architecture Overview

```
┌─────────────────┐       ┌──────────────────────┐       ┌─────────────────────┐
│ React 19 + Vite │ ────▶ │ Node.js / Express    │ ────▶ │ Python 3 / Flask    │
│ (Port 5173)     │       │ REST API (Port 3001) │       │ ML Engine (Port 5001│
└─────────────────┘       └──────────┬───────────┘       └─────────────────────┘
                                     │                              │ FaceNet (InceptionResnetV1)
                                     ▼                              │ VGGFace2 Embeddings (512-d)
                            ┌────────────────┐                      │ Active Blink Verification
                            │ MongoDB Atlas  │                      │ 2D Moiré & Motion PAD
                            └────────────────┘                      └─────────────────────┘
```

---

## Key Features

- **Deep Metric Learning:** Pretrained **FaceNet (`InceptionResnetV1`)** on VGGFace2 generating 512-dimensional L2-normalized embeddings for sub-second verification.
- **Active Liveness Detection (Anti-Spoofing):** Challenge-response eye-blink verification tracking eyelid closure and dark pupil occlusion to block 2D phone screen and printed photo attacks.
- **Microservices Architecture:** Decoupled frontend, API gateway, and dedicated Python inference engine.
- **Real-Time Attendance Dashboard:** Live session feeds, attendance logs, and student status.
- **Class Analytics & Reporting:** Interactive trends, low-attendance threshold alerts, and automated CSV export.
- **Secure Authentication:** JWT-based role authentication (Admin, Teacher) with hashed passwords via `bcryptjs`.
- **Modern UI/UX:** Responsive glassmorphism dark theme built with React 19 and Lucide icons.

---

## Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19, Vite, React Router 7, HTML5 WebRTC, Lucide React |
| **Backend** | Node.js, Express, Mongoose (MongoDB Atlas), JWT, Multer |
| **ML Engine** | Python 3, Flask, PyTorch, `facenet-pytorch`, OpenCV |
| **Database** | MongoDB Atlas / Local MongoDB |
| **DevOps** | Docker Compose, Multi-stage builds |

---

## Quick Start Guide

### 1. Clone the Repository
```bash
git clone https://github.com/<your-username>/FaceTrack.git
cd FaceTrack
```

### 2. Configure Environment Variables
Copy the template `.env.example` in the `backend` directory:
```bash
cd backend
cp .env.example .env
```
Edit `backend/.env` with your settings:
```env
PORT=3001
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/attendance_system?retryWrites=true&w=majority
JWT_SECRET=your_super_secret_jwt_key_here
```

### 3. Start Services

#### Option A: Local Development

**1. ML Inference Service (Python):**
```bash
cd ml_service
pip install -r requirements.txt
python app.py
# Runs on http://localhost:5001
```

**2. Backend API (Node.js):**
```bash
cd backend
npm install
npm start
# Runs on http://localhost:3001
```

**3. Frontend Client (React):**
```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:5173
```

#### Option B: Docker Compose
```bash
docker-compose up --build
```

---

## Security & Anti-Spoofing (PAD)

FaceTrack implements ISO 30107-compliant **Presentation Attack Detection (PAD)**:
1. **High-Frequency Stream Sampling:** Captures a multi-frame burst at 65ms intervals to track natural eyelid motion.
2. **Physical Eyelid Occlusion:** Analyzes pupil/sclera contrast decay to ensure physical eyelid coverage, mathematically rejecting static photos moved back and forth.
3. **Calibrated Thresholding:** Enforces a 70%+ cosine similarity bar separating genuine 3D human faces from re-screened digital displays.

---

## License
MIT License. Open-source for academic and commercial use.
