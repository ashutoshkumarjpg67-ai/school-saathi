// tests/phase8/v149-bugfix.test.mjs — v149 follow-up to the v148 live check (24 Nov 2026).
//
// The v148 desktop live check (15:31 IST) found 8 of 9 fixes verified.
// Bug 4 was only PARTLY fixed: Settings showed "Sync conflicts (6)"
// instead of 21 — five genuine, but one false alarm stayed:
//
//   Marks — "Yours Marks: 85" vs "Server Marks: 85", identical values,
//   only the ID formats differ.
//
// The v148 identical-content check compares the mapped payload field
// for field, including the foreign-key columns exam_id / student_id.
// The prune maps the recorded local row with the CURRENT id maps,
// while the recorded server row was matched with the maps at record
// time — for rows that reference seed exams/students the maps never
// resolve (seed rows are quarantined from upload, so their server
// rows carry no matching local_id), so the mapped payload carries
// null UUIDs against the server row's real UUIDs and the comparison
// fails forever. The same trap bites attendance (found by
// date+class+student).
//
// Fix (v149): rows matched by NATURAL KEY carry their identity in the
// lookup, not in the compared fields — sbSyncRowSameAsServer skips
// exam_id/student_id for ss_marks and student_id for ss_attendance.
// Tables found by local_id keep the full comparison (a fee record
// moved to another student IS a real difference — saveFeeRecord lets
// the admin re-pick the student on edit), so their foreign keys stay
// compared.
//
// Second fix in this release: the "Last flush" line printed this
// flush's newly recorded conflict count ("pushed 0 · conflicts 0")
// under a "Sync conflicts (6)" heading that counts ALL recorded
// conflicts. The line now reports the recorded total
// (sbSyncRecordedConflictCount), so the two always agree.
//
// Timer hygiene: same as the v148 file — every test that logs in
// disarms the first-load backstop timer before finishing.
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
const SW_SRC = readFileSync(join(ROOT, 'sw.js'), 'utf8');
const VERSION_JSON = JSON.parse(readFileSync(join(ROOT, 'version.json'), 'utf8'));
const PACKAGE_JSON = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

function appWithDom() {
  const app = createAppContext();
  app.run(`
    var __els149 = {};
    function __el149() {
      return { innerHTML: '', textContent: '', value: '', style: {}, dataset: {},
        classList: { add: function(){}, remove: function(){}, toggle: function(){}, contains: function(){ return false; } },
        setAttribute: function(){}, getAttribute: function(){ return null; },
        addEventListener: function(){}, removeEventListener: function(){},
        appendChild: function(){}, remove: function(){}, click: function(){}, focus: function(){},
        querySelector: function(){ return null; }, querySelectorAll: function(){ return []; },
        options: [], selectedIndex: 0 };
    }
    document.getElementById = function (id) { if (!__els149[id]) __els149[id] = __el149(); return __els149[id]; };
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

describe('v154 version markers', () => {
  it('APP_VERSION, version.json and package.json are all 162', () => {
    const app = createAppContext();
    assert.equal(app.get('APP_VERSION'), 162);
    assert.equal(VERSION_JSON.version, 162);
    assert.equal(PACKAGE_JSON.version, '162.0.0');
  });

  it('sw.js cache is school-saathi-v162 with ?v=153 assets', () => {
    assert.match(SW_SRC, /CACHE_NAME = 'school-saathi-v162'/);
    assert.ok(SW_SRC.includes('app.js?v=162'), 'app.js?v=162 missing from sw.js precache');
  });
});

describe('bug 4 follow-up — natural-key FKs never veto an identical row', () => {
  it('ss_marks: different exam/student UUIDs with the same marks are identical', () => {
    const app = createAppContext();
    // The live v148 shape: local marks 85, server marks 85, only the
    // id formats differ (mapped payload carries null/stale UUIDs).
    assert.equal(app.run(`sbSyncRowSameAsServer({ school_id: 'sch-1', exam_id: null, student_id: null, marks: 85 }, { id: 'srv-m1', school_id: 'sch-1', exam_id: 'uuid-exam-1', student_id: 'uuid-stu-1', marks: 85, updated_at: '2026-11-24T00:00:00Z' }, 'ss_marks')`), true);
    assert.equal(app.run(`sbSyncRowSameAsServer({ school_id: 'sch-1', exam_id: 'uuid-exam-9', student_id: 'uuid-stu-9', marks: 85 }, { id: 'srv-m1', school_id: 'sch-1', exam_id: 'uuid-exam-1', student_id: 'uuid-stu-1', marks: 85, updated_at: '2026-11-24T00:00:00Z' }, 'ss_marks')`), true);
    // A real difference still fails: different marks are a conflict.
    assert.equal(app.run(`sbSyncRowSameAsServer({ school_id: 'sch-1', exam_id: null, student_id: null, marks: 91 }, { id: 'srv-m1', school_id: 'sch-1', exam_id: 'uuid-exam-1', student_id: 'uuid-stu-1', marks: 90, updated_at: '2026-11-24T00:00:00Z' }, 'ss_marks')`), false);
    // Without the table the old behaviour stands (fail-closed default).
    assert.equal(app.run(`sbSyncRowSameAsServer({ school_id: 'sch-1', exam_id: null, student_id: null, marks: 85 }, { id: 'srv-m1', school_id: 'sch-1', exam_id: 'uuid-exam-1', student_id: 'uuid-stu-1', marks: 85, updated_at: '2026-11-24T00:00:00Z' })`), false);
  });

  it('ss_attendance: different student UUID with the same date/class/status is identical', () => {
    const app = createAppContext();
    assert.equal(app.run(`sbSyncRowSameAsServer({ school_id: 'sch-1', att_date: '2026-11-24', cls: '6th-A', student_id: null, status: 'P' }, { id: 'srv-a1', school_id: 'sch-1', att_date: '2026-11-24', cls: '6th-A', student_id: 'uuid-stu-1', status: 'P', updated_at: '2026-11-24T00:00:00Z' }, 'ss_attendance')`), true);
    assert.equal(app.run(`sbSyncRowSameAsServer({ school_id: 'sch-1', att_date: '2026-11-24', cls: '6th-A', student_id: null, status: 'P' }, { id: 'srv-a1', school_id: 'sch-1', att_date: '2026-11-24', cls: '6th-A', student_id: 'uuid-stu-1', status: 'A', updated_at: '2026-11-24T00:00:00Z' }, 'ss_attendance')`), false);
    // The natural key itself still matters: a different date is not identical.
    assert.equal(app.run(`sbSyncRowSameAsServer({ school_id: 'sch-1', att_date: '2026-11-25', cls: '6th-A', student_id: null, status: 'P' }, { id: 'srv-a1', school_id: 'sch-1', att_date: '2026-11-24', cls: '6th-A', student_id: 'uuid-stu-1', status: 'P', updated_at: '2026-11-24T00:00:00Z' }, 'ss_attendance')`), false);
  });

  it('local_id tables still compare foreign keys: a fee record moved to another student is a real difference', () => {
    const app = createAppContext();
    // saveFeeRecord lets the admin re-pick the student on edit, so a
    // changed student_id must never be skipped for ss_fee_records.
    assert.equal(app.run(`sbSyncRowSameAsServer({ school_id: 'sch-1', local_id: 'fee-x', student_id: 'uuid-stu-1', student_name: 'Test Kumar', cls: '6th-A', month: 'Dec', fee_type: 'Tuition', amount: 800, status: 'Collected', record_date: '2026-11-15' }, { id: 'srv-f1', school_id: 'sch-1', local_id: 'fee-x', student_id: 'uuid-stu-9', student_name: 'Test Kumar', cls: '6th-A', month: 'Dec', fee_type: 'Tuition', amount: 800, status: 'Collected', record_date: '2026-11-15', updated_at: '2026-11-24T00:00:00Z' }, 'ss_fee_records')`), false);
    assert.equal(app.run(`sbSyncRowSameAsServer({ school_id: 'sch-1', local_id: 'fee-x', student_id: 'uuid-stu-1', student_name: 'Test Kumar', cls: '6th-A', month: 'Dec', fee_type: 'Tuition', amount: 800, status: 'Collected', record_date: '2026-11-15' }, { id: 'srv-f1', school_id: 'sch-1', local_id: 'fee-x', student_id: 'uuid-stu-1', student_name: 'Test Kumar', cls: '6th-A', month: 'Dec', fee_type: 'Tuition', amount: 800, status: 'Collected', record_date: '2026-11-15', updated_at: '2026-11-24T00:00:00Z' }, 'ss_fee_records')`), true);
  });

  it('the prune drops the live-shape marks + attendance false alarms and keeps real ones', () => {
    const app = loginSchool(appWithDom(), true);
    app.run(`sbSaveServerSchool('u1', 'sch-1')`);
    // The persisted id maps are empty in this context — exactly the
    // live condition for seed-referencing rows: the mapped payload
    // carries null FKs against the server row's real UUIDs.
    app.run(`db.marks = [{ examId: 'ex1', studentId: 'stu33', marks: 85 }, { examId: 'ex1', studentId: 'stu34', marks: 91 }]; saveDB(db);`);
    app.run(`db.syncConflicts = [
      { table: 'ss_marks', key: 'ex1|stu33', localRow: { examId: 'ex1', studentId: 'stu33', marks: 85 }, serverRow: { id: 'srv-m1', school_id: 'sch-1', exam_id: 'uuid-exam-1', student_id: 'uuid-stu-1', marks: 85, updated_at: '2026-11-24T00:00:00Z' }, at: '2026-11-24T00:00:00Z' },
      { table: 'ss_marks', key: 'ex1|stu34', localRow: { examId: 'ex1', studentId: 'stu34', marks: 91 }, serverRow: { id: 'srv-m2', school_id: 'sch-1', exam_id: 'uuid-exam-1', student_id: 'uuid-stu-2', marks: 90, updated_at: '2026-11-24T00:00:00Z' }, at: '2026-11-24T00:00:00Z' },
      { table: 'ss_attendance', key: '2026-11-24|6th-A|stu33', localRow: { date: '2026-11-24', cls: '6th-A', studentId: 'stu33', status: 'P' }, serverRow: { id: 'srv-a1', school_id: 'sch-1', att_date: '2026-11-24', cls: '6th-A', student_id: 'uuid-stu-1', status: 'P', updated_at: '2026-11-24T00:00:00Z' }, at: '2026-11-24T00:00:00Z' },
      { table: 'ss_attendance', key: '2026-11-24|6th-A|stu34', localRow: { date: '2026-11-24', cls: '6th-A', studentId: 'stu34', status: 'P' }, serverRow: { id: 'srv-a2', school_id: 'sch-1', att_date: '2026-11-24', cls: '6th-A', student_id: 'uuid-stu-2', status: 'A', updated_at: '2026-11-24T00:00:00Z' }, at: '2026-11-24T00:00:00Z' },
      { table: 'ss_fee_records', key: 'fee-x', localRow: { id: 'fee-x', studentId: 'stu33', student: 'Test Kumar', cls: '6th-A', month: 'Dec', type: 'Tuition', amount: 800, status: 'Collected', date: '2026-11-15' }, serverRow: { id: 'srv-f1', school_id: 'sch-1', local_id: 'fee-x', student_id: 'uuid-stu-9', student_name: 'Test Kumar', cls: '6th-A', month: 'Dec', fee_type: 'Tuition', amount: 800, status: 'Collected', record_date: '2026-11-15', updated_at: '2026-11-24T00:00:00Z' }, at: '2026-11-24T00:00:00Z' }
    ]; saveDB(db);`);
    app.run(`sbSyncPruneIdenticalConflicts({uid:'u1'}, 'u1')`);
    const kept = app.run('db.syncConflicts');
    assert.equal(kept.length, 3);
    // (No deepEqual on a vm-realm array — compare scalars instead.)
    var keys = kept.map(function (c) { return c.key; });
    assert.ok(keys.indexOf('ex1|stu34') !== -1, 'real marks conflict must stay');
    assert.ok(keys.indexOf('2026-11-24|6th-A|stu34') !== -1, 'real attendance conflict must stay');
    assert.ok(keys.indexOf('fee-x') !== -1, 'fee record with a different student must stay');
    disarm(app);
  });
});

describe('bug 4 follow-up — the Last-flush line agrees with the recorded conflicts', () => {
  it('sbSyncRecordedConflictCount returns the recorded total', () => {
    const app = loginSchool(appWithDom(), true);
    assert.equal(app.run('sbSyncRecordedConflictCount()'), 0);
    app.run(`db.syncConflicts = [{ table: 'ss_marks', key: 'a' }, { table: 'ss_marks', key: 'b' }, { table: 'ss_fee_records', key: 'c' }, { table: 'ss_teachers', key: 'd' }, { table: 'ss_homework', key: 'e' }, { table: 'ss_fee_structure', key: 'f' }]; saveDB(db);`);
    assert.equal(app.run('sbSyncRecordedConflictCount()'), 6);
    disarm(app);
  });

  it('the flush completion writes the recorded total into the diag (source pin)', () => {
    // The harness has no network, so the flush itself cannot run here;
    // pin the write instead: the Last-flush diag must carry the
    // recorded total, never this flush's newly recorded count.
    const flushFn = APP_SRC.slice(APP_SRC.indexOf('function sbSyncFlush'));
    assert.ok(flushFn.includes('conflicts: sbSyncRecordedConflictCount()'), 'flush diag must write the recorded conflict total');
    assert.ok(!flushFn.includes('conflicts: r.conflicts || 0'), 'flush diag must not write this flush\'s new-conflict count');
  });

  it('heading and Last-flush line show the same number', () => {
    const app = loginSchool(appWithDom(), true);
    app.run(`db.syncConflicts = [{ table: 'ss_marks', key: 'a', localRow: { examId: 'ex1', studentId: 'stu33', marks: 85 }, serverRow: { marks: 85 } }, { table: 'ss_marks', key: 'b', localRow: { examId: 'ex1', studentId: 'stu34', marks: 91 }, serverRow: { marks: 90 } }, { table: 'ss_fee_records', key: 'c', localRow: {}, serverRow: {} }, { table: 'ss_teachers', key: 'd', localRow: {}, serverRow: {} }, { table: 'ss_homework', key: 'e', localRow: {}, serverRow: {} }, { table: 'ss_fee_structure', key: 'f', localRow: {}, serverRow: {} }]; saveDB(db);`);
    // What the fixed flush completion stores: the recorded total.
    app.run(`sbSyncDiagSet({ lastFlush: { at: '2026-11-24T10:00:00.000Z', ms: 1200, pushed: 0, conflicts: sbSyncRecordedConflictCount(), leftover: 0, calls: 3 } });`);
    const details = app.run('sbSyncDetailsHtml()');
    assert.ok(details.includes('conflicts 6'), 'Last-flush line must show the recorded total 6, got: ' + details.slice(0, 400));
    const list = app.run('sbSyncConflictsHtml()');
    assert.ok(list.includes('(6)'), 'conflicts heading must show (6)');
    disarm(app);
  });
});
