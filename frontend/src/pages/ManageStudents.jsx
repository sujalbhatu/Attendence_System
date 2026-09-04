import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus, Trash2, Edit2 } from 'lucide-react';
import { api } from '../services/api';

export default function ManageStudents() {
  const [search, setSearch] = useState('');
  const [section, setSection] = useState('');
  const [students, setStudents] = useState([]);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadStudents = async () => {
    try {
      setLoading(true);
      const res = await api.getStudents(search, section);
      setStudents(res.data || []);
    } catch (err) {
      console.error('Failed to load students', err);
    } finally {
      setLoading(false);
    }
  };

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
    loadStudents();
  }, [search, section]);

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this student?')) {
      try {
        await api.deleteStudent(id);
        setStudents(students.filter(s => s._id !== id));
      } catch (err) {
        console.error('Failed to delete student', err);
      }
    }
  };

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">Manage Students</h1>
        <Link to="/students/add" className="btn btn-primary">
          <Plus size={20} /> Add Student
        </Link>
      </div>

      <div className="card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={20} color="var(--text-secondary)" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
            <input 
              type="text" 
              className="input-field" 
              placeholder="Search by name or roll number..." 
              style={{ paddingLeft: '3rem', marginBottom: 0 }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
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
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Roll Number</th>
              <th>Section</th>
              <th>Enrollment Photos</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                  Loading students...
                </td>
              </tr>
            ) : students.map(student => (
              <tr key={student._id}>
                <td style={{ fontWeight: '500' }}>{student.name}</td>
                <td>{student.rollNumber}</td>
                <td><span className="badge badge-primary">{student.section}</span></td>
                <td>
                  <span className={`badge ${student.photoCount >= 3 ? 'badge-success' : 'badge-warning'}`}>
                    {student.photoCount || 0} photos
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-secondary" style={{ padding: '0.5rem' }} title="Edit">
                      <Edit2 size={16} />
                    </button>
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '0.5rem', color: 'var(--danger-red)' }} 
                      title="Delete"
                      onClick={() => handleDelete(student._id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && students.length === 0 && (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                  No students enrolled yet. Click "Add Student" to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
