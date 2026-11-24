// tests/phase8/live-small-issues.test.mjs — live issues 12–17 (24 Nov 2026).
//
// No version bump in this branch (the v151 bump rides the security fix
// PR #85) — the tests below pin the fixes, not a version number.
//
// Automated tests were green (npm 257/257) while the LIVE app showed these
// six display/data issues the tests could not see. Each describe below pins
// the code fix for one issue. Data-only parts (a missing father/gender value
// in a stored record, Maths vs Mathematics naming, server-side duplicate
// receipt rows) are NOT fixed in code and are covered by the report, not
// by tests here.
//
// Run: npm test   (node --test, Node built-ins only)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppContext } from '../harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP_SRC = readFileSync(join(ROOT, 'app.js'), 'utf8');
const I18N_SRC = readFileSync(join(ROOT, 'js', 'modules', 'i18n.js'), 'utf8');
const STYLES_SRC = readFileSync(join(ROOT, 'styles.css'), 'utf8');

// DOM stub with settable input values, so saveFeeRecord can be driven.
function appWithDom() {
  const app = createAppContext();
  app.run(`
    var __elsFix = {};
    function __elFix() {
      return { innerHTML: '', textContent: '', value: '', style: {}, dataset: {},
        classList: { add: function(){}, remove: function(){}, toggle: function(){}, contains: function(){ return false; } },
        setAttribute: function(){}, getAttribute: function(){ return null; },
        addEventListener: function(){}, removeEventListener: function(){},
        appendChild: function(){}, remove: function(){}, click: function(){}, focus: function(){},
        querySelector: function(){ return null; }, querySelectorAll: function(){ return []; },
        options: [], selectedIndex: 0 };
    }
    document.getElementById = function (id) { if (!__elsFix[id]) __elsFix[id] = __elFix(); return __elsFix[id]; };
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

function disarm(app) {
  app.run('sbFirstLoadDone();');
}

// Two students, one class, no marks/exams/fees — the fresh-school shape
// the live test had (Test Kumar, no marks entered, nothing marked).
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
  `);
}

describe('issue 12 — one central class order (Nursery → 12th)', () => {
  it('schoolClasses() sorts a jumbled stored list canonically; unknown parts sort last', () => {
    const app = loginSchool(appWithDom(), true);
    app.run(`db.classes = [
      { id: '10th-A', cls: '10th-A', subjects: [] }, { id: 'Nursery-B', cls: 'Nursery-B', subjects: [] },
      { id: '1st-A', cls: '1st-A', subjects: [] }, { id: '12th-B', cls: '12th-B', subjects: [] },
      { id: 'LKG-A', cls: 'LKG-A', subjects: [] }, { id: '3rd-A', cls: '3rd-A', subjects: [] },
      { id: 'PG-A', cls: 'PG-A', subjects: [] }, { id: 'Nursery-A', cls: 'Nursery-A', subjects: [] }
    ];`);
    // Cross-realm arrays fail deepStrictEqual on prototype identity —
    // compare the serialised form instead.
    assert.equal(app.run('JSON.stringify(schoolClasses())'), JSON.stringify(['Nursery-A', 'Nursery-B', 'LKG-A', '1st-A', '3rd-A', '10th-A', '12th-B', 'PG-A']));
    assert.equal(app.run(`compareClass('Nursery-A', '1st-A') < 0`), true);
    assert.equal(app.run(`compareClass('12th-B', 'Nursery-A') > 0`), true);
    assert.equal(app.run(`compareClass('10th-A', '10th-B') < 0`), true);
    disarm(app);
  });

  it('classesPage lists classes in canonical order', () => {
    const app = loginSchool(appWithDom(), true);
    app.run(`db.classes = [
      { id: '10th-A', cls: '10th-A', subjects: ['Mathematics'] },
      { id: 'Nursery-A', cls: 'Nursery-A', subjects: ['English'] },
      { id: '6th-A', cls: '6th-A', subjects: ['Science'] }
    ];`);
    const html = app.run('classesPage()');
    assert.ok(html.indexOf('Nursery-A') < html.indexOf('6th-A'), 'Nursery must list before 6th');
    assert.ok(html.indexOf('6th-A') < html.indexOf('10th-A'), '6th must list before 10th');
    disarm(app);
  });

  it('feeStructureCard renders rows in class order but keeps original indexes for save/delete', () => {
    const app = loginSchool(appWithDom(), true);
    app.run(`db.feeStructure = [
      { cls: '10th-A', type: 'Tuition', amount: 1500 },
      { cls: 'Nursery-A', type: 'Tuition', amount: 500 },
      { cls: '6th-A', type: 'Tuition', amount: 800 }
    ];`);
    const html = app.run('feeStructureCard()');
    assert.ok(html.indexOf('Nursery-A') < html.indexOf('6th-A'), 'Nursery row must render before 6th');
    assert.ok(html.indexOf('6th-A') < html.indexOf('10th-A'), '6th row must render before 10th');
    // The Nursery row was at stored index 1, so its amount input must
    // still be fsAmt-1 — saveFeeStructure reads amounts by that index.
    const nurseryAt = html.indexOf('Nursery-A');
    const fsAmt1At = html.indexOf('fsAmt-1');
    const sixthAt = html.indexOf('6th-A');
    assert.ok(fsAmt1At > nurseryAt && fsAmt1At < sixthAt, 'Nursery row must carry its original index fsAmt-1');
    disarm(app);
  });
});

describe('issue 13 — no marks means "—", never "0%"; missing fields show "—"', () => {
  it('latestExamPct is null with no marks; the profile overview shows "—" + "Not entered"', () => {
    const app = loginSchool(appWithDom(), true);
    freshTwoStudents(app);
    assert.equal(app.run(`latestExamPct(db.students[0])`), null);
    const html = app.run(`studentProfilePage('s1')`);
    const lexAt = html.indexOf(app.run(`t('latestExam')`));
    assert.ok(lexAt !== -1, 'Latest Exam card must render');
    const card = html.slice(lexAt, lexAt + 300);
    assert.ok(card.includes('>—<'), 'Latest Exam value must be a dash, not 0%');
    assert.ok(card.includes(app.run(`t('tNotEntered')`)), 'Latest Exam must say Not entered');
    assert.ok(!card.includes('>0%<'), 'Latest Exam must not read 0% with no marks');
    disarm(app);
  });

  it('the student Results tile shows "—" when neither live marks nor a stored result exist', () => {
    const app = loginSchool(appWithDom(), true);
    freshTwoStudents(app);
    app.run(`saveAccounts([{uid:'stu1', name:'Test Kumar', school:'Test Sunrise School', email:'', role:'student', studentId:'s1'}])`);
    app.run(`loginAs({uid:'stu1', name:'Test Kumar', school:'Test Sunrise School', email:'', role:'student', studentId:'s1'})`);
    // loginAs reloads the db from storage, wiping the crafted students
    // above — re-apply them before rendering the student dashboard.
    freshTwoStudents(app);
    const html = app.run('studentDashboard()');
    assert.ok(html.includes(`<div class="n">—</div>`), 'Results tile must be a dash, not 0%');
    disarm(app);
  });

  it('directory + overview never render a missing guardian/phone/father blank', () => {
    const app = loginSchool(appWithDom(), true);
    freshTwoStudents(app);
    const dir = app.run('studentsPage()');
    // Test Kumar's row: father cell and phone cell are both dashes.
    assert.ok(dir.includes('<td>—</td><td>—</td>'), 'missing father + phone must render as dashes in the directory');
    const prof = app.run(`studentProfilePage('s1')`);
    assert.ok(!prof.includes('<b>' + app.run(`t('fGuardian')`) + '</b><span></span>'), 'guardian must not render blank');
    assert.ok(!prof.includes('<b>' + app.run(`t('fPhone')`) + '</b><span></span>'), 'phone must not render blank');
    disarm(app);
  });
});

describe('issue 14 — Settings Danger Zone', () => {
  it('destructive buttons sit in their own Danger Zone card, after Save — never in the Save row', () => {
    const app = loginSchool(appWithDom(), true);
    const html = app.run('settingsPage()');
    const dz = html.indexOf(app.run(`t('dangerZone')`));
    assert.ok(dz !== -1, 'Danger Zone heading must exist');
    const saveAt = html.indexOf(app.run(`t('saveSettingsBtn')`));
    assert.ok(saveAt !== -1 && saveAt < dz, 'Save Settings must come before the Danger Zone');
    for (const key of ['resetAllData', 'removeDeviceData', 'delAccount']) {
      const at = html.indexOf(app.run(`t('${key}')`));
      assert.ok(at > dz, key + ' must sit inside the Danger Zone, after its heading');
    }
    // The Save row ends at the form close; the Danger Zone is a separate card.
    const formClose = html.indexOf('</form>');
    assert.ok(formClose !== -1 && formClose < dz, 'Danger Zone must be outside the settings form');
    assert.ok(STYLES_SRC.includes('.danger-zone'), 'danger-zone CSS must exist');
    assert.ok(I18N_SRC.includes('dangerZone:'), 'dangerZone i18n key must exist');
    disarm(app);
  });
});

describe('issue 15 — a soft-deleted exam stays deleted', () => {
  it('sbQueueExamChange58 queues under the stored sbUid when there is no live session', () => {
    const app = loginSchool(appWithDom(), true);
    app.run('state.sb = null;'); // logged in locally, session gone — the post-logout state
    assert.equal(app.run(`state.user.sbUid`), 'sb-u1');
    app.run(`sbQueueExamChange58({ id: 'ex1', name: 'Unit Test 1', cls: '6th-A', subject: 'Mathematics', date: '2026-11-20', total: 100, deleted: true })`);
    const outbox = app.run(`sbOutboxLoad('sb-u1')`);
    const entry = outbox.find((e) => e.table === 'ss_exams' && e.key === 'ex1');
    assert.ok(entry, 'delete must be queued under the stored sbUid');
    assert.equal(entry.row.deleted, true);
    disarm(app);
  });

  it('with no sbUid anywhere (never linked) nothing is queued', () => {
    const app = appWithDom();
    app.run(`saveAccounts([{uid:'u2', name:'Local School', school:'Local School', email:'local@school.in', role:'school'}])`);
    app.run(`loginAs({uid:'u2', name:'Local School', school:'Local School', email:'local@school.in', role:'school'})`);
    app.run('state.sb = null;');
    app.run(`sbQueueExamChange58({ id: 'ex1', name: 'Unit Test 1', cls: '6th-A', subject: 'Mathematics', date: '2026-11-20', total: 100, deleted: true })`);
    assert.equal(app.run(`sbOutboxLoad('').length`), 0, 'nothing may queue without a Supabase uid');
    disarm(app);
  });

  it('examsPage picker lists active exams only; the deleted exam lives only in the restore card', () => {
    const app = loginSchool(appWithDom(), true);
    freshTwoStudents(app);
    app.run(`
      db.exams = [
        { id: 'exA', name: 'Unit Test 1', cls: '6th-A', subject: 'Mathematics', date: '2026-11-20', total: 100 },
        { id: 'exD', name: 'Old Deleted Test', cls: '6th-A', subject: 'Science', date: '2026-10-10', total: 100, deleted: true }
      ];
      state.examId = 'exA';
    `);
    const html = app.run('examsPage()');
    const selStart = html.indexOf('<select');
    const selEnd = html.indexOf('</select>', selStart);
    assert.ok(selStart !== -1 && selEnd !== -1, 'exam picker must render');
    assert.ok(!html.slice(selStart, selEnd).includes('Old Deleted Test'), 'deleted exam must not be in the picker');
    assert.ok(html.includes('Old Deleted Test'), 'deleted exam stays visible only in the Deleted exams restore card');
    assert.ok(html.includes(app.run(`t('examDeletedH')`)), 'restore card heading must render');
    disarm(app);
  });
});

describe('issue 16 — one collection, one receipt number', () => {
  it('receiptListCard collapses duplicate rows for one collection to the earliest number', () => {
    const app = loginSchool(appWithDom(), true);
    freshTwoStudents(app);
    app.run(`
      db.receipts = [
        { receiptNo: 'RCP-2026-008', studentId: 's1', name: 'Test Kumar', cls: '6th-A', month: 'Dec', date: '2026-12-05', total: 800, payMode: 'Cash', lines: [{ desc: 'Tuition (Dec)', type: 'Tuition', month: 'Dec', due: 800, con: 0, paid: 800, recordId: 'fee1' }] },
        { receiptNo: 'RCP-2026-006', studentId: 's1', name: 'Test Kumar', cls: '6th-A', month: 'Dec', date: '2026-12-05', total: 800, payMode: 'Cash', lines: [{ desc: 'Tuition (Dec)', type: 'Tuition', month: 'Dec', due: 800, con: 0, paid: 800, recordId: 'fee1' }] },
        { receiptNo: 'RCP-2026-009', studentId: 's1', name: 'Test Kumar', cls: '6th-A', month: 'Dec', date: '2026-12-06', total: 1600, payMode: 'Cash', lines: [{ desc: 'Tuition (Dec)', type: 'Tuition', month: 'Dec', due: 1600, con: 0, paid: 1600, recordId: 'fee2' }] }
      ];
    `);
    const html = app.run(`receiptListCard('s1')`);
    assert.ok(html.includes('RCP-2026-006'), 'earliest number of the duplicated collection must show');
    assert.ok(!html.includes('RCP-2026-008'), 'later duplicate number of the same collection must not show');
    assert.ok(html.includes('RCP-2026-009'), 'a genuinely different collection keeps its own row');
    disarm(app);
  });

  it('manual Add Fee refuses a duplicate student+month+type record', () => {
    const app = loginSchool(appWithDom(), true);
    freshTwoStudents(app);
    // Drive the form inputs the way the page does (getElementById
    // creates each stub element on first access).
    app.run(`
      document.getElementById('fFeeStudent').value = 's1';
      document.getElementById('fFeeAmount').value = '800';
      document.getElementById('fFeeType').value = 'Tuition';
      document.getElementById('fFeeMonth').value = 'Dec';
      document.getElementById('fFeeStatus').value = 'Pending';
      document.getElementById('fFeeDate').value = '2026-12-01';
      state.feeEditId = null;
    `);
    app.run(`saveFeeRecord({ preventDefault: function(){} })`);
    assert.equal(app.run('db.feeRecords.length'), 1, 'first add must land');
    app.run(`saveFeeRecord({ preventDefault: function(){} })`);
    assert.equal(app.run('db.feeRecords.length'), 1, 'second identical add must be refused');
    assert.equal(app.run(`__elsFix['toast'].textContent`), app.run(`t('tFeeDuplicate')`));
    disarm(app);
  });
});

describe('issue 17 — Average Attendance is marked days only', () => {
  it('studentStats().avgAtt is pooled over marked days; null when nothing is marked', () => {
    const app = loginSchool(appWithDom(), true);
    freshTwoStudents(app);
    // Nothing marked at all: no average exists — not 100% from att: 100.
    assert.equal(app.run('studentStats().avgAtt'), null);
    // One marked day, Absent: pooled 0/1 = 0 — the old mean of per-student
    // %s would have read (100 + 0) / 2 = 50.
    app.run(`db.attendance = { '2026-11-24|6th-A': { s2: 'Absent' } };`);
    assert.equal(app.run('studentStats().avgAtt'), 0);
    // s1 Present, s2 Absent over two days: pooled 1/2 = 50.
    app.run(`db.attendance = { '2026-11-24|6th-A': { s1: 'Present', s2: 'Absent' } };`);
    assert.equal(app.run('studentStats().avgAtt'), 50);
    // Late counts as attended, like Present.
    app.run(`db.attendance = { '2026-11-24|6th-A': { s1: 'Late', s2: 'Absent' } };`);
    assert.equal(app.run('studentStats().avgAtt'), 50);
    disarm(app);
  });

  it('studentsPage shows "—" for the average when nothing is marked, plus the definition note', () => {
    const app = loginSchool(appWithDom(), true);
    freshTwoStudents(app);
    const html = app.run('studentsPage()');
    const avgAt = html.indexOf(app.run(`t('stAvgAtt')`));
    assert.ok(avgAt !== -1, 'Average Attendance card must render');
    assert.ok(html.slice(avgAt, avgAt + 200).includes('>—<'), 'average must be a dash when nothing is marked');
    assert.ok(html.includes(app.run(`t('stAvgAttSub')`)), 'the card must explain how it is computed');
    disarm(app);
  });

  it('studentAttPct keeps its stored-value fallback for a single student', () => {
    const app = loginSchool(appWithDom(), true);
    freshTwoStudents(app);
    assert.equal(app.run(`studentAttPct(db.students[0])`), 100, 'per-student fallback (seed/import value) is unchanged');
    disarm(app);
  });
});

describe('version markers stay consistent (no bump in this branch)', () => {
  it('APP_VERSION, version.json and package.json all agree with version.json', () => {
    const app = createAppContext();
    const expected = JSON.parse(readFileSync(join(ROOT, 'version.json'), 'utf8')).version;
    assert.equal(app.get('APP_VERSION'), expected);
    assert.equal(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version, expected + '.0.0');
  });

  it('new i18n keys exist', () => {
    for (const key of ['dangerZone', 'dangerZoneSub', 'stAvgAttSub', 'tFeeDuplicate']) {
      assert.ok(I18N_SRC.includes(key + ':'), key + ' missing from i18n.js');
    }
  });

  it('every exam list filter goes through isActiveExam (or is the deleted-only restore card)', () => {
    // .filter(function…) is the listing shape; id lookups (.find by id)
    // and the rename sweep (.forEach) are not listings and are excluded.
    const filters = APP_SRC.match(/db\.exams\.filter\(function\s*\([^)]*\)\s*\{[^}]*\}/g) || [];
    assert.ok(filters.length >= 4, 'expected at least 4 exam list filters, found ' + filters.length);
    const bad = filters.filter((f) => !f.includes('isActiveExam') && !f.includes('deleted'));
    assert.deepEqual(bad, [], 'exam list filter without an active/deleted check: ' + bad.join(' | '));
  });
});
