import React from 'react';
import { Link } from 'react-router-dom';
import Logo from './Logo';
import ThemeToggle from './ThemeToggle';

// A few rows of a paper register, ticked the way they always have been.
const LEDGER = [
  ['2023UGCS001', '✓✓✓✓·✓✓'],
  ['2023UGCS014', '✓✓·✓✓✓✓'],
  ['2023UGCS027', '✓✓✓✓✓✓✓'],
  ['2023UGCS042', '✓·✓✓✓✓✓'],
  ['2023UGCS055', '✓✓✓··✓✓'],
  ['2023UGCS063', '✓✓✓✓✓·✓'],
  ['2023UGCS078', '✓✓✓✓✓✓✓']
];

export default function AuthLayout({ children }) {
  return (
    <div className="auth">
      <div className="auth-main">
        <div className="auth-top">
          <Logo />
          <ThemeToggle />
        </div>
        <div className="auth-form">{children}</div>
        <div className="auth-foot">
          <Link to="/" className="link" style={{ color: 'var(--ink-3)' }}>Home</Link>
          <Link to="/my-attendance" className="link" style={{ color: 'var(--ink-3)' }}>Student portal</Link>
          <Link to="/scan" className="link" style={{ color: 'var(--ink-3)' }}>Scanner</Link>
        </div>
      </div>

      <aside className="auth-aside" aria-hidden="true">
        <div className="ledger">
          {LEDGER.map(([roll, marks]) => (
            <div className="ledger-row" key={roll}>
              <span>{roll}</span>
              <span className="ledger-ticks">
                {[...marks].map((m, i) => (
                  <span key={i} className={m === '·' ? 'a' : ''}>{m === '·' ? '–' : '✓'}</span>
                ))}
              </span>
            </div>
          ))}
        </div>
        <figure>
          <blockquote>Seventy names, called one at a time, every lecture, all semester.</blockquote>
          <figcaption>RollOne replaces the roll call with one screen and every student's phone.</figcaption>
        </figure>
      </aside>
    </div>
  );
}
