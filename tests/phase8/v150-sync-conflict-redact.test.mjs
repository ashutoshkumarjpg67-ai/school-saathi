// tests/phase8/v150-sync-conflict-redact.test.mjs — v150 security fix (24 Nov 2026).
//
// Issue #1 (blocking): Settings > Sync conflicts printed a teacher's
// PASSWORD HASH in the open. sbSyncConflictRowHtml rendered every
// non-hidden field, and a teacher/staff row carries pw_hash (the salted
// login hash rides the server row — sbMapTeacher / sbMapStaff) while a
// student row carries parent_pin (the parent-PIN hash — sbMapStudent).
//
// Fix: credential-named fields render as ••••••, never their value
// (sbSyncConflictIsSecret + SB_CONFLICT_SECRET_KEYS). Non-secret fields
// still render, so the conflict stays readable and resolvable.
//
// Second fix in this release: the "Last flush" line read the stored
// lastFlush diag, a flush-time snapshot, so a conflict recorded after
// the last flush left the line stale on load ("conflicts 0" under a
// "Sync conflicts (5)" heading). The line now re-reads the live
// recorded total on every render (sbSyncRecordedConflictCount).
//
// Timer hygiene: same as the v148/v149 files — every test that logs in
// disarms the first-load backstop timer before finishing.
//
// Run: npm test   (node --test, Node built-ins only)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAppContext } from '../harness.mjs';

function appWithDom() {
  const app = createAppContext();
  app.run(`
    var __els150 = {};
    function __el150() {
      return { innerHTML: '', textContent: '', value: '', style: {}, dataset: {},
        classList: { add: function(){}, remove: function(){}, toggle: function(){}, contains: function(){ return false; } },
        setAttribute: function(){}, getAttribute: function(){ return null; },
        addEventListener: function(){}, removeEventListener: function(){},
        appendChild: function(){}, remove: function(){}, click: function(){}, focus: function(){},
        querySelector: function(){ return null; }, querySelectorAll: function(){ return []; },
        options: [], selectedIndex: 0 };
    }
    document.getElementById = function (id) { if (!__els150[id]) __els150[id] = __el150(); return __els150[id]; };
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

// Fake hashes, longer than the old 80-char slice — the pre-fix renderer
// printed the first 80 chars, so asserting that prefix is absent proves
// the value never reaches the output, not just that it was truncated.
const S256_HASH = 's256$9f2c41ab77d0e5b83c1a4f6d29e0b7c5a8192d3e6f4a0b5c8d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2';
const BCRYPT_HASH = 'bcrypt$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
const PIN_HASH = 's256$51ab2cd3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3';

describe('v150 — sync-conflict view never renders a password hash, PIN or token', () => {
  it('teacher row: pw_hash (s256$ and bcrypt$) is masked, other fields still render', () => {
    const app = createAppContext();
    const out = app.run(`sbSyncConflictRowHtml({ name: 'Test Teacher', subject: 'Maths', cls: '10th-A', email: 't@test.in', pw_hash: '${S256_HASH}' })`);
    assert.ok(!out.includes(S256_HASH.slice(0, 80)), 's256$ hash prefix must not appear, got: ' + out);
    assert.ok(!out.includes(S256_HASH), 'full s256$ hash must not appear');
    assert.ok(out.includes('••••••'), 'masked value must be shown');
    assert.ok(out.includes('Test Teacher') && out.includes('Maths'), 'non-secret fields must still render');
    const out2 = app.run(`sbSyncConflictRowHtml({ name: 'Old Teacher', pw_hash: '${BCRYPT_HASH}' })`);
    assert.ok(!out2.includes(BCRYPT_HASH.slice(0, 80)), 'bcrypt$ hash prefix must not appear');
    assert.ok(out2.includes('••••••'), 'bcrypt$ hash must be masked');
  });

  it('student row: parent_pin and parentPinHash are masked', () => {
    const app = createAppContext();
    const out = app.run(`sbSyncConflictRowHtml({ name: 'Test Kumar', cls: '6th-A', admission_no: 'ADM-2025-001', parent_pin: '${PIN_HASH}' })`);
    assert.ok(!out.includes(PIN_HASH.slice(0, 80)), 'parent_pin hash prefix must not appear, got: ' + out);
    assert.ok(out.includes('••••••'), 'parent_pin must be masked');
    assert.ok(out.includes('Test Kumar') && out.includes('ADM-2025-001'), 'non-secret fields must still render');
    const out2 = app.run(`sbSyncConflictRowHtml({ name: 'Test Kumar', parentPinHash: '${PIN_HASH}' })`);
    assert.ok(!out2.includes(PIN_HASH.slice(0, 80)), 'local parentPinHash field must redact too');
  });

  it('tokens and secrets redact; ordinary fields do not', () => {
    const app = createAppContext();
    const out = app.run(`sbSyncConflictRowHtml({ name: 'X', access_token: 'tok-secret-1234567890abcdef', refresh_token: 'ref-secret-0987654321fedcba', secret: 'shh-do-not-show', email: 'x@test.in', phone: '9876543210' })`);
    assert.ok(!out.includes('tok-secret-1234567890abcdef'), 'access_token must not appear');
    assert.ok(!out.includes('ref-secret-0987654321fedcba'), 'refresh_token must not appear');
    assert.ok(!out.includes('shh-do-not-show'), 'secret must not appear');
    assert.ok(out.includes('x@test.in') && out.includes('9876543210'), 'ordinary fields must still render');
    assert.equal(app.run(`sbSyncConflictIsSecret('pw_hash')`), true);
    assert.equal(app.run(`sbSyncConflictIsSecret('parentPinHash')`), true);
    assert.equal(app.run(`sbSyncConflictIsSecret('access_token')`), true);
    assert.equal(app.run(`sbSyncConflictIsSecret('name')`), false);
    assert.equal(app.run(`sbSyncConflictIsSecret('email')`), false);
    assert.equal(app.run(`sbSyncConflictIsSecret('admission_no')`), false);
  });

  it('sbSyncConflictsHtml: a teacher conflict shows no hash on either side', () => {
    const app = loginSchool(appWithDom(), true);
    app.run(`db.syncConflicts = [{ table: 'ss_teachers', key: 't1', localRow: { name: 'Test Teacher', subject: 'Maths', pw_hash: '${S256_HASH}' }, serverRow: { name: 'Test Teacher', subject: 'Physics', pw_hash: '${BCRYPT_HASH}' }, at: '2026-11-24T00:00:00Z' }]; saveDB(db);`);
    const out = app.run('sbSyncConflictsHtml()');
    assert.ok(!out.includes(S256_HASH.slice(0, 80)), 'local s256$ hash must not appear in the conflicts list');
    assert.ok(!out.includes(BCRYPT_HASH.slice(0, 80)), 'server bcrypt$ hash must not appear in the conflicts list');
    assert.ok(out.includes('••••••'), 'masked password field must be shown');
    assert.ok(out.includes('Maths') && out.includes('Physics'), 'the real difference must still be visible');
    disarm(app);
  });
});

describe('v150 — Last-flush line re-reads the live conflict total on load', () => {
  it('a stale stored diag (conflicts 0) does not leak into the rendered line', () => {
    const app = loginSchool(appWithDom(), true);
    app.run(`db.syncConflicts = [{ table: 'ss_marks', key: 'a' }, { table: 'ss_marks', key: 'b' }, { table: 'ss_fee_records', key: 'c' }, { table: 'ss_teachers', key: 'd' }, { table: 'ss_homework', key: 'e' }]; saveDB(db);`);
    // What an older flush stored before these conflicts were recorded.
    app.run(`sbSyncDiagSet({ lastFlush: { at: '2026-11-24T10:00:00.000Z', ms: 1200, pushed: 0, conflicts: 0, leftover: 0, calls: 3 } });`);
    const details = app.run('sbSyncDetailsHtml()');
    assert.ok(details.includes('conflicts 5'), 'Last-flush line must show the live recorded total 5, not the stale stored 0, got: ' + details.slice(0, 400));
    const list = app.run('sbSyncConflictsHtml()');
    assert.ok(list.includes('(5)'), 'conflicts heading must show (5)');
    disarm(app);
  });

  it('the details renderer reads the live count (source pin)', () => {
    // Source-level pin, mirroring the v149 flush pin: the render must
    // not trust the stored lastFlush.conflicts value.
    const app = createAppContext();
    const src = app.run('sbSyncDetailsHtml.toString()');
    assert.ok(src.includes('sbSyncRecordedConflictCount()'), 'details HTML must re-read the live recorded conflict total');
    assert.ok(!src.includes('lf.conflicts'), 'details HTML must not use the stored lastFlush.conflicts value');
  });
});
