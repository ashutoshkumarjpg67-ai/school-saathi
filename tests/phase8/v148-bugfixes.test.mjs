// tests/phase8/v148-bugfixes.test.mjs — v148 live-check bug fixes (24 Nov 2026).
//
// The 9 bugs were found on live v147 logged in as Test Sunrise School
// (test@sunrise.test), desktop 1438px; no data was changed during the
// check. Each test pins one fix:
//
//  1. Nav clicks swallowed during the post-login load burst — nav
//     buttons record the press on mousedown (queueNav) and the next
//     renderApp applies it, so a press whose node is replaced
//     mid-click still lands.
//  2. Dashboard flashed 0s on login — a server-linked school with an
//     empty local db shows a loading state until the first cycle
//     settles (sbFirstLoadPending).
//  3. Sidebar flashed ", Bihar" before the city loaded — the city line
//     renders only when prof.city is non-empty.
//  4. Settings showed 21 "Sync conflicts" whose local and server
//     amounts were identical — the push checks identical content
//     BEFORE the last-write-wins timestamp, and the cycle settlement
//     prunes already-recorded false alarms.
//  5. Settings showed the seed email info@stxavierpatna.edu.in for a
//     renamed live school — the pull adopts the account's own login
//     email for a renamed-seed profile (the seed quarantine itself is
//     untouched). The corrected row is kept out of the refreshed
//     snapshot, so the next diff re-queues it and the flush PATCHes
//     the server (QA run 2 caught the first version, which healed
//     locally but never pushed).
//  6. Homepage promised "WhatsApp Alerts" with no such feature — the
//     claim is removed (a real alerts centre is a new build, not part
//     of this fix). Static check only.
//  7. Receipt grammar: "Does not required signature" -> "Does not
//     require a signature".
//  8. Attendance opened on 10th-A, which has no students — first open
//     falls back to the first class that actually has students; a
//     picked class sticks.
//  9. Bottom nav was phone-only (<=760px) — REMOVED in v150 at the
//     user's order (24 Nov 2026): the emoji tabs looked cheap and
//     unprofessional. Navigation is sidebar-only again, as before v147;
//     the tests below now assert the bar is fully gone, no strip left.
//
// The harness's getElementById returns a fresh stub per call, so a
// render's innerHTML writes vanish — and the real renderApp throws on
// the harness's bare stubs (no <select> options; see the
// session-expiry test). appWithDom installs one cached element per id
// with the methods renderApp touches, so rendered output can be read
// back.
//
// Timer hygiene: a server-linked login with an empty local db arms a
// 12s backstop timer (bug 2). Every test that logs in disarms it
// (sbFirstLoadDone) before finishing, or `node --test` waits out the
// timer.
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
const INDEX_SRC = readFileSync(join(ROOT, 'index.html'), 'utf8');
const I18N_SRC = readFileSync(join(ROOT, 'js', 'modules', 'i18n.js'), 'utf8');
const SW_SRC = readFileSync(join(ROOT, 'sw.js'), 'utf8');
const STYLES_SRC = readFileSync(join(ROOT, 'styles.css'), 'utf8');
const VERSION_JSON = JSON.parse(readFileSync(join(ROOT, 'version.json'), 'utf8'));
const PACKAGE_JSON = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

function appWithDom() {
  const app = createAppContext();
  app.run(`
    var __els148 = {};
    function __el148() {
      return { innerHTML: '', textContent: '', value: '', style: {}, dataset: {},
        classList: { add: function(){}, remove: function(){}, toggle: function(){}, contains: function(){ return false; } },
        setAttribute: function(){}, getAttribute: function(){ return null; },
        addEventListener: function(){}, removeEventListener: function(){},
        appendChild: function(){}, remove: function(){}, click: function(){}, focus: function(){},
        querySelector: function(){ return null; }, querySelectorAll: function(){ return []; },
        options: [], selectedIndex: 0 };
    }
    document.getElementById = function (id) { if (!__els148[id]) __els148[id] = __el148(); return __els148[id]; };
    document.querySelector = function () { return null; };
  `);
  return app;
}

const SCHOOL = `{uid:'u1', name:'Test Sunrise School', school:'Test Sunrise School', email:'test@sunrise.test', role:'school', sbUid:'sb-u1'}`;

// Log in as the school; seed the db afterwards when asked (a fresh
// device starts empty, which is exactly the bug-2 state). Disarms the
// first-load timer once seeded data is in place.
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
  it('APP_VERSION, version.json and package.json are all 169', () => {
    const app = createAppContext();
    assert.equal(app.get('APP_VERSION'), 169);
    assert.equal(VERSION_JSON.version, 169);
    assert.equal(PACKAGE_JSON.version, '169.0.0');
  });

  it('sw.js cache is school-saathi-v169 with ?v=153 assets', () => {
    assert.match(SW_SRC, /CACHE_NAME = 'school-saathi-v169'/);
    assert.ok(SW_SRC.includes('app.js?v=169'), 'app.js?v=169 missing from sw.js precache');
  });
});

describe('bug 1 — nav presses are queued, never swallowed', () => {
  it('queueNav records the press and the next renderApp applies it', () => {
    const app = loginSchool(appWithDom(), true);
    assert.equal(app.get('state.view'), 'dashboard');
    app.run(`queueNav('attendance')`);
    assert.equal(app.get('pendingNav'), 'attendance');
    app.run('renderApp()');
    assert.equal(app.get('state.view'), 'attendance');
    assert.equal(app.get('pendingNav'), null);
    disarm(app);
  });

  it('go() clears any queued press, and a forbidden view never queues', () => {
    const app = loginSchool(appWithDom(), true);
    app.run(`queueNav('fees'); go('students')`);
    assert.equal(app.get('state.view'), 'students');
    assert.equal(app.get('pendingNav'), null);
    // 'activityLog' is open to school; a nonsense view is not queued.
    app.run(`queueNav('no-such-view')`);
    assert.equal(app.get('pendingNav'), null);
    disarm(app);
  });

  it('sidebar and dashboard action cards fire queueNav on mousedown (v150: bottom nav is gone)', () => {
    const app = loginSchool(appWithDom(), true);
    const side = app.run(`__els148.sideNav.innerHTML`);
    assert.ok(side.includes(`onmousedown="queueNav('attendance')"`), 'sidebar Attendance lacks queueNav');
    const dash = app.run('schoolDashboard()');
    assert.ok(dash.includes(`onmousedown="queueNav('attendance')"`), 'action card lacks queueNav');
    assert.ok(dash.includes(`onmousedown="queueNav('fees')"`), 'Collect Fee card lacks queueNav');
    disarm(app);
  });
});

describe('bug 2 — dashboard shows loading, never 0s, on first login', () => {
  it('a server-linked login with an empty local db arms the loading flag + backstop timer', () => {
    const app = loginSchool(appWithDom(), false);
    assert.equal(app.get('sbFirstLoadPending'), true);
    assert.notEqual(app.get('sbFirstLoadTimer'), null);
    disarm(app);
  });

  it('while loading, the dashboard shows Loading and no stats; after the first cycle settles, the stats appear', () => {
    const app = loginSchool(appWithDom(), false);
    const loading = app.get('sbFirstLoadPending');
    assert.equal(loading, true);
    const html = app.run('schoolDashboard()');
    assert.ok(html.includes(app.run(`t('loading')`)), 'dashboard must show Loading while the first sync runs');
    assert.ok(!html.includes('class="stats"'), 'dashboard must not render 0 stats while loading');
    // The first cycle settling (any terminal status) clears the flag.
    app.run(`sbSetStatus('synced')`);
    assert.equal(app.get('sbFirstLoadPending'), false);
    assert.equal(app.get('sbFirstLoadTimer'), null);
    const html2 = app.run('schoolDashboard()');
    assert.ok(html2.includes('class="stats"'), 'stats must render once the first cycle settles');
  });

  it('a local-only login (no server link) and a login with data never arm the flag', () => {
    const app = appWithDom();
    app.run(`saveAccounts([{uid:'u2', name:'Local School', school:'Local School', email:'local@school.in', role:'school', sub:'x'}])`);
    app.run(`loginAs({uid:'u2', name:'Local School', school:'Local School', email:'local@school.in', role:'school'})`);
    assert.equal(app.get('sbFirstLoadPending'), false);
    const app2 = loginSchool(appWithDom(), true);
    assert.equal(app2.get('sbFirstLoadPending'), false);
    disarm(app2);
  });
});

describe('bug 3 — no ", Bihar" before the city loads', () => {
  it('sidebar and top crumb show the name alone while the city is empty', () => {
    const app = loginSchool(appWithDom(), false);
    assert.equal(app.run(`__els148.sideSchoolInfo.innerHTML`), '<b style="color:#fff">Test Sunrise School</b>');
    assert.equal(app.run(`__els148.topCrumb.textContent`), 'Test Sunrise School');
    disarm(app);
  });

  it('once the city arrives, sidebar and crumb show "Patna, Bihar" / "name, Patna"', () => {
    const app = loginSchool(appWithDom(), false);
    app.run(`db.profile.city = 'Patna'; saveDB(db); renderApp();`);
    assert.ok(app.run(`__els148.sideSchoolInfo.innerHTML`).includes('Patna, Bihar'));
    assert.equal(app.run(`__els148.topCrumb.textContent`), 'Test Sunrise School, Patna');
    disarm(app);
  });

  it('the dashboard head and profile cards omit the ", " when the city is empty', () => {
    const app = loginSchool(appWithDom(), true);
    app.run(`db.profile = { name: 'Test School', city: '' };`);
    const html = app.run('schoolDashboard()');
    assert.ok(html.includes('<p>Test School</p>'), 'dashboard head must not render "Test School, " with no city');
    app.run(`db.profile.city = 'Patna';`);
    assert.ok(app.run('schoolDashboard()').includes('<p>Test School, Patna</p>'));
    disarm(app);
  });
});

describe('bug 4 — identical content is never a conflict', () => {
  it('sbSyncRowSameAsServer: identical rows match, a different amount does not', () => {
    const app = createAppContext();
    assert.equal(app.run(`sbSyncRowSameAsServer({cls:'6th-A', fee_type:'Tuition', amount:800}, {id:'s1', school_id:'sch-1', cls:'6th-A', fee_type:'Tuition', amount:800, updated_at:'2026-11-24T00:00:00Z'})`), true);
    assert.equal(app.run(`sbSyncRowSameAsServer({cls:'6th-A', fee_type:'Tuition', amount:800}, {id:'s1', school_id:'sch-1', cls:'6th-A', fee_type:'Tuition', amount:900, updated_at:'2026-11-24T00:00:00Z'})`), false);
  });

  it('the prune drops an already-recorded identical conflict and keeps a real one', () => {
    const app = loginSchool(appWithDom(), true);
    app.run(`sbSaveServerSchool('u1', 'sch-1')`);
    // 6th-A Tuition is 800 in the seeded fee structure; the first
    // recorded conflict is byte-identical to the server row, the
    // second differs by amount — exactly the live v147 shape (21
    // false alarms, all identical).
    app.run(`db.syncConflicts = [
      { table: 'ss_fee_structure', key: '6th-A|Tuition', localRow: null, serverRow: { id: 'srv-1', school_id: 'sch-1', cls: '6th-A', fee_type: 'Tuition', amount: 800, updated_at: '2026-11-24T00:00:00Z' }, at: '2026-11-24T00:00:00Z' },
      { table: 'ss_fee_structure', key: '7th-A|Tuition', localRow: null, serverRow: { id: 'srv-2', school_id: 'sch-1', cls: '7th-A', fee_type: 'Tuition', amount: 9999, updated_at: '2026-11-24T00:00:00Z' }, at: '2026-11-24T00:00:00Z' }
    ]; saveDB(db);`);
    app.run(`sbSyncPruneIdenticalConflicts({uid:'u1'}, 'u1')`);
    const kept = app.run('db.syncConflicts');
    assert.equal(kept.length, 1);
    assert.equal(kept[0].key, '7th-A|Tuition');
    disarm(app);
  });

  it('the prune is fail-closed: a conflict with no local row, or a thin server row, stays', () => {
    const app = loginSchool(appWithDom(), true);
    app.run(`sbSaveServerSchool('u1', 'sch-1')`);
    app.run(`db.syncConflicts = [
      { table: 'ss_fee_structure', key: 'NoClass|Tuition', localRow: null, serverRow: { id: 'srv-9', school_id: 'sch-1', cls: 'NoClass', fee_type: 'Tuition', amount: 100, updated_at: '2026-11-24T00:00:00Z' }, at: '2026-11-24T00:00:00Z' },
      { table: 'ss_fee_structure', key: '6th-A|Tuition', localRow: null, serverRow: { id: 'srv-1', updated_at: '2026-11-24T00:00:00Z' }, at: '2026-11-24T00:00:00Z' }
    ]; saveDB(db);`);
    app.run(`sbSyncPruneIdenticalConflicts({uid:'u1'}, 'u1')`);
    assert.equal(app.run('db.syncConflicts').length, 2);
    disarm(app);
  });

  it('the push checks identical content before the last-write-wins timestamp (source order)', () => {
    // The reorder lives in sbSyncPushEntry (ss_schools branch and the
    // generic branch): the sbSyncRowSameAsServer call must come before
    // the `new Date(row.updated_at) > new Date(entry.at)` conflict
    // return WITHIN each branch, or a server row touched after the
    // entry was queued still flags an identical row as a conflict.
    const pushFn = APP_SRC.slice(APP_SRC.indexOf('function sbSyncPushEntry'));
    const LWW = 'new Date(row.updated_at) > new Date(entry.at)';
    const schStart = pushFn.indexOf("table === 'ss_schools'");
    assert.ok(schStart !== -1, 'ss_schools branch not found');
    assert.ok(pushFn.indexOf('sbSyncRowSameAsServer(payload, schRow)', schStart) < pushFn.indexOf(LWW, schStart), 'ss_schools branch must check identical content before the timestamp');
    const genStart = pushFn.indexOf('var findP53');
    assert.ok(genStart !== -1, 'generic branch not found');
    assert.ok(pushFn.indexOf('sbSyncRowSameAsServer(payload2, batchRow53)', genStart) < pushFn.indexOf(LWW, genStart), 'generic branch must check identical content before the timestamp');
    assert.ok(APP_SRC.includes('function sbSyncFullRow148'), 'full-row fallback sbSyncFullRow148 missing');
    assert.ok(APP_SRC.includes('sbSyncPruneIdenticalConflicts'), 'prune helper missing');
  });
});

describe('bug 5 — renamed seed email self-heals to the login email', () => {
  const RENAMED = `{ name: 'Test Sunrise School', principal: 'Rahul Kumar', phone: '+91 98350 12345', email: 'info@stxavierpatna.edu.in' }`;
  it('sbIsRenamedSeedProfile matches the renamed seed only', () => {
    const app = createAppContext();
    assert.equal(app.run(`sbIsRenamedSeedProfile(${RENAMED})`), true);
    assert.equal(app.run(`sbIsRenamedSeedProfile({ name: 'St. Xavier School', principal: 'Rahul Kumar', phone: '+91 98350 12345', email: 'info@stxavierpatna.edu.in' })`), false);
    assert.equal(app.run(`sbIsRenamedSeedProfile({ name: 'Test Sunrise School', principal: 'Rahul Kumar', phone: '+91 98350 12345', email: 'office@sunrise.test' })`), false);
    assert.equal(app.run(`sbIsRenamedSeedProfile({ name: 'Test Sunrise School', principal: 'Someone Else', phone: '+91 98350 12345', email: 'info@stxavierpatna.edu.in' })`), false);
    assert.equal(app.run(`sbIsRenamedSeedProfile(null)`), false);
  });

  it('the seed quarantine itself is untouched', () => {
    const app = createAppContext();
    assert.equal(app.run(`sbIsSeedProfileParts({ name: 'St. Xavier School', city: 'Patna', principal: 'Rahul Kumar', phone: '+91 98350 12345', email: 'info@stxavierpatna.edu.in' })`), true);
    assert.equal(app.run(`sbIsSeedProfileParts(${RENAMED})`), false);
  });

  it('the corrected email is kept out of the snapshot so it pushes to the server', () => {
    const app = createAppContext();
    // sbApplyServerRows with a renamed-seed server row: the pull
    // adopts the login email AND marks the school row kept, so the
    // snapshot refresh does not swallow the correction (QA run 2:
    // the local email healed but the server row never did).
    const kept = app.run(`(function () {
      var a = sbApplyServerRows(db, { name: 'Test Sunrise School', city: 'Patna', principal: 'Rahul Kumar', phone: '+91 98350 12345', email: 'info@stxavierpatna.edu.in', session: '2025–26', address: '', adm_counter: 1, receipt_counter: 1, admission_fee: 0, caution_money: 0, annual_charges: 0, transport_fee: 0 }, { ss_fee_structure: [], ss_students: [], ss_teachers: [], ss_staff: [], ss_classes: [], ss_exams: [], ss_fee_records: [], ss_attendance: [], ss_receipts: [], ss_marks: [], ss_homework: [], ss_notices: [], ss_holidays: [], ss_admission_requests: [] }, { uid: 'u-pull-1', email: 'pull@school.in', sbUid: 'sb-uid-pull@school.in' }, 'srv-school-31');
      return !!(a && a.kept && a.kept.ss_schools && a.kept.ss_schools.school);
    })()`);
    assert.equal(kept, true);
    assert.equal(app.get('db.profile.email'), 'pull@school.in');
  });
});

describe('bug 6 — homepage no longer promises WhatsApp Alerts', () => {
  it('no "WhatsApp Alerts" claim in index.html or i18n', () => {
    assert.ok(!INDEX_SRC.includes('WhatsApp Alerts'), 'index.html still promises WhatsApp Alerts');
    assert.ok(!I18N_SRC.includes('featWhatsApp'), 'i18n still carries the featWhatsApp key');
    assert.ok(!APP_SRC.includes('featWhatsApp'), 'app.js still references featWhatsApp');
  });
});

describe('bug 7 — receipt grammar', () => {
  it('the receipt reads "Does not require a signature."', () => {
    const app = createAppContext();
    assert.equal(app.run(`t('rcptComputerGen')`), 'This is a computer generated Receipt. Does not require a signature.');
    assert.ok(!I18N_SRC.includes('Does not required signature'), 'old grammar still in i18n.js');
  });
});

describe('bug 8 — attendance defaults to the first class with students', () => {
  it('first open on an empty 10th-A falls back to 6th-A', () => {
    const app = loginSchool(appWithDom(), true);
    app.run(`db.students = db.students.filter(function (s) { return s.cls !== '10th-A'; }); saveDB(db);`);
    assert.equal(app.get('state.attCls'), '10th-A');
    assert.equal(app.get('attClsPicked148'), false);
    app.run('attendancePage()');
    assert.equal(app.get('state.attCls'), '6th-A');
    disarm(app);
  });

  it('a picked class sticks — even an empty one is never yanked away', () => {
    const app = loginSchool(appWithDom(), true);
    app.run(`db.students = db.students.filter(function (s) { return s.cls !== '10th-A'; }); saveDB(db);`);
    app.run(`onAttCls148('10th-A')`);
    assert.equal(app.get('attClsPicked148'), true);
    assert.equal(app.get('state.attCls'), '10th-A');
    app.run('attendancePage()');
    assert.equal(app.get('state.attCls'), '10th-A');
    disarm(app);
  });

  it('when the default class has students, nothing changes', () => {
    const app = loginSchool(appWithDom(), true);
    app.run('attendancePage()');
    assert.equal(app.get('state.attCls'), '10th-A');
    disarm(app);
  });
});

describe('bug 9 — bottom nav (v150: REMOVED entirely at the user order)', () => {
  it('no bottom-nav element is rendered, and renderApp never touches it', () => {
    const app = loginSchool(appWithDom(), true);
    // The fake DOM only creates an element when code asks for it — a
    // renderApp that still built the bar would create bottomNav here.
    assert.equal(app.run(`typeof __els148.bottomNav === 'undefined'`), true);
    assert.ok(!APP_SRC.includes("$('bottomNav')"), 'app.js still references bottomNav');
    disarm(app);
  });

  it('no bottom-nav markup, CSS, or More key survives anywhere', () => {
    assert.ok(!INDEX_SRC.includes('bottomNav'), 'index.html still has the bottom-nav element');
    assert.ok(!INDEX_SRC.includes('bottom-nav'), 'index.html still mentions bottom-nav');
    assert.ok(!STYLES_SRC.includes('.bottom-nav'), 'styles.css still has .bottom-nav rules');
    assert.ok(!STYLES_SRC.includes('bottom:calc(88px'), 'styles.css still lifts the toast above a bottom nav');
    assert.ok(!STYLES_SRC.includes('padding-bottom:calc(96px'), 'styles.css still reserves page room for the bottom nav');
    assert.ok(!I18N_SRC.includes('moreNav'), 'i18n.js still has the More key');
  });
});
