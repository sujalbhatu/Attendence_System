import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, LogOut, ScanLine, ShieldAlert, BookOpen } from 'lucide-react';
import api from '../api/client';
import Logo from '../components/Logo';
import ThemeToggle from '../components/ThemeToggle';
import { formatDay, formatTime } from '../lib/format';
import { loadStudentToken, loadStudentData, saveStudentSession, clearStudentSession, studentAuthHeaders } from '../api/studentSession';

const THRESHOLD = 0.75;

// How many lectures a student can still miss, or must attend in a row, to stay at 75%.
function headroom(present, total) {
  if (total === 0) return { kind: 'none' };
  if (present / total >= THRESHOLD) {
    return { kind: 'spare', n: Math.floor(present / THRESHOLD - total) };
  }
  return { kind: 'need', n: Math.ceil((THRESHOLD * total - present) / (1 - THRESHOLD)) };
}

function headroomText(h) {
  if (h.kind === 'none') return 'No lectures yet';
  if (h.kind === 'spare') return h.n === 0 ? 'No lectures to spare' : `Can miss ${h.n} more`;
  return `Attend the next ${h.n} to reach 75%`;
}

function CourseRow({ item, token, open, onToggle }) {
  const course = item.course;
  const a = item.attendance || { present: 0, total: 0, percentage: 0 };
  const pct = a.percentage;
  const level = a.total === 0 ? '' : pct >= 75 ? '' : pct >= 60 ? 'warn' : 'low';
  const h = headroom(a.present, a.total);
  const [records, setRecords] = useState(null);

  useEffect(() => {
    if (!open || records) return;
    api.get(`/student-portal/attendance/${course._id}`, { headers: studentAuthHeaders(token) })
      .then((res) => setRecords(res.data.attendance || []))
      .catch(() => setRecords([]));
  }, [open]);

  return (
    <article className="panel" style={{ overflow: 'hidden' }}>
      <div
        className="course-row"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onToggle())}
      >
        <div className="course-row-head">
          <div style={{ minWidth: 0 }}>
            <div className="mono muted" style={{ fontSize: '0.8rem' }}>{course.courseCode} · {item.branch}</div>
            <div style={{ fontWeight: 600, fontSize: '1.02rem', marginTop: '0.1rem' }}>{course.courseName}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="course-row-pct" style={{ color: level === 'low' ? 'var(--absent)' : level === 'warn' ? 'var(--flagged)' : 'var(--ink)' }}>
              {a.total === 0 ? '—' : `${Math.round(pct)}%`}
            </div>
            <ChevronDown size={18} className="muted" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
          </div>
        </div>
        <div className="meter">
          <div className={`meter-fill ${level}`} style={{ width: `${Math.min(100, pct)}%` }} />
          <div className="meter-mark" style={{ left: '75%' }} title="75% requirement" />
        </div>
        <div className="course-row-foot">
          <span className="mono">{a.present} of {a.total} lecture{a.total === 1 ? '' : 's'}</span>
          <span style={{ color: h.kind === 'need' ? 'var(--absent)' : undefined }}>{headroomText(h)}</span>
        </div>
      </div>

      {open && (
        <div className="course-detail">
          {!records ? (
            <div className="loading-line">Loading lectures…</div>
          ) : records.length === 0 ? (
            <div className="loading-line">No lectures recorded for this course yet.</div>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Lecture</th>
                    <th>Time</th>
                    <th className="right">You</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r._id}>
                      <td>{formatDay(r.sessionId?.sessionDate || r.markedAt)}</td>
                      <td className="mono muted">{formatTime(r.sessionId?.sessionDate || r.markedAt)}</td>
                      <td className="right">
                        <span className={`tag ${r.status === 'PRESENT' ? 'tag-present' : r.status === 'FLAGGED' ? 'tag-flagged' : 'tag-absent'}`}>
                          {r.status === 'PRESENT' ? 'Present' : r.status === 'FLAGGED' ? 'Under review' : 'Absent'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export default function StudentPortal() {
  const [token, setToken] = useState(() => loadStudentToken());
  const [student, setStudent] = useState(() => loadStudentData());
  const [courses, setCourses] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(() => !!loadStudentToken());
  const [expanded, setExpanded] = useState(null);

  const [rollNumber, setRollNumber] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (token && !mustChangePassword) fetchCourses();
  }, [token, mustChangePassword]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/student-portal/login', { rollNumber: rollNumber.trim().toUpperCase(), password });
      saveStudentSession(res.data.token, res.data.student);
      setMustChangePassword(!!res.data.mustChangePassword);
      setToken(res.data.token);
      setStudent(res.data.student);
      if (!res.data.mustChangePassword) setPassword('');
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid roll number or password');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.post(
        '/student-portal/change-password',
        { currentPassword: password, newPassword },
        { headers: studentAuthHeaders(token) }
      );
      saveStudentSession(res.data.token, res.data.student);
      setStudent(res.data.student);
      setPassword('');
      setNewPassword('');
      setMustChangePassword(false);
      setToken(res.data.token);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not update password');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    clearStudentSession();
    setToken(null);
    setStudent(null);
    setMustChangePassword(false);
    setCourses([]);
    setExpanded(null);
  };

  const fetchCourses = async () => {
    setLoadingCourses(true);
    try {
      const res = await api.get('/student-portal/my-courses', { headers: studentAuthHeaders(token) });
      setCourses(res.data.courses || []);
    } catch (err) {
      if (err.response?.data?.code === 'PASSWORD_CHANGE_REQUIRED') setMustChangePassword(true);
      else if (err.response?.status === 401) handleLogout();
    } finally {
      setLoadingCourses(false);
    }
  };

  if (!token || mustChangePassword) {
    return (
      <div className="scan" style={{ justifyContent: 'flex-start' }}>
        <div className="scan-top">
          <Logo />
          <ThemeToggle />
        </div>
        <div style={{ margin: 'auto 0', padding: '2rem 0' }}>
          <div className="eyebrow">Student portal</div>
          <h1 className="serif" style={{ fontSize: '2.4rem', lineHeight: 1.05, margin: '0.4rem 0 0.6rem' }}>
            {mustChangePassword ? 'Choose a password' : 'Your attendance, course by course'}
          </h1>
          <p className="soft" style={{ fontSize: '0.92rem', marginBottom: '1.5rem' }}>
            {mustChangePassword
              ? 'Replace the temporary password from your faculty with one only you know.'
              : 'See where you stand against the 75% requirement before it becomes a problem.'}
          </p>

          {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}><ShieldAlert size={16} /><span>{error}</span></div>}

          {mustChangePassword ? (
            <form onSubmit={handleChangePassword}>
              <div className="field">
                <label className="label" htmlFor="cur">Current password</label>
                <input id="cur" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
              </div>
              <div className="field">
                <label className="label" htmlFor="new">New password</label>
                <input id="new" type="password" className="input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
                <span className="hint">At least 8 characters, not your roll number.</span>
              </div>
              <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={loading}>{loading ? 'Saving…' : 'Save password'}</button>
              <button type="button" onClick={handleLogout} className="btn btn-ghost btn-block" style={{ marginTop: '0.5rem' }}>Use a different account</button>
            </form>
          ) : (
            <form onSubmit={handleLogin}>
              <div className="field">
                <label className="label" htmlFor="roll">Roll number</label>
                <input id="roll" className="input mono" value={rollNumber} onChange={(e) => setRollNumber(e.target.value.toUpperCase())} placeholder="2023UGCS042" autoComplete="username" required />
              </div>
              <div className="field">
                <label className="label" htmlFor="pw">Password</label>
                <input id="pw" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
                <span className="hint">First time? Use the temporary password from your faculty.</span>
              </div>
              <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
            </form>
          )}
        </div>
        <div style={{ textAlign: 'center', fontSize: '0.8rem' }}>
          <Link to="/" className="link" style={{ color: 'var(--ink-3)' }}>RollOne home</Link>
        </div>
      </div>
    );
  }

  const totals = courses.reduce(
    (acc, c) => ({ present: acc.present + (c.attendance?.present || 0), total: acc.total + (c.attendance?.total || 0) }),
    { present: 0, total: 0 }
  );
  const overall = totals.total ? totals.present / totals.total : null;
  const atRisk = courses.filter((c) => c.attendance?.total > 0 && c.attendance.percentage < 75).length;

  return (
    <div className="portal">
      <div className="portal-top">
        <Logo />
        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
          <ThemeToggle />
          <button onClick={handleLogout} className="btn btn-ghost btn-sm"><LogOut size={14} /> Sign out</button>
        </div>
      </div>

      <div className="portal-hero">
        <div>
          <div className="eyebrow">
            <span className="mono" style={{ letterSpacing: 0, textTransform: 'none' }}>{student?.rollNumber}</span>
            {student?.department ? ` · ${student.department}` : ''}
          </div>
          <h1 style={{ marginTop: '0.35rem' }}>{student?.name || student?.rollNumber}</h1>
          <div style={{ marginTop: '1rem' }}>
            <Link to="/scan" className="btn btn-primary"><ScanLine size={16} /> Check in to a lecture</Link>
          </div>
        </div>
        <div className="portal-overall">
          <div className="eyebrow">Overall</div>
          <div className="portal-overall-num" style={{ marginTop: '0.35rem' }}>{overall == null ? '—' : `${Math.round(overall * 100)}%`}</div>
          <div className="muted" style={{ fontSize: '0.8rem', marginTop: '0.35rem' }}>
            {totals.present} of {totals.total} lecture{totals.total === 1 ? '' : 's'}{atRisk ? ` · ${atRisk} course${atRisk > 1 ? 's' : ''} below 75%` : ''}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.25rem 1rem', marginBottom: '0.9rem' }}>
        <h2 style={{ fontSize: '1rem' }}>Courses</h2>
        <span className="muted" style={{ fontSize: '0.8rem' }}>
          {loadingCourses ? 'Refreshing…' : 'The line on each bar marks 75%, the exam eligibility cut-off.'}
        </span>
      </div>

      {courses.length === 0 && !loadingCourses ? (
        <div className="panel empty">
          <BookOpen size={30} />
          <h3>No courses yet</h3>
          <p>You aren’t enrolled in any course. Ask your faculty to add your roll number.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {courses.map((item) => (
            <CourseRow
              key={item.course._id + item.branch}
              item={item}
              token={token}
              open={expanded === item.course._id}
              onToggle={() => setExpanded(expanded === item.course._id ? null : item.course._id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
