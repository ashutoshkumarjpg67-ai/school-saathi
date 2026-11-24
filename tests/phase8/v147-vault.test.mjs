// tests/phase8/v147-vault.test.mjs — v147 encryption at rest (device key).
//
// The vault (js/modules/vault.js) seals everything the app persists:
// the school DB (every dynamic DB_KEY + .bak/.quarantine), the accounts
// list, the SB_* sync/session helpers, the local session, and the
// sessionStorage snapshots. ChaCha20 (RFC 8439) + a double-SHA-256 tag,
// all synchronous (the app's load/save paths are sync; WebCrypto AES-GCM
// is async and cannot be used here).
//
// Run: node --test tests/phase8/v147-vault.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv } from 'node:crypto';
import { createAppContext } from '../harness.mjs';

function sealCheck(app, key) {
  const raw = app.storage.getItem(key);
  assert.ok(raw, `nothing stored under ${key}`);
  return raw;
}

describe('vault cipher (ChaCha20, RFC 8439)', () => {
  it('matches Node OpenSSL ChaCha20 on the RFC 8439 §2.3.2 vector inputs', () => {
    const app = createAppContext();
    // RFC 8439 §2.3.2: key 00:01:..:1f, nonce 00:00:00:09:00:00:00:4a:00:00:00:00.
    const keyHex = Array.from({ length: 32 }, (_, i) => ('0' + i.toString(16)).slice(-2)).join('');
    const nonceHex = '000000090000004a00000000';
    const plain = "Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.";
    // OpenSSL's raw 'chacha20' takes a 16-byte IV: 4-byte little-endian
    // counter (1, as in the RFC vector) + the 12-byte nonce.
    const iv = Buffer.concat([Buffer.from([1, 0, 0, 0]), Buffer.from(nonceHex, 'hex')]);
    const expected = createCipheriv('chacha20', Buffer.from(keyHex, 'hex'), iv);
    const expectedCt = Buffer.concat([expected.update(Buffer.from(plain, 'utf8')), expected.final()]);
    const got = app.run(
      `vaultBytesToHex(vaultChaChaCrypt('${keyHex}', vaultHexToBytes('${nonceHex}'), vaultUtf8Encode(${JSON.stringify(plain)})))`
    );
    assert.equal(got, expectedCt.toString('hex'));
  });

  it('round-trips ASCII, Devanagari, emoji and a 100 KB payload', () => {
    const app = createAppContext();
    const cases = [
      'hello world',
      'राम कुमार — कक्षा 12, शुल्क ₹1,250',
      'emoji 🎒📚✅ and mixed हिंदी text',
      'x'.repeat(100000),
      '',
    ];
    for (const c of cases) {
      const sealed = app.run(`vaultEncode(${JSON.stringify(c)})`);
      assert.ok(sealed.startsWith('ssv1$'), `no envelope: ${String(sealed).slice(0, 20)}`);
      assert.equal(sealed.split('.').length, 3, 'envelope must have nonce.ct.tag');
      assert.equal(app.run(`vaultDecode(${JSON.stringify(sealed)})`), c);
    }
  });

  it('two seals of the same plaintext differ (random nonce) and both open', () => {
    const app = createAppContext();
    const a = app.run(`vaultEncode('same secret')`);
    const b = app.run(`vaultEncode('same secret')`);
    assert.notEqual(a, b, 'same nonce reused — catastrophic for a stream cipher');
    assert.equal(app.run(`vaultDecode(${JSON.stringify(a)})`), 'same secret');
    assert.equal(app.run(`vaultDecode(${JSON.stringify(b)})`), 'same secret');
  });

  it('tampering with the ciphertext or the tag fails closed (null)', () => {
    const app = createAppContext();
    const sealed = app.run(`vaultEncode('do not touch')`);
    const parts = sealed.split('.');
    const flip = (s) => s.slice(0, 10) + (s[10] === 'A' ? 'B' : 'A') + s.slice(11);
    assert.equal(app.run(`vaultDecode(${JSON.stringify(parts[0] + '.' + flip(parts[1]) + '.' + parts[2])})`), null);
    assert.equal(app.run(`vaultDecode(${JSON.stringify(parts[0] + '.' + parts[1] + '.' + flip(parts[2]))})`), null);
    assert.equal(app.run(`vaultDecode('ssv1$garbage')`), null);
  });

  it('legacy plaintext passes through unchanged; null stays null', () => {
    const app = createAppContext();
    assert.equal(app.run(`vaultDecode('{"v":2,"students":[]}')`), '{"v":2,"students":[]}');
    assert.equal(app.run(`vaultDecode(null)`), null);
    assert.equal(app.run(`vaultDecode('')`), '');
  });

  it('device key is 32 random bytes, stored once, stable across calls', () => {
    const app = createAppContext();
    const k1 = app.run('vaultDeviceKeyHex()');
    const k2 = app.run('vaultDeviceKeyHex()');
    assert.match(k1, /^[0-9a-f]{64}$/);
    assert.equal(k1, k2, 'key must not regenerate on every call');
    assert.equal(app.storage.getItem('schoolSaathiVaultKey'), k1);
    // A fresh device gets a different key.
    const app2 = createAppContext();
    assert.notEqual(app2.run('vaultDeviceKeyHex()'), k1);
  });
});

describe('vault at the storage layer', () => {
  it('saveDB stores a sealed DB; loadDB returns the identical DB', () => {
    const app = createAppContext();
    app.run(`db = seedDB(); saveDB(db);`);
    const raw = sealCheck(app, 'schoolSaathiDBv1');
    assert.ok(raw.startsWith('ssv1$'), 'DB stored as plaintext JSON!');
    assert.ok(!raw.includes('Aarav'), 'student name visible in stored DB');
    const back = app.run(`loadDB()`);
    assert.equal(back.students.length, app.run('seedDB().students.length'));
    assert.equal(back.v, 2);
    // The .bak twin is sealed too.
    assert.ok(sealCheck(app, 'schoolSaathiDBv1.bak').startsWith('ssv1$'));
  });

  it('a legacy plaintext DB still loads, and the next save seals it (migrate-on-write)', () => {
    const app = createAppContext();
    const legacy = app.run('JSON.stringify(seedDB())');
    app.storage.setItem('schoolSaathiDBv1', legacy);
    const loaded = app.run('loadDB()');
    assert.ok(loaded && loaded.students.length > 0, 'legacy DB did not load');
    // loadDB on a v2 DB re-saves through saveDB, so it is sealed already.
    assert.ok(app.storage.getItem('schoolSaathiDBv1').startsWith('ssv1$'), 'legacy DB was not sealed on save');
  });

  it('a sealed DB with a bad tag falls back to .bak, like corrupt JSON', () => {
    const app = createAppContext();
    app.run(`db = seedDB(); saveDB(db);`);
    const goodCount = app.run('loadDB().students.length');
    // Corrupt the primary with a bad-tag envelope; .bak stays good.
    const bad = app.run(`vaultEncode('tampered')`).split('.');
    app.storage.setItem('schoolSaathiDBv1', bad[0] + '.' + bad[1] + '.' + '00'.repeat(32));
    const recovered = app.run('loadDB()');
    assert.equal(recovered.students.length, goodCount, 'did not recover from .bak');
  });

  it('accounts are sealed; loadAccounts still returns the list', () => {
    const app = createAppContext();
    app.run(`saveAccounts([{ email: 'a@school.in', pwHash: 'bcrypt$xyz', uid: 'u1', role: 'school', name: 'Test School' }]);`);
    const raw = sealCheck(app, 'schoolSaathiAccounts');
    assert.ok(raw.startsWith('ssv1$'), 'accounts stored as plaintext JSON!');
    assert.ok(!raw.includes('a@school.in'), 'email visible in stored accounts');
    const list = app.run('loadAccounts()');
    assert.equal(list.length, 1);
    assert.equal(list[0].email, 'a@school.in');
  });

  it('local session is sealed; expired and future-dated sessions are rejected by restore', async () => {
    const app = createAppContext();
    app.run(`state.role = 'school'; state.user = { email: 'a@school.in', uid: 'u1', role: 'school', name: 'Test School' }; state.view = 'dashboard'; persistSession();`);
    const raw = sealCheck(app, 'schoolSaathiSession');
    assert.ok(raw.startsWith('ssv1$'), 'session stored as plaintext JSON!');
    assert.ok(!raw.includes('a@school.in'), 'email visible in stored session');
    // The sealed value decodes to the exact session that was persisted.
    assert.equal(app.run(`JSON.parse(vaultDecode(localStorage.getItem('schoolSaathiSession'))).email`), 'a@school.in');
    // Expired (at = 0): rejected and the stored session is cleared.
    app.run(`localStorage.setItem('schoolSaathiSession', vaultEncode(JSON.stringify({ role: 'school', email: 'a@school.in', view: 'dashboard', at: 0 })));`);
    assert.equal(await app.run('restoreSession()'), false, 'expired session restored');
    assert.equal(app.storage.getItem('schoolSaathiSession'), null, 'expired session was not cleared');
    // Future-dated (clock-skew hole, #77): rejected and cleared too.
    app.run(`localStorage.setItem('schoolSaathiSession', vaultEncode(JSON.stringify({ role: 'school', email: 'a@school.in', view: 'dashboard', at: Date.now() + 3600000 })));`);
    assert.equal(await app.run('restoreSession()'), false, 'future-dated session restored');
    assert.equal(app.storage.getItem('schoolSaathiSession'), null, 'future-dated session was not cleared');
  });

  it('a fresh sealed session restores end to end (persist -> restore -> loginAs)', async () => {
    const app = createAppContext();
    // The harness has no <select> `options` stub, so the real renderApp
    // throws in node:vm (no existing test calls loginAs). Stub rendering
    // out — session logic is what's under test here, not rendering.
    // (Same trick as tests/session-expiry.test.mjs.)
    app.run(`renderApp = function () {}; toast = function (m) { window.__lastToast = m; };`);
    app.run(`saveAccounts([{ uid: 'u1', name: 'Test School', email: 'a@school.in', role: 'school' }]);`);
    app.run(`state.role = 'school'; state.user = { email: 'a@school.in', uid: 'u1', role: 'school', name: 'Test School' }; state.view = 'dashboard'; persistSession();`);
    app.run(`state.role = null; state.user = null;`);
    assert.equal(await app.run('restoreSession()'), true, 'sealed session did not restore');
    assert.equal(app.run('state.role'), 'school');
    assert.equal(app.run('state.user.email'), 'a@school.in');
    // The restored session is re-persisted sealed, with `at` preserved.
    assert.ok(app.storage.getItem('schoolSaathiSession').startsWith('ssv1$'));
  });

  it('sessionStorage snapshots are sealed (sessSet/sessGet round-trip)', () => {
    const app = createAppContext();
    // The harness has no sessionStorage stub; install a minimal one in
    // the vm context, mirroring the browser API.
    app.run(`sessionStorage = { _m: {}, getItem(k) { return (k in this._m) ? this._m[k] : null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };`);
    const snap = JSON.stringify({ acct: { email: 's@x.in' }, slice: { v: 2 }, token: 'secret-token-123' });
    app.run(`sessSet('schoolSaathiCloudStudent', ${JSON.stringify(snap)});`);
    const stored = app.run(`sessionStorage.getItem('schoolSaathiCloudStudent')`);
    assert.ok(stored.startsWith('ssv1$'), 'cloud snapshot stored as plaintext!');
    assert.ok(!stored.includes('secret-token-123'), 'token visible in stored snapshot');
    assert.equal(app.run(`sessGet('schoolSaathiCloudStudent')`), snap);
  });

  it('outbox + tombstones + snapshots seal at rest and round-trip', () => {
    const app = createAppContext();
    app.run(`sbOutboxSave('u1', [{ op: 'upsert', table: 'students' }]);`);
    assert.ok(sealCheck(app, app.run(`sbOutboxKey('u1')`)).startsWith('ssv1$'));
    // vm-realm objects fail deepStrictEqual on prototypes — compare JSON.
    assert.equal(JSON.stringify(app.run(`sbOutboxLoad('u1')`)), JSON.stringify([{ op: 'upsert', table: 'students' }]));
    app.run(`sbTombSave('u1', { s1: 1 });`);
    assert.ok(sealCheck(app, app.run(`'schoolSaathiTombstones:u1'`)).startsWith('ssv1$'));
    assert.equal(JSON.stringify(app.run(`sbTombLoad('u1')`)), JSON.stringify({ s1: 1 }));
  });

  it('backup export -> wipe -> restore still round-trips (sealed storage, plaintext file)', () => {
    const app = createAppContext();
    app.run(`db = seedDB(); saveDB(db);`);
    app.run('lastFullBackup = buildFullBackup();');
    const backup = app.get('lastFullBackup');
    assert.equal(backup.db.students.length, 40);
    // Wipe: the local db is now empty, as after Reset All Data.
    app.run('db = emptyDb(); saveDB(db);');
    assert.equal(app.run('loadDB().students.length'), 0);
    // Restore from the exported backup (the file stays plaintext — it is
    // the user's own export; the seal applies to on-device storage).
    const res = app.run('restoreFullBackup(lastFullBackup)');
    assert.equal(res.ok, true);
    assert.equal(res.counts.students, 40);
    assert.equal(app.run('loadDB().students.length'), 40);
    assert.equal(app.run('loadDB().feeRecords.length'), 70);
    // The restored db is sealed at rest again after the save + reload.
    assert.ok(app.storage.getItem('schoolSaathiDBv1').startsWith('ssv1$'));
  });
});
