// tests/phase8/v150-bottom-nav-removed.test.mjs — v150: bottom nav removed (24 Nov 2026).
//
// The user (phone screenshot of the Don Basco dashboard, ~16:02 IST) ordered
// the whole bottom tab bar gone: "Ye niche waale tab icon hta do pahle
// jaise hi thik tha. Bahut cheap lag rha hai. Ai emoji wale icons nahi
// professional." The bar was added in v147; v150 takes navigation back to
// sidebar-only, exactly as before v147 — no redesign, no SVG replacement.
//
// Removal must be COMPLETE: no element, no CSS, no JS, and no leftover
// clearance — the v147 page bottom padding (96px for the bar) and the toast
// lift (88px above the bar) both go back to their pre-v147 values, so the
// bottom of the screen is clean, not a blank strip.
//
// The sidebar stays the only navigation. On phones it is a drawer opened
// from the hamburger (☰) in the top bar — these tests pin that path at
// phone width (CSS off-canvas rules + live toggleSidebar behaviour).
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

// Same cached-element DOM as the v148 tests, plus RECORDING classList
// stubs for the sidebar + scrim, so toggleSidebar's open/close can be
// observed (the plain harness stubs swallow classList writes).
function appWithDom() {
  const app = createAppContext();
  app.run(`
    var __els150 = {};
    var __rec150 = {};
    function __el150() {
      return { innerHTML: '', textContent: '', value: '', style: {}, dataset: {},
        classList: { add: function(){}, remove: function(){}, toggle: function(){}, contains: function(){ return false; } },
        setAttribute: function(){}, getAttribute: function(){ return null; },
        addEventListener: function(){}, removeEventListener: function(){},
        appendChild: function(){}, remove: function(){}, click: function(){}, focus: function(){},
        querySelector: function(){ return null; }, querySelectorAll: function(){ return []; },
        options: [], selectedIndex: 0 };
    }
    function __recEl150() {
      var classes = {};
      var el = __el150();
      el._classes = classes;
      el.classList = {
        add: function (c) { classes[c] = 1; },
        remove: function (c) { delete classes[c]; },
        toggle: function (c, force) {
          if (force === undefined) { if (classes[c]) delete classes[c]; else classes[c] = 1; }
          else if (force) classes[c] = 1; else delete classes[c];
        },
        contains: function (c) { return !!classes[c]; }
      };
      return el;
    }
    document.getElementById = function (id) {
      if (id === 'sidebar' || id === 'scrim') { if (!__rec150[id]) __rec150[id] = __recEl150(); return __rec150[id]; }
      if (!__els150[id]) __els150[id] = __el150(); return __els150[id];
    };
    document.querySelector = function () { return null; };
  `);
  return app;
}

const SCHOOL = `{uid:'u1', name:'Test Sunrise School', school:'Test Sunrise School', email:'test@sunrise.test', role:'school', sbUid:'sb-u1'}`;

function loginSchool(app) {
  app.run(`saveAccounts([${SCHOOL}])`);
  app.run(`loginAs(${SCHOOL})`);
  app.run('db = seedDB(); saveDB(db); sbFirstLoadDone(); renderApp();');
  return app;
}

function disarm(app) {
  app.run('sbFirstLoadDone();');
}

describe('v154 version markers', () => {
  it('APP_VERSION, version.json and package.json are all 159', () => {
    const app = createAppContext();
    assert.equal(app.get('APP_VERSION'), 159);
    assert.equal(VERSION_JSON.version, 159);
    assert.equal(PACKAGE_JSON.version, '159.0.0');
  });

  it('sw.js cache is school-saathi-v159 with ?v=153 assets', () => {
    assert.match(SW_SRC, /CACHE_NAME = 'school-saathi-v159'/);
    assert.ok(SW_SRC.includes('app.js?v=159'), 'app.js?v=159 missing from sw.js precache');
  });
});

describe('v150 — the bottom nav is completely gone', () => {
  it('no bottom-nav markup, CSS, JS, or i18n key survives', () => {
    assert.ok(!INDEX_SRC.includes('bottomNav'), 'index.html still has the bottom-nav element');
    assert.ok(!INDEX_SRC.includes('bottom-nav'), 'index.html still mentions bottom-nav');
    assert.ok(!STYLES_SRC.includes('.bottom-nav'), 'styles.css still has .bottom-nav rules');
    assert.ok(!APP_SRC.includes('bottomNav'), 'app.js still references bottomNav');
    assert.ok(!I18N_SRC.includes('moreNav'), 'i18n.js still has the More key');
  });

  it('no leftover clearance: page padding and toast sit at their pre-v147 values', () => {
    // v147 reserved 96px of page bottom padding for the bar and lifted
    // the toast 88px above it — with the bar gone both must be gone, or
    // the bottom of the screen keeps a blank strip.
    assert.ok(!STYLES_SRC.includes('padding-bottom:calc(96px'), 'page still reserves 96px for the removed bar');
    assert.ok(!STYLES_SRC.includes('bottom:calc(88px'), 'toast still lifted 88px above the removed bar');
    assert.ok(!STYLES_SRC.includes('safe-area-inset-bottom'), 'safe-area bottom inset still referenced (was only for the bar)');
    assert.match(STYLES_SRC, /#toast\{[^}]*bottom:26px/, 'toast is not back at its default bottom:26px');
  });

  it('renderApp never creates a bottom-nav element', () => {
    const app = loginSchool(appWithDom());
    assert.equal(app.run(`typeof __els150.bottomNav === 'undefined'`), true);
    disarm(app);
  });
});

describe('v150 — sidebar-only navigation still works, phones included', () => {
  it('the hamburger button is in the top bar and opens the drawer', () => {
    assert.ok(INDEX_SRC.includes('class="hamburger"'), 'hamburger button missing from index.html');
    assert.ok(INDEX_SRC.includes('onclick="toggleSidebar(true)"'), 'hamburger does not call toggleSidebar(true)');
  });

  it('phone CSS keeps the sidebar off-canvas with a drawer state', () => {
    assert.match(STYLES_SRC, /\.sidebar\{position:fixed;[^}]*transform:translateX\(-102%\)/, 'sidebar is not off-canvas at phone width');
    assert.match(STYLES_SRC, /\.sidebar\.open\{transform:none\}/, 'sidebar.open does not slide the drawer in');
    assert.match(STYLES_SRC, /\.hamburger\{display:block\}/, 'hamburger is not shown at phone width');
    assert.match(STYLES_SRC, /\.scrim\{position:fixed;[^}]*z-index:35\}/, 'scrim rule missing at phone width');
  });

  it('toggleSidebar opens and closes the drawer (recording stubs)', () => {
    const app = loginSchool(appWithDom());
    app.run('toggleSidebar(true)');
    assert.equal(app.run(`__rec150.sidebar.classList.contains('open')`), true);
    assert.equal(app.run(`__rec150.scrim.classList.contains('hidden')`), false);
    app.run('toggleSidebar(false)');
    assert.equal(app.run(`__rec150.sidebar.classList.contains('open')`), false);
    assert.equal(app.run(`__rec150.scrim.classList.contains('hidden')`), true);
    disarm(app);
  });

  it('navigating from the sidebar closes the drawer and lands on the view', () => {
    const app = loginSchool(appWithDom());
    app.run('toggleSidebar(true)');
    assert.equal(app.run(`__rec150.sidebar.classList.contains('open')`), true);
    app.run(`go('attendance')`);
    assert.equal(app.get('state.view'), 'attendance');
    assert.equal(app.run(`__rec150.sidebar.classList.contains('open')`), false);
    disarm(app);
  });

  it('the sidebar still renders the full role nav after renderApp', () => {
    const app = loginSchool(appWithDom());
    const side = app.run(`__els150.sideNav.innerHTML`);
    for (const label of ['Dashboard', 'Student Management', 'Attendance', 'Fees', 'Settings']) {
      assert.ok(side.includes(label), 'sidebar missing nav item: ' + label);
    }
    disarm(app);
  });
});
