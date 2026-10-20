import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, CheckCircle2, MapPin, RefreshCw, ShieldAlert, Clock, ArrowLeft, LogOut } from 'lucide-react';
import api from '../api/client';
import Logo from '../components/Logo';
import ThemeToggle from '../components/ThemeToggle';
import { loadStudentToken, loadStudentData, saveStudentSession, clearStudentSession, studentAuthHeaders } from '../api/studentSession';

const STEP_INDEX = { INIT: 0, SCANNING_QR: 0, ENTER_PIN: 1, CLAIM_CONFIRMED: 2, FACE_VERIFY: 2, SUCCESS: 3, ERROR: -1 };

function Stepper({ step, withPin }) {
  const labels = withPin ? ['Scan', 'PIN', 'Face'] : ['Scan', 'Face'];
  let idx = STEP_INDEX[step] ?? 0;
  if (!withPin && idx >= 2) idx -= 1;
  if (step === 'SUCCESS') idx = labels.length;
  return (
    <div className="steps" aria-label="Progress">
      {labels.map((label, i) => (
        <React.Fragment key={label}>
          {i > 0 && <span className="steps-line" />}
          <span className={`step-pill ${i === idx ? 'on' : i < idx ? 'done' : ''}`}>
            <i>{i < idx ? '✓' : i + 1}</i>
            {label}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

export default function StudentScanner() {
  // 'LOGIN' | 'SET_PASSWORD' | 'INIT' | 'SCANNING_QR' | 'ENTER_PIN' | 'CLAIM_CONFIRMED' | 'FACE_VERIFY' | 'SUCCESS' | 'ERROR'
  const [step, setStep] = useState(() => (loadStudentToken() ? 'INIT' : 'LOGIN'));

  // Student identity comes from their login token, never from a typed roll number
  const [studentToken, setStudentToken] = useState(() => loadStudentToken());
  const [student, setStudent] = useState(() => loadStudentData());
  const [loginRoll, setLoginRoll] = useState(() => localStorage.getItem('campustrack_roll') || '');
  const [loginPassword, setLoginPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const rollNumber = student?.rollNumber || '';

  // gpsRef keeps the latest fix available to the QR callback
  const [gps, setGpsState] = useState(null);
  const gpsRef = useRef(null);
  const setGps = (value) => {
    gpsRef.current = value;
    setGpsState(value);
  };
  const [gpsError, setGpsError] = useState(null);
  const [isGettingGps, setIsGettingGps] = useState(false);

  const [usedPin, setUsedPin] = useState(false);
  const [selectedPin, setSelectedPin] = useState(null);
  const [claimTicket, setClaimTicket] = useState(null);
  const [staggerDelay, setStaggerDelay] = useState(0);

  const [verificationResult, setVerificationResult] = useState(null);
  const [verifiedAt, setVerifiedAt] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  const qrScannerRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    requestGpsLocation();
    return () => {
      stopQrScanner();
      videoRef.current?.srcObject?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const requestGpsLocation = () => {
    if (!navigator.geolocation) {
      setGpsError('Location is not available in this browser');
      return;
    }
    setIsGettingGps(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracyMeters: pos.coords.accuracy });
        setIsGettingGps(false);
      },
      (err) => {
        setGpsError(err.message);
        setIsGettingGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleStudentLogin = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const res = await api.post('/student-portal/login', { rollNumber: loginRoll.trim().toUpperCase(), password: loginPassword });
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
        setErrorMessage('Session expired. Please sign in again.');
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
      setErrorMessage('Please sign in again.');
      return true;
    }
    if (code === 'PASSWORD_CHANGE_REQUIRED') {
      setErrorMessage(err.response.data.error);
      setStep('SET_PASSWORD');
      return true;
    }
    return false;
  };

  const startQrScanner = async () => {
    if (!studentToken) {
      setStep('LOGIN');
      return;
    }
    setErrorMessage('');
    setUsedPin(false);
    setStep('SCANNING_QR');

    // Let the #qr-reader element render first
    setTimeout(async () => {
      try {
        const scanner = new Html5Qrcode('qr-reader');
        qrScannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText) => handleQrDecoded(decodedText),
          () => {}
        );
      } catch (err) {
        console.error('QR Scanner start error:', err);
        setErrorMessage('Could not open the camera. Allow camera access for this site and try again.');
        setStep('ERROR');
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

  const handleQrDecoded = async (text) => {
    await stopQrScanner();
    try {
      // { s: sessionId, t: token, ts: timestamp, rp: requirePin }
      const payload = JSON.parse(text);
      setSelectedPin(null);
      setErrorMessage('');
      // The token is checked the moment it is scanned. If the session uses the
      // Line-of-Sight PIN, the server answers PIN_REQUIRED and the keypad opens.
      executeClaim(payload);
    } catch {
      // Older pipe format: "CS301|sessionId|token|ts|requirePin"
      const parts = text.split('|');
      if (parts.length >= 3) {
        setSelectedPin(null);
        setErrorMessage('');
        executeClaim({ s: parts[1], t: parts[2], ts: parseInt(parts[3], 10), rp: parts[4] === '1' });
      } else {
        setErrorMessage('That isn’t a RollOne code. Scan the code on the classroom projector.');
        setStep('ERROR');
      }
    }
  };

  const beginStagger = (data) => {
    setClaimTicket(data.claimTicket);
    setStaggerDelay(data.assignedDelayMs || 0);
    setStep('CLAIM_CONFIRMED');
    setTimeout(() => startFaceVerification(), data.assignedDelayMs || 1000);
  };

  // Phase 1: presence claim; the scanned token is verified immediately
  const executeClaim = async (payload) => {
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const res = await api.post(
        '/attendance/claim',
        { sessionId: payload.s, scannedToken: payload.t, clientGps: gpsRef.current },
        { headers: studentAuthHeaders(studentToken) }
      );
      if (res.data.status === 'PIN_REQUIRED') {
        setClaimTicket(res.data.claimTicket);
        setSelectedPin(null);
        setUsedPin(true);
        setStep('ENTER_PIN');
        return;
      }
      beginStagger(res.data);
    } catch (err) {
      if (handleAuthError(err)) return;
      setErrorMessage(err.response?.data?.error || 'Check-in rejected');
      setStep('ERROR');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Phase 1b: Line-of-Sight PIN, sent as a second step so it does not race the 4 s token
  const handlePinSelected = async (digit) => {
    setSelectedPin(digit);
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const res = await api.post('/attendance/claim/pin', { claimTicket, pin: digit }, { headers: studentAuthHeaders(studentToken) });
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

  // Phase 2: front camera
  const startFaceVerification = async () => {
    setErrorMessage('');
    setStep('FACE_VERIFY');
    setTimeout(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } });
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err) {
        setErrorMessage('Unable to open the front camera: ' + err.message);
        setStep('ERROR');
      }
    }, 150);
  };

  // 12 frames over ~900 ms gives a natural blink window
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

    try {
      for (let i = 0; i < 12; i++) {
        const minDim = Math.min(video.videoWidth, video.videoHeight);
        ctx.drawImage(video, (video.videoWidth - minDim) / 2, (video.videoHeight - minDim) / 2, minDim, minDim, 0, 0, 320, 320);
        frames.push(await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85)));
        await new Promise((r) => setTimeout(r, 75));
      }
    } finally {
      setIsCapturing(false);
    }

    video.srcObject?.getTracks().forEach((t) => t.stop());

    const formData = new FormData();
    formData.append('claimTicket', claimTicket);
    frames.forEach((blob, idx) => formData.append('images', blob, `frame_${idx}.jpg`));

    try {
      const res = await api.post('/attendance/verify', formData, {
        headers: { ...studentAuthHeaders(studentToken), 'Content-Type': 'multipart/form-data' }
      });
      setVerificationResult(res.data);
      setVerifiedAt(new Date());
      setStep('SUCCESS');
    } catch (err) {
      if (handleAuthError(err)) return;
      setErrorMessage(err.response?.data?.error || 'Face verification failed');
      setStep('ERROR');
    } finally {
      setIsSubmitting(false);
    }
  };

  const signedIn = !['LOGIN', 'SET_PASSWORD'].includes(step);

  return (
    <div className="scan">
      <div className="scan-top">
        <Logo />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <ThemeToggle />
          {signedIn && (
            <button onClick={handleLogout} className="btn btn-ghost btn-sm" aria-label="Sign out">
              <LogOut size={14} /> Sign out
            </button>
          )}
        </div>
      </div>

      {signedIn && step !== 'ERROR' && (
        <>
          <div style={{ marginBottom: '0.9rem' }}>
            <div className="eyebrow">Checking in as</div>
            <div style={{ fontWeight: 600, marginTop: '0.15rem' }}>
              {student?.name || 'Student'} <span className="mono muted" style={{ fontWeight: 400, fontSize: '0.85rem' }}>{rollNumber}</span>
            </div>
          </div>
          <Stepper step={step} withPin={usedPin} />
        </>
      )}

      {signedIn && (
        <div className="gps-line">
          <span>
            <MapPin size={15} style={{ color: gps ? 'var(--present)' : gpsError ? 'var(--absent)' : 'var(--flagged)' }} />
            {gps ? `Location found, ±${Math.round(gps.accuracyMeters)} m` : gpsError ? 'Location blocked: allow it for this site' : 'Finding your location…'}
          </span>
          <button onClick={requestGpsLocation} className="btn btn-ghost btn-sm" aria-label="Refresh location">
            <RefreshCw size={13} className={isGettingGps ? 'spin' : ''} />
          </button>
        </div>
      )}

      {step === 'LOGIN' && (
        <form onSubmit={handleStudentLogin} className="panel scan-card">
          <h2>Sign in to check in</h2>
          <p>Use your roll number and the password your faculty gave you.</p>
          {errorMessage && <div className="alert alert-error" style={{ marginTop: '1rem' }}><ShieldAlert size={16} /><span>{errorMessage}</span></div>}
          <div className="field" style={{ marginTop: '1.25rem' }}>
            <label className="label" htmlFor="roll">Roll number</label>
            <input
              id="roll"
              className="input mono"
              value={loginRoll}
              onChange={(e) => setLoginRoll(e.target.value.toUpperCase())}
              placeholder="2023UGCS042"
              autoComplete="username"
              autoCapitalize="characters"
              required
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="pw">Password</label>
            <input id="pw" type="password" className="input" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} autoComplete="current-password" required />
          </div>
          <button type="submit" disabled={isSubmitting} className="btn btn-primary btn-lg btn-block">
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="hint" style={{ marginTop: '1rem', textAlign: 'center' }}>
            First time? You’ll be asked to choose your own password.
          </p>
        </form>
      )}

      {step === 'SET_PASSWORD' && (
        <form onSubmit={handleSetPassword} className="panel scan-card">
          <h2>Choose your password</h2>
          <p>Replace the temporary password with one only you know. At least 8 characters.</p>
          {errorMessage && <div className="alert alert-error" style={{ marginTop: '1rem' }}><ShieldAlert size={16} /><span>{errorMessage}</span></div>}
          <div className="field" style={{ marginTop: '1.25rem' }}>
            <label className="label" htmlFor="cur">Current password</label>
            <input id="cur" type="password" className="input" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} autoComplete="current-password" required />
          </div>
          <div className="field">
            <label className="label" htmlFor="new">New password</label>
            <input id="new" type="password" className="input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
          </div>
          <button type="submit" disabled={isSubmitting} className="btn btn-primary btn-lg btn-block">{isSubmitting ? 'Saving…' : 'Save and continue'}</button>
          <button type="button" onClick={handleLogout} className="btn btn-ghost btn-block" style={{ marginTop: '0.5rem' }}>Use a different account</button>
        </form>
      )}

      {step === 'INIT' && (
        <div className="panel scan-card">
          <h2>Scan the projector</h2>
          <p>Point your back camera at the code on the classroom screen. It changes every few seconds, so scan it live.</p>
          <button onClick={startQrScanner} className="btn btn-primary btn-lg btn-block" style={{ marginTop: '1.25rem' }}>
            <Camera size={18} /> Open camera
          </button>
        </div>
      )}

      {step === 'SCANNING_QR' && (
        <div className="panel scan-card">
          <h2>Hold steady</h2>
          <p>Fit the code inside the square.</p>
          <div className="qr-frame">
            <div id="qr-reader" style={{ width: '100%' }} />
          </div>
          <button onClick={() => { stopQrScanner(); setStep('INIT'); }} className="btn btn-secondary btn-block" style={{ marginTop: '1rem' }}>
            Cancel
          </button>
        </div>
      )}

      {step === 'ENTER_PIN' && (
        <div className="panel scan-card" style={{ textAlign: 'center' }}>
          <h2>Tap the number on the screen</h2>
          <p>Look up at the projector. The large digit next to the code is your PIN.</p>
          {errorMessage && <div className="alert alert-error" style={{ marginTop: '1rem', textAlign: 'left' }}><ShieldAlert size={16} /><span>{errorMessage}</span></div>}
          <div className="keypad">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
              <button key={digit} type="button" className="key" onClick={() => handlePinSelected(digit)} disabled={isSubmitting} aria-pressed={selectedPin === digit}>
                {digit}
              </button>
            ))}
          </div>
          <button
            onClick={() => { setSelectedPin(null); setErrorMessage(''); startQrScanner(); }}
            disabled={isSubmitting}
            className="btn btn-ghost btn-block"
          >
            Scan the code again
          </button>
        </div>
      )}

      {step === 'CLAIM_CONFIRMED' && (
        <div className="panel scan-card" style={{ textAlign: 'center' }}>
          <div className="result-icon wait"><Clock size={26} /></div>
          <h2>Code accepted</h2>
          <p>Your place is held. The face check opens in {(staggerDelay / 1000).toFixed(1)} s so the whole class doesn’t upload at once.</p>
        </div>
      )}

      {step === 'FACE_VERIFY' && (
        <div className="panel scan-card" style={{ textAlign: 'center' }}>
          <h2>Face check</h2>
          <p>Hold the phone at eye level, then tap the button and blink once, normally.</p>
          <div className={`face-ring ${isCapturing ? 'capturing' : ''}`}>
            <video ref={videoRef} autoPlay playsInline muted />
            {isCapturing && (
              <div className="face-overlay">
                Blink now
                <small>recording 1 second</small>
              </div>
            )}
          </div>
          <canvas ref={canvasRef} hidden />
          <button onClick={captureAndVerify} disabled={isSubmitting} className="btn btn-primary btn-lg btn-block" style={{ marginTop: '1.5rem' }}>
            {isCapturing ? 'Recording…' : isSubmitting ? 'Checking your face…' : 'Start face check'}
          </button>
        </div>
      )}

      {step === 'SUCCESS' && (
        <div className="panel scan-card" style={{ textAlign: 'center' }}>
          <div className="result-icon ok"><CheckCircle2 size={30} /></div>
          <h2>{verificationResult?.status === 'FLAGGED' ? 'Recorded, pending review' : 'You’re marked present'}</h2>
          <p>
            {verificationResult?.status === 'FLAGGED'
              ? 'Your faculty will confirm this check-in.'
              : 'You can put your phone away.'}
          </p>
          <dl className="receipt" style={{ textAlign: 'left' }}>
            <div><dt>Roll number</dt><dd className="mono">{rollNumber}</dd></div>
            <div><dt>Name</dt><dd>{verificationResult?.student?.name || student?.name || '—'}</dd></div>
            <div>
              <dt>Face match</dt>
              <dd className="mono">
                {verificationResult?.metrics?.similarity != null ? `${(verificationResult.metrics.similarity * 100).toFixed(1)}%` : 'first check-in, face saved'}
              </dd>
            </div>
            <div><dt>Time</dt><dd className="mono">{verifiedAt?.toLocaleTimeString()}</dd></div>
          </dl>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem' }}>
            <Link to="/my-attendance" className="btn btn-secondary" style={{ flex: 1 }}>My attendance</Link>
            <button onClick={() => setStep('INIT')} className="btn btn-ghost" style={{ flex: 1 }}>Done</button>
          </div>
        </div>
      )}

      {step === 'ERROR' && (
        <div className="panel scan-card" style={{ textAlign: 'center' }}>
          <div className="result-icon bad"><ShieldAlert size={28} /></div>
          <h2>Not checked in</h2>
          <p>{errorMessage}</p>
          <div className="alert alert-info" style={{ marginTop: '1.25rem', textAlign: 'left' }}>
            <span>
              For the face check: face the light, hold the phone at eye level, and blink fully once while it records.
              For location errors, turn on precise location and step inside the room.
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1.25rem' }}>
            {claimTicket && (
              <button onClick={startFaceVerification} className="btn btn-primary btn-block">Try the face check again</button>
            )}
            <button onClick={() => { setClaimTicket(null); startQrScanner(); }} className="btn btn-secondary btn-block">Scan the code again</button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 'auto', paddingTop: '2rem', textAlign: 'center', fontSize: '0.8rem' }}>
        <Link to="/my-attendance" className="link" style={{ color: 'var(--ink-3)' }}>
          <ArrowLeft size={12} style={{ display: 'inline', verticalAlign: '-1px' }} /> My attendance record
        </Link>
      </div>
    </div>
  );
}
