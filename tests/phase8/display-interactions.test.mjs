// tests/phase8/display-interactions.test.mjs — live display issues #7, #8, #10, #11 (24 Nov 2026).
//
// Each describe pins the code fix for one issue from the user's own live
// test. Every test below FAILS on pre-fix code for the bug it covers:
//   #7  — admissionRequestsPage() rendered the toast strings
//         ('Admission request approved.') as filter options / badges.
//   #8  — attendancePage() defaulted an unmarked student to 'Present',
//         so the Present button showed green while the header said
//         0 Present.
//   #10 — openStudentProfile() never set state.view, so from any view
//         other than Students the profile never rendered (the tap did
//         nothing); Attendance / Exams names were plain <b> with no
//         click at all; teachers had no detail view.
//   #11 — landing.html still carried a WhatsApp card (only reworded).
//
// No version bump in this branch. Run: node --test --test-force-exit
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppContext } from '../harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP_SRC = readFileSync(join(ROOT, 'app.js'), 'utf8');
const I18N_SRC = readFileSync(join(ROOT, 'js', 'modules', 'i18n.js'), 'utf8');
const LANDING_SRC = readFileSync(join(ROOT, 'landing.html'), 'utf8');
const INDEX_SRC = readFileSync(join(ROOT, 'index.html'), 'utf8');
const POLICY_SRC = readFileSync(join(ROOT, 'privacy-policy.html'), 'utf8');
const TERMS_SRC = readFileSync(join(ROOT, 'terms-of-service.html'), 'utf8');

function appWithDom() {
  const app = createAppContext();
  app.run(`
    var __elsDisp = {};
    function __elDisp() {
      return { innerHTML: '', textContent: '', value: '', style: {}, dataset: {},
        classList: { add: function(){}, remove: function(){}, toggle: function(){}, contains: function(){ return false; } },
        setAttribute: function(){}, getAttribute: function(){ return null; },
        addEventListener: function(){}, removeEventListener: function(){},
        appendChild: function(){}, remove: function(){}, click: function(){}, focus: function(){},
        querySelector: function(){ return null; }, querySelectorAll: function(){ return []; },
        options: [], selectedIndex: 0 };
    }
    document.getElementById = function (id) { if (!__elsDisp[id]) __elsDisp[id] = __elDisp(); return __elsDisp[id]; };
    document.querySelector = function () { return null; };
  `);
  return app;
}

const SCHOOL = `{uid:'u1', name:'Test Sunrise School', school:'Test Sunrise School', email:'test@sunrise.test', role:'school', sbUid:'sb-u1'}`;

function loginSchool(app, seed) {
  app.run(`saveAccounts([${SCHOOL}])`);
  app.run(`loginAs(${SCHOOL})`);
  if (seed) {
    app.run('db = seedDB(); saveDB(db); sbFirstLoadDone(); renderApp();');
  }
  return app;
}

// Two students, one class, nothing marked — the fresh-school shape the
// live test had (Test Kumar, no marks entered, nothing marked).
function freshTwoStudents(app) {
  app.run(`
    db.students = [
      { id: 's1', name: 'Test Kumar', cls: '6th-A', roll: 1, status: 'Active', att: 100, guardian: '', fatherName: '', motherName: '', phone: '', gender: '', admissionNo: 'ADM-2025-001', enr: 'ENR-1', session: '2025–26', admissionDate: '2025-04-01' },
      { id: 's2', name: 'Test Kumari', cls: '6th-A', roll: 2, status: 'Active', att: 100, guardian: 'Mr Test', fatherName: 'Mr Test', motherName: 'Mrs Test', phone: '9812345000', gender: 'Girl', admissionNo: 'ADM-2025-002', enr: 'ENR-2', session: '2025–26', admissionDate: '2025-04-01' }
    ];
    db.attendance = {};
    db.feeRecords = [];
    db.marks = [];
    db.exams = [];
    db.holidays = [];
    db.receipts = [];
    db.teachers = [{ id: 't1', name: 'Sunita Sharma', subject: 'Mathematics', cls: '6th-A', classes: ['6th-A'] }];
    db.admissionRequests = [
      { id: 'r1', name: 'Aarav Verma', dob: '2015-01-01', classApply: '6th-A', guardianName: 'Mr Verma', phone: '9812345001', submitted: '2026-11-24', status: 'Pending' },
      { id: 'r2', name: 'Diya Kumar', dob: '2015-02-02', classApply: '6th-A', guardianName: 'Mrs Kumar', phone: '9812345002', submitted: '2026-11-24', status: 'Approved', studentId: 's1' },
      { id: 'r3', name: 'Kabir Tiwari', dob: '2015-03-03', classApply: '6th-A', guardianName: 'Mr Tiwari', phone: '9812345003', submitted: '2026-11-24', status: 'Rejected', reason: 'Seats full' }
    ];
    state.attDate = todayIST(); state.attCls = '6th-A'; state.examId = 'ex1';
    db.exams = [{ id: 'ex1', name: 'Unit Test 1', cls: '6th-A', subject: 'Mathematics', date: '2026-11-24', total: 20 }];
  `);
}

describe('issue 7 — Admission Requests filter shows status labels, never toast text', () => {
  it('admReqStatusLabel returns the short label for every status', () => {
    const app = createAppContext();
    assert.equal(app.run(`admReqStatusLabel('Pending')`), 'Pending');
    assert.equal(app.run(`admReqStatusLabel('Approved')`), 'Approved');
    assert.equal(app.run(`admReqStatusLabel('Rejected')`), 'Rejected');
  });

  it('the toast strings stay toasts — they are not reused as labels', () => {
    const app = createAppContext();
    assert.equal(app.run(`t('admReqApproved')`), 'Admission request approved.');
    assert.equal(app.run(`t('admReqRejected')`), 'Admission request rejected.');
    assert.ok(!APP_SRC.includes(`t('admReq' + r.status)`), 'badge still builds its label from the toast key');
    assert.ok(!APP_SRC.includes(`t('admReq' + x)`), 'filter still builds its label from the toast key');
  });

  it('filter options and badges contain only All / Pending / Approved / Rejected', () => {
    const app = loginSchool(appWithDom(), true);
    freshTwoStudents(app);
    const html = app.run('admissionRequestsPage()');
    assert.ok(!html.includes('Admission request approved.'), 'filter/badge still shows the approved toast text');
    assert.ok(!html.includes('Admission request rejected.'), 'filter/badge still shows the rejected toast text');
    for (const opt of ['>All<', '>Pending<', '>Approved<', '>Rejected<']) {
      assert.ok(html.includes(opt), `admissionRequestsPage: missing filter/badge label ${opt}`);
    }
    // All three rows are shown under the default All filter.
    assert.ok(html.includes('Aarav Verma') && html.includes('Diya Kumar') && html.includes('Kabir Tiwari'));
  });
});

describe('issue 8 — Present button matches the marked counts', () => {
  it('with nothing marked, no Present button is green and the header says 0 Present', () => {
    const app = loginSchool(appWithDom(), true);
    freshTwoStudents(app);
    const html = app.run('attendancePage()');
    assert.ok(html.includes('0 Present'), `header should say 0 Present, got: ${html.slice(0, 400)}`);
    assert.ok(!html.includes('class="p on"'), 'an unmarked student still shows a green Present button');
    assert.ok(!html.includes('class="a on"') && !html.includes('class="l on"'), 'an unmarked student shows some mark button lit');
  });

  it('after marking one student Present, exactly that row is green and the header says 1 Present', () => {
    const app = loginSchool(appWithDom(), true);
    freshTwoStudents(app);
    app.run(`markAtt('s1', 'Present')`);
    const html = app.run('attendancePage()');
    assert.ok(html.includes('1 Present'), 'header should say 1 Present after one mark');
    assert.equal(html.split('class="p on"').length - 1, 1, 'exactly one Present button should be lit');
  });
});

describe('issue 10 — student names open the profile; teachers have a detail view', () => {
  it('openStudentProfile from the Attendance view lands on the profile', () => {
    const app = loginSchool(appWithDom(), true);
    freshTwoStudents(app);
    app.run(`state.view = 'attendance';`);
    app.run(`openStudentProfile('s1')`);
    assert.equal(app.get('state.view'), 'students', 'profile opens only on the students view');
    assert.equal(app.get('state.profileStudent'), 's1');
    const html = app.run('studentsPage()');
    assert.ok(html.includes('Test Kumar'), 'profile page should render the student');
    assert.ok(html.includes('Overview'), 'profile page should render its tabs');
  });

  it('Attendance and Exams rows render the student name as a profile link', () => {
    const app = loginSchool(appWithDom(), true);
    freshTwoStudents(app);
    const att = app.run('attendancePage()');
    assert.ok(att.includes(`onclick="openStudentProfile('s1')"`), 'attendance name is not a profile link');
    assert.ok(att.includes(`onclick="openStudentProfile('s2')"`), 'attendance name is not a profile link');
    assert.ok(!att.includes('<b>Test Kumar</b>'), 'attendance name is still plain bold text');
    const ex = app.run('examsPage()');
    assert.ok(ex.includes(`onclick="openStudentProfile('s1')"`), 'marks-table name is not a profile link');
  });

  it('teachers list has a clickable name and a View button; viewTeacher shows the detail modal', () => {
    const app = loginSchool(appWithDom(), true);
    freshTwoStudents(app);
    const list = app.run('teachersPage()');
    assert.ok(list.includes(`onclick="viewTeacher('t1')"`), 'teacher name has no detail action');
    assert.ok(list.includes('>View<'), 'teachers list has no View button');
    app.run(`viewTeacher('t1')`);
    const modal = app.run(`document.getElementById('modalRoot').innerHTML`);
    assert.ok(modal.includes('Sunita Sharma'), 'teacher detail modal missing the name');
    assert.ok(modal.includes('Mathematics'), 'teacher detail modal missing the subject');
    assert.ok(modal.includes('6th-A'), 'teacher detail modal missing the classes');
    assert.ok(modal.includes('No login'), 'teacher detail modal should say No login when no account exists');
    assert.ok(!/pwHash|hash/i.test(modal), 'teacher detail must never show a password hash');
  });

  it('a principal (read-only) also gets the teacher View button', () => {
    const app = loginSchool(appWithDom(), true);
    freshTwoStudents(app);
    app.run(`state.role = 'principal';`);
    const list = app.run('teachersPage()');
    assert.ok(list.includes(`onclick="viewTeacher('t1')"`), 'principal sees no teacher detail action');
  });
});

describe('issue 11 — landing page has no WhatsApp card', () => {
  it('landing.html mentions WhatsApp nowhere', () => {
    assert.ok(!/whatsapp/i.test(LANDING_SRC), 'landing.html still mentions WhatsApp');
    assert.ok(!LANDING_SRC.includes('WhatsApp reminders'), 'landing.html still has the WhatsApp card');
  });

  it('no other page carries the landing WhatsApp card', () => {
    for (const [name, src] of [['index.html', INDEX_SRC], ['privacy-policy.html', POLICY_SRC], ['terms-of-service.html', TERMS_SRC]]) {
      assert.ok(!src.includes('WhatsApp reminders'), `${name} still has a WhatsApp reminders card`);
    }
  });

  it('the remaining feature cards are intact', () => {
    for (const f of ['Students', 'Attendance', 'Fees', 'Exams', 'Homework', 'Notices', 'Reports', 'Backup', 'Works offline']) {
      assert.ok(LANDING_SRC.includes(f), `landing.html: missing feature card "${f}"`);
    }
  });
});
