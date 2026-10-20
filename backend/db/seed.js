import crypto from 'crypto';
import { withTransaction } from './index.js';
import { countUsers, createUser } from '../repositories/users.js';
import { createCourse, createEnrollment, createFacultyAssignment } from '../repositories/courses.js';

// Demo data for a fresh database (server.js only calls this when SEED_DEMO=true outside
// production). The faculty password comes from SEED_FACULTY_PASSWORD or is generated.
export async function seedDemoData({ log = console.log } = {}) {
  if ((await countUsers()) > 0) return;

  const password = process.env.SEED_FACULTY_PASSWORD || crypto.randomBytes(12).toString('base64url');

  await withTransaction(async (client) => {
    const faculty = await createUser({
      name: 'Dr. Rajesh Sharma',
      email: 'faculty@campus.edu',
      password,
      role: 'faculty',
      department: 'Computer Science & Engineering'
    }, client);

    await client.query(
      `INSERT INTO classrooms (room_code, building, floor, capacity, latitude, longitude, radius_meters)
       VALUES ('L-302', 'Main Academic Block (CSE)', 3, 80, 22.77618, 86.14325, 40)
       ON CONFLICT (room_code) DO NOTHING`
    );

    const { rows: [student] } = await client.query(
      `INSERT INTO students (roll_number, name, email, department)
       VALUES ('2023UGCS042', 'Sujal Bhatu', '2023ugcs042@nitjsr.ac.in', 'CSE')
       ON CONFLICT (roll_number) DO UPDATE SET roll_number = EXCLUDED.roll_number
       RETURNING id`
    );

    const courses = [
      { courseCode: 'CS401', courseName: 'Operating Systems' },
      { courseCode: 'CS402', courseName: 'Computer Networks' },
      { courseCode: 'CS403', courseName: 'DBMS' },
      { courseCode: 'MA301', courseName: 'Discrete Mathematics' }
    ];
    for (const c of courses) {
      const course = await createCourse({ ...c, department: 'CSE', semester: 4, academicYear: '2026-27' }, client);
      await createFacultyAssignment({ facultyId: faculty.id, courseId: course.id, branch: 'CSE', academicYear: '2026-27' }, client);
      await createEnrollment({ studentId: student.id, courseId: course.id, branch: 'CSE', academicYear: '2026-27' }, client);
    }
  });

  if (process.env.SEED_FACULTY_PASSWORD) {
    log('[SEED] Created demo faculty account faculty@campus.edu (password from SEED_FACULTY_PASSWORD)');
  } else {
    log(`[SEED] Created demo faculty account faculty@campus.edu with generated password: ${password}`);
  }
}
