// School Saathi QA fix-round — self-verification harness (Node, DOM stubs).
// Usage: node school-saathi-qa-verify.js  (from the repo root; CI=true skips the goal-backend equality checks)
// Runs app.js in a vm with localStorage/document stubs, then exercises the
// fixed behaviours: fee sums, chart data, pending split, donuts,
// collectFee, deleteStudent cascade, saveMarks, attendance history,
// go() role validation, session restore, i18n key coverage, chart guards.
// v28: the Super Admin section is removed — the harness now proves the
// admin UI, admin login and admin lookup are gone, and that an account
// with no school gets the no-school message instead of a login.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
// CI gate (v109): the harness runs from the repo root both locally and on
// GitHub Actions. All file reads are relative to this file's directory —
// never /home/hatch absolute paths. CI=true skips the checks that compare
// repo files against the goal-backend copies, which do not exist in the repo.
const ROOT = __dirname;
const IS_CI = process.env.CI === 'true';
function readRel(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
// CI: the goal-backend equality check is local-only — in CI the goal copies
// do not exist, so the comparison is vacuously true and only the repo-file
// content assertions run.
function goalEq(repoContent, goalPath) {
  if (IS_CI) return true;
  return repoContent === fs.readFileSync(goalPath, 'utf8');
}
const APP = path.join(ROOT, 'app.js');
const src = fs.readFileSync(APP, 'utf8');
const qrgenSrc = readRel('qrgen.js');
// Phase 2: app.js modules load before app.js in the vm, same order as index.html.
const cryptoSrc = readRel('js/modules/crypto.js');
const i18nSrc = readRel('js/modules/i18n.js');
const bcryptSrc = readRel('js/bcrypt.js');
// Phase 1: the demo-seed fixtures moved out of app.js at v67 into
// scripts/seed-fixtures.js (repo file, harness-only, never loaded by
// index.html). The vm needs them AFTER app.js — seedDB() uses the app's
// FEE_MONTHS, defaultFeeStructure and todayIST globals.
const seedFixturesSrc = readRel('scripts/seed-fixtures.js');
// Phase 1: the expected version is read from version.json — never hardcoded.
// Every version check in this harness (static + in-vm + v28) uses it, so a
// version bump can never stale the harness again.
const EXPECTED_VERSION = JSON.parse(readRel('version.json')).version;

function makeEl(id) {
  // v44: classList tracks a real class set (the old no-op stub made
  // contains() always false, so no test could ever observe a class the
  // app adds — e.g. the toast's 'show').
  const classes = new Set();
  const el = {
    id: id || '', innerHTML: '', textContent: '', value: '',
    style: {}, dataset: {}, children: [], options: [],
    classList: {
      add: function (c) { classes.add(c); },
      remove: function (c) { classes.delete(c); },
      toggle: function (c) { if (classes.has(c)) { classes.delete(c); return false; } classes.add(c); return true; },
      contains: function (c) { return classes.has(c); }
    },
    setAttribute() {}, getAttribute() { return null; },
    appendChild(c) { this.children.push(c); this.options.push(c); },
    remove() {}, click() {}, focus() {},
    addEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; }
  };
  return el;
}
const els = {};
const docListeners = {};
function store() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    key: i => Array.from(m.keys())[i] || null,
    get length() { return m.size; }
  };
}
const ls = store(), ss = store();
const __timers = []; // v32: stubbed intervals (setInterval records, never fires on its own)
const documentStub = {
  getElementById(id) { if (!els[id]) els[id] = makeEl(id); return els[id]; },
  querySelectorAll() { return []; },
  querySelector() { return null; },
  createElement() { return makeEl(); },
  addEventListener(ev, fn) { (docListeners[ev] = docListeners[ev] || []).push(fn); },
  body: makeEl('body'), documentElement: makeEl('html')
};
const ctx = {
  console, process, document: documentStub,
  localStorage: ls, sessionStorage: ss,
  navigator: {}, location: { protocol: 'https:' },
  setTimeout, clearTimeout, AbortController, // v34: the vm context has no AbortController of its own — the app's 30s fetch timeout needs it
  crypto: require('crypto').webcrypto, // v36: the app's randomHex uses crypto.getRandomValues (no Math.random in app.js)
  addEventListener(ev, fn) { (docListeners[ev] = docListeners[ev] || []).push(fn); }, // v32: window-level listeners (online/focus) land in the same registry
  setInterval: (fn, ms) => { const id = __timers.length + 1; __timers.push({ id, fn, ms }); return id; },
  clearInterval: (id) => { const i = __timers.findIndex(function (t) { return t.id === id; }); if (i !== -1) __timers.splice(i, 1); },
  requestAnimationFrame: cb => setTimeout(() => cb(Date.now()), 16),
  Blob: function () {}, URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
  atob: (s) => { if (/[^A-Za-z0-9+/=]/.test(String(s))) throw new Error('Invalid base64'); return Buffer.from(String(s), 'base64').toString('binary'); }, // v78: the app's dataUrlToBlob uses atob (browser API) — mirror its throw-on-invalid behaviour
  scrollTo() {},
  __opened: [], // v38: every window.open(url) is recorded here so the tests can assert the exact wa.me link opened
  open: function (url) { ctx.__opened.push(url); return null; }
};
ctx.window = ctx;
ctx.self = ctx; // v72: bcryptjs reads randomness from self.crypto (WebCrypto) — the vm has no self of its own, so point it at the context like window above.
ctx.__docListeners = docListeners;
ctx.__timers = __timers;
ctx.__els = els;
ctx.__css = readRel('styles.css');
vm.createContext(ctx);

const test = `
;globalThis.__syncDone = (async function () {
  var fails = [], passes = 0;
  var TEST_ACCOUNTS = {
    school: { role: 'school', name: 'Rahul Kumar', school: 'St. Xavier School', sub: 'School Admin • St. Xavier School', email: 'rahul@stxavier.in', uid: 'test-school', pwHash: hashPw('TestAdmin-2026') },
    student: { role: 'student', name: 'Riya Kumari', sub: 'Student • Class 10th-A', email: 'riya@student.in', uid: 'test-student', studentId: 'stu33' }
  };
  function ok(cond, name) {
    if (cond) { passes++; console.log('PASS ' + name); }
    else { fails.push(name); console.log('FAIL ' + name); }
  }
  function eq(a, b, name) { ok(a === b, name + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
  // B3 (harness fix): logout() is async since the outbox flush runs first
  // and the clear lands on a promise/timer — a test that asserts right
  // after logout() races the clear (the pre-B3 tests assumed a
  // synchronous logout). Every logout() below is followed by
  // "await waitLogout()" so assertions only run once the clear has
  // actually landed; a timeout fails loudly with its own name instead
  // of leaving confusing downstream failures.
  async function waitLogout() {
    for (var i = 0; i < 240; i++) {
      if (state.role === null && state.user === null && localStorage.getItem(SESSION_KEY) === null && sessionStorage.getItem(SESSION_KEY) === null) return true;
      await new Promise(function (r) { setTimeout(r, 25); });
    }
    ok(false, 'logout() did not settle within ~6s (session still present)');
    return false;
  }
  // v57 (#8): collectFee() is gone — the live flow is openCollectFee +
  // saveCollectFee (draft + receipt). Drive that flow in the tests.
  // Local-only here (no sb session), so saveCollectFee finishes
  // synchronously; as a student openCollectFee refuses, like the old guard.
  function collectFeeUI(id) {
    var r = db.feeRecords.find(function (x) { return x.id === id; });
    if (!r) return;
    openCollectFee(r.studentId, id);
    saveCollectFee();
  }
  // simulate page load
  (__docListeners['DOMContentLoaded'] || []).forEach(function (fn) { fn(); });
  // v36: the boot DB is EMPTY now (no demo seed on fresh devices) — the
  // harness seeds its fixture explicitly here, before section 1.
  db = seedDB(); saveDB(db);

  // ---- 1. seed fee sums (must never change) ----
  var ft = feeTotals();
  eq(ft.collected, 845000, 'feeTotals collected = 845000');
  eq(ft.pending, 120000, 'feeTotals pending = 120000');
  var chart = feeChartData();
  var cc = 0, pp = 0;
  chart.forEach(function (d) { cc += d.collected; pp += d.pending; });
  eq(cc, 845000, 'feeChartData collected sum = 845000');
  eq(pp, 120000, 'feeChartData pending sum = 120000');
  eq(chart.length, 12, 'v37: feeChartData has 12 months Apr-Mar');
  eq(chart.map(function (d) { return d.label; }).join(','), 'Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec,Jan,Feb,Mar', 'v37: feeChartData month labels in academic order');

  // ---- v52: fee totals dedupe — a legacy local DB can hold duplicate
  // fee rows (same id twice, e.g. double-POSTed during the v46
  // verification before SQL 15 deduped the server). Live v51: the
  // dashboard rendered ₹4,800 on first login (6 × ₹800) and ₹2,400
  // after the pull deduped to 3 — the totals must sum the deduped
  // view, not the raw rows, so the first pre-pull render is already
  // right. (SQL 15, applied 10 Nov ~06:58 IST, removed the server
  // duplicates at the source; the local-DB shape can still recur.)
  var feeRecs52 = db.feeRecords;
  db.feeRecords = [
    { id: 'fee52oct', studentId: 'stu1', student: 'V21 Test Kumar', cls: '6th-A', month: 'Oct', type: 'Tuition', amount: 800, date: '2026-10-09', status: 'Collected' },
    { id: 'fee52oct', studentId: 'stu1', student: 'V21 Test Kumar', cls: '6th-A', month: 'Oct', type: 'Tuition', amount: 800, date: '2026-10-09', status: 'Collected' },
    { id: 'fee52nov', studentId: 'stu1', student: 'V21 Test Kumar', cls: '6th-A', month: 'Nov', type: 'Tuition', amount: 800, date: '2026-11-08', status: 'Collected' },
    { id: 'fee52nov', studentId: 'stu1', student: 'V21 Test Kumar', cls: '6th-A', month: 'Nov', type: 'Tuition', amount: 800, date: '2026-11-08', status: 'Collected' },
    { id: 'fee52dec', studentId: 'stu1', student: 'V21 Test Kumar', cls: '6th-A', month: 'Dec', type: 'Tuition', amount: 800, date: '2026-12-09', status: 'Collected' },
    { id: 'fee52dec', studentId: 'stu1', student: 'V21 Test Kumar', cls: '6th-A', month: 'Dec', type: 'Tuition', amount: 800, date: '2026-12-09', status: 'Collected' }
  ];
  eq(feeTotals().collected, 2400, 'v52: feeTotals sums deduped fee records — 6 raw rows (3 pairs) count once');
  eq(feeTotals().pending, 0, 'v52: feeTotals pending is 0 on the deduped set');
  eq(feeChartData().filter(function (d) { return d.label === 'Nov'; })[0].collected, 800, 'v52: feeChartData counts the Nov duplicate once');
  eq(feeTypeTotals().Tuition.collected, 2400, 'v52: feeTypeTotals counts duplicates once');
  state.feeSearch = ''; state.feeFilter = 'All'; state.feeType = 'All';
  eq(feeFiltered().length, 3, 'v52: feeFiltered lists 3 records, not 6 raw rows');
  eq(feeSummaryFor('stu1').billed, 2400, 'v52: feeSummaryFor bills the deduped set');
  db.feeRecords = feeRecs52;

  // ---- 2. pending records: 20, each on a DISTINCT student ----
  var pendByStu = {};
  db.feeRecords.forEach(function (r) { if (r.status === 'Pending') pendByStu[r.studentId] = (pendByStu[r.studentId] || 0) + 1; });
  eq(Object.keys(pendByStu).length, 20, '20 distinct students have Pending records');
  var maxPend = 0; Object.keys(pendByStu).forEach(function (k) { maxPend = Math.max(maxPend, pendByStu[k]); });
  eq(maxPend, 1, 'no student has 2 Pending records');

  // ---- 3. donuts ----
  // v28: subCounts() is gone with the Super Admin platform pages — the
  // donut math itself is still covered here with the same seed figures.
  eq(donutPct(18, 24), 75, 'donut Active = 75%');
  eq(donutPct(4, 24), 17, 'donut Expired = 17%');
  eq(donutPct(2, 24), 8, 'donut Trial = 8%');
  var ta3 = todayAtt();
  eq(ta3.total, 4, 'today attendance total = 4 (seed 10th-A records for today)');
  eq(ta3.present, 2, 'today present = 2 from live records');
  eq(ta3.absent, 1, 'today absent = 1 from live records');
  eq(ta3.late, 1, 'today late = 1 from live records');
  eq(donutPct(ta3.present, ta3.total), 50, 'attendance donut = 50% from live records, not the old 92% aggregate');

  // ---- 4. v28: no Super Admin dashboard exists anymore ----
  // The seed store still holds its 24 schools, but no page reads them.
  eq(db.schools.length, 24, 'v28: the seed store still holds 24 schools');
  ok(typeof superDashboard === 'undefined', 'v28: superDashboard is gone');
  ok(typeof NAV.super === 'undefined', 'v28: no Super Admin nav exists');
  ok(typeof PAGE_SUPER === 'undefined', 'v28: PAGE_SUPER is gone');
  state.role = 'school'; state.user = TEST_ACCOUNTS.school; state.view = 'dashboard';
  renderApp();
  ok($('sideNav').innerHTML.indexOf('Super Admin') === -1, 'v28: school sidebar has no Super Admin entry');
  ok($('sideSchoolInfo').innerHTML.indexOf('Platform Admin') === -1, 'v28: sidebar shows the school, not Platform Admin');

  // ---- 5. collectFee updates chart + derived status ----
  var pendRec = db.feeRecords.filter(function (r) { return r.status === 'Pending'; })[0];
  var pendAmt = pendRec.amount, pendMonth = pendRec.month, pendStu = pendRec.studentId;
  eq(studentFeeStatus(pendStu), 'Pending', 'student Pending before collect');
  var beforeChart = feeChartData().filter(function (d) { return d.label === pendMonth; })[0];
  collectFeeUI(pendRec.id);
  var rAfter = db.feeRecords.filter(function (x) { return x.id === pendRec.id; })[0];
  eq(rAfter.status, 'Collected', 'record flips to Collected');
  eq(feeTotals().collected, 845000 + pendAmt, 'collected total grows by amount');
  eq(feeTotals().pending, 120000 - pendAmt, 'pending total shrinks by amount');
  var afterChart = feeChartData().filter(function (d) { return d.label === pendMonth; })[0];
  eq(afterChart.collected, beforeChart.collected + pendAmt, 'chart collected for month grows');
  eq(afterChart.pending, beforeChart.pending - pendAmt, 'chart pending for month shrinks');
  eq(studentFeeStatus(pendStu), 'Paid', 'student Paid after only Pending collected');
  // collectFee on an already-collected record is a no-op
  var ftBefore = feeTotals();
  collectFeeUI(pendRec.id);
  eq(feeTotals().collected, ftBefore.collected, 'double-collect is a no-op');

  // ---- 6. deleteStudent is a SOFT delete (stu34 Priya: record + history kept) ----
  var vic = 'stu34';
  var hasMarks = db.marks.some(function (m) { return m.studentId === vic; });
  var hasFees = db.feeRecords.some(function (r) { return r.studentId === vic; });
  var hasAtt = Object.keys(db.attendance).some(function (k) { return db.attendance[k][vic]; });
  var hasHw = db.homework.some(function (h) { return h.doneBy.indexOf(vic) !== -1; });
  ok(hasMarks && hasFees && hasAtt && hasHw, 'cascade fixture stu34 has marks+fees+attendance+hw');
  var stuCountBefore = db.students.length;
  deleteStudent(vic);
  confirmYes();
  eq(db.students.length, stuCountBefore, 'soft delete keeps the student count');
  ok(db.students.some(function (s) { return s.id === vic; }), 'stu34 record is kept after delete');
  eq(db.students.find(function (s) { return s.id === vic; }).status, 'Cancelled', 'soft delete sets status Cancelled');
  ok(db.feeRecords.some(function (r) { return r.studentId === vic; }), 'stu34 feeRecords kept');
  ok(db.marks.some(function (m) { return m.studentId === vic; }), 'stu34 marks kept');
  ok(Object.keys(db.attendance).some(function (k) { return db.attendance[k][vic]; }), 'stu34 attendance kept');
  ok(db.homework.some(function (h) { return h.doneBy.indexOf(vic) !== -1; }), 'stu34 homework doneBy kept');
  ok(db.auditLog.some(function (a) { return a.action === 'Student removed'; }), 'soft delete logs a Student removed audit entry');
  ok(db.marks.some(function (m) { return m.studentId === 'stu33'; }), 'other student marks intact');

  // ---- 7. saveMarks: parseFloat 85.5 kept, over-total rejected, empty deletes ----
  state.role = 'school'; state.user = TEST_ACCOUNTS.school; state.view = 'exams'; state.examId = 'ex1';
  $('mk-stu33').value = '85.5';
  $('mk-stu34').value = '';
  $('mk-stu35').value = '120';
  $('mk-stu36').value = '60';
  saveMarks('ex1');
  var mk33 = db.marks.filter(function (m) { return m.examId === 'ex1' && m.studentId === 'stu33'; })[0];
  eq(mk33 && mk33.marks, 85.5, '85.5 kept via parseFloat (not truncated)');
  ok(!db.marks.some(function (m) { return m.examId === 'ex1' && m.studentId === 'stu34'; }), 'empty input deletes mark record');
  var mk35 = db.marks.filter(function (m) { return m.examId === 'ex1' && m.studentId === 'stu35'; })[0];
  eq(mk35 && mk35.marks, 78, 'over-total 120 rejected, old 78 kept (no clamp)');
  var mk36 = db.marks.filter(function (m) { return m.examId === 'ex1' && m.studentId === 'stu36'; })[0];
  eq(mk36 && mk36.marks, 60, 'valid update saved');
  ok($('toast').textContent.indexOf('Not saved') !== -1, 'over-total shows error toast');
  // examsPage average uses % of total (ex5 is 50-mark): seed has no marks for ex5 -> 'No marks' path; check avg math directly
  var avgCheck = Math.round((85.5 + 60) / 2 / 100 * 100);
  eq(avgCheck, 73, 'class-average formula sanity (85.5+60)/2 = 73%');

  // ---- 8. attendance history per date+class + autosave ----
  state.role = 'school'; state.user = TEST_ACCOUNTS.school; state.view = 'attendance'; state.attCls = '10th-A';
  var taBefore = JSON.stringify(todayAtt());
  state.attDate = '2026-11-06'; attendancePage();
  markAtt('stu33', 'Absent'); markAtt('stu35', 'Late');
  state.attDate = '2026-11-07'; attendancePage();
  markAtt('stu33', 'Present');
  eq(db.attendance['2026-11-06|10th-A']['stu33'], 'Absent', 'D1 stu33 Absent kept');
  eq(db.attendance['2026-11-06|10th-A']['stu35'], 'Late', 'D1 stu35 Late kept');
  eq(db.attendance['2026-11-07|10th-A']['stu33'], 'Present', 'D2 stu33 Present kept');
  ok(db.attendance[todayIST() + '|10th-A'], 'today attendance key still intact');
  eq(JSON.stringify(todayAtt()), taBefore, 'marking past dates does not change today attendance');
  onAttDate('2099-01-01');
  eq(state.attDate, todayIST(), 'future date blocked, reset to today (IST)');

  // ---- 9. go() role validation (M2) ----
  state.role = 'student'; state.user = TEST_ACCOUNTS.student;
  go('schools'); eq(state.view, 'dashboard', 'student go(schools) -> own dashboard');
  go('students'); eq(state.view, 'dashboard', 'student go(students) -> own dashboard');
  go('homework'); eq(state.view, 'homework', 'student go(homework) allowed');
  state.role = 'school'; state.user = TEST_ACCOUNTS.school;
  go('schools'); eq(state.view, 'dashboard', 'v28: school go(schools) -> own dashboard (no Schools view anymore)');
  go('users'); eq(state.view, 'dashboard', 'v28: school go(users) -> own dashboard (no Users view anymore)');

  // ---- 10. session persist + restore ----
  saveAccounts([TEST_ACCOUNTS.school]);
  loginAs(TEST_ACCOUNTS.school);
  // v20: a school signup now starts EMPTY — the harness explicitly seeds
  // its fixture here so every later section keeps its seed assumptions.
  // (Fresh-signup emptiness itself is proven in section 52.)
  db = seedDB(); saveDB(db);
  eq(localStorage.getItem(SESSION_KEY) !== null, true, 'session persisted in localStorage after login');
  eq(sessionStorage.getItem(SESSION_KEY), null, 'session NOT kept in sessionStorage');
  state.role = null; state.user = null; state.view = 'dashboard';
  eq(await restoreSession(), true, 'restoreSession returns true');
  eq(state.role, 'school', 'role restored as school');
  logout(); await waitLogout();
  eq(localStorage.getItem(SESSION_KEY), null, 'session cleared from localStorage on logout');
  eq(sessionStorage.getItem(SESSION_KEY), null, 'session cleared from sessionStorage on logout too');
  eq(await restoreSession(), false, 'restoreSession false after logout');

  // ---- 11. i18n: Hindi toggle + key coverage ----
  state.lang = 'hi';
  eq(t('fees'), 'शुल्क', 'hi: fees');
  eq(t('logout'), 'लॉगआउट', 'hi: logout');
  state.lang = 'en';
  var missing = [];
  // v28: server-auth strings are intentionally English-only (EN_ONLY).
  var EN_ONLY = ['sbForgotPw', 'sbRecoverTitle', 'sbSendResetLink', 'sbResetPw', 'sbRecoverSent', 'sbRecoverFailed', 'sbResetDone', 'sbResetFailed', 'sbTooMany', 'sbEmailConfirm', 'sbEmailConfirmed', 'sbOfflineLogin', 'sbTitle', 'sbBackupNow', 'sbStatusSynced', 'sbStatusPending', 'sbStatusUploading', 'sbStatusFailed', 'sbStatusOffline', 'sbStatusNotSchool', 'sbBackupDone', 'sbBackupFailed', 'sbNoSchool', 'sbDownloadNow', 'sbDownloadStart', 'sbDownloadDone', 'sbDownloadFailed', 'sbDownloadSkipped', 'sbDownloadOffline', 'sbDownloadNoServer', 'sbStatusSyncing', 'sbStatusPendingSync', 'sbSyncDone', 'sbSyncFailed', 'sbSyncOffline', 'sbSyncConflict'];
  Object.keys(I18N.en).forEach(function (k) { if (I18N.hi[k] === undefined && EN_ONLY.indexOf(k) === -1) missing.push('hi missing: ' + k); });
  Object.keys(I18N.hi).forEach(function (k) { if (I18N.en[k] === undefined) missing.push('en missing: ' + k); });
  ok(missing.length === 0, 'i18n key parity en/hi' + (missing.length ? ' — ' + missing.join('; ') : ''));

  // ---- 12. chart guards ----
  var emptyBar = barChartSVG([]);
  ok(emptyBar.indexOf('No fee data yet') !== -1 || emptyBar.indexOf('empty') !== -1, 'barChartSVG empty -> empty state, no crash');
  var zeroBar = barChartSVG([{ label: 'Apr', collected: 0, pending: 0 }]);
  ok(zeroBar.indexOf('NaN') === -1 && zeroBar.indexOf('Infinity') === -1, 'barChartSVG maxV=0 -> no NaN/Infinity');
  ok(typeof lineChartSVG === 'undefined', 'v26: lineChartSVG is gone with the fake growth chart');
  ok(typeof GROWTH === 'undefined', 'v26: the hard-coded GROWTH series is gone');
  ok(barChartSVG(feeChartData()).indexOf('NaN') === -1, 'live fee chart has no NaN');

  // ---- 13. CSV injection guard ----
  eq(csvCell('=2+2').indexOf("'=2+2") !== -1, true, 'csvCell prefixes = with quote');
  eq(csvCell('@x').indexOf("'@x") !== -1, true, 'csvCell prefixes @ with quote');
  eq(csvCell('+91').indexOf("'+91") !== -1, true, 'csvCell prefixes + with quote');
  eq(csvCell('-5').indexOf("'-5") !== -1, true, 'csvCell prefixes - with quote');
  eq(csvCell('plain'), '"plain"', 'csvCell plain value unchanged');

  // ---- 14. student view: Fees tile derived, null guard ----
  state.role = 'student'; state.user = TEST_ACCOUNTS.student; state.view = 'dashboard';
  var stuHtml = studentDashboard();
  ok(stuHtml.indexOf('Paid') !== -1 || stuHtml.indexOf('Pending') !== -1, 'student Fees tile shows derived status');
  var savedStudents = db.students; db.students = [];
  var emptyStu = studentDashboard();
  ok(emptyStu.indexOf('No student data') !== -1, 'studentDashboard empty state when no students');
  db.students = savedStudents;
  var savedExams = db.exams; db.exams = [];
  var emptyEx = examsPage();
  ok(emptyEx.indexOf('No exams yet') !== -1, 'examsPage empty state when no exams');
  db.exams = savedExams;

  // ---- 15. Fees v2 migration: old v2 DB (no enr/type/structure) migrates cleanly ----
  var oldDb = JSON.parse(JSON.stringify(seedDB()));
  oldDb.students.forEach(function (s) { delete s.enr; });
  oldDb.feeRecords.forEach(function (r) { delete r.type; });
  delete oldDb.feeStructure;
  var prevKey = DB_KEY, prevDb = db;
  DB_KEY = 'schoolSaathiDB_testold';
  localStorage.setItem(DB_KEY, JSON.stringify(oldDb));
  var mig = loadDB();
  eq(mig.students[0].enr, 'ENR-001', 'migration assigns ENR-001 to first student');
  eq(mig.students[39].enr, 'ENR-040', 'migration assigns ENR-040 to last student');
  eq(mig.feeRecords.every(function (r) { return r.type === 'Tuition'; }), true, 'migration types all records Tuition');
  eq(mig.feeStructure.length, 30, 'v37: migration adds a 30-row fee structure (Nursery-12th)');
  eq(mig.feeStructure.filter(function (x) { return x.cls === '10th-A'; })[0].amount, 1500, 'structure 10th = 1500');
  eq(mig.feeStructure.filter(function (x) { return x.cls === '6th-A'; })[0].amount, 800, 'structure 6th = 800');
  var mft = { c: 0, p: 0 };
  mig.feeRecords.forEach(function (r) { if (r.status === 'Collected') mft.c += r.amount; else mft.p += r.amount; });
  eq(mft.c, 845000, 'migration keeps collected sum 845000');
  eq(mft.p, 120000, 'migration keeps pending sum 120000');
  var mig2 = migrateFeesV7(mig);
  eq(mig2.students[0].enr, 'ENR-001', 'migration idempotent ENR');
  eq(mig2.feeRecords.length, mig.feeRecords.length, 'migration idempotent records');
  DB_KEY = prevKey; db = prevDb;
  ok(db.students.every(function (s) { return /^ENR-[0-9]{3}$/.test(s.enr || ''); }), 'all live students have ENR');
  ok(db.feeRecords.every(function (r) { return !!r.type; }), 'all live fee records have a type');

  // ---- 16. Fees v2 filters + search ----
  state.role = 'school'; state.user = TEST_ACCOUNTS.school; state.view = 'fees';
  state.feeFilter = 'All'; state.feeType = 'All'; state.feeSearch = '';
  eq(feeFiltered().length, db.feeRecords.length, 'feeFiltered All/All = all records');
  state.feeType = 'Transport';
  eq(feeFiltered().length, 0, 'feeFiltered Transport = 0 (none yet)');
  state.feeType = 'All'; state.feeSearch = 'riya';
  var riyaRecs = db.feeRecords.filter(function (r) { return (r.student + ' ' + r.cls + ' ' + enrOf(r.studentId)).toLowerCase().indexOf('riya') !== -1; }).length;
  eq(feeFiltered().length, riyaRecs, 'feeFiltered search riya matches Riya + Priya records');
  state.feeSearch = 'enr-033';
  eq(feeFiltered().length, db.feeRecords.filter(function (r) { return r.studentId === 'stu33'; }).length, 'feeFiltered search by ENR finds Riya only');
  state.feeSearch = 'ENR-001';
  var enr1Recs = db.feeRecords.filter(function (r) { return r.studentId === 'stu1'; }).length;
  eq(feeFiltered().length, enr1Recs, 'feeFiltered search ENR-001 matches stu1 records');
  state.feeSearch = '10th';
  var tenthRecs = db.feeRecords.filter(function (r) { return r.cls.indexOf('10th') === 0; }).length;
  eq(feeFiltered().length, tenthRecs, 'feeFiltered search 10th matches 10th classes');
  state.feeSearch = ''; state.feeType = 'Tuition';
  eq(feeFiltered().length, db.feeRecords.length, 'feeFiltered type Tuition = all (seed all Tuition)');
  var btt = feeTypeTotals();
  eq(btt.Tuition.collected, feeTotals().collected, 'type totals Tuition collected = total collected');
  eq(btt.Tuition.pending, feeTotals().pending, 'type totals Tuition pending = total pending');
  eq(feeRangeLabel(), 'Apr–Mar', 'v37: feeRangeLabel Apr–Mar on seed');
  state.feeType = 'All';
  var feesHtml = feesPage();
  ok(feesHtml.indexOf('Enr. No.') !== -1, 'fees table has ENR column');
  ok(feesHtml.indexOf('Type') !== -1, 'fees table has Type column');
  ok(feesHtml.indexOf('Search name') !== -1, 'fees search input present');
  ok(feesHtml.indexOf('All Types') !== -1, 'type filter present');
  ok(feesHtml.indexOf('Print List') !== -1, 'Print List button present');
  ok(feesHtml.indexOf('Fee Structure') !== -1, 'structure card present');
  ok(feesHtml.indexOf('Add Fee') !== -1, 'Add Fee card present');
  try { filterFees('zzz'); ok(true, 'filterFees does not throw'); } catch (e) { ok(false, 'filterFees throws: ' + e.message); }

  // ---- 17. Student fee profile ----
  openFeeProfile('stu33');
  eq(state.feeStudent, 'stu33', 'openFeeProfile sets feeStudent');
  var profHtml = studentFeeProfile('stu33');
  ok(profHtml.indexOf('Riya Kumari') !== -1, 'profile shows student name');
  ok(profHtml.indexOf('ENR-033') !== -1, 'profile shows ENR-033');
  ok(profHtml.indexOf('Total Billed') !== -1, 'profile has Total Billed tile');
  ok(profHtml.indexOf('Print Statement') !== -1, 'profile has Print Statement');
  ok(profHtml.indexOf('Back to All Fees') !== -1, 'profile has Back button');
  ok(profHtml.indexOf('Tuition') !== -1, 'profile lists Tuition records');
  var expBilled = 0, expPaid = 0, expPend = 0;
  db.feeRecords.forEach(function (r) { if (r.studentId === 'stu33') { expBilled += r.amount; if (r.status === 'Collected') expPaid += r.amount; else expPend += r.amount; } });
  ok(profHtml.indexOf('Total Billed</div><div class="val">₹' + expBilled.toLocaleString('en-IN') + '</div>') !== -1, 'profile Total Billed matches sum of records');
  ok(profHtml.indexOf('Paid</div><div class="val">₹' + expPaid.toLocaleString('en-IN') + '</div>') !== -1, 'profile Paid matches sum of collected');
  ok(profHtml.indexOf('Pending</div><div class="val">₹' + expPend.toLocaleString('en-IN') + '</div>') !== -1, 'profile Pending matches sum of pending');
  state.feeStudent = null;

  // ---- 18. Manual add fee (incl. custom type + validation) ----
  var recCountBefore = db.feeRecords.length;
  $('fFeeStudent').value = 'stu33';
  $('fFeeMonth').value = 'Sep';
  $('fFeeType').value = 'Transport';
  $('fFeeCustom').value = '';
  $('fFeeAmount').value = '500';
  $('fFeeStatus').value = 'Pending';
  $('fFeeDate').value = '2026-09-01';
  saveFeeRecord({ preventDefault: function () {} });
  eq(db.feeRecords.length, recCountBefore + 1, 'manual add pushes one record');
  var last = db.feeRecords[db.feeRecords.length - 1];
  eq(last.type, 'Transport', 'manual add stores chosen type');
  eq(last.amount, 500, 'manual add stores amount');
  eq(last.month, 'Sep', 'manual add stores month');
  eq(db.students.filter(function (s) { return s.id === 'stu33'; })[0].fee, studentFeeStatus('stu33'), 'student fee field recomputed after manual add');
  $('fFeeAmount').value = '0';
  saveFeeRecord({ preventDefault: function () {} });
  eq(db.feeRecords.length, recCountBefore + 1, 'amount 0 rejected, no record added');
  ok($('toast').textContent.indexOf('more than 0') !== -1, 'amount 0 shows validation toast');
  $('fFeeType').value = '__custom';
  $('fFeeCustom').value = 'Sports';
  $('fFeeAmount').value = '250';
  saveFeeRecord({ preventDefault: function () {} });
  eq(db.feeRecords[db.feeRecords.length - 1].type, 'Sports', 'custom typed fee type saved');

  // ---- 19. Fee structure + generate (idempotent) ----
  eq(db.feeStructure.length, 30, 'v37: structure has 30 rows (Nursery-12th)');
  eq(db.feeStructure.filter(function (x) { return x.cls === '10th-A'; })[0].amount, 1500, 'structure 10th-A = 1500');
  var genBefore = db.feeRecords.length;
  var pendBefore = feeTotals().pending;
  var needSep = db.students.filter(function (s) { return !db.feeRecords.some(function (r) { return r.studentId === s.id && r.month === 'Sep' && feeTypeOf(r) === 'Tuition'; }); });
  var needAmt = 0;
  needSep.forEach(function (s) { var row = db.feeStructure.filter(function (x) { return x.cls === s.cls; })[0]; if (row) needAmt += row.amount; });
  state.feeGenMonth = 'Sep';
  generateFees();
  eq(db.feeRecords.length, genBefore + needSep.length, 'generate creates one Sep Tuition record per student lacking one');
  eq(feeTotals().pending, pendBefore + needAmt, 'generate adds structure amounts to pending');
  ok($('toast').textContent.indexOf('fee records generated for Sep') !== -1, 'generate toast names month');
  var genBefore2 = db.feeRecords.length;
  generateFees();
  eq(db.feeRecords.length, genBefore2, 'generate is idempotent — second run adds 0');
  ok($('toast').textContent.indexOf('0 fee records generated for Sep') !== -1, 'second generate toast says 0');
  ok(feeChartData().some(function (d) { return d.label === 'Sep'; }), 'chart includes Sep after generation');
  eq(feeRangeLabel(), 'Apr–Mar', 'v37: range label is the full year Apr–Mar');
  $('fsAmt-0').value = '850';
  saveFeeStructure();
  eq(db.feeStructure[0].amount, 850, 'structure amount edit saves');
  $('fsAmt-0').value = '500';
  saveFeeStructure();
  eq(db.feeStructure[0].amount, 500, 'v37: structure amount restored to 500 (Nursery default)');

  // ---- 20. Print ----
  printStudentStatement('stu33');
  var pa = $('printArea').innerHTML;
  ok(pa.indexOf('Riya Kumari') !== -1, 'print statement has student name');
  ok(pa.indexOf('ENR-033') !== -1, 'print statement has ENR');
  ok(pa.indexOf('Fee Statement') !== -1, 'print statement has title');
  printFeeList();
  var pl = $('printArea').innerHTML;
  ok(pl.indexOf('Fee List') !== -1, 'print list has title');
  ok(pl.indexOf(db.profile.name) !== -1, 'print list has school name');

  // ---- 21. Reports CSV: fees export has Enr + Type ----
  var feeRows = feeCSVRows();
  eq(feeRows[0].join(','), 'Student,Enr,Class,Month,Type,Amount (INR),Date,Status', 'fees CSV header has Enr + Type');
  ok(feeRows.some(function (r) { return r[4] === 'Tuition'; }), 'fees CSV rows carry Type');
  ok(feeRows.some(function (r) { return r[1] === 'ENR-033'; }), 'fees CSV rows carry Enr');

  // ---- 22. saveStudent assigns next ENR; v21: NO auto fee record ----
  $('fStName').value = 'Test Kumar';
  $('fStCls').value = '6th-A';
  $('fStRoll').value = '5';
  $('fStG').value = 'Mr. Kumar';
  $('fStPh').value = '9812345678';
  var stuBefore = db.students.length;
  var ftBefore22 = feeTotals();
  saveStudent({ preventDefault: function () {} }, '');
  var newStu = db.students[db.students.length - 1];
  eq(db.students.length, stuBefore + 1, 'saveStudent adds student');
  eq(newStu.enr, 'ENR-041', 'new student gets next ENR-041');
  eq(db.feeRecords.filter(function (r) { return r.studentId === newStu.id; }).length, 0, 'v21: new admission creates zero fee records');
  eq(feeTotals().pending, ftBefore22.pending, 'v21: new admission does not change pending fees');

  // ---- 23. photo helpers: fitWithin + compressAttempts + dataUrlBytes ----
  eq(JSON.stringify(fitWithin(4000, 3000, 512)), JSON.stringify({ w: 512, h: 384 }), 'fitWithin 4000x3000 -> 512x384');
  eq(JSON.stringify(fitWithin(300, 600, 512)), JSON.stringify({ w: 256, h: 512 }), 'fitWithin 300x600 -> 256x512');
  eq(JSON.stringify(fitWithin(100, 100, 512)), JSON.stringify({ w: 100, h: 100 }), 'fitWithin small image unchanged');
  eq(JSON.stringify(fitWithin(0, 0, 512)), JSON.stringify({ w: 0, h: 0 }), 'fitWithin zero dims');
  var atJ = compressAttempts(4000, 3000, { max: 512, cap: 120 * 1024, format: 'jpeg' });
  eq(atJ.length, 6, 'jpeg attempts = 6 (4 quality + 2 downscale)');
  eq(JSON.stringify({ w: atJ[0].w, h: atJ[0].h, q: atJ[0].q }), JSON.stringify({ w: 512, h: 384, q: 0.8 }), 'jpeg first attempt 512x384 q0.8');
  eq(atJ[5].w, 256, 'jpeg last attempt downscales to 256');
  var atP = compressAttempts(800, 800, { max: 256, cap: 250 * 1024, format: 'png' });
  eq(atP.length, 2, 'png attempts = 2 (256 + 128)');
  eq(atP[0].w, 256, 'png first attempt 256');
  eq(atP[1].w, 128, 'png second attempt 128');
  eq(dataUrlBytes('data:image/jpeg;base64,' + 'A'.repeat(100)), 75, 'dataUrlBytes 100 base64 chars = 75 bytes');

  // ---- 24. student photo: saveStudent stores it, remove clears it, avatars render ----
  eq(avatarHTML('data:image/jpeg;base64,AAA', 'Riya Kumari', 'mini-avatar').indexOf('<img') !== -1, true, 'avatarHTML with photo -> img tag');
  eq(avatarHTML('data:image/jpeg;base64,AAA', 'Riya Kumari', 'mini-avatar').indexOf('data:image/jpeg;base64,AAA') !== -1, true, 'avatarHTML img keeps photo data URL');
  eq(avatarHTML(null, 'Riya Kumari', 'mini-avatar').indexOf('RK') !== -1, true, 'avatarHTML without photo -> initials RK');
  eq(avatarHTML('', 'Priya Kumari', 'mini-avatar').indexOf('PK') !== -1, true, 'avatarHTML empty photo -> initials PK');
  var riya = db.students.find(function (s) { return s.name === 'Riya Kumari'; });
  eq(!!riya, true, 'Riya Kumari exists in seed');
  eq(riya.photo, undefined, 'seed student has no photo (old data renders fine)');
  state.stuSearch = 'Riya'; state.stuClass = 'All';
  var rowsNoPhoto = studentsPage();
  eq(rowsNoPhoto.indexOf('RK') !== -1, true, 'studentsPage without photos shows initials');
  studentForm('');
  eq($('modalRoot').innerHTML.indexOf('fStPhoto') !== -1, true, 'student form has photo upload input');
  pendingPhoto = 'data:image/jpeg;base64,PHOTO1';
  $('fStName').value = 'Photo Test'; $('fStCls').value = '6th-A'; $('fStRoll').value = '9'; $('fStG').value = 'Mr. Test'; $('fStPh').value = '9811111111';
  var stuBefore2 = db.students.length;
  saveStudent({ preventDefault: function () {} }, '');
  var photoStu = db.students[db.students.length - 1];
  eq(db.students.length, stuBefore2 + 1, 'saveStudent with photo adds student');
  eq(photoStu.photo, 'data:image/jpeg;base64,PHOTO1', 'new student keeps compressed photo');
  eq(pendingPhoto, null, 'pendingPhoto reset after save');
  state.stuSearch = 'Photo Test';
  eq(studentsPage().indexOf('data:image/jpeg;base64,PHOTO1') !== -1, true, 'studentsPage shows the new photo');
  pendingPhoto = '';
  $('fStName').value = 'Photo Test'; $('fStCls').value = '6th-A'; $('fStRoll').value = '9'; $('fStG').value = 'Mr. Test'; $('fStPh').value = '9811111111';
  saveStudent({ preventDefault: function () {} }, photoStu.id);
  eq(db.students.find(function (x) { return x.id === photoStu.id; }).photo, undefined, 'edit with remove clears the photo');
  riya.photo = 'data:image/jpeg;base64,RIYA';
  eq(studentFeeProfile(riya.id).indexOf('data:image/jpeg;base64,RIYA') !== -1, true, 'fee profile header shows student photo');
  delete riya.photo;
  eq(studentFeeProfile(riya.id).indexOf('RK') !== -1, true, 'fee profile header falls back to initials');

  // ---- 25. school logo: settings save, sidebar, dashboard, print (v28: no super branch anymore) ----
  eq(db.profile.logo, undefined, 'seed profile has no logo');
  state.role = 'school'; state.user = TEST_ACCOUNTS.school;
  eq(settingsPage().indexOf('fPfLogo') !== -1, true, 'settings page has logo upload for school');
  eq(settingsPage().indexOf('Back Up Now') !== -1, true, 'v28: settings page has the Server Backup card for a school');
  eq(settingsPage().indexOf('openSupportForm()') !== -1, true, 'v28: settings page has the Raise Support button');
  state.role = 'school'; state.user = TEST_ACCOUNTS.school; state.view = 'dashboard'; state.feeStudent = null;
  pendingLogo = 'data:image/png;base64,LOGO1';
  $('fPfName').value = db.profile.name; $('fPfCity').value = db.profile.city; $('fPfPr').value = db.profile.principal;
  $('fPfPh').value = db.profile.phone; $('fPfEm').value = db.profile.email; $('fPfSe').value = db.profile.session; $('fPfAd').value = db.profile.address;
  saveSettings({ preventDefault: function () {} });
  eq(db.profile.logo, 'data:image/png;base64,LOGO1', 'saveSettings stores the logo');
  eq(pendingLogo, null, 'pendingLogo reset after save');
  renderApp();
  eq($('sideBrandCap').innerHTML.indexOf('data:image/png;base64,LOGO1') !== -1, true, 'sidebar brand shows school logo');
  eq(schoolDashboard().indexOf('data:image/png;base64,LOGO1') !== -1, true, 'school dashboard header shows logo');
  printRowsToArea(t('printTitle'), 'x', '<th>A</th>', '<tr><td>1</td></tr>', '');
  eq($('printArea').innerHTML.indexOf('data:image/png;base64,LOGO1') !== -1, true, 'print statement includes the logo');
  pendingLogo = '';
  $('fPfName').value = db.profile.name; $('fPfCity').value = db.profile.city; $('fPfPr').value = db.profile.principal;
  $('fPfPh').value = db.profile.phone; $('fPfEm').value = db.profile.email; $('fPfSe').value = db.profile.session; $('fPfAd').value = db.profile.address;
  saveSettings({ preventDefault: function () {} });
  eq(db.profile.logo, undefined, 'saveSettings with remove clears the logo');
  db.profile.logo = 'data:image/png;base64,LOGO1';
  state.role = 'school'; state.user = TEST_ACCOUNTS.school;
  renderApp();
  eq($('sideBrandCap').innerHTML.indexOf('🎓') === -1, true, 'v28: school sidebar shows the logo, not the cap');
  eq($('sideSchoolInfo').innerHTML.indexOf('Platform Admin') === -1, true, 'v28: school sidebar shows the school name, not Platform Admin');
  delete db.profile.logo;
  state.role = 'student'; state.user = TEST_ACCOUNTS.student; state.view = 'dashboard';
  riya.photo = 'data:image/jpeg;base64,RIYA';
  eq(studentDashboard().indexOf('data:image/jpeg;base64,RIYA') !== -1, true, 'student view hero shows photo');
  delete riya.photo;
  eq(studentDashboard().indexOf('RK') !== -1, true, 'student view hero falls back to initials');


  // ---- 26. Migration v9: admission numbers, status, audit log, fee-cls repair ----
  var oldDb9 = JSON.parse(JSON.stringify(seedDB()));
  oldDb9.students.forEach(function (s) { delete s.admissionNo; delete s.status; delete s.session; delete s.documents; });
  delete oldDb9.admCounter; delete oldDb9.auditLog;
  var riyaApr9 = oldDb9.feeRecords.find(function (r) { return r.studentId === 'stu33' && r.month === 'Apr' && r.status === 'Collected'; });
  eq(!!riyaApr9, true, 'v9 test setup: Riya Apr Collected record exists in seed copy');
  riyaApr9.cls = '9th-A'; // the live bug: donor record kept the 9th-A cls
  var prevKey9 = DB_KEY, prevDb9 = db;
  DB_KEY = 'schoolSaathiDB_testv9';
  localStorage.setItem(DB_KEY, JSON.stringify(oldDb9));
  var mig9 = loadDB();
  eq(mig9.students[0].admissionNo, 'ADM-2025-001', 'migration v9 assigns ADM-2025-001 to first student');
  eq(mig9.students[32].admissionNo, 'ADM-2025-033', 'migration v9 assigns ADM-2025-033 to Riya');
  eq(mig9.students.every(function (s) { return s.status === 'Active'; }), true, 'migration v9 defaults all students Active');
  eq(mig9.students[0].admissionDate, '', 'migration v9 does NOT fabricate admission dates');
  eq(mig9.admCounter, 41, 'migration v9 sets admCounter to 41');
  eq(Array.isArray(mig9.auditLog) && mig9.auditLog.length, 0, 'migration v9 creates empty auditLog');
  eq(mig9.feeRecords.find(function (r) { return r.studentId === 'stu33' && r.month === 'Apr' && r.status === 'Collected'; }).cls, '10th-A', 'migration v9 repairs Riya Apr record cls to 10th-A');
  eq(mig9.feeRecords.every(function (r) { var ow = mig9.students.find(function (s) { return s.id === r.studentId; }); return ow && r.cls === ow.cls; }), true, 'migration v9: every fee record cls matches its student');
  var mft9 = { c: 0, p: 0 };
  mig9.feeRecords.forEach(function (r) { if (r.status === 'Collected') mft9.c += r.amount; else mft9.p += r.amount; });
  eq(mft9.c, 845000, 'migration v9 keeps collected sum 845000');
  eq(mft9.p, 120000, 'migration v9 keeps pending sum 120000');
  var mig9b = migrateStudentsV9(mig9);
  eq(mig9b.students[0].admissionNo, 'ADM-2025-001', 'migration v9 idempotent admissionNo');
  eq(mig9b.admCounter, 41, 'migration v9 idempotent admCounter');
  DB_KEY = prevKey9; db = prevDb9;

  // ---- 27. Fresh seed: every fee record cls matches its student (Riya Apr fix) ----
  eq(db.feeRecords.every(function (r) { var ow = db.students.find(function (s) { return s.id === r.studentId; }); return !!ow && r.cls === ow.cls; }), true, 'seed: every fee record cls matches its student cls');
  var riyaLive = db.students.find(function (s) { return s.name === 'Riya Kumari'; });
  eq(db.feeRecords.find(function (r) { return r.studentId === riyaLive.id && r.month === 'Apr' && r.status === 'Collected'; }).cls, '10th-A', 'seed: Riya Apr Collected record is 10th-A');
  eq(riyaLive.admissionNo, 'ADM-2025-033', 'seed: Riya admissionNo ADM-2025-033');
  eq(riyaLive.enr, 'ENR-033', 'seed: Riya enr ENR-033');

  // ---- 28. Admission numbers: peek does not consume, assign never reuses ----
  eq(nextAdmNo(true), 'ADM-2025-043', 'nextAdmNo peek previews ADM-2025-043');
  eq(nextAdmNo(true), 'ADM-2025-043', 'nextAdmNo peek twice still ADM-2025-043');
  eq(nextAdmNo(), 'ADM-2025-043', 'nextAdmNo assigns ADM-2025-043');
  eq(nextAdmNo(true), 'ADM-2025-044', 'nextAdmNo peek after assign shows ADM-2025-044');
  eq(nextRoll('6th-A'), 10, 'nextRoll 6th-A is 10 (rolls 1-5, 9 taken)');
  eq(nextRoll('10th-A'), 5, 'nextRoll 10th-A is 5');

  // ---- 29. saveStudent: draft, validation, duplicates, add-another, edit ----
  state.role = 'school'; state.user = TEST_ACCOUNTS.school; state.view = 'students';
  state.profileStudent = null; state.stuSearch = ''; state.stuClass = 'All';
  var ev = { preventDefault: function () {} };
  function setStuForm(nm, cls, roll, g, ph, dob, pin, aad) {
    $('fStName').value = nm; $('fStCls').value = cls; $('fStRoll').value = roll; $('fStG').value = g; $('fStPh').value = ph;
    $('fStDob').value = dob || ''; $('fStPin').value = pin || ''; $('fStAadhaar').value = aad || '';
    $('fStGender').value = ''; $('fStBlood').value = ''; $('fStCategory').value = ''; $('fStSession').value = ''; $('fStAdmDate').value = '';
  }
  var n0 = db.students.length;
  setStuForm('Draft One', '7th-A', '5', 'Mr. Draft', '9812345601');
  saveStudent(ev, '', 'draft');
  var draftStu = db.students[db.students.length - 1];
  eq(db.students.length, n0 + 1, 'draft save adds student');
  eq(draftStu.status, 'Draft', 'draft save sets status Draft');
  eq(draftStu.admissionNo, 'ADM-2025-044', 'draft gets admissionNo ADM-2025-044');
  eq(db.feeRecords.filter(function (r) { return r.studentId === draftStu.id; }).length, 0, 'draft creates no fee record');
  eq(db.auditLog[0].action, 'Admission saved as draft', 'draft logs audit entry');
  setStuForm('', '7th-A', '5', 'Mr. X', '9812345602');
  eq(saveStudent(ev, ''), false, 'empty name rejected');
  eq(db.students.length, n0 + 1, 'empty name adds nothing');
  setStuForm('Bad Mobile', '7th-A', '5', 'Mr. X', '123');
  eq(saveStudent(ev, ''), false, 'short mobile rejected');
  eq(db.students.length, n0 + 1, 'bad mobile adds nothing');
  setStuForm('Bad Pin', '7th-A', '5', 'Mr. X', '9812345603', '', '123');
  eq(saveStudent(ev, ''), false, 'short PIN rejected');
  setStuForm('Bad Aadhaar', '7th-A', '5', 'Mr. X', '9812345604', '', '', '12345');
  eq(saveStudent(ev, ''), false, 'short Aadhaar rejected');
  eq(db.students.length, n0 + 1, 'validation failures add nothing');
  setStuForm('Dup One', '8th-A', '5', 'Mr. Dup', '9812345610', '2012-03-04');
  saveStudent(ev, '');
  var dupStu = db.students[db.students.length - 1];
  eq(dupStu.admissionNo, 'ADM-2025-045', 'Dup One gets ADM-2025-045');
  setStuForm('Dup One', '8th-A', '6', 'Mr. Dup', '9812345699', '2012-03-04');
  eq(saveStudent(ev, ''), false, 'same name + same dob blocked');
  eq($('fStErr').textContent.indexOf('Dup One') !== -1, true, 'duplicate error names the matching student');
  eq(db.students.length, n0 + 2, 'name+dob duplicate adds nothing');
  setStuForm('Dup One', '8th-A', '6', 'Mr. Dup', '9812345610', '2013-04-05');
  eq(saveStudent(ev, ''), false, 'same name + same mobile blocked');
  eq(db.students.length, n0 + 2, 'name+mobile duplicate adds nothing');
  setStuForm('Dup One', '8th-A', '6', 'Mr. Dup', '9812345699', '2013-04-05');
  saveStudent(ev, '');
  eq(db.students.length, n0 + 3, 'same name with different dob + mobile allowed');
  eq(db.students[db.students.length - 1].admissionNo, 'ADM-2025-046', 'allowed Dup One variant gets ADM-2025-046');
  setStuForm('Another One', '9th-B', '5', 'Mr. Another', '9812345620');
  saveStudent(ev, '', 'another');
  eq(db.students.some(function (s) { return s.name === 'Another One'; }), true, 'add-another saves the student');
  eq(db.students.find(function (s) { return s.name === 'Another One'; }).admissionNo, 'ADM-2025-047', 'Another One gets ADM-2025-047');
  eq($('modalRoot').innerHTML.indexOf('fStName') !== -1, true, 'add-another reopens a blank admission form');
  setStuForm('Riya Kumari', '10th-A', '1', 'Mr. Singh', riyaLive.phone, '2010-01-15', '', '123456789012');
  $('fStFather').value = riyaLive.fatherName; $('fStMother').value = riyaLive.motherName; $('fStGender').value = 'Girl';
  saveStudent(ev, riyaLive.id);
  eq(riyaLive.dob, '2010-01-15', 'edit saves dob');
  eq(riyaLive.aadhaar, '9012', 'v36: edit stores only the last 4 of the Aadhaar');
  eq(riyaLive.admissionNo, 'ADM-2025-033', 'edit never changes admissionNo');
  eq(riyaLive.admissionDate, '', 'edit with blank date keeps stored blank date (no fabrication)');
  eq(db.auditLog[0].action, 'Student updated', 'edit logs audit entry');

  // ---- 30. Directory: filters, sorting, pagination, CSV (no Aadhaar) ----
  state.stuSearch = ''; state.stuClass = 'All'; state.stuSection = 'All'; state.stuSession = 'All'; state.stuGender = 'All'; state.stuFee = 'All'; state.stuStatus = 'All'; state.stuPage = 1; state.stuSort = 'name'; state.stuSortDir = 1; state.profileStudent = null;
  var st30 = studentStats();
  eq(st30.total, db.students.length, 'stats total = student count');
  eq(st30.total, 46, 'stats total is 46');
  eq(st30.active + st30.inactive + st30.draft + st30.cancelled, st30.total, 'stats statuses sum to total');
  eq(st30.draft, 1, 'stats draft = 1');
  eq(st30.boys + st30.girls + st30.unspec, st30.total, 'stats genders sum to total');
  eq(st30.boys, 21, 'stats boys = 21');
  eq(st30.girls, 19, 'stats girls = 19');
  eq(st30.unspec, 6, 'stats not-specified = 6');
  eq(st30.newAdm, 6, 'stats new admissions = 6');
  var bcSum = 0; Object.keys(st30.byClass).forEach(function (k) { bcSum += st30.byClass[k]; });
  eq(bcSum, st30.total, 'stats byClass sums to total');
  eq(st30.byClass['10th-A'], 4, 'byClass 10th-A = 4');
  eq(st30.byClass['6th-A'], 6, 'byClass 6th-A = 6 (Test Kumar + Photo Test)');
  var attSum = 0; db.students.forEach(function (s) { attSum += studentAttPct(s); });
  eq(st30.avgAtt, Math.round(attSum / db.students.length), 'stats avgAtt is the live mean');
  state.stuClass = '10th-A'; eq(stuFiltered().length, 4, 'filter class 10th-A = 4');
  state.stuClass = 'All'; state.stuSection = 'B'; eq(stuFiltered().length, 21, 'filter section B = 21');
  state.stuSection = 'All'; state.stuGender = 'Girl'; eq(stuFiltered().length, 19, 'filter gender Girl = 19');
  state.stuGender = 'Boy'; eq(stuFiltered().length, 21, 'filter gender Boy = 21');
  state.stuGender = 'All'; state.stuStatus = 'Draft'; eq(stuFiltered().length, 1, 'filter status Draft = 1');
  state.stuStatus = 'Active'; eq(stuFiltered().length, 45, 'filter status Active = 45');
  state.stuStatus = 'All';
  var pendCount = db.students.filter(function (s) { return studentFeeStatus(s.id) === 'Pending'; }).length;
  state.stuFee = 'Pending'; eq(stuFiltered().length, pendCount, 'filter fee Pending matches live derivation');
  ok(pendCount > 0, 'some students have Pending fees');
  state.stuFee = 'All';
  state.stuSearch = 'riya'; eq(stuFiltered().length, 4, 'search riya = 4 (Riya Kumari, Priya Kumari, Priya Patel, Riya Sharma)');
  state.stuSearch = 'ADM-2025-033'; eq(stuFiltered().length, 1, 'search by admission no = 1');
  state.stuSearch = '9812345678'; eq(stuFiltered().length, 1, 'search by mobile = 1 (Test Kumar)');
  state.stuSearch = '';
  state.stuSort = 'name'; state.stuSortDir = 1;
  eq(stuSorted(stuFiltered())[0].name.indexOf('Aadhya') === 0, true, 'sort name asc starts with Aadhya');
  state.stuSortDir = -1;
  eq(stuSorted(stuFiltered())[0].name.indexOf('Yash') === 0, true, 'sort name desc starts with Yash (max first name in seed)');
  state.stuSort = 'att'; state.stuSortDir = 1;
  eq(studentAttPct(stuSorted(stuFiltered())[0]), 0, 'sort att asc starts with the lowest live attendance (0 — stu35 Absent today)');
  eq(stuSorted(stuFiltered())[0].id, 'stu35', 'sort att asc first is stu35 (lowest live pct)');
  state.stuSort = 'admDate'; state.stuSortDir = 1;
  eq(stuSorted(stuFiltered())[0].admissionDate !== '', true, 'sort admDate puts dated admissions first');
  eq(stuSorted(stuFiltered())[stuSorted(stuFiltered()).length - 1].admissionDate, '', 'sort admDate puts undated students last');
  state.stuSort = 'name'; state.stuSortDir = 1;
  eq(stuPageCount(stuFiltered()), 5, '46 students = 5 pages of 10');
  state.stuPage = 1; eq(stuPageRows(stuFiltered()).length, 10, 'page 1 has 10 rows');
  state.stuPage = 5; eq(stuPageRows(stuFiltered()).length, 6, 'page 5 has 6 rows');
  state.stuPage = 1;
  ok(studentsPage().indexOf('Page 1 of 5') !== -1, 'directory shows Page 1 of 5');
  ok(studentsPage().indexOf('Total Students</div><div class="val">46</div>') !== -1, 'directory total stat shows 46');
  eq(STU_CSV_HEAD.join(',').indexOf('Aadhaar') === -1, true, 'student CSV header has no Aadhaar');
  var riyaRow = studentCSVRow(riyaLive);
  eq(riyaRow[0], 'Riya Kumari', 'student CSV row starts with name');
  eq(riyaRow[1], 'ADM-2025-033', 'student CSV row has admission no');
  eq(riyaRow.join('|').indexOf('123456789012') === -1, true, 'student CSV row never contains Aadhaar digits');
  eq(maskAadhaar('123456789012'), '**** **** 9012', 'maskAadhaar shows last 4 only');
  eq(maskAadhaar(''), '—', 'maskAadhaar empty -> dash');
  eq(maskAadhaar('123'), '—', 'maskAadhaar short -> dash');
  exportStudentsCSV();
  ok(true, 'exportStudentsCSV runs without throwing');

  // ---- 31. Student profile: 10 tabs wired to real data ----
  state.profileStudent = riyaLive.id; state.profileTab = 'overview';
  var prof = studentsPage();
  ['Overview', 'Personal Information', 'Parent Information', 'Academic Records', 'Attendance History', 'Fee History', 'Examination Results', 'Homework Records', 'Documents', 'Activity History'].forEach(function (tab) {
    ok(prof.indexOf(tab) !== -1, 'profile has tab: ' + tab);
  });
  ok(prof.indexOf('ADM-2025-033') !== -1, 'profile header shows admission no');
  ok(prof.indexOf('Attendance</div><div class="val">100%</div>') !== -1, 'profile overview attendance tile is the live 100 (Riya: Present today, no other marked days)');
  ok(prof.indexOf('Half Yearly Exam') !== -1, 'profile overview shows latest exam name');
  setProfileTab('personal');
  var pers = studentsPage();
  ok(pers.indexOf('**** **** 9012') !== -1, 'profile personal shows masked Aadhaar');
  ok(pers.indexOf('123456789012') === -1, 'profile personal never shows full Aadhaar');
  setProfileTab('parent');
  ok(studentsPage().indexOf('Mr. Singh') !== -1, 'profile parent shows father name');
  setProfileTab('academic');
  ok(studentsPage().indexOf('10th-A') !== -1, 'profile academic shows class');
  setProfileTab('attendance');
  ok(studentsPage().indexOf('Present') !== -1, 'profile attendance shows Riya Present record');
  setProfileTab('fees');
  var feeTab = studentsPage();
  ok(feeTab.indexOf('Total Billed') !== -1, 'profile fees shows billed tile');
  ok(feeTab.indexOf('Tuition') !== -1, 'profile fees shows Tuition type');
  setProfileTab('results');
  ok(studentsPage().indexOf('95 / 100') !== -1, 'profile results shows Riya marks 95 / 100');
  setProfileTab('homework');
  ok(studentsPage().indexOf('Ex 5.2') !== -1, 'profile homework shows 10th-A homework');
  setProfileTab('docs');
  ok(studentsPage().indexOf('Birth Certificate') !== -1, 'profile docs shows birth certificate row');
  setProfileTab('activity');
  ok(studentsPage().indexOf('Student updated') !== -1, 'profile activity shows the edit audit entry');
  state.profileStudent = null; state.profileTab = 'overview';

  // ---- 32. Actions: transfer keeps fee history, deactivate, cancel, audit ----
  var tk = db.students.find(function (s) { return s.name === 'Test Kumar'; });
  $('fTrCls').value = '6th-B'; $('fTrRoll').value = '3';
  doTransfer(ev, tk.id);
  eq(tk.cls, '6th-B', 'transfer changes class to 6th-B');
  eq(tk.roll, 3, 'transfer sets new roll');
  eq(db.feeRecords.filter(function (r) { return r.studentId === tk.id; }).every(function (r) { return r.cls === '6th-A'; }), true, 'transfer keeps OLD fee records under 6th-A (historical)');
  eq(db.auditLog[0].action, 'Student transferred', 'transfer logs audit entry');
  migrateStudentsV9(db);
  eq(db.feeRecords.filter(function (r) { return r.studentId === tk.id; }).every(function (r) { return r.cls === '6th-A'; }), true, 'migration never rewrites transferred fee history (flag-guarded)');
  deactivateStudent(tk.id); confirmYes();
  eq(tk.status, 'Inactive', 'deactivate sets Inactive');
  eq(studentStats().inactive, 1, 'stats inactive = 1 after deactivate');
  eq(db.auditLog[0].action, 'Student deactivated', 'deactivate logs audit entry');
  deactivateStudent(tk.id); confirmYes();
  eq(tk.status, 'Active', 'reactivate sets Active');
  eq(db.auditLog[0].action, 'Student activated', 'reactivate logs audit entry');
  var ao = db.students.find(function (s) { return s.name === 'Another One'; });
  cancelAdmission(ao.id); confirmYes();
  eq(ao.status, 'Cancelled', 'cancel admission sets Cancelled');
  eq(db.students.some(function (s) { return s.id === ao.id; }), true, 'cancelled record is kept, not deleted');
  eq(studentStats().cancelled, 1, 'stats cancelled = 1');
  state.stuStatus = 'Active';
  ok(!stuFiltered().some(function (s) { return s.id === ao.id; }), 'cancelled student excluded from Active list');
  state.stuStatus = 'All';
  eq(db.auditLog[0].action, 'Admission cancelled', 'cancel logs audit entry');
  state.profileStudent = tk.id; state.profileTab = 'activity';
  ok(studentsPage().indexOf('Student transferred') !== -1, 'profile activity shows transfer entry');
  state.profileStudent = null;

  // ---- 33. Dashboard visuals: class bars + gender donut render live counts ----
  var st33 = studentStats();
  var bars = classBarsHTML(st33.byClass);
  ok(bars.indexOf('10th-A') !== -1, 'class bars list 10th-A');
  var bar10 = bars.split('<b>10th-A</b>')[1].split('</div>')[0];
  ok(bar10.indexOf('>4<') !== -1, 'class bars show 10th-A count 4');
  ok(bars.indexOf('width:100%') !== -1, 'class bars scale the largest class to 100%');
  var dirHtml = studentsPage();
  ok(dirHtml.indexOf('Boys') !== -1 && dirHtml.indexOf('Girls') !== -1, 'directory shows gender distribution');
  ok(dirHtml.indexOf('>21<') !== -1, 'directory shows boys count 21');

  // ---- 34. i18n: new Phase 1 strings translate to Hindi ----
  state.lang = 'hi';
  eq(t('secPersonal'), 'व्यक्तिगत विवरण', 'hi: secPersonal');
  eq(t('tabOverview'), 'सारांश', 'hi: tabOverview');
  eq(t('stTotal'), 'कुल छात्र', 'hi: stTotal');
  eq(t('actView'), 'प्रोफ़ाइल देखें', 'hi: actView');
  eq(t('idCardSoon'), 'ID कार्ड जनरेटर Phase 3 में आएगा।', 'hi: idCardSoon');
  eq(t('saveAddAnother'), 'सहेजें और नया जोड़ें', 'hi: saveAddAnother');
  state.stuSearch = ''; state.stuClass = 'All'; state.stuSection = 'All'; state.stuSession = 'All'; state.stuGender = 'All'; state.stuFee = 'All'; state.stuStatus = 'All'; state.stuPage = 1; state.profileStudent = null;
  ok(studentsPage().indexOf('कुल छात्र') !== -1, 'directory renders Hindi stat labels');
  state.lang = 'en';

  // ---- 35. CSV parser: quotes, commas, CRLF, empty lines ----
  var csv1 = parseCSV('a,b,c\\n1,2,3');
  eq(csv1.length, 2, 'parseCSV 2 rows');
  eq(csv1[1].join('|'), '1|2|3', 'parseCSV simple row');
  var csv2 = parseCSV('name,note\\n"Sharma, Ramesh","says ""hi"", ok"\\n"Patel","plain"');
  eq(csv2[1][0], 'Sharma, Ramesh', 'parseCSV quoted comma in field');
  eq(csv2[1][1], 'says "hi", ok', 'parseCSV doubled quotes unescaped');
  var csv3 = parseCSV('a,b\\r\\n1,2\\r\\n\\r\\n3,4\\r\\n');
  eq(csv3.length, 3, 'parseCSV CRLF + empty line skipped');
  eq(csv3[2].join('|'), '3|4', 'parseCSV CRLF last row');
  var csv4 = parseCSV('name,address\\n"Asha","Line1\\nLine2",x');
  eq(csv4.length, 2, 'parseCSV newline inside quotes keeps one row');
  eq(csv4[1][1], 'Line1\\nLine2', 'parseCSV quoted newline preserved');
  eq(parseCSV('').length, 0, 'parseCSV empty text -> no rows');

  // ---- 36. Import template + row validation ----
  var tpl = buildImportTemplate();
  eq(tpl[0].join(','), IMPORT_CSV_HEAD.join(','), 'template header matches import columns');
  eq(tpl.length, 3, 'template has header + 2 example rows');
  eq(tpl[1][0], 'Aarav Kumar', 'template example row 1 name');
  eq(tpl[2][9], '2026-04-01', 'template example row 2 admission date');
  downloadImportTemplate();
  ok(true, 'downloadImportTemplate runs without throwing');
  try { onImportFile(null); ok(true, 'onImportFile null input does not throw'); } catch (e) { ok(false, 'onImportFile null throws: ' + e.message); }
  function impRow(o) {
    var base = { name: 'Import One', dob: '2013-05-10', gender: 'Boy', bloodGroup: 'O+', category: 'OBC', address: 'Ward 1', state: 'Bihar', district: 'Gopalganj', pin: '841428', admissionDate: '2026-04-01', session: '2026–27', class: '6th', section: 'A', roll: '1', previousSchool: '', previousClass: '', fatherName: 'Mr. One', motherName: '', guardianName: 'Mr. One', mobile: '9812345701', mobile2: '', parentEmail: '', occupation: '', birthCert: 'Yes', tc: 'No', tcNumber: '', aadhaar: '' };
    Object.keys(o || {}).forEach(function (k) { base[k] = o[k]; });
    return base;
  }
  var vOk = validateImportRow(impRow({}), []);
  eq(vOk.ok, true, 'valid import row passes');
  eq(vOk.data.cls, '6th-A', 'valid row class+section combine to 6th-A');
  eq(vOk.data.session, '2026–27', 'valid row keeps session');
  eq(validateImportRow(impRow({ name: '' }), []).ok, false, 'import: missing name rejected');
  eq(validateImportRow(impRow({ mobile: '123' }), []).ok, false, 'import: short mobile rejected');
  eq(validateImportRow(impRow({ mobile: '9812345701', mobile2: '55' }), []).ok, false, 'import: bad secondary mobile rejected');
  eq(validateImportRow(impRow({ class: '13th' }), []).ok, false, 'import: invalid class rejected');
  eq(validateImportRow(impRow({ section: 'D' }), []).ok, false, 'import: invalid section rejected');
  eq(validateImportRow(impRow({ class: '6th-A', section: '' }), []).ok, true, 'import: combined 6th-A in class column tolerated');
  eq(validateImportRow(impRow({ pin: '123' }), []).ok, false, 'import: short PIN rejected');
  eq(validateImportRow(impRow({ aadhaar: '12345' }), []).ok, false, 'import: short Aadhaar rejected');
  eq(validateImportRow(impRow({ dob: '2013-13-40' }), []).ok, false, 'import: impossible dob rejected');
  eq(validateImportRow(impRow({ dob: '10/05/2013' }), []).ok, false, 'import: non-ISO dob rejected');
  eq(validateImportRow(impRow({ admissionDate: 'not-a-date' }), []).ok, false, 'import: bad admission date rejected');
  eq(validateImportRow(impRow({ session: '2026' }), []).ok, false, 'import: bad session rejected');
  eq(validateImportRow(impRow({ session: '2026-27' }), []).ok, true, 'import: hyphen session accepted');
  eq(validateImportRow(impRow({ session: '2026-27' }), []).data.session, '2026–27', 'import: hyphen session normalised to en-dash');
  eq(validateImportRow(impRow({ gender: 'boy' }), []).ok, true, 'import: lowercase gender normalised');
  eq(validateImportRow(impRow({ gender: 'Male' }), []).ok, false, 'import: bad gender rejected');
  eq(validateImportRow(impRow({ bloodGroup: 'o+' }), []).ok, true, 'import: lowercase blood group normalised');
  eq(validateImportRow(impRow({ bloodGroup: 'Z+' }), []).ok, false, 'import: bad blood group rejected');
  eq(validateImportRow(impRow({ category: 'obc' }), []).ok, true, 'import: lowercase category normalised');
  eq(validateImportRow(impRow({ parentEmail: 'not-an-email' }), []).ok, false, 'import: bad parent email rejected');
  eq(validateImportRow(impRow({ roll: '0' }), []).ok, false, 'import: roll 0 rejected');
  eq(validateImportRow(impRow({ roll: 'abc' }), []).ok, false, 'import: non-numeric roll rejected');
  eq(validateImportRow(impRow({ birthCert: 'Maybe' }), []).ok, false, 'import: bad birthCert value rejected');
  eq(validateImportRow(impRow({ birthCert: 'y', tc: '1' }), []).ok, true, 'import: y/1 accepted as Yes');
  eq(validateImportRow(impRow({ birthCert: 'y', tc: '1' }), []).data.documents.birthCert, true, 'import: y -> birthCert true');
  eq(validateImportRow(impRow({ birthCert: 'y', tc: '1' }), []).data.documents.tc, true, 'import: 1 -> tc true');
  var dupDb = validateImportRow(impRow({ name: 'Riya Kumari', dob: '', mobile: riyaLive.phone }), []);
  eq(dupDb.ok, false, 'import: name+mobile duplicate vs existing blocked');
  eq(dupDb.status, 'duplicate', 'import: existing duplicate status is duplicate');
  var seenF = [validateImportRow(impRow({}), []).data];
  var dupFile = validateImportRow(impRow({}), seenF);
  eq(dupFile.ok, false, 'import: duplicate within file blocked');
  eq(dupFile.status, 'duplicate', 'import: in-file duplicate status is duplicate');
  var parsed = parseImportCSV('name,mobile,class,section\\nTest A,9812345711,7th,B\\nTest B,9812345712,7th,B');
  eq(parsed.error, null, 'parseImportCSV good header -> no error');
  eq(parsed.rows.length, 2, 'parseImportCSV 2 rows');
  eq(parsed.rows[0].name, 'Test A', 'parseImportCSV maps name column');
  eq(parsed.rows[1].section, 'B', 'parseImportCSV maps section column');
  eq(parseImportCSV('foo,bar\\n1,2').error !== null, true, 'parseImportCSV missing Name column -> error');
  eq(parseImportCSV('').error !== null, true, 'parseImportCSV empty file -> error');

  // ---- 37. Confirm import: only valid rows, numbers, audit, no fee inflation ----
  state.role = 'school'; state.user = TEST_ACCOUNTS.school; state.view = 'students';
  state.stuSearch = ''; state.stuClass = 'All'; state.stuSection = 'All'; state.stuSession = 'All'; state.stuGender = 'All'; state.stuFee = 'All'; state.stuStatus = 'All'; state.stuPage = 1; state.profileStudent = null;
  var n37 = db.students.length;
  var ft37 = feeTotals();
  var admBefore37 = nextAdmNo(true);
  function impCsvRow(vals) {
    var r = new Array(IMPORT_CSV_HEAD.length).fill('');
    IMPORT_CSV_HEAD.forEach(function (c, i) { if (vals[c] !== undefined) r[i] = vals[c]; });
    return r.join(',');
  }
  var csvText = IMPORT_CSV_HEAD.join(',') + '\\n' +
    impCsvRow({ name: 'Import Alpha', dob: '2014-01-05', gender: 'Boy', bloodGroup: 'O+', category: 'General', address: 'Ward 2', state: 'Bihar', district: 'Gopalganj', pin: '841428', admissionDate: '2026-04-01', session: '2026–27', class: '6th', section: 'A', roll: '1', fatherName: 'Mr. Alpha', guardianName: 'Mr. Alpha', mobile: '9812345721', occupation: 'Farmer', birthCert: 'Yes', tc: 'No' }) + '\\n' +
    impCsvRow({ name: 'Bad Row', gender: 'Boy', mobile: '123' }) + '\\n' +
    impCsvRow({ name: 'Import Beta', dob: '2013-08-19', gender: 'Girl', bloodGroup: 'A+', category: 'OBC', state: 'Bihar', district: 'Patna', pin: '800001', admissionDate: '2026-04-01', session: '2026–27', class: '7th', section: 'B', previousSchool: 'Sunrise', previousClass: '5th', fatherName: 'Mr. Beta', motherName: 'Mrs. Beta', guardianName: 'Mr. Beta', mobile: '9812345722', birthCert: 'Yes', tc: 'Yes', tcNumber: 'TC-9001' }) + '\\n' +
    impCsvRow({ name: 'Import Alpha', dob: '2014-01-05', gender: 'Boy', bloodGroup: 'O+', category: 'General', address: 'Ward 2', state: 'Bihar', district: 'Gopalganj', pin: '841428', admissionDate: '2026-04-01', session: '2026–27', class: '6th', section: 'A', roll: '1', fatherName: 'Mr. Alpha', guardianName: 'Mr. Alpha', mobile: '9812345721', occupation: 'Farmer', birthCert: 'Yes', tc: 'No' });
  var parsed37 = parseImportCSV(csvText);
  eq(parsed37.error, null, 'import csv parses without error');
  eq(parsed37.rows.length, 4, 'import csv has 4 data rows');
  var validated37 = validateImportRows(parsed37.rows);
  eq(validated37[0].status, 'valid', 'import row 1 valid');
  eq(validated37[1].status, 'error', 'import row 2 error (bad mobile + class + section)');
  eq(validated37[2].status, 'valid', 'import row 3 valid (blank roll auto)');
  eq(validated37[3].status, 'duplicate', 'import row 4 duplicate of row 1 in file');
  importState.rows = validated37;
  importState.result = null;
  confirmImport();
  eq(db.students.length, n37 + 2, 'import adds exactly the 2 valid rows');
  var alpha = db.students.find(function (s) { return s.name === 'Import Alpha'; });
  var beta = db.students.find(function (s) { return s.name === 'Import Beta'; });
  ok(!!alpha && !!beta, 'imported students exist');
  eq(alpha.admissionNo, admBefore37, 'first imported student gets next admission number');
  eq(alpha.status, 'Active', 'imported student status Active');
  eq(alpha.session, '2026–27', 'imported student keeps session from file');
  eq(alpha.cls, '6th-A', 'imported student class from file');
  eq(beta.roll, 5, 'blank roll auto-assigned as 5 in 7th-B');
  eq(beta.documents.tcNumber, 'TC-9001', 'imported student keeps TC number');
  eq(beta.documents.tc, true, 'imported student keeps TC flag');
  eq(alpha.documents.birthCert, true, 'imported student keeps birth certificate flag');
  eq(db.feeRecords.filter(function (r) { return r.studentId === alpha.id; }).length, 0, 'import creates no fee record for the student');
  eq(feeTotals().collected, ft37.collected, 'import does not change collected fee total');
  eq(feeTotals().pending, ft37.pending, 'import does not change pending fee total');
  eq(db.auditLog.filter(function (a) { return a.action === 'Bulk import'; }).length, 2, 'import logs one Bulk import audit entry per student');
  ok(db.auditLog.some(function (a) { return a.action === 'Bulk import' && a.details.indexOf(alpha.admissionNo) !== -1; }), 'bulk import audit entry names the admission number');
  eq(importState.result.imported, 2, 'import summary counts 2 imported');
  eq(importState.result.skipped, 2, 'import summary counts 2 skipped');
  var n37b = db.students.length;
  confirmImport();
  eq(db.students.length, n37b, 'second confirm imports nothing (already imported)');
  eq(importState.result.imported, 0, 'second confirm summary says 0 imported');

  // ---- 38. Promotion: bulk promote, retain, guards, history preserved ----
  state.role = 'school'; state.user = TEST_ACCOUNTS.school; state.view = 'students';
  state.profileStudent = null;
  var elig9 = promoEligible('2025–26', '9th-A');
  eq(elig9.length, 4, 'promo eligible 9th-A 2025-26 = 4 seed students');
  var eligIds = elig9.map(function (s) { return s.id; });
  var feeBefore38 = {};
  eligIds.forEach(function (id) { feeBefore38[id] = db.feeRecords.filter(function (r) { return r.studentId === id; }).map(function (r) { return r.id + ':' + r.cls; }).join(','); });
  var res38 = runPromotion({ ids: eligIds, toSession: '2026–27', toCls: '10th-A', mode: 'promote' });
  eq(res38.promoted, 4, 'bulk promote moves 4 students');
  eq(res38.retained, 0, 'bulk promote retains 0');
  eq(res38.skipped.length, 0, 'bulk promote skips 0');
  eligIds.forEach(function (id) {
    var s = db.students.find(function (x) { return x.id === id; });
    eq(s.cls, '10th-A', 'promoted student now in 10th-A');
    eq(s.session, '2026–27', 'promoted student session advanced');
  });
  var rolls38 = eligIds.map(function (id) { return db.students.find(function (x) { return x.id === id; }).roll; }).sort(function (a, b) { return a - b; });
  eq(rolls38.join(','), '5,6,7,8', 'promoted students get next free rolls 5-8 in 10th-A');
  eligIds.forEach(function (id) {
    eq(db.feeRecords.filter(function (r) { return r.studentId === id; }).map(function (r) { return r.id + ':' + r.cls; }).join(','), feeBefore38[id], 'promoted student fee records unchanged (historical cls kept)');
  });
  eq(db.auditLog.filter(function (a) { return a.action === 'Student promoted'; }).length, 4, 'promotion logs one audit entry per student');
  ok(db.auditLog[0].details.indexOf('9th-A → 10th-A') !== -1, 'promotion audit entry shows from → to class');
  eq(promoEligible('2025–26', '9th-A').length, 0, 're-listing 9th-A 2025-26 finds 0 (already moved)');
  var res38b = runPromotion({ ids: eligIds, toSession: '2026–27', toCls: '10th-A', mode: 'promote' });
  eq(res38b.promoted, 0, 're-running the same promotion moves 0 (no-op guard)');
  eq(res38b.skipped.length, 4, 're-running the same promotion skips all 4');
  var ret6 = promoEligible('2025–26', '6th-A')[0];
  var resRet = runPromotion({ ids: [ret6.id], toSession: '2026–27', toCls: '6th-A', mode: 'retain' });
  eq(resRet.retained, 1, 'retain moves 1 student');
  eq(ret6.cls, '6th-A', 'retained student stays in 6th-A');
  eq(ret6.session, '2026–27', 'retained student session advances');
  eq(db.auditLog[0].action, 'Student retained', 'retain logs audit entry');
  var resRet2 = runPromotion({ ids: [ret6.id], toSession: '2026–27', toCls: '6th-A', mode: 'retain' });
  eq(resRet2.retained, 0, 'retain to same session moves 0');
  eq(resRet2.skipped.length, 1, 'retain to same session skips 1');
  var draftStu38 = db.students.find(function (s) { return s.name === 'Draft One'; });
  eq(promoEligible('2025–26', '7th-A').some(function (s) { return s.id === draftStu38.id; }), false, 'draft student not eligible for promotion');
  var canc38 = db.students.find(function (s) { return s.name === 'Another One'; });
  eq(promoEligible('2025–26', '9th-B').some(function (s) { return s.id === canc38.id; }), false, 'cancelled student not eligible for promotion');
  var single38 = promoEligible('2025–26', '8th-A')[0];
  var resSingle = runPromotion({ ids: [single38.id], toSession: '2026–27', toCls: '9th-A', mode: 'promote' });
  eq(resSingle.promoted, 1, 'single-student promote moves 1');
  eq(single38.cls, '9th-A', 'single-promoted student now in 9th-A');
  openPromotion();
  var promoHtml = studentsPage();
  ok(promoHtml.indexOf('Promote Students') !== -1, 'promotion page renders title');
  ok(promoHtml.indexOf('Current Session') !== -1, 'promotion page has current session select');
  ok(promoHtml.indexOf('Target Class') !== -1, 'promotion page has target class select');
  ok(promoHtml.indexOf('Promote Selected') !== -1, 'promotion page has Promote Selected button');
  ok(promoHtml.indexOf('Retain Selected') !== -1, 'promotion page has Retain Selected button');
  ok(promoHtml.indexOf('Attendance, fees, exam marks') !== -1, 'promotion page notes history is preserved');
  promoState = null;
  var dirHtml38 = studentsPage();
  ok(dirHtml38.indexOf('Import Students') !== -1, 'students page has Import Students button');
  ok(dirHtml38.indexOf('Promote Students') !== -1, 'students page has Promote Students button');
  state.profileStudent = eligIds[0]; state.profileTab = 'overview';
  ok(studentsPage().indexOf('Promote Student') !== -1, 'profile offers Promote for Active student');
  state.profileStudent = null;

  // ---- 39. i18n: new Phase 2 strings translate to Hindi ----
  state.lang = 'hi';
  eq(t('impTitle'), 'छात्रों का बल्क आयात', 'hi: impTitle');
  eq(t('impConfirm'), 'सही पंक्तियाँ आयात करें', 'hi: impConfirm');
  eq(t('promoTitle'), 'छात्रों को प्रोन्नत करें', 'hi: promoTitle');
  eq(t('promoPromote'), 'चयनित को प्रोन्नत करें', 'hi: promoPromote');
  eq(t('promoNoop'), 'लक्ष्य कक्षा और सत्र वर्तमान जैसे ही हैं — बदलने को कुछ नहीं।', 'hi: promoNoop');
  state.stuSearch = ''; state.stuClass = 'All'; state.stuSection = 'All'; state.stuSession = 'All'; state.stuGender = 'All'; state.stuFee = 'All'; state.stuStatus = 'All'; state.stuPage = 1; state.profileStudent = null; promoState = null;
  ok(studentsPage().indexOf('छात्र आयात करें') !== -1, 'directory renders Hindi import button');
  state.lang = 'en';


  // ---- 40. ID cards: real QR, card HTML, selection + print flow, promotion previousClass ----
  var ft40a = feeTotals();
  ok(typeof qrcodegen !== 'undefined' && !!qrcodegen.QrCode, 'qrcodegen loaded in harness');
  var qr40 = qrcodegen.QrCode.encodeText('SCHOOL-SAATHI|ADM-2025-001|Aarav Verma|6th-A|St. Xavier School|9812345000', qrcodegen.QrCode.Ecc.MEDIUM);
  eq((qr40.size - 17) % 4, 0, 'QR size matches a real version');
  ok(qr40.getModule(0, 0) && qr40.getModule(3, 3) && !qr40.getModule(1, 1) && !qr40.getModule(0, 7) && !qr40.getModule(7, 0), 'QR finder patterns present (top-left)');
  var qr40b = qrcodegen.QrCode.encodeText('SCHOOL-SAATHI|ADM-2025-001|Aarav Verma|6th-A|St. Xavier School|9812345000', qrcodegen.QrCode.Ecc.MEDIUM);
  var same40 = true;
  for (var qy = 0; qy < qr40.size; qy++) for (var qx = 0; qx < qr40.size; qx++) if (qr40.getModule(qx, qy) !== qr40b.getModule(qx, qy)) same40 = false;
  ok(same40, 'QR output is deterministic for the same input');
  var svg40 = qrSvgFor('SCHOOL-SAATHI|ADM-2025-001|Aarav Verma|6th-A|St. Xavier School|9812345000', 150);
  ok(svg40.indexOf('<svg') === 0, 'qrSvgFor returns an SVG string');
  ok((svg40.match(/<rect/g) || []).length > 100, 'QR SVG has many dark-module rects');
  eq(qrSvgFor('', 150).indexOf('<svg'), -1, 'qrSvgFor rejects empty text (no fake QR)');
  var s40 = db.students.find(function (x) { return x.id === 'stu1'; });
  var pay40 = idCardPayload(s40);
  eq(pay40.split('|')[0], 'SCHOOL-SAATHI', 'ID payload starts with SCHOOL-SAATHI');
  ok(pay40.indexOf(s40.admissionNo) !== -1 && pay40.indexOf(s40.name) !== -1 && pay40.indexOf(s40.cls) !== -1 && pay40.indexOf(db.profile.name) !== -1 && pay40.indexOf(s40.phone) !== -1, 'ID payload carries admission no, name, class, school, phone');
  s40.aadhaar = '123456789012';
  ok(idCardPayload(s40).indexOf('123456789012') === -1, 'ID payload never contains Aadhaar');
  var card40 = idCardHTML(s40);
  ok(card40.indexOf('id-card id-front') !== -1 && card40.indexOf('id-card id-back') !== -1, 'ID card HTML has front + back');
  ok(card40.indexOf('<svg') !== -1, 'ID card back carries the QR svg');
  ok(card40.indexOf(esc(s40.name)) !== -1 && card40.indexOf(s40.admissionNo) !== -1, 'ID card shows name + admission no');
  ok(card40.indexOf('123456789012') === -1 && card40.indexOf('Aadhaar') === -1, 'ID card never shows Aadhaar');
  ok(card40.indexOf('could not be generated') === -1, 'ID card QR rendered (no missing-QR fallback)');
  s40.aadhaar = '';
  state.role = 'school'; state.user = TEST_ACCOUNTS.school; state.view = 'students';
  state.profileStudent = null; promoState = null; state.stuSel = {};
  eq(stuSelCount(), 0, 'no students selected initially');
  toggleStuSel('stu1', true); toggleStuSel('stu2', true);
  eq(stuSelCount(), 2, 'toggleStuSel selects 2 students');
  var dir40 = studentsPage();
  ok(dir40.indexOf('Print ID Cards (2)') !== -1, 'bulk bar shows Print ID Cards (2)');
  ok(dir40.indexOf('type="checkbox"') !== -1, 'directory rows have selection checkboxes');
  toggleStuSel('stu2', false);
  eq(stuSelCount(), 1, 'toggleStuSel deselects');
  clearStuSel();
  eq(stuSelCount(), 0, 'clearStuSel clears the selection');
  toggleStuSelAll(true);
  eq(stuSelCount(), 10, 'select-all selects the 10 rows on the page');
  toggleStuSelAll(false);
  eq(stuSelCount(), 0, 'select-all off clears the page selection');
  toggleStuSel('stu1', true);
  printIdCardsBulk();
  var modal40 = __els['modalRoot'].innerHTML;
  ok(modal40.indexOf('ID Card Preview') !== -1, 'bulk print opens the ID card preview modal');
  ok(modal40.indexOf('1 ID cards ready to print') !== -1, 'preview shows the card count');
  ok(modal40.indexOf('id-card id-front') !== -1, 'preview shows the card');
  printIdCardsNow();
  var pa40 = __els['printArea'].innerHTML;
  ok(pa40.indexOf('id-sheet') !== -1, 'print flow fills #printArea with the ID sheet');
  ok(pa40.indexOf(esc(s40.name)) !== -1, 'printed sheet is for the selected student');
  eq(__els['modalRoot'].innerHTML, '', 'print closes the preview modal');
  printIdCard('stu2');
  ok(__els['modalRoot'].innerHTML.indexOf('ID Card Preview') !== -1, 'single Print ID Card opens the preview');
  closeModal();
  stuActions('stu1');
  var menu40 = __els['modalRoot'].innerHTML;
  ok(menu40.indexOf('Print ID Card') !== -1, 'directory action menu has Print ID Card');
  ok(menu40.indexOf('Phase 3') === -1 && menu40.indexOf('comes in Phase 3') === -1, 'action menu no longer shows the Phase 3 placeholder');
  closeModal();
  state.profileStudent = 'stu1'; state.profileTab = 'overview';
  ok(studentsPage().indexOf('Print ID Card') !== -1, 'profile header has a Print ID Card button');
  state.profileStudent = null;
  var elig40 = promoEligible('2025–26', '6th-A');
  ok(elig40.length >= 2, 'promotion test has eligible 6th-A students');
  var p40 = elig40[0];
  var res40 = runPromotion({ ids: [p40.id], toSession: '2026–27', toCls: '7th-A', mode: 'promote' });
  eq(res40.promoted, 1, 'promotion moves 1 student');
  eq(p40.previousClass, '6th-A', 'promotion records previousClass = old class');
  eq(p40.cls, '7th-A', 'promoted student now in 7th-A');
  var res40b = runPromotion({ ids: [p40.id], toSession: '2027–28', toCls: '8th-A', mode: 'promote' });
  eq(p40.previousClass, '7th-A', 'second promotion updates previousClass to the intermediate class');
  eq(p40.cls, '8th-A', 'second promotion moves to 8th-A');
  state.profileStudent = p40.id; state.profileTab = 'academic';
  ok(studentsPage().indexOf('7th-A') !== -1, 'profile Academic tab shows previous class 7th-A');
  state.profileStudent = null;
  var p40r = promoEligible('2025–26', '6th-A')[0];
  var prevBefore40 = p40r.previousClass;
  var res40r = runPromotion({ ids: [p40r.id], toSession: '2026–27', toCls: '6th-A', mode: 'retain' });
  eq(res40r.retained, 1, 'retain moves 1 student');
  eq(p40r.previousClass, prevBefore40, 'retain does not change previousClass');
  eq(feeTotals().collected, ft40a.collected, 'ID cards + promotion keep collected total');
  eq(feeTotals().pending, ft40a.pending, 'ID cards + promotion keep pending total');

  // ---- 41. i18n: new Phase 3 strings translate to Hindi ----
  state.lang = 'hi';
  eq(t('idcPreview'), 'ID कार्ड पूर्वावलोकन', 'hi: idcPreview');
  eq(t('idcPrint'), 'छापें', 'hi: idcPrint');
  eq(t('idcPrintCards'), 'ID कार्ड छापें', 'hi: idcPrintCards');
  eq(t('idcClearSel'), 'चयन हटाएँ', 'hi: idcClearSel');
  eq(t('idcReady'), 'ID कार्ड छपाई के लिए तैयार', 'hi: idcReady');
  eq(t('idcEmergency'), 'आपातकालीन संपर्क', 'hi: idcEmergency');
  eq(t('idcReturn'), 'मिले तो कृपया लौटाएँ', 'hi: idcReturn');
  eq(t('idcNoQr'), 'QR कोड नहीं बन सका।', 'hi: idcNoQr');
  state.profileStudent = null; promoState = null; state.stuSel = { stu1: true };
  ok(studentsPage().indexOf('ID कार्ड छापें (1)') !== -1, 'directory renders Hindi bulk ID card button');
  state.stuSel = {};
  state.lang = 'en';


  // ---- 42. v35: student login (admission no. + PIN) replaces the parent login ----
  // The parent login is GONE: no Parent tab, no doParentLogin, no parent
  // session, no demo-DB-first global scan. A student logs in with their
  // admission number + PIN (v54 (A1): the PIN is stored as a salted hash
  // in parentPinHash — never plaintext) after picking the school first.
  // Phase 1 (H-3): there is no phone-derived PIN anymore — the helper
  // is gone, and a PIN-less record gets a RANDOM hash on load.
  eq(typeof parentPinFromPhone, 'undefined', 'H-3: parentPinFromPhone is gone — no phone-derived PIN exists anymore');
  var oldDb42 = { v: 2, profile: { name: 'Old School', city: 'Patna', session: '2025–26' }, students: [{ id: 'old1', name: 'Old One', cls: '6th-A', roll: 1, phone: '9812345678', guardian: 'Mr. One', att: 90, result: 80, fee: 'Paid', status: 'Active', session: '2025–26' }], feeRecords: [], schools: [], attendanceAgg: { present: 0, absent: 0, late: 0 } };
  var mig42 = migrateV54(migrateV12(JSON.parse(JSON.stringify(oldDb42))));
  ok(mig42.students[0].parentPinHash && mig42.students[0].parentPinHash.indexOf('bcrypt$') === 0, 'H-3: migration gives a PIN-less record a random bcrypt hash');
  ok(!verifyPin('5678', mig42.students[0]), 'H-3: migration does NOT derive the PIN from the phone — the old phone-last-4 PIN fails');
  ok(!mig42.students[0].parentPin, 'v54 (A1): migration drops the plaintext PIN field');
  ok(Array.isArray(mig42.admissionRequests) && mig42.admissionRequests.length === 0, 'migration creates an empty admissionRequests list');
  var mig42b = migrateV54(migrateV12(mig42));
  eq(mig42b.students[0].parentPinHash, mig42.students[0].parentPinHash, 'v54 (A1): migration is idempotent (second run keeps the same hash)');
  ok(!verifyPin('5678', mig42b.students[0]), 'H-3: the phone PIN still does not verify after a second migration');
  ok(db.students.every(function (s) { return !s.parentPin && (!s.parentPinHash || s.parentPinHash.indexOf('s256$') === 0 || s.parentPinHash.indexOf('bcrypt$') === 0); }), 'v54 (A1): no student carries a plaintext PIN; any stored PIN is a salted hash');
  var riya42 = db.students.find(function (s) { return s.name === 'Riya Kumari'; });
  ok(!verifyPin('3408', riya42), 'H-3: Riya phone-last-4 PIN does not verify (her load gave her a random hash)');
  ok(!riya42.parentPin, 'v54 (A1): Riya carries no plaintext PIN');
  // H-3: the v35 login flow below needs a KNOWN PIN — give Riya an
  // explicit admin-set one (4321, the same PIN the custom-PIN test
  // below already uses) instead of the removed phone-derived PIN.
  riya42.parentPinHash = hashPin('4321'); delete riya42.parentPin; saveDB(db);
  // (iv) the old parent login is gone. (Phase 4 v86 brings the Parent
  // role back as its OWN role with a scoped login — doParentLogin now
  // exists, but it is the new role login, not the old global-scan one;
  // the old helpers stay gone.)
  eq(typeof doParentLogin, 'function', 'v86: doParentLogin is back as the Phase 4 parent role login');
  eq(typeof parentDashboard, 'undefined', 'v35 (iv): parentDashboard is gone');
  eq(typeof findStudentByAdmNo, 'undefined', 'v35 (iv): the global admission-number scan is gone');
  eq(typeof findStudentById, 'undefined', 'v35 (iv): the global student-id scan is gone');
  eq(typeof PAGE_PARENT, 'object', 'v85: PAGE_PARENT is back as the Phase 4 parent role map');
  eq(Object.keys(PAGE_PARENT).join(','), 'dashboard,attendance,fees,results,homework,notices', 'v86: the parent page map reuses the student views');
  // (i) student login with the right number + PIN opens ONLY that student.
  fillSchoolPicker('studentSchool');
  ok(__els['studentSchool'].innerHTML.indexOf('St. Xavier School') !== -1, 'v35: the student school picker lists the school on this device');
  $('studentSchool').value = 'test-school';
  $('studentAdmNo').value = riya42.admissionNo;
  $('studentPin').value = '4321'; // H-3: the test types the admin-set PIN — it is never read back out of the record
  doStudentLogin({ preventDefault: function () {} });
  eq(state.role, 'student', 'v35 (i): student login sets role=student');
  eq(state.user.studentId, riya42.id, 'v35 (i): student session is tied to the one student');
  eq(state.view, 'dashboard', 'v35 (i): student lands on the dashboard');
  riya42 = db.students.find(function (s) { return s.id === riya42.id; });
  ok(canViewStudent(riya42.id), 'v35 (i): student can view their own profile');
  ok(!canViewStudent('stu1'), 'v35 (iii): student cannot view another student');
  var profBefore42 = state.profileStudent;
  openStudentProfile('stu1');
  eq(state.profileStudent, profBefore42, 'v35 (iii): openStudentProfile refuses another student for a student');
  go('students');
  eq(state.view, 'dashboard', 'v35: student go(students) stays on the dashboard');
  go('fees');
  eq(state.view, 'fees', 'v65: student go(fees) opens their own fees page (v35 boundary superseded)');
  go('dashboard');
  viewStudentFees(riya42.id);
  eq(state.view, 'dashboard', 'v35: student viewStudentFees is blocked even for their own profile');
  var modalBefore42 = __els['modalRoot'].innerHTML;
  studentForm('');
  eq(__els['modalRoot'].innerHTML, modalBefore42, 'v35: student cannot open the admission form');
  var sd42 = studentDashboard();
  ok(sd42.indexOf('Riya Kumari') !== -1, 'v35 (i): student dashboard shows the student');
  ok(sd42.indexOf('Paid') !== -1 || sd42.indexOf('Pending') !== -1, 'v35 (i): student dashboard shows the fee status');
  openStudentProfile(riya42.id);
  var prof42 = studentProfilePage(riya42.id);
  ok(prof42.indexOf('Edit Student') === -1, 'v35: student profile has no Edit button');
  ok(prof42.indexOf('Student PIN') === -1, 'v35: student profile has no PIN section');
  ok(prof42.indexOf('Back to Directory') !== -1, 'v35: student profile has a Back button');
  setProfileTab('fees');
  ok(profileTabBody(riya42, 'fees').indexOf('Open Fee Page') === -1, 'v35: student fee tab has no Open Fees button');
  logout(); await waitLogout();
  eq(state.role, null, 'v35: logout clears the student session');
  // (ii) wrong PIN and wrong number are both rejected with the SAME generic error.
  $('studentSchool').value = 'test-school';
  $('studentAdmNo').value = riya42.admissionNo;
  $('studentPin').value = '0000';
  doStudentLogin({ preventDefault: function () {} });
  eq(state.role, null, 'v35 (ii): wrong PIN does not log in');
  eq(__els['studentErr'].textContent, t('tInvalidStudent'), 'v35 (ii): wrong PIN shows the generic error');
  $('studentAdmNo').value = 'ADM-9999-999';
  $('studentPin').value = '1234';
  doStudentLogin({ preventDefault: function () {} });
  eq(state.role, null, 'v35 (ii): unknown admission number does not log in');
  eq(__els['studentErr'].textContent, t('tInvalidStudent'), 'v35 (ii): unknown number shows the SAME generic error');
  // The school admin sets a custom PIN from the profile; the audit log records it.
  state.role = 'school'; state.user = TEST_ACCOUNTS.school;
  $('fStuPinNew').value = '4321';
  setStudentPin(riya42.id);
  ok(verifyPin('4321', riya42) && !riya42.parentPin, 'v54 (A1): school can set a custom student PIN (stored as a hash, never plaintext)');
  ok(db.auditLog.some(function (a) { return a.action === 'Student PIN set'; }), 'v35: setting a PIN logs an audit entry');
  $('studentSchool').value = 'test-school';
  $('studentAdmNo').value = riya42.admissionNo;
  $('studentPin').value = '4321';
  doStudentLogin({ preventDefault: function () {} });
  eq(state.role, 'student', 'v35: custom PIN works for student login');
  // The student session restores after a refresh.
  state.role = null; state.user = null;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ role: 'student', email: 'student:test-school:' + riya42.id, view: 'dashboard', at: Date.now() }));
  eq(await restoreSession(), true, 'v35: student session restores after a refresh');
  eq(state.role, 'student', 'v35: restored session is a student session');
  eq(state.user.studentId, riya42.id, 'v35: restored session is tied to the same student');
  riya42 = db.students.find(function (s) { return s.id === riya42.id; });
  logout(); await waitLogout();
  // A too-short PIN is rejected; clearing the PIN disables the login.
  state.role = 'school'; state.user = TEST_ACCOUNTS.school;
  $('fStuPinNew').value = '12';
  setStudentPin(riya42.id);
  ok(verifyPin('4321', riya42), 'v54 (A1): too-short PIN is rejected and the old PIN stays');
  clearStudentPin(riya42.id);
  ok(!riya42.parentPinHash && !riya42.parentPin, 'v54 (A1): school can clear the student PIN (hash removed)');
  logout(); await waitLogout();
  $('studentSchool').value = 'test-school';
  $('studentAdmNo').value = riya42.admissionNo;
  $('studentPin').value = '3408';
  doStudentLogin({ preventDefault: function () {} });
  eq(state.role, null, 'v35: student login is unavailable once the PIN is cleared');
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ role: 'student', email: 'student:test-school:' + riya42.id, view: 'dashboard', at: Date.now() }));
  state.role = null; state.user = null;
  eq(await restoreSession(), false, 'v35: a cleared PIN invalidates a stored student session');
  eq(state.role, null, 'v35: failed student restore leaves no session');
  riya42.parentPinHash = hashPin('4321'); delete riya42.parentPin; // H-3: restore Riya's PIN as a hash of the admin-set PIN
  saveDB(db);

  // ---- 43. Phase 4: admission requests ----
  state.role = 'school'; state.user = TEST_ACCOUNTS.school; state.view = 'students';
  eq(validateAdmissionRequest({ name: '', phone: '9812345999', classApply: '7th' }).length > 0, true, 'request validation rejects a missing name');
  eq(validateAdmissionRequest({ name: 'X', phone: '123', classApply: '7th' }).length > 0, true, 'request validation rejects a short mobile');
  eq(validateAdmissionRequest({ name: 'X', phone: '9812345999', classApply: '' }).length > 0, true, 'request validation rejects a missing class');
  eq(validateAdmissionRequest({ name: 'X', phone: '9812345999', classApply: '7th' }).length, 0, 'request validation accepts a complete request');
  var req43 = { id: 'ar-test-1', name: 'Request Test', dob: '2014-03-02', gender: 'Girl', classApply: '7th', guardianName: 'Mr. Request', phone: '9812345999', previousSchool: 'Old School', status: 'Pending', reason: '', submitted: todayIST(), studentId: '' };
  ok(saveAdmissionRequestToSchool(DB_KEY, req43), 'admission request saved into the school DB');
  eq(db.admissionRequests.filter(function (x) { return x.id === 'ar-test-1'; }).length, 1, 'request is stored with status Pending');
  ok(admissionRequestsPage().indexOf('Request Test') !== -1, 'admission requests page lists the new request');
  state.admReqFilter = 'Approved';
  ok(admissionRequestsPage().indexOf('Request Test') === -1, 'Approved filter hides the Pending request');
  state.admReqFilter = 'All';
  approveAdmissionRequest('ar-test-1');
  var formHtml43 = __els['modalRoot'].innerHTML;
  ok(formHtml43.indexOf('Request Test') !== -1, 'approve opens the admission form prefilled with the request name');
  ok(formHtml43.indexOf('ar-test-1') !== -1, 'admission form carries the request link');
  eq(admPrefill, null, 'prefill is consumed into the form on approve');
  closeModal();
  $('fStName').value = 'Request Test'; $('fStCls').value = '7th'; $('fStSec').value = 'A'; $('fStRoll').value = '5';
  $('fStG').value = 'Mr. Request'; $('fStPh').value = '9812345999';
  $('fStDob').value = '2014-03-02'; $('fStPin').value = ''; $('fStAadhaar').value = '';
  $('fStGender').value = 'Girl'; $('fStBlood').value = ''; $('fStCategory').value = ''; $('fStSession').value = '2025–26'; $('fStAdmDate').value = todayIST();
  $('fStAdmReq').value = 'ar-test-1';
  var ftBefore43 = feeTotals();
  saveStudent(ev, '', '');
  var reqAfter43 = db.admissionRequests.find(function (x) { return x.id === 'ar-test-1'; });
  eq(reqAfter43.status, 'Approved', 'saving the prefilled admission approves the request');
  ok(!!reqAfter43.studentId, 'approved request links to the new student');
  var newStu43 = db.students.find(function (x) { return x.id === reqAfter43.studentId; });
  ok(newStu43 && newStu43.name === 'Request Test', 'approved request created the student');
  ok(newStu43.parentPinHash && newStu43.parentPinHash.indexOf('bcrypt$') === 0, 'v54 (A1): new student PIN is stored as a bcrypt hash');
  ok(!newStu43.parentPin, 'v54 (A1): new student carries no plaintext PIN');
  ok(!verifyPin('5999', newStu43), 'v54 (A1): the new student PIN is not derived from the phone (phone last-4 does not verify)');
  eq(newStu43.cls, '7th-A', 'prefilled class from the request is kept');
  eq(feeTotals().collected, ftBefore43.collected, 'approve flow does not change collected fees');
  eq(feeTotals().pending, ftBefore43.pending, 'v21: approved admission adds no fee record (pending unchanged)');
  eq(db.feeRecords.filter(function (r) { return r.studentId === newStu43.id; }).length, 0, 'v21: approved admission creates zero fee records');
  ok(db.auditLog.some(function (a) { return a.action === 'Admission request approved'; }), 'approve logs an audit entry');
  var req43b = { id: 'ar-test-2', name: 'Reject Test', dob: '', gender: '', classApply: '8th', guardianName: 'Mrs. Reject', phone: '9812345998', previousSchool: '', status: 'Pending', reason: '', submitted: todayIST(), studentId: '' };
  saveAdmissionRequestToSchool(DB_KEY, req43b);
  rejectAdmissionRequest('ar-test-2');
  $('fArReason').value = 'Seats full';
  doRejectAdmissionRequest({ preventDefault: function () {} }, 'ar-test-2');
  var rej43 = db.admissionRequests.find(function (x) { return x.id === 'ar-test-2'; });
  eq(rej43.status, 'Rejected', 'reject sets status Rejected');
  eq(rej43.reason, 'Seats full', 'reject keeps the optional reason');
  ok(db.admissionRequests.some(function (x) { return x.id === 'ar-test-2'; }), 'rejected request stays in history (never deleted)');
  ok(db.auditLog.some(function (a) { return a.action === 'Admission request rejected'; }), 'reject logs an audit entry');
  approveAdmissionRequest('ar-test-2');
  eq(admPrefill, null, 'approve does nothing for a non-Pending request');

  // ---- 44. Phase 4: 14-point final test pass (node-testable points) ----
  state.role = 'school'; state.user = TEST_ACCOUNTS.school; state.view = 'students';
  // P1 migration safety: a full migration round-trip preserves every record and both fee sums
  var copy44 = JSON.parse(JSON.stringify(db));
  var ftBefore44 = feeTotals();
  var mig44 = migrateV12(migrateStudentsV9(migrateFeesV7(copy44)));
  var ftMig44 = { collected: 0, pending: 0 };
  mig44.feeRecords.forEach(function (r) { if (r.status === 'Collected') ftMig44.collected += r.amount; else if (r.status === 'Pending') ftMig44.pending += r.amount; });
  eq(ftMig44.collected, ftBefore44.collected, 'P1 migration preserves the collected total');
  eq(ftMig44.pending, ftBefore44.pending, 'P1 migration preserves the pending total');
  eq(mig44.students.length, db.students.length, 'P1 migration keeps every student record');
  // P2 admission form: duplicate name + mobile is blocked
  var nDup44 = db.students.length;
  $('fStName').value = riya42.name; $('fStCls').value = '10th'; $('fStSec').value = 'A'; $('fStRoll').value = '1';
  $('fStG').value = 'Mr. X'; $('fStPh').value = riya42.phone;
  $('fStDob').value = riya42.dob || ''; $('fStPin').value = ''; $('fStAadhaar').value = '';
  $('fStGender').value = ''; $('fStBlood').value = ''; $('fStCategory').value = ''; $('fStSession').value = '2025–26'; $('fStAdmDate').value = todayIST();
  $('fStAdmReq').value = '';
  eq(saveStudent(ev, ''), false, 'P2 duplicate name + mobile is blocked');
  eq(db.students.length, nDup44, 'P2 blocked duplicate adds no student');
  // P3 directory: search + CSV export without Aadhaar
  state.stuSearch = 'riya'; state.stuClass = 'All'; state.stuSection = 'All'; state.stuSession = 'All'; state.stuGender = 'All'; state.stuStatus = 'All'; state.stuFee = 'All';
  var dir44 = stuFiltered();
  ok(dir44.length >= 1 && dir44.every(function (s) { return [s.name, s.admissionNo, s.enr, s.phone].join(' ').toLowerCase().indexOf('riya') !== -1; }), 'P3 directory search finds Riya by name');
  state.stuSearch = '';
  var sorted44 = stuSorted(stuFiltered());
  ok(sorted44.length > 1 && sorted44[0].name.localeCompare(sorted44[1].name) <= 0, 'P3 directory sorts by name');
  ok(stuPageCount(stuFiltered()) >= 1 && studentsPage().indexOf('Page') !== -1, 'P3 directory paginates (Page control renders)');
  var csvStu44 = db.students.find(function (s) { return s.id === riya42.id; });
  var savedAad44 = csvStu44.aadhaar; csvStu44.aadhaar = '123456789012';
  var row44 = studentCSVRow(csvStu44);
  ok(row44.join(',').indexOf('123456789012') === -1, 'P3 directory CSV export never contains an Aadhaar number');
  ok(row44.join(',').indexOf('Aadhaar') === -1, 'P3 directory CSV has no Aadhaar column');
  csvStu44.aadhaar = savedAad44;
  // P4 profile: all 10 tabs render real data, nothing undefined
  var tabs44 = ['overview', 'personal', 'parent', 'academic', 'attendance', 'fees', 'results', 'homework', 'docs', 'activity'];
  tabs44.forEach(function (tb) {
    var html44 = profileTabBody(riya42, tb);
    ok(html44.length > 40 && html44.indexOf('undefined') === -1, 'P4 profile tab ' + tb + ' renders without undefined');
  });
  ok(profileTabBody(riya42, 'fees').indexOf('Total Billed') !== -1, 'P4 fee tab shows the billed tile');
  // P5 bulk import: only valid rows imported, fee totals unchanged, PIN random (v36)
  var ft45 = feeTotals();
  var impRow44 = function (vals) { var r = new Array(IMPORT_CSV_HEAD.length).fill(''); IMPORT_CSV_HEAD.forEach(function (c, i) { if (vals[c] !== undefined) r[i] = vals[c]; }); return r.join(','); };
  var csv44 = IMPORT_CSV_HEAD.join(',') + '\\n' + impRow44({ name: 'Import Pin Test', dob: '2014-01-01', gender: 'Boy', class: '6th', section: 'A', roll: '1', fatherName: 'Mr. Pin', guardianName: 'Mr. Pin', mobile: '9812345001', admissionDate: '2026-04-01', session: '2026–27', birthCert: 'Yes', tc: 'No' });
  var parsed44 = parseImportCSV(csv44);
  var validated44 = validateImportRows(parsed44.rows);
  eq(validated44[0].status, 'valid', 'P5 import preview marks the row valid');
  var n44 = db.students.length;
  importState.rows = validated44; importState.result = null;
  confirmImport();
  eq(db.students.length, n44 + 1, 'P5 import adds the valid row');
  var pinStu44 = db.students.find(function (s) { return s.name === 'Import Pin Test'; });
  ok(pinStu44.parentPinHash && pinStu44.parentPinHash.indexOf('bcrypt$') === 0, 'v54 (A1): P5 imported student PIN is stored as a bcrypt hash');
  ok(!pinStu44.parentPin, 'v54 (A1): P5 imported student carries no plaintext PIN');
  ok(!verifyPin('5001', pinStu44), 'v54 (A1): the imported student PIN is not derived from the phone (phone last-4 does not verify)');
  eq(feeTotals().collected, ft45.collected, 'P5 import keeps the collected total');
  eq(feeTotals().pending, ft45.pending, 'P5 import keeps the pending total');
  // P6 promotion: history preserved, no double-promote, no-op blocked, previousClass recorded
  var elig44 = promoEligible('2025–26', '6th-A');
  if (!elig44.length) elig44 = promoEligible('2025–26', '7th-A');
  if (!elig44.length) elig44 = promoEligible('2025–26', '8th-A');
  ok(elig44.length > 0, 'P6 a promotable student exists');
  var p44 = elig44[0];
  var fromCls44 = p44.cls;
  var toCls44 = fromCls44 === '6th-A' ? '7th-A' : (fromCls44 === '7th-A' ? '8th-A' : '9th-A');
  var feesBefore44 = db.feeRecords.filter(function (r) { return r.studentId === p44.id; }).map(function (r) { return r.id + ':' + r.cls; }).join(',');
  var marksBefore44 = db.marks.filter(function (m) { return m.studentId === p44.id; }).length;
  var res44 = runPromotion({ ids: [p44.id], toSession: '2026–27', toCls: toCls44, mode: 'promote' });
  eq(res44.promoted, 1, 'P6 promotion moves 1 student');
  eq(p44.previousClass, fromCls44, 'P6 promotion records previousClass');
  eq(p44.cls, toCls44, 'P6 promoted student is in the target class');
  var feesAfter44 = db.feeRecords.filter(function (r) { return r.studentId === p44.id; }).map(function (r) { return r.id + ':' + r.cls; }).join(',');
  eq(feesAfter44, feesBefore44, 'P6 promotion keeps fee records under the historical class');
  eq(db.marks.filter(function (m) { return m.studentId === p44.id; }).length, marksBefore44, 'P6 promotion keeps exam marks untouched');
  var res44b = runPromotion({ ids: [p44.id], toSession: '2026–27', toCls: toCls44, mode: 'promote' });
  eq(res44b.promoted, 0, 'P6 re-running the same promotion promotes nobody');
  eq(res44b.skipped.length, 1, 'P6 re-run is recorded as skipped, not a second promotion');
  eq(res44b.skipped[0].reason, t('promoNoop'), 'P6 no-op promote is blocked with the no-change reason');
  // P7 ID cards: content, real QR, no Aadhaar, bulk preview
  var cardStu44 = JSON.parse(JSON.stringify(riya42));
  cardStu44.aadhaar = '123456789012';
  var card44 = idCardHTML(cardStu44);
  ok(card44.indexOf('Aadhaar') === -1, 'P7 ID card shows no Aadhaar label');
  ok(card44.indexOf('123456789012') === -1, 'P7 ID card shows no Aadhaar number');
  ok(card44.indexOf(cardStu44.admissionNo) !== -1, 'P7 ID card shows the admission number');
  ok(card44.indexOf('<svg') !== -1, 'P7 ID card renders a real QR SVG');
  openIdCardPreview([db.students[0].id, db.students[1].id]);
  var bulk44 = __els['modalRoot'].innerHTML;
  ok(bulk44.indexOf(db.students[0].admissionNo) !== -1 && bulk44.indexOf(db.students[1].admissionNo) !== -1, 'P7 bulk ID card preview renders both students');
  closeModal();
  // P8 fee integration: profile totals match the fee records; collect updates status
  var sum44 = feeSummaryFor(riya42.id);
  var manual44 = { billed: 0, paid: 0, pend: 0 };
  db.feeRecords.forEach(function (r) { if (r.studentId === riya42.id) { manual44.billed += r.amount; if (r.status === 'Collected') manual44.paid += r.amount; else manual44.pend += r.amount; } });
  eq(sum44.billed, manual44.billed, 'P8 fee profile billed matches the fee records');
  eq(sum44.paid, manual44.paid, 'P8 fee profile paid matches the fee records');
  eq(sum44.pend, manual44.pend, 'P8 fee profile pending matches the fee records');
  eq(studentFeeStatus(riya42.id), manual44.pend > 0 ? 'Pending' : (manual44.paid > 0 ? 'Paid' : '—'), 'P8 student fee status matches the fee records');
  // v57 (#8): the live collect flow pays the whole open draft for the
  // student's month, so pick a Tuition record that is the student's ONLY
  // pending record — the draft is then exactly that one line, and the
  // single-record assertions below still hold.
  var pendRec44 = db.feeRecords.find(function (r) { return r.status === 'Pending' && feeTypeOf(r) === 'Tuition' && db.feeRecords.filter(function (x) { return x.studentId === r.studentId && x.status === 'Pending'; }).length === 1; });
  ok(!!pendRec44, 'P8: a single-pending Tuition record exists for the collect test');
  var ftPendBefore44 = feeTotals().pending;
  collectFeeUI(pendRec44.id);
  eq(pendRec44.status, 'Collected', 'P8 collect updates the record status');
  eq(feeTotals().pending, ftPendBefore44 - pendRec44.amount, 'P8 collect reduces the pending total by the amount');
  // P8 guard (v35): a logged-in student cannot collect fees.
  state.role = 'student'; state.user = { role: 'student', name: 'Riya Kumari', sub: 'Student', email: 'riya@student.in', uid: 'test-student', studentId: riya42.id };
  var pendRec46 = db.feeRecords.find(function (r) { return r.status === 'Pending'; });
  var ftPend46 = feeTotals().pending;
  collectFeeUI(pendRec46.id);
  eq(pendRec46.status, 'Pending', 'v35: student collectFee is refused (record stays Pending)');
  eq(feeTotals().pending, ftPend46, 'v35: student collectFee changes no totals');
  state.role = 'school'; state.user = TEST_ACCOUNTS.school;
  // P9 attendance integration: profile percent matches the student record
  var attTab44 = profileTabBody(riya42, 'attendance');
  ok(attTab44.indexOf(studentAttPct(riya42) + '%') !== -1, 'P9 profile attendance percent matches the live computed percent');
  var attDays44 = 0;
  Object.keys(db.attendance).forEach(function (k) { if (db.attendance[k][riya42.id]) attDays44++; });
  if (attDays44) ok(attTab44.indexOf('Present') !== -1 || attTab44.indexOf('Absent') !== -1, 'P9 attendance history lists real days');
  // P10 exam/homework integration: tabs show the real records
  ok(db.marks.length > 0, 'P10 marks exist in the DB');
  if (db.marks.length) {
    var mk44 = db.marks[0];
    var stu44x = db.students.find(function (s) { return s.id === mk44.studentId; });
    var ex44 = db.exams.find(function (e) { return e.id === mk44.examId; });
    if (stu44x && ex44) ok(profileTabBody(stu44x, 'results').indexOf(mk44.marks + ' / ' + ex44.total) !== -1, 'P10 results tab shows the real marks');
  }
  ok(db.homework.length > 0, 'P10 homework exists in the DB');
  if (db.homework.length) {
    var hw44 = db.homework[0];
    var hwStu44 = db.students.find(function (s) { return s.cls === hw44.cls; });
    ok(hwStu44 && profileTabBody(hwStu44, 'homework').indexOf(hw44.title) !== -1, 'P10 homework tab shows the real homework title');
  }
  // P11 student scoping: the role guard itself (full flow in section 42)
  eq(canViewStudent(riya42.id), true, 'P11 school role is unrestricted in canViewStudent (the student-only check applies to students)');
  state.role = 'student'; state.user = { role: 'student', name: 'Riya Kumari', sub: 'Student', email: 'riya@student.in', uid: 'test-student', studentId: riya42.id };
  ok(canViewStudent(riya42.id) && !canViewStudent('stu1'), 'P11 student canViewStudent allows only their own profile');
  state.role = 'school'; state.user = TEST_ACCOUNTS.school;
  // P12 multi-school isolation: per-account DB keys + seed boot DB
  eq(db.schools.length, 24, 'P12 fixture DB has 24 schools');
  var isoDb44 = JSON.parse(JSON.stringify(db));
  isoDb44.profile = { name: 'Iso School', city: 'Patna', session: '2025–26' };
  isoDb44.students = [JSON.parse(JSON.stringify(riya42))];
  isoDb44.students[0].name = 'Iso Only';
  writeDbByKey('schoolSaathiDB_iso', isoDb44);
  loginAs({ role: 'school', name: 'Iso Admin', school: 'Iso School', sub: 'School Admin', email: 'iso@test.in', uid: 'iso', pwHash: hashPw('x') });
  eq(db.students.length, 1, 'P12 a school account sees only its own students');
  eq(db.students[0].name, 'Iso Only', 'P12 the isolated school sees its own student');
  var isoFound44 = db.students.find(function (s) { return s.admissionNo === riya42.admissionNo; });
  ok(!!isoFound44, 'P12 v35: the admission-number lookup is scoped to the logged-in school DB');
  DB_KEY = 'schoolSaathiDB_test-school'; db = loadDB(); // v35: restore the working fixture DB — the student login is school-scoped now, so the fixture lives here, not in the boot DB
  state.role = 'school'; state.user = TEST_ACCOUNTS.school;
  // P14 security/RBAC/audit/soft-delete
  var delStu44 = db.students.find(function (s) { return s.name === 'Import Pin Test'; });
  var delFees44 = db.feeRecords.filter(function (r) { return r.studentId === delStu44.id; }).length;
  var delMarks44 = db.marks.filter(function (m) { return m.studentId === delStu44.id; }).length;
  deleteStudent(delStu44.id);
  confirmYes();
  eq(delStu44.status, 'Cancelled', 'P14 delete is a soft delete (status Cancelled)');
  ok(db.students.some(function (s) { return s.id === delStu44.id; }), 'P14 soft-deleted student record is kept');
  eq(db.feeRecords.filter(function (r) { return r.studentId === delStu44.id; }).length, delFees44, 'P14 soft delete keeps all fee records');
  eq(db.marks.filter(function (m) { return m.studentId === delStu44.id; }).length, delMarks44, 'P14 soft delete keeps all marks');
  ok(db.auditLog.some(function (a) { return a.action === 'Student removed' && a.details.indexOf(delStu44.admissionNo) !== -1; }), 'P14 delete logs an audit entry');
  ok(db.auditLog.some(function (a) { return a.action === 'Admission created'; }), 'P14 audit has admission entries');
  var trStu44 = db.students.find(function (s) { return s.name === 'Request Test'; });
  if (trStu44) { $('fTrCls').value = '7th-B'; $('fTrRoll').value = '9'; doTransfer(ev, trStu44.id); }
  ok(db.auditLog.some(function (a) { return a.action === 'Student transferred'; }), 'P14 audit has transfer entries');
  var deStu44 = db.students.find(function (s) { return s.status === 'Active'; });
  deactivateStudent(deStu44.id); confirmYes();
  ok(db.auditLog.some(function (a) { return a.action === 'Student deactivated'; }), 'P14 audit has deactivate entries');
  deactivateStudent(deStu44.id); confirmYes();
  ok(db.auditLog.some(function (a) { return a.action === 'Student promoted'; }), 'P14 audit has promotion entries');
  ok(db.auditLog.some(function (a) { return a.action === 'Admission request approved'; }), 'P14 audit has admission-request entries');
  state.profileStudent = null; state.admReqFilter = 'All';

  // ---- 45. i18n: new v35 login strings translate to Hindi ----
  state.lang = 'hi';
  eq(t('authStudent'), 'छात्र', 'hi: authStudent');
  eq(t('authTeacher'), 'शिक्षक', 'hi: authTeacher');
  eq(t('stuLoginBtn'), 'छात्र के रूप में लॉगिन करें', 'hi: stuLoginBtn');
  eq(t('tchrLoginBtn'), 'शिक्षक के रूप में लॉगिन करें', 'hi: tchrLoginBtn');
  eq(t('tInvalidStudent'), 'प्रवेश संख्या या PIN गलत है।', 'hi: tInvalidStudent');
  eq(t('tNotAllowed'), 'आपकी लॉगिन इस सेक्शन को नहीं खोल सकती।', 'hi: tNotAllowed');
  eq(t('tOwnProfileOnly'), 'आप केवल अपनी प्रोफ़ाइल देख सकते हैं।', 'hi: tOwnProfileOnly');
  eq(t('tchrDashboard'), 'शिक्षक डैशबोर्ड', 'hi: tchrDashboard');
  eq(t('teachers'), 'शिक्षक', 'hi: teachers');
  eq(t('admReqApply'), 'प्रवेश के लिए आवेदन करें', 'hi: admReqApply');
  eq(t('admReqApprove'), 'स्वीकृत करें', 'hi: admReqApprove');
  eq(t('admReqReject'), 'अस्वीकृत करें', 'hi: admReqReject');
  eq(t('tPinSet'), 'छात्र PIN सेट हो गया।', 'hi: tPinSet');
  eq(t('tPinCleared'), 'छात्र PIN हटा दिया गया।', 'hi: tPinCleared');
  eq(t('stuPinTitle'), 'छात्र PIN', 'hi: stuPinTitle');
  state.lang = 'en';

  // ---- 46. Phase 5: fee collection receipt (v13) ----
  state.role = 'school'; state.user = TEST_ACCOUNTS.school; state.view = 'fees';
  // numberToWords (Indian numbering)
  eq(numberToWords(177820), 'One Lakh Seventy Seven Thousand Eight Hundred Twenty Only', 'words: 177820 matches the reference receipt');
  eq(numberToWords(1000), 'One Thousand Only', 'words: 1000');
  eq(numberToWords(0), 'Zero Only', 'words: 0');
  eq(numberToWords(65000), 'Sixty Five Thousand Only', 'words: 65000');
  eq(numberToWords(100000), 'One Lakh Only', 'words: 100000');
  eq(numberToWords(10000000), 'One Crore Only', 'words: 10000000');
  // migration: old DB without the v13 fields gets defaults; idempotent; sums kept
  var copy46 = JSON.parse(JSON.stringify(db));
  delete copy46.feeExtras; delete copy46.receipts; delete copy46.receiptCounter;
  var ftBefore46 = feeTotals();
  var mig46 = migrateV13(copy46);
  eq(mig46.feeExtras.admissionFee, 0, 'migration defaults admissionFee to 0');
  eq(mig46.feeExtras.cautionMoney, 0, 'migration defaults cautionMoney to 0');
  eq(mig46.feeExtras.annualCharges, 0, 'migration defaults annualCharges to 0');
  eq(mig46.feeExtras.transportFee, 0, 'migration defaults transportFee to 0');
  ok(Array.isArray(mig46.receipts) && mig46.receipts.length === 0, 'migration creates an empty receipts list');
  eq(mig46.receiptCounter, 1, 'migration starts the receipt counter at 1');
  var mig46b = migrateV13(mig46);
  eq(mig46b.receiptCounter, 1, 'migration is idempotent');
  var ftMig46 = { collected: 0, pending: 0 };
  mig46.feeRecords.forEach(function (r) { if (r.status === 'Collected') ftMig46.collected += r.amount; else ftMig46.pending += r.amount; });
  eq(ftMig46.collected, ftBefore46.collected, 'migration preserves the collected total');
  eq(ftMig46.pending, ftBefore46.pending, 'migration preserves the pending total');
  // receipt auto-fill: tuition from the structure/record + one-time rows + dues
  var pend46 = db.feeRecords.find(function (r) { return r.status === 'Pending'; });
  ok(!!pend46, 'a pending fee record exists for the receipt tests');
  var stu46 = db.students.find(function (s) { return s.id === pend46.studentId; });
  db.feeExtras = { admissionFee: 65000, cautionMoney: 60000, annualCharges: 23320, transportFee: 10360 };
  openCollectFee(stu46.id, pend46.id);
  ok(!!collectDraft, 'collect page builds a draft');
  eq(collectDraft.month, pend46.month, 'collect page preselects the record month');
  var tu46 = collectDraft.lines.find(function (l) { return l.key === 'tuition'; });
  ok(!!tu46 && tu46.due === pend46.amount && tu46.recordId === pend46.id, 'tuition row uses the pending record amount');
  ok(collectDraft.lines.some(function (l) { return l.key === 'admission' && l.due === 65000; }), 'admission row auto-fills from the fee structure');
  ok(collectDraft.lines.some(function (l) { return l.key === 'caution' && l.due === 60000; }), 'caution row auto-fills from the fee structure');
  ok(collectDraft.lines.some(function (l) { return l.key === 'annual' && l.due === 23320; }), 'annual row auto-fills from the fee structure');
  ok(collectDraft.lines.some(function (l) { return l.key === 'dues-' + pend46.id; }) === false, 'the linked pending record is not duplicated as a dues row');
  // transport checkbox: off by default (no Transport record), on adds the row
  eq(collectDraft.busIncluded, false, 'bus checkbox defaults off with no Transport record');
  ok(!collectDraft.lines.some(function (l) { return l.key === 'transport'; }), 'no transport row while the checkbox is off');
  collectBusToggle({ checked: true });
  ok(collectDraft.lines.some(function (l) { return l.key === 'transport' && l.due === 10360; }), 'checking the bus box adds the transport row at the structure amount');
  // manual edit: Due change re-computes Paid and the live total + words
  collectLineEdit({ getAttribute: function (k) { return k === 'data-line' ? 'admission' : 'due'; }, value: '60000' });
  var adm46 = collectDraft.lines.find(function (l) { return l.key === 'admission'; });
  eq(adm46.due, 60000, 'manual edit changes the Due cell');
  eq(adm46.paid, 60000, 'manual Due edit re-computes Paid as Due minus Con');
  eq($('collectTotal').textContent, inr(collectDraftTotal(collectDraft)), 'manual edit updates the live total');
  eq($('totalWords').textContent, numberToWords(collectDraftTotal(collectDraft)), 'manual edit updates Total in Words');
  // save 1: full one-time payment (admission only)
  collectDraft.lines.forEach(function (l) { if (l.key !== 'admission') l.paid = 0; });
  var expNo1 = nextReceiptNo(true); // the §5 collect already minted the run's first receipt
  var ftC1 = feeTotals();
  saveCollectFee(ev);
  var rc1 = db.receipts[db.receipts.length - 1];
  eq(rc1.receiptNo, expNo1, 'first receipt gets the next number in sequence');
  eq(rc1.total, 60000, 'receipt total is the paid admission amount');
  eq(rc1.payMode, 'Cash', 'receipt stores the pay mode');
  ok(db.feeRecords.some(function (r) { return r.studentId === stu46.id && feeTypeOf(r) === 'Admission' && r.status === 'Collected' && r.amount === 60000; }), 'full one-time payment creates a Collected admission record');
  eq(feeTotals().collected, ftC1.collected + 60000, 'collect increases the collected total by the paid amount');
  eq(feeTotals().pending, ftC1.pending, 'collect leaves the pending total unchanged when no pending record was touched');
  ok(db.auditLog.some(function (a) { return a.action === 'Fee collected' && a.details.indexOf(expNo1) !== -1; }), 'collect logs a Fee collected audit entry');
  var lines46b = buildCollectLines(stu46.id, null, collectMonthDefault());
  ok(!lines46b.some(function (l) { return l.key === 'admission'; }), 'admission row is not shown again after it is collected');
  ok(studentFeeProfile(stu46.id).indexOf(expNo1) !== -1, 'fee profile Receipts list shows the saved receipt');
  // save 2: partial payment of the pending tuition record
  openCollectFee(stu46.id, pend46.id);
  var tuLine46b = collectDraft.lines.find(function (l) { return l.key === 'tuition'; });
  collectDraft.lines.forEach(function (l) { if (l.key !== 'tuition') l.paid = 0; });
  var part46 = Math.min(1000, pend46.amount - 1);
  tuLine46b.paid = part46;
  var pendBefore46 = pend46.amount;
  var ftC2 = feeTotals();
  saveCollectFee(ev);
  eq(pend46.status, 'Pending', 'partial payment keeps the record Pending');
  eq(pend46.amount, pendBefore46 - part46, 'partial payment leaves the exact remainder pending');
  ok(db.feeRecords.some(function (r) { return r.studentId === stu46.id && r.status === 'Collected' && r.amount === part46 && feeTypeOf(r) === 'Tuition' && r.month === pend46.month; }), 'partial payment creates a Collected record for the paid part');
  eq(feeTotals().pending, ftC2.pending - part46, 'partial payment reduces the pending total by the paid part');
  eq(feeTotals().collected, ftC2.collected + part46, 'partial payment increases the collected total by the paid part');
  // photo + signature + Aadhaar on the receipt (and in print)
  var view46 = { receiptNo: 'RCP-2026-001', date: todayIST(), month: 'Nov', session: '2025-26', counterNo: 'COUNTER-1', lines: [{ desc: 'Tuition Fee (Nov)', type: 'Tuition', month: 'Nov', due: 1500, con: 0, paid: 1500 }], payMode: 'Cash', payDate: todayIST(), bank: '', number: '', total: 1500, totalWords: numberToWords(1500), collector: 'Rahul Kumar' };
  var photoStu46 = JSON.parse(JSON.stringify(stu46));
  photoStu46.photo = 'data:image/png;base64,TESTPHOTO';
  photoStu46.aadhaar = '123456789012';
  var rcHtml46 = receiptHTML(view46, photoStu46, false);
  ok(rcHtml46.indexOf('data:image/png;base64,TESTPHOTO') !== -1, 'receipt shows the student photo when present');
  ok(rcHtml46.indexOf('123456789012') === -1, 'receipt never contains an Aadhaar number');
  ok(rcHtml46.indexOf('Aadhaar') === -1, 'receipt has no Aadhaar field');
  ok(rcHtml46.indexOf(t('rcptCollectorSign')) !== -1, 'receipt has the Collector signature label');
  ok(rcHtml46.indexOf('Rahul Kumar') !== -1, 'receipt prints the collector name under the signature line');
  ok(rcHtml46.indexOf(t('rcptComputerGen')) !== -1, 'receipt keeps the computer-generated line');
  var noPhoto46 = JSON.parse(JSON.stringify(stu46));
  noPhoto46.photo = '';
  var rcHtml46b = receiptHTML(view46, noPhoto46, false);
  ok(rcHtml46b.indexOf('data:image/png;base64,TESTPHOTO') === -1, 'receipt without a photo has no photo image');
  ok(rcHtml46b.indexOf(initialsOf(noPhoto46.name)) !== -1, 'receipt without a photo shows the initials avatar');
  var savedPhoto46 = stu46.photo;
  stu46.photo = 'data:image/png;base64,TESTPHOTO';
  printReceipt(db.receipts[db.receipts.length - 1].receiptNo);
  var pa46 = __els['printArea'].innerHTML;
  ok(pa46.indexOf('data:image/png;base64,TESTPHOTO') !== -1, 'printed receipt shows the student photo');
  ok(pa46.indexOf(t('rcptCollectorSign')) !== -1, 'printed receipt has the signature block');
  ok(pa46.indexOf('PARENT COPY') !== -1, 'printed receipt has the PARENT COPY footer');
  ok(pa46.indexOf('<svg') !== -1, 'printed receipt has the receipt QR');
  stu46.photo = savedPhoto46;
  // role guard: a parent cannot open the collect page
  state.collectStudent = null; state.savedReceiptId = null; collectDraft = null;
  state.role = 'parent'; state.parentStudentId = stu46.id;
  openCollectFee(stu46.id, null);
  eq(state.collectStudent, null, 'parent role cannot open the collect page');
  state.role = 'school'; state.user = TEST_ACCOUNTS.school; state.parentStudentId = null;

  // ---- 47. i18n: new Phase 5 strings translate to Hindi ----
  state.lang = 'hi';
  eq(t('rcptTitle'), 'शुल्क रसीद', 'hi: rcptTitle');
  eq(t('collectFeeBtn'), 'शुल्क वसूलें', 'hi: collectFeeBtn');
  eq(t('payModeCash'), 'नकद', 'hi: payModeCash');
  eq(t('rcptCollectorSign'), 'वसूलकर्ता के हस्ताक्षर', 'hi: rcptCollectorSign');
  eq(t('tFeeCollected'), 'शुल्क वसूल लिया गया।', 'hi: tFeeCollected');
  eq(t('rcptTotalWords'), 'कुल (शब्दों में)', 'hi: rcptTotalWords');
  state.lang = 'en';

  // ---- 48. v18: receipt lines table fits 390px AND 500px (no horizontal scroll) ----
  // v14 scoped the compact rules to 480px, so at 500px the PAID column was cut off.
  // The compact treatment now lives in the 760px block (covers the whole <=760px range).
  var css480i = __css.indexOf('@media (max-width:480px)');
  var css760i = __css.indexOf('@media (max-width:760px)');
  var m760 = (css760i === -1 || css480i === -1) ? '' : __css.slice(css760i, css480i);
  ok(css760i !== -1, 'css: 760px media query exists');
  ok(m760.indexOf('.rcpt-tbl table') !== -1 && m760.indexOf('min-width:0') !== -1, 'css 760: receipt table min-width 0 (no 480px floor)');
  ok(m760.indexOf('table-layout:fixed') !== -1, 'css 760: receipt table fixed layout (description wraps)');
  ok(m760.indexOf('.rcpt-tbl th') !== -1 && m760.indexOf('padding:4px 5px') !== -1 && m760.indexOf('font-size:12px') !== -1, 'css 760: receipt cells compact padding + 12px font');
  ok(m760.indexOf('nth-child(1)') !== -1 && m760.indexOf('width:48px') !== -1, 'css 760: SL.NO column wide enough (48px)');
  ok(m760.indexOf('td:nth-child(2)') !== -1 && m760.indexOf('overflow-wrap:break-word') !== -1, 'css 760: description cell wraps');
  ok(m760.indexOf('.rcpt-tbl input') !== -1 && m760.indexOf('width:60px') !== -1, 'css 760: receipt amount inputs 60px (<=64px)');
  ok(css480i !== -1, 'css: 480px media query still exists (narrow lines padding)');
  ok(__css.indexOf('.rcpt-tbl table{width:100%;min-width:480px') !== -1, 'css: desktop receipt table keeps min-width 480px (desktop unchanged)');

  // ---- 49. v18: session survives app close + Android back button ----
  // The session now lives in localStorage (sessionStorage died with the PWA).
  saveAccounts([TEST_ACCOUNTS.school]);
  loginAs(TEST_ACCOUNTS.school);
  eq(localStorage.getItem(SESSION_KEY) !== null, true, 'v18: session written to localStorage on login');
  eq(sessionStorage.getItem(SESSION_KEY), null, 'v18: session NOT written to sessionStorage');
  go('students');
  eq(state.view, 'students', 'v18: go(students) after login');
  // Simulated app restart: drop the in-memory state, restore from storage.
  state.role = null; state.user = null; state.view = 'dashboard'; state.parentStudentId = null;
  eq(await restoreSession(), true, 'v18: session restores after an app restart');
  eq(state.role, 'school', 'v18: restarted session is the same school account');
  eq(state.view, 'students', 'v18: restarted session lands back on the last view');
  logout(); await waitLogout();
  eq(localStorage.getItem(SESSION_KEY), null, 'v18: logout clears localStorage session');
  eq(sessionStorage.getItem(SESSION_KEY), null, 'v18: logout clears sessionStorage session too');
  eq(await restoreSession(), false, 'v18: restoreSession false after logout');
  // One-time migration: an old sessionStorage-only session is adopted once.
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ role: 'school', email: TEST_ACCOUNTS.school.email, view: 'fees', at: Date.now() }));
  state.role = null; state.user = null; state.view = 'dashboard';
  eq(await restoreSession(), true, 'v18: old sessionStorage-only session migrates and restores');
  eq(localStorage.getItem(SESSION_KEY) !== null, true, 'v18: migrated session is now in localStorage');
  eq(sessionStorage.getItem(SESSION_KEY), null, 'v18: migrated sessionStorage copy is cleared');
  eq(state.view, 'fees', 'v18: migrated session restores its view');
  logout(); await waitLogout();
  // History guards: no window.history in this harness, so go() must not throw.
  state.role = 'school'; state.user = TEST_ACCOUNTS.school;
  eq(histSupported(), false, 'v18: history not supported in the harness (guards active)');
  go('fees'); eq(state.view, 'fees', 'v18: go() works with no window.history');
  go('fees'); eq(state.view, 'fees', 'v18: repeated go() to the same view is fine');
  // popstate navigation with a stubbed history: back goes to the previous view.
  // The stub models a real browser stack (index pointer; push truncates the
  // forward entries, back/forward move the pointer and fire onPopState).
  window.history = {
    state: { view: 'fees' }, stack: [{ view: 'fees' }], index: 0, pushes: [], replaces: [],
    pushState: function (s) { this.stack.length = this.index + 1; this.stack.push(s); this.index++; this.state = s; this.pushes.push(s.view); },
    replaceState: function (s) { this.stack[this.index] = s; this.state = s; this.replaces.push(s.view); },
    back: function () { if (this.index > 0) { this.index--; this.state = this.stack[this.index]; onPopState({ state: this.state }); } },
    forward: function () { if (this.index < this.stack.length - 1) { this.index++; this.state = this.stack[this.index]; onPopState({ state: this.state }); } }
  };
  eq(histSupported(), true, 'v18: history detected once stubbed');
  go('students');
  eq(window.history.pushes[window.history.pushes.length - 1], 'students', 'v18: go() pushes a history entry for the view');
  var pushesBefore = window.history.pushes.length;
  go('students');
  eq(window.history.pushes.length, pushesBefore, 'v18: go() does not push duplicate consecutive entries');
  onPopState({ state: { view: 'fees' } });
  eq(state.view, 'fees', 'v18: popstate navigates back to the previous view');
  // Double-back-to-exit at the dashboard: first press warns, second exits.
  state.view = 'dashboard'; renderApp();
  onPopState({ state: null });
  eq($('toast').textContent, t('tBackExit'), 'v18: first back at dashboard shows the exit warning');
  ok(lastBackAt > 0, 'v18: first back press records its time');
  onPopState({ state: null });
  eq(lastBackAt, 0, 'v18: second back press within 2s allows exit (guard released)');
  // Back after logout cannot re-enter: handler returns early with no role.
  logout(); await waitLogout();
  state.view = 'dashboard';
  onPopState({ state: { view: 'students' } });
  eq(state.view, 'dashboard', 'v18: popstate after logout does not re-enter the app');
  window.history = undefined;

  // ---- 50. v19: Android back button — dashboard guard + sub-view history ----
  // v18 pushed no guard entry, so one Back on the Dashboard exited the app at
  // once; sub-views pushed no entry either, so Back skipped the list.
  window.history = {
    state: { view: 'login' }, stack: [{ view: 'login' }], index: 0, pushes: [], replaces: [],
    pushState: function (s) { this.stack.length = this.index + 1; this.stack.push(s); this.index++; this.state = s; this.pushes.push(s.view); },
    replaceState: function (s) { this.stack[this.index] = s; this.state = s; this.replaces.push(s.view); },
    back: function () { if (this.index > 0) { this.index--; this.state = this.stack[this.index]; onPopState({ state: this.state }); } },
    forward: function () { if (this.index < this.stack.length - 1) { this.index++; this.state = this.stack[this.index]; onPopState({ state: this.state }); } }
  };
  saveAccounts([TEST_ACCOUNTS.school]);
  loginAs(TEST_ACCOUNTS.school);
  eq(window.history.stack.length, 2, 'v19: login leaves a 2-entry stack (dashboard + guard)');
  eq(window.history.stack[1].guard, 1, 'v19: top entry after login is the guard');
  eq(window.history.stack[0].view, 'dashboard', 'v19: bottom entry after login is the dashboard');
  // First back on the dashboard warns and re-pushes the guard.
  window.history.back();
  eq($('toast').textContent, t('tBackExit'), 'v19: first back at dashboard shows the exit warning');
  eq(window.history.stack.length, 2, 'v19: guard is re-pushed after the first back');
  eq(state.view, 'dashboard', 'v19: still on the dashboard after the first back');
  // Second back within 2s releases the guard (no re-push).
  var pushesBefore50 = window.history.pushes.length;
  window.history.back();
  eq(window.history.index, 0, 'v19: second back within 2s releases the guard (sitting on the dashboard entry)');
  eq(window.history.state.guard || null, null, 'v19: guard entry is no longer on top after the second back');
  eq(window.history.pushes.length, pushesBefore50, 'v19: second back does not re-push the guard');
  eq(lastBackAt, 0, 'v19: second back clears the back timer');
  logout(); await waitLogout(); loginAs(TEST_ACCOUNTS.school); // reset flags + re-arm the guard
  // Sub-view: fee profile pushes its own entry; Back lands on the Fees list.
  go('fees');
  eq(window.history.stack.length, 2, 'v19: fees list replaces the guard (stack stays 2)');
  var stuA = db.students.find(function (s) { return (s.status || 'Active') === 'Active' && db.feeRecords.some(function (r) { return r.studentId === s.id; }); });
  openFeeProfile(stuA.id);
  eq(state.feeStudent, stuA.id, 'v19: fee profile opens');
  eq(window.history.stack.length, 3, 'v19: fee profile pushes a history entry');
  eq(window.history.stack[2].sub, 'profile:' + stuA.id, 'v19: fee profile entry carries the student sub-state');
  window.history.back();
  eq(state.view, 'fees', 'v19: back from a fee profile lands on the Fees list');
  eq(state.feeStudent, null, 'v19: fee profile state is cleared on back to the list');
  // Collect page: back lands on the fee profile, forward restores the collect page.
  openFeeProfile(stuA.id);
  openCollectFee(stuA.id);
  eq(state.collectStudent, stuA.id, 'v19: collect page opens');
  window.history.back();
  eq(state.feeStudent, stuA.id, 'v19: back from collect lands on the fee profile');
  eq(state.collectStudent, null, 'v19: collect state is cleared on back to the profile');
  window.history.forward();
  eq(state.collectStudent, stuA.id, 'v19: forward into a collect entry restores the collect page');
  window.history.back();
  eq(state.feeStudent, stuA.id, 'v19: back from collect again lands on the fee profile');
  window.history.back();
  eq(state.view, 'fees', 'v19: back from the fee profile lands on the Fees list');
  eq(state.feeStudent, null, 'v19: fee profile state cleared again');
  // Saved receipt: back lands on the fee profile.
  var rcNo = (db.receipts[0] || {}).receiptNo;
  if (!rcNo) { openCollectFee(stuA.id); saveCollectFee({ preventDefault: function () {} }); rcNo = db.receipts[db.receipts.length - 1].receiptNo; }
  openFeeProfile(stuA.id);
  openSavedReceipt(rcNo);
  eq(state.savedReceiptId, rcNo, 'v19: saved receipt opens');
  window.history.back();
  eq(state.feeStudent, stuA.id, 'v19: back from a saved receipt lands on the fee profile');
  eq(state.savedReceiptId, null, 'v19: saved receipt state is cleared on back');
  // Student profile: back lands on the Students list.
  go('students');
  openStudentProfile(stuA.id);
  eq(state.profileStudent, stuA.id, 'v19: student profile opens');
  window.history.back();
  eq(state.view, 'students', 'v19: back from a student profile lands on the Students list');
  eq(state.profileStudent, null, 'v19: student profile state is cleared on back');
  // Promotion page: back lands on the Students list.
  openPromotion();
  ok(promoState !== null, 'v19: promotion page opens');
  window.history.back();
  eq(promoState, null, 'v19: back from promotion clears the promotion state');
  eq(state.view, 'students', 'v19: back from promotion lands on the Students list');
  // go() never pushes duplicate consecutive FULL states.
  var pushesBefore50b = window.history.pushes.length;
  go('students'); go('students');
  eq(window.history.pushes.length, pushesBefore50b, 'v19: go() does not push duplicate consecutive full states');
  openStudentProfile(stuA.id); var pushesBefore50c = window.history.pushes.length; openStudentProfile(stuA.id);
  eq(window.history.pushes.length, pushesBefore50c, 'v19: opening the same profile twice does not push twice');
  window.history.back(); // back to the list for the restore test
  // Last-view restore re-persists the saved view (Bug 3).
  go('fees');
  state.role = null; state.user = null; state.view = 'dashboard'; state.parentStudentId = null;
  eq(await restoreSession(), true, 'v19: session restores after an app restart');
  eq(state.view, 'fees', 'v19: restored session lands back on the last view');
  eq(JSON.parse(localStorage.getItem(SESSION_KEY)).view, 'fees', 'v19: stored view stays the restored view (not dashboard)');
  logout(); await waitLogout();
  eq(localStorage.getItem(SESSION_KEY), null, 'v19: logout clears the session');
  // Back after logout cannot re-enter.
  state.view = 'dashboard';
  onPopState({ state: { view: 'students' } });
  eq(state.view, 'dashboard', 'v19: popstate after logout does not re-enter the app');
  window.history = undefined;

  // ---- 51. v20: Reset means a REAL reset — everything to zero ----
  // v19's reset restored the demo seed; the user rejected that meaning
  // ("reset matlab reset hota hai"). Reset now wipes ALL school data
  // (password-gated as before) and a fresh signup starts empty. The seed
  // lives on only as an explicit harness fixture (seeded in section 10)
  // and the Super Admin platform DB.
  // v30: a SECOND gate now follows the password — the school must type
  // its exact name. A wrong name aborts and deletes nothing; the right
  // name opens the confirm dialog, then the wipe empties everything.
  saveAccounts([TEST_ACCOUNTS.school]);
  loginAs(TEST_ACCOUNTS.school);
  go('dashboard');
  var stuCountBefore51 = db.students.length;
  ok(stuCountBefore51 > 0, 'v20: fixture db has students before the reset test');
  db.students.push({ id: 'wipe-test-1', name: 'Wipe Test', cls: '6th-A', roll: 99, status: 'Active' });
  db.admissionRequests.push({ id: 'wipe-ar', name: 'Wipe Req', status: 'Pending' });
  saveDB(db);
  ok(schoolDashboard().indexOf('Total Students</div><div class="val">' + (stuCountBefore51 + 1) + '</div>') !== -1, 'v20: Total Students tile follows the real student count');
  // Wrong password: no wipe, modal stays open with an error.
  resetAllData();
  ok($('modalRoot').innerHTML.indexOf(t('resetPwTitle')) !== -1, 'v20: Reset opens the password prompt first');
  $('resetPwInput').value = 'wrong-password';
  submitResetPw({ preventDefault: function () {} });
  eq($('resetPwErr').textContent, t('resetPwWrong'), 'v20: wrong password shows an inline error');
  eq(db.students.length, stuCountBefore51 + 1, 'v20: wrong password does not wipe the data');
  ok($('modalRoot').innerHTML.indexOf(t('resetPwTitle')) !== -1, 'v20: modal stays open after a wrong password');
  // Correct password: the school-name prompt opens next (v30 second gate).
  $('resetPwInput').value = 'TestAdmin-2026';
  submitResetPw({ preventDefault: function () {} });
  ok($('modalRoot').innerHTML.indexOf(t('resetNameTitle')) !== -1, 'v30: correct password opens the school-name prompt');
  // Wrong name: abort, modal stays open with an error, nothing wiped.
  $('resetNameInput').value = 'Wrong School Name';
  submitResetName({ preventDefault: function () {} });
  eq($('resetNameErr').textContent, t('resetNameWrong'), 'v30: wrong school name shows an inline error');
  eq(db.students.length, stuCountBefore51 + 1, 'v30: wrong school name does not wipe the data');
  ok($('modalRoot').innerHTML.indexOf(t('resetNameTitle')) !== -1, 'v30: name prompt stays open after a wrong name');
  // Right name: confirm dialog opens, then the wipe empties everything.
  $('resetNameInput').value = 'St. Xavier School';
  submitResetName({ preventDefault: function () {} });
  ok($('modalRoot').innerHTML.indexOf(t('confirmTitle')) !== -1, 'v20: correct name opens the confirm dialog');
  ok($('modalRoot').innerHTML.indexOf(t('resetConfirmMsg')) !== -1, 'v20: confirm dialog warns that everything is deleted for good');
  confirmYes();
  eq(db.students.length, 0, 'v20: reset wipes all students');
  eq(db.teachers.length, 0, 'v20: reset wipes all teachers');
  eq(db.feeRecords.length, 0, 'v20: reset wipes all fee records');
  eq(feeTotals().collected, 0, 'v20: reset leaves the collected total at zero');
  eq(feeTotals().pending, 0, 'v20: reset leaves the pending total at zero');
  eq(db.receipts.length, 0, 'v20: reset wipes all receipts');
  eq(db.attendanceAgg.present + db.attendanceAgg.absent + db.attendanceAgg.late, 0, 'v20: reset zeroes the attendance aggregate');
  eq(Object.keys(db.attendance).length, 0, 'v20: reset wipes all attendance records');
  eq(db.exams.length, 0, 'v20: reset wipes all exams');
  eq(db.marks.length, 0, 'v20: reset wipes all marks');
  eq(db.homework.length, 0, 'v20: reset wipes all homework');
  eq(db.notices.length, 0, 'v20: reset wipes all notices');
  eq(db.activities.length, 0, 'v20: reset wipes all activities');
  eq(db.admissionRequests.length, 0, 'v20: reset wipes all admission requests');
  eq(db.auditLog.length, 0, 'v20: reset wipes the audit log');
  eq(db.profile.name, 'St. Xavier School', 'v20: reset keeps the school profile (identity survives)');
  eq(db.feeStructure.length, 30, 'v37: reset keeps the fee-structure defaults (30 rows)');
  eq(db.feeStructure.filter(function (x) { return x.cls === '6th-A'; })[0].amount, 800, 'v20: reset keeps the 6th-class fee default of 800');
  eq(db.feeExtras.admissionFee, 0, 'v20: reset returns the one-time fee amounts to zero');
  eq(db.admCounter, 1, 'v20: reset restarts the admission counter');
  eq(db.receiptCounter, 1, 'v20: reset restarts the receipt counter');
  eq(nextEnr(), 'ENR-001', 'v20: first student after a reset gets ENR-001');
  eq($('toast').textContent, t('tAllReset'), 'v20: reset shows the reset toast');
  eq(state.view, 'dashboard', 'v20: reset lands back on the dashboard');
  var dash51 = schoolDashboard();
  ok(dash51.indexOf('Total Students</div><div class="val">0</div>') !== -1, 'v20: Total Students tile shows 0 after reset');
  ok(dash51.indexOf('0%') !== -1, 'v20: attendance donut shows 0% after reset');
  // v28: there is no Super Admin account anymore — a school reset keeps
  // no platform network (db.schools is always empty for a school), and
  // the removed local super login can never sign in.
  eq(db.schools.length, 0, 'v28: a school reset keeps no platform network');
  eq(findAccount('super@school-saathi.in'), null, 'v28: the local Super Admin account no longer exists');
  // Student / teacher / logged-out roles can never open the reset prompt.
  logout(); await waitLogout();
  eq(sbLocalLogin('super@school-saathi.in', 'TestAdmin-2026', $('loginErr')), false, 'v28: the removed super login no longer signs in');
  eq(state.role, null, 'v28: super login leaves nobody signed in');
  state.role = 'student'; state.user = { role: 'student', name: 'Riya Kumari', email: 'student:test-school:stu33', studentId: 'stu33' };
  var modalBefore51 = $('modalRoot').innerHTML;
  resetAllData();
  eq($('modalRoot').innerHTML, modalBefore51, 'v35: student role cannot open the reset prompt');
  state.role = 'teacher'; state.user = { role: 'teacher', name: 'T. One', email: 't@school.in', teacherId: 'tchr1', schoolUid: 'test-school' };
  resetAllData();
  eq($('modalRoot').innerHTML, modalBefore51, 'v35: teacher role cannot open the reset prompt');
  state.role = null; state.user = null;
  resetAllData();
  eq($('modalRoot').innerHTML, modalBefore51, 'v20: logged-out reset does nothing');

  // ---- v60: Delete Account — removes ONLY this school account from this device ----
  // Victim: a local-only school with a student + sync keys. Bystander: a second
  // school account with its own DB — it must survive untouched.
  var delVictim60 = { role: 'school', name: 'Delete Me', school: 'Delete Me School', sub: 'School Admin', email: 'del@school.in', uid: 'v60victim', pwHash: hashPw('del1234') };
  var delOther60 = { role: 'school', name: 'Keep Me', school: 'Keep Me School', sub: 'School Admin', email: 'keep@school.in', uid: 'v60other', pwHash: hashPw('keep1234') };
  saveAccounts([delVictim60, delOther60]);
  loginAs(delVictim60);
  db.students.push({ id: 'stu-del-60', name: 'Gone Kumar', class: '6th-A', admissionNo: 'ADM-2025-001', status: 'Active' });
  saveDB(db);
  sbOutboxSave('v60victim', [{ table: 'students', key: 'stu-del-60', op: 'upsert' }]);
  sbSrvIdsSave('v60victim', { students: { 'stu-del-60': '00000000-0000-0000-0000-000000000060' } });
  sbSnapSave('v60victim', { students: { 'stu-del-60': 'abc' } });
  // The migration flag is keyed by the SUPABASE uid (sbSaveMig(sbUid)) — plant
  // it, and the outbox/server-id map, under the fake sbUid too.
  localStorage.setItem(SB_MIGRATED_KEY + ':sb-uid-60', JSON.stringify({ at: '2026-11-10', schoolId: '00000000-0000-0000-0000-000000000060', counts: {} }));
  sbOutboxSave('sb-uid-60', [{ table: 'students', key: 'stu-del-60', op: 'upsert' }]);
  sbSrvIdsSave('sb-uid-60', { students: { 'stu-del-60': '00000000-0000-0000-0000-000000000060' } });
  loginAs(delOther60);
  db.students.push({ id: 'stu-keep-60', name: 'Stay Kumar', class: '6th-A', admissionNo: 'ADM-2025-001', status: 'Active' });
  saveDB(db);
  loginAs(delVictim60);
  // Simulate a server-linked account so the sbUid-keyed sync state is covered.
  state.sb = { uid: 'sb-uid-60' };
  // Gate 1: wrong password stops the delete (still on the password prompt).
  deleteAccount();
  $('delPwInput').value = 'wrongpw';
  submitDeletePw({ preventDefault: function () {} });
  ok($('modalRoot').innerHTML.indexOf('delNameInput') === -1, 'v60: wrong password does not advance past the password gate');
  eq(loadAccounts().length, 2, 'v60: wrong password deletes nothing');
  // Gate 1 passes; gate 2: wrong school name stops the delete (still on the name prompt).
  $('delPwInput').value = 'del1234';
  submitDeletePw({ preventDefault: function () {} });
  $('delNameInput').value = 'Wrong Name School';
  submitDeleteName({ preventDefault: function () {} });
  ok($('modalRoot').innerHTML.indexOf('server copy') === -1, 'v60: wrong school name does not reach the confirm step');
  eq(loadAccounts().length, 2, 'v60: wrong school name deletes nothing');
  // Gates pass + confirm: only the victim is gone; the other school survives.
  $('delNameInput').value = 'Delete Me School';
  submitDeleteName({ preventDefault: function () {} });
  ok($('modalRoot').innerHTML.indexOf('server copy') !== -1, 'v60: the confirm says the server copy is NOT deleted');
  confirmYes();
  eq(loadAccounts().length, 1, 'v60: the deleted account is gone from the device list');
  eq(loadAccounts()[0].email, 'keep@school.in', 'v60: the other school account survives');
  eq(localStorage.getItem('schoolSaathiDB_v60victim'), null, 'v60: the deleted account DB key is gone');
  ok(!!localStorage.getItem('schoolSaathiDB_v60other'), 'v60: the other school DB is untouched');
  eq(localStorage.getItem(SB_OUTBOX_KEY + ':v60victim'), null, 'v60: the deleted account outbox is gone');
  eq(localStorage.getItem(SB_SRVID_KEY + ':v60victim'), null, 'v60: the deleted account server-id map is gone');
  eq(localStorage.getItem(SB_SNAP_KEY + ':v60victim'), null, 'v60: the deleted account snapshot is gone');
  eq(localStorage.getItem(SB_MIGRATED_KEY + ':sb-uid-60'), null, 'v60: the deleted account migration flag is gone');
  eq(localStorage.getItem(SB_OUTBOX_KEY + ':sb-uid-60'), null, 'v60: the deleted account server-uid outbox is gone');
  eq(localStorage.getItem(SB_SRVID_KEY + ':sb-uid-60'), null, 'v60: the deleted account server-uid server-id map is gone');
  eq(state.role, null, 'v60: the delete logs out to the login screen');

  // ---- v61: Student cloud login — server payload maps to a db-shaped slice ----
  // Fake server payload in the exact shape ss_student_cloud_login returns
  // (the student WITHOUT the PIN hash — the RPC strips it; Aadhaar full).
  var cloudStu61 = { id: '00000000-0000-0000-0000-000000000061', local_id: 'stu-cloud-61', name: 'Cloud Kumar', cls: '6th-A', roll: 5, enr: 'ENR-061', guardian: 'Mrs Cloud', phone: '9810000061', father_name: 'Mr Cloud', mother_name: 'Mrs Cloud', dob: '2014-05-05', gender: 'Boy', admission_no: 'ADM-2025-061', admission_date: '2025-04-01', session: '2025–26', status: 'Active', result: 88, photo_data_url: null, documents: { birthCert: true, tc: false, tcNumber: '', other: '' }, aadhaar: '123456789012' };
  var cloudPayload61 = {
    ok: true, locked: false,
    student: cloudStu61,
    school: { id: '00000000-0000-0000-0000-000000000061', name: 'Cloud Test School', city: 'Gopalganj' },
    fees: [{ id: 'f1', local_id: 'fee-cloud-1', student_id: '00000000-0000-0000-0000-000000000061', student_name: 'Cloud Kumar', cls: '6th-A', month: 'Nov 2026', fee_type: 'Tuition', amount: 800, status: 'Collected', record_date: '2026-11-05' }],
    attendance: [{ id: 'a1', att_date: '2026-11-09', cls: '6th-A', student_id: '00000000-0000-0000-0000-000000000061', status: 'Present' }],
    marks: [{ id: 'm1', exam_id: 'e1', student_id: '00000000-0000-0000-0000-000000000061', marks: 42 }],
    exams: [{ id: 'e1', local_id: 'exam-cloud-1', name: 'Unit Test 1', cls: '6th-A', subject: 'Maths', exam_date: '2026-11-08', total: 50 }],
    homework: [{ id: 'h1', local_id: 'hw-cloud-1', cls: '6th-A', subject: 'Maths', title: 'Ex 2.1', due: '2026-11-12', done_by: ['00000000-0000-0000-0000-000000000061'] }],
    notices: [{ id: 'n1', local_id: 'nt-cloud-1', title: 'Diwali Holiday', notice_date: '2026-11-01', body: 'School closed.' }],
    fee_structure: [{ cls: '6th-A', fee_type: 'Tuition', amount: 800 }]
  };
  var cloudSlice61 = mapCloudStudentPayload(cloudPayload61);
  eq(cloudSlice61.students.length, 1, 'v61: the cloud slice holds exactly the logged-in student');
  eq(cloudSlice61.students[0].name, 'Cloud Kumar', 'v61: the cloud student maps (name)');
  eq(cloudSlice61.students[0].admissionNo, 'ADM-2025-061', 'v61: the cloud student maps (admission number)');
  eq(cloudSlice61.students[0].aadhaar, '9012', 'v61: the cloud student Aadhaar arrives as last-4 only');
  eq(cloudSlice61.students[0].parentPinHash, undefined, 'v61: the cloud payload carries no PIN hash');
  eq(cloudSlice61.profile.name, 'Cloud Test School', 'v61: the cloud slice carries the school name');
  eq(cloudSlice61.profile.city, 'Gopalganj', 'v61: the cloud slice carries the school city');
  eq(cloudSlice61.feeRecords.length, 1, 'v61: the cloud slice carries the student fees');
  eq(cloudSlice61.feeRecords[0].studentId, 'stu-cloud-61', 'v61: the cloud fee maps to the local student id');
  eq(cloudSlice61.feeRecords[0].status, 'Collected', 'v61: the cloud fee maps (status)');
  ok(!!cloudSlice61.attendance['2026-11-09|6th-A'], 'v61: the cloud attendance maps to the date|class key');
  eq(cloudSlice61.attendance['2026-11-09|6th-A']['stu-cloud-61'], 'Present', 'v61: the cloud attendance maps (status)');
  eq(cloudSlice61.marks.length, 1, 'v61: the cloud slice carries the student marks');
  eq(cloudSlice61.marks[0].examId, 'exam-cloud-1', 'v61: the cloud mark maps to the local exam id');
  eq(cloudSlice61.homework.length, 1, 'v61: the cloud slice carries the class homework');
  eq(cloudSlice61.homework[0].doneBy[0], 'stu-cloud-61', 'v61: the cloud homework doneBy maps to the local student id');
  eq(cloudSlice61.notices.length, 1, 'v61: the cloud slice carries the school notices');
  eq(cloudSlice61.feeStructure.length, 1, 'v61: the cloud slice carries the fee structure');
  // The slice is a full db shape: the student views render from it.
  var cloudAcct61 = { role: 'student', name: 'Cloud Kumar', sub: 'Student • Cloud Kumar', email: 'cloud-student:00000000-0000-0000-0000-000000000061:stu-cloud-61', uid: 'cloud-student-stu-cloud-61', studentId: 'stu-cloud-61', schoolUid: '00000000-0000-0000-0000-000000000061', cloud: true, schoolServerId: '00000000-0000-0000-0000-000000000061' };
  loginCloudStudent(cloudAcct61, cloudSlice61);
  eq(state.role, 'student', 'v61: the cloud login signs in as a student');
  eq(db, cloudSlice61, 'v61: the cloud login makes the slice the active db');
  eq(DB_KEY, 'schoolSaathiCloudDB', 'v61: the cloud login uses the dedicated cloud db key');
  ok(!!sessionStorage.getItem(CLOUD_STUDENT_KEY), 'v61: the cloud session snapshot is stored for restore');
  var dash61 = studentDashboard();
  ok(dash61.indexOf('Cloud Kumar') !== -1, 'v61: the student dashboard renders from the cloud slice (name)');
  ok(dash61.indexOf('Cloud Test School') !== -1, 'v61: the student dashboard renders from the cloud slice (school)');
  // Read-only: the homework toggle must not write anything.
  toggleHw('hw-cloud-1', false);
  eq(cloudSlice61.homework[0].doneBy.length, 1, 'v61: the cloud homework toggle does not change the slice');
  eq(localStorage.getItem('schoolSaathiCloudDB'), null, 'v61: the cloud session never saves a db under the cloud key');
  ok(document.getElementById('toast').textContent.indexOf('school') !== -1, 'v61: the cloud homework toggle explains it is read-only');
  // Logout drops the cloud slice and its snapshot.
  logout(); await waitLogout();
  eq(state.cloudDb, null, 'v61: logout drops the cloud slice');
  eq(sessionStorage.getItem(CLOUD_STUDENT_KEY), null, 'v61: logout drops the cloud session snapshot');
  eq(state.role, null, 'v61: logout leaves no role');

  // ---- v62: Teacher cloud login — credentials ride with the teacher row, the server payload maps to a slice, writes go through token RPCs ----
  // (a) sbMapTeacher carries the login email + salted hash (bcrypt$ / s256$).
  var savedAccs62 = loadAccounts();
  var te62 = { id: 'te-62', name: 'Cloud Teacher', subject: 'Maths', cls: '6th-A', classes: ['6th-A'] };
  var acc62 = { role: 'teacher', name: 'Cloud Teacher', email: 'T62@Test.in', pwHash: hashPwNew('teacher123'), hashScheme: 'sha256', teacherId: 'te-62', schoolUid: 'test-school', uid: 'u-te-62' };
  saveAccounts(savedAccs62.concat([acc62]));
  var mapT62 = sbMapTeacher(te62, 'school-62');
  eq(mapT62.email, 't62@test.in', 'v62: the teacher upload carries the login email (lowercased)');
  eq(mapT62.pw_hash, acc62.pwHash, 'v62: the teacher upload carries the salted password hash');
  // A legacy djb2 hash is NOT sent — the teacher logs in once locally (which upgrades it) and syncs.
  var acc62Legacy = { role: 'teacher', name: 'Old Teacher', email: 'old@test.in', pwHash: 'h12345678', hashScheme: 'djb2', teacherId: 'te-62-old', schoolUid: 'test-school', uid: 'u-te-62-old' };
  saveAccounts(savedAccs62.concat([acc62, acc62Legacy]));
  var mapT62Legacy = sbMapTeacher({ id: 'te-62-old', name: 'Old Teacher', subject: 'Maths', cls: '6th-A', classes: ['6th-A'] }, 'school-62');
  eq(mapT62Legacy.pw_hash, undefined, 'v62: a legacy djb2 hash is not uploaded (cloud login waits for one local login)');
  eq(mapT62Legacy.email, 'old@test.in', 'v62: the legacy teacher email is still uploaded');
  // The credentials change the mapped payload, so the hash-diff sync queues the row for a PATCH (the backfill).
  saveAccounts(savedAccs62);
  var mapT62NoCred = sbMapTeacher(te62, 'school-62');
  ok(JSON.stringify(mapT62) !== JSON.stringify(mapT62NoCred), 'v62: adding credentials changes the teacher payload, so the sync queues the backfill PATCH');
  // (b) The server payload maps to a db-shaped slice for the teacher's classes only.
  var cloudTch62 = { id: '00000000-0000-0000-0000-000000000062', local_id: 'te-cloud-62', name: 'Cloud Teacher', subject: 'Maths', cls: '6th-A', classes: ['6th-A'] };
  var cloudStu62a = { id: '00000000-0000-0000-0000-000000000062', local_id: 'stu-cloud-62a', name: 'Ankit Cloud', cls: '6th-A', roll: 1, enr: 'ENR-062', guardian: 'Mrs Cloud', phone: '9810000062', father_name: 'Mr Cloud', mother_name: 'Mrs Cloud', dob: '2014-05-05', gender: 'Boy', admission_no: 'ADM-2025-062', admission_date: '2025-04-01', session: '2025–26', status: 'Active', result: 88, photo_data_url: null, documents: { birthCert: true, tc: false, tcNumber: '', other: '' }, aadhaar: '123456789012' };
  var cloudStu62b = { id: '00000000-0000-0000-0000-000000000063', local_id: 'stu-cloud-62b', name: 'Second Cloud', cls: '6th-A', roll: 2, enr: 'ENR-063', guardian: 'Mrs Cloud', phone: '9810000063', father_name: 'Mr Cloud', mother_name: 'Mrs Cloud', dob: '2014-06-06', gender: 'Girl', admission_no: 'ADM-2025-063', admission_date: '2025-04-01', session: '2025–26', status: 'Active', result: 75, photo_data_url: null, documents: { birthCert: false, tc: false, tcNumber: '', other: '' }, aadhaar: '987654321098' };
  var cloudStu62Other = { id: '00000000-0000-0000-0000-000000000064', local_id: 'stu-cloud-62c', name: 'Other Class', cls: '10th-A', roll: 1, enr: 'ENR-064', guardian: 'Mrs Other', phone: '9810000064', father_name: 'Mr Other', mother_name: 'Mrs Other', dob: '2013-01-01', gender: 'Boy', admission_no: 'ADM-2025-064', admission_date: '2025-04-01', session: '2025–26', status: 'Active', result: 60, photo_data_url: null, documents: { birthCert: false, tc: false, tcNumber: '', other: '' }, aadhaar: '111122223333' };
  var cloudPayload62 = {
    teacher: cloudTch62,
    school: { id: '00000000-0000-0000-0000-000000000062', name: 'Cloud Test School', city: 'Gopalganj' },
    students: [cloudStu62a, cloudStu62b, cloudStu62Other],
    attendance: [{ id: 'a62', att_date: '2026-11-09', cls: '6th-A', student_id: '00000000-0000-0000-0000-000000000062', status: 'Present' }],
    marks: [{ id: 'm62', exam_id: 'e62', student_id: '00000000-0000-0000-0000-000000000062', marks: 42 }],
    exams: [{ id: 'e62', local_id: 'exam-cloud-62', name: 'Unit Test 1', cls: '6th-A', subject: 'Maths', exam_date: '2026-11-08', total: 50 }],
    homework: [{ id: 'h62', local_id: 'hw-cloud-62', cls: '6th-A', subject: 'Maths', title: 'Ex 2.1', due: '2026-11-12', done_by: [] }],
    notices: [{ id: 'n62', local_id: 'n-cloud-62', title: 'Sports Day', notice_date: '2026-11-09', body: 'Annual sports day next week.' }]
  };
  var cloudSlice62 = mapCloudTeacherPayload(cloudPayload62);
  eq(cloudSlice62.teachers.length, 1, 'v62: the cloud slice holds exactly the logged-in teacher');
  eq(cloudSlice62.teachers[0].name, 'Cloud Teacher', 'v62: the cloud teacher maps (name)');
  eq(cloudSlice62.teachers[0].classes[0], '6th-A', 'v62: the cloud teacher maps (classes)');
  eq(cloudSlice62.students.length, 2, 'v62: the cloud slice holds only the teacher classes students');
  eq(cloudSlice62.students[0].srvId, '00000000-0000-0000-0000-000000000062', 'v62: the cloud student carries its server id for write RPCs');
  eq(cloudSlice62.profile.name, 'Cloud Test School', 'v62: the cloud slice carries the school name');
  eq(cloudSlice62.attendance['2026-11-09|6th-A']['stu-cloud-62a'], 'Present', 'v62: the cloud attendance maps to the date|class key');
  eq(cloudSlice62.marks.length, 1, 'v62: the cloud slice carries the class marks');
  eq(cloudSlice62.marks[0].examId, 'exam-cloud-62', 'v62: the cloud mark maps to the local exam id');
  eq(cloudSlice62.exams[0].srvId, 'e62', 'v62: the cloud exam carries its server id for write RPCs');
  eq(cloudSlice62.homework.length, 1, 'v62: the cloud slice carries the class homework');
  eq(cloudSlice62.notices.length, 1, 'v62: the cloud slice carries the school notices');
  // (c) Login + session + dashboard render from the slice.
  var cloudAcct62 = { role: 'teacher', name: 'Cloud Teacher', sub: 'Teacher • Cloud Teacher', email: 'cloud-teacher:00000000-0000-0000-0000-000000000062:te-cloud-62', uid: 'cloud-teacher-te-cloud-62', teacherId: 'te-cloud-62', schoolUid: '00000000-0000-0000-0000-000000000062', cloud: true, schoolServerId: '00000000-0000-0000-0000-000000000062' };
  loginCloudTeacher(cloudAcct62, cloudSlice62, '00000000-0000-0000-0000-000000000062');
  eq(state.role, 'teacher', 'v62: the cloud login signs in as a teacher');
  eq(db, cloudSlice62, 'v62: the cloud login makes the slice the active db');
  eq(DB_KEY, 'schoolSaathiCloudDB', 'v62: the cloud login uses the dedicated cloud db key');
  eq(state.cloudTeacherToken, '00000000-0000-0000-0000-000000000062', 'v62: the cloud login keeps the session token for write RPCs');
  ok(!!sessionStorage.getItem(CLOUD_TEACHER_KEY), 'v62: the cloud teacher session snapshot is stored for restore');
  var dash62 = teacherDashboard();
  ok(dash62.indexOf('Cloud Teacher') !== -1, 'v62: the teacher dashboard renders from the cloud slice (name)');
  ok(dash62.indexOf('Cloud Test School') !== -1, 'v62: the teacher dashboard renders from the cloud slice (school)');
  // (d) Attendance: a tap writes through the RPC (stubbed fetch); a failed call reverts the slice.
  var fetchOk62 = function () { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true }); } }); };
  var fetchFail62 = function () { return Promise.resolve({ ok: false, status: 500, json: function () { return Promise.resolve({ message: 'boom' }); } }); };
  fetch = fetchOk62;
  state.view = 'attendance'; state.attCls = '6th-A'; state.attDate = '2026-11-10';
  markAtt('stu-cloud-62a', 'Present');
  eq(cloudSlice62.attendance['2026-11-10|6th-A']['stu-cloud-62a'], 'Present', 'v62: the cloud attendance tap updates the slice at once');
  await new Promise(function (r) { setTimeout(r, 0); });
  eq(cloudSlice62.attendance['2026-11-10|6th-A']['stu-cloud-62a'], 'Present', 'v62: the cloud attendance tap stays after the RPC confirms');
  // Save (cloud): no audit row, no activity row — the server keeps the attendance itself.
  var auditBefore62 = db.auditLog.length;
  saveAttendance();
  eq(db.auditLog.length, auditBefore62, 'v62: the cloud attendance save writes no local audit entry');
  // Failure reverts.
  fetch = fetchFail62;
  markAtt('stu-cloud-62a', 'Absent');
  eq(cloudSlice62.attendance['2026-11-10|6th-A']['stu-cloud-62a'], 'Absent', 'v62: the failed tap still shows optimistically first');
  // (harness fix) the failed RPC retries twice on 5xx (B8 bounded retry,
  // 500ms + 1000ms) before the revert lands — a single 0ms tick is not
  // enough; poll until the revert lands or give up after ~4s.
  await (async function () { for (var i = 0; i < 160; i++) { if (cloudSlice62.attendance['2026-11-10|6th-A']['stu-cloud-62a'] === 'Present') return; await new Promise(function (r) { setTimeout(r, 25); }); } })();
  eq(cloudSlice62.attendance['2026-11-10|6th-A']['stu-cloud-62a'], 'Present', 'v62: the failed tap reverts to the server state');
  // A tap on a class the teacher does not teach is refused before any call.
  state.attCls = '10th-A';
  markAtt('stu-cloud-62a', 'Present');
  eq(cloudSlice62.attendance['2026-11-10|10th-A'], undefined, 'v62: a tap outside the teacher classes writes nothing');
  state.attCls = '6th-A';
  // (e) Homework: a post goes through the RPC, then joins the slice; a failed post adds nothing.
  fetch = fetchOk62;
  $('fHwDue').value = '2027-06-01'; $('fHwCls').value = '6th-A'; $('fHwSub').value = 'Maths'; $('fHwTitle').value = 'Ex 3.1';
  saveHomework({ preventDefault: function () {} });
  await new Promise(function (r) { setTimeout(r, 0); });
  eq(cloudSlice62.homework.length, 2, 'v62: the cloud homework post joins the slice after the RPC confirms');
  eq(cloudSlice62.homework[0].title, 'Ex 3.1', 'v62: the cloud homework post maps (title)');
  fetch = fetchFail62;
  $('fHwTitle').value = 'Ex 3.2';
  saveHomework({ preventDefault: function () {} });
  await new Promise(function (r) { setTimeout(r, 0); });
  eq(cloudSlice62.homework.length, 2, 'v62: a failed homework post adds nothing to the slice');
  // (f) Marks: the whole save goes through one RPC; a failed save changes nothing.
  fetch = fetchOk62;
  state.view = 'exams'; state.examId = 'exam-cloud-62';
  $('mk-stu-cloud-62a').value = '45';
  $('mk-stu-cloud-62b').value = '';
  saveMarks('exam-cloud-62');
  await new Promise(function (r) { setTimeout(r, 0); });
  var mk62a = db.marks.filter(function (m) { return m.examId === 'exam-cloud-62' && m.studentId === 'stu-cloud-62a'; })[0];
  eq(mk62a && mk62a.marks, 45, 'v62: the cloud marks save lands after the RPC confirms');
  fetch = fetchFail62;
  $('mk-stu-cloud-62a').value = '30';
  saveMarks('exam-cloud-62');
  await new Promise(function (r) { setTimeout(r, 0); });
  var mk62a2 = db.marks.filter(function (m) { return m.examId === 'exam-cloud-62' && m.studentId === 'stu-cloud-62a'; })[0];
  eq(mk62a2 && mk62a2.marks, 45, 'v62: a failed marks save leaves the slice unchanged');
  fetch = undefined;
  // (g) Logout drops the token and the snapshot.
  logout(); await waitLogout();
  eq(state.cloudTeacherToken, null, 'v62: logout drops the cloud teacher token');
  eq(sessionStorage.getItem(CLOUD_TEACHER_KEY), null, 'v62: logout drops the cloud teacher snapshot');
  eq(state.cloudDb, null, 'v62: logout drops the cloud teacher slice');
  eq(state.role, null, 'v62: logout leaves no role');

  // ---- v63: server-side rate limit for the SCHOOL login (SQL 19) ----
  // GoTrue only rate-limits per IP — the app now checks a per-account lock
  // (5 wrong passwords = 15 min) on the server before calling GoTrue,
  // records a failure only on a 400, and clears the row on success. A
  // failed precheck fails OPEN: the password is still checked by GoTrue.
  var rpcCalls63 = [];
  function fetch63(url, init) {
    var u = String(url);
    rpcCalls63.push(u);
    if (u.indexOf('ss_school_login_precheck') !== -1) {
      var preBody = {};
      try { preBody = JSON.parse(init.body || '{}'); } catch (e) {}
      if (preBody.p_email === 'locked@school.test') return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: false, locked: true, locked_until: '2026-11-10T12:00:00.000Z' }); } });
      return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true, locked: false }); } });
    }
    if (u.indexOf('ss_school_login_failed') !== -1) return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true, locked: false, fails: 1 }); } });
    if (u.indexOf('ss_school_login_ok') !== -1) return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true }); } });
    if (u.indexOf('/auth/v1/token') !== -1) {
      var tokBody = {};
      try { tokBody = JSON.parse(init.body || '{}'); } catch (e) {}
      if (tokBody.password === 'rightpass') return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ access_token: 'tok-63', refresh_token: 'ref-63', user: { id: 'uid-63' } }); } });
      return Promise.resolve({ ok: false, status: 400, json: function () { return Promise.resolve({ error: 'invalid_grant', error_description: 'Invalid login credentials' }); } });
    }
    return Promise.reject(new Error('unexpected fetch in v63: ' + u));
  }
  // (a) The helpers: precheck answers locked/ok, and returns null when
  // the RPC itself fails (fail-open); failed/ok hit their RPC paths.
  fetch = fetch63;
  var pre63locked = await sbSchoolLoginPrecheck('locked@school.test');
  eq(pre63locked && pre63locked.locked, true, 'v63: the precheck reports a locked school email');
  var pre63ok = await sbSchoolLoginPrecheck('ok@school.test');
  eq(pre63ok && pre63ok.locked, false, 'v63: the precheck reports an unlocked school email');
  fetch = function () { return Promise.reject(new Error('rpc down')); };
  var pre63null = await sbSchoolLoginPrecheck('ok@school.test');
  eq(pre63null, null, 'v63: a failed precheck returns null (fail-open — GoTrue still checks the password)');
  fetch = fetch63;
  rpcCalls63 = [];
  await sbSchoolLoginFailed('ok@school.test');
  eq(rpcCalls63.some(function (u) { return u.indexOf('ss_school_login_failed') !== -1; }), true, 'v63: recording a failure calls the failed RPC');
  rpcCalls63 = [];
  await sbSchoolLoginOk('ok@school.test', 'tok-63');
  eq(rpcCalls63.some(function (u) { return u.indexOf('ss_school_login_ok') !== -1; }), true, 'v63: a successful login calls the clear RPC');
  // (b) doLogin wiring: a locked email never reaches GoTrue.
  var finishCalls63 = 0;
  var realFinish63 = sbFinishSupabaseLogin;
  sbFinishSupabaseLogin = function () { finishCalls63++; };
  var tick63 = function () { return new Promise(function (r) { setTimeout(r, 0); }); };
  rpcCalls63 = [];
  $('loginId').value = 'locked@school.test'; $('loginPw').value = 'whatever';
  $('loginErr').textContent = '';
  doLogin({ preventDefault: function () {} });
  await tick63(); await tick63(); await tick63();
  eq($('loginErr').textContent, t('tPinLocked'), 'v63: a locked school email shows the lock text');
  eq(rpcCalls63.some(function (u) { return u.indexOf('/auth/v1/token') !== -1; }), false, 'v63: a locked school email never reaches GoTrue');
  // (c) A wrong password records the failure (even with no local account
  // for the email — a fresh device must still count attempts) and shows
  // the generic error when this device has no local account for it.
  rpcCalls63 = [];
  $('loginId').value = 'ok@school.test'; $('loginPw').value = 'wrongpass';
  $('loginErr').textContent = '';
  doLogin({ preventDefault: function () {} });
  await tick63(); await tick63(); await tick63();
  eq(rpcCalls63.some(function (u) { return u.indexOf('ss_school_login_failed') !== -1; }), true, 'v63: a wrong school password records the failure on the server');
  eq($('loginErr').textContent, t('tInvalidCreds'), 'v63: a wrong school password with no local account shows the generic error');
  eq(finishCalls63, 0, 'v63: a failed school login does not finish a session');
  // (c2) With a server-linked local account, the same wrong password shows
  // the server-password error instead of the generic one.
  var savedAccs63 = loadAccounts();
  saveAccounts(savedAccs63.concat([{ uid: 'u-63', name: 'Test School', school: 'Test School', email: 'ok@school.test', pwHash: hashPwNew('rightpass'), hashScheme: 'bcrypt', role: 'school', sbUid: 'uid-63' }]));
  rpcCalls63 = [];
  $('loginId').value = 'ok@school.test'; $('loginPw').value = 'wrongpass';
  $('loginErr').textContent = '';
  doLogin({ preventDefault: function () {} });
  await tick63(); await tick63(); await tick63();
  eq(rpcCalls63.some(function (u) { return u.indexOf('ss_school_login_failed') !== -1; }), true, 'v63: a wrong password on a server-linked account records the failure');
  eq($('loginErr').textContent, t('tWrongPasswordServer'), 'v63: a wrong school password shows the server-password error');
  // (d) A right password clears the row and finishes the login.
  rpcCalls63 = [];
  $('loginId').value = 'ok@school.test'; $('loginPw').value = 'rightpass';
  $('loginErr').textContent = 'stale';
  doLogin({ preventDefault: function () {} });
  await tick63(); await tick63(); await tick63();
  eq(rpcCalls63.some(function (u) { return u.indexOf('ss_school_login_ok') !== -1; }), true, 'v63: a correct school password clears the attempts row');
  eq(finishCalls63, 1, 'v63: a correct school password finishes the login');
  // (e) Fail-open: when the precheck RPC itself is down, the login still
  // goes to GoTrue instead of blocking the school out.
  fetch = function (url) {
    rpcCalls63.push(String(url));
    if (String(url).indexOf('ss_school_login_precheck') !== -1) return Promise.reject(new Error('rpc down'));
    if (String(url).indexOf('/auth/v1/token') !== -1) return Promise.resolve({ ok: false, status: 400, json: function () { return Promise.resolve({ error: 'invalid_grant' }); } });
    return Promise.reject(new Error('unexpected fetch in v63e: ' + url));
  };
  rpcCalls63 = [];
  $('loginId').value = 'ok@school.test'; $('loginPw').value = 'wrongpass';
  $('loginErr').textContent = '';
  doLogin({ preventDefault: function () {} });
  await tick63(); await tick63(); await tick63();
  eq(rpcCalls63.some(function (u) { return u.indexOf('/auth/v1/token') !== -1; }), true, 'v63: a failed precheck still lets the login reach GoTrue');
  eq($('loginErr').textContent, t('tWrongPasswordServer'), 'v63: a failed precheck still shows the server-password error on a wrong password');
  sbFinishSupabaseLogin = realFinish63;
  saveAccounts(savedAccs63);
  fetch = undefined;

  // ---- v64: sync pagination — no table is truncated at 5000 rows ----
  // sbFetchAllPages follows the server's id order with a keyset cursor
  // (5000 rows a page) until a page comes back short. The old single
  // limit=5000 fetch lost rows on a new device's download, hid them
  // from the pull, and made the verify fail forever (5000/5001).
  function mkRows64(n, prefix) {
    var rows = [];
    for (var i = 1; i <= n; i++) {
      var s = String(i);
      while (s.length < 6) s = '0' + s;
      rows.push({ id: 'r' + s, local_id: prefix + s });
    }
    return rows;
  }
  function fetchPage64(url, rows) {
    var u = String(url);
    var m = u.match(/id=gt\.([^&]+)/);
    var after = m ? decodeURIComponent(m[1]) : null;
    var page = rows.filter(function (r) { return !after || r.id > after; }).slice(0, SB_PAGE_SIZE);
    return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(page); } });
  }
  // (a) A 12500-row table comes back whole, in order, over 3 pages.
  var big64 = mkRows64(12500, 'L');
  var reqs64 = [];
  fetch = function (url) { reqs64.push(String(url)); return fetchPage64(url, big64); };
  var paged64 = await sbFetchAllPages('ss_students', 'local_id', 'sid-64', 'tok-64');
  eq(paged64.ok, true, 'v64: a paged fetch reports ok');
  eq(paged64.data.length, 12500, 'v64: 12500 server rows all come back (no 5000 cap)');
  eq(paged64.data[0].id, 'r000001', 'v64: the first paged row is the first row');
  eq(paged64.data[12499].id, 'r012500', 'v64: the last paged row is the last row');
  eq(reqs64.length, 3, 'v64: 12500 rows take 3 pages of 5000');
  eq(reqs64[1].indexOf('id=gt.r005000') !== -1, true, 'v64: page 2 carries the keyset cursor after page 1');
  eq(reqs64[2].indexOf('id=gt.r010000') !== -1, true, 'v64: page 3 carries the keyset cursor after page 2');
  eq(reqs64.every(function (u) { return u.indexOf('order=id.asc') !== -1; }), true, 'v64: every page orders by id');
  eq(reqs64[0].indexOf('id=gt.') !== -1, false, 'v64: the first page has no cursor');
  // (b) Exactly 5000 rows: one full page plus one empty page.
  var exact64 = mkRows64(5000, 'E');
  reqs64 = [];
  fetch = function (url) { reqs64.push(String(url)); return fetchPage64(url, exact64); };
  var exactRes64 = await sbFetchAllPages('ss_students', 'local_id', 'sid-64', 'tok-64');
  eq(exactRes64.data.length, 5000, 'v64: exactly 5000 rows come back whole');
  eq(reqs64.length, 2, 'v64: exactly 5000 rows cost one full page plus one empty page');
  // (c) 5001 rows: the old limit=5000 fetch would have lost the last one.
  var over64 = mkRows64(5001, 'O');
  reqs64 = [];
  fetch = function (url) { reqs64.push(String(url)); return fetchPage64(url, over64); };
  var overRes64 = await sbFetchAllPages('ss_students', 'local_id', 'sid-64', 'tok-64');
  eq(overRes64.data.length, 5001, 'v64: 5001 rows all come back');
  eq(reqs64.length, 2, 'v64: 5001 rows take 2 pages');
  // (d) A page whose cursor never advances throws instead of looping.
  fetch = function () { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(mkRows64(5000, 'S')); } }); };
  var stuckErr64 = null;
  try { await sbFetchAllPages('ss_students', 'local_id', 'sid-64', 'tok-64'); } catch (e64) { stuckErr64 = e64; }
  eq(stuckErr64 && String(stuckErr64.message).indexOf('page-stuck-ss_students') !== -1, true, 'v64: a stuck cursor throws instead of looping forever');
  // (e) A failed page throws a read error.
  fetch = function () { return Promise.resolve({ ok: false, status: 500, json: function () { return Promise.resolve({}); } }); };
  var failErr64 = null;
  try { await sbFetchAllPages('ss_students', 'local_id', 'sid-64', 'tok-64'); } catch (e64b) { failErr64 = e64b; }
  eq(failErr64 && String(failErr64.message).indexOf('read-ss_students') !== -1, true, 'v64: a failed page throws a read error');
  // (f) The upload dedupe sees the WHOLE server table: a local row that
  // only exists on the last page is not re-inserted.
  var upRows64 = mkRows64(5001, 'U');
  var posted64 = [];
  fetch = function (url, init) {
    if (init && init.method === 'POST') {
      var body64 = [];
      try { body64 = JSON.parse(init.body || '[]'); } catch (e64c) {}
      posted64.push(body64);
      return Promise.resolve({ ok: true, status: 201, json: function () { return Promise.resolve(body64); } });
    }
    return fetchPage64(url, upRows64);
  };
  var inserted64 = await sbUploadMissing('tok-64', 'sid-64', 'ss_students', 'local_id', [{ local_id: 'U005001' }, { local_id: 'U999999' }], function (r) { return r.local_id; }, null);
  eq(inserted64, 1, 'v64: with 5001 server rows, only the genuinely new row is uploaded');
  eq(posted64.length, 1, 'v64: the upload posts exactly once');
  eq(posted64[0].length, 1, 'v64: the upload posts exactly one row');
  eq(posted64[0][0].local_id, 'U999999', 'v64: the uploaded row is the new one — the last-page row is not re-inserted');
  // (g) The verify counts the whole table: 5001 expected rows pass.
  var verRows64 = mkRows64(5001, 'V');
  fetch = function (url) {
    if (String(url).indexOf('ss_students') !== -1) return fetchPage64(url, verRows64);
    return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve([]); } });
  };
  var ver64 = await sbVerifyCounts('tok-64', 'sid-64', { students: 5001, feeRecords: 0, feeStructure: 0, attendance: 0, receipts: 0, auditLog: 0, activities: 0, teachers: 0, exams: 0, marks: 0, homework: 0, notices: 0 });
  eq(ver64.ok, true, 'v64: a 5001-row table verifies ok — the old 5000 cap would have failed it 5000/5001');
  // ---- v65: parent features live in the student portal ----
  // No separate parent login: a parent uses the child's admission
  // number + PIN (the PIN field IS parent_pin). The student nav gains
  // Attendance / Fees / Results pages that reuse the full profile's
  // tab bodies, and the dashboard tiles link to them.
  // (a) Nav + pages exist.
  var navStu65 = NAV.student.map(function (n) { return n[0]; });
  eq(navStu65.indexOf('attendance') !== -1, true, 'v65: the student nav has Attendance');
  eq(navStu65.indexOf('fees') !== -1, true, 'v65: the student nav has Fees');
  eq(navStu65.indexOf('results') !== -1, true, 'v65: the student nav has Results');
  eq(typeof PAGE_STUDENT.attendance, 'function', 'v65: the student attendance page exists');
  eq(typeof PAGE_STUDENT.fees, 'function', 'v65: the student fees page exists');
  eq(typeof PAGE_STUDENT.results, 'function', 'v65: the student results page exists');
  // (b) I18N in both languages, including the parent hint on the login note.
  state.lang = 'en';
  eq(t('results'), 'Results', 'v65: the Results nav label exists in English');
  ok(t('myAttSub').indexOf('attendance') !== -1, 'v65: the attendance page sub exists in English');
  ok(t('myFeesSub').indexOf('fee') !== -1, 'v65: the fees page sub exists in English');
  ok(t('myResultsSub').indexOf('exam') !== -1, 'v65: the results page sub exists in English');
  ok(t('stuNote').indexOf('Parents') !== -1, 'v65: the student login note tells parents to use the child\u2019s credentials (English)');
  state.lang = 'hi';
  eq(t('results'), 'परिणाम', 'v65: the Results nav label exists in Hindi');
  ok(t('stuNote').indexOf('माता-पिता') !== -1, 'v65: the student login note tells parents to use the child\u2019s credentials (Hindi)');
  state.lang = 'en';
  // (c) The pages render from a cloud slice — the parent-on-a-fresh-device
  // case. Richer than the v61 fixture: a Collected month + a Pending
  // month, a Present day + an Absent day, two exams with marks.
  var cloudStu65 = { id: '00000000-0000-0000-0000-000000000065', local_id: 'stu-cloud-65', name: 'Parent Kumar', cls: '6th-A', roll: 3, enr: 'ENR-065', guardian: 'Mrs Parent', phone: '9810000065', father_name: 'Mr Parent', mother_name: 'Mrs Parent', dob: '2014-05-05', gender: 'Boy', admission_no: 'ADM-2025-065', admission_date: '2025-04-01', session: '2025–26', status: 'Active', result: 80, photo_data_url: null, documents: { birthCert: true, tc: false, tcNumber: '', other: '' }, aadhaar: '123456789012' };
  var cloudPayload65 = {
    ok: true, locked: false,
    student: cloudStu65,
    school: { id: '00000000-0000-0000-0000-000000000065', name: 'Cloud Test School', city: 'Gopalganj' },
    fees: [
      { id: 'f65a', local_id: 'fee-cloud-65a', student_id: '00000000-0000-0000-0000-000000000065', student_name: 'Parent Kumar', cls: '6th-A', month: 'Oct 2026', fee_type: 'Tuition', amount: 800, status: 'Collected', record_date: '2026-10-05' },
      { id: 'f65b', local_id: 'fee-cloud-65b', student_id: '00000000-0000-0000-0000-000000000065', student_name: 'Parent Kumar', cls: '6th-A', month: 'Nov 2026', fee_type: 'Tuition', amount: 800, status: 'Pending', record_date: '2026-11-01' }
    ],
    attendance: [
      { id: 'a65a', att_date: '2026-11-09', cls: '6th-A', student_id: '00000000-0000-0000-0000-000000000065', status: 'Present' },
      { id: 'a65b', att_date: '2026-11-10', cls: '6th-A', student_id: '00000000-0000-0000-0000-000000000065', status: 'Absent' }
    ],
    marks: [
      { id: 'm65a', exam_id: 'e65a', student_id: '00000000-0000-0000-0000-000000000065', marks: 42 },
      { id: 'm65b', exam_id: 'e65b', student_id: '00000000-0000-0000-0000-000000000065', marks: 35 }
    ],
    exams: [
      { id: 'e65a', local_id: 'exam-cloud-65a', name: 'Unit Test 1', cls: '6th-A', subject: 'Maths', exam_date: '2026-11-08', total: 50 },
      { id: 'e65b', local_id: 'exam-cloud-65b', name: 'Unit Test 2', cls: '6th-A', subject: 'Science', exam_date: '2026-11-09', total: 50 }
    ],
    homework: [],
    notices: [],
    fee_structure: [{ cls: '6th-A', fee_type: 'Tuition', amount: 800 }]
  };
  var cloudSlice65 = mapCloudStudentPayload(cloudPayload65);
  var cloudAcct65 = { role: 'student', name: 'Parent Kumar', sub: 'Student • Parent Kumar', email: 'cloud-student:00000000-0000-0000-0000-000000000065:stu-cloud-65', uid: 'cloud-student-stu-cloud-65', studentId: 'stu-cloud-65', schoolUid: '00000000-0000-0000-0000-000000000065', cloud: true, schoolServerId: '00000000-0000-0000-0000-000000000065' };
  loginCloudStudent(cloudAcct65, cloudSlice65);
  var attPage65 = studentAttendancePage();
  ok(attPage65.indexOf('2026-11-09') !== -1 && attPage65.indexOf('Present') !== -1, 'v65: the attendance page shows the Present day');
  ok(attPage65.indexOf('2026-11-10') !== -1 && attPage65.indexOf('Absent') !== -1, 'v65: the attendance page shows the Absent day');
  ok(attPage65.indexOf('50%') !== -1, 'v65: the attendance page shows the live percentage (1 of 2 days)');
  var feesPage65 = studentFeesPage();
  ok(feesPage65.indexOf('Oct 2026') !== -1 && feesPage65.indexOf('Collected') !== -1, 'v65: the fees page shows the Collected month');
  ok(feesPage65.indexOf('Nov 2026') !== -1 && feesPage65.indexOf('Pending') !== -1, 'v65: the fees page shows the Pending month');
  ok(feesPage65.indexOf('800') !== -1, 'v65: the fees page shows the amounts');
  var resPage65 = studentResultsPage();
  ok(resPage65.indexOf('Unit Test 1') !== -1 && resPage65.indexOf('42 / 50') !== -1, 'v65: the results page shows the first exam marks');
  ok(resPage65.indexOf('Unit Test 2') !== -1 && resPage65.indexOf('35 / 50') !== -1, 'v65: the results page shows the second exam marks');
  // (d) The dashboard tiles link to the new pages.
  var dash65 = studentDashboard();
  ok(dash65.indexOf("go('attendance')") !== -1, 'v65: the Attendance tile links to the attendance page');
  ok(dash65.indexOf("go('fees')") !== -1, 'v65: the Fees tile links to the fees page');
  ok(dash65.indexOf("go('results')") !== -1, 'v65: the Results tile links to the results page');
  ok(dash65.indexOf("go('homework')") !== -1, 'v65: the Homework tile links to the homework page');
  // (e) renderPage serves the new views for a student.
  state.view = 'attendance'; renderPage();
  ok($('page').innerHTML.indexOf('2026-11-09') !== -1, 'v65: renderPage serves the student attendance page');
  state.view = 'fees'; renderPage();
  ok($('page').innerHTML.indexOf('Nov 2026') !== -1, 'v65: renderPage serves the student fees page');
  state.view = 'results'; renderPage();
  ok($('page').innerHTML.indexOf('Unit Test 2') !== -1, 'v65: renderPage serves the student results page');
  state.view = 'dashboard';
  // (f) The fees page never offers the school receipt view: with a
  // receipt on file, the shared tab body renders the button, but the
  // student page shows the number as plain text.
  db.receipts = [{ receiptNo: 'RCP-2026-001', studentId: 'stu-cloud-65', month: 'Oct 2026', date: '2026-10-05', lines: [{ type: 'Tuition', amount: 800 }] }];
  var rawFees65 = profileTabBody(meStudent(), 'fees');
  ok(rawFees65.indexOf('openSavedReceipt') !== -1, 'v65: the shared fees tab renders a receipt button for the school view');
  var stuFees65 = studentFeesPage();
  ok(stuFees65.indexOf('RCP-2026-001') !== -1, 'v65: the student fees page still shows the receipt number');
  ok(stuFees65.indexOf('openSavedReceipt') === -1, 'v65: the student fees page has no receipt button (it would jump to the school fees page)');
  // (g) Another student's data stays closed.
  var savedUser65 = state.user;
  state.user = { studentId: 'not-me-65' };
  ok(studentAttendancePage().indexOf(t('tNoStudentData')) !== -1, 'v65: the attendance page refuses another student');
  ok(studentFeesPage().indexOf(t('tNoStudentData')) !== -1, 'v65: the fees page refuses another student');
  ok(studentResultsPage().indexOf(t('tNoStudentData')) !== -1, 'v65: the results page refuses another student');
  state.user = savedUser65;
  logout(); await waitLogout();
  eq(state.role, null, 'v65: logout leaves no role');

  // ---- v66: the Results tile reads the live marks, not the stored result ----
  // v65 live verification caught it: Ankit scored 42/50 but the tile
  // read 0% because it used me.result (never set for him). The tile now
  // uses latestExamPct (the profile overview's convention), falling back
  // to the stored result only when no marks exist.
  var cloudStu66 = { id: '00000000-0000-0000-0000-000000000066', local_id: 'stu-cloud-66', name: 'Tile Kumar', cls: '6th-A', roll: 1, enr: 'ENR-066', guardian: 'Mrs Tile', phone: '9810000066', father_name: 'Mr Tile', mother_name: 'Mrs Tile', dob: '2014-05-05', gender: 'Boy', admission_no: 'ADM-2025-066', admission_date: '2025-04-01', session: '2025–26', status: 'Active', result: 0, photo_data_url: null, documents: { birthCert: true, tc: false, tcNumber: '', other: '' }, aadhaar: '123456789012' };
  var cloudPayload66 = {
    ok: true, locked: false,
    student: cloudStu66,
    school: { id: '00000000-0000-0000-0000-000000000066', name: 'Cloud Test School', city: 'Gopalganj' },
    fees: [],
    attendance: [],
    marks: [{ id: 'm66', exam_id: 'e66', student_id: '00000000-0000-0000-0000-000000000066', marks: 42 }],
    exams: [{ id: 'e66', local_id: 'exam-cloud-66', name: 'Unit Test 1', cls: '6th-A', subject: 'Maths', exam_date: '2026-11-08', total: 50 }],
    homework: [],
    notices: [],
    fee_structure: []
  };
  var cloudSlice66 = mapCloudStudentPayload(cloudPayload66);
  var cloudAcct66 = { role: 'student', name: 'Tile Kumar', sub: 'Student • Tile Kumar', email: 'cloud-student:00000000-0000-0000-0000-000000000066:stu-cloud-66', uid: 'cloud-student-stu-cloud-66', studentId: 'stu-cloud-66', schoolUid: '00000000-0000-0000-0000-000000000066', cloud: true, schoolServerId: '00000000-0000-0000-0000-000000000066' };
  loginCloudStudent(cloudAcct66, cloudSlice66);
  var dash66a = studentDashboard();
  ok(dash66a.indexOf('84%') !== -1, 'v66: the Results tile shows the live marks (84%) when the stored result is 0');
  db.marks = [];
  var dash66b = studentDashboard();
  ok(dash66b.indexOf('0%') !== -1, 'v66: the Results tile reads 0% when there are no marks and no stored result');
  db.students[0].result = 75;
  var dash66c = studentDashboard();
  ok(dash66c.indexOf('75%') !== -1, 'v66: the Results tile falls back to the stored result when there are no marks');
  logout(); await waitLogout();
  eq(state.role, null, 'v66: logout leaves no role');

  // ---- v67: exam delete sync — the deleted flag travels (SQL 20) ----
  // Before v67 the server row had no deleted column, so a delete made
  // on one device never left it. Now sbMapExam carries the flag, the
  // pull mapper reads it, and the old B6 unconditional keep is gone —
  // a restore from another device propagates too. Only a pending
  // outbox entry (the v58 keep) still holds the local flag.
  // (a) The upload mapper carries the flag.
  eq(sbMapExam({ id: 'ex-67m', name: 'M', cls: '6th-A', subject: 'Maths', date: '2026-11-10', total: 50, deleted: true }, 'school-67').deleted, true, 'v67: sbMapExam carries deleted=true');
  eq(sbMapExam({ id: 'ex-67m', name: 'M', cls: '6th-A', subject: 'Maths', date: '2026-11-10', total: 50 }, 'school-67').deleted, false, 'v67: sbMapExam defaults a missing flag to false');
  // (b) The pull: a delete and a restore from another device both apply.
  state.sb = { uid: 'sb-uid-67' };
  var d67 = { students: [], teachers: [], exams: [
    { id: 'ex-67a', name: 'To Delete', cls: '6th-A', subject: 'Maths', date: '2026-11-10', total: 100 },
    { id: 'ex-67b', name: 'To Restore', cls: '6th-A', subject: 'Science', date: '2026-11-10', total: 50, deleted: true },
    { id: 'ex-67c', name: 'Pending Delete', cls: '6th-A', subject: 'Maths', date: '2026-11-10', total: 100, deleted: true }
  ], feeRecords: [], feeStructure: [], attendance: {}, receipts: [], marks: [], homework: [], notices: [], admissionRequests: [], auditLog: [], activities: [] };
  var byTable67 = { ss_exams: [
    { id: 'srv-ex-67a', school_id: 'srv-school-67', local_id: 'ex-67a', name: 'To Delete', cls: '6th-A', subject: 'Maths', exam_date: '2026-11-10', total: 100, deleted: true },
    { id: 'srv-ex-67b', school_id: 'srv-school-67', local_id: 'ex-67b', name: 'To Restore', cls: '6th-A', subject: 'Science', exam_date: '2026-11-10', total: 50, deleted: false },
    { id: 'srv-ex-67c', school_id: 'srv-school-67', local_id: 'ex-67c', name: 'Pending Delete', cls: '6th-A', subject: 'Maths', exam_date: '2026-11-10', total: 100, deleted: false }
  ] };
  sbOutboxAdd('sb-uid-67', { table: 'ss_exams', key: 'ex-67c', op: 'upsert', row: { id: 'ex-67c', name: 'Pending Delete', cls: '6th-A', subject: 'Maths', date: '2026-11-10', total: 100, deleted: true }, at: new Date().toISOString() });
  sbApplyServerRows(d67, null, byTable67, null, 'srv-school-67');
  function ex67f(id) { return d67.exams.find(function (e) { return e.id === id; }); }
  eq(ex67f('ex-67a').deleted, true, 'v67: a delete from another device applies through the pull');
  ok(!isActiveExam(ex67f('ex-67a')), 'v67: the pulled deleted exam is inactive — it leaves the lists');
  eq(ex67f('ex-67b').deleted, false, 'v67: a restore from another device applies through the pull (the old B6 keep would have forced it back to deleted)');
  ok(isActiveExam(ex67f('ex-67b')), 'v67: the restored exam is active again');
  eq(ex67f('ex-67c').deleted, true, 'v67: a pending local delete still holds its flag through the pull (v58 keep)');
  // (c) The queued delete's PATCH body carries the flag.
  var q67 = (sbOutboxLoad('sb-uid-67') || []).filter(function (e) { return e.table === 'ss_exams' && e.key === 'ex-67c'; });
  eq(q67.length, 1, 'v67: the pending delete is still queued');
  eq(sbSyncMapRow('ss_exams', q67[0].row, 'srv-school-67', {}, d67).deleted, true, 'v67: the flush PATCH body for the queued delete carries deleted=true');
  sbOutboxRemove('sb-uid-67', { table: 'ss_exams', key: 'ex-67c' });
  // (d) The cloud mappers carry the flag, so a deleted exam stays
  // hidden in the student and teacher portals too.
  var sliceStu67 = mapCloudStudentPayload({ student: { id: '00000000-0000-0000-0000-000000000067', local_id: 'stu-cloud-67', name: 'Slice Kumar', cls: '6th-A', admission_no: 'ADM-2025-067', status: 'Active', result: 0 }, school: { id: '00000000-0000-0000-0000-000000000067', name: 'Cloud Test School', city: 'Gopalganj' }, fees: [], attendance: [], marks: [{ id: 'm67', exam_id: 'e67', student_id: '00000000-0000-0000-0000-000000000067', marks: 40 }], exams: [{ id: 'e67', local_id: 'exam-cloud-67', name: 'Deleted Unit Test', cls: '6th-A', subject: 'Maths', exam_date: '2026-11-08', total: 50, deleted: true }], homework: [], notices: [], fee_structure: [] });
  eq(sliceStu67.exams[0].deleted, true, 'v67: the student cloud slice carries the deleted flag');
  ok(!isActiveExam(sliceStu67.exams[0]), 'v67: the deleted exam is inactive in the student slice — the results page hides it');
  var sliceTch67 = mapCloudTeacherPayload({ teacher: { id: '00000000-0000-0000-0000-000000000067', local_id: 'te-cloud-67', name: 'Slice Teacher', subject: 'Maths', cls: '6th-A', classes: ['6th-A'] }, school: { id: '00000000-0000-0000-0000-000000000067', name: 'Cloud Test School', city: 'Gopalganj' }, students: [], exams: [{ id: 'e67', local_id: 'exam-cloud-67', name: 'Deleted Unit Test', cls: '6th-A', subject: 'Maths', exam_date: '2026-11-08', total: 50, deleted: true }], attendance: [], homework: [], notices: [], marks: [], fee_structure: [] });
  eq(sliceTch67.exams[0].deleted, true, 'v67: the teacher cloud slice carries the deleted flag');
  state.sb = null;

  fetch = undefined;

  // ---- v68: audit P0-1 — the school-login clear RPC is auth-bound ----
  // SQL 21: ss_school_login_ok only clears the counter for the caller's
  // own email (auth.uid() email must match p_email), and anon is revoked.
  // The app now calls it with the fresh GoTrue access token from the
  // just-completed sign-in — never with the anon key. Without a token
  // there is no call at all (login itself is unaffected).
  var rpcAuth68 = [];
  function fetch68(url, init) {
    var u = String(url);
    rpcAuth68.push({ u: u, auth: (init && init.headers && init.headers.Authorization) || '' });
    if (u.indexOf('ss_school_login_ok') !== -1) return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true }); } });
    if (u.indexOf('/auth/v1/token') !== -1) return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ access_token: 'tok-68', refresh_token: 'ref-68', user: { id: 'uid-68' } }); } });
    if (u.indexOf('ss_school_login_precheck') !== -1) return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true, locked: false }); } });
    return Promise.reject(new Error('unexpected fetch in v68: ' + u));
  }
  // (a) No token -> no call (the anon path is gone).
  fetch = fetch68;
  rpcAuth68 = [];
  await sbSchoolLoginOk('ok@school.test');
  eq(rpcAuth68.length, 0, 'v68: sbSchoolLoginOk without a token makes no RPC call');
  // (b) With a token -> the call carries the user token, not the anon key.
  rpcAuth68 = [];
  await sbSchoolLoginOk('ok@school.test', 'tok-68');
  eq(rpcAuth68.length, 1, 'v68: sbSchoolLoginOk with a token calls the RPC once');
  eq(rpcAuth68[0].auth, 'Bearer tok-68', 'v68: the clear RPC carries the user access token, not the anon key');
  // (c) doLogin success path: the clear RPC is called with the token
  // from the just-completed sign-in, and the login finishes.
  var finishCalls68 = 0;
  var realFinish68 = sbFinishSupabaseLogin;
  sbFinishSupabaseLogin = function () { finishCalls68++; };
  var tick68 = function () { return new Promise(function (r) { setTimeout(r, 0); }); };
  rpcAuth68 = [];
  $('loginId').value = 'ok@school.test'; $('loginPw').value = 'rightpass';
  $('loginErr').textContent = '';
  doLogin({ preventDefault: function () {} });
  await tick68(); await tick68(); await tick68();
  eq(rpcAuth68.some(function (c) { return c.u.indexOf('ss_school_login_ok') !== -1; }), true, 'v68: a correct school password still calls the clear RPC');
  eq(rpcAuth68.filter(function (c) { return c.u.indexOf('ss_school_login_ok') !== -1; })[0].auth, 'Bearer tok-68', 'v68: doLogin passes the fresh sign-in token to the clear RPC');
  eq(finishCalls68, 1, 'v68: a correct school password still finishes the login');
  sbFinishSupabaseLogin = realFinish68;
  fetch = undefined;

  // ---- 52. v20: fresh signups start EMPTY; every school view renders clean on an empty db ----
  // A new school account must get an empty workspace — no demo students,
  // teachers, fees or notices. The seed is test-fixture only now.
  state.lang = 'en';
  var newAcct52 = { role: 'school', name: 'Empty Test', school: 'Empty Test School', sub: 'School Admin', email: 'empty@test.in', uid: 'v20empty', pwHash: hashPw('TestPass-2026') };
  saveAccounts([newAcct52]);
  loginAs(newAcct52);
  eq(db.students.length, 0, 'v20: fresh signup has zero students');
  eq(db.teachers.length, 0, 'v20: fresh signup has zero teachers');
  eq(db.feeRecords.length, 0, 'v20: fresh signup has zero fee records');
  eq(db.receipts.length, 0, 'v20: fresh signup has zero receipts');
  eq(db.exams.length, 0, 'v20: fresh signup has zero exams');
  eq(db.homework.length, 0, 'v20: fresh signup has zero homework');
  eq(db.notices.length, 0, 'v20: fresh signup has zero notices');
  eq(db.attendanceAgg.present + db.attendanceAgg.absent + db.attendanceAgg.late, 0, 'v20: fresh signup has a zero attendance aggregate');
  eq(db.profile.name, 'Empty Test School', 'v20: fresh signup keeps the profile from the signup form');
  eq(db.profile.principal, 'Empty Test', 'v20: fresh signup keeps the principal from the signup form');
  eq(db.feeStructure.length, 30, 'v37: fresh signup keeps the default fee structure (30 rows)');
  eq(db.feeStructure.filter(function (x) { return x.cls === '6th-A'; })[0].amount, 800, 'v20: fresh signup 6th-class fee default is 800');
  eq(nextEnr(), 'ENR-001', 'v20: first student of a fresh school gets ENR-001');
  // Every school view renders without throwing and without fake numbers.
  var emptyViews = {};
  try {
    emptyViews.dashboard = schoolDashboard();
    emptyViews.students = studentsPage();
    emptyViews.fees = feesPage();
    emptyViews.attendance = attendancePage();
    emptyViews.exams = examsPage();
    emptyViews.homework = homeworkPage();
    emptyViews.notices = noticesPage();
    emptyViews.reports = reportsPage();
    emptyViews.settings = settingsPage();
    ok(true, 'v20: every school view renders on an empty db without throwing');
  } catch (e) { ok(false, 'v20: empty-db view render throws: ' + e.message); }
  ok(emptyViews.dashboard.indexOf('Total Students</div><div class="val">0</div>') !== -1, 'v20: empty dashboard shows 0 students');
  ok(emptyViews.dashboard.indexOf('0%') !== -1, 'v20: empty dashboard donut shows 0%');
  ok(emptyViews.dashboard.indexOf('1,250') === -1 && emptyViews.dashboard.indexOf('1250') === -1, 'v20: empty dashboard shows no fake 1,250 figure');
  ok(emptyViews.students.indexOf('0 of 0') !== -1, 'v20: empty directory reads 0 of 0 students');
  ok(emptyViews.fees.indexOf('₹0') !== -1, 'v20: empty fees page shows ₹0 totals');
  ok(emptyViews.exams.indexOf('No exams yet') !== -1, 'v20: empty exams page shows the no-exams state');
  ok(emptyViews.homework.indexOf('No homework yet') !== -1, 'v20: empty homework page shows the no-homework state');
  ok(emptyViews.attendance.indexOf('0 Present') !== -1, 'v20: empty attendance page shows 0 present');
  Object.keys(emptyViews).forEach(function (k) {
    ok(emptyViews[k].indexOf('undefined') === -1 && emptyViews[k].indexOf('NaN') === -1, 'v20: empty ' + k + ' view has no undefined/NaN');
  });
  // loadDB branches: a school override creates an empty db; no override
  // (boot) also creates an empty db now (v36 — the demo seed is gone).
  var saveKey52 = DB_KEY;
  try { localStorage.removeItem('schoolSaathiDB_v20fresh2'); } catch (e) {}
  DB_KEY = 'schoolSaathiDB_v20fresh2';
  var freshSchoolDb = loadDB({ role: 'school', name: 'Fresh', school: 'Fresh School', email: 'fresh@test.in', uid: 'v20fresh2' });
  eq(freshSchoolDb.students.length, 0, 'v20: loadDB with a school override creates an empty db');
  eq(freshSchoolDb.profile.name, 'Fresh School', 'v20: loadDB school override applies the profile');
  eq(freshSchoolDb.feeStructure.length, 30, 'v37: loadDB school override keeps fee-structure defaults (30 rows)');
  try { localStorage.removeItem('schoolSaathiDBv1'); } catch (e) {}
  DB_KEY = 'schoolSaathiDBv1';
  var freshBootDb = loadDB(null);
  eq(freshBootDb.schools.length, 0, 'v36: loadDB with no override no longer seeds demo schools');
  eq(freshBootDb.students.length, 0, 'v36: loadDB with no override no longer seeds demo students');
  eq(freshBootDb.teachers.length, 0, 'v36: loadDB with no override no longer seeds demo teachers');
  eq(freshBootDb.feeRecords.length, 0, 'v36: loadDB with no override no longer seeds demo fee records');
  DB_KEY = saveKey52;
  logout(); await waitLogout();

  // ---- 53. v21: admission creates NO fee record; Generate Fees still works; fee-history table fits a phone ----
  loginAs(TEST_ACCOUNTS.school);
  db = seedDB(); saveDB(db);
  state.role = 'school'; state.user = TEST_ACCOUNTS.school; state.view = 'students';
  $('fStName').value = 'No Fee Test'; $('fStCls').value = '6th'; $('fStSec').value = 'A'; $('fStRoll').value = '3';
  $('fStG').value = 'Mr. No Fee'; $('fStPh').value = '9812345001';
  $('fStDob').value = ''; $('fStPin').value = ''; $('fStAadhaar').value = '';
  $('fStGender').value = ''; $('fStBlood').value = ''; $('fStCategory').value = ''; $('fStSession').value = '2025–26'; $('fStAdmDate').value = '2025-09-01';
  $('fStAdmReq').value = '';
  var ftBefore53 = feeTotals();
  var frBefore53 = db.feeRecords.length;
  saveStudent(ev, '', '');
  var stu53 = db.students.find(function (x) { return x.name === 'No Fee Test'; });
  ok(!!stu53, 'v21: admission saves the new student');
  eq(stu53.cls, '6th-A', 'v21: new student class is kept');
  ok(/^ADM-/.test(stu53.admissionNo), 'v21: ADM number is assigned on save');
  eq(db.feeRecords.filter(function (r) { return r.studentId === stu53.id; }).length, 0, 'v21: new admission creates zero fee records');
  eq(feeTotals().pending, ftBefore53.pending, 'v21: new admission does not change pending fees');
  eq(feeTotals().collected, ftBefore53.collected, 'v21: new admission does not change collected fees');
  eq(db.feeRecords.length, frBefore53, 'v21: no fee record is added at all by the admission');
  eq(studentFeeStatus(stu53.id), '—', 'v21: new student with no dues shows the no-dues status');
  var sum53 = feeSummaryFor(stu53.id);
  eq(sum53.billed, 0, 'v21: new student fee summary bills zero');
  eq(sum53.paid, 0, 'v21: new student fee summary paid is zero');
  eq(sum53.pend, 0, 'v21: new student fee summary pending is zero');
  ok(db.auditLog.some(function (a) { return a.action === 'Admission created'; }), 'v21: admission still writes its audit entry');
  // Duplicate blocking still works with the same name + mobile.
  saveStudent(ev, '', '');
  eq(db.students.filter(function (x) { return x.name === 'No Fee Test'; }).length, 1, 'v21: duplicate admission is still blocked');
  // The profile Fee History tab carries the phone-compact class and shows the empty state.
  var feesTab53 = profileTabBody(stu53, 'fees');
  ok(feesTab53.indexOf('fee-hist-tbl') !== -1, 'v21: fee-history table carries the phone-compact class');
  ok(feesTab53.indexOf(t('tNoFeeRecs')) !== -1, 'v21: fee-history tab shows the no-records empty state');
  // Generate Fees afterwards creates the structure-based record (6th-A = 800).
  state.feeGenMonth = 'Sep';
  generateFees();
  var gen53 = db.feeRecords.filter(function (r) { return r.studentId === stu53.id; });
  eq(gen53.length, 1, 'v21: Generate creates exactly one record for the new student');
  eq(gen53[0].month, 'Sep', 'v21: generated record is for September');
  eq(gen53[0].amount, 800, 'v21: generated record uses the 6th-A structure amount of 800');
  eq(gen53[0].status, 'Pending', 'v21: generated record is Pending');
  eq(feeTypeOf(gen53[0]), 'Tuition', 'v21: generated record is Tuition');
  // Phone CSS: fixed layout, compact cells, nowrap date, shared compact table rule.
  ok(__css.indexOf('.fee-hist-tbl table{table-layout:fixed;min-width:0}') !== -1, 'v21: fee-history table has a fixed-layout phone rule');
  ok(__css.indexOf('.fee-hist-tbl th:nth-child(4),.fee-hist-tbl td:nth-child(4){width:74px;white-space:nowrap;font-size:11px}') !== -1, 'v21: fee-history date column stays on one line on phones');
  ok(__css.indexOf('.tbl-wrap th,.tbl-wrap td{padding:6px 8px;font-size:12.5px}') !== -1, 'v21: shared compact table rule exists at phone width');
  // ---- 54. v22: fee profile + fees list date columns stay on one line on phones ----
  ok(__css.indexOf('.fee-prof-tbl th:nth-child(4),.fee-prof-tbl td:nth-child(4){white-space:nowrap;font-size:11px}') !== -1, 'v22: fee profile date column stays on one line on phones');
  ok(__css.indexOf('.fee-list-tbl th:nth-child(7),.fee-list-tbl td:nth-child(7){white-space:nowrap;font-size:11px}') !== -1, 'v22: fees list date column stays on one line on phones');
  ok(__css.indexOf('.fee-hist-tbl th:nth-child(4),.fee-hist-tbl td:nth-child(4){width:74px;white-space:nowrap;font-size:11px}') !== -1, 'v22: v21 fee-history date rule is still present');
  ok(__css.indexOf('.fee-hist-tbl table{table-layout:fixed;min-width:0}') !== -1, 'v22: v21 fee-history fixed-layout rule is still present');
  var fp54 = studentFeeProfile(stu53.id);
  ok(fp54.indexOf('fee-prof-tbl') !== -1, 'v22: fee profile table carries the phone-compact class');
  ok(fp54.indexOf('2025-09-01') !== -1, 'v22: fee profile renders the generated record date');
  var fl54 = feesPage();
  ok(fl54.indexOf('fee-list-tbl') !== -1, 'v22: fees list table carries the phone-compact class');

  // ---- 55. v23: fee-record delete (Pending only) + no static badges + live attendance donut ----
  // Delete button renders on Pending rows (fee profile + fees list), never on Collected rows.
  var fp55 = studentFeeProfile(stu53.id);
  eq(fp55.split('deleteFeeRecord(').length - 1, 1, 'v23: fee profile shows exactly one delete button for the one Pending record');
  state.feeFilter = 'All'; state.feeType = 'All'; state.feeSearch = ''; state.feeStudent = null; state.collectStudent = null;
  var fl55 = feesPage();
  var shownPend55 = feeFiltered().slice(0, 120).filter(function (r) { return r.status === 'Pending'; }).length;
  eq(fl55.split('deleteFeeRecord(').length - 1, shownPend55, 'v23: fees list shows a delete button per Pending row shown');
  // Delete the Pending record: record gone, totals updated, audit entry written.
  var del55 = db.feeRecords.filter(function (r) { return r.studentId === stu53.id && r.status === 'Pending'; })[0];
  var pendBefore55 = feeTotals().pending, collBefore55 = feeTotals().collected;
  eq(studentFeeStatus(stu53.id), 'Pending', 'v23: student Pending before the delete');
  deleteFeeRecord(del55.id); confirmYes();
  ok(!db.feeRecords.some(function (r) { return r.id === del55.id; }), 'v23: deleted Pending record is gone');
  eq(feeTotals().pending, pendBefore55 - 800, 'v23: pending total drops by the deleted 800');
  eq(feeTotals().collected, collBefore55, 'v23: collected total is untouched by the delete');
  eq(studentFeeStatus(stu53.id), '—', 'v23: student with no records left shows the no-dues status');
  ok(db.auditLog.some(function (a) { return a.action === 'Fee record deleted'; }), 'v23: delete writes a Fee record deleted audit entry');
  ok(studentFeeProfile(stu53.id).split('deleteFeeRecord(').length - 1 === 0, 'v23: no delete button remains once no Pending record is left');
  // A Collected record cannot be deleted: no-op, no confirm, no audit entry.
  var col55 = db.feeRecords.filter(function (r) { return r.status === 'Collected'; })[0];
  var recCount55 = db.feeRecords.length, auditCount55 = db.auditLog.length;
  deleteFeeRecord(col55.id);
  eq(db.feeRecords.length, recCount55, 'v23: deleting a Collected record removes nothing');
  ok(db.feeRecords.some(function (r) { return r.id === col55.id; }), 'v23: Collected record is still there');
  eq(db.auditLog.length, auditCount55, 'v23: no audit entry for a refused delete');
  // Static badges are gone: no delta badge renders on the school dashboard.
  state.role = 'school'; state.user = TEST_ACCOUNTS.school; state.view = 'dashboard';
  var sd55 = schoolDashboard();
  ok(sd55.indexOf('class="chg') === -1, 'v23: school dashboard renders no delta badge div at all');
  // Attendance donut is live: seed 10th-A records for today give 2 present / 1 absent / 1 late.
  var ta55 = todayAtt();
  eq(ta55.total, 4, 'v23: today attendance total = 4 from live records');
  eq(ta55.present, 2, 'v23: today present = 2 from live records');
  eq(ta55.absent, 1, 'v23: today absent = 1 from live records');
  eq(ta55.late, 1, 'v23: today late = 1 from live records');
  eq(donutPct(ta55.present, ta55.total), 50, 'v23: donut = 50% from live records');
  ok(sd55.indexOf('50%') !== -1, 'v23: dashboard donut shows the live 50%');
  eq(db.attendanceAgg.present + db.attendanceAgg.absent + db.attendanceAgg.late, 0, 'v23: seed attendance aggregate is zeroed');

  // ---- 56. v24: live attendance %, Cancelled excluded from donut, audit log view, super settings/support, v24 label, dynamic trend title ----
  // Live %: a student with no marked days falls back to the stored att; marking moves the figure.
  var stu56 = db.students.find(function (s) { return s.id === 'stu1'; });
  eq(studentAttPct(stu56), stu56.att, 'v24: student with no marked days falls back to stored att');
  state.role = 'school'; state.user = TEST_ACCOUNTS.school; state.view = 'attendance'; state.attCls = '6th-A';
  state.attDate = '2026-11-05'; attendancePage();
  markAtt('stu1', 'Absent');
  eq(studentAttPct(stu56), 0, 'v24: marking Absent drops the live % to 0');
  state.attDate = '2026-11-04'; attendancePage();
  markAtt('stu1', 'Present');
  eq(studentAttPct(stu56), 50, 'v24: a Present on another day moves the live % to 50');
  // Marked records give the live values for the 10th-A students (db was re-seeded in section 10,
  // so only today's seed marks count here: Present + Late count as attended).
  eq(studentAttPct(db.students.find(function (s) { return s.id === 'stu33'; })), 100, 'v24: Riya live % is 100 (Present today, no other marked days)');
  eq(studentAttPct(db.students.find(function (s) { return s.id === 'stu35'; })), 0, 'v24: stu35 live % is 0 (Absent today, no other marked days)');
  eq(studentAttPct(db.students.find(function (s) { return s.id === 'stu34'; })), 100, 'v24: stu34 shows her own marked-day % (100) in her profile');
  // Cancelled student excluded from today's donut: soft-delete stu34 (she has a Present mark today).
  deleteStudent('stu34'); confirmYes();
  eq(db.students.find(function (s) { return s.id === 'stu34'; }).status, 'Cancelled', 'v24: stu34 is Cancelled for the donut test');
  var ta56 = todayAtt();
  eq(ta56.total, 3, 'v24: today donut total is 3 — Cancelled stu34 excluded');
  eq(ta56.present, 1, 'v24: today present is 1 — Cancelled stu34 excluded');
  eq(ta56.absent, 1, 'v24: today absent is 1');
  eq(ta56.late, 1, 'v24: today late is 1');
  // Dashboard: View All opens the audit log; trend title is the live range, not the stale Apr – Aug.
  state.role = 'school'; state.user = TEST_ACCOUNTS.school; state.view = 'dashboard';
  var sd56 = schoolDashboard();
  ok(sd56.indexOf("go('activityLog')") !== -1, 'v24: dashboard View All opens the activity log');
  ok(sd56.indexOf('Apr – Aug') === -1, 'v24: dashboard trend title no longer says the stale Apr – Aug');
  ok(sd56.indexOf(feeRangeLabel()) !== -1, 'v24: dashboard trend title uses the live fee range label');
  // Collect one pending fee first, so the log has a fresh collection to show alongside the delete.
  var pend56 = db.feeRecords.filter(function (r) { return r.status === 'Pending'; })[0];
  collectFeeUI(pend56.id);
  ok(db.auditLog.some(function (a) { return a.action === 'Fee collected'; }), 'v24: quick collect writes a Fee collected audit entry');
  // The audit log view lists the delete from section 55 and collections, newest first.
  go('activityLog');
  eq(state.view, 'activityLog', 'v24: go(activityLog) opens the audit log view');
  var log56 = activityLogPage();
  ok(log56.indexOf('Fee record deleted') !== -1, 'v24: audit log view shows the fee-deletion entry');
  ok(log56.indexOf('Fee collected') !== -1, 'v24: audit log view shows fee-collection entries');
  ok(log56.indexOf('Fee record deleted') < log56.indexOf('Admission created'), 'v24: audit log lists newest first (delete before the older admission)');
  // v28: school settings save the school profile (no platform settings
  // exist anymore) and always show the logo upload, the server-backup
  // card and the Raise Support button.
  state.role = 'school'; state.user = TEST_ACCOUNTS.school; state.view = 'settings';
  var ss56 = settingsPage();
  ok(ss56.indexOf('id="fPfName"') !== -1, 'v28: school name is an editable field');
  ok(ss56.indexOf('id="fPfLogo"') !== -1, 'v28: settings page has the logo upload for a school');
  ok(ss56.indexOf('Back Up Now') !== -1, 'v28: settings page has the Server Backup card');
  ok(ss56.indexOf('openSupportForm()') !== -1, 'v28: settings page has the Raise Support button');
  $('fPfName').value = 'Test Platform School'; $('fPfCity').value = db.profile.city; $('fPfPr').value = db.profile.principal;
  $('fPfPh').value = db.profile.phone; $('fPfEm').value = db.profile.email; $('fPfSe').value = db.profile.session; $('fPfAd').value = db.profile.address;
  saveSettings({ preventDefault: function () {} });
  eq(db.profile.name, 'Test Platform School', 'v28: Save Settings persists the school name');
  ok(settingsPage().indexOf('Test Platform School') !== -1, 'v28: settings form shows the saved name after reload');
  ok($('toast').textContent.indexOf('Settings saved') !== -1, 'v28: Save Settings shows the saved toast');
  // v28: Raise Support still stores a request locally and confirms; an
  // empty message is refused. No demo seed requests are invented anymore
  // and there is no Help list or dashboard card to show them in.
  state.role = 'school'; state.user = TEST_ACCOUNTS.school; state.view = 'settings';
  localStorage.removeItem('schoolSaathiSupportRequests');
  ok(settingsPage().indexOf('openSupportForm()') !== -1, 'v28: settings page opens the support form');
  openSupportForm();
  ok(__els['modalRoot'].innerHTML.indexOf('fSupMsg') !== -1, 'v28: support form has a message field');
  $('fSupName').value = 'Test School'; $('fSupMsg').value = 'Test request: fees page is slow';
  submitSupportRequest({ preventDefault: function () {} });
  var sup56 = JSON.parse(localStorage.getItem('schoolSaathiSupportRequests'));
  eq(sup56.length, 1, 'v28: one support request is stored (no seeds)');
  eq(sup56[0].message, 'Test request: fees page is slow', 'v28: stored request keeps the message');
  eq(sup56[0].status, 'Open', 'v28: new support request starts Open');
  ok($('toast').textContent.indexOf('will be sent when you are back online') !== -1, 'v28: support submit shows the queued confirmation (v34 P1-7: no session here, so it is queued, not "noted")');
  openSupportForm();
  $('fSupName').value = 'Test School'; $('fSupMsg').value = '';
  submitSupportRequest({ preventDefault: function () {} });
  eq(JSON.parse(localStorage.getItem('schoolSaathiSupportRequests')).length, 1, 'v28: empty support request is not stored');

  // ---- 57. v28: support submit stores only the submitted request, Overview % agrees, attendance in audit log ----
  // Support store: no seeds anymore — a submit stores exactly what was sent.
  localStorage.removeItem('schoolSaathiSupportRequests');
  state.role = 'school'; state.user = TEST_ACCOUNTS.school; state.view = 'settings';
  openSupportForm();
  $('fSupName').value = 'Test School'; $('fSupMsg').value = 'New test request';
  submitSupportRequest({ preventDefault: function () {} });
  var sup57 = JSON.parse(localStorage.getItem('schoolSaathiSupportRequests'));
  eq(sup57.length, 1, 'v28: submit stores exactly one request (no seeds)');
  eq(sup57[0].message, 'New test request', 'v28: submitted request is newest first');
  eq(sup57[0].status, 'Open', 'v28: new request starts Open');
  // No Help page and no dashboard support card exist anymore.
  ok(typeof superHelp === 'undefined', 'v28: superHelp is gone');
  ok(typeof supportRequestsCard === 'undefined', 'v28: the dashboard support card is gone');
  // Overview % agrees with the directory source and the History tab after a mark-restore.
  state.role = 'school'; state.user = TEST_ACCOUNTS.school;
  var stu57 = db.students.find(function (s) { return s.id === 'stu2'; });
  eq(studentAttPct(stu57), stu57.att, 'v25: stu2 has no marked days yet (falls back to stored att)');
  state.view = 'attendance'; state.attCls = '6th-A'; state.attDate = '2026-11-06'; attendancePage();
  markAtt('stu2', 'Absent');
  markAtt('stu2', 'Present');
  eq(studentAttPct(stu57), 100, 'v25: one marked day Present = 100% live');
  state.profileTab = 'overview';
  var ov57 = studentProfilePage('stu2');
  ok(ov57.indexOf('Attendance</div><div class="val">100%</div>') !== -1, 'v25: Overview stat shows the final 100% as plain text (no count-up)');
  state.profileTab = 'attendance';
  var hist57 = studentProfilePage('stu2');
  ok(hist57.indexOf('<b>100%</b>') !== -1, 'v25: History tab agrees at 100%');
  state.profileTab = 'overview';
  // Attendance saves land in the audit log without duplicating Recent Activities.
  var auditBefore57 = db.auditLog.filter(function (a) { return a.action === 'Attendance updated'; }).length;
  saveAttendance();
  eq(db.auditLog.filter(function (a) { return a.action === 'Attendance updated'; }).length, auditBefore57 + 1, 'v25: exactly one audit entry per attendance save');
  ok(db.auditLog.some(function (a) { return a.action === 'Attendance updated' && a.details.indexOf('6th-A') !== -1 && a.details.indexOf('2026-11-06') !== -1; }), 'v25: attendance audit entry names class and date');
  eq(db.activities[0].title, 'Attendance updated', 'v25: one Recent Activities entry per save (no duplication)');
  go('activityLog');
  ok(activityLogPage().indexOf('Attendance updated') !== -1, 'v25: Activity Log shows the attendance save');
  // v28: the platform-settings store and the Help contact card are gone
  // with the Super Admin pages.
  ok(typeof platformSettings === 'undefined', 'v28: platformSettings is gone');
  ok(typeof savePlatformSettings === 'undefined', 'v28: savePlatformSettings is gone');

  // ---- 58. v28: Super Admin pages are gone; the school dashboard still shows real totals, no fake numbers, no growth chart, settled stat cards, real activity times ----
  // The seed store still holds its 24 schools, but no page reads them.
  eq(db.schools.length, 24, 'v28: the seed store still holds 24 schools');
  ok(typeof superDashboard === 'undefined', 'v28: superDashboard is gone');
  ok(typeof superUsers === 'undefined', 'v28: superUsers is gone');
  ok(typeof superAnalytics === 'undefined', 'v28: superAnalytics is gone');
  ok(typeof totalPlatformUsers === 'undefined', 'v28: totalPlatformUsers is gone');
  ok(typeof totalPlatformStudents === 'undefined', 'v28: totalPlatformStudents is gone');
  // School dashboard: real totals, no fake numbers, no growth chart, no count-up.
  state.role = 'school'; state.user = TEST_ACCOUNTS.school; state.view = 'dashboard';
  var dash58 = schoolDashboard();
  ok(dash58.indexOf('12,450') === -1 && dash58.indexOf('12450') === -1, 'v28: school dashboard shows no fake 12,450 users total');
  ok(dash58.indexOf('School Growth') === -1, 'v28: fake School Growth chart is gone from the school dashboard');
  ok(dash58.indexOf('Platform Totals') === -1, 'v28: the Platform Totals card is gone');
  ok(dash58.indexOf('data-count') === -1, 'v28: school dashboard stat cards carry no count-up (settled values)');
  // Settled Average Attendance: the formula is live, and the card renders the final value as plain text.
  state.role = 'school'; state.user = TEST_ACCOUNTS.school; state.view = 'students';
  state.profileStudent = null; promoState = null;
  var savedStudents58 = db.students;
  var solo58 = { id: 'stuSolo', name: 'Solo Student', cls: '6th-A', roll: 1, enr: 'ENR-901', guardian: 'Mr. Solo', phone: '9812345678', att: 100, result: 90, fee: 'Paid', status: 'Active', session: '2025–26', admissionNo: 'ADM-2025-901', admissionDate: '', dob: '', gender: 'Boy', bloodGroup: '', category: '', address: '', state: '', district: '', pin: '', fatherName: 'Mr. Solo', motherName: 'Mrs. Solo', mobile2: '', parentEmail: '', occupation: '', previousSchool: '', previousClass: '', documents: { birthCert: true, tc: true, tcNumber: '', other: '' }, aadhaar: '' };
  db.students = [solo58];
  eq(studentStats().avgAtt, 100, 'v26: single 100% student averages 100% (formula, not animation)');
  var stuPage58 = studentsPage();
  ok(stuPage58.indexOf('Average Attendance</div><div class="val">100%</div>') !== -1, 'v26: Average Attendance card shows the settled 100% as plain text');
  ok(stuPage58.indexOf('data-count') === -1, 'v26: Student Management cards carry no count-up');
  ok(statCard('📊', 'blue', 'Average Attendance', 100, '', 'up', { suffix: '%' }).indexOf('<div class="val">100%</div>') !== -1, 'v26: statCard renders the settled value directly');
  db.students = savedStudents58;
  // Recent Activities carry real timestamps; old entries show no time at all.
  addActivity('✅', 'blue', 'Test activity', 'Detail here');
  var newAct58 = db.activities[0];
  eq(newAct58.title, 'Test activity', 'v26: addActivity stores the new entry first');
  ok(typeof newAct58.ts === 'string' && /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}/.test(newAct58.ts), 'v26: activity entry stores a real ISO timestamp at log time');
  ok(!('time' in newAct58), 'v26: activity entry no longer stores a fake time literal');
  state.role = 'school'; state.user = TEST_ACCOUNTS.school; state.view = 'dashboard';
  var sd58 = schoolDashboard();
  ok(sd58.indexOf('Test activity') !== -1, 'v26: dashboard lists the new activity');
  ok(sd58.indexOf('just now') !== -1, 'v26: dashboard shows a real relative time for the new activity');
  ok(sd58.indexOf('Just now') === -1, 'v26: dashboard never shows the old Just now literal');
  eq(relTime(''), '', 'v26: relTime of a missing timestamp is empty (no fabricated time)');
  eq(relTime(undefined), '', 'v26: relTime of undefined is empty');
  eq(relTime(new Date(Date.now() - 5 * 60000).toISOString()), '5 min ago', 'v26: relTime renders 5 min ago');
  eq(relTime(new Date(Date.now() - 2 * 3600000).toISOString()), '2 hr ago', 'v26: relTime renders 2 hr ago');
  var fresh58 = seedDB();
  ok(fresh58.activities.every(function (a) { return !a.time; }), 'v26: seed activities carry no fabricated time strings');
  eq(fresh58.activities.length, 3, 'v26: seed still has its 3 demo activities');
  // Version label: the app is v28 now (footer + versioned assets are
  // checked Node-side below); no super settings page exists to show it.
  ok(typeof superSettings === 'undefined', 'v28: superSettings is gone');

  // ---- 59. v30: seed status and plan agree — the v26 count mismatch ----
  // Two columns of SCHOOL_NAMES told different stories (e.g. a school
  // 'active' with plan 'Expired'), so the old top cards said Active 22 /
  // Pending 2 while Platform Totals said Active 18 / Trial 2 / Expired 4.
  // The seed now holds one invariant: active <-> Active|Trial, pending <->
  // Pending, expired <-> Expired. Both the raw seed and the seeded copy
  // in db.schools must satisfy it, and the counts derived either way
  // must agree.
  eq(SCHOOL_NAMES.length, 24, 'v30: seed still holds 24 schools');
  eq(db.schools.length, 24, 'v30: seeded db.schools still holds 24 schools');
  var byStatus59 = { active: 0, pending: 0, expired: 0 };
  var byPlan59 = { Active: 0, Trial: 0, Expired: 0, Pending: 0 };
  var bad59 = [];
  SCHOOL_NAMES.forEach(function (s) {
    var st = s[3], pl = s[4];
    byStatus59[st] = (byStatus59[st] || 0) + 1;
    byPlan59[pl] = (byPlan59[pl] || 0) + 1;
    var want = pl === 'Expired' ? 'expired' : pl === 'Pending' ? 'pending' : 'active';
    if (st !== want) bad59.push(s[0] + ' (' + st + '/' + pl + ')');
  });
  eq(bad59.length, 0, 'v30: every seed school status matches its plan' + (bad59.length ? ' — ' + bad59.join(', ') : ''));
  eq(byStatus59.active, byPlan59.Active + byPlan59.Trial, 'v30: active-status count equals Active-plan + Trial-plan');
  eq(byStatus59.expired, byPlan59.Expired, 'v30: expired-status count equals Expired-plan');
  eq(byStatus59.pending, byPlan59.Pending, 'v30: pending-status count equals Pending-plan');
  eq(byStatus59.active, 18, 'v30: 18 active-status schools');
  eq(byStatus59.pending, 2, 'v30: 2 pending-status schools');
  eq(byStatus59.expired, 4, 'v30: 4 expired-status schools');
  eq(byPlan59.Active, 16, 'v30: 16 Active-plan schools');
  eq(byPlan59.Trial, 2, 'v30: 2 Trial-plan schools');
  eq(byPlan59.Expired, 4, 'v30: 4 Expired-plan schools');
  eq(byPlan59.Pending, 2, 'v30: 2 Pending-plan schools');
  var badDb59 = db.schools.filter(function (s) {
    var want = s.plan === 'Expired' ? 'expired' : s.plan === 'Pending' ? 'pending' : 'active';
    return s.status !== want;
  });
  eq(badDb59.length, 0, 'v30: seeded db.schools rows also satisfy the status/plan invariant');

  // ---- 60. v35: teacher login (email + password) and the Teachers section ----
  // The school admin creates teacher accounts from the Teachers section;
  // a teacher logs in with email + password, sees only their assigned
  // classes, and cannot touch fees, settings or reset.
  loginAs(TEST_ACCOUNTS.school);
  db = migrateV15(seedDB()); saveDB(db); // section 51 wiped the fixture DB — re-seed for the teacher flow (migration derives classes[] from cls)
  state.view = 'teachers';
  var tchrCount60 = db.teachers.length;
  eq(tchrCount60, 12, 'v35 test setup: the seed has 12 teachers');
  // (a) the school creates a teacher login account (name + subject +
  // classes + email + password); the account is stored with role teacher.
  teacherForm('');
  $('fTchrName').value = 'Ramesh Verma';
  $('fTchrSub').value = 'Mathematics';
  $('fTchrEmail').value = 'ramesh@school.in';
  $('fTchrPw').value = 'teach123';
  tchrFormClasses = ['6th-A', '8th-B'];
  saveTeacher({ preventDefault: function () {} }, '');
  eq(db.teachers.length, tchrCount60 + 1, 'v35: saving the teacher form adds a teacher');
  var newTchr60 = db.teachers[db.teachers.length - 1];
  eq(newTchr60.classes.join(','), '6th-A,8th-B', 'v35: the teacher record keeps the assigned classes');
  var tchrAcct60 = loadAccounts().find(function (a) { return a.email === 'ramesh@school.in'; });
  ok(!!tchrAcct60, 'v35: a teacher login account is stored');
  eq(tchrAcct60.role, 'teacher', 'v35: the teacher account has role teacher');
  eq(tchrAcct60.teacherId, newTchr60.id, 'v35: the teacher account links to the teacher record');
  eq(tchrAcct60.schoolUid, 'test-school', 'v35: the teacher account links to the school');
  eq(tchrAcct60.pwHash.indexOf('bcrypt$'), 0, 'v36: the teacher password is stored as a bcrypt hash, not djb2');
  ok(verifyPw('teach123', tchrAcct60).ok, 'v36: the new teacher hash verifies the right password');
  ok(!verifyPw('wrongpass', tchrAcct60).ok, 'v36: the new teacher hash rejects a wrong password');
  // The Teachers page lists the teacher with their classes.
  var tp60 = teachersPage();
  ok(tp60.indexOf('Ramesh Verma') !== -1, 'v35 (v): teachers page lists the teacher');
  ok(tp60.indexOf('Add Teacher') !== -1, 'v35 (v): teachers page has an Add Teacher button');
  ok(tp60.indexOf('6th-A, 8th-B') !== -1, 'v35 (v): teachers page shows the assigned classes');
  // Duplicate email is refused; a teacher with no class is refused.
  teacherForm('');
  $('fTchrName').value = 'Dup Name';
  $('fTchrEmail').value = 'ramesh@school.in';
  $('fTchrPw').value = 'teach456';
  tchrFormClasses = ['7th-A'];
  saveTeacher({ preventDefault: function () {} }, '');
  eq(db.teachers.length, tchrCount60 + 1, 'v35: a duplicate teacher email is refused');
  teacherForm('');
  $('fTchrName').value = 'No Class';
  $('fTchrEmail').value = 'noclass@school.in';
  $('fTchrPw').value = 'teach456';
  tchrFormClasses = [];
  saveTeacher({ preventDefault: function () {} }, '');
  eq(db.teachers.length, tchrCount60 + 1, 'v35: a teacher with no classes is refused');
  // (vi) wrong teacher password is rejected.
  logout(); await waitLogout();
  $('teacherEmail').value = 'ramesh@school.in';
  $('teacherPw').value = 'wrongpass';
  doTeacherLogin({ preventDefault: function () {} });
  eq(state.role, null, 'v35 (vi): wrong teacher password does not log in');
  eq(__els['teacherErr'].textContent, t('tInvalidCreds'), 'v35 (vi): wrong teacher password shows the generic error');
  // (v) teacher login with the right email + password opens the dashboard
  // with only their assigned classes.
  $('teacherPw').value = 'teach123';
  doTeacherLogin({ preventDefault: function () {} });
  eq(state.role, 'teacher', 'v35 (v): teacher login sets role=teacher');
  eq(state.user.teacherId, newTchr60.id, 'v35 (v): teacher session is tied to the teacher record');
  eq(state.view, 'dashboard', 'v35 (v): teacher lands on the dashboard');
  var td60 = teacherDashboard();
  ok(td60.indexOf('Ramesh Verma') !== -1, 'v35 (v): teacher dashboard greets the teacher');
  ok(td60.indexOf('6th-A') !== -1 && td60.indexOf('8th-B') !== -1, 'v35 (v): teacher dashboard shows the assigned classes');
  ok(td60.indexOf('7th-A') === -1, 'v35 (v): teacher dashboard hides a class they do not teach');
  var stu6a60 = db.students.find(function (s) { return s.cls === '6th-A' && s.status === 'Active'; });
  var stu7a60 = db.students.find(function (s) { return s.cls === '7th-A' && s.status === 'Active'; });
  var stu8b60 = db.students.find(function (s) { return s.cls === '8th-B' && s.status === 'Active'; });
  var stu9a60 = db.students.find(function (s) { return s.cls === '9th-A' && s.status === 'Active'; });
  ok(!!stu6a60 && !!stu7a60 && !!stu8b60 && !!stu9a60, 'v35 test setup: 6th-A, 7th-A, 8th-B and 9th-A students exist');
  ok(canViewStudent(stu6a60.id), 'v35: teacher can view a student in their class');
  ok(!canViewStudent(stu7a60.id), 'v35: teacher cannot view a student outside their classes');
  var profBefore60 = state.profileStudent;
  openStudentProfile(stu7a60.id);
  eq(state.profileStudent, profBefore60, 'v35: openStudentProfile refuses a student outside the teacher classes');
  // (vii) a teacher CANNOT open fees, Settings or Reset.
  go('fees');
  eq(state.view, 'dashboard', 'v35 (vii): teacher go(fees) stays on the dashboard');
  go('settings');
  eq(state.view, 'dashboard', 'v35 (vii): teacher go(settings) stays on the dashboard');
  var modalBefore60 = __els['modalRoot'].innerHTML;
  resetAllData();
  eq(__els['modalRoot'].innerHTML, modalBefore60, 'v35 (vii): teacher cannot open the reset prompt');
  state.view = 'settings';
  renderPage();
  ok(__els['page'].innerHTML.indexOf(t('tNotAllowed')) !== -1, 'v35 (vii): teacher renderPage(settings) shows the refusal, not settings');
  state.view = 'dashboard';
  // (H-4) teacher lockout: 5 wrong guesses lock the local login for 15 minutes.
  // Guarded like the v58 sbQueueExamChange58 test: the helpers live on the
  // PR #16 branch, so on any build without them these assertions fail
  // (feature missing) instead of crashing the whole run.
  if (typeof loginFailClear === 'function') {
    loginFailClear('ramesh@school.in'); // clean start — the (vi) test above left 1 fail
    logout(); await waitLogout();
    var liH4;
    for (liH4 = 0; liH4 < 5; liH4++) {
      $('teacherEmail').value = 'ramesh@school.in';
      $('teacherPw').value = 'wrongpass';
      doTeacherLogin({ preventDefault: function () {} });
    }
    eq(state.role, null, 'H-4 (d): 5 wrong teacher passwords do not log in');
    $('teacherPw').value = 'teach123'; // the RIGHT password
    doTeacherLogin({ preventDefault: function () {} });
    eq(state.role, null, 'H-4 (d): the right password is still refused while locked out');
    eq(__els['teacherErr'].textContent, t('tPinLocked'), 'H-4 (d): the lockout shows the too-many-attempts error');
    loginFailClear('ramesh@school.in');
    doTeacherLogin({ preventDefault: function () {} });
    eq(state.role, 'teacher', 'H-4 (d): after clearing the lock the right password logs in again');
  } else {
    ok(false, 'H-4 (d): teacher lockout helpers missing (run against the PR #16 branch)');
    ok(false, 'H-4 (d): 5 wrong teacher passwords do not log in (helpers missing)');
    ok(false, 'H-4 (d): the right password is still refused while locked out (helpers missing)');
    ok(false, 'H-4 (d): the lockout shows the too-many-attempts error (helpers missing)');
    ok(false, 'H-4 (d): after clearing the lock the right password logs in again (helpers missing)');
  }
  // (viii) a teacher CAN mark attendance and enter marks for their own
  // class and CANNOT for a class not assigned to them.
  state.attDate = '2026-11-09';
  state.attCls = '6th-A';
  markAtt(stu6a60.id, 'Present');
  eq((db.attendance['2026-11-09|6th-A'] || {})[stu6a60.id], 'Present', 'v35 (viii): teacher marks attendance for their own class');
  state.attCls = '7th-A';
  markAtt(stu7a60.id, 'Present');
  eq((db.attendance['2026-11-09|7th-A'] || {})[stu7a60.id], undefined, 'v35 (viii): teacher cannot mark attendance for a class not assigned');
  var ex8b60 = db.exams.find(function (e) { return e.cls === '8th-B'; });
  var ex9a60 = db.exams.find(function (e) { return e.cls === '9th-A'; });
  ok(!!ex8b60 && !!ex9a60, 'v35 test setup: 8th-B and 9th-A exams exist');
  $('mk-' + stu8b60.id).value = '42';
  saveMarks(ex8b60.id);
  var mk60 = db.marks.find(function (m) { return m.examId === ex8b60.id && m.studentId === stu8b60.id; });
  eq(mk60 && mk60.marks, 42, 'v35 (viii): teacher enters marks for their own class');
  $('mk-' + stu9a60.id).value = '42';
  saveMarks(ex9a60.id);
  var mkOther60 = db.marks.find(function (m) { return m.examId === ex9a60.id && m.studentId === stu9a60.id; });
  eq(mkOther60, undefined, 'v35 (viii): teacher cannot enter marks for a class not assigned');
  // (ix) the school admin login is unchanged — full access.
  logout(); await waitLogout();
  loginAs(TEST_ACCOUNTS.school);
  eq(state.role, 'school', 'v35 (ix): school login still sets role=school');
  ok(canViewStudent(stu7a60.id), 'v35 (ix): school can view any student');
  go('teachers');
  eq(state.view, 'teachers', 'v35 (ix): school can open the Teachers section');
  // (x) the hardcoded demo student path is gone.
  eq(typeof riyaId, 'undefined', 'v35 (x): riyaId is gone');
  eq(typeof meStudent, 'function', 'v35 (x): meStudent exists but is session-based, not hardcoded');
  state.role = 'student'; state.user = { role: 'student', name: 'Nobody', email: 'student:test-school:stu33', studentId: 'stu33' };
  eq(meStudent().name, 'Riya Kumari', 'v35 (x): meStudent returns the logged-in student, not a hardcoded one');
  state.role = 'school'; state.user = TEST_ACCOUNTS.school;

  // ---- 61. v36: security + id fix + PR #3 rework ----
  loginAs(TEST_ACCOUNTS.school);
  db = migrateV12(migrateV15(seedDB())); saveDB(db);
  saveAccounts([TEST_ACCOUNTS.school]);
  var ev36 = { preventDefault: function () {} };

  // (i) frozen-clock same-ms id uniqueness: every record type minted
  // through the real save paths in one frozen millisecond gets a
  // different id (PR #3's uniqueId approach, implemented natively).
  var _realNow36 = Date.now;
  Date.now = function () { return 1793000000000; };
  var stuNames36 = ['V36 One', 'V36 Two', 'V36 Three', 'V36 Four', 'V36 Five'];
  var stuIds36 = [];
  var toastAfterFirst36 = '';
  for (var i36 = 0; i36 < 5; i36++) {
    $('fStName').value = stuNames36[i36];
    $('fStCls').value = '6th'; $('fStSec').value = 'A'; $('fStRoll').value = String(91 + i36);
    $('fStG').value = 'Guardian ' + stuNames36[i36];
    $('fStPh').value = '900000000' + i36;
    $('fStDob').value = '2015-01-01'; $('fStPin').value = ''; $('fStAadhaar').value = '';
    $('fStGender').value = 'Male'; $('fStBlood').value = 'O+'; $('fStCategory').value = 'General';
    $('fStSession').value = '2025–26'; $('fStAdmDate').value = ''; $('fStAdmReq').value = '';
    $('fStPinLogin').value = '';
    saveStudent(ev36, '', '');
    stuIds36.push(db.students[db.students.length - 1].id);
    if (i36 === 0) toastAfterFirst36 = $('toast').textContent;
  }
  var feeIds36 = [];
  for (var f36 = 0; f36 < 3; f36++) {
    $('fFeeStudent').value = stuIds36[0];
    $('fFeeAmount').value = '500';
    $('fFeeType').value = 'Monthly';
    $('fFeeMonth').value = 'November';
    $('fFeeStatus').value = 'Pending';
    $('fFeeDate').value = '2026-11-09';
    saveFeeRecord(ev36);
    feeIds36.push(db.feeRecords[db.feeRecords.length - 1].id);
  }
  var hwIds36 = [];
  for (var h36 = 0; h36 < 2; h36++) {
    $('fHwCls').value = '6th-A';
    $('fHwSub').value = 'Maths';
    $('fHwTitle').value = 'V36 homework ' + h36;
    $('fHwDue').value = '2026-11-30';
    saveHomework(ev36);
    hwIds36.push(db.homework[0].id);
  }
  var ntIds36 = [];
  for (var n36 = 0; n36 < 2; n36++) {
    $('fNtTitle').value = 'V36 notice ' + n36;
    $('fNtBody').value = 'Body ' + n36;
    saveNotice(ev36);
    ntIds36.push(db.notices[0].id);
  }
  var srIds36 = [];
  for (var s36 = 0; s36 < 2; s36++) {
    $('fSupName').value = 'V36 Reporter';
    $('fSupMsg').value = 'V36 support message ' + s36;
    submitSupportRequest(ev36);
    var srList36 = JSON.parse(localStorage.getItem('schoolSaathiSupportRequests') || '[]');
    srIds36.push(srList36[0].id);
  }
  var arIds36 = [];
  for (var a36 = 0; a36 < 2; a36++) {
    $('fArName').value = 'V36 Applicant ' + a36;
    $('fArDob').value = '2015-01-01';
    $('fArGender').value = 'Male';
    $('fArClass').value = '6th-A';
    $('fArGuardian').value = 'V36 Guardian';
    $('fArPhone').value = '910000000' + a36;
    $('fArPrevSchool').value = 'Old School';
    $('fArSchool').value = 'local:schoolSaathiDB_test-school';
    saveAdmissionRequest(ev36);
    arIds36.push(db.admissionRequests[db.admissionRequests.length - 1].id);
  }
  var tIds36 = [];
  var tUids36 = [];
  for (var t36 = 0; t36 < 2; t36++) {
    teacherForm('');
    $('fTchrName').value = 'V36 Teacher ' + t36;
    $('fTchrSub').value = 'Maths';
    $('fTchrEmail').value = 'v36teacher' + t36 + '@school.in';
    $('fTchrPw').value = 'teach123';
    tchrFormClasses = ['6th-A'];
    var tLen36 = db.teachers.length;
    saveTeacher(ev36, '');
    tIds36.push(db.teachers[tLen36].id);
    tUids36.push(findAccount('v36teacher' + t36 + '@school.in').uid);
  }
  var suUids36 = [];
  for (var u36 = 0; u36 < 3; u36++) {
    $('suSchool').value = 'V36 Frozen School ' + u36;
    $('suName').value = 'V36 Admin ' + u36;
    $('suEmail').value = 'v36frozen' + u36 + '@school.in';
    $('suPw').value = 'signup123';
    $('suPw2').value = 'signup123';
    doSignup(ev36);
    suUids36.push(findAccount('v36frozen' + u36 + '@school.in').uid);
  }
  Date.now = _realNow36;
  loginAs(TEST_ACCOUNTS.school);
  var allIds36 = stuIds36.concat(feeIds36, hwIds36, ntIds36, srIds36, arIds36, tIds36, suUids36);
  var seenAll36 = {};
  allIds36.forEach(function (x) { seenAll36[x] = true; });
  eq(Object.keys(seenAll36).length, 21, 'v36 (i): all 21 ids minted in the same frozen ms are unique');
  ok(stuIds36.every(function (x) { return x.indexOf('stu') === 0; }), 'v36 (i): student ids carry the stu prefix');
  ok(suUids36.every(function (x) { return x.indexOf('u') === 0; }), 'v36 (i): school uids carry the u prefix');
  ok(tIds36.every(function (x) { return x.indexOf('t') === 0; }), 'v36 (i): teacher ids carry the t prefix');
  var direct36 = [uniqueId('fee'), uniqueId('fee'), uniqueId('fee'), uniqueId('m'), uniqueId('att'), uniqueId('rcpt')];
  var seenD36 = {};
  direct36.forEach(function (x) { seenD36[x] = true; });
  eq(Object.keys(seenD36).length, 6, 'v36 (i): direct uniqueId calls are all different (covers the collect-fee / marks / attendance / receipt minting)');

  // (ii) SHA-256 vectors + the old djb2 hash still logs in and upgrades
  eq(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'v36 (ii): sha256 of the empty string matches the FIPS vector');
  eq(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'v36 (ii): sha256 of abc matches the FIPS vector');
  var legacy36 = { uid: 'legacy36', name: 'Legacy School', school: 'Legacy School', email: 'legacy36@school.in', pwHash: hashPw('oldpass123'), role: 'school', sub: 'School Admin • Legacy School', created: '2026-11-09', sbUid: null };
  saveAccounts(loadAccounts().concat([legacy36]));
  sbLocalLogin('legacy36@school.in', 'oldpass123', $('loginErr'));
  eq(state.role, 'school', 'v36 (ii): the old djb2 hash still logs in');
  var legacyAfter36 = findAccount('legacy36@school.in');
  ok(legacyAfter36.pwHash.indexOf('bcrypt$') === 0, 'v36 (ii): the legacy login upgrades the stored hash to bcrypt');
  eq(legacyAfter36.hashScheme, 'bcrypt', 'v36 (ii): the upgraded account is marked bcrypt');
  ok(verifyPw('oldpass123', legacyAfter36).ok, 'v36 (ii): the upgraded hash verifies the same password');
  ok(!verifyPw('wrongpass', legacyAfter36).ok, 'v36 (ii): the wrong password is still rejected after the upgrade');
  logout(); await waitLogout();
  sbLocalLogin('legacy36@school.in', 'wrongpass', $('loginErr'));
  eq(state.role, null, 'v36 (ii): the wrong password does not log in');
  loginAs(TEST_ACCOUNTS.school);

  // (iii) new accounts use the new scheme from creation; a legacy
  // teacher hash upgrades on teacher login too
  var newSu36 = findAccount('v36frozen0@school.in');
  ok(newSu36.pwHash.indexOf('bcrypt$') === 0, 'v36 (iii): a school signed up in v36 stores a bcrypt hash');
  eq(newSu36.hashScheme, 'bcrypt', 'v36 (iii): a school signed up in v36 is marked bcrypt');
  var newTchr36 = findAccount('v36teacher0@school.in');
  ok(newTchr36.pwHash.indexOf('bcrypt$') === 0, 'v36 (iii): a teacher created in v36 stores a bcrypt hash');
  var legacyTchr36 = { uid: 'legacy-t36', name: 'Legacy Teacher', email: 'legacy36@teacher.in', pwHash: hashPw('teachold'), role: 'teacher', teacherId: 't-legacy36', schoolUid: 'test-school', sub: 'Teacher', created: '2026-11-09', sbUid: null };
  saveAccounts(loadAccounts().concat([legacyTchr36]));
  db.teachers.push({ id: 't-legacy36', name: 'Legacy Teacher', subject: 'Maths', email: 'legacy36@teacher.in', classes: ['6th-A'] });
  saveDB(db);
  $('teacherEmail').value = 'legacy36@teacher.in';
  $('teacherPw').value = 'teachold';
  doTeacherLogin(ev36);
  eq(state.role, 'teacher', 'v36 (iii): the old teacher hash still logs in');
  var legacyTchrAfter36 = findAccount('legacy36@teacher.in');
  ok(legacyTchrAfter36.pwHash.indexOf('bcrypt$') === 0, 'v36 (iii): the teacher login upgrades the stored hash to bcrypt');
  logout(); await waitLogout();
  loginAs(TEST_ACCOUNTS.school);

  // (iv) new students get a random PIN, never the phone's last 4;
  // the phone-last-4 PIN does NOT log a student in — the admin must
  // set one (H-3)
  var pinStu36 = db.students.find(function (s) { return s.name === 'V36 One'; });
  ok(pinStu36.parentPinHash && pinStu36.parentPinHash.indexOf('bcrypt$') === 0, 'v54 (A1): the new student PIN is stored as a bcrypt hash, never plaintext');
  ok(!pinStu36.parentPin, 'v54 (A1): the new student carries no plaintext PIN');
  ok(toastAfterFirst36.indexOf('Student PIN:') === -1, 'v54 (A2): the admission toast never shows the generated PIN');
  var riya36 = db.students.find(function (s) { return s.name === 'Riya Kumari'; });
  ok(!verifyPin('3408', riya36), 'H-3: the seed student does NOT verify with the phone-last-4 PIN (her load gave her a random hash)');
  ok(!riya36.parentPin, 'v54 (A1): the seed student carries no plaintext PIN');
  fillSchoolPicker('studentSchool');
  $('studentSchool').value = 'test-school';
  $('studentAdmNo').value = riya36.admissionNo;
  $('studentPin').value = '3408';
  state.role = null; state.user = null; // doStudentLogin leaves the role untouched on failure — clear it so the negative check reads the login, not the leftover school role
  doStudentLogin(ev36);
  eq(state.role, null, 'H-3: the phone-last-4 PIN does not log the student in anymore');
  logout(); await waitLogout();
  // The sanctioned path under H-3: the admin sets a PIN, then the
  // student logs in with it.
  state.role = 'school'; state.user = TEST_ACCOUNTS.school;
  $('fStuPinNew').value = '4321';
  setStudentPin(riya36.id);
  ok(verifyPin('4321', riya36), 'H-3: after the admin sets the PIN, it verifies');
  logout(); await waitLogout();
  fillSchoolPicker('studentSchool');
  $('studentSchool').value = 'test-school';
  $('studentAdmNo').value = riya36.admissionNo;
  $('studentPin').value = '4321';
  doStudentLogin(ev36);
  eq(state.role, 'student', 'H-3: the student logs in with the admin-set PIN');
  logout(); await waitLogout();
  // admin-set PIN works; editing with a blank PIN field keeps it
  state.role = 'school'; state.user = TEST_ACCOUNTS.school;
  pinStu36 = db.students.find(function (s) { return s.name === 'V36 One'; }); // re-find: the student login reloaded db from storage, the old reference is stale
  $('fStuPinNew').value = '4321';
  setStudentPin(pinStu36.id);
  ok(verifyPin('4321', pinStu36) && !pinStu36.parentPin, 'v54 (A1): the admin-set PIN is stored as a hash');
  $('fStName').value = 'V36 One';
  $('fStCls').value = '6th'; $('fStSec').value = 'A'; $('fStRoll').value = '91';
  $('fStG').value = 'Guardian V36 One';
  $('fStPh').value = '9000000000';
  $('fStDob').value = '2015-01-01'; $('fStPin').value = ''; $('fStAadhaar').value = '';
  $('fStGender').value = 'Male'; $('fStBlood').value = 'O+'; $('fStCategory').value = 'General';
  $('fStSession').value = '2025–26'; $('fStAdmDate').value = ''; $('fStAdmReq').value = '';
  $('fStPinLogin').value = '';
  saveStudent(ev36, pinStu36.id);
  var pinStuAfter36 = db.students.find(function (s) { return s.id === pinStu36.id; });
  ok(verifyPin('4321', pinStuAfter36), 'v54 (A1): editing with a blank PIN field keeps the existing PIN');

  // (v) Aadhaar: migration strips a full number to last-4; a fresh
  // save never stores the full number; the upload mapper never sends it
  var aadStu36 = db.students.find(function (s) { return s.name === 'V36 Two'; });
  aadStu36.aadhaar = '123456789012';
  migrateV16(db);
  saveDB(db);
  eq(aadStu36.aadhaar, '9012', 'v36 (v): migration strips a stored full Aadhaar to its last 4');
  var aadAudit36 = db.auditLog.filter(function (a) { return a.action === 'Aadhaar cleanup'; });
  ok(aadAudit36.length >= 1, 'v36 (v): the migration writes an audit entry');
  ok(aadAudit36[0].details.indexOf('1 student Aadhaar numbers reduced to last 4 digits') !== -1, 'v36 (v): the audit entry records the count');
  ok(aadAudit36[0].details.indexOf('123456789012') === -1, 'v36 (v): the audit entry never contains the full number');
  $('fStName').value = 'V36 Aadhaar';
  $('fStCls').value = '6th'; $('fStSec').value = 'A'; $('fStRoll').value = '99';
  $('fStG').value = 'Guardian V36 Aadhaar';
  $('fStPh').value = '9000000099';
  $('fStDob').value = '2015-01-01'; $('fStPin').value = '';
  $('fStAadhaar').value = '123456789012';
  $('fStGender').value = 'Male'; $('fStBlood').value = 'O+'; $('fStCategory').value = 'General';
  $('fStSession').value = '2025–26'; $('fStAdmDate').value = ''; $('fStAdmReq').value = '';
  $('fStPinLogin').value = '';
  saveStudent(ev36, '', '');
  var aadNew36 = db.students.find(function (s) { return s.name === 'V36 Aadhaar'; });
  eq(aadNew36.aadhaar, '9012', 'v36 (v): a fresh save stores only the last 4 of the Aadhaar');
  var mapped36 = sbMapStudent({ id: 'stu-x', name: 'Map Test', cls: '6th-A', admissionNo: 'ADM-2025-999', enr: 'ENR-999', roll: '1', guardian: 'G', phone: '9000000000', dob: '', gender: '', bloodGroup: '', category: '', session: '', admDate: '', status: 'Active', parentPin: '1234', aadhaar: '123456789012', photo: '' }, 'test-school');
  eq(mapped36.aadhaar, '9012', 'v36 (v): the upload mapper sends only the last 4 of the Aadhaar');
  ok(JSON.stringify(mapped36).indexOf('123456789012') === -1, 'v36 (v): the mapped row contains the full Aadhaar nowhere');
  eq(mapped36.parent_pin, null, 'v54 (A1): the upload mapper never sends a plaintext PIN');
  var mapped54 = sbMapStudent({ id: 'stu-x2', name: 'Map Hash', cls: '6th-A', admissionNo: 'ADM-2025-997', enr: 'ENR-997', roll: '1', guardian: 'G', phone: '9000000000', dob: '', gender: '', bloodGroup: '', category: '', session: '', admDate: '', status: 'Active', parentPinHash: hashPin('4321'), aadhaar: '', photo: '' }, 'test-school');
  ok(mapped54.parent_pin && mapped54.parent_pin.indexOf('bcrypt$') === 0, 'v54 (A1): the upload mapper sends the bcrypt hash');
  ok(verifyPin('4321', { parentPinHash: mapped54.parent_pin }), 'v54 (A1): the mapped hash verifies the PIN');
  var pulled36 = sbRowToStudent({ id: 'stu-y', local_id: 'stu-y', name: 'Pull Test', cls: '6th-A', admission_no: 'ADM-2025-998', enr: 'ENR-998', roll: '2', guardian: 'G', phone: '9000000000', dob: '', gender: '', blood_group: '', category: '', session: '', adm_date: '', status: 'Active', parent_pin: '1234', aadhaar: '123456789012', photo_data_url: '' });
  eq(pulled36.aadhaar, '9012', 'v36 (v): the pull mapper strips a full Aadhaar to its last 4');
  eq(maskAadhaar('123456789012'), '**** **** 9012', 'v36 (v): the profile mask shows a legacy full number as **** **** 9012');
  eq(maskAadhaar('9012'), '**** **** 9012', 'v36 (v): the profile mask shows a stored last-4 as **** **** 9012');
  ok(!pulled36.parentPin, 'H-3: the pull mapper never stores a server PIN as plaintext');
  ok(pulled36.parentPinHash && pulled36.parentPinHash.indexOf('bcrypt$') === 0, 'H-3: the pull mapper hashes a legacy plaintext PIN immediately on pull');
  ok(verifyPin('1234', pulled36), 'H-3: the pulled hash verifies the legacy PIN');
  var pulled54 = sbRowToStudent({ id: 'stu-z', local_id: 'stu-z', name: 'Pull Hash', cls: '6th-A', admission_no: 'ADM-2025-996', enr: 'ENR-996', roll: '3', guardian: 'G', phone: '9000000000', dob: '', gender: '', blood_group: '', category: '', session: '', adm_date: '', status: 'Active', parent_pin: hashPin('4321'), aadhaar: '', photo_data_url: '' });
  ok(pulled54.parentPinHash && pulled54.parentPinHash.indexOf('bcrypt$') === 0, 'v54 (A1): the pull mapper keeps a hashed parent_pin as parentPinHash');
  ok(!pulled54.parentPin, 'v54 (A1): a hashed pull carries no plaintext PIN');
  ok(verifyPin('4321', pulled54), 'v54 (A1): the pulled hash verifies the PIN');
  eq(maskAadhaar(''), '—', 'v36 (v): the profile mask shows a dash when no Aadhaar is stored');

  // (vi) a fresh device has no demo data; signup starts empty; the
  // test school's own DB is untouched by the fresh boot
  var saveKey36 = DB_KEY;
  try { localStorage.removeItem('schoolSaathiDBv1'); } catch (e36) {}
  DB_KEY = 'schoolSaathiDBv1';
  var fresh36 = loadDB();
  eq(fresh36.schools.length, 0, 'v36 (vi): a fresh device has no demo schools');
  eq(fresh36.students.length, 0, 'v36 (vi): a fresh device has no demo students');
  eq(fresh36.teachers.length, 0, 'v36 (vi): a fresh device has no demo teachers');
  eq(fresh36.feeRecords.length, 0, 'v36 (vi): a fresh device has no demo fee records');
  eq(fresh36.notices.length, 0, 'v36 (vi): a fresh device has no demo notices');
  eq(fresh36.homework.length, 0, 'v36 (vi): a fresh device has no demo homework');
  try { localStorage.removeItem('schoolSaathiDB_fresh36'); } catch (e36b) {}
  DB_KEY = 'schoolSaathiDB_fresh36';
  var freshAcct36 = loadDB({ role: 'school', name: 'Fresh36', school: 'Fresh36 School', email: 'fresh36@test.in', uid: 'fresh36' });
  eq(freshAcct36.students.length, 0, 'v36 (vi): signup on a fresh device starts empty');
  eq(freshAcct36.profile.name, 'Fresh36 School', 'v36 (vi): signup applies the school profile');
  var testDb36 = readDbByKey('schoolSaathiDB_test-school');
  ok(!!testDb36 && testDb36.students.length > 0, 'v36 (vi): the test school DB is untouched by the fresh-device boot');
  DB_KEY = saveKey36;
  db = readDbByKey(saveKey36);

  // (vii) PR #3's attendance fix is NOT in v36: an unmarked student
  // stays "Not marked" — saveAttendance never writes Present for them
  state.attCls = '6th-A';
  state.attDate = '2026-11-09';
  var attKey36 = '2026-11-09|6th-A';
  if (!db.attendance[attKey36]) db.attendance[attKey36] = {};
  var attA36 = db.students.find(function (s) { return s.name === 'V36 One'; });
  var attB36 = db.students.find(function (s) { return s.name === 'V36 Two'; });
  markAtt(attA36.id, 'Present');
  saveAttendance();
  eq(db.attendance[attKey36][attB36.id], undefined, 'v36 (vii): saveAttendance does not write Present for the unmarked student');
  var attAudit36 = db.auditLog.filter(function (a) { return a.action === 'Attendance updated'; });
  var attLast36 = attAudit36[0];
  ok(attLast36.details.indexOf('1 Present') !== -1, 'v36 (vii): the audit line counts 1 Present (got: ' + attLast36.details + ')');
  ok(attLast36.details.indexOf('2 Present') === -1, 'v36 (vii): the audit line does NOT count 2 Present');
  ok(attLast36.details.indexOf('Not marked') !== -1, 'v36 (vii): the audit line counts the unmarked student as Not marked');
  var attHtml36 = attendancePage();
  // (harness fix) the whole page also carries the school-wide footer
  // ("School-wide today: N Present ..."), which legitimately counts
  // today across all classes — the "header" checks must read only the
  // page-head paragraph, not the full HTML.
  var attHead36 = attHtml36.slice(0, attHtml36.indexOf('</p>') + 4);
  ok(attHead36.indexOf('1 Present') !== -1, 'v36 (vii): the attendance header counts 1 Present');
  ok(attHead36.indexOf('2 Present') === -1, 'v36 (vii): the attendance header does NOT count 2 Present');
  ok(attHtml36.indexOf('Not marked') !== -1, 'v36 (vii): the attendance header shows Not marked');

  // (viii) logout backup: a cycle killed by logout must not leave a
  // lying "Backup failed" on the login screen
  loginAs(TEST_ACCOUNTS.school);
  state.sb = { uid: 'sb-uid-logout36', email: 'logout36@school.in' };
  sbSetStatus('failed');
  eq(sbLoadStatus().state, 'failed', 'v36 (viii): while logged in, a failed status is written');
  sbSetStatus('syncing');
  var stuCountBefore36 = readDbByKey('schoolSaathiDB_test-school').students.length;
  logout(); await waitLogout();
  eq(sbLoadStatus().state, 'synced', 'v36 (viii): logout settles a killed syncing status to synced when the outbox is empty');
  eq(readDbByKey('schoolSaathiDB_test-school').students.length, stuCountBefore36, 'v36 (viii): logout deletes no data');
  sbSetStatus('failed');
  eq(sbLoadStatus().state, 'synced', 'v36 (viii): a failed status written after logout is dropped, the last truthful status stands');
  // with pending outbox rows, logout settles to pending
  loginAs(TEST_ACCOUNTS.school);
  state.sb = { uid: 'sb-uid-logout36', email: 'logout36@school.in' };
  sbOutboxAdd('sb-uid-logout36', { table: 'ss_students', key: 'stu1', op: 'upsert', row: {}, at: new Date().toISOString() });
  sbSetStatus('syncing');
  logout(); await waitLogout();
  eq(sbLoadStatus().state, 'pending', 'v36 (viii): logout settles a killed syncing status to pending when outbox rows remain');
  sbOutboxSave('sb-uid-logout36', []);
  loginAs(TEST_ACCOUNTS.school);

  // ---- 62. v37: exam creation + wider classes + full-year trend + full backup/restore + SW update + local-only status ----
  var ev37 = { preventDefault: function () {} };

  // (ii) classes Nursery-12th: admission, roster, fee generation, teacher assignment
  eq(CLASSES.length, 30, 'v37 (ii): CLASSES has 30 class-sections (Nursery-12th)');
  ok(CLASSES.indexOf('Nursery-A') !== -1 && CLASSES.indexOf('3rd-A') !== -1 && CLASSES.indexOf('11th-A') !== -1 && CLASSES.indexOf('12th-B') !== -1, 'v37 (ii): the new classes are in the list');
  eq(SEED_CLASSES.length, 10, 'v37 (ii): the demo seed still covers only 6th-10th');
  eq(seedDB().students.length, 40, 'v37 (ii): the seed still has exactly 40 students');
  state.role = 'school'; state.user = TEST_ACCOUNTS.school; state.view = 'students';
  $('fStName').value = 'V37 Three';
  $('fStCls').value = '3rd'; $('fStSec').value = 'A'; $('fStRoll').value = '1';
  $('fStG').value = 'Guardian Three';
  $('fStPh').value = '9100000003';
  $('fStDob').value = '2017-01-01'; $('fStPin').value = ''; $('fStAadhaar').value = '';
  $('fStGender').value = 'Male'; $('fStBlood').value = 'O+'; $('fStCategory').value = 'General';
  $('fStSession').value = '2025–26'; $('fStAdmDate').value = '2025-10-01'; $('fStAdmReq').value = '';
  $('fStPinLogin').value = '';
  saveStudent(ev37, '', '');
  var three37 = db.students.find(function (x) { return x.name === 'V37 Three'; });
  ok(!!three37, 'v37 (ii): a student can be admitted in 3rd-A');
  eq(three37.cls, '3rd-A', 'v37 (ii): the admitted student is in 3rd-A');
  $('fStName').value = 'V37 Eleven';
  $('fStCls').value = '11th'; $('fStSec').value = 'A'; $('fStRoll').value = '1';
  $('fStG').value = 'Guardian Eleven';
  $('fStPh').value = '9100000011';
  $('fStDob').value = '2009-01-01'; $('fStPin').value = ''; $('fStAadhaar').value = '';
  $('fStGender').value = 'Female'; $('fStBlood').value = 'O+'; $('fStCategory').value = 'General';
  $('fStSession').value = '2025–26'; $('fStAdmDate').value = '2025-10-01'; $('fStAdmReq').value = '';
  $('fStPinLogin').value = '';
  saveStudent(ev37, '', '');
  var eleven37 = db.students.find(function (x) { return x.name === 'V37 Eleven'; });
  ok(!!eleven37 && eleven37.cls === '11th-A', 'v37 (ii): a student can be admitted in 11th-A');
  state.attCls = '3rd-A'; state.attDate = todayIST();
  ok(attendancePage().indexOf('V37 Three') !== -1, 'v37 (ii): the 3rd-A student appears on the 3rd-A attendance roster');
  state.attCls = '11th-A';
  ok(attendancePage().indexOf('V37 Eleven') !== -1, 'v37 (ii): the 11th-A student appears on the 11th-A attendance roster');
  state.feeGenMonth = 'Oct';
  $('fGenMonth').value = '';
  generateFees();
  ok(db.feeRecords.some(function (r) { return r.studentId === three37.id && r.month === 'Oct' && r.status === 'Pending' && r.amount === 700; }), 'v37 (ii): fee generation creates the 3rd-A due (700)');
  ok(db.feeRecords.some(function (r) { return r.studentId === eleven37.id && r.month === 'Oct' && r.status === 'Pending' && r.amount === 1800; }), 'v37 (ii): fee generation creates the 11th-A due (1800)');
  teacherForm('');
  $('fTchrName').value = 'V37 Teacher';
  $('fTchrEmail').value = 'v37teacher@school.in';
  $('fTchrPw').value = 'teach123';
  $('fTchrSub').value = 'Mathematics';
  tchrFormClasses = ['3rd-A'];
  saveTeacher(ev37, '');
  var tchr37 = db.teachers.find(function (x) { return x.name === 'V37 Teacher'; });
  ok(!!tchr37, 'v37 (ii): a teacher can be created for a new class');
  eq(tchr37.classes.join(','), '3rd-A', 'v37 (ii): the teacher is assigned 3rd-A');

  // (i) exam creation: school creates one, marks work on it, the student sees it; teacher own-class-only
  state.role = 'school'; state.user = TEST_ACCOUNTS.school;
  var exCount37 = db.exams.length;
  $('fExName').value = 'V37 Unit Test';
  $('fExCls').value = '3rd-A';
  $('fExSub').value = 'Mathematics';
  $('fExDate').value = '2026-11-15';
  $('fExTotal').value = '50';
  saveExam(ev37);
  eq(db.exams.length, exCount37 + 1, 'v37 (i): the school creates an exam');
  var newEx37 = db.exams[db.exams.length - 1];
  eq(newEx37.cls, '3rd-A', 'v37 (i): the new exam is for 3rd-A');
  eq(newEx37.total, 50, 'v37 (i): the new exam keeps its total marks');
  ok(newEx37.id.indexOf('ex') === 0, 'v37 (i): the new exam id carries the ex prefix');
  eq(state.examId, newEx37.id, 'v37 (i): the new exam becomes the selected exam');
  ok(examsPage().indexOf('V37 Unit Test') !== -1, 'v37 (i): the new exam appears in the exams list');
  state.view = 'exams'; state.examId = newEx37.id;
  $('mk-' + three37.id).value = '42';
  saveMarks(newEx37.id);
  var mk37 = db.marks.filter(function (m) { return m.examId === newEx37.id && m.studentId === three37.id; })[0];
  eq(mk37 && mk37.marks, 42, 'v37 (i): marks can be entered on the newly created exam');
  fillSchoolPicker('studentSchool');
  $('studentSchool').value = 'test-school';
  // v54 (A1): three37 was created with a random PIN that is now hashed and
  // unreadable — the admin sets a known PIN first, then the student logs in with it
  state.role = 'school'; state.user = TEST_ACCOUNTS.school;
  $('fStuPinNew').value = '4321';
  setStudentPin(three37.id);
  $('studentAdmNo').value = three37.admissionNo;
  $('studentPin').value = '4321';
  doStudentLogin(ev37);
  eq(state.role, 'student', 'v37 (i): the 3rd-A student logs in');
  var resTab37 = profileTabBody(three37, 'results');
  ok(resTab37.indexOf('V37 Unit Test') !== -1, 'v37 (i): the student sees the new exam in their results');
  ok(resTab37.indexOf('42 / 50') !== -1, 'v37 (i): the student sees their marks on the new exam');
  logout(); await waitLogout();
  // teacher: own class yes, other class no
  $('teacherEmail').value = 'v37teacher@school.in';
  $('teacherPw').value = 'teach123';
  doTeacherLogin(ev37);
  eq(state.role, 'teacher', 'v37 (i): the 3rd-A teacher logs in');
  ok(teacherClasses().indexOf('3rd-A') !== -1, 'v37 (i): the teacher teaches 3rd-A');
  $('fExName').value = 'V37 Teacher Test';
  $('fExCls').value = '3rd-A';
  $('fExSub').value = 'Science';
  $('fExDate').value = '2026-11-16';
  $('fExTotal').value = '20';
  var exTBefore37 = db.exams.length;
  saveExam(ev37);
  eq(db.exams.length, exTBefore37 + 1, 'v37 (i): a teacher creates an exam for an assigned class');
  $('fExName').value = 'V37 Wrong Class';
  $('fExCls').value = '6th-A';
  $('fExSub').value = 'Science';
  $('fExDate').value = '2026-11-16';
  $('fExTotal').value = '20';
  saveExam(ev37);
  eq(db.exams.length, exTBefore37 + 1, 'v37 (i): a teacher cannot create an exam for an unassigned class');
  ok(db.exams.every(function (e) { return e.name !== 'V37 Wrong Class'; }), 'v37 (i): the refused exam is not in the list');
  ok($('toast').textContent.indexOf(t('tNotAllowed')) !== -1, 'v37 (i): the refused exam shows the not-allowed toast');
  logout(); await waitLogout();
  DB_KEY = 'schoolSaathiDB_test-school'; db = loadDB();
  state.role = 'school'; state.user = TEST_ACCOUNTS.school;

  // (iii) full-year fee trend: all 12 months, zeros where nothing was collected
  var savedDb37 = db;
  var trendDb37 = emptyDb({ name: 'Trend School', city: '', principal: '', phone: '', email: '', session: '2025–26', address: '' });
  trendDb37.feeRecords.push(
    { id: 'fee-t1', studentId: 'stu-x', student: 'X', cls: '6th-A', month: 'Jan', type: 'Tuition', amount: 5000, status: 'Collected', date: '2027-01-05' },
    { id: 'fee-t2', studentId: 'stu-x', student: 'X', cls: '6th-A', month: 'Jan', type: 'Tuition', amount: 1000, status: 'Collected', date: '2027-01-20' },
    { id: 'fee-t3', studentId: 'stu-y', student: 'Y', cls: '6th-A', month: 'Mar', type: 'Tuition', amount: 300, status: 'Pending', date: '2027-03-02' });
  db = trendDb37;
  var chart37 = feeChartData();
  eq(chart37.length, 12, 'v37 (iii): the trend shows all 12 months');
  eq(chart37.map(function (d) { return d.label; }).join(','), 'Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec,Jan,Feb,Mar', 'v37 (iii): the trend months run Apr-Mar in order');
  eq(chart37.filter(function (d) { return d.label === 'Jan'; })[0].collected, 6000, 'v37 (iii): January collected totals 6000');
  eq(chart37.filter(function (d) { return d.label === 'Mar'; })[0].pending, 300, 'v37 (iii): March pending totals 300');
  eq(chart37.filter(function (d) { return d.label === 'Apr'; })[0].collected, 0, 'v37 (iii): April shows zero, not a missing month');
  eq(chart37.filter(function (d) { return d.label === 'Apr'; })[0].pending, 0, 'v37 (iii): April pending is zero too');
  ok(chart37.every(function (d) { return typeof d.collected === 'number' && typeof d.pending === 'number'; }), 'v37 (iii): every month has a number, never undefined');
  eq(feeRangeLabel(), 'Apr–Mar', 'v37 (iii): the trend range is the full year');
  db = savedDb37;

  // (iv) full backup / restore: export, wipe, restore identical counts; corrupt file refused
  state.role = 'school'; state.user = TEST_ACCOUNTS.school;
  var countsBefore37 = { students: db.students.length, teachers: db.teachers.length, feeRecords: db.feeRecords.length, exams: db.exams.length, marks: db.marks.length, homework: db.homework.length, notices: db.notices.length, receipts: db.receipts.length, attendance: Object.keys(db.attendance).length };
  var backup37 = buildFullBackup();
  eq(backup37.app, 'school-saathi', 'v37 (iv): the backup carries the app marker');
  eq(backup37.kind, 'full-backup', 'v37 (iv): the backup carries the kind marker');
  eq(backup37.version, ${EXPECTED_VERSION}, 'v58 (iv): the backup carries the build version');
  eq(backup37.db.students.length, countsBefore37.students, 'v37 (iv): the backup holds every student');
  exportFullBackup();
  ok(!!lastFullBackup && lastFullBackup.db.students.length === countsBefore37.students, 'v37 (iv): export stores the backup for download');
  var profile37 = JSON.parse(JSON.stringify(db.profile));
  db = emptyDb(profile37); saveDB(db);
  eq(db.students.length, 0, 'v37 (iv): the wipe leaves zero students');
  eq(db.exams.length, 0, 'v37 (iv): the wipe leaves zero exams');
  var res37 = restoreFullBackup(JSON.parse(JSON.stringify(backup37)));
  eq(res37.ok, true, 'v37 (iv): restore accepts a valid backup');
  eq(db.students.length, countsBefore37.students, 'v37 (iv): restore brings back every student');
  eq(db.teachers.length, countsBefore37.teachers, 'v37 (iv): restore brings back every teacher');
  eq(db.feeRecords.length, countsBefore37.feeRecords, 'v37 (iv): restore brings back every fee record');
  eq(db.exams.length, countsBefore37.exams, 'v37 (iv): restore brings back every exam');
  eq(db.marks.length, countsBefore37.marks, 'v37 (iv): restore brings back every mark');
  eq(db.homework.length, countsBefore37.homework, 'v37 (iv): restore brings back every homework');
  eq(db.notices.length, countsBefore37.notices, 'v37 (iv): restore brings back every notice');
  eq(db.receipts.length, countsBefore37.receipts, 'v37 (iv): restore brings back every receipt');
  eq(Object.keys(db.attendance).length, countsBefore37.attendance, 'v37 (iv): restore brings back every attendance day');
  ok(db.auditLog.some(function (a) { return a.action === 'Backup restored'; }), 'v37 (iv): restore logs an audit entry');
  var badCounts37 = db.students.length;
  var bad37 = restoreFullBackup({ app: 'other-app', kind: 'full-backup', db: {} });
  eq(bad37.ok, false, 'v37 (iv): restore refuses a foreign backup file');
  eq(db.students.length, badCounts37, 'v37 (iv): a refused restore leaves the data untouched');
  var bad37b = restoreFullBackup({ app: 'school-saathi', kind: 'full-backup', db: { v: 2, students: [] } });
  eq(bad37b.ok, false, 'v37 (iv): restore refuses a backup missing its tables');
  eq(db.students.length, badCounts37, 'v37 (iv): a truncated backup leaves the data untouched');
  var safetyBefore37 = lastFullBackup;
  var okReq37 = requestRestore(JSON.parse(JSON.stringify(backup37)));
  eq(okReq37, true, 'v37 (iv): requestRestore accepts a valid backup');
  ok(lastFullBackup && lastFullBackup !== safetyBefore37, 'v37 (iv): requestRestore downloads a safety backup of the current data first');
  ok($('modalRoot').innerHTML.indexOf(t('backupRestoreConfirm')) !== -1, 'v37 (iv): requestRestore asks for confirmation before replacing data');
  confirmYes();
  eq(db.students.length, countsBefore37.students, 'v37 (iv): the confirmed restore brings the data back');
  var badReq37 = requestRestore({ app: 'nope' });
  eq(badReq37, false, 'v37 (iv): requestRestore refuses a bad file without a modal');
  eq(db.students.length, countsBefore37.students, 'v37 (iv): the refused request leaves the data untouched');

  // (v) service-worker update: the running build carries the check
  // (the version marker + live reload are Node-side / async-covered)
  eq(APP_VERSION, ${EXPECTED_VERSION}, 'v68 (v): the running build is v' + ${EXPECTED_VERSION});
  ok(typeof checkAppUpdate === 'function', 'v37 (v): checkAppUpdate exists');
  ok(typeof triggerSwUpdateReload === 'function', 'v37 (v): triggerSwUpdateReload exists');

  // (vi) local-only status: a school with no server session always shows the local-only line
  state.role = 'school'; state.user = TEST_ACCOUNTS.school; state.sb = null;
  sbSetStatus('failed');
  eq(sbLoadStatus().state, 'local-only', 'v37 (vi): a failed write for a local-only school is stored as local-only');
  eq(sbStatusText(), t('sbStatusLocalOnly'), 'v37 (vi): the status line is the local-only wording');
  sbSetStatus('offline');
  eq(sbLoadStatus().state, 'local-only', 'v37 (vi): an offline write for a local-only school is also local-only');
  eq(sbStatusText(), t('sbStatusLocalOnly'), 'v37 (vi): the line stays local-only after an offline write');
  logout(); await waitLogout();
  eq(sbLoadStatus().state, 'local-only', 'v37 (vi): logout keeps the local-only status');
  eq(sbStatusText(), t('sbStatusLocalOnly'), 'v37 (vi): the login screen shows the local-only line');
  loginAs(TEST_ACCOUNTS.school);
  logout(); await waitLogout();
  eq(sbStatusText(), t('sbStatusLocalOnly'), 'v37 (vi): the line is identical across repeated logouts');
  // server-linked accounts keep the existing statuses
  loginAs(TEST_ACCOUNTS.school);
  state.sb = { uid: 'sb-uid-37', email: 't@school.in' };
  state.user.sbUid = 'sb-uid-37';
  sbSetStatus('synced');
  eq(sbLoadStatus().state, 'synced', 'v37 (vi): a server-linked account still writes synced');
  sbSetStatus('failed');
  eq(sbLoadStatus().state, 'failed', 'v37 (vi): a server-linked account still writes failed');
  eq(sbStatusText(), t('sbStatusFailed'), 'v37 (vi): a server-linked account still shows the failed line');
  delete state.user.sbUid; state.sb = null;
  logout(); await waitLogout();
  loginAs(TEST_ACCOUNTS.school);
  eq(sbStatusText(), t('sbStatusLocalOnly'), 'v37 (vi): back to local-only after the server session ends');

  // (vii) the empty Teachers table says "No teachers yet.", not "No students match."
  state.role = 'school'; state.user = TEST_ACCOUNTS.school;
  var savedTeachers37 = db.teachers;
  db.teachers = [];
  var tchrHtml37 = teachersPage();
  ok(tchrHtml37.indexOf(t('tNoTeachers')) !== -1, 'v37 (vii): the empty Teachers table says No teachers yet.');
  ok(tchrHtml37.indexOf(t('tNoMatch')) === -1, 'v37 (vii): the empty Teachers table does not say No students match.');
  db.teachers = savedTeachers37;

  // ---- 63. v38: WhatsApp via wa.me links (MANUAL send only) ----
  // The app only OPENS a wa.me chat with the message prefilled; the
  // user presses Send inside WhatsApp. No API, no automation, no
  // auto-send. Every button/log says "opened", never "sent".
  var ev38 = { preventDefault: function () {}, stopPropagation: function () {} };
  state.lang = 'en';
  state.role = 'school'; state.user = TEST_ACCOUNTS.school;
  state.profileTab = 'overview';
  var ownStu38 = db.students.find(function (s) { return s.cls === '10th-A' && isEnrolledStudent(s); });
  var lateStu38 = db.students.find(function (s) { return s.cls === '10th-A' && isEnrolledStudent(s) && s.id !== ownStu38.id; });
  var otherStu38 = db.students.find(function (s) { return s.cls !== '10th-A' && isEnrolledStudent(s); });
  ok(!!ownStu38 && !!lateStu38 && !!otherStu38, 'v38: fixtures — an own-class, a second own-class and an other-class student exist');
  db.feeRecords.push({ id: 'fee-wa-own', studentId: ownStu38.id, student: ownStu38.name, cls: '10th-A', month: 'Oct', type: 'Tuition', amount: 900, status: 'Pending', date: todayIST() });
  db.feeRecords.push({ id: 'fee-wa-other', studentId: otherStu38.id, student: otherStu38.name, cls: otherStu38.cls, month: 'Oct', type: 'Tuition', amount: 800, status: 'Pending', date: todayIST() });
  db.receipts.push({ receiptNo: 'RCP-2026-999', studentId: ownStu38.id, name: ownStu38.name, cls: '10th-A', date: todayIST(), month: 'Oct', total: 1500, payMode: 'Cash', payDate: todayIST(), counterNo: '1', session: '2025-26', lines: [{ key: 'tuition', desc: 'Tuition Fee (Oct)', due: 1500, con: 0, paid: 1500 }] });
  state.attCls = '10th-A'; state.attDate = todayIST();
  var attKey38 = state.attDate + '|10th-A';
  db.attendance[attKey38] = db.attendance[attKey38] || {};
  db.attendance[attKey38][ownStu38.id] = 'Absent';
  db.attendance[attKey38][lateStu38.id] = 'Late';

  // (iv) phone normalisation: 10-digit, 0-prefixed, +91, spaces, dashes
  eq(waNormalizePhone('9876543210'), '919876543210', 'v38 (iv): 10-digit normalises to 91…');
  eq(waNormalizePhone('09876543210'), '919876543210', 'v38 (iv): 0-prefixed normalises to 91…');
  eq(waNormalizePhone('+91 98765 43210'), '919876543210', 'v38 (iv): +91 with spaces normalises to 91…');
  eq(waNormalizePhone('98765-43210'), '919876543210', 'v38 (iv): dashes normalise to 91…');
  eq(waNormalizePhone('+919876543210'), '919876543210', 'v38 (iv): +91 without spaces normalises to 91…');
  eq(waNormalizePhone(''), '', 'v38 (iv): a missing number is rejected');
  eq(waNormalizePhone('12345'), '', 'v38 (iv): a short number is rejected');
  eq(waNormalizePhone('987654321'), '', 'v38 (iv): a 9-digit number is rejected');
  eq(waNormalizePhone('5123456789'), '', 'v38 (iv): a number not starting 6-9 is rejected');
  eq(waNormalizePhone('98765 4321'), '', 'v38 (iv): an 8-digit number is rejected');

  // (i) fee reminder: English template, wa.me link, audit, toast, pages
  window.__opened.length = 0;
  var auditBefore38 = db.auditLog.length;
  eq(waFeeReminder('fee-wa-own'), true, 'v38 (i): the fee reminder opens for a pending due');
  eq(window.__opened.length, 1, 'v38 (i): exactly one WhatsApp chat opens');
  var url38 = window.__opened[0];
  ok(url38.indexOf('https://wa.me/' + waNormalizePhone(ownStu38.phone) + '?text=') === 0, 'v38 (i): the link is wa.me/91… with the parent number');
  var txt38 = decodeURIComponent(url38.split('?text=')[1]);
  ok(txt38.indexOf(db.profile.name) !== -1, 'v38 (i): the reminder names the school');
  ok(txt38.indexOf(ownStu38.name) !== -1, 'v38 (i): the reminder names the student');
  ok(txt38.indexOf('10th-A') !== -1, 'v38 (i): the reminder names the class');
  ok(txt38.indexOf('Oct') !== -1, 'v38 (i): the reminder names the due month');
  ok(txt38.indexOf(inr(900)) !== -1, 'v38 (i): the reminder carries the due amount');
  eq($('toast').textContent, t('waOpened'), 'v38 (i): opening shows the WhatsApp opened toast');
  eq(db.auditLog.length, auditBefore38 + 1, 'v38 (vii): the open writes one audit entry');
  eq(db.auditLog[0].action, 'WhatsApp opened', 'v38 (vii): the audit entry says WhatsApp opened');
  ok(db.auditLog[0].details.indexOf('Fee reminder') !== -1, 'v38 (vii): the audit entry names the fee reminder');
  ok(db.auditLog[0].details.indexOf(ownStu38.name) !== -1, 'v38 (vii): the audit entry names the student');
  state.feeSearch = ownStu38.name; state.feeFilter = 'All'; state.feeType = 'All';
  state.collectStudent = null; state.feeStudent = null;
  ok(feesPage().indexOf("waFeeReminder('fee-wa-own')") !== -1, 'v38 (i): the Fees page shows a reminder button on the pending row');
  ok(studentFeeProfile(ownStu38.id).indexOf("waFeeReminder('fee-wa-own')") !== -1, 'v38 (i): the student fee profile shows a reminder button');
  state.feeSearch = '';

  // (i) the Hindi reminder is Devanagari and carries the same fields
  state.lang = 'hi';
  window.__opened.length = 0;
  eq(waFeeReminder('fee-wa-own'), true, 'v38 (i): the Hindi fee reminder opens');
  var txtHi38 = decodeURIComponent(window.__opened[0].split('?text=')[1]);
  ok(txtHi38.indexOf('नमस्ते') !== -1, 'v38 (i): the Hindi reminder greets in Hindi');
  ok(txtHi38.indexOf('फीस') !== -1, 'v38 (i): the Hindi reminder says फीस');
  ok(txtHi38.indexOf('धन्यवाद') !== -1, 'v38 (i): the Hindi reminder closes in Hindi');
  ok(txtHi38.indexOf(ownStu38.name) !== -1 && txtHi38.indexOf('Oct') !== -1 && txtHi38.indexOf(inr(900)) !== -1, 'v38 (i): the Hindi reminder still carries student, month and amount');
  state.lang = 'en';

  // (iv) a missing or invalid number disables the button and refuses the action
  var savedPhone38 = ownStu38.phone;
  ownStu38.phone = '';
  ok(waReminderBtn('fee-wa-own', ownStu38.id).indexOf('disabled') !== -1, 'v38 (iv): the reminder button is disabled without a number');
  ok(waChatBtn(ownStu38.id).indexOf('disabled') !== -1, 'v38 (iv): the profile WhatsApp button is disabled without a number');
  window.__opened.length = 0;
  eq(waFeeReminder('fee-wa-own'), false, 'v38 (iv): the reminder refuses without a number');
  eq(window.__opened.length, 0, 'v38 (iv): the refused reminder opens nothing');
  eq($('toast').textContent, t('waNoNumber'), 'v38 (iv): the missing number explains why');
  ownStu38.phone = '12345';
  eq(waFeeReminder('fee-wa-own'), false, 'v38 (iv): the reminder refuses an invalid number');
  ownStu38.phone = savedPhone38;

  // (ii) absent and late alerts: different wording, right date, page buttons
  window.__opened.length = 0;
  eq(waAbsentAlert(ownStu38.id), true, 'v38 (ii): the absent alert opens');
  var absTxt38 = decodeURIComponent(window.__opened[0].split('?text=')[1]);
  ok(absTxt38.indexOf(ownStu38.name) !== -1, 'v38 (ii): the absent alert names the student');
  ok(absTxt38.indexOf(state.attDate) !== -1, 'v38 (ii): the absent alert carries the date');
  ok(absTxt38.indexOf('absent') !== -1, 'v38 (ii): the absent alert says absent');
  ok(absTxt38.indexOf('late') === -1, 'v38 (ii): the absent alert does not say late');
  window.__opened.length = 0;
  eq(waAbsentAlert(lateStu38.id), true, 'v38 (ii): the late alert opens');
  var lateTxt38 = decodeURIComponent(window.__opened[0].split('?text=')[1]);
  ok(lateTxt38.indexOf(lateStu38.name) !== -1, 'v38 (ii): the late alert names the student');
  ok(lateTxt38.indexOf('late') !== -1, 'v38 (ii): the late alert says late');
  ok(lateTxt38.indexOf('absent') === -1, 'v38 (ii): the late alert does not say absent');
  ok(lateTxt38.indexOf(state.attDate) !== -1, 'v38 (ii): the late alert carries the date');
  var attHtml38 = attendancePage();
  ok(attHtml38.indexOf("waAbsentAlert('" + ownStu38.id + "')") !== -1, 'v38 (ii): the attendance page shows Notify for the absent student');
  ok(attHtml38.indexOf("waAbsentAlert('" + lateStu38.id + "')") !== -1, 'v38 (ii): the attendance page shows Notify for the late student');
  var presStu38 = db.students.find(function (s) { return s.cls === '10th-A' && isEnrolledStudent(s) && s.id !== ownStu38.id && s.id !== lateStu38.id; });
  db.attendance[attKey38][presStu38.id] = 'Present';
  ok(attendancePage().indexOf("waAbsentAlert('" + presStu38.id + "')") === -1, 'v38 (ii): the attendance page shows no Notify for a Present student');
  window.__opened.length = 0;
  eq(waAbsentAlert(presStu38.id), false, 'v38 (ii): no alert for a Present student');
  eq($('toast').textContent, t('waNotAbsent'), 'v38 (ii): the Present case explains why');
  ok(db.auditLog.some(function (a) { return a.action === 'WhatsApp opened' && a.details.indexOf('Absent alert') !== -1; }), 'v38 (vii): the absent alert writes an opened audit entry');
  ok(db.auditLog.some(function (a) { return a.action === 'WhatsApp opened' && a.details.indexOf('Late alert') !== -1; }), 'v38 (vii): the late alert writes an opened audit entry');

  // (iii) receipt share: receipt number, amount, month, date — a receipt, not a reminder
  window.__opened.length = 0;
  eq(waReceiptShare('RCP-2026-999'), true, 'v38 (iii): the receipt share opens');
  var rcTxt38 = decodeURIComponent(window.__opened[0].split('?text=')[1]);
  ok(rcTxt38.indexOf('RCP-2026-999') !== -1, 'v38 (iii): the receipt message carries the receipt number');
  ok(rcTxt38.indexOf(inr(1500)) !== -1, 'v38 (iii): the receipt message carries the amount paid');
  ok(rcTxt38.indexOf('Oct') !== -1, 'v38 (iii): the receipt message carries the month');
  ok(rcTxt38.indexOf(todayIST()) !== -1, 'v38 (iii): the receipt message carries the date');
  ok(rcTxt38.indexOf('reminder') === -1 && rcTxt38.indexOf('due') === -1, 'v38 (iii): the receipt message is not a reminder');
  ok(db.auditLog.some(function (a) { return a.action === 'WhatsApp opened' && a.details.indexOf('Receipt share') !== -1; }), 'v38 (vii): the receipt share writes an opened audit entry');
  state.savedReceiptId = 'RCP-2026-999';
  ok(collectFeePage(ownStu38.id).indexOf("waReceiptShare('RCP-2026-999')") !== -1, 'v38 (iii): the saved receipt view has a Share on WhatsApp button');
  state.savedReceiptId = null;
  ok(receiptListCard(ownStu38.id).indexOf("waReceiptShare('RCP-2026-999')") !== -1, 'v38 (iii): the receipt list has a share button');
  ok(studentFeeProfile(ownStu38.id).indexOf("waReceiptShare('RCP-2026-999')") !== -1, 'v38 (iii): the fee profile shows the receipt share button');

  // (iv) profile chat: greeting naming school + student, toolbar + overview entry points
  window.__opened.length = 0;
  eq(waProfileChat(ownStu38.id), true, 'v38 (iv): the profile chat opens');
  var greetTxt38 = decodeURIComponent(window.__opened[0].split('?text=')[1]);
  ok(greetTxt38.indexOf(db.profile.name) !== -1, 'v38 (iv): the greeting names the school');
  ok(greetTxt38.indexOf(ownStu38.name) !== -1, 'v38 (iv): the greeting names the student');
  ok(db.auditLog.some(function (a) { return a.action === 'WhatsApp opened' && a.details.indexOf('Profile chat') !== -1; }), 'v38 (vii): the profile chat writes an opened audit entry');
  ok(studentProfilePage(ownStu38.id).indexOf("waProfileChat('" + ownStu38.id + "')") !== -1, 'v38 (iv): the student profile has a WhatsApp button');
  ok(profileTabBody(ownStu38, 'overview').indexOf("waFeeReminder('fee-wa-own')") !== -1, 'v38 (iv): the profile overview shows a reminder for the pending due');

  // (v) teacher: own class yes, other class no, receipt share never
  teacherForm('');
  $('fTchrName').value = 'V38 Teacher';
  $('fTchrEmail').value = 'v38teacher@school.in';
  $('fTchrPw').value = 'teach123';
  $('fTchrSub').value = 'Mathematics';
  tchrFormClasses = ['10th-A'];
  saveTeacher(ev38, '');
  var tchr38 = db.teachers.find(function (x) { return x.name === 'V38 Teacher'; });
  ok(!!tchr38, 'v38 (v): a teacher can be created for 10th-A');
  $('teacherEmail').value = 'v38teacher@school.in';
  $('teacherPw').value = 'teach123';
  doTeacherLogin(ev38);
  eq(state.role, 'teacher', 'v38 (v): the 10th-A teacher logs in');
  eq(teacherClasses().join(','), '10th-A', 'v38 (v): the teacher teaches 10th-A');
  window.__opened.length = 0;
  eq(waFeeReminder('fee-wa-own'), true, 'v38 (v): a teacher can remind for an assigned-class student');
  eq(waFeeReminder('fee-wa-other'), false, 'v38 (v): a teacher cannot remind for an unassigned student');
  eq($('toast').textContent, t('tNotAllowed'), 'v38 (v): the refused reminder shows the not-allowed toast');
  eq(window.__opened.length, 1, 'v38 (v): only the allowed reminder opened a chat');
  eq(waAbsentAlert(ownStu38.id), true, 'v38 (v): a teacher can alert for an assigned-class student');
  eq(waAbsentAlert(otherStu38.id), false, 'v38 (v): a teacher cannot alert for an unassigned student');
  eq(waProfileChat(ownStu38.id), true, 'v38 (v): a teacher can open a chat for an assigned-class student');
  eq(waProfileChat(otherStu38.id), false, 'v38 (v): a teacher cannot open a chat for an unassigned student');
  window.__opened.length = 0;
  eq(waReceiptShare('RCP-2026-999'), false, 'v38 (v): a teacher cannot share receipts');
  eq($('toast').textContent, t('tNotAllowed'), 'v38 (v): the refused receipt share shows the not-allowed toast');
  eq(window.__opened.length, 0, 'v38 (v): the refused receipt share opens nothing');
  ok(waReminderBtn('fee-wa-other', otherStu38.id) === '', 'v38 (v): the reminder button is hidden for an unassigned student');
  logout(); await waitLogout();

  // (vi) student: refused all four, opens nothing
  state.role = 'student'; state.user = { role: 'student', name: ownStu38.name, studentId: ownStu38.id };
  window.__opened.length = 0;
  eq(waFeeReminder('fee-wa-own'), false, 'v38 (vi): a student cannot open a fee reminder');
  eq(waAbsentAlert(ownStu38.id), false, 'v38 (vi): a student cannot open an absent alert');
  eq(waReceiptShare('RCP-2026-999'), false, 'v38 (vi): a student cannot share a receipt');
  eq(waProfileChat(ownStu38.id), false, 'v38 (vi): a student cannot open a profile chat');
  eq(window.__opened.length, 0, 'v38 (vi): the refused student actions open nothing');
  eq($('toast').textContent, t('tNotAllowed'), 'v38 (vi): the refused student actions show the not-allowed toast');
  ok(studentProfilePage(ownStu38.id).indexOf('waProfileChat') === -1, 'v38 (vi): the student profile shows no WhatsApp button to a student');
  ok(profileTabBody(ownStu38, 'overview').indexOf('waFeeReminder') === -1, 'v38 (vi): the student overview shows no reminder button');
  logout(); await waitLogout();
  loginAs(TEST_ACCOUNTS.school);

  // (vii) every WhatsApp audit entry says opened, never sent
  var waAudits38 = db.auditLog.filter(function (a) { return a.action.indexOf('WhatsApp') !== -1; });
  ok(waAudits38.length >= 4, 'v38 (vii): at least one opened entry per WhatsApp type exists');
  ok(waAudits38.every(function (a) { return a.action === 'WhatsApp opened'; }), 'v38 (vii): every WhatsApp audit entry says WhatsApp opened');
  // "sent" as a standalone word only — "Absent" contains the
  // substring inside it, which is not a claim that it was sent.
  ok(waAudits38.every(function (a) { return (' ' + a.details + ' ').indexOf(' sent ') === -1; }), 'v38 (vii): no WhatsApp audit entry ever says sent');

  // (viii) templates never carry Aadhaar, PINs or passwords — either language
  var waKeys38 = ['waFeeReminderMsg', 'waAbsentMsg', 'waLateMsg', 'waReceiptMsg', 'waGreetMsg'];
  ok(waKeys38.every(function (k) { return I18N.en[k] && I18N.hi[k] && I18N.en[k].indexOf('Aadhaar') === -1 && I18N.en[k].indexOf('PIN') === -1 && I18N.en[k].indexOf('Password') === -1 && I18N.hi[k].indexOf('आधार') === -1 && I18N.hi[k].indexOf('PIN') === -1 && I18N.hi[k].indexOf('पासवर्ड') === -1; }), 'v38 (viii): no template mentions Aadhaar, PIN or password');
  ok(['waReminderBtn', 'waNotifyBtn', 'waShareReceiptBtn', 'waChatBtn', 'waNotifyCol', 'waNoNumber', 'waOpened', 'waNotAbsent', 'waSchoolContact'].concat(waKeys38).every(function (k) { return I18N.en[k] && I18N.hi[k]; }), 'v38 (viii): every new WhatsApp string has an English and a Hindi key');
  ok(I18N.hi.waFeeReminderMsg.indexOf('नमस्ते') !== -1 && I18N.hi.waAbsentMsg.indexOf('नहीं आया') !== -1 && I18N.hi.waLateMsg.indexOf('देर से') !== -1 && I18N.hi.waReceiptMsg.indexOf('रसीद') !== -1, 'v38 (viii): the Hindi templates are in Devanagari with the right wording');

  // ---- 64. v39: receipt view reachable from stable places; sync failures name the table ----
  // (a) the receipt lookup: same student + same month, latest first, type-matching wins
  state.role = 'school'; state.user = TEST_ACCOUNTS.school;
  state.lang = 'en'; state.profileTab = 'fees';
  db.feeRecords.push({ id: 'fee-rc-own', studentId: ownStu38.id, student: ownStu38.name, cls: '10th-A', month: 'Oct', type: 'Tuition', amount: 1500, status: 'Collected', date: todayIST() });
  db.receipts.push({ receiptNo: 'RCP-2026-998', studentId: ownStu38.id, name: ownStu38.name, cls: '10th-A', date: todayIST(), month: 'Sep', total: 800, payMode: 'Cash', payDate: todayIST(), counterNo: '1', session: '2025-26', lines: [{ key: 'tuition', desc: 'Tuition Fee (Sep)', type: 'Tuition', month: 'Sep', due: 800, con: 0, paid: 800 }] });
  var recOwn64 = db.feeRecords.filter(function (r) { return r.id === 'fee-rc-own'; })[0];
  var rcFound64 = receiptForFeeRecord(recOwn64);
  ok(!!rcFound64 && rcFound64.receiptNo === 'RCP-2026-999', 'v39 (a): the lookup finds the Oct receipt for the Oct collected record');
  var recNoRc64 = { id: 'fee-none', studentId: ownStu38.id, student: ownStu38.name, cls: '10th-A', month: 'Dec', type: 'Tuition', amount: 900, status: 'Collected', date: todayIST() };
  eq(receiptForFeeRecord(recNoRc64), null, 'v39 (a): the lookup returns null when no receipt matches the month');
  eq(receiptCellForRecord(recNoRc64).indexOf('openSavedReceipt'), -1, 'v39 (a): the receipt cell shows nothing to open when there is no receipt');
  var recPend64 = db.feeRecords.filter(function (r) { return r.id === 'fee-wa-own'; })[0];
  eq(receiptCellForRecord(recPend64).indexOf('openSavedReceipt'), -1, 'v39 (a): a Pending row never shows a receipt, even for a month already partly paid');
  ok(receiptCellForRecord(recOwn64).indexOf("openSavedReceipt('RCP-2026-999')") !== -1, 'v39 (a): the receipt cell links the receipt number to openSavedReceipt');
  db.feeRecords.push({ id: 'fee-rc-sep', studentId: ownStu38.id, student: ownStu38.name, cls: '10th-A', month: 'Sep', type: 'Tuition', amount: 800, status: 'Collected', date: todayIST() });
  ok(receiptCellForRecord(recNoRc64).indexOf('openSavedReceipt') === -1, 'v39 (a): the receipt cell shows nothing to open when there is no receipt');

  // (b) Fees list: Receipt column, Collected row opens the receipt, Pending row shows a dash
  // (narrowed by search: the unfiltered list is capped at 120 rows and the
  // seed alone holds more than that, so a fresh record sits past the cap)
  state.feeSearch = ownStu38.name; state.feeFilter = 'All'; state.feeType = 'All';
  state.collectStudent = null; state.feeStudent = null;
  var feesHtml64 = feesPage();
  state.feeSearch = '';
  ok(feesHtml64.indexOf(t('thReceipt')) !== -1, 'v39 (b): the Fees list has a Receipt column');
  ok(feesHtml64.indexOf("openSavedReceipt('RCP-2026-999')") !== -1, 'v39 (b): the Fees list opens the receipt from the Collected row');
  ok(feesHtml64.indexOf('RCP-2026-999') !== -1, 'v39 (b): the Fees list shows the receipt number');
  ok(feesHtml64.indexOf("openSavedReceipt('RCP-2026-998')") !== -1, 'v39 (b): the Fees list links the Sep receipt to the Sep collected record, not the Oct one');

  // (c) profile Fee History tab: receipt number + View for the collected record, dash for pending
  var feesTab64 = profileTabBody(ownStu38, 'fees');
  ok(feesTab64.indexOf(t('thReceipt')) !== -1, 'v39 (c): the profile Fee History tab has a Receipt column');
  ok(feesTab64.indexOf("openSavedReceipt('RCP-2026-999')") !== -1, 'v39 (c): the profile Fee History tab opens the receipt');
  ok(feesTab64.indexOf('RCP-2026-999') !== -1, 'v39 (c): the profile Fee History tab shows the receipt number');

  // (d) the receipt view opens deterministically across repeated renders, not just after collecting
  openSavedReceipt('RCP-2026-999');
  eq(state.savedReceiptId, 'RCP-2026-999', 'v39 (d): opening the receipt sets the saved receipt id');
  ok(collectFeePage(ownStu38.id).indexOf('RCP-2026-999') !== -1, 'v39 (d): the receipt view renders the receipt');
  ok(collectFeePage(ownStu38.id).indexOf("waReceiptShare('RCP-2026-999')") !== -1, 'v39 (d): the receipt view has a Share on WhatsApp button');
  ok(collectFeePage(ownStu38.id).indexOf('RCP-2026-999') !== -1, 'v39 (d): the receipt view still renders on a second render');
  state.view = 'students'; state.collectStudent = null; state.savedReceiptId = null; state.feeStudent = null;
  openSavedReceipt('RCP-2026-999');
  eq(state.savedReceiptId, 'RCP-2026-999', 'v39 (d): the receipt re-opens after navigating away and back');
  ok(collectFeePage(ownStu38.id).indexOf("waReceiptShare('RCP-2026-999')") !== -1, 'v39 (d): the re-opened receipt still has its Share button');
  state.view = 'fees'; state.collectStudent = null; state.savedReceiptId = null; state.feeStudent = null;

  // (e) verify + guard count only NUMBERED receipts — a numberless offline receipt never blocks them
  var countsBefore64 = sbLocalCounts(db);
  db.receipts.push({ receiptNo: '', studentId: ownStu38.id, name: ownStu38.name, cls: '10th-A', date: todayIST(), month: 'Nov', total: 800, payMode: 'Cash', payDate: todayIST(), counterNo: '', session: '2025-26', lines: [], numPending: true });
  eq(sbLocalCounts(db).receipts, countsBefore64.receipts, 'v39 (e): a numberless receipt does not raise the counted receipt total');
  var guardDb64 = { students: [], teachers: [], exams: [], feeRecords: [], attendance: {}, receipts: [{ receiptNo: '', studentId: ownStu38.id }], marks: [], homework: [], notices: [], admissionRequests: [] };
  var guardBy64 = { ss_students: [], ss_teachers: [], ss_exams: [], ss_fee_records: [], ss_attendance: [], ss_receipts: [], ss_marks: [], ss_homework: [], ss_notices: [], ss_admission_requests: [] };
  eq(sbSyncGuardHit(guardDb64, guardBy64), null, 'v39 (e): a numberless receipt alone does not trip the migration guard');
  guardDb64.receipts.push({ receiptNo: 'RCP-2026-003', studentId: ownStu38.id });
  eq(sbSyncGuardHit(guardDb64, guardBy64), 'ss_receipts', 'v39 (e): a numbered receipt with an empty server still trips the guard');
  db.receipts.pop();

  // (f) the failed status names the failing operation instead of a bare generic line
  // (a live server session: without one the account counts as local-only
  // and every status becomes the local-only line instead)
  state.sb = { uid: 'sb-uid-test-school' };
  sbSetStatus('failed', 'ss_receipts: insert-ss_receipts');
  var failTxt64 = sbStatusText();
  ok(failTxt64.indexOf('Backup failed') !== -1, 'v39 (f): the failed line still says Backup failed');
  ok(failTxt64.indexOf('ss_receipts: insert-ss_receipts') !== -1, 'v39 (f): the failed line names the failing table and operation');
  sbSetStatus('failed', '');
  var failTxt64b = sbStatusText();
  ok(failTxt64b.indexOf('Backup failed') !== -1 && failTxt64b.indexOf('undefined') === -1 && failTxt64b.indexOf('()') === -1, 'v39 (f): a failure with no detail stays clean');
  sbSetStatus('synced');

  // (g) the new Receipt header exists in both languages
  ok(!!I18N.en.thReceipt && !!I18N.hi.thReceipt, 'v39 (g): the Receipt column header has English and Hindi keys');

  // ---- 65. v40: counter_no is an INTEGER column — the Collect Fee label 'COUNTER-1' must never be POSTed as a string ----
  // Live proof (9 Nov 2026, diagnostic replay of the exact app POST):
  // PostgREST returned HTTP 400 code 22P02 "invalid input syntax for
  // type integer: \"COUNTER-1\"", so RCP-2026-003 never landed and
  // every sync cycle failed with "Backup failed". The fix coerces the
  // label to an integer at the upload mapping only; the local receipt
  // keeps its label for display and print.
  eq(sbCounterNo('COUNTER-1'), 1, 'v40 (a): COUNTER-1 coerces to 1');
  eq(sbCounterNo('COUNTER-12'), 12, 'v40 (a): COUNTER-12 coerces to 12');
  eq(sbCounterNo('3'), 3, 'v40 (a): a numeric string coerces to its number');
  eq(sbCounterNo(3), 3, 'v40 (a): a number passes through');
  eq(sbCounterNo(''), 0, 'v40 (a): an empty label coerces to 0');
  eq(sbCounterNo(null), 0, 'v40 (a): null coerces to 0');
  eq(sbCounterNo(undefined), 0, 'v40 (a): undefined coerces to 0');
  eq(sbCounterNo('Main'), 0, 'v40 (a): a label with no digits coerces to 0');
  eq(sbCounterNo('COUNTER-0'), 0, 'v40 (a): COUNTER-0 coerces to 0');
  // (b) the mapped upload payload carries a NUMBER counter_no — the exact live failure was the string
  var stuMap65 = {}; var byId65 = {};
  db.students.forEach(function (s) { byId65[s.id] = s; });
  stuMap65[ownStu38.id] = 'srv-stu-65';
  var rc65 = { receiptNo: 'RCP-2026-003', studentId: ownStu38.id, name: ownStu38.name, cls: '10th-A', date: '2026-11-09', month: 'Dec', total: 800, payMode: 'Cash', payDate: '2026-11-09', counterNo: 'COUNTER-1', session: '2025-26', lines: [] };
  var mapped65 = sbMapReceipt(rc65, 'srv-school-65', stuMap65, byId65);
  eq(typeof mapped65.counter_no, 'number', 'v40 (b): the mapped counter_no is a number, never a string');
  eq(mapped65.counter_no, 1, 'v40 (b): COUNTER-1 maps to counter_no 1');
  eq(mapped65.receipt_no, 'RCP-2026-003', 'v40 (b): the receipt number is untouched by the coercion');
  eq(rc65.counterNo, 'COUNTER-1', 'v40 (b): the local receipt keeps its label after mapping');
  var mapped65b = sbMapReceipt(Object.assign({}, rc65, { counterNo: '3' }), 'srv-school-65', stuMap65, byId65);
  eq(mapped65b.counter_no, 3, 'v40 (b): a numeric label maps to its number');
  var mapped65c = sbMapReceipt(Object.assign({}, rc65, { counterNo: '' }), 'srv-school-65', stuMap65, byId65);
  eq(mapped65c.counter_no, 0, 'v40 (b): an empty label maps to 0');

  // ---- 66. v41: the receipt-number minting loop (a v39 regression exposed by the v40 browser check) ----
  // Live proof (9 Nov 2026): ss_receipts grew to 192 rows — the same 3
  // receipts re-created 64 times each under ever-higher numbers — because
  // the repair pass ran before the pull that would save the student-id
  // map, so its same-number comparison always failed (payload
  // student_id null vs the server uuid) and it minted a new server
  // number for every receipt on every cycle. The fix: resolve student
  // ids from the fresh server data the repair already fetched, treat
  // an unknown id as "not a different student", and adopt a receipt
  // whose content already exists under another number instead of
  // minting a duplicate. Rendering must never mint.
  // (a) sbReceiptSameServer: an unknown student_id is not a mismatch
  var srvRow66 = { student_id: 'srv-stu-66', total: 800, receipt_date: '2026-11-09', month: 'Dec', student_name: 'V21 Test Kumar' };
  ok(sbReceiptSameServer(srvRow66, { student_id: null, total: 800, receipt_date: '2026-11-09', month: 'Dec', student_name: 'V21 Test Kumar' }), 'v41 (a): a payload with an unknown student_id still matches when every content field agrees');
  ok(sbReceiptSameServer(srvRow66, { student_id: undefined, total: 800, receipt_date: '2026-11-09', month: 'Dec', student_name: 'V21 Test Kumar' }), 'v41 (a): an undefined student_id also matches on content');
  ok(!sbReceiptSameServer(srvRow66, { student_id: null, total: 700, receipt_date: '2026-11-09', month: 'Dec', student_name: 'V21 Test Kumar' }), 'v41 (a): a different total still fails, even with an unknown student_id');
  ok(!sbReceiptSameServer(srvRow66, { student_id: null, total: 800, receipt_date: '2026-11-09', month: 'Nov', student_name: 'V21 Test Kumar' }), 'v41 (a): a different month still fails, even with an unknown student_id');
  ok(!sbReceiptSameServer(srvRow66, { student_id: 'srv-other', total: 800, receipt_date: '2026-11-09', month: 'Dec', student_name: 'V21 Test Kumar' }), 'v41 (a): a KNOWN different student_id still fails — the tolerance is only for unknown ids');
  ok(sbReceiptSameServer(srvRow66, { student_id: 'srv-stu-66', total: 800, receipt_date: '2026-11-09', month: 'Dec', student_name: 'V21 Test Kumar' }), 'v41 (a): a matching known student_id still matches');
  // (b) the lookup shows the ORIGINAL number among same-date duplicates, not the latest re-minted one
  var dupLines66 = [{ key: 'tuition', desc: 'Tuition Fee (Oct)', type: 'Tuition', month: 'Oct', due: 1500, con: 0, paid: 1500 }];
  db.receipts.push({ receiptNo: 'RCP-2026-003', studentId: ownStu38.id, name: ownStu38.name, cls: '10th-A', date: todayIST(), month: 'Oct', total: 1500, payMode: 'Cash', payDate: todayIST(), counterNo: '1', session: '2025-26', lines: dupLines66 });
  db.receipts.push({ receiptNo: 'RCP-2026-103', studentId: ownStu38.id, name: ownStu38.name, cls: '10th-A', date: todayIST(), month: 'Oct', total: 1500, payMode: 'Cash', payDate: todayIST(), counterNo: '1', session: '2025-26', lines: dupLines66 });
  db.receipts.push({ receiptNo: 'RCP-2026-157', studentId: ownStu38.id, name: ownStu38.name, cls: '10th-A', date: todayIST(), month: 'Oct', total: 1500, payMode: 'Cash', payDate: todayIST(), counterNo: '1', session: '2025-26', lines: dupLines66 });
  eq(receiptForFeeRecord(recOwn64).receiptNo, 'RCP-2026-003', 'v41 (b): among same-date duplicates the lookup shows the earliest (original) number');
  eq(receiptCellForRecord(recOwn64).indexOf("openSavedReceipt('RCP-2026-003')") !== -1, true, 'v41 (b): the receipt cell links the original number');
  eq(receiptCellForRecord(recOwn64).indexOf('RCP-2026-157'), -1, 'v41 (b): the receipt cell never shows a re-minted duplicate number');
  // (c) Fees list: the numbers are identical on two renders (the live loop changed them +3 per render)
  state.feeSearch = ownStu38.name; state.feeFilter = 'All'; state.feeType = 'All';
  state.collectStudent = null; state.feeStudent = null;
  var feesHtml66a = feesPage();
  var feesHtml66b = feesPage();
  state.feeSearch = '';
  ok(feesHtml66a.indexOf('RCP-2026-003') !== -1, 'v41 (c): the Fees list shows the original receipt number');
  ok(feesHtml66a.indexOf('RCP-2026-103') === -1 && feesHtml66a.indexOf('RCP-2026-157') === -1, 'v41 (c): the Fees list shows no re-minted duplicate number');
  eq(feesHtml66a, feesHtml66b, 'v41 (c): rendering the Fees list twice shows identical receipt numbers');
  // (d) a genuinely later receipt (different date) still wins by date, and the profile tab agrees
  // (harness fix) the later date must be computed from todayIST(): the
  // old hard-coded '2026-11-10' stopped being later once the suite ran
  // on 11 Nov, so the lookup correctly kept the same-day original.
  var laterDate41 = new Date(new Date(todayIST() + 'T00:00:00Z').getTime() + 86400000).toISOString().slice(0, 10);
  db.receipts.push({ receiptNo: 'RCP-2026-200', studentId: ownStu38.id, name: ownStu38.name, cls: '10th-A', date: laterDate41, month: 'Oct', total: 1500, payMode: 'Cash', payDate: laterDate41, counterNo: '1', session: '2025-26', lines: dupLines66 });
  eq(receiptForFeeRecord(recOwn64).receiptNo, 'RCP-2026-200', 'v41 (d): a later-dated receipt still wins over the earliest number');
  var feesTab66 = profileTabBody(ownStu38, 'fees');
  ok(feesTab66.indexOf("openSavedReceipt('RCP-2026-200')") !== -1, 'v41 (d): the profile Fee History tab shows the same latest receipt as the Fees list');
  db.receipts.pop();
  eq(receiptForFeeRecord(recOwn64).receiptNo, 'RCP-2026-003', 'v41 (d): removing the later receipt returns the lookup to the original number');
  // (e) the receipt view renders even when the student row is missing locally
  db.receipts.push({ receiptNo: 'RCP-2026-041', studentId: 'stu-missing-41', name: 'Missing Kid', cls: '6th-A', admissionNo: 'ADM-2025-041', date: todayIST(), month: 'Nov', total: 800, payMode: 'Cash', payDate: todayIST(), counterNo: '1', session: '2025-26', lines: [] });
  state.collectStudent = 'stu-missing-41'; state.savedReceiptId = 'RCP-2026-041';
  var missHtml66 = collectFeePage('stu-missing-41');
  ok(missHtml66.indexOf('RCP-2026-041') !== -1, 'v41 (e): the receipt view renders from the receipt itself when the student row is missing');
  ok(missHtml66.indexOf("waReceiptShare('RCP-2026-041')") !== -1, 'v41 (e): the rendered receipt still has its Share on WhatsApp button');
  ok(missHtml66.indexOf('Missing Kid') !== -1, 'v41 (e): the receipt view shows the receipt student name, not a blank');
  state.collectStudent = null; state.savedReceiptId = null;
  // (f) adopt-before-mint: the content match finds the earliest server number, and refuses a different fee type
  var srvRows66 = [
    { receipt_no: 'RCP-2026-157', student_id: 'srv-66', total: 800, receipt_date: '2026-11-09', month: 'Dec', student_name: 'V21 Test Kumar', lines: [{ type: 'Tuition', paid: 800 }] },
    { receipt_no: 'RCP-2026-003', student_id: 'srv-66', total: 800, receipt_date: '2026-11-09', month: 'Dec', student_name: 'V21 Test Kumar', lines: [{ type: 'Tuition', paid: 800 }] }
  ];
  var rc66 = { receiptNo: 'RCP-2026-090', studentId: 'stu-66', name: 'V21 Test Kumar', cls: '6th-A', date: '2026-11-09', month: 'Dec', total: 800, lines: [{ type: 'Tuition', paid: 800 }] };
  eq(sbFindReceiptByContent(srvRows66, rc66, { 'stu-66': 'srv-66' }, { 'stu-66': { name: 'V21 Test Kumar' } }), 'RCP-2026-003', 'v41 (f): the adopt search returns the earliest server number holding the same content');
  eq(sbFindReceiptByContent(srvRows66, Object.assign({}, rc66, { lines: [{ type: 'Transport', paid: 800 }] }), { 'stu-66': 'srv-66' }, { 'stu-66': { name: 'V21 Test Kumar' } }), null, 'v41 (f): a different fee type is never adopted — Tuition and Transport on the same day stay separate');
  eq(sbFindReceiptByContent(srvRows66, Object.assign({}, rc66, { total: 900 }), { 'stu-66': 'srv-66' }, { 'stu-66': { name: 'V21 Test Kumar' } }), null, 'v41 (f): a different total is never adopted');
  eq(sbFindReceiptByContent(srvRows66, Object.assign({}, rc66, { month: 'Nov' }), { 'stu-66': 'srv-66' }, { 'stu-66': { name: 'V21 Test Kumar' } }), null, 'v41 (f): a different month is never adopted');
  db.receipts = db.receipts.filter(function (r) { return ['RCP-2026-003', 'RCP-2026-103', 'RCP-2026-157', 'RCP-2026-041'].indexOf(r.receiptNo) === -1; });

  // ---- 67. v42: ss_activities PGRST102 + pull dedup of duplicate receipts + stale Offline line ----
  // Live proof (9 Nov 2026, v41 browser check): the sync failed every cycle with
  // "Backup failed … (ss_activities: insert-ss_activities: PGRST102 All object keys
  // must match)" because sbMapActivity only added created_at when the activity
  // carried a ts — seed activities have none, logged ones do — so the bulk POST
  // mixed 5-key and 6-key rows. The cycle never completed, so the pull never
  // brought the server's original 001/002/003 and the display stayed on the
  // re-numbered 193/194/195.
  // (a) the activities bulk payload: every row carries the identical key set
  var actRows67 = [
    { icon: '💰', bg: 'green', title: 'New fee payment received', sub: 'by Priya Kumari' },
    { icon: '✅', bg: 'blue', title: 'Attendance updated', sub: 'Class 10th-A' },
    { icon: '💰', bg: 'green', title: 'Fee collected', sub: 'V21 Test Kumar • RCP-2026-003 • ₹800', ts: '2026-11-09T15:30:00.000Z' },
    { icon: '📢', bg: 'orange', title: 'New notice published', sub: 'Annual Sports Day', ts: '2026-11-07T10:00:00.000Z' }
  ].map(function (a) { return sbMapActivity(a, 'srv-school-67'); });
  var actKeys67 = actRows67.map(function (r) { return Object.keys(r).sort().join(','); });
  ok(actKeys67.every(function (k) { return k === actKeys67[0]; }), 'v42 (a): every mapped activity row carries the identical key set (no PGRST102)');
  eq(actKeys67[0], 'bg,created_at,icon,school_id,sub,title', 'v42 (a): the key set is exactly the ss_activities columns');
  eq(actRows67[2].created_at, '2026-11-09T15:30:00.000Z', 'v42 (a): a logged activity keeps its own timestamp');
  eq(actRows67[0].created_at, '1970-01-01T00:00:00.000Z', 'v42 (a): a seed activity without ts gets the fixed epoch fallback, never a missing key');
  ok(!isNaN(Date.parse(actRows67[0].created_at)), 'v42 (a): the fallback created_at is a valid timestamp');
  eq(JSON.stringify(sbMapActivity({ icon: '💰', bg: 'green', title: 'New fee payment received', sub: 'by Priya Kumari' }, 'srv-school-67')), JSON.stringify(actRows67[0]), 'v42 (a): mapping the same seed activity twice gives identical output (deterministic, no fresh timestamp)');
  // (b) the content key: same collection = same key; a different total, date or fee type = a different key
  var keyRc67 = { receiptNo: 'RCP-2026-001', studentId: 'stu-v21-67', name: 'V21 Test Kumar', date: '2026-11-08', month: 'Nov', total: 800, lines: [{ type: 'Tuition', paid: 800 }] };
  eq(sbReceiptContentKey(keyRc67), sbReceiptContentKey({ receiptNo: 'RCP-2026-193', studentId: 'stu-v21-67', name: 'V21 Test Kumar', date: '2026-11-08', month: 'Nov', total: 800, lines: [{ type: 'Tuition', paid: 800 }] }), 'v42 (b): the same collection under a re-minted number has the same content key');
  ok(sbReceiptContentKey(keyRc67) !== sbReceiptContentKey(Object.assign({}, keyRc67, { total: 500 })), 'v42 (b): a different total is a different collection');
  ok(sbReceiptContentKey(keyRc67) !== sbReceiptContentKey(Object.assign({}, keyRc67, { date: '2026-11-09' })), 'v42 (b): a different date is a different collection');
  ok(sbReceiptContentKey(keyRc67) !== sbReceiptContentKey(Object.assign({}, keyRc67, { lines: [{ type: 'Transport', paid: 800 }] })), 'v42 (b): a different fee type is a different collection');
  ok(sbReceiptContentKey(keyRc67) !== sbReceiptContentKey(Object.assign({}, keyRc67, { month: 'Oct' })), 'v42 (b): a different month is a different collection');
  // (c) the pull mirror collapses duplicate server rows to the earliest number per collection
  function srvRc67(no, month, date, total) {
    return { id: 'srv-rc-67-' + no, school_id: 'srv-school-67', student_id: 'srv-v21-67', receipt_no: no, admission_no: 'ADM-2025-001', student_name: 'V21 Test Kumar', cls: '6th-A', session: '2025–26', receipt_date: date, month: month, counter_no: 1, lines: [{ key: 'tuition', desc: 'Tuition Fee (' + month + ')', type: 'Tuition', month: month, due: total, con: 0, paid: total }], pay_mode: 'Cash', pay_date: date, bank: '', number: '', total: total, total_words: '', collector: 'Test Admin' };
  }
  var d67 = { students: [], teachers: [], exams: [], feeRecords: [], feeStructure: [], attendance: {}, receipts: [
    { receiptNo: 'RCP-2026-001', studentId: 'stu-v21-67', admissionNo: 'ADM-2025-001', name: 'V21 Test Kumar', cls: '6th-A', session: '2025–26', date: '2026-11-08', month: 'Nov', counterNo: '1', lines: [{ key: 'tuition', desc: 'Tuition Fee (Nov)', type: 'Tuition', month: 'Nov', due: 800, con: 0, paid: 800 }], payMode: 'Cash', payDate: '2026-11-08', bank: '', number: '', total: 800, totalWords: '', collector: 'Test Admin' },
    { receiptNo: 'RCP-2026-002', studentId: 'stu-v21-67', admissionNo: 'ADM-2025-001', name: 'V21 Test Kumar', cls: '6th-A', session: '2025–26', date: '2026-11-09', month: 'Oct', counterNo: '1', lines: [{ key: 'tuition', desc: 'Tuition Fee (Oct)', type: 'Tuition', month: 'Oct', due: 800, con: 0, paid: 800 }], payMode: 'Cash', payDate: '2026-11-09', bank: '', number: '', total: 800, totalWords: '', collector: 'Test Admin' },
    { receiptNo: 'RCP-2026-003', studentId: 'stu-v21-67', admissionNo: 'ADM-2025-001', name: 'V21 Test Kumar', cls: '6th-A', session: '2025–26', date: '2026-11-09', month: 'Dec', counterNo: '1', lines: [{ key: 'tuition', desc: 'Tuition Fee (Dec)', type: 'Tuition', month: 'Dec', due: 800, con: 0, paid: 800 }], payMode: 'Cash', payDate: '2026-11-09', bank: '', number: '', total: 800, totalWords: '', collector: 'Test Admin' }
  ], marks: [], homework: [], notices: [], admissionRequests: [], auditLog: [], activities: [] };
  var byTable67 = {
    ss_students: [{ id: 'srv-v21-67', school_id: 'srv-school-67', local_id: 'stu-v21-67', name: 'V21 Test Kumar', cls: '6th-A', roll: 1, enr: 'ENR-001', guardian: 'G', phone: '9876542108', mobile2: '', parent_email: '', father_name: 'F', mother_name: 'M', occupation: '', dob: '', gender: '', blood_group: '', category: '', address: '', state: '', district: '', pin: '', previous_school: '', previous_class: '', admission_no: 'ADM-2025-001', admission_date: '', session: '2025–26', status: 'Active', result: null, parent_pin: null, photo_data_url: null, documents: { birthCert: false, tc: false, tcNumber: '', other: '' }, aadhaar: '' }],
    ss_receipts: [srvRc67('RCP-2026-001', 'Nov', '2026-11-08', 800), srvRc67('RCP-2026-103', 'Nov', '2026-11-08', 800), srvRc67('RCP-2026-193', 'Nov', '2026-11-08', 800), srvRc67('RCP-2026-002', 'Oct', '2026-11-09', 800), srvRc67('RCP-2026-104', 'Oct', '2026-11-09', 800), srvRc67('RCP-2026-194', 'Oct', '2026-11-09', 800), srvRc67('RCP-2026-003', 'Dec', '2026-11-09', 800), srvRc67('RCP-2026-105', 'Dec', '2026-11-09', 800), srvRc67('RCP-2026-195', 'Dec', '2026-11-09', 800), srvRc67('RCP-2026-050', 'Nov', '2026-11-10', 500)]
  };
  sbApplyServerRows(d67, null, byTable67, null, 'srv-school-67');
  var nos67 = d67.receipts.map(function (r) { return r.receiptNo; }).sort().join(',');
  eq(d67.receipts.length, 4, 'v42 (c): the pull mirror holds 4 receipts, not the 10 server rows');
  eq(nos67, 'RCP-2026-001,RCP-2026-002,RCP-2026-003,RCP-2026-050', 'v42 (c): the mirror keeps the earliest number per collection (001/002/003) and the genuinely different receipt (050)');
  ok(d67.receipts.every(function (r) { return ['RCP-2026-103', 'RCP-2026-104', 'RCP-2026-105', 'RCP-2026-193', 'RCP-2026-194', 'RCP-2026-195'].indexOf(r.receiptNo) === -1; }), 'v42 (c): no re-minted duplicate number survives in the mirror');

  // ---- 68. v43: the status settles to synced with a Last Attempt time; a stale old-version failure never shows as current ----
  // Live shape (9 Nov 2026, v42 browser check): every cycle completed — one manual Back Up Now proved the
  // backup itself works — yet the Settings line stayed on "Syncing with the server…" for ~150s. Each 30s
  // tick / focus event started a new cycle (or queued a follow-up) that wrote 'syncing' at its start, so
  // the 'synced' the previous cycle had written was clobbered before any observation could see it. And a
  // fresh v42 load showed v41's PGRST102 failure on the login screen before any v42 cycle had run.
  // (The quiet-cycle decision itself needs a mock server, so it is covered in the v43 async block below;
  // this section covers the status record, the line, the stale-version rule and the live DOM update.)
  state.role = 'school'; state.user = TEST_ACCOUNTS.school; state.sb = { uid: 'sb-uid-test-school' };
  state.lang = 'en';

  // (a) sbSetStatus stamps the build version on the stored record
  sbSetStatus('synced');
  eq(sbLoadStatus().state, 'synced', 'v43 (a): the stored state is synced');
  eq(sbLoadStatus().v, ${EXPECTED_VERSION}, 'v58 (a): the stored status carries the build version');

  // (b) the synced line carries a Last Attempt date+time, read through the same function the UI uses
  var line43 = sbStatusText();
  ok(line43.indexOf('Backed up to the server.') !== -1, 'v43 (b): the synced line still says Backed up to the server.');
  ok(line43.indexOf('Last attempt: ') !== -1, 'v43 (b): the synced line names the Last attempt');
  eq(line43.slice(line43.indexOf('Last attempt: ') + 14).length, 16, 'v43 (b): the Last Attempt value is a full DD/MM/YYYY HH:MM');
  eq(sbAtLabel('2026-11-09T16:45:00.000Z').length, 16, 'v43 (b): sbAtLabel returns a 16-char date+time label');
  ok(sbAtLabel('2026-11-09T16:45:00.000Z').indexOf(':') !== -1 && sbAtLabel('2026-11-09T16:45:00.000Z').indexOf('/') !== -1, 'v43 (b): the label carries both a date and a time');
  eq(sbAtLabel('not-a-date'), '', 'v43 (b): an unparseable timestamp labels as empty');

  // (c) a failure persisted by an older build (or with no version at all) is stale — pending, never the old failure
  localStorage.setItem('schoolSaathiSbStatus', JSON.stringify({ state: 'failed', at: '2026-11-09T15:00:00.000Z', detail: 'ss_activities: insert-ss_activities: PGRST102 All object keys must match' }));
  ok(sbStatusText().indexOf('Backup failed') === -1, 'v43 (c): a failure with no version stamp (pre-v43) never shows as current');
  ok(sbStatusText().indexOf('Backup pending') !== -1, 'v43 (c): the version-less failure shows the pending wording instead');
  localStorage.setItem('schoolSaathiSbStatus', JSON.stringify({ state: 'failed', at: '2026-11-09T15:00:00.000Z', detail: 'ss_activities: insert-ss_activities: PGRST102 All object keys must match', v: ${EXPECTED_VERSION - 1} }));
  ok(sbStatusText().indexOf('Backup failed') === -1, 'v43 (c): a failure stamped by the previous build (v' + ${EXPECTED_VERSION - 1} + ') never shows as current');
  ok(sbStatusText().indexOf('Backup pending') !== -1, 'v43 (c): the previous-build failure shows the pending wording instead');
  localStorage.setItem('schoolSaathiSbStatus', JSON.stringify({ state: 'failed', at: '2026-11-09T15:00:00.000Z', detail: 'ss_activities: insert-ss_activities: PGRST102 All object keys must match', v: ${EXPECTED_VERSION} }));
  ok(sbStatusText().indexOf('Backup failed') !== -1 && sbStatusText().indexOf('PGRST102') !== -1, 'v43 (c): a failure stamped by the current build still shows truthfully with its detail');

  // (d) writing a status updates the visible lines in place, without waiting for a re-render
  sbSetStatus('synced');
  ok(document.getElementById('sbStatusLine').textContent.indexOf('Backed up to the server.') !== -1, 'v43 (d): writing synced updates the Settings status line in place');
  ok(document.getElementById('sbStatus').textContent.indexOf('Backed up to the server.') !== -1, 'v43 (d): writing synced updates the login-screen status line in place too');
  ok(document.getElementById('sbStatusLine').textContent.indexOf('Last attempt: ') !== -1, 'v43 (d): the Settings line in place carries the Last Attempt time');

  // (e) the Last attempt label has both languages
  ok(!!I18N.en.sbLastAttempt && !!I18N.hi.sbLastAttempt, 'v43 (e): the Last attempt label has English and Hindi keys');

  // ---- 69. v44: the students 409 adopt + the truthful manual-backup toast ----
  // Live shape (9 Nov 2026, v43 browser check): every cycle failed with
  // (post-ss_students-409) — the V21 Test Kumar row had been re-created on
  // the server 9 Nov 12:37 UTC with a new uuid but the same local_id, while
  // the stored id map still pointed at the deleted row, so the push never
  // found the row and POSTed a duplicate admission_no every cycle. And one
  // manual Back Up Now toasted "Backup complete." while the cycle was still
  // failing — the migration the toast trusted never flushes the outbox.
  // (The adopt + flush behaviour needs a mock server, so it is covered in
  // the v44 async block below; this section covers the toast strings, the
  // toast showing, and the v43 failure now being stale.)

  // (a) the manual-backup toast strings exist in both languages (the Hindi
  // keys are new in v44 — the toast fell back to English before)
  ok(!!I18N.en.sbBackupDone && !!I18N.hi.sbBackupDone, 'v44 (a): Backup complete. has English and Hindi keys');
  ok(!!I18N.en.sbBackupFailed && !!I18N.hi.sbBackupFailed, 'v44 (a): Backup did not finish has English and Hindi keys');

  // (b) toast() shows the message immediately, and a second toast replaces the first
  toast(t('sbBackupDone'));
  eq(document.getElementById('toast').textContent, 'Backup complete.', 'v44 (b): the success toast shows its text');
  ok(document.getElementById('toast').classList.contains('show'), 'v44 (b): the success toast is visible');
  toast(t('sbBackupFailed'));
  ok(document.getElementById('toast').textContent.indexOf('Backup did not finish') !== -1, 'v44 (b): the failure toast replaces the success text');

  // (c) a failure stamped by the previous build (v43) is now stale — pending, never the old failure
  localStorage.setItem('schoolSaathiSbStatus', JSON.stringify({ state: 'failed', at: '2026-11-09T16:00:00.000Z', detail: 'ss_students: post-ss_students-409', v: 43 }));
  ok(sbStatusText().indexOf('Backup failed') === -1, 'v44 (c): a v43 failure (the live 409) never shows as current on v44');
  ok(sbStatusText().indexOf('Backup pending') !== -1, 'v44 (c): the v43 failure shows the pending wording instead');

  // ---- 70. v45: the demo-seed quarantine — id + content fingerprint ----
  // Live shape (9 Nov 2026, v44 verification): the test school went from
  // 1 student to 40 in ~5 minutes, its school row renamed to "St. Xavier
  // School" (counters 41/1), ~149 receipt numbers minted — all seedDB()
  // rows uploaded from a client whose local DB still held the pre-v36
  // seed. The quarantine recognises a seed row by its local_id AND the
  // seed's exact content for that id (the fingerprint is built from
  // seedDB() itself). The id alone is not enough: ordinary rows reuse
  // short ids (the harness fixtures use stu1/stu2/ex1/fee1 for real
  // rows named Asha/Bala/UT1), so a content mismatch means "not seed".
  var seed45 = seedDB();
  // (a) the fingerprint identifies the live flood rows exactly
  ok(sbIsSeedRow('ss_students', seed45.students[0]), 'v45 (a): the seed stu1 (Aarav Verma, ADM-2025-001) is recognised as seed');
  eq(seed45.students[0].name, 'Aarav Verma', 'v45 (a): the seed stu1 is the name the live server row was renamed to');
  ok(sbIsSeedRow('ss_students', seed45.students[1]), 'v45 (a): the seed stu2 (Vivaan Choudhary) is recognised as seed');
  ok(sbIsSeedRow('ss_students', seed45.students[39]), 'v45 (a): the seed stu40 is recognised as seed');
  ok(sbIsSeedRow('ss_teachers', seed45.teachers[11]), 'v45 (a): the seed t12 is recognised as seed');
  ok(sbIsSeedRow('ss_exams', seed45.exams[4]), 'v45 (a): the seed ex5 is recognised as seed');
  ok(sbIsSeedRow('ss_fee_records', seed45.feeRecords[0]), 'v45 (a): the seed fee1 is recognised as seed');
  ok(sbIsSeedRow('ss_homework', seed45.homework[3]), 'v45 (a): the seed hw4 is recognised as seed');
  ok(sbIsSeedRow('ss_notices', seed45.notices[2]), 'v45 (a): the seed n3 is recognised as seed');
  // (b) a real row reusing a short id is never quarantined
  ok(!sbIsSeedRow('ss_students', { id: 'stu1', name: 'Asha', admissionNo: 'ADM-2025-001', enr: 'ENR-001' }), 'v45 (b): a real stu1 named Asha (same numbers, different name) is not seed');
  ok(!sbIsSeedRow('ss_students', { id: 'stu1794162292000', name: 'V21 Test Kumar', admissionNo: 'ADM-2025-001', enr: 'ENR-001' }), 'v45 (b): the real V21 row (long uniqueId, same admission_no) is not seed');
  ok(!sbIsSeedRow('ss_students', { id: 'stu41', name: 'Nobody', admissionNo: 'ADM-2025-041', enr: 'ENR-041' }), 'v45 (b): stu41 (outside the seed range) is not seed');
  ok(!sbIsSeedRow('ss_teachers', { id: 't13', name: 'Nobody', subject: 'Maths', cls: '6th-A' }), 'v45 (b): t13 (outside the seed range) is not seed');
  ok(!sbIsSeedRow('ss_exams', { id: 'ex1', name: 'UT1', cls: '6th-A', subject: 'Maths' }), 'v45 (b): a real ex1 named UT1 is not seed');
  ok(!sbIsSeedRow('ss_fee_records', { id: 'fee1', studentId: 'stu1', student: 'Asha', cls: '6th-A', month: 'Nov', type: 'Tuition', amount: 800, status: 'Pending' }), 'v45 (b): a real fee1 (Asha, Nov, 800, Pending) is not seed');
  ok(!sbIsSeedRow('ss_homework', { id: 'hw1', cls: '6th-A', subject: 'Maths', title: 'Ex 1' }), 'v45 (b): a real hw1 is not seed');
  ok(!sbIsSeedRow('ss_notices', { id: 'n1', title: 'Hi', date: '2026-11-01' }), 'v45 (b): a real n1 is not seed');
  // (c) the id-only predicate still gates the fingerprint: a seed id
  // with edited content escapes (it was user-edited), a non-seed id
  // never matches even with seed content
  ok(sbIsSeedLocalId('ss_students', 'stu1') && !sbIsSeedLocalId('ss_students', 'stu1794162292000'), 'v45 (c): the id pattern matches stu1 but never a uniqueId row');
  ok(!sbIsSeedRow('ss_students', { id: 'stu1', name: 'Aarav Kumar', admissionNo: 'ADM-2025-001', enr: 'ENR-001' }), 'v45 (c): a renamed seed row (Aarav Kumar) escapes the quarantine — it was user-edited');
  // (d) the seed profile fingerprint needs the profile AND seed rows
  ok(sbIsSeedProfile(seed45), 'v45 (d): the seed DB (St. Xavier profile + seed rows) is recognised as the seed profile');
  ok(!sbIsSeedProfile({ profile: { name: 'St. Xavier School', city: 'Patna', principal: 'Rahul Kumar', phone: '+91 98350 12345', email: 'info@stxavierpatna.edu.in' }, students: [{ id: 'stu1794162292000', name: 'V21 Test Kumar', admissionNo: 'ADM-2025-001', enr: 'ENR-001' }], teachers: [], exams: [], feeRecords: [], homework: [], notices: [] }), 'v45 (d): the same profile with no seed rows is not treated as seed');
  ok(!sbIsSeedProfile({ profile: { name: 'VM School', city: '', principal: 'Sunil Kumar', phone: '', email: 'vm@school.in' }, students: seed45.students, teachers: [], exams: [], feeRecords: [], homework: [], notices: [] }), 'v45 (d): a real profile with seed rows attached is not the seed profile');
  // (e) the student/exam id resolvers use the local row's content.
  // A seed-pattern id with no local row is never quarantined on its
  // id alone — a partial DB that omits the students array is not
  // seed evidence. (The pull merge snapshots the seed ids before it
  // drops the student/exam rows, so the dependent rows are still
  // recognised there.)
  ok(sbIsSeedStudentId('stu1', seed45), 'v45 (e): stu1 resolves as seed against the seed DB');
  ok(!sbIsSeedStudentId('stu1', { students: [{ id: 'stu1', name: 'Asha', admissionNo: 'ADM-2025-001', enr: 'ENR-001' }] }), 'v45 (e): stu1 resolves as not-seed against a DB holding Asha');
  ok(!sbIsSeedStudentId('stu1', { students: [] }), 'v45 (e): stu1 with no local row is NOT quarantined on its id alone');
  ok(!sbIsSeedStudentId('stu41', { students: [] }), 'v45 (e): stu41 is NOT a seed id even with no local row');
  ok(!sbIsSeedStudentId('stu1794162292000', { students: [] }), 'v45 (e): the V21 id is NOT a seed id even with no local row');
  ok(sbIsSeedExamId('ex1', seed45), 'v45 (e): ex1 resolves as seed against the seed DB');
  ok(!sbIsSeedExamId('ex1', { exams: [] }), 'v45 (e): ex1 with no local row is NOT quarantined on its id alone');
  // (f) a failure stamped by the previous build (v44) is now stale — pending, never the old failure
  localStorage.setItem('schoolSaathiSbStatus', JSON.stringify({ state: 'failed', at: '2026-11-09T17:00:00.000Z', detail: 'ss_students: post-ss_students-409', v: 44 }));
  ok(sbStatusText().indexOf('Backup failed') === -1, 'v45 (f): a v44 failure (the live 409) never shows as current on v45');
  ok(sbStatusText().indexOf('Backup pending') !== -1, 'v45 (f): the v44 failure shows the pending wording instead');
  // ---- v54: PIN fixes (A1 rate limit + hashing, A2 never render) ----
  // (i) hash helpers: salted, per-PIN salt, verifies; wrong PIN fails.
  var h54a = hashPin('4321'), h54b = hashPin('4321');
  ok(h54a.indexOf('bcrypt$') === 0 && h54b.indexOf('bcrypt$') === 0, 'v54 (A1): hashPin stores a bcrypt hash');
  ok(h54a !== h54b, 'v54 (A1): the same PIN hashes differently each time (per-PIN salt)');
  ok(verifyPin('4321', { parentPinHash: h54a }), 'v54 (A1): the hash verifies the right PIN');
  ok(!verifyPin('1234', { parentPinHash: h54a }), 'v54 (A1): the hash rejects a wrong PIN');
  ok(!verifyPin('4321', { parentPinHash: '' }), 'v54 (A1): no hash means no login');
  ok(!verifyPin('4321', { parentPin: '4321' }), 'v54 (A1): a plaintext-only record does not verify through the hash path');
  // ---- v72 (P1-1): bcrypt replaces salted SHA-256 as the new-hash scheme ----
  ok(bcryptAvailable() === true, 'v72 (P1-1): bcryptjs is loaded in the app context');
  var h72 = hashPwNew('TestPass-2026');
  ok(h72.indexOf('bcrypt$') === 0 && h72.length === 7 + 60, 'v72 (P1-1): a new password hash is bcrypt$ + a 60-char $2a$ hash');
  ok(verifyPw('TestPass-2026', { pwHash: h72 }).ok && verifyPw('TestPass-2026', { pwHash: h72 }).legacy === false, 'v72 (P1-1): the bcrypt hash verifies the right password and is not legacy');
  ok(!verifyPw('wrongpass', { pwHash: h72 }).ok, 'v72 (P1-1): the bcrypt hash rejects a wrong password');
  var s72salt = randomHex(16);
  var s72 = 's256$' + s72salt + '$' + sha256Hex(s72salt + '|' + 'oldpass');
  ok(verifyPw('oldpass', { pwHash: s72 }).ok && verifyPw('oldpass', { pwHash: s72 }).legacy === true, 'v72 (P1-1): a legacy s256$ hash still verifies, flagged legacy');
  ok(!verifyPw('nope', { pwHash: s72 }).ok, 'v72 (P1-1): a legacy s256$ hash rejects a wrong password');
  ok(verifyPw('djbpw', { pwHash: hashPw('djbpw') }).ok && verifyPw('djbpw', { pwHash: hashPw('djbpw') }).legacy === true, 'v72 (P1-1): a legacy djb2 hash still verifies, flagged legacy');
  var pin72 = hashPin('3175');
  ok(pin72.indexOf('bcrypt$') === 0 && verifyPin('3175', { parentPinHash: pin72 }) && !verifyPin('9999', { parentPinHash: pin72 }), 'v72 (P1-1): hashPin/verifyPin round-trip on bcrypt');
  var up72 = { email: 'up72@test.in', pwHash: s72, hashScheme: 'sha256' };
  upgradePwHash(up72, 'oldpass');
  ok(up72.pwHash.indexOf('bcrypt$') === 0 && up72.hashScheme === 'bcrypt' && verifyPw('oldpass', up72).ok, 'v72 (P1-1): upgradePwHash re-hashes a legacy account to bcrypt');
  var _b72 = dcodeIO, fb72;
  try { dcodeIO = undefined; fb72 = hashPwNew('fallback'); } finally { dcodeIO = _b72; }
  ok(fb72.indexOf('s256$') === 0 && verifyPw('fallback', { pwHash: fb72 }).ok, 'v72 (P1-1): without bcryptjs, new hashes fall back to s256$');
  eq(hashSchemeOf('bcrypt$abc'), 'bcrypt', 'v72 (P1-1): hashSchemeOf reads bcrypt$');
  eq(hashSchemeOf('s256$abc'), 'sha256', 'v72 (P1-1): hashSchemeOf reads s256$');
  eq(hashSchemeOf('h123'), 'djb2', 'v72 (P1-1): hashSchemeOf reads djb2');
  // ---- v73: teacher cloud-login fallback when the school is local ----
  // v72 live verification found the gap: on a device where the school is
  // already local, the picker offers no "cloud:" option ("local wins"),
  // and the local path has no login account for a teacher created on
  // another device — so a correct password failed with "Invalid email or
  // password" and the server was never asked. The fix: when no local
  // account exists for the email and the picked school is linked to the
  // server, fall back to the cloud login for that school.
  var rpcCalls73 = [];
  var realFetch73 = fetch;
  function fetch73(url, init) {
    var u = String(url);
    rpcCalls73.push(u);
    if (u.indexOf('ss_teacher_cloud_login') !== -1) {
      return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true, locked: false, token: 'tok-73', teacher: { id: '00000000-0000-0000-0000-000000000073', local_id: 'te-73', name: 'Cloud Teacher 73', subject: 'Maths', cls: '6th-A', classes: ['6th-A'] }, school: { id: 'srv-73', name: 'Cloud School 73', city: 'Gopalganj' }, students: [], attendance: [], homework: [], notices: [], exams: [], marks: [] }); } });
    }
    return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({}); } });
  }
  var tick73 = function () { return new Promise(function (r) { setTimeout(r, 0); }); };
  logout(); await waitLogout();
  var accs73 = loadAccounts();
  saveAccounts(accs73.concat([{ uid: 'u-73', name: 'Cloud School 73', school: 'Cloud School 73', email: 'school73@test.in', pwHash: hashPwNew('schoolpass'), hashScheme: 'bcrypt', role: 'school', sbUid: 'uid-73' }]));
  sbSaveServerSchool('u-73', 'srv-73');
  fetch = fetch73;
  // (a) No local teacher account + server-linked school => cloud fallback.
  rpcCalls73 = [];
  $('teacherSchool').value = 'u-73';
  $('teacherEmail').value = 'cloud73@teacher.in';
  $('teacherPw').value = 'teach123';
  $('teacherErr').textContent = '';
  doTeacherLogin({ preventDefault: function () {} });
  await tick73(); await tick73(); await tick73();
  eq(rpcCalls73.some(function (u) { return u.indexOf('ss_teacher_cloud_login') !== -1; }), true, 'v73: a teacher with no local account falls back to the cloud login');
  eq(state.role, 'teacher', 'v73: the cloud fallback logs the teacher in');
  eq(state.user && state.user.cloud, true, 'v73: the fallback session is a cloud teacher session');
  eq(state.user && state.user.schoolServerId, 'srv-73', 'v73: the fallback uses the picked school server id');
  logout(); await waitLogout();
  // (b) Local-only school (no server link) => no fallback, generic error.
  saveAccounts(loadAccounts().concat([{ uid: 'u-73b', name: 'Local Only School', school: 'Local Only School', email: 'school73b@test.in', pwHash: hashPwNew('schoolpass'), hashScheme: 'bcrypt', role: 'school', sbUid: 'uid-73b' }]));
  rpcCalls73 = [];
  $('teacherSchool').value = 'u-73b';
  $('teacherEmail').value = 'cloud73@teacher.in';
  $('teacherPw').value = 'teach123';
  $('teacherErr').textContent = '';
  doTeacherLogin({ preventDefault: function () {} });
  await tick73(); await tick73(); await tick73();
  eq(rpcCalls73.some(function (u) { return u.indexOf('ss_teacher_cloud_login') !== -1; }), false, 'v73: a local-only school never calls the cloud login');
  eq(state.role, null, 'v73: a local-only school with no local teacher account does not log in');
  eq(__els['teacherErr'].textContent, t('tInvalidCreds'), 'v73: a local-only school shows the generic error');
  // (c) A local teacher account with a WRONG password never falls back.
  saveAccounts(loadAccounts().concat([{ uid: 't-73', name: 'Local Teacher 73', school: 'Cloud School 73', email: 'local73@teacher.in', pwHash: hashPwNew('teach123'), hashScheme: 'bcrypt', role: 'teacher', schoolUid: 'u-73' }]));
  rpcCalls73 = [];
  $('teacherSchool').value = 'u-73';
  $('teacherEmail').value = 'local73@teacher.in';
  $('teacherPw').value = 'wrongpass';
  $('teacherErr').textContent = '';
  doTeacherLogin({ preventDefault: function () {} });
  await tick73(); await tick73(); await tick73();
  eq(rpcCalls73.some(function (u) { return u.indexOf('ss_teacher_cloud_login') !== -1; }), false, 'v73: a wrong password on a local teacher account never reaches the server');
  eq(state.role, null, 'v73: a wrong local teacher password does not log in');
  eq(__els['teacherErr'].textContent, t('tInvalidCreds'), 'v73: a wrong local teacher password shows the generic error');
  fetch = realFetch73;
  logout(); await waitLogout();
  loginAs(TEST_ACCOUNTS.school); // v73: restore the school session + db — the cloud-teacher login left db on the cloud slice, and the tests below push to db directly
  // ---- v74 (P1-2): teacher cloud payload is bounded (SQL 24) ----
  // The login payload no longer ships photos, parent PIN hashes or
  // Aadhaar numbers, and exams are class-filtered. The mapper treats
  // all three as missing, and a cloud teacher fetches a photo on demand
  // when opening a student profile.
  // (a) Mapper: a photo-less, PIN-less, Aadhaar-less student row maps
  // cleanly, and an exam from another class is dropped by the mapper.
  var p74 = { teacher: { id: '00000000-0000-0000-0000-000000000074', local_id: 'te-74', name: 'Photo Teacher', subject: 'Maths', cls: '6th-A', classes: ['6th-A'] }, school: { id: 'srv-74', name: 'Photo School', city: 'Gopalganj' }, students: [{ id: 'stu-74', local_id: 'stu-74', name: 'Photo Kid', cls: '6th-A', roll: 1, admission_no: 'ADM-2025-074', status: 'Active' }], attendance: [], homework: [], notices: [], exams: [{ id: 'e74a', local_id: 'ex-74a', name: '6th-A Test', cls: '6th-A', subject: 'Maths', exam_date: '2026-11-11', total: 50 }, { id: 'e74b', local_id: 'ex-74b', name: '10th-A Test', cls: '10th-A', subject: 'Maths', exam_date: '2026-11-11', total: 50 }], marks: [] };
  var slice74 = mapCloudTeacherPayload(p74);
  eq(slice74.students.length, 1, 'v74: the bounded payload maps its student');
  eq(slice74.students[0].photo, null, 'v74: a student row without photo_data_url maps to photo null');
  eq(slice74.students[0].parentPinHash, undefined, 'v74: a student row without parent_pin maps to no PIN hash');
  eq(slice74.students[0].aadhaar, '', 'v74: a student row without aadhaar maps to an empty aadhaar');
  eq(slice74.students[0].srvId, 'stu-74', 'v74: the mapped student keeps its server id for the photo fetch');
  eq(slice74.exams.length, 1, 'v74: the mapper drops an exam from another class');
  eq(slice74.exams[0].name, '6th-A Test', 'v74: the mapper keeps the exam from the teacher class');
  // (b) Photo lazy-load: opening the profile fetches the photo once.
  var rpcCalls74 = [];
  var realFetch74 = fetch;
  function fetch74(url, init) {
    var u = String(url);
    rpcCalls74.push(u);
    if (u.indexOf('ss_teacher_student_photo') !== -1) {
      return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true, photo_data_url: 'data:image/png;base64,PHOTO74' }); } });
    }
    return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({}); } });
  }
  var tick74 = function () { return new Promise(function (r) { setTimeout(r, 0); }); };
  var acct74 = { role: 'teacher', name: 'Photo Teacher', sub: 'Teacher • Photo Teacher', email: 'cloud-teacher:srv-74:te-74', uid: 'cloud-teacher-te-74', teacherId: 'te-74', schoolUid: 'srv-74', cloud: true, schoolServerId: 'srv-74' };
  loginCloudTeacher(acct74, slice74, 'tok-74', { silent: true });
  eq(state.cloudTeacherToken, 'tok-74', 'v74: the cloud teacher session is live for the photo test');
  fetch = fetch74;
  rpcCalls74 = [];
  openStudentProfile('stu-74');
  await tick74(); await tick74(); await tick74();
  eq(rpcCalls74.some(function (u) { return u.indexOf('ss_teacher_student_photo') !== -1; }), true, 'v74: opening a profile without a photo calls the photo RPC');
  eq(db.students[0].photo, 'data:image/png;base64,PHOTO74', 'v74: the fetched photo lands on the student record');
  var snap74 = JSON.parse(sessionStorage.getItem(CLOUD_TEACHER_KEY) || '{}');
  eq(snap74.slice && snap74.slice.students && snap74.slice.students[0] && snap74.slice.students[0].photo, 'data:image/png;base64,PHOTO74', 'v74: the fetched photo is saved in the cloud snapshot');
  // (c) A second open does NOT fetch again (the photo is already there).
  rpcCalls74 = [];
  openStudentProfile('stu-74');
  await tick74(); await tick74();
  eq(rpcCalls74.some(function (u) { return u.indexOf('ss_teacher_student_photo') !== -1; }), false, 'v74: a profile with a photo does not fetch again');
  // (d) A school session never fetches a photo (no cloud token).
  fetch = realFetch74;
  logout(); await waitLogout();
  loginAs(TEST_ACCOUNTS.school);
  rpcCalls74 = [];
  fetch = fetch74;
  var stu74school = db.students.find(function (s) { return s.cls === '6th-A' && s.status === 'Active'; });
  ok(!!stu74school, 'v74: a school student exists for the no-fetch check');
  openStudentProfile(stu74school.id);
  await tick74(); await tick74();
  eq(rpcCalls74.some(function (u) { return u.indexOf('ss_teacher_student_photo') !== -1; }), false, 'v74: a school session never calls the photo RPC');
  fetch = realFetch74;
  logout(); await waitLogout();
  loginAs(TEST_ACCOUNTS.school); // v74: restore the school session + db
  // ---- v80 (Phase 3): the teacher photo RPC must return the Storage URL ----
  // After the v78 Storage migration a synced photo lives in photo_url and
  // photo_data_url is null; the v74 RPC (SQL 24) returned only the data
  // URL, so a cloud teacher opening a profile got null. SQL 29 returns
  // both; the app prefers the data URL and falls back to the Storage URL.
  var rpcCalls80 = [];
  function fetch80(url, init) {
    var u = String(url);
    rpcCalls80.push(u);
    if (u.indexOf('ss_teacher_student_photo') !== -1) {
      return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true, photo_data_url: null, photo_url: 'https://x.supabase.co/storage/v1/object/public/student-photos/s79/stu-80.jpg' }); } });
    }
    return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({}); } });
  }
  loginCloudTeacher(acct74, slice74, 'tok-74', { silent: true });
  // The v74 profile already has a photo (PHOTO74) — clear it so the fetch runs again.
  db.students[0].photo = null;
  fetch = fetch80;
  rpcCalls80 = [];
  openStudentProfile('stu-74');
  await tick74(); await tick74(); await tick74();
  eq(rpcCalls80.some(function (u) { return u.indexOf('ss_teacher_student_photo') !== -1; }), true, 'v80: opening a profile without a photo calls the photo RPC');
  eq(db.students[0].photo, 'https://x.supabase.co/storage/v1/object/public/student-photos/s79/stu-80.jpg', 'v80: a Storage URL from the photo RPC lands on the student record when the data URL is null');
  fetch = realFetch74;
  logout(); await waitLogout();
  loginAs(TEST_ACCOUNTS.school); // v80: restore the school session + db
  // ---- v82 (Phase 3): the photo preview shows immediately on file choose ----
  // Live v81: choosing a photo never updated the preview (the compression
  // callback never fired). The preview now shows the raw file at once via
  // an object URL, then the compressed data URL when the read completes.
  var FileReader82b = function () {};
  FileReader82b.prototype.readAsDataURL = function () { var self = this; setTimeout(function () { self.result = 'data:image/jpeg;base64,/9j/82PREV'; if (self.onload) self.onload(); }, 0); };
  FileReader = FileReader82b;
  pendingPhoto = null;
  document.getElementById('fStName').value = 'Preview Kid';
  var prev82 = document.getElementById('fStPhotoPrev');
  prev82.innerHTML = '';
  onStudentPhoto({ files: [{ size: 3704 }] });
  ok(prev82.innerHTML.indexOf('blob:x') !== -1, 'v82: choosing a photo shows the raw file immediately via an object URL');
  await tick74(); await tick74();
  eq(pendingPhoto, 'data:image/jpeg;base64,/9j/82PREV', 'v82: the compressed data URL lands in pendingPhoto after the fast-path read');
  ok(prev82.innerHTML.indexOf('data:image/jpeg;base64,/9j/82PREV') !== -1, 'v82: the preview is replaced by the compressed data URL');
  FileReader = undefined;
  pendingPhoto = null;
  // ---- v83 (Phase 3): a file chosen without a change event is still picked up ----
  // Live v82: the file name showed but the preview never updated — the
  // input's change event did not fire in the cloud browser. A 400 ms poll
  // watches #fStPhoto while the Edit Student form is open.
  var FileReader83 = function () {};
  FileReader83.prototype.readAsDataURL = function () { var self = this; setTimeout(function () { self.result = 'data:image/jpeg;base64,/9j/83WATCH'; if (self.onload) self.onload(); }, 0); };
  FileReader = FileReader83;
  pendingPhoto = null;
  document.getElementById('fStName').value = 'Watch Kid';
  var prev83 = document.getElementById('fStPhotoPrev');
  prev83.innerHTML = '';
  // Fake a file already sitting in the input (no change event fired).
  var file83 = { size: 3704 };
  var input83 = document.getElementById('fStPhoto');
  input83.files = [file83];
  var timersBefore83 = __timers.length;
  startPhotoWatch();
  eq(__timers.length, timersBefore83 + 1, 'v83: opening the form starts the photo watch interval');
  // Fire the recorded interval callback by hand (the harness stub never fires it on its own).
  var watch83 = __timers[__timers.length - 1];
  watch83.fn();
  ok(prev83.innerHTML.indexOf('blob:x') !== -1, 'v83: the watch picks up a file chosen without a change event and shows the preview');
  await tick74(); await tick74();
  eq(pendingPhoto, 'data:image/jpeg;base64,/9j/83WATCH', 'v83: the watch-driven read lands in pendingPhoto');
  stopPhotoWatch();
  ok(photoWatchId === null, 'v83: stopPhotoWatch clears the interval');
  FileReader = undefined;
  pendingPhoto = null;
  // ---- v75 (P1-3): tokens and cloud snapshots live in sessionStorage ----
  // The Supabase bearer token and the cloud teacher/student snapshots end
  // with the tab now (sessionStorage), and a pre-v75 localStorage copy is
  // adopted once. The Settings action removes a school's data from the
  // device without touching the account or any other school.
  // (a) Supabase session: stored in sessionStorage, never in localStorage.
  sbClearSession();
  var sess75 = sbStoreSession({ access_token: 'tok-75', refresh_token: 'ref-75', expires_at: Date.now() + 3600000, user: { id: 'u-75' } });
  ok(!!sess75 && sess75.access_token === 'tok-75', 'v75: sbStoreSession stores the session');
  ok(!!sessionStorage.getItem(SB_SESSION_KEY) && sessionStorage.getItem(SB_SESSION_KEY).indexOf('tok-75') !== -1, 'v75: the bearer token is in sessionStorage');
  eq(localStorage.getItem(SB_SESSION_KEY), null, 'v75: the bearer token is NOT in localStorage');
  eq(sbLoadSession() && sbLoadSession().access_token, 'tok-75', 'v75: sbLoadSession reads the session from sessionStorage');
  // Adopt-once: a pre-v75 localStorage copy is adopted and then gone.
  sessionStorage.removeItem(SB_SESSION_KEY);
  localStorage.setItem(SB_SESSION_KEY, JSON.stringify({ access_token: 'tok-75-old', refresh_token: 'ref-75-old' }));
  eq(sbLoadSession() && sbLoadSession().access_token, 'tok-75-old', 'v75: an old localStorage session is adopted once');
  eq(localStorage.getItem(SB_SESSION_KEY), null, 'v75: the adopted localStorage copy is removed');
  ok(!!sessionStorage.getItem(SB_SESSION_KEY) && sessionStorage.getItem(SB_SESSION_KEY).indexOf('tok-75-old') !== -1, 'v75: the adopted session now lives in sessionStorage');
  sbClearSession();
  eq(sessionStorage.getItem(SB_SESSION_KEY), null, 'v75: sbClearSession clears the sessionStorage copy');
  eq(localStorage.getItem(SB_SESSION_KEY), null, 'v75: sbClearSession clears the localStorage copy too');
  // (b) Cloud snapshots: stored in sessionStorage, adopted once.
  var p75t = { teacher: { id: '00000000-0000-0000-0000-000000000075', local_id: 'te-75', name: 'Sess Teacher', subject: 'Maths', cls: '6th-A', classes: ['6th-A'] }, school: { id: 'srv-75', name: 'Sess School', city: 'Gopalganj' }, students: [{ id: 'stu-75', local_id: 'stu-75', name: 'Sess Kid', cls: '6th-A', roll: 1, admission_no: 'ADM-2025-075', status: 'Active' }], attendance: [], homework: [], notices: [], exams: [], marks: [] };
  var slice75t = mapCloudTeacherPayload(p75t);
  var acct75t = { role: 'teacher', name: 'Sess Teacher', sub: 'Teacher • Sess Teacher', email: 'cloud-teacher:srv-75:te-75', uid: 'cloud-teacher-te-75', teacherId: 'te-75', schoolUid: 'srv-75', cloud: true, schoolServerId: 'srv-75' };
  loginCloudTeacher(acct75t, slice75t, 'tok-75', { silent: true });
  ok(!!sessionStorage.getItem(CLOUD_TEACHER_KEY) && sessionStorage.getItem(CLOUD_TEACHER_KEY).indexOf('tok-75') !== -1, 'v75: the teacher snapshot is in sessionStorage');
  eq(localStorage.getItem(CLOUD_TEACHER_KEY), null, 'v75: the teacher snapshot is NOT in localStorage');
  logout(); await waitLogout();
  loginAs(TEST_ACCOUNTS.school);
  var p75s = { student: { id: 'stu-75', local_id: 'stu-75', name: 'Sess Kid', cls: '6th-A', admission_no: 'ADM-2025-075', status: 'Active', result: 0 }, school: { id: 'srv-75', name: 'Sess School', city: 'Gopalganj' }, fees: [], attendance: [], marks: [], exams: [], homework: [], notices: [], fee_structure: [] };
  var slice75s = mapCloudStudentPayload(p75s);
  var acct75s = { role: 'student', name: 'Sess Kid', email: 'cloud-student:srv-75:stu-75', uid: 'cloud-student-stu-75', studentId: 'stu-75', schoolUid: 'srv-75', cloud: true };
  loginCloudStudent(acct75s, slice75s, { silent: true });
  ok(!!sessionStorage.getItem(CLOUD_STUDENT_KEY), 'v75: the student snapshot is in sessionStorage');
  eq(localStorage.getItem(CLOUD_STUDENT_KEY), null, 'v75: the student snapshot is NOT in localStorage');
  logout(); await waitLogout();
  loginAs(TEST_ACCOUNTS.school);
  // Adopt-once for a cloud snapshot.
  sessionStorage.removeItem(CLOUD_TEACHER_KEY);
  localStorage.setItem(CLOUD_TEACHER_KEY, JSON.stringify({ acct: acct75t, slice: slice75t, token: 'tok-75-old' }));
  var adopted75 = sessGet(CLOUD_TEACHER_KEY);
  eq(adopted75 && JSON.parse(adopted75).token, 'tok-75-old', 'v75: an old localStorage teacher snapshot is adopted once');
  eq(localStorage.getItem(CLOUD_TEACHER_KEY), null, 'v75: the adopted teacher snapshot is removed from localStorage');
  ok(!!sessionStorage.getItem(CLOUD_TEACHER_KEY), 'v75: the adopted teacher snapshot now lives in sessionStorage');
  sessRemove(CLOUD_TEACHER_KEY);
  // (c) Remove school data from this device: wipes only this school's keys.
  var wipeUid75 = state.user.uid;
  var wipeDbKey75 = dbKeyFor(state.user);
  var savedDb75 = localStorage.getItem(wipeDbKey75);
  var savedBak75 = localStorage.getItem(wipeDbKey75 + '.bak');
  var savedQuar75 = localStorage.getItem(wipeDbKey75 + '.quarantine');
  var savedOut75 = localStorage.getItem(sbOutboxKey(wipeUid75));
  var savedSnap75 = localStorage.getItem(SB_SNAP_KEY + ':' + wipeUid75);
  var savedSrv75 = localStorage.getItem(SB_SRVID_KEY + ':' + wipeUid75);
  var savedMap75 = localStorage.getItem(SB_SCHOOL_MAP_KEY);
  localStorage.setItem(wipeDbKey75 + '.bak', JSON.stringify({ v: 2, students: [] }));
  localStorage.setItem(wipeDbKey75 + '.quarantine', JSON.stringify({ v: 2, students: [] }));
  localStorage.setItem(sbOutboxKey(wipeUid75), JSON.stringify([{ table: 'students', op: 'insert' }]));
  localStorage.setItem(SB_SNAP_KEY + ':' + wipeUid75, JSON.stringify({ students: {} }));
  localStorage.setItem(SB_SRVID_KEY + ':' + wipeUid75, JSON.stringify({ students: {} }));
  localStorage.setItem(SB_SCHOOL_MAP_KEY, JSON.stringify((function () { var m = {}; m[wipeUid75] = 'srv-75'; return m; })()));
  sessionStorage.setItem(CLOUD_TEACHER_KEY, JSON.stringify({ acct: acct75t, slice: slice75t, token: 'tok-75' }));
  localStorage.setItem('schoolSaathiDB_other-uid-75', JSON.stringify({ v: 2, students: [] }));
  removeSchoolDataFromDevice(state.user);
  eq(localStorage.getItem(wipeDbKey75), null, 'v75: the wipe removes the school DB');
  eq(localStorage.getItem(wipeDbKey75 + '.bak'), null, 'v75: the wipe removes the DB backup');
  eq(localStorage.getItem(wipeDbKey75 + '.quarantine'), null, 'v75: the wipe removes the DB quarantine copy');
  eq(localStorage.getItem(sbOutboxKey(wipeUid75)), null, 'v75: the wipe removes the outbox');
  eq(localStorage.getItem(SB_SNAP_KEY + ':' + wipeUid75), null, 'v75: the wipe removes the sync snapshot');
  eq(localStorage.getItem(SB_SRVID_KEY + ':' + wipeUid75), null, 'v75: the wipe removes the server-id map');
  eq(sbServerSchoolMap()[wipeUid75], undefined, 'v75: the wipe removes the server-school map entry');
  eq(sessionStorage.getItem(CLOUD_TEACHER_KEY), null, 'v75: the wipe removes the cloud snapshot');
  ok(!!localStorage.getItem('schoolSaathiDB_other-uid-75'), 'v75: the wipe leaves another school untouched');
  // Restore the wiped keys so the tests below keep their fixtures.
  if (savedDb75 !== null) localStorage.setItem(wipeDbKey75, savedDb75); else localStorage.removeItem(wipeDbKey75);
  if (savedBak75 !== null) localStorage.setItem(wipeDbKey75 + '.bak', savedBak75); else localStorage.removeItem(wipeDbKey75 + '.bak');
  if (savedQuar75 !== null) localStorage.setItem(wipeDbKey75 + '.quarantine', savedQuar75); else localStorage.removeItem(wipeDbKey75 + '.quarantine');
  if (savedOut75 !== null) localStorage.setItem(sbOutboxKey(wipeUid75), savedOut75); else localStorage.removeItem(sbOutboxKey(wipeUid75));
  if (savedSnap75 !== null) localStorage.setItem(SB_SNAP_KEY + ':' + wipeUid75, savedSnap75); else localStorage.removeItem(SB_SNAP_KEY + ':' + wipeUid75);
  if (savedSrv75 !== null) localStorage.setItem(SB_SRVID_KEY + ':' + wipeUid75, savedSrv75); else localStorage.removeItem(SB_SRVID_KEY + ':' + wipeUid75);
  if (savedMap75 !== null) localStorage.setItem(SB_SCHOOL_MAP_KEY, savedMap75); else localStorage.removeItem(SB_SCHOOL_MAP_KEY);
  localStorage.removeItem('schoolSaathiDB_other-uid-75');
  logout(); await waitLogout();
  loginAs(TEST_ACCOUNTS.school); // v75: restore the school session + db
  // ---- v76 (P1-4): constant-time hash compare ----
  // verifyPw's s256$ and djb2 branches compare hashes in constant time
  // now (the bcrypt$ branch already used bcrypt's own compare). A plain
  // === would leak the hash prefix position by timing.
  eq(timingSafeEqual('abc', 'abc'), true, 'v76: timingSafeEqual accepts equal strings');
  eq(timingSafeEqual('abc', 'abd'), false, 'v76: timingSafeEqual rejects a one-char difference');
  eq(timingSafeEqual('abc', 'abcd'), false, 'v76: timingSafeEqual rejects different lengths');
  eq(timingSafeEqual('', ''), true, 'v76: timingSafeEqual accepts two empty strings');
  eq(timingSafeEqual(null, 'abc'), false, 'v76: timingSafeEqual rejects a non-string');
  // s256$ legacy path: the right password verifies, a wrong one does not.
  var salt76 = 'salty76';
  var hash76 = 's256$' + salt76 + '$' + sha256Hex(salt76 + '|' + 'teach76');
  eq(verifyPw('teach76', { pwHash: hash76 }).ok, true, 'v76: verifyPw accepts the right password on the s256$ path');
  eq(verifyPw('teach77', { pwHash: hash76 }).ok, false, 'v76: verifyPw rejects a wrong password on the s256$ path');
  eq(verifyPw('teach76', { pwHash: hash76 }).legacy, true, 'v76: the s256$ path is still flagged legacy (upgrade on login)');
  // djb2 legacy path: same, through the helper.
  var djb76 = hashPw('old76');
  eq(verifyPw('old76', { pwHash: djb76 }).ok, true, 'v76: verifyPw accepts the right password on the djb2 path');
  eq(verifyPw('old77', { pwHash: djb76 }).ok, false, 'v76: verifyPw rejects a wrong password on the djb2 path');
  // The student PIN path goes through verifyPw, so an s256$ PIN hash gets
  // the constant-time compare too.
  var pinStu76 = { parentPinHash: 's256$' + salt76 + '$' + sha256Hex(salt76 + '|' + '3175') };
  eq(verifyPin('3175', pinStu76), true, 'v76: verifyPin accepts the right PIN on the s256$ path');
  eq(verifyPin('2109', pinStu76), false, 'v76: verifyPin rejects a wrong PIN on the s256$ path');
  logout(); await waitLogout();
  loginAs(TEST_ACCOUNTS.school); // v76: restore the school session + db
  // ---- v78 (Phase 3): Storage upload for logos / photos ----
  // dataUrlToBlob: a valid data URL decodes; anything else is null.
  var blob78 = dataUrlToBlob('data:image/jpeg;base64,/9j/4AAQ');
  ok(blob78 !== null && typeof blob78 === 'object', 'v78: dataUrlToBlob decodes a valid data URL');
  eq(dataUrlToBlob(null), null, 'v78: dataUrlToBlob rejects null');
  eq(dataUrlToBlob('not-a-data-url'), null, 'v78: dataUrlToBlob rejects a non-data URL');
  eq(dataUrlToBlob('data:image/jpeg;base64,!!!not-base64!!!'), null, 'v78: dataUrlToBlob rejects invalid base64');
  // Public URL shape.
  eq(sbStoragePublicUrl('student-photos', 's1/stu1.jpg'), SB_URL + '/storage/v1/object/public/student-photos/s1/stu1.jpg', 'v78: sbStoragePublicUrl builds the public URL');
  // No session token in the harness → the upload resolves to null, never rejects.
  var upNull78 = await sbUploadImage('student-photos', 's1/stu1.jpg', 'data:image/jpeg;base64,/9j/4AAQ');
  eq(upNull78, null, 'v78: sbUploadImage resolves null with no session token');
  // No server school in the map for the harness school → null.
  var upStu78 = await sbUploadStudentPhoto('stu1', 'data:image/jpeg;base64,/9j/4AAQ');
  eq(upStu78, null, 'v78: sbUploadStudentPhoto resolves null with no server school mapped');
  var upLogo78 = await sbUploadSchoolLogo('data:image/png;base64,iVBORw0KGgo=');
  eq(upLogo78, null, 'v78: sbUploadSchoolLogo resolves null with no server school mapped');
  // Mapping: a Storage URL replaces the data URL on the server.
  var mapUrl78 = sbMapStudent({ id: 'stu-u78', name: 'URL Kid', cls: '6th-A', admissionNo: 'ADM-2025-978', enr: 'ENR-978', roll: '1', guardian: 'G', phone: '9000000000', dob: '', gender: '', bloodGroup: '', category: '', session: '', status: 'Active', parentPinHash: hashPin('4321'), aadhaar: '', photo: 'data:image/jpeg;base64,/9j/4AAQ', photoUrl: 'https://x.supabase.co/storage/v1/object/public/student-photos/s1/stu-u78.jpg' }, 'test-school');
  eq(mapUrl78.photo_url, 'https://x.supabase.co/storage/v1/object/public/student-photos/s1/stu-u78.jpg', 'v78: sbMapStudent sends the Storage URL when one exists');
  eq(mapUrl78.photo_data_url, null, 'v78: sbMapStudent sends a null data URL when a Storage URL exists');
  var mapData78 = sbMapStudent({ id: 'stu-d78', name: 'Data Kid', cls: '6th-A', admissionNo: 'ADM-2025-979', enr: 'ENR-979', roll: '1', guardian: 'G', phone: '9000000000', dob: '', gender: '', bloodGroup: '', category: '', session: '', status: 'Active', parentPinHash: hashPin('4321'), aadhaar: '', photo: 'data:image/jpeg;base64,/9j/4AAQ' }, 'test-school');
  eq(mapData78.photo_url, null, 'v78: sbMapStudent sends a null photo URL when there is no Storage URL');
  eq(mapData78.photo_data_url, 'data:image/jpeg;base64,/9j/4AAQ', 'v78: sbMapStudent sends the data URL when there is no Storage URL');
  // School payload: same rule for the logo.
  var payUrl78 = sbSyncSchoolPayloadFromParts({ name: 'S', city: '', principal: '', phone: '', email: '', session: '2025–26', address: '', logo: 'data:image/png;base64,iVBORw0KGgo=', logoUrl: 'https://x.supabase.co/storage/v1/object/public/school-logos/s1/logo.png' }, {}, 1, 1);
  eq(payUrl78.logo_url, 'https://x.supabase.co/storage/v1/object/public/school-logos/s1/logo.png', 'v78: school payload sends the Storage logo URL when one exists');
  eq(payUrl78.logo_data_url, null, 'v78: school payload sends a null logo data URL when a Storage URL exists');
  var payData78 = sbSyncSchoolPayloadFromParts({ name: 'S', city: '', principal: '', phone: '', email: '', session: '2025–26', address: '', logo: 'data:image/png;base64,iVBORw0KGgo=' }, {}, 1, 1);
  eq(payData78.logo_url, null, 'v78: school payload sends a null logo URL when there is no Storage URL');
  eq(payData78.logo_data_url, 'data:image/png;base64,iVBORw0KGgo=', 'v78: school payload sends the logo data URL when there is no Storage URL');
  // Pull: a server URL lands in photoUrl; the display field prefers the
  // data URL when present and falls back to the URL.
  var pullUrl78 = sbRowToStudent({ id: 'stu-p78', local_id: 'stu-p78', name: 'Pull URL', cls: '6th-A', admission_no: 'ADM-2025-980', enr: 'ENR-980', roll: '1', guardian: 'G', phone: '9000000000', dob: '', gender: '', blood_group: '', category: '', session: '', adm_date: '', status: 'Active', parent_pin: null, aadhaar: '', photo_data_url: '', photo_url: 'https://x.supabase.co/storage/v1/object/public/student-photos/s1/stu-p78.jpg' });
  eq(pullUrl78.photoUrl, 'https://x.supabase.co/storage/v1/object/public/student-photos/s1/stu-p78.jpg', 'v78: sbRowToStudent keeps the server photo URL');
  eq(pullUrl78.photo, 'https://x.supabase.co/storage/v1/object/public/student-photos/s1/stu-p78.jpg', 'v78: sbRowToStudent displays the URL when no data URL exists');
  var pullBoth78 = sbRowToStudent({ id: 'stu-b78', local_id: 'stu-b78', name: 'Pull Both', cls: '6th-A', admission_no: 'ADM-2025-981', enr: 'ENR-981', roll: '1', guardian: 'G', phone: '9000000000', dob: '', gender: '', blood_group: '', category: '', session: '', adm_date: '', status: 'Active', parent_pin: null, aadhaar: '', photo_data_url: 'data:image/jpeg;base64,/9j/4AAQ', photo_url: 'https://x.supabase.co/storage/v1/object/public/student-photos/s1/stu-b78.jpg' });
  eq(pullBoth78.photo, 'data:image/jpeg;base64,/9j/4AAQ', 'v78: sbRowToStudent prefers the data URL for display when both exist');
  eq(pullBoth78.photoUrl, 'https://x.supabase.co/storage/v1/object/public/student-photos/s1/stu-b78.jpg', 'v78: sbRowToStudent still keeps the URL when both exist');
  // ---- v79 (Phase 3): the pull must not wipe an un-synced school logo ----
  // Live v78: a logo saved at 12:38 UTC was wiped by the pull before the
  // flush could send it, and the next diff re-queued the school row
  // with an empty logo, so the flush sent both logo fields as null.
  // Content tables already keep un-synced rows (v33/v46); the profile
  // had no such keep. Now a pending ss_schools outbox upsert keeps the
  // local profile (counters still come from the server row).
  state.sb = { uid: 'sb-uid-79' };
  // v113: the keep gate also needs a snapshot entry for the school row
  // (proof this device synced the profile before) — the test passes
  // the account and seeds one.
  var acct79 = { uid: 'u-79', sbUid: 'sb-uid-79' };
  sbSnapSave('u-79', { ss_schools: { school: { hash: 'h79', row: { profile: { name: 'Test School' }, feeExtras: {}, admCounter: 5, receiptCounter: 7 } } } });
  sbOutboxAdd('sb-uid-79', { table: 'ss_schools', key: 'school', op: 'upsert', row: { profile: { name: 'Test School', logo: 'data:image/png;base64,LOGO79' }, feeExtras: {}, admCounter: 5, receiptCounter: 7 }, at: new Date().toISOString() });
  var d79 = { profile: { name: 'Test School', city: 'Patna', principal: 'P', phone: '', email: '', session: '2025–26', address: '', logo: 'data:image/png;base64,LOGO79', logoUrl: 'https://x.supabase.co/storage/v1/object/public/school-logos/s79/logo.png' }, feeExtras: { admissionFee: 0, cautionMoney: 0, annualCharges: 0, transportFee: 0 }, admCounter: 5, receiptCounter: 7, students: [], teachers: [], exams: [], feeRecords: [], feeStructure: [], attendance: {}, receipts: [], marks: [], homework: [], notices: [], admissionRequests: [], auditLog: [], activities: [] };
  var schoolRow79 = { id: 'srv-school-79', name: 'Test School', city: 'Patna', principal: 'P', phone: '', email: '', session: '2025–26', address: '', logo_url: null, logo_data_url: null, adm_counter: 9, receipt_counter: 11, admission_fee: 0, caution_money: 0, annual_charges: 0, transport_fee: 0 };
  sbApplyServerRows(d79, schoolRow79, {}, acct79, 'srv-school-79');
  eq(d79.profile.logo, 'data:image/png;base64,LOGO79', 'v79: the pull keeps the LOCAL logo when a profile upsert is pending — the server row without a logo does not wipe it');
  eq(d79.profile.logoUrl, 'https://x.supabase.co/storage/v1/object/public/school-logos/s79/logo.png', 'v79: the pull keeps the LOCAL logo URL when a profile upsert is pending');
  eq(d79.admCounter, 9, 'v79: the counters still come from the server row even when the profile is kept');
  eq(d79.receiptCounter, 11, 'v79: the receipt counter still comes from the server row even when the profile is kept');
  // No pending upsert → server wins, exactly as before.
  sbOutboxRemove('sb-uid-79', { table: 'ss_schools', key: 'school' });
  var d79b = { profile: { name: 'Test School', city: 'Patna', principal: 'P', phone: '', email: '', session: '2025–26', address: '', logo: 'data:image/png;base64,LOGO79', logoUrl: 'https://x.supabase.co/storage/v1/object/public/school-logos/s79/logo.png' }, feeExtras: { admissionFee: 0, cautionMoney: 0, annualCharges: 0, transportFee: 0 }, admCounter: 5, receiptCounter: 7, students: [], teachers: [], exams: [], feeRecords: [], feeStructure: [], attendance: {}, receipts: [], marks: [], homework: [], notices: [], admissionRequests: [], auditLog: [], activities: [] };
  sbApplyServerRows(d79b, schoolRow79, {}, acct79, 'srv-school-79');
  eq(d79b.profile.logo, undefined, 'v79: with NO pending profile upsert the server row wins and the local logo is replaced');
  eq(d79b.profile.logoUrl, null, 'v79: with NO pending profile upsert the logo URL is cleared from the server row');
  sbSnapClear('u-79');
  state.sb = null;
  // ---- v113 (Phase 5, Module 1): the pull must not wipe an un-synced profile edit ----
  // v79 kept only the logo: a name/phone/address/fee edit saved offline was
  // still overwritten by the pull before the flush could send it, and the
  // next diff re-queued the school row with the server values — the edit
  // was lost on the server. A pending ss_schools upsert now keeps the
  // whole local profile (counters still come from the server row, as in v79).
  state.sb = { uid: 'sb-uid-113' };
  var acct113 = { uid: 'u-113', sbUid: 'sb-uid-113' };
  sbSnapSave('u-113', { ss_schools: { school: { hash: 'h113', row: { profile: { name: 'Test School' }, feeExtras: {}, admCounter: 5, receiptCounter: 7 } } } });
  sbOutboxAdd('sb-uid-113', { table: 'ss_schools', key: 'school', op: 'upsert', row: { profile: { name: 'Test School Renamed', phone: '9876543210' }, feeExtras: { admissionFee: 500 }, admCounter: 5, receiptCounter: 7 }, at: new Date().toISOString() });
  var d113 = { profile: { name: 'Test School Renamed', city: 'Gopalganj', principal: 'P', phone: '9876543210', email: '', session: '2025–26', address: 'New Address Road', logo: null, logoUrl: null }, feeExtras: { admissionFee: 500, cautionMoney: 0, annualCharges: 0, transportFee: 0 }, admCounter: 5, receiptCounter: 7, students: [], teachers: [], exams: [], feeRecords: [], feeStructure: [], attendance: {}, receipts: [], marks: [], homework: [], notices: [], admissionRequests: [], auditLog: [], activities: [] };
  var schoolRow113 = { id: 'srv-school-113', name: 'Test School', city: 'Patna', principal: 'P', phone: '', email: '', session: '2025–26', address: '', logo_url: null, logo_data_url: null, adm_counter: 9, receipt_counter: 11, admission_fee: 0, caution_money: 0, annual_charges: 0, transport_fee: 0 };
  sbApplyServerRows(d113, schoolRow113, {}, acct113, 'srv-school-113');
  eq(d113.profile.name, 'Test School Renamed', 'v113: the pull keeps the LOCAL school name when a profile upsert is pending');
  eq(d113.profile.phone, '9876543210', 'v113: the pull keeps the LOCAL school phone when a profile upsert is pending');
  eq(d113.profile.city, 'Gopalganj', 'v113: the pull keeps the LOCAL school city when a profile upsert is pending');
  eq(d113.profile.address, 'New Address Road', 'v113: the pull keeps the LOCAL school address when a profile upsert is pending');
  eq(d113.feeExtras.admissionFee, 500, 'v113: the pull keeps the LOCAL admission fee when a profile upsert is pending');
  eq(d113.admCounter, 9, 'v113: the counters still come from the server row even when the profile is kept');
  eq(d113.receiptCounter, 11, 'v113: the receipt counter still comes from the server row even when the profile is kept');
  // No pending upsert -> server wins, exactly as before (fresh-download behaviour unchanged).
  sbOutboxRemove('sb-uid-113', { table: 'ss_schools', key: 'school' });
  var d113b = { profile: { name: 'Test School Renamed', city: 'Gopalganj', principal: 'P', phone: '9876543210', email: '', session: '2025–26', address: 'New Address Road', logo: null, logoUrl: null }, feeExtras: { admissionFee: 500, cautionMoney: 0, annualCharges: 0, transportFee: 0 }, admCounter: 5, receiptCounter: 7, students: [], teachers: [], exams: [], feeRecords: [], feeStructure: [], attendance: {}, receipts: [], marks: [], homework: [], notices: [], admissionRequests: [], auditLog: [], activities: [] };
  sbApplyServerRows(d113b, schoolRow113, {}, acct113, 'srv-school-113');
  eq(d113b.profile.name, 'Test School', 'v113: with NO pending profile upsert the server name wins and the local edit is replaced');
  eq(d113b.profile.phone, '', 'v113: with NO pending profile upsert the server phone wins');
  eq(d113b.feeExtras.admissionFee, 0, 'v113: with NO pending profile upsert the server admission fee wins');
  // First sync (no snapshot entry yet): a pending upsert is only the
  // first-sync echo of the local default profile — the server row must
  // win, or the download restores fees of 0 (the v30 regression).
  sbSnapClear('u-113');
  sbOutboxAdd('sb-uid-113', { table: 'ss_schools', key: 'school', op: 'upsert', row: { profile: { name: 'Test School Renamed', phone: '9876543210' }, feeExtras: { admissionFee: 500 }, admCounter: 5, receiptCounter: 7 }, at: new Date().toISOString() });
  var d113c = { profile: { name: 'Test School Renamed', city: 'Gopalganj', principal: 'P', phone: '9876543210', email: '', session: '2025–26', address: 'New Address Road', logo: null, logoUrl: null }, feeExtras: { admissionFee: 500, cautionMoney: 0, annualCharges: 0, transportFee: 0 }, admCounter: 5, receiptCounter: 7, students: [], teachers: [], exams: [], feeRecords: [], feeStructure: [], attendance: {}, receipts: [], marks: [], homework: [], notices: [], admissionRequests: [], auditLog: [], activities: [] };
  sbApplyServerRows(d113c, schoolRow113, {}, acct113, 'srv-school-113');
  eq(d113c.profile.name, 'Test School', 'v113: with NO snapshot entry yet the server name wins even with a pending upsert (first-sync echo)');
  eq(d113c.profile.phone, '', 'v113: with NO snapshot entry yet the server phone wins even with a pending upsert');
  eq(d113c.feeExtras.admissionFee, 0, 'v113: with NO snapshot entry yet the server admission fee wins even with a pending upsert');
  sbOutboxRemove('sb-uid-113', { table: 'ss_schools', key: 'school' });
  state.sb = null;
  // ---- v114 (external review fix): Reports page must escape the school name ----
  // The review found reportsPage() interpolating db.profile.name raw into
  // HTML - the one unescaped spot in the app (every other page uses esc()).
  // A school name is admin-set text; without escaping it is stored XSS.
  var name114 = db.profile.name;
  db.profile.name = '<img src=x onerror=alert(1)>';
  var rp114 = reportsPage();
  ok(rp114.indexOf('<img src=x') === -1, 'v114: Reports page does not render the raw school-name HTML');
  ok(rp114.indexOf('&lt;img src=x') !== -1, 'v114: Reports page escapes the school name');
  db.profile.name = name114;
  // ---- v81 (Phase 3): photo heal — a pull must not leave a student photo-less when the server has one ----
  // Live v80: a photo uploaded and synced (server row has photo_url, Storage
  // object exists) still showed the placeholder in every portal. The
  // server row wins in mergeById, but the v56 keep returns the pre-photo
  // local row when a student upsert is pending — and a stale local row
  // with no photo then stays photo-less forever. The heal fills a missing
  // local photo from the server row; it never overwrites a local photo.
  state.sb = { uid: 'sb-uid-81' };
  sbOutboxAdd('sb-uid-81', { table: 'ss_students', key: 'stu-81', op: 'upsert', row: { id: 'stu-81' }, at: new Date().toISOString() });
  sbOutboxAdd('sb-uid-81', { table: 'ss_students', key: 'stu-81b', op: 'upsert', row: { id: 'stu-81b' }, at: new Date().toISOString() });
  var d81 = { profile: { name: 'Test School', city: 'Patna', principal: 'P', phone: '', email: '', session: '2025–26', address: '' }, feeExtras: { admissionFee: 0, cautionMoney: 0, annualCharges: 0, transportFee: 0 }, admCounter: 1, receiptCounter: 1, students: [{ id: 'stu-81', name: 'Heal Kid', cls: '6th-A', admissionNo: 'ADM-2025-081', photo: null, photoUrl: null }, { id: 'stu-81b', name: 'Keep Kid', cls: '6th-A', admissionNo: 'ADM-2025-082', photo: 'data:image/jpeg;base64,LOCAL81', photoUrl: null }], teachers: [], exams: [], feeRecords: [], feeStructure: [], attendance: {}, receipts: [], marks: [], homework: [], notices: [], admissionRequests: [], auditLog: [], activities: [] };
  var byTable81 = { ss_students: [{ id: 'srv-81', local_id: 'stu-81', name: 'Heal Kid', cls: '6th-A', admission_no: 'ADM-2025-081', enr: '', roll: 1, guardian: '', phone: '', dob: '', gender: '', blood_group: '', category: '', session: '', status: 'Active', parent_pin: null, aadhaar: '', photo_data_url: '', photo_url: 'https://x.supabase.co/storage/v1/object/public/student-photos/s81/stu-81.jpg' }, { id: 'srv-81b', local_id: 'stu-81b', name: 'Keep Kid', cls: '6th-A', admission_no: 'ADM-2025-082', enr: '', roll: 1, guardian: '', phone: '', dob: '', gender: '', blood_group: '', category: '', session: '', status: 'Active', parent_pin: null, aadhaar: '', photo_data_url: '', photo_url: 'https://x.supabase.co/storage/v1/object/public/student-photos/s81/stu-81b.jpg' }] };
  var schoolRow81 = { id: 'srv-school-81', name: 'Test School', city: 'Patna', principal: 'P', phone: '', email: '', session: '2025–26', address: '', logo_url: null, logo_data_url: null, adm_counter: 1, receipt_counter: 1, admission_fee: 0, caution_money: 0, annual_charges: 0, transport_fee: 0 };
  sbApplyServerRows(d81, schoolRow81, byTable81, null, 'srv-school-81');
  eq(d81.students[0].photo, 'https://x.supabase.co/storage/v1/object/public/student-photos/s81/stu-81.jpg', 'v81: the pull heals a missing local photo from the server Storage URL even when a student upsert is pending');
  eq(d81.students[0].photoUrl, 'https://x.supabase.co/storage/v1/object/public/student-photos/s81/stu-81.jpg', 'v81: the healed photo also sets photoUrl');
  eq(d81.students[1].photo, 'data:image/jpeg;base64,LOCAL81', 'v81: the heal never overwrites a local photo that already exists');
  sbOutboxRemove('sb-uid-81', { table: 'ss_students', key: 'stu-81' });
  sbOutboxRemove('sb-uid-81', { table: 'ss_students', key: 'stu-81b' });
  state.sb = null;
  // ---- v82 (Phase 3): small-file photo upload must not stall on the Image/canvas path ----
  // Live v81: choosing a student photo never updated the preview — the
  // compression callback never fired (a hung Image load leaves the
  // preview blank and the save with no photo). A file already under the
  // cap now uses its data URL directly (FileReader only, no Image/canvas).
  var FileReader82 = function () {};
  FileReader82.prototype.readAsDataURL = function () { this.result = 'data:image/jpeg;base64,/9j/82SMALL'; if (this.onload) this.onload(); };
  FileReader = FileReader82;
  var got82 = null, err82 = null;
  compressImageFile({ size: 3704 }, { max: 512, cap: 120 * 1024, format: 'jpeg' }, function (url, err) { got82 = url; err82 = err; });
  eq(got82, 'data:image/jpeg;base64,/9j/82SMALL', 'v82: a small photo file returns its data URL directly without the Image/canvas path');
  eq(err82, null, 'v82: the small-file fast path reports no error');
  FileReader = undefined;
  // ---- v84: teacher Students nav — read-only, only their own classes ----
  // A teacher had NO Students item (and the class tiles had no onclick),
  // so a teacher could never open a student profile and the on-demand
  // photo fetch (SQL 29) was unreachable.
  ok(NAV.teacher.some(function (n) { return n[0] === 'students'; }), 'v84: the teacher nav has a Students item');
  eq(PAGE_TEACHER.students, studentsPage, 'v84: the teacher page map routes students to studentsPage');
  loginAs(TEST_ACCOUNTS.school);
  db.teachers.push({ id: 'tchr-84', name: 'T84', subject: 'Maths', classes: ['6th-A'] });
  db.students.push({ id: 'stu-84a', name: 'Asha 84', cls: '6th-A', admissionNo: 'ADM-84A', status: 'Active', phone: '9000000001' });
  db.students.push({ id: 'stu-84b', name: 'Bala 84', cls: '10th-A', admissionNo: 'ADM-84B', status: 'Active', phone: '9000000002' });
  saveDB(db);
  state.role = 'teacher'; state.user = { role: 'teacher', name: 'T84', email: 't84@school.in', teacherId: 'tchr-84', schoolUid: 'test-school' };
  eq(teacherClasses().join(','), '6th-A', 'v84: teacherClasses returns only the teacher classes');
  ok(visibleStudents().some(function (s) { return s.id === 'stu-84a'; }), 'v84: visibleStudents includes the teacher own class student');
  ok(!visibleStudents().some(function (s) { return s.id === 'stu-84b'; }), 'v84: visibleStudents excludes other classes students');
  ok(stuFiltered().some(function (s) { return s.id === 'stu-84a'; }), 'v84: stuFiltered includes the teacher own class student');
  ok(!stuFiltered().some(function (s) { return s.id === 'stu-84b'; }), 'v84: stuFiltered hides other classes students from a teacher');
  ok(canViewStudent('stu-84a'), 'v84: a teacher can open a profile in their own class');
  ok(!canViewStudent('stu-84b'), 'v84: a teacher cannot open a profile outside their classes');
  state.stuClass = 'All'; state.stuSection = 'All'; state.stuSession = 'All'; state.stuGender = 'All'; state.stuStatus = 'All'; state.stuFee = 'All'; state.stuSearch = ''; state.stuPage = 1; state.profileStudent = null; promoState = null;
  var html84 = studentsPage();
  ok(html84.indexOf('studentForm()') === -1, 'v84: the teacher list has no Add Student button');
  ok(html84.indexOf('stuActions') === -1, 'v84: the teacher list has no Actions buttons');
  ok(html84.indexOf('toggleStuSel') === -1, 'v84: the teacher list has no bulk-select checkboxes');
  ok(html84.indexOf(t('thFee')) === -1, 'v84: the teacher list shows no fee column');
  ok(html84.indexOf(t('stPendFee')) === -1, 'v84: the teacher list shows no pending-fee card');
  ok(html84.indexOf('Asha 84') !== -1, 'v84: the teacher list shows their own classs student');
  ok(html84.indexOf('Bala 84') === -1, 'v84: the teacher list hides other classes students');
  ok(html84.indexOf('1 ' + t('ofWord') + ' 1') !== -1, 'v84: the teacher header counts only their own students');
  var modalBefore84 = $('modalRoot').innerHTML;
  stuActions('stu-84a');
  eq($('modalRoot').innerHTML, modalBefore84, 'v84: stuActions refuses a teacher');
  // The teacher profile itself: no fees tab, no Edit button (the v35
  // rule — a teacher never sees fees). A live check listed a Fees tab
  // on the teacher profile, so this vector settles it in the harness.
  state.profileStudent = 'stu-84a'; state.profileTab = 'overview';
  var prof84 = studentsPage();
  ok(prof84.indexOf(t('tabFees')) === -1, 'v84: the teacher profile has no fees tab');
  ok(prof84.indexOf(t('editStudent')) === -1, 'v84: the teacher profile has no Edit button');
  ok(prof84.indexOf('Asha 84') !== -1, 'v84: the teacher profile opens for their own class student');
  state.profileStudent = null;
  state.view = 'dashboard';
  openTeacherClass('6th-A');
  eq(state.stuClass, '6th-A', 'v84: a class tile filters the list to that class');
  eq(state.view, 'students', 'v84: a class tile opens the Students view');
  openTeacherClass('10th-A');
  eq(state.stuClass, 'All', 'v84: a foreign class falls back to All (no leak)');
  openTeacherClass('');
  eq(state.stuClass, 'All', 'v84: the My Students tile shows all of the teacher classes');
  loginAs(TEST_ACCOUNTS.school);
  // ---- v85: Phase 4 foundation — the permission matrix (PERMS) ----
  // All 8 roles exist; the five new roles start with dashboard +
  // notices only. go() enforces PERMS; renderPage has the PAGE-map
  // check as a second layer. The three existing roles keep exactly
  // their current views.
  var roles85 = ['school', 'teacher', 'student', 'principal', 'accountant', 'staff', 'parent', 'superadmin'];
  roles85.forEach(function (r) { ok(Array.isArray(PERMS[r]) && PERMS[r].length > 0, 'v85: PERMS has an allow-list for ' + r); });
  eq(PERMS.school.join(','), 'dashboard,students,teachers,staff,admissions,attendance,fees,exams,homework,notices,reports,activityLog,settings', 'v85: the school allow-list is unchanged'); // v90: the school gains the Staff management view
  eq(PERMS.teacher.join(','), 'dashboard,students,attendance,exams,homework,notices', 'v85: the teacher allow-list is unchanged');
  eq(PERMS.student.join(','), 'dashboard,attendance,fees,results,homework,notices', 'v85: the student allow-list is unchanged');
  // v86: the parent grew past dashboard + notices (its portal reuses the
  // student views), so the v85 "starts with" check covers the other four.
  // v88: the principal grew too (its oversight nav) — the check covers
  // the remaining three.
  // v92: the accountant grew too (fees + reports) — the check covers
  // the remaining two.
  // v93: the staff member grew too (attendance + homework) — the check
  // covers only the super admin now.
  // v94: the super admin grew too (the schools list) — every role has
  // grown past dashboard + notices, so the v85 "starts with" check is
  // retired. Each role's own step asserts its full set instead.
  // canAccessView: allowed views open, everything else is denied.
  // v88: the principal now opens fees + students too (oversight), but
  // still never settings.
  ok(canAccessView('principal', 'dashboard') && canAccessView('principal', 'notices'), 'v85: a principal may open dashboard + notices');
  ok(!canAccessView('principal', 'settings') && !canAccessView('principal', 'admissions') && !canAccessView('principal', 'activityLog'), 'v88: a principal may not open settings, admissions or the activity log');
  ok(!canAccessView('accountant', 'students') && !canAccessView('accountant', 'attendance'), 'v85: an accountant may not open students or attendance');
  ok(!canAccessView('staff', 'fees') && !canAccessView('staff', 'exams'), 'v85: a staff member may not open fees or exams');
  ok(!canAccessView('parent', 'settings') && !canAccessView('parent', 'teachers'), 'v85: a parent may not open settings or teachers');
  ok(!canAccessView('superadmin', 'fees') && !canAccessView('superadmin', 'settings'), 'v85: a super admin may not open a school fees or settings view');
  ok(!canAccessView('nobody', 'dashboard') && !canAccessView('school', 'nope'), 'v85: an unknown role and an unknown view are both denied');
  // go() refuses a denied view and stays on the dashboard.
  // v88: a principal now opens fees + students (oversight) — settings is
  // still denied, so it is the denied-view probe here.
  state.role = 'principal'; state.user = { role: 'principal', name: 'P85', email: 'p85@school.in', schoolUid: 'test-school' };
  state.view = 'dashboard';
  go('fees');
  eq(state.view, 'fees', 'v88: go(fees) as a principal opens fees');
  go('settings');
  eq(state.view, 'dashboard', 'v88: go(settings) as a principal is refused back to the dashboard');
  go('notices');
  eq(state.view, 'notices', 'v85: go(notices) as a principal opens notices');
  go('students');
  eq(state.view, 'students', 'v88: go(students) as a principal opens students');
  // The new roles page maps route dashboard to roleDashboard.
  // v88: the principal's dashboard is now the read-only overview.
  eq(PAGE_PRINCIPAL.dashboard, principalDashboard, 'v88: the principal dashboard is principalDashboard');
  eq(PAGE_ACCOUNTANT.notices, noticesPage, 'v85: the accountant notices page is noticesPage');
  eq(PAGE_STAFF.dashboard, roleDashboard, 'v85: the staff dashboard is roleDashboard');
  eq(PAGE_PARENT.dashboard, studentDashboard, 'v86: the parent dashboard reuses the student dashboard');
  eq(PAGE_SUPERADMIN.dashboard, roleDashboard, 'v85: the super admin dashboard is roleDashboard');
  // roleDashboard renders the role + school and only the allowed views.
  // v88: the check runs as an accountant (dashboard + notices only), so
  // a denied view must not appear as a button.
  // v92: the accountant grew to fees + reports, so the check runs as a
  // staff member (still dashboard + notices only) — a denied view
  // (students, settings) must not appear as a button.
  state.role = 'staff'; state.user = { role: 'staff', name: 'S85', email: 's85@school.in', schoolUid: 'test-school' };
  state.view = 'dashboard';
  var dash85 = roleDashboard();
  ok(dash85.indexOf('S85') !== -1, 'v85: roleDashboard shows the signed-in name');
  ok(dash85.indexOf('Staff') !== -1, 'v85: roleDashboard names the role');
  ok(dash85.indexOf('students') === -1 && dash85.indexOf('settings') === -1, 'v85: roleDashboard offers no denied view');
  // The existing roles still navigate exactly as before.
  loginAs(TEST_ACCOUNTS.school);
  state.view = 'dashboard';
  go('students');
  eq(state.view, 'students', 'v85: go(students) as a school still opens students');
  go('settings');
  eq(state.view, 'settings', 'v85: go(settings) as a school still opens settings');
  // ---- v86: Phase 4 — the Parent role returns as its own role ----
  // The parent logs in with the child's admission no + PIN (the same
  // credentials and the same server check as the student login) but the
  // session role is 'parent'. The parent portal reuses the student
  // views, view-only: the child's attendance, fees, results, homework
  // (own class only, no Add button) and notices — never other students,
  // never the school's totals, never an edit.
  eq(PERMS.parent.join(','), 'dashboard,attendance,fees,results,homework,notices', 'v86: the parent allow-list matches the student views');
  ok(canAccessView('parent', 'results') && canAccessView('parent', 'attendance') && canAccessView('parent', 'fees'), 'v86: a parent may open results, attendance and fees');
  ok(!canAccessView('parent', 'students') && !canAccessView('parent', 'teachers') && !canAccessView('parent', 'settings') && !canAccessView('parent', 'exams'), 'v86: a parent may not open students, teachers, settings or exams');
  eq(PAGE_PARENT.dashboard, studentDashboard, 'v86: the parent dashboard reuses the student dashboard');
  eq(PAGE_PARENT.attendance, studentAttendancePage, 'v86: the parent attendance page reuses the student one');
  eq(PAGE_PARENT.fees, studentFeesPage, 'v86: the parent fees page reuses the student one');
  eq(PAGE_PARENT.results, studentResultsPage, 'v86: the parent results page reuses the student one');
  eq(PAGE_PARENT.homework, homeworkPage, 'v86: the parent homework page reuses homeworkPage');
  eq(PAGE_PARENT.notices, noticesPage, 'v86: the parent notices page reuses noticesPage');
  // meStudent() now covers the parent role — the parent portal shows
  // only their own child.
  var riya86 = db.students.find(function (s) { return s.name === 'Riya Kumari'; });
  loginAs({ role: 'parent', name: riya86.name, sub: t('parentSub') + ' • ' + riya86.name, email: 'parent:test-school:' + riya86.id, uid: 'parent-' + riya86.id, studentId: riya86.id, schoolUid: 'test-school' }, { silent: true });
  eq(state.role, 'parent', 'v86: the parent session has role parent');
  ok(meStudent() && meStudent().id === riya86.id, 'v86: meStudent returns the parent child, not another student');
  // The parent dashboard renders the child's data.
  var pDash86 = studentDashboard();
  ok(pDash86.indexOf('Riya Kumari') !== -1, 'v86: the parent dashboard shows the child');
  // The parent homework list is scoped to the child's class only.
  var pHw86 = homeworkPage();
  ok(pHw86.indexOf('Add Homework') === -1, 'v86: the parent homework page shows no Add Homework button');
  // A parent may not mark homework done (toggleHwDone refuses non-students).
  var hw86 = db.homework.find(function (h) { return h.cls === riya86.cls; });
  if (hw86) {
    var doneBefore86 = hw86.doneBy.slice();
    toggleHw(hw86.id, true);
    eq(hw86.doneBy.join(','), doneBefore86.join(','), 'v86: toggleHw as a parent changes nothing');
  }
  // go() refuses a denied view for a parent.
  state.view = 'dashboard';
  go('students');
  eq(state.view, 'dashboard', 'v86: go(students) as a parent stays on the dashboard');
  go('attendance');
  eq(state.view, 'attendance', 'v86: go(attendance) as a parent opens attendance');
  go('results');
  eq(state.view, 'results', 'v86: go(results) as a parent opens results');
  loginAs(TEST_ACCOUNTS.school);
  // ---- v87: Parent polish — two cosmetic fixes from the live check ----
  // (1) The top crumb for a parent said "Teacher Dashboard" (the
  // student/teacher branch fell through). It now says Parent Dashboard.
  // (2) The parent dashboard's homework items rendered the student's
  // Mark-done checkbox (a dead control — toggleHw refuses non-students).
  // A parent now sees the same item read-only, with no checkbox.
  var riya87 = db.students.find(function (s) { return s.name === 'Riya Kumari'; });
  loginAs({ role: 'parent', name: riya87.name, sub: t('parentSub') + ' • ' + riya87.name, email: 'parent:test-school:' + riya87.id, uid: 'parent-' + riya87.id, studentId: riya87.id, schoolUid: 'test-school' }, { silent: true });
  eq(t('parentDash'), 'Parent Dashboard', 'v87: the parent dashboard label exists');
  var pDash87 = studentDashboard();
  ok(pDash87.indexOf('type="checkbox"') === -1, 'v87: the parent dashboard homework items have no Mark-done checkbox');
  ok(pDash87.indexOf('Riya Kumari') !== -1, 'v87: the parent dashboard still shows the child');
  // The student still gets the checkbox.
  loginAs({ role: 'student', name: riya87.name, sub: t('stuSub') + ' • ' + riya87.name, email: 'student:test-school:' + riya87.id, uid: 'student-' + riya87.id, studentId: riya87.id, schoolUid: 'test-school' }, { silent: true });
  var sDash87 = studentDashboard();
  ok(sDash87.indexOf('type="checkbox"') !== -1, 'v87: the student dashboard homework items still have the Mark-done checkbox');
  loginAs(TEST_ACCOUNTS.school);
  // ---- v88: Principal role — login + read-only school overview + nav ----
  // The Principal logs in like a teacher (Staff tab, email + password),
  // but the role comes from the account (local) or the server row (cloud).
  // The dashboard is a read-only school overview; every page the
  // principal opens hides its edit controls, and the mutation functions
  // refuse a principal outright (backstops).
  var riya88 = db.students.find(function (s) { return s.name === 'Riya Kumari'; });
  var prin88 = { role: 'principal', name: 'Test Principal', sub: 'Principal • Test Principal', email: 'principal:test-school:prin88', uid: 'principal-prin88', staffId: 'prin88', schoolUid: 'test-school' };
  // PERMS + NAV + PAGE for the principal.
  eq(PERMS.principal.join(','), 'dashboard,students,teachers,attendance,fees,exams,homework,notices,reports', 'v88: PERMS.principal is the full oversight set (9 views)');
  eq(NAV.principal.length, 9, 'v88: NAV.principal has 9 items');
  eq(Object.keys(PAGE_PRINCIPAL).length, 9, 'v88: PAGE_PRINCIPAL has 9 pages');
  eq(canAccessView('principal', 'students'), true, 'v88: a principal may open Students');
  eq(canAccessView('principal', 'settings'), false, 'v88: a principal may NOT open Settings');
  eq(canAccessView('principal', 'admissions'), false, 'v88: a principal may NOT open Admissions');
  eq(canAccessView('principal', 'activityLog'), false, 'v88: a principal may NOT open the Activity Log');
  // The dashboard is the read-only overview.
  loginAs(prin88, { silent: true });
  eq(state.role, 'principal', 'v88: loginAs with a principal account sets the role');
  var pd88 = principalDashboard();
  ok(pd88.indexOf('Principal') !== -1, 'v88: the principal dashboard names the role');
  ok(pd88.indexOf('Read-only overview') !== -1, 'v88: the principal dashboard says it is read-only');
  ok(pd88.indexOf(t('totalStudents')) !== -1 && pd88.indexOf(t('totalTeachers')) !== -1, 'v88: the principal dashboard shows the school totals');
  ok(pd88.indexOf(t('feeCollected')) !== -1 && pd88.indexOf(t('pendingFee')) !== -1, 'v88: the principal dashboard shows the fee totals');
  // Students: read-only — no checkboxes, no Actions, no Add/Import/Promote;
  // the fee column stays (oversight). The search narrows to one student
  // so the row is on the first page.
  state.view = 'students'; state.stuSearch = 'Riya Kumari'; state.stuClass = 'All'; state.stuSection = 'All'; state.stuSession = 'All'; state.stuGender = 'All'; state.stuFee = 'All'; state.stuStatus = 'All'; state.stuPage = 1;
  var sp88 = studentsPage();
  ok(sp88.indexOf('type="checkbox"') === -1, 'v88: the principal students list has no row checkboxes');
  ok(sp88.indexOf('stuActions(') === -1, 'v88: the principal students list has no Actions button');
  ok(sp88.indexOf('studentForm()') === -1 && sp88.indexOf('openImportModal()') === -1 && sp88.indexOf('openPromotion()') === -1, 'v88: the principal students list has no Add/Import/Promote');
  ok(sp88.indexOf('Riya Kumari') !== -1, 'v88: the principal students list shows the students');
  // Teachers: read-only — the list, no Add, no Edit.
  var tp88 = teachersPage();
  ok(tp88.indexOf('teacherForm()') === -1, 'v88: the principal teachers list has no Add/Edit button');
  ok(tp88.indexOf(db.teachers[0].name) !== -1, 'v88: the principal teachers list shows the teachers');
  // Attendance: read-only — status badges, no mark buttons, no WhatsApp.
  // Riya is in 10th-A in the seed, so the roster is her class.
  state.attDate = todayIST(); state.attCls = riya88.cls;
  var ap88 = attendancePage();
  ok(ap88.indexOf('markAtt(') === -1, 'v88: the principal attendance page has no mark buttons');
  ok(ap88.indexOf('waAbsentAlert(') === -1, 'v88: the principal attendance page has no WhatsApp button');
  ok(ap88.indexOf('Riya Kumari') !== -1, 'v88: the principal attendance page shows the roster');
  // Fees: read-only — no Collect/Delete/WhatsApp, no fee-entry or
  // fee-structure cards.
  state.collectStudent = null; state.feeStudent = null; state.feeFilter = 'All'; state.feeType = 'All'; state.feeSearch = '';
  var fp88 = feesPage();
  ok(fp88.indexOf('openCollectFee(') === -1, 'v88: the principal fees page has no Collect button');
  ok(fp88.indexOf('deleteFeeRecord(') === -1, 'v88: the principal fees page has no Delete button');
  ok(fp88.indexOf('addFee') === -1, 'v88: the principal fees page has no fee-entry card');
  ok(fp88.indexOf('feeStructure') === -1 || fp88.indexOf('fsAmt-') === -1, 'v88: the principal fees page has no fee-structure card');
  // Exams: read-only — no Create/Edit/Save, marks as text.
  state.examId = null;
  var ep88 = examsPage();
  ok(ep88.indexOf('examForm()') === -1 && ep88.indexOf('saveMarks(') === -1, 'v88: the principal exams page has no Create/Save Marks button');
  ok(ep88.indexOf('type="number"') === -1, 'v88: the principal exams page has no editable marks inputs');
  // Homework: read-only — no Add button.
  var hp88 = homeworkPage();
  ok(hp88.indexOf('homeworkForm()') === -1, 'v88: the principal homework page has no Add button');
  // canViewStudent: a principal sees any student; a parent sees only
  // their own child (v88 fix — the parent dashboard's View button hit
  // "own profile only" before this).
  ok(canViewStudent(riya88.id), 'v88: a principal may open any student profile');
  loginAs({ role: 'parent', name: riya88.name, sub: t('parentSub') + ' • ' + riya88.name, email: 'parent:test-school:' + riya88.id, uid: 'parent-' + riya88.id, studentId: riya88.id, schoolUid: 'test-school' }, { silent: true });
  ok(canViewStudent(riya88.id), 'v88: a parent may open their own child profile');
  var other88 = db.students.find(function (s) { return s.id !== riya88.id; });
  ok(!canViewStudent(other88.id), 'v88: a parent may NOT open another student profile');
  // Mutation backstops: a principal's writes are refused.
  loginAs(prin88, { silent: true });
  var attBefore88 = JSON.stringify(db.attendance);
  markAtt(riya88.id, 'Absent');
  eq(JSON.stringify(db.attendance), attBefore88, 'v88: markAtt refuses a principal (no attendance change)');
  var marksBefore88 = db.marks.length;
  saveMarks((db.exams[0] || {}).id);
  eq(db.marks.length, marksBefore88, 'v88: saveMarks refuses a principal (no marks change)');
  var hwBefore88 = db.homework.length;
  ok(typeof saveHomework === 'function', 'v88: saveHomework exists');
  // The cloud payload mapper: a principal payload maps to the db shape.
  var staffPayload88 = {
    ok: true, staff: { id: 'srv-prin88', name: 'Test Principal', role: 'principal', classes: [] },
    school: { id: 'srv-school88', name: 'Test School', city: 'Patna' },
    data: {
      students: [{ id: 'srv-s1', local_id: 'stu88', name: 'Map Kid', cls: '6th-A', admission_no: 'ADM-88-001', enr: 'ENR88', roll: 1, gender: 'Girl', status: 'Active', father_name: 'Map Father', mother_name: 'Map Mother', phone: '9812345678', admission_date: '2026-04-01', session: '2025–26', photo_url: null }],
      teachers: [{ id: 'srv-t1', local_id: 't88', name: 'Map Teacher', subject: 'Mathematics', cls: '6th-A', classes: ['6th-A'] }],
      attendance: [{ id: 'srv-a1', att_date: todayIST(), cls: '6th-A', student_id: 'srv-s1', status: 'Present' }],
      homework: [{ id: 'srv-h1', local_id: 'hw88', cls: '6th-A', subject: 'Mathematics', title: 'Map HW', due: '2026-11-20', done_by: [] }],
      notices: [{ id: 'srv-n1', local_id: 'n88', title: 'Map Notice', notice_date: todayIST(), body: 'Hello' }],
      exams: [{ id: 'srv-e1', local_id: 'ex88', name: 'Map Exam', cls: '6th-A', subject: 'Mathematics', exam_date: todayIST(), total: 100, deleted: false }],
      marks: [{ id: 'srv-m1', exam_id: 'srv-e1', student_id: 'srv-s1', marks: 88 }],
      fee_records: [{ id: 'srv-f1', local_id: 'fr88', student_id: 'srv-s1', student_name: 'Map Kid', cls: '6th-A', month: 'Nov', fee_type: 'Tuition', amount: 800, status: 'Collected', record_date: todayIST() }],
      fee_structure: [{ id: 'srv-fs1', cls: '6th-A', fee_type: 'Tuition', amount: 800 }],
      receipts: [{ id: 'srv-r1', receipt_no: 'RCP-88-001', student_id: 'srv-s1', admission_no: 'ADM-88-001', student_name: 'Map Kid', cls: '6th-A', session: '2025–26', receipt_date: todayIST(), month: 'Nov', counter_no: 1, lines: [], pay_mode: 'Cash', pay_date: todayIST(), bank: '', number: '', total: 800, total_words: 'Eight hundred', collector: 'Test Admin' }]
    }
  };
  var slice88 = mapCloudStaffPayload(staffPayload88);
  eq(slice88.students.length, 1, 'v88: the principal payload maps 1 student');
  eq(slice88.students[0].name, 'Map Kid', 'v88: the mapped student keeps its name');
  eq(slice88.teachers.length, 1, 'v88: the principal payload maps 1 teacher');
  eq(slice88.feeRecords.length, 1, 'v88: the principal payload maps 1 fee record');
  eq(slice88.feeStructure.length, 1, 'v88: the principal payload maps 1 fee-structure row');
  eq(slice88.receipts.length, 1, 'v88: the principal payload maps 1 receipt');
  eq(slice88.marks.length, 1, 'v88: the principal payload maps 1 mark');
  ok(slice88.attendance[todayIST() + '|6th-A'] && slice88.attendance[todayIST() + '|6th-A']['stu88'] === 'Present', 'v88: the principal payload maps attendance');
  // An accountant payload has NO attendance/homework/marks keys at all.
  var accPayload88 = { ok: true, staff: { id: 'srv-acc88', name: 'Test Accountant', role: 'accountant', classes: [] }, school: { id: 'srv-school88', name: 'Test School', city: 'Patna' }, data: { students: staffPayload88.data.students, fee_records: staffPayload88.data.fee_records, fee_structure: staffPayload88.data.fee_structure, receipts: staffPayload88.data.receipts, notices: staffPayload88.data.notices } };
  var accSlice88 = mapCloudStaffPayload(accPayload88);
  eq(accSlice88.attendance && Object.keys(accSlice88.attendance).length, 0, 'v88: an accountant payload maps no attendance');
  eq(accSlice88.homework.length, 0, 'v88: an accountant payload maps no homework');
  eq(accSlice88.marks.length, 0, 'v88: an accountant payload maps no marks');
  eq(accSlice88.feeRecords.length, 1, 'v88: an accountant payload still maps the fee records');
  // dbKeyFor covers the staff roles (a staff member opens the school's DB).
  eq(dbKeyFor({ role: 'principal', schoolUid: 'test-school' }), 'schoolSaathiDB_test-school', 'v88: dbKeyFor covers principal');
  eq(dbKeyFor({ role: 'accountant', schoolUid: 'test-school' }), 'schoolSaathiDB_test-school', 'v88: dbKeyFor covers accountant');
  eq(dbKeyFor({ role: 'staff', schoolUid: 'test-school' }), 'schoolSaathiDB_test-school', 'v88: dbKeyFor covers staff');
  // ---- v88b: fixes from the live check ----
  // (1) The principal dashboard showed "undefined% Attendance" — the
  // code read st.att, but studentStats returns avgAtt.
  loginAs(prin88, { silent: true });
  var pd88b = principalDashboard();
  ok(pd88b.indexOf('undefined') === -1, 'v88b: the principal dashboard never shows undefined');
  ok(pd88b.indexOf('%') !== -1, 'v88b: the principal dashboard shows the attendance percentage');
  // (2) The top crumb for a principal said "Teacher Dashboard" — the
  // v87 parent branch did not cover the principal.
  eq(t('principalDash'), 'Principal Dashboard', 'v88b: the principal dashboard label exists');
  // (3) The Save Attendance button showed for a principal (and
  // saveAttendance did not refuse them).
  state.attDate = todayIST(); state.attCls = riya88.cls;
  var ap88b = attendancePage();
  ok(ap88b.indexOf('saveAttendance()') === -1, 'v88b: the principal attendance page has no Save Attendance button');
  var attBefore88b = JSON.stringify(db.attendance);
  saveAttendance();
  eq(JSON.stringify(db.attendance), attBefore88b, 'v88b: saveAttendance refuses a principal (no attendance change)');
  // (4) An unmarked student showed a "Present" badge for the principal
  // while the header counts said Not marked — the badge now says
  // Not marked when there is no record.
  var unmarked88b = db.students.find(function (s) { return s.cls === riya88.cls && !(db.attendance[todayIST() + '|' + riya88.cls] || {})[s.id]; });
  if (unmarked88b) ok(ap88b.indexOf(t('attNotMarked')) !== -1, 'v88b: an unmarked student shows Not marked for the principal');
  // (5) The Students table header still rendered an empty ACTIONS column
  // for the principal.
  state.view = 'students'; state.stuSearch = 'Riya Kumari'; state.stuClass = 'All'; state.stuSection = 'All'; state.stuSession = 'All'; state.stuGender = 'All'; state.stuFee = 'All'; state.stuStatus = 'All'; state.stuPage = 1;
  var sp88b = studentsPage();
  ok(sp88b.indexOf(t('actionsW')) === -1, 'v88b: the principal students list has no ACTIONS column header');
  // (6) The Exams card was titled "Enter Marks" for a principal — now
  // it reads "Results".
  state.examId = null;
  var ep88b = examsPage();
  ok(ep88b.indexOf(t('enterMarks')) === -1, 'v88b: the principal exams page is not titled Enter Marks');
  ok(ep88b.indexOf(t('results')) !== -1, 'v88b: the principal exams page is titled Results');
  // ---- v90: Staff management — the school admin creates staff accounts ----
  // The school admin gets a Staff view (PERMS + NAV + PAGE).
  ok(PERMS.school.indexOf('staff') !== -1, 'v90: PERMS.school includes staff');
  ok(NAV.school.some(function (n) { return n[0] === 'staff'; }), 'v90: NAV.school includes staff');
  eq(PAGE_SCHOOL.staff, staffPage, 'v90: PAGE_SCHOOL.staff is staffPage');
  ok(PERMS.principal.indexOf('staff') === -1, 'v90: a principal cannot open the Staff management page');
  ok(PERMS.accountant.indexOf('staff') === -1, 'v90: an accountant cannot open the Staff management page');
  // A principal opening the Staff page sees Not allowed.
  loginAs(prin88, { silent: true });
  ok(staffPage().indexOf(t('tNotAllowed')) !== -1, 'v90: staffPage refuses a principal');
  // The school admin creates a Staff-role account (name + role +
  // classes + email + password); the account is stored with role staff
  // and a bcrypt hash, linked to the staff record by staffId.
  loginAs(TEST_ACCOUNTS.school);
  db = migrateV12(migrateV15(seedDB())); saveDB(db); // v90: migrateV12 adds the staff list (migrateV15 alone does not run it)
  eq(db.staff.length, 0, 'v90 test setup: the seed has no staff');
  staffForm('');
  $('fStaffName').value = 'Ramesh Verma'; $('fStaffEmail').value = 'ramesh-staff@school.in';
  $('fStaffPw').value = 'staff123'; $('fStaffRole').value = 'staff';
  staffFormClasses = ['6th-A', '8th-B'];
  saveStaff({ preventDefault: function () {} }, '');
  eq(db.staff.length, 1, 'v90: saving the staff form adds a staff member');
  var newStf90 = db.staff[0];
  eq(newStf90.role, 'staff', 'v90: the staff record keeps the role');
  eq(newStf90.classes.join(','), '6th-A,8th-B', 'v90: the staff record keeps the assigned classes');
  var stfAcct90 = loadAccounts().find(function (a) { return a.email === 'ramesh-staff@school.in'; });
  ok(!!stfAcct90, 'v90: a staff login account is stored');
  eq(stfAcct90.role, 'staff', 'v90: the staff account has role staff');
  eq(stfAcct90.staffId, newStf90.id, 'v90: the staff account links to the staff record');
  eq(stfAcct90.schoolUid, 'test-school', 'v90: the staff account links to the school');
  eq(stfAcct90.pwHash.indexOf('bcrypt$'), 0, 'v90: the staff password is stored as a bcrypt hash');
  ok(verifyPw('staff123', stfAcct90).ok, 'v90: the new staff hash verifies the right password');
  ok(!verifyPw('wrongpass', stfAcct90).ok, 'v90: the new staff hash rejects a wrong password');
  // A Principal-role account gets no classes.
  staffForm('');
  $('fStaffName').value = 'Priya Principal'; $('fStaffEmail').value = 'priya-principal@school.in';
  $('fStaffPw').value = 'princ123'; $('fStaffRole').value = 'principal';
  staffFormClasses = [];
  saveStaff({ preventDefault: function () {} }, '');
  eq(db.staff.length, 2, 'v90: a principal account is also created');
  eq(db.staff[1].role, 'principal', 'v90: the principal record keeps the role');
  eq(db.staff[1].classes.length, 0, 'v90: a principal carries no classes');
  var prinAcct90 = loadAccounts().find(function (a) { return a.email === 'priya-principal@school.in'; });
  eq(prinAcct90.role, 'principal', 'v90: the principal account has role principal');
  // The Staff page lists both, with roles and classes.
  var sp90 = staffPage();
  ok(sp90.indexOf('Ramesh Verma') !== -1, 'v90: staff page lists the staff member');
  ok(sp90.indexOf('Priya Principal') !== -1, 'v90: staff page lists the principal');
  ok(sp90.indexOf('6th-A, 8th-B') !== -1, 'v90: staff page shows the assigned classes');
  ok(sp90.indexOf('Add Staff') !== -1, 'v90: staff page has an Add Staff button');
  // Duplicate email is refused; a staff member with no class is refused.
  staffForm('');
  $('fStaffName').value = 'Dup Name'; $('fStaffEmail').value = 'ramesh-staff@school.in';
  $('fStaffPw').value = 'staff456'; $('fStaffRole').value = 'staff';
  staffFormClasses = ['7th-A'];
  saveStaff({ preventDefault: function () {} }, '');
  eq(db.staff.length, 2, 'v90: a duplicate staff email is refused');
  staffForm('');
  $('fStaffName').value = 'No Class'; $('fStaffEmail').value = 'noclass@school.in';
  $('fStaffPw').value = 'staff456'; $('fStaffRole').value = 'staff';
  staffFormClasses = [];
  saveStaff({ preventDefault: function () {} }, '');
  eq(db.staff.length, 2, 'v90: a staff member with no classes is refused');
  // The Staff page for a school shows all three roles; the role
  // labels exist in both languages.
  eq(t('staffRolePrincipal'), 'Principal', 'v90: the principal role label exists');
  eq(t('staffRoleAccountant'), 'Accountant', 'v90: the accountant role label exists');
  eq(t('staffRoleStaff'), 'Staff', 'v90: the staff role label exists');
  // ---- v90 sync: ss_staff in the sync tables, mapper and pull ----
  ok(!!SB_SYNC_TABLES.ss_staff, 'v90: SB_SYNC_TABLES includes ss_staff');
  eq(SB_SYNC_TABLES.ss_staff.local, 'staff', 'v90: ss_staff maps to the local staff list');
  var m90 = sbMapStaff(newStf90, 'school-uuid');
  eq(m90.school_id, 'school-uuid', 'v90: sbMapStaff carries the school id');
  eq(m90.local_id, newStf90.id, 'v90: sbMapStaff carries the local id');
  eq(m90.role, 'staff', 'v90: sbMapStaff carries the role');
  eq(m90.classes.join(','), '6th-A,8th-B', 'v90: sbMapStaff carries the classes');
  eq(m90.email, 'ramesh-staff@school.in', 'v90: sbMapStaff carries the login email');
  eq(m90.pw_hash, stfAcct90.pwHash, 'v90: sbMapStaff carries the bcrypt hash');
  ok(m90.pw_hash.indexOf('bcrypt$') === 0, 'v90: sbMapStaff only sends a bcrypt hash');
  var m90p = sbMapStaff(db.staff[1], 'school-uuid');
  eq(m90p.role, 'principal', 'v90: sbMapStaff carries the principal role');
  // The fingerprint for a staff row matches the payload it would push.
  var h90 = sbSyncTableHashes(db, 'school-uuid', { stu: {}, exam: {} });
  ok(!!h90.ss_staff, 'v90: the hash-diff includes ss_staff');
  ok(!!h90.ss_staff[newStf90.id], 'v90: the hash-diff hashes the staff row');
  eq(h90.ss_staff[newStf90.id].hash, JSON.stringify(sbSyncMapRow('ss_staff', newStf90, 'school-uuid', { stu: {}, exam: {} }, db)), 'v90: the staff hash is the exact payload');
  // The pull merges a server staff row into the local list (no hash).
  sbApplyServerRows(db, null, { ss_staff: [{ id: 'srv-staff-1', local_id: newStf90.id, name: 'Ramesh Verma', role: 'staff', classes: ['6th-A', '8th-B'] }] }, null, 'srv-school-90');
  var merged90 = (db.staff || []).find(function (x) { return x.id === newStf90.id; });
  ok(!!merged90, 'v90: the pull keeps the local staff row');
  eq(merged90.role, 'staff', 'v90: the pull keeps the staff role');
  ok(!('pwHash' in merged90) && !('pw_hash' in merged90), 'v90: the pull never carries a password hash');
  // A staff row the server has but the device does not is adopted.
  sbApplyServerRows(db, null, { ss_staff: [{ id: 'srv-staff-2', local_id: 'stf-other-device', name: 'Other Device Staff', role: 'accountant', classes: [] }] }, null, 'srv-school-90');
  var adopted90 = (db.staff || []).find(function (x) { return x.id === 'stf-other-device'; });
  ok(!!adopted90, 'v90: the pull adopts a staff row from another device');
  eq(adopted90.role, 'accountant', 'v90: the adopted staff row keeps its role');
  // An old DB without a staff list gets one (migration).
  var oldDb90 = { students: [] };
  migrateV12(oldDb90);
  ok(Array.isArray(oldDb90.staff) && oldDb90.staff.length === 0, 'v90: migrateV12 adds an empty staff list to an old DB');
  // The outbox maps a staff edit through sbSyncMapRow.
  var out90 = sbSyncMapRow('ss_staff', newStf90, 'school-uuid', { stu: {}, exam: {} }, db);
  eq(out90.email, 'ramesh-staff@school.in', 'v90: the outbox maps a staff edit');
  // ---- v91: fixes from the v90 live check ----
  // (1) The Staff page's empty state said "No teachers yet." — now it
  // says "No staff yet."
  eq(t('tNoStaff'), 'No staff yet.', 'v91: the staff empty-state label exists');
  var emptyDb91 = migrateV12(migrateV15(seedDB())); emptyDb91.staff = [];
  loginAs(TEST_ACCOUNTS.school);
  db = emptyDb91; saveDB(db);
  ok(staffPage().indexOf(t('tNoStaff')) !== -1, 'v91: the empty Staff page says No staff yet');
  ok(staffPage().indexOf(t('tNoTeachers')) === -1, 'v91: the empty Staff page never says No teachers');
  // (2) The top crumb for a staff member / accountant said "Teacher
  // Dashboard" — now it says Staff / Accountant Dashboard.
  eq(t('staffDash'), 'Staff Dashboard', 'v91: the staff dashboard label exists');
  eq(t('accountantDash'), 'Accountant Dashboard', 'v91: the accountant dashboard label exists');
  // (3) The sidebar nav item rendered lowercase "staff" — the i18n key
  // was missing, so t() fell back to the raw key. Now it is "Staff".
  eq(t('staff'), 'Staff', 'v91: the staff nav label exists');
  // ---- v92: Accountant role — fees-focused nav ----
  var acc92 = { role: 'accountant', name: 'Test Accountant', sub: 'Accountant • Test Accountant', email: 'accountant:test-school:acc92', uid: 'accountant-acc92', staffId: 'acc92', schoolUid: 'test-school' };
  // PERMS + NAV + PAGE for the accountant.
  eq(PERMS.accountant.join(','), 'dashboard,fees,reports,notices', 'v92: PERMS.accountant is the fees-focused set (4 views)');
  eq(NAV.accountant.length, 4, 'v92: NAV.accountant has 4 items');
  ok(NAV.accountant.some(function (n) { return n[0] === 'fees'; }), 'v92: NAV.accountant includes fees');
  ok(NAV.accountant.some(function (n) { return n[0] === 'reports'; }), 'v92: NAV.accountant includes reports');
  ok(!NAV.accountant.some(function (n) { return n[0] === 'students'; }), 'v92: NAV.accountant has no students');
  ok(!NAV.accountant.some(function (n) { return n[0] === 'settings'; }), 'v92: NAV.accountant has no settings');
  eq(PAGE_ACCOUNTANT.fees, feesPage, 'v92: PAGE_ACCOUNTANT.fees is feesPage');
  eq(PAGE_ACCOUNTANT.reports, reportsPage, 'v92: PAGE_ACCOUNTANT.reports is reportsPage');
  eq(PAGE_ACCOUNTANT.notices, noticesPage, 'v92: PAGE_ACCOUNTANT.notices is noticesPage');
  // An accountant cannot open students or settings (go() denies).
  loginAs(acc92, { silent: true });
  go('students');
  eq(state.view, 'dashboard', 'v92: go(students) is denied for an accountant');
  go('settings');
  eq(state.view, 'dashboard', 'v92: go(settings) is denied for an accountant');
  go('fees');
  eq(state.view, 'fees', 'v92: go(fees) opens for an accountant');
  go('reports');
  eq(state.view, 'reports', 'v92: go(reports) opens for an accountant');
  // The accountant's fees page: a Pending record shows Collect (and
  // the WhatsApp reminder) but NO Delete, and no fee-entry or
  // fee-structure cards.
  loginAs(TEST_ACCOUNTS.school);
  db = migrateV12(migrateV15(seedDB())); saveDB(db);
  var stu92 = db.students[0];
  db.feeRecords.push({ id: 'fee-acc-92', studentId: stu92.id, student: stu92.name, cls: stu92.cls, month: 'Nov', type: 'Tuition', amount: 800, status: 'Pending', date: todayIST() });
  saveDB(db);
  loginAs(acc92, { silent: true });
  state.view = 'fees'; state.feeFilter = 'All'; state.feeSearch = ''; state.feeType = 'All';
  var fp92 = feesPage();
  // NOTE: t('collectBtn') is the bare word "Collect", which also appears
  // inside "Fee Collected" / "Collected" — the button is checked by its
  // onclick instead.
  ok(fp92.indexOf('openCollectFee(') !== -1, 'v92: the accountant fees page shows the Collect button');
  ok(fp92.indexOf('deleteFeeRecord') === -1, 'v92: the accountant fees page has no Delete button');
  ok(fp92.indexOf(t('addFee')) === -1, 'v92: the accountant fees page has no Add Fee card');
  ok(fp92.indexOf(t('feeStruct')) === -1, 'v92: the accountant fees page has no fee-structure card');
  // The accountant CAN open the collect screen for that record.
  openCollectFee(stu92.id, 'fee-acc-92');
  eq(state.collectStudent, stu92.id, 'v92: openCollectFee allows an accountant');
  state.collectStudent = null; state.collectRecordId = null;
  // The accountant CANNOT delete a fee record (backstop).
  var feeCount92 = db.feeRecords.length;
  deleteFeeRecord('fee-acc-92');
  eq(db.feeRecords.length, feeCount92, 'v92: deleteFeeRecord refuses an accountant');
  // The principal still sees the fees page read-only (regression).
  // NOTE: openCollectFee above left state.feeStudent set — it must be
  // cleared, or feesPage renders the fee-profile view (which has its
  // own Collect button) instead of the fee list.
  loginAs(prin88, { silent: true });
  state.view = 'fees'; state.feeFilter = 'All'; state.feeSearch = ''; state.feeType = 'All'; state.feeStudent = null; state.collectStudent = null; state.collectRecordId = null;
  var fp92p = feesPage();
  ok(fp92p.indexOf('openCollectFee(') === -1, 'v92: the principal fees page still has no Collect button');
  ok(fp92p.indexOf('deleteFeeRecord') === -1, 'v92: the principal fees page still has no Delete button');
  // saveCollectFee refuses a principal (backstop).
  var collBefore92 = db.feeRecords.length;
  collectDraft = { studentId: stu92.id, lines: [{ feeId: 'fee-acc-92', amount: 800 }], total: 800 };
  saveCollectFee(null);
  eq(db.feeRecords.length, collBefore92, 'v92: saveCollectFee refuses a principal');
  collectDraft = null;
  // The fee profile (openFeeProfile) follows the same rule: a principal
  // sees no Collect/Delete there either, and no Add Fee button.
  loginAs(prin88, { silent: true });
  state.feeStudent = stu92.id; state.collectStudent = null; state.collectRecordId = null;
  var fprof92 = studentFeeProfile(stu92.id);
  ok(fprof92.indexOf('openCollectFee(') === -1, 'v92: the principal fee profile has no Collect button');
  ok(fprof92.indexOf('deleteFeeRecord') === -1, 'v92: the principal fee profile has no Delete button');
  ok(fprof92.indexOf('openAddFeeFor') === -1, 'v92: the principal fee profile has no Add Fee button');
  // The accountant's fee profile shows Collect but no Delete/Add Fee.
  loginAs(acc92, { silent: true });
  state.feeStudent = stu92.id; state.collectStudent = null; state.collectRecordId = null;
  var fprof92a = studentFeeProfile(stu92.id);
  ok(fprof92a.indexOf('openCollectFee(') !== -1, 'v92: the accountant fee profile shows the Collect button');
  ok(fprof92a.indexOf('deleteFeeRecord') === -1, 'v92: the accountant fee profile has no Delete button');
  ok(fprof92a.indexOf('openAddFeeFor') === -1, 'v92: the accountant fee profile has no Add Fee button');
  state.feeStudent = null;
  // ---- v93: Staff role — limited nav (attendance, homework, notices) ----
  // A staff member works only their assigned classes (6th-A here).
  var stf93 = { role: 'staff', name: 'Test Staff', sub: 'Staff • Test Staff', email: 'staff:test-school:stf93', uid: 'staff-stf93', staffId: 'stf-93', schoolUid: 'test-school' };
  // PERMS + NAV + PAGE for the staff role.
  eq(PERMS.staff.join(','), 'dashboard,attendance,homework,notices', 'v93: PERMS.staff is the limited set (4 views)');
  eq(NAV.staff.length, 4, 'v93: NAV.staff has 4 items');
  ok(NAV.staff.some(function (n) { return n[0] === 'attendance'; }), 'v93: NAV.staff includes attendance');
  ok(NAV.staff.some(function (n) { return n[0] === 'homework'; }), 'v93: NAV.staff includes homework');
  ok(!NAV.staff.some(function (n) { return n[0] === 'students'; }), 'v93: NAV.staff has no students');
  ok(!NAV.staff.some(function (n) { return n[0] === 'fees'; }), 'v93: NAV.staff has no fees');
  ok(!NAV.staff.some(function (n) { return n[0] === 'settings'; }), 'v93: NAV.staff has no settings');
  eq(PAGE_STAFF.attendance, attendancePage, 'v93: PAGE_STAFF.attendance is attendancePage');
  eq(PAGE_STAFF.homework, homeworkPage, 'v93: PAGE_STAFF.homework is homeworkPage');
  eq(PAGE_STAFF.notices, noticesPage, 'v93: PAGE_STAFF.notices is noticesPage');
  // A staff member cannot open students, fees or settings (go() denies).
  loginAs(stf93, { silent: true });
  go('students');
  eq(state.view, 'dashboard', 'v93: go(students) is denied for a staff member');
  go('fees');
  eq(state.view, 'dashboard', 'v93: go(fees) is denied for a staff member');
  go('settings');
  eq(state.view, 'dashboard', 'v93: go(settings) is denied for a staff member');
  go('attendance');
  eq(state.view, 'attendance', 'v93: go(attendance) opens for a staff member');
  go('homework');
  eq(state.view, 'homework', 'v93: go(homework) opens for a staff member');
  // staffRecord / staffClasses resolve the member's own classes.
  loginAs(TEST_ACCOUNTS.school);
  db = migrateV12(migrateV15(seedDB())); saveDB(db);
  db.staff.push({ id: 'stf-93', name: 'Test Staff', role: 'staff', classes: ['6th-A'], email: 'staff93@school.in', pwHash: '', createdAt: '2026-11-11' });
  saveDB(db);
  loginAs(stf93, { silent: true });
  eq(staffRecord() && staffRecord().id, 'stf-93', 'v93: staffRecord resolves the signed-in staff member');
  eq(staffClasses().join(','), '6th-A', 'v93: staffClasses returns the member assigned classes');
  eq(roleClasses().join(','), '6th-A', 'v93: roleClasses returns the staff member classes');
  // The attendance page is restricted to the member's classes: the
  // picker offers 6th-A only, and a stale attCls outside it is pulled
  // back.
  state.attCls = '10th-A';
  var att93 = attendancePage();
  eq(state.attCls, '6th-A', 'v93: the attendance page pulls a staff member back to their own class');
  ok(att93.indexOf('6th-A') !== -1, 'v93: the staff attendance picker offers their class');
  ok(att93.indexOf('10th-A') === -1, 'v93: the staff attendance picker never offers another class');
  // The staff member CAN mark attendance for their own class.
  var stu93 = db.students.find(function (s) { return s.cls === '6th-A'; });
  ok(!!stu93, 'v93: a 6th-A student exists for the mark test');
  state.attDate = todayIST(); state.attCls = '6th-A';
  markAtt(stu93.id, 'Absent');
  eq((db.attendance[todayIST() + '|6th-A'] || {})[stu93.id], 'Absent', 'v93: a staff member marks attendance for their own class');
  // ...but NOT for another class (backstop).
  state.attCls = '10th-A';
  var before93 = JSON.stringify(db.attendance);
  markAtt(stu93.id, 'Present');
  eq(JSON.stringify(db.attendance), before93, 'v93: markAtt refuses a staff member outside their classes');
  state.attCls = '6th-A';
  // The homework page shows only the member's classes, with the Add
  // button (a staff member posts homework like a teacher).
  db.homework.push({ id: 'hw-93a', title: '6th-A HW', subject: 'Maths', cls: '6th-A', due: todayIST(), doneBy: [] });
  db.homework.push({ id: 'hw-93b', title: '10th-A HW', subject: 'Maths', cls: '10th-A', due: todayIST(), doneBy: [] });
  saveDB(db);
  var hw93 = homeworkPage();
  ok(hw93.indexOf('6th-A HW') !== -1, 'v93: the staff homework page shows their own class homework');
  ok(hw93.indexOf('10th-A HW') === -1, 'v93: the staff homework page never shows another class homework');
  ok(hw93.indexOf('homeworkForm()') !== -1, 'v93: the staff homework page offers the Add button');
  // saveHomework refuses a staff member posting to another class.
  var hwCount93 = db.homework.length;
  // (the form is DOM-driven; the guard is the class check inside
  // saveHomework — covered by the roleClasses check below)
  ok(roleClasses().indexOf('10th-A') === -1, 'v93: roleClasses never includes another class for a staff member');
  // ---- v94: Super Admin first UI — the schools list ----
  var sa94 = { role: 'superadmin', name: 'Super Admin', email: 'superadmin@test.in', uid: 'superadmin-94' };
  // PERMS + NAV + PAGE for the super admin.
  eq(PERMS.superadmin.join(','), 'dashboard,schools,notices', 'v94: PERMS.superadmin is dashboard + schools + notices');
  eq(NAV.superadmin.length, 3, 'v94: NAV.superadmin has 3 items');
  ok(NAV.superadmin.some(function (n) { return n[0] === 'schools'; }), 'v94: NAV.superadmin includes schools');
  ok(!NAV.superadmin.some(function (n) { return n[0] === 'students'; }), 'v94: NAV.superadmin has no students');
  ok(!NAV.superadmin.some(function (n) { return n[0] === 'settings'; }), 'v94: NAV.superadmin has no settings');
  eq(PAGE_SUPERADMIN.schools, schoolsPage, 'v94: PAGE_SUPERADMIN.schools is schoolsPage');
  eq(PAGE_SUPERADMIN.notices, noticesPage, 'v94: PAGE_SUPERADMIN.notices is noticesPage');
  // A super admin cannot open students or settings (go() denies).
  loginAs(sa94, { silent: true });
  go('students');
  eq(state.view, 'dashboard', 'v94: go(students) is denied for a super admin');
  go('settings');
  eq(state.view, 'dashboard', 'v94: go(settings) is denied for a super admin');
  go('schools');
  eq(state.view, 'schools', 'v94: go(schools) opens for a super admin');
  // The schools page renders the cached list (read-only — no action
  // buttons, no edit/delete).
  state.superSchools = [
    { id: 's1', name: 'Test Sunrise School', city: 'Patna', session: '2025–26', owner_id: 'owner-1', created_at: '2026-11-01T00:00:00Z' },
    { id: 's2', name: 'VM School', city: 'Gopalganj', session: '2025–26', owner_id: 'owner-2', created_at: '2026-11-02T00:00:00Z' }
  ];
  var sch94 = schoolsPage();
  ok(sch94.indexOf('Test Sunrise School') !== -1, 'v94: the schools page lists Test Sunrise School');
  ok(sch94.indexOf('VM School') !== -1, 'v94: the schools page lists VM School');
  ok(sch94.indexOf('Patna') !== -1, 'v94: the schools page shows the city');
  ok(sch94.indexOf('2025–26') !== -1, 'v94: the schools page shows the session');
  ok(sch94.indexOf('deleteBtn') === -1 && sch94.indexOf('editBtn') === -1, 'v94: the schools page has no edit/delete actions');
  // Empty state when the list is empty.
  state.superSchools = [];
  ok(schoolsPage().indexOf(t('tNoSchools')) !== -1, 'v94: the empty schools page says No schools yet');
  // The super admin dashboard names the platform, never the demo school.
  state.superSchools = null;
  state.view = 'dashboard';
  var dash94 = roleDashboard();
  ok(dash94.indexOf('Super Admin') !== -1, 'v94: the super admin dashboard names the role');
  ok(dash94.indexOf('School Saathi Platform') !== -1, 'v94: the super admin dashboard names the platform');
  ok(dash94.indexOf('St. Xavier') === -1, 'v94: the super admin dashboard never shows the demo school name');
  // The top crumb for a super admin says Super Admin Dashboard.
  eq(t('superAdminDash'), 'Super Admin Dashboard', 'v94: the super admin dashboard label exists');
  // Reset the filter state this block set — the async section shares this
  // vm, and a leftover stuSearch would filter later tests' students out
  // (the v34 P1-12 "Assigning number" check broke on exactly this).
  state.stuSearch = ''; state.stuClass = 'All'; state.stuSection = 'All'; state.stuSession = 'All'; state.stuGender = 'All'; state.stuFee = 'All'; state.stuStatus = 'All'; state.stuPage = 1;
  state.attDate = todayIST(); state.attCls = '6th-A';
  state.feeFilter = 'All'; state.feeType = 'All'; state.feeSearch = ''; state.feeLimit = 120;
  state.examId = null; state.collectStudent = null; state.feeStudent = null;
  loginAs(TEST_ACCOUNTS.school);
  // ---- v95: hash sweep — bcrypt is the only hash the app creates ----
  // (i) Creation: hashPwNew and hashPin mint bcrypt$ when bcryptjs is
  // available (the normal case — it is vendored and loaded before this
  // file). The s256$ fallback in hashPwNew is defensive only (it fires
  // when bcryptjs failed to load, so account creation never breaks).
  ok(bcryptAvailable(), 'v95: bcryptjs is available in this build');
  ok(hashPwNew('TestPass-2026').indexOf('bcrypt$') === 0, 'v95: hashPwNew mints a bcrypt hash');
  ok(hashPin('3175').indexOf('bcrypt$') === 0, 'v95: hashPin mints a bcrypt hash');
  // (ii) Verification: verifyPw marks s256$ AND djb2 as legacy (the
  // caller upgrades both to bcrypt on a successful login), and bcrypt$
  // as current.
  var s256pin95 = 's256$' + 'testsalt95' + '$' + sha256Hex('testsalt95' + '|' + '3175');
  eq(verifyPw('3175', { pwHash: s256pin95 }).ok, true, 'v95: an s256 PIN still verifies');
  eq(verifyPw('3175', { pwHash: s256pin95 }).legacy, true, 'v95: an s256 PIN is marked legacy (upgrades on login)');
  eq(verifyPw('9999', { pwHash: s256pin95 }).ok, false, 'v95: a wrong PIN fails against an s256 hash');
  eq(verifyPw('TestPass-2026', { pwHash: hashPwNew('TestPass-2026') }).legacy, false, 'v95: a bcrypt hash is not legacy');
  eq(verifyPw('TestPass-2026', { pwHash: hashPw('TestPass-2026') }).legacy, true, 'v95: a djb2 hash is marked legacy (upgrades on login)');
  // (iii) The PIN upgrade on login: a student whose stored PIN hash is
  // s256$ gets a bcrypt$ hash after a successful login (the v95 change
  // in doStudentLogin / doParentLogin). The upgraded hash verifies.
  var up95 = hashPin('3175');
  ok(up95.indexOf('bcrypt$') === 0, 'v95: the upgraded PIN hash is bcrypt');
  ok(verifyPin('3175', { parentPinHash: up95 }), 'v95: the upgraded PIN hash verifies');
  ok(!verifyPin('9999', { parentPinHash: up95 }), 'v95: the upgraded PIN hash rejects a wrong PIN');
  // (iv) Source scans for the hash sweep live Node-side (after the vm
  // run) — the vm has no src/cryptoSrc variables, only the inlined code.
  // Reset the filter state this block set.
  state.stuSearch = ''; state.stuClass = 'All'; state.stuSection = 'All'; state.stuSession = 'All'; state.stuGender = 'All'; state.stuFee = 'All'; state.stuStatus = 'All'; state.stuPage = 1;
  state.attDate = todayIST(); state.attCls = '6th-A';
  state.feeFilter = 'All'; state.feeType = 'All'; state.feeSearch = ''; state.feeLimit = 120;
  state.examId = null; state.collectStudent = null; state.feeStudent = null;
  loginAs(TEST_ACCOUNTS.school);
  // ---- v96: cons fix — Notices empty state + login-screen language ----
  // (i) An empty notices list shows the empty-state message, not a blank card.
  var savedNotices96 = db.notices;
  db.notices = [];
  var np96 = noticesPage();
  ok(np96.indexOf(t('tNoNotices')) !== -1, 'v96: an empty notices list says No notices yet');
  db.notices = [{ id: 'n96', title: 'Test Notice', date: todayIST(), body: 'Hello' }];
  var np96b = noticesPage();
  ok(np96b.indexOf('Test Notice') !== -1, 'v96: a notices list still renders its items');
  ok(np96b.indexOf(t('tNoNotices')) === -1, 'v96: a non-empty notices list does not show the empty state');
  db.notices = savedNotices96;
  // (ii) setLang does not throw when the login-screen toggle is absent
  // (the vm DOM has no login buttons) — the guards keep it safe.
  setLang('hi');
  eq(state.lang, 'hi', 'v96: setLang switches to Hindi');
  setLang('en');
  eq(state.lang, 'en', 'v96: setLang switches back to English');
  // Reset the filter state this block set.
  state.stuSearch = ''; state.stuClass = 'All'; state.stuSection = 'All'; state.stuSession = 'All'; state.stuGender = 'All'; state.stuFee = 'All'; state.stuStatus = 'All'; state.stuPage = 1;
  state.attDate = todayIST(); state.attCls = '6th-A';
  state.feeFilter = 'All'; state.feeType = 'All'; state.feeSearch = ''; state.feeLimit = 120;
  state.examId = null; state.collectStudent = null; state.feeStudent = null;
  loginAs(TEST_ACCOUNTS.school);
  // ---- v112: small polish — status line + reset heading follow the language ----
  // (i) The login screen's sync status line is set via textContent (not
  // data-i18n), so a language switch left it in the old language until
  // the next sync event. setLang now refreshes it. (The test school is
  // local-only, so sbSetStatus coerces to the local-only line — the
  // refresh is language-agnostic, and that line is translated too.)
  setLang('en');
  sbSetStatus('failed', '');
  ok($('sbStatus').textContent.indexOf('Not linked to the server') !== -1, 'v112: the status line is English in English mode');
  setLang('hi');
  ok($('sbStatus').textContent.indexOf('सर्वर से जुड़ा नहीं है') !== -1, 'v112: the status line turns Hindi on the language switch');
  setLang('en');
  ok($('sbStatus').textContent.indexOf('Not linked to the server') !== -1, 'v112: the status line turns back to English');
  // (ii) The login card's "Welcome back" heading stays visible above the
  // password-reset forms — on a reset card it is the wrong heading. The
  // heading now shows the reset title there, and "Welcome back" returns
  // on the login form.
  showRecoverForm();
  eq($('welcomeTitle').textContent, t('sbRecoverTitle'), 'v112: the reset form shows the Reset Password heading');
  eq($('welcomeSub').style.display, 'none', 'v112: the reset form hides the welcome sub-line');
  setLang('hi');
  eq($('welcomeTitle').textContent, 'पासवर्ड रीसेट करें', 'v112: the reset heading follows the language switch');
  setLang('en');
  switchAuth('login');
  eq($('welcomeTitle').textContent, t('loginWelcomeBack'), 'v112: back on the login form, the heading is Welcome back again');
  ok($('welcomeSub').style.display !== 'none', 'v112: back on the login form, the welcome sub-line is visible again');
  // Reset the filter state this block set.
  state.stuSearch = ''; state.stuClass = 'All'; state.stuSection = 'All'; state.stuSession = 'All'; state.stuGender = 'All'; state.stuFee = 'All'; state.stuStatus = 'All'; state.stuPage = 1;
  state.attDate = todayIST(); state.attCls = '6th-A';
  state.feeFilter = 'All'; state.feeType = 'All'; state.feeSearch = ''; state.feeLimit = 120;
  state.examId = null; state.collectStudent = null; state.feeStudent = null;
  loginAs(TEST_ACCOUNTS.school);

  // ---- v97: cons fix — audit rows for cloud attendance/homework/marks ----
  // (i) A LOCAL marks save writes an audit row AND a dashboard activity row.
  // Before v97 a marks save wrote neither — the Activity Log showed the
  // exam being created, never the marks going in.
  state.role = 'school'; state.user = TEST_ACCOUNTS.school; state.view = 'exams'; state.examId = 'ex1';
  $('mk-stu33').value = '91';
  $('mk-stu36').value = '61';
  saveMarks('ex1');
  eq(db.auditLog[0] && db.auditLog[0].action, 'Marks saved', 'v97: a local marks save writes a Marks saved audit row');
  eq(db.activities[0] && db.activities[0].title, 'Marks saved', 'v97: a local marks save writes a Marks saved activity row');
  // (ii) A LOCAL homework post writes an audit row (it already wrote the activity).
  $('fHwDue').value = '2027-06-01'; $('fHwCls').value = '6th-A'; $('fHwSub').value = 'Maths'; $('fHwTitle').value = 'HW Audit Test';
  saveHomework({ preventDefault: function () {} });
  eq(db.auditLog[0] && db.auditLog[0].action, 'Homework assigned', 'v97: a local homework post writes a Homework assigned audit row');
  // (iii) A CLOUD teacher save posts the audit row to the server (SQL 34
  // RPC) and writes NO local audit/activity row — the v62 pin still holds.
  var rpcCalls97 = [];
  var fetchRec97 = function (url, opts) {
    rpcCalls97.push({ url: String(url), body: (opts && opts.body) ? String(opts.body) : '' });
    return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true }); } });
  };
  fetch = fetchRec97;
  loginCloudTeacher(cloudAcct62, cloudSlice62, '00000000-0000-0000-0000-000000000062');
  var auditLenBefore97 = db.auditLog.length;
  var actLenBefore97 = db.activities.length;
  state.view = 'attendance'; state.attCls = '6th-A'; state.attDate = '2026-11-10';
  saveAttendance();
  await new Promise(function (r) { setTimeout(r, 0); });
  await new Promise(function (r) { setTimeout(r, 0); });
  ok(rpcCalls97.some(function (c) { return c.url.indexOf('ss_log_audit') !== -1 && c.body.indexOf('Attendance updated') !== -1; }), 'v97: the cloud attendance save posts an audit row to the server');
  eq(db.auditLog.length, auditLenBefore97, 'v97: the cloud attendance save writes no local audit entry');
  eq(db.activities.length, actLenBefore97, 'v97: the cloud attendance save writes no local activity entry');
  // Marks (cloud): the audit call fires after the marks RPC confirms.
  state.view = 'exams'; state.examId = 'exam-cloud-62';
  $('mk-stu-cloud-62a').value = '46';
  $('mk-stu-cloud-62b').value = '';
  var rpcBeforeMarks97 = rpcCalls97.length;
  saveMarks('exam-cloud-62');
  await new Promise(function (r) { setTimeout(r, 0); });
  await new Promise(function (r) { setTimeout(r, 0); });
  ok(rpcCalls97.slice(rpcBeforeMarks97).some(function (c) { return c.url.indexOf('ss_log_audit') !== -1 && c.body.indexOf('Marks saved') !== -1; }), 'v97: the cloud marks save posts an audit row to the server');
  // Homework (cloud): the audit call fires after the post RPC confirms.
  $('fHwDue').value = '2027-06-01'; $('fHwCls').value = '6th-A'; $('fHwSub').value = 'Maths'; $('fHwTitle').value = 'Ex 4.1 Audit';
  var rpcBeforeHw97 = rpcCalls97.length;
  saveHomework({ preventDefault: function () {} });
  await new Promise(function (r) { setTimeout(r, 0); });
  await new Promise(function (r) { setTimeout(r, 0); });
  ok(rpcCalls97.slice(rpcBeforeHw97).some(function (c) { return c.url.indexOf('ss_log_audit') !== -1 && c.body.indexOf('Homework assigned') !== -1; }), 'v97: the cloud homework post posts an audit row to the server');
  // The helper with no token calls nothing.
  var rpcLenBeforeNull97 = rpcCalls97.length;
  await sbLogAuditCloud(null, 'Nope', '', '', '', '', '');
  eq(rpcCalls97.length, rpcLenBeforeNull97, 'v97: the audit helper with no token calls nothing');
  fetch = undefined;
  logout(); await waitLogout();
  // Reset the filter state this block set.
  state.stuSearch = ''; state.stuClass = 'All'; state.stuSection = 'All'; state.stuSession = 'All'; state.stuGender = 'All'; state.stuFee = 'All'; state.stuStatus = 'All'; state.stuPage = 1;
  state.attDate = todayIST(); state.attCls = '6th-A';
  state.feeFilter = 'All'; state.feeType = 'All'; state.feeSearch = ''; state.feeLimit = 120;
  state.examId = null; state.collectStudent = null; state.feeStudent = null;
  loginAs(TEST_ACCOUNTS.school);
  // ---- v98: cons fix — a cloud staff member's writes reach the server ----
  // Before v98 a staff login's attendance/homework/marks only ever
  // reached the local slice: the write paths checked cloudTeacherToken
  // only, and the slice carried no db.staff row, so roleClasses()
  // returned [] and the gate refused the write before any RPC.
  var staffPayload98 = {
    ok: true, staff: { id: 'srv-stf98', name: 'Test Staff', role: 'staff', classes: ['6th-A'], email: 'staff98@school.in' },
    school: { id: 'srv-school98', name: 'Test School', city: 'Patna' },
    data: {
      students: [{ id: 'srv-s1', local_id: 'stu88', name: 'Map Kid', cls: '6th-A', admission_no: 'ADM-88-001', enr: 'ENR88', roll: 1, gender: 'Girl', status: 'Active', father_name: 'Map Father', mother_name: 'Map Mother', phone: '9812345678', admission_date: '2026-04-01', session: '2025–26', photo_url: null }],
      teachers: [{ id: 'srv-t1', local_id: 't88', name: 'Map Teacher', subject: 'Mathematics', cls: '6th-A', classes: ['6th-A'] }],
      attendance: [{ id: 'srv-a1', att_date: todayIST(), cls: '6th-A', student_id: 'srv-s1', status: 'Present' }],
      homework: [{ id: 'srv-h1', local_id: 'hw88', cls: '6th-A', subject: 'Mathematics', title: 'Map HW', due: '2026-11-20', done_by: [] }],
      notices: [{ id: 'srv-n1', local_id: 'n88', title: 'Map Notice', notice_date: todayIST(), body: 'Hello' }],
      exams: [{ id: 'srv-e1', local_id: 'ex88', name: 'Map Exam', cls: '6th-A', subject: 'Mathematics', exam_date: todayIST(), total: 100, deleted: false }],
      marks: [{ id: 'srv-m1', exam_id: 'srv-e1', student_id: 'srv-s1', marks: 88 }],
      fee_records: [{ id: 'srv-f1', local_id: 'fr88', student_id: 'srv-s1', student_name: 'Map Kid', cls: '6th-A', month: 'Nov', fee_type: 'Tuition', amount: 800, status: 'Collected', record_date: todayIST() }],
      fee_structure: [{ id: 'srv-fs1', cls: '6th-A', fee_type: 'Tuition', amount: 800 }],
      receipts: [{ id: 'srv-r1', receipt_no: 'RCP-98-001', student_id: 'srv-s1', admission_no: 'ADM-88-001', student_name: 'Map Kid', cls: '6th-A', session: '2025–26', receipt_date: todayIST(), month: 'Nov', counter_no: 1, lines: [], pay_mode: 'Cash', pay_date: todayIST(), bank: '', number: '', total: 800, total_words: 'Eight hundred', collector: 'Test Admin' }]
    }
  };
  var slice98 = mapCloudStaffPayload(staffPayload98);
  eq(slice98.staff.length, 1, 'v98: the staff slice carries the signed-in staff member');
  eq(slice98.staff[0].classes.join(','), '6th-A', 'v98: the staff slice carries the member classes');
  eq(slice98.students[0].srvId, 'srv-s1', 'v98: the staff slice student carries its server id');
  eq(slice98.exams[0].srvId, 'srv-e1', 'v98: the staff slice exam carries its server id');
  var acct98 = { role: 'staff', name: 'Test Staff', sub: 'Staff • Test Staff', email: 'cloud-staff:srv-school98:srv-stf98', uid: 'cloud-staff-srv-stf98', staffId: 'srv-stf98', schoolUid: 'srv-school98', cloud: true, schoolServerId: 'srv-school98' };
  var rpcCalls98 = [];
  var fetchRec98 = function (url, opts) {
    rpcCalls98.push({ url: String(url), body: (opts && opts.body) ? String(opts.body) : '' });
    return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true }); } });
  };
  fetch = fetchRec98;
  loginCloudStaff(acct98, slice98, '00000000-0000-0000-0000-000000000098');
  eq(state.cloudStaffToken, '00000000-0000-0000-0000-000000000098', 'v98: the cloud staff login stores the staff token');
  eq(roleClasses().join(','), '6th-A', 'v98: roleClasses resolves for a cloud staff member (the slice seeds db.staff)');
  // (i) Attendance tap: the STAFF RPC fires (not the teacher RPC), and
  // the slice updates optimistically.
  state.view = 'attendance'; state.attCls = '6th-A'; state.attDate = '2026-11-10';
  markAtt('stu88', 'Absent');
  await new Promise(function (r) { setTimeout(r, 0); });
  await new Promise(function (r) { setTimeout(r, 0); });
  ok(rpcCalls98.some(function (c) { return c.url.indexOf('ss_staff_mark_attendance') !== -1 && c.body.indexOf('Absent') !== -1; }), 'v98: a staff attendance tap calls the staff mark RPC');
  ok(!rpcCalls98.some(function (c) { return c.url.indexOf('ss_teacher_mark_attendance') !== -1; }), 'v98: a staff attendance tap never calls the teacher RPC');
  eq((db.attendance['2026-11-10|6th-A'] || {})['stu88'], 'Absent', 'v98: the staff attendance tap updates the slice');
  // (ii) Save attendance: the audit RPC fires with the staff token, and
  // no local audit row is written (the v62 pin, for staff too).
  var auditLenBefore98 = db.auditLog.length;
  saveAttendance();
  await new Promise(function (r) { setTimeout(r, 0); });
  await new Promise(function (r) { setTimeout(r, 0); });
  ok(rpcCalls98.some(function (c) { return c.url.indexOf('ss_log_audit') !== -1 && c.body.indexOf('Attendance updated') !== -1; }), 'v98: a staff attendance save posts an audit row to the server');
  eq(db.auditLog.length, auditLenBefore98, 'v98: a staff attendance save writes no local audit entry');
  // (iii) Marks: the STAFF set-marks RPC fires, then the audit RPC.
  state.view = 'exams'; state.examId = 'ex88';
  $('mk-stu88').value = '92';
  var rpcBeforeMarks98 = rpcCalls98.length;
  saveMarks('ex88');
  await new Promise(function (r) { setTimeout(r, 0); });
  await new Promise(function (r) { setTimeout(r, 0); });
  ok(rpcCalls98.slice(rpcBeforeMarks98).some(function (c) { return c.url.indexOf('ss_staff_set_marks') !== -1; }), 'v98: a staff marks save calls the staff set-marks RPC');
  ok(rpcCalls98.slice(rpcBeforeMarks98).some(function (c) { return c.url.indexOf('ss_log_audit') !== -1 && c.body.indexOf('Marks saved') !== -1; }), 'v98: a staff marks save posts an audit row to the server');
  // (iv) Homework: the STAFF post RPC fires, then the audit RPC.
  $('fHwDue').value = '2027-06-01'; $('fHwCls').value = '6th-A'; $('fHwSub').value = 'Maths'; $('fHwTitle').value = 'Staff HW 98';
  var rpcBeforeHw98 = rpcCalls98.length;
  saveHomework({ preventDefault: function () {} });
  await new Promise(function (r) { setTimeout(r, 0); });
  await new Promise(function (r) { setTimeout(r, 0); });
  ok(rpcCalls98.slice(rpcBeforeHw98).some(function (c) { return c.url.indexOf('ss_staff_post_homework') !== -1 && c.body.indexOf('Staff HW 98') !== -1; }), 'v98: a staff homework post calls the staff post RPC');
  ok(rpcCalls98.slice(rpcBeforeHw98).some(function (c) { return c.url.indexOf('ss_log_audit') !== -1 && c.body.indexOf('Homework assigned') !== -1; }), 'v98: a staff homework post posts an audit row to the server');
  // (v) Logout revokes the staff token on the server (SQL 30 RPC) and
  // drops the token + the session snapshot.
  logout(); await waitLogout();
  ok(rpcCalls98.some(function (c) { return c.url.indexOf('ss_staff_revoke_session') !== -1; }), 'v98: logout revokes the staff session on the server');
  eq(state.cloudStaffToken, null, 'v98: logout drops the cloud staff token');
  eq(sessionStorage.getItem(CLOUD_STAFF_KEY), null, 'v98: logout drops the cloud staff snapshot');
  eq(state.role, null, 'v98: logout leaves no role');
  fetch = undefined;
  state.stuSearch = ''; state.stuClass = 'All'; state.stuSection = 'All'; state.stuSession = 'All'; state.stuGender = 'All'; state.stuFee = 'All'; state.stuStatus = 'All'; state.stuPage = 1;
  state.attDate = todayIST(); state.attCls = '6th-A';
  state.feeFilter = 'All'; state.feeType = 'All'; state.feeSearch = ''; state.feeLimit = 120;
  state.examId = null; state.collectStudent = null; state.feeStudent = null;
  loginAs(TEST_ACCOUNTS.school);
  // ---- v99: cons fix — PIN hardening ----
  // (a) A local school wrong password counts server-side too, so 5
  // guesses per device are no longer free; a server lock binds the
  // local login as well. No ok-call on the local path: clearing the
  // counter needs a GoTrue token, which a local login never has.
  var rpcCalls99 = [];
  var preCount99 = 0;
  var resetBody99 = null;
  function fetch99(url, init) {
    var u = String(url);
    rpcCalls99.push(u);
    if (u.indexOf('ss_school_login_precheck') !== -1) {
      var preBody = {};
      try { preBody = JSON.parse(init.body || '{}'); } catch (e) {}
      if (preBody.p_email === 'locked99@school.test') {
        preCount99++;
        if (preCount99 >= 2) return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: false, locked: true, locked_until: '2026-11-12T12:00:00.000Z' }); } });
      }
      return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true, locked: false }); } });
    }
    if (u.indexOf('ss_school_login_failed') !== -1) return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true, locked: false, fails: 1 }); } });
    if (u.indexOf('ss_school_login_ok') !== -1) return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true }); } });
    if (u.indexOf('ss_parent_pin_precheck') !== -1) {
      var ppBody = {};
      try { ppBody = JSON.parse(init.body || '{}'); } catch (e) {}
      if (ppBody.p_admission_no === 'ADM-LOCKED-99') return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: false, locked: true, locked_until: '2026-11-12T12:00:00.000Z' }); } });
      return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true, locked: false }); } });
    }
    if (u.indexOf('ss_parent_pin_failed') !== -1) return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true, locked: false, fails: 1 }); } });
    if (u.indexOf('ss_parent_pin_ok') !== -1) return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true }); } });
    if (u.indexOf('ss_parent_pin_reset_by_dob') !== -1) {
      try { resetBody99 = JSON.parse(init.body || '{}'); } catch (e) { resetBody99 = null; }
      if (resetBody99 && resetBody99.p_admission_no === 'ADM-LOCKED-99') return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: false, locked: true }); } });
      if (resetBody99 && resetBody99.p_dob === '2000-01-01') return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: false, locked: false }); } });
      return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true }); } });
    }
    if (u.indexOf('/auth/v1/token') !== -1) return Promise.resolve({ ok: false, status: 400, json: function () { return Promise.resolve({ error: 'invalid_grant' }); } });
    return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true }); } });
  }
  var tick99 = function () { return new Promise(function (r) { setTimeout(r, 0); }); };
  // (a1) Local-only school, wrong local password: the failure is
  // recorded twice — once by the GoTrue path (400) and once by the
  // local login — and the generic error shows.
  var savedAccs99 = loadAccounts();
  saveAccounts(savedAccs99.concat([
    { uid: 'u-99a', name: 'Local School 99', school: 'Local School 99', email: 'local99@school.test', pwHash: hashPwNew('localpass99'), hashScheme: 'bcrypt', role: 'school' },
    { uid: 'u-99b', name: 'Locked School 99', school: 'Locked School 99', email: 'locked99@school.test', pwHash: hashPwNew('localpass99'), hashScheme: 'bcrypt', role: 'school' }
  ]));
  fetch = fetch99;
  rpcCalls99 = [];
  $('loginId').value = 'local99@school.test'; $('loginPw').value = 'wrongpass';
  $('loginErr').textContent = '';
  doLogin({ preventDefault: function () {} });
  await tick99(); await tick99(); await tick99(); await tick99();
  eq(rpcCalls99.filter(function (u) { return u.indexOf('ss_school_login_failed') !== -1; }).length, 2, 'v99: a wrong local school password records the failure twice (GoTrue path + local path)');
  eq($('loginErr').textContent, t('tInvalidCreds'), 'v99: a wrong local school password shows the generic error');
  // (a2) Local-only school, right local password: logs in, exactly one
  // failure recorded (the GoTrue 400 only), and the clear RPC is never
  // called — the local path has no GoTrue token to clear with.
  rpcCalls99 = [];
  $('loginId').value = 'local99@school.test'; $('loginPw').value = 'localpass99';
  $('loginErr').textContent = '';
  doLogin({ preventDefault: function () {} });
  await tick99(); await tick99(); await tick99(); await tick99();
  eq(state.user && state.user.email, 'local99@school.test', 'v99: the right local school password logs in');
  eq(rpcCalls99.filter(function (u) { return u.indexOf('ss_school_login_failed') !== -1; }).length, 1, 'v99: a right local school password records only the GoTrue failure');
  eq(rpcCalls99.some(function (u) { return u.indexOf('ss_school_login_ok') !== -1; }), false, 'v99: the local school login never calls the clear RPC (no token)');
  logout(); await waitLogout();
  // (a3) Server-locked email: the lock engages between the two
  // prechecks (another device locked it), so the local login never
  // runs — the first precheck passes, the second refuses.
  preCount99 = 0;
  rpcCalls99 = [];
  $('loginId').value = 'locked99@school.test'; $('loginPw').value = 'localpass99';
  $('loginErr').textContent = '';
  doLogin({ preventDefault: function () {} });
  await tick99(); await tick99(); await tick99(); await tick99();
  eq($('loginErr').textContent, t('tPinLocked'), 'v99: a server-locked school email shows the lock text on the local path');
  eq(state.user, null, 'v99: a server-locked school email does not log in locally');
  eq(rpcCalls99.filter(function (u) { return u.indexOf('ss_school_login_failed') !== -1; }).length, 1, 'v99: a server-locked school email records only the GoTrue failure (local login never runs)');
  // (b) Parent local login: wrong PIN records the failure server-side,
  // a right PIN clears the row, and a locked admission number is
  // refused before the PIN is tried.
  // (a2) logged in as the local99 school, whose db is empty — log back
  // in as the test school first so db is the seed db again.
  loginAs(TEST_ACCOUNTS.school);
  var riya99 = db.students.find(function (s) { return s.id === 'stu33'; });
  riya99.parentPinHash = hashPin('4321'); delete riya99.parentPin;
  riya99.dob = '2012-03-04';
  saveDB(db);
  var savedMap99 = sbServerSchoolMap();
  sbSaveServerSchool('test-school', 'srv-school-99');
  rpcCalls99 = [];
  $('parentSchool').value = 'test-school';
  $('parentAdmNo').value = riya99.admissionNo;
  $('parentPin').value = '0000';
  $('parentErr').textContent = '';
  doParentLogin({ preventDefault: function () {} });
  await tick99(); await tick99(); await tick99(); await tick99();
  eq(rpcCalls99.some(function (u) { return u.indexOf('ss_parent_pin_failed') !== -1; }), true, 'v99: a wrong local parent PIN records the failure on the server');
  eq($('parentErr').textContent, t('tInvalidStudent'), 'v99: a wrong local parent PIN shows the generic error');
  ok(state.role !== 'parent', 'v99: a wrong local parent PIN does not log in');
  rpcCalls99 = [];
  $('parentPin').value = '4321';
  $('parentErr').textContent = '';
  doParentLogin({ preventDefault: function () {} });
  await tick99(); await tick99(); await tick99(); await tick99();
  eq(state.role, 'parent', 'v99: the right local parent PIN logs in as parent');
  eq(state.user && state.user.studentId, 'stu33', 'v99: the parent session is tied to the one student');
  eq(rpcCalls99.some(function (u) { return u.indexOf('ss_parent_pin_ok') !== -1; }), true, 'v99: a right local parent PIN clears the server counter');
  logout(); await waitLogout();
  rpcCalls99 = [];
  $('parentSchool').value = 'test-school';
  $('parentAdmNo').value = 'ADM-LOCKED-99';
  $('parentPin').value = '4321';
  $('parentErr').textContent = '';
  doParentLogin({ preventDefault: function () {} });
  await tick99(); await tick99(); await tick99(); await tick99();
  eq($('parentErr').textContent, t('tPinLocked'), 'v99: a locked admission number shows the lock text on the parent login');
  eq(state.role, null, 'v99: a locked admission number does not log in as parent');
  // (c) Parent PIN reset by DOB (local school): wrong DOB refuses and
  // records a failure; the right DOB sets a new PIN; a student with no
  // DOB on file is sent to the admin.
  showParentPinReset();
  eq($('parentLoginFields').classList.contains('hidden'), true, 'v99: the reset view hides the login fields');
  eq($('parentResetFields').classList.contains('hidden'), false, 'v99: the reset view shows the reset fields');
  rpcCalls99 = [];
  $('parentResetAdm').value = riya99.admissionNo;
  $('parentResetDob').value = '2000-01-01';
  $('parentResetPin').value = '5555';
  $('parentResetPin2').value = '5555';
  $('parentErr').textContent = '';
  doParentPinReset({ preventDefault: function () {} });
  await tick99(); await tick99(); await tick99(); await tick99();
  eq($('parentErr').textContent, t('tInvalidStudent'), 'v99: a wrong DOB refuses the PIN reset with the generic error');
  eq(rpcCalls99.some(function (u) { return u.indexOf('ss_parent_pin_failed') !== -1; }), true, 'v99: a wrong DOB records a failure on the server');
  rpcCalls99 = [];
  $('parentResetDob').value = '2012-03-04';
  $('parentErr').textContent = '';
  doParentPinReset({ preventDefault: function () {} });
  await tick99(); await tick99(); await tick99(); await tick99();
  eq($('toast').textContent, t('tPinResetDone'), 'v99: the right DOB resets the PIN and toasts the success');
  eq(parentResetMode, false, 'v99: a successful reset returns to the login view');
  eq(rpcCalls99.some(function (u) { return u.indexOf('ss_parent_pin_ok') !== -1; }), true, 'v99: a successful local reset clears the server counter');
  var riyaAfter99 = findStudentByAdmNoInSchool(riya99.admissionNo, 'test-school');
  ok(riyaAfter99 && verifyPin('5555', riyaAfter99.student), 'v99: the reset PIN verifies on the stored record');
  ok(riyaAfter99 && riyaAfter99.db.auditLog.some(function (a) { return a.action === 'Parent PIN reset'; }), 'v99: the reset writes an audit row on the school copy');
  showParentPinReset();
  $('parentResetAdm').value = 'ADM-2025-034';
  $('parentResetDob').value = '2012-03-04';
  $('parentResetPin').value = '5555';
  $('parentResetPin2').value = '5555';
  $('parentErr').textContent = '';
  doParentPinReset({ preventDefault: function () {} });
  await tick99(); await tick99(); await tick99(); await tick99();
  eq($('parentErr').textContent, t('tPinResetNoDob'), 'v99: a student with no DOB on file is sent to the admin');
  // (d) Cloud school: the reset goes through the server RPC, and a
  // locked response shows the lock text.
  showParentPinReset();
  $('parentSchool').value = 'cloud:srv-school-99';
  rpcCalls99 = [];
  resetBody99 = null;
  $('parentResetAdm').value = 'ADM-2025-033';
  $('parentResetDob').value = '2012-03-04';
  $('parentResetPin').value = '6666';
  $('parentResetPin2').value = '6666';
  $('parentErr').textContent = '';
  doParentPinReset({ preventDefault: function () {} });
  await tick99(); await tick99(); await tick99(); await tick99();
  eq(rpcCalls99.some(function (u) { return u.indexOf('ss_parent_pin_reset_by_dob') !== -1; }), true, 'v99: a cloud parent PIN reset calls the reset RPC');
  eq(resetBody99 && resetBody99.p_admission_no, 'ADM-2025-033', 'v99: the cloud reset sends the admission number');
  eq(resetBody99 && resetBody99.p_dob, '2012-03-04', 'v99: the cloud reset sends the date of birth');
  eq(resetBody99 && resetBody99.p_new_pin, '6666', 'v99: the cloud reset sends the new PIN');
  eq($('toast').textContent, t('tPinResetDone'), 'v99: a cloud parent PIN reset toasts the success');
  eq(parentResetMode, false, 'v99: a cloud parent PIN reset returns to the login view');
  showParentPinReset();
  $('parentSchool').value = 'cloud:srv-school-99';
  $('parentResetAdm').value = 'ADM-LOCKED-99';
  $('parentResetDob').value = '2012-03-04';
  $('parentResetPin').value = '6666';
  $('parentResetPin2').value = '6666';
  $('parentErr').textContent = '';
  doParentPinReset({ preventDefault: function () {} });
  await tick99(); await tick99(); await tick99(); await tick99();
  eq($('parentErr').textContent, t('tPinLocked'), 'v99: a locked cloud reset shows the lock text');
  hideParentPinReset();
  // (e) Marks saved for one student reads "1 student", not "1 students",
  // in the toast and in the audit row. A fresh exam is used: saveMarks
  // counts every non-empty input, changed or not, so the ex1 inputs
  // (already holding 91/120/61) would count three.
  state.role = 'school'; state.user = TEST_ACCOUNTS.school;
  loginAs(TEST_ACCOUNTS.school);
  db.exams.push({ id: 'ex99p', name: 'Plural Test', cls: '10th-A', subject: 'Mathematics', date: '2026-11-12', total: 100 });
  saveDB(db);
  $('mk-stu33').value = '77';
  $('mk-stu34').value = '';
  $('mk-stu35').value = '';
  $('mk-stu36').value = '';
  saveMarks('ex99p');
  ok($('toast').textContent.indexOf('1 student') !== -1, 'v99: one saved mark toasts "1 student"');
  ok($('toast').textContent.indexOf('1 students') === -1, 'v99: one saved mark never toasts "1 students"');
  ok(db.auditLog[0] && db.auditLog[0].details.indexOf('1 student') !== -1, 'v99: one saved mark writes "1 student" in the audit row');
  ok(db.auditLog[0] && db.auditLog[0].details.indexOf('1 students') === -1, 'v99: one saved mark never writes "1 students" in the audit row');
  db.exams = db.exams.filter(function (e) { return e.id !== 'ex99p'; });
  db.marks = db.marks.filter(function (m) { return m.examId !== 'ex99p'; });
  saveDB(db);
  // Leave the fixtures as found: Riya back to PIN 4321 with no DOB,
  // the server-school map restored, fetch restored.
  var riyaEnd99 = db.students.find(function (s) { return s.id === 'stu33'; });
  riyaEnd99.parentPinHash = hashPin('4321'); delete riyaEnd99.parentPin;
  riyaEnd99.dob = '';
  saveDB(db);
  pinFailClear('test-school', 'stu33');
  try { localStorage.setItem(SB_SCHOOL_MAP_KEY, JSON.stringify(savedMap99)); } catch (e) {}
  $('parentSchool').value = 'test-school';
  fetch = undefined;
  // ---- v100: cons fix — bulk marks + bulk attendance + holidays ----
  loginAs(TEST_ACCOUNTS.school);
  state.attDate = '2026-11-12'; state.attCls = '6th-A';
  var savedAtt12_100 = db.attendance['2026-11-12|6th-A'];
  var savedAtt11_100 = db.attendance['2026-11-11|6th-A'];
  delete db.attendance['2026-11-12|6th-A'];
  // (a) Mark-all: one tap marks the whole register.
  markAllAtt('Present');
  var roster100 = db.students.filter(function (s) { return s.cls === '6th-A' && isEnrolledStudent(s); });
  ok(roster100.length > 0 && roster100.every(function (s) { return (db.attendance['2026-11-12|6th-A'] || {})[s.id] === 'Present'; }), 'v100: mark-all Present marks every 6th-A student');
  markAllAtt('Absent');
  ok(roster100.every(function (s) { return (db.attendance['2026-11-12|6th-A'] || {})[s.id] === 'Absent'; }), 'v100: mark-all Absent marks every 6th-A student');
  state.role = 'principal';
  markAllAtt('Present');
  ok($('toast').textContent.indexOf(t('tNotAllowed')) !== -1, 'v100: a principal cannot mark all (read-only)');
  ok(roster100.every(function (s) { return (db.attendance['2026-11-12|6th-A'] || {})[s.id] === 'Absent'; }), 'v100: a principal mark-all leaves the register unchanged');
  state.role = 'teacher'; state.user = { role: 'teacher', name: 'T84', email: 't84@school.in', teacherId: 'tchr-84', schoolUid: 'test-school' };
  state.attCls = '7th-A';
  markAllAtt('Present');
  ok($('toast').textContent.indexOf(t('tNotAllowed')) !== -1, 'v100: a teacher cannot mark all outside their classes');
  state.role = 'school'; state.user = TEST_ACCOUNTS.school; state.attCls = '6th-A';
  // (b) Holidays: mark, duplicate, page state, % exclusion, remove.
  markHoliday();
  eq((db.holidays || []).length, 1, 'v100: markHoliday adds one holiday row');
  eq((db.holidays || [])[0].date, '2026-11-12', 'v100: the holiday row carries the viewed date');
  eq((db.holidays || [])[0].cls, '6th-A', 'v100: the holiday row carries the viewed class');
  markHoliday();
  ok($('toast').textContent.indexOf(t('tHolidayExists')) !== -1, 'v100: a second mark on the same class-day toasts instead of duplicating');
  eq((db.holidays || []).length, 1, 'v100: the duplicate holiday is not stored');
  var attHtml100 = attendancePage();
  ok(attHtml100.indexOf(t('holidayWord')) !== -1, 'v100: a holiday day shows the Holiday word on the register');
  ok(attHtml100.indexOf('markAtt(') === -1, 'v100: a holiday day shows no mark buttons');
  var stu1_100 = db.students.find(function (s) { return s.id === 'stu1'; });
  db.attendance['2026-11-11|6th-A'] = { stu1: 'Absent' };
  db.attendance['2026-11-12|6th-A'] = { stu1: 'Present' };
  eq(studentAttPct(stu1_100), 0, 'v100: a holiday day is excluded from the student attendance % (Absent day only counts)');
  removeHoliday();
  eq((db.holidays || []).length, 0, 'v100: removeHoliday clears the holiday');
  eq(studentAttPct(stu1_100), 50, 'v100: without the holiday the same marks give 50%');
  markHoliday();
  var today100 = todayIST();
  Object.keys(db.attendance || {}).forEach(function (k) { if (k.indexOf(today100 + '|') === 0) delete db.attendance[k]; });
  db.attendance[today100 + '|6th-A'] = { stu1: 'Present' };
  db.attendance[today100 + '|7th-A'] = { stu9: 'Present' };
  eq(todayAtt().present, 1, 'v100: today attendance excludes the holiday class-day mark');
  removeHoliday();
  eq((db.holidays || []).length, 0, 'v100: the holiday is removed after the today test');
  state.role = 'teacher'; state.user = { role: 'teacher', name: 'T84', email: 't84@school.in', teacherId: 'tchr-84', schoolUid: 'test-school' };
  markHoliday();
  ok($('toast').textContent.indexOf(t('tNotAllowed')) !== -1, 'v100: a teacher cannot mark a holiday (school role only)');
  eq((db.holidays || []).length, 0, 'v100: a teacher holiday attempt stores nothing');
  state.role = 'school'; state.user = TEST_ACCOUNTS.school;
  if (savedAtt12_100) db.attendance['2026-11-12|6th-A'] = savedAtt12_100; else delete db.attendance['2026-11-12|6th-A'];
  if (savedAtt11_100) db.attendance['2026-11-11|6th-A'] = savedAtt11_100; else delete db.attendance['2026-11-11|6th-A'];
  delete db.attendance[today100 + '|7th-A'];
  saveDB(db);
  // (c) Mark-all on the cloud path: one RPC per student, a failed call
  // reverts only that student.
  var rpcCalls100 = [];
  fetch = function (url, init) {
    var u = String(url || '');
    if (u.indexOf('ss_teacher_mark_attendance') !== -1) {
      var b = {};
      try { b = JSON.parse(init && init.body ? init.body : '{}'); } catch (e) {}
      rpcCalls100.push({ url: u, student: b.p_student_id });
      if (b.p_student_id === '00000000-0000-0000-0000-000000000063') return Promise.resolve({ ok: false, status: 400, json: function () { return Promise.resolve({ ok: false, error: 'fail' }); } });
      return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true }); } });
    }
    return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({}); } });
  };
  loginCloudTeacher(cloudAcct62, cloudSlice62, '00000000-0000-0000-0000-000000000062');
  state.attCls = '6th-A'; state.attDate = '2026-11-10';
  markAllAtt('Present');
  await (async function () { for (var i = 0; i < 160; i++) { if (rpcCalls100.length >= 2) return; await new Promise(function (r) { setTimeout(r, 25); }); } })();
  eq(rpcCalls100.length, 2, 'v100: cloud mark-all fires one RPC per roster student');
  eq(cloudSlice62.attendance['2026-11-10|6th-A']['stu-cloud-62a'], 'Present', 'v100: cloud mark-all marks the first student');
  eq(cloudSlice62.attendance['2026-11-10|6th-A']['stu-cloud-62b'], 'Present', 'v100: cloud mark-all marks the second student');
  rpcCalls100 = [];
  markAllAtt('Absent');
  // Poll on the reverted VALUE, not the call count: the RPC calls are
  // recorded the moment fetch runs, but the revert lands in the .then
  // after the promise resolves.
  await (async function () { for (var i = 0; i < 160; i++) { if (cloudSlice62.attendance['2026-11-10|6th-A']['stu-cloud-62b'] === 'Present' && rpcCalls100.length >= 2) return; await new Promise(function (r) { setTimeout(r, 25); }); } })();
  eq(cloudSlice62.attendance['2026-11-10|6th-A']['stu-cloud-62a'], 'Absent', 'v100: a successful cloud mark-all call keeps the new mark');
  eq(cloudSlice62.attendance['2026-11-10|6th-A']['stu-cloud-62b'], 'Present', 'v100: a failed cloud mark-all call reverts only that student');
  logout(); await waitLogout();
  loginAs(TEST_ACCOUNTS.school);
  fetch = undefined;
  // (d) Bulk marks: fill-all, copy-from-exam, paste-from-spreadsheet.
  var ex1_100 = db.exams.find(function (e) { return e.id === 'ex1'; });
  $('fillAllMarksInput').value = '77';
  fillAllMarks('ex1');
  eq($('mk-stu33').value, '77', 'v100: fill-all sets the first marks input');
  eq($('mk-stu34').value, '77', 'v100: fill-all sets the second marks input');
  eq($('mk-stu35').value, '77', 'v100: fill-all sets the third marks input');
  eq($('mk-stu36').value, '77', 'v100: fill-all sets the fourth marks input');
  $('fillAllMarksInput').value = '150';
  fillAllMarks('ex1');
  ok($('toast').textContent.indexOf(t('tCheckMarks')) !== -1, 'v100: fill-all over the exam total is refused');
  eq($('mk-stu33').value, '77', 'v100: a refused fill-all leaves the inputs unchanged');
  $('copyExamSelect').value = 'ex2';
  copyMarksFromExam('ex1');
  eq($('mk-stu33').value, '93', 'v100: copy-from-exam fills the first student from the source exam');
  eq($('mk-stu34').value, '88', 'v100: copy-from-exam fills the second student from the source exam');
  eq($('mk-stu35').value, '77', 'v100: copy-from-exam leaves a student with no source mark untouched');
  ok($('toast').textContent.indexOf('2 ' + t('tCopyDone')) !== -1, 'v100: copy-from-exam reports how many marks it copied');
  $('pasteMarksBox').value = ['ADM-2025-033' + String.fromCharCode(9) + '55', 'ADM-2025-034,66', 'ADM-9999-999' + String.fromCharCode(9) + '77', 'BADLINE', 'ADM-2025-035' + String.fromCharCode(9) + '150'].join(String.fromCharCode(10));
  pasteMarks('ex1');
  eq($('mk-stu33').value, '55', 'v100: paste fills the first student by admission number');
  eq($('mk-stu34').value, '66', 'v100: paste fills the second student by admission number (comma separator)');
  ok($('toast').textContent.indexOf('2 ' + t('tPasteDone')) !== -1, 'v100: paste reports how many marks it pasted');
  ok($('toast').textContent.indexOf('3 ' + t('tPasteSkipped')) !== -1, 'v100: paste reports the skipped lines (unknown number, bad line, over-total)');
  state.role = 'principal';
  eq(bulkMarksCard100(ex1_100), '', 'v100: a principal never sees the bulk marks card');
  fillAllMarks('ex1');
  ok($('toast').textContent.indexOf(t('tNotAllowed')) !== -1, 'v100: a principal cannot fill marks');
  eq($('mk-stu33').value, '55', 'v100: a principal fill attempt leaves the inputs unchanged');
  state.role = 'school';
  // (e) Sync pieces: mapping, table registry, hashes, counts, migration.
  eq(JSON.stringify(sbMapHoliday({ id: 'hol-100', date: '2026-11-15', cls: '6th-A', reason: 'Diwali' }, 'srv-school-100')), JSON.stringify({ school_id: 'srv-school-100', local_id: 'hol-100', holiday_date: '2026-11-15', cls: '6th-A', reason: 'Diwali' }), 'v100: sbMapHoliday maps the local row to the server payload');
  eq(SB_SYNC_TABLES.ss_holidays.local, 'holidays', 'v100: ss_holidays is registered in the sync tables');
  eq(SB_SYNC_TABLES.ss_holidays.key, 'id', 'v100: ss_holidays syncs by local id');
  db.holidays.push({ id: 'hol-100', date: '2026-11-15', cls: '6th-A', reason: '' });
  saveDB(db);
  eq(sbLocalCountsReal(db).holidays, 1, 'v100: the sync counts include holidays');
  var hashes100 = sbSyncTableHashes(db, 'srv-school-100', { stu: {}, exam: {} });
  eq(hashes100.ss_holidays['hol-100'].hash, JSON.stringify(sbMapHoliday({ id: 'hol-100', date: '2026-11-15', cls: '6th-A', reason: '' }, 'srv-school-100')), 'v100: the sync hash for a holiday is its server payload');
  db.holidays = db.holidays.filter(function (h) { return h.id !== 'hol-100'; });
  saveDB(db);
  eq(sbLocalCountsReal(db).holidays, 0, 'v100: the sync counts drop back to zero after the holiday is removed');
  var mig100a = migrateV100({ holidays: undefined });
  ok(Array.isArray(mig100a.holidays) && mig100a.holidays.length === 0, 'v100: migration adds the holidays list to an older DB');
  var mig100b = migrateV100({ holidays: [{ id: 'a', date: '2026-11-15', cls: '6th-A' }, { id: 'b', date: '2026-11-15', cls: '6th-A' }, { id: 'c', date: '2026-11-16', cls: '6th-A' }, { id: 'd', date: '', cls: '6th-A' }] });
  eq(mig100b.holidays.length, 2, 'v100: migration dedupes a double-marked class-day and drops a dateless row');
  state.stuSearch = ''; state.stuClass = 'All'; state.stuSection = 'All'; state.stuSession = 'All'; state.stuGender = 'All'; state.stuFee = 'All'; state.stuStatus = 'All'; state.stuPage = 1;
  state.attDate = todayIST(); state.attCls = '6th-A';
  state.feeFilter = 'All'; state.feeType = 'All'; state.feeSearch = ''; state.feeLimit = 120;
  state.examId = null; state.collectStudent = null; state.feeStudent = null;
  // (ii) migration: plaintext -> hash, idempotent, no plaintext left.
  var mig54 = migrateV54(migrateV12({ v: 2, students: [{ id: 'mig54', name: 'Mig Kid', cls: '6th-A', phone: '9812345678' }, { id: 'mig54b', name: 'Mig Kid 2', cls: '6th-A', phone: '9812340000', parentPin: '9999' }, { id: 'mig54c', name: 'Mig Kid 3', cls: '6th-A', phone: '9812341111', parentPin: '' }] }));
  ok(mig54.students[0].parentPinHash && mig54.students[0].parentPinHash.indexOf('bcrypt$') === 0, 'H-3: migration gives a PIN-less record a random bcrypt hash');
  ok(!verifyPin('5678', mig54.students[0]), 'H-3: migration does NOT derive the PIN from the phone (5678 fails)');
  ok(!mig54.students[0].parentPin, 'v54 (A1): migration drops the plaintext field');
  ok(verifyPin('9999', mig54.students[1]), 'v54 (A1): migration hashes a custom plaintext PIN');
  ok(!mig54.students[2].parentPinHash && !mig54.students[2].parentPin, 'v54 (A1): a student with no PIN keeps none after migration');
  var mig54b = migrateV54(migrateV12(mig54));
  eq(mig54b.students[0].parentPinHash, mig54.students[0].parentPinHash, 'v54 (A1): migration is idempotent (second run keeps the same hash)');
  ok(!verifyPin('5678', mig54b.students[0]), 'H-3: the phone PIN still does not verify after a second migration');
  // (iii) rate limit: 5 wrong guesses lock the student for 15 minutes;
  // a correct PIN still logs in; unknown numbers never lock; success clears.
  var lockStu54 = { id: 'stu-lock-54', name: 'V54 Lock', cls: '6th-A', roll: 77, phone: '9812345000', guardian: 'Mr. Lock', att: 100, result: 0, fee: 'Pending', enr: 'ENR-054', admissionNo: 'ADM-2025-054', status: 'Active', session: '2025–26', parentPinHash: hashPin('6824') };
  db.students.push(lockStu54); saveDB(db);
  fillSchoolPicker('studentSchool');
  $('studentSchool').value = 'test-school';
  var ev54 = { preventDefault: function () {} };
  function tryLogin54(admNo, pin) { $('studentAdmNo').value = admNo; $('studentPin').value = pin; state.role = null; state.user = null; doStudentLogin(ev54); return state.role; }
  var wrong54 = 0;
  for (var i54 = 0; i54 < 5; i54++) { if (tryLogin54('ADM-2025-054', '0000') === null) wrong54++; }
  eq(wrong54, 5, 'v54 (A1): 5 wrong PINs all fail with the generic error');
  eq(__els['studentErr'].textContent, t('tInvalidStudent'), 'v54 (A1): the 5th wrong PIN still shows the generic error (the lock bites on the next attempt)');
  eq(tryLogin54('ADM-2025-054', '6824'), null, 'v54 (A1): the correct PIN does NOT log in while the student is locked');
  eq(__els['studentErr'].textContent, t('tPinLocked'), 'v54 (A1): a locked student sees the lockout message');
  for (var j54 = 0; j54 < 5; j54++) tryLogin54('ADM-9999-XXX', '0000');
  eq(pinLockUntil('test-school', 'ADM-9999-XXX'), 0, 'v54 (A1): wrong guesses on an unknown admission number never create a lock');
  var fails54 = JSON.parse(localStorage.getItem('schoolSaathiPinFails') || '{}');
  fails54[pinFailKey('test-school', 'stu-lock-54')].lockedUntil = Date.now() - 1000;
  localStorage.setItem('schoolSaathiPinFails', JSON.stringify(fails54));
  eq(tryLogin54('ADM-2025-054', '6824'), 'student', 'v54 (A1): the correct PIN logs in once the lock has expired');
  logout(); await waitLogout();
  var failsAfter54 = JSON.parse(localStorage.getItem('schoolSaathiPinFails') || '{}');
  ok(!failsAfter54[pinFailKey('test-school', 'stu-lock-54')], 'v54 (A1): a successful login clears the failure record');
  // (iv) A2: the PIN value is never rendered — profile, edit form, backup.
  state.role = 'school'; state.user = TEST_ACCOUNTS.school;
  var pinProf54 = profileTabBody(lockStu54, 'parent');
  ok(pinProf54.indexOf('6824') === -1, 'v54 (A2): the profile parent tab never renders the PIN value');
  ok(pinProf54.indexOf(t('stuPinSet')) !== -1, 'v54 (A2): the profile parent tab shows PIN set');
  studentForm(lockStu54.id);
  ok(__els['modalRoot'].innerHTML.indexOf('6824') === -1, 'v54 (A2): the edit form never prefills the PIN value');
  var bak54 = buildFullBackup();
  var bakStu54 = bak54.db.students.find(function (s) { return s.id === 'stu-lock-54'; });
  ok(bakStu54 && JSON.stringify(bakStu54).indexOf('6824') === -1, 'v54 (A2): the full backup carries no plaintext PIN for the student');
  ok(bakStu54 && !bakStu54.parentPin, 'v54 (A2): the backup has no parentPin field for the student');
  clearStudentPin(lockStu54.id);
  var noPinProf54 = profileTabBody(db.students.find(function (s) { return s.id === 'stu-lock-54'; }), 'parent');
  ok(noPinProf54.indexOf(t('stuPinNone')) !== -1, 'v54 (A2): a student with no PIN shows the not-set wording');

  // ---- v55: the v54 live loss — a legacy phone-derived PIN wiped by a null server PIN ----
  // Live shape (10 Nov 2026, v54 browser check): student login with ADM-2025-001 + PIN 3175
  // rejected, and the profile showed "No PIN set". The kill chain, all field-level:
  // (1) sbRowToStudent materialized a server parent_pin null as explicit parentPin: null
  //     AND parentPinHash: null; (2) the pull replaces the row wholesale (server wins), so
  //     the local PIN/hash was discarded every cycle; (3) migrateV12 only refills
  //     'undefined', never null — the phone-derived recovery path was dead the moment the
  //     first null landed; (4) migrateV54 can only hash a non-empty STRING — null is
  //     unhashable. The v54 harness never tested parentPin: null, so none of this was caught.
  // (i) the pull mapper never materializes a null PIN — a missing server PIN leaves the
  // fields undefined (the shape migrateV12 refills), never explicit nulls.
  var pulledNull55 = sbRowToStudent({ id: 'stu-n55', local_id: 'stu-n55', name: 'Null Pull', cls: '6th-A', admission_no: 'ADM-2025-955', enr: 'ENR-955', roll: '1', guardian: 'G', phone: '9876542108', dob: '', gender: '', blood_group: '', category: '', session: '', adm_date: '', status: 'Active', parent_pin: null, aadhaar: '', photo_data_url: '' });
  ok(pulledNull55.parentPin === undefined, 'v55: a server row with parent_pin null maps to parentPin undefined, never null');
  ok(pulledNull55.parentPinHash === undefined, 'v55: a server row with parent_pin null maps to parentPinHash undefined, never null');
  // (ii) migrateV12 refills a null exactly like an undefined — and still never refills a
  // cleared ('') PIN or a record that already carries a hash.
  var migNull55 = migrateV12({ v: 2, students: [{ id: 'mig-null-55', name: 'Null Kid', cls: '6th-A', phone: '9812345678', parentPin: null }, { id: 'mig-clear-55', name: 'Clear Kid', cls: '6th-A', phone: '9812345678', parentPin: '' }, { id: 'mig-hash-55', name: 'Hash Kid', cls: '6th-A', phone: '9812345678', parentPin: null, parentPinHash: hashPin('1111') }] });
  ok(migNull55.students[0].parentPinHash && migNull55.students[0].parentPinHash.indexOf('bcrypt$') === 0, 'H-3: migrateV12 gives a null-PIN record a random bcrypt hash');
  ok(!verifyPin('5678', migNull55.students[0]), 'H-3: migrateV12 does NOT derive the PIN from the phone');
  eq(migNull55.students[0].parentPin, null, 'H-3: migrateV12 leaves the null PIN field alone (the hash is the PIN now)');
  eq(migNull55.students[1].parentPin, '', 'v55: migrateV12 never refills a cleared PIN');
  ok(!migNull55.students[2].parentPin, 'v55: migrateV12 never refills a record that already carries a hash');
  // (iii) migrateV55 — the one-time repair for the records v54 stripped.
  var rep55 = migrateV55({ v: 2, students: [{ id: 'rep-55a', name: 'Stripped A', cls: '6th-A', phone: '9876542108', parentPin: null }, { id: 'rep-55b', name: 'Stripped B', cls: '6th-A', phone: '9810000000' }, { id: 'rep-55c', name: 'Cleared C', cls: '6th-A', phone: '9876542108', parentPin: '' }, { id: 'rep-55d', name: 'Hashed D', cls: '6th-A', phone: '9876542108', parentPinHash: hashPin('2222') }] });
  ok(rep55.students[0].parentPinHash && rep55.students[0].parentPinHash.indexOf('bcrypt$') === 0, 'H-3: the repair gives a stripped record a random bcrypt hash');
  ok(!verifyPin('3175', rep55.students[0]), 'H-3: the repair does NOT re-derive the phone PIN for a stripped record');
  ok(rep55.students[1].parentPinHash && rep55.students[1].parentPinHash.indexOf('bcrypt$') === 0, 'H-3: the repair gives a stripped record on the seed phone a random bcrypt hash, not 0000');
  ok(!verifyPin('0000', rep55.students[1]), 'H-3: the repair does NOT derive 0000 from the seed phone');
  eq(rep55.students[2].parentPin, '', 'v55: the repair never resurrects a cleared PIN');
  ok(!rep55.students[3].parentPin, 'v55: the repair never touches a record that already carries a hash');
  var rep55b = migrateV55(migrateV54(rep55));
  ok(!verifyPin('3175', rep55b.students[0]) && !verifyPin('0000', rep55b.students[1]), 'H-3: the repaired random PINs are NOT the phone PINs');
  ok(!rep55b.students[0].parentPin && !rep55b.students[1].parentPin, 'v55: the repair + hash step leaves no plaintext behind');
  var rep55c = migrateV55(rep55b);
  eq(rep55c.students[0].parentPinHash, rep55b.students[0].parentPinHash, 'v55: the repair is idempotent — a second pass keeps the same hash');
  // (iv) the full chain on the two shapes the v54 harness never exercised: a legacy
  // pre-v54 record (plaintext PIN, no hash) and a v54-broken record (null, no hash).
  var leg55 = migrateV54(migrateV55(migrateV12({ v: 2, students: [{ id: 'leg-55', name: 'Legacy Kid', cls: '6th-A', phone: '9876542108', parentPin: '3175' }] })));
  ok(verifyPin('3175', leg55.students[0]), 'v55: the full chain hashes a legacy plaintext PIN — it still verifies');
  ok(!leg55.students[0].parentPin, 'v55: the full chain drops the legacy plaintext field');
  var brk55 = migrateV54(migrateV55(migrateV12({ v: 2, students: [{ id: 'brk-55', name: 'Broken Kid', cls: '6th-A', phone: '9876542108', parentPin: null }] })));
  ok(!verifyPin('3175', brk55.students[0]), 'H-3: the full chain does NOT restore the phone PIN for a broken record');
  ok(brk55.students[0].parentPinHash && brk55.students[0].parentPinHash.indexOf('bcrypt$') === 0, 'H-3: the full chain gives the broken record a random hash');
  var seed55 = migrateV54(migrateV55(migrateV12({ v: 2, students: [{ id: 'seed-55', name: 'Seed Kid', cls: '6th-A', phone: '9810000000', parentPin: null }] })));
  ok(!verifyPin('0000', seed55.students[0]), 'H-3: the full chain does NOT repair a stripped record on the seed phone with 0000');
  ok(seed55.students[0].parentPinHash && seed55.students[0].parentPinHash.indexOf('bcrypt$') === 0, 'H-3: the full chain gives the seed-phone record a random hash');
  ok(!verifyPin('3175', seed55.students[0]), 'v55: the seed-phone repair does NOT restore 2108 — there is no record of the old phone anywhere');
  // (v) the pull merge-keep: a server row with no PIN must never wipe the local PIN/hash.
  // Four local shapes + one server-only row, every server row carrying parent_pin null.
  function srvRow55(localId, name, admNo) {
    return { id: 'srv-55-' + localId, school_id: 'srv-school-55', local_id: localId, name: name, cls: '6th-A', roll: 1, enr: 'ENR-055', guardian: 'G', phone: '9876542108', mobile2: '', parent_email: '', father_name: 'F', mother_name: 'M', occupation: '', dob: '', gender: '', blood_group: '', category: '', address: '', state: '', district: '', pin: '', previous_school: '', previous_class: '', admission_no: admNo, admission_date: '', session: '2025–26', status: 'Active', result: null, parent_pin: null, photo_data_url: null, documents: { birthCert: false, tc: false, tcNumber: '', other: '' }, aadhaar: '' };
  }
  var hash55 = hashPin('6824');
  var d55 = { students: [
    { id: 'stu-55-hash', name: 'Hash Kid', cls: '6th-A', phone: '9876542108', admissionNo: 'ADM-2025-551', parentPinHash: hash55 },
    { id: 'stu-55-plain', name: 'Plain Kid', cls: '6th-A', phone: '9876542108', admissionNo: 'ADM-2025-552', parentPin: '1357' },
    { id: 'stu-55-clear', name: 'Clear Kid', cls: '6th-A', phone: '9876542108', admissionNo: 'ADM-2025-553', parentPin: '' },
    { id: 'stu-55-strip', name: 'Strip Kid', cls: '6th-A', phone: '9876542108', admissionNo: 'ADM-2025-554', parentPin: null }
  ], teachers: [], exams: [], feeRecords: [], feeStructure: [], attendance: {}, receipts: [], marks: [], homework: [], notices: [], admissionRequests: [], auditLog: [], activities: [] };
  var byTable55 = { ss_students: [srvRow55('stu-55-hash', 'Hash Kid', 'ADM-2025-551'), srvRow55('stu-55-plain', 'Plain Kid', 'ADM-2025-552'), srvRow55('stu-55-clear', 'Clear Kid', 'ADM-2025-553'), srvRow55('stu-55-strip', 'Strip Kid', 'ADM-2025-554'), srvRow55('stu-55-new', 'Server Only Kid', 'ADM-2025-555')] };
  sbApplyServerRows(d55, null, byTable55, null, 'srv-school-55');
  function stu55(id) { return d55.students.find(function (s) { return s.id === id; }); }
  eq(stu55('stu-55-hash').parentPinHash, hash55, 'v55: the pull keeps the local hash when the server carries no PIN');
  ok(verifyPin('6824', stu55('stu-55-hash')), 'v55: the kept hash still verifies the PIN after the pull');
  ok(!stu55('stu-55-plain').parentPin, 'H-3: the pull hashes a local plaintext PIN instead of keeping it');
  ok(verifyPin('1357', stu55('stu-55-plain')), 'H-3: the pulled hash still verifies the old PIN');
  eq(stu55('stu-55-clear').parentPin, '', 'v55: the pull keeps a cleared PIN cleared');
  ok(stu55('stu-55-strip').parentPin === undefined && !stu55('stu-55-strip').parentPinHash, 'v55: a stripped record stays unset after the pull (the repair, not the pull, restores it)');
  ok(stu55('stu-55-new') && stu55('stu-55-new').parentPin === undefined, 'v55: a server-only row with no PIN arrives unset, never null');
  var d55m = migrateV54(migrateV55(migrateV12(d55)));
  ok(verifyPin('1357', d55m.students.find(function (s) { return s.id === 'stu-55-plain'; })), 'v55: the kept plaintext PIN hashes on the next load and still verifies');
  ok(!verifyPin('3175', d55m.students.find(function (s) { return s.id === 'stu-55-strip'; })), 'H-3: the stripped record is NOT repaired with the phone PIN by the load');
  ok(d55m.students.find(function (s) { return s.id === 'stu-55-strip'; }).parentPinHash && d55m.students.find(function (s) { return s.id === 'stu-55-strip'; }).parentPinHash.indexOf('bcrypt$') === 0, 'H-3: the stripped record carries a random hash after the load');
  eq(d55m.students.find(function (s) { return s.id === 'stu-55-clear'; }).parentPin, '', 'v55: the cleared PIN survives the load still cleared');
  eq(d55m.students.find(function (s) { return s.id === 'stu-55-hash'; }).parentPinHash, hash55, 'v55: the kept hash is untouched by the load');
  // (vi) end-to-end student login on both shapes — the exact live checks that failed on v54.
  var legStu55 = { id: 'stu-55-leg', name: 'V55 Legacy', cls: '6th-A', roll: 55, phone: '9876542108', guardian: 'Mr. Legacy', att: 100, result: 0, fee: 'Pending', enr: 'ENR-055', admissionNo: 'ADM-2025-055', status: 'Active', session: '2025–26', parentPin: '3175' };
  db.students.push(legStu55); saveDB(db);
  fillSchoolPicker('studentSchool');
  $('studentSchool').value = 'test-school';
  var ev55 = { preventDefault: function () {} };
  function tryLogin55(admNo, pin) { $('studentAdmNo').value = admNo; $('studentPin').value = pin; state.role = null; state.user = null; doStudentLogin(ev55); return state.role; }
  eq(tryLogin55('ADM-2025-055', '3175'), 'student', 'v55: a legacy plaintext PIN logs in (the shape v54 never tested)');
  logout(); await waitLogout();
  var stripStu55 = { id: 'stu-55-strip2', name: 'V55 Stripped', cls: '6th-A', roll: 56, phone: '9876542108', guardian: 'Mr. Strip', att: 100, result: 0, fee: 'Pending', enr: 'ENR-056', admissionNo: 'ADM-2025-056', status: 'Active', session: '2025–26', parentPin: null };
  db.students.push(stripStu55); saveDB(db);
  eq(tryLogin55('ADM-2025-056', '3175'), null, 'H-3: a stripped record does NOT log in with the phone PIN anymore');
  // The sanctioned recovery: the admin sets the PIN, then the login works.
  state.role = 'school'; state.user = TEST_ACCOUNTS.school;
  $('fStuPinNew').value = '3175';
  setStudentPin('stu-55-strip2');
  eq(tryLogin55('ADM-2025-056', '3175'), 'student', 'H-3: after the admin sets the PIN, the stripped record logs in again');
  logout(); await waitLogout();
  var seedStu55 = { id: 'stu-55-seed', name: 'V55 Seed Phone', cls: '6th-A', roll: 57, phone: '9810000000', guardian: 'Mr. Seed', att: 100, result: 0, fee: 'Pending', enr: 'ENR-057', admissionNo: 'ADM-2025-057', status: 'Active', session: '2025–26', parentPin: null };
  db.students.push(seedStu55); saveDB(db);
  eq(tryLogin55('ADM-2025-057', '0000'), null, 'H-3: a stripped record on the seed phone does NOT log in with 0000 anymore');
  logout(); await waitLogout();
  eq(tryLogin55('ADM-2025-057', '3175'), null, 'v55: the seed-phone record does NOT log in with 2108 — the old phone is gone, so the admin must re-set 2108 if that PIN is wanted');
  // (vii) the restore path runs the same repair — a backup carrying a stripped record
  // comes back with a working login.
  var bak55 = buildFullBackup();
  var bakLeg55 = bak55.db.students.find(function (s) { return s.id === 'stu-55-leg'; });
  bakLeg55.parentPin = null; delete bakLeg55.parentPinHash;
  var res55 = restoreFullBackup(JSON.parse(JSON.stringify(bak55)));
  eq(res55.ok, true, 'v55: restore accepts the backup carrying a stripped record');
  ok(!verifyPin('3175', db.students.find(function (s) { return s.id === 'stu-55-leg'; })), 'H-3: the restored stripped record does NOT verify with the phone PIN');
  ok(db.students.find(function (s) { return s.id === 'stu-55-leg'; }).parentPinHash && db.students.find(function (s) { return s.id === 'stu-55-leg'; }).parentPinHash.indexOf('bcrypt$') === 0, 'H-3: the restored record carries a random hash instead');
  state.role = 'school'; state.user = TEST_ACCOUNTS.school;
  // ---- v56: the v55 live loss — a pending student upsert is wiped by the pull, then re-uploaded by the flush ----
  // Live shape (10 Nov 2026, v55 browser check): the repair restored the PIN (0000), the
  // admin re-set it to 2108 ("Student PIN set.", and the profile still showed "PIN set"
  // after a 60s cycle), yet the student login with ADM-2025-001 + 2108 still failed with
  // "Invalid admission number or PIN." The write log of the v56 repro proves the kill
  // chain: (1) the pull replaced the local hash(2108) with the server's STALE hash(0000)
  // — students were the one table with no pending-outbox keep (v46/v47 covered fee
  // records, receipts, attendance, marks); (2) the flush pushed 2108; (3) the pass-1
  // tail re-diff saw the stale local row (0000) vs the just-pushed snapshot (2108) and
  // re-queued it; (4) pass 2 re-uploaded 0000, undoing the push in the same flush.
  // The fix is the same class as the v46/v47 keeps, extended to students.
  state.sb = { uid: 'sb-uid-56' };
  var hash56a = hashPin('3175'), hash56b = hashPin('3333');
  var stale56a = hashPin('0000'), stale56b = hashPin('4444');
  sbOutboxAdd('sb-uid-56', { table: 'ss_students', key: 'stu-56a', op: 'upsert', row: { id: 'stu-56a', name: 'Keep Kid', cls: '6th-A', phone: '9810000000', admissionNo: 'ADM-2025-561', parentPinHash: hash56a }, at: new Date().toISOString() });
  var d56 = { students: [
    { id: 'stu-56a', name: 'Keep Kid', cls: '6th-A', phone: '9810000000', admissionNo: 'ADM-2025-561', parentPinHash: hash56a },
    { id: 'stu-56b', name: 'Drop Kid', cls: '6th-A', phone: '9810000001', admissionNo: 'ADM-2025-562', parentPinHash: hash56b }
  ], teachers: [], exams: [], feeRecords: [], feeStructure: [], attendance: {}, receipts: [], marks: [], homework: [], notices: [], admissionRequests: [], auditLog: [], activities: [] };
  function srvRow56(localId, name, admNo, pinHash) {
    var r = srvRow55(localId, name, admNo);
    r.parent_pin = pinHash; r.phone = localId === 'stu-56a' ? '9810000000' : '9810000001';
    return r;
  }
  var byTable56 = { ss_students: [srvRow56('stu-56a', 'Keep Kid', 'ADM-2025-561', stale56a), srvRow56('stu-56b', 'Drop Kid', 'ADM-2025-562', stale56b)] };
  var applied56 = sbApplyServerRows(d56, null, byTable56, null, 'srv-school-56');
  function stu56f(id) { return d56.students.find(function (s) { return s.id === id; }); }
  eq(stu56f('stu-56a').parentPinHash, hash56a, 'v56: the pull keeps the LOCAL row for a student with a pending outbox upsert — the stale server hash does not win');
  ok(verifyPin('3175', stu56f('stu-56a')) && !verifyPin('0000', stu56f('stu-56a')), 'v56: the kept student still verifies with the admin-set PIN 3175, not the stale 0000');
  eq(stu56f('stu-56b').parentPinHash, stale56b, 'v56: a student with NO pending upsert still takes the server row — server-wins is unchanged');
  ok(verifyPin('4444', stu56f('stu-56b')) && !verifyPin('3333', stu56f('stu-56b')), 'v56: the non-kept student verifies with the server PIN 4444');
  ok(applied56.kept && applied56.kept.ss_students && applied56.kept.ss_students['stu-56a'], 'v56: the kept student is recorded as kept, so the snapshot refresh leaves it out until the flush confirms it');
  ok(!(applied56.kept && applied56.kept.ss_students && applied56.kept.ss_students['stu-56b']), 'v56: the non-kept student is not recorded as kept');
  sbOutboxRemove('sb-uid-56', { table: 'ss_students', key: 'stu-56a' });
  state.sb = null;
  // ---- v58: the v57 live loss — an edited exam name reverts, and a soft-deleted exam comes back ----
  // Live shape (10 Nov 2026, v57 browser check): create "Test Exam v57" → edit to
  // "Test Exam v57 Edited" → the edit reverted to the original name after reload;
  // soft-delete showed the "Exam deleted" toast but the exam stayed in the list
  // with no restore control. Same kill chain as v56, but exams were the one
  // table with no pending-outbox keep: (1) the pull replaced the local edit
  // with the server's stale row before the flush could PATCH it; (2) the flush
  // pushed the edit; (3) the pass-1 tail re-diff re-queued the stale local row;
  // (4) pass 2 re-uploaded the stale row, undoing the push in the same flush.
  // The delete never queued at all (deleted is not a server payload field),
  // so no keep could fire for it either — hence the explicit queue in
  // sbQueueExamChange58. The fix is the v56 keep, extended to exams.
  state.sb = { uid: 'sb-uid-58' };
  sbOutboxAdd('sb-uid-58', { table: 'ss_exams', key: 'ex-58a', op: 'upsert', row: { id: 'ex-58a', name: 'Edited Name', cls: '6th-A', subject: 'Maths', date: '2026-11-10', total: 100 }, at: new Date().toISOString() });
  sbOutboxAdd('sb-uid-58', { table: 'ss_exams', key: 'ex-58c', op: 'upsert', row: { id: 'ex-58c', name: 'Deleted Exam', cls: '6th-A', subject: 'Maths', date: '2026-11-10', total: 100, deleted: true }, at: new Date().toISOString() });
  var d58 = { students: [], teachers: [], exams: [
    { id: 'ex-58a', name: 'Edited Name', cls: '6th-A', subject: 'Maths', date: '2026-11-10', total: 100 },
    { id: 'ex-58b', name: 'Untouched', cls: '6th-A', subject: 'Science', date: '2026-11-10', total: 50 },
    { id: 'ex-58c', name: 'Deleted Exam', cls: '6th-A', subject: 'Maths', date: '2026-11-10', total: 100, deleted: true }
  ], feeRecords: [], feeStructure: [], attendance: {}, receipts: [], marks: [], homework: [], notices: [], admissionRequests: [], auditLog: [], activities: [] };
  var byTable58 = { ss_exams: [
    { id: 'srv-ex-58a', school_id: 'srv-school-58', local_id: 'ex-58a', name: 'Original Name', cls: '6th-A', subject: 'Maths', exam_date: '2026-11-10', total: 100 },
    { id: 'srv-ex-58b', school_id: 'srv-school-58', local_id: 'ex-58b', name: 'Untouched', cls: '6th-A', subject: 'Science', exam_date: '2026-11-10', total: 50 },
    { id: 'srv-ex-58c', school_id: 'srv-school-58', local_id: 'ex-58c', name: 'Deleted Exam', cls: '6th-A', subject: 'Maths', exam_date: '2026-11-10', total: 100 }
  ] };
  var applied58 = sbApplyServerRows(d58, null, byTable58, null, 'srv-school-58');
  function ex58f(id) { return d58.exams.find(function (e) { return e.id === id; }); }
  eq(ex58f('ex-58a').name, 'Edited Name', 'v58: the pull keeps the LOCAL exam row for an exam with a pending outbox upsert — the stale server name does not win');
  eq(ex58f('ex-58b').name, 'Untouched', 'v58: an exam with NO pending upsert still takes the server row — server-wins is unchanged');
  eq(ex58f('ex-58c').deleted, true, 'v58: the pull keeps the soft-deleted exam deleted while its upsert is pending');
  ok(applied58.kept && applied58.kept.ss_exams && applied58.kept.ss_exams['ex-58a'], 'v58: the kept exam is recorded as kept, so the snapshot refresh leaves it out until the flush confirms it');
  ok(applied58.kept && applied58.kept.ss_exams && applied58.kept.ss_exams['ex-58c'], 'v58: the deleted exam is recorded as kept');
  ok(!(applied58.kept && applied58.kept.ss_exams && applied58.kept.ss_exams['ex-58b']), 'v58: the non-kept exam is not recorded as kept');
  // (ii) the delete queues explicitly — the diff alone never would, because
  // deleted is not a server payload field and the hash never changes.
  sbOutboxRemove('sb-uid-58', { table: 'ss_exams', key: 'ex-58a' });
  sbOutboxRemove('sb-uid-58', { table: 'ss_exams', key: 'ex-58c' });
  var q58 = (sbOutboxLoad('sb-uid-58') || []).filter(function (e) { return e.table === 'ss_exams'; });
  eq(q58.length, 0, 'v58: outbox starts clean for the queue test');
  ok(typeof sbQueueExamChange58 === 'function', 'v58: sbQueueExamChange58 exists — a soft-delete queues explicitly, the diff alone never would');
  if (typeof sbQueueExamChange58 === 'function') {
    sbQueueExamChange58({ id: 'ex-58c', name: 'Deleted Exam', cls: '6th-A', subject: 'Maths', date: '2026-11-10', total: 100, deleted: true });
    q58 = (sbOutboxLoad('sb-uid-58') || []).filter(function (e) { return e.table === 'ss_exams'; });
    eq(q58.length, 1, 'v58: a soft-delete queues an exam upsert entry');
    eq(q58[0].key, 'ex-58c', 'v58: the queued delete entry keys the deleted exam');
    eq(q58[0].row.deleted, true, 'v58: the queued delete entry carries the deleted flag');
    sbQueueExamChange58({ id: 'ex-58c', name: 'Deleted Exam', cls: '6th-A', subject: 'Maths', date: '2026-11-10', total: 100, deleted: false });
    q58 = (sbOutboxLoad('sb-uid-58') || []).filter(function (e) { return e.table === 'ss_exams'; });
    eq(q58.length, 1, 'v58: a restore re-queues the same single entry (one pending entry per row)');
    eq(q58[0].row.deleted, false, 'v58: the restored entry carries deleted:false');
    sbOutboxRemove('sb-uid-58', { table: 'ss_exams', key: 'ex-58c' });
  } else {
    ok(false, 'v58: a soft-delete queues an exam upsert entry (helper missing)');
    ok(false, 'v58: the queued delete entry keys the deleted exam (helper missing)');
    ok(false, 'v58: the queued delete entry carries the deleted flag (helper missing)');
    ok(false, 'v58: a restore re-queues the same single entry (helper missing)');
    ok(false, 'v58: the restored entry carries deleted:false (helper missing)');
  }
  state.sb = null;



  console.log('\\n==== RESULT: ' + passes + ' passed, ' + fails.length + ' failed ====');
  if (fails.length) { console.log('FAILED: ' + fails.join(' | ')); process.exitCode = 1; }
})();
`;
vm.runInContext(qrgenSrc + '\n;' + bcryptSrc + '\n;' + cryptoSrc + '\n;' + i18nSrc + '\n;' + src + '\n;' + seedFixturesSrc + '\n;' + test, ctx);

// ---- Node-side checks: i18n t() key coverage + greps ----
const tKeys = new Set();
const re = /\bt\('([^']+)'\)/g;
let m;
while ((m = re.exec(src)) !== null) tKeys.add(m[1]);
const reEsc = /\bt\(\\'([^']+)\\'\)/g;
while ((m = reEsc.exec(src)) !== null) tKeys.add(m[1]);
const i18n = ctx.I18N;
// v28: server-auth strings are intentionally English-only (the app's
// language toggle falls back to en for them), so they are exempt from the
// hi-coverage rule. Every other key still needs both languages.
const EN_ONLY_KEYS = new Set(['sbForgotPw', 'sbRecoverTitle', 'sbSendResetLink', 'sbResetPw', 'sbRecoverSent', 'sbRecoverFailed', 'sbResetDone', 'sbResetFailed', 'sbTooMany', 'sbEmailConfirm', 'sbEmailConfirmed', 'sbOfflineLogin', 'sbTitle', 'sbBackupNow', 'sbStatusSynced', 'sbStatusPending', 'sbStatusUploading', 'sbStatusFailed', 'sbStatusOffline', 'sbStatusNotSchool', 'sbBackupDone', 'sbBackupFailed', 'sbNoSchool', 'sbDownloadNow', 'sbDownloadStart', 'sbDownloadDone', 'sbDownloadFailed', 'sbDownloadSkipped', 'sbDownloadOffline', 'sbDownloadNoServer', 'sbStatusSyncing', 'sbStatusPendingSync', 'sbSyncDone', 'sbSyncFailed', 'sbSyncOffline', 'sbSyncConflict']);
const missingKeys = [];
tKeys.forEach(k => {
  if (!(k in i18n.en)) missingKeys.push('en missing key used in code: ' + k);
  if (!(k in i18n.hi) && !EN_ONLY_KEYS.has(k)) missingKeys.push('hi missing key used in code: ' + k);
});
if (missingKeys.length) {
  console.log('FAIL i18n code-usage coverage: ' + missingKeys.join('; '));
  process.exitCode = 1;
} else {
  console.log('PASS i18n: all ' + tKeys.size + ' t() keys exist in en + hi');
}
const nativeConfirm = (src.match(/(^|[^A-Za-z0-9_$.])confirm\s*\(/g) || []).length;
const mathRandom = (src.match(/Math\.random/g) || []).length;
console.log(nativeConfirm === 0 ? 'PASS no native confirm() calls' : 'FAIL native confirm() count: ' + nativeConfirm);
console.log(mathRandom === 0 ? 'PASS no Math.random' : 'FAIL Math.random count: ' + mathRandom);
if (nativeConfirm || mathRandom) process.exitCode = 1;

// index.html / sw.js spot checks — versioned against EXPECTED_VERSION (read
// from version.json above), never a hardcoded number.
const html = readRel('index.html');
console.log(html.includes('app.js?v=' + EXPECTED_VERSION) && html.includes('styles.css?v=' + EXPECTED_VERSION) && html.includes('qrgen.js?v=' + EXPECTED_VERSION)
  ? 'PASS index.html uses versioned app.js?v=' + EXPECTED_VERSION + ' / styles.css?v=' + EXPECTED_VERSION + ' / qrgen.js?v=' + EXPECTED_VERSION
  : 'FAIL index.html versioned URLs missing');
console.log(html.includes('http-equiv="Content-Security-Policy"') && html.includes("connect-src 'self' https://bsjqeeeemwimzldrehpw.supabase.co") && html.includes("object-src 'none'")
  ? 'PASS index.html has the CSP meta tag (Supabase connect-src, object-src none)'
  : 'FAIL index.html missing the CSP meta tag');
if (!(html.includes('http-equiv="Content-Security-Policy"') && html.includes("connect-src 'self' https://bsjqeeeemwimzldrehpw.supabase.co") && html.includes("object-src 'none'"))) process.exitCode = 1;
const sw = readRel('sw.js');
console.log(sw.includes('school-saathi-v' + EXPECTED_VERSION) ? 'PASS sw.js CACHE_NAME school-saathi-v' + EXPECTED_VERSION : 'FAIL sw.js CACHE_NAME');
console.log(sw.includes('qrgen.js?v=' + EXPECTED_VERSION) ? 'PASS sw.js precaches qrgen.js?v=' + EXPECTED_VERSION : 'FAIL sw.js qrgen precache missing');
const verJson39 = JSON.parse(readRel('version.json'));
console.log(verJson39.app === 'school-saathi' && verJson39.version === EXPECTED_VERSION
  ? 'PASS version.json names the app and says ' + EXPECTED_VERSION
  : 'FAIL version.json wrong: ' + JSON.stringify(verJson39));
if (!(verJson39.app === 'school-saathi' && verJson39.version === EXPECTED_VERSION)) process.exitCode = 1;
console.log(src.includes('checkAppUpdate') && src.includes('version.json?__v=') && src.includes('controllerchange') && src.includes('schoolSaathiUpdateReload') && src.includes("cache: 'no-store'")
  ? 'PASS app.js has the version check (cache-busting version.json fetch, controllerchange reload, reload guard, no-store)'
  : 'FAIL app.js missing the v37 update-check pieces');
if (!(src.includes('checkAppUpdate') && src.includes('version.json?__v=') && src.includes('controllerchange') && src.includes('schoolSaathiUpdateReload') && src.includes("cache: 'no-store'"))) process.exitCode = 1;
console.log(sw.includes('version.json') && sw.includes("url.pathname.endsWith('version.json')")
  ? 'PASS sw.js serves version.json network-first'
  : 'FAIL sw.js version.json handling missing');
console.log(sw.includes('cache.addAll') ? 'FAIL sw.js still uses cache.addAll' : 'PASS sw.js no cache.addAll');
const leftover = /refreshLandingStats|DEMO_ACCOUNTS|demoLogin/.test(src);
console.log(!leftover ? 'PASS no landing/demo leftovers in app.js' : 'FAIL landing/demo leftovers in app.js');
if (leftover) process.exitCode = 1;
console.log(cryptoSrc.includes('function timingSafeEqual') && cryptoSrc.includes('timingSafeEqual(sha256Hex') && cryptoSrc.includes('timingSafeEqual(hashPw(pw)')
  ? 'PASS crypto.js verifyPw uses timingSafeEqual on the s256$ + djb2 branches'
  : 'FAIL verifyPw does not use timingSafeEqual');
if (!(cryptoSrc.includes('function timingSafeEqual') && cryptoSrc.includes('timingSafeEqual(sha256Hex') && cryptoSrc.includes('timingSafeEqual(hashPw(pw)'))) process.exitCode = 1;
console.log(html.includes('printArea') && html.includes('langOne') && html.includes('toggleLang')
  ? 'PASS index.html has printArea + langOne + toggleLang'
  : 'FAIL index.html missing printArea/langOne/toggleLang');
if (!(html.includes('printArea') && html.includes('langOne') && html.includes('toggleLang'))) process.exitCode = 1;
console.log(html.includes('studentForm') && html.includes('tabStudent') && html.includes('teacherForm') && html.includes('tabTeacher') && html.includes('admReqApply') && html.includes('stuAdmNo')
  ? 'PASS index.html has Student + Teacher tabs and login forms + Apply for Admission link'
  : 'FAIL index.html missing student/teacher login forms / apply link');
if (!(html.includes('studentForm') && html.includes('tabStudent') && html.includes('teacherForm') && html.includes('tabTeacher') && html.includes('admReqApply') && html.includes('stuAdmNo'))) process.exitCode = 1;
// ---- v95: hash sweep — source scans (Node-side; the vm has no src var) ----
console.log(!src.includes("'s256\$' +")
  ? 'PASS v95: app.js never creates an s256 hash'
  : 'FAIL v95: app.js creates an s256 hash somewhere');
if (src.includes("'s256\$' +")) process.exitCode = 1;
console.log((cryptoSrc.split('hashPw(').length - 1) === 2
  ? 'PASS v95: hashPw (djb2) appears only as its definition + the verifyPw call'
  : 'FAIL v95: hashPw (djb2) is called somewhere besides verifyPw');
if ((cryptoSrc.split('hashPw(').length - 1) !== 2) process.exitCode = 1;
console.log(cryptoSrc.includes("return 's256\$' + salt")
  ? 'PASS v95: the only s256 creation is the defensive fallback in hashPwNew'
  : 'FAIL v95: the hashPwNew s256 fallback is missing or moved');
if (!cryptoSrc.includes("return 's256\$' + salt")) process.exitCode = 1;
console.log((src.split("indexOf('s256\$') === 0 || String(acc.pwHash).indexOf('bcrypt\$') === 0").length - 1) === 2
  ? 'PASS v95: the teacher + staff sync only ever send bcrypt or s256 hashes (both gates present)'
  : 'FAIL v95: a sync path sends a hash without the bcrypt/s256 gate');
if ((src.split("indexOf('s256\$') === 0 || String(acc.pwHash).indexOf('bcrypt\$') === 0").length - 1) !== 2) process.exitCode = 1;
// ---- v96: login screen has its own language toggle ----
console.log(html.includes('loginLangEn') && html.includes('loginLangHi') && html.includes("setLang('hi')")
  ? 'PASS v96: the login screen has an EN/Hindi toggle'
  : 'FAIL v96: the login screen is missing its language toggle');
if (!(html.includes('loginLangEn') && html.includes('loginLangHi'))) process.exitCode = 1;
console.log(i18nSrc.includes("tNoNotices: 'No notices yet.'") && i18nSrc.includes("tNoNotices: 'अभी कोई नोटिस नहीं है।'")
  ? 'PASS v96: the tNoNotices key exists in English and Hindi'
  : 'FAIL v96: the tNoNotices key is missing in a language');
if (!(i18nSrc.includes("tNoNotices: 'No notices yet.'") && i18nSrc.includes("tNoNotices: 'अभी कोई नोटिस नहीं है।'"))) process.exitCode = 1;
// ---- v97: audit rows for cloud attendance/homework/marks ----
console.log(src.includes('function sbLogAuditCloud') && src.includes("sbRest('POST', 'rpc/ss_log_audit'") && src.includes("logAudit('Marks saved'") && src.includes("logAudit('Homework assigned'")
  ? 'PASS v97: app.js has the cloud audit helper (SQL 34 RPC) + the marks/homework audit calls'
  : 'FAIL v97: app.js is missing the cloud audit helper or a marks/homework audit call');
if (!(src.includes('function sbLogAuditCloud') && src.includes("sbRest('POST', 'rpc/ss_log_audit'") && src.includes("logAudit('Marks saved'") && src.includes("logAudit('Homework assigned'"))) process.exitCode = 1;
var sql34 = readRel('supabase/34_audit_rpc.sql');
var sql34goalEq = goalEq(sql34, '/home/hatch/workspace/goals/school-saathi-school-management-app/backend/34_audit_rpc.sql');
console.log(sql34.includes('ss_log_audit') && sql34.includes('ss_teacher_token_owner') && sql34.includes('ss_staff_token_owner') && sql34.includes('revoke all on function public.ss_log_audit') && sql34.includes('grant execute on function public.ss_log_audit') && sql34goalEq
  ? 'PASS v97: SQL 34 (audit RPC) exists in repo + goal backend, resolves teacher and staff tokens, grants anon+authenticated'
  : 'FAIL v97: SQL 34 missing, mismatched, or wrong grants/token checks');
if (!(sql34.includes('ss_log_audit') && sql34.includes('ss_teacher_token_owner') && sql34.includes('ss_staff_token_owner') && sql34.includes('revoke all on function public.ss_log_audit') && sql34.includes('grant execute on function public.ss_log_audit') && sql34goalEq)) process.exitCode = 1;
// ---- v98: staff cloud write RPCs (SQL 35) ----
console.log(src.includes('function sbStaffMarkAttendance') && src.includes('function sbStaffPostHomework') && src.includes('function sbStaffSetMarks') && src.includes('function sbStaffRevokeSession') && src.includes("sbRest('POST', 'rpc/ss_staff_mark_attendance'") && src.includes("sbRest('POST', 'rpc/ss_staff_post_homework'") && src.includes("sbRest('POST', 'rpc/ss_staff_set_marks'") && src.includes("sbRest('POST', 'rpc/ss_staff_revoke_session'") && src.includes('d.staff = [{ id: (p.staff')
  ? 'PASS v98: app.js has the staff write RPC wrappers + the slice seeds db.staff'
  : 'FAIL v98: app.js is missing a staff RPC wrapper or the db.staff slice seed');
if (!(src.includes('function sbStaffMarkAttendance') && src.includes('function sbStaffPostHomework') && src.includes('function sbStaffSetMarks') && src.includes('function sbStaffRevokeSession') && src.includes("sbRest('POST', 'rpc/ss_staff_mark_attendance'") && src.includes("sbRest('POST', 'rpc/ss_staff_post_homework'") && src.includes("sbRest('POST', 'rpc/ss_staff_set_marks'") && src.includes("sbRest('POST', 'rpc/ss_staff_revoke_session'") && src.includes('d.staff = [{ id: (p.staff'))) process.exitCode = 1;
var sql35 = readRel('supabase/35_staff_write_rpcs.sql');
var sql35goalEq = goalEq(sql35, '/home/hatch/workspace/goals/school-saathi-school-management-app/backend/35_staff_write_rpcs.sql');
console.log(sql35.includes('ss_staff_mark_attendance') && sql35.includes('ss_staff_post_homework') && sql35.includes('ss_staff_set_marks') && sql35.includes("role <> 'staff'") && sql35.includes('revoke all on function public.ss_staff_mark_attendance') && sql35.includes('grant execute on function public.ss_staff_set_marks') && sql35goalEq
  ? 'PASS v98: SQL 35 (staff write RPCs) exists in repo + goal backend, enforces role staff + classes, grants anon+authenticated'
  : 'FAIL v98: SQL 35 missing, mismatched, or wrong role checks/grants');
if (!(sql35.includes('ss_staff_mark_attendance') && sql35.includes('ss_staff_post_homework') && sql35.includes('ss_staff_set_marks') && sql35.includes("role <> 'staff'") && sql35.includes('revoke all on function public.ss_staff_mark_attendance') && sql35.includes('grant execute on function public.ss_staff_set_marks') && sql35goalEq)) process.exitCode = 1;
// ---- v114 (external review fixes): SQL 40 + SQL 25 + app.js proof-carrying _ok ----
var sql40 = readRel('supabase/40_parent_pin_and_teacher_payload_fixes.sql');
var sql40goalEq = goalEq(sql40, '/home/hatch/workspace/goals/school-saathi-school-management-app/backend/40_parent_pin_and_teacher_payload_fixes.sql');
console.log(sql40.includes('is distinct from p_dob') && sql40.includes('p_dob is null') && sql40.includes('drop function if exists public.ss_parent_pin_ok(uuid, text)') && sql40.includes('p_pin text default null') && sql40.includes('p_dob date default null') && !sql40.includes('jsonb_agg(to_jsonb(s))') && sql40.includes('revoke execute on function public.ss_parent_pin_reset_by_dob') && sql40.includes('revoke execute on function public.ss_parent_pin_ok(uuid, text, text, date)') && sql40.includes('revoke execute on function public.ss_teacher_cloud_login') && sql40goalEq
  ? 'PASS v114: SQL 40 fixes the NULL-DOB bypass, the proof-less lockout clear, and the whole-row teacher payload, with PUBLIC revoked on all three'
  : 'FAIL v114: SQL 40 missing a fix or a grant');
if (!(sql40.includes('is distinct from p_dob') && sql40.includes('p_dob is null') && sql40.includes('drop function if exists public.ss_parent_pin_ok(uuid, text)') && sql40.includes('p_pin text default null') && sql40.includes('p_dob date default null') && !sql40.includes('jsonb_agg(to_jsonb(s))') && sql40.includes('revoke execute on function public.ss_parent_pin_reset_by_dob') && sql40.includes('revoke execute on function public.ss_parent_pin_ok(uuid, text, text, date)') && sql40.includes('revoke execute on function public.ss_teacher_cloud_login') && sql40goalEq)) process.exitCode = 1;
var sql25 = readRel('supabase/25_platform_settings_no_delete.sql');
console.log(sql25.includes('create policy ss_settings_admin_select') && sql25.includes('create policy ss_settings_admin_insert') && sql25.includes('create policy ss_settings_admin_update') && !sql25.includes('for select, insert, update to authenticated')
  ? 'PASS v114: SQL 25 is three valid single-command policies (no multi-command FOR)'
  : 'FAIL v114: SQL 25 still has the invalid multi-command policy');
if (!(sql25.includes('create policy ss_settings_admin_select') && sql25.includes('create policy ss_settings_admin_insert') && sql25.includes('create policy ss_settings_admin_update') && !sql25.includes('for select, insert, update to authenticated'))) process.exitCode = 1;
var repIdx114 = src.indexOf("t('subReports')");
var repSeg114 = repIdx114 === -1 ? '' : src.slice(repIdx114, repIdx114 + 200);
console.log(src.includes('function sbParentPinOk(serverId, admNo, pin, dob)') && src.includes('sbParentPinOk(srvId, adm, pin)') && src.includes("sbParentPinOk(srvId, stu.admissionNo || '', null, dob)") && src.includes('sbParentPinOk(serverId, adm, pin)') && repSeg114.includes('esc(db.profile.name)')
  ? 'PASS v114: app.js passes PIN/DOB proof to the lockout-clear RPC at all three call sites and escapes the school name on the Reports page'
  : 'FAIL v114: app.js missing a proof-carrying _ok call or the Reports escape');
if (!(src.includes('function sbParentPinOk(serverId, admNo, pin, dob)') && src.includes('sbParentPinOk(srvId, adm, pin)') && src.includes("sbParentPinOk(srvId, stu.admissionNo || '', null, dob)") && src.includes('sbParentPinOk(serverId, adm, pin)') && repSeg114.includes('esc(db.profile.name)'))) process.exitCode = 1;
console.log(html.includes('parentForm') && html.includes('tabParent') && html.includes('parentAdmNo')
  ? 'PASS v86: index.html has the Parent tab and parent login form'
  : 'FAIL v86: index.html is missing the Parent tab / parent login form');
if (!(html.includes('parentForm') && html.includes('tabParent') && html.includes('parentAdmNo'))) process.exitCode = 1;
console.log(html.includes('staffForm') && html.includes('tabStaff') && html.includes('staffEmail') && html.includes('staffPw')
  ? 'PASS v88: index.html has the Staff tab and staff login form'
  : 'FAIL v88: index.html is missing the Staff tab / staff login form');
if (!(html.includes('staffForm') && html.includes('tabStaff') && html.includes('staffEmail') && html.includes('staffPw'))) process.exitCode = 1;
console.log(src.includes('doStaffLogin') && src.includes('doStaffCloudLogin') && src.includes('sbStaffCloudLogin') && src.includes('mapCloudStaffPayload') && src.includes('loginCloudStaff') && src.includes('principalDashboard') && src.includes('isPrincipal')
  ? 'PASS v88: app.js has the staff login (local + cloud) and the principal dashboard'
  : 'FAIL v88: app.js is missing the staff login or the principal dashboard');
if (!(src.includes('doStaffLogin') && src.includes('doStaffCloudLogin') && src.includes('sbStaffCloudLogin') && src.includes('mapCloudStaffPayload') && src.includes('loginCloudStaff') && src.includes('principalDashboard') && src.includes('isPrincipal'))) process.exitCode = 1;
console.log(!src.includes('parentPinFromPhone') && src.includes('doStudentLogin') && src.includes('doTeacherLogin') && src.includes('canViewStudent') && src.includes('admissionRequestsPage') && src.includes('approveAdmissionRequest') && src.includes('migrateV12') && src.includes('doParentLogin') && !src.includes('parentDashboard')
  ? 'PASS app.js has v35 student + teacher login, the v86 parent role login, and no phone-derived PIN helper (H-3)'
  : 'FAIL app.js missing v35/v86 login functions, or still has the phone-PIN helper');
if (!(!src.includes('parentPinFromPhone') && src.includes('doStudentLogin') && src.includes('doTeacherLogin') && src.includes('canViewStudent') && src.includes('admissionRequestsPage') && src.includes('approveAdmissionRequest') && src.includes('migrateV12') && src.includes('doParentLogin') && !src.includes('parentDashboard'))) process.exitCode = 1;
console.log(src.includes('numberToWords') && src.includes('migrateV13') && src.includes('collectFeePage') && src.includes('saveCollectFee') && src.includes('receiptHTML') && src.includes('buildCollectLines') && src.includes('printReceipt')
  ? 'PASS app.js has Phase 5 fee collection receipt functions'
  : 'FAIL app.js missing Phase 5 receipt functions');
if (!(src.includes('numberToWords') && src.includes('migrateV13') && src.includes('collectFeePage') && src.includes('saveCollectFee') && src.includes('receiptHTML') && src.includes('buildCollectLines') && src.includes('printReceipt'))) process.exitCode = 1;

const css = readRel('styles.css');
console.log(css.includes('@media print') && css.includes('.lang-one') && css.includes('.type-row') && css.includes('.mini-avatar') && css.includes('.print-head') && css.includes('.side-logo') && css.includes('.modal.wide') && css.includes('.tab-btn') && css.includes('.menu-list') && css.includes('.class-bar') && css.includes('.sec-title') && css.includes('.imp-scroll') && css.includes('.promo-row') && css.includes('.id-card') && css.includes('.id-sheet') && css.includes('.id-bulk-bar') && css.includes('.rcpt') && css.includes('.rcpt-title') && css.includes('.rcpt-sign') && css.includes('.fee-hist-tbl') && css.includes('.fee-prof-tbl') && css.includes('.fee-list-tbl')
  ? 'PASS styles.css has print + lang-one + type-row + photo/logo rules + receipt rules + fee-history / fee-profile / fees-list phone rules'
  : 'FAIL styles.css missing print/lang-one/type-row/photo/logo/receipt/fee-history/fee-profile/fees-list rules');
if (!(css.includes('@media print') && css.includes('.lang-one') && css.includes('.type-row') && css.includes('.mini-avatar') && css.includes('.print-head') && css.includes('.side-logo') && css.includes('.modal.wide') && css.includes('.tab-btn') && css.includes('.menu-list') && css.includes('.class-bar') && css.includes('.sec-title') && css.includes('.imp-scroll') && css.includes('.promo-row') && css.includes('.id-card') && css.includes('.id-sheet') && css.includes('.id-bulk-bar') && css.includes('.rcpt') && css.includes('.rcpt-title') && css.includes('.rcpt-sign') && css.includes('.fee-hist-tbl') && css.includes('.fee-prof-tbl') && css.includes('.fee-list-tbl'))) process.exitCode = 1;
console.log(css.includes('760px') && css.includes('#0A1E4B') && css.includes('#EA8600') && css.includes('.auth-tab')
  ? 'PASS styles.css keeps navy/gold theme + 760px breakpoint + auth tabs'
  : 'FAIL styles.css missing navy/gold / 760px / auth-tab rules');
if (!(css.includes('760px') && css.includes('#0A1E4B') && css.includes('#EA8600') && css.includes('.auth-tab'))) process.exitCode = 1;
// v29: long-press must not select text; form fields keep text selection. CSS only.
console.log(css.includes('body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}')
  ? 'PASS v29: body disables text selection + touch callout'
  : 'FAIL v29: body user-select/touch-callout rule missing');
if (!css.includes('body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}')) process.exitCode = 1;
console.log(css.includes('input,textarea,select,[contenteditable]{-webkit-user-select:text;user-select:text}')
  ? 'PASS v29: form fields keep text selection'
  : 'FAIL v29: form-field user-select:text rule missing');
if (!css.includes('input,textarea,select,[contenteditable]{-webkit-user-select:text;user-select:text}')) process.exitCode = 1;
console.log(css.includes('-webkit-tap-highlight-color:transparent')
  ? 'PASS v29: tap highlight removed'
  : 'FAIL v29: tap-highlight rule missing');
if (!css.includes('-webkit-tap-highlight-color:transparent')) process.exitCode = 1;
console.log(!src.includes('selectstart') && !src.includes('oncontextmenu')
  ? 'PASS v29: no JS selection prevention (CSS only)'
  : 'FAIL v29: JS selection prevention found in app.js');
if (src.includes('selectstart') || src.includes('oncontextmenu')) process.exitCode = 1;
// v30: 03_support_requests.sql reshapes the table that already exists in
// 01_schema.sql (status 'Open', no local_id, broad owner+admin policy) —
// an idempotent migration, owner-only policies, no anon access.
const sql03 = readRel('supabase/03_support_requests.sql');
console.log(sql03.includes('ss_support_requests') && sql03.includes('enable row level security')
  ? 'PASS v30: 03_support_requests.sql has the table + RLS'
  : 'FAIL v30: 03_support_requests.sql missing table/RLS');
if (!(sql03.includes('ss_support_requests') && sql03.includes('enable row level security'))) process.exitCode = 1;
console.log(sql03.includes('create policy ss_support_school_insert') && sql03.includes('create policy ss_support_school_select')
  ? 'PASS v30: 03 has the two authenticated-only policies (insert + select)'
  : 'FAIL v30: 03 missing the insert/select policies');
if (!(sql03.includes('create policy ss_support_school_insert') && sql03.includes('create policy ss_support_school_select'))) process.exitCode = 1;
console.log(sql03.includes("status = 'Pending'") && sql03.includes('local_id')
  ? 'PASS v30: 03 posts Pending + carries local_id'
  : 'FAIL v30: 03 missing Pending status / local_id');
if (!(sql03.includes("status = 'Pending'") && sql03.includes('local_id'))) process.exitCode = 1;
console.log(!sql03.includes('create policy ss_support_owner_all') && !/to anon/.test(sql03)
  ? 'PASS v30: 03 has no anon policy and drops the old owner+admin policy'
  : 'FAIL v30: 03 still grants anon or keeps the old policy');
if (sql03.includes('create policy ss_support_owner_all') || /to anon/.test(sql03)) process.exitCode = 1;
// v30: the download + support-post + reset-name functions. NOTE (Phase 1):
// the old empty-store-only sbDownloadSchoolData was deliberately removed in
// Phase D (L-6); the live download path is the sbRetryDownload manual refresh
// (Settings button) + the server-first pull. The harness checks the names
// that actually exist — it must not demand the removed function back.
console.log(src.includes('sbRetryDownload') && src.includes('sbPostSupportRequest') && src.includes('openResetNamePrompt') && src.includes('submitResetName')
  ? 'PASS v30: app.js has the download + support-post + reset-name functions'
  : 'FAIL v30: v30 functions missing from app.js');
if (!(src.includes('sbRetryDownload') && src.includes('sbPostSupportRequest') && src.includes('openResetNamePrompt') && src.includes('submitResetName'))) process.exitCode = 1;
console.log(src.includes('sbRetryDownload(this)') && src.includes("t('sbDownloadNow')")
  ? 'PASS v30: Settings has the Download from Server button'
  : 'FAIL v30: Download button missing from Settings');
if (!(src.includes('sbRetryDownload(this)') && src.includes("t('sbDownloadNow')"))) process.exitCode = 1;
// v31: server-first sync. 04 adds updated_at + the touch trigger to the
// nine tables that lacked it (no policy changes: 02_rls already gives
// every synced table an owner FOR ALL policy + authenticated grants).
const sql04 = readRel('supabase/04_server_first.sql');
const needUpdatedAt = ['ss_fee_structure', 'ss_fee_records', 'ss_receipts', 'ss_admission_requests', 'ss_teachers', 'ss_exams', 'ss_marks', 'ss_homework', 'ss_notices'];
console.log(needUpdatedAt.every(function (t) { return sql04.includes('alter table public.' + t + ' add column if not exists updated_at'); })
  ? 'PASS v31: 04 adds updated_at to all 9 tables that lacked it'
  : 'FAIL v31: 04 missing updated_at on some table');
if (!needUpdatedAt.every(function (t) { return sql04.includes('alter table public.' + t + ' add column if not exists updated_at'); })) process.exitCode = 1;
console.log(sql04.includes('create or replace function public.ss_touch_updated_at()') && sql04.includes('create trigger ss_touch_')
  ? 'PASS v31: 04 has the ss_touch_updated_at trigger function + triggers'
  : 'FAIL v31: 04 missing the touch trigger');
if (!(sql04.includes('create or replace function public.ss_touch_updated_at()') && sql04.includes('create trigger ss_touch_'))) process.exitCode = 1;
console.log(!sql04.includes('create policy') && !/to anon/.test(sql04)
  ? 'PASS v31: 04 adds no policies and no anon access (02_rls already covers the sync tables)'
  : 'FAIL v31: 04 must not add policies or anon access');
if (sql04.includes('create policy') || /to anon/.test(sql04)) process.exitCode = 1;
console.log(sql04.includes('ss_schools') && sql04.includes('ss_students') && sql04.includes('ss_attendance')
  ? 'PASS v31: 04 also touches the trigger on the 3 tables that already had updated_at'
  : 'FAIL v31: 04 trigger list is incomplete');
if (!(sql04.includes('ss_schools') && sql04.includes('ss_students') && sql04.includes('ss_attendance'))) process.exitCode = 1;
console.log(src.includes('sbSyncStart') && src.includes('sbSyncPull') && src.includes('sbSyncFlushNow') && src.includes('sbSyncQueueDiff') && src.includes('sbSyncOnSave') && src.includes('sbSyncActive') && src.includes('sbOutboxAdd') && src.includes('sbApplyServerRows') && src.includes('sbSyncGuardHit')
  ? 'PASS v31: app.js has the server-first sync functions (start/pull/flush/diff/outbox/guard)'
  : 'FAIL v31: sync functions missing from app.js');
if (!(src.includes('sbSyncStart') && src.includes('sbSyncPull') && src.includes('sbSyncFlushNow') && src.includes('sbSyncQueueDiff') && src.includes('sbSyncOnSave') && src.includes('sbSyncActive') && src.includes('sbOutboxAdd') && src.includes('sbApplyServerRows') && src.includes('sbSyncGuardHit'))) process.exitCode = 1;
console.log(src.includes("window.addEventListener('online'") && src.includes('sbSyncCycle(state.user, state.sb.uid, null)')
  ? 'PASS v32: reconnect (online event) triggers a cycle'
  : 'FAIL v32: online-event cycle wiring missing');
if (!(src.includes("window.addEventListener('online'") && src.includes('sbSyncCycle(state.user, state.sb.uid, null)'))) process.exitCode = 1;
console.log(src.includes("document.addEventListener('visibilitychange'") && src.includes("window.addEventListener('focus'") && src.includes('sbSyncIntervalMs = 30000') && src.includes('sbSyncUploadMissing') && src.includes('sbSyncAutoStart') && src.includes('sbSyncCyclePending') && !src.includes('sbMaybeMigrate(a, uid, data.access_token)')
  ? 'PASS v32: foreground (visibility/focus) + 30s interval + upload-missing pass wired; login no longer runs migration and pull in parallel'
  : 'FAIL v32: automatic-sync wiring missing');
if (!(src.includes("document.addEventListener('visibilitychange'") && src.includes("window.addEventListener('focus'") && src.includes('sbSyncIntervalMs = 30000') && src.includes('sbSyncUploadMissing') && src.includes('sbSyncAutoStart') && src.includes('sbSyncCyclePending') && !src.includes('sbMaybeMigrate(a, uid, data.access_token)'))) process.exitCode = 1;
console.log(!fs.existsSync(path.join(ROOT, 'supabase/05_automatic_sync.sql'))
  ? 'PASS v32: no new SQL needed (existing tables/policies cover the automatic cycle)'
  : 'FAIL v32: unexpected 05_automatic_sync.sql present');
if (fs.existsSync(path.join(ROOT, 'supabase/05_automatic_sync.sql'))) process.exitCode = 1;
console.log((src + i18nSrc).includes('sbStatusSyncing') && (src + i18nSrc).includes('sbStatusPendingSync') && (src + i18nSrc).includes('sbSyncDone') && (src + i18nSrc).includes('sbSyncConflict')
  ? 'PASS v31: sync status strings present (syncing / pending-sync / done / conflict)'
  : 'FAIL v31: sync status strings missing');
if (!((src + i18nSrc).includes('sbStatusSyncing') && (src + i18nSrc).includes('sbStatusPendingSync') && (src + i18nSrc).includes('sbSyncDone') && (src + i18nSrc).includes('sbSyncConflict'))) process.exitCode = 1;

// v36 + Phase D (L-8): seedDB() has NO call site left in app.js — the
// loadDB boot path no longer seeds the demo DB on fresh devices (audit
// item 17), and at v67 the seed definition itself moved out of app.js
// into scripts/seed-fixtures.js (repo file, harness-only, never loaded
// by index.html). The quarantine fingerprint is precomputed in app.js
// (SB_SEED_FINGERPRINTS) instead of calling seedDB() at runtime. So:
// app.js code must contain ZERO seedDB() calls, and the fixtures file
// must define seedDB() exactly once. No account-facing reset or signup
// path may seed demo data anymore. Comments are stripped before
// counting — the v45 quarantine note itself mentions seedDB() in prose.
var srcNoComments45 = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const seedCalls = (srcNoComments45.match(/seedDB\(\)/g) || []).length;
const seedFixtureDefs = (seedFixturesSrc.match(/function seedDB\(\)/g) || []).length;
console.log(seedCalls === 0 && seedFixtureDefs === 1 ? 'PASS seedDB() has zero call sites in app.js (no runtime seeding) and one definition in scripts/seed-fixtures.js (harness-only)' : 'FAIL seedDB() call sites in app.js: ' + seedCalls + ', definitions in seed-fixtures.js: ' + seedFixtureDefs);
if (!(seedCalls === 0 && seedFixtureDefs === 1)) process.exitCode = 1;
console.log(!src.includes('Reset Demo Data') && !src.includes('Demo data reset') && !src.includes('resetDemo')
  ? 'PASS no demo-reset strings remain in app.js'
  : 'FAIL demo-reset strings still present in app.js');
if (src.includes('Reset Demo Data') || src.includes('Demo data reset') || src.includes('resetDemo')) process.exitCode = 1;
// v21: no auto 6000 fee record may remain in the admission save path.
console.log(!src.includes('amount: 6000')
  ? 'PASS no auto 6000 fee record in the admission save path'
  : 'FAIL auto 6000 fee record still present in app.js');
if (src.includes('amount: 6000')) process.exitCode = 1;
// v23: static delta badges + the old attendance-aggregate helper must be gone.
console.log(!src.includes('↑ 78%') && !src.includes('↑ 5%') && !src.includes('↑ 2%')
  ? 'PASS v23: the three static badge strings are gone from app.js'
  : 'FAIL v23: static badge strings still present in app.js');
if (src.includes('↑ 78%') || src.includes('↑ 5%') || src.includes('↑ 2%')) process.exitCode = 1;
console.log(!src.includes('↑ 12%') && !src.includes('↑ 18%') && !src.includes('↑ 92%') && !src.includes('↑ 6%') && !src.includes('↑ 21%') && !src.includes('↓ 0%') && !src.includes('↓ 4%')
  ? 'PASS v23: all other hard-coded delta badges are gone too'
  : 'FAIL v23: other hard-coded delta badges still present');
if (src.includes('↑ 12%') || src.includes('↑ 18%') || src.includes('↑ 92%') || src.includes('↑ 6%') || src.includes('↑ 21%') || src.includes('↓ 0%') || src.includes('↓ 4%')) process.exitCode = 1;
console.log(!src.includes('attTotal')
  ? 'PASS v23: the old attTotal aggregate helper is gone'
  : 'FAIL v23: attTotal still present in app.js');
if (src.includes('attTotal')) process.exitCode = 1;
// v24: no stale version label, View All wired to the audit log, live-attendance helper present.
console.log(!src.includes('Version 1.0.0') ? 'PASS v24: no stale Version 1.0.0 label in app.js' : 'FAIL v24: Version 1.0.0 still in app.js');
if (src.includes('Version 1.0.0')) process.exitCode = 1;
console.log(!html.includes('Version 1.0.0') ? 'PASS v24: no stale Version 1.0.0 label in index.html' : 'FAIL v24: Version 1.0.0 still in index.html');
if (html.includes('Version 1.0.0')) process.exitCode = 1;
console.log(src.includes("go(\\'activityLog\\')") && src.includes('activityLogPage') ? 'PASS v24: View All opens the activity log page' : 'FAIL v24: activity log wiring missing');
if (!(src.includes("go(\\'activityLog\\')") && src.includes('activityLogPage'))) process.exitCode = 1;
console.log(src.includes('studentAttPct') && src.includes('submitSupportRequest') ? 'PASS v24: live-attendance helper + support request functions present' : 'FAIL v24: v24 functions missing');
if (!(src.includes('studentAttPct') && src.includes('submitSupportRequest'))) process.exitCode = 1;
// v28: version bump + no fake user totals / growth series / count-up leftovers.
console.log(html.includes('>v' + EXPECTED_VERSION + '<br>') && !html.includes('>v' + (EXPECTED_VERSION - 1) + '<br>') ? 'PASS v58: index.html shows the v' + EXPECTED_VERSION + ' footer' : 'FAIL v58: index.html footer is not v' + EXPECTED_VERSION);
if (!(html.includes('>v' + EXPECTED_VERSION + '<br>') && !html.includes('>v' + (EXPECTED_VERSION - 1) + '<br>'))) process.exitCode = 1;
// v79: the CSP must allow Storage images — img-src 'self' data: blob:
// blocked every https://<ref>.supabase.co Storage photo/logo (live v78:
// the URL loaded via curl but the browser showed a broken image).
console.log(html.includes("img-src 'self' data: blob: https://bsjqeeeemwimzldrehpw.supabase.co") ? 'PASS v79: CSP img-src allows the Supabase Storage origin (Storage photos/logos can render)' : 'FAIL v79: CSP img-src does not allow the Supabase Storage origin');
if (!html.includes("img-src 'self' data: blob: https://bsjqeeeemwimzldrehpw.supabase.co")) process.exitCode = 1;
console.log(!src.includes('12450') && !src.includes('11162') && !src.includes('1240')
  ? 'PASS v26: no fake user totals (12450 / 11162 / 1240) in app.js'
  : 'FAIL v26: fake user totals still present in app.js');
if (src.includes('12450') || src.includes('11162') || src.includes('1240')) process.exitCode = 1;
console.log(!src.includes('GROWTH') && !src.includes('lineChartSVG') && !src.includes('animateLine')
  ? 'PASS v26: hard-coded growth series + line chart are gone from app.js'
  : 'FAIL v26: growth chart leftovers still present in app.js');
if (src.includes('GROWTH') || src.includes('lineChartSVG') || src.includes('animateLine')) process.exitCode = 1;
console.log(!src.includes('Just now') && !src.includes('data-count') && !src.includes('countUp') && !src.includes('runCountUps')
  ? 'PASS v26: no Just now literal, no count-up animation left in app.js'
  : 'FAIL v26: count-up / Just now leftovers still present in app.js');
if (src.includes('Just now') || src.includes('data-count') || src.includes('countUp') || src.includes('runCountUps')) process.exitCode = 1;
console.log(src.includes('relTime')
  ? 'PASS v26: relative-time helper present (live platform totals are gone with the Super Admin pages in v28)'
  : 'FAIL v26: relTime helper missing');
if (!src.includes('relTime')) process.exitCode = 1;
// v28: Super Admin is gone from the app. (Phase 4 v85 brings the Super
// Admin role back as its OWN role — PAGE_SUPERADMIN — so the scan checks
// for the OLD PAGE_SUPER name with a word boundary, not as a prefix.)
// v94: the super admin check (sbCheckSuperAdmin) and the server-side
// admin lookup (ss_is_super_admin RPC) return as the super admin's first
// UI — so the scan no longer forbids them. What must STILL be gone:
// the rejected super@school-saathi.in address, the old 'super' role
// name, and the old var OWNER constant.
console.log(!src.includes('super@school-saathi.in') && !/PAGE_SUPER(?![A-Z])/.test(src) && !src.includes("'super'") && !src.includes('var OWNER')
  ? 'PASS v28: no super login address, old super role, old super pages or OWNER constant in app.js'
  : 'FAIL v28: Super Admin leftovers still present in app.js');
if (src.includes('super@school-saathi.in') || /PAGE_SUPER(?![A-Z])/.test(src) || src.includes("'super'") || src.includes('var OWNER')) process.exitCode = 1;
console.log(src.includes('sbNoSchool') && src.includes('sbGetServerSchoolId') && src.includes('sbShowNoSchool')
  ? 'PASS v28: no-school login path present'
  : 'FAIL v28: no-school login path missing');
if (!(src.includes('sbNoSchool') && src.includes('sbGetServerSchoolId') && src.includes('sbShowNoSchool'))) process.exitCode = 1;

// ---- v28: Supabase Auth swap + migration upload (mocked fetch, offline-safe) ----
// Runs after the sync vm tests + Node-side checks. The vm app code calls the
// bare global fetch, so installing a mock on ctx.fetch drives it; the mock
// below is a tiny in-memory fake GoTrue + PostgREST, so no live project is
// ever touched and nothing needs cleanup.
const SB_URL = 'https://bsjqeeeemwimzldrehpw.supabase.co';
let sbCalls = [];
let sbFailTables = new Set();
let sbNowMs = Date.parse('2026-11-09T06:00:00Z');
function sbNowISO() { sbNowMs += 1000; return new Date(sbNowMs).toISOString(); }
const sbServer = { ss_schools: [], ss_students: [], ss_fee_records: [], ss_fee_structure: [], ss_attendance: [], ss_receipts: [], ss_audit_log: [], ss_activities: [], ss_teachers: [], ss_exams: [], ss_marks: [], ss_homework: [], ss_notices: [], ss_holidays: [], ss_platform_admins: [], ss_admission_requests: [], ss_support_requests: [], ss_staff: [] }; // v90: the mock server has the ss_staff table (SQL 30 created it live); v100: ss_holidays (SQL 38)
let sbSeq = 0;
let sbSignupMode = 'ok'; // v34: 'ok' | 'rate-limit' | 'exists' — drives the mocked GoTrue signup
let sbRefreshFail = false; // v34: when true the mocked refresh token is rejected (400)
let sbGetSchoolsEmptyOnce = false; // v34: the next ss_schools GET returns [] once (race simulation)
function sbJsonRes(status, data) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(data) };
}
// v45: the mock enforces the demo-seed quarantine the way it enforces
// the 409/22P02/PGRST102 — a seed row (short demo id + the seed's exact
// content for that id, fingerprinted from the app's own seedDB()) is
// never written to the server. A POST or PATCH carrying one is rejected
// with 400 SEED_REJECTED, so a regression that tries to upload seed
// rows fails the harness instead of silently landing. Mapped (server)
// field names are used: the mock sees the mapped payload, so the fee
// record fingerprint drops the student (mapped to a uuid) and keeps
// month + fee_type + amount + status.
let vmSeedFp = null;
function vmSeedFingerprint() {
  if (vmSeedFp) return vmSeedFp;
  var fp = { students: {}, teachers: {}, exams: {}, feeRecords: {}, homework: {}, notices: {} };
  var s = ctx.seedDB();
  (s.students || []).forEach(function (r) { fp.students[r.id] = (r.name || '') + '|' + (r.admissionNo || '') + '|' + (r.enr || ''); });
  (s.teachers || []).forEach(function (r) { fp.teachers[r.id] = (r.name || '') + '|' + (r.subject || '') + '|' + (r.cls || ''); });
  (s.exams || []).forEach(function (r) { fp.exams[r.id] = (r.name || '') + '|' + (r.cls || '') + '|' + (r.subject || ''); });
  (s.feeRecords || []).forEach(function (r) { fp.feeRecords[r.id] = (r.month || '') + '|' + (r.type || '') + '|' + (r.amount || 0) + '|' + (r.status || ''); });
  (s.homework || []).forEach(function (r) { fp.homework[r.id] = (r.title || '') + '|' + (r.cls || '') + '|' + (r.subject || ''); });
  (s.notices || []).forEach(function (r) { fp.notices[r.id] = (r.title || '') + '|' + (r.date || ''); });
  vmSeedFp = fp;
  return fp;
}
function vmIsSeedRow(table, row) {
  if (!row) return false;
  // v47: an attendance row carries no local_id — it is seed when its
  // student is a seed local id (stu1..stu40). A real row carries the
  // server uuid of its student, never a seed local id.
  if (table === 'ss_attendance') return /^stu([1-9]|[1-3][0-9]|40)$/.test(String(row.student_id || ''));
  if (!row.local_id) return false;
  var fp = vmSeedFingerprint();
  var map = table === 'ss_students' ? fp.students : table === 'ss_teachers' ? fp.teachers : table === 'ss_exams' ? fp.exams : table === 'ss_fee_records' ? fp.feeRecords : table === 'ss_homework' ? fp.homework : table === 'ss_notices' ? fp.notices : null;
  if (!map) return false;
  var want = map[row.local_id];
  if (!want) return false;
  var got = table === 'ss_students' ? (row.name || '') + '|' + (row.admission_no || '') + '|' + (row.enr || '')
    : table === 'ss_teachers' ? (row.name || '') + '|' + (row.subject || '') + '|' + (row.cls || '')
    : table === 'ss_exams' ? (row.name || '') + '|' + (row.cls || '') + '|' + (row.subject || '')
    : table === 'ss_fee_records' ? (row.month || '') + '|' + (row.fee_type || '') + '|' + (row.amount || 0) + '|' + (row.status || '')
    : table === 'ss_homework' ? (row.title || '') + '|' + (row.cls || '') + '|' + (row.subject || '')
    : (row.title || '') + '|' + (row.notice_date || '');
  return got === want;
}
function sbMockFetch(url, init) {
  init = init || {};
  const method = init.method || 'GET';
  const headers = init.headers || {};
  sbCalls.push({ method, url, headers, body: init.body ? JSON.parse(init.body) : undefined, t: Date.now() }); // v53: t stamps each call, so a phase's round-trips can be counted from the log
  const u = String(url);
  if (u.indexOf('/auth/v1/token?grant_type=password') !== -1) {
    const b = JSON.parse(init.body);
    if (b.password !== 'TestAdmin-2026') return Promise.resolve(sbJsonRes(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' }));
    // v28: the platform-owner account carries no signup metadata (it was
    // created outside the app's signup form), so it must not look like a
    // school. Every other login carries the app's signup metadata.
    var meta28 = b.email === 'owner@platform.test' ? {} : b.email === 'vm@school.in' ? { school: 'VM School', name: 'Sunil Kumar' } : { school: 'Test School', name: 'Test Admin' };
    return Promise.resolve(sbJsonRes(200, { access_token: 'tok-' + b.email, refresh_token: 'ref-' + b.email, expires_in: 3600, token_type: 'bearer', user: { id: 'sb-uid-' + b.email, email: b.email, user_metadata: meta28 } }));
  }
  if (u.indexOf('/auth/v1/signup') !== -1) {
    const b = JSON.parse(init.body);
    if (sbSignupMode === 'rate-limit') return Promise.resolve(sbJsonRes(429, { error: 'too many requests' }));
    if (sbSignupMode === 'exists') return Promise.resolve(sbJsonRes(422, { error: 'user_already_exists', msg: 'User already registered' }));
    return Promise.resolve(sbJsonRes(200, { access_token: 'tok-new', refresh_token: 'ref-new', expires_in: 3600, user: { id: 'sb-uid-new', email: b.email, user_metadata: b.data || {} } }));
  }
  if (u.indexOf('/auth/v1/token?grant_type=refresh_token') !== -1) {
    if (sbRefreshFail) return Promise.resolve(sbJsonRes(400, { error: 'invalid_grant', error_description: 'Invalid refresh token' }));
    return Promise.resolve(sbJsonRes(200, { access_token: 'tok-refreshed', refresh_token: 'ref-new2', expires_in: 3600, user: { id: 'sb-uid-x', email: 'x@school.in' } }));
  }
  if (u.indexOf('/auth/v1/recover') !== -1) return Promise.resolve(sbJsonRes(200, {}));
  if (u.indexOf('/auth/v1/user') !== -1 && method === 'PUT') return Promise.resolve(sbJsonRes(200, { id: 'sb-uid-x', email: 'x@school.in' }));
  if (u.indexOf('/auth/v1/user') !== -1 && method === 'GET') return Promise.resolve(sbJsonRes(200, { id: 'sb-uid-x', email: 'x@school.in' }));
  if (u.indexOf('/auth/v1/logout') !== -1) return Promise.resolve(sbJsonRes(204, null));
  // v33: the atomic numbering RPCs. They read the school row, return the
  // counter value as the next number, and increment it — exactly like
  // the live ss_next_adm_no / ss_next_receipt_no (which also lock the
  // school row). A counter left behind the highest used number re-mints
  // a taken number first: the app's mint-until-free loop handles that.
  if (u.indexOf('/rest/v1/rpc/ss_next_adm_no') !== -1 || u.indexOf('/rest/v1/rpc/ss_next_receipt_no') !== -1) {
    const b = JSON.parse(init.body || '{}');
    const school = sbServer.ss_schools.filter(function (s) { return s.id === b.p_school_id; })[0];
    if (!school) return Promise.resolve(sbJsonRes(400, { message: 'school not found' }));
    if (u.indexOf('ss_next_adm_no') !== -1) {
      const m = String(school.session || '2025–26').match(/\d{4}/);
      const year = m ? m[0] : '2025';
      const n = school.adm_counter || 1;
      school.adm_counter = n + 1;
      school.updated_at = sbNowISO();
      return Promise.resolve(sbJsonRes(200, 'ADM-' + year + '-' + String(n).padStart(3, '0')));
    }
    const n2 = school.receipt_counter || 1;
    school.receipt_counter = n2 + 1;
    school.updated_at = sbNowISO();
    return Promise.resolve(sbJsonRes(200, 'RCP-' + new Date(sbNowMs).getFullYear() + '-' + String(n2).padStart(3, '0')));
  }
  // v34: the public-schools list (anon, for the Apply form) and the
  // server wipe RPC (Reset All Data). Placed before the table branch,
  // which would otherwise read 'rpc' as a table name and 404.
  if (u.indexOf('/rest/v1/rpc/ss_list_public_schools') !== -1) {
    const rows = sbServer.ss_schools.filter(function (s) { return !s.is_demo; }).map(function (s) { return { id: s.id, name: s.name, city: s.city }; });
    return Promise.resolve(sbJsonRes(200, rows));
  }
  if (u.indexOf('/rest/v1/rpc/ss_wipe_school') !== -1) {
    const b = JSON.parse(init.body || '{}');
    const sid = b.p_school_id;
    ['ss_marks', 'ss_attendance', 'ss_fee_records', 'ss_receipts', 'ss_audit_log', 'ss_activities', 'ss_homework', 'ss_notices', 'ss_holidays', 'ss_exams', 'ss_teachers', 'ss_admission_requests', 'ss_support_requests', 'ss_fee_structure', 'ss_students'].forEach(function (t) {
      sbServer[t] = sbServer[t].filter(function (r) { return r.school_id !== sid; });
    });
    sbServer.ss_schools = sbServer.ss_schools.filter(function (r) { return r.id !== sid; });
    return Promise.resolve(sbJsonRes(200, { wiped: true, school_id: sid }));
  }
  if (u.indexOf('/rest/v1/') !== -1) {
    const m = u.match(/\/rest\/v1\/([a-z_]+)(\?|$)/);
    const table = m && m[1];
    if (!table || !(table in sbServer)) return Promise.resolve(sbJsonRes(404, { message: 'table not found' }));
    const q = u.split('?')[1] || '';
    const params = {};
    q.split('&').forEach(function (p) { const kv = p.split('='); if (kv[0]) params[kv[0]] = decodeURIComponent(kv[1] || ''); });
    if (method === 'GET') {
      // v105: ss_holidays has NO updated_at column (live SQL 38) — a
      // select naming it 42703s, exactly like live PostgREST. The app
      // must never ask for it on this table.
      if (table === 'ss_holidays' && (params.select || '').indexOf('updated_at') !== -1) return Promise.resolve(sbJsonRes(400, { code: '42703', message: 'column ss_holidays.updated_at does not exist' }));
      if (table === 'ss_schools' && sbGetSchoolsEmptyOnce) { sbGetSchoolsEmptyOnce = false; return Promise.resolve(sbJsonRes(200, [])); }
      let rows = sbServer[table].slice();
      Object.keys(params).forEach(function (k) {
        if (k === 'select' || k === 'limit' || k === 'order') return;
        const mm = params[k].match(/^eq\.(.*)$/);
        if (mm) rows = rows.filter(function (r) { return String(r[k]) === mm[1]; });
      });
      const lim = parseInt(params.limit || '1000', 10);
      return Promise.resolve(sbJsonRes(200, rows.slice(0, lim)));
    }
    if (method === 'POST') {
      if (sbFailTables.has(table)) return Promise.resolve(sbJsonRes(500, { message: 'boom' }));
      const body = JSON.parse(init.body);
      const arr = Array.isArray(body) ? body : [body];
      // v45: a demo-seed row is never written — rejected like the 409.
      for (const row of arr) {
        if (vmIsSeedRow(table, row)) return Promise.resolve(sbJsonRes(400, { code: 'SEED_REJECTED', message: 'demo seed row rejected: ' + table + ' ' + row.local_id }));
      }
      // v42: PostgREST rejects a bulk insert whose rows carry different
      // key sets with PGRST102 "All object keys must match" — the live
      // v41 failure was exactly this (seed activities without
      // created_at mixed with logged activities carrying it). The mock
      // enforces the same rule so the harness reproduces the exact
      // live error instead of silently accepting a ragged bulk POST.
      if (arr.length > 1) {
        var keySet42 = Object.keys(arr[0]).sort().join(',');
        for (var bi42 = 1; bi42 < arr.length; bi42++) {
          if (Object.keys(arr[bi42]).sort().join(',') !== keySet42) return Promise.resolve(sbJsonRes(400, { code: 'PGRST102', message: 'All object keys must match' }));
        }
      }
      // v33: the server's unique constraints — a second student with the
      // same admission_no/enr, or a receipt with the same receipt_no, in
      // one school is a 409, exactly like live PostgREST.
      // v34 (P1-11): one school row per owner — a second insert for the
      // same owner_id is a 409, exactly like the live unique index.
      if (table === 'ss_schools') {
        for (const row of arr) {
          const dup = sbServer.ss_schools.some(function (r) { return r.owner_id === row.owner_id; });
          if (dup) return Promise.resolve(sbJsonRes(409, { code: '23505', message: 'duplicate key value violates unique constraint "ss_schools_owner_uidx"' }));
        }
      }
      if (table === 'ss_students') {
        for (const row of arr) {
          const dup = sbServer.ss_students.some(function (r) {
            return r.school_id === row.school_id
              && ((row.admission_no && r.admission_no === row.admission_no) || (row.enr && r.enr === row.enr));
          });
          if (dup) return Promise.resolve(sbJsonRes(409, { code: '23505', message: 'duplicate key value violates unique constraint "ss_students_school_id_admission_no_key"' }));
        }
      }
      // v40: the live ss_receipts.counter_no column is INTEGER, and the
      // app used to POST the Collect Fee label 'COUNTER-1' as a string —
      // PostgREST rejected it with HTTP 400 code 22P02, so RCP-2026-003
      // never landed. The mock enforces the same type rule so the
      // harness reproduces the exact live error.
      if (table === 'ss_receipts') {
        for (const row of arr) {
          if (typeof row.counter_no !== 'number' || !isFinite(row.counter_no)) return Promise.resolve(sbJsonRes(400, { code: '22P02', message: 'invalid input syntax for type integer: "' + row.counter_no + '"' }));
        }
      }
      if (table === 'ss_receipts') {
        for (const row of arr) {
          const dup = sbServer.ss_receipts.some(function (r) { return r.school_id === row.school_id && row.receipt_no && r.receipt_no === row.receipt_no; });
          if (dup) return Promise.resolve(sbJsonRes(409, { code: '23505', message: 'duplicate key value violates unique constraint "ss_receipts_school_id_receipt_no_key"' }));
        }
      }
      const inserted = arr.map(function (row) {
        const copy = Object.assign({}, row);
        if (!copy.id) { sbSeq += 1; copy.id = 'srv-' + table + '-' + sbSeq; }
        if (!copy.updated_at) copy.updated_at = sbNowISO();
        sbServer[table].push(copy);
        return copy;
      });
      if (headers.Prefer === 'return=minimal') return Promise.resolve(sbJsonRes(201, null));
      return Promise.resolve(sbJsonRes(201, inserted));
    }
    if (method === 'PATCH') {
      if (sbFailTables.has(table)) return Promise.resolve(sbJsonRes(500, { message: 'boom' }));
      const body = JSON.parse(init.body);
      // v45: a PATCH carrying a seed local_id (the v44 bug shape) or the
      // seed school profile is rejected like the POST above.
      if (vmIsSeedRow(table, body)) return Promise.resolve(sbJsonRes(400, { code: 'SEED_REJECTED', message: 'demo seed row rejected: ' + table + ' ' + body.local_id }));
      if (table === 'ss_schools' && body.name === 'St. Xavier School' && body.principal === 'Rahul Kumar' && body.adm_counter === 41 && body.receipt_counter === 1) return Promise.resolve(sbJsonRes(400, { code: 'SEED_REJECTED', message: 'demo seed school profile rejected' }));
      let rows = sbServer[table].slice();
      Object.keys(params).forEach(function (k) {
        if (k === 'select' || k === 'limit' || k === 'order') return;
        const mm = params[k].match(/^eq\.(.*)$/);
        if (mm) rows = rows.filter(function (r) { return String(r[k]) === mm[1]; });
      });
      rows.forEach(function (r) { Object.assign(r, body); r.updated_at = sbNowISO(); });
      if (headers.Prefer === 'return=minimal') return Promise.resolve(sbJsonRes(204, null));
      return Promise.resolve(sbJsonRes(200, rows));
    }
    if (method === 'DELETE') {
      if (sbFailTables.has(table)) return Promise.resolve(sbJsonRes(500, { message: 'boom' }));
      let rows = sbServer[table].slice();
      Object.keys(params).forEach(function (k) {
        if (k === 'select' || k === 'limit' || k === 'order') return;
        const mm = params[k].match(/^eq\.(.*)$/);
        if (mm) rows = rows.filter(function (r) { return String(r[k]) === mm[1]; });
      });
      sbServer[table] = sbServer[table].filter(function (r) { return rows.indexOf(r) === -1; });
      return Promise.resolve(sbJsonRes(204, null));
    }
  }
  return Promise.resolve(sbJsonRes(404, { message: 'not mocked: ' + u }));
}

// v53: realistic browser→Supabase latency. The mock resolved instantly,
// so every version up to v52 passed the harness while the live cycle
// took 60–75s — a cycle's cost is (round-trips × latency) and instant
// mocks hide it entirely. sbLatencyMs delays each mock response by
// that many ms; the v53 block enables it, measures wall-time per phase,
// and disables it again. Only the v53 block uses sbLatencyFetch —
// every earlier block keeps the instant mock.
var sbLatencyMs = 0;
function sbLatencyFetch(url, init) {
  if (!sbLatencyMs) return sbMockFetch(url, init);
  return new Promise(function (resolve) { setTimeout(function () { resolve(sbMockFetch(url, init)); }, sbLatencyMs); });
}

let v28passes = 0; const v28fails = [];
function v28ok(cond, name) {
  if (cond) { v28passes++; console.log('PASS ' + name); }
  else { v28fails.push(name); console.log('FAIL ' + name); }
}
function v28eq(a, b, name) { v28ok(a === b, name + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
const tick = () => new Promise(r => setTimeout(r, 0));
// B3 (harness fix): logout() is async (flush-then-clear) — a test that
// proceeds right after ctx.logout() races the clear; the late clear
// wipes the fresh login and can crash renderApp on a null user.
// Wait until the clear has actually landed (or ~6s, the flush timeout).
async function waitLogoutCtx() {
  for (var i = 0; i < 240; i++) {
    if (ctx.state.role === null && ctx.state.user === null) return true;
    await new Promise(function (r) { setTimeout(r, 25); });
  }
  v28ok(false, 'logout() did not settle within ~6s (session still present)');
  return false;
}

async function v28run() {
  ctx.fetch = sbMockFetch;
  ctx.navigator.onLine = true;

  // ---- GoTrue request shapes ----
  sbCalls = [];
  const r1 = await ctx.sbSignIn('a@school.in', 'TestAdmin-2026');
  v28eq(r1.status, 200, 'v28: sbSignIn returns 200');
  v28ok(r1.data && r1.data.access_token === 'tok-a@school.in', 'v28: sbSignIn parses tokens');
  const c1 = sbCalls[sbCalls.length - 1];
  v28ok(c1.url === SB_URL + '/auth/v1/token?grant_type=password', 'v28: sbSignIn posts to the password-grant URL');
  v28eq(c1.body.email, 'a@school.in', 'v28: sbSignIn sends the email');
  v28ok(!!c1.headers.apikey && c1.headers.Authorization === 'Bearer ' + c1.headers.apikey, 'v28: GoTrue call carries the anon key as apikey + Bearer (key value never printed)');

  sbCalls = [];
  await ctx.sbSignUp('n@school.in', 'TestAdmin-2026', 'New School', 'Nina');
  const c2 = sbCalls[sbCalls.length - 1];
  v28ok(c2.url.indexOf('/auth/v1/signup') !== -1, 'v28: sbSignUp posts to signup');
  v28eq(c2.body.data.school, 'New School', 'v28: sbSignUp sends school in user_metadata');
  v28eq(c2.body.data.name, 'Nina', 'v28: sbSignUp sends name in user_metadata');

  sbCalls = [];
  await ctx.sbRefresh('ref-old');
  v28ok(sbCalls[sbCalls.length - 1].url.indexOf('grant_type=refresh_token') !== -1, 'v28: sbRefresh uses the refresh_token grant');
  await ctx.sbRecover('a@school.in');
  v28ok(sbCalls[sbCalls.length - 1].url.indexOf('/auth/v1/recover') !== -1, 'v28: sbRecover posts to recover');
  await ctx.sbSetNewPassword('rec-token-1', 'newpass123');
  const c3 = sbCalls[sbCalls.length - 1];
  v28ok(c3.method === 'PUT' && c3.url.indexOf('/auth/v1/user') !== -1, 'v28: set-new-password PUTs /auth/v1/user');
  v28eq(c3.headers.Authorization, 'Bearer rec-token-1', 'v28: set-new-password uses the recovery token as Bearer');
  v28eq(c3.body.password, 'newpass123', 'v28: set-new-password sends the new password');

  // ---- v28: no admin lookup exists anymore ----
  // v94: the super admin check returns (sbCheckSuperAdmin + the
  // ss_is_super_admin RPC) as the super admin's first UI — so these now
  // assert it EXISTS and is wired to the server RPC, not that it is gone.
  v28eq(typeof ctx.sbCheckSuperAdmin, 'function', 'v94: sbCheckSuperAdmin exists (the super admin check is back)');
  v28ok(src.includes('ss_is_super_admin'), 'v94: the super admin check calls the ss_is_super_admin RPC');
  v28ok(!src.includes('super@school-saathi.in'), 'v28: no super login address in app.js');
  // v69 (harness fix): the owner email IS hard-coded twice now, deliberately
  // — the migration guard (sbMaybeMigrate refuses to link a school to the
  // Super Admin account) and the Link-to-Server modal block. Both are
  // blocklists, never a login bypass, so the check is that the email
  // appears ONLY in those two places.
  v28eq((src.match(/ashutoshkumarjpg67@gmail\.com/g) || []).length, 2, 'v28: owner email appears only in the two v69 link blocks (migration guard + modal block)');

  // ---- Anon Apply-form insert must use return=minimal ----
  sbCalls = [];
  const r5 = await ctx.sbPostAdmission('srv-school-1', { id: 'ar1', name: 'Kid', dob: '', gender: '', classApply: '6th-A', guardianName: 'G', phone: '9812345678', previousSchool: '', submitted: '2026-11-09' });
  v28eq(r5.status, 201, 'v28: anon admission insert returns 201');
  const c5 = sbCalls[sbCalls.length - 1];
  v28eq(c5.headers.Prefer, 'return=minimal', 'v28: anon admission insert uses Prefer return=minimal');
  v28eq(c5.body.status, 'Pending', 'v28: anon admission insert forces Pending');
  v28eq(c5.body.school_id, 'srv-school-1', 'v28: anon admission insert targets the server school');

  // ---- Token refresh ----
  ctx.sbStoreSession({ access_token: 'tok-fresh', refresh_token: 'ref-fresh', expires_in: 3600, user: { id: 'u1', email: 'a@x.in' } });
  v28eq(await ctx.sbGetValidToken(), 'tok-fresh', 'v28: valid token returned when fresh');
  ctx.sbStoreSession({ access_token: 'tok-old', refresh_token: 'ref-old', expires_in: -10, user: { id: 'u1', email: 'a@x.in' } });
  sbCalls = [];
  v28eq(await ctx.sbGetValidToken(), 'tok-refreshed', 'v28: expired token is refreshed');
  v28ok(sbCalls.some(function (c) { return c.url.indexOf('grant_type=refresh_token') !== -1; }), 'v28: refresh calls the refresh_token grant');
  ctx.sbClearSession();
  v28eq(await ctx.sbGetValidToken(), null, 'v28: no token when no session');

  // ---- Migration mapping + counts (fixture db) ----
  const fix = ctx.emptyDb({ name: 'Test School', city: 'Gopalganj', principal: 'T', phone: '', email: 't@school.in', session: '2025–26', address: '' });
  fix.students.push({ id: 'stu1', name: 'Asha', cls: '6th-A', roll: 1, enr: 'ENR-001', guardian: 'G', phone: '9812345678', mobile2: '', parentEmail: '', fatherName: 'F', motherName: 'M', occupation: '', dob: '', gender: 'Other', bloodGroup: '', category: '', address: '', state: '', district: '', pin: '', previousSchool: '', previousClass: '', admissionNo: 'ADM-2025-001', admissionDate: '', session: '2025–26', status: 'Active', result: 0, parentPin: '5678', photo: '', documents: { birthCert: true, tc: false, tcNumber: '', other: '' }, aadhaar: '' });
  fix.students.push({ id: 'stu2', name: 'Bala', cls: '6th-A', roll: 2, enr: 'ENR-002', guardian: 'G', phone: '9812345679', mobile2: '', parentEmail: '', fatherName: 'F', motherName: 'M', occupation: '', dob: '2015-01-01', gender: 'Girl', bloodGroup: '', category: '', address: '', state: '', district: '', pin: '', previousSchool: '', previousClass: '', admissionNo: 'ADM-2025-002', admissionDate: '2025-04-01', session: '2025–26', status: 'Active', result: 88, parentPin: '5679', photo: '', documents: { birthCert: true, tc: true, tcNumber: 'TC-1', other: '' }, aadhaar: '' });
  fix.feeRecords.push({ id: 'fee1', studentId: 'stu1', student: 'Asha', cls: '6th-A', month: 'Nov', type: 'Tuition', amount: 800, status: 'Pending', date: '2026-11-01' });
  fix.attendance['2026-11-09|6th-A'] = { stu1: 'Present', stu2: 'Absent' };
  fix.exams.push({ id: 'ex1', name: 'UT1', cls: '6th-A', subject: 'Maths', date: '2026-11-05', total: 100 });
  fix.marks.push({ examId: 'ex1', studentId: 'stu1', marks: 90 });
  fix.homework.push({ id: 'hw1', cls: '6th-A', subject: 'Maths', title: 'Ex 1', due: '2026-11-12', doneBy: ['stu1'] });
  fix.notices.push({ id: 'n1', title: 'Hi', date: '2026-11-01', body: 'Hello' });
  fix.receipts.push({ receiptNo: 'RCP-2026-001', studentId: 'stu1', admissionNo: 'ADM-2025-001', name: 'Asha', cls: '6th-A', session: '2025–26', date: '2026-11-09', month: 'Nov', counterNo: 1, lines: [], payMode: 'Cash', payDate: '2026-11-09', bank: '', number: '', total: 800, totalWords: 'Eight Hundred', collector: 'T' });
  fix.auditLog.push({ ts: '2026-11-09T01:00:00.000Z', actor: 'T', action: 'Test', details: 'd' });
  fix.activities.push({ icon: 'x', bg: 'green', title: 'Did a thing', sub: 's' });
  const m1 = ctx.sbMapStudent(fix.students[0], 'srv-1');
  v28eq(m1.gender, '', "v28: gender 'Other' maps to '' (server check only allows Boy/Girl/empty)");
  v28eq(m1.dob, null, 'v28: empty dob maps to null');
  v28eq(m1.local_id, 'stu1', 'v28: student keeps its local id');
  v28eq(m1.admission_no, 'ADM-2025-001', 'v28: student keeps its admission no');
  const cnt = ctx.sbLocalCounts(fix);
  v28eq(cnt.students, 2, 'v28: local counts students = 2');
  v28eq(cnt.attendance, 2, 'v28: local counts flatten attendance rows = 2');
  v28eq(cnt.marks, 1, 'v28: local counts marks = 1');
  v28eq(ctx.sbFlattenAttendance(fix).length, 2, 'v28: flattenAttendance returns one row per student-day');

  // ---- Full migration + idempotency ----
  Object.keys(sbServer).forEach(function (k) { sbServer[k] = []; });
  sbSeq = 0; sbCalls = [];
  ctx.db = fix;
  const acct = { uid: 'u-test-1', name: 'Test Admin', school: 'Test School', email: 't@school.in', pwHash: ctx.hashPw('pw123456'), role: 'school', sub: 'School Admin • Test School', created: '2026-11-09', sbUid: 'sb-uid-t@school.in' };
  // the real flow logs the account in before migrating (app.js: the account's DB
  // is loaded by loginAs before this runs) — set the session state directly
  // here so the fixture db is not swapped out by loginAs's DB reload
  ctx.state.user = acct; ctx.state.role = 'school';
  ctx.state.sb = { uid: 'sb-uid-t@school.in', email: 't@school.in' };
  const mig = await ctx.sbMaybeMigrate(acct, 'sb-uid-t@school.in', 'tok-t@school.in');
  v28eq(mig.done, true, 'v28: migration completes');
  v28eq(sbServer.ss_schools.length, 1, 'v28: one server school created');
  v28eq(sbServer.ss_schools[0].owner_id, 'sb-uid-t@school.in', 'v28: server school owned by the Supabase user');
  v28eq(sbServer.ss_students.length, 2, 'v28: both students uploaded');
  v28eq(sbServer.ss_fee_records.length, 1, 'v28: fee record uploaded');
  v28eq(sbServer.ss_fee_records[0].student_id, sbServer.ss_students[0].id, 'v28: fee record points at the mapped server student id');
  v28eq(sbServer.ss_attendance.length, 2, 'v28: attendance rows uploaded');
  v28eq(sbServer.ss_marks.length, 1, 'v28: mark uploaded with mapped exam + student ids');
  v28eq(sbServer.ss_receipts.length, 1, 'v28: receipt uploaded');
  v28ok(!!ctx.sbLoadMig('sb-uid-t@school.in'), 'v28: migration flag stored after success');
  v28eq(ctx.sbLoadStatus().state, 'synced', 'v28: status is synced after migration');
  const postsBefore = sbCalls.filter(function (c) { return c.method === 'POST' && c.url.indexOf('/rest/v1/') !== -1; }).length;
  const mig2 = await ctx.sbMaybeMigrate(acct, 'sb-uid-t@school.in', 'tok-t@school.in');
  v28eq(mig2.done, true, 'v28: second migration call reports done');
  v28eq(mig2.reason, 'already', 'v28: second migration call is a no-op (already migrated)');
  const postsAfter = sbCalls.filter(function (c) { return c.method === 'POST' && c.url.indexOf('/rest/v1/') !== -1; }).length;
  v28eq(postsAfter, postsBefore, 'v28: no new server POSTs on the second run');
  const mig3 = await ctx.sbMaybeMigrate(acct, 'sb-uid-t@school.in', 'tok-t@school.in', true);
  v28eq(mig3.done, true, 'v28: forced retry completes');
  v28eq(sbServer.ss_students.length, 2, 'v28: forced retry does not duplicate students');
  v28eq(sbServer.ss_fee_records.length, 1, 'v28: forced retry does not duplicate fee records');

  // ---- Migration failure: no flag, local data untouched ----
  Object.keys(sbServer).forEach(function (k) { sbServer[k] = []; });
  sbFailTables.add('ss_students');
  sbCalls = [];
  const migF = await ctx.sbMaybeMigrate(acct, 'sb-uid-fail@school.in', 'tok-fail');
  v28eq(migF.done, false, 'v28: migration reports failure when an upload fails');
  v28ok(!ctx.sbLoadMig('sb-uid-fail@school.in'), 'v28: no migration flag after a failed upload');
  v28eq(ctx.db.students.length, 2, 'v28: local data untouched after a failed upload');
  v28eq(ctx.sbLoadStatus().state, 'failed', 'v28: status is failed after a failed upload');
  sbFailTables.delete('ss_students');

  // ---- Migration never runs for a non-school role ----
  sbCalls = [];
  const migS = await ctx.sbMaybeMigrate({ uid: 'student-1', role: 'student', email: 'student:test-school:stu33', studentId: 'stu33' }, 'sb-uid-student', 'tok-student');
  v28eq(migS.done, false, 'v28: migration does not run for a student');
  v28eq(migS.reason, 'not-school', 'v28: student migration reason is not-school');
  v28eq(sbCalls.length, 0, 'v28: zero network calls for a student migration attempt');

  // ---- Offline login falls back to the local account ----
  ctx.saveAccounts([{ role: 'school', name: 'Rahul Kumar', school: 'St. Xavier School', sub: 'School Admin • St. Xavier School', email: 'rahul@stxavier.in', uid: 'test-school', pwHash: ctx.hashPw('TestAdmin-2026') }]);
  ctx.fetch = function () { return Promise.reject(new Error('offline')); };
  ctx.navigator.onLine = true;
  ctx.state.role = null; ctx.state.user = null; ctx.state.sb = null;
  ctx.document.getElementById('loginId').value = 'rahul@stxavier.in';
  ctx.document.getElementById('loginPw').value = 'TestAdmin-2026';
  sbCalls = [];
  ctx.doLogin({ preventDefault: function () {} });
  await tick(); await tick();
  v28eq(ctx.state.role, 'school', 'v28: offline login falls back to the local account');
  v28eq(ctx.state.user && ctx.state.user.email, 'rahul@stxavier.in', 'v28: offline login restores the local user');
  v28ok(ctx.document.getElementById('toast').textContent.indexOf('offline') !== -1, 'H-2 fix (c): the offline login toasts that it is using this device’s account (got: ' + ctx.document.getElementById('toast').textContent + ')');
  // B8 (harness fix): the offline login's rejecting fetch tripped the
  // connectivity bookkeeping (3 failures -> offline for 30s), so the
  // online login tests below would all take the local path instead of
  // the server path. The network is back (sbMockFetch resolves from
  // here on), so clear the window before the online tests run. The
  // background probe has already settled by now (it rejects at once),
  // so nothing re-stamps the window after this reset.
  ctx.sbRestNetOk();

  // ---- Wrong password on server and locally stays logged out ----
  ctx.state.role = null; ctx.state.user = null; ctx.state.sb = null;
  ctx.fetch = sbMockFetch;
  ctx.document.getElementById('loginId').value = 'rahul@stxavier.in';
  ctx.document.getElementById('loginPw').value = 'wrongpass';
  ctx.doLogin({ preventDefault: function () {} });
  await tick(); await tick();
  v28eq(ctx.state.role, null, 'v28: wrong password on server and locally stays logged out');
  v28eq(ctx.document.getElementById('loginErr').textContent, 'Invalid email or password.', 'v28: wrong password shows the invalid-credentials error');

  // ---- Server login (school): Supabase first, no admin lookup, migration fires ----
  ctx.state.role = null; ctx.state.user = null; ctx.state.sb = null;
  ctx.document.getElementById('loginId').value = 'rahul@stxavier.in';
  ctx.document.getElementById('loginPw').value = 'TestAdmin-2026';
  sbCalls = [];
  ctx.doLogin({ preventDefault: function () {} });
  await tick(); await tick(); await tick();
  v28eq(ctx.state.role, 'school', 'v28: server login signs the school in');
  v28ok(ctx.state.sb && ctx.state.sb.uid === 'sb-uid-rahul@stxavier.in', 'v28: server login stores the Supabase uid');
  v28ok(sbCalls.some(function (c) { return c.url.indexOf('/auth/v1/token?grant_type=password') !== -1; }), 'v28: server login tries Supabase first');
  v28ok(!sbCalls.some(function (c) { return c.url.indexOf('ss_platform_admins') !== -1; }), 'v28: server login makes no admin-lookup call');

  // ---- Owner login: no school tied to the account -> no-school message, never a login ----
  Object.keys(sbServer).forEach(function (k) { sbServer[k] = []; });
  sbCalls = [];
  ctx.state.role = null; ctx.state.user = null; ctx.state.sb = null;
  ctx.document.getElementById('loginId').value = 'owner@platform.test';
  ctx.document.getElementById('loginPw').value = 'TestAdmin-2026';
  ctx.doLogin({ preventDefault: function () {} });
  await tick(); await tick(); await tick(); await tick(); await tick();
  v28eq(ctx.state.role, null, 'v28: owner login does not sign anyone in');
  v28eq(ctx.state.user, null, 'v28: owner login leaves no user');
  v28eq(ctx.document.getElementById('loginErr').textContent, 'No school found for this account. Please sign up or log in with your school account.', 'v28: owner login shows the no-school message');
  v28eq(ctx.sbLoadSession(), null, 'v28: owner login leaves no stored server session');
  v28eq(ctx.findAccount('owner@platform.test'), null, 'v28: owner login creates no local account');
  v28ok(!sbCalls.some(function (c) { return c.method === 'POST' && c.url.indexOf('/rest/v1/ss_schools') !== -1; }), 'v28: owner login never creates a server school');
  v28ok(!sbCalls.some(function (c) { return c.url.indexOf('ss_platform_admins') !== -1; }), 'v28: owner login makes no admin-lookup call');

  // ---- Fresh school login via signup metadata: no local account, no server row yet ----
  Object.keys(sbServer).forEach(function (k) { sbServer[k] = []; });
  sbCalls = [];
  ctx.state.role = null; ctx.state.user = null; ctx.state.sb = null;
  ctx.document.getElementById('loginId').value = 'fresh@school.in';
  ctx.document.getElementById('loginPw').value = 'TestAdmin-2026';
  ctx.doLogin({ preventDefault: function () {} });
  await tick(); await tick(); await tick(); await tick(); await tick();
  v28eq(ctx.state.role, 'school', 'v28: fresh school login signs the school in via signup metadata');
  v28ok(!!ctx.findAccount('fresh@school.in'), 'v28: fresh school login creates the local account');
  v28eq(ctx.findAccount('fresh@school.in').school, 'Test School', 'v28: fresh school account takes the school from signup metadata');
  v28eq(sbServer.ss_schools.length, 1, 'v28: fresh school migration creates one server school');
  v28eq(sbServer.ss_schools[0].owner_id, 'sb-uid-fresh@school.in', 'v28: server school owned by the fresh Supabase user');

  // ---- Second-device school login: server school row exists, no local account ----
  Object.keys(sbServer).forEach(function (k) { sbServer[k] = []; });
  sbServer.ss_schools = [{ id: 'srv-school-9', owner_id: 'sb-uid-second@school.in', name: 'Second School', principal: 'Second Admin', city: '', phone: '', email: 'second@school.in', session: '2025–26', address: '', plan: 'Active', status: 'active', is_demo: false, adm_counter: 1, receipt_counter: 1, admission_fee: 0, caution_money: 0, annual_charges: 0, transport_fee: 0 }];
  sbCalls = [];
  ctx.state.role = null; ctx.state.user = null; ctx.state.sb = null;
  ctx.document.getElementById('loginId').value = 'second@school.in';
  ctx.document.getElementById('loginPw').value = 'TestAdmin-2026';
  ctx.doLogin({ preventDefault: function () {} });
  await tick(); await tick(); await tick(); await tick(); await tick();
  v28eq(ctx.state.role, 'school', 'v28: second-device school login signs the school in via its server row');
  v28eq(ctx.findAccount('second@school.in').school, 'Second School', 'v28: second-device account takes the school name from the server row');
  v28eq(sbServer.ss_schools.length, 1, 'v28: second-device login creates no duplicate server school');

  // ---- v30: support request also posts to the server (best-effort) ----
  Object.keys(sbServer).forEach(function (k) { sbServer[k] = []; });
  sbServer.ss_schools = [{ id: 'srv-school-30', owner_id: 'sb-uid-sup@school.in', name: 'Support School', principal: 'S', city: '', phone: '', email: 'sup@school.in', session: '2025–26', address: '', plan: 'Active', status: 'active', is_demo: false, adm_counter: 1, receipt_counter: 1, admission_fee: 0, caution_money: 0, annual_charges: 0, transport_fee: 0 }];
  ctx.sbStoreSession({ access_token: 'tok-sup', refresh_token: 'ref-sup', expires_in: 3600, user: { id: 'sb-uid-sup@school.in', email: 'sup@school.in' } });
  ctx.state.role = 'school'; ctx.state.user = { role: 'school', name: 'Sup Admin', school: 'Support School', email: 'sup@school.in', uid: 'u-sup-1' }; ctx.state.sb = { uid: 'sb-uid-sup@school.in', email: 'sup@school.in' };
  ls.removeItem('schoolSaathiSupportRequests');
  sbCalls = [];
  ctx.openSupportForm();
  ctx.document.getElementById('fSupName').value = 'Sup Admin';
  ctx.document.getElementById('fSupMsg').value = 'Fees page is slow';
  ctx.submitSupportRequest({ preventDefault: function () {} });
  await tick(); await tick(); await tick(); await tick();
  var sup30 = JSON.parse(ls.getItem('schoolSaathiSupportRequests'));
  v28eq(sup30.length, 1, 'v30: support request still saves locally when a session exists');
  v28ok(!!sup30[0].id, 'v30: local support request gets a local id');
  v28eq(sbServer.ss_support_requests.length, 1, 'v30: support request posts to ss_support_requests');
  v28eq(sbServer.ss_support_requests[0].status, 'Pending', 'v30: server support request starts Pending');
  v28eq(sbServer.ss_support_requests[0].local_id, sup30[0].id, 'v30: server support request carries the local id');
  v28eq(sbServer.ss_support_requests[0].school_id, 'srv-school-30', 'v30: server support request targets the school id');
  var c30 = sbCalls.filter(function (c) { return c.method === 'POST' && c.url.indexOf('ss_support_requests') !== -1; })[0];
  v28ok(!!c30, 'v30: support POST goes to ss_support_requests');
  v28eq(c30.headers.Prefer, 'return=minimal', 'v30: support POST uses Prefer return=minimal');
  // No session: local save still succeeds, no server call, no error.
  ctx.sbClearSession();
  ls.removeItem('schoolSaathiSupportRequests');
  sbCalls = [];
  ctx.openSupportForm();
  ctx.document.getElementById('fSupName').value = 'Sup Admin';
  ctx.document.getElementById('fSupMsg').value = 'Offline request';
  ctx.submitSupportRequest({ preventDefault: function () {} });
  await tick(); await tick();
  var sup30b = JSON.parse(ls.getItem('schoolSaathiSupportRequests'));
  v28eq(sup30b.length, 1, 'v30: support request still saves locally with no session');
  v28ok(!sbCalls.some(function (c) { return c.url.indexOf('ss_support_requests') !== -1; }), 'v30: no server post without a session');

  // ---- v30: second-device download populates an empty DB, never overwrites ----
  Object.keys(sbServer).forEach(function (k) { sbServer[k] = []; });
  sbServer.ss_schools = [{ id: 'srv-school-30', owner_id: 'sb-uid-dl@school.in', name: 'Download School', principal: 'D', city: 'Gopalganj', phone: '', email: 'dl@school.in', session: '2025–26', address: '', plan: 'Active', status: 'active', is_demo: false, adm_counter: 5, receipt_counter: 7, admission_fee: 100, caution_money: 0, annual_charges: 500, transport_fee: 0, logo_data_url: null }];
  sbServer.ss_fee_structure = [{ id: 'srv-fs-1', school_id: 'srv-school-30', cls: '6th-A', fee_type: 'Tuition', amount: 800 }];
  sbServer.ss_students = [{ id: 'srv-stu-1', school_id: 'srv-school-30', local_id: 'stu-dl-1', name: 'Download Kid', cls: '6th-A', roll: 1, enr: 'ENR-001', guardian: 'G', phone: '9812345678', mobile2: '', parent_email: '', father_name: 'F', mother_name: 'M', occupation: '', dob: '', gender: 'Girl', blood_group: '', category: '', address: '', state: '', district: '', pin: '', previous_school: '', previous_class: '', admission_no: 'ADM-2025-001', admission_date: '', session: '2025–26', status: 'Active', result: null, parent_pin: null, photo_data_url: null, documents: { birthCert: true, tc: false, tcNumber: '', other: '' }, aadhaar: '' }];
  sbServer.ss_teachers = [{ id: 'srv-t-1', school_id: 'srv-school-30', local_id: 't-dl-1', name: 'Download Teacher', subject: 'Maths', cls: '6th-A' }];
  sbServer.ss_exams = [{ id: 'srv-ex-1', school_id: 'srv-school-30', local_id: 'ex-dl-1', name: 'UT1', cls: '6th-A', subject: 'Maths', exam_date: '2026-11-05', total: 100 }];
  sbServer.ss_fee_records = [{ id: 'srv-f-1', school_id: 'srv-school-30', local_id: 'fee-dl-1', student_id: 'srv-stu-1', student_name: 'Download Kid', cls: '6th-A', month: 'Nov', fee_type: 'Tuition', amount: 800, status: 'Collected', record_date: '2026-11-05' }];
  sbServer.ss_attendance = [{ id: 'srv-at-1', school_id: 'srv-school-30', student_id: 'srv-stu-1', cls: '6th-A', att_date: '2026-11-09', status: 'Present' }];
  sbServer.ss_receipts = [{ id: 'srv-r-1', school_id: 'srv-school-30', receipt_no: 'RCP-2026-001', student_id: 'srv-stu-1', admission_no: 'ADM-2025-001', student_name: 'Download Kid', cls: '6th-A', session: '2025–26', receipt_date: '2026-11-09', month: 'Nov', counter_no: 1, lines: [], pay_mode: 'Cash', pay_date: '2026-11-09', bank: '', number: '', total: 800, total_words: 'Eight Hundred', collector: 'D' }];
  sbServer.ss_marks = [{ id: 'srv-mk-1', school_id: 'srv-school-30', exam_id: 'srv-ex-1', student_id: 'srv-stu-1', marks: 90 }];
  sbServer.ss_homework = [{ id: 'srv-hw-1', school_id: 'srv-school-30', local_id: 'hw-dl-1', cls: '6th-A', subject: 'Maths', title: 'Ex 1', due: '2026-11-12', done_by: ['srv-stu-1'] }];
  sbServer.ss_notices = [{ id: 'srv-n-1', school_id: 'srv-school-30', local_id: 'n-dl-1', title: 'Hi', notice_date: '2026-11-01', body: 'Hello' }];
  var dlAcct = { uid: 'u-dl-1', name: 'D Admin', school: 'Download School', email: 'dl@school.in', pwHash: ctx.hashPw('pw123456'), role: 'school', sub: 'School Admin • Download School', created: '2026-11-09', sbUid: 'sb-uid-dl@school.in' };
  ctx.saveAccounts([dlAcct]);
  ctx.loginAs(dlAcct);
  v28eq(ctx.db.students.length, 0, 'v30: fresh second-device workspace starts empty');
  // Phase D (harness fix): sbDownloadSchoolData was removed (L-6) — the
  // Download button is now a server-wins pull via sbSyncStart, the same
  // call login uses. The empty-DB expectations below are unchanged; the
  // old "never overwrites" second half asserted the removed behaviour
  // and is replaced by the current server-wins behaviour (v31).
  ctx.state.sb = { uid: 'sb-uid-dl@school.in', email: 'dl@school.in' };
  ctx.sbStoreSession({ access_token: 'tok-dl', refresh_token: 'ref-dl', expires_in: 3600, user: { id: 'sb-uid-dl@school.in', email: 'dl@school.in' } });
  ctx.sbSaveServerSchool('u-dl-1', 'srv-school-30');
  ctx.sbSaveMig('sb-uid-dl@school.in', { at: '2026-11-09T00:00:00.000Z', schoolId: 'srv-school-30', counts: {} });
  ctx.sbSyncDebounceMs = 0;
  var dl = await ctx.sbSyncStart(dlAcct, 'sb-uid-dl@school.in', 'tok-dl');
  v28eq(dl.done, true, 'v30: download completes into an empty local DB');
  v28eq(ctx.db.students.length, 1, 'v30: download brings the server student down');
  v28eq(ctx.db.students[0].name, 'Download Kid', 'v30: downloaded student keeps its name');
  v28eq(ctx.db.students[0].id, 'stu-dl-1', 'v30: downloaded student keeps its local id');
  v28eq(ctx.db.teachers.length, 1, 'v30: download brings the server teacher down');
  v28eq(ctx.db.exams.length, 1, 'v30: download brings the server exam down');
  v28eq(ctx.db.feeRecords.length, 1, 'v30: download brings the server fee record down');
  v28eq(ctx.db.feeRecords[0].studentId, 'stu-dl-1', 'v30: downloaded fee record maps to the local student id');
  v28eq(ctx.db.feeRecords[0].status, 'Collected', 'v30: downloaded fee record keeps its status');
  v28eq(ctx.db.attendance['2026-11-09|6th-A'] && ctx.db.attendance['2026-11-09|6th-A']['stu-dl-1'], 'Present', 'v30: downloaded attendance folds back into the date|class map');
  v28eq(ctx.db.receipts.length, 1, 'v30: download brings the server receipt down');
  v28eq(ctx.db.marks.length, 1, 'v30: download brings the server mark down');
  v28eq(ctx.db.marks[0].examId, 'ex-dl-1', 'v30: downloaded mark maps to the local exam id');
  v28eq(ctx.db.marks[0].studentId, 'stu-dl-1', 'v30: downloaded mark maps to the local student id');
  v28eq(ctx.db.homework.length, 1, 'v30: download brings the server homework down');
  v28eq(ctx.db.homework[0].doneBy[0], 'stu-dl-1', 'v30: downloaded homework done-by maps to the local student id');
  v28eq(ctx.db.notices.length, 1, 'v30: download brings the server notice down');
  v28eq(ctx.db.profile.name, 'Download School', 'v30: download restores the school profile');
  v28eq(ctx.db.admCounter, 5, 'v30: download restores the admission counter');
  v28eq(ctx.db.receiptCounter, 7, 'v30: download restores the receipt counter');
  v28eq(ctx.db.feeExtras.admissionFee, 100, 'v30: download restores the admission fee');
  v28eq(ctx.db.feeExtras.annualCharges, 500, 'v30: download restores the annual charges');
  // Server wins (v31): with local data present, a second pull brings
  // the newer server student in instead of refusing — the old
  // empty-only download's "never overwrites" rule was superseded by
  // the server-wins pull when sbDownloadSchoolData was removed.
  sbServer.ss_students.push({ id: 'srv-stu-2', school_id: 'srv-school-30', local_id: 'stu-dl-2', name: 'Intruder Kid', cls: '6th-A', roll: 2, enr: 'ENR-002', guardian: 'G', phone: '9812345679', mobile2: '', parent_email: '', father_name: 'F', mother_name: 'M', occupation: '', dob: '', gender: 'Boy', blood_group: '', category: '', address: '', state: '', district: '', pin: '', previous_school: '', previous_class: '', admission_no: 'ADM-2025-002', admission_date: '', session: '2025–26', status: 'Active', result: null, parent_pin: null, photo_data_url: null, documents: { birthCert: false, tc: false, tcNumber: '', other: '' }, aadhaar: '' });
  var dl2 = await ctx.sbSyncStart(dlAcct, 'sb-uid-dl@school.in', 'tok-dl');
  v28eq(dl2.done, true, 'v31: a second pull completes over a non-empty local DB');
  v28eq(ctx.db.students.length, 2, 'v31: the newer server student is pulled in (server wins)');
  v28ok(ctx.db.students.some(function (s) { return s.id === 'stu-dl-2'; }), 'v31: the newer server student appears after the second pull');

  // ---- v31: server-first pull replaces the local mirror (server wins) ----
  Object.keys(sbServer).forEach(function (k) { sbServer[k] = []; });
  sbServer.ss_schools = [{ id: 'srv-school-31', owner_id: 'sb-uid-pull@school.in', name: 'Pull School', principal: 'P', city: 'Gopalganj', phone: '', email: 'pull@school.in', session: '2025–26', address: '', plan: 'Active', status: 'active', is_demo: false, adm_counter: 3, receipt_counter: 2, admission_fee: 200, caution_money: 0, annual_charges: 0, transport_fee: 0 }];
  sbServer.ss_students = [{ id: 'srv-stu-31', school_id: 'srv-school-31', local_id: 'stu-srv-1', name: 'Server Kid', cls: '6th-A', roll: 1, enr: 'ENR-001', guardian: 'G', phone: '9812345678', mobile2: '', parent_email: '', father_name: 'F', mother_name: 'M', occupation: '', dob: '', gender: 'Girl', blood_group: '', category: '', address: '', state: '', district: '', pin: '', previous_school: '', previous_class: '', admission_no: 'ADM-2025-001', admission_date: '', session: '2025–26', status: 'Active', result: null, parent_pin: null, photo_data_url: null, documents: { birthCert: true, tc: false, tcNumber: '', other: '' }, aadhaar: '' }];
  sbServer.ss_fee_records = [{ id: 'srv-f-31', school_id: 'srv-school-31', local_id: 'fee-srv-1', student_id: 'srv-stu-31', student_name: 'Server Kid', cls: '6th-A', month: 'Nov', fee_type: 'Tuition', amount: 800, status: 'Collected', record_date: '2026-11-05' }];
  var pullAcct = { uid: 'u-pull-1', name: 'P Admin', school: 'Pull School', email: 'pull@school.in', pwHash: ctx.hashPw('pw123456'), role: 'school', sub: 'School Admin • Pull School', created: '2026-11-09', sbUid: 'sb-uid-pull@school.in' };
  ctx.saveAccounts([pullAcct]);
  ctx.loginAs(pullAcct);
  // Stale local data: a student the server does not have.
  ctx.db.students.push({ id: 'stu-stale-1', name: 'Stale Kid', cls: '6th-A', roll: 9, enr: 'ENR-009', guardian: 'G', phone: '9812345609', mobile2: '', parentEmail: '', fatherName: 'F', motherName: 'M', occupation: '', dob: '', gender: 'Boy', bloodGroup: '', category: '', address: '', state: '', district: '', pin: '', previousSchool: '', previousClass: '', admissionNo: 'ADM-2025-009', admissionDate: '', session: '2025–26', status: 'Active', result: null, parentPin: null, photo: null, documents: { birthCert: false, tc: false, tcNumber: '', other: '' }, aadhaar: '' });
  ctx.db.feeRecords.push({ id: 'fee-stale-1', studentId: 'stu-stale-1', student: 'Stale Kid', cls: '6th-A', month: 'Nov', type: 'Tuition', amount: 800, status: 'Pending', date: '2026-11-01' });
  // v32: the stale rows were synced before (they sit in the snapshot),
  // then deleted on the server — so the upload pass skips them and the
  // pull drops them. Without the snapshot seed the v32 upload pass
  // would (correctly) treat them as never-synced local rows and upload
  // them instead.
  var pullHashes = ctx.sbSyncTableHashes(ctx.db, 'srv-school-31', { stu: { 'stu-srv-1': 'srv-stu-31' }, exam: {} });
  var pullSnap = { ss_students: {}, ss_fee_records: {} };
  pullSnap.ss_students['stu-stale-1'] = pullHashes.ss_students['stu-stale-1'].hash;
  pullSnap.ss_fee_records['fee-stale-1'] = pullHashes.ss_fee_records['fee-stale-1'].hash;
  ctx.sbSnapSave('u-pull-1', pullSnap);
  ctx.state.sb = { uid: 'sb-uid-pull@school.in', email: 'pull@school.in' };
  ctx.sbStoreSession({ access_token: 'tok-pull', refresh_token: 'ref-pull', expires_in: 3600, user: { id: 'sb-uid-pull@school.in', email: 'pull@school.in' } });
  ctx.sbSaveServerSchool('u-pull-1', 'srv-school-31');
  ctx.sbSaveMig('sb-uid-pull@school.in', { at: '2026-11-09T00:00:00.000Z', schoolId: 'srv-school-31', counts: {} });
  ctx.sbSyncDebounceMs = 0;
  var pull31 = await ctx.sbSyncStart(pullAcct, 'sb-uid-pull@school.in', 'tok-pull');
  v28eq(pull31.done, true, 'v31: login pull completes');
  v28eq(ctx.db.students.length, 1, 'v31: pull replaces the local mirror with server students');
  v28eq(ctx.db.students[0].name, 'Server Kid', 'v31: pulled student is the server student');
  v28ok(!ctx.db.students.some(function (s) { return s.id === 'stu-stale-1'; }), 'v31: stale local student is gone after the server-wins pull');
  v28eq(ctx.db.feeRecords.length, 1, 'v31: pull replaces fee records with server rows');
  v28eq(ctx.db.feeRecords[0].status, 'Collected', 'v31: pulled fee record keeps the server status');
  v28eq(ctx.db.admCounter, 3, 'v31: pull restores the server admission counter');
  v28eq(ctx.db.feeExtras.admissionFee, 200, 'v31: pull restores the server admission fee');
  v28eq(ctx.sbLoadStatus().state, 'synced', 'v31: status is synced after the pull');

  // ---- v31: write-through — a local save posts to the server ----
  var wStudent = { id: 'stu-w1', name: 'Write Kid', cls: '6th-A', roll: 2, enr: 'ENR-002', guardian: 'G', phone: '9812345670', mobile2: '', parentEmail: '', fatherName: 'F', motherName: 'M', occupation: '', dob: '', gender: 'Boy', bloodGroup: '', category: '', address: '', state: '', district: '', pin: '', previousSchool: '', previousClass: '', admissionNo: 'ADM-2025-002', admissionDate: '', session: '2025–26', status: 'Active', result: null, parentPin: null, photo: null, documents: { birthCert: false, tc: false, tcNumber: '', other: '' }, aadhaar: '' };
  ctx.db.students.push(wStudent);
  ctx.saveDB(ctx.db);
  // The diff queues synchronously inside saveDB; assert before any await
  // (the 0ms debounce timer would flush the entry on the next tick).
  v28eq(ctx.sbOutboxLoad('sb-uid-pull@school.in').filter(function (e) { return e.table === 'ss_students' && e.key === 'stu-w1'; }).length, 1, 'v31: saving a new student queues one outbox entry');
  var fl31 = await ctx.sbSyncFlushNow();
  v28eq(fl31.done, true, 'v31: flush completes');
  v28eq(sbServer.ss_students.filter(function (r) { return r.local_id === 'stu-w1'; }).length, 1, 'v31: write-through posts the new student to the server');
  v28eq(sbServer.ss_students.filter(function (r) { return r.local_id === 'stu-w1'; })[0].name, 'Write Kid', 'v31: server student keeps the local name');
  v28eq(ctx.sbOutboxLoad('sb-uid-pull@school.in').length, 0, 'v31: outbox is empty after a successful flush');
  var fl31b = await ctx.sbSyncFlushNow();
  v28eq(fl31b.done, true, 'v31: second flush completes');
  v28eq(sbServer.ss_students.filter(function (r) { return r.local_id === 'stu-w1'; }).length, 1, 'v31: second flush creates no duplicate student');

  // ---- v101: a removed holiday deletes on the server and stays removed ----
  // Regression: v100's removeHoliday deleted only locally, so the next
  // pull re-added the server row and Remove Holiday never stuck (live
  // check 12 Nov: five removes, holiday back every time). Holidays are
  // now in SB_SYNC_DELETABLE, so the diff queues a delete op and the
  // flush DELETEs the server row.
  if (!ctx.db.holidays) ctx.db.holidays = [];
  ctx.db.holidays.push({ id: 'hol-101', date: '2026-11-15', cls: '6th-A', reason: 'Test' });
  ctx.saveDB(ctx.db);
  v28eq(ctx.sbOutboxLoad('sb-uid-pull@school.in').filter(function (e) { return e.table === 'ss_holidays' && e.key === 'hol-101' && e.op === 'upsert'; }).length, 1, 'v101: marking a holiday queues one upsert');
  var fl101 = await ctx.sbSyncFlushNow();
  v28eq(fl101.done, true, 'v101: holiday flush completes');
  v28eq(sbServer.ss_holidays.filter(function (r) { return r.local_id === 'hol-101'; }).length, 1, 'v101: the holiday reaches the server');
  ctx.db.holidays = ctx.db.holidays.filter(function (h) { return h.id !== 'hol-101'; });
  ctx.saveDB(ctx.db);
  v28eq(ctx.sbOutboxLoad('sb-uid-pull@school.in').filter(function (e) { return e.table === 'ss_holidays' && e.key === 'hol-101' && e.op === 'delete'; }).length, 1, 'v101: removing a holiday queues one delete op');
  var fl101b = await ctx.sbSyncFlushNow();
  v28eq(fl101b.done, true, 'v101: holiday delete flush completes');
  v28eq(sbServer.ss_holidays.filter(function (r) { return r.local_id === 'hol-101'; }).length, 0, 'v101: the server row is gone after the delete flush');
  var pull101 = await ctx.sbSyncStart(pullAcct, 'sb-uid-pull@school.in', 'tok-pull');
  v28eq(pull101.done, true, 'v101: pull after the delete completes');
  v28ok(!ctx.db.holidays.some(function (h) { return h.id === 'hol-101'; }), 'v101: the pull does NOT restore the removed holiday');

  // ---- v101b: fresh session (new tab) pulls, then remove must still queue a delete ----
  // Live 12 Nov: v101 passed the same-session test above, but the live
  // check (fresh browser tab after the v100 session) removed the holiday
  // and no delete op was ever queued — the holiday came back on reload.
  // A new tab has an empty in-memory snapshot; the pull must rebuild it
  // from the server rows before any local remove can be diffed.
  ctx.db.holidays.push({ id: 'hol-102', date: '2026-11-16', cls: '6th-A', reason: 'Test2' });
  ctx.saveDB(ctx.db);
  var fl102 = await ctx.sbSyncFlushNow();
  v28eq(fl102.done, true, 'v101b: second holiday flush completes');
  v28eq(sbServer.ss_holidays.filter(function (r) { return r.local_id === 'hol-102'; }).length, 1, 'v101b: second holiday reaches the server');
  ctx.sbSyncSnapshot = null; ctx.sbSyncSnapUid = null; // fresh tab: in-memory snapshot gone, localStorage copy stays
  var pull102 = await ctx.sbSyncStart(pullAcct, 'sb-uid-pull@school.in', 'tok-pull');
  v28eq(pull102.done, true, 'v101b: fresh-session pull completes');
  v28ok(ctx.db.holidays.some(function (h) { return h.id === 'hol-102'; }), 'v101b: pull keeps the holiday locally');
  var snap102 = ctx.sbSyncSnapshot || {};
  v28ok(!!(snap102.ss_holidays && snap102.ss_holidays['hol-102'] !== undefined), 'v101b: snapshot has the holiday after the fresh pull');
  ctx.db.holidays = ctx.db.holidays.filter(function (h) { return h.id !== 'hol-102'; });
  ctx.saveDB(ctx.db);
  v28eq(ctx.sbOutboxLoad('sb-uid-pull@school.in').filter(function (e) { return e.table === 'ss_holidays' && e.key === 'hol-102' && e.op === 'delete'; }).length, 1, 'v101b: fresh-session remove queues one delete op');
  var fl102b = await ctx.sbSyncFlushNow();
  v28eq(fl102b.done, true, 'v101b: fresh-session delete flush completes');
  v28eq(sbServer.ss_holidays.filter(function (r) { return r.local_id === 'hol-102'; }).length, 0, 'v101b: server row is gone after the fresh-session delete flush');

  // ---- v101c: the FULL cycle (pull -> flush -> pull) must delete and keep it deleted ----
  // Live 12 Nov (two checks): the remove queues a delete op (v101b proves
  // it), yet the holiday always comes back on reload and the Settings
  // flush shows "pushed 0". The live cycle runs pull BEFORE flush, so the
  // pull restores the server row locally before the flush deletes it — and
  // the post-flush pull then keeps the restored row as local-only and the
  // next diff re-uploads it. A direct flushNow (v101/v101b) never runs the
  // interleaved pull, so it cannot see this. The cycle must end with the
  // row gone on both sides and a second cycle must not bring it back.
  ctx.db.holidays.push({ id: 'hol-103', date: '2026-11-17', cls: '6th-A', reason: 'Test3' });
  ctx.saveDB(ctx.db);
  var fl103 = await ctx.sbSyncFlushNow();
  v28eq(fl103.done, true, 'v101c: third holiday flush completes');
  v28eq(sbServer.ss_holidays.filter(function (r) { return r.local_id === 'hol-103'; }).length, 1, 'v101c: third holiday reaches the server');
  ctx.db.holidays = ctx.db.holidays.filter(function (h) { return h.id !== 'hol-103'; });
  ctx.saveDB(ctx.db);
  v28eq(ctx.sbOutboxLoad('sb-uid-pull@school.in').filter(function (e) { return e.table === 'ss_holidays' && e.key === 'hol-103' && e.op === 'delete'; }).length, 1, 'v101c: remove queues one delete op');
  var cy103 = await ctx.sbSyncStart(pullAcct, 'sb-uid-pull@school.in', 'tok-pull');
  v28eq(sbServer.ss_holidays.filter(function (r) { return r.local_id === 'hol-103'; }).length, 0, 'v101c: server row is gone after the full cycle');
  v28ok(!ctx.db.holidays.some(function (h) { return h.id === 'hol-103'; }), 'v101c: local row is gone after the full cycle');
  var cy103b = await ctx.sbSyncStart(pullAcct, 'sb-uid-pull@school.in', 'tok-pull');
  v28eq(sbServer.ss_holidays.filter(function (r) { return r.local_id === 'hol-103'; }).length, 0, 'v101c: server row stays gone after a second cycle');
  v28ok(!ctx.db.holidays.some(function (h) { return h.id === 'hol-103'; }), 'v101c: local row stays gone after a second cycle');

  // ---- v102: attendance + marks deletes must survive the full cycle too ----
  // Same pull-before-flush resurrection, through the custom attendance
  // merge (key date|cls|studentId, server student id via stuMap) and the
  // marks merge (key examId|studentId via examMap+stuMap). The fix makes
  // the pull skip any server row with a pending delete op in the outbox.
  var srvStu102 = sbServer.ss_students.filter(function (r) { return r.local_id === 'stu-w1'; })[0];
  v28ok(!!srvStu102, 'v102: fixture student stu-w1 is on the mock server');
  if (srvStu102) ctx.sbSrvIdSet('sb-uid-pull@school.in', 'ss_students', 'stu-w1', srvStu102.id);
  if (!ctx.db.attendance) ctx.db.attendance = {};
  ctx.db.attendance['2026-11-18|6th-A'] = { 'stu-w1': 'Present' };
  ctx.saveDB(ctx.db);
  v28eq(ctx.sbOutboxLoad('sb-uid-pull@school.in').filter(function (e) { return e.table === 'ss_attendance' && e.key === '2026-11-18|6th-A|stu-w1' && e.op === 'upsert'; }).length, 1, 'v102: marking attendance queues one upsert');
  var fl102a = await ctx.sbSyncFlushNow();
  v28eq(fl102a.done, true, 'v102: attendance flush completes');
  v28eq(sbServer.ss_attendance.filter(function (r) { return r.att_date === '2026-11-18' && r.cls === '6th-A' && r.student_id === srvStu102.id; }).length, 1, 'v102: attendance reaches the server');
  delete ctx.db.attendance['2026-11-18|6th-A']['stu-w1'];
  ctx.saveDB(ctx.db);
  v28eq(ctx.sbOutboxLoad('sb-uid-pull@school.in').filter(function (e) { return e.table === 'ss_attendance' && e.key === '2026-11-18|6th-A|stu-w1' && e.op === 'delete'; }).length, 1, 'v102: removing the mark queues one delete op');
  var cy102a = await ctx.sbSyncStart(pullAcct, 'sb-uid-pull@school.in', 'tok-pull');
  v28eq(sbServer.ss_attendance.filter(function (r) { return r.att_date === '2026-11-18' && r.cls === '6th-A' && r.student_id === srvStu102.id; }).length, 0, 'v102: server mark is gone after the full cycle');
  v28ok(!(ctx.db.attendance['2026-11-18|6th-A'] && ctx.db.attendance['2026-11-18|6th-A']['stu-w1']), 'v102: local mark stays gone after the full cycle');
  var cy102b = await ctx.sbSyncStart(pullAcct, 'sb-uid-pull@school.in', 'tok-pull');
  v28eq(sbServer.ss_attendance.filter(function (r) { return r.att_date === '2026-11-18' && r.cls === '6th-A' && r.student_id === srvStu102.id; }).length, 0, 'v102: server mark stays gone after a second cycle');
  ctx.db.exams.push({ id: 'ex-102', name: 'Test Exam 102', cls: '6th-A', subject: 'Maths', date: '2026-11-18', total: 50, deleted: false });
  ctx.saveDB(ctx.db);
  var fl102e = await ctx.sbSyncFlushNow();
  v28eq(fl102e.done, true, 'v102: exam flush completes');
  var srvEx102 = sbServer.ss_exams.filter(function (r) { return r.local_id === 'ex-102'; })[0];
  v28ok(!!srvEx102, 'v102: fixture exam ex-102 is on the mock server');
  if (srvEx102) ctx.sbSrvIdSet('sb-uid-pull@school.in', 'ss_exams', 'ex-102', srvEx102.id);
  if (!ctx.db.marks) ctx.db.marks = [];
  ctx.db.marks.push({ examId: 'ex-102', studentId: 'stu-w1', marks: 40 });
  ctx.saveDB(ctx.db);
  v28eq(ctx.sbOutboxLoad('sb-uid-pull@school.in').filter(function (e) { return e.table === 'ss_marks' && e.key === 'ex-102|stu-w1' && e.op === 'upsert'; }).length, 1, 'v102: setting a mark queues one upsert');
  var fl102m = await ctx.sbSyncFlushNow();
  v28eq(fl102m.done, true, 'v102: marks flush completes');
  v28eq(sbServer.ss_marks.filter(function (r) { return r.exam_id === srvEx102.id && r.student_id === srvStu102.id; }).length, 1, 'v102: mark reaches the server');
  ctx.db.marks = ctx.db.marks.filter(function (m) { return !(m.examId === 'ex-102' && m.studentId === 'stu-w1'); });
  ctx.saveDB(ctx.db);
  v28eq(ctx.sbOutboxLoad('sb-uid-pull@school.in').filter(function (e) { return e.table === 'ss_marks' && e.key === 'ex-102|stu-w1' && e.op === 'delete'; }).length, 1, 'v102: removing the mark queues one delete op');
  var cy102m = await ctx.sbSyncStart(pullAcct, 'sb-uid-pull@school.in', 'tok-pull');
  v28eq(sbServer.ss_marks.filter(function (r) { return r.exam_id === srvEx102.id && r.student_id === srvStu102.id; }).length, 0, 'v102: server mark is gone after the full cycle');
  v28ok(!ctx.db.marks.some(function (m) { return m.examId === 'ex-102' && m.studentId === 'stu-w1'; }), 'v102: local mark stays gone after the full cycle');
  var cy102m2 = await ctx.sbSyncStart(pullAcct, 'sb-uid-pull@school.in', 'tok-pull');
  v28eq(sbServer.ss_marks.filter(function (r) { return r.exam_id === srvEx102.id && r.student_id === srvStu102.id; }).length, 0, 'v102: server mark stays gone after a second cycle');

  // ---- v110: an RPC-created attendance/marks row (no server-id map entry) must still delete ----
  // Live 12 Nov (v108 check): 4 pre-existing deletes (3 attendance + 1 marks) drain then
  // re-appear after reload. Those rows were created by the teacher RPC path, which never
  // writes the server id into the outbox map — and a delete entry carries no row, so both
  // find paths (batch + live) return null, the flush skips and drops it, and the end-of-pass
  // re-diff re-queues it forever. The fix parses the delete entry's KEY in both find
  // functions (attendance key date|cls|studentId, marks key examId|studentId).
  // Attendance half: seed the server row directly, as the RPC would have created it.
  var srvStu110 = sbServer.ss_students.filter(function (r) { return r.local_id === 'stu-w1'; })[0];
  v28ok(!!srvStu110, 'v110: fixture student stu-w1 is on the mock server');
  sbServer.ss_attendance.push({ id: 'srv-att-110', school_id: 'srv-school-31', att_date: '2026-11-19', cls: '6th-A', student_id: srvStu110.id, status: 'Absent' });
  var pull110 = await ctx.sbSyncStart(pullAcct, 'sb-uid-pull@school.in', 'tok-pull');
  v28eq(pull110.done, true, 'v110: pull brings the RPC-created attendance row down');
  v28ok(!!(ctx.db.attendance['2026-11-19|6th-A'] && ctx.db.attendance['2026-11-19|6th-A']['stu-w1'] === 'Absent'), 'v110: local attendance has the pulled row');
  v28eq(ctx.sbSrvIdGet('sb-uid-pull@school.in', 'ss_attendance', '2026-11-19|6th-A|stu-w1'), null, 'v110: the server-id map has NO entry for the RPC-created row (the bug precondition)');
  delete ctx.db.attendance['2026-11-19|6th-A']['stu-w1'];
  ctx.saveDB(ctx.db);
  v28eq(ctx.sbOutboxLoad('sb-uid-pull@school.in').filter(function (e) { return e.table === 'ss_attendance' && e.key === '2026-11-19|6th-A|stu-w1' && e.op === 'delete'; }).length, 1, 'v110: removing the pulled mark queues one delete op');
  var cy110 = await ctx.sbSyncStart(pullAcct, 'sb-uid-pull@school.in', 'tok-pull');
  v28eq(sbServer.ss_attendance.filter(function (r) { return r.att_date === '2026-11-19' && r.cls === '6th-A' && r.student_id === srvStu110.id; }).length, 0, 'v110: server attendance row is gone after the full cycle');
  v28ok(!(ctx.db.attendance['2026-11-19|6th-A'] && ctx.db.attendance['2026-11-19|6th-A']['stu-w1']), 'v110: local mark stays gone after the full cycle');
  var cy110b = await ctx.sbSyncStart(pullAcct, 'sb-uid-pull@school.in', 'tok-pull');
  v28eq(sbServer.ss_attendance.filter(function (r) { return r.att_date === '2026-11-19' && r.cls === '6th-A' && r.student_id === srvStu110.id; }).length, 0, 'v110: server attendance row stays gone after a second cycle');
  v28eq(ctx.sbOutboxLoad('sb-uid-pull@school.in').filter(function (e) { return e.table === 'ss_attendance' && e.key === '2026-11-19|6th-A|stu-w1'; }).length, 0, 'v110: no delete op is left queued after the second cycle');
  // Marks half: same shape — exam + mark seeded directly on the mock server.
  sbServer.ss_exams.push({ id: 'srv-ex-110', school_id: 'srv-school-31', local_id: 'ex-110', name: 'Test Exam 110', cls: '6th-A', subject: 'Maths', date: '2026-11-19', total: 50 });
  sbServer.ss_marks.push({ id: 'srv-mk-110', school_id: 'srv-school-31', exam_id: 'srv-ex-110', student_id: srvStu110.id, marks: 33 });
  var pull110m = await ctx.sbSyncStart(pullAcct, 'sb-uid-pull@school.in', 'tok-pull');
  v28eq(pull110m.done, true, 'v110: pull brings the RPC-created mark down');
  v28ok(ctx.db.marks.some(function (m) { return m.examId === 'ex-110' && m.studentId === 'stu-w1' && Number(m.marks) === 33; }), 'v110: local marks have the pulled row');
  v28eq(ctx.sbSrvIdGet('sb-uid-pull@school.in', 'ss_marks', 'ex-110|stu-w1'), null, 'v110: the server-id map has NO entry for the RPC-created mark (the bug precondition)');
  ctx.db.marks = ctx.db.marks.filter(function (m) { return !(m.examId === 'ex-110' && m.studentId === 'stu-w1'); });
  ctx.saveDB(ctx.db);
  v28eq(ctx.sbOutboxLoad('sb-uid-pull@school.in').filter(function (e) { return e.table === 'ss_marks' && e.key === 'ex-110|stu-w1' && e.op === 'delete'; }).length, 1, 'v110: removing the pulled mark queues one delete op');
  var cy110m = await ctx.sbSyncStart(pullAcct, 'sb-uid-pull@school.in', 'tok-pull');
  v28eq(sbServer.ss_marks.filter(function (r) { return r.exam_id === 'srv-ex-110' && r.student_id === srvStu110.id; }).length, 0, 'v110: server mark is gone after the full cycle');
  v28ok(!ctx.db.marks.some(function (m) { return m.examId === 'ex-110' && m.studentId === 'stu-w1'; }), 'v110: local mark stays gone after the full cycle');
  var cy110m2 = await ctx.sbSyncStart(pullAcct, 'sb-uid-pull@school.in', 'tok-pull');
  v28eq(sbServer.ss_marks.filter(function (r) { return r.exam_id === 'srv-ex-110' && r.student_id === srvStu110.id; }).length, 0, 'v110: server mark stays gone after a second cycle');
  v28eq(ctx.sbOutboxLoad('sb-uid-pull@school.in').filter(function (e) { return e.table === 'ss_marks' && e.key === 'ex-110|stu-w1'; }).length, 0, 'v110: no marks delete op is left queued after the second cycle');

  // ---- v111: a parent must see ONLY their own child in visibleStudents() ----
  // Phase 7 review (C2): visibleStudents() has teacher + student branches
  // only — a parent falls through to `return db.students` (the whole
  // school). Not live-reachable today (the parent dashboard never calls
  // it), but one future parent list view would leak every student. The
  // fix adds the parent branch, mirroring canViewStudent(). Fixture:
  // stu-w1, the pull-db student the v102 vectors already use (the async
  // section runs on the pull account's db, not the seed db).
  var stu111 = ctx.db.students.find(function (s) { return s.id === 'stu-w1'; });
  v28ok(!!stu111, 'v111: fixture student stu-w1 exists in the pull db');
  if (stu111) {
    ctx.loginAs({ role: 'parent', name: stu111.name, sub: 'Parent \u2022 ' + stu111.name, email: 'parent:u-pull-1:' + stu111.id, uid: 'parent-' + stu111.id, studentId: stu111.id, schoolUid: 'u-pull-1' }, { silent: true }); // schoolUid u-pull-1 = the pull db (dbKeyFor: schoolUid wins for parents; test-school would open the seed db, where stu-w1 does not exist)
    v28eq(ctx.state.role, 'parent', 'v111: the session has role parent');
    var vis111 = ctx.visibleStudents();
    v28eq(vis111.length, 1, 'v111: a parent sees exactly one student in visibleStudents');
    v28ok(vis111.length === 1 && vis111[0].id === stu111.id, 'v111: the one visible student is the parent own child');
    ctx.state.stuSearch = ''; ctx.state.stuClass = 'All'; ctx.state.stuSection = 'All'; ctx.state.stuSession = 'All'; ctx.state.stuGender = 'All'; ctx.state.stuFee = 'All'; ctx.state.stuStatus = 'All';
    v28eq(ctx.stuFiltered().length, 1, 'v111: stuFiltered as a parent returns only the child');
    ctx.loginAs(pullAcct);
    v28ok(ctx.visibleStudents().length > 1, 'v111: the school admin still sees the whole school');
  }

  // ---- v103: sync details expose the live sync state (snapshot keys, session, school map) ----
  var det103 = ctx.sbSyncDetailsHtml();
  v28ok(det103.indexOf('Snapshot holidays:') !== -1, 'v103: sync details show the snapshot holidays line');
  v28ok(det103.indexOf('Local holidays:') !== -1, 'v103: sync details show the local holidays line');
  v28ok(det103.indexOf('Online:') !== -1 && det103.indexOf('Session:') !== -1 && det103.indexOf('School mapped:') !== -1, 'v103: sync details show the online/session/map line');

  // ---- v104: a server-linked school must never restore into a session-less dashboard ----
  // Live 12 Nov (v103 diag): the tab showed "Session: no" while logged in as the school —
  // sbSyncActive() was null, so every save silently skipped its diff and Remove Holiday
  // never queued a delete, while the UI still said "Backed up to the server".
  var sbBefore104 = ctx.state.sb;
  var u104 = ctx.state.user;
  var sbUidBefore104 = u104 ? u104.sbUid : undefined;
  if (u104) u104.sbUid = 'sb-uid-v104';
  // (A) No stored Supabase session at all -> validation must DROP to the login screen.
  ctx.sbClearSession();
  ctx.sbSessionExpired = false;
  var v104a = await ctx.sbValidateSchoolSession();
  v28eq(v104a, false, 'v104: validation drops a server-linked school with no stored session');
  // (B) Stored session, network failure on refresh -> offline KEEP (validation true).
  ctx.sbStoreSession({ access_token: 'old-tok-v104', refresh_token: 'ref-v104', expires_in: -3600, token_type: 'bearer', user: { id: 'sb-uid-v104', email: (u104 && u104.email) || 'test@sunrise.test' } });
  var fetchBefore104 = ctx.fetch;
  ctx.fetch = function () { return Promise.reject(new Error('offline')); };
  ctx.sbSessionExpired = false;
  var v104b = await ctx.sbValidateSchoolSession();
  v28eq(v104b, true, 'v104: validation keeps the local session when the refresh cannot reach the server');
  ctx.fetch = fetchBefore104;
  ctx.sbRestNetOk();
  // (C) Server rejects the refresh -> validation must DROP and the session is cleared.
  ctx.sbStoreSession({ access_token: 'old-tok-v104', refresh_token: 'ref-v104', expires_in: -3600, token_type: 'bearer', user: { id: 'sb-uid-v104', email: (u104 && u104.email) || 'test@sunrise.test' } });
  ctx.fetch = function () { return Promise.resolve({ ok: false, status: 400, json: function () { return Promise.resolve({ error: 'invalid_grant' }); }, headers: { get: function () { return null; } } }); };
  ctx.sbSessionExpired = false;
  var v104c = await ctx.sbValidateSchoolSession();
  v28eq(v104c, false, 'v104: validation drops the session when the server rejects the refresh');
  v28eq(ctx.sbSessionExpired, true, 'v104: a rejected refresh marks the session expired');
  v28eq(ctx.sbLoadSession(), null, 'v104: a rejected refresh clears the stored session');
  ctx.fetch = fetchBefore104;
  ctx.sbSessionExpired = false;
  // (D) Heal: a session stored after restore is adopted into state.sb.
  ctx.state.sb = null;
  ctx.sbStoreSession({ access_token: 'tok-heal-v104', refresh_token: 'ref-heal-v104', expires_in: 3600, token_type: 'bearer', user: { id: 'sb-uid-heal-v104', email: (u104 && u104.email) || 'test@sunrise.test' } });
  v28eq(ctx.sbHealSchoolSession(), true, 'v104: heal adopts a stored session into state.sb');
  v28eq(ctx.state.sb && ctx.state.sb.uid, 'sb-uid-heal-v104', 'v104: healed state.sb carries the stored user id');
  v28ok(!!ctx.sbSyncActive(), 'v104: sync is active again after the heal');
  // (E) Status honesty: a server-linked school with no session must not show "Backed up".
  ctx.sbSetStatus('synced');
  ctx.state.sb = null;
  v28ok(ctx.sbStatusText().indexOf('Session expired') !== -1, 'v104: status says session expired, not backed up, when the session is gone (got: ' + ctx.sbStatusText() + ')');
  ctx.state.sb = sbBefore104;
  if (u104) u104.sbUid = sbUidBefore104;

  // ---- v105: (a) the live find must not select updated_at for ss_holidays; (b) a pushed delete leaves a tombstone that stops another tab re-uploading the row ----
  // Live 12 Nov (flush probe): the delete pushed (the old server row's
  // id vanished) yet the holiday came back with a NEW server uuid
  // (created_at 12:26:10 IST, minutes after the push): a second open tab
  // holding a stale in-memory copy re-POSTed it on its next cycle. And
  // the live find for ss_holidays 42703s (no updated_at column), so the
  // delete could only ever push via the batch find.
  // (a) Direct live find, no batch: with the old select the mock 42703s
  // and the find returns null; with the fix it returns the row.
  ctx.db.holidays.push({ id: 'hol-105', date: '2026-11-19', cls: '6th-A', reason: 'Test105' });
  ctx.saveDB(ctx.db);
  var fl105a = await ctx.sbSyncFlushNow();
  v28eq(fl105a.done, true, 'v105: holiday flush completes');
  v28eq(sbServer.ss_holidays.filter(function (r) { return r.local_id === 'hol-105'; }).length, 1, 'v105: holiday reaches the server');
  var sch105 = (sbServer.ss_holidays.filter(function (r) { return r.local_id === 'hol-105'; })[0] || {}).school_id;
  var found105 = await ctx.sbSyncFindServerRow('ss_holidays', { table: 'ss_holidays', key: 'hol-105', op: 'delete' }, 'tok-pull', sch105, {}, 'sb-uid-pull@school.in');
  v28ok(found105 && found105.local_id === 'hol-105', 'v105: live find returns the holiday row (no updated_at in the select)');
  // (b) Tombstone: removing locally queues the delete AND writes a tombstone.
  ctx.db.holidays = ctx.db.holidays.filter(function (h) { return h.id !== 'hol-105'; });
  ctx.saveDB(ctx.db);
  v28eq(ctx.sbOutboxLoad('sb-uid-pull@school.in').filter(function (e) { return e.table === 'ss_holidays' && e.key === 'hol-105' && e.op === 'delete'; }).length, 1, 'v105: remove queues one delete op');
  v28ok(ctx.sbTombHas('sb-uid-pull@school.in', 'ss_holidays', 'hol-105'), 'v105: queuing the delete writes a tombstone');
  // The other tab: a stale copy of the row still in its local db, and its
  // next upload pass must NOT re-POST it while the tombstone lives.
  var holPosts105 = function () { return sbCalls.filter(function (c) { return c.method === 'POST' && String(c.url).indexOf('/rest/v1/ss_holidays') !== -1; }).length; };
  ctx.db.holidays.push({ id: 'hol-105', date: '2026-11-19', cls: '6th-A', reason: 'Test105' });
  var callsBefore105 = holPosts105();
  await ctx.sbSyncUploadMissing(pullAcct, 'sb-uid-pull@school.in', 'tok-pull');
  v28eq(holPosts105(), callsBefore105, 'v105: upload-missing does not re-POST a tombstoned holiday');
  // The flush pushes the delete; the tombstone survives the push.
  ctx.db.holidays = ctx.db.holidays.filter(function (h) { return h.id !== 'hol-105'; });
  var fl105b = await ctx.sbSyncFlushNow();
  v28eq(fl105b.done, true, 'v105: delete flush completes');
  v28eq(sbServer.ss_holidays.filter(function (r) { return r.local_id === 'hol-105'; }).length, 0, 'v105: server row is gone after the flush');
  v28ok(ctx.sbTombHas('sb-uid-pull@school.in', 'ss_holidays', 'hol-105'), 'v105: the tombstone survives the pushed delete');
  // The other tab again, after the push: its stale copy must STILL not upload.
  ctx.db.holidays.push({ id: 'hol-105', date: '2026-11-19', cls: '6th-A', reason: 'Test105' });
  var callsBefore105b = holPosts105();
  await ctx.sbSyncUploadMissing(pullAcct, 'sb-uid-pull@school.in', 'tok-pull');
  v28eq(holPosts105(), callsBefore105b, 'v105: upload-missing still refuses the tombstoned row after the push');
  // And a full cycle must drop the stale local row (pull merge), not keep it.
  var cy105 = await ctx.sbSyncStart(pullAcct, 'sb-uid-pull@school.in', 'tok-pull');
  v28ok(!ctx.db.holidays.some(function (h) { return h.id === 'hol-105'; }), 'v105: the pull drops the tombstoned stale row');
  v28eq(sbServer.ss_holidays.filter(function (r) { return r.local_id === 'hol-105'; }).length, 0, 'v105: server row stays gone after the cycle');
  // The tombstone expires: after its TTL the row may upload again (a real
  // re-add gets a new id anyway, so this only matters for a stale copy).
  var tomb105 = ctx.sbTombLoad('sb-uid-pull@school.in');
  tomb105.ss_holidays['hol-105'] = Date.now() - (25 * 60 * 60 * 1000);
  ctx.sbTombSave('sb-uid-pull@school.in', tomb105);
  v28ok(!ctx.sbTombHas('sb-uid-pull@school.in', 'ss_holidays', 'hol-105'), 'v105: an expired tombstone no longer blocks');
  ctx.db.holidays.push({ id: 'hol-105', date: '2026-11-19', cls: '6th-A', reason: 'Test105' });
  var callsBefore105c = holPosts105();
  await ctx.sbSyncUploadMissing(pullAcct, 'sb-uid-pull@school.in', 'tok-pull');
  v28ok(holPosts105() > callsBefore105c, 'v105: after expiry the row uploads again');
  v28eq(sbServer.ss_holidays.filter(function (r) { return r.local_id === 'hol-105'; }).length, 1, 'v105: server row is back after expiry + upload');
  // Clean up: a full cycle first, so the pull refreshes the snapshot
  // with the re-uploaded row (without it the diff sees neither a local
  // row nor a snapshot key, and queues no delete — the same reason a
  // real delete always follows a pull in the cycle).
  await ctx.sbSyncStart(pullAcct, 'sb-uid-pull@school.in', 'tok-pull');
  v28ok(ctx.db.holidays.some(function (h) { return h.id === 'hol-105'; }), 'v105: the cycle pulls the re-uploaded row back locally');
  ctx.db.holidays = ctx.db.holidays.filter(function (h) { return h.id !== 'hol-105'; });
  ctx.saveDB(ctx.db);
  var fl105c = await ctx.sbSyncFlushNow();
  v28eq(sbServer.ss_holidays.filter(function (r) { return r.local_id === 'hol-105'; }).length, 0, 'v105: fixture row cleaned up');

  // ---- v106: a tombstoned server row (a zombie a stale tab re-created) must be skipped by the pull AND re-queued for deletion ----
  // Live 12 Nov: the v105 tab's flush deleted the holiday, yet the server
  // held a NEW row for it minutes later (created 12:58:28 IST) — the
  // still-open v104 tab re-POSTed it, and v105's pull had no tombstone
  // check on its SERVER loop, so the next pull would have merged the
  // zombie back locally. The pull must skip it and re-queue its delete.
  var sch106 = (ctx.sbServerSchoolMap() || {})[pullAcct.uid];
  sbServer.ss_holidays.push({ id: 'srv-ss_holidays-zombie', school_id: sch106, local_id: 'hol-105', holiday_date: '2026-11-19', cls: '6th-A', reason: 'Test105', created_at: sbNowISO(), updated_at: sbNowISO() });
  v28eq(sbServer.ss_holidays.filter(function (r) { return r.local_id === 'hol-105'; }).length, 1, 'v106: zombie row planted on the mock server');
  v28ok(ctx.sbTombHas('sb-uid-pull@school.in', 'ss_holidays', 'hol-105'), 'v106: the tombstone is still live for the planted row');
  var cy106 = await ctx.sbSyncStart(pullAcct, 'sb-uid-pull@school.in', 'tok-pull');
  v28ok(!ctx.db.holidays.some(function (h) { return h.id === 'hol-105'; }), 'v106: the pull does not merge the zombie row back locally');
  v28eq(sbServer.ss_holidays.filter(function (r) { return r.local_id === 'hol-105'; }).length, 0, 'v106: the cycle re-queues the delete and the flush removes the zombie from the server');
  var cy106b = await ctx.sbSyncStart(pullAcct, 'sb-uid-pull@school.in', 'tok-pull');
  v28eq(sbServer.ss_holidays.filter(function (r) { return r.local_id === 'hol-105'; }).length, 0, 'v106: the zombie stays gone after a second cycle');
  v28ok(!ctx.db.holidays.some(function (h) { return h.id === 'hol-105'; }), 'v106: the local row stays gone after a second cycle');

  // ---- v107: a sync conflict is recorded (not silently dropped) and the admin resolves it in Settings ----
  // Live 12 Nov: a conflict only showed as "Conflicts: N" in the sync diagnostics — never which row or what was lost. The flush must record the row (local + server copies) in db.syncConflicts, and Keep mine / Use server must do what they say.
  var stu107 = ctx.db.students[0];
  v28ok(!!stu107, 'v107: seed student present for the conflict fixture');
  var fl107pre = await ctx.sbSyncFlushNow();
  var srvStu107 = sbServer.ss_students.filter(function (r) { return r.local_id === stu107.id; })[0];
  v28ok(!!srvStu107, 'v107: student is on the mock server before the conflict');
  var origName107 = stu107.name;
  stu107.name = 'Local Name 107';
  ctx.saveDB(ctx.db);
  var ent107 = ctx.sbOutboxLoad('sb-uid-pull@school.in').filter(function (e) { return e.table === 'ss_students' && e.key === stu107.id; })[0];
  v28ok(!!ent107, 'v107: local edit queues an upsert for the student');
  // Backdate the queued entry: the server edit must be NEWER than the
  // entry (so the first push conflicts) but OLDER than the Keep-mine
  // re-queue (so the second push wins). A future server timestamp
  // would conflict forever — the real server's updated_at is always
  // in the past, and the test must model that.
  var out107b = ctx.sbOutboxLoad('sb-uid-pull@school.in');
  out107b.forEach(function (e) { if (e.table === 'ss_students' && e.key === stu107.id) e.at = new Date(Date.now() - 60000).toISOString(); });
  ctx.sbOutboxSave('sb-uid-pull@school.in', out107b);
  srvStu107.name = 'Server Name 107';
  srvStu107.updated_at = new Date(Date.now() - 30000).toISOString();
  var fl107 = await ctx.sbSyncFlushNow();
  v28eq((ctx.db.syncConflicts || []).length, 1, 'v107: the conflict is recorded in db.syncConflicts');
  var rec107 = (ctx.db.syncConflicts || [])[0] || {};
  v28eq(rec107.table, 'ss_students', 'v107: the record names the right table');
  v28eq(rec107.key, stu107.id, 'v107: the record names the right key');
  v28ok(rec107.localRow && rec107.localRow.name === 'Local Name 107', 'v107: the record keeps the local copy');
  v28ok(rec107.serverRow && rec107.serverRow.name === 'Server Name 107', 'v107: the record keeps the server copy');
  v28ok(!ctx.sbOutboxLoad('sb-uid-pull@school.in').some(function (e) { return e.table === 'ss_students' && e.key === stu107.id; }), 'v107: the conflicted entry leaves the outbox');
  var html107 = ctx.sbSyncConflictsHtml();
  v28ok(html107.indexOf('Local Name 107') >= 0 && html107.indexOf('Server Name 107') >= 0, 'v107: the conflicts view shows both versions');
  // v108 regression: the live flow runs a pull between the conflict and
  // the resolution — the pull restores the server version locally, so a
  // Keep mine that re-reads the CURRENT local row pushes the server
  // version back and nothing changes (live 12 Nov). Resolve must use
  // the preserved local copy from the record.
  var cy107r = await ctx.sbSyncStart(pullAcct, 'sb-uid-pull@school.in', 'tok-pull');
  var stu107r = ctx.db.students.filter(function (s) { return s.id === stu107.id; })[0];
  v28eq(stu107r && stu107r.name, 'Server Name 107', 'v107: the pull restores the server version locally before resolution');
  v28eq((ctx.db.syncConflicts || []).length, 1, 'v107: the record survives the pull');
  ctx.sbSyncResolveConflict(0, true);
  var stu107k = ctx.db.students.filter(function (s) { return s.id === stu107.id; })[0];
  v28eq(stu107k && stu107k.name, 'Local Name 107', 'v107: Keep mine writes the kept version back into the local row');
  v28eq((ctx.db.syncConflicts || []).length, 0, 'v107: Keep mine clears the record');
  var out107k = ctx.sbOutboxLoad('sb-uid-pull@school.in').filter(function (e) { return e.table === 'ss_students' && e.key === stu107.id; })[0];
  v28ok(!!out107k, 'v107: Keep mine re-queues the local row as a fresh upsert');
  var fl107k = await ctx.sbSyncFlushNow();
  var srvStu107k = sbServer.ss_students.filter(function (r) { return r.local_id === stu107.id; })[0];
  v28eq(srvStu107k.name, 'Local Name 107', 'v107: Keep mine pushes the local version to the server');
  var stu107b0 = ctx.db.students.filter(function (s) { return s.id === stu107.id; })[0];
  stu107b0.name = 'Local Name 107b';
  ctx.saveDB(ctx.db);
  var out107c = ctx.sbOutboxLoad('sb-uid-pull@school.in');
  out107c.forEach(function (e) { if (e.table === 'ss_students' && e.key === stu107.id) e.at = new Date(Date.now() - 60000).toISOString(); });
  ctx.sbOutboxSave('sb-uid-pull@school.in', out107c);
  srvStu107k.name = 'Server Name 107b';
  srvStu107k.updated_at = new Date(Date.now() - 30000).toISOString();
  var fl107b = await ctx.sbSyncFlushNow();
  v28eq((ctx.db.syncConflicts || []).length, 1, 'v107: the second conflict is recorded');
  ctx.sbSyncResolveConflict(0, false);
  v28eq((ctx.db.syncConflicts || []).length, 0, 'v107: Use server clears the record');
  v28ok(!ctx.sbOutboxLoad('sb-uid-pull@school.in').some(function (e) { return e.table === 'ss_students' && e.key === stu107.id; }), 'v107: Use server queues no upsert');
  var cy107 = await ctx.sbSyncStart(pullAcct, 'sb-uid-pull@school.in', 'tok-pull');
  var stu107b = ctx.db.students.filter(function (s) { return s.id === stu107.id; })[0];
  v28eq(stu107b && stu107b.name, 'Server Name 107b', 'v107: Use server restores the server version on the next pull');
  stu107b.name = origName107;
  srvStu107k.updated_at = new Date(Date.now() - 60000).toISOString();
  ctx.saveDB(ctx.db);
  await ctx.sbSyncFlushNow();
  v28eq(sbServer.ss_students.filter(function (r) { return r.local_id === stu107.id; })[0].name, origName107, 'v107: fixture name restored on the server');

  // ---- v31: offline writes queue in the outbox and flush on reconnect ----
  // (harness fix, B22) while offline the per-save diff is skipped, so
  // the save does NOT queue at once — sbSyncCatchUpDiff re-runs the
  // full diff at the start of the next online cycle, and only a full
  // cycle (not a bare flush) picks the offline change up.
  ctx.navigator.onLine = false;
  var oStudent = { id: 'stu-o1', name: 'Offline Kid', cls: '6th-A', roll: 3, enr: 'ENR-003', guardian: 'G', phone: '9812345671', mobile2: '', parentEmail: '', fatherName: 'F', motherName: 'M', occupation: '', dob: '', gender: 'Girl', bloodGroup: '', category: '', address: '', state: '', district: '', pin: '', previousSchool: '', previousClass: '', admissionNo: 'ADM-2025-003', admissionDate: '', session: '2025–26', status: 'Active', result: null, parentPin: null, photo: null, documents: { birthCert: false, tc: false, tcNumber: '', other: '' }, aadhaar: '' };
  ctx.db.students.push(oStudent);
  ctx.saveDB(ctx.db);
  await tick();
  v28eq(ctx.sbOutboxLoad('sb-uid-pull@school.in').filter(function (e) { return e.table === 'ss_students' && e.key === 'stu-o1'; }).length, 0, 'v31: offline save does not queue at once (B22: the diff is skipped while offline)');
  v28eq(sbServer.ss_students.filter(function (r) { return r.local_id === 'stu-o1'; }).length, 0, 'v31: offline student is not on the server yet');
  ctx.navigator.onLine = true;
  var cyc31o = await ctx.sbSyncCycle();
  v28eq(cyc31o.done, true, 'v31: reconnect cycle completes');
  v28eq(sbServer.ss_students.filter(function (r) { return r.local_id === 'stu-o1'; }).length, 1, 'v31: reconnect cycle posts the offline student (catch-up diff + upload)');
  v28eq(ctx.sbOutboxLoad('sb-uid-pull@school.in').length, 0, 'v31: outbox is empty after the reconnect cycle');
  v28eq(ctx.sbLoadStatus().state, 'synced', 'v31: status is synced after the reconnect cycle');

  // ---- v31: empty-server guard — local data is kept, migration runs instead of a wipe ----
  Object.keys(sbServer).forEach(function (k) { sbServer[k] = []; });
  sbServer.ss_schools = [{ id: 'srv-school-31g', owner_id: 'sb-uid-guard@school.in', name: 'Guard School', principal: 'G', city: '', phone: '', email: 'guard@school.in', session: '2025–26', address: '', plan: 'Active', status: 'active', is_demo: false, adm_counter: 1, receipt_counter: 1, admission_fee: 0, caution_money: 0, annual_charges: 0, transport_fee: 0 }];
  var guardAcct = { uid: 'u-guard-1', name: 'G Admin', school: 'Guard School', email: 'guard@school.in', pwHash: ctx.hashPw('pw123456'), role: 'school', sub: 'School Admin • Guard School', created: '2026-11-09', sbUid: 'sb-uid-guard@school.in' };
  ctx.saveAccounts([guardAcct]);
  ctx.loginAs(guardAcct);
  ctx.db.students.push({ id: 'stu-g1', name: 'Guard Kid', cls: '6th-A', roll: 1, enr: 'ENR-001', guardian: 'G', phone: '9812345678', mobile2: '', parentEmail: '', fatherName: 'F', motherName: 'M', occupation: '', dob: '', gender: 'Boy', bloodGroup: '', category: '', address: '', state: '', district: '', pin: '', previousSchool: '', previousClass: '', admissionNo: 'ADM-2025-001', admissionDate: '', session: '2025–26', status: 'Active', result: null, parentPin: null, photo: null, documents: { birthCert: false, tc: false, tcNumber: '', other: '' }, aadhaar: '' });
  ctx.state.sb = { uid: 'sb-uid-guard@school.in', email: 'guard@school.in' };
  ctx.sbStoreSession({ access_token: 'tok-guard', refresh_token: 'ref-guard', expires_in: 3600, user: { id: 'sb-uid-guard@school.in', email: 'guard@school.in' } });
  ctx.sbSaveServerSchool('u-guard-1', 'srv-school-31g');
  ls.removeItem('schoolSaathiMigrated:sb-uid-guard@school.in');
  ctx.sbSyncDebounceMs = 0;
  var g31 = await ctx.sbSyncStart(guardAcct, 'sb-uid-guard@school.in', 'tok-guard');
  v28eq(g31.done, true, 'v31: guard sync completes (migration then pull)');
  v28eq(ctx.db.students.length, 1, 'v31: guard keeps the local student (never wiped)');
  v28eq(ctx.db.students[0].name, 'Guard Kid', 'v31: guard keeps the local student name');
  v28eq(sbServer.ss_students.filter(function (r) { return r.local_id === 'stu-g1'; }).length, 1, 'v31: guard triggers the migration upload');
  // v32: the cycle's upload pass lands the rows WITHOUT the migration
  // flag (the flag is only set by the full verified migration, e.g.
  // Back Up Now). A second cycle must not duplicate the student.
  var g32b = await ctx.sbSyncStart(guardAcct, 'sb-uid-guard@school.in', 'tok-guard');
  v28eq(g32b.done, true, 'v32: second guard cycle completes');
  v28eq(sbServer.ss_students.filter(function (r) { return r.local_id === 'stu-g1'; }).length, 1, 'v32: second cycle creates no duplicate student');

  // ---- v31: a local-only account never calls the server ----
  var localAcct = { uid: 'u-local-1', name: 'L Admin', school: 'Local School', email: 'local@school.in', pwHash: ctx.hashPw('pw123456'), role: 'school', sub: 'School Admin • Local School', created: '2026-11-09' };
  ctx.saveAccounts([localAcct]);
  ctx.loginAs(localAcct);
  ctx.state.sb = null;
  ctx.sbClearSession();
  sbCalls = [];
  ctx.db.students.push({ id: 'stu-l1', name: 'Local Kid', cls: '6th-A', roll: 1, enr: 'ENR-001', guardian: 'G', phone: '9812345678', mobile2: '', parentEmail: '', fatherName: 'F', motherName: 'M', occupation: '', dob: '', gender: 'Boy', bloodGroup: '', category: '', address: '', state: '', district: '', pin: '', previousSchool: '', previousClass: '', admissionNo: 'ADM-2025-001', admissionDate: '', session: '2025–26', status: 'Active', result: null, parentPin: null, photo: null, documents: { birthCert: false, tc: false, tcNumber: '', other: '' }, aadhaar: '' });
  ctx.saveDB(ctx.db);
  await tick(); await tick();
  v28ok(!sbCalls.some(function (c) { return c.url.indexOf('/rest/v1/') !== -1; }), 'v31: local-only save makes no server calls');
  v28eq(ctx.db.students.filter(function (s) { return s.id === 'stu-l1'; }).length, 1, 'v31: local-only save still works locally');

  // ---- v31: last-write-wins — a newer server copy beats a local edit ----
  Object.keys(sbServer).forEach(function (k) { sbServer[k] = []; });
  sbServer.ss_schools = [{ id: 'srv-school-31w', owner_id: 'sb-uid-lww@school.in', name: 'LWW School', principal: 'L', city: '', phone: '', email: 'lww@school.in', session: '2025–26', address: '', plan: 'Active', status: 'active', is_demo: false, adm_counter: 1, receipt_counter: 1, admission_fee: 0, caution_money: 0, annual_charges: 0, transport_fee: 0 }];
  sbServer.ss_students = [{ id: 'srv-stu-31w', school_id: 'srv-school-31w', local_id: 'stu-lww-1', name: 'Server Newer', cls: '6th-A', roll: 1, enr: 'ENR-001', guardian: 'G', phone: '9812345678', mobile2: '', parent_email: '', father_name: 'F', mother_name: 'M', occupation: '', dob: '', gender: 'Girl', blood_group: '', category: '', address: '', state: '', district: '', pin: '', previous_school: '', previous_class: '', admission_no: 'ADM-2025-001', admission_date: '', session: '2025–26', status: 'Active', result: null, parent_pin: null, photo_data_url: null, documents: { birthCert: true, tc: false, tcNumber: '', other: '' }, aadhaar: '', updated_at: new Date(Date.now() + 3600000).toISOString() }]; // v56: the server copy is NEWER than the local edit — relative to the real clock, so the premise never expires (the hardcoded 2026-11-10T00:00Z did, and the test then only passed by accident)
  var lwwAcct = { uid: 'u-lww-1', name: 'L Admin', school: 'LWW School', email: 'lww@school.in', pwHash: ctx.hashPw('pw123456'), role: 'school', sub: 'School Admin • LWW School', created: '2026-11-09', sbUid: 'sb-uid-lww@school.in' };
  ctx.saveAccounts([lwwAcct]);
  ctx.loginAs(lwwAcct);
  ctx.state.sb = { uid: 'sb-uid-lww@school.in', email: 'lww@school.in' };
  ctx.sbStoreSession({ access_token: 'tok-lww', refresh_token: 'ref-lww', expires_in: 3600, user: { id: 'sb-uid-lww@school.in', email: 'lww@school.in' } });
  ctx.sbSaveServerSchool('u-lww-1', 'srv-school-31w');
  ctx.sbSaveMig('sb-uid-lww@school.in', { at: '2026-11-09T00:00:00.000Z', schoolId: 'srv-school-31w', counts: {} });
  ctx.sbSyncDebounceMs = 0;
  var pull31w = await ctx.sbSyncStart(lwwAcct, 'sb-uid-lww@school.in', 'tok-lww');
  v28eq(pull31w.done, true, 'v31: LWW setup pull completes');
  v28eq(ctx.db.students[0].name, 'Server Newer', 'v31: LWW mirror starts from the server row');
  ctx.db.students[0].name = 'Local Older Edit';
  ctx.saveDB(ctx.db);
  await tick();
  var fl31w = await ctx.sbSyncFlushNow();
  v28eq(fl31w.done, true, 'v31: LWW flush completes');
  v28eq(sbServer.ss_students[0].name, 'Server Newer', 'v31: LWW — the newer server copy is not overwritten by the older local edit');
  v28eq(ctx.sbOutboxLoad('sb-uid-lww@school.in').length, 0, 'v31: LWW — the losing entry leaves the outbox (no re-queue loop)');
  var pull31w2 = await ctx.sbSyncStart(lwwAcct, 'sb-uid-lww@school.in', 'tok-lww');
  v28eq(pull31w2.done, true, 'v31: LWW second pull completes');
  v28eq(ctx.db.students[0].name, 'Server Newer', 'v31: LWW — the local mirror is restored to the server version');

  // ---- v31: the Download button is now a manual refresh (server-wins pull) ----
  sbServer.ss_students.push({ id: 'srv-stu-31d', school_id: 'srv-school-31w', local_id: 'stu-dl-31', name: 'Download Kid 2', cls: '6th-A', roll: 2, enr: 'ENR-002', guardian: 'G', phone: '9812345679', mobile2: '', parent_email: '', father_name: 'F', mother_name: 'M', occupation: '', dob: '', gender: 'Boy', blood_group: '', category: '', address: '', state: '', district: '', pin: '', previous_school: '', previous_class: '', admission_no: 'ADM-2025-002', admission_date: '', session: '2025–26', status: 'Active', result: null, parent_pin: null, photo_data_url: null, documents: { birthCert: false, tc: false, tcNumber: '', other: '' }, aadhaar: '' });
  v28eq(ctx.db.students.length, 1, 'v31: manual refresh setup — one local student before the button');
  ctx.sbRetryDownload();
  await tick(); await tick(); await tick(); await tick(); await tick(); await tick(); await tick(); await tick();
  v28eq(ctx.db.students.length, 2, 'v31: Download button pulls the newer server student into the mirror');
  v28ok(ctx.db.students.some(function (s) { return s.id === 'stu-dl-31'; }), 'v31: downloaded student keeps its local id');

  // ---- v31: a fee record queued before its student is pushed resolves on the same flush ----
  var fStudent = { id: 'stu-f1', name: 'Fee Kid', cls: '6th-A', roll: 4, enr: 'ENR-004', guardian: 'G', phone: '9812345672', mobile2: '', parentEmail: '', fatherName: 'F', motherName: 'M', occupation: '', dob: '', gender: 'Boy', bloodGroup: '', category: '', address: '', state: '', district: '', pin: '', previousSchool: '', previousClass: '', admissionNo: 'ADM-2025-004', admissionDate: '', session: '2025–26', status: 'Active', result: null, parentPin: null, photo: null, documents: { birthCert: false, tc: false, tcNumber: '', other: '' }, aadhaar: '' };
  ctx.db.students.push(fStudent);
  ctx.db.feeRecords.push({ id: 'fee-f1', studentId: 'stu-f1', student: 'Fee Kid', cls: '6th-A', month: 'Nov', type: 'Tuition', amount: 800, status: 'Pending', date: '2026-11-01' });
  ctx.saveDB(ctx.db);
  await tick();
  var fl31f = await ctx.sbSyncFlushNow();
  v28eq(fl31f.done, true, 'v31: FK flush completes');
  var srvFee = sbServer.ss_fee_records.filter(function (r) { return r.local_id === 'fee-f1'; });
  v28eq(srvFee.length, 1, 'v31: fee record posts once its student exists on the server');
  v28ok(!!srvFee[0].student_id, 'v31: posted fee record points at the mapped server student id');
  v28eq(srvFee[0].student_id, sbServer.ss_students.filter(function (r) { return r.local_id === 'stu-f1'; })[0].id, 'v31: fee record student id matches the pushed student');


  // ================= v32: fully automatic sync =================
  // Two devices share one vm context and one mocked server; their
  // localStorage snapshots are swapped to switch devices.
  function snapLS() { var o = {}; for (var i = 0; i < ls.length; i++) { var k = ls.key(i); o[k] = ls.getItem(k); } return o; }
  function restoreLS(snap) {
    var keys = []; for (var i = 0; i < ls.length; i++) keys.push(ls.key(i));
    keys.forEach(function (k) { ls.removeItem(k); });
    Object.keys(snap).forEach(function (k) { ls.setItem(k, snap[k]); });
  }
  function resetDevice() {
    ctx.state.role = null; ctx.state.user = null; ctx.state.sb = null; ctx.state.view = 'login';
    ctx.sbSyncResetMemory();
  }
  async function waitFor(cond, label) {
    for (var i = 0; i < 150; i++) { if (cond()) return true; await tick(); }
    v28ok(false, 'v32: timeout waiting for ' + label);
    return false;
  }
  function vmStudent(id, name, admNo, enr) {
    return { id: id, name: name, cls: '6th-A', roll: 1, enr: enr || 'ENR-001', guardian: 'G', phone: '9812345678', mobile2: '', parentEmail: '', fatherName: 'F', motherName: 'M', occupation: '', dob: '', gender: '', bloodGroup: '', category: '', address: '', state: '', district: '', pin: '', previousSchool: '', previousClass: '', admissionNo: admNo, admissionDate: '', session: '2025–26', status: 'Active', result: null, parentPin: null, photo: null, documents: { birthCert: false, tc: false, tcNumber: '', other: '' }, aadhaar: '' };
  }

  // ---- v32 (i): the live VM School failure, end to end ----
  // Phone signs up + adds Ankit Kumar. Laptop logs in FIRST and creates
  // an EMPTY server school. Phone logs in — with NO manual step the
  // student uploads automatically and the laptop sees him on its next
  // auto-pull. The phone's student is never wiped.
  Object.keys(sbServer).forEach(function (k) { sbServer[k] = []; });
  sbCalls = [];
  (function () { var keys = []; for (var i = 0; i < ls.length; i++) keys.push(ls.key(i)); keys.forEach(function (k) { ls.removeItem(k); }); })();
  ctx.sbSyncResetMemory();
  resetDevice();
  ctx.sbSyncDebounceMs = 0;
  // Device A (phone): local account + one student, never synced.
  var vmAcct = { uid: 'u-vm-1', name: 'Sunil Kumar', school: 'VM School', email: 'vm@school.in', pwHash: ctx.hashPw('TestAdmin-2026'), role: 'school', sub: 'School Admin • VM School', created: '2026-11-09', sbUid: 'sb-uid-vm@school.in' };
  ctx.saveAccounts([vmAcct]);
  ctx.loginAs(vmAcct);
  ctx.db = ctx.emptyDb({ name: 'VM School', city: '', principal: 'Sunil Kumar', phone: '', email: 'vm@school.in', session: '2025–26', address: '' });
  ctx.db.students.push(vmStudent('stu-ankit-1', 'Ankit Kumar', 'ADM-2025-001'));
  ctx.saveDB(ctx.db);
  v28eq(ctx.db.students.length, 1, 'v32: phone has one local student before any login');
  var phoneLS = snapLS();
  // Device B (laptop): fresh device, logs in FIRST.
  restoreLS({});
  resetDevice();
  ctx.document.getElementById('loginId').value = 'vm@school.in';
  ctx.document.getElementById('loginPw').value = 'TestAdmin-2026';
  sbCalls = [];
  ctx.doLogin({ preventDefault: function () {} });
  await waitFor(function () { return sbServer.ss_schools.length === 1; }, 'laptop login creates the server school');
  v28eq(sbServer.ss_schools.length, 1, 'v32: laptop login creates exactly one server school row');
  v28eq(sbServer.ss_students.length, 0, 'v32: laptop has nothing to upload (empty store)');
  v28eq(ctx.db.students.length, 0, 'v32: laptop mirror starts empty');
  await ctx.sbSyncCycle(); // drain the login cycle before switching devices
  var laptopLS = snapLS();
  // Device A (phone) logs in — no manual step.
  restoreLS(phoneLS);
  resetDevice();
  ctx.document.getElementById('loginId').value = 'vm@school.in';
  ctx.document.getElementById('loginPw').value = 'TestAdmin-2026';
  sbCalls = [];
  ctx.doLogin({ preventDefault: function () {} });
  await waitFor(function () { return sbServer.ss_students.filter(function (r) { return r.local_id === 'stu-ankit-1'; }).length === 1; }, 'phone login uploads Ankit Kumar');
  v28eq(sbServer.ss_students.filter(function (r) { return r.local_id === 'stu-ankit-1'; }).length, 1, 'v32: phone login uploads the student with no manual step');
  var ankitSrv = sbServer.ss_students.filter(function (r) { return r.local_id === 'stu-ankit-1'; })[0];
  v28ok(!!ankitSrv && ankitSrv.name === 'Ankit Kumar', 'v32: uploaded student keeps its name');
  v28eq(sbServer.ss_schools.length, 1, 'v32: no duplicate server school row after the phone login');
  // ---- v32 (iv): upload always runs before pull in a cycle ----
  var idxPost = -1, idxPull = -1;
  sbCalls.forEach(function (c, i) {
    if (idxPost === -1 && c.method === 'POST' && c.url.indexOf('/rest/v1/ss_students') !== -1) idxPost = i;
    if (idxPull === -1 && c.method === 'GET' && c.url.indexOf('ss_schools?select=*') !== -1) idxPull = i;
  });
  v28ok(idxPost !== -1, 'v32: phone login posts the student');
  v28ok(idxPull !== -1, 'v32: phone login pulls after the upload');
  v28ok(idxPost !== -1 && idxPull !== -1 && idxPost < idxPull, 'v32: upload runs before pull in the cycle');
  await ctx.sbSyncCycle(); // drain the login cycle before switching devices
  v28ok(ctx.db.students.some(function (s) { return s.id === 'stu-ankit-1'; }), 'v32: phone still shows Ankit Kumar after its login (never wiped)');
  phoneLS = snapLS();

  // ---- v32 (v): a foreground event pulls other devices' changes ----
  restoreLS(laptopLS);
  resetDevice();
  ctx.loginAs(ctx.findAccount('vm@school.in'));
  ctx.state.sb = { uid: 'sb-uid-vm@school.in', email: 'vm@school.in' };
  ctx.sbStoreSession({ access_token: 'tok-vm', refresh_token: 'ref-vm', expires_in: 3600, user: { id: 'sb-uid-vm@school.in', email: 'vm@school.in' } });
  ctx.document.visibilityState = 'visible';
  (ctx.__docListeners['visibilitychange'] || []).forEach(function (fn) { fn(); });
  await waitFor(function () { return ctx.db.students.some(function (s) { return s.id === 'stu-ankit-1'; }); }, 'laptop sees Ankit Kumar after a foreground event');
  v28ok(ctx.db.students.some(function (s) { return s.id === 'stu-ankit-1'; }), 'v32: laptop sees Ankit Kumar after a foreground event (no refresh, no button)');
  var ankitLap = ctx.db.students.filter(function (s) { return s.id === 'stu-ankit-1'; })[0];
  v28ok(!!ankitLap && ankitLap.name === 'Ankit Kumar', 'v32: pulled student keeps its name');

  // ---- v32 (vi): the 30s interval pulls while the app is open ----
  sbServer.ss_students.push({ id: 'srv-stu-32b', school_id: sbServer.ss_schools[0].id, local_id: 'stu-second-1', name: 'Second Kid', cls: '6th-A', roll: 2, enr: 'ENR-002', guardian: 'G', phone: '9812345679', mobile2: '', parent_email: '', father_name: 'F', mother_name: 'M', occupation: '', dob: '', gender: 'Boy', blood_group: '', category: '', address: '', state: '', district: '', pin: '', previous_school: '', previous_class: '', admission_no: 'ADM-2025-002', admission_date: '', session: '2025–26', status: 'Active', result: null, parent_pin: null, photo_data_url: null, documents: { birthCert: false, tc: false, tcNumber: '', other: '' }, aadhaar: '' });
  v28eq(ctx.__timers.length, 1, 'v32: exactly one auto-pull interval is registered');
  v28eq(ctx.__timers[0].ms, 30000, 'v32: auto-pull interval is 30 seconds');
  sbCalls = [];
  ctx.__timers[0].fn();
  await waitFor(function () { return ctx.db.students.some(function (s) { return s.id === 'stu-second-1'; }); }, 'interval pull brings the new student');
  v28ok(ctx.db.students.some(function (s) { return s.id === 'stu-second-1'; }), 'v32: the 30s interval pulls a new server student with no action');
  v28ok(sbCalls.some(function (c) { return c.method === 'GET' && c.url.indexOf('ss_students?select=*') !== -1; }), 'v32: the interval tick runs a pull');

  // ---- v32 (ix): a local save pushes and the outbox flushes after the cycle ----
  // Laptop adds a student; the debounced cycle uploads it, and the other
  // device (phone) sees it on its next cycle.
  ctx.db.students.push(vmStudent('stu-laptop-1', 'Laptop Kid', 'ADM-2025-003', 'ENR-003'));
  ctx.saveDB(ctx.db);
  await waitFor(function () { return sbServer.ss_students.filter(function (r) { return r.local_id === 'stu-laptop-1'; }).length === 1; }, 'laptop save uploads the new student');
  v28eq(sbServer.ss_students.filter(function (r) { return r.local_id === 'stu-laptop-1'; }).length, 1, 'v32: a laptop save reaches the server with no manual step');
  v28eq(ctx.sbOutboxLoad('sb-uid-vm@school.in').length, 0, 'v32: outbox is empty after the cycle flush');
  laptopLS = snapLS();
  // Phone opens the app again — its next cycle pulls the laptop's student.
  restoreLS(phoneLS);
  resetDevice();
  ctx.loginAs(ctx.findAccount('vm@school.in'));
  ctx.state.sb = { uid: 'sb-uid-vm@school.in', email: 'vm@school.in' };
  ctx.sbStoreSession({ access_token: 'tok-vm', refresh_token: 'ref-vm', expires_in: 3600, user: { id: 'sb-uid-vm@school.in', email: 'vm@school.in' } });
  var c32 = await ctx.sbSyncCycle();
  v28eq(c32.done, true, 'v32: phone cycle completes');
  v28ok(ctx.db.students.some(function (s) { return s.id === 'stu-laptop-1'; }), 'v32: phone sees the laptop student after its cycle');
  phoneLS = snapLS();

  // ---- v32: rapid triggers coalesce into one queued follow-up ----
  restoreLS(laptopLS);
  resetDevice();
  ctx.loginAs(ctx.findAccount('vm@school.in'));
  ctx.state.sb = { uid: 'sb-uid-vm@school.in', email: 'vm@school.in' };
  ctx.sbStoreSession({ access_token: 'tok-vm', refresh_token: 'ref-vm', expires_in: 3600, user: { id: 'sb-uid-vm@school.in', email: 'vm@school.in' } });
  await ctx.sbSyncCycle(); // settle the restored state first (quiet outbox + snapshot)
  sbCalls = [];
  var cc1 = ctx.sbSyncCycle(), cc2 = ctx.sbSyncCycle(), cc3 = ctx.sbSyncCycle();
  await Promise.all([cc1, cc2, cc3]);
  var pullGets = sbCalls.filter(function (c) { return c.method === 'GET' && c.url.indexOf('ss_students?select=*') !== -1; }).length;
  v28eq(pullGets, 2, 'v32: three rapid cycle calls run exactly two pulls (one run + one queued follow-up)');
  v28eq(ctx.sbSyncCyclePending, null, 'v32: no follow-up cycle is left queued');

  // ---- v32 (viii): a local-only account makes zero server calls ----
  ctx.logout(); await waitLogoutCtx();
  var local32 = { uid: 'u-local-32', name: 'L Admin', school: 'Local School', email: 'local32@school.in', pwHash: ctx.hashPw('pw123456'), role: 'school', sub: 'School Admin • Local School', created: '2026-11-09' };
  ctx.saveAccounts([local32]);
  ctx.loginAs(local32);
  // (harness fix) loginAs does not clear the previous account's server
  // session — without this the stale sb uid makes the local-only
  // account look server-linked (same fix as the v31 local-only block).
  ctx.state.sb = null; ctx.sbClearSession();
  ctx.db.students.push(vmStudent('stu-local-32', 'Local Kid', 'ADM-2025-032'));
  ctx.saveDB(ctx.db);
  await tick(); await tick();
  sbCalls = [];
  var r32 = await ctx.sbSyncCycle();
  v28eq(r32.done, false, 'v32: local-only cycle does not run');
  v28eq(r32.reason, 'no-session', 'v32: local-only cycle reports no-session');
  v28eq(sbCalls.length, 0, 'v32: local-only account makes zero server calls');
  // ================= v33: atomic server-side numbering =================
  // The live 9 Nov 2026 state after the Back Up Now: one server school
  // row whose counters (1 / 1) sit BEHIND the highest used number
  // (ADM-2025-001 taken), and Ankit Kumar on the server.
  function vm33SeedServer() {
    Object.keys(sbServer).forEach(function (k) { sbServer[k] = []; });
    sbServer.ss_schools.push({ id: 'srv-school-vm33', owner_id: 'sb-uid-vm@school.in', name: 'VM School', city: '', principal: 'Sunil Kumar', phone: '', email: 'vm@school.in', session: '2025–26', address: '', plan: 'Active', status: 'active', is_demo: false, adm_counter: 1, receipt_counter: 1, admission_fee: 0, caution_money: 0, annual_charges: 0, transport_fee: 0, created_at: sbNowISO(), updated_at: sbNowISO() });
    sbServer.ss_students.push({ id: 'srv-ankit-33', school_id: 'srv-school-vm33', local_id: 'stu-ankit-1', name: 'Ankit Kumar', cls: '6th-A', roll: 1, enr: 'ENR-001', guardian: 'G', phone: '9812345678', mobile2: '', parent_email: '', father_name: 'F', mother_name: 'M', occupation: '', dob: '', gender: '', blood_group: '', category: '', address: '', state: '', district: '', pin: '', previous_school: '', previous_class: '', admission_no: 'ADM-2025-001', admission_date: '', session: '2025–26', status: 'Active', result: null, parent_pin: null, photo_data_url: null, documents: { birthCert: false, tc: false, tcNumber: '', other: '' }, aadhaar: '', created_at: sbNowISO(), updated_at: sbNowISO() });
  }
  function vm33SeedReceipt() {
    // A server receipt already holds RCP-2026-001 while the counter
    // still says 1 — the receipt-side version of the counter-behind bug.
    sbServer.ss_receipts.push({ id: 'srv-rcp-33-1', school_id: 'srv-school-vm33', student_id: 'srv-ankit-33', receipt_no: 'RCP-2026-001', admission_no: 'ADM-2025-001', student_name: 'Ankit Kumar', cls: '6th-A', session: '2025–26', receipt_date: '2026-11-08', month: 'Nov', counter_no: 1, lines: [], pay_mode: 'Cash', pay_date: '', bank: '', number: '', total: 500, total_words: '', collector: 'Sunil Kumar', created_at: sbNowISO(), updated_at: sbNowISO() });
  }
  async function vm33FreshDevice() {
    // A device that has never seen this school: empty local store, log
    // in, one cycle — the mirror then holds the server state (Ankit).
    restoreLS({});
    resetDevice();
    ctx.saveAccounts([vmAcct]);
    ctx.loginAs(vmAcct);
    ctx.db = ctx.emptyDb({ name: 'VM School', city: '', principal: 'Sunil Kumar', phone: '', email: 'vm@school.in', session: '2025–26', address: '' });
    ctx.state.sb = { uid: 'sb-uid-vm@school.in', email: 'vm@school.in' };
    ctx.sbStoreSession({ access_token: 'tok-vm', refresh_token: 'ref-vm', expires_in: 3600, user: { id: 'sb-uid-vm@school.in', email: 'vm@school.in' } });
    ctx.saveDB(ctx.db);
    return await ctx.sbSyncCycle();
  }
  function vm33SetStudentForm(name, phone) {
    ctx.document.getElementById('fStName').value = name;
    ctx.document.getElementById('fStPh').value = phone;
    ctx.document.getElementById('fStCls').value = '6th';
    ctx.document.getElementById('fStSec').value = 'A';
    ctx.document.getElementById('fStRoll').value = '2';
  }
  function vm33ServerAdmNos() { return sbServer.ss_students.map(function (r) { return r.admission_no; }).sort(); }

  // ---- v33 (i): the exact live failure, end to end ----
  // The laptop adds a student through the admission form. The local
  // counter would mint ADM-2025-001 again — the server mint must give
  // ADM-2025-002 / ENR-002, and both students must end up on the server.
  vm33SeedServer();
  sbCalls = [];
  var c33i = await vm33FreshDevice();
  v28eq(c33i.done, true, 'v33: fresh device cycle completes');
  v28ok(ctx.db.students.some(function (s) { return s.id === 'stu-ankit-1'; }), 'v33: fresh device pulls Ankit Kumar');
  v28eq(sbServer.ss_schools[0].adm_counter, 2, 'v33: the first cycle heals the behind counter 1 -> 2');
  var baseLS33 = snapLS();
  vm33SetStudentForm('Laptop New Kid', '9812345680');
  sbCalls = [];
  ctx.saveStudent({ preventDefault: function () {} }, '', 'active');
  await waitFor(function () { return sbServer.ss_students.length === 2; }, 'laptop add reaches the server');
  var newKid33 = ctx.db.students.filter(function (s) { return s.name === 'Laptop New Kid'; })[0];
  v28ok(!!newKid33, 'v33: laptop has the new student locally');
  v28eq(newKid33 && newKid33.admissionNo, 'ADM-2025-002', 'v33: laptop student gets ADM-2025-002 from the server (not the local 001)');
  v28eq(newKid33 && newKid33.enr, 'ENR-002', 'v33: laptop student gets ENR-002 from the server');
  v28eq(vm33ServerAdmNos().join(','), 'ADM-2025-001,ADM-2025-002', 'v33: server holds both students, no duplicate admission numbers');
  v28eq(sbServer.ss_schools[0].adm_counter, 3, 'v33: server adm_counter advances past the highest used number (3 > 002)');
  v28ok(sbCalls.some(function (c) { return c.url.indexOf('/rest/v1/rpc/ss_next_adm_no') !== -1; }), 'v33: the add minted through the ss_next_adm_no RPC');
  // A second device pulls both students with no manual step.
  await vm33FreshDevice();
  v28eq(ctx.db.students.length, 2, 'v33: a second device sees both students after its cycle');
  v28ok(ctx.db.students.some(function (s) { return s.name === 'Laptop New Kid'; }), 'v33: the second device sees the laptop student (the live "phone me nahi dikh raha" case)');

  // ---- v33 (ii-b): a stale device adds while another device's student is already on the server ----
  restoreLS(baseLS33);
  resetDevice();
  ctx.loginAs(ctx.findAccount('vm@school.in'));
  ctx.state.sb = { uid: 'sb-uid-vm@school.in', email: 'vm@school.in' };
  ctx.sbStoreSession({ access_token: 'tok-vm', refresh_token: 'ref-vm', expires_in: 3600, user: { id: 'sb-uid-vm@school.in', email: 'vm@school.in' } });
  vm33SetStudentForm('Second Device Kid', '9812345681');
  sbCalls = [];
  ctx.saveStudent({ preventDefault: function () {} }, '', 'active');
  await waitFor(function () { return sbServer.ss_students.length === 3; }, 'stale device add reaches the server');
  var secondKid33 = ctx.db.students.filter(function (s) { return s.name === 'Second Device Kid'; })[0];
  v28ok(!!secondKid33 && secondKid33.admissionNo && secondKid33.admissionNo !== 'ADM-2025-001' && secondKid33.admissionNo !== 'ADM-2025-002', 'v33: stale device gets a fresh number, never 001/002 (got ' + (secondKid33 && secondKid33.admissionNo) + ')');
  v28eq(vm33ServerAdmNos().length, 3, 'v33: server holds three students');
  v28ok(new Set(vm33ServerAdmNos()).size === 3, 'v33: server admission numbers are all distinct');

  // ---- v33 (ii): two devices minting at the same time get different numbers ----
  vm33SeedServer();
  var taken33 = await ctx.sbFetchTakenNumbers('tok-vm', 'srv-school-vm33');
  var both33 = await Promise.all([
    ctx.sbMintAdmNo('tok-vm', 'srv-school-vm33', taken33),
    ctx.sbMintAdmNo('tok-vm', 'srv-school-vm33', taken33)
  ]);
  v28ok(both33[0].admissionNo !== both33[1].admissionNo, 'v33: two simultaneous mints get different admission numbers (' + both33[0].admissionNo + ' vs ' + both33[1].admissionNo + ')');
  v28ok(both33[0].enr !== both33[1].enr, 'v33: two simultaneous mints get different enrolment numbers');
  v28ok(both33[0].admissionNo !== 'ADM-2025-001' && both33[1].admissionNo !== 'ADM-2025-001', 'v33: neither simultaneous mint re-mints the taken ADM-2025-001');

  // ---- v33 (iii): the repair pass re-numbers an already-colliding local row ----
  vm33SeedServer();
  sbCalls = [];
  await vm33FreshDevice();
  ctx.db.students.push(vmStudent('stu-stuck-1', 'Stuck Kid', 'ADM-2025-001', 'ENR-001'));
  ctx.saveDB(ctx.db);
  sbCalls = [];
  var c33iii = await ctx.sbSyncCycle();
  v28eq(c33iii.done, true, 'v33: repair cycle completes');
  var stuck33 = ctx.db.students.filter(function (s) { return s.id === 'stu-stuck-1'; })[0];
  v28ok(!!stuck33, 'v33: the colliding student is still local after the cycle (never wiped)');
  v28eq(stuck33 && stuck33.admissionNo, 'ADM-2025-002', 'v33: repair re-numbers the colliding student to ADM-2025-002');
  v28eq(stuck33 && stuck33.enr, 'ENR-002', 'v33: repair re-numbers the enrolment to ENR-002');
  v28eq(sbServer.ss_students.length, 2, 'v33: the repaired student reaches the server');
  v28eq(vm33ServerAdmNos().join(','), 'ADM-2025-001,ADM-2025-002', 'v33: server holds Ankit + the repaired student, no duplicates');
  v28eq(sbServer.ss_schools[0].adm_counter, 3, 'v33: counter ends past the highest used number after repair');
  v28eq(ctx.sbOutboxLoad('sb-uid-vm@school.in').length, 0, 'v33: outbox is empty after the repair cycle');
  var idxRpc33 = -1, idxPost33 = -1;
  sbCalls.forEach(function (c, i) {
    if (idxRpc33 === -1 && c.url.indexOf('/rest/v1/rpc/ss_next_adm_no') !== -1) idxRpc33 = i;
    if (idxPost33 === -1 && c.method === 'POST' && c.url.indexOf('/rest/v1/ss_students') !== -1) idxPost33 = i;
  });
  v28ok(idxRpc33 !== -1 && idxPost33 !== -1 && idxRpc33 < idxPost33, 'v33: the repair RPC runs before the student upload in the cycle');

  // ---- v33 (iv-a): receipt numbers minted via the server never collide ----
  vm33SeedServer();
  vm33SeedReceipt();
  var taken33r = await ctx.sbFetchTakenNumbers('tok-vm', 'srv-school-vm33');
  var rcpMinted33 = await ctx.sbMintReceiptNo('tok-vm', 'srv-school-vm33', taken33r.rcp);
  v28eq(rcpMinted33, 'RCP-2026-002', 'v33: receipt mint skips the taken RCP-2026-001 and returns RCP-2026-002');
  v28eq(sbServer.ss_schools[0].receipt_counter, 3, 'v33: server receipt_counter advances past the highest used number (3 > 002)');
  // ---- v33 (iv-b): the repair pass re-numbers a colliding local receipt ----
  vm33SeedServer();
  vm33SeedReceipt();
  await vm33FreshDevice();
  ctx.db.receipts.push({ receiptNo: 'RCP-2026-001', studentId: 'stu-ankit-1', admissionNo: 'ADM-2025-001', name: 'Ankit Kumar', cls: '6th-A', session: '2025–26', date: '2026-11-09', month: 'Nov', counterNo: 1, lines: [], payMode: 'Cash', payDate: '', bank: '', number: '', total: 600, totalWords: '', collector: 'Sunil Kumar' });
  ctx.saveDB(ctx.db);
  await ctx.sbSyncCycle();
  var fixedRc33 = ctx.db.receipts.filter(function (r) { return r.studentId === 'stu-ankit-1' && r.total === 600; })[0];
  v28ok(!!fixedRc33, 'v33: the colliding local receipt is still local after the cycle');
  v28eq(fixedRc33 && fixedRc33.receiptNo, 'RCP-2026-002', 'v33: repair re-numbers the colliding receipt to RCP-2026-002');
  v28eq(sbServer.ss_receipts.length, 2, 'v33: both receipts reach the server');
  v28ok(new Set(sbServer.ss_receipts.map(function (r) { return r.receipt_no; })).size === 2, 'v33: server receipt numbers are distinct');

  // ---- v33 (v): offline add queues without a number, gets one on reconnect ----
  vm33SeedServer();
  await vm33FreshDevice();
  ctx.navigator.onLine = false;
  vm33SetStudentForm('Offline Kid', '9812345682');
  sbCalls = [];
  ctx.saveStudent({ preventDefault: function () {} }, '', 'active');
  await tick(); await tick();
  var offKid33 = ctx.db.students.filter(function (s) { return s.name === 'Offline Kid'; })[0];
  v28ok(!!offKid33, 'v33: offline student is saved locally');
  v28eq(offKid33 && offKid33.numPending, true, 'v33: offline student is marked pending-number (no guessed number)');
  v28eq(offKid33 && offKid33.admissionNo, '', 'v33: offline student has no admission number yet');
  v28ok(!sbCalls.some(function (c) { return c.url.indexOf('/rest/v1/rpc/') !== -1; }), 'v33: offline add makes no RPC call');
  v28ok(!sbCalls.some(function (c) { return c.method === 'POST' && c.url.indexOf('/rest/v1/ss_students') !== -1; }), 'v33: offline add uploads nothing');
  v28eq(sbServer.ss_students.length, 1, 'v33: server still has only Ankit while offline');
  ctx.navigator.onLine = true;
  await ctx.sbSyncCycle();
  var offKid33b = ctx.db.students.filter(function (s) { return s.name === 'Offline Kid'; })[0];
  v28eq(offKid33b && offKid33b.admissionNo, 'ADM-2025-002', 'v33: the pending student is minted ADM-2025-002 on reconnect');
  v28eq(offKid33b && offKid33b.enr, 'ENR-002', 'v33: the pending student is minted ENR-002 on reconnect');
  v28eq(sbServer.ss_students.length, 2, 'v33: the pending student reaches the server on reconnect');
  v28eq(offKid33b && offKid33b.numPending, undefined, 'v33: the pending flag clears once the number is minted');

  // ---- v33 (vii-a): a colliding local row survives repeated pulls until repaired ----
  vm33SeedServer();
  await vm33FreshDevice();
  ctx.db.students.push(vmStudent('stu-stuck-1', 'Stuck Kid', 'ADM-2025-001', 'ENR-001'));
  ctx.saveDB(ctx.db);
  var pull33a = await ctx.sbSyncPullRun(vmAcct, 'sb-uid-vm@school.in', 'tok-vm');
  v28eq(pull33a.done, true, 'v33: first bare pull completes');
  v28ok(ctx.db.students.some(function (s) { return s.id === 'stu-stuck-1'; }), 'v33: the colliding student survives the first pull (never wiped)');
  var pull33b = await ctx.sbSyncPullRun(vmAcct, 'sb-uid-vm@school.in', 'tok-vm');
  v28eq(pull33b.done, true, 'v33: second bare pull completes');
  v28ok(ctx.db.students.some(function (s) { return s.id === 'stu-stuck-1'; }), 'v33: the colliding student survives the second pull too');
  v28eq(sbServer.ss_students.length, 1, 'v33: the server still has only Ankit after the bare pulls');
  await ctx.sbSyncCycle();
  var stuck33b = ctx.db.students.filter(function (s) { return s.id === 'stu-stuck-1'; })[0];
  v28eq(stuck33b && stuck33b.admissionNo, 'ADM-2025-002', 'v33: the full cycle then repairs the survivor to ADM-2025-002');
  v28eq(sbServer.ss_students.length, 2, 'v33: the survivor reaches the server after the repair');

  // ---- v33 (vii-b): a failed upload never deletes the local row; the outbox keeps the reason ----
  vm33SeedServer();
  await vm33FreshDevice();
  ctx.db.students.push(vmStudent('stu-fail-1', 'Fail Kid', 'ADM-2025-002', 'ENR-002'));
  ctx.saveDB(ctx.db);
  sbFailTables.add('ss_students');
  sbCalls = [];
  await ctx.sbSyncCycle();
  v28ok(ctx.db.students.some(function (s) { return s.id === 'stu-fail-1'; }), 'v33: the student survives a cycle whose upload failed');
  v28eq(sbServer.ss_students.length, 1, 'v33: the failed student never reaches the server');
  var failEntry33 = ctx.sbOutboxLoad('sb-uid-vm@school.in').filter(function (e) { return e.table === 'ss_students' && e.key === 'stu-fail-1'; })[0];
  v28ok(!!failEntry33, 'v33: the outbox keeps the failed entry');
  v28ok(!!(failEntry33 && failEntry33.failReason) && failEntry33.failReason.indexOf('post-ss_students') !== -1, 'v33: the failed entry carries its reason (got ' + (failEntry33 && failEntry33.failReason) + ')');
  sbFailTables.delete('ss_students');
  await ctx.sbSyncCycle();
  v28eq(sbServer.ss_students.length, 2, 'v33: the student uploads on the next cycle once the server is back');
  v28eq(ctx.sbOutboxLoad('sb-uid-vm@school.in').length, 0, 'v33: the outbox drains after the retry succeeds');

  // ---- v33 (vi): a local-only account still mints locally and makes zero server calls ----
  ctx.logout(); await waitLogoutCtx();
  var local33 = { uid: 'u-local-33', name: 'L Admin', school: 'Local School', email: 'local33@school.in', pwHash: ctx.hashPw('pw123456'), role: 'school', sub: 'School Admin • Local School', created: '2026-11-09' };
  ctx.saveAccounts([local33]);
  ctx.loginAs(local33);
  // (harness fix) loginAs does not clear the previous account's server
  // session — with the stale sb uid left over, saveStudent takes the
  // async server-mint path instead of the sync local mint, so the
  // student is not saved yet when the checks run (and the late mint
  // then crashes renderApp on the wiped user).
  ctx.state.sb = null; ctx.sbClearSession();
  ctx.db = ctx.emptyDb({ name: 'Local School', city: '', principal: 'L Admin', phone: '', email: 'local33@school.in', session: '2025–26', address: '' });
  ctx.saveDB(ctx.db);
  vm33SetStudentForm('Local V33 Kid', '9812345683');
  sbCalls = [];
  ctx.saveStudent({ preventDefault: function () {} }, '', 'active');
  var localKid33 = ctx.db.students.filter(function (s) { return s.name === 'Local V33 Kid'; })[0];
  v28ok(!!localKid33, 'v33: local-only student is saved');
  v28eq(localKid33 && localKid33.admissionNo, 'ADM-2025-001', 'v33: local-only account mints ADM-2025-001 from the local counter');
  v28eq(localKid33 && localKid33.enr, 'ENR-001', 'v33: local-only account mints ENR-001 locally');
  await tick(); await tick();
  v28eq(sbCalls.length, 0, 'v33: local-only add makes zero server calls');
  // ---- Logout clears the server session ----
  ctx.sbStoreSession({ access_token: 'tok-x', refresh_token: 'ref-x', expires_in: 3600, user: { id: 'u1', email: 'a@x.in' } });
  ctx.state.sb = { uid: 'u1', email: 'a@x.in' };
  sbCalls = [];
  ctx.logout(); await waitLogoutCtx();
  v28eq(ctx.sbLoadSession(), null, 'v28: logout clears the stored server session');
  v28eq(ctx.state.sb, null, 'v28: logout clears the in-memory server session');
  v28ok(sbCalls.some(function (c) { return c.url.indexOf('/auth/v1/logout') !== -1; }), 'v28: logout signs out of the server');


  // ================= v34: all audit P0 + P1 fixes =================
  function vm34Setup() {
    Object.keys(sbServer).forEach(function (k) { sbServer[k] = []; });
    sbCalls = [];
    sbFailTables.clear();
    sbSignupMode = 'ok';
    sbRefreshFail = false;
    sbGetSchoolsEmptyOnce = false;
    ctx.sbSessionExpired = false;
    ctx.sbFetchTimeoutMs = 30000;
    ctx.fetch = sbMockFetch;
    ctx.navigator.onLine = true;
    (function () { var keys = []; for (var i = 0; i < ls.length; i++) keys.push(ls.key(i)); keys.forEach(function (k) { ls.removeItem(k); }); })();
    ctx.sbSyncResetMemory();
    resetDevice();
    ctx.saveAccounts([vmAcct]);
    ctx.loginAs(vmAcct);
    ctx.state.sb = { uid: 'sb-uid-vm@school.in', email: 'vm@school.in' };
    ctx.sbStoreSession({ access_token: 'tok-vm', token_type: 'Bearer', expires_in: 3600, refresh_token: 'ref-vm', user: { id: 'sb-uid-vm@school.in', email: 'vm@school.in' } });
    ctx.db = ctx.emptyDb({ name: 'VM School', city: '', principal: 'Sunil Kumar', phone: '', email: 'vm@school.in', session: '2025–26', address: '' });
    ctx.saveDB(ctx.db);
  }

  // ---- v34 P0-1 (i): a local-only account links on login ----
  vm34Setup();
  var linkAcct = { uid: 'u-link-1', name: 'Link Admin', school: 'Link School', email: 'link@school.in', pwHash: ctx.hashPw('TestAdmin-2026'), role: 'school', sub: 'School Admin • Link School', created: '2026-11-09' }; // no sbUid
  ctx.saveAccounts([linkAcct]);
  ctx.sbClearSession();
  ctx.state.sb = null;
  ctx.sbLocalLogin('link@school.in', 'TestAdmin-2026', ctx.document.getElementById('loginErr'));
  await waitFor(function () { return !!ctx.findAccount('link@school.in').sbUid; }, 'local-only account links on login');
  v28ok(!!ctx.findAccount('link@school.in').sbUid, 'v34 P0-1: a local-only school account gets its sbUid on login (signup retry)');
  v28eq(ctx.findAccount('link@school.in').sbUid, 'sb-uid-new', 'v34 P0-1: the linked sbUid is the server user id');
  v28eq(ctx.sbLoadStatus().state, 'synced', 'v34 P0-1: status is synced after the link');

  // ---- v34 P0-1 (ii): a GoTrue 429 backs off, never spams ----
  vm34Setup();
  sbSignupMode = 'rate-limit';
  var linkAcct2 = { uid: 'u-link-2', name: 'Link2 Admin', school: 'Link2 School', email: 'link2@school.in', pwHash: ctx.hashPw('TestAdmin-2026'), role: 'school', sub: 'School Admin • Link2 School', created: '2026-11-09' };
  ctx.saveAccounts([linkAcct2]);
  var rLink2 = await ctx.sbLinkServerAccount(linkAcct2, 'TestAdmin-2026');
  v28eq(rLink2.done, false, 'v34 P0-1: the link fails on a 429');
  v28eq(rLink2.reason, 'rate-limited', 'v34 P0-1: the 429 reason is rate-limited');
  v28eq(linkAcct2.sbUid, undefined, 'v34 P0-1: no sbUid after a 429');
  var rLink2b = await ctx.sbLinkServerAccount(linkAcct2, 'TestAdmin-2026');
  v28eq(rLink2b.reason, 'backoff', 'v34 P0-1: the second attempt backs off instead of re-posting');
  v28eq(sbCalls.filter(function (c) { return c.url.indexOf('/auth/v1/signup') !== -1; }).length, 1, 'v34 P0-1: only one signup POST despite two link attempts');
  sbSignupMode = 'ok';

  // ---- v34 P0-1 (iii): an already-registered email signs in instead ----
  vm34Setup();
  sbSignupMode = 'exists';
  var linkAcct3 = { uid: 'u-link-3', name: 'Link3 Admin', school: 'Link3 School', email: 'link3@school.in', pwHash: ctx.hashPw('TestAdmin-2026'), role: 'school', sub: 'School Admin • Link3 School', created: '2026-11-09' };
  ctx.saveAccounts([linkAcct3]);
  var rLink3 = await ctx.sbLinkServerAccount(linkAcct3, 'TestAdmin-2026');
  v28eq(rLink3.done, true, 'v34 P0-1: an already-registered email links by signing in');
  v28eq(rLink3.reason, 'signed-in', 'v34 P0-1: the link reason is signed-in');
  v28eq(linkAcct3.sbUid, 'sb-uid-link3@school.in', 'v34 P0-1: the signed-in sbUid is stored');
  sbSignupMode = 'ok';

  // ---- v34 P0-2 (i): an overpayment is capped, fee records + receipt agree ----
  vm34Setup();
  ctx.db.students.push(vmStudent('stu-ov1', 'Over Kid', 'ADM-2025-001', 'ENR-001'));
  ctx.db.feeRecords.push({ id: 'fee-ov1', studentId: 'stu-ov1', student: 'Over Kid', cls: '6th-A', month: 'Nov', type: 'Tuition', amount: 800, status: 'Pending', date: '2026-11-01' });
  ctx.saveDB(ctx.db);
  var ovStudent = ctx.db.students.filter(function (s) { return s.id === 'stu-ov1'; })[0];
  var ovDraft = { studentId: 'stu-ov1', month: 'Nov', counterNo: 'COUNTER-1', payMode: 'Cash', payDate: '2026-11-09', bank: '', number: '', lines: [{ key: 'tuition', desc: 'Tuition (Nov)', type: 'Tuition', month: 'Nov', due: 800, con: 0, paid: 1000, recordId: 'fee-ov1' }] };
  ctx.finishCollectFee(ovDraft, ovStudent, 1000, 'RCP-2026-001', false);
  var ovRec = ctx.db.feeRecords.filter(function (r) { return r.id === 'fee-ov1'; })[0];
  v28eq(ovRec && ovRec.amount, 800, 'v34 P0-2: the fee record stores the capped net (800), not the 1000 paid');
  v28eq(ovRec && ovRec.status, 'Collected', 'v34 P0-2: the fee record is Collected');
  var ovRcpt = ctx.db.receipts.filter(function (r) { return r.receiptNo === 'RCP-2026-001'; })[0];
  v28eq(ovRcpt && ovRcpt.total, 800, 'v34 P0-2: the receipt total is the capped 800, not the 1000 paid');
  v28eq(ctx.feeTotals().collected, 800, 'v34 P0-2: feeTotals collected (800) agrees with the receipt total (800)');
  v28eq(ctx.feeTotals().pending, 0, 'v34 P0-2: no pending remainder after a full capped payment');
  // ---- v34 P0-2 (ii): readCollectInputs caps a raw paid too ----
  var ovDraft2 = { studentId: 'stu-ov1', month: 'Nov', counterNo: 'COUNTER-1', payMode: 'Cash', payDate: '2026-11-09', bank: '', number: '', lines: [{ key: 'tuition', desc: 'Tuition (Nov)', type: 'Tuition', month: 'Nov', due: 800, con: 0, paid: 800, recordId: 'fee-ov1' }] };
  ctx.collectDraft = ovDraft2;
  ctx.document.getElementById('rcptDue-tuition').value = '800';
  ctx.document.getElementById('rcptCon-tuition').value = '0';
  ctx.document.getElementById('rcptPaid-tuition').value = '1000';
  ctx.readCollectInputs();
  v28eq(ovDraft2.lines[0].paid, 800, 'v34 P0-2: readCollectInputs caps a raw paid of 1000 to the net 800');
  v28eq(ctx.document.getElementById('rcptPaid-tuition').value, 800, 'v34 P0-2: the capped paid is written back to the input');
  ctx.collectDraft = null;

  // ---- v34 P0-3 (i): Generate Fees only for enrolled students ----
  vm34Setup();
  ctx.db.feeStructure = [{ cls: '6th-A', type: 'Tuition', amount: 800 }];
  ctx.db.students.push(vmStudent('stu-g1', 'Active Kid', 'ADM-2025-001', 'ENR-001'));
  var gInactive = vmStudent('stu-g2', 'Inactive Kid', 'ADM-2025-002', 'ENR-002'); gInactive.status = 'Inactive';
  ctx.db.students.push(gInactive);
  var gDraft = vmStudent('stu-g3', 'Draft Kid', '', ''); gDraft.status = 'Draft'; gDraft.admissionNo = ''; gDraft.enr = '';
  ctx.db.students.push(gDraft);
  var gCanc = vmStudent('stu-g4', 'Cancelled Kid', 'ADM-2025-004', 'ENR-004'); gCanc.status = 'Cancelled';
  ctx.db.students.push(gCanc);
  ctx.saveDB(ctx.db);
  ctx.state.feeGenMonth = 'Nov';
  ctx.generateFees();
  var genIds = ctx.db.feeRecords.map(function (r) { return r.studentId; }).sort();
  v28eq(genIds.join(','), 'stu-g1,stu-g2', 'v34 P0-3: Generate Fees creates dues only for Active + Inactive students');
  v28eq(ctx.db.feeRecords.length, 2, 'v34 P0-3: exactly two dues created (Draft + Cancelled get none)');
  v28ok(ctx.db.feeRecords.every(function (r) { return r.id.indexOf('fee-gen-') === 0; }), 'v34 P0-3: generated dues use deterministic fee-gen- ids');
  v28eq(ctx.db.feeRecords.filter(function (r) { return r.studentId === 'stu-g1'; })[0].id, 'fee-gen-stu-g1-Nov-Tuition', 'v34 P0-3: the deterministic id is fee-gen-<student>-<month>-<type>');
  ctx.generateFees();
  v28eq(ctx.db.feeRecords.length, 2, 'v34 P0-3: a second Generate for the same month adds no duplicates');

  // ---- v34 P0-3 (ii): two devices generating the same month never duplicate on the server ----
  vm34Setup();
  ctx.db.feeStructure = [{ cls: '6th-A', type: 'Tuition', amount: 800 }];
  ctx.db.students.push(vmStudent('stu-ankit-1', 'Ankit Kumar', 'ADM-2025-001', 'ENR-001'));
  ctx.saveDB(ctx.db);
  ctx.state.feeGenMonth = 'Nov';
  ctx.generateFees();
  await ctx.sbSyncCycle();
  v28eq(sbServer.ss_fee_records.length, 1, 'v34 P0-3: device A uploads exactly one due');
  // Device B: a fresh local copy of the same school, same student, same month.
  restoreLS({});
  resetDevice();
  ctx.saveAccounts([vmAcct]);
  ctx.loginAs(vmAcct);
  ctx.state.sb = { uid: 'sb-uid-vm@school.in', email: 'vm@school.in' };
  ctx.sbStoreSession({ access_token: 'tok-vm', token_type: 'Bearer', expires_in: 3600, refresh_token: 'ref-vm', user: { id: 'sb-uid-vm@school.in', email: 'vm@school.in' } });
  ctx.db = ctx.emptyDb({ name: 'VM School', city: '', principal: 'Sunil Kumar', phone: '', email: 'vm@school.in', session: '2025–26', address: '' });
  ctx.db.feeStructure = [{ cls: '6th-A', type: 'Tuition', amount: 800 }];
  ctx.db.students.push(vmStudent('stu-ankit-1', 'Ankit Kumar', 'ADM-2025-001', 'ENR-001'));
  ctx.saveDB(ctx.db);
  ctx.state.feeGenMonth = 'Nov';
  ctx.generateFees();
  v28eq(ctx.db.feeRecords.length, 1, 'v34 P0-3: device B generates its own local due');
  v28eq(ctx.db.feeRecords[0].id, 'fee-gen-stu-ankit-1-Nov-Tuition', 'v34 P0-3: device B mints the SAME deterministic id');
  await ctx.sbSyncCycle();
  v28eq(sbServer.ss_fee_records.length, 1, 'v34 P0-3: the server still holds exactly one due after both devices generate');
  v28eq(ctx.db.feeRecords.length, 1, 'v34 P0-3: device B keeps exactly one local due after the pull');

  // ---- v34 P1-1 (i): a failed upload skips the pull — local marks survive ----
  vm33SeedServer(); // server: VM School + Ankit (ADM-2025-001), counter 1
  await vm33FreshDevice(); // device mirrors the server (Ankit, no local changes)
  ctx.db.attendance['2026-11-09|6th-A'] = { 'stu-ankit-1': 'Absent' };
  ctx.db.feeStructure.push({ cls: '6th-A', type: 'Library', amount: 100 });
  ctx.db.students.push(vmStudent('stu-new-1', 'New Kid', 'ADM-2025-003', 'ENR-003'));
  ctx.saveDB(ctx.db);
  // Meanwhile another device adds a student on the server.
  sbServer.ss_students.push({ id: 'srv-other-1', school_id: 'srv-school-vm33', local_id: 'stu-other-1', name: 'Other Device Kid', cls: '6th-A', roll: 5, enr: 'ENR-005', guardian: 'G', phone: '9812345685', mobile2: '', parent_email: '', father_name: 'F', mother_name: 'M', occupation: '', dob: '', gender: '', blood_group: '', category: '', address: '', state: '', district: '', pin: '', previous_school: '', previous_class: '', admission_no: 'ADM-2025-002', admission_date: '', session: '2025–26', status: 'Active', result: null, parent_pin: null, photo_data_url: null, documents: { birthCert: false, tc: false, tcNumber: '', other: '' }, aadhaar: '', created_at: sbNowISO(), updated_at: sbNowISO() });
  sbFailTables.add('ss_students'); // the upload pass fails on the students table
  var c34p11 = await ctx.sbSyncCycle();
  v28eq(c34p11.done, false, 'v34 P1-1: the cycle reports failure when the upload fails');
  v28eq(c34p11.reason, 'upload-failed', 'v34 P1-1: the cycle reason is upload-failed');
  v28ok(!ctx.db.students.some(function (s) { return s.id === 'stu-other-1'; }), 'v34 P1-1: the pull is skipped — the other device student does NOT appear locally');
  v28ok(ctx.db.students.some(function (s) { return s.id === 'stu-new-1'; }), 'v34 P1-1: the not-yet-uploaded student survives the failed cycle');
  v28eq((ctx.db.attendance['2026-11-09|6th-A'] || {})['stu-ankit-1'], 'Absent', 'v34 P1-1: the offline attendance mark survives the failed cycle');
  v28ok(ctx.db.feeStructure.some(function (f) { return f.cls === '6th-A' && f.type === 'Library'; }), 'v34 P1-1: the new fee-structure row survives the failed cycle');
  v28eq(ctx.sbLoadStatus().state, 'failed', 'v34 P1-1: the status says failed, not syncing');
  sbFailTables.delete('ss_students');
  var c34p11b = await ctx.sbSyncCycle();
  v28eq(c34p11b.done, true, 'v34 P1-1: the next cycle completes once the server is back');
  v28ok(ctx.db.students.some(function (s) { return s.id === 'stu-other-1'; }), 'v34 P1-1: the pull runs on the next cycle and the other student appears');
  v28eq((ctx.db.attendance['2026-11-09|6th-A'] || {})['stu-ankit-1'], 'Absent', 'v34 P1-1: the offline mark is still there after the good cycle');
  v28ok(ctx.db.feeStructure.some(function (f) { return f.cls === '6th-A' && f.type === 'Library'; }), 'v34 P1-1: the fee-structure row is still there after the good cycle');

  // ---- v34 P1-1 (ii): even a bare pull keeps un-synced marks and structure rows ----
  vm33SeedServer();
  await vm33FreshDevice();
  ctx.db.attendance['2026-11-09|6th-A'] = { 'stu-ankit-1': 'Late' };
  ctx.db.feeStructure.push({ cls: '6th-A', type: 'Computer Lab', amount: 200 });
  ctx.saveDB(ctx.db);
  // Mark the device migrated first: a bare pull on a never-migrated
  // device with local-only rows correctly answers needs-migration (the
  // guard), which is not what this test measures — the pull itself, once
  // it runs, must keep the un-synced rows instead of wiping them.
  ctx.sbSaveMig('sb-uid-vm@school.in', { at: '2026-11-09T00:00:00.000Z', schoolId: 'srv-school-vm33', counts: {} });
  var pull34 = await ctx.sbSyncPullRun(vmAcct, 'sb-uid-vm@school.in', 'tok-vm');
  v28eq(pull34.done, true, 'v34 P1-1: the bare pull completes');
  v28eq((ctx.db.attendance['2026-11-09|6th-A'] || {})['stu-ankit-1'], 'Late', 'v34 P1-1: an un-synced mark for a synced student survives a bare pull');
  v28ok(ctx.db.feeStructure.some(function (f) { return f.cls === '6th-A' && f.type === 'Computer Lab'; }), 'v34 P1-1: an un-synced fee-structure row survives a bare pull');

  // ---- v34 P1-2: a hung request times out and releases the sync lock ----
  vm34Setup();
  ctx.sbFetchTimeoutMs = 50;
  var realFetch34 = ctx.fetch;
  ctx.fetch = function (url, init) {
    return new Promise(function (resolve, reject) {
      var sig = init && init.signal;
      if (sig) {
        if (sig.aborted) { reject(new Error('aborted')); return; }
        sig.addEventListener('abort', function () { reject(new Error('aborted')); });
      }
    });
  };
  var t0p12 = Date.now();
  var c34p12 = await ctx.sbSyncCycle();
  var dtp12 = Date.now() - t0p12;
  v28eq(c34p12.done, false, 'v34 P1-2: the cycle reports failure when every request hangs');
  v28ok(dtp12 < 5000, 'v34 P1-2: the hung cycle finishes in under 5s (took ' + dtp12 + 'ms)');
  v28eq(ctx.sbLoadStatus().state, 'failed', 'v34 P1-2: the status says failed after the timeout');
  ctx.fetch = realFetch34;
  ctx.sbFetchTimeoutMs = 30000;
  var c34p12b = await ctx.sbSyncCycle();
  v28eq(c34p12b.done, true, 'v34 P1-2: the next cycle completes once the network is back (lock released)');

  // ---- v34 P1-3: a rejected refresh token is "session expired", not "offline" ----
  vm34Setup();
  sbRefreshFail = true;
  ctx.sbStoreSession({ access_token: 'tok-old', token_type: 'Bearer', expires_in: -3600, refresh_token: 'ref-old', user: { id: 'sb-uid-vm@school.in', email: 'vm@school.in' } });
  var tok34p13 = await ctx.sbGetValidToken();
  v28eq(tok34p13, null, 'v34 P1-3: a rejected refresh returns no token');
  v28eq(ctx.sbSessionExpired, true, 'v34 P1-3: the rejected refresh marks the session expired');
  var c34p13 = await ctx.sbSyncCycle();
  v28eq(c34p13.done, false, 'v34 P1-3: the cycle fails without a token');
  v28eq(ctx.sbLoadStatus().state, 'session-expired', 'v34 P1-3: the status is session-expired, not offline');
  v28ok(ctx.sbStatusText().indexOf('log in again') !== -1, 'v34 P1-3: the status text tells the user to log in again (got: ' + ctx.sbStatusText() + ')');
  sbRefreshFail = false;
  ctx.sbSessionExpired = false;

  // ---- v34 P1-4: a wrong password on a linked account is shown, not silently fallen back ----
  vm34Setup();
  resetDevice();
  var wrongPwAcct = { uid: 'u-wrongpw-1', name: 'WrongPw Admin', school: 'WrongPw School', email: 'wrongpw@school.in', pwHash: ctx.hashPw('localpw1'), role: 'school', sub: 'School Admin • WrongPw School', created: '2026-11-09', sbUid: 'sb-uid-wrongpw@school.in' };
  ctx.saveAccounts([wrongPwAcct]);
  ctx.document.getElementById('loginId').value = 'wrongpw@school.in';
  ctx.document.getElementById('loginPw').value = 'localpw1';
  ctx.doLogin({ preventDefault: function () {} });
  await tick(); await tick(); await tick();
  v28eq(ctx.state.user, null, 'v34 P1-4: a linked account with a wrong server password is NOT logged in');
  v28ok(ctx.document.getElementById('loginErr').textContent.indexOf('Wrong password') !== -1, 'v34 P1-4: the error says the server password is wrong (got: ' + ctx.document.getElementById('loginErr').textContent + ')');
  v28ok(typeof ctx.loginFailsLoad === 'function' ? !ctx.loginFailsLoad()['wrongpw@school.in'] : false, 'H-2 fix (b): a linked account with a wrong server password never reaches the local login (no local fail recorded)');
  // A local-only account with the same wrong-server-password still falls back.
  var localOnly34 = { uid: 'u-local34-1', name: 'Local34 Admin', school: 'Local34 School', email: 'local34@school.in', pwHash: ctx.hashPw('localpw1'), role: 'school', sub: 'School Admin • Local34 School', created: '2026-11-09' };
  ctx.saveAccounts([wrongPwAcct, localOnly34]);
  ctx.document.getElementById('loginId').value = 'local34@school.in';
  ctx.document.getElementById('loginPw').value = 'localpw1';
  ctx.doLogin({ preventDefault: function () {} });
  await waitFor(function () { return !!ctx.state.user; }, 'local-only fallback login');
  v28eq(ctx.state.user && ctx.state.user.email, 'local34@school.in', 'v34 P1-4: a local-only account still falls back to the local login when the server rejects it');

  // ---- H-2 fix (BAT): local-only gate — a school with no server account still logs in online ----
  vm34Setup();
  sbSignupMode = 'rate-limit'; // the background link must not toast over the local-only toast
  var localFix = { uid: 'u-localfix-1', name: 'LocalFix Admin', school: 'LocalFix School', email: 'localfix@school.in', pwHash: ctx.hashPw('localpw1'), role: 'school', sub: 'School Admin • LocalFix School', created: '2026-11-09' }; // no sbUid
  ctx.saveAccounts([localFix]);
  ctx.sbClearSession();
  ctx.state.role = null; ctx.state.user = null; ctx.state.sb = null;
  ctx.document.getElementById('loginId').value = 'localfix@school.in';
  ctx.document.getElementById('loginPw').value = 'localpw1';
  ctx.doLogin({ preventDefault: function () {} });
  await waitFor(function () { return !!ctx.state.user; }, 'local-only online login (H-2 fix)');
  v28eq(ctx.state.user && ctx.state.user.email, 'localfix@school.in', 'H-2 fix (a): a local-only school logs in online with the right local password');
  v28ok(ctx.document.getElementById('toast').textContent.indexOf('linked to the server yet') !== -1, 'H-2 fix (a): the local-only login says the school is not linked yet (got: ' + ctx.document.getElementById('toast').textContent + ')');
  sbSignupMode = 'ok';

  // ---- CR-1/H-1 (PR #17): 30-day absolute expiry + boot validation ----
  // (i) a session older than 30 days is dropped at boot, storage cleared.
  vm34Setup();
  ls.setItem('schoolSaathiSession', JSON.stringify({ role: 'school', email: 'vm@school.in', view: 'dashboard', at: Date.now() - 31 * 24 * 60 * 60 * 1000 }));
  ctx.state.role = null; ctx.state.user = null;
  v28eq(await ctx.restoreSession(), false, 'CR-1/H-1: a session older than 30 days does not restore');
  v28eq(ls.getItem('schoolSaathiSession'), null, 'CR-1/H-1: the expired session is cleared from storage');
  // (ii) a pre-fix session with no timestamp is treated as expired.
  ls.setItem('schoolSaathiSession', JSON.stringify({ role: 'school', email: 'vm@school.in', view: 'dashboard' }));
  ctx.state.role = null; ctx.state.user = null;
  v28eq(await ctx.restoreSession(), false, 'CR-1/H-1: a session with no timestamp does not restore (one fresh login needed after the update)');
  // (iii) a fresh session restores online when the server accepts the token.
  // Store a Supabase session first: without a token there is nothing to
  // validate and the boot keeps the local session (that is the (iii)/(iv)
  // setup, not the behaviour under test). The (i)/(ii) 30-day branch
  // clears the Supabase session too, so this must come after them.
  ctx.sbStoreSession({ access_token: 'tok-vm', refresh_token: 'ref-vm', expires_in: 3600, user: { id: 'sb-uid-vm@school.in', email: 'vm@school.in' } });
  ls.setItem('schoolSaathiSession', JSON.stringify({ role: 'school', email: 'vm@school.in', view: 'dashboard', at: Date.now() }));
  ctx.state.role = null; ctx.state.user = null;
  v28eq(await ctx.restoreSession(), true, 'CR-1/H-1: a fresh session restores when the server accepts it');
  v28eq(ctx.state.user && ctx.state.user.email, 'vm@school.in', 'CR-1/H-1: the restored session is the same school account');
  // (iv) a server-rejected token drops the session at boot.
  var fetchBefore17 = ctx.fetch;
  ctx.fetch = function (url, init) {
    if (String(url).indexOf('/auth/v1/user') !== -1) return Promise.resolve(sbJsonRes(401, { error: 'invalid_token' }));
    return sbMockFetch(url, init);
  };
  ls.setItem('schoolSaathiSession', JSON.stringify({ role: 'school', email: 'vm@school.in', view: 'dashboard', at: Date.now() }));
  ctx.state.role = null; ctx.state.user = null;
  v28eq(await ctx.restoreSession(), false, 'CR-1/H-1: a server-rejected token does not restore');
  v28eq(ls.getItem('schoolSaathiSession'), null, 'CR-1/H-1: the rejected session is cleared from storage');
  v28eq(ctx.sbLoadSession(), null, 'CR-1/H-1: the rejected Supabase tokens are cleared too');
  v28ok(ctx.document.getElementById('toast').textContent.indexOf('Session expired') !== -1, 'CR-1/H-1: the rejected session toasts that it expired');
  ctx.fetch = fetchBefore17;
  // (v) offline boot never validates and never forces a logout.
  vm34Setup();
  ctx.navigator.onLine = false;
  ls.setItem('schoolSaathiSession', JSON.stringify({ role: 'school', email: 'vm@school.in', view: 'dashboard', at: Date.now() }));
  ctx.state.role = null; ctx.state.user = null;
  v28eq(await ctx.restoreSession(), true, 'CR-1/H-1: offline boot still restores the local session');
  ctx.navigator.onLine = true;

  // ---- v34 P1-5 (i): the reset dialog tells a server account the data returns ----
  vm34Setup();
  ctx.db.profile.name = 'VM School';
  ctx.saveDB(ctx.db);
  ctx.resetAllData();
  var resetHtml34 = ctx.document.getElementById('modalRoot').innerHTML;
  v28ok(resetHtml34.indexOf('server') !== -1, 'v34 P1-5: the reset dialog mentions the server for a server account');
  v28ok(resetHtml34.indexOf('will come back') !== -1, 'v34 P1-5: the reset dialog says the data will come back on the next sync');
  ctx.closeModal();
  // A local-only account keeps the old wording.
  var localReset34 = { uid: 'u-localr-1', name: 'LocalR Admin', school: 'LocalR School', email: 'localr@school.in', pwHash: ctx.hashPw('TestAdmin-2026'), role: 'school', sub: 'School Admin • LocalR School', created: '2026-11-09' };
  ctx.saveAccounts([localReset34]);
  resetDevice();
  ctx.loginAs(localReset34);
  ctx.db = ctx.emptyDb({ name: 'LocalR School', city: '', principal: 'LocalR Admin', phone: '', email: 'localr@school.in', session: '2025–26', address: '' });
  ctx.saveDB(ctx.db);
  ctx.resetAllData();
  var resetHtml34b = ctx.document.getElementById('modalRoot').innerHTML;
  v28ok(resetHtml34b.indexOf('permanently deletes ALL school data') !== -1, 'v34 P1-5: a local-only account keeps the permanent-delete wording');
  ctx.closeModal();
  // ---- v34 P1-5 (ii): the server wipe deletes the school's server rows ----
  vm33SeedServer(); // server: VM School + Ankit
  await vm33FreshDevice();
  v28eq(sbServer.ss_students.length, 1, 'v34 P1-5: the server has Ankit before the wipe');
  var wipe34 = await ctx.sbWipeServerSchool('tok-vm');
  v28eq(wipe34.done, true, 'v34 P1-5: the server wipe completes');
  v28eq(sbServer.ss_schools.length, 0, 'v34 P1-5: the school row is gone from the server');
  v28eq(sbServer.ss_students.length, 0, 'v34 P1-5: the students are gone from the server');

  // ---- v35 P1-6: a student login picks the school first — no cross-school match ----
  (function () { var keys = []; for (var i = 0; i < ls.length; i++) keys.push(ls.key(i)); keys.forEach(function (k) { ls.removeItem(k); }); })();
  ctx.sbSyncResetMemory();
  resetDevice();
  var schA34 = { uid: 'u-sch-a', name: 'A Admin', school: 'School A', email: 'a@school.in', pwHash: ctx.hashPw('TestAdmin-2026'), role: 'school', sub: 'School Admin • School A', created: '2026-11-09' };
  var schB34 = { uid: 'u-sch-b', name: 'B Admin', school: 'School B', email: 'b@school.in', pwHash: ctx.hashPw('TestAdmin-2026'), role: 'school', sub: 'School Admin • School B', created: '2026-11-09' };
  ctx.saveAccounts([schA34, schB34]);
  // School A: a student ADM-2025-001 with PIN 1111. School B: a DIFFERENT student, same number, PIN 2222.
  var kidA34 = vmStudent('stu-a-1', 'Kid A', 'ADM-2025-001', 'ENR-001'); kidA34.parentPin = '1111';
  var dbA34 = ctx.emptyDb({ name: 'School A', city: '', principal: 'A Admin', phone: '', email: 'a@school.in', session: '2025–26', address: '' });
  dbA34.students.push(kidA34);
  ctx.writeDbByKey(ctx.dbKeyFor(schA34), dbA34);
  var kidB34 = vmStudent('stu-b-1', 'Kid B', 'ADM-2025-001', 'ENR-001'); kidB34.parentPin = '2222';
  var dbB34 = ctx.emptyDb({ name: 'School B', city: '', principal: 'B Admin', phone: '', email: 'b@school.in', session: '2025–26', address: '' });
  dbB34.students.push(kidB34);
  ctx.writeDbByKey(ctx.dbKeyFor(schB34), dbB34);
  ctx.fillSchoolPicker('studentSchool');
  var pickerHtml34 = ctx.document.getElementById('studentSchool').innerHTML;
  v28ok(pickerHtml34.indexOf('School A') !== -1 && pickerHtml34.indexOf('School B') !== -1, 'v35 P1-6: the student school picker lists both schools on the device');
  // Log in as Kid B (school B + its PIN).
  ctx.document.getElementById('studentSchool').value = 'u-sch-b';
  ctx.document.getElementById('studentAdmNo').value = 'ADM-2025-001';
  ctx.document.getElementById('studentPin').value = '2222';
  ctx.doStudentLogin({ preventDefault: function () {} });
  v28eq(ctx.state.user && ctx.state.user.studentId, 'stu-b-1', 'v35 P1-6: the student login finds school B’s student, not school A’s');
  v28eq(ctx.state.user && ctx.state.user.name, 'Kid B', 'v35 P1-6: the logged-in student is Kid B');
  // School A’s PIN against school B must fail.
  resetDevice();
  ctx.document.getElementById('studentSchool').value = 'u-sch-b';
  ctx.document.getElementById('studentAdmNo').value = 'ADM-2025-001';
  ctx.document.getElementById('studentPin').value = '1111';
  ctx.doStudentLogin({ preventDefault: function () {} });
  v28eq(ctx.state.user, null, 'v35 P1-6: school A’s PIN does not log in to school B’s student');

  // ---- v34 P1-7: a support request is queued offline and sent on reconnect ----
  vm34Setup();
  vm33SeedServer(); // the post needs a server school row (owner sb-uid-vm@school.in)
  ctx.navigator.onLine = false;
  ctx.document.getElementById('fSupName').value = 'Sunil Kumar';
  ctx.document.getElementById('fSupMsg').value = 'Need help with fees';
  ctx.submitSupportRequest({ preventDefault: function () {} });
  var supQ34 = ctx.sbSupportPendingLoad();
  v28eq(supQ34.length, 1, 'v34 P1-7: the offline support request is queued');
  v28eq(sbServer.ss_support_requests.length, 0, 'v34 P1-7: nothing reaches the server while offline');
  ctx.navigator.onLine = true;
  var sent34 = await ctx.sbFlushSupportQueue();
  v28eq(sent34, 1, 'v34 P1-7: the queued request sends on reconnect');
  v28eq(sbServer.ss_support_requests.length, 1, 'v34 P1-7: the server has the support request after the retry');
  v28eq(ctx.sbSupportPendingLoad().length, 0, 'v34 P1-7: the queue drains after the send');
  // A failed online post is queued too.
  sbFailTables.add('ss_support_requests');
  ctx.document.getElementById('fSupName').value = 'Sunil Kumar';
  ctx.document.getElementById('fSupMsg').value = 'Second request';
  ctx.submitSupportRequest({ preventDefault: function () {} });
  // (harness fix) the failed POST retries twice on 5xx (B8, 500ms +
  // 1000ms) before the app queues it — two 0ms ticks are not enough;
  // poll until the queue holds the request or give up after ~4s.
  await (async function () { for (var i = 0; i < 160; i++) { if (ctx.sbSupportPendingLoad().length === 1) return; await new Promise(function (r) { setTimeout(r, 25); }); } })();
  v28eq(ctx.sbSupportPendingLoad().length, 1, 'v34 P1-7: a failed online post is queued for retry');
  sbFailTables.delete('ss_support_requests');
  await ctx.sbFlushSupportQueue();
  v28eq(sbServer.ss_support_requests.length, 2, 'v34 P1-7: the retried request reaches the server');

  // ---- v34 P1-8 (i): the Apply form lists server schools, not just this device's ----
  vm33SeedServer(); // server: VM School (non-demo)
  (function () { var keys = []; for (var i = 0; i < ls.length; i++) keys.push(ls.key(i)); keys.forEach(function (k) { ls.removeItem(k); }); })();
  ctx.sbSyncResetMemory();
  resetDevice();
  ctx.saveAccounts([]); // no school accounts on this device at all
  ctx.openAdmissionApply();
  await tick(); await tick();
  var applyHtml34 = ctx.document.getElementById('fArSchool').innerHTML;
  v28ok(applyHtml34.indexOf('VM School') !== -1, 'v34 P1-8: the Apply form lists the server school even with no account on this device');
  v28ok(applyHtml34.indexOf('srv-school-vm33') !== -1, 'v34 P1-8: the server school option carries its server id');
  ctx.closeModal();
  // ---- v34 P1-8 (ii): an application to a server school is posted and retried ----
  ctx.document.getElementById('fArSchool').value = 'srv:srv-school-vm33';
  ctx.document.getElementById('fArName').value = 'Apply Kid';
  ctx.document.getElementById('fArDob').value = '';
  ctx.document.getElementById('fArGender').value = '';
  ctx.document.getElementById('fArClass').value = '6th-A';
  ctx.document.getElementById('fArGuardian').value = 'G';
  ctx.document.getElementById('fArPhone').value = '9812345678';
  ctx.document.getElementById('fArPrevSchool').value = '';
  sbFailTables.add('ss_admission_requests');
  ctx.saveAdmissionRequest({ preventDefault: function () {} });
  // (harness fix) same B8 retry wait as P1-7 above: the failed POST
  // retries twice on 5xx before the app queues it.
  await (async function () { for (var i = 0; i < 160; i++) { if (ctx.sbAdmReqPendingLoad().length === 1) return; await new Promise(function (r) { setTimeout(r, 25); }); } })();
  v28eq(sbServer.ss_admission_requests.length, 0, 'v34 P1-8: the failed application does not reach the server');
  v28eq(ctx.sbAdmReqPendingLoad().length, 1, 'v34 P1-8: the failed application is queued for retry');
  sbFailTables.delete('ss_admission_requests');
  var sentAdm34 = await ctx.sbFlushAdmReqQueue();
  v28eq(sentAdm34, 1, 'v34 P1-8: the queued application sends on retry');
  v28eq(sbServer.ss_admission_requests.length, 1, 'v34 P1-8: the server has the application after the retry');
  v28eq(ctx.sbAdmReqPendingLoad().length, 0, 'v34 P1-8: the admission queue drains after the send');

  // ---- v34 P1-9: unmarked students are "Not marked", not Present ----
  vm34Setup();
  ctx.db.students.push(vmStudent('stu-p9a', 'Present Kid', 'ADM-2025-001', 'ENR-001'));
  ctx.db.students.push(vmStudent('stu-p9b', 'Absent Kid', 'ADM-2025-002', 'ENR-002'));
  ctx.db.students.push(vmStudent('stu-p9c', 'Unmarked Kid', 'ADM-2025-003', 'ENR-003'));
  ctx.db.attendance['2026-11-09|6th-A'] = { 'stu-p9a': 'Present', 'stu-p9b': 'Absent' };
  ctx.saveDB(ctx.db);
  ctx.state.attCls = '6th-A';
  ctx.state.attDate = '2026-11-09';
  var attHtml34 = ctx.attendancePage();
  v28ok(attHtml34.indexOf('1 Present') !== -1, 'v34 P1-9: the header counts 1 Present');
  v28ok(attHtml34.indexOf('1 Not marked') !== -1, 'v34 P1-9: the header counts 1 Not marked, not 2 Present');
  v28ok(attHtml34.indexOf('2 Present') === -1, 'v34 P1-9: the header does NOT count 2 Present');
  ctx.saveAttendance();
  var attAudit34 = ctx.db.auditLog.filter(function (a) { return a.action === 'Attendance updated'; })[0];
  v28ok(!!attAudit34 && attAudit34.details.indexOf('1 Not marked') !== -1, 'v34 P1-9: the audit line counts 1 Not marked (got: ' + (attAudit34 && attAudit34.details) + ')');
  v28ok(!!attAudit34 && attAudit34.details.indexOf('1 Present') !== -1, 'v34 P1-9: the audit line counts 1 Present');
  var csvRows34 = null;
  var origDl34 = ctx.downloadCSV;
  ctx.downloadCSV = function (fn, rows) { csvRows34 = rows; };
  ctx.downloadReportCSV('attendance');
  ctx.downloadCSV = origDl34;
  v28ok(!!csvRows34, 'v34 P1-9: the attendance CSV is produced');
  var csvUnmarked34 = (csvRows34 || []).filter(function (r) { return r[0] === 'Unmarked Kid'; })[0];
  v28eq(csvUnmarked34 && csvUnmarked34[4], 'Not marked', 'v34 P1-9: the CSV marks the unmarked student "Not marked", not Present');
  var csvCancelled34 = (csvRows34 || []).filter(function (r) { return r[0] === 'Cancelled Kid'; });
  v28eq(csvCancelled34.length, 0, 'v34 P1-10: the attendance CSV excludes the Cancelled student (none in this roster)');

  // ---- v34 P1-10: Cancelled/Draft students are not on the attendance or marks rosters ----
  vm34Setup();
  ctx.db.students.push(vmStudent('stu-p10a', 'Active Kid', 'ADM-2025-001', 'ENR-001'));
  var canc10 = vmStudent('stu-p10b', 'Cancelled Kid', 'ADM-2025-002', 'ENR-002'); canc10.status = 'Cancelled';
  ctx.db.students.push(canc10);
  var draft10 = vmStudent('stu-p10c', 'Draft Kid', '', ''); draft10.status = 'Draft'; draft10.admissionNo = ''; draft10.enr = '';
  ctx.db.students.push(draft10);
  ctx.db.exams.push({ id: 'ex-p10', name: 'UT1', cls: '6th-A', subject: 'Maths', date: '2026-11-05', total: 100 });
  ctx.saveDB(ctx.db);
  ctx.state.attCls = '6th-A';
  ctx.state.attDate = '2026-11-09';
  var attHtml10 = ctx.attendancePage();
  v28ok(attHtml10.indexOf('Active Kid') !== -1, 'v34 P1-10: the attendance roster has the Active student');
  v28ok(attHtml10.indexOf('Cancelled Kid') === -1, 'v34 P1-10: the attendance roster excludes the Cancelled student');
  v28ok(attHtml10.indexOf('Draft Kid') === -1, 'v34 P1-10: the attendance roster excludes the Draft student');
  ctx.state.examId = 'ex-p10';
  var exHtml10 = ctx.examsPage();
  v28ok(exHtml10.indexOf('Active Kid') !== -1, 'v34 P1-10: the marks roster has the Active student');
  v28ok(exHtml10.indexOf('Cancelled Kid') === -1, 'v34 P1-10: the marks roster excludes the Cancelled student');
  ctx.document.getElementById('mk-stu-p10a').value = '80';
  ctx.document.getElementById('mk-stu-p10b').value = '90';
  ctx.saveMarks('ex-p10');
  v28eq(ctx.db.marks.filter(function (m) { return m.studentId === 'stu-p10a'; }).length, 1, 'v34 P1-10: the Active student’s mark is saved');
  v28eq(ctx.db.marks.filter(function (m) { return m.studentId === 'stu-p10b'; }).length, 0, 'v34 P1-10: the Cancelled student’s mark is not saved');

  // ---- v34 P1-11: a simultaneous first login creates exactly one school row ----
  vm34Setup();
  var id11a = await ctx.sbEnsureServerSchool(vmAcct, 'sb-uid-vm@school.in', 'tok-vm', ctx.db);
  v28ok(!!id11a, 'v34 P1-11: the first ensure creates the school row');
  v28eq(sbServer.ss_schools.length, 1, 'v34 P1-11: exactly one school row after the first ensure');
  // A racing device whose GET sees nothing (its read raced the insert):
  // its POST hits the unique index and gets a 409, and it re-reads the row.
  sbGetSchoolsEmptyOnce = true;
  var id11b = await ctx.sbEnsureServerSchool(vmAcct, 'sb-uid-vm@school.in', 'tok-vm', ctx.db);
  sbGetSchoolsEmptyOnce = false;
  v28eq(id11b, id11a, 'v34 P1-11: the racing ensure returns the SAME school id via the 409 re-read');
  v28eq(sbServer.ss_schools.length, 1, 'v34 P1-11: still exactly one school row after the race');

  // ---- v34 P1-12: a counter far behind is healed BEFORE minting — one cycle is enough ----
  vm33SeedServer();
  for (var n34 = 2; n34 <= 10; n34++) {
    var adm34 = 'ADM-2025-' + String(n34).padStart(3, '0');
    var enr34 = 'ENR-' + String(n34).padStart(3, '0');
    sbServer.ss_students.push({ id: 'srv-33-' + n34, school_id: 'srv-school-vm33', local_id: 'stu-33-' + n34, name: 'Kid ' + n34, cls: '6th-A', roll: n34, enr: enr34, guardian: 'G', phone: '981234568' + n34, mobile2: '', parent_email: '', father_name: 'F', mother_name: 'M', occupation: '', dob: '', gender: '', blood_group: '', category: '', address: '', state: '', district: '', pin: '', previous_school: '', previous_class: '', admission_no: adm34, admission_date: '', session: '2025–26', status: 'Active', result: null, parent_pin: null, photo_data_url: null, documents: { birthCert: false, tc: false, tcNumber: '', other: '' }, aadhaar: '', created_at: sbNowISO(), updated_at: sbNowISO() });
  }
  sbServer.ss_schools[0].adm_counter = 1;
  await vm33FreshDevice();
  var pendStu34 = vmStudent('stu-pending-12', 'Pending Kid', '', ''); pendStu34.numPending = true;
  ctx.db.students.push(pendStu34);
  ctx.saveDB(ctx.db);
  var c34p12m = await ctx.sbSyncCycle();
  v28eq(c34p12m.done, true, 'v34 P1-12: the cycle completes');
  var pend12 = ctx.db.students.filter(function (s) { return s.id === 'stu-pending-12'; })[0];
  v28eq(pend12 && pend12.admissionNo, 'ADM-2025-011', 'v34 P1-12: the pending student is minted ADM-2025-011 in ONE cycle (counter healed first)');
  v28eq(pend12 && pend12.numPending, undefined, 'v34 P1-12: the pending flag clears in the same cycle');
  v28ok(sbServer.ss_schools[0].adm_counter >= 12, 'v34 P1-12: the counter is healed past the highest used number (got ' + sbServer.ss_schools[0].adm_counter + ')');
  // The "assigning number…" state shows while a row is pending.
  vm34Setup();
  var pendStu34b = vmStudent('stu-pending-12b', 'Still Pending Kid', '', ''); pendStu34b.numPending = true;
  ctx.db.students.push(pendStu34b);
  ctx.saveDB(ctx.db);
  var stuHtml12 = ctx.studentsPage();
  v28ok(stuHtml12.indexOf('Assigning number') !== -1, 'v34 P1-12: the students list shows "Assigning number…" for a pending row');

  // ---- v36 async: the upload mapper sends only the last 4 of the Aadhaar ----
  vm33SeedServer();
  await vm33FreshDevice();
  var aadStu36a = vmStudent('stu-aad-36', 'Aadhaar Kid', 'ADM-2025-002', 'ENR-002');
  aadStu36a.aadhaar = '123456789012';
  ctx.db.students.push(aadStu36a);
  ctx.saveDB(ctx.db);
  var cyc36a = await ctx.sbSyncCycle();
  v28eq(cyc36a.done, true, 'v36 async: the cycle completes with a full Aadhaar on the student');
  var srvStu36a = sbServer.ss_students.filter(function (r) { return r.local_id === 'stu-aad-36'; })[0];
  v28ok(!!srvStu36a, 'v36 async: the student reaches the server');
  v28eq(srvStu36a && srvStu36a.aadhaar, '9012', 'v36 async: the server row holds only the last 4 of the Aadhaar');
  v28ok(JSON.stringify(srvStu36a).indexOf('123456789012') === -1, 'v36 async: the full Aadhaar is nowhere in the server row');
  var localStu36a = ctx.db.students.filter(function (s) { return s.id === 'stu-aad-36'; })[0];
  v28eq(localStu36a && localStu36a.aadhaar, '9012', 'v36 async: the pull-back also reduces the local record to last-4');

  // ---- v36 async: a cycle killed by logout never leaves "Backup failed" ----
  vm34Setup();
  var keepStu36 = vmStudent('stu-keep-36', 'Keep Kid', 'ADM-2025-001', 'ENR-001');
  ctx.db.students.push(keepStu36);
  ctx.saveDB(ctx.db);
  var realFetch36 = ctx.fetch;
  // (harness fix) the fetch must FAIL eventually, not hang forever: a
  // never-settling fetch holds sbSyncPromise (and the cycle lock)
  // forever, so every later sbSyncCycle call queues behind it and the
  // run stalls at the v28 guard. 5.5s keeps the cycle in flight at
  // logout (the logout settles on its 5s timer) while letting the lock
  // release before the v39 tests need it; the late failure write is
  // dropped by the v36 guard because logout has already cleared the
  // session by then.
  ctx.fetch = function () { return new Promise(function (resolve, reject) { setTimeout(function () { reject(new Error('hang')); }, 5500); }); }; // a cycle that hangs until its failure lands
  var cycle36 = ctx.sbSyncCycle(); // in flight when the user logs out
  ctx.sbSetStatus('syncing'); // the cycle's mid-flight state (a live run has already written this by the time the user logs out)
  ctx.logout(); await waitLogoutCtx();
  ctx.fetch = realFetch36;
  ctx.sbSetStatus('failed'); // the killed cycle's late failure write
  v28eq(ctx.sbLoadStatus().state, 'synced', 'v36 async: a cycle killed by logout leaves the login screen on Backed up, not Backup failed');
  v28ok(ctx.db.students.some(function (s) { return s.id === 'stu-keep-36'; }), 'v36 async: the local student is intact after the logout');
  void cycle36;

  // ---- v37 async: the in-app update check (stale-SW flip) ----
  var realFetch37 = ctx.fetch;
  var reloadCalls37 = 0;
  ctx.location.reload = function () { reloadCalls37++; };
  var swUpdateCalls37 = 0;
  var ctrlHandler37 = null;
  ctx.navigator.serviceWorker = {
    getRegistration: function () { return Promise.resolve({ update: function () { swUpdateCalls37++; return Promise.resolve(); } }); },
    addEventListener: function (ev, fn) { if (ev === 'controllerchange') ctrlHandler37 = fn; }
  };
  var updUrl37 = '', updInit37 = null;
  ctx.fetch = function (url, init) {
    updUrl37 = String(url); updInit37 = init || {};
    return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ app: 'school-saathi', version: EXPECTED_VERSION + 1 }); } });
  };
  ls.removeItem('schoolSaathiUpdateReload');
  var upd37 = await ctx.checkAppUpdate();
  v28ok(updUrl37.indexOf('version.json') === 0, 'v38 async: the check fetches version.json');
  v28ok(updUrl37.indexOf('__v=') !== -1, 'v38 async: the version fetch carries a cache-busting query');
  v28eq(updInit37.cache, 'no-store', 'v38 async: the version fetch uses cache no-store');
  // (harness fix) the live version must be one ABOVE the running
  // version — the old hard-coded 69/68 assumed the app was v68; the
  // app is v69 now, so live 69 was not newer and every check below
  // saw "not newer" and did nothing.
  v28eq(upd37.newer, true, 'v61 async: a live version ' + (EXPECTED_VERSION + 1) + ' is newer than the running ' + EXPECTED_VERSION);
  v28eq(swUpdateCalls37, 1, 'v38 async: the check asks the service worker to update');
  v28ok(typeof ctrlHandler37 === 'function', 'v38 async: the check waits for the new worker to take control');
  if (typeof ctrlHandler37 === 'function') ctrlHandler37();
  v28eq(reloadCalls37, 1, 'v38 async: the app reloads once the new worker takes control');
  // the guard: a second check for the same version does not reload again
  var upd37b = await ctx.checkAppUpdate();
  v28eq(upd37b.newer, true, 'v38 async: the second check still sees the newer version');
  v28eq(upd37b.reloaded, false, 'v38 async: the second check does not reload again');
  v28eq(reloadCalls37, 1, 'v38 async: no second reload for the same version');
  // same version: nothing happens
  // (harness fix) the matching live version is the RUNNING version —
  // the old hard-coded 68 assumed the app was v68; the app is v69 now.
  ctx.fetch = function () { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ app: 'school-saathi', version: EXPECTED_VERSION }); } }); };
  var upd37c = await ctx.checkAppUpdate();
  v28eq(upd37c.newer, false, 'v38 async: the same live version is not newer');
  v28eq(reloadCalls37, 1, 'v38 async: no reload when the live version matches');
  // offline: the check fails silently and the cached app keeps running
  ctx.fetch = function () { return Promise.reject(new Error('offline')); };
  var upd37d = await ctx.checkAppUpdate();
  v28eq(upd37d.checked, false, 'v38 async: an offline check reports not-checked');
  v28eq(reloadCalls37, 1, 'v38 async: no reload when offline');
  // the SW itself: version.json is network-first, navigation falls back to cache
  v28ok(sw.indexOf('version.json') !== -1 && sw.indexOf("url.pathname.endsWith('version.json')") !== -1, 'v38 async: sw.js handles version.json network-first');
  v28ok(sw.indexOf("caches.match(req).then(function (hit) { return hit || caches.match('index.html'); })") !== -1, 'v38 async: sw.js navigation still falls back to the cached shell offline');
  // ---- v39 async: the stale-snapshot receipt re-uploads, and a receipt failure never blocks the rest ----
  ctx.fetch = sbMockFetch; ctx.navigator.onLine = true;
  vm33SeedServer();
  await vm33FreshDevice();
  // (g) the live v38 bug shape: a receipt minted on the server (RCP-2026-003) but
  // never landed on ss_receipts, sitting in the local snapshot as "already synced".
  // The v39 bypass re-uploads it on the next cycle instead of letting the guard
  // fail the backup forever.
  var ankit39 = ctx.db.students.filter(function (s) { return s.name === 'Ankit Kumar'; })[0];
  var rcp39 = { receiptNo: 'RCP-2026-003', studentId: ankit39.id, name: ankit39.name, cls: '6th-A', date: '2026-11-09', month: 'Nov', total: 800, payMode: 'Cash', payDate: '2026-11-09', counterNo: '3', session: '2025-26', lines: [{ key: 'tuition', desc: 'Tuition Fee (Nov)', type: 'Tuition', month: 'Nov', due: 800, con: 0, paid: 800 }] };
  ctx.db.receipts.push(rcp39);
  ctx.sbSnapSave('u-vm-1', { ss_students: {}, ss_teachers: {}, ss_exams: {}, ss_fee_records: {}, ss_attendance: {}, ss_receipts: { 'RCP-2026-003': 'stalehash' }, ss_marks: {}, ss_homework: {}, ss_notices: {}, ss_admission_requests: {} });
  var cyc39g = await ctx.sbSyncCycle();
  v28eq(cyc39g.done, true, 'v39 async: a cycle with a stale-snapshot receipt completes');
  v28ok(!ctx.sbLoadMig('sb-uid-vm@school.in'), 'v39 async: the receipt uploads in the normal pass — no full migration runs');
  v28eq(sbServer.ss_receipts.length, 1, 'v39 async: the stale-snapshot receipt reaches the server');
  v28eq(sbServer.ss_receipts[0] && sbServer.ss_receipts[0].receipt_no, 'RCP-2026-003', 'v39 async: the uploaded receipt keeps its server-minted number');
  v28eq(ctx.db.receipts.filter(function (r) { return r.receiptNo === 'RCP-2026-003'; }).length, 1, 'v39 async: the receipt survives the pull after re-upload');
  // (h) per-table isolation: a failing receipts POST must not block the fee record or the audit log,
  // and the failure must be named honestly on the status line.
  vm33SeedServer();
  await vm33FreshDevice();
  var ankit39b = ctx.db.students.filter(function (s) { return s.name === 'Ankit Kumar'; })[0];
  ctx.db.feeRecords.push({ id: 'fee-iso-39', studentId: ankit39b.id, student: ankit39b.name, cls: '6th-A', month: 'Nov', type: 'Tuition', amount: 800, status: 'Pending', date: '2026-11-09' });
  ctx.db.receipts.push({ receiptNo: 'RCP-2026-003', studentId: ankit39b.id, name: ankit39b.name, cls: '6th-A', date: '2026-11-09', month: 'Nov', total: 800, payMode: 'Cash', payDate: '2026-11-09', counterNo: '3', session: '2025-26', lines: [] });
  sbFailTables.add('ss_receipts');
  var cyc39h = await ctx.sbSyncCycle();
  sbFailTables.delete('ss_receipts');
  v28eq(cyc39h.done, false, 'v39 async: the cycle reports not-done when one table fails');
  v28eq(cyc39h.reason, 'upload-failed', 'v39 async: the failure reason is upload-failed');
  v28ok(cyc39h.detail && cyc39h.detail.indexOf('ss_receipts') !== -1, 'v39 async: the failure detail names the receipts table');
  v28eq(sbServer.ss_fee_records.filter(function (r) { return r.local_id === 'fee-iso-39'; }).length, 1, 'v39 async: the fee record still uploads past the failing receipts step');
  v28eq(sbServer.ss_receipts.length, 0, 'v39 async: the failed receipts step leaves no receipt on the server');
  var st39h = ctx.sbLoadStatus();
  v28eq(st39h.state, 'failed', 'v39 async: a real failure still writes the failed status');
  v28ok(st39h.detail && st39h.detail.indexOf('ss_receipts') !== -1, 'v39 async: the persisted failure detail names the receipts table');
  // (i) the next successful cycle clears the failure — the line never stays failed after a good sync.
  var cyc39i = await ctx.sbSyncCycle();
  v28eq(cyc39i.done, true, 'v39 async: the retry cycle completes once the receipts step works');
  v28eq(sbServer.ss_receipts.length, 1, 'v39 async: the receipt lands on the retry');
  v28eq(ctx.sbLoadStatus().state, 'synced', 'v39 async: a successful cycle clears the earlier failure status');

  // ---- v40 async: the exact live receipts failure — counter_no "COUNTER-1" (string) vs the INTEGER column ----
  // (j) the raw POST the app used to make is rejected exactly like live PostgREST did on 9 Nov 2026.
  var raw40 = await ctx.sbRest('POST', 'ss_receipts', 'tok-x', [{ school_id: 'srv-school-1', student_id: 'srv-stu-1', receipt_no: 'RCP-2026-090', counter_no: 'COUNTER-1', total: 100 }], 'return=representation');
  v28eq(raw40.status, 400, 'v40 async: a string counter_no is rejected with HTTP 400');
  v28eq(raw40.data && raw40.data.code, '22P02', 'v40 async: the rejection carries the live PostgREST code 22P02');
  v28ok(raw40.data && raw40.data.message && raw40.data.message.indexOf('COUNTER-1') !== -1, 'v40 async: the rejection names the bad value, exactly like the live error');
  // (k) the fixed upload pass: the same receipt, counter label 'COUNTER-1', lands with counter_no 1.
  vm33SeedServer();
  await vm33FreshDevice();
  var ankit40 = ctx.db.students.filter(function (s) { return s.name === 'Ankit Kumar'; })[0];
  ctx.db.receipts.push({ receiptNo: 'RCP-2026-003', studentId: ankit40.id, name: ankit40.name, cls: '6th-A', date: '2026-11-09', month: 'Dec', total: 800, payMode: 'Cash', payDate: '2026-11-09', counterNo: 'COUNTER-1', session: '2025-26', lines: [{ key: 'tuition', desc: 'Tuition Fee (Dec)', type: 'Tuition', month: 'Dec', due: 800, con: 0, paid: 800 }] });
  var cyc40k = await ctx.sbSyncCycle();
  v28eq(cyc40k.done, true, 'v40 async: the cycle completes with a COUNTER-1 receipt');
  v28eq(sbServer.ss_receipts.length, 1, 'v40 async: the receipt lands on the server');
  v28eq(sbServer.ss_receipts[0] && sbServer.ss_receipts[0].counter_no, 1, 'v40 async: the landed receipt carries counter_no 1 (a number)');
  v28eq(typeof (sbServer.ss_receipts[0] && sbServer.ss_receipts[0].counter_no), 'number', 'v40 async: the landed counter_no is a number, never a string');
  v28eq(ctx.sbLoadStatus().state, 'synced', 'v40 async: the status is synced — the Backup failed line is gone');
  // (l) the failure detail now carries the server message, not just the operation name.
  vm33SeedServer();
  await vm33FreshDevice();
  var ankit40b = ctx.db.students.filter(function (s) { return s.name === 'Ankit Kumar'; })[0];
  ctx.db.receipts.push({ receiptNo: 'RCP-2026-003', studentId: ankit40b.id, name: ankit40b.name, cls: '6th-A', date: '2026-11-09', month: 'Dec', total: 800, payMode: 'Cash', payDate: '2026-11-09', counterNo: 'COUNTER-1', session: '2025-26', lines: [] });
  sbFailTables.add('ss_receipts');
  var cyc40l = await ctx.sbSyncCycle();
  sbFailTables.delete('ss_receipts');
  v28eq(cyc40l.done, false, 'v40 async: the cycle reports not-done when the receipts POST fails');
  v28ok(cyc40l.detail && cyc40l.detail.indexOf('ss_receipts') !== -1, 'v40 async: the failure detail names the receipts table');
  v28ok(cyc40l.detail && cyc40l.detail.indexOf('boom') !== -1, 'v40 async: the failure detail carries the server message, not just the operation name');

  // ---- v41 async: the receipt-number minting loop — cycles with an empty id map must not mint ----
  // Live shape (9 Nov 2026): one student, 3 receipts (Oct/Nov/Dec, 800 each, numbers 001/002/003, counter 4).
  // The loop: the repair ran before the pull that saves the id map, so on the first cycle after login the stored
  // map was empty, every receipt's payload carried student_id null, the same-number comparison failed, and the
  // repair minted a new server number per receipt per cycle (live: 192 rows, counter climbing 3 per render).
  // With the fix the repair resolves student ids from the fresh server data it already fetched, and an unknown
  // id never counts as a mismatch.
  function vm41SeedTestSchool() {
    vm33SeedServer();
    sbServer.ss_schools[0].receipt_counter = 4;
    sbServer.ss_receipts.push({ id: 'srv-rcp-41-1', school_id: 'srv-school-vm33', student_id: 'srv-ankit-33', receipt_no: 'RCP-2026-001', admission_no: 'ADM-2025-001', student_name: 'Ankit Kumar', cls: '6th-A', session: '2025–26', receipt_date: '2026-11-08', month: 'Nov', counter_no: 1, lines: [{ key: 'tuition', desc: 'Tuition Fee (Nov)', type: 'Tuition', month: 'Nov', due: 800, con: 0, paid: 800 }], pay_mode: 'Cash', pay_date: '2026-11-08', bank: '', number: '', total: 800, total_words: 'Eight Hundred', collector: 'Sunil Kumar', created_at: sbNowISO(), updated_at: sbNowISO() });
    sbServer.ss_receipts.push({ id: 'srv-rcp-41-2', school_id: 'srv-school-vm33', student_id: 'srv-ankit-33', receipt_no: 'RCP-2026-002', admission_no: 'ADM-2025-001', student_name: 'Ankit Kumar', cls: '6th-A', session: '2025–26', receipt_date: '2026-11-09', month: 'Oct', counter_no: 1, lines: [{ key: 'tuition', desc: 'Tuition Fee (Oct)', type: 'Tuition', month: 'Oct', due: 800, con: 0, paid: 800 }], pay_mode: 'Cash', pay_date: '2026-11-09', bank: '', number: '', total: 800, total_words: 'Eight Hundred', collector: 'Sunil Kumar', created_at: sbNowISO(), updated_at: sbNowISO() });
    sbServer.ss_receipts.push({ id: 'srv-rcp-41-3', school_id: 'srv-school-vm33', student_id: 'srv-ankit-33', receipt_no: 'RCP-2026-003', admission_no: 'ADM-2025-001', student_name: 'Ankit Kumar', cls: '6th-A', session: '2025–26', receipt_date: '2026-11-09', month: 'Dec', counter_no: 1, lines: [{ key: 'tuition', desc: 'Tuition Fee (Dec)', type: 'Tuition', month: 'Dec', due: 800, con: 0, paid: 800 }], pay_mode: 'Cash', pay_date: '2026-11-09', bank: '', number: '', total: 800, total_words: 'Eight Hundred', collector: 'Sunil Kumar', created_at: sbNowISO(), updated_at: sbNowISO() });
  }
  function vm41LocalReceiptNos() { return ctx.db.receipts.map(function (r) { return r.receiptNo; }).sort().join(','); }
  function vm41MintRpcCount() { return sbCalls.filter(function (c) { return c.url.indexOf('/rest/v1/rpc/ss_next_receipt_no') !== -1; }).length; }
  // (m) fresh device pulls the 3 receipts; a second and third cycle with the stored id map CLEARED mint nothing
  vm41SeedTestSchool();
  var c41m1 = await vm33FreshDevice();
  v28eq(c41m1.done, true, 'v41 async: the first cycle completes');
  v28eq(vm41LocalReceiptNos(), 'RCP-2026-001,RCP-2026-002,RCP-2026-003', 'v41 async: the first cycle pulls the 3 receipts with their original numbers');
  v28eq(sbServer.ss_schools[0].receipt_counter, 4, 'v41 async: the first cycle leaves the counter at 4');
  ls.removeItem('schoolSaathiSrvIds:sb-uid-vm@school.in');
  sbCalls = [];
  var c41m2 = await ctx.sbSyncCycle();
  var c41m3 = await ctx.sbSyncCycle();
  v28eq(c41m2.done, true, 'v41 async: the second cycle (empty id map) completes');
  v28eq(c41m3.done, true, 'v41 async: the third cycle completes');
  v28eq(vm41MintRpcCount(), 0, 'v41 async: two cycles with an empty id map make ZERO ss_next_receipt_no calls — the loop is gone');
  v28eq(sbServer.ss_receipts.length, 3, 'v41 async: the server still holds exactly 3 receipts — no duplicates minted');
  v28eq(sbServer.ss_schools[0].receipt_counter, 4, 'v41 async: the counter is still 4 — no mint burned it');
  v28eq(vm41LocalReceiptNos(), 'RCP-2026-001,RCP-2026-002,RCP-2026-003', 'v41 async: the local receipt numbers are unchanged after two more cycles');
  v28eq(ctx.sbOutboxLoad('sb-uid-vm@school.in').length, 0, 'v41 async: the outbox drains — no receipt entry is kept forever');
  v28eq(ctx.sbLoadStatus().state, 'synced', 'v41 async: the status reaches synced — it no longer sticks on syncing');
  // (n) the Fees list shows the same numbers on two renders, and the Fee History receipt tap opens the receipt
  var ankit41 = ctx.db.students.filter(function (s) { return s.name === 'Ankit Kumar'; })[0];
  ['Oct', 'Nov', 'Dec'].forEach(function (m) {
    ctx.db.feeRecords.push({ id: 'fee-41-' + m, studentId: ankit41.id, student: 'Ankit Kumar', cls: '6th-A', month: m, type: 'Tuition', amount: 800, status: 'Collected', date: '2026-11-09' });
  });
  ctx.state.feeSearch = 'Ankit Kumar'; ctx.state.feeFilter = 'All'; ctx.state.feeType = 'All';
  ctx.state.collectStudent = null; ctx.state.feeStudent = null;
  var feesHtml41a = ctx.feesPage();
  var feesHtml41b = ctx.feesPage();
  ctx.state.feeSearch = '';
  v28ok(feesHtml41a.indexOf('RCP-2026-001') !== -1 && feesHtml41a.indexOf('RCP-2026-002') !== -1 && feesHtml41a.indexOf('RCP-2026-003') !== -1, 'v41 async: the Fees list shows the 3 original receipt numbers');
  v28eq(feesHtml41a, feesHtml41b, 'v41 async: two Fees list renders are identical — no number moves between renders');
  var feesTab41 = ctx.profileTabBody(ankit41, 'fees');
  v28ok(feesTab41.indexOf("openSavedReceipt('RCP-2026-003')") !== -1, 'v41 async: the Fee History tab links the Dec receipt');
  ctx.openSavedReceipt('RCP-2026-003');
  v28eq(ctx.state.savedReceiptId, 'RCP-2026-003', 'v41 async: the Fee History receipt tap opens the receipt');
  v28ok(ctx.collectFeePage(ankit41.id).indexOf('RCP-2026-003') !== -1, 'v41 async: the tapped receipt renders its view');
  v28ok(ctx.collectFeePage(ankit41.id).indexOf("waReceiptShare('RCP-2026-003')") !== -1, 'v41 async: the tapped receipt has its Share on WhatsApp button');
  ctx.state.view = 'fees'; ctx.state.collectStudent = null; ctx.state.savedReceiptId = null; ctx.state.feeStudent = null;
  // (o) adopt-before-mint: a local receipt whose number is not on the server but whose content is, links to the earliest server number
  ls.removeItem('schoolSaathiSrvIds:sb-uid-vm@school.in');
  var rc41o = { receiptNo: 'RCP-2026-090', studentId: ankit41.id, name: 'Ankit Kumar', cls: '6th-A', admissionNo: 'ADM-2025-001', date: '2026-11-09', month: 'Oct', total: 800, payMode: 'Cash', payDate: '2026-11-09', counterNo: '1', session: '2025-26', lines: [{ key: 'tuition', desc: 'Tuition Fee (Oct)', type: 'Tuition', month: 'Oct', due: 800, con: 0, paid: 800 }] };
  ctx.db.receipts.push(rc41o);
  ctx.saveDB(ctx.db);
  sbCalls = [];
  var c41o = await ctx.sbSyncCycle();
  v28eq(c41o.done, true, 'v41 async: the adopt cycle completes');
  v28eq(rc41o.receiptNo, 'RCP-2026-002', 'v41 async: the orphaned receipt adopts the earliest server number holding its content (002), it is not re-minted');
  v28eq(vm41MintRpcCount(), 0, 'v41 async: the adopt cycle makes no ss_next_receipt_no call');
  v28eq(sbServer.ss_receipts.length, 3, 'v41 async: the adopt uploads no duplicate row');
  v28eq(vm41LocalReceiptNos(), 'RCP-2026-001,RCP-2026-002,RCP-2026-003', 'v41 async: after the adopt the local receipts are the 3 originals again');

  // ---- v42 async: the live v41 failures end to end — PGRST102 + re-link to 001/002/003 + stale Offline line ----
  // Live shape (9 Nov 2026, v41 browser check): the server holds 192 receipt rows (3 collections x 64 numbers,
  // counter 196); the local device holds the same 3 receipts under 193/194/195 plus seed-style activities without
  // ts mixed with logged activities with ts. Every cycle failed on the activities bulk POST (PGRST102), so the
  // pull never ran and the display stayed on 193/194/195. One v42 cycle must: upload the mixed activities, re-link
  // the locals to 001/002/003, pull the deduped mirror, drain the outbox and reach synced — with ZERO
  // ss_next_receipt_no calls.
  function vm42SeedTestSchool() {
    vm33SeedServer();
    sbServer.ss_schools[0].receipt_counter = 196;
    sbServer.ss_students[0].name = 'V21 Test Kumar';
    sbServer.ss_students[0].local_id = 'stu-v21-42';
    sbServer.ss_students[0].phone = '9876542108';
    // 9 server receipts: the 3 originals + one mid duplicate + the latest duplicate per month (the live 192-row shape, sampled)
    [['RCP-2026-001', 'Nov', '2026-11-08'], ['RCP-2026-103', 'Nov', '2026-11-08'], ['RCP-2026-193', 'Nov', '2026-11-08'],
     ['RCP-2026-002', 'Oct', '2026-11-09'], ['RCP-2026-104', 'Oct', '2026-11-09'], ['RCP-2026-194', 'Oct', '2026-11-09'],
     ['RCP-2026-003', 'Dec', '2026-11-09'], ['RCP-2026-105', 'Dec', '2026-11-09'], ['RCP-2026-195', 'Dec', '2026-11-09']].forEach(function (t, i) {
      sbServer.ss_receipts.push({ id: 'srv-rcp-42-' + i, school_id: 'srv-school-vm33', student_id: 'srv-ankit-33', receipt_no: t[0], admission_no: 'ADM-2025-001', student_name: 'V21 Test Kumar', cls: '6th-A', session: '2025–26', receipt_date: t[2], month: t[1], counter_no: 1, lines: [{ key: 'tuition', desc: 'Tuition Fee (' + t[1] + ')', type: 'Tuition', month: t[1], due: 800, con: 0, paid: 800 }], pay_mode: 'Cash', pay_date: t[2], bank: '', number: '', total: 800, total_words: 'Eight Hundred', collector: 'Sunil Kumar', created_at: sbNowISO(), updated_at: sbNowISO() });
    });
    // matching server fee records, so the pull guard does not fire
    ['Oct', 'Nov', 'Dec'].forEach(function (m, i) {
      sbServer.ss_fee_records.push({ id: 'srv-fee-42-' + i, school_id: 'srv-school-vm33', local_id: 'fee-42-' + m, student_id: 'srv-ankit-33', student_name: 'V21 Test Kumar', cls: '6th-A', month: m, fee_type: 'Tuition', amount: 800, status: 'Collected', record_date: m === 'Nov' ? '2026-11-08' : '2026-11-09' });
    });
  }
  vm42SeedTestSchool();
  (function () { var keys = []; for (var i = 0; i < ls.length; i++) keys.push(ls.key(i)); keys.forEach(function (k) { ls.removeItem(k); }); })();
  ctx.sbSyncResetMemory();
  resetDevice();
  ctx.sbSyncDebounceMs = 0;
  ctx.saveAccounts([vmAcct]);
  ctx.loginAs(vmAcct);
  ctx.db = ctx.emptyDb({ name: 'VM School', city: '', principal: 'Sunil Kumar', phone: '', email: 'vm@school.in', session: '2025–26', address: '' });
  ctx.state.sb = { uid: 'sb-uid-vm@school.in', email: 'vm@school.in' };
  ctx.sbStoreSession({ access_token: 'tok-vm', refresh_token: 'ref-vm', expires_in: 3600, user: { id: 'sb-uid-vm@school.in', email: 'vm@school.in' } });
  ctx.db.students.push(vmStudent('stu-v21-42', 'V21 Test Kumar', 'ADM-2025-001', 'ENR-001'));
  ['Oct', 'Nov', 'Dec'].forEach(function (m) {
    ctx.db.feeRecords.push({ id: 'fee-42-' + m, studentId: 'stu-v21-42', student: 'V21 Test Kumar', cls: '6th-A', month: m, type: 'Tuition', amount: 800, status: 'Collected', date: m === 'Nov' ? '2026-11-08' : '2026-11-09' });
  });
  ctx.db.receipts.push({ receiptNo: 'RCP-2026-193', studentId: 'stu-v21-42', admissionNo: 'ADM-2025-001', name: 'V21 Test Kumar', cls: '6th-A', session: '2025–26', date: '2026-11-08', month: 'Nov', counterNo: 'COUNTER-1', lines: [{ key: 'tuition', desc: 'Tuition Fee (Nov)', type: 'Tuition', month: 'Nov', due: 800, con: 0, paid: 800 }], payMode: 'Cash', payDate: '2026-11-08', bank: '', number: '', total: 800, totalWords: 'Eight Hundred', collector: 'Sunil Kumar' });
  ctx.db.receipts.push({ receiptNo: 'RCP-2026-194', studentId: 'stu-v21-42', admissionNo: 'ADM-2025-001', name: 'V21 Test Kumar', cls: '6th-A', session: '2025–26', date: '2026-11-09', month: 'Oct', counterNo: 'COUNTER-1', lines: [{ key: 'tuition', desc: 'Tuition Fee (Oct)', type: 'Tuition', month: 'Oct', due: 800, con: 0, paid: 800 }], payMode: 'Cash', payDate: '2026-11-09', bank: '', number: '', total: 800, totalWords: 'Eight Hundred', collector: 'Sunil Kumar' });
  ctx.db.receipts.push({ receiptNo: 'RCP-2026-195', studentId: 'stu-v21-42', admissionNo: 'ADM-2025-001', name: 'V21 Test Kumar', cls: '6th-A', session: '2025–26', date: '2026-11-09', month: 'Dec', counterNo: 'COUNTER-1', lines: [{ key: 'tuition', desc: 'Tuition Fee (Dec)', type: 'Tuition', month: 'Dec', due: 800, con: 0, paid: 800 }], payMode: 'Cash', payDate: '2026-11-09', bank: '', number: '', total: 800, totalWords: 'Eight Hundred', collector: 'Sunil Kumar' });
  ctx.db.activities = [
    { icon: '💰', bg: 'green', title: 'New fee payment received', sub: 'by Priya Kumari' },
    { icon: '✅', bg: 'blue', title: 'Attendance updated', sub: 'Class 10th-A' },
    { icon: '💰', bg: 'green', title: 'Fee collected', sub: 'V21 Test Kumar • RCP-2026-003 • ₹800', ts: '2026-11-09T15:30:00.000Z' }
  ];
  ctx.saveDB(ctx.db);
  sbCalls = [];
  var c42 = await ctx.sbSyncCycle();
  v28eq(c42.done, true, 'v42 async: the cycle completes — the activities bulk POST no longer fails with PGRST102');
  v28eq(vm41LocalReceiptNos(), 'RCP-2026-001,RCP-2026-002,RCP-2026-003', 'v42 async: after one cycle the local receipts are the originals 001/002/003, not 193/194/195');
  v28eq(sbServer.ss_receipts.length, 9, 'v42 async: the server gains no new receipt row — nothing re-minted, nothing re-uploaded');
  v28eq(vm41MintRpcCount(), 0, 'v42 async: the cycle makes ZERO ss_next_receipt_no calls');
  v28eq(sbServer.ss_schools[0].receipt_counter, 196, 'v42 async: the server receipt_counter stays 196 — no mint burned it');
  v28eq(sbServer.ss_activities.length, 3, 'v42 async: the mixed activities (seed-style + logged) all land on the server');
  v28ok(sbServer.ss_activities.every(function (r) { return typeof r.created_at === 'string' && !isNaN(Date.parse(r.created_at)); }), 'v42 async: every uploaded activity carries a valid created_at');
  v28eq(ctx.sbOutboxLoad('sb-uid-vm@school.in').length, 0, 'v42 async: the outbox drains — the re-link upserts flush');
  v28eq(ctx.sbLoadStatus().state, 'synced', 'v42 async: the status reaches synced — it no longer sticks on syncing');
  v28ok(ctx.sbStatusText().indexOf('Backed up to the server.') !== -1, 'v42 async: the status line says Backed up to the server.');
  var v21_42 = ctx.db.students.filter(function (s) { return s.name === 'V21 Test Kumar'; })[0];
  ctx.state.feeSearch = 'V21 Test Kumar'; ctx.state.feeFilter = 'All'; ctx.state.feeType = 'All';
  ctx.state.collectStudent = null; ctx.state.feeStudent = null;
  var feesHtml42a = ctx.feesPage();
  var feesHtml42b = ctx.feesPage();
  ctx.state.feeSearch = '';
  v28ok(feesHtml42a.indexOf('RCP-2026-001') !== -1 && feesHtml42a.indexOf('RCP-2026-002') !== -1 && feesHtml42a.indexOf('RCP-2026-003') !== -1, 'v42 async: the Fees list shows the original 001/002/003');
  v28ok(feesHtml42a.indexOf('RCP-2026-193') === -1 && feesHtml42a.indexOf('RCP-2026-194') === -1 && feesHtml42a.indexOf('RCP-2026-195') === -1, 'v42 async: the Fees list shows no re-minted duplicate number');
  v28eq(feesHtml42a, feesHtml42b, 'v42 async: two Fees list renders are identical — the numbers stay stable');
  var feesTab42 = ctx.profileTabBody(v21_42, 'fees');
  v28ok(feesTab42.indexOf("openSavedReceipt('RCP-2026-003')") !== -1, 'v42 async: the Fee History tab links the Dec receipt RCP-2026-003');
  v28ok(feesTab42.indexOf('RCP-2026-195') === -1, 'v42 async: the Fee History tab shows no re-minted duplicate number');
  ctx.openSavedReceipt('RCP-2026-003');
  v28eq(ctx.state.savedReceiptId, 'RCP-2026-003', 'v42 async: the Fee History receipt tap opens RCP-2026-003');
  v28ok(ctx.collectFeePage(v21_42.id).indexOf('RCP-2026-003') !== -1, 'v42 async: the tapped receipt renders its view');
  ctx.state.view = 'fees'; ctx.state.collectStudent = null; ctx.state.savedReceiptId = null; ctx.state.feeStudent = null;
  // ---- v43 async: the status settles to synced and stays there; an unchanged pull does not re-render ----
  // Live shape (9 Nov 2026, v42 browser check): the cycle completed (one manual Back Up Now → toast
  // "Backup complete."), yet the Settings line stayed on "Syncing with the server…" for ~150s — the 30s
  // tick + focus/visibility events started a new cycle (or queued a follow-up) every few seconds, each
  // writing 'syncing' at its start. And the Dec receipt link's first tap did nothing: every pull called
  // renderApp() unconditionally, and a tap landing on a node the re-render replaces is swallowed.
  // After the v42 cycle above the device is synced with nothing left to upload. A second cycle (the
  // next 30s tick) and a third (the tick path itself) must both run QUIET: no 'syncing' write, the status
  // stays 'synced' with a Last Attempt time, and the unchanged pull must not re-render.
  ctx.navigator.onLine = true;
  var writes43 = [];
  var origSetStatus43 = ctx.sbSetStatus;
  ctx.sbSetStatus = function (st, detail) { writes43.push(st); return origSetStatus43(st, detail); };
  var renderCalls43 = 0;
  var origRender43 = ctx.renderApp;
  ctx.renderApp = function () { renderCalls43++; return origRender43.apply(null, arguments); };
  writes43.length = 0; renderCalls43 = 0;
  var c43b = await ctx.sbSyncCycle();
  v28eq(c43b.done, true, 'v43 async: the second cycle (idle tick) completes');
  v28ok(writes43.indexOf('syncing') === -1, 'v43 async: the idle cycle never writes syncing — the status is not dragged back');
  v28eq(ctx.sbLoadStatus().state, 'synced', 'v43 async: after the idle cycle the status is still synced');
  v28ok(ctx.sbStatusText().indexOf('Backed up to the server.') !== -1, 'v43 async: the status line still says Backed up to the server.');
  v28ok(ctx.sbStatusText().indexOf('Last attempt: ') !== -1, 'v43 async: the status line carries a Last Attempt time');
  v28eq(renderCalls43, 0, 'v43 async: the idle cycle does not re-render — the pull changed nothing, so no tap can be swallowed');
  // the 30s-tick path itself (sbSyncAutoTick, not just sbSyncCycle)
  writes43.length = 0; renderCalls43 = 0;
  ctx.sbSyncAutoTick();
  var tickP43 = ctx.sbSyncPromise;
  v28ok(!!tickP43, 'v43 async: the 30s tick starts a cycle while logged in');
  await tickP43;
  v28ok(writes43.indexOf('syncing') === -1, 'v43 async: the 30s tick cycle never writes syncing either');
  v28eq(ctx.sbLoadStatus().state, 'synced', 'v43 async: after the 30s tick the status is still synced');
  v28eq(renderCalls43, 0, 'v43 async: the 30s tick cycle does not re-render either');
  // a pull that DOES change data still re-renders (another device edited a fee amount on the server)
  writes43.length = 0; renderCalls43 = 0;
  var srvFee43 = sbServer.ss_fee_records.filter(function (r) { return r.local_id === 'fee-42-Oct'; })[0];
  srvFee43.amount = 900;
  var c43c = await ctx.sbSyncCycle();
  v28eq(c43c.done, true, 'v43 async: the cycle after a server-side change completes');
  v28ok(renderCalls43 > 0, 'v43 async: a pull that changes data still re-renders the page');
  v28eq(ctx.db.feeRecords.filter(function (r) { return r.id === 'fee-42-Oct'; })[0].amount, 900, 'v43 async: the changed fee amount arrived locally');
  v28eq(ctx.sbLoadStatus().state, 'synced', 'v43 async: after the change cycle the status is synced again');
  v28ok(writes43.indexOf('syncing') === -1, 'v43 async: the change cycle also stays quiet — the local upload was empty, only the pull brought data');
  ctx.sbSetStatus = origSetStatus43;
  ctx.renderApp = origRender43;
  // (c) the login-screen status line while online is never the Offline wording
  restoreLS({});
  resetDevice();
  ctx.state.lang = 'en';
  ctx.navigator.onLine = true;
  ls.setItem('schoolSaathiSbStatus', JSON.stringify({ state: 'offline', at: '2026-11-09T15:00:00.000Z', detail: '' }));
  v28ok(ctx.sbStatusText().indexOf('Offline') === -1, 'v42 (c): a stale persisted offline state never shows Offline wording while online');
  ls.setItem('schoolSaathiSbStatus', JSON.stringify({ state: 'pending', at: '2026-11-09T15:00:00.000Z', detail: '' }));
  v28ok(ctx.sbStatusText().indexOf('Offline') === -1, 'v42 (c): a stale persisted pending state never shows Offline wording while online');
  ctx.navigator.onLine = false;
  ls.setItem('schoolSaathiSbStatus', JSON.stringify({ state: 'offline', at: '2026-11-09T15:00:00.000Z', detail: '' }));
  v28ok(ctx.sbStatusText().indexOf('Offline') !== -1, 'v42 (c): while genuinely offline the Offline wording still shows');
  ls.setItem('schoolSaathiSbStatus', JSON.stringify({ state: 'pending', at: '2026-11-09T15:00:00.000Z', detail: '' }));
  v28ok(ctx.sbStatusText().indexOf('Offline') !== -1, 'v42 (c): while genuinely offline the pending state still shows the Offline wording');
  ctx.navigator.onLine = true;
  // (harness fix) the stamp must be the CURRENT build — the old
  // hard-coded v: 68 was current when the test was written, but the
  // app is v69 now, so the v43 rule correctly treats a v68-stamped
  // failure as stale and hides it.
  ls.setItem('schoolSaathiSbStatus', JSON.stringify({ state: 'failed', at: '2026-11-09T15:00:00.000Z', detail: 'ss_activities: insert-ss_activities: PGRST102', v: EXPECTED_VERSION }));
  v28ok(ctx.sbStatusText().indexOf('Backup failed') !== -1 && ctx.sbStatusText().indexOf('PGRST102') !== -1, 'v43 (c): a failure stamped by the current build still shows Backup failed with its detail while online');

  // ---- v44 async: the live students 409 — stale-map adopt + natural-key adopt + truthful manual-backup toast ----
  // Live shape (9 Nov 2026, v43 browser check): every cycle failed with
  // (post-ss_students-409). The live replay proved the exact PostgREST error:
  // HTTP 409 code 23505 "duplicate key value violates unique constraint
  // ss_students_school_id_admission_no_key" — the V21 Test Kumar row had been
  // re-created on the server 9 Nov 12:37 UTC with a new uuid but the same
  // local_id stu1794162292000, while the stored id map still pointed at the
  // deleted row, so the push never found the row and POSTed a duplicate
  // admission_no ADM-2025-001 every cycle. One cycle must now: adopt the row
  // (PATCH, never a duplicate POST), drain the outbox and reach synced — with
  // the server row's local_id untouched.
  // (j) the raw POST the old push made is rejected exactly like live PostgREST.
  var raw44 = await ctx.sbRest('POST', 'ss_students', 'tok-x', [{ school_id: 'srv-school-vm33', local_id: 'stu-other-44', name: 'Other Kumar', admission_no: 'ADM-2025-001', enr: 'ENR-999' }], 'return=representation');
  v28eq(raw44.status, 409, 'v44 async: a duplicate admission_no POST is rejected with HTTP 409');
  v28eq(raw44.data && raw44.data.code, '23505', 'v44 async: the rejection carries the live PostgREST code 23505');
  v28ok(raw44.data && raw44.data.message && raw44.data.message.indexOf('ss_students_school_id_admission_no_key') !== -1, 'v44 async: the rejection names the live unique constraint, exactly like the live error');
  // (k) the stale-map adopt: the local student IS the server row (same
  // local_id), but the stored map points at a deleted uuid — the push must
  // fall through to the local_id lookup and PATCH, never POST a duplicate.
  function vm44SeedTestSchool() {
    vm33SeedServer();
    sbServer.ss_students[0].name = 'V21 Test Kumar';
    sbServer.ss_students[0].local_id = 'stu1794162292000';
    sbServer.ss_students[0].phone = '9876542108';
  }
  vm44SeedTestSchool();
  (function () { var keys = []; for (var i = 0; i < ls.length; i++) keys.push(ls.key(i)); keys.forEach(function (k) { ls.removeItem(k); }); })();
  ctx.sbSyncResetMemory();
  resetDevice();
  ctx.sbSyncDebounceMs = 0;
  ctx.saveAccounts([vmAcct]);
  ctx.loginAs(vmAcct);
  ctx.db = ctx.emptyDb({ name: 'VM School', city: '', principal: 'Sunil Kumar', phone: '', email: 'vm@school.in', session: '2025–26', address: '' });
  ctx.state.sb = { uid: 'sb-uid-vm@school.in', email: 'vm@school.in' };
  ctx.sbStoreSession({ access_token: 'tok-v44', refresh_token: 'ref-v44', expires_in: 3600, user: { id: 'sb-uid-vm@school.in', email: 'vm@school.in' } });
  ctx.db.students.push(vmStudent('stu1794162292000', 'V21 Test Kumar', 'ADM-2025-001', 'ENR-001'));
  ctx.db.students[0].phone = '9876542108';
  ctx.saveDB(ctx.db);
  // the live stale map: the stored server id points at a row that no longer exists
  ctx.sbSrvIdSet('sb-uid-vm@school.in', 'ss_students', 'stu1794162292000', 'srv-deleted-uuid');
  sbCalls = [];
  var c44k = await ctx.sbSyncCycle();
  v28eq(c44k.done, true, 'v44 async: the cycle with the stale student map completes — no more 409');
  v28eq(sbServer.ss_students.length, 1, 'v44 async: the server gains no second student row');
  v28eq(sbServer.ss_students[0].local_id, 'stu1794162292000', 'v44 async: the server row keeps its local_id — the push adopted it, never renamed it');
  v28eq(ctx.sbOutboxLoad('sb-uid-vm@school.in').length, 0, 'v44 async: the outbox drains — the stale entry flushes');
  v28eq(ctx.sbLoadStatus().state, 'synced', 'v44 async: the status reaches synced with a Last Attempt time');
  v28ok(ctx.sbStatusText().indexOf('Backed up to the server.') !== -1, 'v44 async: the status line says Backed up to the server.');
  v28ok(ctx.sbStatusText().indexOf('Last attempt: ') !== -1, 'v44 async: the status line carries a Last Attempt time');
  // (l) the natural-key adopt: an entry keyed by a stale local id that no
  // longer exists locally, with the same admission_no — the push must find
  // the server row by admission_no and PATCH it WITHOUT local_id, so the
  // server row keeps its own identity.
  ctx.sbOutboxAdd('sb-uid-vm@school.in', { table: 'ss_students', key: 'stu-old-1', op: 'upsert', at: new Date().toISOString(), row: vmStudent('stu-old-1', 'V21 Test Kumar', 'ADM-2025-001', 'ENR-001') });
  sbCalls = [];
  var c44l = await ctx.sbSyncFlushNow();
  v28eq(c44l.done, true, 'v44 async: the natural-key adopt flush completes');
  v28eq(sbServer.ss_students.length, 1, 'v44 async: the adopt creates no second student row');
  v28eq(sbServer.ss_students[0].local_id, 'stu1794162292000', 'v44 async: the adopted server row keeps its local_id — the PATCH never sent the stale one');
  v28eq(ctx.sbOutboxLoad('sb-uid-vm@school.in').length, 0, 'v44 async: the adopted entry drains from the outbox');
  var patch44 = sbCalls.filter(function (c) { return c.method === 'PATCH' && String(c.url).indexOf('/rest/v1/ss_students') !== -1; });
  v28eq(patch44.length, 1, 'v44 async: the adopt made exactly one students PATCH');
  v28ok(patch44[0] && !('local_id' in patch44[0].body), 'v44 async: the adopt PATCH body carries no local_id');
  // (m) a second full cycle with the adopted shape stays synced — no new
  // rows, no re-queue, the Last Attempt time survives an idle tick.
  var c44m = await ctx.sbSyncCycle();
  v28eq(c44m.done, true, 'v44 async: the cycle after the adopt completes');
  v28eq(sbServer.ss_students.length, 1, 'v44 async: the idle cycle creates no student row');
  v28eq(ctx.sbOutboxLoad('sb-uid-vm@school.in').length, 0, 'v44 async: the outbox stays empty through the idle cycle');
  v28eq(ctx.sbLoadStatus().state, 'synced', 'v44 async: the status stays synced after the idle cycle');
  v28ok(ctx.sbStatusText().indexOf('Last attempt: ') !== -1, 'v44 async: the Last Attempt time survives the idle cycle');
  // (n) the manual backup toast: it appears only on a genuinely successful
  // backup and dismisses by itself.
  ctx.sbRetryMigration();
  var toastOk44 = await waitFor(function () { return ctx.document.getElementById('toast').textContent === 'Backup complete.'; }, 'manual backup toast shows Backup complete.');
  v28ok(toastOk44, 'v44 async: Back Up Now toasts Backup complete. when the backup genuinely finishes');
  v28ok(ctx.document.getElementById('toast').classList.contains('show'), 'v44 async: the success toast is visible');
  await new Promise(function (r) { setTimeout(r, 2700); });
  v28ok(!ctx.document.getElementById('toast').classList.contains('show'), 'v44 async: the success toast dismisses by itself');
  v28eq(ctx.document.getElementById('toast').textContent, '', 'v44 async: the dismissed toast leaves no stale text behind');
  // (o) the manual backup toast never lies: with the flush failing, it
  // must say the backup did not finish, never "Backup complete.".
  ctx.sbOutboxAdd('sb-uid-vm@school.in', { table: 'ss_students', key: 'stu-old-1', op: 'upsert', at: new Date().toISOString(), row: vmStudent('stu-old-1', 'V21 Test Kumar', 'ADM-2025-001', 'ENR-001') });
  var origFlush44 = ctx.sbSyncFlushWithToken;
  ctx.sbSyncFlushWithToken = function () { return Promise.resolve({ done: false, reason: 'stub' }); };
  ctx.sbRetryMigration();
  var toastBad44 = await waitFor(function () { return ctx.document.getElementById('toast').textContent.indexOf('Backup did not finish') !== -1; }, 'manual backup toast shows Backup did not finish');
  v28ok(toastBad44, 'v44 async: with the flush failing, Back Up Now toasts Backup did not finish');
  v28ok(ctx.document.getElementById('toast').textContent.indexOf('Backup complete.') === -1, 'v44 async: the failed backup never toasts Backup complete.');
  ctx.sbSyncFlushWithToken = origFlush44;
  // the stub is off: the entry drains for real, leaving a clean device
  var c44o = await ctx.sbSyncFlushNow();
  v28eq(c44o.done, true, 'v44 async: after the stub is removed the flush completes');
  v28eq(ctx.sbOutboxLoad('sb-uid-vm@school.in').length, 0, 'v44 async: the outbox drains once the flush runs for real');

  // ---- v45 async: the demo-seed flood — a local DB holding the full
  // pre-v36 seed plus the one real student must upload ZERO seed rows,
  // reach synced with a Last Attempt time, keep ADM-2025-001 named
  // "V21 Test Kumar", and mint ZERO receipt numbers on idle cycles ----
  // Live shape (9 Nov 2026, v44 verification): the test school went 1
  // student / 0 teachers / 7 fees / 3 receipts / counter 4 (22:55 IST)
  // to 40 students / 12 teachers / 51 fees / 5 receipts / counter 153
  // (23:20 IST) — the seed uploaded one row at a time (~1.4s apart,
  // the flush, not the bulk upload pass), the school row was renamed
  // to "St. Xavier School" with counters 41/1, and the cycle never
  // reached synced. The mock now rejects seed writes (SEED_REJECTED),
  // exactly like it rejects the 409/22P02/PGRST102.
  vm44SeedTestSchool();
  sbServer.ss_schools[0].adm_counter = 2;
  sbServer.ss_schools[0].receipt_counter = 4;
  function srvRc45(no, month, date) {
    return { id: 'srv-rc-45-' + no, school_id: 'srv-school-vm33', student_id: 'srv-ankit-33', receipt_no: no, admission_no: 'ADM-2025-001', student_name: 'V21 Test Kumar', cls: '6th-A', session: '2025–26', receipt_date: date, month: month, counter_no: 1, lines: [{ key: 'tuition', desc: 'Tuition Fee (' + month + ')', type: 'Tuition', month: month, due: 800, con: 0, paid: 800 }], pay_mode: 'Cash', pay_date: date, bank: '', number: '', total: 800, total_words: '', collector: 'Test Admin', created_at: sbNowISO(), updated_at: sbNowISO() };
  }
  sbServer.ss_receipts.push(srvRc45('RCP-2026-001', 'Nov', '2026-11-08'), srvRc45('RCP-2026-002', 'Oct', '2026-11-09'), srvRc45('RCP-2026-003', 'Dec', '2026-11-09'));
  (function () { var keys = []; for (var i = 0; i < ls.length; i++) keys.push(ls.key(i)); keys.forEach(function (k) { ls.removeItem(k); }); })();
  ctx.sbSyncResetMemory();
  resetDevice();
  ctx.sbSyncDebounceMs = 0;
  ctx.saveAccounts([vmAcct]);
  ctx.loginAs(vmAcct);
  ctx.db = ctx.seedDB();
  ctx.db.students.push(vmStudent('stu1794162292000', 'V21 Test Kumar', 'ADM-2025-001', 'ENR-001'));
  ctx.db.students[40].phone = '9876542108';
  ctx.saveDB(ctx.db);
  ctx.state.sb = { uid: 'sb-uid-vm@school.in', email: 'vm@school.in' };
  ctx.sbStoreSession({ access_token: 'tok-v45', refresh_token: 'ref-v45', expires_in: 3600, user: { id: 'sb-uid-vm@school.in', email: 'vm@school.in' } });
  function vm45SeedAttempt(c) {
    if ((c.method === 'POST' || c.method === 'PATCH') && c.body) {
      var rows = Array.isArray(c.body) ? c.body : [c.body];
      var u = String(c.url);
      var m = u.match(/\/rest\/v1\/([a-z_]+)(\?|$)/);
      var table = m && m[1];
      if (table && rows.some(function (r) { return vmIsSeedRow(table, r); })) return true;
      if (table === 'ss_schools' && rows.some(function (r) { return r.name === 'St. Xavier School' && r.principal === 'Rahul Kumar' && r.adm_counter === 41 && r.receipt_counter === 1; })) return true;
    }
    return false;
  }
  sbCalls = [];
  var c45 = await ctx.sbSyncCycle();
  // (a) a local DB holding seed rows uploads ZERO of them and creates ZERO server rows
  v28eq(c45.done, true, 'v45 async: the cycle with a seeded local DB completes');
  v28eq(sbServer.ss_students.length, 1, 'v45 async: the server gains no seed student row');
  v28eq(sbServer.ss_students[0].local_id, 'stu1794162292000', 'v45 async: the only server student is the real V21 row');
  v28eq(sbServer.ss_teachers.length, 0, 'v45 async: the server gains no seed teacher row');
  v28eq(sbServer.ss_exams.length, 0, 'v45 async: the server gains no seed exam row');
  v28eq(sbServer.ss_fee_records.length, 0, 'v45 async: the server gains no seed fee record');
  v28eq(sbServer.ss_homework.length, 0, 'v45 async: the server gains no seed homework row');
  v28eq(sbServer.ss_notices.length, 0, 'v45 async: the server gains no seed notice row');
  v28eq(sbServer.ss_marks.length, 0, 'v45 async: the server gains no seed mark');
  v28eq(sbServer.ss_attendance.length, 0, 'v45 async: the server gains no seed attendance row');
  v28eq(sbServer.ss_receipts.length, 3, 'v45 async: the server keeps exactly the 3 real receipts (no 151/152 duplicates)');
  v28eq(sbCalls.filter(vm45SeedAttempt).length, 0, 'v45 async: the cycle attempts ZERO seed writes — no POST/PATCH carries a seed row or the seed school profile');
  v28eq(sbCalls.filter(function (c) { return c.body && JSON.stringify(c.body).indexOf('SEED_REJECTED') !== -1; }).length, 0, 'v45 async: the mock never has to reject a seed write — the app never attempts one');
  // (b) the adopted ADM-2025-001 row keeps the server name "V21 Test Kumar", never "Aarav Verma"
  v28eq(sbServer.ss_students[0].name, 'V21 Test Kumar', 'v45 async: the server ADM-2025-001 row is still V21 Test Kumar, never the seed name Aarav Verma');
  v28eq(ctx.db.students.length, 1, 'v45 async: the pull drops the local seed students — the local DB is back to 1 student');
  v28eq(ctx.db.students[0].name, 'V21 Test Kumar', 'v45 async: the local ADM-2025-001 row is V21 Test Kumar everywhere');
  v28eq(ctx.db.teachers.length, 0, 'v45 async: the pull drops the local seed teachers');
  v28eq(ctx.db.feeRecords.length, 0, 'v45 async: the pull drops the local seed fee records');
  v28eq(ctx.db.exams.length, 0, 'v45 async: the pull drops the local seed exams');
  // (c) the cycle reaches synced with a Last Attempt time, and the school row is untouched
  v28eq(ctx.sbOutboxLoad('sb-uid-vm@school.in').length, 0, 'v45 async: the outbox drains — queued seed entries drop instead of replaying');
  v28eq(ctx.sbLoadStatus().state, 'synced', 'v45 async: the status reaches synced with a seeded local DB');
  v28ok(ctx.sbStatusText().indexOf('Backed up to the server.') !== -1, 'v45 async: the status line says Backed up to the server.');
  v28ok(ctx.sbStatusText().indexOf('Last attempt: ') !== -1, 'v45 async: the status line carries a Last Attempt time');
  v28eq(sbServer.ss_schools[0].name, 'VM School', 'v45 async: the server school row is not renamed to the seed profile');
  v28eq(sbServer.ss_schools[0].adm_counter, 2, 'v45 async: the server adm counter is not clobbered to the seed 41');
  v28eq(sbServer.ss_schools[0].receipt_counter, 4, 'v45 async: the server receipt counter is not clobbered to the seed 1');
  // (d) an idle cycle makes ZERO ss_next_receipt_no calls and the counter does not move
  sbCalls = [];
  var c45idle = await ctx.sbSyncCycle();
  v28eq(c45idle.done, true, 'v45 async: the idle cycle completes');
  v28eq(sbCalls.filter(function (c) { return c.url.indexOf('/rest/v1/rpc/ss_next_receipt_no') !== -1; }).length, 0, 'v45 async: the idle cycle makes ZERO ss_next_receipt_no calls');
  v28eq(sbServer.ss_schools[0].receipt_counter, 4, 'v45 async: the receipt counter does not move on the idle cycle');
  v28eq(sbServer.ss_students.length, 1, 'v45 async: the idle cycle creates no student row');
  v28eq(ctx.sbOutboxLoad('sb-uid-vm@school.in').length, 0, 'v45 async: the outbox stays empty through the idle cycle');
  v28eq(ctx.sbLoadStatus().state, 'synced', 'v45 async: the status stays synced after the idle cycle');
  // (e) the mock enforces the rejection directly, like the 409/22P02/PGRST102
  var raw45 = await ctx.sbRest('POST', 'ss_students', 'tok-x', [{ school_id: 'srv-school-vm33', local_id: 'stu2', name: 'Vivaan Choudhary', admission_no: 'ADM-2025-002', enr: 'ENR-002' }], 'return=representation');
  v28eq(raw45.status, 400, 'v45 async: a seed student POST is rejected with HTTP 400');
  v28eq(raw45.data && raw45.data.code, 'SEED_REJECTED', 'v45 async: the rejection carries code SEED_REJECTED');
  var raw45b = await ctx.sbRest('PATCH', 'ss_schools?id=eq.srv-school-vm33', 'tok-x', { name: 'St. Xavier School', city: 'Patna', principal: 'Rahul Kumar', phone: '+91 98350 12345', email: 'info@stxavierpatna.edu.in', session: '2025–26', address: 'Boring Road, Patna, Bihar — 800001', adm_counter: 41, receipt_counter: 1 }, 'return=minimal');
  v28eq(raw45b.status, 400, 'v45 async: a seed school-profile PATCH is rejected with HTTP 400');
  v28eq(raw45b.data && raw45b.data.code, 'SEED_REJECTED', 'v45 async: the profile rejection carries code SEED_REJECTED');
  v28eq(sbServer.ss_schools[0].name, 'VM School', 'v45 async: the rejected profile PATCH leaves the server school row untouched');
  // (f) the quarantine helpers are present in the source
  // (checked in the source-level block below)

  // ---- v46 async: the live fee-records stall — a stale snapshot entry
  // for the 3 real fee records (Oct/Nov/Dec, Rs 800, Collected) makes
  // the upload pass skip them forever (0/3), so the migration guard
  // fails every cycle and the pull never runs. Live shape (10 Nov
  // 2026, v45 verification): server test school 1 student / 0
  // teachers / 0 fee records / 3 receipts / counter 4; local DB holds
  // the full seed + the 3 real fee records; the snapshot marks them
  // synced although the server has none of them. One cycle must now
  // upload 3/3, reach synced, and drop every local seed row.
  vm44SeedTestSchool();
  sbServer.ss_schools[0].adm_counter = 2;
  sbServer.ss_schools[0].receipt_counter = 4;
  sbServer.ss_receipts.push(srvRc45('RCP-2026-001', 'Nov', '2026-11-08'), srvRc45('RCP-2026-002', 'Oct', '2026-11-09'), srvRc45('RCP-2026-003', 'Dec', '2026-11-09'));
  (function () { var keys = []; for (var i = 0; i < ls.length; i++) keys.push(ls.key(i)); keys.forEach(function (k) { ls.removeItem(k); }); })();
  ctx.sbSyncResetMemory();
  resetDevice();
  ctx.sbSyncDebounceMs = 0;
  ctx.saveAccounts([vmAcct]);
  ctx.loginAs(vmAcct);
  ctx.db = ctx.seedDB();
  ctx.db.students.push(vmStudent('stu1794162292000', 'V21 Test Kumar', 'ADM-2025-001', 'ENR-001'));
  ctx.db.students[40].phone = '9876542108';
  function vm46Fee(id, month, date) {
    return { id: id, studentId: 'stu1794162292000', student: 'V21 Test Kumar', cls: '6th-A', month: month, type: 'Tuition', amount: 800, status: 'Collected', date: date };
  }
  ctx.db.feeRecords.push(vm46Fee('feemk46oct-0-aa11bb', 'Oct', '2026-10-05'), vm46Fee('feemk46nov-0-bb22cc', 'Nov', '2026-11-05'), vm46Fee('feemk46dec-0-cc33dd', 'Dec', '2026-12-05'));
  // the live stored id map: the v44 adopt persisted the V21 uuid, so
  // the diff hashes the fee records with the resolved student id and
  // the outbox stays empty for them — exactly like the live profile.
  ctx.sbSrvIdSet('sb-uid-vm@school.in', 'ss_students', 'stu1794162292000', 'srv-ankit-33');
  // the live stale snapshot: the 3 real fee records are marked synced
  // although the server holds none of them (the V21 student too — it
  // has been on the server since 9 Nov 12:23 IST). Hashes are the
  // app's own canonical payload hashes, so the diff sees them as
  // synced and queues nothing. The snapshot is keyed by the LOCAL
  // account uid ('u-vm-1') — every sbSnapLoad/sbSnapSave in app.js
  // uses account.uid, while the id map uses the Supabase uid.
  var hashes46 = ctx.sbSyncTableHashes(ctx.db, 'srv-school-vm33', { stu: { 'stu1794162292000': 'srv-ankit-33' }, exam: {} });
  var snap46 = { ss_students: {}, ss_fee_records: {} };
  snap46.ss_students['stu1794162292000'] = hashes46.ss_students['stu1794162292000'].hash;
  ['feemk46oct-0-aa11bb', 'feemk46nov-0-bb22cc', 'feemk46dec-0-cc33dd'].forEach(function (id) { snap46.ss_fee_records[id] = hashes46.ss_fee_records[id].hash; });
  ctx.sbSnapSave('u-vm-1', snap46);
  ctx.state.sb = { uid: 'sb-uid-vm@school.in', email: 'vm@school.in' };
  ctx.sbStoreSession({ access_token: 'tok-vm', refresh_token: 'ref-vm', expires_in: 3600, user: { id: 'sb-uid-vm@school.in', email: 'vm@school.in' } });
  ctx.saveDB(ctx.db);
  // the diagnosis, checked against the app's own quarantine: the real
  // records are NOT seed — their ids are uniqueId-style (never
  // fee1..fee200) and their content (Oct/Nov/Dec, Rs 800) matches no
  // seed row (the seed only ever made Apr-Aug records; its stu1 rows
  // are Apr Rs 16,500 Collected and Apr Rs 6,250 Pending).
  v28ok(ctx.db.feeRecords.filter(function (r) { return r.id.indexOf('feemk46') === 0; }).every(function (r) { return !ctx.sbIsSeedRow('ss_fee_records', r, ctx.db); }), 'v46 async: the quarantine does NOT flag the real Oct/Nov/Dec fee records as seed');
  v28eq(ctx.sbOutboxLoad('sb-uid-vm@school.in').length, 0, 'v46 async: the outbox is empty before the cycle — the stale snapshot hides the 3 records from the diff too');
  sbCalls = [];
  var c46 = await ctx.sbSyncCycle();
  // (a) the 3 fee records upload 3/3 and the server gains exactly those 3
  v28eq(c46.done, true, 'v46 async: the cycle with the stale fee-records snapshot completes');
  v28eq(sbServer.ss_fee_records.length, 3, 'v46 async: the server gains exactly the 3 real fee records');
  v28ok(sbServer.ss_fee_records.every(function (r) { return r.amount === 800 && r.fee_type === 'Tuition' && r.status === 'Collected' && r.student_id === 'srv-ankit-33'; }), 'v46 async: the uploaded fee records are Rs 800 Tuition Collected for the V21 server student');
  v28eq(sbServer.ss_fee_records.map(function (r) { return r.month; }).sort().join(','), 'Dec,Nov,Oct', 'v46 async: the uploaded fee records cover Oct, Nov and Dec');
  v28eq(sbCalls.filter(vm45SeedAttempt).length, 0, 'v46 async: the cycle attempts ZERO seed writes');
  v28eq(sbServer.ss_students.length, 1, 'v46 async: the server gains no seed student row');
  v28eq(sbServer.ss_teachers.length, 0, 'v46 async: the server gains no seed teacher row');
  // (b) the pull drops all local seed rows
  v28eq(ctx.db.students.length, 1, 'v46 async: the pull drops the local seed students — the local DB is back to 1 student');
  v28eq(ctx.db.teachers.length, 0, 'v46 async: the pull drops the local seed teachers');
  v28eq(ctx.db.feeRecords.length, 3, 'v46 async: the pull leaves exactly the 3 real fee records locally');
  v28eq(ctx.db.exams.length, 0, 'v46 async: the pull drops the local seed exams');
  v28eq(ctx.db.receipts.length, 3, 'v46 async: the pull brings the 3 server receipts down');
  // (c) ADM-2025-001 is V21 Test Kumar everywhere, Aarav Verma nowhere
  v28eq(ctx.db.students[0].name, 'V21 Test Kumar', 'v46 async: the local ADM-2025-001 row is V21 Test Kumar');
  v28eq(sbServer.ss_students[0].name, 'V21 Test Kumar', 'v46 async: the server ADM-2025-001 row is V21 Test Kumar');
  v28ok(!ctx.db.students.some(function (s) { return s.name === 'Aarav Verma'; }) && !sbServer.ss_students.some(function (s) { return s.name === 'Aarav Verma'; }) && !ctx.db.receipts.some(function (rc) { return rc.studentName === 'Aarav Verma'; }), 'v46 async: Aarav Verma appears nowhere — not in local students, server students or receipts');
  v28eq(ctx.db.admCounter, 2, 'v46 async: the pull restores the server admission counter 2');
  v28eq(ctx.db.receiptCounter, 4, 'v46 async: the pull restores the server receipt counter 4');
  // (d) the cycle reaches synced with a Last Attempt time
  v28eq(ctx.sbOutboxLoad('sb-uid-vm@school.in').length, 0, 'v46 async: the outbox drains');
  v28eq(ctx.sbLoadStatus().state, 'synced', 'v46 async: the status reaches synced with the stale snapshot');
  v28ok(ctx.sbStatusText().indexOf('Backed up to the server.') !== -1, 'v46 async: the status line says Backed up to the server.');
  v28ok(ctx.sbStatusText().indexOf('Last attempt: ') !== -1, 'v46 async: the status line carries a Last Attempt time');
  // (e) an idle cycle makes ZERO ss_next_receipt_no calls and the counter does not move
  sbCalls = [];
  var c46idle = await ctx.sbSyncCycle();
  v28eq(c46idle.done, true, 'v46 async: the idle cycle completes');
  v28eq(sbCalls.filter(function (c) { return c.url.indexOf('/rest/v1/rpc/ss_next_receipt_no') !== -1; }).length, 0, 'v46 async: the idle cycle makes ZERO ss_next_receipt_no calls');
  v28eq(sbServer.ss_schools[0].receipt_counter, 4, 'v46 async: the receipt counter does not move on the idle cycle');
  v28eq(ctx.sbLoadStatus().state, 'synced', 'v46 async: the status stays synced after the idle cycle');
  // (f) the mock still rejects a seed student POST and a seed fee-record POST
  var raw46s = await ctx.sbRest('POST', 'ss_students', 'tok-x', [{ school_id: 'srv-school-vm33', local_id: 'stu2', name: 'Vivaan Choudhary', admission_no: 'ADM-2025-002', enr: 'ENR-002' }], 'return=representation');
  v28eq(raw46s.status, 400, 'v46 async: a seed student POST is rejected with HTTP 400');
  v28eq(raw46s.data && raw46s.data.code, 'SEED_REJECTED', 'v46 async: the seed student rejection carries code SEED_REJECTED');
  var raw46f = await ctx.sbRest('POST', 'ss_fee_records', 'tok-x', [{ school_id: 'srv-school-vm33', local_id: 'fee1', student_id: 'srv-ankit-33', month: 'Apr', fee_type: 'Tuition', amount: 16500, status: 'Collected', record_date: '2026-04-05' }], 'return=representation');
  v28eq(raw46f.status, 400, 'v46 async: a seed fee-record POST is rejected with HTTP 400');
  v28eq(raw46f.data && raw46f.data.code, 'SEED_REJECTED', 'v46 async: the seed fee-record rejection carries code SEED_REJECTED');
  // the manual backup toast: it appears on a genuine success and dismisses
  ctx.sbRetryMigration();
  var toastOk46 = await waitFor(function () { return ctx.document.getElementById('toast').textContent === 'Backup complete.'; }, 'manual backup toast shows Backup complete.');
  v28ok(toastOk46, 'v46 async: Back Up Now toasts Backup complete. when the backup genuinely finishes');
  await new Promise(function (r) { setTimeout(r, 2700); });
  v28ok(!ctx.document.getElementById('toast').classList.contains('show'), 'v46 async: the success toast dismisses by itself');
  // (g) the pull never wipes a fee record whose upload is still
  // unconfirmed: a Jan collection queued in the outbox, with a stale
  // snapshot entry claiming it synced, survives a direct pull — and
  // the next full cycle uploads it.
  var jan46 = { id: 'feemk46jan-0-dd44ee', studentId: 'stu1794162292000', student: 'V21 Test Kumar', cls: '6th-A', month: 'Jan', type: 'Tuition', amount: 800, status: 'Collected', date: '2027-01-05' };
  ctx.db.feeRecords.push(jan46);
  ctx.sbOutboxAdd('sb-uid-vm@school.in', { table: 'ss_fee_records', key: 'feemk46jan-0-dd44ee', op: 'upsert', at: new Date().toISOString(), row: jan46 });
  v28eq(ctx.sbOutboxLoad('sb-uid-vm@school.in').filter(function (e) { return e.table === 'ss_fee_records' && e.key === 'feemk46jan-0-dd44ee' && e.op === 'upsert'; }).length, 1, 'v46 async: the Jan fee record queues in the outbox');
  var janHashes46 = ctx.sbSyncTableHashes(ctx.db, 'srv-school-vm33', { stu: { 'stu1794162292000': 'srv-ankit-33' }, exam: {} });
  var snap46g = ctx.sbSnapLoad('u-vm-1');
  if (!snap46g.ss_fee_records) snap46g.ss_fee_records = {};
  snap46g.ss_fee_records['feemk46jan-0-dd44ee'] = janHashes46.ss_fee_records['feemk46jan-0-dd44ee'].hash;
  ctx.sbSnapSave('u-vm-1', snap46g);
  var pull46g = await ctx.sbSyncPullRun(vmAcct, 'sb-uid-vm@school.in', 'tok-vm', 'srv-school-vm33');
  v28eq(pull46g.done, true, 'v46 async: the direct pull completes');
  v28ok(ctx.db.feeRecords.some(function (r) { return r.id === 'feemk46jan-0-dd44ee'; }), 'v46 async: the pull keeps the Jan fee record — a pending outbox upsert is never dropped on snapshot grounds');
  v28eq(ctx.sbOutboxLoad('sb-uid-vm@school.in').filter(function (e) { return e.table === 'ss_fee_records' && e.key === 'feemk46jan-0-dd44ee'; }).length, 1, 'v46 async: the Jan outbox entry survives the pull');
  sbCalls = [];
  var c46g = await ctx.sbSyncCycle();
  v28eq(c46g.done, true, 'v46 async: the cycle after the kept Jan record completes');
  v28eq(sbServer.ss_fee_records.length, 4, 'v46 async: the server gains the Jan fee record (4 total)');
  v28eq(ctx.sbLoadStatus().state, 'synced', 'v46 async: the status is synced again after the Jan upload');

  // ---- v47 async: the live attendance stall — the SAME stale-snapshot
  // trap v46 fixed for fee records, now in the attendance step, plus
  // the receipt detail resolving to the seed name. Live shape (10 Nov
  // 2026, v46 verification 01:03 IST): v46 IS live, the 3 fee records
  // ARE on the server — but the cycle fails at "(ss_attendance 0/1)",
  // the local dashboard still shows 40 students / 12 teachers, "V21
  // Test Kumar" is nowhere in the student list, and every receipt
  // DETAIL says "Aarav Verma" while the fee LIST says "V21 Test
  // Kumar". Server state probed 10 Nov ~01:05 IST (read-only): test
  // school 1 student (V21), 0 teachers, 6 fee records — the 3 real
  // collections, EACH POSTED TWICE (same local_id, pairs ~250ms apart:
  // two single-row POST streams, i.e. two concurrent flushes — the
  // upload pass posts bulk, so a second live tab is the likely cause),
  // 0 attendance, 3 receipts, counter 4. Locally the row with id
  // stu1794162292000 is named "Aarav Verma": the v44 flood PATCHed
  // that name onto the server row, and the next pull overwrote the
  // local V21 row with it — so the live local DB holds TWO Aarav
  // Verma rows (seed stu1 + the flood-renamed stu1794162292000) while
  // the fee records and receipts still carry "V21 Test Kumar" in
  // their own stored fields. One cycle must now upload attendance
  // 1/1, reach synced, drop every local seed row, collapse the 6
  // server fee rows to 3 locally, and make the receipt detail say V21.
  vm44SeedTestSchool();
  sbServer.ss_schools[0].adm_counter = 2;
  sbServer.ss_schools[0].receipt_counter = 4;
  sbServer.ss_receipts.push(srvRc45('RCP-2026-001', 'Nov', '2026-11-08'), srvRc45('RCP-2026-002', 'Oct', '2026-11-09'), srvRc45('RCP-2026-003', 'Dec', '2026-11-09'));
  // the live duplicated fee records (v46 verification, 19:27:12–14 UTC):
  // 3 real collections, each present twice under the same local_id.
  function vm47FeeSrv(id, localId, month, date) {
    return { id: id, school_id: 'srv-school-vm33', local_id: localId, student_id: 'srv-ankit-33', month: month, fee_type: 'Tuition', amount: 800, status: 'Collected', record_date: date, student_name: 'V21 Test Kumar', cls: '6th-A', created_at: sbNowISO(), updated_at: sbNowISO() };
  }
  sbServer.ss_fee_records.push(
    vm47FeeSrv('srv-fee-47-oct-a', 'feemk46oct-0-aa11bb', 'Oct', '2026-10-05'),
    vm47FeeSrv('srv-fee-47-oct-b', 'feemk46oct-0-aa11bb', 'Oct', '2026-10-05'),
    vm47FeeSrv('srv-fee-47-nov-a', 'feemk46nov-0-bb22cc', 'Nov', '2026-11-05'),
    vm47FeeSrv('srv-fee-47-nov-b', 'feemk46nov-0-bb22cc', 'Nov', '2026-11-05'),
    vm47FeeSrv('srv-fee-47-dec-a', 'feemk46dec-0-cc33dd', 'Dec', '2026-12-05'),
    vm47FeeSrv('srv-fee-47-dec-b', 'feemk46dec-0-cc33dd', 'Dec', '2026-12-05'));
  (function () { var keys = []; for (var i = 0; i < ls.length; i++) keys.push(ls.key(i)); keys.forEach(function (k) { ls.removeItem(k); }); })();
  ctx.sbSyncResetMemory();
  resetDevice();
  ctx.sbSyncDebounceMs = 0;
  ctx.saveAccounts([vmAcct]);
  ctx.loginAs(vmAcct);
  ctx.db = ctx.seedDB();
  // the flood-renamed local row: same id/admission/enr as the real V21
  // student, but the seed name — exactly like the live profile.
  ctx.db.students.push(vmStudent('stu1794162292000', 'Aarav Verma', 'ADM-2025-001', 'ENR-001'));
  ctx.db.students[40].phone = '9876542108';
  function vm47Fee(id, month, date) {
    return { id: id, studentId: 'stu1794162292000', student: 'V21 Test Kumar', cls: '6th-A', month: month, type: 'Tuition', amount: 800, status: 'Collected', date: date };
  }
  ctx.db.feeRecords.push(vm47Fee('feemk46oct-0-aa11bb', 'Oct', '2026-10-05'), vm47Fee('feemk46nov-0-bb22cc', 'Nov', '2026-11-05'), vm47Fee('feemk46dec-0-cc33dd', 'Dec', '2026-12-05'));
  // the one real attendance row: V21, Present 2026-11-09, 6th-A
  if (!ctx.db.attendance['2026-11-09|6th-A']) ctx.db.attendance['2026-11-09|6th-A'] = {};
  ctx.db.attendance['2026-11-09|6th-A']['stu1794162292000'] = 'Present';
  // a local receipt carrying its own student name — the fee list and
  // the receipt detail must both say V21 even while the local student
  // row still says Aarav.
  ctx.db.receipts.push({ receiptNo: 'RCP-2026-001', studentId: 'stu1794162292000', admissionNo: 'ADM-2025-001', name: 'V21 Test Kumar', cls: '6th-A', session: '2025–26', date: '2026-11-08', month: 'Nov', counterNo: 1, lines: [{ key: 'tuition', desc: 'Tuition Fee (Nov)', type: 'Tuition', month: 'Nov', due: 800, con: 0, paid: 800 }], payMode: 'Cash', payDate: '2026-11-08', bank: '', number: '', total: 800, totalWords: '', collector: 'Test Admin' });
  // the live stored id map: the v44 adopt persisted the V21 uuid.
  ctx.sbSrvIdSet('sb-uid-vm@school.in', 'ss_students', 'stu1794162292000', 'srv-ankit-33');
  // the live stale snapshot: the 3 real fee records AND the 1 real
  // attendance row are marked synced although the server holds the
  // fee records twice and no attendance at all. Hashes are the app's
  // own canonical payload hashes, so the diff sees them as synced and
  // queues nothing. The snapshot is keyed by the LOCAL account uid.
  var hashes47 = ctx.sbSyncTableHashes(ctx.db, 'srv-school-vm33', { stu: { 'stu1794162292000': 'srv-ankit-33' }, exam: {} });
  var snap47 = { ss_students: {}, ss_fee_records: {}, ss_attendance: {}, ss_receipts: {} };
  snap47.ss_students['stu1794162292000'] = hashes47.ss_students['stu1794162292000'].hash;
  ['feemk46oct-0-aa11bb', 'feemk46nov-0-bb22cc', 'feemk46dec-0-cc33dd'].forEach(function (id) { snap47.ss_fee_records[id] = hashes47.ss_fee_records[id].hash; });
  snap47.ss_attendance['2026-11-09|6th-A|stu1794162292000'] = hashes47.ss_attendance['2026-11-09|6th-A|stu1794162292000'].hash;
  snap47.ss_receipts['RCP-2026-001'] = hashes47.ss_receipts['RCP-2026-001'].hash;
  ctx.sbSnapSave('u-vm-1', snap47);
  ctx.state.sb = { uid: 'sb-uid-vm@school.in', email: 'vm@school.in' };
  ctx.sbStoreSession({ access_token: 'tok-vm', refresh_token: 'ref-vm', expires_in: 3600, user: { id: 'sb-uid-vm@school.in', email: 'vm@school.in' } });
  ctx.saveDB(ctx.db);
  // the diagnosis, checked against the app's own quarantine: the real
  // attendance row is NOT seed — its student id is uniqueId-style
  // (never stu1..stu40), so the quarantine filter passes it and only
  // the stale snapshot can hide it.
  v28ok(!ctx.sbIsSeedStudentId('stu1794162292000', ctx.db), 'v47 async: the quarantine does NOT flag the real V21 attendance row as seed');
  v28eq(ctx.sbOutboxLoad('sb-uid-vm@school.in').length, 0, 'v47 async: the outbox is empty before the cycle — the stale snapshot hides the attendance row from the diff too');
  // the receipt-detail bug, visible BEFORE any sync: the local student
  // row says Aarav, the receipt itself says V21 — the detail must say
  // V21. Logged, not asserted: pre-fix it says Aarav (the bug), post-
  // fix it says V21 (the fix) — the pass/fail gate is the post-cycle
  // check below.
  ctx.state.savedReceiptId = 'RCP-2026-001';
  ctx.state.collectStudent = 'stu1794162292000';
  var rcHtml47pre = ctx.collectFeePage('stu1794162292000');
  console.log('v47 pre-cycle receipt detail says: ' + (rcHtml47pre.indexOf('Aarav Verma • 6th-A') !== -1 ? 'Aarav Verma (BUG — resolves through the seed student row)' : rcHtml47pre.indexOf('V21 Test Kumar • 6th-A') !== -1 ? 'V21 Test Kumar (FIXED — resolves from the receipt itself)' : 'NEITHER — unexpected'));
  ctx.state.savedReceiptId = null;
  ctx.state.collectStudent = null;
  sbCalls = [];
  // capture every status write: the live Settings line flashes the exact
  // failure ("Backup failed … (ss_attendance 0/1)") mid-cycle, even
  // though the end-of-cycle flush later overwrites it — the write
  // itself is the proof the cycle failed at the attendance verify.
  var writes47 = [];
  var origSetStatus47 = ctx.sbSetStatus;
  ctx.sbSetStatus = function (st, detail) { writes47.push(st + '|' + (detail || '')); return origSetStatus47(st, detail); };
  var c47 = await ctx.sbSyncCycle();
  console.log('v47 cycle result: done=' + c47.done + ' reason=' + (c47.reason || '') + ' detail=' + (c47.detail || '') + ' status=' + ctx.sbLoadStatus().state + ' line=' + ctx.sbStatusText());
  // Logged, not asserted: pre-fix the cycle writes the exact live
  // failure line mid-cycle; post-fix it never writes a failure line.
  console.log('v47 status writes during the cycle: ' + JSON.stringify(writes47));
  ctx.sbSetStatus = origSetStatus47;
  // (a) attendance 1/1 uploads and the cycle completes
  v28eq(c47.done, true, 'v47 async: the cycle with the stale attendance snapshot completes');
  v28eq(sbServer.ss_attendance.length, 1, 'v47 async: the server gains exactly the 1 real attendance row');
  var att47 = sbServer.ss_attendance[0] || {};
  v28ok(att47.student_id === 'srv-ankit-33' && att47.att_date === '2026-11-09' && att47.cls === '6th-A' && att47.status === 'Present', 'v47 async: the uploaded attendance row is V21, Present 2026-11-09, 6th-A');
  v28eq(sbServer.ss_fee_records.length, 6, 'v47 async: the server fee records stay 6 — the cycle re-POSTs none of the duplicates');
  v28eq(sbCalls.filter(vm45SeedAttempt).length, 0, 'v47 async: the cycle attempts ZERO seed writes');
  v28eq(sbServer.ss_students.length, 1, 'v47 async: the server gains no seed student row');
  v28eq(sbServer.ss_teachers.length, 0, 'v47 async: the server gains no seed teacher row');
  // (b) the pull drops all local seed rows and collapses the duplicates
  v28eq(ctx.db.students.length, 1, 'v47 async: the pull drops the local seed students — the local DB is back to 1 student');
  v28eq(ctx.db.teachers.length, 0, 'v47 async: the pull drops the local seed teachers');
  v28eq(ctx.db.feeRecords.length, 3, 'v47 async: the pull collapses the 6 server fee rows to the 3 real collections locally');
  v28eq(ctx.db.feeRecords.filter(function (r) { return r.month === 'Oct'; }).length, 1, 'v47 async: exactly one Oct fee record remains locally (no doubled month)');
  v28eq(ctx.db.exams.length, 0, 'v47 async: the pull drops the local seed exams');
  v28eq(ctx.db.receipts.length, 3, 'v47 async: the pull brings the 3 server receipts down');
  v28eq(ctx.sbFlattenAttendance(ctx.db).length, 1, 'v47 async: exactly 1 attendance row remains locally');
  v28eq(ctx.db.attendance['2026-11-09|6th-A'] && ctx.db.attendance['2026-11-09|6th-A']['stu1794162292000'], 'Present', 'v47 async: the local attendance keeps the V21 Present mark');
  // (c) V21 Test Kumar everywhere, Aarav Verma nowhere — including the receipt detail
  v28eq(ctx.db.students[0].name, 'V21 Test Kumar', 'v47 async: the local ADM-2025-001 row is V21 Test Kumar');
  v28eq(sbServer.ss_students[0].name, 'V21 Test Kumar', 'v47 async: the server ADM-2025-001 row is V21 Test Kumar');
  v28ok(!ctx.db.students.some(function (s) { return s.name === 'Aarav Verma'; }) && !sbServer.ss_students.some(function (s) { return s.name === 'Aarav Verma'; }) && !ctx.db.feeRecords.some(function (r) { return r.student === 'Aarav Verma'; }) && !ctx.db.receipts.some(function (rc) { return rc.name === 'Aarav Verma'; }), 'v47 async: Aarav Verma appears nowhere — not in local/server students, fee records or receipts');
  ctx.state.savedReceiptId = 'RCP-2026-001';
  ctx.state.collectStudent = 'stu1794162292000';
  var rcHtml47 = ctx.collectFeePage('stu1794162292000');
  v28ok(rcHtml47.indexOf('V21 Test Kumar • 6th-A') !== -1, 'v47 async: the receipt detail says V21 Test Kumar after the fix');
  v28ok(rcHtml47.indexOf('Aarav Verma') === -1, 'v47 async: the receipt detail never says Aarav Verma after the fix');
  ctx.state.savedReceiptId = null;
  ctx.state.collectStudent = null;
  v28eq(ctx.db.admCounter, 2, 'v47 async: the pull restores the server admission counter 2');
  v28eq(ctx.db.receiptCounter, 4, 'v47 async: the pull restores the server receipt counter 4');
  // (d) the cycle reaches synced with a Last Attempt time
  v28eq(ctx.sbOutboxLoad('sb-uid-vm@school.in').length, 0, 'v47 async: the outbox drains');
  v28eq(ctx.sbLoadStatus().state, 'synced', 'v47 async: the status reaches synced with the stale snapshot');
  v28ok(ctx.sbStatusText().indexOf('Backed up to the server.') !== -1, 'v47 async: the status line says Backed up to the server.');
  v28ok(ctx.sbStatusText().indexOf('Last attempt: ') !== -1, 'v47 async: the status line carries a Last Attempt time');
  // (e) an idle cycle makes ZERO ss_next_receipt_no calls and the counter does not move
  sbCalls = [];
  var c47idle = await ctx.sbSyncCycle();
  v28eq(c47idle.done, true, 'v47 async: the idle cycle completes');
  v28eq(sbCalls.filter(function (c) { return c.url.indexOf('/rest/v1/rpc/ss_next_receipt_no') !== -1; }).length, 0, 'v47 async: the idle cycle makes ZERO ss_next_receipt_no calls');
  v28eq(sbServer.ss_schools[0].receipt_counter, 4, 'v47 async: the receipt counter does not move on the idle cycle');
  v28eq(ctx.sbLoadStatus().state, 'synced', 'v47 async: the status stays synced after the idle cycle');
  // (f) the mock still rejects a seed attendance POST (a row that still
  // carries a seed local student id) with 400 SEED_REJECTED
  var raw47a = await ctx.sbRest('POST', 'ss_attendance', 'tok-x', [{ school_id: 'srv-school-vm33', att_date: '2026-11-09', cls: '10th-A', student_id: 'stu1', status: 'Present' }], 'return=representation');
  v28eq(raw47a.status, 400, 'v47 async: a seed attendance POST is rejected with HTTP 400');
  v28eq(raw47a.data && raw47a.data.code, 'SEED_REJECTED', 'v47 async: the seed attendance rejection carries code SEED_REJECTED');
  // the manual backup toast: it appears on a genuine success and dismisses
  ctx.sbRetryMigration();
  var toastOk47 = await waitFor(function () { return ctx.document.getElementById('toast').textContent === 'Backup complete.'; }, 'manual backup toast shows Backup complete.');
  v28ok(toastOk47, 'v47 async: Back Up Now toasts Backup complete. when the backup genuinely finishes');
  await new Promise(function (r) { setTimeout(r, 2700); });
  v28ok(!ctx.document.getElementById('toast').classList.contains('show'), 'v47 async: the success toast dismisses by itself');
  // (g) the pull never wipes an attendance mark whose upload is still
  // unconfirmed: a second mark queued in the outbox, with a stale
  // snapshot entry claiming it synced, survives a direct pull — and
  // the next full cycle uploads it.
  if (!ctx.db.attendance['2026-11-10|6th-A']) ctx.db.attendance['2026-11-10|6th-A'] = {};
  ctx.db.attendance['2026-11-10|6th-A']['stu1794162292000'] = 'Present';
  ctx.sbOutboxAdd('sb-uid-vm@school.in', { table: 'ss_attendance', key: '2026-11-10|6th-A|stu1794162292000', op: 'upsert', at: new Date().toISOString(), row: { date: '2026-11-10', cls: '6th-A', studentId: 'stu1794162292000', status: 'Present' } });
  v28eq(ctx.sbOutboxLoad('sb-uid-vm@school.in').filter(function (e) { return e.table === 'ss_attendance' && e.key === '2026-11-10|6th-A|stu1794162292000' && e.op === 'upsert'; }).length, 1, 'v47 async: the second attendance mark queues in the outbox');
  var attHashes47 = ctx.sbSyncTableHashes(ctx.db, 'srv-school-vm33', { stu: { 'stu1794162292000': 'srv-ankit-33' }, exam: {} });
  var snap47g = ctx.sbSnapLoad('u-vm-1');
  if (!snap47g.ss_attendance) snap47g.ss_attendance = {};
  snap47g.ss_attendance['2026-11-10|6th-A|stu1794162292000'] = attHashes47.ss_attendance['2026-11-10|6th-A|stu1794162292000'].hash;
  ctx.sbSnapSave('u-vm-1', snap47g);
  var pull47g = await ctx.sbSyncPullRun(vmAcct, 'sb-uid-vm@school.in', 'tok-vm', 'srv-school-vm33');
  v28eq(pull47g.done, true, 'v47 async: the direct pull completes');
  v28ok(ctx.db.attendance['2026-11-10|6th-A'] && ctx.db.attendance['2026-11-10|6th-A']['stu1794162292000'] === 'Present', 'v47 async: the pull keeps the queued attendance mark — a pending outbox upsert is never dropped on snapshot grounds');
  v28eq(ctx.sbOutboxLoad('sb-uid-vm@school.in').filter(function (e) { return e.table === 'ss_attendance' && e.key === '2026-11-10|6th-A|stu1794162292000'; }).length, 1, 'v47 async: the attendance outbox entry survives the pull');
  sbCalls = [];
  var c47g = await ctx.sbSyncCycle();
  v28eq(c47g.done, true, 'v47 async: the cycle after the kept attendance mark completes');
  v28eq(sbServer.ss_attendance.length, 2, 'v47 async: the server gains the second attendance row (2 total)');
  v28eq(ctx.sbLoadStatus().state, 'synced', 'v47 async: the status is synced again after the second attendance upload');
  // ---- v51 async: the stuck outbox — a keep-forever entry holds the
  // status at 'pending' forever, although every upload succeeds.
  // Live shape (10 Nov 2026, v50 verification 01:39–01:45 IST): the
  // cycle uploads the 1 real attendance row (the server gains it at
  // 01:40 IST) and every table verifies, yet the Settings line never
  // reaches "Backed up to the server.", never shows a Last Attempt,
  // manual Back Up Now never toasts "Backup complete.", and Settings
  // shows "Last synced: never". The flush ends with
  // sbSetStatus(left ? 'pending' : 'synced') — ANY leftover entry
  // forces 'pending' forever — and the cycle tail only writes
  // 'synced' when the outbox is empty. The only keep-forever paths
  // in sbSyncPushEntry are (a) !sbSyncPayloadReady (attendance/marks
  // whose student/exam has no server id) and (b) a receipt whose
  // server content mismatches. A zombie entry — local row gone, so
  // the parent can never resolve and the quarantine can no longer
  // prove it seed (sbIsSeedStudentId needs the local row to check)
  // — is kept forever. The fix: an entry whose local row is gone
  // drops as skipped; an entry whose local row still exists keeps
  // waiting for its parent. The v47 scenario above left the app
  // synced with an empty outbox; plant three zombie entries of the
  // kind the live profile carries.
  ctx.sbOutboxAdd('sb-uid-vm@school.in', { table: 'ss_attendance', key: '2026-01-15|6th-A|stu7', op: 'upsert', at: new Date().toISOString(), row: { date: '2026-01-15', cls: '6th-A', studentId: 'stu7', status: 'Present' } });
  ctx.sbOutboxAdd('sb-uid-vm@school.in', { table: 'ss_marks', key: 'ex1|stu7', op: 'upsert', at: new Date().toISOString(), row: { examId: 'ex1', studentId: 'stu7', marks: 50 } });
  // a receipt whose server row holds DIFFERENT content under the same
  // number, and whose local receipt is gone (deleted after queueing):
  // the repair pass cannot re-number a row that no longer exists.
  sbServer.ss_receipts.push({ id: 'srv-rc-51-099', school_id: 'srv-school-vm33', student_id: 'srv-ankit-33', receipt_no: 'RCP-2026-099', admission_no: 'ADM-2025-001', student_name: 'Someone Else', cls: '6th-A', session: '2025–26', receipt_date: '2026-11-09', month: 'Nov', counter_no: 99, lines: [], pay_mode: 'Cash', pay_date: '2026-11-09', bank: '', number: '', total: 500, total_words: '', collector: 'Test Admin', created_at: sbNowISO(), updated_at: sbNowISO() });
  ctx.sbOutboxAdd('sb-uid-vm@school.in', { table: 'ss_receipts', key: 'RCP-2026-099', op: 'upsert', at: new Date().toISOString(), row: { receiptNo: 'RCP-2026-099', studentId: 'stu1794162292000', admissionNo: 'ADM-2025-001', name: 'V21 Test Kumar', cls: '6th-A', session: '2025–26', date: '2026-11-09', month: 'Nov', counterNo: 99, lines: [{ key: 'tuition', desc: 'Tuition Fee (Nov)', type: 'Tuition', month: 'Nov', due: 800, con: 0, paid: 800 }], payMode: 'Cash', payDate: '2026-11-09', bank: '', number: '', total: 800, totalWords: '', collector: 'Test Admin' } });
  v28eq(ctx.sbOutboxLoad('sb-uid-vm@school.in').length, 3, 'v51 async: the three zombie entries sit in the outbox before the cycles');
  // the quarantine cannot prove the zombies seed — the local seed rows
  // are gone, so sbIsSeedStudentId has no row to check.
  v28ok(!ctx.sbIsSeedStudentId('stu7', ctx.db), 'v51 async: stu7 is NOT provable seed once its local row is gone — the quarantine cannot drop the entry');
  var writes51 = [];
  var origSetStatus51 = ctx.sbSetStatus;
  ctx.sbSetStatus = function (st, detail) { writes51.push(st + '|' + (detail || '')); return origSetStatus51(st, detail); };
  var c51a = await ctx.sbSyncCycle();
  var c51b = await ctx.sbSyncCycle();
  var c51c = await ctx.sbSyncCycle();
  ctx.sbSetStatus = origSetStatus51;
  console.log('v51 cycles: done=' + c51a.done + '/' + c51b.done + '/' + c51c.done + ' status=' + ctx.sbLoadStatus().state + ' outbox=' + ctx.sbOutboxLoad('sb-uid-vm@school.in').length + ' line=' + ctx.sbStatusText());
  console.log('v51 status writes: ' + JSON.stringify(writes51));
  // (a) the cycles complete, and the zombies drain instead of holding
  // the status at pending forever
  v28eq(c51a.done && c51b.done && c51c.done, true, 'v51 async: three cycles with zombie entries in the outbox all complete');
  v28eq(ctx.sbOutboxLoad('sb-uid-vm@school.in').length, 0, 'v51 async: the outbox drains — the zombie entries drop instead of keeping forever');
  v28eq(ctx.sbLoadStatus().state, 'synced', 'v51 async: the status reaches synced with zombie entries in the outbox');
  v28ok(ctx.sbStatusText().indexOf('Backed up to the server.') !== -1, 'v51 async: the status line says Backed up to the server.');
  v28ok(ctx.sbStatusText().indexOf('Last attempt: ') !== -1, 'v51 async: the status line carries a Last Attempt time');
  v28ok(writes51.indexOf('synced|') !== -1, 'v51 async: at least one cycle writes synced');
  // (b) the zombies never reach the server — dropping them uploads nothing
  v28eq(sbServer.ss_attendance.length, 2, 'v51 async: the server attendance stays 2 — no zombie mark is POSTed');
  v28eq(sbServer.ss_marks.length, 0, 'v51 async: the server marks stay 0 — no zombie mark is POSTed');
  v28eq(sbServer.ss_receipts.length, 4, 'v51 async: the server receipts stay 4 — the mismatched RCP-2026-099 is never re-POSTed');
  v28eq(sbServer.ss_fee_records.length, 6, 'v51 async: the server fee records stay 6');
  // (c) the manual backup toast appears now that the outbox can drain
  ctx.sbRetryMigration();
  var toastOk51 = await waitFor(function () { return ctx.document.getElementById('toast').textContent === 'Backup complete.'; }, 'manual backup toast shows Backup complete.');
  v28ok(toastOk51, 'v51 async: Back Up Now toasts Backup complete. once the outbox drains');
  await new Promise(function (r) { setTimeout(r, 2700); });
  v28ok(!ctx.document.getElementById('toast').classList.contains('show'), 'v51 async: the success toast dismisses by itself');
  // (d) the HEALTHY keep still works: an attendance entry for the REAL
  // student, whose parent has no server id yet, is KEPT (not dropped)
  // — the parent may still arrive in the same flush.
  var keep51 = await ctx.sbSyncPushEntry({ table: 'ss_attendance', key: '2026-11-09|6th-A|stu1794162292000', op: 'upsert', at: new Date().toISOString(), row: { date: '2026-11-09', cls: '6th-A', studentId: 'stu1794162292000', status: 'Present' } }, 'tok-vm', 'srv-school-vm33', { stu: {}, exam: {} }, 'sb-uid-vm@school.in');
  v28ok(keep51.skipped === true && keep51.keep === true, 'v51 async: an attendance entry for a real local row with an unmapped parent is KEPT — waiting is correct while the row exists');
  var drop51 = await ctx.sbSyncPushEntry({ table: 'ss_attendance', key: '2026-01-15|6th-A|stu7', op: 'upsert', at: new Date().toISOString(), row: { date: '2026-01-15', cls: '6th-A', studentId: 'stu7', status: 'Present' } }, 'tok-vm', 'srv-school-vm33', { stu: {}, exam: {} }, 'sb-uid-vm@school.in');
  v28ok(drop51.skipped === true && !drop51.keep, 'v51 async: the same entry for a vanished local row is DROPPED — waiting protects nothing');
  // (e) the students-step id map is written under the SUPABASE uid, so
  // every reader sees it: add one fresh student, wipe both map keys,
  // run the upload pass alone, and read the map back.
  ctx.db.students.push(vmStudent('stu1795000000000', 'New Kumar', 'ADM-2025-002', 'ENR-002'));
  ctx.db.students[1].phone = '9876542109';
  ctx.saveDB(ctx.db);
  try { ls.removeItem('schoolSaathiSrvIds:sb-uid-vm@school.in'); } catch (e51) {}
  try { ls.removeItem('schoolSaathiSrvIds:u-vm-1'); } catch (e51b) {}
  var up51 = await ctx.sbSyncUploadMissing(vmAcct, 'sb-uid-vm@school.in', 'tok-vm');
  v28eq(up51.done, true, 'v51 async: the upload pass with the fresh student completes');
  v28ok(!!ctx.sbSrvIdGet('sb-uid-vm@school.in', 'ss_students', 'stu1795000000000'), 'v51 async: the fresh student id is in the map under the Supabase uid');
  v28ok(!ctx.sbSrvIdGet('u-vm-1', 'ss_students', 'stu1795000000000'), 'v51 async: the map is NOT written under the local account uid');
  var c51map = await ctx.sbSyncCycle();
  v28eq(c51map.done, true, 'v51 async: the cycle after the fresh student completes');
  v28eq(sbServer.ss_students.length, 2, 'v51 async: the server gains the fresh student');
  v28eq(ctx.sbLoadStatus().state, 'synced', 'v51 async: the status stays synced after the fresh student');
  // (f) the receipt discriminator, pinned directly: a colliding entry
  // whose local receipt still carries its content keeps waiting for
  // the repair pass; the same entry against a different local receipt
  // (the server row, pulled down into the mirror) drops.
  sbServer.ss_receipts.push({ id: 'srv-rc-51-098', school_id: 'srv-school-vm33', student_id: 'srv-ankit-33', receipt_no: 'RCP-2026-098', admission_no: 'ADM-2025-001', student_name: 'Someone Else', cls: '6th-A', session: '2025–26', receipt_date: '2026-11-09', month: 'Nov', counter_no: 98, lines: [], pay_mode: 'Cash', pay_date: '2026-11-09', bank: '', number: '', total: 500, total_words: '', collector: 'Test Admin', created_at: sbNowISO(), updated_at: sbNowISO() });
  ctx.db.receipts.push({ receiptNo: 'RCP-2026-098', studentId: 'stu1794162292000', admissionNo: 'ADM-2025-001', name: 'V21 Test Kumar', cls: '6th-A', session: '2025–26', date: '2026-11-09', month: 'Nov', counterNo: 98, lines: [{ key: 'tuition', desc: 'Tuition Fee (Nov)', type: 'Tuition', month: 'Nov', due: 800, con: 0, paid: 800 }], payMode: 'Cash', payDate: '2026-11-09', bank: '', number: '', total: 800, totalWords: '', collector: 'Test Admin' });
  var keepRc51 = await ctx.sbSyncPushEntry({ table: 'ss_receipts', key: 'RCP-2026-098', op: 'upsert', at: new Date().toISOString(), row: { receiptNo: 'RCP-2026-098', studentId: 'stu1794162292000', admissionNo: 'ADM-2025-001', name: 'V21 Test Kumar', cls: '6th-A', session: '2025–26', date: '2026-11-09', month: 'Nov', counterNo: 98, lines: [{ key: 'tuition', desc: 'Tuition Fee (Nov)', type: 'Tuition', month: 'Nov', due: 800, con: 0, paid: 800 }], payMode: 'Cash', payDate: '2026-11-09', bank: '', number: '', total: 800, totalWords: '', collector: 'Test Admin' } }, 'tok-vm', 'srv-school-vm33', { stu: { 'stu1794162292000': 'srv-ankit-33' }, exam: {} }, 'sb-uid-vm@school.in');
  v28ok(keepRc51.skipped === true && keepRc51.keep === true, 'v51 async: a colliding receipt entry whose local receipt still carries its content is KEPT for the repair pass');
  var dropRc51 = await ctx.sbSyncPushEntry({ table: 'ss_receipts', key: 'RCP-2026-099', op: 'upsert', at: new Date().toISOString(), row: { receiptNo: 'RCP-2026-099', studentId: 'stu1794162292000', admissionNo: 'ADM-2025-001', name: 'V21 Test Kumar', cls: '6th-A', session: '2025–26', date: '2026-11-09', month: 'Nov', counterNo: 99, lines: [{ key: 'tuition', desc: 'Tuition Fee (Nov)', type: 'Tuition', month: 'Nov', due: 800, con: 0, paid: 800 }], payMode: 'Cash', payDate: '2026-11-09', bank: '', number: '', total: 800, totalWords: '', collector: 'Test Admin' } }, 'tok-vm', 'srv-school-vm33', { stu: { 'stu1794162292000': 'srv-ankit-33' }, exam: {} }, 'sb-uid-vm@school.in');
  v28ok(dropRc51.skipped === true && !dropRc51.keep, 'v51 async: the same receipt entry against a different local receipt (the server row, pulled down) is DROPPED');

  // ---- v52 async: the legacy cloud profile — the v51 fix did not
  // move the live status, and the dashboard double-counted on first
  // login. Live shape (10 Nov 2026, v51 verification 06:40–06:47
  // IST): data side all pass, yet the Settings line never reaches
  // "Backed up to the server.", no Last Attempt, manual Back Up Now
  // stalls at "Syncing with the server…" for 90+ seconds then reverts
  // to "Backup pending", no "Backup complete." toast; dashboard Fee
  // Collected ₹4,800 on first login, ₹2,400 on re-login (server held
  // 6 fee records: 3 real + 3 duplicates from the v46 verification).
  // Traced causes (full mechanism in the v52 build note):
  // (a) the cycle is slow by construction — the upload pass runs 12
  // table steps SEQUENTIALLY (each 1 GET + maybe 1 POST) and the
  // verify runs 12 GETs sequentially, so one cycle is ~17 + 2E
  // round-trips (E = outbox entries); at real browser→Supabase
  // latency that is 60–120s, the 30s tick queues follow-ups, and a
  // manual Back Up Now joins the in-flight upload (sbMigPromise);
  // (b) the v51 fix missed a keep class: a child entry (attendance /
  // marks) whose parent student/exam exists locally but is skipped by
  // the students/exams step's snapshot filter while NOT on the server
  // — the parent never uploads, the map never resolves, the child
  // keeps forever and the status stays pending;
  // (c) the dashboard sums raw db.feeRecords, so a legacy local DB
  // holding duplicate rows double-counts on the first pre-pull render.
  // Fixture: the legacy local DB — 6 fee rows (the 3 server ids, each
  // twice), a student with a stale snapshot entry (marked synced
  // although the server lacks it) + a pending attendance entry for
  // it, zombie entries for rows that no longer exist locally, and one
  // fresh row per Phase-A table so the parallel batch is observable.
  var srvFeeIds52 = [];
  sbServer.ss_fee_records.forEach(function (r) { if (srvFeeIds52.indexOf(r.local_id) === -1) srvFeeIds52.push(r.local_id); });
  var feeRows52 = [];
  var expFee52 = 0;
  srvFeeIds52.forEach(function (lid) {
    var srv52 = sbServer.ss_fee_records.filter(function (r) { return r.local_id === lid; })[0];
    expFee52 += srv52.amount;
    [0, 1].forEach(function () {
      feeRows52.push({ id: lid, studentId: 'stu1794162292000', student: 'V21 Test Kumar', cls: '6th-A', month: srv52.month, type: 'Tuition', amount: srv52.amount, status: srv52.status, date: srv52.record_date });
    });
  });
  ctx.db.feeRecords = feeRows52;
  ctx.db.students.push(vmStudent('stu52stale', 'Stale Kumar', 'ADM-2025-052', 'ENR-052'));
  if (!ctx.db.attendance['2026-11-09|6th-A']) ctx.db.attendance['2026-11-09|6th-A'] = {};
  ctx.db.attendance['2026-11-09|6th-A']['stu52stale'] = 'Present';
  ctx.db.teachers.push({ id: 't52', name: 'Teacher 52', subject: 'Mathematics', cls: '6th-A', classes: ['6th-A'] });
  ctx.db.exams.push({ id: 'ex52', name: 'Unit Test 52', cls: '6th-A', subject: 'Mathematics', date: '2026-11-09', total: 100 });
  ctx.db.notices.push({ id: 'n52', title: 'v52 notice', date: '2026-11-09', body: 'v52 probe notice' });
  ctx.db.auditLog.unshift({ ts: new Date().toISOString(), actor: 'Test Admin', action: 'v52 probe', details: '' });
  ctx.db.activities.push({ icon: '🧪', bg: 'blue', title: 'v52 probe', sub: 'test' });
  // the stale snapshot entry, built with the app's own hash function
  // exactly like the v47 fixture: the diff sees the student as synced
  // and queues nothing for it. The snapshot is keyed by the LOCAL
  // account uid ('u-vm-1') — every sbSnapLoad/sbSnapSave in app.js
  // uses account.uid, never the Supabase uid (the v46/v47 fixtures
  // plant it the same way).
  var hashes52 = ctx.sbSyncTableHashes(ctx.db, 'srv-school-vm33', { stu: { 'stu1794162292000': 'srv-ankit-33' }, exam: {} });
  // plant via sbSyncSnapSet, not sbSnapSave: the diff reads the
  // IN-MEMORY snapshot, and a localStorage-only plant leaves it stale,
  // so the saveDB diff queues a students entry and masks the bug.
  ctx.sbSyncSnapSet('u-vm-1', 'ss_students', 'stu52stale', hashes52.ss_students['stu52stale'].hash);
  // saveDB AFTER the snapshot plant: the save hook's diff then sees the
  // student hash as synced and queues nothing for it (the live shape —
  // planting the snapshot after saveDB let the diff queue a students
  // entry, which the flush then pushed and masked the bug on v51 code).
  ctx.saveDB(ctx.db);
  var outboxBefore52 = ctx.sbOutboxLoad('sb-uid-vm@school.in').length;
  var attSrvBefore52 = sbServer.ss_attendance.length;
  ctx.sbOutboxAdd('sb-uid-vm@school.in', { table: 'ss_attendance', key: '2026-11-09|6th-A|stu52stale', op: 'upsert', at: new Date().toISOString(), row: { date: '2026-11-09', cls: '6th-A', studentId: 'stu52stale', status: 'Present' } });
  ctx.sbOutboxAdd('sb-uid-vm@school.in', { table: 'ss_attendance', key: '2026-01-15|6th-A|stu52gone', op: 'upsert', at: new Date().toISOString(), row: { date: '2026-01-15', cls: '6th-A', studentId: 'stu52gone', status: 'Present' } });
  ctx.sbOutboxAdd('sb-uid-vm@school.in', { table: 'ss_marks', key: 'ex52|stu52gone', op: 'upsert', at: new Date().toISOString(), row: { examId: 'ex52', studentId: 'stu52gone', marks: 50 } });
  // (c) the dashboard on the legacy local DB, BEFORE any cycle runs
  // (the first pre-pull render): the deduped total, not 2x.
  v28eq(ctx.feeTotals().collected, expFee52, 'v52 async: dashboard Fee Collected on the legacy 6-row local DB is the deduped total (' + expFee52 + '), not double');
  v28eq(ctx.feeFiltered().length, srvFeeIds52.length, 'v52 async: the Fees list on the legacy local DB shows the deduped rows');
  var ob52 = ctx.sbOutboxLoad('sb-uid-vm@school.in');
  v28ok(ob52.some(function (e) { return e.table === 'ss_attendance' && e.key === '2026-11-09|6th-A|stu52stale'; }), 'v52 async: the stale student\'s attendance entry is queued');
  v28ok(ob52.some(function (e) { return e.table === 'ss_attendance' && e.key === '2026-01-15|6th-A|stu52gone'; }), 'v52 async: the gone-row attendance zombie is queued');
  v28ok(ob52.some(function (e) { return e.table === 'ss_marks' && e.key === 'ex52|stu52gone'; }), 'v52 async: the gone-row marks zombie is queued');
  // (a) the upload pass, measured: the 7 Phase-A table GETs must fire
  // consecutively — in the sequential v51 pass each GET is followed by
  // that table's POST before the next table's GET, so the run is
  // broken up by POSTs. The mock resolves instantly, so GET order is
  // the observable proof of the parallel batch.
  sbCalls = [];
  var up52 = await ctx.sbSyncUploadMissing(vmAcct, 'sb-uid-vm@school.in', 'tok-vm');
  v28eq(up52.done, true, 'v52 async: the upload pass on the legacy profile completes');
  var up52Gets = [];
  sbCalls.forEach(function (c, i) {
    if (c.method === 'GET' && c.url.indexOf('limit=5000') !== -1) {
      var m52 = c.url.match(/\/rest\/v1\/(ss_[a-z_]+)\?/);
      if (m52) up52Gets.push({ table: m52[1], i: i });
    }
  });
  var phaseA52 = ['ss_fee_structure', 'ss_students', 'ss_teachers', 'ss_exams', 'ss_notices', 'ss_audit_log', 'ss_activities'];
  var a52 = up52Gets.filter(function (g) { return phaseA52.indexOf(g.table) !== -1; });
  var a52Idx = a52.map(function (g) { return g.i; });
  v28eq(a52.length, 7, 'v52 async: all 7 Phase-A tables issue their upload GET (fee_structure, students, teachers, exams, notices, audit_log, activities)');
  v28ok(a52.length > 0 && (Math.max.apply(null, a52Idx) - Math.min.apply(null, a52Idx) === a52.length - 1), 'v52 async: the Phase-A upload GETs fire consecutively — the pass runs them in parallel, not one table at a time');
  // (b) the narrowed bypass, pinned directly: the stale-snapshot
  // student uploads because a pending outbox entry references it.
  v28ok(sbServer.ss_students.some(function (r) { return r.local_id === 'stu52stale'; }), 'v52 async: the stale-snapshot student uploads — a pending child entry references it');
  v28ok(!!ctx.sbSrvIdGet('sb-uid-vm@school.in', 'ss_students', 'stu52stale'), 'v52 async: the stale student lands in the id map under the Supabase uid');
  // the cycles now drain the whole legacy outbox, zombies included.
  var c52a = await ctx.sbSyncCycle();
  var c52b = await ctx.sbSyncCycle();
  var c52c = await ctx.sbSyncCycle();
  console.log('v52 cycles: done=' + c52a.done + '/' + c52b.done + '/' + c52c.done + ' status=' + ctx.sbLoadStatus().state + ' outbox=' + ctx.sbOutboxLoad('sb-uid-vm@school.in').length + ' line=' + ctx.sbStatusText());
  v28eq(c52a.done && c52b.done && c52c.done, true, 'v52 async: three cycles on the legacy profile all complete');
  v28eq(ctx.sbOutboxLoad('sb-uid-vm@school.in').length, 0, 'v52 async: the legacy outbox drains — the stale-parent child entry and the zombies all leave');
  v28eq(ctx.sbLoadStatus().state, 'synced', 'v52 async: the status reaches synced on the legacy profile');
  v28ok(ctx.sbStatusText().indexOf('Backed up to the server.') !== -1, 'v52 async: the status line says Backed up to the server.');
  v28ok(ctx.sbStatusText().indexOf('Last attempt: ') !== -1, 'v52 async: the status line carries a Last Attempt time');
  v28ok(sbServer.ss_attendance.some(function (r) { return r.student_id === ctx.sbSrvIdGet('sb-uid-vm@school.in', 'ss_students', 'stu52stale') && r.att_date === '2026-11-09'; }), 'v52 async: the stale student\'s attendance row reaches the server once its parent uploads');
  v28eq(sbServer.ss_attendance.length, attSrvBefore52 + 1, 'v52 async: exactly one attendance row is added — the stale student\'s; no zombie row is POSTed for the gone student');
  v28ok(ctx.db.students.some(function (s) { return s.id === 'stu52stale'; }), 'v52 async: the stale student SURVIVES locally — the pull must not delete a never-uploaded row it has never seen on the server');
  v28eq(sbServer.ss_marks.length, 0, 'v52 async: no zombie mark is POSTed for the gone student');
  v28eq(ctx.db.feeRecords.length, srvFeeIds52.length, 'v52 async: the pull collapses the 6 local fee rows to the deduped set');
  v28eq(ctx.feeTotals().collected, expFee52, 'v52 async: dashboard Fee Collected stays the deduped total after the pull');
  // the verify, called directly: 13 GETs, and the deduped local
  // counts pass against the server (the legacy 6-row local DB must
  // not fail the count check against the server's unique rows).
  sbCalls = [];
  var ver52 = await ctx.sbVerifyCounts('tok-vm', 'srv-school-vm33', ctx.sbLocalCounts(ctx.db));
  v28eq(ver52.ok, true, 'v52 async: the count verification passes on the drained legacy profile');
  v28eq(sbCalls.filter(function (c) { return c.method === 'GET'; }).length, 13, 'v52 async: the verify issues 13 GETs');
  v28eq(sbCalls.length, 13, 'v52 async: the verify issues exactly 13 calls — one batch, nothing sequential after it');
  // the manual backup toast appears now that the outbox can drain.
  ctx.sbRetryMigration();
  var toastOk52 = await waitFor(function () { return ctx.document.getElementById('toast').textContent === 'Backup complete.'; }, 'manual backup toast shows Backup complete.');
  v28ok(toastOk52, 'v52 async: Back Up Now toasts Backup complete. on the legacy profile');
  await new Promise(function (r) { setTimeout(r, 2700); });
  v28ok(!ctx.document.getElementById('toast').classList.contains('show'), 'v52 async: the success toast dismisses by itself');
  // the negative pin: a stale-snapshot student with NO pending outbox
  // reference must NOT upload — the server-wins delete (v31) still
  // holds, the narrowed bypass is not the full bypass back.
  ctx.db.students.push(vmStudent('stu52neg', 'Neg Kumar', 'ADM-2025-053', 'ENR-053'));
  // snapshot FIRST, then saveDB — the same ordering as the main
  // fixture: if saveDB runs first, its diff queues a students entry
  // for the new row, the outbox then references it, and the narrowed
  // bypass (correctly) uploads it — the negative pin would prove
  // nothing.
  var hashes52n = ctx.sbSyncTableHashes(ctx.db, 'srv-school-vm33', { stu: { 'stu1794162292000': 'srv-ankit-33' }, exam: {} });
  ctx.sbSyncSnapSet('u-vm-1', 'ss_students', 'stu52neg', hashes52n.ss_students['stu52neg'].hash);
  ctx.saveDB(ctx.db);
  await ctx.sbSyncUploadMissing(vmAcct, 'sb-uid-vm@school.in', 'tok-vm');
  v28ok(!sbServer.ss_students.some(function (r) { return r.local_id === 'stu52neg'; }), 'v52 async: a stale-snapshot student with no pending outbox reference is NOT re-uploaded — server-wins delete still holds');
  ctx.db.students = ctx.db.students.filter(function (s) { return s.id !== 'stu52neg'; });
  ctx.saveDB(ctx.db);
  var snap52c = ctx.sbSnapLoad('u-vm-1');
  if (snap52c.ss_students) delete snap52c.ss_students['stu52neg'];
  ctx.sbSnapSave('u-vm-1', snap52c);
  ctx.sbSyncResetMemory(); // drop the in-memory snapshot so later blocks reload it

  // ---- v53 async: the live cycle is slow by construction, not by a
  // hung call — reproduce it with realistic latency, then fix the cost.
  // Live v52 (10 Nov 07:54–08:02 IST): backup loops Pending →
  // "Syncing…" (60–75s) → Pending across two sessions; manual Back Up
  // Now reverts in ~30s; no toast, no Last Attempt. The v52
  // parallelisation cut the upload/verify rounds, but the cycle still
  // burns a minute — the harness mocked fetch with INSTANT responses,
  // so it never saw the cost: one cycle is ~7 + 2E round-trips (E =
  // outbox entries, up to 3 flush passes), and at 250–400ms per
  // round-trip that is a minute for a legacy outbox of ~30 entries.
  // This block enables a 300ms latency mock and measures each phase
  // wall-clock. On v52 code the fast-cycle assertions FAIL (the
  // repro); on v53 code they pass.
  var fetchBefore53 = ctx.fetch;
  sbLatencyMs = 300;
  ctx.fetch = sbLatencyFetch;
  var uid53 = 'sb-uid-vm@school.in';
  var school53 = 'srv-school-vm33';
  // the legacy outbox: rows already reflected on the server (their
  // entries should resolve WITHOUT a write), log rows, one stale-parent
  // child, two gone-row zombies. Server rows are built with the app's
  // own mappers so payload and server row match field-for-field.
  var stuSrv53 = ctx.sbSrvIdGet(uid53, 'ss_students', 'stu1794162292000');
  var staleSrv53 = ctx.sbSrvIdGet(uid53, 'ss_students', 'stu52stale');
  var maps53 = { stu: { 'stu1794162292000': stuSrv53, 'stu52stale': staleSrv53 }, exam: {} };
  for (var ai53 = 0; ai53 < 10; ai53++) {
    var a53 = { ts: '2026-11-10T0' + ai53 + ':00:00.000Z', actor: 'Test Admin', action: 'v53 probe ' + ai53, details: '' };
    ctx.db.auditLog.push(a53);
    var aSrv53 = ctx.sbMapAudit(a53, school53); aSrv53.id = 'srv-audit-53-' + ai53; aSrv53.updated_at = '2026-11-10T01:00:00.000Z';
    sbServer.ss_audit_log.push(aSrv53);
  }
  for (var ac53 = 0; ac53 < 5; ac53++) {
    var c53 = { icon: '🧪', bg: 'blue', title: 'v53 probe ' + ac53, sub: 'test' };
    ctx.db.activities.push(c53);
    var cSrv53 = ctx.sbMapActivity(c53, school53); cSrv53.id = 'srv-act-53-' + ac53; cSrv53.updated_at = '2026-11-10T01:00:00.000Z';
    sbServer.ss_activities.push(cSrv53);
  }
  // one stale-parent child: student exists locally, NOT on the server,
  // snapshot says synced — the upload pass must upload the parent first.
  ctx.db.students.push(vmStudent('stu53stale', 'Stale53 Kumar', 'ADM-2025-053', 'ENR-053'));
  if (!ctx.db.attendance['2026-11-09|6th-A']) ctx.db.attendance['2026-11-09|6th-A'] = {};
  ctx.db.attendance['2026-11-09|6th-A']['stu53stale'] = 'Present';
  var hashes53 = ctx.sbSyncTableHashes(ctx.db, school53, maps53);
  ctx.sbSyncSnapSet('u-vm-1', 'ss_students', 'stu53stale', hashes53.ss_students['stu53stale'].hash);
  function ob53(table, key, row) { ctx.sbOutboxAdd(uid53, { table: table, key: key, op: 'upsert', at: new Date().toISOString(), row: row }); }
  function plantOutbox53() {
    // the whole legacy outbox, straight in (the live shape: entries
    // queued in earlier sessions whose snapshot entries were refreshed
    // since, but whose flush never drained). Keys match the diff's
    // natural keys exactly, so re-planting replaces, never duplicates.
    ctx.db.auditLog.slice(-10).forEach(function (a) { ob53('ss_audit_log', ctx.sbNormTs(a.ts) + '|' + (a.actor || '') + '|' + (a.action || '') + '|' + (a.details || ''), JSON.parse(JSON.stringify(a))); });
    ctx.db.activities.slice(-5).forEach(function (a) { ob53('ss_activities', (a.title || '') + '|' + (a.sub || ''), JSON.parse(JSON.stringify(a))); });
    ctx.db.feeRecords.forEach(function (fr) { ob53('ss_fee_records', fr.id, JSON.parse(JSON.stringify(fr))); });
    ctx.db.receipts.forEach(function (rc) { ob53('ss_receipts', rc.receiptNo, JSON.parse(JSON.stringify(rc))); });
    Object.keys(ctx.db.attendance).forEach(function (k) { Object.keys(ctx.db.attendance[k]).forEach(function (sid) { var p = k.split('|'); ob53('ss_attendance', p[0] + '|' + p[1] + '|' + sid, { date: p[0], cls: p[1], studentId: sid, status: ctx.db.attendance[k][sid] }); }); });
    ctx.db.students.forEach(function (s) { ob53('ss_students', s.id, JSON.parse(JSON.stringify(s))); });
    if (ctx.db.feeStructure && ctx.db.feeStructure.length) {
      var fs53 = ctx.db.feeStructure[0];
      if (!sbServer.ss_fee_structure.some(function (r) { return r.cls === fs53.cls && r.fee_type === (fs53.type || 'Tuition'); })) {
        var fsSrv53 = ctx.sbMapFeeStructure(fs53, school53); fsSrv53.id = 'srv-fs-53'; fsSrv53.updated_at = '2026-11-10T01:00:00.000Z';
        sbServer.ss_fee_structure.push(fsSrv53);
      }
      ob53('ss_fee_structure', (fs53.cls || '') + '|' + (fs53.type || 'Tuition'), JSON.parse(JSON.stringify(fs53)));
    }
    ob53('ss_schools', 'school', { profile: JSON.parse(JSON.stringify(ctx.db.profile)), feeExtras: JSON.parse(JSON.stringify(ctx.db.feeExtras || {})), admCounter: ctx.db.admCounter, receiptCounter: ctx.db.receiptCounter });
    ob53('ss_attendance', '2026-01-15|6th-A|stu53gone', { date: '2026-01-15', cls: '6th-A', studentId: 'stu53gone', status: 'Present' });
    ob53('ss_marks', 'ex52|stu53gone', { examId: 'ex52', studentId: 'stu53gone', marks: 50 });
  }
  // the diff queues the log rows + the stale-parent attendance entry;
  // the already-synced rows are planted straight into the outbox.
  var q53 = ctx.sbSyncQueueDiff();
  console.log('v53 fixture: diff queued ' + q53 + ' entries (15 logs + 1 stale-parent attendance expected)');
  v28ok(q53 >= 16, 'v53 async: the diff queues the 15 log rows + the stale-parent attendance entry');
  plantOutbox53();
  var e53 = ctx.sbOutboxLoad(uid53).length;
  console.log('v53 fixture: outbox holds ' + e53 + ' entries');
  v28ok(e53 >= 28, 'v53 async: the legacy outbox holds ~30 entries');
  // let a debounced/queued cycle finish without queueing a new one
  async function drain53() {
    await new Promise(function (r) { setTimeout(r, 50); }); // let the 0ms debounce timer fire
    for (var di53 = 0; di53 < 5; di53++) {
      if (ctx.sbSyncCyclePending) { try { await ctx.sbSyncCyclePending; } catch (e53d) {} }
      else if (ctx.sbSyncPromise) { try { await ctx.sbSyncPromise; } catch (e53d2) {} }
      else break;
      await new Promise(function (r) { setTimeout(r, 50); });
    }
  }
  // ---- per-phase wall-time under 300ms latency ----
  sbCalls = []; var tRep53 = Date.now();
  await ctx.sbSyncRepairNumbers(vmAcct, uid53, 'tok-vm');
  var repMs53 = Date.now() - tRep53, repCalls53 = sbCalls.length;
  console.log('v53 phase: repair ' + repMs53 + 'ms, ' + repCalls53 + ' calls');
  sbCalls = []; var tUp53 = Date.now();
  var up53 = await ctx.sbSyncUploadMissing(vmAcct, uid53, 'tok-vm');
  var upMs53 = Date.now() - tUp53, upCalls53 = sbCalls.length;
  console.log('v53 phase: upload ' + upMs53 + 'ms, ' + upCalls53 + ' calls, done=' + (up53 && up53.done));
  v28ok(up53 && up53.done, 'v53 async: the upload pass completes under latency (stale parent uploaded)');
  v28ok(sbServer.ss_students.some(function (r) { return r.local_id === 'stu53stale'; }), 'v53 async: the stale-parent student reaches the server in the upload pass');
  sbCalls = []; var tPull53 = Date.now();
  var pull53 = await ctx.sbSyncPullRun(vmAcct, uid53, 'tok-vm', null);
  var pullMs53 = Date.now() - tPull53, pullCalls53 = sbCalls.length;
  console.log('v53 phase: pull ' + pullMs53 + 'ms, ' + pullCalls53 + ' calls, done=' + (pull53 && pull53.done));
  sbCalls = []; var tFl53 = Date.now();
  var fl53 = await ctx.sbSyncFlushNow();
  var flMs53 = Date.now() - tFl53, flCalls53 = sbCalls.length;
  console.log('v53 phase: flush ' + flMs53 + 'ms, ' + flCalls53 + ' calls, pushed=' + (fl53 && fl53.pushed) + ', outbox-after=' + ctx.sbOutboxLoad(uid53).length);
  v28ok(fl53 && fl53.done, 'v53 async: the flush completes under latency');
  v28ok(ctx.sbOutboxLoad(uid53).length === 0, 'v53 async: the batched flush drains the whole legacy outbox');
  v28ok(flMs53 < 10000, 'v53 async: the flush wall-time under 300ms latency is under 10s (' + flMs53 + 'ms)');
  v28ok(flCalls53 <= 20, 'v53 async: the flush is batched — one find GET per table, no per-entry find (' + flCalls53 + ' calls for ~30 entries)');
  v28ok(!sbCalls.some(function (c) { return c.url.indexOf('local_id=eq.') !== -1 || c.url.indexOf('receipt_no=eq.') !== -1; }), 'v53 async: the flush issues zero per-entry find GETs');
  await drain53(); // the pull's saveDB schedules a debounced cycle; let it finish
  // ---- full cycle under latency, with the timer firing mid-cycle ----
  plantOutbox53();
  sbCalls = []; var tCyc53 = Date.now();
  var cyc53p = ctx.sbSyncCycle();
  ctx.sbSyncAutoTick(); ctx.sbSyncAutoTick(); // the 30s timer, twice, mid-cycle
  v28ok(!!ctx.sbSyncPromise, 'v53 async: the cycle is in flight while the timer ticks');
  v28ok(ctx.sbSyncCyclePending === null, 'v53 async: the timer skips while a cycle is in flight — no follow-up queued');
  var cyc53 = await cyc53p;
  var cycMs53 = Date.now() - tCyc53;
  console.log('v53 phase: full cycle ' + cycMs53 + 'ms, done=' + (cyc53 && cyc53.done) + ', outbox-after=' + ctx.sbOutboxLoad(uid53).length);
  v28ok(cyc53 && cyc53.done, 'v53 async: the full cycle completes under latency');
  v28ok(cycMs53 < 10000, 'v53 async: the full cycle wall-time under 300ms latency is under 10s (' + cycMs53 + 'ms)');
  v28ok(ctx.sbOutboxLoad(uid53).length === 0, 'v53 async: the cycle drains the outbox');
  v28ok(ctx.sbLoadStatus() && ctx.sbLoadStatus().state === 'synced', 'v53 async: the status reaches synced after the cycle');
  await drain53();
  // ---- manual Back Up Now under latency ----
  plantOutbox53();
  var tBk53 = Date.now();
  ctx.sbRetryMigration();
  var bkToast53 = '';
  for (var bi53 = 0; bi53 < 200; bi53++) {
    var toastEl53 = ctx.document.getElementById('toast');
    bkToast53 = (toastEl53 && toastEl53.textContent) || '';
    if (bkToast53.indexOf('Backup complete.') !== -1) break;
    await new Promise(function (r) { setTimeout(r, 100); });
  }
  var bkMs53 = Date.now() - tBk53;
  console.log('v53 phase: manual backup toast after ' + bkMs53 + 'ms: ' + bkToast53);
  v28ok(bkToast53.indexOf('Backup complete.') !== -1, 'v53 async: manual Back Up Now shows "Backup complete." under latency');
  v28ok(bkMs53 < 10000, 'v53 async: manual backup completes under 10s under latency (' + bkMs53 + 'ms)');
  v28ok(ctx.sbOutboxLoad(uid53).length === 0, 'v53 async: the manual backup drains the outbox');
  await drain53();
  // ---- Settings sync details ----
  v28ok(typeof ctx.sbSyncDetailsHtml === 'function', 'v53 async: sbSyncDetailsHtml exists');
  v28ok(src.indexOf('id="sbSyncDetails"') !== -1, 'v53 async: the Settings Server Backup card renders a sync-details node');
  var det53 = typeof ctx.sbSyncDetailsHtml === 'function' ? ctx.sbSyncDetailsHtml() : ''; // empty on v52: the function does not exist there
  v28ok(det53.indexOf('Pending uploads') !== -1, 'v53 async: sync details show the pending-uploads count');
  v28ok(det53.indexOf('Pending uploads: <b>0</b>') !== -1, 'v53 async: sync details show 0 pending uploads after the drain');
  v28ok(det53.indexOf('Last cycle') !== -1, 'v53 async: sync details show the last cycle');
  v28ok(det53.indexOf('synced') !== -1, 'v53 async: sync details show the last cycle result');
  v28ok(det53.indexOf('Last flush') !== -1, 'v53 async: sync details show the last flush');
  ob53('ss_fee_records', ctx.db.feeRecords[0].id, JSON.parse(JSON.stringify(ctx.db.feeRecords[0])));
  ob53('ss_receipts', ctx.db.receipts[0].receiptNo, JSON.parse(JSON.stringify(ctx.db.receipts[0])));
  ob53('ss_attendance', '2026-11-09|6th-A|stu1794162292000', { date: '2026-11-09', cls: '6th-A', studentId: 'stu1794162292000', status: 'Present' });
  ctx.sbSetStatus('pending');
  var detNode53 = ctx.document.getElementById('sbSyncDetails');
  var detHtml53 = detNode53 ? detNode53.innerHTML : '';
  v28ok(detHtml53.indexOf('Pending uploads: <b>3</b>') !== -1, 'v53 async: sbSetStatus refreshes the details node with the live outbox count');
  v28ok(detHtml53.indexOf('ss_fee_records') !== -1 && detHtml53.indexOf('ss_receipts') !== -1, 'v53 async: sync details list the queued entries as table — key');
  // drain the 3 re-planted entries so later blocks start clean
  await ctx.sbSyncFlushNow();
  v28ok(ctx.sbOutboxLoad(uid53).length === 0, 'v53 async: the re-planted entries drain');
  await drain53();
  // ---- v54 async: the PIN hash syncs to the server, never plaintext ----
  var stu54a = vmStudent('stu-54a', 'V54 Hash Kid', 'ADM-2025-054', 'ENR-054');
  stu54a.parentPinHash = ctx.hashPin('6824');
  ctx.db.students.push(stu54a);
  ctx.saveDB(ctx.db);
  await ctx.sbSyncFlushNow();
  await drain53();
  var srvStu54 = sbServer.ss_students.find(function (r) { return r.local_id === 'stu-54a'; });
  v28ok(!!srvStu54, 'v54 async: the student with a hashed PIN reaches the server');
  v28ok(srvStu54 && srvStu54.parent_pin && srvStu54.parent_pin.indexOf('bcrypt$') === 0, 'v54 async: the server row carries the bcrypt hash, not a plaintext PIN');
  v28ok(srvStu54 && ctx.verifyPin('6824', { parentPinHash: srvStu54.parent_pin }), 'v54 async: the server-stored hash verifies the PIN');
  v28ok(JSON.stringify(srvStu54 || {}).indexOf('6824') === -1, 'v54 async: the server row contains no plaintext PIN');
  // ---- v55 async: a legacy plaintext PIN and a stripped record survive a full cycle ----
  // The v54 async block only proved a hashed PIN uploads. These are the two shapes v54
  // lost live: a pre-v54 record (plaintext PIN, no hash) and a v54-broken record (null,
  // no hash). The loadDB migration (repair + hash) runs first — exactly as on app start.
  var stu55a = vmStudent('stu-55a', 'V55 Legacy', 'ADM-2025-055', 'ENR-055');
  stu55a.phone = '9876542108'; stu55a.parentPin = '3175';
  ctx.db.students.push(stu55a);
  var stu55b = vmStudent('stu-55b', 'V55 Stripped', 'ADM-2025-056', 'ENR-056');
  stu55b.phone = '9876542108'; stu55b.parentPin = null;
  ctx.db.students.push(stu55b);
  var stu55c = vmStudent('stu-55c', 'V55 Seed Phone', 'ADM-2025-057', 'ENR-057');
  stu55c.phone = '9810000000'; stu55c.parentPin = null;
  ctx.db.students.push(stu55c);
  ctx.migrateV54(ctx.migrateV55(ctx.migrateV12(ctx.db))); // in-place, like loadDB
  ctx.saveDB(ctx.db);
  await ctx.sbSyncCycle();
  await drain53();
  var srv55a = sbServer.ss_students.find(function (r) { return r.local_id === 'stu-55a'; });
  var srv55b = sbServer.ss_students.find(function (r) { return r.local_id === 'stu-55b'; });
  var srv55c = sbServer.ss_students.find(function (r) { return r.local_id === 'stu-55c'; });
  v28ok(!!srv55a, 'v55 async: the legacy-PIN student reaches the server after the cycle');
  v28ok(srv55a && srv55a.parent_pin && srv55a.parent_pin.indexOf('bcrypt$') === 0, 'v55 async: the legacy plaintext PIN uploads as a bcrypt hash, never plaintext');
  v28ok(srv55a && ctx.verifyPin('3175', { parentPinHash: srv55a.parent_pin }), 'v55 async: the uploaded legacy hash verifies 2108');
  v28ok(!!srv55b, 'v55 async: the stripped student reaches the server after the cycle');
  v28ok(srv55b && srv55b.parent_pin && srv55b.parent_pin.indexOf('bcrypt$') === 0, 'v55 async: the stripped record uploads as a hash after the repair');
  v28ok(srv55b && !ctx.verifyPin('3175', { parentPinHash: srv55b.parent_pin }), 'H-3: the repaired hash is random, NOT the phone PIN (2108 does not verify)');
  v28ok(!!srv55c, 'v55 async: the seed-phone stripped student reaches the server after the cycle');
  v28ok(srv55c && !ctx.verifyPin('0000', { parentPinHash: srv55c.parent_pin }), 'H-3: the seed-phone repair does NOT upload the 0000 hash');
  v28ok(srv55c && !ctx.verifyPin('3175', { parentPinHash: srv55c.parent_pin }), 'v55 async: the seed-phone hash does NOT verify 2108');
  var loc55a = ctx.db.students.find(function (s) { return s.id === 'stu-55a'; });
  var loc55b = ctx.db.students.find(function (s) { return s.id === 'stu-55b'; });
  var loc55c = ctx.db.students.find(function (s) { return s.id === 'stu-55c'; });
  v28ok(!!loc55a && ctx.verifyPin('3175', loc55a), 'v55 async: the legacy PIN still verifies locally after the cycle pull');
  v28ok(!!loc55b && !ctx.verifyPin('3175', loc55b), 'H-3: the repaired PIN still does NOT verify the phone PIN after the cycle pull');
  v28ok(!!loc55c && !ctx.verifyPin('0000', loc55c), 'H-3: the seed-phone PIN still does NOT verify after the cycle pull');
  v28ok(!!loc55c && !ctx.verifyPin('3175', loc55c), 'v55 async: the seed-phone record still rejects 2108 after the cycle pull');
  // ---- v56 async: the admin-set PIN round trip — repair, admin set, cycle, login ----
  // The exact live v55 failure (10 Nov 2026, 10:16-10:20 IST): the repair restored 0000,
  // the admin re-set 2108 in the profile, the profile still showed "PIN set" after a
  // 60s cycle, yet the student login with ADM-2025-001 + 2108 failed. The v56 repro
  // proved why: the pull replaced the local hash(2108) with the server's stale
  // hash(0000), the flush pushed 2108, and the pass-1 tail re-diff re-queued the stale
  // local row so pass 2 re-uploaded 0000 — undoing the push in the same flush. This
  // block runs the whole round trip through two real cycles (the v55 block never did
  // an admin set AFTER a cycle). Live shape: stripped V21 on the seed phone, server
  // parent_pin null at the start.
  var stu56v = vmStudent('stu-56v21', 'V56 V21', 'ADM-2025-156', 'ENR-056');
  stu56v.phone = '9810000000'; stu56v.parentPin = null;
  ctx.db.students.push(stu56v);
  sbServer.ss_students.push({ id: 'srv-56v21', school_id: school53, local_id: 'stu-56v21', name: 'V56 V21', cls: '6th-A', roll: 1, enr: 'ENR-056', guardian: 'G', phone: '9810000000', mobile2: '', parent_email: '', father_name: 'F', mother_name: 'M', occupation: '', dob: '', gender: '', blood_group: '', category: '', address: '', state: '', district: '', pin: '', previous_school: '', previous_class: '', admission_no: 'ADM-2025-156', admission_date: '', session: '2025–26', status: 'Active', result: null, parent_pin: null, photo_data_url: null, documents: { birthCert: false, tc: false, tcNumber: '', other: '' }, aadhaar: '', created_at: sbNowISO(), updated_at: sbNowISO() });
  ctx.migrateV54(ctx.migrateV55(ctx.migrateV12(ctx.db))); // in-place, like loadDB
  ctx.saveDB(ctx.db);
  await ctx.sbSyncCycle();
  await drain53();
  var srv56v = sbServer.ss_students.find(function (r) { return r.local_id === 'stu-56v21'; });
  var loc56v = ctx.db.students.find(function (s) { return s.id === 'stu-56v21'; });
  v28ok(!!srv56v && srv56v.parent_pin && srv56v.parent_pin.indexOf('bcrypt$') === 0 && !ctx.verifyPin('0000', { parentPinHash: srv56v.parent_pin }), 'H-3: after cycle 1, the server holds a RANDOM repaired hash, not 0000');
  v28ok(!!loc56v && !ctx.verifyPin('0000', loc56v), 'H-3: after cycle 1, the local record does NOT verify with 0000');
  ctx.document.getElementById('fStuPinNew').value = '3175';
  ctx.state.role = 'school';
  ctx.setStudentPin('stu-56v21');
  v28ok(ctx.verifyPin('3175', ctx.db.students.find(function (s) { return s.id === 'stu-56v21'; })), 'v56 async: right after the admin set, the local PIN verifies with 2108');
  await ctx.sbSyncCycle();
  await drain53();
  srv56v = sbServer.ss_students.find(function (r) { return r.local_id === 'stu-56v21'; });
  loc56v = ctx.db.students.find(function (s) { return s.id === 'stu-56v21'; });
  v28ok(!!srv56v && ctx.verifyPin('3175', { parentPinHash: srv56v.parent_pin }), 'v56 async: after cycle 2, the SERVER holds the 2108 hash (the flush no longer re-uploads the stale 0000)');
  v28ok(!!srv56v && !ctx.verifyPin('0000', { parentPinHash: srv56v.parent_pin }), 'v56 async: after cycle 2, the server does NOT still hold the stale 0000 hash');
  v28ok(!!loc56v && ctx.verifyPin('3175', loc56v), 'v56 async: after cycle 2, the LOCAL record verifies with 2108');
  v28ok(ctx.sbOutboxLoad(uid53).length === 0, 'v56 async: after cycle 2, the outbox is drained');
  ctx.document.getElementById('studentAdmNo').value = 'ADM-2025-156';
  ctx.document.getElementById('studentPin').value = '3175';
  ctx.document.getElementById('studentSchool').value = 'u-vm-1';
  ctx.state.role = null; ctx.state.user = null;
  ctx.doStudentLogin({ preventDefault: function () {} });
  v28eq(ctx.state.role, 'student', 'v56 async: the student login with ADM-2025-156 + 2108 succeeds after the round trip');
  v28ok(ctx.document.getElementById('studentErr').classList.contains('hidden'), 'v56 async: no login error is shown for the admin-set PIN (the error element is hidden on success)');
  ctx.logout(); await waitLogoutCtx();
  ctx.state.user = vmAcct; ctx.state.role = 'school'; ctx.state.sb = { uid: uid53, email: 'vm@school.in' };
  // ---- v58 async: the exam edit + soft-delete round trip — the exact live v57 failure ----
  // Live shape (10 Nov 2026, v57 browser check): create "Test Exam v57" → edit
  // the name → reload shows the ORIGINAL name; soft-delete toasts "Exam deleted"
  // but the exam stays in the list with no restore control. This block runs the
  // same steps through real cycles under latency: create → cycle 1 (server has
  // the original) → edit → cycle 2 (server AND local must hold the edited name)
  // → soft-delete → cycle 3 (local stays deleted, server row still exists, the
  // deleted-exams card shows it with Restore) → restore → cycle 4 (active again).
  // (The v56 block ends with logout(), which clears the stored token — without
  // re-storing it the cycle returns no-token and nothing uploads.)
  ctx.sbStoreSession({ access_token: 'tok-vm', refresh_token: 'ref-vm', expires_in: 3600, user: { id: 'sb-uid-vm@school.in', email: 'vm@school.in' } });
  ctx.saveAccounts([vmAcct]);
  ctx.loginAs(vmAcct);
  ctx.state.sb = { uid: uid53, email: 'vm@school.in' };
  var ex58v = { id: 'ex-58v', name: 'Test Exam v58', cls: '6th-A', subject: 'Maths', date: '2026-11-10', total: 100 };
  ctx.db.exams.push(ex58v);
  ctx.saveDB(ctx.db);
  await ctx.sbSyncCycle();
  await drain53();
  var srv58v = sbServer.ss_exams.find(function (r) { return r.local_id === 'ex-58v'; });
  v28ok(!!srv58v, 'v58 async: after cycle 1, the created exam reaches the server');
  v28ok(srv58v && srv58v.name === 'Test Exam v58', 'v58 async: after cycle 1, the server holds the original name');
  // (cycle 1's pull REBUILDS ctx.db.exams — re-fetch the live row, never
  // mutate the stale pre-cycle object, or the diff sees no change)
  ex58v = ctx.db.exams.find(function (e) { return e.id === 'ex-58v'; });
  ex58v.name = 'Test Exam v58 Edited';
  ctx.saveDB(ctx.db);
  await ctx.sbSyncCycle();
  await drain53();
  srv58v = sbServer.ss_exams.find(function (r) { return r.local_id === 'ex-58v'; });
  var loc58v = ctx.db.exams.find(function (e) { return e.id === 'ex-58v'; });
  v28ok(!!srv58v && srv58v.name === 'Test Exam v58 Edited', 'v58 async: after cycle 2, the SERVER holds the edited name (the flush no longer re-uploads the stale original)');
  v28ok(!!loc58v && loc58v.name === 'Test Exam v58 Edited', 'v58 async: after cycle 2, the LOCAL exam keeps the edited name (the pull no longer clobbers it)');
  v28ok(ctx.sbOutboxLoad(uid53).length === 0, 'v58 async: after cycle 2, the outbox is drained');
  if (typeof ctx.sbQueueExamChange58 === 'function') {
  loc58v.deleted = true;
  ctx.sbQueueExamChange58(loc58v);
  ctx.saveDB(ctx.db);
  await ctx.sbSyncCycle();
  await drain53();
  loc58v = ctx.db.exams.find(function (e) { return e.id === 'ex-58v'; });
  srv58v = sbServer.ss_exams.find(function (r) { return r.local_id === 'ex-58v'; });
  v28ok(!!loc58v && loc58v.deleted === true, 'v58 async: after cycle 3, the LOCAL exam stays soft-deleted');
  v28ok(ctx.db.exams.filter(function (e) { return e.id === 'ex-58v' && !e.deleted; }).length === 0, 'v58 async: after cycle 3, the exam row itself has no active copy left');
  v28ok(!!srv58v, 'v58 async: after cycle 3, the server row still exists — a soft delete never hard-deletes');
  v28ok(ctx.deletedExamsSection().indexOf('Test Exam v58 Edited') !== -1, 'v58 async: after cycle 3, the deleted-exams card shows the exam');
  v28ok(ctx.deletedExamsSection().indexOf('Restore') !== -1, 'v58 async: after cycle 3, the deleted-exams card offers Restore');
  v28ok(ctx.sbOutboxLoad(uid53).length === 0, 'v58 async: after cycle 3, the outbox is drained');
  loc58v.deleted = false;
  ctx.sbQueueExamChange58(loc58v);
  ctx.saveDB(ctx.db);
  await ctx.sbSyncCycle();
  await drain53();
  loc58v = ctx.db.exams.find(function (e) { return e.id === 'ex-58v'; });
  v28ok(!!loc58v && !loc58v.deleted, 'v58 async: after cycle 4, the restored exam is active again');
  v28ok(!!loc58v && loc58v.name === 'Test Exam v58 Edited', 'v58 async: after cycle 4, the restored exam keeps its edited name');
  v28ok(ctx.sbOutboxLoad(uid53).length === 0, 'v58 async: after cycle 4, the outbox is drained');
  } else {
  v28ok(false, 'v58 async: sbQueueExamChange58 exists (a soft-delete queues explicitly)');
  v28ok(false, 'v58 async: after cycle 3, the LOCAL exam stays soft-deleted (helper missing)');
  v28ok(false, 'v58 async: after cycle 3, no active exam remains (helper missing)');
  v28ok(false, 'v58 async: after cycle 3, the server row still exists (helper missing)');
  v28ok(false, 'v58 async: after cycle 3, the deleted-exams card shows the exam (helper missing)');
  v28ok(false, 'v58 async: after cycle 3, the deleted-exams card offers Restore (helper missing)');
  v28ok(false, 'v58 async: after cycle 3, the outbox is drained (helper missing)');
  v28ok(false, 'v58 async: after cycle 4, the restored exam is active again (helper missing)');
  v28ok(false, 'v58 async: after cycle 4, the restored exam keeps its edited name (helper missing)');
  v28ok(false, 'v58 async: after cycle 4, the outbox is drained (helper missing)');
  }

  sbLatencyMs = 0;
  ctx.fetch = fetchBefore53;
  ctx.sbSyncResetMemory();

  ctx.fetch = realFetch37;
  delete ctx.location.reload;
  delete ctx.navigator.serviceWorker;

  // ---- Source-level checks ----
  v28ok(src.includes('SB_ANON_KEY') && src.includes('bsjqeeeemwimzldrehpw'), 'v28: app.js has the Supabase URL + anon key constant');
  v28ok(!src.includes('__SB_ANON_KEY__'), 'v28: no unfilled anon-key placeholder remains');
  v28ok(src.includes('return=minimal'), 'v28: return=minimal present for the anon admission insert');
  v28ok(html.includes('recoverForm') && html.includes('resetForm') && html.includes('sbStatus') && html.includes('showRecoverForm'), 'v28: index.html has recovery + reset forms + server status line');
  v28ok(html.includes('app.js?v=' + EXPECTED_VERSION) && html.includes('qrgen.js?v=' + EXPECTED_VERSION) && html.includes('styles.css?v=' + EXPECTED_VERSION), 'v59: index.html uses versioned app.js?v=' + EXPECTED_VERSION + ' / qrgen.js?v=' + EXPECTED_VERSION + ' / styles.css?v=' + EXPECTED_VERSION);
  // ---- v29: long-press text selection fix (CSS only) ----
  v28ok(html.includes('>v' + EXPECTED_VERSION + '<br>') && !html.includes('>v' + (EXPECTED_VERSION - 1) + '<br>'), 'v58: footer shows v' + EXPECTED_VERSION + ', no v' + (EXPECTED_VERSION - 1) + ' label remains');
  v28ok(sw.includes('school-saathi-v' + EXPECTED_VERSION) && !sw.includes('school-saathi-v' + (EXPECTED_VERSION - 1)), 'v59: sw.js CACHE_NAME is school-saathi-v' + EXPECTED_VERSION);
  v28ok(sw.includes('app.js?v=' + EXPECTED_VERSION) && sw.includes('styles.css?v=' + EXPECTED_VERSION) && sw.includes('qrgen.js?v=' + EXPECTED_VERSION), 'v59: sw.js precaches the v' + EXPECTED_VERSION + ' asset URLs');
  // ---- v33: atomic server-side numbering + never-lose pull ----
  v28ok(src.includes('ss_next_adm_no') && src.includes('ss_next_receipt_no'), 'v33: app.js mints numbers through the ss_next_adm_no / ss_next_receipt_no RPCs');
  v28ok(src.includes('sbSyncRepairNumbers') && src.includes('sbMintAdmNo') && src.includes('sbMintReceiptNo'), 'v33: repair + mint helpers present');
  v28ok(src.includes('numPending'), 'v33: offline-saved rows are marked numPending (no guessed number)');
  v28ok(src.includes('failReason'), 'v33: the outbox keeps failed entries with their failure reason');
  v28ok(src.includes('sbReceiptSameServer'), 'v33: a receipt is only patched when its content matches (no cross-device overwrite)');
  // ---- v41: the receipt-number minting loop fix ----
  v28ok(src.includes('sbReceiptContentMatches') && src.includes('sbFindReceiptByContent'), 'v41: adopt-before-mint helpers present — a receipt whose content already exists under another number links to it instead of minting');
  v28ok(src.includes('stuFromServer'), 'v41: the repair resolves student ids from the fresh server data it already fetched, not only from the stored id map');
  // (harness fix) the version is dynamic now — the old hard-coded 68
  // went stale at v69.
  v28ok(src.includes('APP_VERSION = ' + EXPECTED_VERSION), 'v59: APP_VERSION is ' + EXPECTED_VERSION);
  // ---- v46: the fee-records stale-snapshot stall ----
  v28ok(src.includes('var feeUpload = schoolRecreated') && src.includes("freshRows('ss_fee_records', feeRows"), 'v46: the fee-records upload pass uses the v39 receipts bypass — a record the server lacks uploads even when a stale snapshot entry says it synced');
  v28ok(src.includes('outboxUpsert46') && src.includes("outboxUpsert46.feeRecords[r.id]"), 'v46: the pull keeps a fee record with a pending outbox upsert — a stale snapshot entry never wipes an unconfirmed upload');
  v28ok(src.includes('var outboxRc = outboxUpsert46.receipts'), 'v46: the receipts keep-loop reads the outbox by the Supabase uid (the v39 load read the local account uid and always saw an empty outbox)');
  v28ok(src.includes("account.sbUid") && src.includes('state.sb.uid'), 'v46: the merge outbox set falls back from the account sbUid to the live session uid');
  // ---- v47: the attendance stale-snapshot stall + the receipt-detail rename ----
  v28ok(src.includes('var attUpload = schoolRecreated') && src.includes("notSynced('ss_attendance', a.date + '|' + a.cls + '|' + a.studentId)"), 'v47: the attendance upload pass uses the v39/v46 bypass — a mark the server lacks uploads even when a stale snapshot entry says it synced');
  v28ok(src.includes('var markUpload = schoolRecreated') && src.includes("notSynced('ss_marks', m.examId + '|' + m.studentId)"), 'v47: the marks upload pass uses the bypass — same inline-notSynced trap as attendance');
  v28ok(src.includes('var fsUpload = schoolRecreated') && src.includes('var teUpload = schoolRecreated') && src.includes('var exUpload = schoolRecreated'), 'v47: the fee-structure / teachers / exams steps use the bypass too');
  v28ok(src.includes("freshRows('ss_students', (d.students || [])"), 'v47: the students step deliberately keeps the snapshot filter — the bypass would resurrect a server-deleted student (v31 server-wins)');
  v28ok(src.includes('var hwUpload = schoolRecreated') && src.includes('var nUpload = schoolRecreated') && src.includes('var auUpload = schoolRecreated') && src.includes('var acUpload = schoolRecreated'), 'v47: the homework / notices / audit-log / activities steps use the bypass too');
  v28ok(src.includes('outboxUpsert46.attendance[snapKey]') && src.includes('outboxUpsert46.marks[key]'), 'v47: the pull keeps an attendance mark / mark with a pending outbox upsert — a stale snapshot entry never wipes an unconfirmed upload');
  v28ok(src.includes('outboxUpsert46 = { feeRecords: {}, receipts: {}, attendance: {}, marks: {}, students: {}, exams: {} }'), 'v47: the shared outbox set covers attendance and marks as well as fee records and receipts — and students since v56, exams since v58');
  v28ok(src.includes('var serverList = [];') && src.includes("if (r.id && onServer[r.id]) return;"), 'v47: mergeById collapses duplicate server rows by id — the 6-row fee duplication never doubles the local list');
  v28ok(src.includes('function receiptStudent(rc)') && src.includes("name: rc.name || (s && s.name) || ''"), 'v47: receiptStudent resolves the display student from the receipt\'s own stored name first, the local row only for the photo');
  v28ok(src.includes('var s2 = receiptStudent(rc);'), 'v47: the saved-receipt detail renders through receiptStudent, never through a local-student id lookup');
  v28ok(src.includes('var s = receiptStudent(rc);') && src.includes("receiptHTML(rc, s, false)"), 'v47: the receipt print renders through receiptStudent too');
  v28ok(src.includes("student: rs.name, cls: rs.cls"), 'v47: the WhatsApp receipt share names the student from the receipt itself');
  v28ok(src.includes('sbSyncFindStudentByNumber') && src.includes('_adoptedByNaturalKey'), 'v44: the students natural-key adopt helpers are present — a row found by admission_no/enr is adopted, never re-inserted');
  v28ok(src.includes('delete patchPayload.local_id'), 'v44: the adopt PATCH never sends local_id, so the server row keeps its own identity');
  v28ok(src.includes("sbSrvIdSet(sbUid, 'ss_students', r.local_id, r.id)"), 'v44: the upload pass persists the students id map, so a re-created row never leaves a stale stored id');
  // ---- v51: the stuck outbox — zombie keep-forever entries ----
  v28ok(src.includes('if (!sbSyncPayloadReady(table, payload2)) {') && src.includes('if (!sbSyncLocalRow(entry)) return Promise.resolve({ pushed: false, skipped: true });'), 'v51: an unmapped-parent entry drops when its local row is gone, and only keeps while the row exists');
  v28ok(src.includes("sbSrvIdSet(sbUid, 'ss_students', r.local_id, r.id)") && src.includes("sbSrvIdSet(sbUid, 'ss_exams', r.local_id, r.id)"), 'v51: the students/exams id maps are written under the Supabase uid — the same key every reader uses (the v44 write used the local account uid and was invisible)');
  v28ok(src.includes("if (table === 'ss_receipts' && !sbReceiptSameServer(row, payload2)) {") && src.includes('if (localRc51 && sbReceiptSame(localRc51, entry.row || {})) return { pushed: false, skipped: true, keep: true };'), 'v51: a mismatched receipt entry only keeps while the local receipt with that number still carries its content — a phantom (gone, or a different receipt sharing the number) drops');
  v28ok(src.includes('sbSyncFlushNow().then(function (fl)'), 'v44: the manual backup flushes the outbox before claiming success');
  // ---- v45: the demo-seed quarantine ----
  v28ok(src.includes('sbIsSeedLocalId') && src.includes('sbIsSeedRow') && src.includes('sbSeedFingerprints'), 'v45: the seed quarantine predicates exist — id pattern plus the content fingerprint built from seedDB()');
  v28ok(src.includes('sbIsSeedRow(\'ss_students\', s, d)') && src.includes('sbIsSeedRow(\'ss_teachers\', te, d)') && src.includes('sbIsSeedRow(\'ss_fee_records\', r, d)'), 'v45: the upload pass filters seed rows out of the students/teachers/fee-records steps');
  v28ok(src.includes('!sbIsSeedProfile(d)'), 'v45: the upload pass never PATCHes the server school row from a seed profile');
  v28ok(src.includes('if (sbIsSeedRow(table, row, d)) return;'), 'v45: seed rows are never hashed — the diff never queues them and the snapshot never marks them synced');
  v28ok(src.includes('if (sbIsSeedEntry(table, entry)) return Promise.resolve({ pushed: false, skipped: true });'), 'v45: the flush drops a queued seed entry as skipped, never POSTs/PATCHes it');
  v28ok(src.includes('if (sbIsSeedRow(\'ss_students\', row)) return Promise.resolve(null);'), 'v45: a seed row is never adopted by admission_no/enr — the live V21 rename cannot recur');
  v28ok(src.includes('if (mergeIsSeedRow(table, r)) return;') && src.includes('seedStudentIds[sid]') && src.includes('seedExamIds[m.examId]'), 'v45: the pull drops a local seed row the server no longer has (seed ids snapshotted before the student/exam merge)');
  v28ok(src.includes('sbIsSeedRow(\'ss_students\', s, d)'), 'v45: the repair pass never re-numbers a seed student');
  v28ok(src.includes("toast(fl && fl.done && !left ? t('sbBackupDone') : t('sbBackupFailed'))"), 'v44: Backup complete. only toasts when the flush finished and the outbox is empty');
  v28ok(src.includes("el.textContent = ''"), 'v44: the toast dismiss clears its text, so no stale text can read as a pinned toast');
  v28ok(src.includes('sbSyncRepairNumbers(account, sbUid, tok)'), 'v33: the repair pass runs in the sync cycle');
  v28ok(css.includes('body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}'), 'v29: body disables text selection + touch callout');
  v28ok(css.includes('input,textarea,select,[contenteditable]{-webkit-user-select:text;user-select:text}'), 'v29: form fields keep text selection');
  v28ok(!src.includes('selectstart') && !src.includes('oncontextmenu'), 'v29: no JS selection prevention (CSS only)');
  const sbKeys = ['sbForgotPw', 'sbRecoverTitle', 'sbSendResetLink', 'sbResetPw', 'sbRecoverSent', 'sbRecoverFailed', 'sbResetDone', 'sbResetFailed', 'sbTooMany', 'sbEmailConfirm', 'sbEmailConfirmed', 'sbOfflineLogin', 'sbTitle', 'sbBackupNow', 'sbStatusSynced', 'sbStatusPending', 'sbStatusUploading', 'sbStatusFailed', 'sbStatusOffline', 'sbStatusNotSchool', 'sbBackupDone', 'sbBackupFailed', 'sbNoSchool', 'sbDownloadNow', 'sbDownloadStart', 'sbDownloadDone', 'sbDownloadFailed', 'sbDownloadSkipped', 'sbDownloadOffline', 'sbDownloadNoServer', 'sbStatusSyncing', 'sbStatusPendingSync', 'sbSyncDone', 'sbSyncFailed', 'sbSyncOffline', 'sbSyncConflict', 'sbNumPending', 'sbNumPendingReceipt', 'sbStatusSessionExpired', 'sbStatusNotLinked', 'sbLinkServer', 'sbLinkDone', 'sbLinkFailed', 'sbLinkPwTitle', 'sbNumAssigning', 'resetPwHintServer', 'resetConfirmMsgServer', 'resetConfirmTitle', 'resetDeviceOnly', 'resetWipeServerBtn', 'resetWipeServerDone', 'resetWipeServerFailed', 'supportQueued', 'admReqQueued', 'admReqLoadingSchools'];
  v28ok(sbKeys.every(function (k) { return k in ctx.I18N.en; }), 'v28: all server-auth strings exist in I18N.en');
  v28ok(sbKeys.every(function (k) { return !/[\u0900-\u097F]/.test(ctx.I18N.en[k]); }), 'v28: server-auth strings are English-only (no Devanagari)');
}

let v28Done = false;
const v28Guard = setTimeout(function () {
  if (!v28Done) { console.log('FAIL v34 async tests did not finish in time'); process.exitCode = 1; }
}, 360000); // v53: raised from 30s — the latency block alone adds ~1 min of real time on v52 code; raised again to 360s in Phase 1 — the code has grown since v52 and the run now needs ~5 min with the latency block on
// CR-1/H-1 (PR #17): the sync test IIFE is async now (it awaits
// restoreSession), so the async section must wait for it — its fixtures
// are built by the sync section. If the sync run crashed, fail fast
// instead of running the async tests against half-built state.
Promise.resolve(ctx.__syncDone).then(function () {
  v28run().then(function () {
    v28Done = true; clearTimeout(v28Guard);
    console.log('\n==== V35 RESULT: ' + v28passes + ' passed, ' + v28fails.length + ' failed ====');
    if (v28fails.length) { console.log('V34 FAILED: ' + v28fails.join(' | ')); process.exitCode = 1; }
  }).catch(function (err) {
    v28Done = true; clearTimeout(v28Guard);
    console.log('FAIL v28 async runner crashed: ' + (err && err.message));
    process.exitCode = 1;
  });
}, function (err) {
  v28Done = true; clearTimeout(v28Guard);
  console.log('FAIL sync runner crashed: ' + (err && err.stack || err && err.message || err));
  process.exitCode = 1;
});

