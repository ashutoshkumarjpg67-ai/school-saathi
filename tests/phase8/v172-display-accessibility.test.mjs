import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createAppContext } from '../harness.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

test('v172: High Contrast mode toggles, persists, and sets data-contrast on documentElement', () => {
  const app = createAppContext();
  const res = app.run(`(function () {
    var lastAttr = null;
    document.documentElement.setAttribute = function (k, v) {
      if (k === 'data-contrast') lastAttr = v;
    };
    var init = getContrastMode();
    var setHi = setContrastMode('high');
    var afterHi = getContrastMode();
    var attrHi = lastAttr;
    var toggled = toggleHighContrast();
    var attrNorm = lastAttr;
    return { init: init, setHi: setHi, afterHi: afterHi, attrHi: attrHi, toggled: toggled, attrNorm: attrNorm };
  })()`);
  assert.equal(res.init, 'normal');
  assert.equal(res.setHi, 'high');
  assert.equal(res.afterHi, 'high');
  assert.equal(res.attrHi, 'high');
  assert.equal(res.toggled, 'normal');
  assert.equal(res.attrNorm, 'normal');
});

test('v172: Scalable Font Size validates sm/md/lg, persists, and sets data-font', () => {
  const app = createAppContext();
  const res = app.run(`(function () {
    var lastFont = null;
    document.documentElement.setAttribute = function (k, v) {
      if (k === 'data-font') lastFont = v;
    };
    var init = getFontScale();
    var lg = setFontScale('lg');
    var afterLg = getFontScale();
    var attrLg = lastFont;
    var sm = setFontScale('sm');
    var attrSm = lastFont;
    var bad = setFontScale('huge');
    var attrBad = lastFont;
    return { init: init, lg: lg, afterLg: afterLg, attrLg: attrLg, sm: sm, attrSm: attrSm, bad: bad, attrBad: attrBad };
  })()`);
  assert.equal(res.init, 'md');
  assert.equal(res.lg, 'lg');
  assert.equal(res.afterLg, 'lg');
  assert.equal(res.attrLg, 'lg');
  assert.equal(res.sm, 'sm');
  assert.equal(res.attrSm, 'sm');
  assert.equal(res.bad, 'md');
  assert.equal(res.attrBad, 'md');
});

test('v172: Display & Accessibility card renders in Settings and CSS rules exist', () => {
  const app = createAppContext();
  const htmlEn = app.run('sbDisplayPrefsCard()');
  assert.match(htmlEn, /Display & Accessibility/);
  assert.match(htmlEn, /setContrastMode\('high'\)/);
  assert.match(htmlEn, /setFontScale\('lg'\)/);
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  assert.match(css, /\[data-contrast="high"\]/);
  assert.match(css, /html\[data-font="lg"\]/);
  assert.match(css, /html\[data-font="sm"\]/);
});
