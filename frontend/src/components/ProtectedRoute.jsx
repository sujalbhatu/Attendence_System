import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AppShell from './AppShell';

export default function ProtectedRoute({ children, bare = false }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading-line" style={{ paddingTop: '30vh' }}>Checking your session…</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return bare ? children : <AppShell>{children}</AppShell>;
}
