import React, { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';

const readTheme = () => {
  try {
    return localStorage.getItem('campustrack-theme') || 'light';
  } catch {
    return 'light';
  }
};

export default function ThemeToggle({ className = 'btn btn-ghost btn-icon' }) {
  const [theme, setTheme] = useState(readTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('campustrack-theme', theme);
    } catch {
      // storage unavailable: the choice just won't persist
    }
  }, [theme]);

  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className={className}
      title={`Switch to ${next} mode`}
      aria-label={`Switch to ${next} mode`}
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
