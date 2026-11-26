// tests/phase8/v159-turnstile.test.mjs — Cloudflare Turnstile integration tests.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppContext } from '../harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const INDEX_SRC = readFileSync(join(ROOT, 'index.html'), 'utf8');
const SW_SRC = readFileSync(join(ROOT, 'sw.js'), 'utf8');
const FN_SRC = readFileSync(join(ROOT, 'supabase', 'functions', 'submit-admission', 'index.ts'), 'utf8');

describe('v159 — Cloudflare Turnstile frontend & Edge Function', () => {
  it('mounts, captures token, and resets cleanly via mock window.turnstile', () => {
    const app = createAppContext();
    app.run(`
      var __rendered = null;
      var __resetId = null;
      window.turnstile = {
        render: function (el, opts) { __rendered = opts; opts.callback('tok-live-123'); return 'wid-1'; },
        reset: function (id) { __resetId = id; },
        remove: function () {}
      };
      sbTurnstileMount('signup', 'suTurnstile', 'signup');
    `);
    assert.equal(app.get('SB_TURNSTILE_SITEKEY'), '0x4AAAAAAGUl8mHM68xzm35Z');
    assert.equal(app.run(`sbTurnstileToken('signup')`), 'tok-live-123');
    app.run(`sbTurnstileReset('signup')`);
    assert.equal(app.run(`sbTurnstileToken('signup')`), '');
    assert.equal(app.get('__resetId'), 'wid-1');
  });

  it('index.html & sw.js wire turnstile.js, #suTurnstile, and CSP challenges.cloudflare.com', () => {
    assert.ok(INDEX_SRC.includes('https://challenges.cloudflare.com'));
    assert.ok(INDEX_SRC.includes('id="suTurnstile"'));
    assert.ok(INDEX_SRC.includes('js/modules/turnstile.js'));
    assert.ok(SW_SRC.includes('js/modules/turnstile.js'));
  });

  it('submit-admission Edge Function enforces canonical siteverify (success, action, hostname, fail-closed)', () => {
    assert.ok(FN_SRC.includes('https://challenges.cloudflare.com/turnstile/v0/siteverify'));
    assert.ok(FN_SRC.includes("EXPECTED_ACTION = 'admission_apply'"));
    assert.ok(FN_SRC.includes('expectedHostnames.has(verifyResult.hostname)'));
    assert.ok(FN_SRC.includes("Deno.env.get('TURNSTILE_SECRET')"));
    assert.ok(!FN_SRC.includes('localhost'), 'production hostname allowlist must not include localhost');
  });
});
