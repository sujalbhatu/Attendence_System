import React, { useState } from 'react';
import { Upload, Users, FileText, CheckCircle2, AlertCircle } from 'lucide-react';

export default function BulkEnrollment() {
  const [courseId, setCourseId] = useState('');
  const [branch, setBranch] = useState('');
  const [enrollmentMethod, setEnrollmentMethod] = useState('text');
  const [textInput, setTextInput] = useState('');
  const [parsedStudents, setParsedStudents] = useState([]);
  const [results, setResults] = useState(null);

  // Mock courses
  const courses = [
    { id: '1', name: 'Data Structures (CS201)' },
    { id: '2', name: 'Operating Systems (CS202)' }
  ];

  const handleTextChange = (e) => {
    setTextInput(e.target.value);
    const rolls = e.target.value.split('\n').map(s => s.trim()).filter(s => s);
    setParsedStudents(rolls.map(roll => ({ rollNumber: roll })));
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Mock CSV parsing
      setTimeout(() => {
        setParsedStudents([
          { rollNumber: '2023UG1001' },
          { rollNumber: '2023UG1002' }
        ]);
        setEnrollmentMethod('csv');
      }, 500);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!courseId || parsedStudents.length === 0) return;

    // Mock API call
    setTimeout(() => {
      setResults({
        success: parsedStudents.length,
        skipped: 0,
        errors: 0
      });
    }, 1000);
  };

  return (
    <div className="main-content">
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>Bulk Enrollment</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Enroll multiple students into a course at once.</p>
      </div>

      <div className="bulk-enroll-grid">
        <div className="card">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Select Course</label>
              <select className="form-select" value={courseId} onChange={e => setCourseId(e.target.value)} required>
                <option value="">-- Select a course --</option>
                {courses.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Branch (Optional)</label>
              <input type="text" className="form-input" placeholder="e.g., CSE" value={branch} onChange={e => setBranch(e.target.value)} />
            </div>

            <div style={{ marginTop: '1.5rem', marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
              <button 
                type="button"
                className={`btn ${enrollmentMethod === 'text' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setEnrollmentMethod('text')}
                style={{ flex: 1 }}
              >
                <FileText size={16} /> Paste Text
              </button>
              <button 
                type="button"
                className={`btn ${enrollmentMethod === 'csv' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setEnrollmentMethod('csv')}
                style={{ flex: 1 }}
              >
                <Upload size={16} /> Upload CSV
              </button>
            </div>

            {enrollmentMethod === 'text' ? (
              <div className="form-group">
                <label className="form-label">Roll Numbers (one per line)</label>
                <textarea 
                  className="form-input" 
                  style={{ minHeight: '150px', resize: 'vertical' }}
                  value={textInput}
                  onChange={handleTextChange}
                  placeholder="2023UG1001&#10;2023UG1002"
                />
              </div>
            ) : (
              <div className="form-group" style={{ border: '2px dashed var(--border-strong)', padding: '2rem', textAlign: 'center', borderRadius: 'var(--radius-md)' }}>
                <Upload size={32} color="var(--text-muted)" style={{ margin: '0 auto 1rem' }} />
                <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>Upload a CSV file containing a 'rollNumber' column</p>
                <input type="file" accept=".csv" onChange={handleFileUpload} style={{ display: 'none' }} id="csv-upload" />
                <label htmlFor="csv-upload" className="btn btn-secondary" style={{ cursor: 'pointer' }}>Select File</label>
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1.5rem' }} disabled={!courseId || parsedStudents.length === 0}>
              <Users size={18} /> Enroll {parsedStudents.length} Students
            </button>
          </form>
        </div>

        <div>
          {results ? (
            <div className="card" style={{ background: 'var(--accent-emerald-subtle)', borderColor: 'rgba(16, 185, 129, 0.25)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <CheckCircle2 size={24} color="var(--accent-emerald)" />
                <h3 style={{ color: 'var(--accent-emerald)', fontSize: '1.25rem' }}>Enrollment Complete</h3>
              </div>
              <ul style={{ listStyle: 'none', gap: '0.5rem', display: 'flex', flexDirection: 'column', color: 'var(--text-primary)' }}>
                <li>Successfully enrolled: <strong>{results.success}</strong></li>
                <li>Skipped (already enrolled): <strong>{results.skipped}</strong></li>
                <li>Errors: <strong>{results.errors}</strong></li>
              </ul>
              <button onClick={() => { setResults(null); setTextInput(''); setParsedStudents([]); }} className="btn btn-secondary" style={{ marginTop: '1.5rem', width: '100%' }}>
                Enroll More
              </button>
            </div>
          ) : (
            <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ fontSize: '1.125rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Users size={18} color="var(--text-muted)" /> Preview ({parsedStudents.length})
              </h3>
              
              {parsedStudents.length > 0 ? (
                <div className="table-container" style={{ flex: 1, maxHeight: '400px', overflowY: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Roll Number</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedStudents.map((s, i) => (
                        <tr key={i}>
                          <td className="mono">{s.rollNumber}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                  <AlertCircle size={32} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                  <p>No students parsed yet</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
