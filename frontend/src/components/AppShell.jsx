import React, { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LayoutGrid, DoorOpen, Users, BookOpen, FileBarChart, ScanLine, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';
import ThemeToggle from './ThemeToggle';
import { initials } from '../lib/format';

const NAV = [
  { to: '/dashboard', label: 'Lectures', icon: LayoutGrid },
  { to: '/analytics', label: 'Reports', icon: FileBarChart },
  { to: '/enrollment', label: 'Courses', icon: BookOpen },
  { to: '/students', label: 'Students', icon: Users },
  { to: '/classrooms', label: 'Classrooms', icon: DoorOpen }
];

function NavItems() {
  return (
    <>
      <nav className="side-nav" aria-label="Faculty">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}>
            <Icon size={17} strokeWidth={1.75} />
            {label}
          </NavLink>
        ))}
      </nav>
      <nav className="side-nav" aria-label="Student tools">
        <div className="side-nav-label eyebrow">For students</div>
        <NavLink to="/scan" className="side-link">
          <ScanLine size={17} strokeWidth={1.75} />
          Scanner
        </NavLink>
      </nav>
    </>
  );
}

function UserFoot({ onSignOut }) {
  const { user } = useAuth();
  return (
    <div className="sidebar-foot">
      {user && (
        <div className="user-chip">
          <div className="avatar">{initials(user.name)}</div>
          <div className="user-chip-text">
            <div className="user-chip-name">{user.name}</div>
            <div className="user-chip-meta">{user.department || user.email}</div>
          </div>
        </div>
      )}
      <div className="sidebar-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onSignOut}>
          <LogOut size={14} /> Sign out
        </button>
        <ThemeToggle className="btn btn-secondary btn-sm btn-icon" />
      </div>
    </div>
  );
}

export default function AppShell({ children }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [location.pathname]);

  const signOut = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Logo to="/dashboard" />
        </div>
        <NavItems />
        <UserFoot onSignOut={signOut} />
      </aside>

      <header className="topbar">
        <Logo to="/dashboard" />
        <button type="button" className="btn btn-ghost btn-icon" onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu size={20} />
        </button>
      </header>

      {open && (
        <>
          <div className="drawer-backdrop" onClick={() => setOpen(false)} />
          <aside className="drawer">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0.4rem' }}>
              <Logo to="/dashboard" />
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setOpen(false)} aria-label="Close menu">
                <X size={18} />
              </button>
            </div>
            <NavItems />
            <UserFoot onSignOut={signOut} />
          </aside>
        </>
      )}

      <main className="content">
        <div className="content-inner">{children}</div>
      </main>
    </div>
  );
}
