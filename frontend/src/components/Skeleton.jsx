import React from 'react';

// Placeholder rows shown while a table loads, so the layout doesn't jump.
export function SkeletonRows({ rows = 5 }) {
  return (
    <div className="skel-rows" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div className="skel-row" key={i}>
          <span className="skel" style={{ width: `${70 - (i % 3) * 12}%` }} />
          <span className="skel" style={{ width: '60%' }} />
          <span className="skel" style={{ width: '75%' }} />
          <span className="skel" style={{ width: '45%' }} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTiles() {
  return (
    <div className="tiles" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div className="tile" key={i}>
          <span className="skel" style={{ width: '50%', height: 10 }} />
          <span className="skel" style={{ width: '40%', height: 30, marginTop: 12 }} />
          <span className="skel" style={{ width: '70%', height: 9, marginTop: 10 }} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 3 }) {
  return (
    <div className="skel-cards" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => <span className="skel skel-card" key={i} />)}
    </div>
  );
}
