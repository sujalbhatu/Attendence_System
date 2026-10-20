import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not sign you in');
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="eyebrow">Faculty</div>
      <h1 style={{ marginTop: '0.4rem' }}>Sign in to RollOne</h1>
      <p>Start a lecture, open the projector and download the register.</p>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label className="label" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
            required
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <button type="submit" disabled={loading} className="btn btn-primary btn-lg btn-block" style={{ marginTop: '0.5rem' }}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div className="divider" style={{ margin: '1.75rem 0 1.25rem' }} />
      <div style={{ fontSize: '0.86rem', color: 'var(--ink-2)', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        <span>
          Have an invite code? <Link to="/signup" className="link">Create a faculty account</Link>
        </span>
        <span>
          Student? <Link to="/scan" className="link">Mark attendance</Link> or{' '}
          <Link to="/my-attendance" className="link">check your record</Link>
        </span>
      </div>
    </AuthLayout>
  );
}
