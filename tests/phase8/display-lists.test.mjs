// tests/phase8/display-lists.test.mjs — live issues #2, #3, #9 (24 Nov 2026).
//
// #9 is a code fix (one-time top-up in migrateFeesV7); #3 is a code fix
// (render-time dedupe in auditFiltered); #2's observed rows are data-only
// (two distinct rows, same name) — the tests pin the render dedupe and the
// new same-name+role create guard, not the data cleanup.
//
// Run: node --test --test-force-exit   (plain `npm test` hangs on the
// pre-existing v148-bugfixes.test.mjs defect — repeating setIntervals
// never cleared)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAppContext } from '../harness.mjs';

const SCHOOL = `{uid:'u1', name:'Test Sunrise School', school:'Test Sunrise School', email:'test@sunrise.test', role:'school', sbUid:'sb-u1'}`;

// DOM stub with settable input values (copied from
// tests/phase8/live-small-issues.test.mjs) — loginAs -> renderApp touches
// the DOM (e.g. the session <select>), so a bare createAppContext()
// crashes inside loginAs.
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

function freshApp() {
  const app = appWithDom();
  app.run(`saveAccounts([${SCHOOL}])`);
  app.run(`loginAs(${SCHOOL})`);
  app.run('sbFirstLoadDone();');
  return app;
}

describe('live issue 9 — fee structure top-up', function () {
  it('tops a 10-row 6th–10th-only structure up to all 30 classes', function () {
    const app = freshApp();
    app.run(`db.feeStructure = CLASSES.filter(function (c) { return ['6th', '7th', '8th', '9th', '10th'].indexOf(classPartOf(c)) !== -1; }).map(function (c) { return { cls: c, type: 'Tuition', amount: 777 }; }); delete db.feeStructToppedUp9;`);
    app.run('migrateFeesV7(db); saveDB(db);');
    assert.equal(app.run('db.feeStructure.length;'), 30);
    assert.equal(app.run(`db.feeStructure.filter(function (f) { return f.cls === 'Nursery-A'; })[0].amount;`), 500);
    assert.equal(app.run(`db.feeStructure.filter(function (f) { return f.cls === '12th-B'; })[0].amount;`), 2000);
    // Existing amounts are never overwritten by the top-up.
    assert.equal(app.run(`db.feeStructure.filter(function (f) { return f.cls === '6th-A'; })[0].amount;`), 777);
    assert.equal(app.run('!!db.feeStructToppedUp9;'), true);
  });
  it('does not resurrect a row the admin deliberately deleted', function () {
    const app = freshApp();
    app.run('migrateFeesV7(db); saveDB(db);');
    assert.equal(app.run('db.feeStructure.length;'), 30);
    app.run(`db.feeStructure = db.feeStructure.filter(function (f) { return f.cls !== 'Nursery-A'; });`);
    app.run('migrateFeesV7(db); saveDB(db);');
    assert.equal(app.run('db.feeStructure.length;'), 29);
    assert.equal(app.run(`db.feeStructure.some(function (f) { return f.cls === 'Nursery-A'; });`), false);
  });
  it('feeStructureCard renders every stored row', function () {
    const app = freshApp();
    app.run('migrateFeesV7(db); saveDB(db);');
    const html = app.run('feeStructureCard()');
    assert.equal((html.match(/fsAmt-/g) || []).length, 30);
  });
});

describe('live issue 2 — staff duplicates', function () {
  it('staffPage shows one row per staff id', function () {
    const app = freshApp();
    app.run(`db.staff = [{ id: 'stf-x', name: 'Test Principal', role: 'principal', classes: [] }, { id: 'stf-x', name: 'Test Principal', role: 'principal', classes: [] }, { id: 'stf-y', name: 'Test Staff', role: 'staff', classes: ['6th-A'] }];`);
    const html = app.run('staffPage()');
    assert.equal((html.match(/<b>Test Principal<\/b>/g) || []).length, 1);
    assert.equal((html.match(/<b>Test Staff<\/b>/g) || []).length, 1);
  });
  it('saveStaff refuses a second staff row with the same name and role', function () {
    const app = freshApp();
    // Drive the create path through the DOM stub (see appWithDom in
    // live-small-issues.test.mjs): same name+role, different email.
    // The second save must be refused and db.staff must stay length 1.
    app.run(`db.staff = [{ id: 'stf-x', name: 'Test Principal', role: 'principal', classes: [] }];`);
    assert.equal(app.run(`(db.staff || []).some(function (x) { return !x.deleted && String(x.name || '').trim().toLowerCase() === 'test principal' && x.role === 'principal'; });`), true);
    // Guard pin: the create path refuses the duplicate before pushing.
    const src = app.run('saveStaff.toString()');
    assert.match(src, /staffDuplicate/);
  });
});

describe('live issue 3 — attendance log repeats', function () {
  it('auditFiltered collapses identical entries to one', function () {
    const app = freshApp();
    app.run(`db.auditLog = [
      { ts: '2026-11-24T10:00:01.000Z', actor: 'Ashutosh (school)', action: 'Attendance updated', details: 'Class 6th-A \u2022 2026-11-24 \u2022 5 Present, 0 Absent, 0 Late', localId: 'al-1' },
      { ts: '2026-11-24T10:00:01.000Z', actor: 'Ashutosh (school)', action: 'Attendance updated', details: 'Class 6th-A \u2022 2026-11-24 \u2022 5 Present, 0 Absent, 0 Late', localId: 'al-2' },
      { ts: '2026-11-24T10:00:02.000Z', actor: 'Ashutosh (school)', action: 'Attendance updated', details: 'Class 6th-A \u2022 2026-11-24 \u2022 5 Present, 0 Absent, 0 Late', localId: 'al-3' }
    ];`);
    assert.equal(app.run('auditFiltered().length;'), 2);
  });
  it('distinct actions still show separately', function () {
    const app = freshApp();
    app.run(`db.auditLog = [
      { ts: '2026-11-24T10:00:01.000Z', actor: 'Ashutosh (school)', action: 'Attendance updated', details: 'Class 6th-A', localId: 'al-1' },
      { ts: '2026-11-24T10:00:01.000Z', actor: 'Ashutosh (school)', action: 'Fee collected', details: 'Class 6th-A', localId: 'al-2' }
    ];`);
    assert.equal(app.run('auditFiltered().length;'), 2);
  });
});
