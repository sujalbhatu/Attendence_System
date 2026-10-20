/**
 * Student passwords: no roll-number default, faculty-issued temporary passwords.
 * Same in-memory model fakes as claimFlow.test.js.
 */
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

const url = (p) => new URL(p, import.meta.url).href;
const students = new Map();

const query = (value) => {
  const q = Promise.resolve(value);
  q.select = () => q;
  return q;
};

class FakeStudent {
  constructor(data) {
    Object.assign(this, { _id: String(students.size + 1), mustChangePassword: false }, data);
  }
  async save() {
    if (this.password && !this.password.startsWith('$2')) this.password = await bcrypt.hash(this.password, 4);
    students.set(this._id, this);
    return this;
  }
  async comparePassword(candidate) {
    return !!this.password && bcrypt.compare(candidate, this.password);
  }
  static findOne({ rollNumber }) {
    return query([...students.values()].find((s) => s.rollNumber === rollNumber) || null);
  }
  static findById(id) {
    return query(students.get(String(id)) || null);
  }
  static async create(data) {
    return new FakeStudent(data).save();
  }
}

mock.module(url('../models/Student.js'), { defaultExport: FakeStudent });
mock.module(url('../config.js'), { namedExports: { JWT_SECRET: 'x'.repeat(32) } });

const portal = await import('../controllers/studentPortalController.js');
const faculty = await import('../controllers/studentController.js');

const res = () => {
  const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};
const call = async (fn, req) => { const r = res(); await fn(req, r); return r; };

beforeEach(() => students.clear());

test('a student with no password cannot log in with their roll number', async () => {
  await FakeStudent.create({ rollNumber: '2023UGCS042', name: 'S' });
  const r = await call(portal.studentLogin, { body: { rollNumber: '2023ugcs042', password: '2023ugcs042' } });
  assert.equal(r.statusCode, 401);
  assert.equal([...students.values()][0].password, undefined, 'no default password was set');
});

test('new students get a one-time temporary password that forces a change', async () => {
  const created = await call(faculty.createStudent, { body: { rollNumber: '2023ugcs777', name: 'New' } });
  assert.equal(created.statusCode, 201);
  const { temporaryPassword } = created.body;
  assert.ok(temporaryPassword.length >= 10);

  const login = await call(portal.studentLogin, { body: { rollNumber: '2023UGCS777', password: temporaryPassword } });
  assert.equal(login.statusCode, 200);
  assert.equal(login.body.mustChangePassword, true);
});

test('reset password replaces the old one', async () => {
  const created = await call(faculty.createStudent, { body: { rollNumber: '2023UGCS100', name: 'R' } });
  const id = [...students.values()][0]._id;
  const reset = await call(faculty.resetStudentPassword, { params: { studentId: id } });
  assert.notEqual(reset.body.temporaryPassword, created.body.temporaryPassword);

  const old = await call(portal.studentLogin, { body: { rollNumber: '2023UGCS100', password: created.body.temporaryPassword } });
  assert.equal(old.statusCode, 401);
  const fresh = await call(portal.studentLogin, { body: { rollNumber: '2023UGCS100', password: reset.body.temporaryPassword } });
  assert.equal(fresh.statusCode, 200);
});
