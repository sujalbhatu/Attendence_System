import React, { useState, useEffect, useRef } from 'react';
import { Plus, Camera, KeyRound, Trash2, Search, CheckCircle2, Users, AlertCircle, Copy } from 'lucide-react';
import api from '../api/client';
import Modal from '../components/Modal';
import { errorText, formatDate } from '../lib/format';

function AddStudentModal({ onClose, onCreated }) {
  const [rollNumber, setRollNumber] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('Computer Science & Engineering');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/students', { rollNumber, name, email, department });
      onCreated({ rollNumber: res.data.student.rollNumber, password: res.data.temporaryPassword });
    } catch (err) {
      setError(errorText(err, 'Could not add the student'));
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Add a student"
      description="They get a temporary password to sign in with, and choose their own on first login."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="add-student" className="btn btn-primary" disabled={saving}>{saving ? 'Adding…' : 'Add student'}</button>
        </>
      }
    >
      <form id="add-student" onSubmit={submit}>
        {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}><AlertCircle size={16} /><span>{error}</span></div>}
        <div className="field">
          <label className="label" htmlFor="roll">Roll number</label>
          <input id="roll" className="input mono" value={rollNumber} onChange={(e) => setRollNumber(e.target.value.toUpperCase())} placeholder="2023UGCS042" required />
        </div>
        <div className="field">
          <label className="label" htmlFor="sname">Full name</label>
          <input id="sname" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label className="label" htmlFor="semail">Email <span className="muted">(optional)</span></label>
          <input id="semail" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="label" htmlFor="sdep">Department</label>
          <input id="sdep" className="input" value={department} onChange={(e) => setDepartment(e.target.value)} required />
        </div>
      </form>
    </Modal>
  );
}

function FaceEnrollModal({ student, onClose, onDone }) {
  const videoRef = useRef(null);
  const [step, setStep] = useState('READY'); // READY | CAPTURING | PROCESSING | DONE
  const [cameraError, setCameraError] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let stream;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } })
      .then((s) => {
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch((err) => setCameraError(err.message));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  const capture = async () => {
    const video = videoRef.current;
    if (!video) return;
    setStep('CAPTURING');
    setError('');
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');
    const frames = [];
    for (let i = 0; i < 3; i++) {
      const minDim = Math.min(video.videoWidth, video.videoHeight);
      ctx.drawImage(video, (video.videoWidth - minDim) / 2, (video.videoHeight - minDim) / 2, minDim, minDim, 0, 0, 320, 320);
      frames.push(await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9)));
      await new Promise((r) => setTimeout(r, 200));
    }
    setStep('PROCESSING');
    const form = new FormData();
    frames.forEach((f, i) => form.append('images', f, `sample_${i}.jpg`));
    try {
      await api.post(`/students/${student._id}/enroll`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setStep('DONE');
      onDone();
    } catch (err) {
      setError(errorText(err, 'Face enrollment failed'));
      setStep('READY');
    }
  };

  return (
    <Modal
      title={step === 'DONE' ? 'Face saved' : 'Enroll face'}
      description={`${student.name} · ${student.rollNumber}`}
      onClose={onClose}
      footer={
        step === 'DONE' ? (
          <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
        ) : (
          <>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={capture} disabled={step !== 'READY' || !!cameraError}>
              <Camera size={16} />
              {step === 'CAPTURING' ? 'Capturing…' : step === 'PROCESSING' ? 'Computing embedding…' : 'Capture 3 frames'}
            </button>
          </>
        )
      }
    >
      {step === 'DONE' ? (
        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
          <div className="result-icon ok"><CheckCircle2 size={28} /></div>
          <p className="soft" style={{ fontSize: '0.9rem' }}>
            A 512-number face embedding is now stored for this student. Their next check-in is matched against it.
          </p>
        </div>
      ) : (
        <>
          {cameraError && <div className="alert alert-error" style={{ marginBottom: '1rem' }}><AlertCircle size={16} /><span>Camera unavailable: {cameraError}</span></div>}
          {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}><AlertCircle size={16} /><span>{error}</span></div>}
          <div className={`face-ring ${step === 'CAPTURING' ? 'capturing' : ''}`} style={{ marginTop: 0 }}>
            <video ref={videoRef} autoPlay playsInline muted />
          </div>
          <p className="hint" style={{ textAlign: 'center', marginTop: '1rem' }}>
            Even light, face the camera, no glasses glare. Do this in person so the right face is saved.
          </p>
        </>
      )}
    </Modal>
  );
}

export default function Students() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [enrolling, setEnrolling] = useState(null);
  const [issued, setIssued] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = () =>
    api.get('/students')
      .then((res) => setStudents(res.data.students || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const resetPassword = async (s) => {
    if (!window.confirm(`Give ${s.rollNumber} a new temporary password? Their current password stops working.`)) return;
    try {
      const res = await api.post(`/students/${s._id}/reset-password`);
      setCopied(false);
      setIssued({ rollNumber: res.data.rollNumber, password: res.data.temporaryPassword });
    } catch (err) {
      alert(errorText(err, 'Could not reset the password'));
    }
  };

  const remove = async (s) => {
    if (!window.confirm(`Remove ${s.name} (${s.rollNumber})? Their past attendance records are kept.`)) return;
    try {
      await api.delete(`/students/${s._id}`);
      load();
    } catch (err) {
      alert(errorText(err, 'Could not remove the student'));
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(issued.password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const q = search.trim().toLowerCase();
  const shown = students.filter((s) => !q || s.rollNumber.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
  const withFace = students.filter((s) => s.isEnrolled).length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Students</div>
          <h1>Student directory</h1>
          <p>Add students, capture their face once in person, and reset passwords when someone gets locked out.</p>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={16} /> Add student</button>
        </div>
      </div>

      {issued && (
        <div className="callout" style={{ borderColor: 'color-mix(in srgb, var(--flagged) 40%, var(--line))', background: 'var(--flagged-soft)' }}>
          <div style={{ fontSize: '0.9rem' }}>
            <div>
              Temporary password for <span className="mono">{issued.rollNumber}</span>:{' '}
              <span className="secret">{issued.password}</span>
            </div>
            <div className="soft" style={{ fontSize: '0.8rem', marginTop: '0.35rem' }}>
              Give it to the student now. It is not shown again; they choose a new one when they first sign in.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={copy}><Copy size={14} /> {copied ? 'Copied' : 'Copy'}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setIssued(null)}>Dismiss</button>
          </div>
        </div>
      )}

      <section className="panel" style={{ overflow: 'hidden' }}>
        <div className="toolbar">
          <div className="input-wrap">
            <Search size={15} />
            <input className="input" placeholder="Search roll number or name" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <span className="muted" style={{ fontSize: '0.8rem' }}>
            {students.length} students · {withFace} with a face on file
          </span>
        </div>

        {loading ? (
          <div className="loading-line">Loading students…</div>
        ) : students.length === 0 ? (
          <div className="empty">
            <Users size={32} />
            <h3>No students yet</h3>
            <p>Add students one at a time here, then enroll them in courses from the Courses page.</p>
            <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={16} /> Add student</button>
          </div>
        ) : shown.length === 0 ? (
          <div className="empty"><h3>No matches</h3><p>Nobody matches “{search}”.</p></div>
        ) : (
          <div className="table-scroll">
            <table className="table table-min">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Department</th>
                  <th>Face</th>
                  <th>Password</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => (
                  <tr key={s._id}>
                    <td>
                      <div className="cell-title">{s.name}</div>
                      <div className="cell-sub mono">{s.rollNumber}{s.email ? ` · ${s.email}` : ''}</div>
                    </td>
                    <td className="soft" style={{ fontSize: '0.84rem' }}>{s.department}{s.batch ? ` · ${s.batch}` : ''}</td>
                    <td>
                      {s.isEnrolled ? (
                        <span className="tag tag-present" title={s.embeddingUpdatedAt ? `Updated ${formatDate(s.embeddingUpdatedAt)}` : undefined}>
                          On file{s.enrollmentSource === 'SELF_SCAN' ? ' · self-scan' : ''}
                        </span>
                      ) : (
                        <span className="tag tag-flagged">Not captured</span>
                      )}
                    </td>
                    <td>
                      {s.canSignIn === false ? (
                        <button className="tag tag-absent" style={{ border: 'none', cursor: 'pointer' }} onClick={() => resetPassword(s)} title="This student cannot sign in until you issue a password">
                          None · issue one
                        </button>
                      ) : s.mustChangePassword ? (
                        <span className="tag tag-outline">Temporary</span>
                      ) : (
                        <span className="muted" style={{ fontSize: '0.82rem' }}>Set by student</span>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className={`btn btn-sm ${s.isEnrolled ? 'btn-ghost' : 'btn-secondary'}`} onClick={() => setEnrolling(s)}>
                          <Camera size={14} /> {s.isEnrolled ? 'Re-capture' : 'Capture face'}
                        </button>
                        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => resetPassword(s)} title="Reset password" aria-label={`Reset password for ${s.rollNumber}`}>
                          <KeyRound size={15} />
                        </button>
                        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => remove(s)} title="Remove student" aria-label={`Remove ${s.rollNumber}`}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showAdd && (
        <AddStudentModal
          onClose={() => setShowAdd(false)}
          onCreated={(info) => {
            setShowAdd(false);
            setCopied(false);
            setIssued(info);
            load();
          }}
        />
      )}
      {enrolling && <FaceEnrollModal student={enrolling} onClose={() => setEnrolling(null)} onDone={load} />}
    </>
  );
}
