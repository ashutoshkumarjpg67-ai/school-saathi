/* School Saathi — js/modules/crypto.js (Phase 2, module 1 of the app.js split).
   Crypto / identity helpers: bcrypt (v72) + salted SHA-256 (legacy) +
   djb2 (legacy) password hashes, collision-proof record ids, random
   PINs, Aadhaar last-4.
   Classic script, NO build step: loaded with defer BEFORE app.js in
   index.html (and before app.js in the QA harness vm), so these globals
   exist by the time app.js runs. Pure functions + two counters; the only
   call-time dependencies on app.js globals are digitsOnly() (hashPin,
   aadhaarLast4) and loadAccounts()/saveAccounts() (upgradePwHash) —
   never called at load time, only after both scripts have run. */
'use strict';

function hashPw(s) { var h = 5381, i; for (i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return 'h' + h.toString(36); } // v36: LEGACY djb2 — kept only so accounts created before v36 still verify; verifyPw() below upgrades them on next login. Never use for new hashes.
/* v36: collision-proof record ids (audit item 1) + salted password
   hashing (audit item 14) + random PINs (audit item 15). The uniqueId
   shape is PR #3's approach (timestamp + counter + random suffix),
   implemented natively on v35 — the PR branch itself is never merged
   (base v31; its attendance fix conflicts with v34's "Not marked"
   design and its parent-login fix is superseded by v35). */
var __uidCounter = 0;
function randomHex(nBytes) {
  // Random bytes as hex, without the built-in random helper (the
  // harness bans that helper in app.js): crypto.getRandomValues on
  // LCG fallback for contexts without WebCrypto (never the path a real
  // browser takes — the app is served over HTTPS, so WebCrypto is there).
  var out = '', i;
  try {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      var buf = new Uint8Array(nBytes);
      crypto.getRandomValues(buf);
      for (i = 0; i < buf.length; i++) out += ('0' + buf[i].toString(16)).slice(-2);
      return out;
    }
  } catch (e) {}
  if (!__randState) __randState = (Date.now() % 2147483647) || 1;
  for (i = 0; i < nBytes; i++) {
    __randState = (__randState * 1103515245 + 12345) % 2147483648;
    out += ('0' + ((__randState >>> 16) % 256).toString(16)).slice(-2);
  }
  return out;
}
var __randState = 0;
function uniqueId(prefix) {
  // Timestamp + per-session counter + 6 hex chars of randomness: two
  // records minted in the same millisecond still differ (the counter
  // alone guarantees it; the random suffix covers a counter reset).
  __uidCounter = (__uidCounter + 1) % 1000000;
  return (prefix || '') + Date.now().toString(36) + '-' + __uidCounter.toString(36) + '-' + randomHex(3);
}
function randomPin() {
  // A 4-digit student PIN, 1000-9999, from crypto randomness (v36: new
  // students never get a phone-derived default PIN).
  return String(parseInt(randomHex(2), 16) % 9000 + 1000);
}
/* v36: SHA-256 in plain JS (sync). The login paths are synchronous and
   WebCrypto's digest is async, so a hand-rolled SHA-256 keeps every
   login path sync while replacing the djb2 hash. Verified against the
   FIPS 180-4 vectors in the harness ('' and 'abc'). */
var __SHA256_K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
function sha256Hex(input) {
  var bytes = [], i, c;
  for (i = 0; i < input.length; i++) {
    c = input.charCodeAt(i);
    if (c < 128) bytes.push(c);
    else if (c < 2048) { bytes.push(192 | (c >> 6)); bytes.push(128 | (c & 63)); }
    else if (c >= 55296 && c < 57344) {
      var c2 = input.charCodeAt(++i);
      var cp = 65536 + (((c & 1023) << 10) | (c2 & 1023));
      bytes.push(240 | (cp >> 18)); bytes.push(128 | ((cp >> 12) & 63)); bytes.push(128 | ((cp >> 6) & 63)); bytes.push(128 | (cp & 63));
    } else { bytes.push(224 | (c >> 12)); bytes.push(128 | ((c >> 6) & 63)); bytes.push(128 | (c & 63)); }
  }
  var bitLen = bytes.length * 8;
  bytes.push(128);
  while (bytes.length % 64 !== 56) bytes.push(0);
  bytes.push(0, 0, 0, 0, (bitLen >>> 24) & 255, (bitLen >>> 16) & 255, (bitLen >>> 8) & 255, bitLen & 255);
  var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
  var b, t, w = [], s0, s1, S0, S1, ch, maj, t1, t2, a, bb, cc, d, e, f, g, h;
  for (b = 0; b < bytes.length; b += 64) {
    for (t = 0; t < 16; t++) w[t] = (bytes[b + t * 4] << 24) | (bytes[b + t * 4 + 1] << 16) | (bytes[b + t * 4 + 2] << 8) | bytes[b + t * 4 + 3];
    for (t = 16; t < 64; t++) {
      s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    a = H[0]; bb = H[1]; cc = H[2]; d = H[3]; e = H[4]; f = H[5]; g = H[6]; h = H[7];
    for (t = 0; t < 64; t++) {
      S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      ch = (e & f) ^ (~e & g);
      t1 = (h + S1 + ch + __SHA256_K[t] + w[t]) | 0;
      S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      maj = (a & bb) ^ (a & cc) ^ (bb & cc);
      t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = cc; cc = bb; bb = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + bb) | 0; H[2] = (H[2] + cc) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  var out = '';
  for (i = 0; i < 8; i++) out += ('00000000' + (H[i] >>> 0).toString(16)).slice(-8);
  return out;
}
/* v72 (P1-1): bcrypt replaces salted SHA-256 as the new-hash scheme.
   bcryptjs 2.4.3 is vendored at js/bcrypt.js (loaded before this file)
   and emits $2a$ hashes, which the server verifies natively with
   pgcrypto crypt() (SQL 23) — bcryptjs 3.x emits $2b$, which pgcrypto
   does NOT verify (returns garbage), so 2.4.3 is pinned deliberately.
   Cost 10 (~100 ms) keeps logins fast on low-end phones. bcrypt caps
   input at 72 bytes; passwords/PINs here are far shorter. If bcryptjs
   ever fails to load, new hashes fall back to the s256$ scheme and
   logins keep working — never break a login for a missing library. */
function bcryptAvailable() { return !!(typeof dcodeIO !== 'undefined' && dcodeIO && dcodeIO.bcrypt && dcodeIO.bcrypt.hashSync && dcodeIO.bcrypt.compareSync); }
function hashPwBcrypt(pw) { return 'bcrypt$' + dcodeIO.bcrypt.hashSync(pw, 10); }
function hashSchemeOf(h) { if (!h) return ''; if (h.indexOf('bcrypt$') === 0) return 'bcrypt'; if (h.indexOf('s256$') === 0) return 'sha256'; return 'djb2'; }
function hashPwNew(pw) {
  // v72: bcrypt when available, s256$ fallback (see note above).
  // The stored value is self-describing (bcrypt$ / s256$ / h...),
  // so verifyPw() below accepts all three forever.
  if (bcryptAvailable()) return hashPwBcrypt(pw);
  var salt = randomHex(16);
  return 's256$' + salt + '$' + sha256Hex(salt + '|' + pw);
}
function verifyPw(pw, a) {
  // Verifies against any of the three schemes. Returns { ok, legacy }:
  // legacy is true for djb2 AND s256$ — the caller upgrades both to
  // bcrypt after a successful login (never locks anyone out: the old
  // hash verifies first, then the upgrade re-hashes).
  if (!a || !a.pwHash) return { ok: false };
  var h = a.pwHash;
  if (h.indexOf('bcrypt$') === 0) {
    if (!bcryptAvailable()) return { ok: false };
    return { ok: dcodeIO.bcrypt.compareSync(pw, h.slice(7)), legacy: false };
  }
  if (h.indexOf('s256$') === 0) {
    var parts = h.split('$');
    if (parts.length !== 3) return { ok: false };
    return { ok: sha256Hex(parts[1] + '|' + pw) === parts[2], legacy: true };
  }
  return { ok: hashPw(pw) === h, legacy: true };
}
function upgradePwHash(a, pw) {
  // After a successful legacy login: re-hash with the new scheme and
  // persist. The account object is mutated in place (state.user keeps
  // working) and the stored list is rewritten by email.
  a.pwHash = hashPwNew(pw);
  a.hashScheme = a.pwHash.indexOf('bcrypt$') === 0 ? 'bcrypt' : 'sha256';
  var list = loadAccounts();
  for (var i = 0; i < list.length; i++) if (list[i].email === a.email) list[i] = a;
  saveAccounts(list);
}
/* v54 (A1): student PINs are stored as salted SHA-256 hashes, never
   plaintext — the same scheme as account passwords (hashPwNew).
   parentPin survives only on records written before v54; migrateV54
   hashes it once and drops it. */
function hashPin(pin) { return hashPwNew(digitsOnly(pin)); }
function verifyPin(pin, s) {
  if (!s || !s.parentPinHash) return false;
  return verifyPw(digitsOnly(pin), { pwHash: s.parentPinHash }).ok;
}
function pinHasPin(s) { return !!(s && (s.parentPinHash || s.parentPin)); }
/* v36: only the LAST 4 digits of an Aadhaar are ever stored — locally
   or on the server. The full 12-digit number is never persisted
   anywhere (audit item 16). */
function aadhaarLast4(v) { var d = digitsOnly(v); return d.length ? d.slice(-4) : ''; }
