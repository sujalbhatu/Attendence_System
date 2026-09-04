import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Save, X, AlertCircle, CheckCircle } from 'lucide-react';
import WebcamCapture from '../components/WebcamCapture';
import { api } from '../services/api';

export default function AddStudent() {
  const [formData, setFormData] = useState({ name: '', rollNumber: '', section: 'CSE-A' });
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const webcamRef = useRef(null);
  const navigate = useNavigate();

  const handleCapture = async () => {
    if (photos.length >= 5) {
      setError('Maximum 5 photos allowed');
      return;
    }
    
    if (webcamRef.current) {
      const blob = await webcamRef.current.capture();
      if (blob) {
        setPhotos(prev => [...prev, blob]);
        setError('');
      }
    }
  };

  const removePhoto = (index) => {
    setPhotos(photos.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (photos.length < 3) {
      setError('Please capture at least 3 photos for accurate recognition');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const data = new FormData();
      data.append('name', formData.name);
      data.append('rollNumber', formData.rollNumber);
      data.append('section', formData.section);
      photos.forEach((photo, i) => data.append('images', photo, `photo_${i}.jpg`));
      
      await api.enrollStudent(data);
      setSuccess('Student enrolled successfully!');
      setTimeout(() => navigate('/students'), 1500);
    } catch (err) {
      setError(err.message || 'Failed to enroll student');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: '1000px' }}>
      <div className="page-header">
        <h1 className="page-title">Add New Student</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div className="card">
          <h2 style={{ marginBottom: '1.5rem' }}>Student Details</h2>
          
          {error && (
            <div style={{ background: 'rgba(255, 71, 87, 0.1)', border: '1px solid var(--danger-red)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger-red)' }}>
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div style={{ background: 'rgba(0, 230, 138, 0.1)', border: '1px solid var(--accent-emerald)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-emerald)' }}>
              <CheckCircle size={20} />
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Full Name</label>
              <input 
                type="text" 
                className="input-field" 
                required 
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label>Roll Number</label>
              <input 
                type="text" 
                className="input-field" 
                required 
                value={formData.rollNumber}
                onChange={e => setFormData({...formData, rollNumber: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label>Section</label>
              <select 
                className="input-field"
                value={formData.section}
                onChange={e => setFormData({...formData, section: e.target.value})}
              >
                <option value="CSE-A" style={{ background: 'var(--bg-dark-end)' }}>CSE-A</option>
                <option value="CSE-B" style={{ background: 'var(--bg-dark-end)' }}>CSE-B</option>
                <option value="ECE-A" style={{ background: 'var(--bg-dark-end)' }}>ECE-A</option>
              </select>
            </div>
            
            <div style={{ marginTop: '2rem' }}>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                Capture 3-5 photos of the student from slightly different angles.
                ({photos.length}/5 captured)
              </p>
              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ width: '100%' }}
                disabled={loading || photos.length < 3}
              >
                {loading ? 'Enrolling...' : <><Save size={20} /> Enroll Student</>}
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <h2 style={{ marginBottom: '1.5rem' }}>Face Enrollment</h2>
          
          <div style={{ marginBottom: '1rem', borderRadius: '12px', overflow: 'hidden' }}>
            <WebcamCapture ref={webcamRef} height="300px" />
          </div>
          
          <button 
            className="btn btn-secondary" 
            style={{ width: '100%', marginBottom: '1.5rem' }}
            onClick={handleCapture}
            disabled={photos.length >= 5}
            type="button"
          >
            <Camera size={20} /> Capture Photo
          </button>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
            {photos.map((blob, index) => (
              <div key={index} style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', aspectRatio: '4/3' }}>
                <img 
                  src={URL.createObjectURL(blob)} 
                  alt={`Capture ${index + 1}`} 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                />
                <button 
                  onClick={() => removePhoto(index)}
                  style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(255,0,0,0.8)', border: 'none', color: 'white', borderRadius: '50%', padding: '4px', cursor: 'pointer' }}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {[...Array(Math.max(0, 3 - photos.length))].map((_, i) => (
              <div key={`empty-${i}`} style={{ background: 'var(--glass-bg)', borderRadius: '8px', border: '1px dashed var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', aspectRatio: '4/3' }}>
                <Camera size={24} color="var(--text-secondary)" style={{ opacity: 0.3 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
