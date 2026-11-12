// tests/phase7/rate-limit.test.mjs — Phase 7 (roadmap §6 Phase 7):
// rate-limit tests for every login surface.
//
// The rule everywhere is the same: 5 wrong attempts → 15-minute lock.
// It is enforced in TWO places, and the tests cover both:
//   LOCAL (app.js, this device only): student PIN guesses
//   (pinFailRecord, v54) and school/teacher password guesses
//   (loginFailRecord, v59). The record lives in localStorage, so
//   clearing site data resets it — stated honestly in app.js.
//   SERVER (SQL RPCs, every device): school login (SQL 19 + the P0-1
//   auth-bound reset in SQL 21), student (SQL 17), teacher (SQL 18),
//   staff (SQL 30), parent PIN (SQL 36 + DOB reset SQL 37).
// Server behaviour is verified STATICALLY from the repo SQL files —
// this agent cannot query the live database, and no test here pretends
// otherwise. The live lockout check (5 wrong passwords on staging,
// anon reset attempt, matching-email reset) is pending evidence for
// BAT; exact steps are in docs/security-review-phase7.md (PR5).
//
// Run: node --test tests/phase7/*.test.mjs
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppContext } from '../harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readSql = (f) => readFileSync(join(ROOT, 'supabase', f), 'utf8');

describe('local student-PIN lockout (app.js, v54)', () => {
  let app;
  beforeEach(() => { app = createAppContext(); });

  it('constants are 5 attempts and 15 minutes', () => {
    assert.equal(app.run('PIN_MAX_FAILS'), 5);
    assert.equal(app.run('PIN_LOCK_MS'), 15 * 60 * 1000);
  });

  it('4 wrong PINs do not lock; the 5th locks for ~15 minutes', () => {
    for (let i = 0; i < 4; i++) app.run(`pinFailRecord('school-1', 'stu33')`);
    assert.equal(app.run(`pinLockUntil('school-1', 'stu33')`), 0, 'no lock after 4 fails');
    const before = Date.now();
    const lockedUntil = app.run(`pinFailRecord('school-1', 'stu33')`);
    const after = Date.now();
    assert.ok(lockedUntil >= before + 15 * 60 * 1000, 'lock lasts at least 15 minutes');
    assert.ok(lockedUntil <= after + 15 * 60 * 1000, 'lock lasts at most 15 minutes');
    assert.equal(app.run(`pinLockUntil('school-1', 'stu33')`), lockedUntil);
  });

  it('the lock is per (school, student): other students and schools stay open', () => {
    for (let i = 0; i < 5; i++) app.run(`pinFailRecord('school-1', 'stu33')`);
    assert.ok(app.run(`pinLockUntil('school-1', 'stu33')`) > 0);
    assert.equal(app.run(`pinLockUntil('school-1', 'stu34')`), 0, 'a classmate is not locked');
    assert.equal(app.run(`pinLockUntil('school-2', 'stu33')`), 0, 'the same student id at another school is not locked');
  });

  it('a successful login clears the lock (pinFailClear)', () => {
    for (let i = 0; i < 5; i++) app.run(`pinFailRecord('school-1', 'stu33')`);
    assert.ok(app.run(`pinLockUntil('school-1', 'stu33')`) > 0);
    app.run(`pinFailClear('school-1', 'stu33')`);
    assert.equal(app.run(`pinLockUntil('school-1', 'stu33')`), 0);
  });

  it('an expired lock no longer blocks (lockedUntil in the past)', () => {
    app.run(`pinFailRecord('school-1', 'stu33')`);
    // Rewind the stored record past its expiry, as time passing would.
    app.run(`var m = pinFailsLoad(); m[pinFailKey('school-1', 'stu33')].lockedUntil = Date.now() - 1000; pinFailsSave(m);`);
    assert.equal(app.run(`pinLockUntil('school-1', 'stu33')`), 0);
  });

  it('the lock record is persisted in localStorage (survives a reload)', () => {
    for (let i = 0; i < 5; i++) app.run(`pinFailRecord('school-1', 'stu33')`);
    const raw = app.storage.getItem('schoolSaathiPinFails');
    assert.ok(raw, 'fail record must be stored');
    const m = JSON.parse(raw);
    assert.ok(m['school-1:stu33'].lockedUntil > Date.now());
  });

  it('doStudentLogin only counts real students WITH a PIN (unknown admission numbers never lock)', () => {
    // Static: the guard in doStudentLogin — an unknown admission number
    // must not create a lockout (no enumeration, no junk lockouts).
    const src = readFileSync(join(ROOT, 'app.js'), 'utf8');
    assert.match(src, /if \(stu && pinHasPin\(stu\)\) pinFailRecord\(schoolUid, stu\.id\);/,
      'doStudentLogin must only record a fail for a real student with a PIN');
  });
});

describe('local school/teacher password lockout (app.js, v59)', () => {
  let app;
  beforeEach(() => { app = createAppContext(); });

  it('constants are 5 attempts and 15 minutes', () => {
    assert.equal(app.run('LOGIN_MAX_FAILS'), 5);
    assert.equal(app.run('LOGIN_LOCK_MS'), 15 * 60 * 1000);
  });

  it('5 wrong passwords lock the email for ~15 minutes', () => {
    for (let i = 0; i < 4; i++) app.run(`loginFailRecord('teacher@school.test')`);
    assert.equal(app.run(`loginLockUntil('teacher@school.test')`), 0);
    const lockedUntil = app.run(`loginFailRecord('teacher@school.test')`);
    assert.ok(lockedUntil >= Date.now() + 15 * 60 * 1000 - 1000);
    assert.ok(app.run(`loginLockUntil('teacher@school.test')`) > 0);
  });

  it('the email key is case-insensitive and trimmed (one record per email)', () => {
    app.run(`loginFailRecord('  Teacher@School.Test  ')`);
    assert.equal(app.run(`loginFailsLoad()['teacher@school.test'].n`), 1);
    app.run(`loginFailRecord('TEACHER@school.test')`);
    assert.equal(app.run(`loginFailsLoad()['teacher@school.test'].n`), 2);
    assert.ok(app.run(`loginLockUntil('teacher@school.test')`) === 0);
  });

  it('locking one email never locks another', () => {
    for (let i = 0; i < 5; i++) app.run(`loginFailRecord('a@school.test')`);
    assert.ok(app.run(`loginLockUntil('a@school.test')`) > 0);
    assert.equal(app.run(`loginLockUntil('b@school.test')`), 0);
  });

  it('a successful login clears the lock', () => {
    for (let i = 0; i < 5; i++) app.run(`loginFailRecord('a@school.test')`);
    app.run(`loginFailClear('a@school.test')`);
    assert.equal(app.run(`loginLockUntil('a@school.test')`), 0);
  });
});

describe('server school-login rate limit (SQL 19 + SQL 21, static)', () => {
  const sql19 = readSql('19_school_login_rate_limit.sql');
  const sql21 = readSql('21_school_login_ok_authbound.sql');

  it('SQL 19: 5 fails lock the email for 15 minutes, then the counter resets', () => {
    assert.match(sql19, /if v_fails >= 5 then/);
    assert.match(sql19, /now\(\) \+ interval '15 minutes'/);
    assert.match(sql19, /set fails = 0, locked_until = v_locked_until/, 'the counter resets when the lock is set');
  });

  it('SQL 19: only emails WITH a Supabase Auth account ever get a row (no enumeration, no junk rows)', () => {
    assert.match(sql19, /select exists\(select 1 from auth\.users u where lower\(u\.email\) = lower\(p_email\)\) into v_exists/);
    assert.match(sql19, /if not v_exists then\s+return jsonb_build_object\('ok', true, 'locked', false\)/,
      'unknown email returns unlocked without creating a row');
  });

  it('SQL 21 (P0-1 fix): the reset is auth-bound — anon cannot reset any lockout', () => {
    // Unauthenticated caller: no reset.
    assert.match(sql21, /if v_uid is null then\s+return jsonb_build_object\('ok', false, 'reason', 'unauthenticated'\)/);
    // Authenticated caller resetting ANOTHER email: no reset.
    assert.match(sql21, /if v_email is null or lower\(v_email\) <> lower\(p_email\) then\s+return jsonb_build_object\('ok', false, 'reason', 'email_mismatch'\)/);
    // Only the matching email's row is deleted.
    assert.match(sql21, /delete from public\.ss_school_login_attempts where email = lower\(p_email\)/);
    // Grants: PUBLIC and anon revoked, authenticated only.
    assert.match(sql21, /revoke execute on function public\.ss_school_login_ok\(text\) from public;/);
    assert.match(sql21, /revoke execute on function public\.ss_school_login_ok\(text\) from anon;/);
    assert.match(sql21, /grant execute on function public\.ss_school_login_ok\(text\) to authenticated;/);
  });

  it('SQL 19: precheck/failed stay anon (they run before any session exists)', () => {
    assert.match(sql19, /grant execute on function public\.ss_school_login_precheck\(text\) to anon, authenticated;/);
    assert.match(sql19, /grant execute on function public\.ss_school_login_failed\(text\) to anon, authenticated;/);
  });

  it('app.js sbSchoolLoginOk: no token means NO reset call at all (auth-bound, v68)', async () => {
    const app = createAppContext();
    app.run(`
      globalThis.__ph7calls = [];
      sbRest = function (method, path, token, body) {
        globalThis.__ph7calls.push({ path: path, token: token, body: body });
        return Promise.resolve({ ok: true, status: 200, data: { ok: true } });
      };
    `);
    const noToken = await app.run(`sbSchoolLoginOk('school@test.in', null)`);
    assert.equal(noToken, null);
    assert.deepEqual(JSON.parse(app.run('JSON.stringify(globalThis.__ph7calls)')), [], 'without a token the reset RPC must never be called');
    const withToken = await app.run(`sbSchoolLoginOk('school@test.in', 'fresh-gotrue-token')`);
    assert.equal(withToken.data.ok, true, 'sbSchoolLoginOk returns the RPC response');
    const calls = JSON.parse(app.run('JSON.stringify(globalThis.__ph7calls)'));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].path, 'rpc/ss_school_login_ok');
    assert.equal(calls[0].token, 'fresh-gotrue-token', 'the reset must be called with the fresh GoTrue token, never the anon key');
    assert.notEqual(calls[0].token, app.run('SB_ANON_KEY'));
  });
});

describe('server rate limits on the other login surfaces (static)', () => {
  it('student (SQL 17), teacher (SQL 18), staff (SQL 30): same 5 fails / 15 minutes', () => {
    for (const [file, table] of [
      ['17_student_cloud_login.sql', 'ss_student_login_attempts'],
      ['18_teacher_cloud_login.sql', 'ss_teacher_login_attempts'],
      ['30_staff_roles.sql', 'ss_staff_login_attempts'],
    ]) {
      const src = readSql(file);
      assert.ok(src.includes(table), `${file}: attempts table ${table} missing`);
      assert.match(src, /fails \+ 1 >= 5/, `${file}: 5-fail threshold missing`);
      assert.match(src, /now\(\) \+ interval '15 minutes'/, `${file}: 15-minute lock missing`);
    }
  });

  it('parent PIN (SQL 36): same 5 fails / 15 minutes, keyed by (school, admission no)', () => {
    const src = readSql('36_parent_pin_lockout.sql');
    assert.match(src, /primary key \(school_id, admission_no\)/);
    assert.match(src, /if v_fails >= 5 then/);
    assert.match(src, /now\(\) \+ interval '15 minutes'/);
    assert.match(src, /revoke execute on function public\.ss_parent_pin_precheck\(uuid, text\) from public;/);
    assert.match(src, /revoke execute on function public\.ss_parent_pin_failed\(uuid, text\) from public;/);
    assert.match(src, /revoke execute on function public\.ss_parent_pin_ok\(uuid, text\) from public;/);
  });

  it('parent PIN reset by DOB (SQL 37): a locked number cannot reset, and the DOB must match', () => {
    const src = readSql('37_parent_pin_reset_by_dob.sql');
    assert.match(src, /if v_locked is not null and v_locked > now\(\) then\s+return jsonb_build_object\('ok', false, 'locked', true/,
      'locked admission numbers must stay locked through the reset flow');
    assert.match(src, /if v_stu\.dob is null then\s+return jsonb_build_object\('ok', false, 'error', 'no_dob'\)/,
      'a student with no DOB on file cannot reset by DOB');
    assert.match(src, /revoke execute on function public\.ss_parent_pin_reset_by_dob\(uuid, text, date, text\) from public;/);
  });
});
