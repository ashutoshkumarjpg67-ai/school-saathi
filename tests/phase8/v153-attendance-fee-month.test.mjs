// tests/phase8/v153-attendance-fee-month.test.mjs — v153 (24 Nov 2026).
//
// Fix 1 (live-confirmed 24 Nov 2026, demo account, v152): opening
// Attendance on a class with no enrolled students showed only the bare
// table headers (STUDENT / ROLL / STATUS / NOTIFY) with no message.
// attendancePage() now renders the same empty-state row pattern as
// Admission Requests (colspan 4 + new attNoStudents i18n key).
//
// Fix 2 (live-confirmed 24 Nov 2026, demo account, v152): Generate Fees
// defaulted to hardcoded 'Sep' (state.feeGenMonth). It now initialises
// via the existing collectMonthDefault() helper — the current month.
//
// Fix 3 (live-confirmed 24 Nov 2026, v152, every sync cycle): the sync
// cycle fails with "read-ss_timetable" because the SERVER table was never
// created — SQL 55 was never applied in the Supabase SQL Editor. That is
// NOT a code bug, so there is no code fix and no behaviour test here;
// instead the timetable pull is PINNED intact (no silent-skip workaround
// may hide the missing table): sbFetchAllPages still throws
// 'read-' + table and ss_timetable stays in the pull.
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
const SW_SRC = readFileSync(join(ROOT, 'sw.js'), 'utf8');
const VERSION_JSON = JSON.parse(readFileSync(join(ROOT, 'version.json'), 'utf8'));
const PACKAGE_JSON = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

const CUR_MONTH = new Date().toLocaleString('en', { month: 'short' });

function schoolApp() {
  const app = createAppContext();
  app.run(`db = seedDB();`);
  app.run(`state.role = 'school'; state.user = { email: 'a@school.in', role: 'school', name: 'Test School' };`);
  return app;
}

describe('v153 — Attendance empty class shows a message', () => {
  it('attNoStudents i18n key exists with the exact message', () => {
    const app = createAppContext();
    assert.equal(app.run(`t('attNoStudents')`), 'No students in this class yet.');
    assert.ok(I18N_SRC.includes('attNoStudents'), 'attNoStudents missing from i18n.js');
  });

  it('attendancePage on an empty roster renders the empty-state row, header counts intact', () => {
    const app = schoolApp();
    app.run(`db.students = [];`);
    app.run(`state.attCls = '10th-A';`);
    const html = app.run(`attendancePage()`);
    assert.ok(html.includes('No students in this class yet.'), 'empty roster shows no message — bare headers only (the v152 bug)');
    assert.ok(html.includes('colspan="4"'), 'empty-state row must span all 4 columns');
    assert.ok(html.includes('<div class="empty">'), 'empty-state row must use the .empty pattern like Admission Requests');
    assert.ok(html.includes('0 Present'), 'header counts must still read 0 Present on an empty roster');
  });

  it('attendancePage with students does NOT show the empty-state row', () => {
    const app = schoolApp();
    app.run(`state.attCls = '6th-A';`);
    const html = app.run(`attendancePage()`);
    assert.ok(!html.includes('No students in this class yet.'), 'non-empty roster must not show the empty-state row');
    assert.ok(html.includes('Aarav Verma'), 'seed 6th-A student missing from the roster');
  });
});

describe('v153 — Generate Fees defaults to the current month', () => {
  it('state.feeGenMonth initialises to the current month, not Sep', () => {
    const app = createAppContext();
    assert.equal(app.run(`state.feeGenMonth`), CUR_MONTH, 'feeGenMonth must default to the current month (today: ' + CUR_MONTH + ')');
    assert.ok(app.run(`MONTHS_ACAD.indexOf(state.feeGenMonth) !== -1`), 'feeGenMonth must be a valid academic month');
  });

  it('the default comes from collectMonthDefault(); no hardcoded Sep literal remains', () => {
    assert.ok(APP_SRC.includes('feeGenMonth: collectMonthDefault()'), 'state must initialise feeGenMonth via collectMonthDefault()');
    assert.ok(!APP_SRC.includes("feeGenMonth: 'Sep'"), "hardcoded feeGenMonth: 'Sep' must be gone");
  });

  it('the Generate Fees month select marks the current month selected', () => {
    const app = schoolApp();
    const html = app.run(`feesPage()`);
    assert.ok(html.includes('<option selected>' + CUR_MONTH + '</option>'), 'feesPage must mark the current month (' + CUR_MONTH + ') selected in the Generate Fees month select');
  });
});

describe('v153 — timetable read failure is server-side (no code workaround)', () => {
  it('the pull still fails loudly on a missing table; ss_timetable stays in the pull', () => {
    assert.ok(APP_SRC.includes("throw new Error('read-' + table)"), 'sbFetchAllPages must still throw read-<table> on a failed pull — hiding it would mask a missing server table');
    assert.ok(APP_SRC.includes("'ss_timetable'"), 'ss_timetable must stay in the sync pull tables');
    assert.ok(!APP_SRC.includes('ss_timetable') || APP_SRC.includes('sbMapTimetable'), 'timetable mapping must be intact');
  });
});

describe('v154 version markers', () => {
  it('APP_VERSION, version.json and package.json are all 159', () => {
    const app = createAppContext();
    assert.equal(app.get('APP_VERSION'), 159);
    assert.equal(VERSION_JSON.version, 159);
    assert.equal(PACKAGE_JSON.version, '159.0.0');
  });

  it('sw.js cache is school-saathi-v159 with ?v=153 assets', () => {
    assert.match(SW_SRC, /CACHE_NAME = 'school-saathi-v159'/);
    assert.ok(SW_SRC.includes('app.js?v=159'), 'app.js?v=159 missing from sw.js precache');
  });
});
