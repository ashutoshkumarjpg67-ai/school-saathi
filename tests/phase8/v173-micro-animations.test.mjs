import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createAppContext } from '../harness.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

test('v173: sbPageEnterAnim applies page-enter class cleanly on navigation', () => {
  const app = createAppContext();
  const ok = app.run(`(function () {
    var added = false, removed = false;
    var origDollar = $;
    var fakePage = {
      offsetWidth: 0,
      classList: {
        remove: function (c) { if (c === 'page-enter') removed = true; },
        add: function (c) { if (c === 'page-enter') added = true; }
      }
    };
    $ = function (id) { return id === 'page' ? fakePage : origDollar(id); };
    var r = sbPageEnterAnim();
    $ = origDollar;
    return r && removed && added;
  })()`);
  assert.equal(ok, true);
});

test('v173: GPU-only micro-animations exist and respect prefers-reduced-motion', () => {
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  assert.match(css, /@keyframes ssPageEnter/);
  assert.match(css, /@keyframes ssModalIn/);
  assert.match(css, /\.page\.page-enter\{animation:ssPageEnter/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  // Ensure zero backdrop-filter blur was reintroduced
  assert.doesNotMatch(css, /backdrop-filter\s*:\s*blur/i);
});
