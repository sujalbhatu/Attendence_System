import React, { useState, useEffect } from 'react';
import { Download, AlertTriangle } from 'lucide-react';
import { api } from '../services/api';

export default function Analytics() {
  const [section, setSection] = useState('');
  const [sections, setSections] = useState([]);
  const [dateRange, setDateRange] = useState({ 
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0] 
  });
  const [trendData, setTrendData] = useState([]);
  const [lowAttendance, setLowAttendance] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSections = async () => {
      try {
        const res = await api.getSections();
        setSections(res.data || []);
      } catch (err) {
        console.error('Failed to load sections', err);
      }
    };
    loadSections();
  }, []);

  useEffect(() => {
    const loadAnalytics = async () => {
      setLoading(true);
      try {
        if (dateRange.start && dateRange.end) {
          const trendsRes = await api.getTrends(dateRange.start, dateRange.end, section);
          setTrendData(trendsRes.data || []);
        }

        const lowRes = await api.getLowAttendance();
        setLowAttendance(lowRes.data || []);
      } catch (err) {
        console.error('Failed to load analytics', err);
      } finally {
        setLoading(false);
      }
    };
    loadAnalytics();
  }, [dateRange, section]);

  const handleExport = () => {
    api.exportCSV();
  };

  const maxVal = trendData.length > 0 ? Math.max(...trendData.map(d => d.percentage || 0), 1) : 100;

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">Analytics & Reports</h1>
        <button className="btn btn-secondary" onClick={handleExport}>
          <Download size={20} /> Export CSV
        </button>
      </div>

      <div className="card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Section</label>
            <select 
              className="input-field" 
              style={{ width: '200px', marginBottom: 0 }}
              value={section}
              onChange={(e) => setSection(e.target.value)}
            >
              <option value="" style={{ background: 'var(--bg-dark-end)' }}>All Sections</option>
              {sections.map(s => (
                <option key={s} value={s} style={{ background: 'var(--bg-dark-end)' }}>{s}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Start Date</label>
            <input 
              type="date" 
              className="input-field" 
              style={{ marginBottom: 0 }}
              value={dateRange.start}
              onChange={e => setDateRange({...dateRange, start: e.target.value})}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>End Date</label>
            <input 
              type="date" 
              className="input-field" 
              style={{ marginBottom: 0 }}
              value={dateRange.end}
              onChange={e => setDateRange({...dateRange, end: e.target.value})}
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
        <div className="card">
          <h2 style={{ marginBottom: '1.5rem' }}>Attendance Trends</h2>
          
          {loading ? (
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '3rem' }}>Loading trends...</p>
          ) : trendData.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '3rem' }}>No attendance data for the selected period.</p>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem', height: '300px', padding: '1rem 0 2rem', borderBottom: '1px solid var(--glass-border)' }}>
              {trendData.map((item, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', width: '100%' }}>
                    <div 
                      style={{ 
                        width: '100%', 
                        height: `${(item.percentage / maxVal) * 100}%`, 
                        background: 'linear-gradient(to top, var(--accent-cyan), #0099ff)',
                        borderRadius: '4px 4px 0 0',
                        transition: 'height 0.5s ease',
                        position: 'relative',
                        minHeight: '4px'
                      }}
                      title={`${item.percentage}%`}
                    >
                      <div style={{ position: 'absolute', top: '-25px', left: '50%', transform: 'translateX(-50%)', fontSize: '0.8rem', fontWeight: 'bold' }}>
                        {Math.round(item.percentage)}%
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: '1rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                    {item.date ? new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : `Day ${i+1}`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', color: 'var(--warning-amber)' }}>
            <AlertTriangle size={24} />
            <h2 style={{ color: 'var(--text-primary)' }}>Low Attendance</h2>
          </div>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.9rem' }}>Students below 75% threshold</p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {lowAttendance.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>No students below threshold</p>
            ) : lowAttendance.map((student, i) => (
              <div key={i} style={{ background: 'var(--glass-bg)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: '500' }}>{student.name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{student.rollNumber}</div>
                </div>
                <div className={`badge ${student.percentage < 60 ? 'badge-danger' : 'badge-warning'}`}>
                  {Math.round(student.percentage)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
