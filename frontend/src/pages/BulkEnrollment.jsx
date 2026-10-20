import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Upload, BookOpen, AlertCircle, CheckCircle2, Search } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import { errorText } from '../lib/format';

const currentAcademicYear = () => {
  const now = new Date();
  const start = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${String(start + 1).slice(2)}`;
};

// Accepts one roll number per line, or a CSV whose header has a roll-number column.
function parseRollNumbers(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/[^a-z]/g, ''));
  const col = header.findIndex((h) => h === 'rollnumber' || h === 'roll' || h === 'rollno');
  const rows = col >= 0 ? lines.slice(1).map((l) => l.split(',')[col]) : lines.map((l) => l.split(',')[0]);
  return [...new Set(rows.map((r) => (r || '').trim().toUpperCase()).filter(Boolean))];
}

function NewCourseModal({ onClose, onCreated }) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    courseCode: '',
    courseName: '',
    department: user?.department || 'Computer Science & Engineering',
    semester: 1,
    credits: 4,
    academicYear: currentAcademicYear(),
    branch: 'CSE'
  });
  const [assignToMe, setAssignToMe] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { branch, ...course } = form;
      const res = await api.post('/courses', { ...course, semester: Number(course.semester), credits: Number(course.credits) });
      if (assignToMe && branch) {
        await api.post(`/courses/${res.data.course._id}/assign-faculty`, {
          facultyId: user.id || user._id,
          branch: branch.trim().toUpperCase(),
          academicYear: form.academicYear
        });
      }
      onCreated(res.data.course);
    } catch (err) {
      setError(errorText(err, 'Could not create the course'));
      setSaving(false);
    }
  };

  return (
    <Modal
      title="New course"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="new-course" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Create course'}
          </button>
        </>
      }
    >
      <form id="new-course" onSubmit={submit}>
        {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}><AlertCircle size={16} /><span>{error}</span></div>}
        <div className="field-row">
          <div className="field">
            <label className="label" htmlFor="cc">Code</label>
            <input id="cc" className="input mono" value={form.courseCode} onChange={(e) => setForm({ ...form, courseCode: e.target.value.toUpperCase() })} placeholder="CS401" required />
          </div>
          <div className="field">
            <label className="label" htmlFor="ay">Academic year</label>
            <input id="ay" className="input mono" value={form.academicYear} onChange={set('academicYear')} required />
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor="cn">Title</label>
          <input id="cn" className="input" value={form.courseName} onChange={set('courseName')} placeholder="Operating Systems" required />
        </div>
        <div className="field">
          <label className="label" htmlFor="dep">Department</label>
          <input id="dep" className="input" value={form.department} onChange={set('department')} required />
        </div>
        <div className="field-row">
          <div className="field">
            <label className="label" htmlFor="sem">Semester</label>
            <input id="sem" type="number" min="1" max="10" className="input" value={form.semester} onChange={set('semester')} required />
          </div>
          <div className="field">
            <label className="label" htmlFor="cr">Credits</label>
            <input id="cr" type="number" min="0" max="10" className="input" value={form.credits} onChange={set('credits')} />
          </div>
        </div>
        <label style={{ display: 'flex', gap: '0.55rem', alignItems: 'flex-start', fontSize: '0.86rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={assignToMe} onChange={(e) => setAssignToMe(e.target.checked)} style={{ marginTop: '0.2rem', accentColor: 'var(--accent)' }} />
          <span>
            I teach this course to branch{' '}
            <input className="input mono" style={{ display: 'inline-block', width: '6.5rem', height: '30px', marginLeft: '0.25rem' }} value={form.branch} onChange={set('branch')} disabled={!assignToMe} />
            <span className="hint" style={{ display: 'block', marginTop: '0.25rem' }}>It will then appear when you start a lecture.</span>
          </span>
        </label>
      </form>
    </Modal>
  );
}

function EnrollPanel({ course, onEnrolled }) {
  const [text, setText] = useState('');
  const [branch, setBranch] = useState('CSE');
  const [academicYear, setAcademicYear] = useState(course.academicYear || currentAcademicYear());
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    setResult(null);
    setError('');
    setAcademicYear(course.academicYear || currentAcademicYear());
  }, [course._id]);

  const rolls = useMemo(() => parseRollNumbers(text), [text]);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result || ''));
    reader.readAsText(file);
    e.target.value = '';
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setResult(null);
    try {
      const res = await api.post(`/courses/${course._id}/enroll`, {
        rollNumbers: rolls,
        branch: branch.trim().toUpperCase(),
        academicYear
      });
      setResult(res.data);
      if (res.data.success) {
        setText('');
        onEnrolled();
      }
    } catch (err) {
      setError(errorText(err, 'Enrollment failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="panel-pad">
      <div className="field-row">
        <div className="field">
          <label className="label" htmlFor="br">Branch</label>
          <input id="br" className="input mono" value={branch} onChange={(e) => setBranch(e.target.value)} required />
        </div>
        <div className="field">
          <label className="label" htmlFor="eay">Academic year</label>
          <input id="eay" className="input mono" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} required />
        </div>
      </div>
      <div className="field">
        <div className="label-row">
          <label className="label" htmlFor="rolls">Roll numbers</label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
            <Upload size={14} /> Load CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" onChange={onFile} hidden />
        </div>
        <textarea
          id="rolls"
          className="textarea mono"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'2023UGCS001\n2023UGCS002\n…'}
        />
        <span className="hint">One per line, or a CSV with a “rollNumber” column. Students must already exist on the Students page.</span>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: '0.9rem' }}><AlertCircle size={16} /><span>{error}</span></div>}
      {result && (
        <div className={`alert ${result.errors?.length ? 'alert-warn' : 'alert-ok'}`} style={{ marginBottom: '0.9rem' }}>
          <CheckCircle2 size={16} />
          <span>
            {result.success} enrolled
            {result.skipped - (result.errors?.length || 0) > 0 ? `, ${result.skipped - result.errors.length} already enrolled` : ''}.
            {result.errors?.length ? ` Not found: ${result.errors.map((m) => m.replace(/^Student | not found$/g, '')).join(', ')}.` : ''}
          </span>
        </div>
      )}

      <button type="submit" className="btn btn-primary" disabled={saving || rolls.length === 0}>
        {saving ? 'Enrolling…' : `Enroll ${rolls.length || ''} student${rolls.length === 1 ? '' : 's'}`}
      </button>
    </form>
  );
}

export default function BulkEnrollment() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [enrollments, setEnrollments] = useState([]);
  const [loadingEnrollments, setLoadingEnrollments] = useState(false);
  const [tab, setTab] = useState('students');
  const [showNew, setShowNew] = useState(false);
  const [filter, setFilter] = useState('');

  const loadCourses = (selectId) =>
    api.get('/courses')
      .then((res) => {
        const list = res.data.courses || [];
        setCourses(list);
        setSelectedId((cur) => selectId || cur || list[0]?._id || null);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));

  useEffect(() => { loadCourses(); }, []);

  const loadEnrollments = (id) => {
    if (!id) return;
    setLoadingEnrollments(true);
    api.get(`/courses/${id}/enrollments`)
      .then((res) => setEnrollments(res.data.enrollments || []))
      .catch(() => setEnrollments([]))
      .finally(() => setLoadingEnrollments(false));
  };

  useEffect(() => { loadEnrollments(selectedId); }, [selectedId]);

  const course = courses.find((c) => c._id === selectedId);
  const shown = enrollments.filter((e) => {
    const q = filter.trim().toLowerCase();
    return !q || e.student.rollNumber.toLowerCase().includes(q) || e.student.name?.toLowerCase().includes(q);
  });
  const below = enrollments.filter((e) => e.attendance.total > 0 && e.attendance.percentage < 75).length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Courses</div>
          <h1>Courses and enrollment</h1>
          <p>Who is enrolled in each course, and how close each student is to the 75% line.</p>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>
            <Plus size={16} /> New course
          </button>
        </div>
      </div>

      {loading ? (
        <div className="panel loading-line">Loading courses…</div>
      ) : courses.length === 0 ? (
        <div className="panel empty">
          <BookOpen size={32} />
          <h3>No courses yet</h3>
          <p>Create a course, then enroll students by pasting their roll numbers.</p>
          <button className="btn btn-primary" onClick={() => setShowNew(true)}><Plus size={16} /> New course</button>
        </div>
      ) : (
        <div className="split">
          <section className="panel" style={{ overflow: 'hidden' }}>
            <div className="panel-head">
              <h2>All courses</h2>
              <span className="muted">{courses.length}</span>
            </div>
            <div className="list" style={{ maxHeight: '68vh', overflowY: 'auto' }}>
              {courses.map((c) => (
                <button key={c._id} type="button" className="list-item" aria-current={c._id === selectedId} onClick={() => setSelectedId(c._id)}>
                  <div className="mono" style={{ fontSize: '0.8rem', color: 'var(--ink-3)' }}>{c.courseCode}</div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{c.courseName}</div>
                  <div className="muted" style={{ fontSize: '0.76rem', marginTop: '0.1rem' }}>Sem {c.semester} · {c.academicYear}</div>
                </button>
              ))}
            </div>
          </section>

          {course && (
            <section className="panel" style={{ overflow: 'hidden' }}>
              <div className="panel-pad" style={{ paddingBottom: 0 }}>
                <div className="mono muted" style={{ fontSize: '0.8rem' }}>{course.courseCode} · {course.academicYear}</div>
                <h2 style={{ fontSize: '1.15rem', marginTop: '0.15rem' }}>{course.courseName}</h2>
                <div className="muted" style={{ fontSize: '0.82rem', marginTop: '0.2rem' }}>
                  {course.department} · Semester {course.semester}{course.credits != null ? ` · ${course.credits} credits` : ''}
                </div>
                <div className="tabs" role="tablist" style={{ marginTop: '1rem', marginBottom: 0 }}>
                  <button type="button" role="tab" className="tab" aria-selected={tab === 'students'} onClick={() => setTab('students')}>
                    Enrolled ({enrollments.length})
                  </button>
                  <button type="button" role="tab" className="tab" aria-selected={tab === 'add'} onClick={() => setTab('add')}>
                    Add students
                  </button>
                </div>
              </div>

              {tab === 'add' ? (
                <EnrollPanel course={course} onEnrolled={() => loadEnrollments(course._id)} />
              ) : (
                <>
                  <div className="toolbar">
                    <div className="input-wrap">
                      <Search size={15} />
                      <input className="input" placeholder="Filter students" value={filter} onChange={(e) => setFilter(e.target.value)} />
                    </div>
                    {below > 0 && <span className="tag tag-absent">{below} below 75%</span>}
                  </div>
                  {loadingEnrollments ? (
                    <div className="loading-line">Loading students…</div>
                  ) : enrollments.length === 0 ? (
                    <div className="empty">
                      <h3>Nobody enrolled yet</h3>
                      <p>Add students by roll number to start tracking their attendance in this course.</p>
                      <button className="btn btn-secondary" onClick={() => setTab('add')}>Add students</button>
                    </div>
                  ) : (
                    <div className="table-scroll">
                      <table className="table" style={{ minWidth: 560 }}>
                        <thead>
                          <tr>
                            <th>Student</th>
                            <th>Branch</th>
                            <th className="right">Lectures</th>
                            <th style={{ width: '30%' }}>Attendance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {shown.map((e) => {
                            const pct = e.attendance.percentage;
                            const cls = pct >= 75 ? '' : pct >= 60 ? 'warn' : 'low';
                            return (
                              <tr key={e.student._id}>
                                <td>
                                  <div className="cell-title">{e.student.name}</div>
                                  <div className="cell-sub mono">{e.student.rollNumber}</div>
                                </td>
                                <td className="mono">{e.branch}</td>
                                <td className="right mono num">{e.attendance.present}/{e.attendance.total}</td>
                                <td>
                                  {e.attendance.total === 0 ? (
                                    <span className="muted" style={{ fontSize: '0.8rem' }}>No lectures yet</span>
                                  ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                      <div className="meter" style={{ flex: 1 }}>
                                        <div className={`meter-fill ${cls}`} style={{ width: `${Math.min(100, pct)}%` }} />
                                        <div className="meter-mark" style={{ left: '75%' }} />
                                      </div>
                                      <span className="mono num" style={{ fontSize: '0.82rem', width: '3rem', textAlign: 'right' }}>{Math.round(pct)}%</span>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
        </div>
      )}

      {showNew && (
        <NewCourseModal
          onClose={() => setShowNew(false)}
          onCreated={(c) => {
            setShowNew(false);
            setTab('add');
            loadCourses(c._id);
          }}
        />
      )}
    </>
  );
}
