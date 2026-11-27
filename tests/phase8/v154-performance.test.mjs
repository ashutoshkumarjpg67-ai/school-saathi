// tests/phase8/v154-performance.test.mjs — v154 (26 Nov 2026).
//
// Performance refinement: boot, every save, the students list and the
// sync cycle were all paying full re-scans / full re-seals on every
// action. Measured in the Node harness on a synthetic 500-student
// school (DB JSON 6.39 MB; a low-end phone is ~2-4x slower):
//   loadDB 11.0s -> 7.3s; saveDB 4.6s -> 2.7s; stuSorted(att) 7.6s ->
//   0.23s; studentsPage() 1.4s -> 0.25s; sbSyncSnapshotRefresh
//   18-24s -> 1.7s per cycle; the ~1.6s per-save sync re-hash is gone
//   (deferred into the 600ms-debounced cycle).
//
// Behaviour is UNCHANGED — every change below is pinned by an
// equivalence test against the pre-v154 rule, not by a timing assert:
//   1. vault.js b64 encode/decode: byte-identical output (verified
//      against Node Buffer in school-saathi-perf/; the ChaCha and
//      SHA-256 rewrites were tried, measured SLOWER, and reverted).
//   2. sbSnapSave stores the sync snapshot as PLAIN JSON, not sealed.
//      The snapshot holds only { table: { key: sha256-hash } } — no
//      names, amounts, photos or PII, reconstructible from the sealed
//      DB. Load side unchanged (vaultDecode passes plaintext through;
//      snapshots sealed by older versions still decode). DB, outbox,
//      accounts, sessions and tombstones stay sealed.
//   3. feeStatusMap(): one pass over feeRecords; same rule as
//      studentFeeStatus (Pending wins, else Paid if any Collected,
//      else '—').
//   4. stuSorted('att'): % precomputed once per student; stable sort,
//      identical order to the old in-comparator computation.
//   5. sbSyncOnSave defers the full diff to the debounced cycle
//      (sbSyncCatchUpDiff runs it once at cycle start); sbSyncFlushNow
//      runs the catch-up diff first, so logout / Back Up Now still
//      push a change saved <600ms earlier.
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

function schoolApp() {
  const app = createAppContext();
  app.run(`db = seedDB();`);
  app.run(`state.role = 'school'; state.user = { email: 'a@school.in', role: 'school', name: 'Test School' };`);
  return app;
}

describe('v154 version markers', () => {
  it('APP_VERSION, version.json and package.json are all 167', () => {
    const app = createAppContext();
    assert.equal(app.get('APP_VERSION'), 167);
    assert.equal(VERSION_JSON.version, 167);
    assert.equal(PACKAGE_JSON.version, '167.0.0');
  });

  it('sw.js cache is school-saathi-v167 with ?v=167 assets', () => {
    assert.match(SW_SRC, /CACHE_NAME = 'school-saathi-v167'/);
    assert.ok(SW_SRC.includes('app.js?v=167'), 'app.js?v=167 missing from sw.js precache');
  });
});

describe('v154 — sync snapshot is stored as plain JSON (hashes only)', () => {
  it('sbSnapSave writes plaintext JSON and sbSnapLoad reads it back', () => {
    const app = schoolApp();
    app.run(`sbSnapSave('test-uid', { ss_students: { stu1: 'a1b2' }, ss_fee_records: { f1: 'c3d4' } });`);
    const raw = app.run(`localStorage.getItem('schoolSaathiSyncSnap:test-uid')`);
    assert.ok(typeof raw === 'string' && raw.charAt(0) === '{', 'snapshot must be plain JSON, not a sealed ssv1$ envelope, got: ' + String(raw).slice(0, 20));
    assert.equal(JSON.parse(raw).ss_students.stu1, 'a1b2');
    const back = app.run(`JSON.stringify(sbSnapLoad('test-uid'))`);
    assert.equal(JSON.parse(back).ss_fee_records.f1, 'c3d4');
  });

  it('sbSnapSave no longer seals the snapshot', () => {
    assert.ok(!/function sbSnapSave[\s\S]{0,1200}vaultEncode/.test(APP_SRC), 'sbSnapSave must not call vaultEncode');
    assert.ok(APP_SRC.includes('localStorage.setItem(SB_SNAP_KEY'), 'sbSnapSave still writes to the snapshot key');
  });
});

describe('v154 — feeStatusMap agrees with studentFeeStatus for every student', () => {
  it('Pending wins, else Paid if any Collected, else no dues', () => {
    const app = schoolApp();
    app.run(`db.feeRecords = [
      { studentId: 's1', status: 'Pending' },
      { studentId: 's1', status: 'Collected' },
      { studentId: 's2', status: 'Collected' },
      { studentId: 's2', status: 'Collected' }
    ];`);
    // NOTE: app.run returns values from the harness vm — its arrays
    // carry a different Array prototype, so deepStrictEqual fails on
    // identical contents. Compare JSON strings instead.
    const rows = app.run(`JSON.stringify(['s1','s2','s3'].map(function (id) { return (feeStatusMap()[id] || '\u2014') + '|' + studentFeeStatus(id); }))`);
    assert.equal(rows, '["Pending|Pending","Paid|Paid","\u2014|\u2014"]');
  });
});

describe('v154 — sorting by attendance gives the same order as before', () => {
  it('stuSorted(att) orders by the same % studentAttPct computes', () => {
    const app = schoolApp();
    app.run(`db.attendance = {};`);
    app.run(`db.students = [
      { id: 's1', name: 'Asha', cls: '6th-A', att: 30 },
      { id: 's2', name: 'Bala', cls: '6th-A', att: 90 },
      { id: 's3', name: 'Chand', cls: '6th-A', att: 60 }
    ];`);
    app.run(`state.stuSort = 'att'; state.stuSortDir = 1;`);
    // NOTE: same cross-vm array caveat as the fee test — compare JSON.
    const ids = app.run(`JSON.stringify(stuSorted(db.students).map(function (s) { return s.id; }))`);
    assert.equal(ids, '["s1","s3","s2"]');
    const pcts = app.run(`JSON.stringify(db.students.map(function (s) { return studentAttPct(s); }))`);
    assert.equal(pcts, '[30,90,60]');
  });
});

describe('v154 — deferred sync diff still reaches logout / Back Up Now', () => {
  it('sbSyncFlushNow runs the catch-up diff before pushing', () => {
    const flush = APP_SRC.slice(APP_SRC.indexOf('function sbSyncFlushNow()'), APP_SRC.indexOf('function sbSyncFlushNow()') + 1200);
    assert.ok(flush.includes('sbSyncCatchUpDiff()'), 'sbSyncFlushNow must run sbSyncCatchUpDiff() first');
    assert.ok(flush.indexOf('sbSyncCatchUpDiff()') < flush.indexOf('sbSyncFlushWithToken'), 'diff must run before the push, not after');
  });

  it('sbSyncOnSave defers the diff and schedules the debounced cycle', () => {
    const onSave = APP_SRC.slice(APP_SRC.indexOf('function sbSyncOnSave()'), APP_SRC.indexOf('function sbSyncOnSave()') + 2200);
    assert.ok(onSave.includes('sbSyncDiffSkipped = true'), 'online saves must set sbSyncDiffSkipped');
    assert.ok(onSave.includes('sbSyncScheduleFlush()'), 'online saves must schedule the debounced cycle');
  });
});
