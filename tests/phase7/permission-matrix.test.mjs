// tests/phase7/permission-matrix.test.mjs — Phase 7 (roadmap §6 Phase 7,
// Phase 4 exit gate): the 8-role permission matrix, tested against the
// real app code (PERMS / canAccessView / canViewStudent / visibleStudents /
// roleClasses / PAGE_* maps) in the Phase 1 harness. Fixtures only —
// seedDB() demo data, never a real school.
//
// The matrix below is pinned EXACTLY as it stands in app.js at v119.
// Any future PERMS change (a new view, a role gaining/losing a page)
// must update this table in the same commit — that is the point: a
// silent permission widening fails CI instead of shipping.
//
// Run: node --test tests/phase7/*.test.mjs
// NOTE (v111 — corrected): tests/run.mjs IS recursive, so this suite
// runs in CI on every push/PR (green on HEAD 2516c097, 12 Nov 2026).
// The earlier note claiming a non-recursive glob was wrong.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createAppContext } from '../harness.mjs';

// Expected PERMS at v108, copied from app.js (var PERMS, ~line 7545).
// school = School Admin. Order matches app.js.
const EXPECTED_PERMS = {
  school: ['dashboard', 'students', 'teachers', 'staff', 'classes', 'admissions', 'attendance', 'fees', 'exams', 'homework', 'notices', 'reports', 'activityLog', 'settings'],
  teacher: ['dashboard', 'students', 'attendance', 'exams', 'homework', 'notices'],
  student: ['dashboard', 'attendance', 'fees', 'results', 'homework', 'notices'],
  principal: ['dashboard', 'students', 'teachers', 'attendance', 'fees', 'exams', 'homework', 'notices', 'reports'],
  accountant: ['dashboard', 'fees', 'reports', 'notices'],
  staff: ['dashboard', 'attendance', 'homework', 'notices'],
  parent: ['dashboard', 'attendance', 'fees', 'results', 'homework', 'notices'],
  superadmin: ['dashboard', 'schools', 'notices'],
};

// Every view name any role can hold.
const ALL_VIEWS = [...new Set(Object.values(EXPECTED_PERMS).flat())].sort();

const ROLES = Object.keys(EXPECTED_PERMS);

// Arrays/objects built inside the harness vm carry the vm realm's
// prototypes, so assert.deepEqual on them fails cross-realm. JSON
// round-trips every collection assertion back to plain host values.
function jq(app, expr) {
  return JSON.parse(app.run(`JSON.stringify(${expr})`));
}

describe('permission matrix (8 roles)', () => {
  let app;
  beforeEach(() => {
    app = createAppContext();
    app.run('db = seedDB();');
  });

  it('PERMS has exactly the 8 target roles, no more, no fewer', () => {
    const roles = jq(app, 'Object.keys(PERMS).sort()');
    assert.deepEqual(roles, [...ROLES].sort());
  });

  it('PERMS matches the pinned matrix view-for-view', () => {
    for (const role of ROLES) {
      assert.deepEqual(
        jq(app, `PERMS['${role}'].slice().sort()`),
        [...EXPECTED_PERMS[role]].sort(),
        `PERMS['${role}'] drifted from the pinned matrix`,
      );
    }
  });

  it('canAccessView allows exactly the pinned views for every role', () => {
    for (const role of ROLES) {
      for (const view of ALL_VIEWS) {
        const want = EXPECTED_PERMS[role].includes(view);
        assert.equal(
          app.run(`canAccessView('${role}', '${view}')`),
          want,
          `canAccessView('${role}', '${view}') should be ${want}`,
        );
      }
    }
  });

  it('unknown role, unknown view, and null role are all denied', () => {
    assert.equal(app.run(`canAccessView('admin', 'dashboard')`), false);
    assert.equal(app.run(`canAccessView('school', 'noSuchView')`), false);
    assert.equal(app.run(`canAccessView(null, 'dashboard')`), false);
    assert.equal(app.run(`canAccessView('', 'dashboard')`), false);
  });

  it('every PERMS view resolves to a real page function for that role', () => {
    // PAGE_SCHOOL's nulls are filled by late registration (app.js ~11255),
    // so by the time the harness has loaded everything, every allowed
    // view must be a function — a role must never be offered a dead view.
    const pageMap = {
      school: 'PAGE_SCHOOL', teacher: 'PAGE_TEACHER', student: 'PAGE_STUDENT',
      principal: 'PAGE_PRINCIPAL', accountant: 'PAGE_ACCOUNTANT', staff: 'PAGE_STAFF',
      parent: 'PAGE_PARENT', superadmin: 'PAGE_SUPERADMIN',
    };
    for (const role of ROLES) {
      for (const view of EXPECTED_PERMS[role]) {
        const isFn = app.run(`typeof ${pageMap[role]}['${view}'] === 'function'`);
        assert.equal(isFn, true, `${role} may open '${view}' but ${pageMap[role]}['${view}'] is not a function`);
      }
    }
  });

  it('no page exists outside PERMS for a role (no orphan reachable view)', () => {
    // renderPage() picks the page from the role's map, so any key in the
    // map that PERMS does not list would be reachable without permission.
    const pageMap = {
      school: 'PAGE_SCHOOL', teacher: 'PAGE_TEACHER', student: 'PAGE_STUDENT',
      principal: 'PAGE_PRINCIPAL', accountant: 'PAGE_ACCOUNTANT', staff: 'PAGE_STAFF',
      parent: 'PAGE_PARENT', superadmin: 'PAGE_SUPERADMIN',
    };
    for (const role of ROLES) {
      const keys = app.run(`Object.keys(${pageMap[role]})`);
      for (const view of keys) {
        assert.ok(
          EXPECTED_PERMS[role].includes(view),
          `${role} has page '${view}' but PERMS does not allow it`,
        );
      }
    }
  });

  it('write paths stay closed to read-only roles (principal / student / parent)', () => {
    // The principal is read-only (v88) and student/parent are view-only
    // (v86): none of them may open settings, staff management, admissions
    // or the audit log — the four write/admin views.
    for (const role of ['principal', 'student', 'parent']) {
      for (const view of ['settings', 'staff', 'admissions', 'activityLog']) {
        assert.equal(app.run(`canAccessView('${role}', '${view}')`), false, `${role} must not open ${view}`);
      }
    }
    // The accountant touches money but never manages people or settings.
    for (const view of ['students', 'teachers', 'staff', 'attendance', 'exams', 'homework', 'settings', 'admissions', 'activityLog']) {
      assert.equal(app.run(`canAccessView('accountant', '${view}')`), false, `accountant must not open ${view}`);
    }
    // Only the school admin manages staff accounts and settings.
    assert.equal(app.run(`canAccessView('school', 'staff')`), true);
    assert.equal(app.run(`canAccessView('school', 'settings')`), true);
    assert.equal(app.run(`canAccessView('school', 'activityLog')`), true);
  });
});

describe('canViewStudent — who may open a student profile', () => {
  let app;
  beforeEach(() => {
    app = createAppContext();
    app.run('db = seedDB();');
  });

  // Seed facts: stu33 Riya + stu34 Priya are 10th-A; stu37..stu40 are
  // 10th-B; t1 Sunita Sharma teaches 10th-A only; t12 Deepak also 10th-A.
  const as = (role, userJson) => {
    app.run(`state.role = '${role}'; state.user = ${userJson};`);
  };

  it('school / principal / accountant may view any student', () => {
    for (const role of ['school', 'principal', 'accountant']) {
      as(role, 'null');
      assert.equal(app.run(`canViewStudent('stu33')`), true, role);
      assert.equal(app.run(`canViewStudent('stu1')`), true, role);
      assert.equal(app.run(`canViewStudent('no-such-id')`), true, `${role} (any id resolves — the profile page itself handles a missing row)`);
    }
  });

  it('student and parent may view ONLY their own profile', () => {
    as('student', `{ studentId: 'stu33' }`);
    assert.equal(app.run(`canViewStudent('stu33')`), true);
    assert.equal(app.run(`canViewStudent('stu34')`), false, 'a classmate is not viewable');
    assert.equal(app.run(`canViewStudent('stu1')`), false);
    as('parent', `{ studentId: 'stu33' }`);
    assert.equal(app.run(`canViewStudent('stu33')`), true, 'parent sees their own child');
    assert.equal(app.run(`canViewStudent('stu34')`), false, 'parent must not see another child');
    as('student', 'null');
    assert.equal(app.run(`canViewStudent('stu33')`), false, 'no signed-in student → nothing viewable');
  });

  it('teacher may view only students in their own classes', () => {
    as('teacher', `{ teacherId: 't1' }`); // Sunita Sharma, 10th-A
    assert.equal(app.run(`canViewStudent('stu33')`), true, '10th-A is her class');
    assert.equal(app.run(`canViewStudent('stu34')`), true, '10th-A is her class');
    assert.equal(app.run(`canViewStudent('stu37')`), false, '10th-B is not her class');
    assert.equal(app.run(`canViewStudent('stu1')`), false, '6th-A is not her class');
    assert.equal(app.run(`canViewStudent('no-such-id')`), false, 'unknown id is not viewable');
    as('teacher', 'null');
    assert.equal(app.run(`canViewStudent('stu33')`), false, 'no signed-in teacher → nothing viewable');
  });

  it('staff and superadmin may NOT open a student profile (current behaviour, pinned)', () => {
    // Staff work attendance/homework for their classes but never open a
    // profile (canViewStudent has no staff branch); the super admin has
    // no school of their own. Pinned so a future widening is deliberate.
    as('staff', `{ staffId: 'st1' }`);
    assert.equal(app.run(`canViewStudent('stu33')`), false);
    as('superadmin', 'null');
    assert.equal(app.run(`canViewStudent('stu33')`), false);
  });
});

describe('visibleStudents / roleClasses — list scoping', () => {
  let app;
  beforeEach(() => {
    app = createAppContext();
    app.run('db = seedDB();');
  });

  it('teacher list shows only their own classes (4 students per class in fixtures)', () => {
    app.run(`state.role = 'teacher'; state.user = { teacherId: 't1' };`);
    const ids = jq(app, `visibleStudents().map(function (s) { return s.id; }).sort()`);
    assert.deepEqual(ids, ['stu33', 'stu34', 'stu35', 'stu36']);
    assert.ok(app.run(`visibleStudents().every(function (s) { return s.cls === '10th-A'; })`));
  });

  it('student list shows only themself', () => {
    app.run(`state.role = 'student'; state.user = { studentId: 'stu34' };`);
    assert.deepEqual(jq(app, `visibleStudents().map(function (s) { return s.id; })`), ['stu34']);
  });

  it('school list shows the whole school (40 fixture students)', () => {
    app.run(`state.role = 'school'; state.user = null;`);
    assert.equal(app.run(`visibleStudents().length`), 40);
  });

  it('parent list shows only their own child (v111 — the C2 gap is closed)', () => {
    // v111: visibleStudents() gained the parent branch, mirroring
    // canViewStudent() (own child only, tested above). Before the fix
    // this returned all 40 students — a parent list view would have
    // leaked the whole school. Pinned here so the fix stays fixed.
    app.run(`state.role = 'parent'; state.user = { studentId: 'stu33' };`);
    assert.deepEqual(jq(app, `visibleStudents().map(function (s) { return s.id; })`), ['stu33']);
  });

  it('roleClasses: teacher/staff see only assigned classes, everyone else sees all 30', () => {
    app.run(`state.role = 'teacher'; state.user = { teacherId: 't1' };`);
    assert.deepEqual(jq(app, `roleClasses()`), ['10th-A']);
    app.run(`state.role = 'school'; state.user = null;`);
    assert.equal(app.run(`roleClasses().length`), 30);
    app.run(`state.role = 'principal'; state.user = null;`);
    assert.equal(app.run(`roleClasses().length`), 30);
    app.run(`state.role = 'staff'; state.user = null;`);
    assert.deepEqual(jq(app, `roleClasses()`), [], 'a staff member with no record sees no classes');
  });
});

describe('principal is read-only', () => {
  it('isPrincipal() is true only for the principal role', () => {
    const app = createAppContext();
    app.run('db = seedDB();');
    for (const role of ROLES) {
      app.run(`state.role = '${role}';`);
      assert.equal(app.run('isPrincipal()'), role === 'principal', role);
    }
  });

  it('principal dashboard says read-only and offers no edit action', () => {
    const app = createAppContext();
    app.run('db = seedDB();');
    app.run(`state.role = 'principal'; state.user = { name: 'Test Principal' };`);
    const html = app.run('principalDashboard()');
    assert.match(html, /Read-only overview/);
    assert.doesNotMatch(html, /<button/i, 'no buttons on the principal dashboard');
    assert.doesNotMatch(html, /go\('fees'\)|go\('settings'\)|collectFee/i, 'no fee-collect or settings navigation on the principal dashboard');
    assert.match(html, /nothing can be changed from this login/);
  });
});
