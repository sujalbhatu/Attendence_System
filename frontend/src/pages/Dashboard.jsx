import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Download, MonitorPlay, Zap, Eye, CalendarDays, AlertCircle } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import { SkeletonRows, SkeletonTiles } from '../components/Skeleton';
import { formatDay, formatTime, greeting, downloadSessionCsv, errorText } from '../lib/format';

const OTHER = 'other';

function StartLectureModal({ classrooms, assignments, initialAssignmentId, onClose }) {
  const navigate = useNavigate();
  const [assignmentId, setAssignmentId] = useState(initialAssignmentId || assignments[0]?._id || OTHER);
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

// Present count per lecture, oldest to newest, with the average as a dashed line.
function TrendChart({ sessions }) {
  const recent = [...sessions].slice(0, 12).reverse();
  if (recent.length === 0) {
    return <div className="chart-empty">Bars appear here after your first lecture.</div>;
  }
  const values = recent.map((s) => s.stats?.presentCount || 0);
  const max = Math.max(4, ...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return (
    <>
      <div className="chart-bars">
        <div className="chart-avg" style={{ bottom: `${(avg / max) * 100}%` }}><i>avg {avg.toFixed(1)}</i></div>
        {recent.map((s, i) => {
          const h = (values[i] / max) * 100;
          return (
            <Link
              to={s.status === 'ACTIVE' ? `/projector/${s._id}` : `/analytics?session=${s._id}`}
              key={s._id}
              className={`chart-bar ${s.status === 'ACTIVE' ? 'live' : ''}`}
              title={`${s.courseCode} · ${formatDay(s.sessionDate)} · ${values[i]} present`}
            >
              <span style={{ height: `${h}%` }} />
              <b style={{ bottom: `calc(${h}% + 4px)` }}>{values[i]}</b>
            </Link>
          );
        })}
      </div>
      <div className="chart-labels">
        {recent.map((s) => <span key={s._id}>{s.courseCode}</span>)}
      </div>
    </>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startFor, setStartFor] = useState(null); // null = closed, '' = default course, else assignment id
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
    const checkIns = sessions.reduce((n, s) => n + (s.stats?.presentCount || 0), 0);
    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const today = new Date().toDateString();
    return {
      total: sessions.length,
      checkIns,
      avg: sessions.length ? checkIns / sessions.length : 0,
      thisWeek: sessions.filter((s) => new Date(s.sessionDate).getTime() > weekAgo).length,
      today: sessions.filter((s) => new Date(s.sessionDate).toDateString() === today).length,
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
  const current = live[0];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <h1>{greeting()}{firstName ? `, ${firstName}` : ''}</h1>
        </div>
      </div>

      {/* Today band: the one thing a faculty opens this page for */}
      <section className="today">
        {current ? (
          <>
            <div>
              <span className="today-kicker"><span className="live-dot" /> Live now</span>
              <h2>{current.courseCode} · {current.courseName}</h2>
              <p>Room {current.classroomId?.roomCode || '—'} · started {formatTime(current.sessionDate)}{live.length > 1 ? ` · ${live.length - 1} more running` : ''}</p>
              <div className="today-actions" style={{ marginTop: '1rem' }}>
                <Link to={`/projector/${current._id}`} className="btn btn-lime"><MonitorPlay size={16} /> Open projector</Link>
                <button className="btn btn-on-ink" onClick={() => setStartFor('')}><Plus size={16} /> Start another</button>
              </div>
            </div>
            <div className="today-count">
              {current.stats?.presentCount || 0}
              <small>checked in so far</small>
            </div>
          </>
        ) : (
          <>
            <div>
              <span className="today-kicker">Ready when you are</span>
              <h2>Start a lecture and put the code on the projector.</h2>
              <p>
                {stats.today
                  ? `${stats.today} lecture${stats.today === 1 ? '' : 's'} recorded today.`
                  : 'Nothing recorded today yet.'}{' '}
                Students check in from their seats in about fifteen seconds.
              </p>
              <div className="today-actions" style={{ marginTop: '1rem' }}>
                <button className="btn btn-lime" onClick={() => setStartFor('')} disabled={loading}><Plus size={16} /> Start a lecture</button>
                <Link to="/analytics" className="btn btn-on-ink">Open reports</Link>
              </div>
            </div>
            <div className="today-count">
              {stats.thisWeek}
              <small>lectures this week</small>
            </div>
          </>
        )}
      </section>

      {loading ? (
        <SkeletonTiles />
      ) : (
        <div className="tiles">
          <div className="tile">
            <div className="tile-label">Lectures recorded</div>
            <div className="tile-value">{stats.total}</div>
            <div className="tile-note">{stats.thisWeek} in the last 7 days</div>
          </div>
          <div className="tile ink">
            <div className="tile-label">Check-ins</div>
            <div className="tile-value">{stats.checkIns}</div>
            <div className="tile-note">face-verified, all lectures</div>
          </div>
          <div className="tile lime">
            <div className="tile-label">Average per lecture</div>
            <div className="tile-value">{stats.avg.toFixed(1)}</div>
            <div className="tile-note">students present</div>
          </div>
          <div className={`tile ${stats.flagged ? 'warn' : ''}`}>
            <div className="tile-label">Flagged for review</div>
            <div className="tile-value">{stats.flagged}</div>
            <div className="tile-note">low match or liveness doubt</div>
          </div>
        </div>
      )}

      <div className="dash-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Attendance by lecture</h2>
            <span className="muted">last {Math.min(sessions.length, 12)} · present</span>
          </div>
          <div className="chart">
            {loading ? <span className="skel" style={{ height: 180 }} /> : <TrendChart sessions={sessions} />}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Your courses</h2>
            <Link to="/enrollment" className="link" style={{ fontSize: '0.82rem' }}>Manage</Link>
          </div>
          {loading ? (
            <SkeletonRows rows={3} />
          ) : assignments.length === 0 ? (
            <div className="empty" style={{ padding: '2rem 1.25rem' }}>
              <h3>No courses assigned</h3>
              <p>Assign yourself a course so lectures can mark absentees automatically.</p>
              <Link to="/enrollment" className="btn btn-secondary btn-sm">Go to Courses</Link>
            </div>
          ) : (
            <div>
              {assignments.slice(0, 5).map((a) => (
                <div className="course-quick" key={a._id}>
                  <div style={{ minWidth: 0 }}>
                    <div className="mono">{a.courseId?.courseCode} · {a.branch}</div>
                    <div className="cell-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.courseId?.courseName}</div>
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => setStartFor(a._id)}>
                    <MonitorPlay size={14} /> Start
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="panel" style={{ overflow: 'hidden' }}>
        <div className="panel-head">
          <h2>Recent lectures</h2>
          <span className="muted">newest first</span>
        </div>

        {loading ? (
          <SkeletonRows rows={5} />
        ) : sessions.length === 0 ? (
          <div className="empty">
            <CalendarDays size={32} />
            <h3>No lectures yet</h3>
            <p>Start your first lecture and the projector will show a code students scan from their seats.</p>
            <button className="btn btn-primary" onClick={() => setStartFor('')}>
              <Plus size={16} /> Start a lecture
            </button>
          </div>
        ) : (
          <div className="table-scroll tall">
            <table className="table table-min">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Room</th>
                  <th>When</th>
                  <th>Status</th>
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
                        <span className="tag tag-outline">{s.requirePin ? 'Concluded · PIN' : 'Concluded'}</span>
                      )}
                    </td>
                    <td className="right">
                      <span className="mono num" style={{ fontSize: '1rem', fontWeight: 600 }}>{s.stats?.presentCount || 0}</span>
                      {s.stats?.flaggedCount ? <span className="tag tag-flagged" style={{ marginLeft: '0.4rem' }}>+{s.stats.flaggedCount}</span> : null}
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
                          <Download size={15} />
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

      {startFor !== null && (
        <StartLectureModal
          classrooms={classrooms}
          assignments={assignments}
          initialAssignmentId={startFor || undefined}
          onClose={() => setStartFor(null)}
        />
      )}
    </>
  );
}
