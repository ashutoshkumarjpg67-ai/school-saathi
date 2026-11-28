// tests/phase8/display-visuals.test.mjs — live issues #4, #5, #6 (24 Nov 2026).
//
// #4 is a code fix (adaptive chart scale in barChartSVG); #5 is a code fix
// (all logo sites route through sbDisplayPhoto + onerror fallback, and the
// receipt logo gets the same white-bg/border treatment as the dashboard);
// #6 is a CSS fix (.btn.ghost.danger was red-on-blue-on-red via cascade).
//
// Run: node --test --test-force-exit   (plain `npm test` hangs on the
// pre-existing v148-bugfixes.test.mjs defect — repeating setIntervals
// never cleared)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppContext } from '../harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP_SRC = ['app.js', 'js/modules/fees-ui.js', 'js/modules/students-ops.js', 'js/modules/academics-ui.js', 'js/modules/people-ui.js'].map(f => readFileSync(join(ROOT, f), 'utf8')).join('\n');
const STYLES_SRC = readFileSync(join(ROOT, 'styles.css'), 'utf8');

// DOM stub with settable input values (copied from
// tests/phase8/live-small-issues.test.mjs) — loginAs -> renderApp touches
// the DOM, so a bare createAppContext() crashes inside loginAs.
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

const SCHOOL = `{uid:'u1', name:'Test Sunrise School', school:'Test Sunrise School', email:'test@sunrise.test', role:'school', sbUid:'sb-u1'}`;

function freshApp() {
  const app = appWithDom();
  app.run(`saveAccounts([${SCHOOL}])`);
  app.run(`loginAs(${SCHOOL})`);
  app.run('sbFirstLoadDone();');
  return app;
}

describe('live issue 4 — fee chart scale', function () {
  it('scales the y-axis to the data: a ₹800 month is a tall bar, not a dash', function () {
    const app = freshApp();
    assert.equal(app.run('chartNiceMax(800)'), 1000);
    assert.equal(app.run('chartNiceMax(80000)'), 100000);
    assert.equal(app.run('chartNiceMax(0)'), 1000);
    const svg = app.run(`barChartSVG([{label:'Dec', collected:800, pending:0}])`);
    const m = svg.match(/<rect class="bar"[^>]*height="([\d.]+)"/);
    assert.ok(m, 'chart has a collected bar');
    assert.ok(+m[1] > 100, '₹800 bar must be clearly visible, got height ' + m[1]);
    // Axis labels track the data scale (500 / 1K), not lakh units.
    assert.ok(svg.indexOf('>500<') !== -1, 'mid gridline reads 500');
    assert.ok(svg.indexOf('>1K<') !== -1, 'top gridline reads 1K');
  });
  it('large values still scale up with K/L labels', function () {
    const app = freshApp();
    const svg = app.run(`barChartSVG([{label:'Dec', collected:80000, pending:40000}])`);
    const m = svg.match(/<rect class="bar"[^>]*height="([\d.]+)"/);
    assert.ok(m && +m[1] > 100, '₹80,000 bar must be clearly visible');
    assert.ok(svg.indexOf('>50K<') !== -1, 'mid gridline reads 50K');
    assert.ok(svg.indexOf('>1L<') !== -1, 'top gridline reads 1L');
  });
});

describe('live issue 5 — school logo red box', function () {
  it('dashboard renders the logo through sbDisplayPhoto with an onerror fallback', function () {
    const app = freshApp();
    app.run(`db.profile.logo = 'data:image/png;base64,iVBORw0KGgo=';`);
    const html = app.run('schoolDashboard()');
    assert.ok(html.indexOf('class="dash-logo"') !== -1, 'dashboard has the logo img');
    assert.ok(html.indexOf('data:image/png;base64,iVBORw0KGgo=') !== -1, 'logo src is the stored value');
    assert.ok(html.indexOf('onerror="this.remove()"') !== -1, 'a broken logo is removed, never a broken box');
  });
  it('dashboard uses the signed URL when one is cached for a storage logo', function () {
    const app = freshApp();
    app.run(`db.profile.logo = SB_URL + '/storage/v1/object/public/school-logos/u1/logo.png'; sbCacheSignedPhoto(db.profile.logo, 'https://signed.example/logo.png?token=abc', 300);`);
    const html = app.run('schoolDashboard()');
    assert.ok(html.indexOf('https://signed.example/logo.png?token=abc') !== -1, 'dashboard src is the signed URL, not the raw public URL');
  });
  it('sidebar and topbar logo imgs carry onerror fallbacks', function () {
    const app = freshApp();
    app.run(`db.profile.logo = 'data:image/png;base64,iVBORw0KGgo=';`);
    app.run('renderApp();');
    const cap = app.run(`document.getElementById('sideBrandCap').innerHTML`);
    assert.ok(cap.indexOf('side-logo') !== -1, 'sidebar brand shows the logo');
    assert.ok(cap.indexOf('outerHTML') !== -1, 'sidebar logo falls back to the cap on error');
    const who = app.run(`document.getElementById('whoAvatar').innerHTML`);
    assert.ok(who.indexOf('onerror="this.remove()"') !== -1, 'topbar avatar logo is removed on error');
  });
  it('receipt, ID card and print sites route the logo through sbDisplayPhoto with onerror', function () {
    // Source pins for the sites that cannot be rendered cheaply in the
    // harness (receiptHTML / idCardHTML / printRowsToArea /
    // reportCardPrintHTML need full fixtures); the dashboard tests above
    // cover the behaviour end to end.
    assert.ok((APP_SRC.match(/sbDisplayPhoto\(db\.profile\.logo\)/g) || []).length >= 4, 'dashboard, print, ID card and receipt route the logo through sbDisplayPhoto');
    assert.ok(APP_SRC.indexOf('sbDisplayPhoto(p.logo)') !== -1, 'report card print routes the logo through sbDisplayPhoto');
    assert.ok((APP_SRC.match(/onerror="this\.remove\(\)"/g) || []).length >= 6, 'every logo img removes itself on error');
  });
  it('receipt logo has the same white-bg/border treatment as the dashboard logo', function () {
    const rule = STYLES_SRC.match(/\.rcpt-logo\{[^}]*\}/);
    assert.ok(rule, '.rcpt-logo rule exists');
    assert.ok(/background:#fff/.test(rule[0]), 'receipt logo has a white background');
    assert.ok(/border:1px solid var\(--border\)/.test(rule[0]), 'receipt logo has a border');
  });
});

describe('live issue 6 — delete button contrast', function () {
  it('.btn.ghost.danger has a white background with red text (not red-on-red)', function () {
    const rule = STYLES_SRC.match(/\.btn\.ghost\.danger\{[^}]*\}/);
    assert.ok(rule, '.btn.ghost.danger rule exists');
    assert.ok(/background:#fff/.test(rule[0]), 'ghost-danger background is white');
    assert.ok(/color:var\(--red\)/.test(rule[0]), 'ghost-danger text is red');
    assert.ok(/border-color:var\(--red\)/.test(rule[0]), 'ghost-danger border is red');
    const hover = STYLES_SRC.match(/\.btn\.ghost\.danger:hover\{[^}]*\}/);
    assert.ok(hover && /background:var\(--red-soft\)/.test(hover[0]), 'ghost-danger hover is a soft red wash');
  });
  it('table delete buttons still use the ghost-danger combination', function () {
    // The markup is unchanged — only the CSS was missing. Pin that the
    // delete buttons render with the ghost + danger classes.
    assert.ok(APP_SRC.indexOf('btn ghost sm danger') !== -1, 'delete buttons carry btn ghost sm danger');
  });
});
