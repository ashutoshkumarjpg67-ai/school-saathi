// tests/landing.test.mjs — public landing page (v147, English-only).
//
// landing.html is a standalone static page at the site root: it shares
// styles.css with the app but loads no app.js, no i18n module and makes
// no network call. v147: English-only like the app — no EN/HI toggle,
// no data-hi strings, no Devanagari, no inline script at all.
// The login flow must be untouched — index.html keeps
// its #login / #app shells and app.js keeps its DOMContentLoaded ->
// restoreSession() -> showLogin() boot. Run: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppContext } from './harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const truth = JSON.parse(read('version.json')).version;
const landing = read('landing.html');

describe('landing page exists and is self-contained', () => {
  it('links the app stylesheet at the current version', () => {
    const vs = [...landing.matchAll(/\?v=(\d+)/g)].map((m) => Number(m[1]));
    assert.ok(vs.length >= 1, 'landing.html: expected a ?v= stylesheet link');
    for (const v of vs) assert.equal(v, truth, `landing.html: ?v=${v} != ${truth}`);
    assert.ok(landing.includes('styles.css?v=147'), 'landing.html must load styles.css');
  });

  it('links into the app login (index.html) and back', () => {
    const links = [...landing.matchAll(/href="index\.html"/g)];
    assert.ok(links.length >= 2, `landing.html: expected >=2 links to index.html, found ${links.length}`);
    assert.ok(read('index.html').includes('href="landing.html"'), 'index.html must link to landing.html');
  });

  it('makes no network call and loads no external script or asset', () => {
    assert.ok(!/https?:\/\//.test(landing), 'landing.html: no http(s) URLs allowed');
    assert.ok(!/<script[^>]+src=/.test(landing), 'landing.html: no external <script src>');
    assert.ok(!/supabase\.co/.test(landing), 'landing.html: no Supabase host');
    assert.ok(!/fetch\s*\(|XMLHttpRequest/.test(landing), 'landing.html: no fetch/XHR');
    assert.ok(landing.includes('http-equiv="Content-Security-Policy"'), 'landing.html: CSP meta required');
  });

  it('is English-only (v147: no language toggle, no Hindi strings, no script)', () => {
    assert.ok(landing.includes('<html lang="en">'), 'default language must be English (same as the app)');
    assert.ok(!landing.includes('landLangEn'), 'EN toggle button must be gone with Hindi mode');
    assert.ok(!landing.includes('landLangHi'), 'HI toggle button must be gone with Hindi mode');
    assert.ok(!/data-(en|hi)=/.test(landing), 'no data-en/data-hi toggle strings allowed');
    assert.ok(!/[\u0900-\u097F]/.test(landing), 'no Devanagari anywhere on the landing page');
    assert.ok(!/Hindi/.test(landing), 'no Hindi claim on the landing page');
    assert.ok(!/<script/.test(landing), 'landing.html: no inline script — the page is static');
  });
});

describe('landing content: only verified facts, no invented claims', () => {
  // The README previously carried false claims (live stats, 24 schools,
  // 12,450 users, St. Xavier strings). None of them may come back here.
  const FORBIDDEN = [
    /24 schools/i,
    /12,?450/,
    /St\.?\s*Xavier/i,
    /testimonial/i,
    /Free for Schools/i,
    /₹/,
    /\bRs\.?\s*\d/,
    /\$\d/,
    /\d{10}/, // no phone numbers
    /live stats/i,
  ];
  for (const re of FORBIDDEN) {
    it(`no forbidden claim matching ${re}`, () => {
      assert.ok(!re.test(landing), `landing.html matches forbidden pattern ${re}`);
    });
  }

  it('lists only features that exist at v147', () => {
    const mustHave = [
      'Students', 'Attendance', 'Fees', 'Exams', 'Homework',
      'Notices', 'Reports', 'WhatsApp reminders', 'Backup', 'Works offline',
    ];
    for (const f of mustHave) assert.ok(landing.includes(f), `landing.html: missing feature "${f}"`);
  });

  it('explains how a school starts (create a school account from the login screen)', () => {
    assert.ok(landing.includes('Create a school account'), 'getting-started step missing');
    assert.ok(landing.includes('login screen'), 'must point at the login screen signup');
    assert.ok(landing.includes('starts empty'), 'must say a new school starts empty (no demo data)');
  });

  it('states pricing is decided per school, with no numbers', () => {
    assert.ok(/Pricing is decided with each school/i.test(landing), 'pricing line missing');
    assert.ok(!/\d+\s*(per month|\/month|a month)/i.test(landing), 'landing.html: no priced plans');
  });
});

describe('login flow untouched', () => {
  it('index.html still has the login and app shells', () => {
    const html = read('index.html');
    assert.ok(html.includes('<div id="login" class="hidden">'), '#login shell missing');
    assert.ok(html.includes('<div id="app" class="hidden">'), '#app shell missing');
    assert.ok(html.includes('id="loginForm"'), 'login form missing');
    assert.ok(html.includes('id="signupForm"'), 'signup form missing');
    assert.ok(html.includes('data-i18n="loginBack"'), 'landing link must reuse the loginBack string');
  });

  it('app.js boot is still DOMContentLoaded -> restoreSession() -> showLogin()', () => {
    const app = read('app.js');
    assert.ok(app.includes("document.addEventListener('DOMContentLoaded'"), 'boot listener missing');
    assert.ok(app.includes('restoreSession().then(function (ok)'), 'boot must await restoreSession');
    assert.ok(app.includes('if (!ok) showLogin();'), 'no session must show the login screen');
  });

  it('fresh device boots to the login screen (harness: restoreSession resolves false)', async () => {
    const ctx = createAppContext();
    assert.equal(ctx.run('typeof showLogin'), 'function');
    assert.equal(ctx.run('typeof restoreSession'), 'function');
    assert.equal(await ctx.run('restoreSession()'), false);
  });

  it('no dead landing/demo leftovers in app.js', () => {
    const app = read('app.js');
    assert.ok(!/refreshLandingStats|DEMO_ACCOUNTS|demoLogin/.test(app), 'app.js still has landing/demo leftovers');
  });
});

describe('landing wired into the offline shell and the native build', () => {
  it('sw.js precaches landing.html, cache name still at the current version', () => {
    const sw = read('sw.js');
    assert.ok(sw.includes("'landing.html'"), 'sw.js APP_SHELL must list landing.html');
    const cacheV = sw.match(/CACHE_NAME\s*=\s*'school-saathi-v(\d+)'/);
    assert.ok(cacheV, 'sw.js CACHE_NAME missing');
    assert.equal(Number(cacheV[1]), truth);
  });

  it('styles.css has the landing block and no other landing CSS', () => {
    const css = read('styles.css');
    assert.ok(css.includes('/* ---------- public landing page (v147, landing.html)'), 'landing CSS block missing');
    assert.ok(css.includes('.landing-grid'), '.landing-grid missing');
    assert.ok(css.includes('body.landing'), 'body.landing text-selection rule missing');
  });

  it('scripts/build-www.sh copies landing.html into the Capacitor www/', () => {
    assert.ok(read('scripts/build-www.sh').includes('landing.html'), 'build-www.sh must copy landing.html');
  });
});
