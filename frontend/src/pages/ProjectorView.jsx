import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { Maximize2, Minimize2, ArrowLeft, Download, Eye, Zap, MapPin, ShieldCheck, Users } from 'lucide-react';
import api from '../api/client';
import { LogoMark } from '../components/Logo';
import { formatTime, formatTimeSec, downloadSessionCsv, errorText } from '../lib/format';

export default function ProjectorView() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Rotating token pushed by the server over SSE
  const [tokenData, setTokenData] = useState({ token: '--------', pin: 7, timestamp: Date.now(), expiresInMs: 4000 });
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [progressPercent, setProgressPercent] = useState(100);

  const [roster, setRoster] = useState([]);
  const [presentCount, setPresentCount] = useState(0);
  const [enrolledCount, setEnrolledCount] = useState(0);

  const [mobileTab, setMobileTab] = useState('QR');
  const [isTogglingPin, setIsTogglingPin] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    api.get(`/sessions/${sessionId}`)
      .then((res) => setSession(res.data.session))
      .catch((err) => setError(errorText(err, 'Failed to load session')))
      .finally(() => setLoading(false));
  }, [sessionId]);

  // EventSource cannot send an Authorization header, so we first exchange the
  // faculty login for a short-lived projector token scoped to this one session.
  useEffect(() => {
    if (!sessionId) return;
    let eventSource = null;
    let cancelled = false;

    api.post(`/sessions/${sessionId}/projector-token`)
      .then((res) => {
        if (cancelled) return;
        eventSource = new EventSource(`/api/sessions/${sessionId}/qr-feed?pt=${encodeURIComponent(res.data.projectorToken)}`);

        eventSource.onmessage = async (e) => {
          try {
            const data = JSON.parse(e.data);
            setTokenData(data);
            if (data.requirePin !== undefined) {
              setSession((prev) => (prev ? { ...prev, requirePin: data.requirePin } : prev));
            }
            const qrPayload = JSON.stringify({ s: data.sessionId, t: data.token, ts: data.timestamp, rp: !!data.requirePin });
            const url = await QRCode.toDataURL(qrPayload, { width: 420, margin: 1, color: { dark: '#000000', light: '#ffffff' } });
            setQrDataUrl(url);
          } catch (err) {
            console.error('QR generation error:', err);
          }
        };

        eventSource.onerror = () => console.warn('SSE connection interrupted, retrying...');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err.response?.status === 401
            ? 'Log in as the faculty who created this session to open the projector.'
            : errorText(err, 'Could not start the projector feed')
        );
      });

    return () => {
      cancelled = true;
      if (eventSource) eventSource.close();
    };
  }, [sessionId]);

  // Pushes arrive at each rotation boundary; count down the time this code has left.
  useEffect(() => {
    const startTime = Date.now();
    const windowMs = tokenData.expiresInMs || 4000;
    const interval = setInterval(() => {
      const remaining = Math.max(0, windowMs - (Date.now() - startTime));
      setProgressPercent((remaining / 4000) * 100);
    }, 50);
    return () => clearInterval(interval);
  }, [tokenData.token]);

  // Live roster every 2 s
  useEffect(() => {
    if (!sessionId) return;
    const fetchRoster = () => {
      api.get(`/attendance/live-roster/${sessionId}`)
        .then((res) => {
          setRoster(res.data.roster);
          setPresentCount(res.data.count);
          setEnrolledCount(res.data.enrolledCount || 0);
        })
        .catch(() => {});
    };
    fetchRoster();
    const interval = setInterval(fetchRoster, 2000);
    return () => clearInterval(interval);
  }, [sessionId]);

  // Keep the presenting device's screen on
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
    const onVisible = () => document.visibilityState === 'visible' && requestWakeLock();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (wakeLock) wakeLock.release().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  };

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      await downloadSessionCsv(sessionId, session?.courseCode);
    } catch (err) {
      alert(`Export failed: ${errorText(err, 'unknown error')}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleConcludeSession = async () => {
    const note = session?.courseId
      ? 'Conclude this lecture? Enrolled students who have not checked in will be marked absent.'
      : 'Conclude this lecture? The code stops working immediately.';
    if (!window.confirm(note)) return;
    try {
      await api.put(`/sessions/${sessionId}/conclude`);
      navigate(`/analytics?session=${sessionId}`);
    } catch (err) {
      alert(errorText(err, 'Could not conclude the lecture'));
    }
  };

  const handleTogglePin = async () => {
    setIsTogglingPin(true);
    try {
      const res = await api.put(`/sessions/${sessionId}/toggle-pin`);
      setSession((prev) => ({ ...prev, requirePin: res.data.requirePin }));
      setTokenData((prev) => ({ ...prev, requirePin: res.data.requirePin }));
    } catch (err) {
      alert(errorText(err, 'Could not change the check-in mode'));
    } finally {
      setIsTogglingPin(false);
    }
  };

  if (loading) {
    return <div className="projector" style={{ display: 'grid', placeItems: 'center', color: '#8b8981' }}>Opening projector…</div>;
  }

  if (error || !session) {
    return (
      <div className="projector" style={{ display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Can’t open this lecture</h2>
          <p style={{ color: '#a9a79f', marginBottom: '1.25rem', maxWidth: '42ch' }}>{error}</p>
          <Link to="/dashboard" className="btn btn-secondary">Back to lectures</Link>
        </div>
      </div>
    );
  }

  const concluded = session.status !== 'ACTIVE';
  const expected = enrolledCount || session.classroomId?.capacity || 0;
  const rate = expected ? Math.min(100, Math.round((presentCount / expected) * 100)) : 0;
  const secondsLeft = Math.ceil((progressPercent / 100) * 4);
  const host = window.location.host;

  return (
    <div className="projector">
      <header className="proj-head">
        <div className="proj-title">
          <Link to="/dashboard" className="btn btn-secondary btn-sm btn-icon" aria-label="Back to lectures">
            <ArrowLeft size={16} />
          </Link>
          <div style={{ minWidth: 0 }}>
            <div className="proj-course">
              {session.courseCode}
              {session.branch ? ` · ${session.branch}` : ''}
            </div>
            <div className="proj-name">{session.courseName}</div>
            <div className="proj-meta">
              <span>Room <strong>{session.classroomId?.roomCode}</strong></span>
              <span>{session.facultyId?.name}</span>
              <span>Started <strong>{formatTime(session.sessionDate)}</strong></span>
              {!concluded && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: '#f3f2ed' }}>
                  <span className="live-dot" /> Live
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="proj-actions">
          <button onClick={handleTogglePin} disabled={isTogglingPin || concluded} className="btn btn-secondary btn-sm" title="Switch check-in mode">
            {session.requirePin ? <Eye size={14} /> : <Zap size={14} />}
            {isTogglingPin ? 'Switching…' : session.requirePin ? 'Screen PIN on' : 'Quick check-in'}
          </button>
          <button onClick={handleExportCSV} disabled={isExporting} className="btn btn-secondary btn-sm">
            <Download size={14} /> {isExporting ? 'Preparing…' : 'CSV'}
          </button>
          {!concluded && (
            <button onClick={handleConcludeSession} className="btn btn-danger btn-sm">Conclude</button>
          )}
          <button onClick={toggleFullscreen} className="btn btn-secondary btn-sm btn-icon" title="Full screen" aria-label="Toggle full screen">
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      </header>

      <div className="proj-tabs" role="tablist">
        <button role="tab" aria-selected={mobileTab === 'QR'} onClick={() => setMobileTab('QR')}>Code</button>
        <button role="tab" aria-selected={mobileTab === 'ROSTER'} onClick={() => setMobileTab('ROSTER')}>Checked in ({presentCount})</button>
      </div>

      <div className="proj-body">
        <section className={`proj-stage ${mobileTab !== 'QR' ? 'proj-hide-mobile' : ''}`}>
          {concluded ? (
            <div style={{ textAlign: 'center', color: '#a9a79f' }}>
              <h2 style={{ fontSize: '1.4rem', marginBottom: '0.4rem' }}>This lecture has been concluded</h2>
              <p>The code is no longer valid. {presentCount} students checked in.</p>
              <Link to={`/analytics?session=${sessionId}`} className="btn btn-secondary" style={{ marginTop: '1.25rem' }}>View register</Link>
            </div>
          ) : (
            <>
              <p className="proj-instructions">
                Open <strong>{host}/scan</strong> on your phone and point the camera at this code
                {session.requirePin ? <>, then tap the <strong>digit shown on the right</strong>.</> : '.'}
              </p>

              <div className="proj-qr-row">
                <div>
                  <div className="proj-qr">
                    {qrDataUrl ? <img src={qrDataUrl} alt="Attendance code for this lecture" /> : <span className="proj-qr-wait">Connecting…</span>}
                  </div>
                  <div className="proj-timer" style={{ marginTop: '0.9rem' }}>
                    <div className="proj-timer-bar">
                      <div className="proj-timer-fill" style={{ width: `${progressPercent}%` }} />
                    </div>
                    <div className="proj-timer-text">
                      <span>new code in {secondsLeft}s</span>
                      <span>{tokenData.token?.slice(0, 8)}</span>
                    </div>
                  </div>
                </div>

                {session.requirePin && (
                  <div className="proj-pin">
                    <div className="proj-pin-label">Screen PIN</div>
                    <div className="proj-pin-digit">{tokenData.pin}</div>
                    <div className="proj-pin-note">Changes with the code. Only people in the room can see it.</div>
                  </div>
                )}
              </div>

              <div className="proj-chips">
                <span className="proj-chip"><ShieldCheck size={13} /> Signed code, valid ~4 s</span>
                <span className="proj-chip"><MapPin size={13} /> Inside {session.classroomId?.radiusMeters || 35} m of {session.classroomId?.roomCode}</span>
                <span className="proj-chip"><LogoMark size={13} /> Face + blink check</span>
              </div>
            </>
          )}
        </section>

        <section className={`proj-roster ${mobileTab !== 'ROSTER' ? 'proj-hide-mobile' : ''}`}>
          <div className="proj-count">
            <div style={{ fontSize: '0.8rem', color: '#8b8981', marginBottom: '0.45rem' }}>Checked in</div>
            <div className="proj-count-num">
              {presentCount}
              {expected ? <span>of {expected} {enrolledCount ? 'enrolled' : 'seats'}</span> : null}
            </div>
            {expected ? (
              <div className="proj-count-bar"><div style={{ width: `${rate}%` }} /></div>
            ) : null}
          </div>
          <div className="proj-list">
            {roster.length === 0 ? (
              <div className="proj-empty">
                <Users size={28} style={{ margin: '0 auto 0.6rem', opacity: 0.5 }} />
                Names appear here as students verify.
              </div>
            ) : (
              roster.map((s) => (
                <div className="proj-row" key={s._id}>
                  <div>
                    <div className="proj-roll">{s.rollNumber}</div>
                    <div className="proj-sname">
                      {s.studentName}
                      {s.status === 'FLAGGED' && <span style={{ color: '#e2ab52' }}> · flagged</span>}
                      {s.status === 'ABSENT' && <span style={{ color: '#ec8068' }}> · absent</span>}
                    </div>
                  </div>
                  <div className="proj-time">
                    {s.status !== 'ABSENT' && s.verificationMetrics?.cosineSimilarity != null && (
                      <div style={{ color: '#a9a79f' }}>{Math.round(s.verificationMetrics.cosineSimilarity * 100)}% match</div>
                    )}
                    {s.status !== 'ABSENT' && formatTimeSec(s.markedAt)}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
