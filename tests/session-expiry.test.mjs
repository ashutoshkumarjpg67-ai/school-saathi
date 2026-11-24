// tests/session-expiry.test.mjs — local session expiry (Phase 1 CR-1/H-1 + session-expiry gaps fix).
//
// The 30-day absolute max age lives in restoreSession/persistSession:
// re-persisting keeps the original `at`, a fresh `at` is stamped only on
// a fresh login or a different account, and every restore path (local
// school, local student, cloud teacher/student/parent/staff) runs through
// the single age gate at the top of restoreSession — the gate fires before
// any branch dispatch, so no path can bypass it. An expired session is
// cleared and the user is told to log in again (the same message the
// server-side rejection shows); a future-dated `at` beyond clock-skew
// tolerance is expired too, so a clock set back cannot keep a session
// alive forever.
// Run: npm test   (node --test, Node built-ins only)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAppContext } from './harness.mjs';

const DAY = 24 * 60 * 60 * 1000;

function seedSchool(app, email = 'test@school.in') {
  app.run(
    `saveAccounts([{uid:'u1', name:'Test School', school:'Test School', email:'${email}', role:'school', sub:'x'}])`,
  );
}

function setSession(app, obj) {
  app.run(`localStorage.setItem(SESSION_KEY, JSON.stringify(${JSON.stringify(obj)}))`);
}

function storedSession(app) {
  const raw = app.storage.getItem('schoolSaathiSession');
  return raw ? JSON.parse(raw) : null;
}

// A fresh context with rendering stubbed out: the harness has no <select>
// `options` stub, so the real renderApp throws in node:vm. Session logic
// is what's under test here, not rendering. The toast is captured so the
// expiry message can be asserted.
function appWithStubs() {
  const app = createAppContext();
  app.run(`renderApp = function () {}; toast = function (m) { window.__lastToast = m; };`);
  seedSchool(app);
  return app;
}

describe('session max age (restoreSession age gate)', () => {
  it('SESSION_MAX_AGE_MS is exactly 30 days', () => {
    const app = createAppContext();
    assert.equal(app.get('SESSION_MAX_AGE_MS'), 30 * DAY);
  });

  it('a fresh session restores and keeps its original `at`', async () => {
    const app = appWithStubs();
    const at = Date.now() - 10 * DAY;
    setSession(app, { role: 'school', email: 'test@school.in', view: 'dashboard', at });
    assert.equal(await app.run('restoreSession()'), true);
    assert.equal(app.run('state.role'), 'school');
    assert.equal(storedSession(app).at, at);
  });

  it('a session just inside 30 days restores; just past 30 days expires', async () => {
    const app = appWithStubs();
    const maxAge = app.get('SESSION_MAX_AGE_MS');
    setSession(app, { role: 'school', email: 'test@school.in', view: 'dashboard', at: Date.now() - maxAge + 60000 });
    assert.equal(await app.run('restoreSession()'), true);
    const app2 = appWithStubs();
    setSession(app2, { role: 'school', email: 'test@school.in', view: 'dashboard', at: Date.now() - maxAge - 60000 });
    assert.equal(await app2.run('restoreSession()'), false);
    assert.equal(storedSession(app2), null);
  });

  it('an expired session is cleared and the user is told to log in again', async () => {
    const app = appWithStubs();
    setSession(app, { role: 'school', email: 'test@school.in', view: 'dashboard', at: Date.now() - 31 * DAY });
    assert.equal(await app.run('restoreSession()'), false);
    assert.equal(storedSession(app), null);
    assert.equal(app.get('window.__lastToast'), app.run(`t('sbStatusSessionExpired')`));
  });

  it('a pre-fix session with no `at` is treated as expired', async () => {
    const app = appWithStubs();
    setSession(app, { role: 'school', email: 'test@school.in', view: 'dashboard' });
    assert.equal(await app.run('restoreSession()'), false);
    assert.equal(storedSession(app), null);
    assert.equal(app.get('window.__lastToast'), app.run(`t('sbStatusSessionExpired')`));
  });

  it('a null `at` is treated as expired', async () => {
    const app = appWithStubs();
    setSession(app, { role: 'school', email: 'test@school.in', view: 'dashboard', at: null });
    assert.equal(await app.run('restoreSession()'), false);
    assert.equal(storedSession(app), null);
  });

  it('a future-dated `at` beyond clock-skew tolerance is expired', async () => {
    const app = appWithStubs();
    setSession(app, { role: 'school', email: 'test@school.in', view: 'dashboard', at: Date.now() + DAY });
    assert.equal(await app.run('restoreSession()'), false);
    assert.equal(storedSession(app), null);
  });

  it('an `at` a minute in the future (ordinary clock drift) still restores', async () => {
    const app = appWithStubs();
    setSession(app, { role: 'school', email: 'test@school.in', view: 'dashboard', at: Date.now() + 60000 });
    assert.equal(await app.run('restoreSession()'), true);
  });

  it('the age gate also covers cloud restores (cloud-student session, expired)', async () => {
    const app = appWithStubs();
    setSession(app, { role: 'student', email: 'cloud-student:sch1:stu1', view: 'dashboard', at: Date.now() - 31 * DAY });
    assert.equal(await app.run('restoreSession()'), false);
    assert.equal(storedSession(app), null);
  });
});

describe('persistSession keeps the absolute `at` (no sliding extension)', () => {
  it('re-persisting keeps the original `at` for the same account', () => {
    const app = createAppContext();
    const at = Date.now() - 10 * DAY;
    setSession(app, { role: 'school', email: 'test@school.in', view: 'dashboard', at });
    app.run(`state.role = 'school'; state.user = { email: 'test@school.in' }; state.view = 'dashboard'; persistSession();`);
    assert.equal(storedSession(app).at, at);
  });

  it('a fresh login (no stored session) stamps `at` at now', () => {
    const app = createAppContext();
    const before = Date.now();
    app.run(`state.role = 'school'; state.user = { email: 'test@school.in' }; state.view = 'dashboard'; persistSession();`);
    const at = storedSession(app).at;
    assert.ok(at >= before && at <= Date.now(), `at=${at} not within login window`);
  });

  it('logging in as a different account stamps a fresh `at`', () => {
    const app = createAppContext();
    const oldAt = Date.now() - 10 * DAY;
    setSession(app, { role: 'school', email: 'test@school.in', view: 'dashboard', at: oldAt });
    const before = Date.now();
    app.run(`state.role = 'school'; state.user = { email: 'other@school.in' }; state.view = 'dashboard'; persistSession();`);
    const at = storedSession(app).at;
    assert.ok(at >= before && at <= Date.now(), `at=${at} not fresh for the new account`);
  });
});
