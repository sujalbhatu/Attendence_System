import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';

import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import TakeAttendance from './pages/TakeAttendance';
import ManageStudents from './pages/ManageStudents';
import AddStudent from './pages/AddStudent';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import UltrasonicLab from './pages/UltrasonicLab';

const AppContent = () => {
  const location = useLocation();
  const isPublicRoute = ['/', '/login', '/signup'].includes(location.pathname);

  return (
    <>
      {!isPublicRoute && <Navbar />}
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/ultrasound" element={<UltrasonicLab />} />
        
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/attendance" element={<ProtectedRoute><TakeAttendance /></ProtectedRoute>} />
        <Route path="/students" element={<ProtectedRoute><ManageStudents /></ProtectedRoute>} />
        <Route path="/students/add" element={<ProtectedRoute><AddStudent /></ProtectedRoute>} />
        <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      </Routes>
    </>
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
