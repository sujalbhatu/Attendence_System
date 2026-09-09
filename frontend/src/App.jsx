import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';

import Dashboard from './pages/Dashboard';
import Classrooms from './pages/Classrooms';
import Students from './pages/Students';
import Analytics from './pages/Analytics';
import StudentScanner from './pages/StudentScanner';
import ProjectorView from './pages/ProjectorView';
import Login from './pages/Login';
import Signup from './pages/Signup';
import LandingPage from './pages/LandingPage';
import StudentPortal from './pages/StudentPortal';
import BulkEnrollment from './pages/BulkEnrollment';
import { useEffect } from 'react';

const AppContent = () => {
  const location = useLocation();

  // Hide top navigation on Projector screen and Mobile Scanner for immersion
  const hideNavbar = 
    location.pathname.startsWith('/projector') || 
    location.pathname === '/scan' || 
    ['/login', '/signup', '/my-attendance', '/'].includes(location.pathname);

  useEffect(() => {
    const saved = localStorage.getItem('campustrack-theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
  }, []);

  return (
    <div className="app-layout">
      {!hideNavbar && <Navbar />}
      <Routes>
        {/* Public Mobile Scanner */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/my-attendance" element={<StudentPortal />} />
        <Route path="/scan" element={<StudentScanner />} />

        {/* Public / Semi-public Projector Screen */}
        <Route path="/projector/:sessionId" element={<ProjectorView />} />

        {/* Auth */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* Protected Faculty Portals */}
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/classrooms" element={<ProtectedRoute><Classrooms /></ProtectedRoute>} />
        <Route path="/students" element={<ProtectedRoute><Students /></ProtectedRoute>} />
        <Route path="/enrollment" element={<ProtectedRoute><BulkEnrollment /></ProtectedRoute>} />
        <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
      </Routes>
    </div>
  );
};

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
}
