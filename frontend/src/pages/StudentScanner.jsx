import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import api from '../api/client';
import {
  loadStudentToken,
  loadStudentData,
  saveStudentSession,
  clearStudentSession,
  studentAuthHeaders
} from '../api/studentSession';
import { 
  Camera, 
  CheckCircle2, 
  AlertCircle, 
  MapPin, 
  RefreshCw, 
  QrCode, 
  Eye, 
  Sparkles, 
  Clock,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';

export default function StudentScanner() {
  // Step: 'LOGIN' | 'SET_PASSWORD' | 'INIT' | 'SCANNING_QR' | 'ENTER_PIN' | 'CLAIM_CONFIRMED' | 'FACE_VERIFY' | 'SUCCESS' | 'ERROR'
  const [step, setStep] = useState(() => (loadStudentToken() ? 'INIT' : 'LOGIN'));

  // Student identity comes from their login token, never from a typed roll number
  const [studentToken, setStudentToken] = useState(() => loadStudentToken());
  const [student, setStudent] = useState(() => loadStudentData());
  const [loginRoll, setLoginRoll] = useState(() => localStorage.getItem('campustrack_roll') || '');
  const [loginPassword, setLoginPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const rollNumber = student?.rollNumber || '';

  // Location State (gpsRef keeps the latest fix available to the QR callback)
  const [gps, setGpsState] = useState(null);
  const gpsRef = useRef(null);
  const setGps = (value) => {
    gpsRef.current = value;
    setGpsState(value);
  };
  const [gpsError, setGpsError] = useState(null);
  const [isGettingGps, setIsGettingGps] = useState(false);

  // Scanned Session State
  const [scannedData, setScannedData] = useState(null);
  const [selectedPin, setSelectedPin] = useState(null);
  const [claimTicket, setClaimTicket] = useState(null);
  const [staggerDelay, setStaggerDelay] = useState(0);

  // Verification Output
  const [verificationResult, setVerificationResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  // Camera & Video Refs
  const qrScannerRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // 1. Acquire GPS upon page load
  useEffect(() => {
    requestGpsLocation();
  }, []);

  const requestGpsLocation = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by this browser');
      return;
    }
    setIsGettingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyMeters: pos.coords.accuracy
        });
        setIsGettingGps(false);
      },
      (err) => {
        setGpsError(err.message);
        setIsGettingGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Student login / forced password change
  const handleStudentLogin = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const res = await api.post('/student-portal/login', {
        rollNumber: loginRoll.trim().toUpperCase(),
        password: loginPassword
      });
      saveStudentSession(res.data.token, res.data.student);
      setStudentToken(res.data.token);
      setStudent(res.data.student);
      localStorage.setItem('campustrack_roll', res.data.student.rollNumber);
      if (res.data.mustChangePassword) {
        setStep('SET_PASSWORD');
      } else {
        setLoginPassword('');
        setStep('INIT');
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.error || 'Login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetPassword = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const res = await api.post(
        '/student-portal/change-password',
        { currentPassword: loginPassword, newPassword },
        { headers: studentAuthHeaders(studentToken) }
      );
      saveStudentSession(res.data.token, res.data.student);
      setStudentToken(res.data.token);
      setStudent(res.data.student);
      setLoginPassword('');
      setNewPassword('');
      setStep('INIT');
    } catch (err) {
      if (err.response?.status === 401 && err.response?.data?.code === 'LOGIN_REQUIRED') {
        handleLogout();
        setErrorMessage('Session expired. Please log in again.');
      } else {
        setErrorMessage(err.response?.data?.error || 'Could not update password');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    stopQrScanner();
    clearStudentSession();
    setStudentToken(null);
    setStudent(null);
    setLoginPassword('');
    setStep('LOGIN');
  };

  // Returns true if the error was an auth problem and has been handled.
  const handleAuthError = (err) => {
    const status = err.response?.status;
    const code = err.response?.data?.code;
    if (status === 401) {
      handleLogout();
      setErrorMessage('Please log in again.');
      return true;
    }
    if (code === 'PASSWORD_CHANGE_REQUIRED') {
      setErrorMessage(err.response.data.error);
      setStep('SET_PASSWORD');
      return true;
    }
    return false;
  };

  // 2. Start Rear Camera QR Scanner
  const startQrScanner = async () => {
    if (!studentToken) {
      setStep('LOGIN');
      return;
    }
    setErrorMessage('');
    setStep('SCANNING_QR');

    // Slight delay to allow DOM element to render
    setTimeout(async () => {
      try {
        const scanner = new Html5Qrcode('qr-reader');
        qrScannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            handleQrDecoded(decodedText);
          },
          () => {}
        );
      } catch (err) {
        console.error('QR Scanner start error:', err);
      }
    }, 150);
  };

  const stopQrScanner = async () => {
    if (qrScannerRef.current) {
      try {
        await qrScannerRef.current.stop();
        qrScannerRef.current.clear();
      } catch {}
      qrScannerRef.current = null;
    }
  };

  // 3. Handle QR Code Detection (Conditional Line-of-Sight PIN vs Fast Mode)
  const handleQrDecoded = async (text) => {
    await stopQrScanner();

    try {
      // Parse QR JSON payload: { s: sessionId, t: token, ts: timestamp, rp: requirePin }
      const payload = JSON.parse(text);
      setScannedData(payload);
      setSelectedPin(null);
      setErrorMessage('');

      // The token is checked the moment it is scanned. If the session uses the
      // Line-of-Sight PIN, the server answers PIN_REQUIRED and the keypad opens.
      executeClaim(payload);
    } catch (err) {
      // Fallback: If raw pipe string e.g. "CS301|sessionId|token|ts|requirePin"
      const parts = text.split('|');
      if (parts.length >= 3) {
        const payload = { s: parts[1], t: parts[2], ts: parseInt(parts[3]), rp: parts[4] === '1' };
        setScannedData(payload);
        setSelectedPin(null);
        setErrorMessage('');
        executeClaim(payload);
      } else {
        setErrorMessage('Unrecognized QR code format. Please scan the official projector code.');
        setStep('ERROR');
      }
    }
  };

  const beginStagger = (data) => {
    setClaimTicket(data.claimTicket);
    setStaggerDelay(data.assignedDelayMs || 0);
    setStep('CLAIM_CONFIRMED');

    // Countdown before opening front camera
    const delayMs = data.assignedDelayMs || 1000;
    setTimeout(() => {
      startFaceVerification();
    }, delayMs);
  };

  // 4. Phase 1: Presence claim — the scanned token is verified immediately
  const executeClaim = async (payload) => {
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const res = await api.post(
        '/attendance/claim',
        {
          sessionId: payload.s,
          scannedToken: payload.t,
          clientGps: gpsRef.current
        },
        { headers: studentAuthHeaders(studentToken) }
      );

      if (res.data.status === 'PIN_REQUIRED') {
        setClaimTicket(res.data.claimTicket);
        setSelectedPin(null);
        setStep('ENTER_PIN');
        return;
      }
      beginStagger(res.data);
    } catch (err) {
      if (handleAuthError(err)) return;
      setErrorMessage(err.response?.data?.error || 'Claim rejected');
      setStep('ERROR');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4b. Line-of-Sight PIN — sent as a second step so it does not race the 4 s token
  const handlePinSelected = async (digit) => {
    setSelectedPin(digit);
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const res = await api.post(
        '/attendance/claim/pin',
        { claimTicket, pin: digit },
        { headers: studentAuthHeaders(studentToken) }
      );
      beginStagger(res.data);
    } catch (err) {
      if (handleAuthError(err)) return;
      const errCode = err.response?.data?.code;
      const errMsg = err.response?.data?.error || 'PIN rejected';
      if (errCode === 'PIN_MISMATCH' || errCode === 'PIN_REQUIRED') {
        const left = err.response?.data?.attemptsLeft;
        setSelectedPin(null);
        setErrorMessage(left ? `${errMsg} (${left} attempt${left === 1 ? '' : 's'} left)` : errMsg);
      } else {
        setErrorMessage(errMsg);
        setStep('ERROR');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // 5. Phase 2: Start Front Camera Face Capture
  const startFaceVerification = async () => {
    setStep('FACE_VERIFY');

    setTimeout(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        setErrorMessage('Unable to access front camera: ' + err.message);
        setStep('ERROR');
      }
    }, 150);
  };

  // 6. Capture burst frames and submit
  const captureAndVerify = async () => {
    if (!videoRef.current || !claimTicket) return;
    setIsSubmitting(true);
    setIsCapturing(true);

    const video = videoRef.current;
    const canvas = canvasRef.current || document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');

    const frames = [];
    const NUM_BURST = 12;

    try {
      // Capture 12 frames over ~900ms for a natural, relaxed blink window
      for (let i = 0; i < NUM_BURST; i++) {
        // Center crop square from video
        const minDim = Math.min(video.videoWidth, video.videoHeight);
        const startX = (video.videoWidth - minDim) / 2;
        const startY = (video.videoHeight - minDim) / 2;

        ctx.drawImage(video, startX, startY, minDim, minDim, 0, 0, 320, 320);

        const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
        frames.push(blob);
        await new Promise((r) => setTimeout(r, 75)); // 75ms gap
      }
    } finally {
      setIsCapturing(false);
    }

    // Stop camera tracks
    if (video.srcObject) {
      video.srcObject.getTracks().forEach((t) => t.stop());
    }

    // Submit to Phase 2 verify endpoint
    const formData = new FormData();
    formData.append('claimTicket', claimTicket);
    frames.forEach((blob, idx) => {
      formData.append('images', blob, `frame_${idx}.jpg`);
    });

    try {
      const res = await api.post('/attendance/verify', formData, {
        headers: { ...studentAuthHeaders(studentToken), 'Content-Type': 'multipart/form-data' }
      });

      setVerificationResult(res.data);
      setStep('SUCCESS');
    } catch (err) {
      if (handleAuthError(err)) return;
      setErrorMessage(err.response?.data?.error || 'Biometric verification failed');
      setStep('ERROR');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '460px', margin: '0 auto', padding: '1.25rem 1rem' }}>
      
      {/* Header Badge */}
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <div className="badge badge-emerald" style={{ marginBottom: '0.5rem' }}>
          <Sparkles size={13} /> RollOne Verification
        </div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Lecture Attendance</h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Physical proximity check + FaceNet liveness verification
        </p>
      </div>

      {/* GPS Status Pill */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        padding: '0.65rem 1rem', 
        background: 'var(--bg-card)', 
        borderRadius: '10px', 
        border: '1px solid var(--border-subtle)',
        marginBottom: '1.25rem',
        fontSize: '0.8rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <MapPin size={16} color={gps ? 'var(--accent-emerald)' : 'var(--accent-amber)'} />
          <span>{gps ? `GPS Locked (±${Math.round(gps.accuracyMeters)}m)` : 'Acquiring GPS location...'}</span>
        </div>
        <button onClick={requestGpsLocation} className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}>
          <RefreshCw size={12} className={isGettingGps ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {/* STEP 0: STUDENT LOGIN */}
      {step === 'LOGIN' && (
        <form onSubmit={handleStudentLogin} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ fontSize: '1rem', fontWeight: 700 }}>Log in to mark attendance</div>
          {errorMessage && (
            <div style={{ color: 'var(--accent-red)', fontSize: '0.82rem', fontWeight: 600 }}>{errorMessage}</div>
          )}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Roll Number</label>
            <input
              type="text"
              placeholder="e.g. 2023UGCS042"
              value={loginRoll}
              onChange={(e) => setLoginRoll(e.target.value.toUpperCase())}
              className="form-input mono"
              autoComplete="username"
              required
              style={{ fontSize: '1.05rem', fontWeight: 700, letterSpacing: '1px', textAlign: 'center' }}
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Password</label>
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              className="form-input"
              autoComplete="current-password"
              required
            />
          </div>
          <button type="submit" disabled={isSubmitting} className="btn btn-emerald" style={{ padding: '0.8rem' }}>
            {isSubmitting ? 'Logging in...' : 'Log In'}
          </button>
          <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            First time? Your password is your roll number in lower case. You will be asked to change it.
          </div>
        </form>
      )}

      {/* STEP 0.5: FORCED PASSWORD CHANGE */}
      {step === 'SET_PASSWORD' && (
        <form onSubmit={handleSetPassword} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ fontSize: '1rem', fontWeight: 700 }}>Set a new password</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Your current password is your roll number, which anyone could guess. Choose a new one (at least 8 characters).
          </div>
          {errorMessage && (
            <div style={{ color: 'var(--accent-red)', fontSize: '0.82rem', fontWeight: 600 }}>{errorMessage}</div>
          )}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Current Password</label>
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              className="form-input"
              autoComplete="current-password"
              required
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="form-input"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <button type="submit" disabled={isSubmitting} className="btn btn-emerald" style={{ padding: '0.8rem' }}>
            {isSubmitting ? 'Saving...' : 'Save Password'}
          </button>
          <button type="button" onClick={handleLogout} className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>
            Use a different account
          </button>
        </form>
      )}

      {/* STEP 1: LOGGED IN — START SCAN */}
      {step === 'INIT' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Logged in as</div>
              <div style={{ fontWeight: 700 }}>{student?.name || 'Student'}</div>
              <div className="mono" style={{ fontSize: '0.85rem', color: 'var(--accent-cyan)' }}>{rollNumber}</div>
            </div>
            <button onClick={handleLogout} className="btn btn-secondary" style={{ padding: '0.35rem 0.7rem', fontSize: '0.78rem' }}>
              Log out
            </button>
          </div>

          <button onClick={startQrScanner} className="btn btn-emerald" style={{ padding: '0.85rem', fontSize: '1rem' }}>
            <Camera size={20} /> Open Camera & Scan Projector
          </button>

          <div style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Point your rear camera at the classroom projector screen. The code rotates every 4 seconds.
          </div>
        </div>
      )}

      {/* STEP 2: SCANNING QR WITH REAR CAMERA */}
      {step === 'SCANNING_QR' && (
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem' }}>
            Point Camera at Classroom Projector
          </div>

          <div id="qr-reader" style={{ width: '100%', borderRadius: '12px', overflow: 'hidden', border: '2px solid var(--accent-cyan)' }} />

          <button onClick={() => { stopQrScanner(); setStep('INIT'); }} className="btn btn-secondary" style={{ marginTop: '1rem', width: '100%' }}>
            Cancel Scan
          </button>
        </div>
      )}

      {/* STEP 2.5: LINE-OF-SIGHT CHALLENGE PIN (SEE & TAP NUMBER) */}
      {step === 'ENTER_PIN' && (
        <div className="card" style={{ textAlign: 'center', padding: '1.75rem 1.25rem' }}>
          <div className="badge badge-emerald" style={{ marginBottom: '0.75rem', fontSize: '0.8rem' }}>
            <Eye size={14} /> Line-of-Sight Verification
          </div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: '0.35rem' }}>
            Tap the Screen PIN
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: '1.4' }}>
            Glance up at the projector screen and tap the active <strong>Challenge PIN (1–9)</strong>:
          </p>

          {errorMessage && (
            <div style={{ 
              background: 'rgba(239, 68, 68, 0.12)', 
              border: '1px solid var(--accent-red)', 
              borderRadius: '8px', 
              padding: '0.6rem 0.85rem', 
              marginBottom: '1.25rem',
              color: 'var(--accent-red)',
              fontSize: '0.82rem',
              fontWeight: 600,
              textAlign: 'left'
            }}>
              {errorMessage}
            </div>
          )}

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(3, 1fr)', 
            gap: '0.75rem', 
            maxWidth: '280px', 
            margin: '0 auto 1.5rem' 
          }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
              <button
                key={digit}
                onClick={() => handlePinSelected(digit)}
                disabled={isSubmitting}
                style={{
                  height: '62px',
                  fontSize: '1.65rem',
                  fontWeight: 800,
                  borderRadius: '12px',
                  background: selectedPin === digit ? 'var(--accent-emerald)' : '#181820',
                  color: selectedPin === digit ? '#000000' : '#ffffff',
                  border: selectedPin === digit ? '2px solid #34d399' : '1px solid #272730',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  transition: 'all 0.12s ease',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: isSubmitting && selectedPin !== digit ? 0.5 : 1
                }}
              >
                {digit}
              </button>
            ))}
          </div>

          <button 
            onClick={() => { setSelectedPin(null); setErrorMessage(''); setStep('SCANNING_QR'); startQrScanner(); }} 
            disabled={isSubmitting}
            className="btn btn-secondary" 
            style={{ width: '100%', fontSize: '0.85rem' }}
          >
            Rescan Projector QR
          </button>
        </div>
      )}

      {/* STEP 3: CLAIM CONFIRMED & STAGGER DELAY */}
      {step === 'CLAIM_CONFIRMED' && (
        <div className="card" style={{ textAlign: 'center', padding: '2rem 1.5rem' }}>
          <div style={{ 
            width: '60px', 
            height: '60px', 
            background: 'var(--accent-cyan-subtle)', 
            borderRadius: '50%', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            margin: '0 auto 1rem'
          }}>
            <Clock size={32} color="var(--accent-cyan)" />
          </div>

          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.4rem' }}>
            Phase 1: Claim Reserved!
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            Rotating token verified within time window. Allocating upload slot to protect server concurrency...
          </p>

          <div className="badge badge-cyan" style={{ fontSize: '0.85rem', padding: '0.4rem 0.9rem' }}>
            Starting Biometrics in {(staggerDelay / 1000).toFixed(1)}s...
          </div>
        </div>
      )}

      {/* STEP 4: FRONT CAMERA FACE & BLINK VERIFICATION */}
      {step === 'FACE_VERIFY' && (
        <div className="card" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.2rem' }}>
            Phase 2: Face Liveness Check
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Position face in the circle. Tap the button below and blink naturally.
          </p>

          <div style={{ 
            position: 'relative', 
            width: '280px', 
            height: '280px', 
            borderRadius: '50%', 
            overflow: 'hidden', 
            border: isCapturing ? '4px solid var(--accent-cyan)' : '3px solid var(--accent-emerald)', 
            boxShadow: isCapturing ? '0 0 30px rgba(6, 182, 212, 0.5)' : '0 0 25px rgba(16, 185, 129, 0.25)',
            transition: 'all 0.3s ease'
          }}>
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} 
            />
            {isCapturing && (
              <div style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0, 0, 0, 0.45)',
                color: '#fff',
                fontWeight: 700,
                fontSize: '1.05rem',
                textShadow: '0 2px 6px rgba(0,0,0,0.9)'
              }}>
                <span style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>👁️</span>
                <span>Blink now!</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--accent-cyan)', marginTop: '0.2rem' }}>Sampling burst...</span>
              </div>
            )}
          </div>

          <button 
            onClick={captureAndVerify} 
            disabled={isSubmitting}
            className="btn btn-emerald" 
            style={{ width: '100%', marginTop: '1.5rem', padding: '0.85rem', fontSize: '1rem' }}
          >
            <Eye size={20} /> {isCapturing ? 'Capturing blink burst...' : isSubmitting ? 'Verifying FaceNet Embedding...' : 'Blink & Verify Attendance'}
          </button>
        </div>
      )}

      {/* STEP 5: SUCCESS STATE */}
      {step === 'SUCCESS' && (
        <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem', border: '2px solid var(--accent-emerald)' }}>
          <div style={{ 
            width: '64px', 
            height: '64px', 
            background: 'var(--accent-emerald-subtle)', 
            borderRadius: '50%', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            margin: '0 auto 1rem'
          }}>
            <CheckCircle2 size={38} color="var(--accent-emerald)" />
          </div>

          <span className="badge badge-emerald" style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            Verified Present ✓
          </span>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.5rem' }}>
            Attendance Recorded!
          </h2>

          <div style={{ background: 'var(--bg-main)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '1rem', marginTop: '1.25rem', textAlign: 'left', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div>Roll Number: <strong className="mono" style={{ color: 'var(--accent-cyan)' }}>{rollNumber}</strong></div>
            <div>Student Name: <strong style={{ color: 'var(--text-primary)' }}>{verificationResult?.student?.name || 'Verified Student'}</strong></div>
            <div>Match Confidence: <strong style={{ color: 'var(--accent-emerald)' }}>{verificationResult?.metrics?.similarity != null ? `${(verificationResult.metrics.similarity * 100).toFixed(1)}%` : 'First scan, face enrolled'}</strong></div>
            {verificationResult?.status === 'FLAGGED' && (
              <div style={{ color: 'var(--accent-amber)' }}>Your faculty will confirm your enrolled face.</div>
            )}
            <div>Timestamp: <strong style={{ color: 'var(--text-primary)' }}>{new Date().toLocaleTimeString()}</strong></div>
          </div>

          <button onClick={() => setStep('INIT')} className="btn btn-secondary" style={{ marginTop: '1.5rem', width: '100%' }}>
            Done / Exit
          </button>
        </div>
      )}

      {/* ERROR STATE */}
      {step === 'ERROR' && (
        <div className="card" style={{ textAlign: 'center', padding: '2rem 1.5rem', border: '1px solid var(--accent-red)' }}>
          <div style={{ 
            width: '56px', 
            height: '56px', 
            background: 'rgba(239, 68, 68, 0.12)', 
            borderRadius: '50%', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            margin: '0 auto 1rem'
          }}>
            <ShieldAlert size={32} color="var(--accent-red)" />
          </div>

          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--accent-red)', marginBottom: '0.5rem' }}>
            Attendance Rejected
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: '1.4' }}>
            {errorMessage}
          </p>

          <div style={{ background: 'var(--bg-main)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '0.75rem', marginBottom: '1.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'left', lineHeight: '1.4' }}>
            💡 <strong>Verification Tip:</strong> Hold phone at eye level. When tapping "Blink & Verify", blink firmly (close eyelids and reopen) during the 1-second capture window.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {claimTicket && (
              <button 
                onClick={() => startFaceVerification()} 
                className="btn btn-emerald" 
                style={{ width: '100%' }}
              >
                <Eye size={18} /> Retry Face & Blink Check
              </button>
            )}
            <button 
              onClick={() => { setClaimTicket(null); setStep('INIT'); }} 
              className="btn btn-secondary" 
              style={{ width: '100%' }}
            >
              Scan Official QR Again
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
