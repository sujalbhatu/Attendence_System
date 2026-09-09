import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { 
  Play, 
  Plus, 
  DoorOpen, 
  Users, 
  Calendar, 
  Clock, 
  ExternalLink, 
  CheckCircle2, 
  Radio,
  BookOpen,
  Sparkles,
  Download,
  Lock
} from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [loading, setLoading] = useState(true);

  // New Session Modal State
  const [showModal, setShowModal] = useState(false);
  const [courseCode, setCourseCode] = useState('CS301');
  const [courseName, setCourseName] = useState('Database Management Systems');
  const [selectedClassroom, setSelectedClassroom] = useState('');
  const [requirePin, setRequirePin] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [sessRes, classRes] = await Promise.all([
        api.get('/sessions/my'),
        api.get('/classrooms')
      ]);
      setSessions(sessRes.data.sessions || []);
      setClassrooms(classRes.data.classrooms || []);
      if (classRes.data.classrooms?.length > 0) {
        setSelectedClassroom(classRes.data.classrooms[0]._id);
      }
      setLoading(false);
    } catch (err) {
      console.error('Fetch dashboard error:', err);
      setLoading(false);
    }
  };

  const handleStartSession = async (e) => {
    e.preventDefault();
    if (!selectedClassroom) {
      alert('Please select a classroom');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.post('/sessions', {
        courseCode,
        courseName,
        classroomId: selectedClassroom,
        requirePin
      });
      setShowModal(false);
      // Navigate directly to Projector View for the new session!
      navigate(`/projector/${res.data.session._id}`);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create session');
      setIsSubmitting(false);
    }
  };

  const [exportingId, setExportingId] = useState(null);

  const handleExportCSV = async (sessionId, courseCode = 'lecture') => {
    setExportingId(sessionId);
    try {
      const response = await api.get(`/sessions/${sessionId}/export-csv`, {
        responseType: 'blob'
      });
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `attendance_${courseCode}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to export CSV: ' + (err.response?.data?.error || err.message));
    } finally {
      setExportingId(null);
    }
  };

  return (
    <div className="main-content">
      {/* Top Banner */}
      <div className="page-header-row">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.35rem' }}>
            <span className="badge badge-emerald"><Sparkles size={12} /> University Enterprise</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>NIT Jamshedpur • CSE</span>
          </div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800 }}>Faculty Lecture Dashboard</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.925rem' }}>
            Manage lecture attendance with O(1) rotating cryptographic tokens.
          </p>
        </div>

        <button onClick={() => setShowModal(true)} className="btn btn-emerald" style={{ padding: '0.75rem 1.25rem' }}>
          <Plus size={18} /> Launch New Lecture Session
        </button>
      </div>

      {/* Overview Cards */}
      <div className="stats-grid">
        <div className="card">
          <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Total Sessions</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)' }}>{sessions.length}</div>
        </div>

        <div className="card">
          <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Configured Classrooms</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>{classrooms.length}</div>
        </div>

        <div className="card">
          <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Biometric Anti-Spoof</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent-emerald)', marginTop: '0.4rem' }}>
            Active (FaceNet 512-d)
          </div>
        </div>
      </div>

      {/* Sessions Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Recent Lecture Sessions</h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Showing last 20 lectures</span>
        </div>

        <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
          <table className="table table-responsive">
            <thead>
              <tr>
                <th>Course</th>
                <th>Lecture Name</th>
                <th>Room</th>
                <th>Date</th>
                <th>Status</th>
                <th>Present</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    No lecture sessions created yet. Click "Launch New Lecture Session" above!
                  </td>
                </tr>
              ) : (
                sessions.map((s) => (
                  <tr key={s._id}>
                    <td>
                      <span className="mono" style={{ fontWeight: 700, color: 'var(--accent-cyan)' }}>{s.courseCode}</span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{s.courseName}</td>
                    <td>{s.classroomId?.roomCode || 'L-302'}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      {new Date(s.sessionDate).toLocaleDateString()}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        {s.status === 'ACTIVE' ? (
                          <span className="badge badge-emerald"><Radio size={12} /> Active</span>
                        ) : (
                          <span className="badge badge-zinc">Concluded</span>
                        )}
                        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: s.requirePin ? 'var(--accent-emerald)' : 'var(--accent-cyan)' }}>
                          {s.requirePin ? '🔒 PIN Mode' : '⚡ Fast Mode'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <strong style={{ color: 'var(--text-primary)' }}>{s.stats?.presentCount || 0}</strong> students
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <Link to={`/projector/${s._id}`} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.78rem' }}>
                          <ExternalLink size={14} /> Projector
                        </Link>
                        <button 
                          onClick={() => handleExportCSV(s._id, s.courseCode)}
                          disabled={exportingId === s._id}
                          className="btn btn-secondary" 
                          style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem' }}
                          title="Download Attendance CSV"
                        >
                          <Download size={14} /> {exportingId === s._id ? '...' : 'CSV'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Start Session Modal */}
      {showModal && (
        <div className="modal-backdrop">
          <div className="card modal-card">
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: '0.35rem' }}>
              Launch Lecture Session
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              This will generate rotating HMAC tokens and open the classroom projector display.
            </p>

            <form onSubmit={handleStartSession}>
              <div className="form-group">
                <label className="form-label">Course Code</label>
                <input 
                  type="text" 
                  value={courseCode} 
                  onChange={(e) => setCourseCode(e.target.value.toUpperCase())}
                  className="form-input mono" 
                  required 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Lecture Topic / Title</label>
                <input 
                  type="text" 
                  value={courseName} 
                  onChange={(e) => setCourseName(e.target.value)}
                  className="form-input" 
                  required 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Classroom Location</label>
                <select 
                  value={selectedClassroom} 
                  onChange={(e) => setSelectedClassroom(e.target.value)}
                  className="form-select"
                  required
                >
                  {classrooms.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.roomCode} — {c.building} (Cap: {c.capacity})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginTop: '1.25rem' }}>
                <label className="form-label" style={{ marginBottom: '0.5rem', display: 'block' }}>
                  Verification Mode
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
                  <div 
                    onClick={() => setRequirePin(false)}
                    style={{
                      padding: '0.85rem',
                      borderRadius: '10px',
                      border: !requirePin ? '2px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                      background: !requirePin ? 'var(--accent-cyan-subtle)' : 'var(--bg-surface)',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 700, fontSize: '0.88rem', color: !requirePin ? 'var(--accent-cyan)' : 'var(--text-primary)' }}>
                      <Sparkles size={15} /> Fast Mode
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.3rem', lineHeight: '1.3' }}>
                      Quick scan & face check. Recommended for phone or podium.
                    </div>
                  </div>

                  <div 
                    onClick={() => setRequirePin(true)}
                    style={{
                      padding: '0.85rem',
                      borderRadius: '10px',
                      border: requirePin ? '2px solid var(--accent-emerald)' : '1px solid var(--border-subtle)',
                      background: requirePin ? 'var(--accent-emerald-subtle)' : 'var(--bg-surface)',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 700, fontSize: '0.88rem', color: requirePin ? 'var(--accent-emerald)' : 'var(--text-primary)' }}>
                      <Lock size={15} /> Strict PIN
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.3rem', lineHeight: '1.3' }}>
                      Line-of-Sight challenge PIN. Best for big projector screens.
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.75rem' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" disabled={isSubmitting} className="btn btn-emerald" style={{ flex: 1 }}>
                  <Play size={16} /> {isSubmitting ? 'Starting...' : 'Start Session'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
