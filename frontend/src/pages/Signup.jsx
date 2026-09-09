import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { GraduationCap, ArrowRight } from 'lucide-react';

export default function Signup() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [department, setDepartment] = useState('Computer Science & Engineering');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await api.post('/auth/register', { name, email, password, department, role: 'faculty' });
      localStorage.setItem('campustrack_jwt', res.data.token);
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '85vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="card" style={{ width: '100%', maxWidth: '440px', padding: '2.5rem 2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{ width: '48px', height: '48px', background: 'var(--border-subtle)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
            <GraduationCap size={28} color="var(--accent-emerald)" />
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Create Faculty Account</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Set up professor portal for classroom lectures
          </p>
        </div>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-red)', color: 'var(--accent-red)', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input 
              type="text" 
              placeholder="Dr. Rajesh Sharma"
              value={name} 
              onChange={(e) => setName(e.target.value)}
              className="form-input"
              required 
            />
          </div>

          <div className="form-group">
            <label className="form-label">Campus Email</label>
            <input 
              type="email" 
              placeholder="faculty@campus.edu"
              value={email} 
              onChange={(e) => setEmail(e.target.value)}
              className="form-input"
              required 
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)}
              className="form-input"
              required 
            />
          </div>

          <div className="form-group">
            <label className="form-label">Academic Department</label>
            <input 
              type="text" 
              value={department} 
              onChange={(e) => setDepartment(e.target.value)}
              className="form-input"
              required 
            />
          </div>

          <button type="submit" disabled={loading} className="btn btn-emerald" style={{ width: '100%', padding: '0.85rem', marginTop: '1rem', fontSize: '0.95rem' }}>
            {loading ? 'Creating...' : 'Register'} <ArrowRight size={16} />
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--accent-cyan)', textDecoration: 'none', fontWeight: 600 }}>
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
