import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';

export default function Signup() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [department, setDepartment] = useState('Computer Science & Engineering');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/register', { name, email, password, department, inviteCode });
      localStorage.setItem('campustrack_jwt', res.data.token);
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="eyebrow">Faculty</div>
      <h1 style={{ marginTop: '0.4rem' }}>Create your account</h1>
      <p>Faculty accounts are invite-only. Ask your department administrator for a code.</p>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label className="label" htmlFor="name">Full name</label>
          <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
        </div>
        <div className="field">
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </div>
        <div className="field">
          <label className="label" htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
          <span className="hint">At least 8 characters.</span>
        </div>
        <div className="field">
          <label className="label" htmlFor="department">Department</label>
          <input id="department" className="input" value={department} onChange={(e) => setDepartment(e.target.value)} required />
        </div>
        <div className="field">
          <label className="label" htmlFor="invite">Invite code</label>
          <input id="invite" className="input mono" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} autoComplete="off" required />
        </div>
        <button type="submit" disabled={loading} className="btn btn-primary btn-lg btn-block" style={{ marginTop: '0.5rem' }}>
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <div className="divider" style={{ margin: '1.75rem 0 1.25rem' }} />
      <div style={{ fontSize: '0.86rem', color: 'var(--ink-2)' }}>
        Already registered? <Link to="/login" className="link">Sign in</Link>
      </div>
    </AuthLayout>
  );
}
