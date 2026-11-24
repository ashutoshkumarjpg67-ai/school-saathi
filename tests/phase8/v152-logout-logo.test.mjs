// tests/phase8/v152-logout-logo.test.mjs — v152 fixes for the two live-confirmed bugs (24 Nov 2026).
//
// Bug 1 (logout on app close): the Supabase session lived only in
// sessionStorage, which dies with the tab — on reopen restoreSession
// validated the server session, found nothing to refresh from, and wiped
// the good local session too. sessSet/sessGet now keep a vault-sealed
// copy in localStorage (durable) as well as sessionStorage (fast in-tab
// read); logout still clears both.
// Bug 2 (logo save fails): settingsPage() reset pendingLogo on EVERY
// render, and the 30 s photo re-mint tick re-renders Settings — a picked
// logo was silently dropped before Save (which still toasted success).
// settingsPage no longer resets it; the preview shows the pending logo
// across re-renders; leaving Settings drops it.
// Run: npm test   (node --test, Node built-ins only)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAppContext } from '../harness.mjs';

// The harness has no sessionStorage stub; install a minimal one in the
// vm context, mirroring the browser API (same trick as v147-vault.test.mjs).
function withSessionStorage(app) {
  app.run(`sessionStorage = { _m: {}, getItem(k) { return (k in this._m) ? this._m[k] : null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };`);
}

// A fresh context with rendering stubbed out: the harness has no <select>
// `options` stub, so the real renderApp throws in node:vm (same trick as
// tests/session-expiry.test.mjs).
function appWithStubs() {
  const app = createAppContext();
  app.run(`renderApp = function () {}; toast = function (m) { window.__lastToast = m; };`);
  return app;
}

const SB_KEY = 'schoolSaathiSupabaseSession';
const SB_SESSION = JSON.stringify({ access_token: 'tok-1', refresh_token: 'ref-1', expires_at: Date.now() + 3600000, user_id: 'server-uid-1', email: 'a@school.in' });

describe('v152 Bug 1 — Supabase session survives closing the app', () => {
  it('sessSet seals the session into localStorage as well as sessionStorage', () => {
    const app = createAppContext();
    withSessionStorage(app);
    app.run(`sessSet('${SB_KEY}', ${JSON.stringify(SB_SESSION)});`);
    const storedLocal = app.storage.getItem(SB_KEY);
    assert.ok(storedLocal && storedLocal.startsWith('ssv1$'), 'session stored in localStorage as plaintext!');
    assert.ok(!storedLocal.includes('tok-1'), 'token visible in stored session');
    assert.ok(app.run(`sessionStorage.getItem('${SB_KEY}')`).startsWith('ssv1$'), 'session missing from sessionStorage');
    assert.equal(app.run(`sessGet('${SB_KEY}')`), SB_SESSION);
  });

  it('sessGet survives a simulated tab close — twice (the local copy is not consumed)', () => {
    const app = createAppContext();
    withSessionStorage(app);
    app.run(`sessSet('${SB_KEY}', ${JSON.stringify(SB_SESSION)});`);
    // Tab 1 closes: sessionStorage dies, localStorage keeps the session.
    app.run(`sessionStorage._m = {};`);
    assert.equal(app.run(`sessGet('${SB_KEY}')`), SB_SESSION, 'session lost after first tab close');
    // Tab 2 closes too: the localStorage copy must still be there.
    app.run(`sessionStorage._m = {};`);
    assert.equal(app.run(`sessGet('${SB_KEY}')`), SB_SESSION, 'session lost after second tab close');
    assert.ok(app.storage.getItem(SB_KEY), 'localStorage copy was consumed by the adoption');
  });

  it('sessRemove (logout) clears both storages', () => {
    const app = createAppContext();
    withSessionStorage(app);
    app.run(`sessSet('${SB_KEY}', ${JSON.stringify(SB_SESSION)});`);
    app.run(`sessRemove('${SB_KEY}');`);
    assert.equal(app.storage.getItem(SB_KEY), null);
    assert.equal(app.run(`sessGet('${SB_KEY}')`), null);
  });

  it('restoreSession restores a server-linked school after a simulated tab close', async () => {
    const app = appWithStubs();
    withSessionStorage(app);
    app.run(`saveAccounts([{uid:'u1', name:'Test School', email:'a@school.in', role:'school', sbUid:'server-uid-1'}]);`);
    app.run(`state.role = 'school'; state.user = { email: 'a@school.in', uid: 'u1', role: 'school', name: 'Test School' }; state.view = 'dashboard'; persistSession();`);
    app.run(`sbStoreSession({access_token:'tok-1', refresh_token:'ref-1', expires_in:3600, user:{id:'server-uid-1', email:'a@school.in'}});`);
    // Close the tab: sessionStorage dies, localStorage keeps both sessions.
    app.run(`sessionStorage._m = {};`);
    app.run(`state.role = null; state.user = null;`);
    assert.equal(await app.run('restoreSession()'), true, 'server-linked school did not restore after tab close');
    assert.equal(app.run('state.role'), 'school');
    assert.equal(app.run('state.user.email'), 'a@school.in');
    // The local session was NOT wiped by the restore.
    assert.ok(app.storage.getItem('schoolSaathiSession'), 'local session was wiped on restore');
  });
});

describe('v152 Bug 2 — picked logo survives a Settings re-render', () => {
  function settingsApp() {
    const app = createAppContext();
    app.run(`db = seedDB();`);
    app.run(`state.role = 'school'; state.user = { email: 'a@school.in', role: 'school', name: 'Test School', sub: 'x' }; state.view = 'settings';`);
    return app;
  }

  it('settingsPage does not reset pendingLogo and shows it in the preview', () => {
    const app = settingsApp();
    app.run(`pendingLogo = 'data:image/png;base64,TESTLOGO';`);
    const html1 = app.run(`settingsPage()`);
    assert.ok(html1.includes('TESTLOGO'), 'pending logo missing from preview on first render');
    assert.equal(app.run(`pendingLogo`), 'data:image/png;base64,TESTLOGO');
    // A re-render — exactly what the 30 s photo re-mint tick does — must
    // not drop the picked logo.
    const html2 = app.run(`settingsPage()`);
    assert.equal(app.run(`pendingLogo`), 'data:image/png;base64,TESTLOGO', 'pendingLogo was reset by a re-render');
    assert.ok(html2.includes('TESTLOGO'), 'pending logo preview lost on re-render');
  });

  it('leaving Settings drops the pending logo (renderApp choke point)', () => {
    const app = settingsApp();
    // Real renderApp, but no page render: renderPage is stubbed, and the
    // <select> stub gets an `options` array (the harness stub has none).
    app.run(`renderPage = function () {};`);
    app.run(`document.getElementById = function (id) { var el = { addEventListener(){}, removeEventListener(){}, appendChild(o){ if (this.options) this.options.push(o); }, remove(){}, setAttribute(){}, classList: { add(){}, remove(){}, toggle(){}, contains: () => false }, style: {}, textContent: '', innerHTML: '', value: '', disabled: false, options: [], click(){} }; return el; };`);
    app.run(`pendingLogo = 'data:image/png;base64,TESTLOGO';`);
    app.run(`state.view = 'dashboard'; renderApp();`);
    assert.equal(app.run(`pendingLogo`), null, 'pendingLogo leaked out of Settings');
  });

  it('saveSettings applies the pending logo and clears it', () => {
    const app = settingsApp();
    app.run(`renderApp = function () {}; toast = function (m) { window.__lastToast = m; };`);
    app.run(`pendingLogo = 'data:image/png;base64,TESTLOGO';`);
    app.run(`saveSettings({ preventDefault: function () {} });`);
    assert.equal(app.run(`db.profile.logo`), 'data:image/png;base64,TESTLOGO', 'pending logo was not saved to the profile');
    assert.equal(app.run(`pendingLogo`), null, 'pendingLogo was not cleared after save');
  });
});
