import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Camera, BarChart3, ShieldCheck, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Landing() {
  const { user, loading } = useAuth();

  if (!loading && user) {
    return <Navigate to="/dashboard" />;
  }

  return (
    <div>
      <div className="hero">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
          <div style={{ background: 'var(--glass-bg)', padding: '1rem', borderRadius: '24px', border: '1px solid var(--glass-border)' }}>
            <Camera size={64} color="var(--accent-cyan)" />
          </div>
        </div>
        <h1>FaceTrack</h1>
        <p>AI-Powered Face Recognition Attendance System</p>
        <div className="hero-btns">
          <Link to="/signup" className="btn btn-primary">
            Get Started <ArrowRight size={20} />
          </Link>
          <Link to="/login" className="btn btn-secondary">
            Login
          </Link>
        </div>
      </div>

      <div className="container grid grid-3" style={{ paddingBottom: '6rem' }}>
        <div className="card">
          <Camera size={40} color="var(--accent-cyan)" style={{ marginBottom: '1rem' }} />
          <h3>Real-time Recognition</h3>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', lineHeight: 1.6 }}>
            Lightning fast face detection and recognition using state-of-the-art AI models right in your browser.
          </p>
        </div>
        <div className="card">
          <BarChart3 size={40} color="var(--accent-emerald)" style={{ marginBottom: '1rem' }} />
          <h3>Smart Analytics</h3>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', lineHeight: 1.6 }}>
            Visualize attendance trends, identify low attendance patterns, and export comprehensive reports easily.
          </p>
        </div>
        <div className="card">
          <ShieldCheck size={40} color="var(--warning-amber)" style={{ marginBottom: '1rem' }} />
          <h3>Secure & Reliable</h3>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', lineHeight: 1.6 }}>
            Enterprise-grade security with liveness detection to prevent spoofing and ensure authentic check-ins.
          </p>
        </div>
      </div>
    </div>
  );
}
