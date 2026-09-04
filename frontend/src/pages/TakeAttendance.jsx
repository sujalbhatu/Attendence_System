import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Square, ScanFace, RefreshCw, Camera, ShieldCheck, Eye } from 'lucide-react';
import WebcamCapture from '../components/WebcamCapture';
import AttendanceTable from '../components/AttendanceTable';
import { api } from '../services/api';

export default function TakeAttendance() {
  const [section, setSection] = useState('CSE-A');
  const [sections, setSections] = useState([]);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [blinkPrompt, setBlinkPrompt] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [records, setRecords] = useState([]);
  const [autoScan, setAutoScan] = useState(false);
  const [livenessEnabled, setLivenessEnabled] = useState(() => {
    const saved = localStorage.getItem('app_settings');
    return saved ? JSON.parse(saved).livenessDetection !== false : true;
  });
  const webcamRef = useRef(null);
  const autoScanInterval = useRef(null);

  useEffect(() => {
    const loadSections = async () => {
      try {
        const res = await api.getSections();
        if (res.data && res.data.length > 0) {
          setSections(res.data);
          setSection(res.data[0]);
        }
      } catch (err) {
        console.error('Failed to load sections', err);
      }
    };
    loadSections();
  }, []);

  const startSession = async () => {
    try {
      const res = await api.startSession(section);
      setSessionId(res.data?._id || null);
      setIsSessionActive(true);
      setRecords([]);
    } catch (err) {
      console.error('Failed to start session', err);
      setIsSessionActive(true);
      setRecords([]);
    }
  };

  const endSession = async () => {
    try {
      if (sessionId) {
        await api.endSession(sessionId);
      }
    } catch (err) {
      console.error('Failed to end session', err);
    }
    setIsSessionActive(false);
    setAutoScan(false);
    setScanResult(null);
    setBlinkPrompt(false);
    setSessionId(null);
  };

  // 1. ACTIVE BLINK CHALLENGE PROTOCOL (Industry Standard Anti-Spoof)
  const handleBlinkScan = useCallback(async () => {
    if (!webcamRef.current) return;
    
    setIsScanning(true);
    setScanResult(null);
    setBlinkPrompt(true);

    try {
      // High-frequency stream sampling: 8 frames with 65ms gap (total 520ms) - completely eliminates blind spots!
      const frames = await webcamRef.current.captureBurst(8, 65);
      setBlinkPrompt(false);

      if (!frames || frames.length < 3) throw new Error('Could not capture burst frames');

      const savedSettings = localStorage.getItem('app_settings');
      const settings = savedSettings ? JSON.parse(savedSettings) : { confidenceThreshold: 0.70 };

      const formData = new FormData();
      formData.append('section', section);
      formData.append('threshold', settings.confidenceThreshold || 0.70);
      formData.append('mode', 'blink');
      formData.append('liveness', 'true');

      frames.forEach((f, idx) => {
        formData.append('images', f, `burst_${idx}.jpg`);
      });

      const response = await api.recognizeFace(formData);
      const resData = response.data || response;

      if (resData.spoof_detected) {
        setScanResult({
          type: 'spoof',
          message: resData.message || '🛡️ Spoof Rejected: Static photo detected (no eye blink)!'
        });
        return;
      }

      if (resData.matched) {
        const student = {
          id: resData.studentId || resData.student_id,
          name: resData.studentName || resData.student_name || 'Unknown',
          rollNumber: resData.rollNumber || '',
          timestamp: new Date().toISOString(),
          confidence: resData.confidence || 0,
          blinkVerified: true
        };
        
        setScanResult({ 
          type: 'success', 
          name: student.name,
          confidence: Math.round((student.confidence || 0) * 100),
          blinkVerified: true
        });
        setRecords(prev => {
          const exists = prev.find(r => r.id === student.id);
          if (exists) return prev;
          return [student, ...prev];
        });
      } else {
        const confText = resData.confidence ? ` (closest: ${Math.round(resData.confidence * 100)}%)` : '';
        setScanResult({ 
          type: 'error', 
          message: (resData.message || resData.error || 'No match found') + confText 
        });
      }
    } catch (err) {
      console.error('Blink scan error:', err);
      setScanResult({ type: 'error', message: err.message || 'Verification failed' });
    } finally {
      setIsScanning(false);
      setBlinkPrompt(false);
      setTimeout(() => setScanResult(null), 3500);
    }
  }, [section]);

  // 2. QUICK SCAN (Direct fast recognition)
  const handleScan = useCallback(async () => {
    if (!webcamRef.current) return;
    
    setIsScanning(true);
    setScanResult(null);
    
    try {
      const blob = await webcamRef.current.capture();
      if (!blob) throw new Error('Failed to capture image');

      const savedSettings = localStorage.getItem('app_settings');
      const settings = savedSettings ? JSON.parse(savedSettings) : { confidenceThreshold: 0.70 };

      const formData = new FormData();
      formData.append('image', blob, 'capture1.jpg');
      formData.append('section', section);
      formData.append('threshold', settings.confidenceThreshold || 0.70);
      formData.append('liveness', livenessEnabled ? 'true' : 'false');

      if (livenessEnabled) {
        await new Promise(r => setTimeout(r, 250));
        const blob2 = await webcamRef.current.capture();
        if (blob2) {
          formData.append('image2', blob2, 'capture2.jpg');
        }
      }
      
      const response = await api.recognizeFace(formData);
      const resData = response.data || response;

      if (resData.spoof_detected) {
        setScanResult({
          type: 'spoof',
          message: resData.message || '⚠️ Spoof Detected: Phone screen or static photo rejected!'
        });
        return;
      }
      
      if (resData.matched) {
        const student = {
          id: resData.studentId || resData.student_id,
          name: resData.studentName || resData.student_name || 'Unknown',
          rollNumber: resData.rollNumber || '',
          timestamp: new Date().toISOString(),
          confidence: resData.confidence || 0
        };
        
        setScanResult({ 
          type: 'success', 
          name: student.name,
          confidence: Math.round((student.confidence || 0) * 100)
        });
        setRecords(prev => {
          const exists = prev.find(r => r.id === student.id);
          if (exists) return prev;
          return [student, ...prev];
        });
      } else {
        const confText = resData.confidence ? ` (closest: ${Math.round(resData.confidence * 100)}%)` : '';
        setScanResult({ 
          type: 'error', 
          message: (resData.message || resData.error || 'No match found') + confText 
        });
      }
    } catch (err) {
      console.error('Scan error:', err);
      setScanResult({ type: 'error', message: err.message || 'Recognition failed' });
    } finally {
      setIsScanning(false);
      setTimeout(() => setScanResult(null), 3500);
    }
  }, [section, livenessEnabled]);

  useEffect(() => {
    if (autoScan && isSessionActive) {
      autoScanInterval.current = setInterval(handleScan, 3000);
    } else {
      clearInterval(autoScanInterval.current);
    }
    
    return () => clearInterval(autoScanInterval.current);
  }, [autoScan, isSessionActive, handleScan]);

  const toggleAutoScan = () => {
    setAutoScan(!autoScan);
  };

  return (
    <div className="container" style={{ maxWidth: '1400px' }}>
      <div className="page-header">
        <h1 className="page-title">Take Attendance</h1>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <select 
            className="input-field" 
            style={{ marginBottom: 0, width: '150px' }}
            value={section}
            onChange={(e) => setSection(e.target.value)}
            disabled={isSessionActive}
          >
            {sections.length > 0 ? sections.map(s => (
              <option key={s} value={s} style={{ background: 'var(--bg-dark-end)' }}>{s}</option>
            )) : (
              <>
                <option value="CSE-A" style={{ background: 'var(--bg-dark-end)' }}>CSE-A</option>
                <option value="CSE-B" style={{ background: 'var(--bg-dark-end)' }}>CSE-B</option>
              </>
            )}
          </select>
          
          {!isSessionActive ? (
            <button className="btn btn-primary" onClick={startSession}>
              <Play size={20} /> Start Session
            </button>
          ) : (
            <button className="btn btn-danger" onClick={endSession}>
              <Square size={20} /> End Session
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '60% 1fr', gap: '2rem' }}>
        {/* Left Side - Camera */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ position: 'relative', marginBottom: '1.5rem', borderRadius: '12px', overflow: 'hidden', flex: 1 }}>
            {isSessionActive ? (
              <>
                <WebcamCapture ref={webcamRef} height="100%" />
                
                {/* Active Blink Prompt Overlay */}
                {blinkPrompt && (
                  <div className="webcam-overlay" style={{ background: 'rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: 'var(--bg-dark-start)', border: '2px solid var(--accent-cyan)', padding: '1.2rem 2.2rem', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem', boxShadow: '0 0 35px rgba(0, 212, 255, 0.4)', animation: 'pulse 1.2s infinite' }}>
                      <Eye size={42} color="var(--accent-cyan)" />
                      <span style={{ fontSize: '1.15rem', fontWeight: 'bold', color: '#fff' }}>👁️ Please Blink Naturally Now...</span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Verifying biological live presence (Anti-Spoof)</span>
                    </div>
                  </div>
                )}

                {/* Standard Scan Pulse */}
                {isScanning && !blinkPrompt && (
                  <div className="webcam-overlay" style={{ background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ border: '2px solid var(--accent-cyan)', padding: '2rem', borderRadius: '50%', animation: 'pulse 1.5s infinite' }}>
                      <ScanFace size={64} color="var(--accent-cyan)" />
                    </div>
                  </div>
                )}
                
                {/* Match Success Badge */}
                {scanResult && scanResult.type === 'success' && (
                  <div className="webcam-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <div style={{ border: '3px solid var(--accent-emerald)', width: '230px', height: '230px', borderRadius: '16px', position: 'relative', boxShadow: '0 0 25px rgba(0, 230, 138, 0.3)' }}>
                      <div style={{ position: 'absolute', bottom: '-48px', left: '50%', transform: 'translateX(-50%)', background: 'var(--accent-emerald)', color: '#000', padding: '0.5rem 1.2rem', borderRadius: '8px', fontWeight: 'bold', whiteSpace: 'nowrap', textAlign: 'center' }}>
                        {scanResult.name} ({scanResult.confidence}%) ✓
                        {scanResult.blinkVerified && <div style={{ fontSize: '0.75rem', fontWeight: '600' }}>👁️ Blink Verified Live</div>}
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Spoof Rejection Alert */}
                {scanResult && scanResult.type === 'spoof' && (
                  <div className="webcam-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <div style={{ border: '3px solid var(--warning-amber)', width: '230px', height: '230px', borderRadius: '16px', position: 'relative', boxShadow: '0 0 25px rgba(255, 165, 2, 0.4)' }}>
                      <div style={{ position: 'absolute', bottom: '-48px', left: '50%', transform: 'translateX(-50%)', background: 'var(--warning-amber)', color: '#000', padding: '0.6rem 1rem', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.85rem', textAlign: 'center', whiteSpace: 'nowrap', maxWidth: '340px' }}>
                        🛡️ Anti-Spoof Alert: Screen/Photo Rejected ✗
                      </div>
                    </div>
                  </div>
                )}

                {/* General Error / Unmatched Badge */}
                {scanResult && scanResult.type === 'error' && (
                  <div className="webcam-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <div style={{ border: '3px solid var(--danger-red)', width: '220px', height: '220px', borderRadius: '16px', position: 'relative' }}>
                      <div style={{ position: 'absolute', bottom: '-40px', left: '50%', transform: 'translateX(-50%)', background: 'var(--danger-red)', color: '#fff', padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: 'bold', whiteSpace: 'nowrap', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {scanResult.message || 'Unknown ✗'}
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ height: '400px', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'var(--text-secondary)' }}>
                <Camera size={64} style={{ opacity: 0.5, marginBottom: '1rem' }} />
                <p>Start a session to activate camera</p>
              </div>
            )}
          </div>
          
          {/* Action Buttons Row */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button 
              className="btn btn-primary" 
              onClick={handleBlinkScan} 
              disabled={!isSessionActive || isScanning}
              style={{ flex: 1, minWidth: '180px', padding: '0.9rem', fontSize: '1.05rem', background: 'linear-gradient(135deg, #00d4ff, #0072ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', boxShadow: '0 4px 15px rgba(0, 212, 255, 0.3)' }}
              title="Active challenge-response eye blink verification"
            >
              <Eye size={22} /> 
              {isScanning && blinkPrompt ? 'Blinking...' : 'Blink & Verify'}
            </button>

            <button 
              className="btn btn-secondary" 
              onClick={handleScan} 
              disabled={!isSessionActive || isScanning}
              style={{ padding: '0.9rem 1.2rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              title="Quick instant scan"
            >
              <ScanFace size={20} /> Quick Scan
            </button>

            <button 
              className={`btn ${livenessEnabled ? 'btn-success' : 'btn-secondary'}`} 
              onClick={() => setLivenessEnabled(!livenessEnabled)}
              title="Toggle Anti-Spoofing / Presentation Attack Detection"
              style={{ padding: '0.9rem 1rem' }}
            >
              <ShieldCheck size={20} />
              {livenessEnabled ? 'Spoof: ON' : 'Spoof: OFF'}
            </button>

            <button 
              className={`btn ${autoScan ? 'btn-success' : 'btn-secondary'}`} 
              onClick={toggleAutoScan}
              disabled={!isSessionActive}
              title="Continuous scanning mode"
              style={{ padding: '0.9rem 1rem' }}
            >
              <RefreshCw size={20} className={autoScan ? 'spin-anim' : ''} />
              {autoScan ? 'Auto: ON' : 'Auto: OFF'}
            </button>
          </div>
        </div>

        {/* Right Side - Log */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 150px)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2>Session Log</h2>
            <span className="badge badge-primary">{records.length} Scanned</span>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
            <AttendanceTable records={records} />
          </div>
        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes pulse { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.08); opacity: 0.85; } 100% { transform: scale(1); opacity: 1; } }
        .spin-anim { animation: spin 2s linear infinite; }
      `}} />
    </div>
  );
}
