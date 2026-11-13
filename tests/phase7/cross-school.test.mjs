// tests/phase7/cross-school.test.mjs — Phase 7 (roadmap §6 Phase 7,
// §8 "Zero cross-school data access in testing").
//
// Two layers, both offline — the harness has no network and this agent
// cannot query the live database:
//
//  1. STATIC: parse the repo SQL files (supabase/*.sql, files 01–42)
//     and prove the RLS shape: RLS enabled on every table, every tenant
//     table carries an owner-only policy (ss_school_owner(school_id) =
//     auth.uid() or an admin check), and the only tables with NO policy
//     are the RPC-only login-attempt/session tables.
//  2. BEHAVIOURAL (harness): two schools' local DBs live under different
//     keys and never mix, and every server pull (sbFetchAllPages) scopes
//     its query with school_id=eq.<this school> — a school-A session can
//     never ask the server for school-B rows.
//
// What this does NOT prove (pending live evidence, BAT/the user):
// the two-school test against the LIVE Supabase project — school-A
// credentials calling the real API for school-B rows in every tenant
// table. Exact steps are in docs/security-review-phase7.md (PR5).
// Nothing here claims that live check.
//
// Run: node --test tests/phase7/*.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppContext } from '../harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SQL_DIR = join(ROOT, 'supabase');
const sqlFiles = readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql')).sort();
const sqlAll = sqlFiles.map((f) => readFileSync(join(SQL_DIR, f), 'utf8')).join('\n');
// Comments lie; strip them before parsing grants/policies.
const sqlCode = sqlAll.replace(/--[^\n]*/g, ' ');

// The 12 tenant tables whose owner-only policy is built by the DO loop
// in 02_rls.sql (dynamic SQL, so a plain CREATE POLICY grep misses them).
const DO_LOOP_TABLES = [
  'ss_students', 'ss_fee_structure', 'ss_fee_records', 'ss_attendance',
  'ss_receipts', 'ss_audit_log', 'ss_activities', 'ss_teachers', 'ss_exams',
  'ss_marks', 'ss_homework', 'ss_notices',
];

// Tables that MUST have no policy: reachable only through SECURITY
// DEFINER RPCs (login attempts + sessions). Direct access is denied by
// default when RLS is enabled with zero policies.
const RPC_ONLY_TABLES = [
  'ss_parent_pin_attempts',
  'ss_school_login_attempts',
  'ss_staff_login_attempts',
  'ss_staff_sessions',
  'ss_student_login_attempts',
  'ss_teacher_login_attempts',
  'ss_teacher_sessions',
];

function allTables() {
  return [...new Set([...sqlCode.matchAll(/create table if not exists public\.(ss_[a-z_0-9]+)/gi)].map((m) => m[1]))].sort();
}

function policyTables() {
  const direct = [...sqlCode.matchAll(/create policy\s+\S+\s+on public\.(ss_[a-z_0-9]+)/gi)].map((m) => m[1]);
  return [...new Set([...direct, ...DO_LOOP_TABLES])].sort();
}

describe('RLS shape (static, from repo SQL files)', () => {
  it('RLS is enabled on every table (27 tables, files 01-42)', () => {
    const tables = allTables();
    assert.equal(tables.length, 27, `expected 27 ss_ tables, got ${tables.length}: ${tables.join(', ')}`);
    const enabled = [...new Set([...sqlCode.matchAll(/alter table public\.(ss_[a-z_0-9]+)\s+enable row level security/gi)].map((m) => m[1]))].sort();
    for (const t of tables) assert.ok(enabled.includes(t), `${t}: RLS not enabled`);
  });

  it('the DO-loop table list in 02_rls.sql is exactly the 12 pinned tables (no drift)', () => {
    const src02 = readFileSync(join(SQL_DIR, '02_rls.sql'), 'utf8');
    const m = src02.match(/foreach t in array array\[([\s\S]*?)\]/);
    assert.ok(m, 'DO-loop table array not found in 02_rls.sql');
    const listed = [...m[1].matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1]).sort();
    assert.deepEqual(listed, [...DO_LOOP_TABLES].sort());
  });

  it('every table except the RPC-only set has a policy', () => {
    const tables = allTables();
    const withPolicy = policyTables();
    for (const t of tables) {
      if (RPC_ONLY_TABLES.includes(t)) {
        assert.ok(!withPolicy.includes(t), `${t} is RPC-only but a policy exists for it`);
      } else {
        assert.ok(withPolicy.includes(t), `${t} has no policy — any authenticated user could be denied nothing (or everything) by default`);
      }
    }
  });

  it('the RPC-only set is exactly the 7 login-attempt/session tables', () => {
    const tables = allTables();
    const withPolicy = policyTables();
    assert.deepEqual(tables.filter((t) => !withPolicy.includes(t)).sort(), [...RPC_ONLY_TABLES].sort());
  });

  it('every tenant table policy is owner-only (or admin)', () => {
    // DO-loop template (02_rls.sql) — one policy per table, same rule.
    assert.match(sqlCode, /ss_school_owner\(school_id\) = auth\.uid\(\) or public\.is_ss_admin\(\)/,
      'owner-only policy template missing from 02_rls.sql');
    // The named owner policies (admission/support/staff/holidays/schools/classes).
    for (const t of ['ss_admission_requests', 'ss_support_requests', 'ss_staff', 'ss_holidays', 'ss_classes']) {
      const re = new RegExp(`create policy\\s+\\S+\\s+on public\\.${t}[\\s\\S]{0,400}?ss_school_owner\\(school_id\\) = auth\\.uid\\(\\)`, 'i');
      assert.match(sqlCode, re, `${t}: no owner-only policy found`);
    }
    // ss_schools is keyed by owner_id, not school_id.
    assert.match(sqlCode, /create policy ss_schools_owner_read on public\.ss_schools[\s\S]{0,300}?owner_id = auth\.uid\(\)/i,
      'ss_schools owner-read policy missing');
  });

  it('anon can INSERT admission requests only (Pending + real school) and READ platform settings only', () => {
    const flat = sqlCode.replace(/\s+/g, ' ');
    const anonPolicies = [...flat.matchAll(/create policy (\S+) on public\.(ss_[a-z_0-9]+) for (\w+) to anon[^;]*?;/gi)];
    assert.deepEqual(
      anonPolicies.map((m) => `${m[2]}:${m[3]}`).sort(),
      ['ss_admission_requests:insert', 'ss_platform_settings:select'],
      'anon table access must stay at exactly these two policies',
    );
    const adm = anonPolicies.find((m) => m[2] === 'ss_admission_requests')[0];
    assert.match(adm, /status = 'Pending'/, 'anon admission insert must force Pending');
    assert.match(adm, /ss_is_real_school\(school_id\)/, 'anon admission insert must check a real school');
    // No anon SELECT/UPDATE/DELETE on tenant rows: the deepEqual above
    // already pins anon to exactly these two policies — insert-only on
    // admission requests, select-only on the public settings fields.
  });

  it('cloud-login RPCs take a school id and filter by it', () => {
    // A login RPC must be told which school it is for, and must only
    // ever return that school's rows — the server never trusts a bare id.
    const loginRpcs = {
      ss_student_cloud_login: '17_student_cloud_login.sql',
      ss_teacher_cloud_login: '18_teacher_cloud_login.sql',
      ss_staff_cloud_login: '30_staff_roles.sql',
    };
    for (const [fn, file] of Object.entries(loginRpcs)) {
      const src = readFileSync(join(SQL_DIR, file), 'utf8').replace(/--[^\n]*/g, ' ');
      assert.ok(src.includes(`function public.${fn}(`), `${fn} not defined in ${file}`);
      assert.match(src, new RegExp(`function public\\.${fn}\\([^)]*p_school_id uuid`, 'i'),
        `${fn} must take p_school_id`);
      assert.match(src, /school_id = p_school_id/, `${file}: RPC body must filter by school_id = p_school_id`);
    }
  });

  it('write RPCs take a session token and resolve the school from it (never from the caller)', () => {
    // mark_attendance / post_homework / set_marks carry NO school id at
    // all: the first parameter is the 30-day session token, the school
    // comes from ss_*_token_owner(p_token), and every write uses
    // v_owner.school_id. A stolen token for school A can therefore never
    // write school B rows — the school is derived server-side.
    const writeRpcs = [
      ['18_teacher_cloud_login.sql', 'ss_teacher_mark_attendance', 'ss_teacher_token_owner'],
      ['18_teacher_cloud_login.sql', 'ss_teacher_post_homework', 'ss_teacher_token_owner'],
      ['18_teacher_cloud_login.sql', 'ss_teacher_set_marks', 'ss_teacher_token_owner'],
      ['35_staff_write_rpcs.sql', 'ss_staff_mark_attendance', 'ss_staff_token_owner'],
      ['35_staff_write_rpcs.sql', 'ss_staff_post_homework', 'ss_staff_token_owner'],
      ['35_staff_write_rpcs.sql', 'ss_staff_set_marks', 'ss_staff_token_owner'],
    ];
    for (const [file, fn, ownerFn] of writeRpcs) {
      const src = readFileSync(join(SQL_DIR, file), 'utf8');
      const body = src.slice(src.indexOf(`function public.${fn}(`));
      assert.match(body, /p_token uuid/, `${fn} must take p_token as its first parameter`);
      assert.ok(body.includes(`from public.${ownerFn}(p_token)`), `${fn} must resolve the school via ${ownerFn}(p_token)`);
      assert.match(body, /v_owner\.school_id/, `${fn} must write with v_owner.school_id`);
      assert.doesNotMatch(body, /p_school_id/, `${fn} must not accept a caller-supplied school id`);
    }
  });

  it('token-owner helpers are internal: no EXECUTE grant to anyone', () => {
    // ss_teacher_token_owner / ss_staff_token_owner resolve a token to
    // (teacher/staff, school). Only the write RPCs call them (same owner);
    // an anonymous caller must never call them directly.
    for (const [file, fn] of [
      ['18_teacher_cloud_login.sql', 'ss_teacher_token_owner'],
      ['30_staff_roles.sql', 'ss_staff_token_owner'],
    ]) {
      const src = readFileSync(join(SQL_DIR, file), 'utf8');
      assert.match(src, new RegExp(`revoke all on function public\\.${fn}\\(uuid\\) from public`, 'i'), `${fn}: PUBLIC revoke missing`);
      assert.match(src, new RegExp(`revoke all on function public\\.${fn}\\(uuid\\) from anon`, 'i'), `${fn}: anon revoke missing`);
      assert.match(src, new RegExp(`revoke all on function public\\.${fn}\\(uuid\\) from authenticated`, 'i'), `${fn}: authenticated revoke missing`);
      assert.doesNotMatch(src, new RegExp(`grant execute on function public\\.${fn}`, 'i'), `${fn} must never be granted`);
    }
  });
});

describe('two schools never mix (harness, local DB keys)', () => {
  function twoSchools() {
    const app = createAppContext();
    const schoolA = { role: 'school', uid: 'uid-school-A', email: 'a@school.test', school: 'School A' };
    const schoolB = { role: 'school', uid: 'uid-school-B', email: 'b@school.test', school: 'School B' };
    return { app, schoolA, schoolB };
  }

  it('dbKeyFor gives each school its own key, and every role opens its school key', () => {
    const { app, schoolA, schoolB } = twoSchools();
    const keyA = app.run(`dbKeyFor(${JSON.stringify(schoolA)})`);
    const keyB = app.run(`dbKeyFor(${JSON.stringify(schoolB)})`);
    assert.notEqual(keyA, keyB, 'two schools must never share a local DB key');
    for (const role of ['teacher', 'student', 'parent', 'principal', 'accountant', 'staff']) {
      const k = app.run(`dbKeyFor({ role: '${role}', schoolUid: 'school-A-uuid' })`);
      assert.equal(k, 'schoolSaathiDB_school-A-uuid', `${role} must open the school DB, not its own`);
      const k2 = app.run(`dbKeyFor({ role: '${role}', schoolUid: 'school-B-uuid' })`);
      assert.notEqual(k, k2, `${role}: school A and B keys must differ`);
    }
  });

  it('loading school A never returns school B rows (and vice versa)', () => {
    const { app, schoolA, schoolB } = twoSchools();
    app.run(`
      var dbA = seedDB();
      dbA.students = [{ id: 'stu-A-only', name: 'Asha A', cls: '6th-A' }];
      dbA.profile.name = 'School A';
      writeDbByKey(dbKeyFor(${JSON.stringify(schoolA)}), dbA);
      var dbB = seedDB();
      dbB.students = [{ id: 'stu-B-only', name: 'Bablu B', cls: '6th-A' }];
      dbB.profile.name = 'School B';
      writeDbByKey(dbKeyFor(${JSON.stringify(schoolB)}), dbB);
    `);
    // loadDB() reads the global DB_KEY (loginAs sets it from dbKeyFor);
    // the account argument only profiles a fresh empty DB.
    const aIds = JSON.parse(app.run(`DB_KEY = dbKeyFor(${JSON.stringify(schoolA)}); JSON.stringify(loadDB().students.map(function (s) { return s.id; }))`));
    const bIds = JSON.parse(app.run(`DB_KEY = dbKeyFor(${JSON.stringify(schoolB)}); JSON.stringify(loadDB().students.map(function (s) { return s.id; }))`));
    assert.deepEqual(aIds, ['stu-A-only']);
    assert.deepEqual(bIds, ['stu-B-only']);
    assert.equal(app.run(`DB_KEY = dbKeyFor(${JSON.stringify(schoolA)}); loadDB().profile.name`), 'School A');
    assert.equal(app.run(`DB_KEY = dbKeyFor(${JSON.stringify(schoolB)}); loadDB().profile.name`), 'School B');
  });

  it('a teacher of school A opens school A only — even if school B data sits on the same device', () => {
    const { app, schoolA, schoolB } = twoSchools();
    app.run(`
      var dbA = seedDB(); dbA.students = [{ id: 'stu-A-only', name: 'Asha A', cls: '6th-A' }];
      writeDbByKey(dbKeyFor(${JSON.stringify(schoolA)}), dbA);
      var dbB = seedDB(); dbB.students = [{ id: 'stu-B-only', name: 'Bablu B', cls: '6th-A' }];
      writeDbByKey(dbKeyFor(${JSON.stringify(schoolB)}), dbB);
    `);
    // A teacher login resolves to the SCHOOL's key via schoolUid.
    const seen = JSON.parse(app.run(`DB_KEY = dbKeyFor({ role: 'teacher', schoolUid: 'uid-school-A' }); JSON.stringify(loadDB().students.map(function (s) { return s.id; }))`));
    assert.deepEqual(seen, ['stu-A-only']);
  });
});

describe('every server pull is scoped by school_id (harness, stubbed sbRest)', () => {
  function stubbedApp(pages) {
    const app = createAppContext();
    // pages: { table: [ [rows...], [rows...] ] } — one array per page.
    app.run(`
      globalThis.__ph7calls = [];
      globalThis.__ph7pages = ${JSON.stringify(pages)};
      sbRest = function (method, path, token, body) {
        globalThis.__ph7calls.push(path);
        var m = path.match(/^([a-z_0-9]+)\\?/);
        var table = m ? m[1] : path;
        var page = (globalThis.__ph7pages[table] || []).shift() || [];
        return Promise.resolve({ ok: true, status: 200, data: page });
      };
    `);
    return app;
  }

  it('sbFetchAllPages always sends school_id=eq.<this school> and nothing else', async () => {
    const app = stubbedApp({ ss_students: [[{ id: 's1' }], []] });
    await app.run(`sbFetchAllPages('ss_students', 'id', 'school-A-uuid', 'tok')`);
    const calls = JSON.parse(app.run('JSON.stringify(globalThis.__ph7calls)'));
    assert.equal(calls.length, 1);
    assert.match(calls[0], /school_id=eq\.school-A-uuid/);
    assert.doesNotMatch(calls[0], /school-B/);
  });

  it('a school-B id in the call never leaks into a school-A pull', async () => {
    const app = stubbedApp({ ss_students: [[{ id: 's1' }], []] });
    await app.run(`sbFetchAllPages('ss_students', 'id', 'school-B-uuid', 'tok')`);
    const calls = JSON.parse(app.run('JSON.stringify(globalThis.__ph7calls)'));
    assert.match(calls[0], /school_id=eq\.school-B-uuid/);
    assert.doesNotMatch(calls[0], /school-A/);
  });

  it('no pull path issues an unscoped query (every query carries school_id=eq.)', async () => {
    const app = stubbedApp({
      ss_students: [[{ id: 's1' }], []],
      ss_teachers: [[{ id: 't1' }], []],
      ss_fee_records: [[{ id: 'f1' }], []],
    });
    for (const t of ['ss_students', 'ss_teachers', 'ss_fee_records']) {
      await app.run(`sbFetchAllPages('${t}', 'id', 'school-A-uuid', 'tok')`);
    }
    const calls = JSON.parse(app.run('JSON.stringify(globalThis.__ph7calls)'));
    assert.equal(calls.length, 3);
    for (const c of calls) assert.match(c, /school_id=eq\.school-A-uuid/, `unscoped query: ${c}`);
  });
});
