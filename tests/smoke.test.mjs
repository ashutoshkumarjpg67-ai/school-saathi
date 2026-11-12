// tests/smoke.test.mjs — Phase 1 smoke tests (audit CR-8).
//
// Small and green on purpose: version markers, source syntax, seeded
// fixtures, fresh-device empty start, and the backup export → wipe →
// restore round-trip on fixture data. Full coverage is Phase 7's job.
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

describe('version markers agree', () => {
  it('scripts/check-version.mjs passes (exit 0)', () => {
    // Throws when the script exits non-zero.
    execFileSync('node', ['scripts/check-version.mjs'], { cwd: ROOT, stdio: 'pipe' });
  });

  it('version.json matches APP_VERSION, ?v=, sidebar and CACHE_NAME', () => {
    const truth = JSON.parse(read('version.json')).version;
    const appV = read('app.js').match(/var APP_VERSION\s*=\s*(\d+)\s*;/);
    assert.ok(appV, 'app.js APP_VERSION missing');
    assert.equal(Number(appV[1]), truth);
    for (const f of ['index.html', 'sw.js']) {
      const vs = [...read(f).matchAll(/\?v=(\d+)/g)].map((m) => Number(m[1]));
      assert.ok(vs.length >= 3, `${f}: expected >=3 ?v= markers, found ${vs.length}`);
      for (const v of vs) assert.equal(v, truth, `${f}: ?v=${v} != ${truth}`);
    }
    const sideV = read('index.html').match(/>v(\d+)<br>/);
    assert.ok(sideV, 'index.html sidebar vN missing');
    assert.equal(Number(sideV[1]), truth);
    const cacheV = read('sw.js').match(/CACHE_NAME\s*=\s*'school-saathi-v(\d+)'/);
    assert.ok(cacheV, 'sw.js CACHE_NAME missing');
    assert.equal(Number(cacheV[1]), truth);
  });
});

describe('source parses', () => {
  // node --check catches syntax errors without executing anything.
  const files = [
    'app.js',
    'qrgen.js',
    'sw.js',
    'js/bcrypt.js',
    'js/modules/crypto.js',
    'js/modules/i18n.js',
    'scripts/check-version.mjs',
    'scripts/seed-fixtures.js',
    'tests/harness.mjs',
    'tests/smoke.test.mjs',
  ];
  for (const f of files) {
    it(`node --check ${f}`, () => {
      execFileSync('node', ['--check', f], { cwd: ROOT, stdio: 'pipe' });
    });
  }
});

describe('seeded fixtures load', () => {
  it('seedDB returns the exact fixture set', () => {
    const app = createAppContext();
    const db = app.run('seedDB()');
    assert.equal(db.schools.length, 24);
    assert.equal(db.students.length, 40);
    assert.equal(db.teachers.length, 12);
    assert.equal(db.feeRecords.length, 70);
    assert.equal(db.exams.length, 5);
    assert.equal(db.marks.length, 8);
    assert.equal(db.homework.length, 4);
    assert.equal(db.notices.length, 3);
    // First two students of 10th-A are Riya & Priya (demo student).
    assert.equal(db.students.find((s) => s.id === 'stu33').name, 'Riya Kumari');
    assert.equal(db.students.find((s) => s.id === 'stu34').name, 'Priya Kumari');
  });

  it('fee ledger sums are exact (8,45,000 collected / 1,20,000 pending)', () => {
    const app = createAppContext();
    const db = app.run('seedDB()');
    const sum = (status) =>
      db.feeRecords.filter((r) => r.status === status).reduce((s, r) => s + r.amount, 0);
    assert.equal(sum('Collected'), 845000);
    assert.equal(sum('Pending'), 120000);
  });

  it('school status and plan tell the same story (v30 invariant)', () => {
    const app = createAppContext();
    const db = app.run('seedDB()');
    for (const s of db.schools) {
      if (s.status === 'active') assert.ok(s.plan === 'Active' || s.plan === 'Trial', s.name);
      if (s.status === 'pending') assert.equal(s.plan, 'Pending', s.name);
      if (s.status === 'expired') assert.equal(s.plan, 'Expired', s.name);
    }
    assert.equal(app.get('SCHOOL_NAMES').length, 24);
    assert.equal(app.get('SEED_CLASSES').length, 10);
  });

  it('fresh device starts EMPTY — no seed on boot (v36)', () => {
    const app = createAppContext();
    assert.equal(app.run('db.students.length'), 0);
    assert.equal(app.run('db.teachers.length'), 0);
    assert.equal(app.run('db.feeRecords.length'), 0);
  });
});

describe('backup export -> wipe -> restore (fixture data only)', () => {
  it('round-trip restores every count', () => {
    const app = createAppContext();
    app.run('db = seedDB(); saveDB(db);');
    app.run('lastFullBackup = buildFullBackup();');
    const backup = app.get('lastFullBackup');
    assert.equal(backup.app, 'school-saathi');
    assert.equal(backup.kind, 'full-backup');
    assert.equal(backup.version, app.get('APP_VERSION'));
    assert.equal(backup.db.students.length, 40);
    assert.equal(backup.school, 'St. Xavier School');
    // Wipe: the local db is now empty, as after Reset All Data.
    app.run('db = emptyDb(); saveDB(db);');
    assert.equal(app.run('db.students.length'), 0);
    // Restore from the exported backup.
    const res = app.run('restoreFullBackup(lastFullBackup)');
    assert.equal(res.ok, true);
    // res.counts is a vm-realm object: compare field by field
    // (deepStrictEqual checks prototypes, which differ across realms).
    assert.equal(res.counts.students, 40);
    assert.equal(res.counts.teachers, 12);
    assert.equal(res.counts.feeRecords, 70);
    assert.equal(res.counts.exams, 5);
    assert.equal(res.counts.marks, 8);
    assert.equal(res.counts.homework, 4);
    assert.equal(res.counts.notices, 3);
    assert.equal(res.counts.receipts, 0);
    assert.equal(app.run('db.students.length'), 40);
    assert.equal(app.run('db.feeRecords.length'), 70);
    // The restored db survives a save + reload cycle.
    assert.equal(app.run('loadDB().students.length'), 40);
  });

  it('validateFullBackup / restoreFullBackup reject bad files', () => {
    const app = createAppContext();
    assert.equal(app.run("validateFullBackup(null)"), 'tBackupBadFile');
    assert.equal(app.run("validateFullBackup({})"), 'tBackupBadFile');
    assert.equal(app.run("validateFullBackup({app:'school-saathi',kind:'full-backup',db:{v:1}})"), 'tBackupBadFile');
    assert.equal(app.run("restoreFullBackup({app:'other'})").ok, false);
    // A rejected restore never touches the live db.
    assert.equal(app.run('db.students.length'), 0);
  });
});
