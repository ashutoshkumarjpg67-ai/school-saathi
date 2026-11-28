// tests/phase8/v152-session-logo.test.mjs — v152: Bug A compression-wait (24 Nov 2026).
//
// Bug A (live-confirmed 24 Nov 2026, test account): picking a LARGE photo/logo
// starts an async compression, but Save did not wait for it — saveSettings /
// saveStudent gated on `pendingLogo !== null` / `pendingPhoto !== null`, so a
// Save tapped while compression was still in flight silently skipped the file
// while the toast still said "✓ Settings saved". v152 defers the save until
// the compression lands and then retries it with the file attached.
//
// Scope note: this file was written fresh for v152. BAT's v151 test file
// (v151-session-logo.test.mjs, 14 tests) was lost when /tmp was wiped during
// the v152 build, so it was NOT reconciled line-by-line — it was rewritten
// from the v152 scope: Bug A + re-mint guard tests are kept, the session-keep
// tests are DROPPED (Spider's PR #87 fixed logout differently — tokens in
// localStorage + sessionStorage — and main's harness v104 check still asserts
// the drop, which is correct under that mechanism). The session drop line
// `if (!sbLoadSession()) return false;` is pinned as KEPT, and BAT's
// settingsPage duplicate (logoPrev151) is pinned as ABSENT.
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
const I18N_SRC = readFileSync(join(ROOT, 'js', 'modules', 'i18n.js'), 'utf8');
const SW_SRC = readFileSync(join(ROOT, 'sw.js'), 'utf8');
const VERSION_JSON = JSON.parse(readFileSync(join(ROOT, 'version.json'), 'utf8'));
const PACKAGE_JSON = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

// Cached-element DOM (same pattern as the v150 tests): the plain harness
// getElementById returns a fresh stub every call, so $() results would not
// keep .value/.files set by the test. This override caches one element per
// id, exactly like the real DOM.
function appWithDom() {
  const app = createAppContext();
  app.run(`
    var __els152 = {};
    function __el152() {
      return { innerHTML: '', textContent: '', value: '', style: {}, dataset: {},
        classList: { add: function(){}, remove: function(){}, toggle: function(){}, contains: function(){ return false; } },
        setAttribute: function(){}, getAttribute: function(){ return null; },
        addEventListener: function(){}, removeEventListener: function(){},
        appendChild: function(){}, remove: function(){}, click: function(){}, focus: function(){},
        querySelector: function(){ return null; }, querySelectorAll: function(){ return []; },
        options: [], selectedIndex: 0, checked: false };
    }
    document.getElementById = function (id) {
      if (!__els152[id]) __els152[id] = __el152(); return __els152[id];
    };
    document.querySelector = function () { return null; };
  `);
  return app;
}

function schoolApp() {
  const app = appWithDom();
  app.run(`db = seedDB();`);
  app.run(`state.role = 'school'; state.user = { email: 'a@school.in', role: 'school', name: 'Test School' }; state.view = 'settings';`);
  app.run(`renderApp = function () {}; toast = function (m) { window.__lastToast = m; };`);
  return app;
}

function studentFormApp() {
  const app = schoolApp();
  app.run(`state.view = 'students';`);
  app.run(`$('fStName').value = 'V152 Test Photo';`);
  app.run(`$('fStPh').value = '9000000152';`);
  app.run(`$('fStCls').value = '6th-A';`);
  app.run(`$('fStSec').value = 'A';`);
  // A blank roll defaults to 1, which collides with the seed's 6th-A roll 1
  // (Aarav Verma) and trips the duplicate guard before the deferral — use
  // a roll the seed does not hold.
  app.run(`$('fStRoll').value = '99';`);
  return app;
}

describe('v152 Bug A — logo save waits for compression', () => {
  it('compression counters and deferred-save flags exist and start at zero', () => {
    const app = createAppContext();
    assert.equal(app.get('logoCompressing'), 0);
    assert.equal(app.get('photoCompressing'), 0);
    assert.equal(app.get('logoSavePending'), false);
    assert.equal(app.get('photoSavePending'), null);
  });

  it('saveSettings defers while the logo is compressing — no silent skip', () => {
    const app = schoolApp();
    const before = app.run(`db.profile.logo`);
    app.run(`$('fPfLogo').files = [{ name: 'logo.png', size: 5000 }];`);
    app.run(`logoCompressing = 1;`);
    const ret = app.run(`saveSettings({ preventDefault: function () {} })`);
    assert.equal(ret, false, 'saveSettings must return false while compression is in flight');
    assert.equal(app.get('logoSavePending'), true, 'deferred save was not recorded');
    assert.equal(app.run(`window.__lastToast`), app.run(`t('tLogoProcessing')`), 'deferral must toast the processing message, not success');
    assert.equal(app.run(`db.profile.logo`), before, 'logo changed even though the save was deferred');
  });

  it('retryLogoSave saves the deferred logo once compression lands', () => {
    const app = schoolApp();
    app.run(`pendingLogo = 'data:image/png;base64,TESTLOGO152';`);
    app.run(`retryLogoSave();`);
    assert.equal(app.run(`db.profile.logo`), 'data:image/png;base64,TESTLOGO152', 'deferred logo was not saved to the profile');
    assert.equal(app.get('pendingLogo'), null, 'pendingLogo was not cleared after the retry save');
  });

  it('deferred logo save persists to localStorage (sync-completion regression)', () => {
    const app = schoolApp();
    app.run(`pendingLogo = 'data:image/png;base64,TESTLOGO152';`);
    app.run(`retryLogoSave();`);
    // saveDB seals the DB at rest (v147), so the stored string is encoded —
    // decode it and check the logo round-trips through the seal.
    const storedLogo = app.run(`JSON.parse(vaultDecode(localStorage.getItem('schoolSaathiDBv1'))).profile.logo`);
    assert.equal(storedLogo, 'data:image/png;base64,TESTLOGO152', 'saved logo did not reach localStorage — the deferred save is lost on reload');
  });

  it('i18n keys tLogoProcessing / tPhotoProcessing exist', () => {
    const app = createAppContext();
    assert.equal(app.run(`t('tLogoProcessing')`), 'Logo is still being processed — saving once it is ready.');
    assert.equal(app.run(`t('tPhotoProcessing')`), 'Photo is still being processed — saving once it is ready.');
    assert.ok(I18N_SRC.includes('tLogoProcessing'), 'tLogoProcessing missing from i18n.js');
    assert.ok(I18N_SRC.includes('tPhotoProcessing'), 'tPhotoProcessing missing from i18n.js');
  });
});

describe('v152 Bug A — student photo save waits for compression', () => {
  it('saveStudent defers while the photo is compressing — no silent skip', () => {
    const app = studentFormApp();
    app.run(`$('fStPhoto').files = [{ name: 'photo.jpg', size: 5000 }];`);
    app.run(`photoCompressing = 1;`);
    const ret = app.run(`saveStudent({ preventDefault: function () {} }, '', undefined)`);
    assert.equal(ret, false, 'saveStudent must return false while compression is in flight');
    // Field-by-field: the object lives in the vm realm, so deepStrictEqual
    // fails on its prototype even when the fields match.
    assert.equal(app.run(`photoSavePending.id`), '');
    assert.equal(app.run(`photoSavePending.mode`), 'active');
    assert.ok(app.get('photoSavePending') !== null, 'deferred student save was not recorded');
    assert.equal(app.run(`window.__lastToast`), app.run(`t('tPhotoProcessing')`), 'deferral must toast the processing message, not success');
    assert.equal(app.run(`db.students.find(function (s) { return s.name === 'V152 Test Photo'; })`), undefined, 'student was created even though the save was deferred');
  });

  it('retryPhotoSave saves the deferred student WITH the photo', () => {
    const app = studentFormApp();
    app.run(`pendingPhoto = 'data:image/jpeg;base64,TESTPHOTO152';`);
    app.run(`retryPhotoSave({ id: '', mode: 'active' });`);
    const saved = app.run(`db.students.find(function (s) { return s.name === 'V152 Test Photo'; })`);
    assert.ok(saved, 'deferred student was not saved');
    assert.equal(app.run(`db.students.find(function (s) { return s.name === 'V152 Test Photo'; }).photo`), 'data:image/jpeg;base64,TESTPHOTO152', 'deferred photo was not attached to the student');
    assert.equal(app.get('pendingPhoto'), null, 'pendingPhoto was not cleared after the retry save');
  });

  it('deferral wiring is present in app.js source (both saves)', () => {
    assert.ok(APP_SRC.includes('if (logoCompressing > 0)'), 'saveSettings has no logoCompressing deferral');
    assert.ok(APP_SRC.includes('logoSavePending = true'), 'saveSettings never records a deferred logo save');
    assert.ok(APP_SRC.includes('if (photoCompressing > 0)'), 'saveStudent has no photoCompressing deferral');
    assert.ok(APP_SRC.includes('photoSavePending = { id: id, mode: mode }'), 'saveStudent never records a deferred photo save');
    assert.ok(APP_SRC.includes('function retryLogoSave()'), 'retryLogoSave missing');
    assert.ok(APP_SRC.includes('function retryPhotoSave(ps)'), 'retryPhotoSave missing');
  });
});

describe('v152 Bug B guard — re-mint never rebuilds over a pending pick', () => {
  it('sbHasPendingFile is true exactly while a pick is pending', () => {
    const app = createAppContext();
    assert.equal(app.run(`sbHasPendingFile()`), false);
    app.run(`pendingLogo = 'data:image/png;base64,X';`);
    assert.equal(app.run(`sbHasPendingFile()`), true);
    app.run(`pendingLogo = null; pendingPhoto = 'data:image/jpeg;base64,Y';`);
    assert.equal(app.run(`sbHasPendingFile()`), true);
    app.run(`pendingPhoto = null;`);
    assert.equal(app.run(`sbHasPendingFile()`), false);
  });

  it('sbReMintRender calls renderApp only when nothing is pending', () => {
    const app = createAppContext();
    app.run(`var __rendered152 = 0; renderApp = function () { __rendered152++; };`);
    app.run(`sbReMintRender();`);
    assert.equal(app.run(`__rendered152`), 1, 'renderApp was not called with no pending file');
    app.run(`pendingLogo = 'data:image/png;base64,X'; sbReMintRender();`);
    assert.equal(app.run(`__rendered152`), 1, 're-mint rebuilt over a pending logo');
    app.run(`pendingLogo = null; pendingPhoto = 'data:image/jpeg;base64,Y'; sbReMintRender();`);
    assert.equal(app.run(`__rendered152`), 1, 're-mint rebuilt over a pending photo');
    app.run(`pendingPhoto = null; sbReMintRender();`);
    assert.equal(app.run(`__rendered152`), 2, 'renderApp was not called again once the pick cleared');
  });

  it('closeModal clears a pending photo (guard never sticks on a dead pick)', () => {
    const app = createAppContext();
    app.run(`pendingPhoto = 'data:image/jpeg;base64,DEADPICK';`);
    app.run(`closeModal();`);
    assert.equal(app.get('pendingPhoto'), null, 'closeModal did not clear pendingPhoto');
  });

  it('all 5 re-mint call sites use the guard; session line kept; no v151 settingsPage duplicate', () => {
    const calls = (APP_SRC.match(/sbReMintRender\(\)/g) || []).length;
    assert.ok(calls >= 6, 'expected the sbReMintRender definition + 5 call sites, got ' + calls);
    assert.ok(APP_SRC.includes('if (!sbLoadSession()) return false;'), 'Spider PR #87 session line was changed — the v152 scope keeps it');
    assert.ok(!APP_SRC.includes('logoPrev151'), 'BAT v151 settingsPage duplicate (logoPrev151) leaked into v152');
    assert.ok(!APP_SRC.includes('oldLogoIn151'), 'BAT v151 settingsPage duplicate (oldLogoIn151) leaked into v152');
  });
});

describe('v154 version markers', () => {
  it('APP_VERSION, version.json and package.json are all 170', () => {
    const app = createAppContext();
    assert.equal(app.get('APP_VERSION'), 170);
    assert.equal(VERSION_JSON.version, 170);
    assert.equal(PACKAGE_JSON.version, '170.0.0');
  });

  it('sw.js cache is school-saathi-v170 with ?v=153 assets', () => {
    assert.match(SW_SRC, /CACHE_NAME = 'school-saathi-v170'/);
    assert.ok(SW_SRC.includes('app.js?v=170'), 'app.js?v=170 missing from sw.js precache');
  });
});
