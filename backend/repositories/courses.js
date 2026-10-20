import { query, isUuid } from '../db/index.js';

const COLUMNS = 'id, course_code, course_name, credits, department, semester, academic_year, created_at';

export const toCourse = (r) => r && ({
  _id: r.id,
  id: r.id,
  courseCode: r.course_code,
  courseName: r.course_name,
  credits: r.credits,
  department: r.department,
  semester: r.semester,
  academicYear: r.academic_year,
  createdAt: r.created_at
});

// Columns prefixed with `c_` when a course is joined into another query
export const COURSE_JOIN_COLUMNS = `c.id AS c_id, c.course_code AS c_course_code, c.course_name AS c_course_name,
  c.credits AS c_credits, c.department AS c_department, c.semester AS c_semester,
  c.academic_year AS c_academic_year, c.created_at AS c_created_at`;
export const toJoinedCourse = (r) => r.c_id && toCourse({
  id: r.c_id, course_code: r.c_course_code, course_name: r.c_course_name, credits: r.c_credits,
  department: r.c_department, semester: r.c_semester, academic_year: r.c_academic_year, created_at: r.c_created_at
});

export async function createCourse({ courseCode, courseName, credits, department, semester, academicYear }, db = { query }) {
  const { rows } = await db.query(
    `INSERT INTO courses (course_code, course_name, credits, department, semester, academic_year)
     VALUES ($1, $2, COALESCE($3, 4), $4, $5, $6) RETURNING ${COLUMNS}`,
    [courseCode.trim().toUpperCase(), courseName, credits ?? null, department, semester, academicYear]
  );
  return toCourse(rows[0]);
}

export async function listCourses({ department, semester, academicYear } = {}) {
  const { rows } = await query(
    `SELECT ${COLUMNS} FROM courses
     WHERE ($1::text IS NULL OR department = $1)
       AND ($2::int IS NULL OR semester = $2)
       AND ($3::text IS NULL OR academic_year = $3)
     ORDER BY course_code`,
    [department ?? null, semester ?? null, academicYear ?? null]
  );
  return rows.map(toCourse);
}

export async function findCourseById(id) {
  if (!isUuid(id)) return null;
  const { rows } = await query(`SELECT ${COLUMNS} FROM courses WHERE id = $1`, [id]);
  return toCourse(rows[0]);
}

export async function countCourses() {
  const { rows } = await query('SELECT count(*)::int AS n FROM courses');
  return rows[0].n;
}

export async function countActiveEnrollments(courseId) {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM enrollments WHERE course_id = $1 AND status = 'active'`,
    [courseId]
  );
  return rows[0].n;
}

// Enrolls a list of roll numbers in one statement. Unknown roll numbers and existing
// enrollments are reported back instead of failing the whole batch.
export async function enrollRollNumbers(courseId, rollNumbers, { branch, academicYear }) {
  const rolls = [...new Set(rollNumbers.map((r) => String(r).trim().toUpperCase()).filter(Boolean))];
  const { rows: found } = await query('SELECT id, roll_number FROM students WHERE roll_number = ANY($1)', [rolls]);
  const known = new Set(found.map((r) => r.roll_number));
  const missing = rolls.filter((r) => !known.has(r));

  const { rowCount } = await query(
    `INSERT INTO enrollments (student_id, course_id, branch, academic_year)
     SELECT id, $2, $3, $4 FROM students WHERE roll_number = ANY($1)
     ON CONFLICT (student_id, course_id) DO NOTHING`,
    [rolls, courseId, branch, academicYear]
  );

  return {
    success: rowCount,
    skipped: rolls.length - rowCount,
    errors: missing.map((r) => `Student ${r} not found`)
  };
}

export async function createEnrollment({ studentId, courseId, branch, academicYear }, db = { query }) {
  await db.query(
    `INSERT INTO enrollments (student_id, course_id, branch, academic_year) VALUES ($1, $2, $3, $4)
     ON CONFLICT (student_id, course_id) DO NOTHING`,
    [studentId, courseId, branch, academicYear]
  );
}

// Per-student attendance for a course in one query (was one count query per student)
export async function courseEnrollmentStats(courseId) {
  const { rows } = await query(
    `WITH course_sessions AS (SELECT id FROM sessions WHERE course_id = $1)
     SELECT s.id, s.roll_number, s.name, s.email, e.branch, e.enrolled_at,
            (SELECT count(*) FROM course_sessions)::int AS total,
            count(a.id) FILTER (WHERE a.status = 'PRESENT')::int AS present
     FROM enrollments e
     JOIN students s ON s.id = e.student_id
     LEFT JOIN attendance_records a ON a.student_id = s.id AND a.session_id IN (SELECT id FROM course_sessions)
     WHERE e.course_id = $1 AND e.status = 'active'
     GROUP BY s.id, e.branch, e.enrolled_at
     ORDER BY s.roll_number`,
    [courseId]
  );
  return rows.map((r) => ({
    student: { _id: r.id, id: r.id, rollNumber: r.roll_number, name: r.name, email: r.email },
    branch: r.branch,
    enrolledAt: r.enrolled_at,
    attendance: {
      present: r.present,
      total: r.total,
      percentage: r.total > 0 ? (r.present / r.total) * 100 : 0
    }
  }));
}

// A student's courses with attendance %, in one query
export async function studentCourseStats(studentId) {
  const { rows } = await query(
    `SELECT e.id AS enrollment_id, e.branch, e.academic_year, ${COURSE_JOIN_COLUMNS},
            count(DISTINCT se.id)::int AS total,
            count(DISTINCT a.id) FILTER (WHERE a.status = 'PRESENT')::int AS present
     FROM enrollments e
     JOIN courses c ON c.id = e.course_id
     LEFT JOIN sessions se ON se.course_id = e.course_id AND se.branch = e.branch
     LEFT JOIN attendance_records a ON a.session_id = se.id AND a.student_id = e.student_id
     WHERE e.student_id = $1 AND e.status = 'active'
     GROUP BY e.id, c.id
     ORDER BY c.course_code`,
    [studentId]
  );
  return rows.map((r) => ({
    enrollmentId: r.enrollment_id,
    course: toJoinedCourse(r),
    branch: r.branch,
    academicYear: r.academic_year,
    attendance: {
      present: r.present,
      total: r.total,
      percentage: r.total > 0 ? (r.present / r.total) * 100 : 0
    }
  }));
}

export async function activeEnrollmentBranches(studentId, courseId) {
  const { rows } = await query(
    `SELECT branch FROM enrollments WHERE student_id = $1 AND course_id = $2 AND status = 'active'`,
    [studentId, courseId]
  );
  return rows.map((r) => r.branch);
}

export async function listFacultyAssignments(facultyId) {
  const { rows } = await query(
    `SELECT fa.id, fa.faculty_id, fa.branch, fa.academic_year, fa.assigned_at, ${COURSE_JOIN_COLUMNS}
     FROM faculty_assignments fa JOIN courses c ON c.id = fa.course_id
     WHERE fa.faculty_id = $1 ORDER BY c.course_code`,
    [facultyId]
  );
  return rows.map((r) => ({
    _id: r.id,
    id: r.id,
    facultyId: r.faculty_id,
    courseId: toJoinedCourse(r),
    branch: r.branch,
    academicYear: r.academic_year,
    assignedAt: r.assigned_at
  }));
}

export async function createFacultyAssignment({ facultyId, courseId, branch, academicYear }, db = { query }) {
  const { rows } = await db.query(
    `INSERT INTO faculty_assignments (faculty_id, course_id, branch, academic_year)
     VALUES ($1, $2, $3, $4) RETURNING id, faculty_id, course_id, branch, academic_year, assigned_at`,
    [facultyId, courseId, branch, academicYear]
  );
  const r = rows[0];
  return { _id: r.id, id: r.id, facultyId: r.faculty_id, courseId: r.course_id, branch: r.branch, academicYear: r.academic_year, assignedAt: r.assigned_at };
}
