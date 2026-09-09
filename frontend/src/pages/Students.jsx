import React, { useState, useEffect, useRef } from 'react';
import api from '../api/client';
import { 
  Users, 
  Plus, 
  Camera, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  Sparkles, 
  Eye, 
  RefreshCw,
  Search
} from 'lucide-react';

export default function Students() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Add Student Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [rollNumber, setRollNumber] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('Computer Science & Engineering');

  // Enroll Face Modal
  const [enrollingStudent, setEnrollingStudent] = useState(null);
  const [enrollStep, setEnrollStep] = useState('READY'); // READY | CAPTURING | PROCESSING | DONE
  const [capturedFrames, setCapturedFrames] = useState([]);
  const videoRef = useRef(null);

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    try {
      const res = await api.get('/students');
      setStudents(res.data.students || []);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    try {
      await api.post('/students', { rollNumber, name, email, department });
      setShowAddModal(false);
      setRollNumber('');
      setName('');
      setEmail('');
      fetchStudents();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add student');
    }
  };

  // Start Face Enrollment Studio
  const openEnrollModal = (student) => {
    setEnrollingStudent(student);
    setEnrollStep('READY');
    setCapturedFrames([]);

    setTimeout(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        alert('Could not access camera: ' + err.message);
      }
    }, 150);
  };

  const closeEnrollModal = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
    }
    setEnrollingStudent(null);
  };

  // Capture 3 face crops and enroll
  const captureAndEnroll = async () => {
    if (!videoRef.current || !enrollingStudent) return;
    setEnrollStep('CAPTURING');

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');

    const frames = [];
    for (let i = 0; i < 3; i++) {
      const minDim = Math.min(video.videoWidth, video.videoHeight);
      const startX = (video.videoWidth - minDim) / 2;
      const startY = (video.videoHeight - minDim) / 2;

      ctx.drawImage(video, startX, startY, minDim, minDim, 0, 0, 320, 320);
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
      frames.push(blob);
      await new Promise((r) => setTimeout(r, 200));
    }

    setEnrollStep('PROCESSING');

    const formData = new FormData();
    frames.forEach((f, idx) => {
      formData.append('images', f, `sample_${idx}.jpg`);
    });

    try {
      await api.post(`/students/${enrollingStudent._id}/enroll`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setEnrollStep('DONE');
      fetchStudents();
    } catch (err) {
      alert(err.response?.data?.error || 'Face enrollment failed');
      setEnrollStep('READY');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to remove this student?')) {
      await api.delete(`/students/${id}`);
      fetchStudents();
    }
  };

  const filtered = students.filter(
    (s) =>
      s.rollNumber.toLowerCase().includes(search.toLowerCase()) ||
      s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="main-content">
      <div className="page-header-row">
        <div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800 }}>Student Directory & Biometric Studio</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.925rem' }}>
            Manage enrolled students and register 512-dimensional FaceNet embeddings.
          </p>
        </div>

        <button onClick={() => setShowAddModal(true)} className="btn btn-emerald">
          <Plus size={18} /> Add New Student
        </button>
      </div>

      {/* Search Bar */}
      <div className="card" style={{ padding: '0.85rem 1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Search size={18} color="var(--text-secondary)" />
        <input 
          type="text"
          placeholder="Search by Roll Number or Name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', width: '100%', fontSize: '0.95rem' }}
        />
      </div>

      {/* Students Table */}
      <div className="table-container">
        <table className="table table-responsive">
          <thead>
            <tr>
              <th>Roll Number</th>
              <th>Full Name</th>
              <th>Department</th>
              <th>Batch</th>
              <th>Biometric Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  No students found.
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr key={s._id}>
                  <td className="mono" style={{ fontWeight: 700, color: 'var(--accent-cyan)' }}>
                    {s.rollNumber}
                  </td>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td>{s.department}</td>
                  <td>{s.batch}</td>
                  <td>
                    {s.isEnrolled ? (
                      <span className="badge badge-emerald">
                        <CheckCircle2 size={12} /> Enrolled (512-d)
                      </span>
                    ) : (
                      <span className="badge badge-amber">Pending Face Capture</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button 
                        onClick={() => openEnrollModal(s)}
                        className={`btn ${s.isEnrolled ? 'btn-secondary' : 'btn-emerald'}`}
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                      >
                        <Camera size={14} /> {s.isEnrolled ? 'Re-enroll Face' : 'Enroll Face'}
                      </button>
                      <button 
                        onClick={() => handleDelete(s._id)}
                        className="btn btn-secondary"
                        style={{ padding: '0.35rem 0.65rem' }}
                        title="Delete Student"
                      >
                        <Trash2 size={14} color="var(--accent-red)" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ADD STUDENT MODAL */}
      {showAddModal && (
        <div className="modal-backdrop">
          <div className="card modal-card">
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: '1rem' }}>Add Student</h2>
            <form onSubmit={handleAddStudent}>
              <div className="form-group">
                <label className="form-label">Roll Number</label>
                <input 
                  type="text" 
                  placeholder="e.g. 2023UGCS042" 
                  value={rollNumber} 
                  onChange={(e) => setRollNumber(e.target.value.toUpperCase())}
                  className="form-input mono"
                  required 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. Sujal Bhatu" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)}
                  className="form-input"
                  required 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email (Optional)</label>
                <input 
                  type="email" 
                  placeholder="e.g. student@nitjsr.ac.in" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Department</label>
                <input 
                  type="text" 
                  value={department} 
                  onChange={(e) => setDepartment(e.target.value)}
                  className="form-input"
                  required 
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-emerald" style={{ flex: 1 }}>
                  Create Student
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FACE ENROLLMENT STUDIO MODAL */}
      {enrollingStudent && (
        <div className="modal-backdrop">
          <div className="card modal-card" style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: '0.25rem' }}>
              Face Biometrics Enrollment
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Enrolling <strong style={{ color: 'var(--text-primary)' }}>{enrollingStudent.name}</strong> ({enrollingStudent.rollNumber})
            </p>

            {enrollStep === 'DONE' ? (
              <div style={{ padding: '1.5rem 1rem' }}>
                <CheckCircle2 size={48} color="var(--accent-emerald)" style={{ margin: '0 auto 1rem' }} />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                  Enrollment Complete!
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                  512-dimensional FaceNet embedding generated and saved to MongoDB.
                </p>
                <button onClick={closeEnrollModal} className="btn btn-emerald" style={{ width: '100%' }}>
                  Done
                </button>
              </div>
            ) : (
              <>
                <div style={{ position: 'relative', width: 'min(240px, 65vw)', height: 'min(240px, 65vw)', margin: '0 auto 1.5rem', borderRadius: '50%', overflow: 'hidden', border: '3px solid var(--accent-cyan)' }}>
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} 
                  />
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button type="button" onClick={closeEnrollModal} className="btn btn-secondary" style={{ flex: 1 }}>
                    Cancel
                  </button>
                  <button 
                    type="button" 
                    onClick={captureAndEnroll} 
                    disabled={enrollStep !== 'READY'}
                    className="btn btn-emerald" 
                    style={{ flex: 1 }}
                  >
                    <Camera size={16} /> {enrollStep === 'CAPTURING' ? 'Capturing...' : enrollStep === 'PROCESSING' ? 'Processing ML...' : 'Capture & Enroll'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
