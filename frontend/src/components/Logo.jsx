import React from 'react';
import { Link } from 'react-router-dom';

// The mark is a register box with a tick in it: the thing a teacher writes a few thousand times a term.
export function LogoMark({ size = 22 }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2.75" y="2.75" width="18.5" height="18.5" rx="4.5" strokeWidth="1.75" />
      <path d="M7.6 12.4l3 3 5.9-6.8" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Logo({ to = '/', size = 22 }) {
  return (
    <Link to={to} className="brand" aria-label="RollOne home">
      <LogoMark size={size} />
      <span>RollOne</span>
    </Link>
  );
}
