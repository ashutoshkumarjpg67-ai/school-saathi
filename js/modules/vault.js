/* School Saathi — js/modules/vault.js (v147: encryption at rest, device key).
   At-rest encryption for everything the app persists locally: the school
   DB (every dynamic DB_KEY: schoolSaathiDBv1, schoolSaathiDB_<uid>,
   schoolSaathiCloudDB, plus .bak / .quarantine copies), the accounts list
   (ACC_KEY — bcrypt password hashes), the Supabase session + school-map /
   migration / outbox / tombstone / snapshot helpers (SB_* keys), the local
   session (SESSION_KEY) and the sessionStorage snapshots (SB_SESSION_KEY,
   CLOUD_STUDENT_KEY, CLOUD_TEACHER_KEY — {acct, slice, token}).
   Classic script, NO build step: loaded with defer AFTER crypto.js and
   BEFORE app.js in index.html (and in the same order in the QA harness
   vm), so vaultEncode/vaultDecode exist by the time app.js runs. Uses
   sha256Hex, randomHex and timingSafeEqual from crypto.js — never called
   at load time, only from the storage helpers in app.js.

   Construction (all synchronous — the app's load/save paths are sync,
   and WebCrypto's AES-GCM is async, so it cannot be used here without
   rewriting every caller):
   - Cipher: ChaCha20 (RFC 8439), 256-bit key, 12-byte random nonce.
   - Auth: tag = SHA-256(keyHex + '|v1|' + SHA-256(nonceB64 + '.' + ctB64))
     (double hash, so no length-extension on the outer hash). Verified
     with timingSafeEqual before any decryption.
   - Envelope: 'ssv1$' + b64(nonce) + '.' + b64(ciphertext) + '.' + tagHex.
   - Device key: 32 random bytes, generated once per device with
     randomHex(32) (crypto.getRandomValues-backed) and stored in
     localStorage under VAULT_KEY_NAME. A fresh device generates it on
     first use; an existing device keeps it forever.

   HONEST LIMIT (read before relying on this): the device key lives in
   the same localStorage as the data it protects, because a PWA has no
   platform keystore to hold it in. That means this layer defeats casual
   inspection, a shoulder-surfed devtools dump, a support screenshot of
   stored data, and reading a DB export/backup without the key entry —
   but NOT an attacker who copies the whole localStorage (key included).
   Real protection against that attacker needs a key derived from
   something the attacker does not have — the school password at login
   (in-memory only, never stored) — which is a follow-up, not this
   branch: it needs a login-flow key handoff, a PIN-role key story
   (6-digit PINs are too weak as KDF input), and a cloud-session key
   story. This branch is the device-key layer the audit (H-5) asked
   for, with the migration and failure behaviour below.

   Migration + failure behaviour (never lock a user out of their data):
   - vaultDecode passes legacy PLAINTEXT through unchanged, so devices
     that stored data before v147 keep working; the next write of the
     same value seals it (migrate-on-write).
   - A sealed value whose tag fails (wrong key, torn write) decodes to
     null, and every reader treats that exactly like corrupt/missing
     data today: loadDB falls back to .bak, then quarantine + empty DB;
     the small helpers fall back to their empty defaults.
   - vaultEncode never throws: if sealing fails for any reason it
     returns the plaintext, so a save can never fail because of the
     vault. A failed seal is a downgrade to the old behaviour, not a
     data loss. */
'use strict';

var VAULT_KEY_NAME = 'schoolSaathiVaultKey';
var VAULT_PREFIX = 'ssv1$';

function vaultDeviceKeyHex() {
  // The per-device key: 64 hex chars = 32 bytes. Generated once, then
  // read back on every seal/open. A malformed stored value (hand-edited,
  // or written by a future format) is replaced — sealed data written
  // under the old key then fails its tag and is treated as corrupt,
  // exactly like a torn write today (never a crash, never a lockout
  // of plaintext data, which still decodes).
  try {
    var k = localStorage.getItem(VAULT_KEY_NAME);
    if (typeof k === 'string' && /^[0-9a-f]{64}$/.test(k)) return k;
    k = randomHex(32);
    try { localStorage.setItem(VAULT_KEY_NAME, k); } catch (e) {}
    return k;
  } catch (e) {
    return randomHex(32);
  }
}

function vaultHexToBytes(hex) {
  var out = [], i;
  for (i = 0; i + 1 < hex.length; i += 2) out.push(parseInt(hex.substr(i, 2), 16) || 0);
  return out;
}
function vaultBytesToHex(bytes) {
  var out = '', i;
  for (i = 0; i < bytes.length; i++) out += ('0' + (bytes[i] & 255).toString(16)).slice(-2);
  return out;
}
var VAULT_B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function vaultBytesToB64(bytes) {
  var out = '', i;
  for (i = 0; i < bytes.length; i += 3) {
    var b0 = bytes[i], b1 = (i + 1 < bytes.length) ? bytes[i + 1] : 0, b2 = (i + 2 < bytes.length) ? bytes[i + 2] : 0;
    out += VAULT_B64_ALPHABET[b0 >> 2];
    out += VAULT_B64_ALPHABET[((b0 & 3) << 4) | (b1 >> 4)];
    out += (i + 1 < bytes.length) ? VAULT_B64_ALPHABET[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += (i + 2 < bytes.length) ? VAULT_B64_ALPHABET[b2 & 63] : '=';
  }
  return out;
}
function vaultB64ToBytes(s) {
  var out = [], i, c, v = 0, bits = 0;
  for (i = 0; i < s.length; i++) {
    c = s.charAt(i);
    if (c === '=') break;
    var idx = VAULT_B64_ALPHABET.indexOf(c);
    if (idx < 0) return null;
    v = (v << 6) | idx; bits += 6;
    if (bits >= 8) { bits -= 8; out.push((v >> bits) & 255); }
  }
  return out;
}
function vaultUtf8Encode(str) {
  var bytes = [], i, c;
  for (i = 0; i < str.length; i++) {
    c = str.charCodeAt(i);
    if (c < 128) bytes.push(c);
    else if (c < 2048) { bytes.push(192 | (c >> 6)); bytes.push(128 | (c & 63)); }
    else if (c >= 55296 && c < 57344) {
      var c2 = str.charCodeAt(++i);
      var cp = 65536 + (((c & 1023) << 10) | (c2 & 1023));
      bytes.push(240 | (cp >> 18)); bytes.push(128 | ((cp >> 12) & 63)); bytes.push(128 | ((cp >> 6) & 63)); bytes.push(128 | (cp & 63));
    } else { bytes.push(224 | (c >> 12)); bytes.push(128 | ((c >> 6) & 63)); bytes.push(128 | (c & 63)); }
  }
  return bytes;
}
function vaultUtf8Decode(bytes) {
  var out = '', i = 0;
  while (i < bytes.length) {
    var b = bytes[i++];
    if (b < 128) out += String.fromCharCode(b);
    else if (b >= 192 && b < 224) { var b2 = bytes[i++] || 0; out += String.fromCharCode(((b & 31) << 6) | (b2 & 63)); }
    else if (b >= 224 && b < 240) { var c2 = bytes[i++] || 0, c3 = bytes[i++] || 0; out += String.fromCharCode(((b & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63)); }
    else if (b >= 240 && b < 248) {
      var d2 = bytes[i++] || 0, d3 = bytes[i++] || 0, d4 = bytes[i++] || 0;
      var cp = (((b & 7) << 18) | ((d2 & 63) << 12) | ((d3 & 63) << 6) | (d4 & 63)) - 65536;
      out += String.fromCharCode(55296 + (cp >> 10), 56320 + (cp & 1023));
    }
  }
  return out;
}
/* ChaCha20 (RFC 8439 §2), sync, 32-bit ops only. state: 16 words —
   constants, 8 key words, counter, 3 nonce words. 20 rounds (10 double
   rounds). Verified against the RFC 8439 §2.3.2 vector in the harness
   (tests/phase8/v147-vault.test.mjs). */
function vaultChaChaBlock(keyWords, counter, nonceWords) {
  var st = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574,
    keyWords[0], keyWords[1], keyWords[2], keyWords[3],
    keyWords[4], keyWords[5], keyWords[6], keyWords[7],
    counter, nonceWords[0], nonceWords[1], nonceWords[2]];
  var w = st.slice(), i;
  function qr(a, b, c, d) {
    w[a] = (w[a] + w[b]) | 0; w[d] = ((w[d] ^ w[a]) << 16) | ((w[d] ^ w[a]) >>> 16);
    w[c] = (w[c] + w[d]) | 0; w[b] = ((w[b] ^ w[c]) << 12) | ((w[b] ^ w[c]) >>> 20);
    w[a] = (w[a] + w[b]) | 0; w[d] = ((w[d] ^ w[a]) << 8) | ((w[d] ^ w[a]) >>> 24);
    w[c] = (w[c] + w[d]) | 0; w[b] = ((w[b] ^ w[c]) << 7) | ((w[b] ^ w[c]) >>> 25);
  }
  for (i = 0; i < 10; i++) {
    qr(0, 4, 8, 12); qr(1, 5, 9, 13); qr(2, 6, 10, 14); qr(3, 7, 11, 15);
    qr(0, 5, 10, 15); qr(1, 6, 11, 12); qr(2, 7, 8, 13); qr(3, 4, 9, 14);
  }
  var out = [];
  for (i = 0; i < 16; i++) {
    var x = (w[i] + st[i]) | 0;
    out.push(x & 255, (x >> 8) & 255, (x >> 16) & 255, (x >>> 24) & 255);
  }
  return out;
}
function vaultChaChaCrypt(keyHex, nonceBytes, dataBytes) {
  var keyBytes = vaultHexToBytes(keyHex);
  var kw = [], nw = [], i;
  for (i = 0; i < 8; i++) kw.push((keyBytes[i * 4] | (keyBytes[i * 4 + 1] << 8) | (keyBytes[i * 4 + 2] << 16) | (keyBytes[i * 4 + 3] << 24)) | 0);
  for (i = 0; i < 3; i++) nw.push((nonceBytes[i * 4] | (nonceBytes[i * 4 + 1] << 8) | (nonceBytes[i * 4 + 2] << 16) | (nonceBytes[i * 4 + 3] << 24)) | 0);
  var out = [], counter = 1, pos = 0;
  while (pos < dataBytes.length) {
    var block = vaultChaChaBlock(kw, counter, nw);
    counter = (counter + 1) >>> 0;
    for (i = 0; i < 64 && pos < dataBytes.length; i++, pos++) out.push(dataBytes[pos] ^ block[i]);
  }
  return out;
}
function vaultTag(keyHex, nonceB64, ctB64) {
  return sha256Hex(keyHex + '|v1|' + sha256Hex(nonceB64 + '.' + ctB64));
}
function vaultEncode(text) {
  // Seal a plaintext string. Returns the 'ssv1$...' envelope, or the
  // ORIGINAL text on any failure (never break a save for the vault).
  try {
    if (typeof text !== 'string') return text;
    var keyHex = vaultDeviceKeyHex();
    var nonceBytes = vaultHexToBytes(randomHex(12));
    var ctBytes = vaultChaChaCrypt(keyHex, nonceBytes, vaultUtf8Encode(text));
    var nonceB64 = vaultBytesToB64(nonceBytes), ctB64 = vaultBytesToB64(ctBytes);
    return VAULT_PREFIX + nonceB64 + '.' + ctB64 + '.' + vaultTag(keyHex, nonceB64, ctB64);
  } catch (e) { return text; }
}
function vaultDecode(stored) {
  // Unseal. Legacy plaintext passes through unchanged (migration);
  // a sealed value with a bad tag / torn envelope returns null
  // (readers treat it as corrupt/missing, as they do today).
  try {
    if (stored === null || typeof stored === 'undefined') return stored;
    if (typeof stored !== 'string') return stored;
    if (stored.indexOf(VAULT_PREFIX) !== 0) return stored;
    var parts = stored.slice(VAULT_PREFIX.length).split('.');
    if (parts.length !== 3) return null;
    var nonceB64 = parts[0], ctB64 = parts[1], tagHex = parts[2];
    var keyHex = vaultDeviceKeyHex();
    if (!timingSafeEqual(vaultTag(keyHex, nonceB64, ctB64), tagHex)) return null;
    var nonceBytes = vaultB64ToBytes(nonceB64), ctBytes = vaultB64ToBytes(ctB64);
    if (nonceBytes === null || ctBytes === null || nonceBytes.length !== 12) return null;
    var plain = vaultChaChaCrypt(keyHex, nonceBytes, ctBytes);
    return vaultUtf8Decode(plain);
  } catch (e) { return null; }
}
