// tests/phase8/v155-password-strength.test.mjs — password strength rules.
// Free replacement for Supabase's Pro-only leaked-password check: min 8
// characters + a blocklist of common passwords, on EVERY password entry
// point (school signup, password reset, teacher, staff/principal/accountant).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const app = ['app.js', 'js/modules/fees-ui.js', 'js/modules/students-ops.js', 'js/modules/academics-ui.js', 'js/modules/people-ui.js'].map(f => readFileSync(join(ROOT, f), 'utf8')).join('\n');
const i18n = readFileSync(join(ROOT, 'js', 'modules', 'i18n.js'), 'utf8');

const start = app.indexOf('var PW_COMMON');
const end = app.indexOf('function sbSignUp');
assert.ok(start !== -1 && end > start, 'pwProblem block not found in app.js');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(app.slice(start, end) + '\nthis.pwProblem = pwProblem;', ctx);
const pwProblem = ctx.pwProblem;

describe('pwProblem', () => {
  it('rejects passwords shorter than 8 characters', () => {
    assert.equal(pwProblem(''), 'tPwShort');
    assert.equal(pwProblem('abc123'), 'tPwShort');
    assert.equal(pwProblem('Ab1!xyz'), 'tPwShort');
  });
  it('rejects common passwords, case-insensitively', () => {
    for (const p of ['password', 'Password123', '12345678', 'QWERTY123', 'schoolsaathi', 'admin123']) {
      assert.equal(pwProblem(p), 'tPwWeak', p);
    }
  });
  it('rejects a single repeated character', () => {
    assert.equal(pwProblem('aaaaaaaa'), 'tPwWeak');
    assert.equal(pwProblem('99999999999'), 'tPwWeak');
  });
  it('accepts reasonable passwords (incl. the QA harness signup password)', () => {
    for (const p of ['signup123', 'Kx9#mPq2vL', 'blue-river-42', 'tchr!Pass77']) {
      assert.equal(pwProblem(p), '', p);
    }
  });
  it('tolerates null/undefined', () => {
    assert.equal(pwProblem(null), 'tPwShort');
    assert.equal(pwProblem(undefined), 'tPwShort');
  });
});

describe('every password entry point uses pwProblem', () => {
  it('only the two cloud LOGIN guards keep the old 6-char floor (existing passwords must still log in)', () => {
    const raw = app.match(/pw\.length\s*<\s*6/g) || [];
    assert.equal(raw.length, 2, 'expected exactly 2 raw 6-char checks (teacher + staff cloud login), got ' + raw.length);
    assert.match(app, /function doTeacherCloudLogin[^{]*\{\s*\n?\s*if \(!email \|\| pw\.length < 6\)/);
    assert.match(app, /function doStaffCloudLogin[^{]*\{\s*\n?\s*if \(!email \|\| pw\.length < 6\)/);
  });
  it('signup, reset, teacher and staff forms all call pwProblem', () => {
    const calls = app.match(/pwProblem\(pw\)/g) || [];
    // signup + reset (2) + teacher (2) + staff (2), each of the last two used twice
    assert.ok(calls.length >= 10, 'expected >= 10 pwProblem(pw) uses, got ' + calls.length);
  });
  it('i18n has the 8-character and weak-password messages', () => {
    assert.match(i18n, /tPwShort: 'Password must be at least 8 characters\.'/);
    assert.match(i18n, /tPwWeak: '/);
  });
});
