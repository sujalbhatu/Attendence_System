import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Download, MonitorPlay, Zap, Eye, CalendarDays, AlertCircle } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import { formatDay, formatTime, greeting, downloadSessionCsv, errorText } from '../lib/format';

const OTHER = 'other';

function StartLectureModal({ classrooms, assignments, onClose }) {
  const navigate = useNavigate();
  const [assignmentId, setAssignmentId] = useState(assignments[0]?._id || OTHER);
  const [courseCode, setCourseCode] = useState('');
  const [courseName, setCourseName] = useState('');
  const [classroomId, setClassroomId] = useState(classrooms[0]?._id || '');
  const [requirePin, setRequirePin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const assignment = assignments.find((a) => a._id === assignmentId);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const body = assignment
        ? { courseId: assignment.courseId?._id, branch: assignment.branch, classroomId, requirePin }
        : { courseCode, courseName, classroomId, requirePin };
      const res = await api.post('/sessions', body);
      navigate(`/projector/${res.data.session._id}`);
    } catch (err) {
      setError(errorText(err, 'Could not start the lecture'));
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="Start a lecture"
      description="Opens the projector screen with a rotating code for this room."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="start-lecture" className="btn btn-primary" disabled={submitting || !classroomId}>
            <MonitorPlay size={16} /> {submitting ? 'Starting…' : 'Start and open projector'}
          </button>
        </>
      }
    >
      <form id="start-lecture" onSubmit={submit}>
        {error && (
          <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
            <AlertCircle size={16} /> <span>{error}</span>
          </div>
        )}

        <div className="field">
          <label className="label" htmlFor="course">Course</label>
          <select id="course" className="select" value={assignmentId} onChange={(e) => setAssignmentId(e.target.value)}>
            {assignments.map((a) => (
              <option key={a._id} value={a._id}>
                {a.courseId?.courseCode} · {a.courseId?.courseName} ({a.branch})
              </option>
            ))}
            <option value={OTHER}>Other (not linked to a course)</option>
          </select>
          <span className="hint">
            {assignment
              ? 'Enrolled students who don’t check in are marked absent when you conclude.'
              : 'Without a course, only the students who check in are recorded.'}
          </span>
        </div>

        {!assignment && (
          <div className="field-row">
            <div className="field">
              <label className="label" htmlFor="code">Code</label>
              <input id="code" className="input mono" value={courseCode} onChange={(e) => setCourseCode(e.target.value.toUpperCase())} placeholder="CS301" required />
            </div>
            <div className="field">
              <label className="label" htmlFor="title">Title</label>
              <input id="title" className="input" value={courseName} onChange={(e) => setCourseName(e.target.value)} placeholder="Database Systems" required />
            </div>
          </div>
        )}

        <div className="field">
          <label className="label" htmlFor="room">Room</label>
          {classrooms.length ? (
            <select id="room" className="select" value={classroomId} onChange={(e) => setClassroomId(e.target.value)}>
              {classrooms.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.roomCode} · {c.building} · seats {c.capacity}
                </option>
              ))}
            </select>
          ) : (
            <div className="alert alert-warn">
              <AlertCircle size={16} />
              <span>Add a classroom first. <Link to="/classrooms" className="link">Go to Classrooms</Link></span>
            </div>
          )}
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <span className="label">Check-in</span>
          <div className="choice-group">
            <button type="button" className="choice" aria-pressed={!requirePin} onClick={() => setRequirePin(false)}>
              <span className="choice-title"><Zap size={14} /> Quick</span>
              <span className="choice-desc">Scan the code, then a face check. Good when you present from a phone.</span>
            </button>
            <button type="button" className="choice" aria-pressed={requirePin} onClick={() => setRequirePin(true)}>
              <span className="choice-title"><Eye size={14} /> With screen PIN</span>
              <span className="choice-desc">Students also tap the digit on the projector. Stops scans from the corridor.</span>
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showStart, setShowStart] = useState(false);
  const [exportingId, setExportingId] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get('/sessions/my'),
      api.get('/classrooms'),
      api.get('/courses/my-assignments').catch(() => ({ data: { assignments: [] } }))
    ])
      .then(([s, c, a]) => {
        setSessions(s.data.sessions || []);
        setClassrooms(c.data.classrooms || []);
        setAssignments(a.data.assignments || []);
      })
      .catch((err) => console.error('Dashboard load failed', err))
      .finally(() => setLoading(false));
  }, []);

  const live = sessions.filter((s) => s.status === 'ACTIVE');

  const stats = useMemo(() => {
    const concluded = sessions.filter((s) => s.status !== 'ACTIVE');
    const checkIns = sessions.reduce((n, s) => n + (s.stats?.presentCount || 0), 0);
    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    return {
      total: sessions.length,
      concluded: concluded.length,
      checkIns,
      avg: sessions.length ? checkIns / sessions.length : 0,
      thisWeek: sessions.filter((s) => new Date(s.sessionDate).getTime() > weekAgo).length,
      flagged: sessions.reduce((n, s) => n + (s.stats?.flaggedCount || 0), 0)
    };
  }, [sessions]);

  const exportCsv = async (s) => {
    setExportingId(s._id);
    try {
      await downloadSessionCsv(s._id, s.courseCode);
    } catch (err) {
      alert(`Export failed: ${errorText(err, 'unknown error')}`);
    } finally {
      setExportingId(null);
    }
  };

  const firstName = user?.name?.replace(/^(dr|prof)\.?\s+/i, '').split(' ')[0];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <h1>{greeting()}{firstName ? `, ${firstName}` : ''}</h1>
          <p>Your lectures, newest first. Start one to put a live code on the projector.</p>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-primary" onClick={() => setShowStart(true)} disabled={loading}>
            <Plus size={16} /> Start a lecture
          </button>
        </div>
      </div>

      {live.map((s) => (
        <div key={s._id} className="callout" style={{ borderColor: 'var(--line-strong)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', minWidth: 0 }}>
            <span className="live-dot" />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>
                <span className="mono" style={{ fontWeight: 500 }}>{s.courseCode}</span> · {s.courseName}
              </div>
              <div className="muted" style={{ fontSize: '0.82rem' }}>
                Live in {s.classroomId?.roomCode || 'room'} since {formatTime(s.sessionDate)} · {s.stats?.presentCount || 0} checked in
              </div>
            </div>
          </div>
          <Link to={`/projector/${s._id}`} className="btn btn-primary btn-sm">
            <MonitorPlay size={14} /> Open projector
          </Link>
        </div>
      ))}

      <div className="stat-strip">
        <div className="stat">
          <div className="stat-label">Lectures recorded</div>
          <div className="stat-value">{stats.total}</div>
          <div className="stat-note">{stats.thisWeek} in the last 7 days</div>
        </div>
        <div className="stat">
          <div className="stat-label">Check-ins</div>
          <div className="stat-value">{stats.checkIns}</div>
          <div className="stat-note">face-verified, all lectures</div>
        </div>
        <div className="stat">
          <div className="stat-label">Average per lecture</div>
          <div className="stat-value">{stats.avg.toFixed(1)}</div>
          <div className="stat-note">students present</div>
        </div>
        <div className="stat">
          <div className="stat-label">Flagged for review</div>
          <div className="stat-value">{stats.flagged}</div>
          <div className="stat-note">low match or liveness doubt</div>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Recent lectures</h2>
          <span className="muted">Last {Math.min(sessions.length, 20)}</span>
        </div>

        {loading ? (
          <div className="loading-line">Loading lectures…</div>
        ) : sessions.length === 0 ? (
          <div className="empty">
            <CalendarDays size={32} />
            <h3>No lectures yet</h3>
            <p>Start your first lecture and the projector will show a code students scan from their seats.</p>
            <button className="btn btn-primary" onClick={() => setShowStart(true)}>
              <Plus size={16} /> Start a lecture
            </button>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="table table-min">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Room</th>
                  <th>When</th>
                  <th>Check-in</th>
                  <th className="right">Present</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s._id}>
                    <td>
                      <div className="cell-title">{s.courseName || 'Untitled lecture'}</div>
                      <div className="cell-sub mono">{s.courseCode}{s.branch ? ` · ${s.branch}` : ''}</div>
                    </td>
                    <td className="mono">{s.classroomId?.roomCode || '—'}</td>
                    <td className="nowrap">
                      <div>{formatDay(s.sessionDate)}</div>
                      <div className="cell-sub">{formatTime(s.sessionDate)}</div>
                    </td>
                    <td>
                      {s.status === 'ACTIVE' ? (
                        <span className="tag tag-accent tag-dot">Live</span>
                      ) : (
                        <span className="tag">{s.requirePin ? 'With PIN' : 'Quick'}</span>
                      )}
                    </td>
                    <td className="right mono num">
                      {s.stats?.presentCount || 0}
                      {s.stats?.flaggedCount ? <span className="muted"> +{s.stats.flaggedCount}</span> : null}
                    </td>
                    <td>
                      <div className="row-actions">
                        {s.status === 'ACTIVE' ? (
                          <Link to={`/projector/${s._id}`} className="btn btn-secondary btn-sm">Projector</Link>
                        ) : (
                          <Link to={`/analytics?session=${s._id}`} className="btn btn-ghost btn-sm">Register</Link>
                        )}
                        <button
                          className="btn btn-ghost btn-sm btn-icon"
                          onClick={() => exportCsv(s)}
                          disabled={exportingId === s._id}
                          title="Download CSV"
                          aria-label={`Download CSV for ${s.courseCode}`}
                        >
                          <Download size={15} className={exportingId === s._id ? 'spin' : ''} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showStart && (
        <StartLectureModal classrooms={classrooms} assignments={assignments} onClose={() => setShowStart(false)} />
      )}
    </>
  );
}
