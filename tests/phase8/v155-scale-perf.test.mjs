// tests/phase8/v155-scale-perf.test.mjs — scale & performance improvements.
// Verifies:
//  1. vault.js TextEncoder/TextDecoder + Uint8Array ChaCha20 round-trip (ASCII + Devanagari + emoji)
//  2. loadDB skips redundant re-seal + localStorage write on clean boot
//  3. saveDB recovers from QuotaExceededError by evicting .bak/.quarantine and retrying
//  4. sbIdbMirrorSet is fail-silent when indexedDB is absent
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAppContext } from '../harness.mjs';

describe('scale & perf — vault UTF-8 + Uint8Array ChaCha20', () => {
  it('round-trips ASCII, Hindi Devanagari, and 4-byte emoji', () => {
    const app = createAppContext();
    const sample = 'School Saathi — बिहार विद्यालय 🎓✨ 12345';
    const sealed = app.run(`vaultEncode(${JSON.stringify(sample)})`);
    assert.ok(sealed.startsWith('ssv1$'));
    const decoded = app.run(`vaultDecode(${JSON.stringify(sealed)})`);
    assert.equal(decoded, sample);
  });
});

describe('scale & perf — loadDB skips redundant saveDB on clean boot', () => {
  it('leaves the already-sealed DB envelope untouched when migrations change nothing', () => {
    const app = createAppContext();
    app.run('db = seedDB(); saveDB(db);');
    // First loadDB may run migrations (e.g. bcrypt PIN hash) and re-save.
    app.run('loadDB();');
    const before = app.storage.getItem('schoolSaathiDBv1');
    assert.ok(before && before.startsWith('ssv1$'));
    // Second loadDB on the clean, already-sealed DB must NOT re-seal/rewrite.
    const d2 = app.run('loadDB();');
    assert.equal(d2.v, 2);
    const after = app.storage.getItem('schoolSaathiDBv1');
    assert.equal(after, before, 'clean loadDB must not re-seal and rewrite localStorage');
  });
});

describe('scale & perf — saveDB quota recovery + IndexedDB mirror', () => {
  it('evicts .bak and .quarantine on QuotaExceededError and succeeds on retry', () => {
    const app = createAppContext();
    app.run('db = emptyDb(); saveDB(db);');
    app.storage.setItem('schoolSaathiDBv1.quarantine', 'old-corrupt-blob');
    // Simulate a full localStorage that only succeeds once .bak is removed.
    app.run(`
      var __origSet = localStorage.setItem;
      var __origRm = localStorage.removeItem;
      var __bakRemoved = false;
      localStorage.removeItem = function (k) {
        if (k === DB_KEY + '.bak') __bakRemoved = true;
        return __origRm.call(localStorage, k);
      };
      localStorage.setItem = function (k, v) {
        if (k === DB_KEY && !__bakRemoved) {
          var err = new Error('QuotaExceededError');
          err.name = 'QuotaExceededError';
          throw err;
        }
        return __origSet.call(localStorage, k, v);
      };
    `);
    const ok = app.run('saveDB(db)');
    assert.equal(ok, true, 'saveDB must recover by freeing .bak and retrying');
    assert.equal(app.run('__bakRemoved'), true);
    assert.equal(app.storage.getItem('schoolSaathiDBv1.quarantine'), null);
  });

  it('sbIdbMirrorSet is present and fail-silent without indexedDB', () => {
    const app = createAppContext();
    assert.equal(typeof app.get('sbIdbMirrorSet'), 'function');
    assert.doesNotThrow(() => app.run(`sbIdbMirrorSet('k', 'v')`));
  });
});
