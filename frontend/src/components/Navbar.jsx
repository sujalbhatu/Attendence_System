import React, { useState, useEffect } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { 
  GraduationCap, 
  LayoutDashboard, 
  DoorOpen, 
  Users, 
  BarChart3, 
  QrCode, 
  LogOut, 
  Menu, 
  X,
  BookOpen,
  User
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from './ThemeToggle';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const handleLogout = () => {
    setMobileMenuOpen(false);
    logout();
    navigate('/login');
  };

  return (
    <>
      <nav className="navbar">
        <Link to="/dashboard" className="nav-brand">
          <div style={{ background: 'var(--accent-emerald-subtle)', padding: '0.35rem', borderRadius: '8px', display: 'flex', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
            <GraduationCap size={22} color="var(--accent-emerald)" />
          </div>
          <span>RollOne</span>
          <span className="nav-brand-badge">O(1) Engine</span>
        </Link>

        {/* Desktop Navigation */}
        <div className="nav-desktop-links">
          <NavLink to="/dashboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <LayoutDashboard size={17} /> Dashboard
          </NavLink>
          <NavLink to="/classrooms" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <DoorOpen size={17} /> Classrooms
          </NavLink>
          <NavLink to="/students" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Users size={17} /> Students
          </NavLink>
          <NavLink to="/enrollment" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <BookOpen size={17} /> Courses
          </NavLink>
          <NavLink to="/analytics" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <BarChart3 size={17} /> Analytics
          </NavLink>
          <NavLink to="/scan" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} style={{ color: 'var(--accent-cyan)' }}>
            <QrCode size={17} /> Student Scanner
          </NavLink>
        </div>

        {/* User Actions & Mobile Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          {user ? (
            <>
              <div className="nav-user-meta">
                <div style={{ fontSize: '0.825rem', fontWeight: 600 }}>{user.name}</div>
                <div style={{ fontSize: '0.725rem', color: 'var(--text-secondary)' }}>{user.department}</div>
              </div>
              <ThemeToggle />
              <button 
                onClick={handleLogout} 
                className="btn btn-secondary nav-desktop-links" 
                style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem' }} 
                title="Sign Out"
              >
                <LogOut size={16} /> Sign Out
              </button>
            </>
          ) : (
            <>
              <ThemeToggle />
              <Link to="/login" className="btn btn-primary" style={{ padding: '0.45rem 0.95rem', fontSize: '0.8rem' }}>
                Faculty Sign In
              </Link>
            </>
          )}

          {/* Mobile Menu Hamburger Button */}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="btn btn-secondary nav-mobile-toggle"
            style={{ padding: '0.45rem', minWidth: 'auto' }}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <>
          <div className="mobile-nav-backdrop" onClick={() => setMobileMenuOpen(false)} />
          <div className="mobile-nav-drawer">
            {user && (
              <div style={{ 
                padding: '0.85rem 1rem', 
                background: 'var(--bg-main)', 
                borderRadius: 'var(--radius-md)', 
                border: '1px solid var(--border-subtle)',
                marginBottom: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem'
              }}>
                <div style={{ 
                  width: '36px', 
                  height: '36px', 
                  borderRadius: '50%', 
                  background: 'var(--accent-emerald-subtle)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  border: '1px solid rgba(16, 185, 129, 0.3)'
                }}>
                  <User size={18} color="var(--accent-emerald)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {user.name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {user.department}
                  </div>
                </div>
              </div>
            )}

            <NavLink 
              to="/dashboard" 
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`}
            >
              <LayoutDashboard size={18} />
              <span>Dashboard</span>
            </NavLink>

            <NavLink 
              to="/classrooms" 
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`}
            >
              <DoorOpen size={18} />
              <span>Classrooms</span>
            </NavLink>

            <NavLink 
              to="/students" 
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`}
            >
              <Users size={18} />
              <span>Students</span>
            </NavLink>

            <NavLink 
              to="/enrollment" 
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`}
            >
              <BookOpen size={18} />
              <span>Courses & Enrollment</span>
            </NavLink>

            <NavLink 
              to="/analytics" 
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`}
            >
              <BarChart3 size={18} />
              <span>Attendance Analytics</span>
            </NavLink>

            <NavLink 
              to="/scan" 
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) => `mobile-nav-link scanner ${isActive ? 'active' : ''}`}
            >
              <QrCode size={18} />
              <span>Mobile Student Scanner</span>
            </NavLink>

            <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '0.5rem 0' }} />

            {user ? (
              <button 
                onClick={handleLogout} 
                className="btn btn-secondary" 
                style={{ width: '100%', justifyContent: 'center', padding: '0.75rem' }}
              >
                <LogOut size={16} /> Sign Out
              </button>
            ) : (
              <Link 
                to="/login" 
                onClick={() => setMobileMenuOpen(false)}
                className="btn btn-emerald" 
                style={{ width: '100%', justifyContent: 'center', padding: '0.75rem' }}
              >
                Faculty Sign In
              </Link>
            )}
          </div>
        </>
      )}
    </>
  );
}
