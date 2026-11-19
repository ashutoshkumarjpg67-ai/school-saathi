// tests/phase8/v135-audit-fixes.test.mjs — v135 audit fixes.
//
//  1. Free-text values (class/subject names) no longer break or inject
//     into inline JS handlers: jsAttr() emits an attribute-safe JS string
//     literal, and classesPage/teacherForm/staffForm use it. An
//     apostrophe class name ("St. Mary's") used to produce
//     onclick="classForm('St. Mary's')" — a SyntaxError.
//  2. Audit-log / activities dedupe keys carry a stable localId, so two
//     distinct same-second entries no longer collapse; legacy entries
//     (no localId) still match their pre-v135 server rows (empty suffix
//     both sides), so nothing re-uploads.
//  3. The Super Admin link check is server-side (ss_is_super_admin RPC)
//     and fails CLOSED; the personal email is gone from app.js.
//  4. Static: SQL 45-48 contents (local_id columns, listable-school
//     guard, IST receipt year, attendance future-date guard).
//
// Run: node --test tests/phase8/*.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppContext } from '../harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = readFileSync(join(ROOT, 'app.js'), 'utf8');

// --- helpers -------------------------------------------------------------
function decodeHtml(s) {
  return s.replace(/&(amp|lt|gt|quot|#39);/g, (m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[e]));
}
// Every inline handler in the HTML, HTML-decoded, as runnable JS bodies.
function handlersOf(html) {
  return [...html.matchAll(/on(?:click|change|submit)="([^"]*)"/g)].map((m) => decodeHtml(m[1]));
}
// Evaluate a handler body with named stubs; returns {fn, args} of the first call.
function evalHandler(body, stubs) {
  const calls = [];
  const names = Object.keys(stubs);
  const fns = names.map((n) => (...args) => { calls.push({ fn: n, args }); return stubs[n] === 'chain' ? false : undefined; });
  // eslint-disable-next-line no-new-func
  new Function(...names, 'event', body).call({ checked: true }, ...fns, { preventDefault() {} });
  return calls;
}

const NASTY = 'St. Mary\'s "Jr" <A&B> \\';

describe('jsAttr: a value inside an inline handler survives as an exact JS string', () => {
  it('round-trips apostrophes, quotes, angle brackets, ampersands, backslashes', () => {
    const app = createAppContext();
    for (const v of [NASTY, "plain", "O'Neil", '5%', 'a"b', "x'y", 'C < D', 'A & B', 'back \\ slash', "it's \"quoted\" \\end"]) {
      const attr = app.run(`jsAttr(${JSON.stringify(v)})`);
      assert.ok(!attr.includes("'") || attr.includes('&#39;'), `raw apostrophe leaked: ${attr}`);
      // Simulate the browser: HTML-decode the attribute, run the handler.
      const [call] = evalHandler(`capture(${decodeHtml(attr)})`, { capture: 'chain' });
      assert.equal(call.args[0], v, `value mangled: ${JSON.stringify(v)}`);
    }
  });
});

describe('pages render working handlers for apostrophe class/subject names', () => {
  function appWithNastyClass() {
    const app = createAppContext();
    app.run(`
      state.role = 'school';
      state.user = { uid: 'u1', name: 'Principal Test', role: 'school' };
      db.classes = [{ cls: ${JSON.stringify(NASTY)}, subjects: ["Teacher's Pet"] }];
      openModal = function (html) { globalThis.__lastModal = html; return null; };
    `);
    return app;
  }

  it('classesPage edit/delete handlers receive the exact class name', () => {
    const app = appWithNastyClass();
    const html = app.run('classesPage()');
    const calls = [];
    for (const h of handlersOf(html)) {
      calls.push(...evalHandler(h, { classForm: 'chain', deleteClass: 'chain', closeModal: 'chain' }));
    }
    // The "+ Add" button calls classForm() with no args — only the row
    // handlers carry the class name.
    const clsCalls = calls.filter((c) => (c.fn === 'classForm' || c.fn === 'deleteClass') && c.args.length);
    assert.ok(clsCalls.length >= 2, 'expected classForm + deleteClass row handlers');
    for (const c of clsCalls) assert.equal(c.args[0], NASTY);
  });

  it('teacherForm class checkboxes toggle the exact class name and escape labels', () => {
    const app = appWithNastyClass();
    app.run('teacherForm()');
    const html = app.run('globalThis.__lastModal');
    assert.ok(!html.includes(`> ${NASTY}<`), 'raw unescaped class name in label');
    const calls = [];
    for (const h of handlersOf(html)) {
      if (!h.includes('toggleTchrClass')) continue;
      calls.push(...evalHandler(h, { toggleTchrClass: 'chain' }));
    }
    assert.equal(calls.length, 1);
    assert.equal(calls[0].args[0], NASTY);
  });

  it('staffForm class checkboxes toggle the exact class name and escape labels', () => {
    const app = appWithNastyClass();
    app.run('staffForm()');
    const html = app.run('globalThis.__lastModal');
    assert.ok(!html.includes(`> ${NASTY}<`), 'raw unescaped class name in label');
    const calls = [];
    for (const h of handlersOf(html)) {
      if (!h.includes('toggleStaffClass')) continue;
      calls.push(...evalHandler(h, { toggleStaffClass: 'chain' }));
    }
    assert.equal(calls.length, 1);
    assert.equal(calls[0].args[0], NASTY);
  });

  it('the teacher dashboard class tile uses jsAttr (source pattern)', () => {
    assert.match(APP, /onclick="openTeacherClass\(' \+ jsAttr\(c\) \+\ '\)"/);
  });
});

describe('audit/activity dedupe keys (SQL 45 + key helpers)', () => {
  it('two distinct same-second audit entries no longer collapse', () => {
    const app = createAppContext();
    app.run(`state.user = null; db.auditLog = []; logAudit('Fee collected', 'Rs 500'); logAudit('Fee collected', 'Rs 500');`);
    const [a, b] = app.run('db.auditLog');
    assert.ok(a.localId && b.localId, 'logAudit must mint localId');
    assert.notEqual(a.localId, b.localId);
    assert.notEqual(app.run(`sbAuditKey(db.auditLog[0])`), app.run(`sbAuditKey(db.auditLog[1])`));
  });

  it('localId is minted once and stable across key evaluations', () => {
    const app = createAppContext();
    app.run(`state.user = null; db.auditLog = []; logAudit('Login', '');`);
    const e = app.run('db.auditLog[0]');
    assert.equal(app.run('sbAuditKey(db.auditLog[0])'), app.run('sbAuditKey(db.auditLog[0])'));
    // Same entry content re-evaluated after a snapshot round-trip keeps its id:
    app.run(`saveDB(db);`);
    assert.equal(app.run('sbAuditKey(db.auditLog[0])'), app.run(`sbAuditKey([${JSON.stringify(e)}][0])`).replace('undefined',''));
  });

  it('legacy entries (no localId) match their pre-v135 server rows (empty suffix both sides)', () => {
    const app = createAppContext();
    const legacyLocal = { ts: '2026-11-19T10:20:30.000Z', actor: 'a', action: 'x', details: 'd' };
    const serverRow = { ts: '2026-11-19T10:20:30+00:00', actor: 'a', action: 'x', details: 'd', local_id: null };
    app.run(`globalThis.__l = ${JSON.stringify(legacyLocal)}; globalThis.__s = ${JSON.stringify(serverRow)};`);
    assert.equal(app.run('sbAuditKey(__l)'), app.run('sbAuditKey(__s)'));
  });

  it('activity keys behave the same way', () => {
    const app = createAppContext();
    app.run(`db.activities = []; addActivity('i', 'b', 'Fee', 'Rs 500'); addActivity('i', 'b', 'Fee', 'Rs 500');`);
    assert.notEqual(app.run('sbActivityKey(db.activities[0])'), app.run('sbActivityKey(db.activities[1])'));
    app.run(`globalThis.__l = { title: 'Fee', sub: 'x' }; globalThis.__s = { title: 'Fee', sub: 'x', local_id: null };`);
    assert.equal(app.run('sbActivityKey(__l)'), app.run('sbActivityKey(__s)'));
  });

  it('mapped rows carry local_id with a uniform key set (PGRST102 guard)', () => {
    const app = createAppContext();
    const k1 = app.run(`JSON.stringify(Object.keys(sbMapAudit({ ts: '2026-01-01T00:00:00.000Z', actor: 'a', action: 'x', details: '', localId: 'al1' }, 'sch')).sort())`);
    const k2 = app.run(`JSON.stringify(Object.keys(sbMapAudit({ actor: 'a', action: 'x' }, 'sch')).sort())`);
    assert.equal(k1, k2);
    const a1 = app.run(`Object.keys(sbMapActivity({ title: 't' }, 'sch')).sort().join(',')`);
    assert.ok(a1.includes('local_id'));
  });
});

describe('Super Admin link check is server-side and fails closed', () => {
  it('no personal email remains hard-coded in app.js', () => {
    assert.ok(!APP.includes('ashutoshkumarjpg67'), 'hard-coded personal email found in app.js');
  });

  it('verdict: true -> admin, false -> ok, error/non-boolean -> unknown (link held)', async () => {
    const app = createAppContext();
    app.run(`sbRest = function () { return Promise.resolve({ ok: true, data: true }); };`);
    assert.equal(await app.run(`sbLinkTargetVerdict('tok')`), 'admin');
    app.run(`sbRest = function () { return Promise.resolve({ ok: true, data: false }); };`);
    assert.equal(await app.run(`sbLinkTargetVerdict('tok')`), 'ok');
    app.run(`sbRest = function () { return Promise.reject(new Error('offline')); };`);
    assert.equal(await app.run(`sbLinkTargetVerdict('tok')`), 'unknown');
    app.run(`sbRest = function () { return Promise.resolve({ ok: false, status: 500 }); };`);
    assert.equal(await app.run(`sbLinkTargetVerdict('tok')`), 'unknown');
  });

  it('the link flow maps every verdict: admin refuses, unknown holds with an error', () => {
    assert.match(APP, /if \(v === 'admin'\) return \{ done: false, reason: 'super-admin' \};/);
    assert.match(APP, /if \(v === 'unknown'\) \{ sbSetStatus\('not-linked', 'check-failed'\); return \{ done: false, reason: 'check-failed' \}; \}/);
    assert.match(APP, /else if \(r\.reason === 'check-failed'\) toast\(t\('sbLinkFailed'\)\);/);
  });
});

describe('SQL 45-48 (static)', () => {
  const sql = (f) => readFileSync(join(ROOT, 'supabase', f), 'utf8');
  const all = readdirSync(join(ROOT, 'supabase')).filter((f) => f.endsWith('.sql')).map((f) => sql(f)).join('\n');

  it('45 adds nullable local_id to both append-only tables, no backfill', () => {
    const s = sql('45_audit_activity_local_id.sql');
    assert.match(s, /alter table public\.ss_audit_log add column if not exists local_id text;/);
    assert.match(s, /alter table public\.ss_activities add column if not exists local_id text;/);
    assert.ok(!/update public\.ss_audit_log|update public\.ss_activities/i.test(s), 'no backfill updates allowed');
  });

  it('46 excludes blank-name schools from the public list and the anon insert policy', () => {
    const s = sql('46_public_school_list_guard.sql');
    assert.match(s, /create or replace function public\.ss_is_listable_school\(p_school_id uuid\)/);
    assert.match(s, /length\(btrim\(s\.name\)\) > 0/);
    assert.match(s, /create policy ss_admreq_anon_insert[\s\S]*ss_is_listable_school\(school_id\)/);
  });

  it('47 mints receipt numbers with the IST year', () => {
    const s = sql('47_receipt_ist_year.sql');
    assert.match(s, /extract\(year from \(now\(\) at time zone 'Asia\/Kolkata'\)\)/);
    assert.match(s, /if public\.ss_school_owner\(p_school_id\) is distinct from auth\.uid\(\)/, 'ownership check preserved');
  });

  it('48 blocks future-dated marks (IST) in both RPCs but keeps Clear allowed', () => {
    const s = sql('48_attendance_date_guard.sql');
    const guards = s.match(/if p_status <> 'Clear' and p_date > \(now\(\) at time zone 'Asia\/Kolkata'\)::date then/g);
    assert.equal(guards.length, 2, 'teacher + staff RPCs both guarded');
  });

  it('46 keeps the demo filter and does not touch data rows', () => {
    const s = sql('46_public_school_list_guard.sql');
    assert.match(s, /s\.is_demo = false/);
    assert.ok(!/delete from|update public\.ss_schools/i.test(s), 'no data mutation in the guard migration');
  });
});
