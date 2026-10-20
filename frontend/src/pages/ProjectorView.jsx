import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/client';
import QRCode from 'qrcode';
import { 
  Maximize2, 
  Minimize2, 
  Users, 
  ShieldCheck, 
  Clock, 
  Download, 
  CheckCircle2, 
  Radio, 
  ArrowLeft,
  Lock,
  DoorOpen,
  Sparkles
} from 'lucide-react';

export default function ProjectorView() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Rotating Token State
  const [tokenData, setTokenData] = useState({
    token: '--------',
    pin: 7,
    timestamp: Date.now(),
    expiresInMs: 4000
  });
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [progressPercent, setProgressPercent] = useState(100);

  // Live Roster State
  const [roster, setRoster] = useState([]);
  const [presentCount, setPresentCount] = useState(0);

  // Fetch initial session details
  useEffect(() => {
    api.get(`/sessions/${sessionId}`)
      .then((res) => {
        setSession(res.data.session);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.response?.data?.error || 'Failed to load session');
        setLoading(false);
      });
  }, [sessionId]);

  // Connect to SSE QR Stream.
  // EventSource cannot send an Authorization header, so we first exchange the
  // faculty login for a short-lived projector token scoped to this one session.
  useEffect(() => {
    if (!sessionId) return;
    let eventSource = null;
    let cancelled = false;

    api.post(`/sessions/${sessionId}/projector-token`)
      .then((res) => {
        if (cancelled) return;
        eventSource = new EventSource(
          `/api/sessions/${sessionId}/qr-feed?pt=${encodeURIComponent(res.data.projectorToken)}`
        );

        eventSource.onmessage = async (e) => {
          try {
            const data = JSON.parse(e.data);
            setTokenData(data);
            if (data.requirePin !== undefined) {
              setSession((prev) => prev ? { ...prev, requirePin: data.requirePin } : prev);
            }

            // Encode QR payload with token, session, timestamp, and requirePin flag
            const qrPayload = JSON.stringify({
              s: data.sessionId,
              t: data.token,
              ts: data.timestamp,
              rp: !!data.requirePin
            });

            // Generate clean high-contrast QR SVG/DataURL
            const url = await QRCode.toDataURL(qrPayload, {
              width: 380,
              margin: 1,
              color: {
                dark: '#000000',
                light: '#ffffff'
              }
            });
            setQrDataUrl(url);
          } catch (err) {
            console.error('QR generation error:', err);
          }
        };

        eventSource.onerror = () => {
          console.warn('SSE connection interrupted, retrying...');
        };
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err.response?.status === 401
            ? 'Log in as the faculty who created this session to open the projector.'
            : err.response?.data?.error || 'Could not start the projector feed'
        );
      });

    return () => {
      cancelled = true;
      if (eventSource) eventSource.close();
    };
  }, [sessionId]);

  // Smooth circular timer animation (4000ms loop)
  useEffect(() => {
    // Pushes arrive at each rotation boundary; count down the time this code has left.
    const startTime = Date.now();
    const windowMs = tokenData.expiresInMs || 4000;
    const interval = setInterval(() => {
      const remaining = Math.max(0, windowMs - (Date.now() - startTime));
      setProgressPercent((remaining / 4000) * 100);
    }, 50);

    return () => clearInterval(interval);
  }, [tokenData.token]);

  // Poll live attendance roster every 2 seconds
  useEffect(() => {
    if (!sessionId) return;

    const fetchRoster = () => {
      api.get(`/attendance/live-roster/${sessionId}`)
        .then((res) => {
          setRoster(res.data.roster);
          setPresentCount(res.data.count);
        })
        .catch(() => {});
    };

    fetchRoster();
    const interval = setInterval(fetchRoster, 2000);
    return () => clearInterval(interval);
  }, [sessionId]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const [isExporting, setIsExporting] = useState(false);

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const response = await api.get(`/sessions/${sessionId}/export-csv`, {
        responseType: 'blob'
      });
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const course = session?.courseCode || 'lecture';
      link.setAttribute('download', `attendance_${course}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to export CSV: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsExporting(false);
    }
  };

  const handleConcludeSession = async () => {
    if (window.confirm('Are you sure you want to conclude attendance for this lecture?')) {
      await api.put(`/sessions/${sessionId}/conclude`);
      navigate('/dashboard');
    }
  };

  // Mobile layout state for teacher phone presenter mode ('QR' | 'ROSTER')
  const [mobileTab, setMobileTab] = useState('QR');
  const [isTogglingPin, setIsTogglingPin] = useState(false);

  // Screen Wake Lock API (keeps teacher phone screen bright while presenting)
  useEffect(() => {
    let wakeLock = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator && document.visibilityState === 'visible') {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch {}
    };
    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLock) wakeLock.release().catch(() => {});
    };
  }, []);

  const handleTogglePin = async () => {
    setIsTogglingPin(true);
    try {
      const res = await api.put(`/sessions/${sessionId}/toggle-pin`);
      setSession((prev) => ({ ...prev, requirePin: res.data.requirePin }));
      setTokenData((prev) => ({ ...prev, requirePin: res.data.requirePin }));
    } catch (err) {
      alert('Failed to toggle PIN mode: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsTogglingPin(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', color: 'var(--text-secondary)' }}>
        Loading Projector Stream...
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="main-content" style={{ textAlign: 'center', paddingTop: '4rem' }}>
        <h2 style={{ color: 'var(--accent-red)', marginBottom: '1rem' }}>Session Not Found</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>{error}</p>
        <Link to="/dashboard" className="btn btn-secondary">Back to Dashboard</Link>
      </div>
    );
  }

  const capacity = session.classroomId?.capacity || 70;
  const attendanceRate = Math.min(100, Math.round((presentCount / capacity) * 100));

  return (
    <div className="projector-wrapper">
      {/* Top Projector Header */}
      <header style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        paddingBottom: '1.25rem',
        borderBottom: '1px solid #272730',
        marginBottom: '1.25rem',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <Link to="/dashboard" className="btn btn-secondary" style={{ padding: '0.45rem 0.85rem' }}>
            <ArrowLeft size={16} /> Exit
          </Link>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span className="mono" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>
                {session.courseCode}
              </span>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
                {session.courseName}
              </h1>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: '3px', flexWrap: 'wrap' }}>
              <span>Room: <strong style={{ color: '#fff' }}>{session.classroomId?.roomCode}</strong></span>
              <span>•</span>
              <span>Faculty: <strong style={{ color: '#fff' }}>{session.facultyId?.name}</strong></span>
              <span>•</span>
              <span className="badge badge-emerald" style={{ padding: '0.2rem 0.6rem' }}><Radio size={12} /> Live O(1) Stream</span>
            </div>
          </div>
        </div>

        <div className="projector-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          {/* Mode Toggle Button */}
          <button 
            onClick={handleTogglePin} 
            disabled={isTogglingPin}
            className={session.requirePin ? "btn btn-emerald" : "btn btn-secondary"}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.45rem', 
              fontSize: '0.82rem',
              borderColor: !session.requirePin ? 'var(--accent-cyan)' : undefined,
              color: !session.requirePin ? 'var(--accent-cyan)' : undefined
            }}
            title="Click to toggle between Fast Mode (Direct Scan) and Strict Line-of-Sight PIN"
          >
            {session.requirePin ? <Lock size={15} /> : <Sparkles size={15} />}
            <span>{isTogglingPin ? 'Toggling...' : session.requirePin ? 'PIN: Strict' : 'Fast Mode'}</span>
          </button>

          <button onClick={handleExportCSV} disabled={isExporting} className="btn btn-secondary" style={{ fontSize: '0.82rem' }}>
            <Download size={15} /> {isExporting ? 'Exporting...' : 'Export CSV'}
          </button>
          
          <button onClick={handleConcludeSession} className="btn btn-danger" style={{ fontSize: '0.82rem' }}>
            Conclude
          </button>
          
          <button onClick={toggleFullscreen} className="btn btn-secondary" title="Toggle Fullscreen">
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </header>

      {/* Mobile Tab Switcher for Teacher Phone Presenter Mode */}
      <div className="mobile-only" style={{ gap: '0.5rem', marginBottom: '1.25rem', width: '100%' }}>
        <button 
          onClick={() => setMobileTab('QR')} 
          className={mobileTab === 'QR' ? 'btn btn-primary' : 'btn btn-secondary'}
          style={{ flex: 1, padding: '0.65rem', justifyContent: 'center', fontSize: '0.9rem' }}
        >
          📱 Broadcast QR
        </button>
        <button 
          onClick={() => setMobileTab('ROSTER')} 
          className={mobileTab === 'ROSTER' ? 'btn btn-primary' : 'btn btn-secondary'}
          style={{ flex: 1, padding: '0.65rem', justifyContent: 'center', fontSize: '0.9rem' }}
        >
          👥 Live Roster ({presentCount})
        </button>
      </div>

      {/* Main Split Grid */}
      <div className="projector-split">
        
        {/* LEFT COLUMN: THE DYNAMIC PROJECTED QR & LINE-OF-SIGHT PIN */}
        <div 
          className={`projector-col-qr ${mobileTab !== 'QR' ? 'mobile-hidden' : ''}`}
          style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center',
            background: '#121217',
            border: '1px solid #272730',
            borderRadius: '20px',
            padding: '2rem 1.5rem',
            position: 'relative'
          }}
        >
          {/* Mode Status Banner */}
          {session.requirePin ? (
            <div style={{ 
              marginBottom: '1.25rem', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '1.25rem',
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '14px',
              padding: '0.8rem 1.25rem',
              maxWidth: '440px',
              width: '100%'
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent-emerald)', fontWeight: 700, marginBottom: '0.2rem' }}>
                  Challenge PIN
                </div>
                <div className="mono" style={{ 
                  fontSize: '2.4rem', 
                  fontWeight: 800, 
                  color: 'var(--accent-emerald)', 
                  lineHeight: '1'
                }}>
                  {tokenData.pin}
                </div>
              </div>
              <div style={{ textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.35' }}>
                Students must glance at your screen and tap <strong style={{ color: '#fff' }}>PIN {tokenData.pin}</strong>. Rejects remote corridor scanning!
              </div>
            </div>
          ) : (
            <div style={{ 
              marginBottom: '1.25rem', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.85rem',
              background: 'rgba(6, 182, 212, 0.08)',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              borderRadius: '14px',
              padding: '0.75rem 1.25rem',
              maxWidth: '440px',
              width: '100%'
            }}>
              <Sparkles size={22} color="var(--accent-cyan)" style={{ flexShrink: 0 }} />
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.35' }}>
                <strong style={{ color: 'var(--accent-cyan)' }}>Fast Mode Active:</strong> Students scan directly to biometric facial match with no PIN required. Ideal for phone presentation.
              </div>
            </div>
          )}

          {/* Quick Switch Mode Button */}
          <button 
            onClick={handleTogglePin} 
            disabled={isTogglingPin}
            className="btn btn-secondary"
            style={{ fontSize: '0.78rem', padding: '0.35rem 0.8rem', marginBottom: '1.25rem', gap: '0.4rem' }}
          >
            {session.requirePin ? '⚡ Switch to Fast Mode (No PIN)' : '🔒 Switch to Strict PIN Mode'}
          </button>

          {/* Circular Countdown Progress Ring */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.85rem', 
            marginBottom: '1.25rem',
            background: 'rgba(255,255,255,0.03)',
            padding: '0.5rem 1.15rem',
            borderRadius: '999px',
            border: '1px solid #272730'
          }}>
            <div style={{ position: 'relative', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="24" height="24" viewBox="0 0 36 36">
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="#272730"
                  strokeWidth="3.5"
                />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="var(--accent-cyan)"
                  strokeWidth="3.5"
                  strokeDasharray={`${progressPercent}, 100`}
                  style={{ transition: 'stroke-dasharray 0.05s linear' }}
                />
              </svg>
            </div>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Rotating Token (Expires in <strong style={{ color: '#fff' }}>{Math.ceil(progressPercent * 0.04)}s</strong>)
            </span>
          </div>

          {/* High-Contrast QR Code Container */}
          <div style={{ 
            background: '#ffffff', 
            padding: '1.25rem', 
            borderRadius: '18px', 
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            maxWidth: '100%',
            width: '320px',
            height: '320px'
          }}>
            {qrDataUrl ? (
              <img 
                src={qrDataUrl} 
                alt="Dynamic Classroom QR" 
                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} 
              />
            ) : (
              <span style={{ color: '#000', fontWeight: 600 }}>Initializing QR...</span>
            )}
          </div>

          {/* Security Badges */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', fontSize: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <span className="badge badge-zinc"><Lock size={12} /> HMAC-SHA256 Token</span>
            <span className="badge badge-zinc"><DoorOpen size={12} /> Geofence {session.classroomId?.radiusMeters || 35}m</span>
            <span className="badge badge-zinc"><ShieldCheck size={12} /> Screen Awake</span>
          </div>
        </div>

        {/* RIGHT COLUMN: LIVE ATTENDANCE ROSTER & METRICS */}
        <div 
          className={`projector-col-roster ${mobileTab !== 'ROSTER' ? 'mobile-hidden' : ''}`}
          style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            background: '#121217',
            border: '1px solid #272730',
            borderRadius: '20px',
            padding: '1.75rem',
            overflow: 'hidden'
          }}
        >
          {/* Header Stats */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
            <div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Live Verified Attendance</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.2rem' }}>
                <span style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {presentCount}
                </span>
                <span style={{ fontSize: '1.15rem', color: 'var(--text-secondary)' }}>
                  / {capacity} Enrolled
                </span>
              </div>
            </div>
            <div className="badge badge-emerald" style={{ fontSize: '0.9rem', padding: '0.4rem 0.85rem' }}>
              {attendanceRate}% Present
            </div>
          </div>

          {/* Progress Bar */}
          <div style={{ width: '100%', height: '8px', background: '#272730', borderRadius: '4px', overflow: 'hidden', marginBottom: '1.5rem' }}>
            <div 
              style={{ 
                width: `${attendanceRate}%`, 
                height: '100%', 
                background: 'linear-gradient(90deg, var(--accent-emerald), #34d399)', 
                transition: 'width 0.4s ease' 
              }} 
            />
          </div>

          {/* Live Stream List Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Recent Verifications (Live Stream)
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)' }}>
              Auto-updating real-time
            </span>
          </div>

          {/* Student Roster List */}
          <div style={{ flex: 1, minHeight: '280px', maxHeight: '420px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {roster.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                <Users size={36} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                <p>Waiting for students to scan the broadcast QR code...</p>
              </div>
            ) : (
              roster.map((student, idx) => (
                <div 
                  key={student._id || idx}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    padding: '0.75rem 1rem',
                    background: '#181820',
                    border: '1px solid #272730',
                    borderRadius: '10px',
                    animation: idx === 0 ? 'fadeIn 0.3s ease' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <CheckCircle2 size={18} color="var(--accent-emerald)" />
                    <div>
                      <div className="mono" style={{ fontSize: '0.95rem', fontWeight: 700, color: '#ffffff' }}>
                        {student.rollNumber}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {student.studentName}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className="badge badge-emerald" style={{ fontSize: '0.7rem' }}>
                      {(student.verificationMetrics?.cosineSimilarity * 100).toFixed(0)}% Match
                    </span>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {new Date(student.markedAt).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Mobile Bottom Quick Actions */}
          <div className="mobile-only" style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
            <button onClick={handleExportCSV} disabled={isExporting} className="btn btn-secondary" style={{ flex: 1, padding: '0.65rem' }}>
              <Download size={15} /> {isExporting ? 'Exporting...' : 'Export CSV'}
            </button>
            <button onClick={handleConcludeSession} className="btn btn-danger" style={{ flex: 1, padding: '0.65rem' }}>
              Conclude
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
