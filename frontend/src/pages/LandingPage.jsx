import React from 'react';
import { Link } from 'react-router-dom';
import { 
  Shield, 
  QrCode, 
  Scan, 
  Users, 
  Clock, 
  CheckCircle2, 
  GraduationCap, 
  Lock, 
  Sparkles, 
  ArrowRight, 
  Play,
  Smartphone,
  Laptop,
  Monitor,
  Zap,
  ShieldCheck,
  Check,
  X,
  Layers,
  Cpu
} from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';

export default function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', overflowX: 'hidden' }}>
      {/* Sticky Top Header */}
      <header style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '1rem 2rem', 
        position: 'sticky', 
        top: 0, 
        background: 'var(--bg-main)', 
        backdropFilter: 'blur(16px)', 
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-subtle)', 
        zIndex: 100 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ 
            background: 'var(--accent-emerald)', 
            padding: '0.45rem', 
            borderRadius: '10px', 
            display: 'flex',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
          }}>
            <GraduationCap size={22} color="#ffffff" />
          </div>
          <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            RollOne
          </span>
          <span className="badge badge-emerald" style={{ fontSize: '0.7rem' }}>
            O(1) Engine
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <ThemeToggle />
          <Link to="/my-attendance" className="btn btn-secondary" style={{ padding: '0.5rem 1.1rem', fontSize: '0.85rem' }}>
            Student Portal
          </Link>
          <Link to="/login" className="btn btn-emerald" style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}>
            Faculty Login <ArrowRight size={15} />
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section style={{ paddingTop: '5rem', paddingBottom: '4rem', textAlign: 'center', position: 'relative' }}>
        {/* Subtle Emerald Radial Glow */}
        <div style={{ 
          position: 'absolute', 
          top: '-15%', 
          left: '50%', 
          transform: 'translateX(-50%)', 
          width: '80vw', 
          height: '65vh', 
          background: 'radial-gradient(circle, var(--accent-emerald-subtle) 0%, rgba(0,0,0,0) 70%)', 
          zIndex: 0, 
          pointerEvents: 'none' 
        }}></div>
        
        <div style={{ position: 'relative', zIndex: 1, maxWidth: '900px', margin: '0 auto', padding: '0 1.25rem' }}>
          <div style={{ marginBottom: '1.75rem' }}>
            <span className="badge badge-emerald" style={{ padding: '0.45rem 1.15rem', fontSize: '0.85rem', gap: '0.5rem' }}>
              <Zap size={14} /> Parallel Classroom Verification
            </span>
          </div>

          <h1 style={{ fontSize: 'clamp(2.5rem, 6.5vw, 4.5rem)', fontWeight: 800, lineHeight: 1.08, marginBottom: '1.5rem', letterSpacing: '-0.035em' }}>
            Zero Roll-Calls.<br />
            <span style={{ 
              color: 'var(--accent-emerald)',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              Attendance in O(1) Time.
            </span>
          </h1>

          <p style={{ fontSize: '1.15rem', color: 'var(--text-secondary)', marginBottom: '2.5rem', maxWidth: '680px', margin: '0 auto 2.5rem', lineHeight: 1.65 }}>
            Whether you teach 30 students or 300, attendance takes the exact same 10 seconds. Students scan the live screen simultaneously, verify their eye-blink in 1 second, and the lecture roster updates live.
          </p>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '3.5rem' }}>
            <Link to="/login" className="btn btn-emerald" style={{ padding: '0.85rem 2rem', fontSize: '1rem', borderRadius: '12px', boxShadow: '0 6px 20px rgba(16, 185, 129, 0.3)' }}>
              <Play size={18} /> Launch Lecture Session
            </Link>
            <Link to="/my-attendance" className="btn btn-secondary" style={{ padding: '0.85rem 2rem', fontSize: '1rem', borderRadius: '12px' }}>
              <Users size={18} /> Check My Attendance
            </Link>
          </div>

          {/* Quick Metric Badges */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
            gap: '1rem', 
            textAlign: 'left'
          }}>
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>Human Time Complexity</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--accent-emerald)' }}>O(1) Constant</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Independent of batch size</div>
            </div>

            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>Biometric Precision</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)' }}>512-d</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>FaceNet InceptionResNet</div>
            </div>

            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>QR Rotation Window</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--accent-emerald)' }}>4.0s</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Anti-WhatsApp screenshot</div>
            </div>

            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>Classroom Geofence</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)' }}>GPS Locked</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Room-level boundary check</div>
            </div>
          </div>
        </div>
      </section>

      {/* The O(1) vs O(N) Smart Breakdown */}
      <section style={{ padding: '5rem 1.5rem', background: 'var(--bg-surface)', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            <span className="badge badge-zinc" style={{ marginBottom: '0.75rem' }}>
              Algorithm Comparison
            </span>
            <h2 style={{ fontSize: '2.25rem', fontWeight: 800, marginBottom: '0.75rem' }}>
              Why Attendance Belongs in O(1) Time
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', maxWidth: '640px', margin: '0 auto' }}>
              In traditional classes, attendance time scales linearly with student count. CampusTrack distributes verification to student devices in parallel.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
            {/* The Old Way */}
            <div className="card" style={{ padding: '2rem', border: '1px solid rgba(239, 68, 68, 0.25)', position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--accent-red)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Traditional Roll-Call
                </span>
                <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-red)' }}>
                  O(N) Sequential
                </span>
              </div>
              <h3 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: '1rem' }}>
                Time Wasted Scales With Every Student
              </h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', fontSize: '0.925rem', color: 'var(--text-secondary)' }}>
                  <X size={18} color="var(--accent-red)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span><strong>5–8 minutes lost</strong> calling 60–80 names one by one every lecture.</span>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', fontSize: '0.925rem', color: 'var(--text-secondary)' }}>
                  <X size={18} color="var(--accent-red)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span><strong>Proxy answering</strong> ("Yes sir!" shouted by friends for absent peers).</span>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', fontSize: '0.925rem', color: 'var(--text-secondary)' }}>
                  <X size={18} color="var(--accent-red)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span><strong>Disrupts class flow</strong>, dispute interruptions, and late sign-in sheets.</span>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', fontSize: '0.925rem', color: 'var(--text-secondary)' }}>
                  <X size={18} color="var(--accent-red)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span>Manual transcription errors when entering data into college portals.</span>
                </li>
              </ul>
            </div>

            {/* The RollOne Way */}
            <div className="card" style={{ padding: '2rem', border: '1px solid rgba(16, 185, 129, 0.35)', boxShadow: '0 8px 24px rgba(16, 185, 129, 0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--accent-emerald)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  RollOne Engine
                </span>
                <span className="badge badge-emerald">
                  O(1) Parallel
                </span>
              </div>
              <h3 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: '1rem' }}>
                Constant 10 Seconds Regardless of Size
              </h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', fontSize: '0.925rem', color: 'var(--text-secondary)' }}>
                  <Check size={18} color="var(--accent-emerald)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span><strong>10 seconds flat:</strong> 30 or 300 students verify at the exact same moment.</span>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', fontSize: '0.925rem', color: 'var(--text-secondary)' }}>
                  <Check size={18} color="var(--accent-emerald)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span><strong>Mathematically proxy-proof:</strong> 4-second token + blink check + GPS.</span>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', fontSize: '0.925rem', color: 'var(--text-secondary)' }}>
                  <Check size={18} color="var(--accent-emerald)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span><strong>Zero dedicated hardware:</strong> Uses classroom projector & student phones.</span>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', fontSize: '0.925rem', color: 'var(--text-secondary)' }}>
                  <Check size={18} color="var(--accent-emerald)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span><strong>Auto-absent ledger:</strong> Instant absentee marking & 1-tap CSV export.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Dual Experience: Laptop / Projector + Mobile Phone */}
      <section style={{ padding: '5rem 1.5rem', background: 'var(--bg-main)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            <span className="badge badge-emerald" style={{ marginBottom: '0.75rem' }}>
              Seamless Dual Interface
            </span>
            <h2 style={{ fontSize: '2.25rem', fontWeight: 800, marginBottom: '0.75rem' }}>
              Built for Both Laptop & Smartphone
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', maxWidth: '600px', margin: '0 auto' }}>
              No specialized hardware to buy. RollOne uses the devices already present in every modern college lecture hall.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
            {/* Professor Laptop / Projector Experience */}
            <div className="card card-hover" style={{ padding: '2rem' }}>
              <div style={{ 
                background: 'var(--accent-emerald-subtle)', 
                width: '48px', 
                height: '48px', 
                borderRadius: '12px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                marginBottom: '1.25rem',
                border: '1px solid rgba(16, 185, 129, 0.25)'
              }}>
                <Monitor size={24} color="var(--accent-emerald)" />
              </div>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.75rem' }}>
                On Professor's Laptop / Projector
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.925rem', lineHeight: 1.6, marginBottom: '1.25rem' }}>
                Projected at the front of the hall. Generates the live rotating QR feed and visualizes attendance as it happens:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.875rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                  <CheckCircle2 size={16} color="var(--accent-emerald)" /> 4-second TOTP cryptographic rotating token
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                  <CheckCircle2 size={16} color="var(--accent-emerald)" /> Line-of-sight challenge PIN generator
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                  <CheckCircle2 size={16} color="var(--accent-emerald)" /> Live incoming attendance ticker feed
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                  <CheckCircle2 size={16} color="var(--accent-emerald)" /> One-click auto-absent mark & CSV export
                </div>
              </div>
            </div>

            {/* Student Mobile Experience */}
            <div className="card card-hover" style={{ padding: '2rem' }}>
              <div style={{ 
                background: 'var(--accent-emerald-subtle)', 
                width: '48px', 
                height: '48px', 
                borderRadius: '12px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                marginBottom: '1.25rem',
                border: '1px solid rgba(16, 185, 129, 0.25)'
              }}>
                <Smartphone size={24} color="var(--accent-emerald)" />
              </div>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.75rem' }}>
                On Student's Smartphone
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.925rem', lineHeight: 1.6, marginBottom: '1.25rem' }}>
                Zero app store install. Works immediately in any browser (Chrome, Safari, Firefox) over secure HTTPS:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.875rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                  <CheckCircle2 size={16} color="var(--accent-emerald)" /> Rapid 2ms presence claim lock
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                  <CheckCircle2 size={16} color="var(--accent-emerald)" /> 1-second natural eye blink liveness test
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                  <CheckCircle2 size={16} color="var(--accent-emerald)" /> 512-d FaceNet biometric verification
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                  <CheckCircle2 size={16} color="var(--accent-emerald)" /> 75% semester criteria tracking dashboard
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The 4-Layer Anti-Proxy Shield */}
      <section style={{ padding: '5rem 1.5rem', background: 'var(--bg-surface)', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            <span className="badge badge-emerald" style={{ marginBottom: '0.75rem' }}>
              Security Architecture
            </span>
            <h2 style={{ fontSize: '2.25rem', fontWeight: 800, marginBottom: '0.75rem' }}>
              The 4-Layer Anti-Proxy Shield
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', maxWidth: '620px', margin: '0 auto' }}>
              Why marking attendance from the hostel or sending a photo on WhatsApp is mathematically impossible.
            </p>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem' }}>
            {[
              { 
                icon: QrCode, 
                title: '4-Second Token Window', 
                desc: 'Tokens expire in 4 seconds. Any photo sent to an absent friend in the hostel dies before the image can even download.' 
              },
              { 
                icon: Lock, 
                title: 'Line-of-Sight Challenge PIN', 
                desc: 'A dynamic 3-digit PIN shown only on the lecture board guarantees the student has their physical eyes on the screen.' 
              },
              { 
                icon: Shield, 
                title: 'Classroom Geofence', 
                desc: 'Haversine GPS validation ensures attendance cannot be claimed from outside the lecture hall boundaries.' 
              },
              { 
                icon: Scan, 
                title: 'Active Blink Verification', 
                desc: 'OpenCV multi-pass eye motion detection catches natural blinks, instantly rejecting static printed photos and screen replays.' 
              }
            ].map((feature, i) => (
              <div key={i} className="card card-hover" style={{ padding: '1.75rem' }}>
                <div style={{ 
                  background: 'var(--accent-emerald-subtle)', 
                  width: '48px', 
                  height: '48px', 
                  borderRadius: '12px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  marginBottom: '1.25rem', 
                  border: '1px solid rgba(16, 185, 129, 0.25)' 
                }}>
                  <feature.icon size={24} color="var(--accent-emerald)" />
                </div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.65rem' }}>{feature.title}</h3>
                <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: '0.9rem' }}>{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* University Portals CTA */}
      <section style={{ padding: '4.5rem 1.5rem', background: 'var(--bg-main)' }}>
        <div style={{ 
          maxWidth: '900px', 
          margin: '0 auto', 
          background: 'var(--bg-surface)', 
          border: '1px solid var(--border-subtle)', 
          borderRadius: '20px', 
          padding: '3rem 2rem', 
          textAlign: 'center',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.05)'
        }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.75rem' }}>
            Ready to Take Attendance?
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', maxWidth: '540px', margin: '0 auto 2rem', lineHeight: 1.6 }}>
            Access your faculty controls to launch lectures, or open your student portal to track your 75% semester criteria.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/login" className="btn btn-emerald" style={{ padding: '0.85rem 2rem', fontSize: '0.95rem' }}>
              Sign In as Faculty
            </Link>
            <Link to="/my-attendance" className="btn btn-secondary" style={{ padding: '0.85rem 2rem', fontSize: '0.95rem' }}>
              Student Attendance Portal
            </Link>
          </div>
        </div>
      </section>

      {/* Minimalist Professional Footer */}
      <footer style={{ 
        padding: '2.5rem 1.5rem', 
        background: 'var(--bg-surface)', 
        borderTop: '1px solid var(--border-subtle)', 
        textAlign: 'center' 
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.65rem', marginBottom: '0.5rem' }}>
          <div style={{ background: 'var(--accent-emerald)', padding: '0.35rem', borderRadius: '8px', display: 'flex' }}>
            <GraduationCap size={18} color="#fff" />
          </div>
          <span style={{ fontSize: '1.1rem', fontWeight: 800 }}>RollOne</span>
        </div>

        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem' }}>
          Designed & Built by Sujal Bhatu
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', fontSize: '0.825rem', flexWrap: 'wrap' }}>
          <Link to="/login" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Faculty Login</Link>
          <Link to="/my-attendance" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Student Portal</Link>
          <Link to="/scan" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Mobile Scanner</Link>
        </div>
      </footer>
    </div>
  );
}


