import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { ArrowRight, ScanLine, User } from 'lucide-react';
import Logo from '../components/Logo';
import ThemeToggle from '../components/ThemeToggle';

const REPO_URL = 'https://github.com/sujalbhatu/Attendence_System';

// Sample check-ins for the hero preview (made-up roll numbers).
const SAMPLE = ['2023UGCS014', '2023UGCS031', '2023UGCS007', '2023UGCS052', '2023UGCS023', '2023UGCS046', '2023UGCS038', '2023UGCS019'];

const randomToken = () => Array.from({ length: 16 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');

function HeroPreview() {
  const [qr, setQr] = useState('');
  const [tick, setTick] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  // A new code every 4 s, the same rhythm as the real projector
  useEffect(() => {
    let cancelled = false;
    const draw = () =>
      QRCode.toDataURL(JSON.stringify({ s: 'demo', t: randomToken(), ts: Date.now() }), { width: 220, margin: 0 })
        .then((url) => !cancelled && setQr(url))
        .catch(() => {});
    draw();
    const id = setInterval(() => {
      draw();
      setTick((t) => t + 1);
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setElapsed(((Date.now() - start) % 4000) / 4000), 60);
    return () => clearInterval(id);
  }, [tick]);

  const count = 41 + Math.min(tick * 3, 21);
  const rows = Array.from({ length: 5 }, (_, i) => SAMPLE[(tick * 3 + i) % SAMPLE.length]);
  const now = new Date();

  return (
    <div className="preview" aria-hidden="true">
      <div className="preview-screen">
        <div className="preview-bar">
          <span><b>CS401</b> · Operating Systems · L-302</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><span className="live-dot" /> live</span>
        </div>
        <div className="preview-grid">
          <div className="preview-qr">
            <div className="preview-qr-img">{qr && <img src={qr} alt="" />}</div>
            <div className="preview-timer"><div style={{ width: `${(1 - elapsed) * 100}%` }} /></div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#6f6d66' }}>new code in {Math.ceil((1 - elapsed) * 4)}s</div>
          </div>
          <div className="preview-list">
            <div className="preview-count">{count}<span>of 64</span></div>
            <div className="preview-rows">
              {rows.map((r, i) => (
                <div className="preview-row" key={`${tick}-${i}`}>
                  <span>{r}</span>
                  <span>{new Date(now.getTime() - i * 2300).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="preview-phone">
        <div className="preview-phone-inner">
          <div className="preview-phone-face"><User size={26} /></div>
          <div className="preview-phone-title">You’re marked present</div>
          <div className="preview-phone-sub">face match 93.4%</div>
          <span className="tag tag-present">CS401 · 10:02</span>
        </div>
      </div>
    </div>
  );
}

function ArchDiagram() {
  const box = (x, y, w, h, title, sub, strong) => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="8" fill={strong ? 'var(--ink)' : 'var(--surface)'} stroke="var(--line-strong)" />
      <text x={x + 14} y={y + 24} fontSize="13" fontWeight="600" fill={strong ? 'var(--ink-inverse)' : 'var(--ink)'} fontFamily="var(--font-sans)">{title}</text>
      <text x={x + 14} y={y + 42} fontSize="11" fill={strong ? 'var(--ink-inverse)' : 'var(--ink-3)'} opacity={strong ? 0.7 : 1} fontFamily="var(--font-mono)">{sub}</text>
    </g>
  );
  const arrow = (x1, y1, x2, y2, label, dx = 8) => (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--ink-3)" strokeWidth="1.25" markerEnd="url(#arrow)" />
      {label && <text x={(x1 + x2) / 2 + dx} y={(y1 + y2) / 2 - 4} fontSize="10" fill="var(--ink-3)" fontFamily="var(--font-mono)">{label}</text>}
    </g>
  );
  return (
    <svg viewBox="0 0 460 360" role="img" aria-label="System diagram: phones and projector talk to an Express API, which uses PostgreSQL and a face-recognition service">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="var(--ink-3)" />
        </marker>
      </defs>
      {box(20, 20, 190, 56, 'Projector', 'SSE: code every 4 s')}
      {box(250, 20, 190, 56, 'Student phones', 'scan · PIN · 12 frames')}
      {arrow(115, 76, 195, 132, 'HTTPS', -44)}
      {arrow(345, 76, 265, 132)}
      {box(120, 134, 220, 62, 'Express API · Node 22', 'HMAC tokens · rate limits', true)}
      {arrow(180, 196, 115, 262, 'pg pool', -58)}
      {arrow(280, 196, 345, 262, 'multipart')}
      {box(20, 264, 190, 62, 'PostgreSQL · Neon', 'transactions · FKs')}
      {box(250, 264, 190, 62, 'Face service · Flask', 'FaceNet 512-d · blink')}
    </svg>
  );
}

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="landing">
      <header className={`l-nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="wrap">
          <Logo />
          <nav className="l-links" aria-label="Sections">
            <a href="#how">How it works</a>
            <a href="#security">Security</a>
            <a href="#engineering">Engineering</a>
            <Link to="/my-attendance">Student portal</Link>
          </nav>
          <div className="l-nav-actions">
            <ThemeToggle />
            <Link to="/scan" className="btn btn-ghost hide-xs">Check in</Link>
            <Link to="/login" className="btn btn-primary">Faculty sign in</Link>
          </div>
        </div>
      </header>

      <main>
        <section className="wrap hero">
          <div>
            <div className="eyebrow">Attendance for lecture halls</div>
            <h1 style={{ marginTop: '1rem' }}>
              The whole class checks in <em>at once.</em>
            </h1>
            <p className="hero-lede">
              Put one rotating code on the projector. Every student scans it from their seat, their phone confirms
              they’re in the room and that it’s really them, and the register fills itself in while you start teaching.
              Sixty students or three hundred, it takes the same few seconds.
            </p>
            <div className="hero-cta">
              <Link to="/login" className="btn btn-primary btn-lg">Start a lecture <ArrowRight size={16} /></Link>
              <Link to="/scan" className="btn btn-secondary btn-lg"><ScanLine size={16} /> I’m a student</Link>
            </div>
            <div className="hero-note">
              No app to install. Works in the phone’s browser over HTTPS.
            </div>
          </div>
          <HeroPreview />
        </section>

        <div className="wrap">
          <div className="facts">
            <div className="fact">
              <div className="fact-num">4<small>s</small></div>
              <div className="fact-text">How long each code stays valid. A forwarded screenshot is already stale.</div>
            </div>
            <div className="fact">
              <div className="fact-num">35<small>m</small></div>
              <div className="fact-text">Default geofence around the room. Hostel check-ins are rejected.</div>
            </div>
            <div className="fact">
              <div className="fact-num">12</div>
              <div className="fact-text">Frames per face check, enough to catch a natural blink and reject a photo.</div>
            </div>
            <div className="fact">
              <div className="fact-num">1</div>
              <div className="fact-text">Database transaction per check-in. No half-written records, no duplicates.</div>
            </div>
          </div>
        </div>

        <section id="how" className="section">
          <div className="wrap">
            <div className="section-head">
              <div>
                <div className="eyebrow">How it works</div>
                <h2>Three steps, done in parallel by everyone in the room.</h2>
              </div>
              <p>
                A roll call is sequential: the time it takes grows with every name. RollOne hands the checking to the
                students’ own phones, so they all do it at the same moment and the lecture starts on time.
              </p>
            </div>
            <div className="steps-3">
              <div className="step-card">
                <div className="step-num">01</div>
                <h3>The projector shows a live code</h3>
                <p>The faculty starts a lecture and the classroom screen shows a QR code that changes every four seconds.</p>
                <div className="step-detail">HMAC-signed · pushed over server-sent events</div>
              </div>
              <div className="step-card">
                <div className="step-num">02</div>
                <h3>Students scan from their seats</h3>
                <p>The scan reserves a place only if the code is current and the phone is inside the room’s geofence. Strict lectures also ask for the digit on the screen.</p>
                <div className="step-detail">token window · GPS radius · screen PIN</div>
              </div>
              <div className="step-card">
                <div className="step-num">03</div>
                <h3>A one-second face check</h3>
                <p>The front camera records a short burst. The face is matched against the one enrolled by faculty, and a blink proves it’s a person, not a photo.</p>
                <div className="step-detail">FaceNet embeddings · liveness · cosine match</div>
              </div>
            </div>
          </div>
        </section>

        <section className="section section-alt">
          <div className="wrap">
            <div className="section-head">
              <div>
                <div className="eyebrow">Compared with a roll call</div>
                <h2>Same register. Less of the lecture spent on it.</h2>
              </div>
              <p>
                Figures for a 64-student section, calling each name takes about five seconds. RollOne’s time doesn’t
                depend on the class size because nobody waits for anyone else.
              </p>
            </div>
            <div className="table-scroll">
              <table className="compare">
                <thead>
                  <tr>
                    <th />
                    <th>Calling names</th>
                    <th>RollOne</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><th>Time per lecture</th><td>5–6 minutes</td><td>About 15 seconds</td></tr>
                  <tr><th>Grows with class size</th><td>Yes, linearly</td><td>No</td></tr>
                  <tr><th>Answering for a friend</th><td>Easy</td><td>Needs their phone, their face and the room</td></tr>
                  <tr><th>Absentees</th><td>Written up by hand</td><td>Marked automatically when you conclude</td></tr>
                  <tr><th>Getting it into a spreadsheet</th><td>Typed in later</td><td>CSV download, one click</td></tr>
                  <tr><th>Student can check their standing</th><td>Ask the faculty</td><td>Live, course by course, against 75%</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="security" className="section">
          <div className="wrap">
            <div className="section-head">
              <div>
                <div className="eyebrow">Security</div>
                <h2>Four checks, each closing a different loophole.</h2>
              </div>
              <p>
                Any one of these can be beaten on its own. Together they require the student to be in the room,
                looking at the screen, at that moment, with their own face.
              </p>
            </div>
            <div className="layers">
              <div className="layer">
                <div className="layer-n">01</div>
                <div>
                  <h3>A code that expires in seconds</h3>
                  <p>Each code is an HMAC of the session and the current 4-second window. The server accepts the current window plus a short grace for network delay, and nothing older.</p>
                  <div className="defeats">Stops: <b>a photo of the QR sent to someone outside</b></div>
                </div>
              </div>
              <div className="layer">
                <div className="layer-n">02</div>
                <div>
                  <h3>Inside the room’s geofence</h3>
                  <p>The phone’s location is compared with the room’s centre using the haversine distance, allowing for the accuracy the phone reports.</p>
                  <div className="defeats">Stops: <b>scanning a forwarded code from the hostel</b></div>
                </div>
              </div>
              <div className="layer">
                <div className="layer-n">03</div>
                <div>
                  <h3>A digit you can only see in person</h3>
                  <p>Strict lectures show a single digit next to the code. Students tap it on their phone; two wrong guesses and the claim is void. Attempts are counted in the database, so parallel guesses don’t help.</p>
                  <div className="defeats">Stops: <b>a friend in the corridor relaying the code</b></div>
                </div>
              </div>
              <div className="layer">
                <div className="layer-n">04</div>
                <div>
                  <h3>Their face, and a blink</h3>
                  <p>Twelve frames go to the face service. FaceNet produces a 512-number embedding compared with the enrolled one, and eye movement across the frames must show a blink.</p>
                  <div className="defeats">Stops: <b>holding up someone else’s photo</b></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="engineering" className="section section-alt">
          <div className="wrap">
            <div className="section-head">
              <div>
                <div className="eyebrow">Engineering</div>
                <h2>Built on PostgreSQL, because a register is relational.</h2>
              </div>
              <p>
                Students, courses, enrollments, lectures and check-ins all point at each other. RollOne moved from MongoDB to
                PostgreSQL on Neon so the database enforces those links and every check-in is a single atomic transaction.
              </p>
            </div>
            <div className="arch">
              <div className="panel arch-diagram">
                <ArchDiagram />
              </div>
              <div>
                <div className="arch-points">
                  <div className="arch-point">
                    <h3>One transaction per check-in</h3>
                    <p>Recording attendance, bumping the lecture’s counter, updating the face template and deleting the claim either all happen or none do.</p>
                  </div>
                  <div className="arch-point">
                    <h3>Duplicates are impossible, not just unlikely</h3>
                    <p>A <code>UNIQUE (session_id, student_id)</code> constraint plus <code>ON CONFLICT DO NOTHING</code> means two simultaneous verifications still produce exactly one row.</p>
                  </div>
                  <div className="arch-point">
                    <h3>Absentees in one statement</h3>
                    <p>Concluding a lecture inserts every missing student as absent with a single <code>INSERT … SELECT</code>, instead of a loop over the class.</p>
                  </div>
                </div>
                <pre className="code">
<span className="c">-- repositories/attendance.js · conclude a lecture</span>{'\n'}
<span className="k">INSERT INTO</span> attendance_records (session_id, student_id, status, …){'\n'}
<span className="k">SELECT</span> $1, s.id, <span className="s">'ABSENT'</span>, …{'\n'}
<span className="k">FROM</span> enrollments e <span className="k">JOIN</span> students s <span className="k">ON</span> s.id = e.student_id{'\n'}
<span className="k">WHERE</span> e.course_id = $3 <span className="k">AND</span> e.branch = $4 <span className="k">AND</span> e.status = <span className="s">'active'</span>{'\n'}
<span className="k">ON CONFLICT</span> (session_id, student_id) <span className="k">DO NOTHING</span>;
                </pre>
                <div className="stack">
                  <span>React 19 · Vite</span>
                  <span>Node 22 · Express</span>
                  <span>PostgreSQL 18 on Neon</span>
                  <span>Flask · PyTorch FaceNet</span>
                  <span>OpenCV liveness</span>
                  <span>Nginx · Oracle Cloud</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="wrap closing">
            <h2>Give the first five minutes back to the lecture.</h2>
            <div className="hero-cta">
              <Link to="/login" className="btn btn-primary btn-lg">Faculty sign in <ArrowRight size={16} /></Link>
              <Link to="/my-attendance" className="btn btn-secondary btn-lg">Check my attendance</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="l-foot">
        <div className="wrap">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <Logo />
            <span>Designed and built by Sujal Bhatu, NIT Jamshedpur.</span>
          </div>
          <nav aria-label="Footer">
            <Link to="/login">Faculty</Link>
            <Link to="/scan">Check in</Link>
            <Link to="/my-attendance">Student portal</Link>
            <a href={REPO_URL} target="_blank" rel="noreferrer">Source on GitHub</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
