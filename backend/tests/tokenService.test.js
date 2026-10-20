import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TokenService } from '../services/tokenService.js';

const SECRET = 'a'.repeat(64);
const SID = '64b7f0c2a1b2c3d4e5f60718';
const W = 4000; // 4 s window
const at = (step, msInto) => step * W + msInto; // a timestamp inside a given window

test('token is valid inside its own 4 s window', () => {
  const issued = TokenService.generateToken(SECRET, SID, 4, at(1000, 100));
  const r = TokenService.verifyToken(SECRET, SID, issued.token, { nowMs: at(1000, 3900), graceMs: 1500 });
  assert.equal(r.valid, true);
  assert.equal(r.step, 1000);
});

test('previous window token is accepted only during the grace period after rotation', () => {
  const prev = TokenService.generateToken(SECRET, SID, 4, at(1000, 2000));
  assert.equal(TokenService.verifyToken(SECRET, SID, prev.token, { nowMs: at(1001, 1400), graceMs: 1500 }).valid, true);
  assert.equal(TokenService.verifyToken(SECRET, SID, prev.token, { nowMs: at(1001, 1600), graceMs: 1500 }).valid, false);
});

test('strict mode (grace 0) rejects the previous window immediately', () => {
  const prev = TokenService.generateToken(SECRET, SID, 4, at(1000, 3999));
  const r = TokenService.verifyToken(SECRET, SID, prev.token, { nowMs: at(1001, 1), graceMs: 0 });
  assert.deepEqual(r, { valid: false, reason: 'TOKEN_EXPIRED' });
});

test('a token two windows old is never accepted (the old code allowed ~12 s)', () => {
  const old = TokenService.generateToken(SECRET, SID, 4, at(1000, 500));
  const r = TokenService.verifyToken(SECRET, SID, old.token, { nowMs: at(1002, 100), graceMs: 1500 });
  assert.equal(r.valid, false);
});

test('a token for another session or secret is rejected', () => {
  const t = TokenService.generateToken(SECRET, SID, 4, at(1000, 0));
  assert.equal(TokenService.verifyToken(SECRET, 'other-session', t.token, { nowMs: at(1000, 10) }).valid, false);
  assert.equal(TokenService.verifyToken('b'.repeat(64), SID, t.token, { nowMs: at(1000, 10) }).valid, false);
  assert.equal(TokenService.verifyToken(SECRET, SID, '', { nowMs: at(1000, 10) }).reason, 'TOKEN_MISSING');
});

test('expiresInMs counts down to the next rotation boundary', () => {
  assert.equal(TokenService.generateToken(SECRET, SID, 4, at(5, 0)).expiresInMs, 4000);
  assert.equal(TokenService.generateToken(SECRET, SID, 4, at(5, 3000)).expiresInMs, 1000);
});

test('PIN must match the digit on screen now (or just before, within grace)', () => {
  const now = at(2000, 500);
  const livePin = TokenService.generateToken(SECRET, SID, 4, now).pin;
  const prevPin = TokenService.generateToken(SECRET, SID, 4, at(1999, 0)).pin;
  const wrong = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((d) => d !== livePin && d !== prevPin);

  assert.equal(TokenService.verifyPin(SECRET, SID, livePin, { nowMs: now }).valid, true);
  assert.equal(TokenService.verifyPin(SECRET, SID, prevPin, { nowMs: now, graceMs: 2000 }).valid, true);
  assert.equal(TokenService.verifyPin(SECRET, SID, wrong, { nowMs: now }).reason, 'PIN_MISMATCH');
  assert.equal(TokenService.verifyPin(SECRET, SID, 'x', { nowMs: now }).reason, 'PIN_REQUIRED');
  assert.equal(TokenService.verifyPin(SECRET, SID, 0, { nowMs: now }).reason, 'PIN_REQUIRED');
});
