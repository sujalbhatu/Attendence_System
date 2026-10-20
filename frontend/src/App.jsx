import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LandingPage from './pages/LandingPage';

// The landing page loads eagerly; everything else (and the camera / QR libraries) on demand.
const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Analytics = lazy(() => import('./pages/Analytics'));
const BulkEnrollment = lazy(() => import('./pages/BulkEnrollment'));
const Students = lazy(() => import('./pages/Students'));
const Classrooms = lazy(() => import('./pages/Classrooms'));
const ProjectorView = lazy(() => import('./pages/ProjectorView'));
const StudentScanner = lazy(() => import('./pages/StudentScanner'));
const StudentPortal = lazy(() => import('./pages/StudentPortal'));

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <Suspense fallback={<div className="loading-line" style={{ paddingTop: '30vh' }}>Loading…</div>}>
          <Routes>
            {/* Public */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />

            {/* Students (own login, no faculty shell) */}
            <Route path="/scan" element={<StudentScanner />} />
            <Route path="/my-attendance" element={<StudentPortal />} />

            {/* Faculty */}
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
            <Route path="/enrollment" element={<ProtectedRoute><BulkEnrollment /></ProtectedRoute>} />
            <Route path="/students" element={<ProtectedRoute><Students /></ProtectedRoute>} />
            <Route path="/classrooms" element={<ProtectedRoute><Classrooms /></ProtectedRoute>} />

            {/* Classroom screen: full-bleed, no shell */}
            <Route path="/projector/:sessionId" element={<ProtectedRoute bare><ProjectorView /></ProtectedRoute>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </Router>
  );
}
