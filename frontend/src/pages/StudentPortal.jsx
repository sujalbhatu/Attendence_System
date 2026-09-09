import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { 
  User, 
  Lock, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  ChevronDown, 
  ChevronUp, 
  LogOut,
  GraduationCap,
  Sparkles,
  BookOpen,
  Calendar,
  CheckCircle2,
  ArrowLeft
} from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';

export default function StudentPortal() {
  const [token, setToken] = useState(localStorage.getItem('rollone-student-token'));
  const [student, setStudent] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('rollone-student-data') || 'null');
    } catch {
      return null;
    }
  });
  const [courses, setCourses] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [expandedCourse, setExpandedCourse] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Login Form State
  const [rollNumber, setRollNumber] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (token) {
      fetchCourses();
    }
  }, [token]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const cleanRoll = rollNumber.trim().toUpperCase();
      const res = await api.post('/student-portal/login', { 
        rollNumber: cleanRoll, 
        password 
      });
      const { token: receivedToken, student: studentData } = res.data;
      localStorage.setItem('rollone-student-token', receivedToken);
      localStorage.setItem('rollone-student-data', JSON.stringify(studentData));
      setToken(receivedToken);
      setStudent(studentData);
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid roll number or password');
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('rollone-student-token');
    localStorage.removeItem('rollone-student-data');
    setToken(null);
    setStudent(null);
    setCourses([]);
    setExpandedCourse(null);
    setSessions([]);
  };

  const fetchCourses = async () => {
    setLoadingCourses(true);
    try {
      const res = await api.get('/student-portal/my-courses', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCourses(res.data.courses || []);
    } catch (err) {
      if (err.response?.status === 401) {
        handleLogout();
      }
    } finally {
      setLoadingCourses(false);
    }
  };

  const fetchSessions = async (courseId) => {
    setLoadingSessions(true);
    try {
      const res = await api.get(`/student-portal/attendance/${courseId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSessions(res.data.attendance || []);
    } catch (err) {
      console.error('Failed to load sessions', err);
    } finally {
      setLoadingSessions(false);
    }
  };

  const toggleCourse = (courseId) => {
    if (expandedCourse === courseId) {
      setExpandedCourse(null);
    } else {
      setExpandedCourse(courseId);
      fetchSessions(courseId);
    }
  };

  const getStatusBadge = (percentage) => {
    const p = Math.round(percentage);
    if (p >= 75) {
      return (
        <span className="badge badge-emerald" style={{ gap: '0.35rem' }}>
          <CheckCircle size={14} /> Safe ({p}%)
        </span>
      );
    }
    if (p >= 60) {
      return (
        <span className="badge" style={{ background: 'rgba(217, 119, 6, 0.12)', color: 'var(--accent-amber)', borderColor: 'rgba(217, 119, 6, 0.25)', gap: '0.35rem' }}>
          <AlertTriangle size={14} /> Warning ({p}%)
        </span>
      );
    }
    return (
      <span className="badge" style={{ background: 'rgba(220, 38, 38, 0.12)', color: 'var(--accent-red)', borderColor: 'rgba(220, 38, 38, 0.25)', gap: '0.35rem' }}>
        <XCircle size={14} /> Critical ({p}%)
      </span>
    );
  };

  // 1. Login Screen
  if (!token) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div className="card" style={{ maxWidth: '420px', width: '100%', padding: '2.5rem 2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.85rem' }}>
              <ArrowLeft size={16} /> Home
            </Link>
            <ThemeToggle />
          </div>

          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ 
              background: 'var(--accent-emerald)', 
              width: '44px', 
              height: '44px', 
              borderRadius: '10px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              margin: '0 auto 0.75rem',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
            }}>
              <GraduationCap size={24} color="#ffffff" />
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.35rem' }}>RollOne Student Portal</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Check your official 75% semester attendance</p>
          </div>

          {error && (
            <div style={{ background: 'rgba(220, 38, 38, 0.1)', border: '1px solid var(--accent-red)', color: 'var(--accent-red)', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">College Roll Number</label>
              <div style={{ position: 'relative' }}>
                <User size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input 
                  type="text" 
                  className="form-input mono" 
                  style={{ paddingLeft: '2.5rem', textTransform: 'uppercase' }} 
                  placeholder="e.g. 2023UGCS042"
                  value={rollNumber} 
                  onChange={e => setRollNumber(e.target.value)} 
                  required 
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input 
                  type="password" 
                  className="form-input" 
                  style={{ paddingLeft: '2.5rem' }} 
                  placeholder="Default: lowercase roll number"
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  required 
                />
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                💡 Default password is your roll number in lowercase (e.g. <code>2023ugcs042</code>)
              </div>
            </div>

            <button type="submit" className="btn btn-emerald" style={{ width: '100%', marginTop: '1.25rem', padding: '0.75rem' }} disabled={loading}>
              {loading ? 'Signing In...' : 'Sign In to Portal'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 2. Student Dashboard Screen
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: '840px', margin: '0 auto' }}>
        {/* Top Header */}
        <header style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '2rem', 
          paddingBottom: '1.25rem', 
          borderBottom: '1px solid var(--border-subtle)',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'var(--accent-emerald)', padding: '0.45rem', borderRadius: '10px', display: 'flex' }}>
              <GraduationCap size={22} color="#ffffff" />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>RollOne Student Portal</div>
              <h1 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0 }}>{student?.name || student?.rollNumber}</h1>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.825rem' }}>
                <span className="mono">{student?.rollNumber}</span> • {student?.email}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <ThemeToggle />
            <button onClick={handleLogout} className="btn btn-secondary" style={{ padding: '0.45rem 0.85rem', fontSize: '0.825rem' }} title="Sign Out">
              <LogOut size={16} /> Sign Out
            </button>
          </div>
        </header>

        {/* 75% Criteria Info Pill */}
        <div style={{ 
          background: 'var(--bg-card)', 
          border: '1px solid var(--border-subtle)', 
          borderRadius: '12px', 
          padding: '1rem 1.25rem', 
          marginBottom: '2rem', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}>
          <div style={{ fontSize: '0.875rem' }}>
            <strong>UGC Attendance Regulation:</strong> Maintain at least <strong>75%</strong> in each enrolled course to be eligible for end-semester examinations.
          </div>
          <Link to="/scan" className="btn btn-emerald" style={{ padding: '0.45rem 1rem', fontSize: '0.825rem' }}>
            Open Mobile Scanner
          </Link>
        </div>

        {/* Enrolled Courses Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>Enrolled Courses ({courses.length})</h2>
          {loadingCourses && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Refreshing...</span>}
        </div>
        
        {/* Course Cards */}
        {courses.length === 0 && !loadingCourses ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--text-secondary)' }}>
            No courses found for your roll number. Contact your department administrator to enroll.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {courses.map(item => {
              const course = item.course;
              const attendance = item.attendance || { present: 0, total: 0, percentage: 0 };
              const percentage = Math.round(attendance.percentage);
              const isExpanded = expandedCourse === course._id;

              return (
                <div key={course._id} className="card card-hover" style={{ padding: 0, overflow: 'hidden' }}>
                  <div 
                    style={{ padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: 'var(--bg-surface)' }}
                    onClick={() => toggleCourse(course._id)}
                  >
                    <div style={{ flex: 1, paddingRight: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <span className="mono" style={{ fontWeight: 800, color: 'var(--accent-emerald)', fontSize: '0.95rem' }}>
                          {course.courseCode}
                        </span>
                        <span>•</span>
                        <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>{course.courseName}</span>
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.825rem' }}>
                        Branch: {item.branch} • Sem {course.semester} • {course.credits} Credits • {attendance.present} / {attendance.total} Lectures
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      {getStatusBadge(percentage)}
                      {isExpanded ? <ChevronUp size={20} color="var(--text-muted)" /> : <ChevronDown size={20} color="var(--text-muted)" />}
                    </div>
                  </div>
                  
                  {/* Expanded Session Ledger */}
                  {isExpanded && (
                    <div style={{ padding: '1.25rem 1.5rem', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-main)' }}>
                      <h3 style={{ fontSize: '0.925rem', fontWeight: 700, marginBottom: '0.75rem' }}>Lecture Breakdown</h3>
                      {loadingSessions ? (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '1rem 0' }}>Loading lecture sessions...</div>
                      ) : sessions.length === 0 ? (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '0.5rem 0' }}>No attendance records recorded for this course yet.</div>
                      ) : (
                        <div className="table-container">
                          <table className="table">
                            <thead>
                              <tr>
                                <th>Date & Time</th>
                                <th>Session Status</th>
                                <th>Your Attendance</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sessions.map(s => (
                                <tr key={s._id}>
                                  <td className="mono" style={{ fontSize: '0.85rem' }}>
                                    {new Date(s.sessionId?.sessionDate || s.createdAt).toLocaleString()}
                                  </td>
                                  <td>
                                    <span className="badge badge-zinc" style={{ fontSize: '0.75rem' }}>
                                      {s.sessionId?.status || 'CONCLUDED'}
                                    </span>
                                  </td>
                                  <td>
                                    <span className={`badge ${s.status === 'PRESENT' ? 'badge-emerald' : 'badge-zinc'}`} style={{ fontSize: '0.75rem' }}>
                                      {s.status === 'PRESENT' ? '✅ PRESENT' : '❌ ABSENT'}
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
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

