import React from 'react';
import { User } from 'lucide-react';

export default function AttendanceTable({ records = [] }) {
  if (records.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
        <div style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          <User size={48} style={{ opacity: 0.5 }} />
        </div>
        <h3>No attendance records yet</h3>
        <p style={{ color: 'var(--text-secondary)' }}>Scan faces to add records here.</p>
      </div>
    );
  }

  return (
    <div className="table-container">
      <table className="table">
        <thead>
          <tr>
            <th>Photo</th>
            <th>Name</th>
            <th>Roll Number</th>
            <th>Time</th>
            <th>Confidence</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record, index) => (
            <tr key={record.id || index}>
              <td>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--glass-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {record.photoUrl ? (
                    <img src={record.photoUrl} alt={record.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontWeight: 'bold', color: 'var(--accent-cyan)' }}>
                      {record.name.charAt(0)}
                    </span>
                  )}
                </div>
              </td>
              <td style={{ fontWeight: '500' }}>{record.name}</td>
              <td style={{ color: 'var(--text-secondary)' }}>{record.rollNumber}</td>
              <td>{new Date(record.timestamp || Date.now()).toLocaleTimeString()}</td>
              <td>
                {record.confidence ? (
                  <span className={`badge ${record.confidence > 0.8 ? 'badge-success' : 'badge-warning'}`}>
                    {Math.round(record.confidence * 100)}%
                  </span>
                ) : (
                  <span className="badge badge-primary">Manual</span>
                )}
              </td>
              <td>
                <span className="badge badge-success">Present</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
