// tests/super-admin.test.mjs — Super Admin dashboard (SQL 56 + app.js).
//
// Gate logic is tested where the harness allows (no network, no DOM):
// the PERMS/NAV matrix, the page-level role guards, the pure stats
// merge + totals helpers, the rendered dashboard / schools page, the
// i18n keys (English-only since v147), and the SQL 56 file's fail-closed shape.
// The live RPC behaviour (admin gets rows, non-admin gets an error,
// counts match the server tables) can only be verified against the
// live project AFTER SQL 56 is applied — it is not asserted here.
// Run: npm test   (node --test tests/*.test.mjs, Node built-ins only)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppContext } from './harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

const SCHOOLS = [
  { id: 's1', name: 'Alpha School', city: 'Gopalganj', session: '2025–26', owner_id: 'o1', created_at: '2026-01-05T00:00:00Z', is_demo: false },
  { id: 's2', name: 'Beta School', city: 'Patna', session: '2025–26', owner_id: 'o2', created_at: '2026-02-05T00:00:00Z', is_demo: false },
];
const STATS = [
  { school_id: 's1', student_count: 120, teacher_count: 8, staff_count: 3 },
  { school_id: 's2', student_count: 80, teacher_count: 5, staff_count: 2 },
];

function superAdminContext() {
  const app = createAppContext();
  app.run('state.role = "superadmin"; state.view = "dashboard";');
  app.run('state.superSchools = ' + JSON.stringify(SCHOOLS) + ';');
  app.run('state.superStats = ' + JSON.stringify(STATS) + ';');
  return app;
}

describe('super admin gate: PERMS + NAV', () => {
  it('superadmin may open dashboard, schools, notices — nothing else', () => {
    const app = createAppContext();
    for (const v of ['dashboard', 'schools', 'notices']) {
      assert.equal(app.run(`canAccessView("superadmin", "${v}")`), true, v);
    }
    for (const v of ['students', 'teachers', 'staff', 'fees', 'exams', 'settings', 'reports', 'attendance', 'homework', 'results', 'classes', 'admissions', 'activityLog']) {
      assert.equal(app.run(`canAccessView("superadmin", "${v}")`), false, v);
    }
  });

  it('no other role may open the schools view', () => {
    const app = createAppContext();
    for (const role of ['school', 'teacher', 'student', 'parent', 'principal', 'accountant', 'staff']) {
      assert.equal(app.run(`canAccessView("${role}", "schools")`), false, role);
    }
  });

  it('NAV shows schools only for superadmin', () => {
    const app = createAppContext();
    assert.equal(app.run('NAV.superadmin.map(function (n) { return n[0]; }).join(",")'), 'dashboard,schools,notices');
    for (const role of ['school', 'teacher', 'student', 'parent', 'principal', 'accountant', 'staff']) {
      assert.equal(app.run(`NAV.${role}.some(function (n) { return n[0] === "schools"; })`), false, role);
    }
  });
});

describe('super admin stats merge + totals (pure helpers)', () => {
  it('mergeSuperSchoolStats joins counts by school id', () => {
    const app = createAppContext();
    const rows = app.run('mergeSuperSchoolStats(' + JSON.stringify(SCHOOLS) + ', ' + JSON.stringify(STATS) + ')');
    assert.equal(rows.length, 2);
    assert.equal(rows[0].students, 120);
    assert.equal(rows[0].teachers, 8);
    assert.equal(rows[0].staff, 3);
    assert.equal(rows[1].students, 80);
    assert.equal(rows[1].name, 'Beta School');
  });

  it('a school with no stats row gets null counts, never a made-up 0', () => {
    const app = createAppContext();
    const rows = app.run('mergeSuperSchoolStats(' + JSON.stringify(SCHOOLS) + ', [{ "school_id": "s1", "student_count": 120, "teacher_count": 8, "staff_count": 3 }])');
    assert.equal(rows[0].students, 120);
    assert.equal(rows[1].students, null);
    assert.equal(rows[1].teachers, null);
    assert.equal(rows[1].staff, null);
  });

  it('null stats (SQL 56 not applied) means null counts for every school', () => {
    const app = createAppContext();
    const rows = app.run('mergeSuperSchoolStats(' + JSON.stringify(SCHOOLS) + ', null)');
    assert.equal(rows[0].students, null);
    assert.equal(rows[1].teachers, null);
  });

  it('a stats row for an unknown school id is ignored', () => {
    const app = createAppContext();
    const rows = app.run('mergeSuperSchoolStats(' + JSON.stringify(SCHOOLS) + ', ' + JSON.stringify(STATS.concat([{ school_id: 'ghost', student_count: 999, teacher_count: 999, staff_count: 999 }])) + ')');
    assert.equal(rows.length, 2);
    assert.equal(rows[0].students, 120);
  });

  it('superAdminTotals sums counts and reports statsReady only when complete', () => {
    const app = createAppContext();
    const full = app.run('superAdminTotals(mergeSuperSchoolStats(' + JSON.stringify(SCHOOLS) + ', ' + JSON.stringify(STATS) + '))');
    assert.equal(full.schools, 2);
    assert.equal(full.students, 200);
    assert.equal(full.teachers, 13);
    assert.equal(full.staff, 5);
    assert.equal(full.statsReady, true);
    const partial = app.run('superAdminTotals(mergeSuperSchoolStats(' + JSON.stringify(SCHOOLS) + ', null))');
    assert.equal(partial.statsReady, false);
    assert.equal(partial.students, 0);
  });
});

describe('super admin dashboard + schools page rendering', () => {
  it('dashboard shows platform totals for a super admin', () => {
    const app = superAdminContext();
    const html = app.run('superAdminDashboard()');
    assert.match(html, /Total Schools/);
    assert.match(html, />2</); // 2 schools
    assert.match(html, />200</); // 120 + 80 students
    assert.match(html, />13</); // 8 + 5 teachers
    assert.match(html, />5</); // 3 + 2 staff
    assert.match(html, /Read-only/);
    assert.match(html, /go\('schools'\)/);
  });

  it('dashboard shows dashes (not zeroes) while stats are unavailable', () => {
    const app = superAdminContext();
    app.run('state.superStats = null;');
    const html = app.run('superAdminDashboard()');
    assert.match(html, /—/);
    assert.match(html, /server update \(SQL 56\)/);
    assert.doesNotMatch(html, />200</);
  });

  it('dashboard refuses a non-superadmin role', () => {
    const app = superAdminContext();
    app.run('state.role = "school";');
    assert.match(app.run('superAdminDashboard()'), /Your login cannot open this section\./);
  });

  it('schools page lists schools with counts, read-only (no Edit/Delete)', () => {
    const app = superAdminContext();
    app.run('state.view = "schools";');
    const html = app.run('schoolsPage()');
    assert.match(html, /Alpha School/);
    assert.match(html, /Beta School/);
    assert.match(html, /120/);
    assert.match(html, /Students/);
    assert.match(html, /Teachers/);
    assert.match(html, /Staff/);
    assert.doesNotMatch(html, /Edit/);
    assert.doesNotMatch(html, /Delete/);
  });

  it('schools page shows dashes + the SQL 56 note while stats are unavailable', () => {
    const app = superAdminContext();
    app.run('state.superStats = null;');
    const html = app.run('schoolsPage()');
    assert.match(html, /—/);
    assert.match(html, /server update \(SQL 56\)/);
  });

  it('schools page refuses a non-superadmin role', () => {
    const app = superAdminContext();
    app.run('state.role = "teacher";');
    assert.match(app.run('schoolsPage()'), /Your login cannot open this section\./);
  });

  it('sbLoadSuperData marks the lists loaded once per session', () => {
    const app = createAppContext();
    assert.equal(app.run('state.superLoaded'), false);
    app.run('sbLoadSuperData("tok")');
    assert.equal(app.run('state.superLoaded'), true);
    // Second call is a no-op (guard) — still loaded, no throw.
    app.run('sbLoadSuperData("tok")');
    assert.equal(app.run('state.superLoaded'), true);
  });
});

describe('super admin i18n keys (EN only — v147 removed Hindi mode)', () => {
  const keys = ['thStudents', 'thTeachers', 'thStaff', 'saTotalSchools', 'saTotalStudents', 'saTotalTeachers', 'saTotalStaff', 'saPlatformSub', 'saReadOnly', 'saStatsPending'];
  for (const k of keys) {
    it(`${k} exists in EN`, () => {
      const app = createAppContext();
      const en = app.run(`I18N.en.${k}`);
      assert.ok(typeof en === 'string' && en.length > 0, `en.${k}`);
      assert.notEqual(en, k);
    });
  }
});

describe('SQL 56 file (static checks — live behaviour needs the live DB)', () => {
  it('defines ss_super_admin_school_stats with the admin gate and counts', () => {
    const sql = read('supabase/56_super_admin_school_stats.sql');
    assert.match(sql, /create or replace function public\.ss_super_admin_school_stats\(\)/);
    assert.match(sql, /if not public\.is_ss_admin\(\) then/);
    assert.match(sql, /raise exception 'not a super admin'/);
    assert.match(sql, /security definer/);
    assert.match(sql, /ss_students/);
    assert.match(sql, /status in \('Active', 'Inactive'\)/);
    assert.match(sql, /ss_teachers/);
    assert.match(sql, /ss_staff/);
    assert.match(sql, /not coalesce\(t\.deleted, false\)/);
    assert.match(sql, /not coalesce\(stf\.deleted, false\)/);
  });

  it('grants execute to authenticated only; no anon, no hard-coded admin', () => {
    const sql = read('supabase/56_super_admin_school_stats.sql');
    assert.match(sql, /grant execute on function public\.ss_super_admin_school_stats\(\) to authenticated;/);
    assert.match(sql, /revoke all on function public\.ss_super_admin_school_stats\(\) from anon;/);
    assert.doesNotMatch(sql, /insert into public\.ss_platform_admins/i);
    assert.doesNotMatch(sql, /@gmail|@school|hard-cod\w* (an )?email/i);
    assert.doesNotMatch(sql, /delete from|drop table/i);
  });
});

describe('changed sources parse', () => {
  for (const f of ['app.js', 'js/modules/i18n.js', 'tests/super-admin.test.mjs']) {
    it(`node --check ${f}`, () => {
      execFileSync('node', ['--check', f], { cwd: ROOT, stdio: 'pipe' });
    });
  }
});
