import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { BarChart3, Download, Calendar, Users, CheckCircle2, Search, ArrowUpRight } from 'lucide-react';

export default function Analytics() {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/sessions/my')
      .then((res) => {
        const sess = res.data.sessions || [];
        setSessions(sess);
        if (sess.length > 0) {
          loadSessionRecords(sess[0]._id);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const loadSessionRecords = async (sessionId) => {
    try {
      const sess = sessions.find((s) => s._id === sessionId);
      setSelectedSession(sess);
      const res = await api.get(`/attendance/live-roster/${sessionId}`);
      setRoster(res.data.roster || []);
    } catch (err) {
      console.error(err);
    }
  };

  const [isExporting, setIsExporting] = useState(false);

  const handleExportCSV = async (sessionId, courseCode = 'lecture') => {
    setIsExporting(true);
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
      setIsExporting(false);
    }
  };

  return (
    <div className="main-content">
      <div className="page-header-row">
        <div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800 }}>Attendance Audit & Analytics</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.925rem' }}>
            Permanent academic attendance ledger and ERP export center.
          </p>
        </div>

        {selectedSession && (
          <button 
            onClick={() => handleExportCSV(selectedSession._id, selectedSession.courseCode)}
            disabled={isExporting}
            className="btn btn-emerald"
          >
            <Download size={16} /> {isExporting ? 'Exporting...' : 'Export Current Session CSV'}
          </button>
        )}
      </div>

      <div className="analytics-grid">
        {/* Sessions List */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-subtle)', fontWeight: 700 }}>
            Lecture Sessions
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '500px', overflowY: 'auto' }}>
            {sessions.map((s) => (
              <div 
                key={s._id}
                onClick={() => loadSessionRecords(s._id)}
                style={{ 
                  padding: '1rem 1.25rem', 
                  borderBottom: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  background: selectedSession?._id === s._id ? 'var(--bg-card-hover)' : 'transparent'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="mono" style={{ fontWeight: 700, color: 'var(--accent-cyan)' }}>{s.courseCode}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(s.sessionDate).toLocaleDateString()}</span>
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, marginTop: '2px' }}>{s.courseName}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Room {s.classroomId?.roomCode} • {s.stats?.presentCount || 0} Present
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Detailed Roster */}
        <div className="table-container">
          <table className="table table-responsive">
            <thead>
              <tr>
                <th>Roll Number</th>
                <th>Student Name</th>
                <th>Status</th>
                <th>Match Score</th>
                <th>Marked Time</th>
              </tr>
            </thead>
            <tbody>
              {roster.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    No students marked present for this session yet.
                  </td>
                </tr>
              ) : (
                roster.map((r, i) => (
                  <tr key={i}>
                    <td className="mono" style={{ fontWeight: 700, color: 'var(--accent-cyan)' }}>{r.rollNumber}</td>
                    <td style={{ fontWeight: 600 }}>{r.studentName}</td>
                    <td><span className="badge badge-emerald">PRESENT</span></td>
                    <td>{(r.verificationMetrics?.cosineSimilarity * 100).toFixed(1)}%</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      {new Date(r.markedAt).toLocaleTimeString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
