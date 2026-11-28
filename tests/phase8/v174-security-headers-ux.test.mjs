import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createAppContext } from '../harness.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

test('v174: Cloudflare Pages _headers enforces CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy', () => {
  const hdrs = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8');
  assert.match(hdrs, /Content-Security-Policy:/);
  assert.match(hdrs, /frame-ancestors 'none'/);
  assert.match(hdrs, /Strict-Transport-Security:/);
  assert.match(hdrs, /X-Frame-Options:\s*DENY/);
  assert.match(hdrs, /X-Content-Type-Options:\s*nosniff/);
  assert.match(hdrs, /Referrer-Policy:/);
});

test('v174: Inactivity Auto-Logout validates allowed intervals (0/15/30/60) and persists', () => {
  const app = createAppContext();
  const res = app.run(`(function () {
    var init = getIdleLogoutMin();
    var m30 = setIdleLogoutMin(30);
    var saved = getIdleLogoutMin();
    var bad = setIdleLogoutMin(999);
    var off = setIdleLogoutMin(0);
    return { init: init, m30: m30, saved: saved, bad: bad, off: off };
  })()`);
  assert.equal(res.init, 0);
  assert.equal(res.m30, 30);
  assert.equal(res.saved, 30);
  assert.equal(res.bad, 0);
  assert.equal(res.off, 0);
});

test('v174: copySchoolLoginLink builds direct ?code=SS-XXXX&role=parent URL', () => {
  const app = createAppContext();
  const url = app.run(`(function () {
    db = { profile: { schoolCode: 'SS-2DZ6' } };
    return copySchoolLoginLink();
  })()`);
  assert.match(String(url), /\?code=SS-2DZ6&role=parent$/);
});
