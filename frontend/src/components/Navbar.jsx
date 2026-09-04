import React, { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { LayoutDashboard, Camera, Users, BarChart3, LogOut, Settings, Menu, X, Radio } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  return (
    <nav className="navbar">
      <Link to="/dashboard" className="nav-brand">
        <Camera size={28} />
        FaceTrack
      </Link>

      <div className={`nav-links ${isMobileMenuOpen ? 'mobile-open' : ''}`} style={{ display: isMobileMenuOpen ? 'flex' : undefined, flexDirection: isMobileMenuOpen ? 'column' : undefined, position: isMobileMenuOpen ? 'absolute' : undefined, top: isMobileMenuOpen ? '100%' : undefined, left: isMobileMenuOpen ? '0' : undefined, right: isMobileMenuOpen ? '0' : undefined, background: isMobileMenuOpen ? 'var(--bg-dark-end)' : undefined, padding: isMobileMenuOpen ? '1rem' : undefined, borderBottom: isMobileMenuOpen ? '1px solid var(--glass-border)' : undefined }}>
        <NavLink to="/dashboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => setIsMobileMenuOpen(false)}>
          <LayoutDashboard size={20} />
          Dashboard
        </NavLink>
        <NavLink to="/attendance" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => setIsMobileMenuOpen(false)}>
          <Camera size={20} />
          Attendance
        </NavLink>
        <NavLink to="/students" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => setIsMobileMenuOpen(false)}>
          <Users size={20} />
          Students
        </NavLink>
        <NavLink to="/analytics" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => setIsMobileMenuOpen(false)}>
          <BarChart3 size={20} />
          Analytics
        </NavLink>
        <NavLink to="/ultrasound" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => setIsMobileMenuOpen(false)}>
          <Radio size={20} />
          Ultrasound Lab
        </NavLink>
      </div>

      <div className="nav-user">
        <span className="badge badge-primary">{user?.role || 'User'}</span>
        <span className="user-name" style={{ display: 'none' }}>{user?.name}</span>
        <Link to="/settings" className="nav-link" title="Settings">
          <Settings size={20} />
        </Link>
        <button onClick={logout} className="btn btn-secondary" style={{ padding: '0.5rem', border: 'none', background: 'transparent' }} title="Logout">
          <LogOut size={20} color="var(--danger-red)" />
        </button>
        <button className="mobile-menu-btn" onClick={toggleMobileMenu} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', display: 'none', '@media (max-width: 768px)': { display: 'block' } }}>
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>
      
      {/* Mobile menu styles addition for inline support since styled components aren't used */}
      <style dangerouslySetInnerHTML={{__html: `
        @media (max-width: 768px) {
          .nav-links { display: none; }
          .mobile-menu-btn { display: block !important; }
        }
      `}} />
    </nav>
  );
}
