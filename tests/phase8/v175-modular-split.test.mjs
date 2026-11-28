import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createAppContext } from '../harness.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const MODULES = [
  'js/modules/fees-ui.js',
  'js/modules/students-ops.js',
  'js/modules/academics-ui.js',
  'js/modules/people-ui.js',
];

test('v175: app.js is modularized below 650 KB and all 4 extracted modules exist and parse cleanly', () => {
  const appSize = fs.statSync(path.join(ROOT, 'app.js')).size;
  assert.ok(appSize < 650 * 1024, `expected app.js < 650 KB after split, got ${Math.round(appSize / 1024)} KB`);
  for (const rel of MODULES) {
    const fp = path.join(ROOT, rel);
    assert.ok(fs.existsSync(fp), `missing module: ${rel}`);
    assert.ok(fs.statSync(fp).size > 10 * 1024, `module unexpectedly small: ${rel}`);
    execFileSync(process.execPath, ['--check', fp]);
  }
});

test('v175: index.html and sw.js load and precache all 4 extracted modules', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  for (const rel of MODULES) {
    assert.ok(html.includes(rel + '?v='), `index.html missing ${rel}`);
    assert.ok(sw.includes(rel + '?v='), `sw.js missing ${rel}`);
  }
});

test('v175: functions from all 4 extracted modules are available in app runtime context', () => {
  const app = createAppContext();
  const fns = [
    'collectFeePage', 'numberToWords',
    'attendancePage', 'promotionPage', 'studentProfilePage',
    'examsPage', 'homeworkPage', 'timetablePage', 'reportsPage',
    'teachersPage', 'staffPage', 'classesPage', 'admissionRequestsPage',
  ];
  for (const fn of fns) {
    assert.equal(app.run(`typeof ${fn}`), 'function', `expected ${fn} to be a function`);
  }
});
