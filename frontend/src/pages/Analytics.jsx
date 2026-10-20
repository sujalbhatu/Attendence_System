import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Download, FileBarChart, Search } from 'lucide-react';
import api from '../api/client';
import { formatDay, formatTime, formatTimeSec, percent, downloadSessionCsv, errorText } from '../lib/format';
import { SkeletonRows } from '../components/Skeleton';

const STATUS_TAG = {
  PRESENT: 'tag-present',
  FLAGGED: 'tag-flagged',
  ABSENT: 'tag-absent'
};

export default function Analytics() {
  const [params, setParams] = useSearchParams();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roster, setRoster] = useState([]);
  const [enrolledCount, setEnrolledCount] = useState(0);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState('ALL');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api.get('/sessions/my')
      .then((res) => setSessions(res.data.sessions || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const selectedId = params.get('session') || sessions[0]?._id;
  const selected = sessions.find((s) => s._id === selectedId);

  useEffect(() => {
    if (!selectedId) return;
    setLoadingRoster(true);
    api.get(`/attendance/live-roster/${selectedId}`)
      .then((res) => {
        setRoster(res.data.roster || []);
        setEnrolledCount(res.data.enrolledCount || 0);
      })
      .catch(() => setRoster([]))
      .finally(() => setLoadingRoster(false));
  }, [selectedId]);

  const counts = useMemo(() => {
    const c = { PRESENT: 0, FLAGGED: 0, ABSENT: 0 };
    roster.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; });
    return c;
  }, [roster]);

  const shown = roster.filter((r) => {
    const q = filter.trim().toLowerCase();
    if (status !== 'ALL' && r.status !== status) return false;
    return !q || r.rollNumber?.toLowerCase().includes(q) || r.studentName?.toLowerCase().includes(q);
  });

  const expected = enrolledCount || selected?.classroomId?.capacity || 0;
  const rate = expected ? counts.PRESENT / expected : null;

  const exportCsv = async () => {
    if (!selected) return;
    setExporting(true);
    try {
      await downloadSessionCsv(selected._id, selected.courseCode);
    } catch (err) {
      alert(`Export failed: ${errorText(err, 'unknown error')}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Reports</div>
          <h1>Attendance register</h1>
          <p>Every check-in for a lecture, with the face-match score and distance from the room.</p>
        </div>
        {selected && (
          <div className="page-head-actions">
            <button className="btn btn-secondary" onClick={exportCsv} disabled={exporting}>
              <Download size={16} /> {exporting ? 'Preparing…' : 'Download CSV'}
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="panel"><SkeletonRows rows={6} /></div>
      ) : sessions.length === 0 ? (
        <div className="panel empty">
          <FileBarChart size={32} />
          <h3>Nothing to report yet</h3>
          <p>Reports appear here once you have run a lecture.</p>
          <Link to="/dashboard" className="btn btn-primary">Go to lectures</Link>
        </div>
      ) : (
        <div className="split split-wide">
          <section className="panel" style={{ overflow: 'hidden' }}>
            <div className="panel-head">
              <h2>Lectures</h2>
              <span className="muted">{sessions.length}</span>
            </div>
            <div className="list" style={{ maxHeight: '68vh', overflowY: 'auto' }}>
              {sessions.map((s) => (
                <button
                  key={s._id}
                  type="button"
                  className="list-item"
                  aria-current={s._id === selectedId}
                  onClick={() => setParams({ session: s._id })}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <span className="mono" style={{ fontSize: '0.82rem' }}>{s.courseCode}</span>
                    <span className="muted" style={{ fontSize: '0.76rem' }}>{formatDay(s.sessionDate)}</span>
                  </div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', marginTop: '0.1rem' }}>{s.courseName}</div>
                  <div className="muted" style={{ fontSize: '0.78rem', marginTop: '0.15rem' }}>
                    {s.classroomId?.roomCode || '—'} · {s.stats?.presentCount || 0} present
                    {s.status === 'ACTIVE' && <span style={{ color: 'var(--accent)' }}> · live</span>}
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="panel" style={{ overflow: 'hidden' }}>
            {selected && (
              <div className="panel-pad" style={{ borderBottom: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <div>
                    <div className="mono muted" style={{ fontSize: '0.8rem' }}>
                      {selected.courseCode}{selected.branch ? ` · ${selected.branch}` : ''}
                    </div>
                    <h2 style={{ fontSize: '1.15rem', marginTop: '0.15rem' }}>{selected.courseName}</h2>
                    <div className="muted" style={{ fontSize: '0.82rem', marginTop: '0.2rem' }}>
                      {formatDay(selected.sessionDate)}, {formatTime(selected.sessionDate)} · Room {selected.classroomId?.roomCode || '—'} ·{' '}
                      {selected.requirePin ? 'with screen PIN' : 'quick check-in'}
                    </div>
                  </div>
                  <span className={`tag ${selected.status === 'ACTIVE' ? 'tag-accent tag-dot' : ''}`}>
                    {selected.status === 'ACTIVE' ? 'Live' : 'Concluded'}
                  </span>
                </div>

              </div>
            )}

            {selected && (
              <div className="verdict">
                <div className="verdict-pct" style={{ color: rate == null ? 'var(--ink-3)' : rate >= 0.75 ? 'var(--present)' : 'var(--absent)' }}>
                  {rate == null ? '—' : percent(rate)}
                  <small>present, of {expected || '—'} {enrolledCount ? 'enrolled' : 'seats'}</small>
                </div>
                <div>
                  <div className="stack-wrap">
                    <div className="stack-bar">
                      {expected > 0 && (
                        <>
                          <span className="p" style={{ width: `${(counts.PRESENT / expected) * 100}%` }} />
                          <span className="f" style={{ width: `${(counts.FLAGGED / expected) * 100}%` }} />
                          <span className="a" style={{ width: `${(counts.ABSENT / expected) * 100}%` }} />
                        </>
                      )}
                    </div>
                    <div className="meter-mark" style={{ left: '75%' }} />
                    <span className="mark-label" style={{ left: '75%' }}>75%</span>
                  </div>
                  <div className="legend">
                    <span><i style={{ background: 'var(--present)' }} /> Present <b>{counts.PRESENT}</b></span>
                    <span><i style={{ background: 'var(--flagged)' }} /> Flagged <b>{counts.FLAGGED}</b></span>
                    <span><i style={{ background: 'var(--absent)' }} /> Absent <b>{counts.ABSENT}</b></span>
                    {selected.status !== 'ACTIVE' && !selected.courseId && (
                      <span className="muted">Not linked to a course, so absentees weren’t recorded.</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="toolbar">
              <div className="input-wrap">
                <Search size={15} />
                <input className="input" placeholder="Filter by roll number or name" value={filter} onChange={(e) => setFilter(e.target.value)} />
              </div>
              <div className="chips" role="group" aria-label="Status">
                {[['ALL', 'All', roster.length], ['PRESENT', 'Present', counts.PRESENT], ['FLAGGED', 'Flagged', counts.FLAGGED], ['ABSENT', 'Absent', counts.ABSENT]].map(([key, label, n]) => (
                  <button key={key} type="button" className="chip" aria-pressed={status === key} onClick={() => setStatus(key)}>
                    {label} <span className="count">{n}</span>
                  </button>
                ))}
              </div>
            </div>

            {loadingRoster ? (
              <SkeletonRows rows={6} />
            ) : shown.length === 0 ? (
              <div className="empty">
                <h3>{roster.length ? 'No matches' : 'No check-ins recorded'}</h3>
                <p>{roster.length ? 'Try a different roll number or name.' : 'Students appear here as soon as they verify.'}</p>
              </div>
            ) : (
              <div className="table-scroll tall">
                <table className="table table-min">
                  <thead>
                    <tr>
                      <th>Roll number</th>
                      <th>Name</th>
                      <th>Status</th>
                      <th className="right">Face match</th>
                      <th className="right">Distance</th>
                      <th className="right">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => {
                      const m = r.verificationMetrics || {};
                      return (
                        <tr key={r._id}>
                          <td className="mono">{r.rollNumber}</td>
                          <td>
                            <div className="cell-title">{r.studentName || '—'}</div>
                            {r.flagReason && <div className="cell-sub">{r.flagReason}</div>}
                          </td>
                          <td><span className={`tag ${STATUS_TAG[r.status] || ''}`}>{r.status?.toLowerCase()}</span></td>
                          <td className="right mono num">{r.status !== 'ABSENT' && m.cosineSimilarity != null ? percent(m.cosineSimilarity, 1) : '—'}</td>
                          <td className="right mono num">{r.status !== 'ABSENT' && m.distanceMeters != null ? `${Math.round(m.distanceMeters)} m` : '—'}</td>
                          <td className="right mono num muted">{r.status === 'ABSENT' ? '—' : formatTimeSec(r.markedAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
