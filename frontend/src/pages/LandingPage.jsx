import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { ArrowRight, ScanLine, Check, MapPin, User, ShieldCheck } from 'lucide-react';
import Logo from '../components/Logo';
import ThemeToggle from '../components/ThemeToggle';

const REPO_URL = 'https://github.com/sujalbhatu/Attendence_System';
const WINDOW_MS = 4000;
const ENROLLED = 120;

// Sample check-ins for the hero (made-up roll numbers and names)
const SAMPLE = [
  ['2023UGCS014', 'Aarav S.'], ['2023UGCS031', 'Diya P.'], ['2023UGCS007', 'Kabir M.'], ['2023UGCS052', 'Ishita R.'],
  ['2023UGCS023', 'Vihaan K.'], ['2023UGCS046', 'Anaya G.'], ['2023UGCS038', 'Reyansh T.'], ['2023UGCS019', 'Myra J.'],
  ['2023UGCS060', 'Arjun B.'], ['2023UGCS003', 'Saanvi D.']
];

const randomToken = () => Array.from({ length: 16 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');

// Adds .in to .reveal elements as they scroll into view
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in'));
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add('in'), io.unobserve(e.target))),
      { threshold: 0.15 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

function HeroStage() {
  const [qr, setQr] = useState('');
  const [tick, setTick] = useState(0);
  const [progress, setProgress] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let cancelled = false;
    const draw = () =>
      QRCode.toDataURL(JSON.stringify({ s: 'cs401-l302', t: randomToken(), ts: Date.now() }), { width: 240, margin: 0 })
        .then((url) => !cancelled && setQr(url))
        .catch(() => {});
    draw();
    const id = setInterval(() => {
      startRef.current = Date.now();
      draw();
      setTick((t) => t + 1);
    }, WINDOW_MS);
    const raf = setInterval(() => setProgress(Math.min(1, (Date.now() - startRef.current) / WINDOW_MS)), 50);
    return () => {
      cancelled = true;
      clearInterval(id);
      clearInterval(raf);
    };
  }, []);

  const count = 74 + ((tick * 4) % 47);
  const rows = Array.from({ length: 6 }, (_, i) => SAMPLE[(tick * 3 + SAMPLE.length - i) % SAMPLE.length]);
  const latest = rows[0];
  const r = 46;
  const circ = 2 * Math.PI * r;
  const secs = Math.max(1, Math.ceil((1 - progress) * 4));

  return (
    <div className="lp-stage" aria-hidden="true">
      <div className="lp-float lp-float-a">
        <span className="lp-float-icon"><MapPin size={15} /></span>
        <span><b>Inside L-302</b><small>12 m from centre · ±8 m</small></span>
      </div>

      <div className="lp-screen">
        <div className="lp-screen-bar">
          <span><b>CS401</b> · Operating Systems · Room L-302</span>
          <span className="live"><span className="live-dot" /> live</span>
        </div>
        <div className="lp-screen-body">
          <div className="lp-qr-panel">
            <div className="lp-qr-ring">
              <svg className="ring" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r={r} stroke="#2b2a26" />
                <circle
                  cx="50"
                  cy="50"
                  r={r}
                  stroke="#d6f53b"
                  strokeLinecap="round"
                  strokeDasharray={circ}
                  strokeDashoffset={circ * progress}
                />
              </svg>
              <div className="lp-qr-img">{qr && <img key={tick} src={qr} alt="" />}</div>
            </div>
            <div className="lp-qr-caption">new code in <b>{secs}s</b> · signed, single-use window</div>
          </div>
          <div className="lp-roster">
            <div className="lp-roster-head">
              <small>Checked in</small>
              <div className="lp-count">{count}<span>/ {ENROLLED}</span></div>
              <div className="lp-count-bar"><div style={{ width: `${(count / ENROLLED) * 100}%` }} /></div>
            </div>
            <div className="lp-rows">
              {rows.map(([roll], i) => (
                <div className="lp-row" key={`${tick}-${i}`}>
                  <span><span className="tick">✓</span>{roll}</span>
                  <i>{i === 0 ? 'now' : `${i * 2 + 1}s`}</i>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="lp-float lp-float-b">
        <span className="lp-float-icon"><ShieldCheck size={15} /></span>
        <span><b>Blink detected</b><small>face match 93.4% · liveness ok</small></span>
      </div>

      <div className="lp-phone">
        <div className="lp-phone-screen">
          <div className="lp-phone-notch" />
          <div className="lp-phone-face">
            <User size={30} />
            <span className="lp-phone-check"><Check size={14} strokeWidth={3} /></span>
          </div>
          <b>You’re present</b>
          <small>{latest[1]} · {latest[0]}</small>
          <span className="chip">CS401 · verified</span>
        </div>
      </div>
    </div>
  );
}

/* --- Small custom illustrations (stroke = currentColor, accent = lime) --- */

const ArtProjector = () => (
  <svg viewBox="0 0 240 150" fill="none">
    <rect x="20" y="10" width="200" height="118" rx="10" stroke="currentColor" strokeWidth="2.5" />
    <rect x="86" y="30" width="68" height="68" rx="6" fill="#fff" stroke="currentColor" strokeWidth="2" />
    {[[94, 38], [134, 38], [94, 78]].map(([x, y]) => (
      <rect key={`${x}${y}`} x={x} y={y} width="12" height="12" rx="2" fill="currentColor" />
    ))}
    {[[114, 40], [120, 52], [110, 62], [126, 66], [138, 58], [118, 80], [132, 84], [142, 76], [112, 90]].map(([x, y]) => (
      <rect key={`${x}-${y}`} x={x} y={y} width="6" height="6" fill="currentColor" />
    ))}
    <circle cx="120" cy="64" r="44" stroke="#d6f53b" strokeWidth="4" strokeDasharray="200 300" strokeLinecap="round" transform="rotate(-90 120 64)" />
    <path d="M100 128v12M140 128v12M86 142h68" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

const ArtPhone = () => (
  <svg viewBox="0 0 240 150" fill="none">
    <rect x="88" y="8" width="64" height="134" rx="12" stroke="currentColor" strokeWidth="2.5" />
    <path d="M110 16h20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M100 48v-10h10M140 38h-10M140 38v10M100 88v10h10M140 98h-10M140 98v-10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M98 68h44" stroke="#d6f53b" strokeWidth="4" strokeLinecap="round" />
    <rect x="102" y="112" width="36" height="16" rx="4" fill="currentColor" />
    <text x="120" y="124" textAnchor="middle" fontSize="11" fontFamily="IBM Plex Mono, monospace" fill="#d6f53b">7</text>
    <circle cx="46" cy="58" r="22" stroke="currentColor" strokeWidth="2" strokeDasharray="4 5" />
    <path d="M46 48c-5 0-8 4-8 8 0 6 8 13 8 13s8-7 8-13c0-4-3-8-8-8z" stroke="currentColor" strokeWidth="2" />
    <path d="M68 60c8 0 12 2 18 6" stroke="currentColor" strokeWidth="2" strokeDasharray="3 4" />
  </svg>
);

const ArtFace = () => (
  <svg viewBox="0 0 240 150" fill="none">
    <circle cx="120" cy="72" r="54" stroke="currentColor" strokeWidth="2.5" />
    <circle cx="120" cy="72" r="64" stroke="#d6f53b" strokeWidth="4" strokeDasharray="120 40" strokeLinecap="round" />
    <path d="M98 66c4 4 10 4 14 0M128 66c4 4 10 4 14 0" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    <path d="M106 92c8 6 20 6 28 0" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M30 40h22M30 72h30M30 104h22M188 40h22M180 72h30M188 104h22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.35" />
    <circle cx="164" cy="114" r="14" fill="#2e7a4d" />
    <path d="M157 114l5 5 9-10" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconClockCode = () => (
  <svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
    <rect x="2.5" y="2.5" width="8" height="8" rx="1.5" />
    <rect x="2.5" y="15.5" width="8" height="8" rx="1.5" />
    <rect x="15.5" y="2.5" width="8" height="8" rx="1.5" />
    <circle cx="19.5" cy="19.5" r="5" />
    <path d="M19.5 17v2.7l1.6 1.2" />
  </svg>
);
const IconFence = () => (
  <svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
    <circle cx="13" cy="13" r="10.5" strokeDasharray="2.5 3" />
    <path d="M13 7.5c-2.4 0-4 1.8-4 4 0 3 4 6.5 4 6.5s4-3.5 4-6.5c0-2.2-1.6-4-4-4z" />
    <circle cx="13" cy="11.5" r="1.3" fill="currentColor" />
  </svg>
);
const IconPin = () => (
  <svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2.5" y="4" width="21" height="14" rx="2" />
    <path d="M9 22h8M13 18v4" />
    <path d="M11 8.5h4l-2.6 6" />
  </svg>
);
const IconBlink = () => (
  <svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
    <path d="M2.5 13c3-5 6.5-7 10.5-7s7.5 2 10.5 7" />
    <path d="M2.5 13c3 4 6.5 5.5 10.5 5.5s7.5-1.5 10.5-5.5" strokeDasharray="2.5 3" />
    <path d="M13 3v-1.5M6 5l-1-1.2M20 5l1-1.2" />
    <circle cx="13" cy="12.5" r="2.4" fill="currentColor" />
  </svg>
);

function Schema() {
  const table = (x, y, w, name, cols, hi) => (
    <g>
      <rect x={x} y={y} width={w} height={28 + cols.length * 17} rx="8" fill="#1f1f1c" stroke={hi ? '#d6f53b' : '#3a3934'} strokeWidth={hi ? 1.5 : 1} />
      <text x={x + 10} y={y + 15} fontSize="11" fontWeight="600" fill="#f4f3ee" fontFamily="IBM Plex Mono, monospace">{name}</text>
      <line x1={x} y1={y + 22} x2={x + w} y2={y + 22} stroke="#3a3934" />
      {cols.map((c, i) => (
        <text key={c} x={x + 10} y={y + 36 + i * 17} fontSize="9.5" fill={c.startsWith('UNIQUE') ? '#d6f53b' : '#a9a79f'} fontFamily="IBM Plex Mono, monospace">{c}</text>
      ))}
    </g>
  );
  const link = (d) => <path d={d} stroke="#5a5952" strokeWidth="1.2" fill="none" strokeDasharray="3 3" />;
  return (
    <svg viewBox="0 0 480 330" role="img" aria-label="Database schema: students and courses joined by enrollments; sessions belong to courses; attendance records link sessions and students with a unique constraint">
      {link('M160 62 H178')}
      {link('M338 62 H328')}
      {link('M400 93 V170')}
      {link('M300 225 H280')}
      {link('M80 93 V250 H110')}
      {table(20, 20, 140, 'students', ['id uuid', 'roll_number', 'face_embedding real[]'])}
      {table(178, 20, 150, 'enrollments', ['student_id → students', 'course_id → courses', 'UNIQUE (student, course)'])}
      {table(338, 20, 130, 'courses', ['id uuid', 'course_code', 'academic_year'])}
      {table(300, 170, 168, 'sessions', ['course_id → courses', 'present_count', 'require_pin'])}
      {table(110, 200, 170, 'attendance_records', ['session_id → sessions', 'student_id → students', 'status · cosine_similarity', 'UNIQUE (session, student)'], true)}
    </svg>
  );
}

function Race() {
  const ref = useRef(null);
  const [go, setGo] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) {
      setGo(true);
      return undefined;
    }
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setGo(true), io.disconnect()), { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`lp-race ${go ? 'go' : ''}`}>
      <div>
        <div className="lp-lane-top">
          <div className="lp-lane-name">Calling names<small>120 students × ~5 s each, one at a time</small></div>
          <div className="lp-lane-time">10:00</div>
        </div>
        <div className="lp-track"><div className="lp-fill slow" /></div>
      </div>
      <div>
        <div className="lp-lane-top">
          <div className="lp-lane-name">RollOne<small>everyone scans at once from their seat</small></div>
          <div className="lp-lane-time lime">~15 s</div>
        </div>
        <div className="lp-track"><div className="lp-fill fast" /></div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  useReveal();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const stack = ['React 19', 'Vite', 'Node 22 · Express', 'PostgreSQL 18 on Neon', 'Server-sent events', 'HMAC-SHA256 tokens', 'Flask', 'PyTorch FaceNet', 'OpenCV liveness', 'Haversine geofence', 'Nginx', 'Oracle Cloud'];

  return (
    <div className="lp">
      <header className={`lp-nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="wrap">
          <Logo />
          <nav className="lp-links" aria-label="Sections">
            <a href="#how">How it works</a>
            <a href="#security">Security</a>
            <a href="#engineering">Engineering</a>
            <Link to="/my-attendance">Student portal</Link>
          </nav>
          <div className="lp-nav-actions">
            <ThemeToggle className="btn btn-ghost btn-icon" />
            <Link to="/scan" className="btn btn-ghost hide-xs">Check in</Link>
            <Link to="/login" className="btn lp-btn-lime">Faculty sign in</Link>
          </div>
        </div>
      </header>

      <section className="lp-hero">
        <div className="wrap lp-hero-grid">
          <div>
            <span className="lp-live-pill"><span className="live-dot" /> Live preview · <b>CS401</b> in room L-302</span>
            <h1 className="lp-display">
              Roll call,<br />
              done in<br />
              <span className="lp-mark">15&nbsp;seconds.</span>
            </h1>
            <p className="lp-hero-lede">
              One rotating code on the projector. Every student scans it from their seat, their phone proves
              they’re <strong>in the room</strong> and that it’s <strong>really them</strong>, and the register fills
              itself while you start teaching.
            </p>
            <div className="lp-cta">
              <Link to="/login" className="btn btn-lg lp-btn-lime">Start a lecture <ArrowRight size={17} /></Link>
              <Link to="/scan" className="btn btn-lg lp-btn-ghost"><ScanLine size={17} /> I’m a student</Link>
            </div>
            <div className="lp-proof">
              <span><Check size={15} /> No app to install</span>
              <span><Check size={15} /> Any phone browser</span>
              <span><Check size={15} /> Proxy-proof by design</span>
            </div>
          </div>
          <HeroStage />
        </div>
        <div className="lp-marquee" aria-hidden="true">
          <div className="lp-marquee-track">
            {[...stack, ...stack].map((s, i) => <span key={i}>{s}</span>)}
          </div>
        </div>
      </section>

      <section className="lp-section">
        <div className="wrap">
          <div className="lp-stats reveal">
            <div className="lp-stat">
              <div className="lp-stat-num">4<small>s</small></div>
              <div className="lp-stat-label">Code lifetime</div>
              <div className="lp-stat-text">A screenshot forwarded to the hostel is already dead.</div>
            </div>
            <div className="lp-stat">
              <div className="lp-stat-num">40×</div>
              <div className="lp-stat-label">Faster than a roll call</div>
              <div className="lp-stat-text">15 seconds instead of ten minutes for a 120-student section.</div>
            </div>
            <div className="lp-stat">
              <div className="lp-stat-num">512</div>
              <div className="lp-stat-label">Numbers per face</div>
              <div className="lp-stat-text">FaceNet embedding, matched with a blink so photos fail.</div>
            </div>
            <div className="lp-stat">
              <div className="lp-stat-num">0</div>
              <div className="lp-stat-label">Duplicate records</div>
              <div className="lp-stat-text">Guaranteed by a database constraint, not by hoping.</div>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="lp-section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="lp-head reveal">
            <div>
              <span className="lp-kicker">How it works</span>
              <h2 className="lp-display">Three steps. Everyone at once.</h2>
            </div>
            <p>A roll call is sequential: every name adds time. RollOne hands the check to each student’s own phone, so the whole class does it in parallel.</p>
          </div>
          <div className="lp-steps">
            <article className="lp-step reveal">
              <div className="lp-step-art"><span className="lp-step-n">1</span><ArtProjector /></div>
              <div className="lp-step-body">
                <h3>The projector shows a live code</h3>
                <p>Start a lecture and the classroom screen shows a QR code that redraws every four seconds.</p>
                <div className="lp-step-tags"><span>HMAC-signed</span><span>server-sent events</span></div>
              </div>
            </article>
            <article className="lp-step reveal">
              <div className="lp-step-art"><span className="lp-step-n">2</span><ArtPhone /></div>
              <div className="lp-step-body">
                <h3>Students scan from their seats</h3>
                <p>The scan holds a place only if the code is current and the phone is inside the room. Strict lectures add the digit on screen.</p>
                <div className="lp-step-tags"><span>token window</span><span>GPS radius</span><span>screen PIN</span></div>
              </div>
            </article>
            <article className="lp-step reveal">
              <div className="lp-step-art"><span className="lp-step-n">3</span><ArtFace /></div>
              <div className="lp-step-body">
                <h3>A one-second face check</h3>
                <p>Twelve frames from the front camera. The face must match the one faculty enrolled, and it has to blink.</p>
                <div className="lp-step-tags"><span>FaceNet</span><span>liveness</span><span>cosine match</span></div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="lp-section lp-dark">
        <div className="wrap">
          <div className="lp-head reveal">
            <div>
              <span className="lp-kicker">The difference</span>
              <h2 className="lp-display">Ten minutes, or fifteen seconds.</h2>
            </div>
            <p>Same register, same section of 120. One way spends the start of every lecture reading names aloud. The other is over before you’ve opened your slides.</p>
          </div>
          <Race />
          <div className="lp-race-notes">
            <div className="lp-note reveal"><b>Absentees mark themselves</b><p>Conclude the lecture and everyone enrolled who didn’t check in is recorded absent in one statement.</p></div>
            <div className="lp-note reveal"><b>One-click CSV</b><p>The register downloads straight into the department spreadsheet. Nothing to type up later.</p></div>
            <div className="lp-note reveal"><b>Students see their 75%</b><p>Each student knows exactly how many lectures they can miss, course by course.</p></div>
          </div>
        </div>
      </section>

      <section id="security" className="lp-section">
        <div className="wrap">
          <div className="lp-head reveal">
            <div>
              <span className="lp-kicker">Security</span>
              <h2 className="lp-display">Four locks. No proxies.</h2>
            </div>
            <p>Each check closes a different loophole. Together they need the student in the room, looking at the screen, right now, with their own face.</p>
          </div>
          <div className="lp-checks">
            <article className="lp-check reveal">
              <div className="lp-check-icon"><IconClockCode /></div>
              <div className="lp-check-n">01 · token</div>
              <h3>A code that dies in four seconds</h3>
              <p>An HMAC of the session and the current window. The server allows a short grace for network delay, and nothing older.</p>
              <div className="lp-stops"><b>Stops</b>a photo of the QR sent outside</div>
            </article>
            <article className="lp-check reveal">
              <div className="lp-check-icon"><IconFence /></div>
              <div className="lp-check-n">02 · location</div>
              <h3>Inside the room’s geofence</h3>
              <p>Haversine distance from the room’s centre, allowing for the accuracy the phone itself reports.</p>
              <div className="lp-stops"><b>Stops</b>scanning a forwarded code from the hostel</div>
            </article>
            <article className="lp-check reveal">
              <div className="lp-check-icon"><IconPin /></div>
              <div className="lp-check-n">03 · line of sight</div>
              <h3>A digit you only see in person</h3>
              <p>Tap the number on the projector. Two wrong guesses void the claim, counted atomically in the database.</p>
              <div className="lp-stops"><b>Stops</b>a friend in the corridor relaying the code</div>
            </article>
            <article className="lp-check reveal">
              <div className="lp-check-icon"><IconBlink /></div>
              <div className="lp-check-n">04 · biometrics</div>
              <h3>Their face, and a blink</h3>
              <p>A 512-number FaceNet embedding compared with the enrolled one, plus eye movement across twelve frames.</p>
              <div className="lp-stops"><b>Stops</b>holding up someone else’s photo</div>
            </article>
          </div>
        </div>
      </section>

      <section id="engineering" className="lp-section lp-dark">
        <div className="wrap">
          <div className="lp-head reveal">
            <div>
              <span className="lp-kicker">Engineering</span>
              <h2 className="lp-display">A register is relational. So is the database.</h2>
            </div>
            <p>RollOne moved from MongoDB to PostgreSQL on Neon. Foreign keys hold students, courses and lectures together, and every check-in commits as one transaction.</p>
          </div>
          <div className="lp-eng">
            <div className="lp-panel lp-schema reveal">
              <div className="lp-panel-title"><span>schema · db/migrations/001_initial.sql</span><span className="lp-dots"><span /><span /><span /></span></div>
              <Schema />
            </div>
            <div className="lp-panel reveal">
              <div className="lp-panel-title"><span>repositories/attendance.js · conclude a lecture</span><span className="lp-dots"><span /><span /><span /></span></div>
              <pre className="lp-code">
<span className="c">-- everyone enrolled who didn’t check in, in one statement</span>{'\n'}
<span className="k">INSERT INTO</span> attendance_records{'\n'}
{'  '}(session_id, student_id, status, …){'\n'}
<span className="k">SELECT</span> $1, s.id, <span className="s">'ABSENT'</span>, …{'\n'}
<span className="k">FROM</span> enrollments e{'\n'}
<span className="k">JOIN</span> students s <span className="k">ON</span> s.id = e.student_id{'\n'}
<span className="k">WHERE</span> e.course_id = $3{'\n'}
{'  '}<span className="k">AND</span> e.branch = $4{'\n'}
{'  '}<span className="k">AND</span> e.status = <span className="s">'active'</span>{'\n'}
<span className="k">ON CONFLICT</span> (session_id, student_id){'\n'}
<span className="k">DO NOTHING</span>;
              </pre>
              <div className="lp-stack">
                <span>Node 22</span><span>pg pool</span><span>PostgreSQL 18</span><span>Neon branching</span><span>66 tests</span>
              </div>
            </div>
          </div>
          <div className="lp-eng-points">
            <div className="reveal"><b>One transaction per check-in</b><p>Record, counter, face template and claim cleanup commit together or not at all.</p></div>
            <div className="reveal"><b>Duplicates can’t exist</b><p><code>UNIQUE (session_id, student_id)</code> with <code>ON CONFLICT</code>: two parallel verifications, one row.</p></div>
            <div className="reveal"><b>No N+1 queries</b><p>Portal and course stats are single <code>GROUP BY</code> queries with <code>count(*) FILTER</code>.</p></div>
          </div>
        </div>
      </section>

      <section className="lp-cta-band">
        <div className="wrap">
          <h2 className="lp-display">Give the first ten minutes back to the lecture.</h2>
          <p>Faculty start a lecture in two clicks. Students check in without installing anything.</p>
          <div className="lp-cta">
            <Link to="/login" className="btn btn-lg lp-btn-ink">Faculty sign in <ArrowRight size={17} /></Link>
            <Link to="/my-attendance" className="btn btn-lg lp-btn-outline-ink">Check my attendance</Link>
          </div>
        </div>
      </section>

      <footer className="lp-foot">
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
