import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, UserCheck, UserX, Activity, Plus } from 'lucide-react';
import StatCard from '../components/StatCard';
import AttendanceTable from '../components/AttendanceTable';
import { api } from '../services/api';

export default function Dashboard() {
  const [section, setSection] = useState('');
  const [sections, setSections] = useState([]);
  const [overview, setOverview] = useState({
    totalStudents: 0,
    presentToday: 0,
    absentToday: 0,
    attendanceRate: 0
  });
  const [recentRecords, setRecentRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const sectionsRes = await api.getSections();
        setSections(sectionsRes.data || []);

        const overviewRes = await api.getAnalyticsOverview(section);
        if (overviewRes.data) setOverview(overviewRes.data);

        if (section) {
          const recordsRes = await api.getAttendanceToday(section);
          setRecentRecords(recordsRes.data || []);
        } else {
          setRecentRecords([]);
        }
      } catch (err) {
        console.error('Failed to load dashboard data', err);
      } finally {
        setLoading(false);
      }
    };
    loadDashboardData();
  }, [section]);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>{today}</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <select 
            className="input-field" 
            style={{ marginBottom: 0, width: '150px' }}
            value={section}
            onChange={(e) => setSection(e.target.value)}
          >
            <option value="" style={{ background: 'var(--bg-dark-end)' }}>All Sections</option>
            {sections.map(s => (
              <option key={s} value={s} style={{ background: 'var(--bg-dark-end)' }}>{s}</option>
            ))}
          </select>
          <Link to="/students/add" className="btn btn-secondary">
            <Plus size={20} /> Add Student
          </Link>
          <Link to="/attendance" className="btn btn-primary">
            Take Attendance
          </Link>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: '2rem' }}>
        <StatCard 
          title="Total Students" 
          value={overview.totalStudents} 
          icon={Users} 
          color="var(--accent-cyan)" 
        />
        <StatCard 
          title="Present Today" 
          value={overview.presentToday} 
          icon={UserCheck} 
          color="var(--accent-emerald)" 
        />
        <StatCard 
          title="Absent Today" 
          value={overview.absentToday} 
          icon={UserX} 
          color="var(--danger-red)" 
        />
        <StatCard 
          title="Attendance Rate" 
          value={`${overview.attendanceRate}%`} 
          icon={Activity} 
          color="var(--warning-amber)" 
          trend={{ isPositive: overview.attendanceRate >= 80, value: overview.attendanceRate }}
        />
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2>Recent Check-ins</h2>
          <span className="badge badge-primary">{recentRecords.length} Today</span>
        </div>
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>Loading...</p>
        ) : (
          <AttendanceTable records={recentRecords} />
        )}
      </div>
    </div>
  );
}
