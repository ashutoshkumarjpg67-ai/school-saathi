/* School Saathi — static build. v31: SERVER-FIRST for schools logged in
   via Supabase — the server is the source of truth, the local store is a
   cache/mirror that syncs on login, on save and on reconnect (outbox for
   offline changes). Local-only accounts (no server session) still work
   exactly as before: everything lives in localStorage on this device.
   v35: parent login is REMOVED; student login (admission no. + PIN) and
   teacher login (email + password, local device accounts) replace it.
   v36: uniqueId() everywhere (no more Date.now() record ids); salted
   SHA-256 password hashes with djb2 upgrade-on-login; new students get
   a random PIN (never a phone-derived default); only the last 4 digits
   of an Aadhaar are stored; the demo DB no longer seeds on fresh
   devices; logout no longer lets an in-flight sync write "Backup
   failed" after the session is cleared.
   v37: exam creation (school + teacher, own classes only); classes
   Nursery–12th; full-year Apr–Mar fee trend; full backup/restore
   (JSON, safety copy first); in-app version check so a stale SW
   shell flips to the new build within one or two plain loads;
   local-only accounts show a stable "Not linked to server" line.
   v38: WhatsApp via wa.me links ONLY (manual send — the app opens
   the chat with the message prefilled, the user presses Send inside
   WhatsApp). No API, no automation, no bot, no auto-send. Fee due
   reminders, absent/late alerts, fee receipt share, profile chat.
   The app logs "WhatsApp opened", never "sent" — it cannot know
   whether the user pressed Send.
   v39: the receipt view is reachable from stable places (Receipt
   column on the Fees list and on the profile Fee History tab — the
   only entry used to be the fee profile's bottom card plus the
   one-shot view right after collecting); a receipt the server lacks
   uploads even when a stale snapshot entry says it already synced
   (the live test account: RCP-2026-003 was server-minted yet never
   landed, and the guard failed every cycle with "Backup failed");
   one table's upload failure no longer kills the whole sync pass —
   the status line now names the failing table; verify/guard count
   only numbered receipts. */
'use strict';

/* ================= constants ================= */
var APP_VERSION = 58;
var DB_KEY = 'schoolSaathiDBv1';
var SESSION_KEY = 'schoolSaathiSession';
var SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // Phase 1 (CR-1/H-1): absolute max age of a local session — 30 days from the interactive login.
var NAVY = '#0A1E4B', BLUE = '#2563EB', GREEN = '#16A34A', ORANGE = '#EA8600', RED = '#DC2626';
var FEE_MONTHS = [ // monthly ledger — sums MUST equal 8,45,000 collected / 1,20,000 pending
  { m: 'Apr', collected: 165000, pending: 25000 },
  { m: 'May', collected: 178000, pending: 22000 },
  { m: 'Jun', collected: 162000, pending: 28000 },
  { m: 'Jul', collected: 175000, pending: 20000 },
  { m: 'Aug', collected: 165000, pending: 25000 }
];
/* Accounts live in localStorage on this device (server auth is Phase 2).
   School accounts are created via Sign Up; each school gets its own
   workspace copy under its own DB key. v28: there is no platform-owner
   account in the app — the old built-in Super Admin login is removed,
   and a Supabase account with no school
   tied to it gets a no-school message, never an admin view. */
var ACC_KEY = 'schoolSaathiAccounts';
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
function hashPwNew(pw) {
  // v36: salted SHA-256, stored self-describing as s256$<salt>$<hash>.
  // The salt is per-account, so two accounts with the same password
  // hash differently and a rainbow table is useless.
  var salt = randomHex(16);
  return 's256$' + salt + '$' + sha256Hex(salt + '|' + pw);
}
function verifyPw(pw, a) {
  // Verifies against either scheme. Returns { ok, legacy }: legacy is
  // true when the stored hash is the pre-v36 djb2 — the caller upgrades
  // it to the new scheme after a successful login (never locks anyone
  // out: the old hash verifies first).
  if (!a || !a.pwHash) return { ok: false };
  var h = a.pwHash;
  if (h.indexOf('s256$') === 0) {
    var parts = h.split('$');
    if (parts.length !== 3) return { ok: false };
    return { ok: sha256Hex(parts[1] + '|' + pw) === parts[2], legacy: false };
  }
  return { ok: hashPw(pw) === h, legacy: true };
}
function upgradePwHash(a, pw) {
  // After a successful legacy login: re-hash with the new scheme and
  // persist. The account object is mutated in place (state.user keeps
  // working) and the stored list is rewritten by email.
  a.pwHash = hashPwNew(pw);
  a.hashScheme = 'sha256';
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
function loadAccounts() { try { var r = localStorage.getItem(ACC_KEY); if (r) { var a = JSON.parse(r); if (Array.isArray(a)) return a; } } catch (e) {} return []; }
function saveAccounts(list) { try { localStorage.setItem(ACC_KEY, JSON.stringify(list)); } catch (e) {} }
function findAccount(email) {
  email = (email || '').trim().toLowerCase();
  var list = loadAccounts();
  for (var i = 0; i < list.length; i++) if (list[i].email === email) return list[i];
  return null;
}
function dbKeyFor(a) {
  // School accounts own their DB. Student and teacher logins open the
  // SCHOOL's DB — they never have a DB of their own (a fresh key would
  // seed the demo DB under the school's name).
  if ((a.role === 'teacher' || a.role === 'student') && a.schoolUid) return 'schoolSaathiDB_' + a.schoolUid;
  return 'schoolSaathiDB_' + a.uid;
}
function applySchoolProfile(d, a) { d.profile.name = a.school; d.profile.principal = a.name; d.profile.email = a.email; return d; }

/* ================= Supabase Auth (v27; v28 removes the admin role) =================
   Server login via GoTrue REST with plain fetch — NO external JS library,
   the app stays self-contained. The anon (publishable) key below is safe to
   ship in client code; it is NOT a service_role key (there is none anywhere
   in this app — never add one). Project: School Saathi,
   https://bsjqeeeemwimzldrehpw.supabase.co (ref has FOUR e's after bsjq).
   Login order: Supabase first when online, local djb2 accounts as the
   offline fallback. v28: the app has no admin role. The old local
   Super Admin account is removed, and the platform-admin lookup is
   gone. A Supabase account with no school
   tied to it (no local school account, no server school row, no signup
   metadata naming a school) gets a no-school message — it never logs in
   as a school, never creates a bogus school, never sees an admin view.
   Never hard-code an email anywhere in the app. */
var SB_URL = 'https://bsjqeeeemwimzldrehpw.supabase.co';
var SB_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzanFlZWVlbXdpbXpsZHJlaHB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQxODA0ODIsImV4cCI6MjEwOTc1NjQ4Mn0.KUV5jF6he8suH_lHUrLvXixPVdzIwHVqcPJXHh1jVkM';
var SB_SESSION_KEY = 'schoolSaathiSupabaseSession';
var SB_SCHOOL_MAP_KEY = 'schoolSaathiServerSchools'; // { localAccountUid: serverSchoolUuid }
var SB_MIGRATED_KEY = 'schoolSaathiMigrated'; // per Supabase uid: { at, schoolId, counts }
var SB_STATUS_KEY = 'schoolSaathiSbStatus'; // { state, at, detail }
var sbRecoveryToken = null;
var sbMigPromise = null; // one migration run at a time

var SB_FETCH_TIMEOUT_MS = 30000; // v34 (P1-2): every server call gets a 30s timeout.
var sbFetchTimeoutMs = SB_FETCH_TIMEOUT_MS;
var sbSessionExpired = false; // v34 (P1-3): the stored refresh token was rejected (not merely offline).
var SB_LINK_RETRY_KEY = 'schoolSaathiLinkRetryAt'; // v34 (P0-1): GoTrue 429 backoff.
function sbIsOnline() {
  if (typeof fetch !== 'function') return false;
  try { if (typeof navigator !== 'undefined' && navigator.onLine === false) return false; } catch (e) {}
  return true;
}
// v34 (P1-2): fetch with an AbortController timeout. A request that hangs
// (slow network, dead connection) rejects after sbFetchTimeoutMs so the
// sync lock is released instead of holding "Syncing…" forever.
function sbFetchWithTimeout(url, init) {
  if (typeof fetch !== 'function') return Promise.reject(new Error('no-fetch'));
  if (typeof AbortController !== 'function') return fetch(url, init);
  var ctrl = new AbortController();
  var timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, sbFetchTimeoutMs);
  init = init || {};
  init.signal = ctrl.signal;
  return fetch(url, init).then(function (res) { clearTimeout(timer); return res; }, function (err) { clearTimeout(timer); throw err; });
}
function sbAuthFetch(path, opts) {
  opts = opts || {};
  if (typeof fetch !== 'function') return Promise.reject(new Error('no-fetch'));
  var headers = { 'apikey': SB_ANON_KEY, 'Authorization': 'Bearer ' + (opts.token || SB_ANON_KEY), 'Content-Type': 'application/json' };
  var init = { method: opts.method || 'GET', headers: headers };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  return sbFetchWithTimeout(SB_URL + path, init).then(function (res) {
    if (res.status === 204) return { ok: res.ok, status: res.status, data: null };
    return res.json().catch(function () { return null; }).then(function (data) {
      return { ok: res.ok, status: res.status, data: data };
    });
  });
}
function sbRest(method, path, token, body, prefer) {
  if (typeof fetch !== 'function') return Promise.reject(new Error('no-fetch'));
  sbSyncRestCalls++; // v53 diag: one REST round-trip per sbRest call
  var headers = { 'apikey': SB_ANON_KEY, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
  if (prefer) headers['Prefer'] = prefer;
  var init = { method: method, headers: headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  return sbFetchWithTimeout(SB_URL + '/rest/v1/' + path, init).then(function (res) {
    if (res.status === 204) return { ok: res.ok, status: res.status, data: null };
    return res.json().catch(function () { return null; }).then(function (data) {
      return { ok: res.ok, status: res.status, data: data };
    });
  });
}
function sbSignUp(email, pw, school, name) {
  return sbAuthFetch('/auth/v1/signup', { method: 'POST', body: { email: email, password: pw, data: { school: school, name: name } } });
}
function sbSignIn(email, pw) {
  return sbAuthFetch('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: email, password: pw } });
}
function sbSignOut(token) {
  return sbAuthFetch('/auth/v1/logout', { method: 'POST', token: token, body: {} });
}
function sbRefresh(refreshToken) {
  return sbAuthFetch('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: refreshToken } });
}
function sbRecover(email) {
  return sbAuthFetch('/auth/v1/recover', { method: 'POST', body: { email: email } });
}
function sbGetUser(token) {
  return sbAuthFetch('/auth/v1/user', { method: 'GET', token: token });
}
function sbSetNewPassword(recoveryToken, pw) {
  return sbAuthFetch('/auth/v1/user', { method: 'PUT', token: recoveryToken, body: { password: pw } });
}
function sbStoreSession(d) {
  try {
    var s = { access_token: d.access_token, refresh_token: d.refresh_token || '', expires_at: Date.now() + ((d.expires_in || 3600) * 1000), user_id: (d.user && d.user.id) || '', email: (d.user && d.user.email) || '' };
    localStorage.setItem(SB_SESSION_KEY, JSON.stringify(s));
    sbSessionExpired = false; // v34 (P1-3): a fresh session is never expired
    return s;
  } catch (e) { return null; }
}
function sbLoadSession() {
  try { var r = localStorage.getItem(SB_SESSION_KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; }
}
function sbClearSession() { try { localStorage.removeItem(SB_SESSION_KEY); } catch (e) {} }
function sbGetValidToken() {
  var s = sbLoadSession();
  if (!s || !s.access_token) return Promise.resolve(null);
  if (s.expires_at && s.expires_at - Date.now() > 60000) return Promise.resolve(s.access_token);
  if (!s.refresh_token) return Promise.resolve(null);
  return sbRefresh(s.refresh_token).then(function (r) {
    if (!r.ok || !r.data || !r.data.access_token) {
      // v34 (P1-3): the SERVER rejected the refresh (expired / revoked
      // token). That is not "offline" — the user must log in again.
      // A network failure lands in the .catch below and stays offline.
      sbSessionExpired = true;
      sbClearSession();
      return null;
    }
    var s2 = sbStoreSession(r.data);
    return s2 ? s2.access_token : null;
  }).catch(function () { return null; });
}
// Phase 1 (CR-1/H-1): boot-time server validation for a server-linked
// school session. Returns Promise<boolean>. true = the server still
// accepts the session — OR the network failed, in which case the boot
// falls back to the local session exactly as before (offline boot is
// unchanged). false = the SERVER rejected the token (revoked/expired),
// and the stored session must be dropped. The boot never hangs on a
// dead connection: after 10s the validation gives up and treats the
// device as offline (the sync cycle retries in the background, and its
// own session-expired handling then applies).
function sbValidateSchoolSession() {
  var checked = sbGetValidToken().then(function (tok) {
    if (!tok) return !sbSessionExpired; // no token: offline (keep) unless the server rejected the refresh (drop)
    return sbGetUser(tok).then(function (r) {
      return !!r.ok; // non-2xx = the server rejected this token
    }, function () { return true; }); // network error = offline, keep the local session
  }, function () { return true; }); // network error = offline, keep the local session
  var giveUp = new Promise(function (resolve) { setTimeout(function () { resolve(true); }, 10000); });
  return Promise.race([checked, giveUp]);
}
function sbIsLocalOnlySchool() {
  // v37: a school account with NO server session — no sbUid on the
  // account AND no live server session. Either one present means the
  // account is server-linked. (Checked against both because the
  // session can be set without the account row carrying sbUid yet.)
  if (typeof state === 'undefined' || !state || !state.user || state.user.role !== 'school') return false;
  return !state.user.sbUid && !(state.sb && state.sb.uid);
}
function sbSetStatus(st, detail) {
  // v37: a local-only school account has no server to back up to — every
  // status it writes becomes the local-only line, never "Backup failed"
  // or "Offline" for a backup that cannot exist.
  if (sbIsLocalOnlySchool()) { st = 'local-only'; detail = ''; }
  // v36 (logout-backup race): a sync cycle that was in flight at logout
  // keeps running after the session is cleared — its failure (no token /
  // network) used to overwrite the status with "Backup failed" on the
  // login screen, although the data was safe in the outbox and retries
  // on the next login. Failure states are only ever written while a
  // school is logged in; after logout they are dropped and the last
  // truthful status stands. (The parameter is named `st` so it does not
  // shadow the global `state` this guard reads.)
  if ((st === 'failed' || st === 'offline' || st === 'session-expired') && (typeof state === 'undefined' || !state || !state.user || state.user.role !== 'school')) return;
  // v43: the stored status is stamped with the build that wrote it, so
  // a failure from an older build can be recognised as stale (see
  // sbStatusText). The stamp is part of the stored record, never shown.
  try { localStorage.setItem(SB_STATUS_KEY, JSON.stringify({ state: st, at: new Date().toISOString(), detail: detail || '', v: APP_VERSION })); } catch (e) {}
  // v43: keep the two visible status lines in step with the stored
  // state. Both lines are rendered once (Settings on navigation, login
  // screen on showLogin) and no re-render follows a background cycle,
  // so without this the Settings line kept showing the state it was
  // rendered with — live v42: "Syncing…" for ~150s after the cycle had
  // finished. Updating the two known nodes here is far cheaper than a
  // full renderApp on every cycle, and it cannot swallow a tap the way
  // a re-render can (see the pull render gate below).
  try {
    if (typeof document !== 'undefined' && document.getElementById) {
      var txt43 = sbStatusText();
      var sl43 = document.getElementById('sbStatusLine'); if (sl43) sl43.textContent = txt43;
      var lg43 = document.getElementById('sbStatus'); if (lg43) lg43.textContent = txt43;
      sbSyncDetailsRefresh(); // v53: keep the Settings sync-details section in step
    }
  } catch (e2) {}
}
function sbLoadStatus() {
  try { var r = localStorage.getItem(SB_STATUS_KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; }
}
function sbAtLabel(iso) {
  // v43: "09/11/2026 22:15" in the DEVICE's local time, from the stored
  // ISO timestamp. Built through the Date so the phone shows its own
  // local time, not the stored UTC hour.
  try {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  } catch (e) { return ''; }
}
function sbStatusText() {
  // v37: while a local-only school is logged in, the line is the
  // local-only wording whatever the persisted status says — an old
  // "Backed up" written before v37 must not survive the upgrade.
  if (sbIsLocalOnlySchool()) return t('sbStatusLocalOnly');
  var st = sbLoadStatus();
  if (!st) {
    // v47: no status was ever recorded on this device — claiming
    // "Backup pending" on a first visit is wrong. Show pending only
    // if the logged-in school actually has queued offline changes.
    try {
      var uid47 = (typeof state !== 'undefined' && state.user && state.user.sbUid) ? state.user.sbUid : null;
      if (uid47 && sbOutboxLoad(uid47).length) return t('sbStatusPending');
    } catch (e) {}
    return '';
  }
  if (st.state === 'local-only') return t('sbStatusLocalOnly'); // v37: persisted by sbSetStatus / logout for local-only accounts
  if (st.state === 'session-expired') return t('sbStatusSessionExpired'); // v34 (P1-3)
  if (st.state === 'not-linked') return t('sbStatusNotLinked'); // v34 (P0-1)
  if (st.state === 'synced') return t('sbStatusSynced') + (st.at ? ' ' + t('sbLastAttempt') + ': ' + sbAtLabel(st.at) : '');
  if (st.state === 'uploading') return t('sbStatusUploading');
  if (st.state === 'syncing') return t('sbStatusSyncing');
  // v42: a persisted 'pending'/'offline' state is only truthful while
  // the device is actually offline. A cycle that started offline
  // writes it, the device comes back online, the user logs out — and
  // the login screen then claimed "Offline — changes will sync when
  // you are back online" while online (live v41). While online, show
  // the pending wording instead; while offline, keep the Offline
  // wording. The truthful failed line (with its detail) is untouched.
  if (st.state === 'pending') return sbIsOnline() ? t('sbStatusPending') : t('sbStatusPendingSync');
  // v39: a failed backup used to show only the generic line, so a
  // failure that repeated every cycle (the live test account's
  // "Backup failed", last attempt 09/11/2026 20:24) could never be
  // diagnosed from the screen. The detail names the failing
  // operation (table + error, e.g. "ss_receipts: insert-ss_receipts"
  // or "ss_receipts 0/1") — short, capped, never a secret.
  // v43: a failure persisted by an OLDER build is stale the moment the
  // app updates — it describes a bug that may already be fixed, and the
  // login screen showed v41's PGRST102 failure on a fresh v42 load
  // before any v42 cycle had run (live v42). Until a cycle under THIS
  // version writes a fresh state, show the pending wording instead.
  // Records written before v43 carry no version at all and are stale by
  // the same rule. A failure written by the CURRENT version still shows
  // truthfully with its detail.
  if (st.state === 'failed' && st.v !== APP_VERSION) return t('sbStatusPending');
  if (st.state === 'failed') return t('sbStatusFailed') + (st.detail ? ' (' + String(st.detail).slice(0, 80) + ')' : '');
  if (st.state === 'offline') return sbIsOnline() ? t('sbStatusPending') : t('sbStatusOffline');
  return t('sbStatusPending');
}
function sbSyncDetailsHtml() {
  // v53: the Settings "Sync details" section — display only, no
  // behaviour change. The browser agent cannot run JS or read
  // localStorage, so the next live verifier reads the outbox count,
  // last cycle duration/result and the queued entries from this HTML.
  // Everything is escaped; the queued list shows the first 10 entries
  // as "table — key" plus "and N more".
  var d = sbSyncDiagLoad();
  var uid = (typeof state !== 'undefined' && state && state.sb && state.sb.uid) || null;
  var out = uid ? sbOutboxLoad(uid) : [];
  var lc = d.lastCycle || null, lf = d.lastFlush || null;
  var h = '<div class="muted" style="margin-top:8px">' + esc(t('sbSyncDetailsTitle')) + '</div>';
  h += '<div style="font-size:13px;line-height:1.7;margin-top:4px">';
  h += '<div>' + esc(t('sbSyncPendingUploads')) + ': <b>' + out.length + '</b></div>';
  if (lc) {
    h += '<div>' + esc(t('sbSyncLastCycle')) + ': ' + esc(lc.result || '') + ' · ' + esc(lc.ms == null ? '' : (lc.ms / 1000).toFixed(1) + 's') + (lc.at ? ' · ' + esc(sbAtLabel(lc.at)) : '') + (lc.calls != null ? ' · ' + esc(String(lc.calls)) + ' ' + esc(t('sbSyncCalls')) : '') + '</div>';
    if (lc.detail) h += '<div>' + esc(t('sbSyncLastError')) + ': ' + esc(String(lc.detail).slice(0, 120)) + '</div>';
  } else {
    h += '<div>' + esc(t('sbSyncLastCycle')) + ': —</div>';
  }
  if (lf) {
    h += '<div>' + esc(t('sbSyncLastFlush')) + ': ' + esc(t('sbSyncPushed')) + ' ' + esc(String(lf.pushed || 0)) + ' · ' + esc(t('sbSyncConflicts')) + ' ' + esc(String(lf.conflicts || 0)) + ' · ' + esc(t('sbSyncLeftover')) + ' ' + esc(String(lf.leftover || 0)) + ' · ' + esc(lf.ms == null ? '' : (lf.ms / 1000).toFixed(1) + 's') + (lf.calls != null ? ' · ' + esc(String(lf.calls)) + ' ' + esc(t('sbSyncCalls')) : '') + '</div>';
  }
  if (out.length) {
    h += '<div style="margin-top:4px">' + esc(t('sbSyncQueued')) + ':</div>';
    out.slice(0, 10).forEach(function (e) { h += '<div>• ' + esc(e.table) + ' — ' + esc(String(e.key)) + (e.failReason ? ' (' + esc(String(e.failReason).slice(0, 60)) + ')' : '') + '</div>'; });
    if (out.length > 10) h += '<div>… ' + esc(t('sbSyncAndMore').replace('{n}', String(out.length - 10))) + '</div>';
  }
  h += '</div>';
  return h;
}
function sbSyncDetailsRefresh() {
  // v53: re-render the Settings details node after a diag write, so
  // the section never lags one cycle behind. No-op when Settings is
  // not the visible view (the node does not exist). Called from
  // sbSetStatus and from both diag write sites.
  try {
    if (typeof document !== 'undefined' && document.getElementById) {
      var el = document.getElementById('sbSyncDetails');
      if (el) el.innerHTML = sbSyncDetailsHtml();
    }
  } catch (e) {}
}
function sbLoadMig(uid) {
  try { var r = localStorage.getItem(SB_MIGRATED_KEY + ':' + uid); return r ? JSON.parse(r) : null; } catch (e) { return null; }
}
function sbSaveMig(uid, v) {
  try { localStorage.setItem(SB_MIGRATED_KEY + ':' + uid, JSON.stringify(v)); } catch (e) {}
}
function sbServerSchoolMap() {
  try { var r = localStorage.getItem(SB_SCHOOL_MAP_KEY); return r ? JSON.parse(r) : {}; } catch (e) { return {}; }
}
function sbSaveServerSchool(localUid, serverId) {
  var m = sbServerSchoolMap(); m[localUid] = serverId;
  try { localStorage.setItem(SB_SCHOOL_MAP_KEY, JSON.stringify(m)); } catch (e) {}
}
function sbGetServerSchoolId(sbUid, token) {
  // GET-only: the server school row owned by this Supabase user, or null.
  // Used to tell a school signing in on a second device apart from an
  // account that has no school at all (e.g. the platform owner).
  return sbRest('GET', 'ss_schools?select=id,name,principal&owner_id=eq.' + encodeURIComponent(sbUid), token).then(function (r) {
    if (r.ok && Array.isArray(r.data) && r.data.length) return r.data[0];
    return null;
  });
}
function sbLoginNewSchool(meta, email, pw, uid, token, serverSchool) {
  // A school signing in with no local account yet: create the local
  // workspace from the server school row (second device) or the signup
  // metadata (fresh signup, not yet migrated), then log in and migrate.
  var school = (serverSchool && serverSchool.name) || meta.school || '';
  var name = (serverSchool && serverSchool.principal) || meta.name || email;
  var a = { uid: uniqueId('u'), name: name, school: school, email: email, pwHash: pw ? hashPwNew(pw) : '', hashScheme: pw ? 'sha256' : '', role: 'school', sub: 'School Admin • ' + school, created: new Date().toISOString().slice(0, 10), sbUid: uid };
  var list = loadAccounts(); list.push(a); saveAccounts(list);
  state.sb = { uid: uid, email: email };
  $('loginErr').classList.add('hidden');
  loginAs(a);
  // v32: one serialized cycle does it all — upload-missing into the
  // existing school row, then pull (for a fresh empty workspace the pull
  // IS the download), then flush. No separate download step and no
  // parallel migration: the v31 login fired both at once, and a
  // laptop-first login left the phone's student stranded.
  sbSyncCycle(a, uid, token).catch(function () {});
  sbSyncAutoStart();
}
function sbShowNoSchool() {
  // v28: a Supabase account with no school tied to it (no local school
  // account, no server school row, no signup metadata naming a school)
  // is NOT a school. Show a clear message — never log it in as a school,
  // never create a bogus school, never show an admin view — and drop the
  // stored session so a refresh cannot revive it.
  sbClearSession();
  state.sb = null;
  var err = $('loginErr');
  err.textContent = t('sbNoSchool');
  err.classList.remove('hidden');
}
function sbFinishSupabaseLogin(data, email, pw) {
  var uid = data.user && data.user.id;
  if (!uid) { sbLocalLogin(email, pw, $('loginErr')); return; }
  sbStoreSession(data);
  var meta = (data.user && data.user.user_metadata) || {};
  var a = findAccount(email);
  if (a) {
    // Local school account exists: the normal school login. The server
    // user id is recorded and the one-time migration runs if pending.
    a.sbUid = uid;
    var list = loadAccounts();
    for (var i = 0; i < list.length; i++) if (list[i].email === email) list[i] = a;
    saveAccounts(list);
    state.sb = { uid: uid, email: email };
    $('loginErr').classList.add('hidden');
    loginAs(a);
    // v32: one serialized cycle (upload-missing -> pull -> flush).
    // Never fire the migration and the pull in parallel again.
    sbSyncCycle(a, uid, data.access_token).catch(function () {});
    sbSyncAutoStart();
    return;
  }
  // No local account for this Supabase user. A school is recognised in
  // two ways: a server school row owned by this user (a school signing
  // in on a second device), or signup metadata carrying a school name
  // (the app's signup form always sends data.school — a fresh signup
  // whose migration has not run yet). Anything else has no school.
  sbGetServerSchoolId(uid, data.access_token).then(function (row) {
    var metaSchool = meta.school && String(meta.school).trim();
    if (!row && !metaSchool) { sbShowNoSchool(); return; }
    sbLoginNewSchool(meta, email, pw, uid, data.access_token, row);
  }).catch(function () {
    // Server check failed mid-flight (network dropped): fall back to the
    // signup-metadata evidence only. Without it the account cannot be
    // shown to be a school, so the no-school message is the safe answer.
    if (meta.school && String(meta.school).trim()) sbLoginNewSchool(meta, email, pw, uid, data.access_token, null);
    else sbShowNoSchool();
  });
}
function sbLocalLogin(id, pw, err) {
  var a = findAccount(id);
  var chk = verifyPw(pw, a);
  var ok = chk.ok;
  if (ok && chk.legacy) upgradePwHash(a, pw); // v36: old djb2 hash verifies, then upgrades to salted SHA-256 on this login
  if (!a || !ok) {
    err.textContent = t('tInvalidCreds');
    err.classList.remove('hidden');
    return false;
  }
  err.classList.add('hidden');
  loginAs(a);
  // v34 (P0-1): a school account that never got its server account (the
  // v27 signup was best-effort) is linked now, in the background, with
  // the password that just unlocked the local account.
  if (a.role === 'school' && !a.sbUid && sbIsOnline()) {
    sbLinkServerAccount(a, pw).then(function (r) {
      if (r.done) { toast(t('sbLinkDone')); renderApp(); }
    });
  }
  return true;
}
function sbLinkServerAccount(account, pw) {
  // v34 (P0-1): link a local school account to its server account. The
  // v27 signup was best-effort, so a failure (offline, GoTrue 429) left
  // the account local-only forever with re-signup blocked by the local
  // email-taken check. This retries the signup on login and from
  // Settings → Server Backup. A 429 backs off 5 minutes and is never
  // spammed. If the server says the email is already registered
  // (created on another device), sign in instead of signing up.
  if (!account || account.role !== 'school' || account.sbUid) return Promise.resolve({ done: false, reason: 'already-linked' });
  if (!sbIsOnline()) return Promise.resolve({ done: false, reason: 'offline' });
  var retryAt = 0;
  try { retryAt = parseInt(localStorage.getItem(SB_LINK_RETRY_KEY) || '0', 10) || 0; } catch (e) {}
  if (Date.now() < retryAt) return Promise.resolve({ done: false, reason: 'backoff' });
  var email = (account.email || '').trim().toLowerCase();
  if (!email || !pw) return Promise.resolve({ done: false, reason: 'no-credentials' });
  function saveLinked(uid) {
    account.sbUid = uid;
    var l2 = loadAccounts();
    for (var i = 0; i < l2.length; i++) if (l2[i].email === email) l2[i] = account;
    saveAccounts(l2);
    if (state.user && state.user.email === email) state.user.sbUid = uid;
  }
  return sbSignUp(email, pw, account.school, account.name).then(function (res) {
    if (res.status === 429) {
      try { localStorage.setItem(SB_LINK_RETRY_KEY, String(Date.now() + 5 * 60 * 1000)); } catch (e2) {}
      sbSetStatus('not-linked', 'rate-limited');
      return { done: false, reason: 'rate-limited' };
    }
    if (res.ok && res.data && res.data.user && res.data.user.id) {
      saveLinked(res.data.user.id);
      if (res.data.access_token) {
        sbStoreSession(res.data); state.sb = { uid: res.data.user.id, email: email };
        sbSetStatus('synced');
      } else {
        sbSetStatus('pending');
      }
      return { done: true, reason: 'signed-up' };
    }
    if (res.status === 422 || res.status === 400) {
      return sbSignIn(email, pw).then(function (r2) {
        if (r2.ok && r2.data && r2.data.access_token && r2.data.user && r2.data.user.id) {
          saveLinked(r2.data.user.id);
          sbStoreSession(r2.data); state.sb = { uid: r2.data.user.id, email: email };
          sbSetStatus('synced');
          return { done: true, reason: 'signed-in' };
        }
        sbSetStatus('not-linked', 'sign-in-failed');
        return { done: false, reason: 'sign-in-failed' };
      });
    }
    sbSetStatus('not-linked', 'signup-failed');
    return { done: false, reason: 'signup-failed' };
  }).catch(function () {
    sbSetStatus('not-linked', 'offline');
    return { done: false, reason: 'offline' };
  });
}
function openLinkServerModal() {
  openModal('<h3>' + t('sbLinkPwTitle') + '</h3><p class="card-sub">' + t('sbStatusNotLinked') + '</p>' +
    '<form onsubmit="return submitLinkServer(event)">' +
    '<div class="field"><label>' + t('loginPassword') + '</label><input id="linkPwInput" type="password" autocomplete="current-password"></div>' +
    '<div id="linkPwErr" class="err hidden"></div>' +
    '<div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button>' +
    '<button class="btn" type="submit">' + t('sbLinkServer') + '</button></div></form>');
  $('linkPwInput').focus();
}
function submitLinkServer(e) {
  e.preventDefault();
  var pw = $('linkPwInput') ? $('linkPwInput').value : '';
  var err = $('linkPwErr');
  if (!pw) { err.textContent = t('tFillAll'); err.classList.remove('hidden'); return false; }
  // The server account is created with THIS password — it must be the
  // account's own password, not a typo, or the two accounts would diverge.
  if (!state.user || !verifyPw(pw, state.user).ok) {
    err.textContent = t('tInvalidCreds');
    err.classList.remove('hidden');
    return false;
  }
  err.classList.add('hidden');
  closeModal();
  sbLinkServerAccount(state.user, pw).then(function (r) {
    if (r.done) toast(t('sbLinkDone'));
    else if (r.reason === 'rate-limited') toast(t('sbTooMany'));
    else toast(t('sbLinkFailed'));
    renderApp();
  });
  return false;
}
function showRecoverForm() {
  switchAuth('login');
  $('loginForm').classList.add('hidden');
  $('recoverForm').classList.remove('hidden');
  $('resetForm').classList.add('hidden');
  $('recoverEmail').focus();
}
function doRecover(e) {
  e.preventDefault();
  var email = ($('recoverEmail').value || '').trim().toLowerCase();
  var err = $('recoverErr');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    err.textContent = t('tInvalidEmail');
    err.classList.remove('hidden');
    return false;
  }
  err.classList.add('hidden');
  if (!sbIsOnline()) {
    err.textContent = t('sbOfflineLogin');
    err.classList.remove('hidden');
    return false;
  }
  sbRecover(email).then(function () {
    err.textContent = t('sbRecoverSent');
    err.classList.remove('hidden');
  }).catch(function () {
    err.textContent = t('sbRecoverFailed');
    err.classList.remove('hidden');
  });
  return false;
}
function doResetPassword(e) {
  e.preventDefault();
  var pw = $('resetPw').value, pw2 = $('resetPw2').value;
  var err = $('resetErr');
  function fail(msg) { err.textContent = msg; err.classList.remove('hidden'); return false; }
  if (pw.length < 6) return fail(t('tPwShort'));
  if (pw !== pw2) return fail(t('tPwMismatch'));
  if (!sbRecoveryToken) return fail(t('sbResetFailed'));
  var tok = sbRecoveryToken;
  sbSetNewPassword(tok, pw).then(function (r) {
    if (!r.ok) { err.textContent = t('sbResetFailed'); err.classList.remove('hidden'); return; }
    // Keep the device account in sync so offline login keeps working.
    sbGetUser(tok).then(function (u) {
      var em = u && u.data && u.data.email;
      if (em) {
        var a = findAccount(em);
        if (a) {
          a.pwHash = hashPwNew(pw);
          a.hashScheme = 'sha256';
          var l2 = loadAccounts();
          for (var i = 0; i < l2.length; i++) if (l2[i].email === em) l2[i] = a;
          saveAccounts(l2);
        }
      }
    }).catch(function () { /* email lookup failed — server password still set */ });
    sbRecoveryToken = null;
    try { history.replaceState(null, '', location.pathname); } catch (e2) {}
    $('resetForm').classList.add('hidden');
    $('loginForm').classList.remove('hidden');
    err.classList.add('hidden');
    toast(t('sbResetDone'));
    switchAuth('login');
  }).catch(function () {
    err.textContent = t('sbResetFailed');
    err.classList.remove('hidden');
  });
  return false;
}
function sbBoot() {
  // Password-reset / email-confirm links land back here with a hash.
  try {
    var h = (typeof location !== 'undefined' && location.hash) || '';
    if (h && h.indexOf('access_token=') !== -1) {
      var params = {};
      h.slice(1).split('&').forEach(function (p) { var kv = p.split('='); params[kv[0]] = decodeURIComponent(kv[1] || ''); });
      if (params.type === 'recovery' && params.access_token) {
        sbRecoveryToken = params.access_token;
        showView('login'); switchAuth('login');
        $('loginForm').classList.add('hidden');
        $('resetForm').classList.remove('hidden');
        return;
      }
      if ((params.type === 'signup' || params.type === 'invite') && params.access_token) {
        try { history.replaceState(null, '', location.pathname); } catch (e2) {}
        toast(t('sbEmailConfirmed'));
        return;
      }
    }
  } catch (e) {}
  // Resume a stored server session: refresh it if needed and retry a
  // pending backup. Never blocks the local session.
  if (!state.user || !state.sb) return;
  if (state.user.role !== 'school') return;
  // v32: one serialized cycle covers both the never-migrated and the
  // already-backed-up cases (upload-missing -> pull -> flush).
  sbSyncCycle(state.user, state.sb.uid, null).catch(function () {});
  sbSyncAutoStart();
}

/* ================= One-time migration upload (v27) =================
   On first Supabase login for a school account, the account's local data
   is uploaded once into the ss_ tables. Idempotent: every table is read
   first and rows already on the server are skipped. After upload the
   counts are read back and compared with the local counts; only then is
   the account marked migrated. Local data is NEVER deleted. The app keeps
   localStorage as its working store after migration; v31 is server-first
   (login pulls the server state and saves sync through the outbox), so a
   second device signing in sees the same data after its first sync.
   Migration never runs for non-school roles (student/teacher). */
function sbNullIfEmpty(v) { return (v === '' || v === undefined || v === null) ? null : v; }
function sbMapStudent(s, schoolId) {
  return { school_id: schoolId, local_id: s.id, name: s.name || '', cls: s.cls || '', roll: s.roll || 0,
    enr: sbNullIfEmpty(s.enr), guardian: s.guardian || '', phone: s.phone || '', mobile2: s.mobile2 || '',
    parent_email: s.parentEmail || '', father_name: s.fatherName || '', mother_name: s.motherName || '',
    occupation: s.occupation || '', dob: sbNullIfEmpty(s.dob),
    gender: (s.gender === 'Boy' || s.gender === 'Girl') ? s.gender : '',
    blood_group: s.bloodGroup || '', category: s.category || '', address: s.address || '',
    state: s.state || '', district: s.district || '', pin: s.pin || '',
    previous_school: s.previousSchool || '', previous_class: s.previousClass || '',
    admission_no: sbNullIfEmpty(s.admissionNo), admission_date: sbNullIfEmpty(s.admissionDate),
    session: s.session || '', status: s.status || 'Active', result: (s.result === undefined || s.result === null) ? null : s.result,
    parent_pin: s.parentPinHash || null, photo_data_url: s.photo || null, // v54 (A1): the server column now carries the salted hash, never the plaintext PIN
    documents: s.documents || { birthCert: false, tc: false, tcNumber: '', other: '' },
    aadhaar: sbNullIfEmpty(aadhaarLast4(s.aadhaar)) }; // v36: only the last 4 digits ever leave the device
}
function sbMapFeeStructure(f, schoolId) {
  return { school_id: schoolId, cls: f.cls || '', fee_type: f.type || 'Tuition', amount: f.amount || 0 };
}
function sbMapFeeRecord(r, schoolId, stuMap) {
  return { school_id: schoolId, local_id: r.id, student_id: stuMap[r.studentId] || null,
    student_name: r.student || '', cls: r.cls || '', month: r.month || '', fee_type: r.type || 'Tuition',
    amount: r.amount || 0, status: r.status || 'Pending', record_date: sbNullIfEmpty(r.date) };
}
function sbMapTeacher(te, schoolId) {
  // v35: classes[] rides with the teacher row (supabase/08_teacher_classes.sql
  // adds the column — apply it before v35 ships, or the upload 400s).
  return { school_id: schoolId, local_id: te.id, name: te.name || '', subject: te.subject || '', cls: te.cls || '', classes: Array.isArray(te.classes) ? te.classes.slice() : [] };
}
function sbMapExam(e, schoolId) {
  return { school_id: schoolId, local_id: e.id, name: e.name || '', cls: e.cls || '', subject: e.subject || '',
    exam_date: sbNullIfEmpty(e.date), total: e.total || 100 };
}
function sbMapHomework(h, schoolId, stuMap) {
  return { school_id: schoolId, local_id: h.id, cls: h.cls || '', subject: h.subject || '', title: h.title || '',
    due: sbNullIfEmpty(h.due), done_by: (h.doneBy || []).map(function (id) { return stuMap[id]; }).filter(function (x) { return !!x; }) };
}
function sbMapNotice(n, schoolId) {
  return { school_id: schoolId, local_id: n.id, title: n.title || '', notice_date: sbNullIfEmpty(n.date), body: n.body || '' };
}
function sbCounterNo(v) {
  // v40: ss_receipts.counter_no is an INTEGER column, but the Collect
  // Fee form stores the counter label as free text ('COUNTER-1' by
  // default). The live test account proved it: the app POSTed
  // counter_no "COUNTER-1" and PostgREST rejected the whole receipt
  // with HTTP 400 code 22P02 ("invalid input syntax for type
  // integer"), so RCP-2026-003 never landed and every sync cycle
  // failed with "Backup failed". Coerce here, at the upload mapping
  // only — the local receipt keeps its label for display/print.
  // Digits only: the hyphen in 'COUNTER-1' is a separator, not a
  // minus sign, so '-1' must never come out of this helper.
  if (typeof v === 'number' && isFinite(v)) return Math.floor(v);
  var m = String(v == null ? '' : v).match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}
function sbMapReceipt(rc, schoolId, stuMap, byId) {
  var s = byId[rc.studentId] || {};
  return { school_id: schoolId, student_id: stuMap[rc.studentId] || null, receipt_no: rc.receiptNo || '',
    admission_no: rc.admissionNo || s.admissionNo || s.enr || '', student_name: rc.name || s.name || '',
    cls: rc.cls || s.cls || '', session: rc.session || '', receipt_date: sbNullIfEmpty(rc.date),
    month: rc.month || '', counter_no: sbCounterNo(rc.counterNo), lines: rc.lines || [], pay_mode: rc.payMode || 'Cash',
    pay_date: sbNullIfEmpty(rc.payDate), bank: rc.bank || '', number: rc.number || '',
    total: rc.total || 0, total_words: rc.totalWords || '', collector: rc.collector || '' };
}
function sbMapAudit(a, schoolId) {
  return { school_id: schoolId, ts: a.ts || new Date().toISOString(), actor: a.actor || 'system', action: a.action || '', details: a.details || '' };
}
function sbMapActivity(a, schoolId) {
  // v42: every row in a bulk insert must carry the SAME key set —
  // PostgREST rejects mixed keys with PGRST102 "All object keys must
  // match". The old `if (a.ts)` left seed activities (no ts) without
  // created_at while logged activities carried it, so the mixed bulk
  // POST failed every cycle and the sync never completed (live v41:
  // "Backup failed … (ss_activities: insert-ss_activities: PGRST102
  // All object keys must match)"). A missing ts gets a fixed epoch
  // fallback — deterministic, so the snapshot hash stays stable —
  // never a fresh timestamp, which would change the hash on every call.
  return { school_id: schoolId, icon: a.icon || '', bg: a.bg || '', title: a.title || '', sub: a.sub || '', created_at: a.ts || '1970-01-01T00:00:00.000Z' };
}
function sbFlattenAttendance(d) {
  var out = [];
  Object.keys(d.attendance || {}).forEach(function (key) {
    var parts = key.split('|');
    var recs = d.attendance[key] || {};
    Object.keys(recs).forEach(function (sid) {
      out.push({ date: parts[0], cls: parts[1] || '', studentId: sid, status: recs[sid] });
    });
  });
  return out;
}
function sbCountUnique(arr, keyFn) {
  // v52: the migration verify counts what the server can hold — one row
  // per dedupe key. A legacy local DB can hold two rows for one id
  // (the v46 double-POST), and counting both made the verify fail
  // forever ("ss_fee_records 3/6") even when every unique row had
  // uploaded. Rows without a key cannot be on the server and count 0.
  var seen = {}, n = 0;
  (arr || []).forEach(function (r) { var k = keyFn(r); if (k === undefined || k === null || k === '') return; if (!seen[k]) { seen[k] = true; n++; } });
  return n;
}
function sbLocalCounts(d) {
  return { students: sbCountUnique(d.students, function (s) { return s.id; }), feeRecords: sbCountUnique(d.feeRecords, function (r) { return r.id; }),
    feeStructure: sbCountUnique(d.feeStructure, function (f) { return (f.cls || '') + '|' + (f.type || 'Tuition'); }), attendance: sbFlattenAttendance(d).length,
    // v39: only NUMBERED receipts count — a receipt saved offline has
    // no number yet and can never be on the server, so counting it
    // made the migration verify fail forever ("ss_receipts 0/1") even
    // when every numbered receipt had uploaded.
    receipts: sbCountUnique((d.receipts || []).filter(function (rc) { return !!rc.receiptNo; }), function (rc) { return rc.receiptNo; }),
    auditLog: sbCountUnique(d.auditLog, function (a) { return sbNormTs(a.ts) + '|' + (a.actor || '') + '|' + (a.action || '') + '|' + (a.details || ''); }),
    activities: sbCountUnique(d.activities, function (a) { return (a.title || '') + '|' + (a.sub || ''); }),
    teachers: sbCountUnique(d.teachers, function (t) { return t.id; }),
    exams: sbCountUnique(d.exams, function (e) { return e.id; }),
    marks: sbCountUnique(d.marks, function (m) { return m.examId + '|' + m.studentId; }),
    homework: sbCountUnique(d.homework, function (h) { return h.id; }),
    notices: sbCountUnique(d.notices, function (n) { return n.id; }) };
}
function sbLocalCountsReal(d) {
  // v45: the migration guard + verification count only REAL rows.
  // The demo seed inflates every count (40 students, 12 teachers, 70
  // fee records) and the seed never uploads — counting it made the
  // guard demand a migration the upload could never satisfy, so the
  // pull never ran, the seed never dropped locally, and the cycle never
  // completed (live v44: the flooded device stayed unsynced). Fee
  // structure / audit / activities have no seed rows and count as-is.
  function real(table, arr) { return sbCountUnique((arr || []).filter(function (r) { return !sbIsSeedRow(table, r, d); }), function (r) { return r.id; }); }
  return { students: real('ss_students', d.students), feeRecords: real('ss_fee_records', d.feeRecords),
    feeStructure: sbCountUnique(d.feeStructure, function (f) { return (f.cls || '') + '|' + (f.type || 'Tuition'); }),
    attendance: sbFlattenAttendance(d).filter(function (a) { return !sbIsSeedStudentId(a.studentId, d); }).length,
    // v39: only NUMBERED receipts count — a receipt saved offline has
    // no number yet and can never be on the server.
    receipts: sbCountUnique((d.receipts || []).filter(function (rc) { return !!rc.receiptNo && !sbIsSeedStudentId(rc.studentId, d); }), function (rc) { return rc.receiptNo; }),
    auditLog: sbCountUnique(d.auditLog, function (a) { return sbNormTs(a.ts) + '|' + (a.actor || '') + '|' + (a.action || '') + '|' + (a.details || ''); }),
    activities: sbCountUnique(d.activities, function (a) { return (a.title || '') + '|' + (a.sub || ''); }),
    teachers: real('ss_teachers', d.teachers), exams: real('ss_exams', d.exams),
    marks: sbCountUnique((d.marks || []).filter(function (m) { return !sbIsSeedExamId(m.examId, d) && !sbIsSeedStudentId(m.studentId, d); }), function (m) { return m.examId + '|' + m.studentId; }),
    homework: real('ss_homework', d.homework), notices: real('ss_notices', d.notices) };
}
function sbNormTs(v) { return String(v || '').slice(0, 19); }
// Upload rows that are not on the server yet. keyFn builds the dedupe key
// from a row (local or server). onInserted receives ALL rows for the table
// (existing + inserted) so callers can build id maps. Returns a promise
// of the number of rows inserted.
function sbUploadMissing(token, schoolId, table, selectCols, rows, keyFn, onInserted) {
  if (!rows.length) {
    // v39: the id map must still be built when nothing is fresh. The
    // students/exams steps feed stuMap/examMap to every dependent row
    // below, and the early return skipped the GET that fills them — so
    // on any cycle where every student was already synced, a fee
    // record or receipt added since was silently dropped by the
    // student_id filter and could only ever land via the migration
    // fallback (or never, when that failed too). Callers without an
    // onInserted callback keep the fast path.
    if (!onInserted) return Promise.resolve(0);
    return sbRest('GET', table + '?select=' + selectCols + '&school_id=eq.' + encodeURIComponent(schoolId) + '&limit=5000', token).then(function (r) {
      if (!r.ok) throw new Error('read-' + table);
      onInserted(Array.isArray(r.data) ? r.data : []);
      return 0;
    });
  }
  return sbRest('GET', table + '?select=' + selectCols + '&school_id=eq.' + encodeURIComponent(schoolId) + '&limit=5000', token).then(function (r) {
    if (!r.ok) throw new Error('read-' + table);
    var existing = Array.isArray(r.data) ? r.data : [];
    var seen = {};
    existing.forEach(function (row) { seen[keyFn(row)] = true; });
    var missing = rows.filter(function (row) { return !seen[keyFn(row)]; });
    if (onInserted) onInserted(existing);
    if (!missing.length) return 0;
    return sbRest('POST', table, token, missing, 'return=representation').then(function (r2) {
      if (!r2.ok) {
        // v40: the server's message IS the diagnosis. The live receipts
        // failure was only visible as a bare "insert-ss_receipts" until
        // the exact POST was replayed (HTTP 400, code 22P02, "invalid
        // input syntax for type integer"). Carry code + message through
        // so the status line can name it; sbStatusText caps the detail
        // at 80 chars and never prints secrets.
        var d2 = r2.data || {};
        var msg2 = (d2.code ? d2.code + ' ' : '') + (d2.message || ('HTTP ' + r2.status));
        throw new Error('insert-' + table + ': ' + msg2);
      }
      var inserted = Array.isArray(r2.data) ? r2.data : [];
      if (onInserted) onInserted(existing.concat(inserted));
      return inserted.length;
    });
  });
}
function sbEnsureServerSchool(account, sbUid, token, d) {
  return sbRest('GET', 'ss_schools?select=id&owner_id=eq.' + encodeURIComponent(sbUid), token).then(function (r) {
    if (r.ok && Array.isArray(r.data) && r.data.length) {
      sbSaveServerSchool(account.uid, r.data[0].id);
      return r.data[0].id;
    }
    var p = d.profile || {};
    var e = d.feeExtras || {};
    var row = { owner_id: sbUid, name: p.name || account.school || '', city: p.city || '', principal: p.principal || '',
      phone: p.phone || '', email: p.email || account.email || '', session: p.session || '2025–26',
      address: p.address || '', logo_data_url: p.logo || null, plan: 'Active', status: 'active', is_demo: false,
      adm_counter: d.admCounter || 1, receipt_counter: d.receiptCounter || 1,
      admission_fee: e.admissionFee || 0, caution_money: e.cautionMoney || 0,
      annual_charges: e.annualCharges || 0, transport_fee: e.transportFee || 0 };
    return sbRest('POST', 'ss_schools', token, row, 'return=representation').then(function (r2) {
      if (r2.status === 409) {
        // v34 (P1-11): another device created the school row a moment
        // ago — the unique index on ss_schools(owner_id) rejected the
        // second insert. Re-read the existing row instead of failing.
        return sbRest('GET', 'ss_schools?select=id&owner_id=eq.' + encodeURIComponent(sbUid), token).then(function (r3) {
          if (r3.ok && Array.isArray(r3.data) && r3.data.length) {
            sbSaveServerSchool(account.uid, r3.data[0].id);
            return r3.data[0].id;
          }
          throw new Error('create-school');
        });
      }
      if (!r2.ok || !Array.isArray(r2.data) || !r2.data.length) throw new Error('create-school');
      sbSaveServerSchool(account.uid, r2.data[0].id);
      return r2.data[0].id;
    });
  });
}
function sbVerifyCounts(token, schoolId, counts) {
  var checks = [
    ['ss_students', 'local_id', counts.students], ['ss_fee_records', 'local_id', counts.feeRecords],
    ['ss_fee_structure', 'cls', counts.feeStructure], ['ss_attendance', 'student_id', counts.attendance],
    ['ss_receipts', 'receipt_no', counts.receipts], ['ss_audit_log', 'ts', counts.auditLog],
    ['ss_activities', 'title', counts.activities], ['ss_teachers', 'local_id', counts.teachers],
    ['ss_exams', 'local_id', counts.exams], ['ss_marks', 'exam_id', counts.marks],
    ['ss_homework', 'local_id', counts.homework], ['ss_notices', 'local_id', counts.notices]
  ];
  // v52: the 12 count checks ran as 12 SEQUENTIAL round-trips — the
  // manual "Back Up Now" path spent most of its 90s+ stall here (and
  // in the upload pass). The checks are independent reads, so they fire
  // in one batch; the first failure is still reported in table order,
  // exactly as before.
  return Promise.all(checks.map(function (c) {
    return sbRest('GET', c[0] + '?select=' + c[1] + '&school_id=eq.' + encodeURIComponent(schoolId) + '&limit=5000', token).then(function (r) {
      if (!r.ok) return { ok: false, detail: 'verify-' + c[0] };
      var got = Array.isArray(r.data) ? r.data.length : 0;
      // Server may hold MORE rows than this device (another device already
      // migrated) — that is fine. Fewer means this upload did not land.
      if (got < c[2]) return { ok: false, detail: c[0] + ' ' + got + '/' + c[2] };
      return { ok: true, detail: '' };
    });
  })).then(function (results) {
    for (var i = 0; i < results.length; i++) if (!results[i].ok) return results[i];
    return { ok: true, detail: '' };
  });
}
/* v32: upload-missing pass — the core of the automatic sync. Every local
   row the server lacks goes up into the EXISTING server school row
   (sbEnsureServerSchool finds it, never duplicates it). Runs on EVERY
   sync cycle, never blocked by the migration flag (the flag only records
   that the first full migration completed) and never skipped because a
   server school row already exists — that skip is exactly what stranded
   the phone's student in the live VM School failure (laptop logged in
   first and created an empty server school; the phone's re-login then
   took the pull path and its upload never ran). Idempotent:
   sbUploadMissing dedupes by local_id. Rows already in the sync
   snapshot were synced before, so their absence on the server means
   they were deleted elsewhere — the pull drops them locally instead of
   resurrecting them. Never rejects: a failed pass returns {done:false}
   and the cycle's pull + needs-migration fallback still runs. */
/* ================= v45: the demo-seed quarantine =================
   Live 9 Nov 2026 (v44 verification): the test school went from 1
   student to 40 in ~5 minutes, its school row renamed to "St. Xavier
   School" with counters 41/1, and ~149 receipt numbers were minted —
   all demo-seed rows (seedDB(), the harness fixture set) uploaded from
   a client whose local DB still held the pre-v36 seed. seedDB() has no
   caller in app.js (v36 stopped seeding fresh devices), but a local DB
   written before v36 keeps its seed rows forever, and every sync egress
   treated them as the account's own data.
   A seed row is recognisable by its local_id AND its content: the seed
   mints short ids (stu1..stu40, t1..t12, fee1..fee200, ex1..ex5,
   hw1..hw4, n1..n3) while the app mints uniqueId() ids (prefix +
   base-36 timestamp + counter + random — the real V21 Test Kumar row
   is stu1794162292000, 13 digits, never 1–40). The id alone is NOT
   enough: ordinary rows can reuse a short id (the harness fixtures use
   stu1/stu2/ex1/fee1 for real rows), so the fingerprint below is built
   from seedDB() itself — id plus the seed's exact content for that id
   (name + numbers for a student, name + subject + class for a teacher,
   and so on). A row is seed only when both match; an edited seed row
   escapes the quarantine, which is safe — it was user-edited, and the
   server cleanup removes the pristine rows.
   Quarantine rules, all in this version:
   (1) a seed row is never hashed (sbSyncTableHashes) — the diff never
       queues it and the snapshot never marks it synced;
   (2) the upload pass never POSTs it;
   (3) the repair pass never re-numbers it or mints for it (the live
       flood's stu1, ADM-2025-001, collides with the real V21 row — the
       repair would otherwise mint it a new number and upload it as a
       41st student);
   (4) the flush never POSTs/PATCHes it — a queued seed entry is
       dropped as skipped, so the outbox drains instead of replaying
       seed rows one by one forever (the live flood's one-at-a-time
       ~1.4s cadence was the flush, not the bulk upload pass);
   (5) the pull drops a local seed row the server no longer has
       (mergeById + the attendance/marks keep-loops) — demo data is not
       user data, so dropping it cannot lose anything the account
       created; a real local-only row is still kept exactly as before.
   The seed PROFILE is fingerprinted separately (name + city +
   principal + phone + email, all five, plus at least one seed row
   present) and is never pushed to the server school row. */
var __sbSeedFp = null;
function sbSeedFingerprints() {
  // The seed's content fingerprint, built from seedDB() itself so it
  // can never drift from the fixture set: per local_id, the fields
  // that identify the row as the demo seed.
  if (__sbSeedFp) return __sbSeedFp;
  var fp = { students: {}, teachers: {}, exams: {}, feeRecords: {}, homework: {}, notices: {} };
  try {
    var s = seedDB();
    (s.students || []).forEach(function (r) { fp.students[r.id] = (r.name || '') + '|' + (r.admissionNo || '') + '|' + (r.enr || ''); });
    (s.teachers || []).forEach(function (r) { fp.teachers[r.id] = (r.name || '') + '|' + (r.subject || '') + '|' + (r.cls || ''); });
    (s.exams || []).forEach(function (r) { fp.exams[r.id] = (r.name || '') + '|' + (r.cls || '') + '|' + (r.subject || ''); });
    (s.feeRecords || []).forEach(function (r) { fp.feeRecords[r.id] = (r.studentId || '') + '|' + (r.month || '') + '|' + (r.type || '') + '|' + (r.amount || 0) + '|' + (r.status || ''); });
    (s.homework || []).forEach(function (r) { fp.homework[r.id] = (r.title || '') + '|' + (r.cls || '') + '|' + (r.subject || ''); });
    (s.notices || []).forEach(function (r) { fp.notices[r.id] = (r.title || '') + '|' + (r.date || ''); });
  } catch (e) {}
  __sbSeedFp = fp;
  return fp;
}
function sbIsSeedLocalId(table, localId) {
  var id = String(localId || '');
  if (!id) return false;
  if (table === 'ss_students') return /^stu([1-9]|[1-3][0-9]|40)$/.test(id);
  if (table === 'ss_teachers') return /^t([1-9]|1[0-2])$/.test(id);
  if (table === 'ss_exams') return /^ex[1-5]$/.test(id);
  if (table === 'ss_fee_records') return /^fee([1-9]|[1-9][0-9]|1[0-9][0-9]|200)$/.test(id);
  if (table === 'ss_homework') return /^hw[1-4]$/.test(id);
  if (table === 'ss_notices') return /^n[1-3]$/.test(id);
  return false;
}
function sbSeedRowContent(table, row) {
  if (!row) return '';
  if (table === 'ss_students') return (row.name || '') + '|' + (row.admissionNo || '') + '|' + (row.enr || '');
  if (table === 'ss_teachers') return (row.name || '') + '|' + (row.subject || '') + '|' + (row.cls || '');
  if (table === 'ss_exams') return (row.name || '') + '|' + (row.cls || '') + '|' + (row.subject || '');
  if (table === 'ss_fee_records') return (row.studentId || '') + '|' + (row.month || '') + '|' + (row.type || '') + '|' + (row.amount || 0) + '|' + (row.status || '');
  if (table === 'ss_homework') return (row.title || '') + '|' + (row.cls || '') + '|' + (row.subject || '');
  if (table === 'ss_notices') return (row.title || '') + '|' + (row.date || '');
  return '';
}
function sbIsSeedStudentId(id, d) {
  // A student id is a seed id only when the local row for it carries
  // the seed's content for that id. Without a local row to check, it
  // cannot be proven seed — so it is not quarantined (a partial DB
  // that simply omits the students array must never be treated as
  // seed evidence — v39 guard test).
  if (!sbIsSeedLocalId('ss_students', id)) return false;
  var dbx = d || (typeof db !== 'undefined' ? db : null);
  if (!dbx) return false;
  var s = (dbx.students || []).filter(function (x) { return String(x.id) === String(id); })[0];
  if (!s) return false;
  var want = sbSeedFingerprints().students[String(id)];
  return !!want && want === sbSeedRowContent('ss_students', s);
}
function sbIsSeedExamId(id, d) {
  if (!sbIsSeedLocalId('ss_exams', id)) return false;
  var dbx = d || (typeof db !== 'undefined' ? db : null);
  if (!dbx) return false;
  var e = (dbx.exams || []).filter(function (x) { return String(x.id) === String(id); })[0];
  if (!e) return false;
  var want = sbSeedFingerprints().exams[String(id)];
  return !!want && want === sbSeedRowContent('ss_exams', e);
}
function sbIsSeedRow(table, row, d) {
  if (!row) return false;
  if (table === 'ss_attendance') return sbIsSeedStudentId(row.studentId, d);
  if (table === 'ss_marks') return sbIsSeedExamId(row.examId, d) || sbIsSeedStudentId(row.studentId, d);
  if (table === 'ss_receipts') return sbIsSeedStudentId(row.studentId, d);
  if (table === 'ss_fee_structure' || table === 'ss_audit_log' || table === 'ss_activities' || table === 'ss_admission_requests') return false;
  if (!sbIsSeedLocalId(table, row.id)) return false;
  var fp = sbSeedFingerprints();
  var map = table === 'ss_students' ? fp.students : table === 'ss_teachers' ? fp.teachers : table === 'ss_exams' ? fp.exams : table === 'ss_fee_records' ? fp.feeRecords : table === 'ss_homework' ? fp.homework : table === 'ss_notices' ? fp.notices : null;
  if (!map) return false;
  var want = map[String(row.id)];
  return !!want && want === sbSeedRowContent(table, row);
}
function sbIsSeedEntry(table, entry, d) {
  if (!entry) return false;
  if (table === 'ss_schools') return !!(entry.row && entry.row.profile && sbIsSeedProfileParts(entry.row.profile));
  if (entry.key !== undefined && entry.key !== null && entry.key !== '') {
    if (table === 'ss_attendance') { var ap = String(entry.key).split('|'); return sbIsSeedStudentId(ap[2], d); }
    if (table === 'ss_marks') { var mp = String(entry.key).split('|'); return sbIsSeedExamId(mp[0], d) || sbIsSeedStudentId(mp[1], d); }
    if (sbIsSeedRow(table, entry.row, d)) return true;
  }
  return sbIsSeedRow(table, entry.row, d);
}
function sbIsSeedProfileParts(p) {
  if (!p) return false;
  return (p.name || '') === 'St. Xavier School' && (p.city || '') === 'Patna'
    && (p.principal || '') === 'Rahul Kumar' && (p.phone || '') === '+91 98350 12345'
    && (p.email || '') === 'info@stxavierpatna.edu.in';
}
function sbIsSeedProfile(d) {
  if (!d || !sbIsSeedProfileParts(d.profile)) return false;
  // A real school could share the name — the seed rows prove it is the
  // demo set, not a coincidence.
  function anySeed(table, arr) { return (arr || []).some(function (r) { return sbIsSeedRow(table, r); }); }
  return anySeed('ss_students', d.students) || anySeed('ss_teachers', d.teachers) || anySeed('ss_exams', d.exams)
    || anySeed('ss_fee_records', d.feeRecords) || anySeed('ss_homework', d.homework) || anySeed('ss_notices', d.notices);
}
// v52: the parent ids a pending outbox entry still references. The
// entry's own row carries the ids when present; otherwise the key is
// parsed (attendance 'date|cls|studentId', marks 'examId|studentId';
// a receipt resolves through the local receipt of that number). The
// students/exams upload steps use this to decide whether a
// snapshot-filtered parent must still upload — a parent the server
// lacks but a pending child references is an unconfirmed upload, not
// a delete elsewhere.
function sbOutboxReferencedParents(sbUid, d) {
  var students = {}, exams = {};
  try {
    (sbOutboxLoad(sbUid) || []).forEach(function (e) {
      if (!e || e.op !== 'upsert') return;
      var row = e.row || {};
      if (e.table === 'ss_students' && e.key) students[e.key] = true;
      if (e.table === 'ss_attendance') {
        if (row.studentId) students[row.studentId] = true;
        else if (e.key) { var p = String(e.key).split('|'); if (p[2]) students[p[2]] = true; }
      }
      if (e.table === 'ss_marks') {
        if (row.studentId) students[row.studentId] = true;
        if (row.examId) exams[row.examId] = true;
        if (e.key) { var q = String(e.key).split('|'); if (q[0]) exams[q[0]] = true; if (q[1]) students[q[1]] = true; }
      }
      if (e.table === 'ss_fee_records' && row.studentId) students[row.studentId] = true;
      if (e.table === 'ss_receipts') {
        if (row.studentId) students[row.studentId] = true;
        else if (e.key && d && d.receipts) {
          var rc = (d.receipts || []).filter(function (x) { return x.receiptNo === e.key; })[0];
          if (rc && rc.studentId) students[rc.studentId] = true;
        }
      }
    });
  } catch (err52) {}
  return { students: students, exams: exams };
}
function sbSyncUploadMissing(account, sbUid, token) {
  if (sbMigPromise) return sbMigPromise;
  if (!account || account.role !== 'school') return Promise.resolve({ done: false, reason: 'not-school' });
  if (!sbIsOnline()) return Promise.resolve({ done: false, reason: 'offline' });
  var d = db; // the account's DB is loaded by loginAs before this runs
  var schoolId = null, stuMap = {}, examMap = {};
  var byId = {};
  (d.students || []).forEach(function (s) { byId[s.id] = s; });
  var snap = sbSnapLoad(account.uid);
  // v52: read once per pass — the outbox does not change while the
  // upload runs (only the flush touches it, and it runs after).
  var outboxParents52 = sbOutboxReferencedParents(sbUid, d);
  function notSynced(table, key) { return !(snap[table] && snap[table][key] !== undefined); }
  function freshRows(table, rows, keyFn) {
    return rows.filter(function (row) { return notSynced(table, keyFn(row)); });
  }
  // v39: one table's upload failure used to reject the whole chain, so
  // a single failing table (the live test account's receipts) killed
  // every cycle and the status could never say WHICH table failed.
  // Each step now records its own failure and the chain continues
  // with the remaining tables; the pass reports the first failed
  // table in its detail, and the status line shows it (see
  // sbStatusText). A failed students step leaves stuMap empty, so
  // dependent rows are skipped by their own student_id filters —
  // nothing uploads with a dangling foreign key.
  // v47: EVERY upload step uses the v39/v46 bypass — a row the server
  // lacks uploads even when a stale snapshot entry says it already
  // synced. The trap is structural, not table-specific: the snapshot
  // is only rebuilt after a pull, the pull only runs after a
  // successful verify, and the verify fails exactly when a row the
  // snapshot claims is missing from the server — so one stale entry
  // stalls the cycle forever (v39 receipts, v46 fee records, v47
  // attendance, each on the next table in the chain). sbUploadMissing
  // dedupes against the server's actual rows, so an already-uploaded
  // row is never re-POSTed. Skipped only when the school row itself
  // was recreated (a full server wipe): then the snapshot still means
  // "deleted elsewhere" and the pull drops the row instead of
  // resurrecting it. The repair pass runs before the upload in every
  // cycle, so a number collision is re-numbered before any POST can
  // 409; a POST that still fails is caught by step() and reported by
  // table, never killing the chain. Support requests and admission
  // applications are fire-and-forget queues (no snapshot filter), so
  // they carry no version of this trap.
  var uploadErrors = [];
  function step(table, fn) {
    return Promise.resolve().then(fn).catch(function (err) {
      uploadErrors.push({ table: table, error: (err && err.message) || 'error' });
      return null;
    });
  }
  // v39: the server school row this device knew BEFORE this pass.
  // If sbEnsureServerSchool returns a DIFFERENT id, the school row
  // was recreated (a full server wipe) — the receipts snapshot
  // bypass below is then skipped, so a wiped school's receipts are
  // not resurrected on this device.
  var prevServerSchoolId = (sbServerSchoolMap()[account.uid]) || null;
  var schoolRecreated = false;
  // Pre-check (one cycle, before any upload): does the server school
  // already hold real data, and what are its counters? The school-row
  // PATCH below must never clobber a populated server row's profile
  // (the v31 pull test: server adm_counter 3 + admission_fee 200 must
  // survive a fresh device's empty profile), but the counters must
  // never go backwards either (offline admissions on this device).
  var serverHasStudents = false, serverAdmCounter = 1, serverReceiptCounter = 1;
  // v52: the 12 table steps, as named functions so the orchestration
  // below can run them in two parallel phases instead of one long
  // sequential chain. Bodies are unchanged from v51 except the
  // students/exams steps, which carry the narrowed bypass (see there).
  function stepFeeStructure() {
    return step('ss_fee_structure', function () {
      var fsRows = (d.feeStructure || []).map(function (f) { return sbMapFeeStructure(f, schoolId); });
      // v47: the bypass (see the note above step()).
      var fsUpload = schoolRecreated
        ? freshRows('ss_fee_structure', fsRows, function (row) { return row.cls + '|' + row.fee_type; })
        : fsRows;
      return sbUploadMissing(token, schoolId, 'ss_fee_structure', 'cls,fee_type',
        fsUpload,
        function (row) { return row.cls + '|' + row.fee_type; });
    });
  }
  function stepStudents() {
    return step('ss_students', function () {
      // v47: students deliberately KEEP the snapshot filter — they are
      // the anchor rows, and the filter is what implements the designed
      // server-wins delete (v31: a student deleted on the server drops
      // locally instead of resurrecting). The bypass would re-upload a
      // deleted student and, through stuMap, its fee records too — the
      // v31 test proves it. No live stale-student stall exists (the V21
      // row IS on the server; the v44 failure was the stored id map,
      // already fixed), and the onInserted GET below still fills stuMap
      // when nothing is fresh, so dependent rows keep resolving.
      // v52: NARROWED bypass — a student the snapshot claims is synced
      // but the server lacks still uploads when a pending outbox entry
      // references it (itself, or a child attendance/mark/fee/receipt
      // row). Without this the child entry keeps forever: the parent
      // never uploads, the map never resolves, the flush never drains
      // and the status stays pending (live v51 — the v51 fix only
      // dropped entries whose local row is GONE; here the row exists).
      // A student deleted on the server with NO pending reference
      // still drops (v31): the bypass fires only on outbox evidence.
      var stuBase = freshRows('ss_students', (d.students || []).filter(function (s) { return !s.numPending && !sbIsSeedRow('ss_students', s, d); }).map(function (s) { return sbMapStudent(s, schoolId); }),
          function (row) { return row.local_id; });
      (d.students || []).filter(function (s) { return !s.numPending && !sbIsSeedRow('ss_students', s, d) && outboxParents52.students[s.id]; }).map(function (s) { return sbMapStudent(s, schoolId); }).forEach(function (row) {
        if (!stuBase.some(function (x) { return x.local_id === row.local_id; })) stuBase.push(row);
      });
      return sbUploadMissing(token, schoolId, 'ss_students', 'local_id,id',
        stuBase,
        function (row) { return row.local_id; },
        // v44: persist the id map too — the old code only kept it in
        // memory, so a row uploaded (or re-created) by this pass left
        // the stored map pointing at a deleted id, and every later
        // push trusted that stale id and 409'd on admission_no.
        function (rows) { rows.forEach(function (r) { if (r.local_id) { stuMap[r.local_id] = r.id; sbSrvIdSet(sbUid, 'ss_students', r.local_id, r.id); } }); });
    });
  }
  function stepTeachers() {
    return step('ss_teachers', function () {
      var teRows = (d.teachers || []).filter(function (te) { return !sbIsSeedRow('ss_teachers', te, d); }).map(function (te) { return sbMapTeacher(te, schoolId); });
      // v47: the bypass (see the note above step()).
      var teUpload = schoolRecreated
        ? freshRows('ss_teachers', teRows, function (row) { return row.local_id; })
        : teRows;
      return sbUploadMissing(token, schoolId, 'ss_teachers', 'local_id',
        teUpload,
        function (row) { return row.local_id; });
    });
  }
  function stepExams() {
    return step('ss_exams', function () {
      var exRows = (d.exams || []).filter(function (e) { return !sbIsSeedRow('ss_exams', e, d); }).map(function (e) { return sbMapExam(e, schoolId); });
      // v47: the bypass (see the note above step()).
      // v52: the same narrowed bypass as students — an exam the
      // snapshot claims is synced but the server lacks still uploads
      // when a pending marks entry references it, or the marks keep
      // forever with it.
      var exUpload = schoolRecreated
        ? freshRows('ss_exams', exRows, function (row) { return row.local_id; })
        : exRows;
      (d.exams || []).filter(function (e) { return !sbIsSeedRow('ss_exams', e, d) && outboxParents52.exams[e.id]; }).map(function (e) { return sbMapExam(e, schoolId); }).forEach(function (row) {
        if (!exUpload.some(function (x) { return x.local_id === row.local_id; })) exUpload.push(row);
      });
      return sbUploadMissing(token, schoolId, 'ss_exams', 'local_id,id',
        exUpload,
        function (row) { return row.local_id; },
        // v44: same map persist as students — a row uploaded by this
        // pass must not leave a stale stored id behind.
        function (rows) { rows.forEach(function (r) { if (r.local_id) { examMap[r.local_id] = r.id; sbSrvIdSet(sbUid, 'ss_exams', r.local_id, r.id); } }); });
    });
  }
  function stepFeeRecords() {
    return step('ss_fee_records', function () {
      var feeRows = (d.feeRecords || []).filter(function (r) { return !sbIsSeedRow('ss_fee_records', r, d); }).map(function (r) { return sbMapFeeRecord(r, schoolId, stuMap); }).filter(function (p) { return !!p.student_id; });
      // v46: a fee record the server lacks uploads even when a stale
      // snapshot entry says it already synced — the live test account
      // proved the trap (10 Nov 2026: "Backup failed … (ss_fee_records
      // 0/3)" every cycle, although the upload pass reported done:true).
      // This is the v39 receipts bypass, extended to fee records:
      // sbUploadMissing dedupes against the server's actual rows by
      // local_id, so an already-uploaded record is never re-POSTed.
      // Skipped only when the school row itself was recreated (a full
      // server wipe): then the snapshot still means "deleted elsewhere"
      // and the pull drops the row instead of resurrecting it.
      var feeUpload = schoolRecreated
        ? freshRows('ss_fee_records', feeRows, function (row) { return row.local_id; })
        : feeRows;
      return sbUploadMissing(token, schoolId, 'ss_fee_records', 'local_id',
        feeUpload,
        function (row) { return row.local_id; });
    });
  }
  function stepAttendance() {
    return step('ss_attendance', function () {
      var attRows = sbFlattenAttendance(d).filter(function (a) { return !!stuMap[a.studentId] && !sbIsSeedStudentId(a.studentId, d); });
      // v47: THE fix — the v39/v46 bypass, applied here at last. The
      // step used to drop rows through an inline notSynced() filter,
      // so a stale snapshot entry hid the real V21 mark forever and
      // every cycle failed at the verify ("Backup failed …
      // (ss_attendance 0/1)"). The filter now runs only when the
      // school row itself was recreated (a full server wipe). The
      // quarantine does not flag the real row: its student id is
      // uniqueId-style, never stu1..stu40.
      var attUpload = schoolRecreated
        ? attRows.filter(function (a) { return notSynced('ss_attendance', a.date + '|' + a.cls + '|' + a.studentId); })
        : attRows;
      return sbUploadMissing(token, schoolId, 'ss_attendance', 'att_date,cls,student_id', attUpload.map(function (a) {
        return { school_id: schoolId, att_date: a.date, cls: a.cls, student_id: stuMap[a.studentId], status: a.status };
      }),
        function (row) { return row.att_date + '|' + row.cls + '|' + row.student_id; });
    });
  }
  function stepReceipts() {
    return step('ss_receipts', function () {
      var rcRows = (d.receipts || []).filter(function (rc) { return !rc.numPending && !sbIsSeedStudentId(rc.studentId, d); }).map(function (rc) { return sbMapReceipt(rc, schoolId, stuMap, byId); }).filter(function (p) { return !!p.student_id; });
      // v39: a receipt the server lacks uploads even when a stale
      // snapshot entry says it already synced. The live test account
      // proved the trap: RCP-2026-003 was minted by the server RPC
      // (receipt_counter 4) yet never landed in ss_receipts (0 rows),
      // and the snapshot filter made every cycle skip it — then the
      // migration guard failed the cycle forever ("Backup failed").
      // sbUploadMissing dedupes against the server's actual rows by
      // receipt_no, so an already-uploaded receipt is never re-POSTed.
      // Skipped only when the school row itself was recreated (a full
      // server wipe): then the snapshot still means "deleted
      // elsewhere" and the pull drops the row instead of resurrecting
      // it. Numberless offline receipts are excluded here as before —
      // the repair pass mints their numbers first.
      var rcUpload = schoolRecreated
        ? freshRows('ss_receipts', rcRows, function (row) { return row.receipt_no; })
        : rcRows;
      return sbUploadMissing(token, schoolId, 'ss_receipts', 'receipt_no', rcUpload,
        function (row) { return row.receipt_no; });
    });
  }
  function stepMarks() {
    return step('ss_marks', function () {
      var markRows = (d.marks || []).filter(function (m) { return examMap[m.examId] && stuMap[m.studentId] && !sbIsSeedExamId(m.examId, d) && !sbIsSeedStudentId(m.studentId, d); });
      // v47: the bypass (see the note above step()) — the marks step
      // carried the same inline notSynced() trap as attendance.
      var markUpload = schoolRecreated
        ? markRows.filter(function (m) { return notSynced('ss_marks', m.examId + '|' + m.studentId); })
        : markRows;
      return sbUploadMissing(token, schoolId, 'ss_marks', 'exam_id,student_id', markUpload.map(function (m) {
        return { school_id: schoolId, exam_id: examMap[m.examId], student_id: stuMap[m.studentId], marks: m.marks };
      }),
        function (row) { return row.exam_id + '|' + row.student_id; });
    });
  }
  function stepHomework() {
    return step('ss_homework', function () {
      var hwRows = (d.homework || []).filter(function (h) { return !sbIsSeedRow('ss_homework', h, d); }).map(function (h) { return sbMapHomework(h, schoolId, stuMap); });
      // v47: the bypass (see the note above step()).
      var hwUpload = schoolRecreated
        ? freshRows('ss_homework', hwRows, function (row) { return row.local_id; })
        : hwRows;
      return sbUploadMissing(token, schoolId, 'ss_homework', 'local_id',
        hwUpload,
        function (row) { return row.local_id; });
    });
  }
  function stepNotices() {
    return step('ss_notices', function () {
      var nRows = (d.notices || []).filter(function (n) { return !sbIsSeedRow('ss_notices', n, d); }).map(function (n) { return sbMapNotice(n, schoolId); });
      // v47: the bypass (see the note above step()).
      var nUpload = schoolRecreated
        ? freshRows('ss_notices', nRows, function (row) { return row.local_id; })
        : nRows;
      return sbUploadMissing(token, schoolId, 'ss_notices', 'local_id',
        nUpload,
        function (row) { return row.local_id; });
    });
  }
  function stepAuditLog() {
    return step('ss_audit_log', function () {
      var auRows = (d.auditLog || []).map(function (a) { return sbMapAudit(a, schoolId); });
      // v47: the bypass (see the note above step()).
      var auUpload = schoolRecreated
        ? freshRows('ss_audit_log', auRows, function (row) { return sbNormTs(row.ts) + '|' + row.actor + '|' + row.action + '|' + row.details; })
        : auRows;
      return sbUploadMissing(token, schoolId, 'ss_audit_log', 'ts,actor,action,details',
        auUpload,
        function (row) { return sbNormTs(row.ts) + '|' + row.actor + '|' + row.action + '|' + row.details; });
    });
  }
  function stepActivities() {
    return step('ss_activities', function () {
      var acRows = (d.activities || []).map(function (a) { return sbMapActivity(a, schoolId); });
      // v47: the bypass (see the note above step()).
      var acUpload = schoolRecreated
        ? freshRows('ss_activities', acRows, function (row) { return row.title + '|' + row.sub; })
        : acRows;
      return sbUploadMissing(token, schoolId, 'ss_activities', 'title,sub',
        acUpload,
        function (row) { return row.title + '|' + row.sub; });
    });
  }
  sbMigPromise = sbEnsureServerSchool(account, sbUid, token, d).then(function (id) {
    schoolId = id;
    schoolRecreated = !!prevServerSchoolId && prevServerSchoolId !== schoolId;
    if (!schoolId) throw new Error('no-school-id');
    return Promise.all([
      sbRest('GET', 'ss_students?select=id&school_id=eq.' + encodeURIComponent(schoolId) + '&limit=1', token),
      sbRest('GET', 'ss_schools?select=adm_counter,receipt_counter&id=eq.' + encodeURIComponent(schoolId), token)
    ]);
  }).then(function (res) {
    serverHasStudents = !!(res[0].ok && Array.isArray(res[0].data) && res[0].data.length);
    var row = (res[1].ok && Array.isArray(res[1].data) && res[1].data[0]) || null;
    if (row) {
      serverAdmCounter = row.adm_counter || 1;
      serverReceiptCounter = row.receipt_counter || 1;
    }
    // v52: the 12 table steps ran SEQUENTIALLY — each step waited for
    // the previous table's GET + POST before starting, so one upload
    // pass was ~12 sequential round-trips (plus ensure + precheck) and
    // one cycle was ~17 + 2E round-trips (E = outbox entries). At real
    // browser→Supabase latency that is 60–120s: the 90s+ "Syncing…"
    // stall (live v51). The steps split into two dependency phases —
    // Phase A needs no id map (fee structure, students, teachers,
    // exams, notices, audit log, activities) and Phase B needs the
    // maps Phase A fills (fee records, attendance, receipts, marks,
    // homework) — and each phase fires in one parallel batch, so the
    // pass is ~2 round-trips of tables instead of ~12. The school-row
    // PATCH stays last, after the tables. Per-table error handling is
    // unchanged: step() still records a failure per table and the
    // chain continues with the rest.
    return Promise.all([stepFeeStructure(), stepStudents(), stepTeachers(), stepExams(), stepNotices(), stepAuditLog(), stepActivities()]);
  }).then(function () {
    return Promise.all([stepFeeRecords(), stepAttendance(), stepReceipts(), stepMarks(), stepHomework()]);
  }).then(function () {
    // School profile + counters, last in the chain so a failure here
    // can never block the table uploads. Two cases:
    // - Server school is EMPTY (no students yet — e.g. created by
    //   another device logging in first): push the full local profile
    //   and counters, so the next pull does not reset them (an admission
    //   counter reset to 1 would mint a duplicate admission number).
    // - Server school already holds real data: push ONLY the counters,
    //   and only upwards (max of local/server) — never clobber the
    //   populated server row's profile with this device's stale one.
    // Runs only when this device never synced the school row (no
    // ss_schools entry in the snapshot) and the local profile has a
    // name — a fresh device with an empty profile must never blank the
    // server row's name.
    if ((!snap.ss_schools || snap.ss_schools.school === undefined) && d.profile && d.profile.name && !sbIsSeedProfile(d)) {
      var payload = serverHasStudents
        ? { adm_counter: Math.max(d.admCounter || 1, serverAdmCounter), receipt_counter: Math.max(d.receiptCounter || 1, serverReceiptCounter) }
        : sbSyncSchoolPayload(d);
      return step('ss_schools', function () {
        return sbRest('PATCH', 'ss_schools?id=eq.' + encodeURIComponent(schoolId), token, payload, 'return=minimal').then(function (r) {
          if (!r.ok) throw new Error('patch-school');
        });
      });
    }
  }).then(function () {
    sbMigPromise = null;
    // v39: the pass reports the first table that failed, by name, so
    // the cycle (and the status line) can say exactly what broke
    // instead of a bare "Backup failed".
    if (uploadErrors.length) return { done: false, reason: 'upload-failed', detail: uploadErrors[0].table + ': ' + uploadErrors[0].error, schoolId: schoolId };
    return { done: true, reason: 'ok', schoolId: schoolId };
  }).catch(function (err) {
    sbMigPromise = null;
    return { done: false, reason: 'error', detail: (err && err.message) || 'error' };
  });
  return sbMigPromise;
}
function sbMaybeMigrate(account, sbUid, token, force) {
  // One-time full migration (v27): the upload pass plus a read-back
  // count verification; only then is the account marked migrated. Used
  // by the Back Up Now button (forced) and by the cycle's
  // needs-migration fallback. The everyday path is the cycle's upload
  // pass (sbSyncUploadMissing), which runs without the flag or the
  // verification gate.
  if (sbMigPromise) return sbMigPromise;
  if (!account || account.role !== 'school') return Promise.resolve({ done: false, reason: 'not-school' });
  if (!force && sbLoadMig(sbUid)) return Promise.resolve({ done: true, reason: 'already' });
  if (!sbIsOnline()) { sbSetStatus('offline'); return Promise.resolve({ done: false, reason: 'offline' }); }
  sbSetStatus('uploading');
  var d = db; // the account's DB is loaded by loginAs before this runs
  // v45: verify against the REAL rows only — the seed never uploads,
  // so requiring it on the server would fail the migration forever.
  var counts = sbLocalCountsReal(d);
  return sbSyncUploadMissing(account, sbUid, token).then(function (up) {
    if (!up.done) {
      sbSetStatus('failed', up.detail || '');
      return { done: false, reason: up.reason || 'error', detail: up.detail || '' };
    }
    return sbVerifyCounts(token, up.schoolId, counts).then(function (v) {
      sbMigPromise = null;
      if (!v.ok) {
        sbSetStatus('failed', v.detail);
        return { done: false, reason: 'verify', detail: v.detail };
      }
      sbSaveMig(sbUid, { at: new Date().toISOString(), schoolId: up.schoolId, counts: counts });
      sbSetStatus('synced');
      return { done: true, reason: 'ok', schoolId: up.schoolId, counts: counts };
    });
  }).catch(function (err) {
    sbMigPromise = null;
    sbSetStatus('failed', (err && err.message) || 'error');
    return { done: false, reason: 'error', detail: (err && err.message) || 'error' };
  });
}
function sbRetryMigration() {
  if (!state.user || state.user.role !== 'school') { toast(t('sbStatusNotSchool')); return; }
  if (!state.sb || !state.sb.uid) { toast(t('sbStatusPending')); return; }
  toast(t('sbStatusUploading'));
  sbGetValidToken().then(function (tok) {
    if (!tok) { sbSetStatus(sbSessionExpired ? 'session-expired' : 'offline'); toast(t(sbSessionExpired ? 'sbStatusSessionExpired' : 'sbStatusOffline')); renderApp(); return; }
    return sbMaybeMigrate(state.user, state.sb.uid, tok, true).then(function (r) {
      if (!r.done) { toast(t('sbBackupFailed')); renderApp(); return; }
      // v44: the migration only covers the upload pass — it never
      // flushes the outbox, so a queued entry could still be failing
      // (live: the students 409) while this toast claimed success.
      // "Backup complete." only when the outbox is actually empty
      // after a serialized flush; anything else says it did not finish.
      return sbSyncFlushNow().then(function (fl) {
        var left = sbOutboxLoad(state.sb.uid).length;
        toast(fl && fl.done && !left ? t('sbBackupDone') : t('sbBackupFailed'));
        renderApp();
      });
    });
  }).catch(function () { toast(t('sbBackupFailed')); });
}
// v30: second-device download — the inverse of sbMaybeMigrate. A school
// signing in on a new phone has its data on the server but an empty local
// workspace; this pulls it down. SAFETY FIRST: the local store is filled
// ONLY when it is completely empty (no students AND no fee records AND no
// teachers). If ANY local data exists the download is skipped entirely —
// upload wins, local data is never overwritten and never deleted.
// Download never blocks login (fire-and-forget, like migration) and never
// sets the migration flag, so new local rows still upload later via
// "Back Up Now". Also fetches the school row itself (profile, fee extras,
// counters) and the fee structure, which the content tables do not carry.
function sbRowToStudent(row) {
  return { id: row.local_id || ('srv-' + row.id), name: row.name || '', cls: row.cls || '', roll: row.roll || 0,
    enr: row.enr || '', guardian: row.guardian || '', phone: row.phone || '', mobile2: row.mobile2 || '',
    parentEmail: row.parent_email || '', fatherName: row.father_name || '', motherName: row.mother_name || '',
    occupation: row.occupation || '', dob: row.dob || '',
    gender: (row.gender === 'Boy' || row.gender === 'Girl') ? row.gender : '',
    bloodGroup: row.blood_group || '', category: row.category || '', address: row.address || '',
    state: row.state || '', district: row.district || '', pin: row.pin || '',
    previousSchool: row.previous_school || '', previousClass: row.previous_class || '',
    admissionNo: row.admission_no || '', admissionDate: row.admission_date || '',
    session: row.session || '', status: row.status || 'Active', result: (row.result === undefined || row.result === null) ? null : row.result,
    parentPin: (row.parent_pin && String(row.parent_pin).indexOf('s256$') !== 0) ? row.parent_pin : undefined, // v55: no server PIN leaves the field UNDEFINED (never null) — a null used to land here and migrateV12 only refills `undefined`, so a null permanently killed the phone-derived PIN (live V21/2108 loss, v54)
    parentPinHash: (row.parent_pin && String(row.parent_pin).indexOf('s256$') === 0) ? row.parent_pin : undefined, // v55: same — a hash arrives here, a missing PIN leaves the field unset
    photo: row.photo_data_url || null,
    documents: row.documents || { birthCert: false, tc: false, tcNumber: '', other: '' },
    aadhaar: aadhaarLast4(row.aadhaar) }; // v36: a full number from an old server row is reduced on pull too
}
function sbRowToFeeRecord(row, stuMap) {
  return { id: row.local_id || ('srv-' + row.id), studentId: stuMap[row.student_id] || '',
    student: row.student_name || '', cls: row.cls || '', month: row.month || '', type: row.fee_type || 'Tuition',
    amount: row.amount || 0, status: row.status || 'Pending', date: row.record_date || '' };
}
// v31: apply a full set of server rows onto a local DB (server wins).
// Shared by the v30 empty-store download and the v31 server-first pull.
// Replaces every synced list wholesale — callers must have passed the
// safety guards first (empty store, or the pull guard + outbox). Returns
// the server->local id maps (students, exams) so callers can rebuild the
// local->server map. Admission requests are included here: the download
// never fetched them (its table list lacks the table), so the guard keeps
// the local list when the server sends none.
function sbRowToAdmissionRequest(row, stuMap) {
  return { id: row.local_id || ('srv-' + row.id), name: row.name || '', dob: row.dob || '',
    gender: row.gender || '', classApply: row.class_apply || '', guardianName: row.guardian_name || '',
    phone: row.phone || '', previousSchool: row.previous_school || '', status: row.status || 'Pending',
    reason: row.reason || '', submitted: row.submitted || '', studentId: stuMap[row.student_id] || '' };
}
function sbMapAdmissionRequest(r, schoolId, stuMap) {
  return { school_id: schoolId, local_id: r.id, name: r.name || '', dob: sbNullIfEmpty(r.dob),
    gender: r.gender || '', class_apply: r.classApply || '', guardian_name: r.guardianName || '',
    phone: r.phone || '', previous_school: r.previousSchool || '', status: r.status || 'Pending',
    reason: r.reason || '', submitted: r.submitted || todayIST(), student_id: stuMap[r.studentId] || null };
}
function sbApplyServerRows(d, schoolRow, byTable, account, sid) {
  // School row first: profile, fee extras, counters.
  if (schoolRow) {
    d.profile = { name: schoolRow.name || d.profile.name || '', city: schoolRow.city || '', principal: schoolRow.principal || '', phone: schoolRow.phone || '', email: schoolRow.email || '', session: schoolRow.session || '2025–26', address: schoolRow.address || '' };
    if (schoolRow.logo_data_url) d.profile.logo = schoolRow.logo_data_url;
    d.feeExtras = { admissionFee: schoolRow.admission_fee || 0, cautionMoney: schoolRow.caution_money || 0, annualCharges: schoolRow.annual_charges || 0, transportFee: schoolRow.transport_fee || 0 };
    d.admCounter = schoolRow.adm_counter || 1;
    d.receiptCounter = schoolRow.receipt_counter || 1;
    if (account) sbSaveServerSchool(account.uid, sid);
  }
  // Fee structure is merged below (after the snapshot helpers) — a
  // locally-added row that has not uploaded yet must survive the pull
  // (v34, P1-1); the old wholesale replacement wiped it.
  // v33: MERGE, never replace wholesale. A local row that has NOT
  // reached the server yet — not on the server AND not in the last
  // synced snapshot — is KEPT, and the caller keeps it out of the
  // snapshot so the next cycle still uploads it. A failed upload must
  // never delete local data (9 Nov 2026, VM School: a colliding laptop
  // student was wiped by a server-wins pull and existed nowhere).
  // A row that IS in the snapshot but absent on the server was deleted
  // elsewhere and still drops. Receipts carry no local_id on the
  // server, so a receipt is "the same" only when its number AND its
  // content (student, total, date, month) match; same number with
  // different content is a collision and is kept for the repair pass.
  var snap = (account && account.uid) ? sbSnapLoad(account.uid) : {};
  function snapHas(table, key) { return !!(snap[table] && snap[table][key] !== undefined); }
  var kept = {};
  function keep(table, key) { if (!kept[table]) kept[table] = {}; kept[table][key] = true; }
  // v45: snapshot the seed student/exam ids BEFORE the merges below
  // drop the seed rows — the dependent merges (fee records, attendance,
  // marks, receipts) prove a row is seed by its student/exam, and that
  // proof vanishes once the student/exam row is gone (the live v44
  // flood: the first pull dropped the 40 students but kept their seed
  // attendance/marks, which then looked real and blocked every later
  // cycle at the migration guard). The sets are built from the full
  // local DB at merge start, so they are exact; a real student's row
  // is always present here.
  var seedStudentIds = {};
  (d.students || []).forEach(function (s) { if (sbIsSeedStudentId(s.id, d)) seedStudentIds[s.id] = true; });
  var seedExamIds = {};
  (d.exams || []).forEach(function (e) { if (sbIsSeedExamId(e.id, d)) seedExamIds[e.id] = true; });
  // v46: pending outbox upserts, keyed by the SUPABASE uid — the
  // outbox is stored per Supabase uid (see SB_OUTBOX_KEY), not per
  // local account uid, so the merge must load it with the session
  // uid (the account's sbUid, falling back to the live session).
  // A row with a pending upsert is proof its upload is still
  // unconfirmed, so the merge must not drop it on snapshot grounds
  // alone (the v39 receipts trap: a stale snapshot entry marked a row
  // synced although it never landed, and the next pull wiped the
  // local row). A row deleted elsewhere has no pending upsert, so it
  // still drops. Shared by mergeById (fee records) and the receipts
  // keep-loop below — the v39 receipts load read the local account
  // uid and so always saw an empty outbox; the keep never fired.
  // v47 extends the same keep to attendance and marks, whose merges
  // used to drop a queued row on snapshot grounds with no outbox
  // check at all.
  var outboxUpsert46 = { feeRecords: {}, receipts: {}, attendance: {}, marks: {}, students: {}, exams: {} };
  try {
    var uid46 = (account && account.sbUid) || (typeof state !== 'undefined' && state.sb && state.sb.uid) || '';
    if (uid46) {
      (sbOutboxLoad(uid46) || []).forEach(function (e) {
        if (e && e.op === 'upsert' && e.key) {
          if (e.table === 'ss_fee_records') outboxUpsert46.feeRecords[e.key] = true;
          if (e.table === 'ss_receipts') outboxUpsert46.receipts[e.key] = true;
          if (e.table === 'ss_attendance') outboxUpsert46.attendance[e.key] = true;
          if (e.table === 'ss_marks') outboxUpsert46.marks[e.key] = true;
          if (e.table === 'ss_students') outboxUpsert46.students[e.key] = true;
          if (e.table === 'ss_exams') outboxUpsert46.exams[e.key] = true;
        }
      });
    }
  } catch (e46) {}
  function mergeIsSeedRow(table, row) {
    if (table === 'ss_fee_records' || table === 'ss_receipts') return !!seedStudentIds[row.studentId];
    if (table === 'ss_marks') return !!(seedExamIds[row.examId] || seedStudentIds[row.studentId]);
    return sbIsSeedRow(table, row, d);
  }
  function mergeById(table, localArr, serverRows, mapFn) {
    // v47: the server can hold two rows for one local id (live: the v46
    // verification POSTed each of the 3 fee records twice — 6 server
    // rows, 3 local ids). The mirror keeps ONE row per id: the first
    // server row wins, the later duplicate is dropped. Without this
    // the pull doubles the local list (and the Fee Collected total).
    var serverList = [];
    var onServer = {};
    (serverRows || []).forEach(function (row) {
      var r = mapFn(row);
      if (r.id && onServer[r.id]) return;
      if (r.id) onServer[r.id] = true;
      serverList.push(r);
    });
    var merged = serverList.slice();
    (localArr || []).forEach(function (r) {
      if (!r.id || onServer[r.id]) return;
      if (snapHas(table, r.id)) {
        // v46: a fee record whose upload is still unconfirmed (a
        // pending outbox upsert) is KEPT, never dropped on snapshot
        // grounds — the snapshot entry is stale, not proof of a delete
        // elsewhere.
        if (table === 'ss_fee_records' && outboxUpsert46.feeRecords[r.id]) { merged.push(r); keep(table, r.id); }
        return;
      }
      // v45: a local demo-seed row the server no longer has is dropped,
      // never kept — it was never the account's data, so dropping it
      // cannot lose anything the account created (the 9 Nov never-lose
      // rule protects user rows only; a real local-only row is still
      // kept exactly as before). This is what returns a flooded device
      // to 1 student after the server cleanup runs.
      if (mergeIsSeedRow(table, r)) return;
      merged.push(r);
      keep(table, r.id);
    });
    return merged;
  }
  // Fee structure merge (v34, P1-1): the server's rows win for a
  // class/type it has, but a locally-added row that has not uploaded yet
  // (not on the server AND not in the snapshot) is kept. A row that IS
  // in the snapshot but absent on the server was deleted elsewhere and
  // still drops. When the server has no structure at all, the local
  // defaults stay.
  if ((byTable.ss_fee_structure || []).length) {
    var srvFs = byTable.ss_fee_structure.map(function (row) { return { cls: row.cls || '', type: row.fee_type || 'Tuition', amount: row.amount || 0 }; });
    var srvFsKeys = {};
    srvFs.forEach(function (f) { srvFsKeys[(f.cls || '') + '|' + (f.type || 'Tuition')] = true; });
    var mergedFs = srvFs.slice();
    (d.feeStructure || []).forEach(function (f) {
      var k = (f.cls || '') + '|' + (f.type || 'Tuition');
      if (srvFsKeys[k] || snapHas('ss_fee_structure', k)) return;
      mergedFs.push(f);
      keep('ss_fee_structure', k);
    });
    d.feeStructure = mergedFs;
  }
  // Students first: everything else maps through their server ids.
  var stuMap = {}, examMap = {};
  var oldStudents = d.students || [];
  d.students = mergeById('ss_students', oldStudents, byTable.ss_students || [], function (row) { var s = sbRowToStudent(row); stuMap[row.id] = s.id; return s; });
  // v56: a student with a pending outbox upsert keeps its LOCAL row through the pull —
  // the server row is the pre-change version, and letting it win wipes the unconfirmed
  // local change. Live v55: the admin re-set the PIN to 2108 (queued), the pull replaced
  // the local hash(2108) with the server's stale hash(0000), the flush pushed 2108, and
  // the pass-1 tail re-diff then re-queued the stale local row (0000) and pass 2
  // re-uploaded it — undoing the push in the same flush, so the login kept failing.
  // Same class as the v46/v47 keeps for fee records, receipts, attendance and marks;
  // students were the one table without it. A row deleted elsewhere has no pending
  // upsert, so it still drops; a seed row never carries a pending upsert (the diff
  // never queues it) and is excluded here too. The kept row stays out of the snapshot
  // (via keep()) until the flush confirms it, exactly like the other keeps.
  (function () {
    var oldById56 = {};
    oldStudents.forEach(function (s) { oldById56[s.id] = s; });
    d.students = d.students.map(function (s) {
      var old = oldById56[s.id];
      if (old && outboxUpsert46.students[s.id] && !sbIsSeedRow('ss_students', old, d)) {
        keep('ss_students', s.id);
        return old;
      }
      return s;
    });
  })();
  // v55: merge-keep for the student PIN — a server row carrying no PIN
  // must never wipe the local PIN/hash. The pull replaces the row
  // wholesale (server wins), so when the server has no parent_pin,
  // restore the local PIN fields from the pre-merge row (same class as
  // the v47 merge-keeps). A cleared PIN (parentPin === '') stays
  // cleared; a stripped record (null/undefined, no hash) is left for
  // the v55 repair — the live V21/2108 loss was exactly this: the pull
  // overwrote the local PIN with the server's null on every cycle.
  (function () {
    var srvPinById = {};
    (byTable.ss_students || []).forEach(function (row) { if (row.parent_pin) srvPinById[row.local_id || ('srv-' + row.id)] = true; });
    var oldById = {};
    oldStudents.forEach(function (s) { oldById[s.id] = s; });
    d.students.forEach(function (s) {
      if (srvPinById[s.id]) return; // the server carries a PIN — server wins
      var old = oldById[s.id];
      if (!old) return;
      if (old.parentPinHash) s.parentPinHash = old.parentPinHash;
      else if (old.parentPin === '') s.parentPin = '';
      else if (typeof old.parentPin === 'string' && old.parentPin) s.parentPin = old.parentPin;
    });
  })();
  d.teachers = mergeById('ss_teachers', d.teachers || [], byTable.ss_teachers || [], function (row) { return { id: row.local_id || ('srv-' + row.id), name: row.name || '', subject: row.subject || '', cls: row.cls || '', classes: Array.isArray(row.classes) ? row.classes.slice() : [] }; });
  var oldExams = d.exams || [];
  d.exams = mergeById('ss_exams', d.exams || [], byTable.ss_exams || [], function (row) { var e = { id: row.local_id || ('srv-' + row.id), name: row.name || '', cls: row.cls || '', subject: row.subject || '', date: row.exam_date || '', total: row.total || 100 }; examMap[row.id] = e.id; return e; });
  // B6 (exam soft-delete): the server row carries no deleted flag
  // (ss_exams has no such column — adding one needs SQL, not this
  // change), so the pull above would wipe the local flag on every
  // cycle and the exam would come back. Restore it from the
  // pre-merge row, same class of keep as the v55 student-PIN keep
  // above. Consequence to know: a delete made on THIS device stays
  // deleted here, but it does NOT travel to other devices — the
  // server row stays, so a second device re-downloads the exam as
  // active. A server column (follow-up SQL) is needed before a
  // delete can sync across devices.
  (function () {
    var oldById = {};
    oldExams.forEach(function (e) { oldById[e.id] = e; });
    d.exams.forEach(function (e) { var old = oldById[e.id]; if (old && old.deleted) e.deleted = true; });
  })();
  // v58: a pending exam upsert keeps its LOCAL row through the pull —
  // the same class as the v56 students keep. Live v57 (10 Nov 2026):
  // the admin edited an exam name, the pull replaced the local edit
  // with the server's stale row before the flush could PATCH it, the
  // flush pushed the edit, and the pass-1 tail re-diff re-queued the
  // stale local row and pass 2 re-uploaded it — undoing the push in
  // the same flush, so the edit reverted on reload. A soft-deleted
  // exam queued the same way (see sbQueueExamChange58) keeps its
  // deleted flag through the pull as well. A row deleted elsewhere
  // has no pending upsert, so it still drops; a seed row never
  // carries a pending upsert (the diff never queues it) and is
  // excluded here too. The kept row stays out of the snapshot (via
  // keep()) until the flush confirms it, exactly like the students
  // keep in v56.
  (function () {
    var oldById58 = {};
    oldExams.forEach(function (e) { oldById58[e.id] = e; });
    d.exams = d.exams.map(function (e) {
      var old = oldById58[e.id];
      if (old && outboxUpsert46.exams[e.id] && !sbIsSeedRow('ss_exams', old, d)) {
        keep('ss_exams', e.id);
        return old;
      }
      return e;
    });
  })();
  d.feeRecords = mergeById('ss_fee_records', d.feeRecords || [], byTable.ss_fee_records || [], function (row) { return sbRowToFeeRecord(row, stuMap); });
  // Attendance: server rows fold back into the 'date|cls' map, then
  // local attendance that has NOT uploaded yet is kept — for ANY
  // student, not just kept students (v34, P1-1: an offline mark for an
  // already-synced student was wiped because the old code kept only
  // marks of kept students). A mark that IS in the snapshot but absent
  // on the server was deleted elsewhere and still drops.
  var oldAtt = d.attendance || {};
  d.attendance = {};
  (byTable.ss_attendance || []).forEach(function (row) {
    var localId = stuMap[row.student_id];
    if (!localId) return;
    var key = (row.att_date || '') + '|' + (row.cls || '');
    if (!d.attendance[key]) d.attendance[key] = {};
    d.attendance[key][localId] = row.status || 'Present';
  });
  Object.keys(oldAtt).forEach(function (key) {
    var recs = oldAtt[key] || {};
    Object.keys(recs).forEach(function (sid) {
      var parts = key.split('|');
      var snapKey = parts[0] + '|' + parts[1] + '|' + sid;
      // v47: a mark whose upload is still unconfirmed (a pending
      // outbox upsert) is KEPT, never dropped on snapshot grounds —
      // the v46 fee-records keep, extended to attendance.
      if (snapHas('ss_attendance', snapKey)) {
        if (outboxUpsert46.attendance[snapKey]) {
          if (!d.attendance[key]) d.attendance[key] = {};
          d.attendance[key][sid] = recs[sid];
          keep('ss_attendance', snapKey);
        }
        return;
      }
      // v45: attendance for a demo-seed student drops with the seed row
      // (seedStudentIds was snapshotted before the student merge).
      if (seedStudentIds[sid]) return;
      if (!d.attendance[key]) d.attendance[key] = {};
      d.attendance[key][sid] = recs[sid];
      keep('ss_attendance', snapKey);
    });
  });
  // Receipts: same number + same content = the same receipt (server
  // wins); same number + different content = a collision, kept for the
  // repair pass; no number yet (offline) = always kept.
  // v39: a receipt whose upload was never confirmed must not be
  // dropped on snapshot grounds alone — a stale snapshot entry (marked
  // synced although the row never landed) used to wipe the local
  // receipt on the next pull, so the receipt view vanished after its
  // first render. A pending outbox upsert for the number is proof the
  // upload is still unconfirmed: keep the row (and out of the
  // snapshot) so the next cycle re-attempts it. A receipt with no
  // pending upload still drops — it was deleted elsewhere.
  // v46: the receipts keep uses the shared outbox set built above
  // (keyed by the Supabase uid) — the v39 load read the local
  // account uid and always saw an empty outbox, so the keep never
  // fired. Same trap as the fee records above.
  var outboxRc = outboxUpsert46.receipts;
  var oldReceipts = d.receipts || [];
  d.receipts = (byTable.ss_receipts || []).map(function (row) {
    return { receiptNo: row.receipt_no || '', studentId: stuMap[row.student_id] || '', admissionNo: row.admission_no || '', name: row.student_name || '', cls: row.cls || '', session: row.session || '', date: row.receipt_date || '', month: row.month || '', counterNo: row.counter_no || 0, lines: row.lines || [], payMode: row.pay_mode || 'Cash', payDate: row.pay_date || '', bank: row.bank || '', number: row.number || '', total: row.total || 0, totalWords: row.total_words || '', collector: row.collector || '' };
  });
  // v42: the server may hold duplicate rows for one collection (a past
  // cycle minted a new number for the same fee and uploaded it — live:
  // 192 rows for 3 collections). The local mirror keeps only the
  // EARLIEST number per collection so the display shows the original
  // 001/002/003, not the latest duplicate, and the mirror never holds
  // 189 junk rows. Server rows are untouched here; the dedup SQL
  // (13_*) removes them later. A genuinely different collection keeps
  // its own row (different content key).
  (function () {
    var earliestByContent = {};
    var deduped = [];
    d.receipts.forEach(function (r) {
      if (!r.receiptNo) { deduped.push(r); return; }
      var k = sbReceiptContentKey(r);
      var cur = earliestByContent[k];
      if (!cur) { earliestByContent[k] = r; deduped.push(r); return; }
      if (r.receiptNo < cur.receiptNo) {
        var idx = deduped.indexOf(cur);
        if (idx !== -1) deduped[idx] = r;
        earliestByContent[k] = r;
      }
      // else: a later duplicate of the same collection — drop it.
    });
    d.receipts = deduped;
  })();
  var serverRcByNo = {};
  d.receipts.forEach(function (r) { if (r.receiptNo) serverRcByNo[r.receiptNo] = r; });
  oldReceipts.forEach(function (rc) {
    if (!rc.receiptNo) { d.receipts.push(rc); return; }
    // v45: a receipt for a demo-seed student is seed data, not a
    // collection — it drops with the seed row.
    if (seedStudentIds[rc.studentId]) return;
    var srv = serverRcByNo[rc.receiptNo];
    if (!srv) {
      if (snapHas('ss_receipts', rc.receiptNo)) {
        if (outboxRc[rc.receiptNo]) { d.receipts.push(rc); keep('ss_receipts', rc.receiptNo); }
        return;
      }
      d.receipts.push(rc);
      keep('ss_receipts', rc.receiptNo);
      return;
    }
    if (sbReceiptSame(srv, rc)) return;
    d.receipts.push(rc);
    keep('ss_receipts', rc.receiptNo);
  });
  var oldMarks = d.marks || [];
  d.marks = [];
  var serverMarkKeys = {};
  (byTable.ss_marks || []).forEach(function (row) {
    if (!examMap[row.exam_id] || !stuMap[row.student_id]) return;
    var m = { examId: examMap[row.exam_id], studentId: stuMap[row.student_id], marks: row.marks };
    d.marks.push(m);
    serverMarkKeys[m.examId + '|' + m.studentId] = true;
  });
  oldMarks.forEach(function (m) {
    var key = m.examId + '|' + m.studentId;
    if (serverMarkKeys[key]) return;
    // v47: a mark whose upload is still unconfirmed (a pending outbox
    // upsert) is KEPT, never dropped on snapshot grounds — same keep
    // as attendance above (v46 fee-records pattern).
    if (snapHas('ss_marks', key)) {
      if (outboxUpsert46.marks[key]) { d.marks.push(m); keep('ss_marks', key); }
      return;
    }
    // v45: marks for a demo-seed exam or student drop with the seed row.
    if (seedExamIds[m.examId] || seedStudentIds[m.studentId]) return;
    d.marks.push(m);
    keep('ss_marks', key);
  });
  d.homework = mergeById('ss_homework', d.homework || [], byTable.ss_homework || [], function (row) {
    return { id: row.local_id || ('srv-' + row.id), cls: row.cls || '', subject: row.subject || '', title: row.title || '', due: row.due || '', doneBy: (row.done_by || []).map(function (id) { return stuMap[id]; }).filter(function (x) { return !!x; }) };
  });
  d.notices = mergeById('ss_notices', d.notices || [], byTable.ss_notices || [], function (row) { return { id: row.local_id || ('srv-' + row.id), title: row.title || '', date: row.notice_date || '', body: row.body || '' }; });
  if (byTable.ss_admission_requests) {
    d.admissionRequests = mergeById('ss_admission_requests', d.admissionRequests || [], byTable.ss_admission_requests, function (row) { return sbRowToAdmissionRequest(row, stuMap); });
  }
  return { stuMap: stuMap, examMap: examMap, kept: kept };
}
function sbDownloadSchoolData(account, sbUid, token, serverSchoolId) {
  if (!account || account.role !== 'school') return Promise.resolve({ done: false, reason: 'not-school' });
  if (!token) return Promise.resolve({ done: false, reason: 'no-token' });
  if (!sbIsOnline()) return Promise.resolve({ done: false, reason: 'offline' });
  var d = db; // the account's DB is loaded by loginAs before this runs
  if ((d.students || []).length || (d.feeRecords || []).length || (d.teachers || []).length) {
    return Promise.resolve({ done: false, reason: 'not-empty' });
  }
  var idP = serverSchoolId ? Promise.resolve(serverSchoolId)
    : sbGetServerSchoolId(sbUid, token).then(function (row) { return row ? row.id : null; });
  return idP.then(function (sid) {
    if (!sid) return { done: false, reason: 'no-server-school' };
    var tables = ['ss_fee_structure', 'ss_students', 'ss_teachers', 'ss_exams', 'ss_fee_records', 'ss_attendance', 'ss_receipts', 'ss_marks', 'ss_homework', 'ss_notices'];
    var gets = [sbRest('GET', 'ss_schools?select=*&id=eq.' + encodeURIComponent(sid), token)];
    tables.forEach(function (t) {
      gets.push(sbRest('GET', t + '?select=*&school_id=eq.' + encodeURIComponent(sid) + '&limit=5000', token));
    });
    return Promise.all(gets).then(function (res) {
      var i;
      for (i = 0; i < res.length; i++) if (!res[i].ok || !Array.isArray(res[i].data)) throw new Error('read-failed');
      var schoolRow = (res[0].data && res[0].data[0]) || null;
      var byTable = {};
      tables.forEach(function (t, j) { byTable[t] = res[j + 1].data; });
      var applied = sbApplyServerRows(d, schoolRow, byTable, account, sid);
      // v31: the downloaded state is now the synced state — snapshot it
      // (and the server ids) so the next local save does not re-queue
      // every downloaded row as a change.
      sbSyncSnapshotRefresh(d, account, applied);
      saveDB(db);
      renderApp();
      return { done: true, reason: 'ok', schoolId: sid, counts: sbLocalCounts(d) };
    });
  }).catch(function (err) {
    return { done: false, reason: 'error', detail: (err && err.message) || 'error' };
  });
}
function sbRetryDownload() {
  if (!state.user || state.user.role !== 'school') { toast(t('sbStatusNotSchool')); return; }
  if (!state.sb || !state.sb.uid) { toast(t('sbStatusPending')); return; }
  // v31: the Download button is now the manual refresh — a server-wins
  // pull (same guards as login) followed by an outbox flush. The old
  // empty-store-only download still lives in sbDownloadSchoolData and is
  // used for a fresh second-device login.
  toast(t('sbDownloadStart'));
  sbSyncStart(state.user, state.sb.uid, null).then(function (r) {
    if (r.done) { toast(t('sbDownloadDone')); renderApp(); }
    else if (r.reason === 'no-server-school') toast(t('sbDownloadNoServer'));
    else if (r.reason === 'offline' || r.reason === 'no-token') toast(t('sbDownloadOffline'));
    else toast(t('sbDownloadFailed'));
  }).catch(function () { toast(t('sbDownloadFailed')); });
}

/* ================= v31: server-first sync ("Target app ki tarah") =================
   For a school logged in via Supabase, the SERVER is the source of truth:
   login / app start pulls the server state into the local mirror (server
   wins), every local save queues its changes into an outbox and pushes
   them, and offline changes flush on reconnect. Local-only accounts (no
   server session) never call the server and behave exactly as v30.
   Safety: the pull NEVER wipes local data when the school has never
   migrated and the server is empty for a table that has local rows — it
   runs the migration upload instead. A row that disappears locally is
   only deleted on the server for fee records, fee structure, attendance
   and marks (the ones the app hard-deletes); anything else is restored
   by the next pull. Conflicts are last-write-wins by updated_at
   (04_server_first.sql adds the column + touch trigger to every synced
   table): a push first reads the server row, and when the server copy is
   newer than the local change the push is skipped and the next pull
   restores the server version. Concurrency: one sync run at a time
   (sbSyncWithLock). The diff/queue step is synchronous and lock-free;
   push and pull are serialised through the lock so they can never
   interleave. The outbox carries the full local row (not just a key), so
   a pull that replaces the mirror mid-flight cannot lose an offline edit:
   the flush pushes the queued row, then a second pull restores it.
   v32: FULLY AUTOMATIC — one serialized cycle (upload-missing -> pull
   -> flush) on login, app start, focus / visibilitychange, the online
   event, a 30s interval while open, and after every local save's push.
   The upload pass runs on every cycle (never blocked by the migration
   flag, never skipped because a server school row exists) into the
   existing school row — the v31 login fired the migration and the pull
   in parallel, so a laptop-first login left the phone's student stranded
   until the user pressed Back Up Now. That manual step is gone: the
   buttons in Settings stay as manual overrides only. At most one cycle
   runs at a time; a second trigger queues one follow-up, never two.
   v33: atomic server-side numbering + never-lose pull. Admission and
   receipt numbers for server accounts come from the ss_next_adm_no /
   ss_next_receipt_no RPCs (mint-until-free against the server's taken
   set — the live counter can sit behind the highest used number, so
   the RPC alone re-mints a taken number); the repair pass re-numbers
   colliding rows and mints numbers for offline-saved rows BEFORE the
   upload in every cycle; the pull MERGES instead of replacing, so a
   local row that has not reached the server is never wiped; the outbox
   keeps failed entries with their failure reason. Local-only accounts
   keep minting locally and make zero server calls. */
var SB_OUTBOX_KEY = 'schoolSaathiOutbox';
// v53: sync diagnostics, so the next live check can read the cycle's
// real cost from the Settings page instead of guessing from the status
// line. Written after every cycle and every flush; the browser agent
// cannot run JS or read localStorage, so the Settings "Sync details"
// section renders this record. sbSyncRestCalls counts REST round-trips
// this page session (incremented in sbRest, below).
var SB_SYNC_DIAG_KEY = 'schoolSaathiSyncDiag';
var sbSyncRestCalls = 0;
function sbSyncDiagLoad() {
  try { var d = JSON.parse(localStorage.getItem(SB_SYNC_DIAG_KEY) || 'null'); return d && typeof d === 'object' ? d : {}; } catch (e) { return {}; }
}
function sbSyncDiagSave(d) {
  try { localStorage.setItem(SB_SYNC_DIAG_KEY, JSON.stringify(d)); } catch (e) {}
}
function sbSyncDiagSet(patch) {
  var d = sbSyncDiagLoad();
  Object.keys(patch).forEach(function (k) { d[k] = patch[k]; });
  sbSyncDiagSave(d);
} // per Supabase uid: [{table,key,op,row,at}]
var SB_SRVID_KEY = 'schoolSaathiSrvIds'; // per Supabase uid: {table: {localKey: serverUuid}}
var SB_SNAP_KEY = 'schoolSaathiSyncSnap'; // per local account uid: {table: {key: hash}}
var sbSyncPromise = null; // one sync run at a time (the lock)
var sbSyncTimer = null; // debounced post-save flush
var sbSyncDebounceMs = 600; // tests set this to 0 for a deterministic flush
var sbSyncSnapshot = null; // in-memory snapshot for the current account
var sbSyncSnapUid = null; // local account uid the in-memory snapshot belongs to
var sbSyncApplying = false; // true while server rows are being applied locally (the saveDB hook skips the diff then)

function sbOutboxKey(uid) { return SB_OUTBOX_KEY + ':' + uid; }
function sbOutboxLoad(uid) {
  try { var r = localStorage.getItem(sbOutboxKey(uid)); var a = r ? JSON.parse(r) : []; return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
function sbOutboxSave(uid, list) { try { localStorage.setItem(sbOutboxKey(uid), JSON.stringify(list)); } catch (e) {} }
function sbOutboxAdd(uid, entry) {
  // One pending entry per (table, key): a newer change to the same row
  // replaces the older one, so the outbox never replays stale payloads.
  // The `at` timestamp keeps the EARLIEST queue time, so last-write-wins
  // is judged against the first local change, not a re-queue.
  var list = sbOutboxLoad(uid);
  var done = false;
  for (var i = 0; i < list.length; i++) {
    if (list[i].table === entry.table && list[i].key === entry.key) {
      if (list[i].at && (!entry.at || list[i].at < entry.at)) entry.at = list[i].at;
      // v33: a failure reason survives a re-queue — the entry keeps
      // retrying, and the reason says why the last attempt failed.
      if (list[i].failReason && !entry.failReason) entry.failReason = list[i].failReason;
      list[i] = entry; done = true; break;
    }
  }
  if (!done) list.push(entry);
  sbOutboxSave(uid, list);
  return list;
}
function sbOutboxRemove(uid, entry) {
  var list = sbOutboxLoad(uid).filter(function (e) { return !(e.table === entry.table && e.key === entry.key); });
  sbOutboxSave(uid, list);
  return list;
}
function sbOutboxClear(uid) { try { localStorage.removeItem(sbOutboxKey(uid)); } catch (e) {} }
function sbSrvIdsLoad(uid) {
  try { var r = localStorage.getItem(SB_SRVID_KEY + ':' + uid); var o = r ? JSON.parse(r) : {}; return (o && typeof o === 'object') ? o : {}; } catch (e) { return {}; }
}
function sbSrvIdsSave(uid, map) { try { localStorage.setItem(SB_SRVID_KEY + ':' + uid, JSON.stringify(map)); } catch (e) {} }
function sbSrvIdsClear(uid) { try { localStorage.removeItem(SB_SRVID_KEY + ':' + uid); } catch (e) {} }
function sbSrvIdGet(uid, table, key) { var m = sbSrvIdsLoad(uid); return (m[table] && m[table][key]) || null; }
function sbSrvIdSet(uid, table, key, serverId) {
  var m = sbSrvIdsLoad(uid); if (!m[table]) m[table] = {}; m[table][key] = serverId; sbSrvIdsSave(uid, m);
}
function sbSnapLoad(uid) {
  try { var r = localStorage.getItem(SB_SNAP_KEY + ':' + uid); var o = r ? JSON.parse(r) : null; return (o && typeof o === 'object') ? o : {}; } catch (e) { return {}; }
}
function sbSnapSave(uid, snap) { try { localStorage.setItem(SB_SNAP_KEY + ':' + uid, JSON.stringify(snap)); } catch (e) {} }
function sbSnapClear(uid) { try { localStorage.removeItem(SB_SNAP_KEY + ':' + uid); } catch (e) {} }
function sbSyncResetMemory() {
  if (sbSyncTimer) { clearTimeout(sbSyncTimer); sbSyncTimer = null; }
  sbSyncSnapshot = null; sbSyncSnapUid = null;
}
/* v32: automatic pull — no button, no refresh, no logout/login. While
   the app is open and a school is logged in, the full cycle runs on a
   30s interval plus every foreground event (focus / visibilitychange /
   online) and after every local save's push. The cycle itself re-checks
   the session and connectivity, so the tick stays a one-liner. Local-
   only accounts never start the interval (sbSyncAutoStart is called
   only from the Supabase login/boot paths). */
var sbSyncIntervalMs = 30000;
var sbSyncIntervalId = null;
function sbSyncBackgroundTick() {
  // v53: background triggers (the 30s timer, online, tab visible,
  // window focus) SKIP entirely when a cycle is already in flight or a
  // follow-up is already queued — they never queue a second cycle
  // behind the first. A cycle takes 60–75s live on a legacy outbox, so
  // the 30s timer used to queue a follow-up behind every in-flight
  // cycle and the status line showed "Syncing…" almost continuously.
  // Manual Back Up Now and the post-save debounce keep the existing
  // join/queue behaviour (explicit user work).
  if (sbSyncPromise || sbSyncCyclePending) return;
  if (sbSyncActive() && sbIsOnline()) sbSyncCycle().catch(function () {});
}
function sbSyncAutoTick() {
  sbSyncBackgroundTick();
}
function sbSyncAutoStart() {
  if (sbSyncIntervalId) return; // idempotent: one interval per session
  if (typeof setInterval !== 'function') return;
  sbSyncIntervalId = setInterval(sbSyncAutoTick, sbSyncIntervalMs);
}
function sbSyncAutoStop() {
  if (!sbSyncIntervalId) return;
  if (typeof clearInterval === 'function') clearInterval(sbSyncIntervalId);
  sbSyncIntervalId = null;
}
function sbSyncActive() {
  // Server-first sync applies only to a school with a live Supabase
  // session. Local-only accounts, parents and logged-out states get
  // exactly the v30 behaviour (no server calls at all). The typeof
  // guard covers boot: loadDB() saves before `state` is assigned.
  if (typeof state === 'undefined' || !state || !state.user || state.user.role !== 'school' || !state.sb || !state.sb.uid) return null;
  return { uid: state.sb.uid, email: state.sb.email || state.user.email || '', account: state.user };
}
function sbSyncWithLock(fn) {
  // One sync run at a time. A caller that arrives mid-run waits behind
  // the in-flight run and retries once the lock clears.
  if (sbSyncPromise) return sbSyncPromise.then(function () { return sbSyncWithLock(fn); });
  sbSyncPromise = Promise.resolve().then(fn);
  return sbSyncPromise.then(function (r) { sbSyncPromise = null; return r; }, function (e) { sbSyncPromise = null; throw e; });
}
function sbSyncBuildMaps(d, uid) {
  // Local -> server id maps, from the stored map (populated on POST
  // returns and on every pull). Rows without a server id yet map to null
  // and are resolved on the next pass.
  var m = sbSrvIdsLoad(uid);
  return { stu: m.ss_students || {}, exam: m.ss_exams || {} };
}
function sbSyncSchoolPayloadFromParts(profile, feeExtras, admCounter, receiptCounter) {
  // The school row fields the local DB owns. plan/status are server-side
  // and are never clobbered by a sync push.
  var p = profile || {};
  var e = feeExtras || {};
  return { name: p.name || '', city: p.city || '', principal: p.principal || '', phone: p.phone || '',
    email: p.email || '', session: p.session || '2025–26', address: p.address || '',
    logo_data_url: p.logo || null,
    adm_counter: admCounter || 1, receipt_counter: receiptCounter || 1,
    admission_fee: e.admissionFee || 0, caution_money: e.cautionMoney || 0,
    annual_charges: e.annualCharges || 0, transport_fee: e.transportFee || 0 };
}
function sbSyncSchoolPayload(d) {
  return sbSyncSchoolPayloadFromParts(d.profile, d.feeExtras, d.admCounter, d.receiptCounter);
}
// v53: is the payload already on the server, field for field? A legacy
// outbox holds entries whose rows landed on the server in an earlier
// session (the flush never drained them), so every cycle re-PATCHed
// them — one GET + one PATCH per entry, per cycle, forever. When the
// server row already carries this exact content the entry resolves
// WITHOUT a write. Only used with a full server row (the batched
// select=* fetch); the partial find rows (id/updated_at only) can
// never prove identity, so they skip this check and PATCH as before.
// Normalisation: null/undefined/'' are equal; numbers equal numeric
// strings; arrays/objects compare by JSON; id/updated_at/created_at
// are skipped. Any doubt returns false (PATCH) — never skip a write
// on an uncertain comparison.
function sbSyncSameValue(a, b) {
  var na = (a === undefined || a === null || a === '') ? null : a;
  var nb = (b === undefined || b === null || b === '') ? null : b;
  if (na === null || nb === null) return na === nb;
  if (typeof na === 'number' || typeof nb === 'number') {
    var fa = Number(na), fb = Number(nb);
    if (isFinite(fa) && isFinite(fb)) return fa === fb;
    return String(na) === String(nb);
  }
  if (typeof na === 'object' || typeof nb === 'object') return JSON.stringify(na) === JSON.stringify(nb);
  return String(na) === String(nb);
}
function sbSyncRowSameAsServer(payload, serverRow) {
  if (!payload || !serverRow || typeof serverRow !== 'object') return false;
  var keys = Object.keys(payload);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k === 'id' || k === 'updated_at' || k === 'created_at' || k === 'school_id') continue;
    if (!sbSyncSameValue(payload[k], serverRow[k])) return false;
  }
  return true;
}
// v53: the batched twin of sbSyncFindServerRow — look the entry up in
// the per-table rows fetched once per flush pass (select=*) instead of
// a GET per entry. Same lookup rules: stored server id first (with
// fall-through when the row is gone), then the natural key, then the
// v44 student admission_no/enr fallback (never for deletes, never for
// seed rows). Returns the FULL server row, or null. A null here does
// NOT mean "absent": the batch may be stale for rows created mid-pass,
// so callers fall back to the live sbSyncFindServerRow.
function sbSyncFindFromBatch(batch, table, entry, schoolId, maps, uid) {
  if (!batch) return null;
  var rows = batch[table] || [];
  var known = sbSrvIdGet(uid, table, entry.key);
  var found = null, i;
  if (known) {
    for (i = 0; i < rows.length; i++) { if (rows[i] && rows[i].id === known) { found = rows[i]; break; } }
    if (found) return found;
  }
  if (table === 'ss_schools') {
    for (i = 0; i < rows.length; i++) { if (rows[i] && rows[i].id === schoolId) return rows[i]; }
    return null;
  }
  if (table === 'ss_audit_log' || table === 'ss_activities') return null; // dedupe handled by the log branch
  if (table === 'ss_fee_structure') {
    var p = entry.key.split('|');
    for (i = 0; i < rows.length; i++) { if (rows[i] && rows[i].cls === p[0] && rows[i].fee_type === (p[1] || 'Tuition')) return rows[i]; }
    return null;
  }
  if (table === 'ss_attendance') {
    var a = entry.row;
    var sid = a && maps.stu[a.studentId];
    if (!sid) return null;
    for (i = 0; i < rows.length; i++) { if (rows[i] && rows[i].att_date === a.date && rows[i].cls === a.cls && rows[i].student_id === sid) return rows[i]; }
    return null;
  }
  if (table === 'ss_marks') {
    var m = entry.row;
    var eid = m && maps.exam[m.examId], sid2 = m && maps.stu[m.studentId];
    if (!eid || !sid2) return null;
    for (i = 0; i < rows.length; i++) { if (rows[i] && rows[i].exam_id === eid && rows[i].student_id === sid2) return rows[i]; }
    return null;
  }
  if (table === 'ss_receipts') {
    for (i = 0; i < rows.length; i++) { if (rows[i] && rows[i].receipt_no === entry.key) return rows[i]; }
    return null;
  }
  for (i = 0; i < rows.length; i++) { if (rows[i] && rows[i].local_id === entry.key) { found = rows[i]; break; } }
  if (found) return found;
  if (table === 'ss_students' && entry.op !== 'delete') {
    var row = entry.row || {};
    if (sbIsSeedRow('ss_students', row)) return null;
    var adm = row.admissionNo || row.admission_no || '';
    var enr = row.enr || '';
    if (adm) {
      for (i = 0; i < rows.length; i++) { if (rows[i] && rows[i].admission_no === adm) { var ad = Object.assign({}, rows[i]); ad._adoptedByNaturalKey = true; return ad; } }
    }
    if (enr) {
      for (i = 0; i < rows.length; i++) { if (rows[i] && rows[i].enr === enr) { var en = Object.assign({}, rows[i]); en._adoptedByNaturalKey = true; return en; } }
    }
  }
  return null;
}
function sbSyncMapRow(table, row, schoolId, maps, d) {
  // Local row -> server payload. Foreign keys resolve through the id
  // maps; a not-yet-pushed student/exam maps to null and the row is
  // re-queued (with the right id) once its parent is pushed.
  if (table === 'ss_students') return sbMapStudent(row, schoolId);
  if (table === 'ss_teachers') return sbMapTeacher(row, schoolId);
  if (table === 'ss_exams') return sbMapExam(row, schoolId);
  if (table === 'ss_fee_records') return sbMapFeeRecord(row, schoolId, maps.stu);
  if (table === 'ss_homework') return sbMapHomework(row, schoolId, maps.stu);
  if (table === 'ss_notices') return sbMapNotice(row, schoolId);
  if (table === 'ss_admission_requests') return sbMapAdmissionRequest(row, schoolId, maps.stu);
  if (table === 'ss_receipts') {
    var byId = {};
    (d.students || []).forEach(function (s) { byId[s.id] = s; });
    return sbMapReceipt(row, schoolId, maps.stu, byId);
  }
  if (table === 'ss_fee_structure') return sbMapFeeStructure(row, schoolId);
  if (table === 'ss_attendance') return { school_id: schoolId, att_date: row.date, cls: row.cls, student_id: maps.stu[row.studentId] || null, status: row.status };
  if (table === 'ss_marks') return { school_id: schoolId, exam_id: maps.exam[row.examId] || null, student_id: maps.stu[row.studentId] || null, marks: row.marks };
  if (table === 'ss_audit_log') return sbMapAudit(row, schoolId);
  if (table === 'ss_activities') return sbMapActivity(row, schoolId);
  return null;
}
function sbSyncPayloadReady(table, payload) {
  // NOT NULL foreign keys on the server: a row whose parent has no
  // server id yet cannot be pushed (the server would reject it). It
  // stays queued and goes out on the next pass, once the parent exists.
  if (table === 'ss_marks') return !!(payload.exam_id && payload.student_id);
  if (table === 'ss_attendance') return !!payload.student_id;
  return true;
}
var SB_SYNC_TABLES = {
  ss_students: { local: 'students', key: 'id' }, ss_teachers: { local: 'teachers', key: 'id' },
  ss_exams: { local: 'exams', key: 'id' }, ss_fee_records: { local: 'feeRecords', key: 'id' },
  ss_homework: { local: 'homework', key: 'id' }, ss_notices: { local: 'notices', key: 'id' },
  ss_admission_requests: { local: 'admissionRequests', key: 'id' }, ss_receipts: { local: 'receipts', key: 'receiptNo' }
};
var SB_SYNC_DELETABLE = ['ss_fee_records', 'ss_fee_structure', 'ss_attendance', 'ss_marks'];
function sbSyncTableHashes(d, schoolId, maps) {
  // Canonical hash per row = the exact server payload it would push.
  // Local rows and server-derived rows hash identically when their
  // content matches, so a pull refresh produces no phantom changes.
  var out = {};
  Object.keys(SB_SYNC_TABLES).forEach(function (table) {
    var cfg = SB_SYNC_TABLES[table];
    var m = {};
    (d[cfg.local] || []).forEach(function (row) {
      var key = row[cfg.key];
      if (key === undefined || key === null || key === '') return;
      // v45: a demo-seed row is never hashed — the diff never queues
      // it and the snapshot never marks it synced (quarantine rule 1).
      if (sbIsSeedRow(table, row, d)) return;
      // v33: a row saved while offline has no server number yet — it
      // must not be queued or snapshotted until the repair pass mints
      // one for it. (A pending receipt has no receiptNo, so the
      // empty-key check above already covers it.)
      if (table === 'ss_students' && row.numPending) return;
      var payload = sbSyncMapRow(table, row, schoolId, maps, d);
      if (!payload) return;
      m[String(key)] = { hash: JSON.stringify(payload), row: row };
    });
    out[table] = m;
  });
  var fs = {};
  (d.feeStructure || []).forEach(function (f) {
    var key = (f.cls || '') + '|' + (f.type || 'Tuition');
    fs[key] = { hash: JSON.stringify(sbMapFeeStructure(f, schoolId)), row: f };
  });
  out.ss_fee_structure = fs;
  var att = {};
  sbFlattenAttendance(d).forEach(function (a) {
    if (sbIsSeedStudentId(a.studentId, d)) return; // v45: seed attendance never queues
    var key = a.date + '|' + a.cls + '|' + a.studentId;
    att[key] = { hash: JSON.stringify(sbSyncMapRow('ss_attendance', a, schoolId, maps, d)), row: a };
  });
  out.ss_attendance = att;
  var mk = {};
  (d.marks || []).forEach(function (mrow) {
    if (sbIsSeedRow('ss_marks', mrow, d)) return; // v45: seed marks never queue
    var key = mrow.examId + '|' + mrow.studentId;
    mk[key] = { hash: JSON.stringify(sbSyncMapRow('ss_marks', mrow, schoolId, maps, d)), row: mrow };
  });
  out.ss_marks = mk;
  var au = {};
  (d.auditLog || []).forEach(function (a) {
    var key = sbNormTs(a.ts) + '|' + (a.actor || '') + '|' + (a.action || '') + '|' + (a.details || '');
    au[key] = { hash: JSON.stringify(sbMapAudit(a, schoolId)), row: a };
  });
  out.ss_audit_log = au;
  var ac = {};
  (d.activities || []).forEach(function (a) {
    var key = (a.title || '') + '|' + (a.sub || '');
    ac[key] = { hash: JSON.stringify(sbMapActivity(a, schoolId)), row: a };
  });
  out.ss_activities = ac;
  // v45: a seed profile (St. Xavier demo set) has no school-row hash —
  // the diff never queues it and the upload pass never pushes it (the
  // pull replaces it with the server's real profile on the next cycle).
  out.ss_schools = sbIsSeedProfile(d) ? {} : { school: { hash: JSON.stringify(sbSyncSchoolPayload(d)), row: { profile: d.profile, feeExtras: d.feeExtras, admCounter: d.admCounter, receiptCounter: d.receiptCounter } } };
  return out;
}
function sbSyncSnapshotRefresh(d, account, applied) {
  // Rebuild the snapshot from the current local DB (which now mirrors
  // the server) and the server->local maps from the pull/download.
  var uid = (typeof state !== 'undefined' && state.sb && state.sb.uid) || '';
  var schoolId = (sbServerSchoolMap()[account.uid]) || null;
  var maps = { stu: {}, exam: {} };
  if (applied) {
    Object.keys(applied.stuMap || {}).forEach(function (srvId) { maps.stu[applied.stuMap[srvId]] = srvId; });
    Object.keys(applied.examMap || {}).forEach(function (srvId) { maps.exam[applied.examMap[srvId]] = srvId; });
    var m = sbSrvIdsLoad(uid);
    m.ss_students = maps.stu; m.ss_exams = maps.exam;
    sbSrvIdsSave(uid, m);
  } else {
    maps = sbSyncBuildMaps(d, uid);
  }
  var hashes = sbSyncTableHashes(d, schoolId, maps);
  var snap = {};
  Object.keys(hashes).forEach(function (table) {
    snap[table] = {};
    Object.keys(hashes[table]).forEach(function (key) { snap[table][key] = hashes[table][key].hash; });
  });
  // v33: rows the merge kept (never reached the server) must NOT be
  // snapshotted as synced — otherwise the diff and the upload-missing
  // pass would both skip them forever and the row would be stranded.
  if (applied && applied.kept) {
    Object.keys(applied.kept).forEach(function (table) {
      if (!snap[table]) return;
      Object.keys(applied.kept[table]).forEach(function (key) { delete snap[table][key]; });
    });
  }
  sbSyncSnapshot = snap; sbSyncSnapUid = account.uid;
  sbSnapSave(account.uid, snap);
  return snap;
}
function sbSyncSnapSet(accountUid, table, key, hash) {
  var snap = (sbSyncSnapUid === accountUid && sbSyncSnapshot) ? sbSyncSnapshot : sbSnapLoad(accountUid);
  if (!snap[table]) snap[table] = {};
  snap[table][key] = hash;
  sbSyncSnapshot = snap; sbSyncSnapUid = accountUid;
  sbSnapSave(accountUid, snap);
}
function sbSyncSnapDelete(accountUid, table, key) {
  var snap = (sbSyncSnapUid === accountUid && sbSyncSnapshot) ? sbSyncSnapshot : sbSnapLoad(accountUid);
  if (snap[table]) delete snap[table][key];
  sbSyncSnapshot = snap; sbSyncSnapUid = accountUid;
  sbSnapSave(accountUid, snap);
}
function sbSyncSnapSetFromLocalRow(accountUid, entry, schoolId, maps) {
  // After a last-write-wins conflict, the local row still differs from
  // the snapshot — without this the next diff would re-queue the losing
  // change forever. Mark the row quiet at its current local hash: the
  // next pull restores the server version (and refreshes the snapshot
  // properly), and any NEW local edit still queues because its hash
  // will differ again.
  var row = sbSyncLocalRow(entry);
  if (!row) return;
  var payload = null;
  if (entry.table === 'ss_schools') payload = sbSyncSchoolPayloadFromParts(row.profile, row.feeExtras, row.admCounter, row.receiptCounter);
  else payload = sbSyncMapRow(entry.table, row, schoolId, maps, db);
  if (payload) sbSyncSnapSet(accountUid, entry.table, entry.key, JSON.stringify(payload));
}
function sbSyncQueueDiff() {
  // Compare the local DB against the last synced snapshot and queue
  // every new/changed row into the outbox (with its full local row, so
  // a later pull cannot lose the edit). Runs synchronously on every
  // saveDB — even offline, so the outbox is complete when the device
  // reconnects. A first run after the v31 upgrade has an empty snapshot,
  // so every pre-v31 row is queued once (the push dedupes by local_id).
  var act = sbSyncActive();
  if (!act || sbSyncApplying) return 0;
  var schoolId = (sbServerSchoolMap()[act.account.uid]) || null;
  if (!schoolId) return 0; // no server school yet: migration uploads on login
  var d = db;
  var uid = act.uid;
  if (sbSyncSnapUid !== act.account.uid) { sbSyncSnapshot = sbSnapLoad(act.account.uid); sbSyncSnapUid = act.account.uid; }
  var snap = sbSyncSnapshot || {};
  var maps = sbSyncBuildMaps(d, uid);
  var hashes = sbSyncTableHashes(d, schoolId, maps);
  var queued = 0;
  Object.keys(hashes).forEach(function (table) {
    var snapTable = snap[table] || {};
    var cur = hashes[table];
    var seen = {};
    Object.keys(cur).forEach(function (key) {
      seen[key] = true;
      if (snapTable[key] !== cur[key].hash) {
        var rowCopy = table === 'ss_schools' ? cur[key].row : JSON.parse(JSON.stringify(cur[key].row));
        sbOutboxAdd(uid, { table: table, key: key, op: 'upsert', row: rowCopy, at: new Date().toISOString() });
        queued++;
      }
    });
    // Rows that vanished locally: only the tables the app hard-deletes
    // propagate the delete. Anything else is restored by the next pull.
    if (SB_SYNC_DELETABLE.indexOf(table) !== -1) {
      Object.keys(snapTable).forEach(function (key) {
        if (!seen[key]) {
          sbOutboxAdd(uid, { table: table, key: key, op: 'delete', at: new Date().toISOString() });
          queued++;
        }
      });
    }
  });
  return queued;
}
function sbSyncOnSave() {
  // Called from saveDB after every local write. Queues the change and
  // schedules a push when a server session is active. Local-only
  // accounts: no-op. Sync must never break a local save.
  if (!sbSyncActive()) return;
  try {
    var n = sbSyncQueueDiff();
    if (n && sbIsOnline()) sbSyncScheduleFlush();
    else if (n) sbSetStatus('pending');
  } catch (e) { /* never break a local save */ }
}
function sbSyncScheduleFlush() {
  if (sbSyncTimer) clearTimeout(sbSyncTimer);
  // v32: after a local save, run the full cycle (not just a push): the
  // cycle uploads, pulls other devices' changes, then flushes. A pull
  // after the push is how this device sees another device's edits
  // without any manual step.
  sbSyncTimer = setTimeout(function () { sbSyncTimer = null; sbSyncCycle().catch(function () {}); }, sbSyncDebounceMs);
}
function sbSyncLocalRow(entry) {
  // The current local row for an outbox entry (null when it vanished).
  if (entry.table === 'ss_schools') return db.profile ? { profile: db.profile, feeExtras: db.feeExtras, admCounter: db.admCounter, receiptCounter: db.receiptCounter } : null;
  if (entry.table === 'ss_fee_structure') {
    var p = entry.key.split('|');
    return (db.feeStructure || []).filter(function (f) { return (f.cls || '') === p[0] && (f.type || 'Tuition') === (p[1] || 'Tuition'); })[0] || null;
  }
  if (entry.table === 'ss_attendance') {
    var a = entry.key.split('|');
    var recs = (db.attendance || {})[(a[0] || '') + '|' + (a[1] || '')];
    return (recs && recs[a[2]] !== undefined) ? { date: a[0], cls: a[1], studentId: a[2], status: recs[a[2]] } : null;
  }
  if (entry.table === 'ss_marks') {
    var q = entry.key.split('|');
    return (db.marks || []).filter(function (m) { return m.examId === q[0] && m.studentId === q[1]; })[0] || null;
  }
  if (entry.table === 'ss_audit_log') {
    return (db.auditLog || []).filter(function (x) { return (sbNormTs(x.ts) + '|' + (x.actor || '') + '|' + (x.action || '') + '|' + (x.details || '')) === entry.key; })[0] || null;
  }
  if (entry.table === 'ss_activities') {
    return (db.activities || []).filter(function (x) { return ((x.title || '') + '|' + (x.sub || '')) === entry.key; })[0] || null;
  }
  var cfg = SB_SYNC_TABLES[entry.table];
  if (!cfg) return null;
  var arr = db[cfg.local] || [];
  return arr.filter(function (r) { return String(r[cfg.key]) === entry.key; })[0] || null;
}
function sbSyncFindServerRow(table, entry, token, schoolId, maps, uid) {
  // The server row for an outbox entry, for the last-write-wins check
  // and for PATCH/DELETE by id. Null when the server has no such row.
  var known = sbSrvIdGet(uid, table, entry.key);
  // v44: a stored server id is only a hint — the row may have been
  // deleted and re-created under a new id (live: the V21 student row
  // was re-created 9 Nov 12:37 UTC with a new uuid but the same
  // local_id, while the stored map still pointed at the deleted row).
  // A miss there must fall through to the lookups below, never return
  // null outright — the old early return made every push POST a
  // duplicate and 409 on the unique admission_no index, every cycle.
  function byNaturalKey() {
  if (table === 'ss_schools') {
    return sbRest('GET', 'ss_schools?select=id,updated_at&id=eq.' + encodeURIComponent(schoolId), token).then(function (r) {
      if (r.ok && Array.isArray(r.data) && r.data.length) return r.data[0];
      return null;
    });
  }
  if (table === 'ss_audit_log' || table === 'ss_activities') return Promise.resolve(null); // dedupe handled by sbUploadMissing
  var filter = null;
  if (table === 'ss_fee_structure') {
    var p = entry.key.split('|');
    filter = 'school_id=eq.' + encodeURIComponent(schoolId) + '&cls=eq.' + encodeURIComponent(p[0]) + '&fee_type=eq.' + encodeURIComponent(p[1] || 'Tuition');
  } else if (table === 'ss_attendance') {
    var a = entry.row;
    var sid = a && maps.stu[a.studentId];
    if (!sid) return Promise.resolve(null);
    filter = 'school_id=eq.' + encodeURIComponent(schoolId) + '&att_date=eq.' + encodeURIComponent(a.date) + '&cls=eq.' + encodeURIComponent(a.cls) + '&student_id=eq.' + encodeURIComponent(sid);
  } else if (table === 'ss_marks') {
    var m = entry.row;
    var eid = m && maps.exam[m.examId], sid2 = m && maps.stu[m.studentId];
    if (!eid || !sid2) return Promise.resolve(null);
    filter = 'school_id=eq.' + encodeURIComponent(schoolId) + '&exam_id=eq.' + encodeURIComponent(eid) + '&student_id=eq.' + encodeURIComponent(sid2);
  } else if (table === 'ss_receipts') {
    filter = 'school_id=eq.' + encodeURIComponent(schoolId) + '&receipt_no=eq.' + encodeURIComponent(entry.key);
  } else {
    filter = 'school_id=eq.' + encodeURIComponent(schoolId) + '&local_id=eq.' + encodeURIComponent(entry.key);
  }
  // v33: receipts carry no local_id, so a row found by receipt_no is
  // only THIS receipt when its content matches — the push entry checks
  // that before patching, so a same-number collision can never
  // overwrite another device's receipt.
  var cols = table === 'ss_receipts' ? 'id,updated_at,student_id,total,receipt_date,student_name,month' : 'id,updated_at';
  // v44: the push guard below must never rename a server row's
  // local_id, so the students lookup also selects the server local_id.
  if (table === 'ss_students') cols = 'id,updated_at,local_id';
  return sbRest('GET', table + '?select=' + cols + '&' + filter, token).then(function (r) {
    if (r.ok && Array.isArray(r.data) && r.data.length) return r.data[0];
    // v44: students have natural unique keys — a row that exists under
    // a different local_id (same admission_no/enr, same school) is THIS
    // student, not a new one. Without this fallback the push POSTs a
    // duplicate and 409s on ss_students_school_id_admission_no_key.
    // Delete entries never adopt (students are soft-deleted only).
    if (table !== 'ss_students' || entry.op === 'delete') return null;
    return sbSyncFindStudentByNumber(entry, token, schoolId);
  });
  }
  if (!known) return byNaturalKey();
  return sbRest('GET', table + '?select=id,updated_at&id=eq.' + encodeURIComponent(known), token).then(function (r) {
    if (r.ok && Array.isArray(r.data) && r.data.length) return r.data[0];
    return byNaturalKey();
  });
}

// v44: the server student with the same admission_no (then enr) in this
// school. Returns the row with _adoptedByNaturalKey set, or null. The
// push adopts such a row by PATCH (never a duplicate POST) and never
// sends local_id, so the server row keeps its own identity.
function sbSyncFindStudentByNumber(entry, token, schoolId) {
  var row = entry.row || {};
  // v45: a demo-seed row is never adopted — the live flood renamed the
  // real V21 Test Kumar row to the seed name "Aarav Verma" exactly
  // here, by adopting the server row under the seed row's admission_no
  // and PATCHing the seed name onto it.
  if (sbIsSeedRow('ss_students', row)) return Promise.resolve(null);
  var adm = row.admissionNo || row.admission_no || '';
  var enr = row.enr || '';
  function byAdm() {
    if (!adm) return Promise.resolve(null);
    return sbRest('GET', 'ss_students?select=id,updated_at,local_id&school_id=eq.' + encodeURIComponent(schoolId) + '&admission_no=eq.' + encodeURIComponent(adm), token).then(function (r) {
      if (r.ok && Array.isArray(r.data) && r.data.length) { r.data[0]._adoptedByNaturalKey = true; return r.data[0]; }
      return null;
    });
  }
  return byAdm().then(function (found) {
    if (found) return found;
    if (!enr) return null;
    return sbRest('GET', 'ss_students?select=id,updated_at,local_id&school_id=eq.' + encodeURIComponent(schoolId) + '&enr=eq.' + encodeURIComponent(enr), token).then(function (r2) {
      if (r2.ok && Array.isArray(r2.data) && r2.data.length) { r2.data[0]._adoptedByNaturalKey = true; return r2.data[0]; }
      return null;
    });
  });
}
function sbSyncPushEntry(entry, token, schoolId, maps, uid, batch) {
  // Pushes ONE outbox entry. Returns {pushed, conflict, skipped, keep, hash}.
  // conflict: the server copy is newer — the entry is dropped and the
  // next pull restores the server version. keep: the row cannot be
  // pushed yet (a parent has no server id) — it stays queued.
  // v53: batch is the per-table server rows fetched once per flush pass
  // (select=*). When provided, the find runs in memory instead of a GET
  // per entry, and a row whose content is already on the server
  // resolves WITHOUT a write. When the batch has no row the live
  // sbSyncFindServerRow still runs (a row created mid-pass is not in
  // the batch). The 5-arg call shape is unchanged — the v51 harness
  // tests call this directly without batch.
  // v45: a queued demo-seed entry is dropped as skipped, never pushed —
  // the live flood's outbox held one entry per seed row and the flush
  // POSTed them one by one for minutes. Skipped (not kept) so the
  // outbox drains and the cycle can reach synced.
  var table = entry.table;
  if (sbIsSeedEntry(table, entry)) return Promise.resolve({ pushed: false, skipped: true });
  if (entry.op === 'delete') {
    var delRow = batch ? sbSyncFindFromBatch(batch, table, entry, schoolId, maps, uid) : null;
    var delP = delRow ? Promise.resolve(delRow) : sbSyncFindServerRow(table, entry, token, schoolId, maps, uid);
    return delP.then(function (row) {
      if (!row) return { pushed: false, skipped: true };
      return sbRest('DELETE', table + '?id=eq.' + encodeURIComponent(row.id), token, undefined, 'return=minimal').then(function (r) {
        if (!r.ok) throw new Error('delete-' + table + '-' + (r.status || 'fail'));
        return { pushed: true };
      });
    });
  }
  // Append-only logs dedupe by their natural key, exactly like migration.
  if (table === 'ss_audit_log' || table === 'ss_activities') {
    var logRow = sbSyncMapRow(table, entry.row, schoolId, maps, db);
    var cols = table === 'ss_audit_log' ? 'ts,actor,action,details' : 'title,sub';
    var keyFn = table === 'ss_audit_log'
      ? function (row) { return sbNormTs(row.ts) + '|' + row.actor + '|' + row.action + '|' + row.details; }
      : function (row) { return row.title + '|' + row.sub; };
    // v53: with a batch, dedupe against the already-fetched rows — no
    // GET per log entry — and POST only when the row is missing.
    if (batch) {
      var bRows53 = batch[table] || [];
      var logKey53 = keyFn(logRow);
      for (var li53 = 0; li53 < bRows53.length; li53++) { if (keyFn(bRows53[li53]) === logKey53) return Promise.resolve({ pushed: true, hash: JSON.stringify(logRow) }); }
      return sbRest('POST', table, token, logRow, 'return=representation').then(function (r) {
        if (!r.ok) throw new Error('post-' + table + '-' + (r.status || 'fail'));
        return { pushed: true, hash: JSON.stringify(logRow) };
      });
    }
    return sbUploadMissing(token, schoolId, table, cols, [logRow], keyFn).then(function () {
      return { pushed: true, hash: JSON.stringify(logRow) };
    });
  }
  // School row: PATCH by id (it always exists by the time we sync).
  if (table === 'ss_schools') {
    var payload = sbSyncSchoolPayloadFromParts(entry.row.profile, entry.row.feeExtras, entry.row.admCounter, entry.row.receiptCounter);
    var schRow = batch ? sbSyncFindFromBatch(batch, table, entry, schoolId, maps, uid) : null;
    var schP = schRow ? Promise.resolve(schRow) : sbSyncFindServerRow(table, entry, token, schoolId, maps, uid);
    return schP.then(function (row) {
      if (row && row.updated_at && entry.at && new Date(row.updated_at) > new Date(entry.at)) return { pushed: false, conflict: true };
      // v53: the school row is re-queued on every profile/counter
      // change, but its content is usually already on the server —
      // skip the PATCH when the full batch row matches.
      if (schRow && sbSyncRowSameAsServer(payload, schRow)) return { pushed: true, hash: JSON.stringify(payload) };
      return sbRest('PATCH', 'ss_schools?id=eq.' + encodeURIComponent(schoolId), token, payload, 'return=minimal').then(function (r) {
        if (!r.ok) throw new Error('patch-ss_schools-' + (r.status || 'fail'));
        return { pushed: true, hash: JSON.stringify(payload) };
      });
    });
  }
  // Map the queued local row fresh: foreign keys resolve against the
  // current id maps, so a student pushed earlier in this same flush
  // already has its server id.
  var payload2 = sbSyncMapRow(table, entry.row, schoolId, maps, db);
  if (!payload2) return Promise.resolve({ pushed: false, skipped: true });
  // v51: a row whose parent has no server id yet waits — but ONLY
  // while its local row still exists. Once the local row is gone the
  // parent can never resolve (a fresh student/exam never reuses a
  // dead local id), so waiting keeps the entry queued forever and
  // the flush can never write 'synced' — live v50: the status stayed
  // 'Backup pending' for 6 minutes although every upload succeeded,
  // because the flush ends sbSetStatus(left ? 'pending' : 'synced')
  // and the cycle tail only writes 'synced' on an empty outbox. A
  // vanished local row drops as skipped: the row is already gone,
  // so nothing is lost by dropping its entry. The quarantine cannot
  // save such an entry either — sbIsSeedStudentId needs the local
  // row to prove seedness, and the row is gone.
  if (!sbSyncPayloadReady(table, payload2)) {
    if (!sbSyncLocalRow(entry)) return Promise.resolve({ pushed: false, skipped: true });
    return Promise.resolve({ pushed: false, skipped: true, keep: true });
  }
  // v53: the batched find runs in memory when the row is in the pass
  // batch; a batch miss falls back to the live find (a row created
  // mid-pass is not in the batch). Only a batch row is a FULL row, so
  // only it can prove the content is already on the server.
  var batchRow53 = batch ? sbSyncFindFromBatch(batch, table, entry, schoolId, maps, uid) : null;
  var findP53 = batchRow53 ? Promise.resolve(batchRow53) : sbSyncFindServerRow(table, entry, token, schoolId, maps, uid);
  return findP53.then(function (row) {
    if (row) {
      // v33: a receipt found by number is only patched when its content
      // matches this receipt — same number, different receipt is a
      // collision, and the entry stays queued for the repair pass.
      // v51: the repair pass can only re-number a receipt that still
      // exists locally. When the local receipt is gone the server row
      // wins — drop the entry instead of keeping it forever (the same
      // stuck-outbox trap as the zombie attendance above: the flush
      // never drains, so the status never reaches 'synced').
      if (table === 'ss_receipts' && !sbReceiptSameServer(row, payload2)) {
        // v51: the repair pass can only re-number a receipt that
        // still exists locally AND still carries this entry's content.
        // A queued entry for a number whose local row is gone — or
        // whose local row is a DIFFERENT receipt sharing the number
        // (the server's row, pulled down into the mirror) — is a
        // phantom the repair can never see: drop it instead of
        // keeping it forever. Only a live local receipt with matching
        // content keeps waiting for the repair pass.
        var localRc51 = sbSyncLocalRow(entry);
        if (localRc51 && sbReceiptSame(localRc51, entry.row || {})) return { pushed: false, skipped: true, keep: true };
        return { pushed: false, skipped: true };
      }
      // Last-write-wins: a newer server copy beats this local change.
      if (row.updated_at && entry.at && new Date(row.updated_at) > new Date(entry.at)) return { pushed: false, conflict: true };
      // v53: identical content already on the server — resolve WITHOUT
      // a PATCH. The receipt collision check above still runs first,
      // so a same-number different receipt never resolves as
      // identical. The id map is set exactly as the PATCH branch sets
      // it, so the next pull/find sees the same server id.
      if (batchRow53 && sbSyncRowSameAsServer(payload2, batchRow53)) {
        sbSrvIdSet(uid, table, entry.key, batchRow53.id);
        if (batchRow53._adoptedByNaturalKey && batchRow53.local_id) sbSrvIdSet(uid, table, batchRow53.local_id, batchRow53.id);
        return { pushed: true, hash: JSON.stringify(payload2) };
      }
      // v44: a student found by admission_no/enr (not by local_id) is
      // THIS student under a stale local id — PATCH it, but never send
      // local_id: overwriting the server row's local_id with the stale
      // one would rename the server identity, and the next pull would
      // bring the row back as a second local student. The hash stays
      // the full payload's, so the queued local row is seen as synced
      // (its content is on the server; the server owns the identity).
      var patchPayload = payload2;
      if (row._adoptedByNaturalKey) {
        patchPayload = Object.assign({}, payload2);
        delete patchPayload.local_id;
      }
      return sbRest('PATCH', table + '?id=eq.' + encodeURIComponent(row.id), token, patchPayload, 'return=minimal').then(function (r) {
        if (!r.ok) throw new Error('patch-' + table + '-' + (r.status || 'fail'));
        sbSrvIdSet(uid, table, entry.key, row.id);
        if (row._adoptedByNaturalKey && row.local_id) sbSrvIdSet(uid, table, row.local_id, row.id);
        return { pushed: true, hash: JSON.stringify(payload2) };
      });
    }
    return sbRest('POST', table, token, payload2, 'return=representation').then(function (r) {
      if (!r.ok) throw new Error('post-' + table + '-' + (r.status || 'fail'));
      var created = Array.isArray(r.data) && r.data[0];
      if (created && created.id) sbSrvIdSet(uid, table, entry.key, created.id);
      return { pushed: true, hash: JSON.stringify(payload2) };
    });
  });
}
function sbSyncFlushWithToken(act, tok) {
  // Pushes the whole outbox, in queue order, in dependency-safe passes:
  // a pass can unlock rows whose foreign keys only resolved in this same
  // flush (a fee record queued before its student got a server id).
  // A failed entry stops the pass; the rest stays queued for the next
  // login / reconnect. Nothing is ever dropped except pushed, skipped
  // (already gone / superseded) and conflict (server wins) entries.
  // v53: the pass is BATCHED — one select=* GET per table that has
  // entries, all in parallel, then the entries' writes run in parallel
  // chunks of 6. The old sequential shape cost 2 round-trips per entry
  // (find GET + POST/PATCH): a legacy outbox of ~30 entries was ~60
  // round-trips per pass, up to 3 passes — 45–75s at 250–400ms per
  // round-trip, which is exactly the live v52 "Syncing…" minute. The
  // batched pass costs ~1 round-trip for the finds + ~1 for the writes.
  var passes = 0;
  var pushedTotal = 0, conflicts = 0;
  var flushT0 = Date.now();
  var flushCalls0 = sbSyncRestCalls;
  function pass() {
    passes++;
    var outbox = sbOutboxLoad(act.uid);
    if (!outbox.length) return Promise.resolve({ done: true, pushed: pushedTotal, conflicts: conflicts });
    // B10: passes exhausted with entries still queued is NOT done — the
    // outbox still has work. Callers (and the status line) must see
    // done:false with the leftover count, never done:true.
    if (passes > 3) return Promise.resolve({ done: false, reason: 'passes-exhausted', pushed: pushedTotal, conflicts: conflicts, leftover: outbox.length });
    var schoolId = (sbServerSchoolMap()[act.account.uid]) || null;
    if (!schoolId) return Promise.resolve({ done: false, reason: 'no-server-school' });
    var maps = sbSyncBuildMaps(db, act.uid);
    // One find GET per table, in parallel — the batch for this pass.
    var tables53 = [];
    outbox.forEach(function (e) { if (tables53.indexOf(e.table) === -1) tables53.push(e.table); });
    return Promise.all(tables53.map(function (tb) {
      return sbRest('GET', tb + '?select=*&school_id=eq.' + encodeURIComponent(schoolId), tok).then(function (r) {
        return { table: tb, rows: (r.ok && Array.isArray(r.data)) ? r.data : [] };
      });
    })).then(function (fetched) {
      var batch = {};
      fetched.forEach(function (f) { batch[f.table] = f.rows; });
      var pushedThisPass = 0;
      var failed53 = null; // first failed entry: stops later chunks
      var chunks53 = [];
      for (var ci53 = 0; ci53 < outbox.length; ci53 += 6) chunks53.push(outbox.slice(ci53, ci53 + 6));
      var chain = Promise.resolve();
      chunks53.forEach(function (chunk) {
        chain = chain.then(function () {
          if (failed53) return; // a failure in an earlier chunk stops the pass
          return Promise.all(chunk.map(function (entry) {
            // The row vanished locally since it was queued and its table
            // never propagates deletes: drop the stale entry (the next pull
            // restores the row from the server). v34 (P1-1): the entry's own
            // queued copy is good enough — a pull that wiped the local row
            // (e.g. an upload failure) must NOT also drop the queued entry
            // that would have re-uploaded it.
            if (entry.op === 'upsert' && !sbSyncLocalRow(entry) && !entry.row) { sbOutboxRemove(act.uid, entry); return null; }
            return sbSyncPushEntry(entry, tok, schoolId, maps, act.uid, batch).then(function (r) {
              return { entry: entry, r: r };
            }).catch(function (err) {
              return { entry: entry, err: err };
            });
          })).then(function (chunkResults) {
            chunkResults.forEach(function (cr) {
              if (!cr) return;
              if (cr.err) { if (!failed53) failed53 = cr; return; }
              var r = cr.r, entry = cr.entry;
              if (r.pushed) {
                pushedThisPass++; pushedTotal++;
                if (r.hash) sbSyncSnapSet(act.account.uid, entry.table, entry.key, r.hash);
                if (entry.op === 'delete') sbSyncSnapDelete(act.account.uid, entry.table, entry.key);
                sbOutboxRemove(act.uid, entry);
                maps = sbSyncBuildMaps(db, act.uid); // fresh ids for the next chunk
              } else if (r.conflict) {
                conflicts++;
                sbSyncSnapSetFromLocalRow(act.account.uid, entry, schoolId, maps);
                sbOutboxRemove(act.uid, entry);
              } else if (r.skipped && !r.keep) {
                sbOutboxRemove(act.uid, entry);
              }
            });
          });
        });
      });
      return chain.then(function () {
        if (failed53) {
          // v33: the failed entry stays queued WITH the reason, so a local
          // row is never silently lost and the next cycle can repair it
          // (e.g. a 409 unique-constraint failure on a colliding number).
          var list = sbOutboxLoad(act.uid);
          list.forEach(function (e2) { if (e2.table === failed53.entry.table && e2.key === failed53.entry.key) e2.failReason = (failed53.err && failed53.err.message) || 'error'; });
          sbOutboxSave(act.uid, list);
          return { done: false, reason: 'error', detail: (failed53.err && failed53.err.message) || 'error', pushed: pushedTotal };
        }
        // B10: a pass that pushed nothing and resolved no conflicts made
        // no progress — the entries left are still waiting (e.g. a parent
        // with no server id yet). done:true only when the outbox is
        // really empty; otherwise report the stall with the leftover.
        if (!pushedThisPass && !conflicts) {
          var leftStalled = sbOutboxLoad(act.uid).length;
          if (!leftStalled) return { done: true, pushed: pushedTotal, conflicts: conflicts };
          return { done: false, reason: 'stalled', pushed: pushedTotal, conflicts: conflicts, leftover: leftStalled };
        }
        // New rows may have become mappable: re-diff and loop.
        var n = sbSyncQueueDiff();
        if (n) return pass();
        // B10: same outbox-empty guard as the stalled path — the re-diff
        // should have looped while anything remained, but done:true must
        // never be returned with entries still queued.
        var leftFinal = sbOutboxLoad(act.uid).length;
        if (leftFinal) return { done: false, reason: 'stalled', pushed: pushedTotal, conflicts: conflicts, leftover: leftFinal };
        return { done: true, pushed: pushedTotal, conflicts: conflicts };
      });
    }).catch(function (err53) {
      // A batch GET (or the re-diff) failed: the outbox stays queued and
      // the cycle reports the failure, exactly like the old sequential
      // pass's catch. Nothing is dropped.
      return { done: false, reason: 'error', detail: (err53 && err53.message) || 'error', pushed: pushedTotal };
    });
  }
  return pass().then(function (r) {
    var left = sbOutboxLoad(act.uid).length;
    if (r.done) {
      sbSetStatus(left ? 'pending' : 'synced');
    } else if (r.reason === 'passes-exhausted' || r.reason === 'stalled') {
      // B10: a stalled flush is not a failure — entries are still waiting
      // (nothing errored), so the line stays "pending", never "failed".
      sbSetStatus(left ? 'pending' : 'synced');
    } else {
      sbSetStatus('failed', r.detail || '');
    }
    // v53 diag: the flush's real cost, read by Settings "Sync details".
    sbSyncDiagSet({ lastFlush: { at: new Date().toISOString(), ms: Date.now() - flushT0, pushed: r.pushed || 0, conflicts: r.conflicts || 0, leftover: left, calls: sbSyncRestCalls - flushCalls0 } });
    sbSyncDetailsRefresh();
    return r;
  });
}
function sbSyncFlushNow() {
  // Push-only flush (no pull): what the debounced post-save timer and
  // the tests call. Serialised through the sync lock.
  var act = sbSyncActive();
  if (!act) return Promise.resolve({ done: false, reason: 'no-session' });
  if (!sbIsOnline()) { sbSetStatus('pending'); return Promise.resolve({ done: false, reason: 'offline' }); }
  return sbSyncWithLock(function () {
    return sbGetValidToken().then(function (tok) {
      if (!tok) { sbSetStatus(sbSessionExpired ? 'session-expired' : 'offline'); return { done: false, reason: 'no-token' }; }
      return sbSyncFlushWithToken(act, tok);
    });
  });
}
function sbSyncGuardHit(d, byTable) {
  // Guard (a): the school never migrated and the server is empty for a
  // table that has local rows. Returns the first such table, or null.
  // Fee structure is excluded: local defaults always exist and are not
  // user data, so an empty server structure is normal for a fresh school.
  // v45: the counts are the REAL rows only (sbLocalCountsReal) — demo
  // seed rows must never trip the guard, or the migration it demands
  // can never complete and the pull never runs.
  var rc45 = sbLocalCountsReal(d);
  var checks = [
    ['ss_students', rc45.students], ['ss_teachers', rc45.teachers],
    ['ss_exams', rc45.exams], ['ss_fee_records', rc45.feeRecords],
    ['ss_attendance', rc45.attendance],
    // v39: only numbered receipts — a numberless offline receipt can
    // never be on the server and must not trip the migration guard.
    ['ss_receipts', rc45.receipts],
    ['ss_marks', rc45.marks], ['ss_homework', rc45.homework],
    ['ss_notices', rc45.notices], ['ss_admission_requests', (d.admissionRequests || []).length]
  ];
  for (var i = 0; i < checks.length; i++) {
    if (checks[i][1] > 0 && !(byTable[checks[i][0]] || []).length) return checks[i][0];
  }
  return null;
}
function sbSyncPullRun(account, sbUid, token, serverSchoolId) {
  // v33 merge pull: server rows come in, but a local row that has not
  // reached the server yet is KEPT (never wiped by the pull) — see
  // sbApplyServerRows. The guard refuses the pull when the school never
  // migrated and the server is empty for a table with local rows (the
  // caller then runs the migration upload instead). Audit log /
  // activities are NOT pulled (append-only; the push uploads new
  // entries, the server keeps them).
  if (!account || account.role !== 'school') return Promise.resolve({ done: false, reason: 'not-school' });
  if (!token) return Promise.resolve({ done: false, reason: 'no-token' });
  if (!sbIsOnline()) return Promise.resolve({ done: false, reason: 'offline' });
  var d = db;
  var idP = serverSchoolId ? Promise.resolve(serverSchoolId)
    : sbGetServerSchoolId(sbUid, token).then(function (row) { return row ? row.id : null; });
  return idP.then(function (sid) {
    if (!sid) return { done: false, reason: 'no-server-school' };
    var tables = ['ss_fee_structure', 'ss_students', 'ss_teachers', 'ss_exams', 'ss_fee_records', 'ss_attendance', 'ss_receipts', 'ss_marks', 'ss_homework', 'ss_notices', 'ss_admission_requests'];
    var gets = [sbRest('GET', 'ss_schools?select=*&id=eq.' + encodeURIComponent(sid), token)];
    tables.forEach(function (t) { gets.push(sbRest('GET', t + '?select=*&school_id=eq.' + encodeURIComponent(sid) + '&limit=5000', token)); });
    return Promise.all(gets).then(function (res) {
      var i;
      for (i = 0; i < res.length; i++) if (!res[i].ok || !Array.isArray(res[i].data)) throw new Error('read-failed');
      var schoolRow = (res[0].data && res[0].data[0]) || null;
      var byTable = {};
      tables.forEach(function (t, j) { byTable[t] = res[j + 1].data; });
      if (!sbLoadMig(sbUid)) {
        var guardHit = sbSyncGuardHit(d, byTable);
        if (guardHit) return { done: false, reason: 'needs-migration', detail: guardHit };
      }
      var snapBefore43 = sbSnapLoad(account.uid);
      sbSyncApplying = true;
      var applied, snapAfter43;
      try {
        applied = sbApplyServerRows(d, schoolRow, byTable, account, sid);
        snapAfter43 = sbSyncSnapshotRefresh(d, account, applied);
      } finally {
        sbSyncApplying = false;
      }
      saveDB(d);
      // v43: a pull that changed nothing must not re-render the page.
      // Every 30s tick / focus event ran a pull, and every pull called
      // renderApp() unconditionally — a tap landing on a node the
      // re-render replaces between touchstart and click is swallowed
      // (live v42: the Dec receipt link's first tap did nothing, the
      // second opened it). The snapshot hashes are content-based, so
      // an unchanged snapshot means the visible data is unchanged and
      // the current DOM stays valid. A pull that DID change data still
      // re-renders, exactly as before.
      if (JSON.stringify(snapBefore43) !== JSON.stringify(snapAfter43)) renderApp();
      return { done: true, reason: 'ok', schoolId: sid, counts: sbLocalCounts(d) };
    });
  }).catch(function (err) {
    return { done: false, reason: 'error', detail: (err && err.message) || 'error' };
  });
}
/* ================= v33: atomic server-side numbering =================
   The live bug (9 Nov 2026, VM School): the phone added Ankit Kumar
   (ADM-2025-001 / ENR-001); the laptop, whose local store was empty,
   minted ADM-2025-001 / ENR-001 for a new student too. The server
   rejected the laptop's POST (unique (school_id, admission_no) and
   unique (school_id, enr)), the student never reached the server, and
   a server-wins pull then WIPED the laptop-only student — the record
   existed nowhere. Two fixes, both in this version:
   (1) NUMBERING: for a school logged in via Supabase, admission and
   receipt numbers come from the server, through the existing atomic
   RPCs ss_next_adm_no / ss_next_receipt_no (01_schema.sql; both
   SECURITY DEFINER, ownership-checked, granted to authenticated in
   02_rls.sql — no new SQL file is needed). The local counters stay
   only for local-only accounts and as a display fallback. The RPC
   alone is not enough: the live server counter (1) sat BEHIND the
   highest used number (001 taken), so the RPC re-mints a taken number
   first — every candidate is checked against the server's taken set
   and the RPC is retried until a free number comes back (mint-until-
   free). ENR has no server counter; it is derived from the ADM
   sequence (ENR-002 for ADM-2025-002), matching the live data.
   (2) REPAIR + NEVER-LOSE: every sync cycle first re-numbers local
   rows that collide with a different server row and mints numbers for
   rows saved while offline (numPending), then uploads, then pulls.
   The pull MERGES instead of replacing: a local row that has not
   reached the server is kept, and the outbox keeps failed entries
   with their reason instead of dropping them.
   Offline: a student/receipt added while offline is saved WITHOUT a
   number (numPending) and minted on the next online cycle — never a
   locally guessed number for a server account, because a guess can
   collide. Local-only accounts keep minting locally, exactly as now,
   and make zero server calls. */
function sbNumSeq(num) {
  var m = /^(?:ADM|RCP)-\d{4}-(\d+)$/.exec(String(num || ''));
  return m ? parseInt(m[1], 10) : 0;
}
function sbEnrFromAdm(admNo) { return 'ENR-' + String(sbNumSeq(admNo)).padStart(3, '0'); }
function sbReceiptSame(a, b) {
  // Same receipt? Server-mapped receipt vs local receipt: number is
  // checked by the caller; content is student name + total + date +
  // month. (Receipts carry no local_id on the server, so content is
  // the only identity available.)
  return (a.name || '') === (b.name || '') && Number(a.total || 0) === Number(b.total || 0)
    && (a.date || '') === (b.date || '') && (a.month || '') === (b.month || '');
}
function sbReceiptSameServer(row, payload) {
  // The server row found by receipt_no is THIS receipt only when its
  // content matches the push payload — same number, different receipt
  // is a collision, and patching it would overwrite another device's
  // receipt.
  if (!row || !payload) return false;
  // v41: an UNKNOWN student_id (no id-map entry yet — the repair runs
  // before the pull that would save the map) is not a DIFFERENT
  // student. Every other field matching means this is the same
  // receipt; treating null as a mismatch minted a new server number
  // for every receipt on every cycle (live: 192 duplicate receipts,
  // the counter climbing 3 per render). When both ids are known they
  // must still agree.
  var idOk = !payload.student_id || String(row.student_id || '') === String(payload.student_id || '');
  return idOk
    && Number(row.total || 0) === Number(payload.total || 0)
    && String(row.receipt_date || '') === String(payload.receipt_date || '')
    && String(row.month || '') === String(payload.month || '')
    && String(row.student_name || '') === String(payload.student_name || '');
}
function sbReceiptContentMatches(srvRow, rc, stuMap, byId) {
  // Does this server receipt hold the same collection as the local
  // receipt — same student, month, total, date and name, and (where
  // both sides carry lines) the same fee type? Used by the
  // adopt-before-mint step: a receipt whose content already exists on
  // the server under another number links to that number instead of
  // minting a duplicate. The fee-type check matters: two genuinely
  // different same-day collections (e.g. Tuition 800 and Transport
  // 800) share every other field and must never be merged.
  // B2: the fee-type check alone cannot tell two same-day same-amount
  // collections of the SAME fee type apart (Tuition 800 paid twice).
  // When both sides carry Collected fee-record ids on their lines
  // (receipts made after the fix stamp them in finishCollectFee),
  // the id sets must agree — two different collections never share
  // a fee record. When either side has no ids (a receipt made
  // before the fix), the field comparison below decides, exactly
  // as before, so old receipts still adopt and merge as they did.
  var srvIds = [];
  (srvRow.lines || []).forEach(function (ln) { if (ln.recordId) srvIds.push(String(ln.recordId)); });
  var rcIds = [];
  (rc.lines || []).forEach(function (ln) { if (ln.recordId) rcIds.push(String(ln.recordId)); });
  srvIds.sort(); rcIds.sort();
  if (srvIds.length && rcIds.length && srvIds.join(',') !== rcIds.join(',')) return false;
  var s = byId[rc.studentId] || {};
  var stuId = (stuMap && stuMap[rc.studentId]) || null;
  var idOk = !stuId || String(srvRow.student_id || '') === String(stuId);
  if (!idOk) return false;
  if (Number(srvRow.total || 0) !== Number(rc.total || 0)) return false;
  if (String(srvRow.receipt_date || '') !== String(rc.date || '')) return false;
  if (String(srvRow.month || '') !== String(rc.month || '')) return false;
  if (String(srvRow.student_name || '') !== String(rc.name || s.name || '')) return false;
  var srvLines = srvRow.lines || [];
  var rcLines = rc.lines || [];
  if (srvLines.length && rcLines.length) {
    var srvTypes = {};
    srvLines.forEach(function (ln) { if (ln.type) srvTypes[ln.type] = true; });
    if (!rcLines.some(function (ln) { return ln.type && srvTypes[ln.type]; })) return false;
  }
  return true;
}
function sbFindReceiptByContent(serverReceipts, rc, stuMap, byId) {
  // The earliest server number holding this receipt's content, or
  // null. Earliest, so a receipt re-numbered by a previous cycle
  // links back to its original number, not to a later duplicate.
  var best = null;
  (serverReceipts || []).forEach(function (r) {
    if (!r.receipt_no) return;
    if (!sbReceiptContentMatches(r, rc, stuMap, byId)) return;
    if (best === null || r.receipt_no < best) best = r.receipt_no;
  });
  return best;
}
function sbReceiptContentKey(rc) {
  // v42: canonical identity of one collection, for collapsing
  // duplicate server rows in the pull mirror: student + month +
  // total + date + name + fee types (when lines exist). Two rows
  // with the same key are the same collection minted twice — the
  // earliest number wins. A genuinely different collection
  // (different total, date or fee type) has a different key and
  // keeps its own row.
  // B2: the fields above cannot tell two genuinely different
  // same-day same-amount collections of the same fee type apart
  // (Tuition 800 paid twice in one day for the same student and
  // month) — they shared one key and collapsed into one receipt.
  // The key now also carries the Collected fee-record ids stamped
  // on the receipt's lines (finishCollectFee): two different
  // collections always paid different fee records, so they never
  // share a key. Receipts made before the fix carry no record ids
  // and fall back to the legacy key, so old receipts (including
  // the v41 duplicates) still collapse exactly as before. The
  // receipt NUMBER sequence is untouched: the key only decides
  // which rows are the same collection, never which number a
  // receipt gets.
  var types = [];
  (rc.lines || []).forEach(function (ln) { if (ln.type) types.push(ln.type); });
  types.sort();
  var ids = [];
  (rc.lines || []).forEach(function (ln) { if (ln.recordId) ids.push(String(ln.recordId)); });
  ids.sort();
  var key = [rc.studentId || '', rc.month || '', Number(rc.total || 0), rc.date || '', rc.name || '', types.join(',')].join('|');
  return ids.length ? key + '|fee:' + ids.join(',') : key;
}
function sbGetSchoolIdForSync(account, sbUid, token) {
  var cached = sbServerSchoolMap()[account.uid];
  if (cached) return Promise.resolve(cached);
  return sbEnsureServerSchool(account, sbUid, token, db);
}
function sbFetchTakenNumbers(token, schoolId) {
  // The numbers already on the server, for the mint-until-free check
  // and the repair pass. Also the server counters and the highest used
  // sequences, for the counter heal.
  return Promise.all([
    sbRest('GET', 'ss_students?select=local_id,admission_no,enr&school_id=eq.' + encodeURIComponent(schoolId) + '&limit=5000', token),
    sbRest('GET', 'ss_receipts?select=receipt_no,student_id,total,receipt_date,student_name,month,lines&school_id=eq.' + encodeURIComponent(schoolId) + '&limit=5000', token),
    sbRest('GET', 'ss_schools?select=adm_counter,receipt_counter&id=eq.' + encodeURIComponent(schoolId), token)
  ]).then(function (res) {
    var students = (res[0].ok && Array.isArray(res[0].data)) ? res[0].data : [];
    var receipts = (res[1].ok && Array.isArray(res[1].data)) ? res[1].data : [];
    var schoolRow = (res[2].ok && Array.isArray(res[2].data) && res[2].data[0]) || null;
    var taken = { adm: {}, enr: {}, rcp: {}, students: students, receipts: receipts,
      admCounter: (schoolRow && schoolRow.adm_counter) || 1, receiptCounter: (schoolRow && schoolRow.receipt_counter) || 1,
      maxAdm: 0, maxRcp: 0 };
    students.forEach(function (r) {
      if (r.admission_no) { taken.adm[r.admission_no] = r.local_id || ''; taken.maxAdm = Math.max(taken.maxAdm, sbNumSeq(r.admission_no)); }
      if (r.enr) taken.enr[r.enr] = r.local_id || '';
    });
    receipts.forEach(function (r) {
      if (r.receipt_no) { taken.rcp[r.receipt_no] = r; taken.maxRcp = Math.max(taken.maxRcp, sbNumSeq(r.receipt_no)); }
    });
    return taken;
  });
}
function sbMintAdmNo(token, schoolId, taken) {
  var attempts = 0;
  function tryOnce() {
    attempts++;
    return sbRest('POST', 'rpc/ss_next_adm_no', token, { p_school_id: schoolId }).then(function (r) {
      if (!r.ok || typeof r.data !== 'string' || !r.data) throw new Error('rpc-adm-' + (r.status || 'fail'));
      var adm = r.data, enr = sbEnrFromAdm(adm);
      if ((taken.adm && taken.adm[adm]) || (taken.enr && taken.enr[enr])) {
        if (attempts >= 8) throw new Error('rpc-adm-exhausted');
        return tryOnce();
      }
      if (taken.adm) taken.adm[adm] = 'minted';
      if (taken.enr) taken.enr[enr] = 'minted';
      return { admissionNo: adm, enr: enr };
    });
  }
  return tryOnce();
}
function sbMintReceiptNo(token, schoolId, takenRcp) {
  var attempts = 0;
  function tryOnce() {
    attempts++;
    return sbRest('POST', 'rpc/ss_next_receipt_no', token, { p_school_id: schoolId }).then(function (r) {
      if (!r.ok || typeof r.data !== 'string' || !r.data) throw new Error('rpc-rcp-' + (r.status || 'fail'));
      if (takenRcp && takenRcp[r.data]) {
        if (attempts >= 8) throw new Error('rpc-rcp-exhausted');
        return tryOnce();
      }
      if (takenRcp) takenRcp[r.data] = true;
      return r.data;
    });
  }
  return tryOnce();
}
function sbMintNewStudentNumbers(act) {
  // One fresh (admissionNo, enr) pair from the server for a new student.
  return sbGetValidToken().then(function (tok) {
    if (!tok) throw new Error('no-token');
    return sbGetSchoolIdForSync(act.account, act.uid, tok).then(function (schoolId) {
      if (!schoolId) throw new Error('no-school-id');
      return sbFetchTakenNumbers(tok, schoolId).then(function (taken) {
        return sbMintAdmNo(tok, schoolId, taken);
      });
    });
  });
}
function sbMintNewReceiptNumber(act) {
  return sbGetValidToken().then(function (tok) {
    if (!tok) throw new Error('no-token');
    return sbGetSchoolIdForSync(act.account, act.uid, tok).then(function (schoolId) {
      if (!schoolId) throw new Error('no-school-id');
      return sbFetchTakenNumbers(tok, schoolId).then(function (taken) {
        return sbMintReceiptNo(tok, schoolId, taken.rcp);
      });
    });
  });
}
function sbMintManyAdmNos(token, schoolId, taken, count) {
  // Sequential mints for a bulk import: each mint updates the taken
  // sets, so two rows in the same import never share a number.
  var out = [];
  var chain = Promise.resolve();
  for (var i = 0; i < count; i++) {
    chain = chain.then(function () { return sbMintAdmNo(token, schoolId, taken); }).then(function (nums) { out.push(nums); });
  }
  return chain.then(function () { return out; });
}
function sbSyncRepairNumbers(account, sbUid, token) {
  // v33 repair + mint-pending pass. Runs FIRST in every sync cycle,
  // before the upload-missing pass:
  // (1) a local student whose admission_no/enr collides with a
  //     DIFFERENT server row (same number, different local_id) is
  //     re-numbered from the server and re-queued — no manual step;
  // (2) a local receipt whose receipt_no collides with a DIFFERENT
  //     server receipt (same number, different content) is re-numbered;
  // (3) rows saved while offline (numPending, no number yet) are minted.
  // Rows that already match a server row by local_id are never touched.
  // Counters are healed to past the highest used number. Never rejects:
  // a failed pass leaves the rows for the next cycle (the merge pull
  // keeps them locally and the outbox keeps retrying them).
  var act = sbSyncActive();
  if (!act) return Promise.resolve({ done: false, reason: 'no-session' });
  if (!sbIsOnline()) return Promise.resolve({ done: false, reason: 'offline' });
  var d = db;
  var schoolId = null, taken = null, serverByLocal = {}, snap = {};
  var repaired = 0, minted = 0, changed = false;
  return sbGetSchoolIdForSync(account, sbUid, token).then(function (id) {
    schoolId = id;
    if (!schoolId) throw new Error('no-school-id');
    return sbFetchTakenNumbers(token, schoolId);
  }).then(function (tk) {
    taken = tk;
    serverByLocal = {};
    taken.students.forEach(function (r) { if (r.local_id) serverByLocal[r.local_id] = r; });
    snap = sbSnapLoad(act.account.uid);
    // v34 (P1-12): heal the counters BEFORE minting, not after. When the
    // live counter sits far behind the highest used number, the old order
    // burned the 8-attempt mint cap just walking past taken numbers, so a
    // row could wait several cycles for a number. Healing first means the
    // first RPC call returns the first free number. A failed heal never
    // blocks minting (the loop still walks past taken numbers).
    var highestAdm = taken.maxAdm, highestRcp = taken.maxRcp;
    (d.students || []).forEach(function (s) {
      // v45: seed numbers are not the account's numbers — the demo
      // set's ADM-2025-001..040 must never lift the server counter.
      if (sbIsSeedRow('ss_students', s, d)) return;
      // A row the pull is about to drop (deleted elsewhere) does not
      // count as used — its number is free again.
      if (snap.ss_students && snap.ss_students[s.id] !== undefined && !serverByLocal[s.id]) return;
      highestAdm = Math.max(highestAdm, sbNumSeq(s.admissionNo));
    });
    (d.receipts || []).forEach(function (rc) {
      if (sbIsSeedStudentId(rc.studentId, d)) return; // v45: a seed receipt never lifts the counter
      if (rc.receiptNo && snap.ss_receipts && snap.ss_receipts[rc.receiptNo] !== undefined && !taken.rcp[rc.receiptNo]) return;
      highestRcp = Math.max(highestRcp, sbNumSeq(rc.receiptNo));
    });
    var patch = {};
    if (taken.admCounter <= highestAdm) patch.adm_counter = highestAdm + 1;
    if (taken.receiptCounter <= highestRcp) patch.receipt_counter = highestRcp + 1;
    var healP = Promise.resolve();
    if (Object.keys(patch).length) {
      healP = sbRest('PATCH', 'ss_schools?id=eq.' + encodeURIComponent(schoolId), token, patch, 'return=minimal').then(function (r) {
        if (r.ok) { if (patch.adm_counter) taken.admCounter = patch.adm_counter; if (patch.receipt_counter) taken.receiptCounter = patch.receipt_counter; }
      }).catch(function () {});
    }
    return healP.then(function () {
      var chain = Promise.resolve();
      (d.students || []).forEach(function (s) {
        chain = chain.then(function () {
          if (serverByLocal[s.id]) return; // already on the server: its numbers are the server's
          // v45: a demo-seed student never gets a server number. The
          // live flood's stu1 (ADM-2025-001) collides with the real V21
          // row — minting it a fresh number would upload it as a 41st
          // student instead of dropping it.
          if (sbIsSeedRow('ss_students', s, d)) return;
          // Deleted elsewhere (in the snapshot but absent on the server):
          // the pull drops this row — never spend a server number on it.
          if (snap.ss_students && snap.ss_students[s.id] !== undefined) return;
          var collides = (s.admissionNo && taken.adm[s.admissionNo] && taken.adm[s.admissionNo] !== s.id)
            || (s.enr && taken.enr[s.enr] && taken.enr[s.enr] !== s.id);
          if (!collides && !s.numPending && s.admissionNo) return;
          return sbMintAdmNo(token, schoolId, taken).then(function (nums) {
            s.admissionNo = nums.admissionNo;
            s.enr = nums.enr;
            if (s.numPending) { delete s.numPending; minted++; }
            else repaired++;
            changed = true;
            // Keep denormalised copies in step: fee records and receipts
            // carry the student's admission number.
            (d.feeRecords || []).forEach(function (r) { if (r.studentId === s.id && r.admissionNo) r.admissionNo = nums.admissionNo; });
            (d.receipts || []).forEach(function (rc) { if (rc.studentId === s.id && rc.admissionNo) rc.admissionNo = nums.admissionNo; });
            sbOutboxAdd(act.uid, { table: 'ss_students', key: s.id, op: 'upsert', row: JSON.parse(JSON.stringify(s)), at: new Date().toISOString() });
          });
        });
      });
      return chain;
    });
  }).then(function () {
    var chain2 = Promise.resolve();
    var maps = sbSyncBuildMaps(d, act.uid);
    // v41: the repair runs FIRST in the cycle — before the pull that
    // would save the id map — so the stored map is legitimately empty
    // on the first cycle after login (fresh device, cleared map). The
    // repair already fetched the server's students (taken.students,
    // with local_id), so resolve student ids from THAT fresh data;
    // the stored map only fills gaps. Without this, every receipt's
    // payload carried student_id null, the same-number comparison
    // always failed, and the repair minted a new server number for
    // every receipt on every cycle (live: 192 duplicate receipts, the
    // counter climbing 3 per render). Students were safe already —
    // their chain uses the fresh serverByLocal map, not the stored one.
    var stuFromServer = {};
    taken.students.forEach(function (r) { if (r.local_id) stuFromServer[r.local_id] = r.id; });
    Object.keys(stuFromServer).forEach(function (k) { maps.stu[k] = stuFromServer[k]; });
    var byId = {};
    (d.students || []).forEach(function (s) { byId[s.id] = s; });
    (d.receipts || []).forEach(function (rc) {
      chain2 = chain2.then(function () {
        // v45: a receipt for a demo-seed student is never minted or
        // re-linked — it is seed data, not a collection.
        if (sbIsSeedStudentId(rc.studentId, d)) return;
        // Deleted elsewhere (in the snapshot, no such number on the
        // server): the pull drops this receipt — never re-number it.
        if (rc.receiptNo && snap.ss_receipts && snap.ss_receipts[rc.receiptNo] !== undefined && !taken.rcp[rc.receiptNo]) return;
        var srv = rc.receiptNo ? (taken.rcp[rc.receiptNo] || null) : null;
        var collides = false;
        if (srv) {
          // Same number on the server: the same receipt only when the
          // content matches (student, total, date, month); otherwise
          // it is a collision with another device's receipt.
          var mapped = sbMapReceipt(rc, schoolId, maps.stu, byId);
          collides = !sbReceiptSameServer(srv, mapped);
        }
        if (!collides && !rc.numPending && rc.receiptNo) {
          // v42: the number may be on the server (srv) AND an EARLIER
          // number with the same content may also exist (a previous
          // cycle minted a duplicate for the same collection — live
          // v41: local receipts were 193/194/195 while the originals
          // 001/002/003 sat on the server, and the v41 adopt never
          // fired because it only ran when the number was NOT on the
          // server). Link to the earliest such number so the display
          // shows the original, not the latest duplicate. When srv is
          // null this is the v41 adopt; when srv exists it is the v42
          // re-link. No minting happens on this path, ever.
          var adoptNo = sbFindReceiptByContent(taken.receipts, rc, maps.stu, byId);
          if (adoptNo && adoptNo !== rc.receiptNo) {
            var oldNoA = rc.receiptNo;
            rc.receiptNo = adoptNo;
            changed = true;
            sbOutboxAdd(act.uid, { table: 'ss_receipts', key: adoptNo, op: 'upsert', row: JSON.parse(JSON.stringify(rc)), at: new Date().toISOString() });
            if (oldNoA) sbOutboxRemove(act.uid, { table: 'ss_receipts', key: oldNoA });
          }
          return;
        }
        if (!rc.numPending && rc.receiptNo) {
          // v41: same-number collision — the content may still exist
          // under another number; adopt it instead of minting a
          // duplicate.
          var adoptNo2 = sbFindReceiptByContent(taken.receipts, rc, maps.stu, byId);
          if (adoptNo2 && adoptNo2 !== rc.receiptNo) {
            var oldNoB = rc.receiptNo;
            rc.receiptNo = adoptNo2;
            changed = true;
            sbOutboxAdd(act.uid, { table: 'ss_receipts', key: adoptNo2, op: 'upsert', row: JSON.parse(JSON.stringify(rc)), at: new Date().toISOString() });
            if (oldNoB) sbOutboxRemove(act.uid, { table: 'ss_receipts', key: oldNoB });
            return;
          }
        }
        return sbMintReceiptNo(token, schoolId, taken.rcp).then(function (no) {
          var oldNo = rc.receiptNo;
          rc.receiptNo = no;
          if (rc.numPending) { delete rc.numPending; minted++; }
          else repaired++;
          changed = true;
          sbOutboxAdd(act.uid, { table: 'ss_receipts', key: no, op: 'upsert', row: JSON.parse(JSON.stringify(rc)), at: new Date().toISOString() });
          if (oldNo) sbOutboxRemove(act.uid, { table: 'ss_receipts', key: oldNo });
        });
      });
    });
    return chain2;
  }).then(function () {
    // v34 (P1-12): the counter heal moved BEFORE the mint chains above;
    // this step just reports the pass result.
    return { done: true, repaired: repaired, minted: minted };
  }).then(function (r) {
    if (changed) saveDB(d);
    return r;
  }).catch(function (err) {
    return { done: false, reason: 'error', detail: (err && err.message) || 'error', repaired: repaired, minted: minted };
  });
}
function sbSyncCycleRun(account, sbUid, token) {
  // v32: ONE serialized cycle — upload-missing first, then pull, then
  // flush. Never run the upload and the pull in parallel again: v31
  // login fired sbMaybeMigrate and sbSyncStart side by side, and a
  // laptop-first login left the phone's student stranded (the pull saw
  // the empty server school while the upload never ran). Upload first
  // guarantees local rows land on the server before the server-wins
  // pull can see them; the pull then brings them back into the mirror
  // and picks up other devices' changes; the flush pushes the outbox.
  var cycleT0 = Date.now(); // v53 diag: the cycle's wall-time + REST calls
  var cycleCalls0 = sbSyncRestCalls;
  var act = sbSyncActive();
  if (!act) return Promise.resolve({ done: false, reason: 'no-session' });
  account = account || act.account;
  sbUid = sbUid || act.uid;
  if (!sbIsOnline()) {
    var left = sbOutboxLoad(sbUid).length;
    sbSetStatus(left ? 'pending' : 'offline');
    return Promise.resolve({ done: false, reason: 'offline' });
  }
  var tokP = token ? Promise.resolve(token) : sbGetValidToken();
  return tokP.then(function (tok) {
    if (!tok) { sbSetStatus(sbSessionExpired ? 'session-expired' : 'offline'); return { done: false, reason: 'no-token' }; } // v34 (P1-3)
    // v33: repair FIRST — re-number colliding rows and mint numbers
    // for offline-saved rows — so the upload pass below never hits a
    // unique-constraint failure on a number another device already owns.
    return sbSyncRepairNumbers(account, sbUid, tok).then(function () {
      // v43: a cycle with nothing to upload runs QUIET — it must not
      // write 'syncing'. Live v42: the 30s tick plus focus/visibility
      // events started a new cycle (or queued a follow-up) every few
      // seconds, each writing 'syncing' at its start, so the 'synced'
      // the previous cycle had written was clobbered before any
      // observation could see it — the Settings line never showed
      // 'Backed up to the server.' in ~150s even though every cycle
      // completed (and one manual Back Up Now proved the backup
      // itself works). The decision comes AFTER the repair pass: a
      // repair can mint numbers / re-link receipts, which IS upload
      // work. The pull still runs in quiet mode — other devices'
      // changes must arrive — but the status line stays 'synced'
      // (re-confirmed at the end of the cycle) instead of flashing
      // 'Syncing…'. No mapped server school yet also counts as work:
      // the upload pass is about to create/link the school and push
      // the first rows.
      var hasWork43 = !((sbServerSchoolMap()[account.uid]) || null) || sbOutboxLoad(sbUid).length > 0;
      if (!hasWork43) { try { hasWork43 = sbSyncQueueDiff() > 0; } catch (e43) {} }
      if (hasWork43) sbSetStatus('syncing');
      return sbSyncUploadMissing(account, sbUid, tok);
    }).then(function (up) {
      if (!up.done) {
        // v34 (P1-1): the upload failed — the local rows are not on the
        // server yet. Skipping the pull keeps them safe (the v33 merge
        // keeps students, but fee structure is replaced wholesale and
        // attendance is rebuilt from server rows + kept-student cells
        // only, so an offline mark for an already-synced student would
        // still be wiped by a pull). Flush the outbox so queued work is
        // not stuck behind the failed upload.
        return sbSyncFlushWithToken(act, tok).then(function () { return { done: false, reason: 'upload-failed', detail: up.detail || up.reason || '' }; });
      }
      return sbSyncPullRun(account, sbUid, tok, null);
    }).then(function (pull) {
      if (pull.reason === 'needs-migration') {
        // The guard still hit (the upload pass could not land a row):
        // run the legacy full migration once, then pull the (now
        // populated) server state.
        return sbMaybeMigrate(account, sbUid, tok, true).then(function () {
          return sbSyncPullRun(account, sbUid, tok, null);
        });
      }
      return pull;
    }).then(function (pull) {
      if (!pull.done) {
        // A failed pull leaves the local mirror untouched; still flush
        // the outbox so offline work is not stuck behind a read error.
        if (pull.reason === 'no-server-school') return pull;
        if (pull.reason === 'upload-failed') return pull; // v34 (P1-1): already flushed above
        return sbSyncFlushWithToken(act, tok).then(function () { return pull; });
      }
      return sbSyncFlushWithToken(act, tok).then(function (fl) {
        // B10: the pull after a push does not need the flush to be fully
        // done — done now means "outbox empty", which a partial flush
        // never is. Pushes alone warrant a pull.
        if (fl.pushed) return sbSyncPullRun(account, sbUid, tok, null);
        return pull;
      });
    });
  }).catch(function (err) {
    sbSetStatus('failed', (err && err.message) || 'error');
    return { done: false, reason: 'error', detail: (err && err.message) || 'error' };
  }).then(function (r) {
    if (!r) return r;
    if (r.done) {
      // The flush already set pending/synced; only confirm synced when
      // the outbox really is empty (a pull that succeeded while entries
      // are still queued must not claim to be synced).
      if (!sbOutboxLoad(sbUid).length) sbSetStatus('synced');
    } else if (r.reason === 'no-server-school' || r.reason === 'upload-failed') {
      // The only failure paths where the flush never ran (or the upload
      // itself failed): do not leave the status stuck on 'syncing'.
      // Other failures already had their status set by the flush
      // (failed / pending / offline).
      sbSetStatus('failed', r.detail || '');
    }
    // v34 (P1-7/P1-8): retry queued support requests and admission
    // applications once a cycle has run (they are fire-and-forget).
    if (r.done || r.reason === 'upload-failed') {
      try { sbFlushSupportQueue().catch(function () {}); } catch (e) {}
      try { sbFlushAdmReqQueue().catch(function () {}); } catch (e) {}
    }
    // v53 diag: the cycle's real cost, read by Settings "Sync details".
    // sbLoadStatus() is read here (not sbSetStatus's node update) so
    // the record survives a logout and the next verifier can read it.
    sbSyncDiagSet({ lastCycle: { at: new Date().toISOString(), ms: Date.now() - cycleT0, result: r.done ? 'synced' : ('failed: ' + (r.reason || r.detail || 'error')), detail: r.detail || '', outbox: sbOutboxLoad(sbUid).length, calls: sbSyncRestCalls - cycleCalls0 } });
    sbSyncDetailsRefresh();
    return r;
  });
}
var sbSyncCyclePending = null; // the single queued follow-up cycle, if any
function sbSyncCycle(account, sbUid, token) {
  // One cycle at a time, at most one queued follow-up: rapid triggers
  // (focus + interval + online at once) coalesce instead of stacking
  // overlapping runs. Callers that arrive while a run is in flight join
  // the queued follow-up instead of starting their own.
  if (sbSyncPromise) {
    if (!sbSyncCyclePending) {
      sbSyncCyclePending = sbSyncPromise.then(function () {
        sbSyncCyclePending = null;
        return sbSyncCycle(account, sbUid, token);
      }, function () {
        sbSyncCyclePending = null;
        return sbSyncCycle(account, sbUid, token);
      });
    }
    return sbSyncCyclePending;
  }
  return sbSyncWithLock(function () { return sbSyncCycleRun(account, sbUid, token); });
}
function sbSyncStart(account, sbUid, token) {
  // v31 name, kept for the Settings buttons and older call sites.
  return sbSyncCycle(account, sbUid, token);
}

// Public Apply form -> server (anon). MUST use return=minimal: anon has no
// SELECT on ss_admission_requests, so asking for the row back fails with
// 401 even though the insert itself succeeds (verified 9 Nov 2026).
// v34 (P1-8): admission applications are retried, not fire-and-forget.
// A failed or offline anon post is queued in localStorage and re-posted
// on the next cycle / when the device comes back online. An application
// leaves the queue only after the server confirms it.
var SB_ADMREQ_PENDING_KEY = 'schoolSaathiAdmReqPending';
function sbAdmReqPendingLoad() {
  try { var r = localStorage.getItem(SB_ADMREQ_PENDING_KEY); var a = r ? JSON.parse(r) : []; return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
function sbAdmReqPendingSave(list) { try { localStorage.setItem(SB_ADMREQ_PENDING_KEY, JSON.stringify(list)); } catch (e) {} }
function sbAdmReqQueue(schoolId, req) {
  var list = sbAdmReqPendingLoad();
  if (!list.some(function (x) { return x.req && x.req.id === req.id; })) { list.push({ schoolId: schoolId, req: req }); sbAdmReqPendingSave(list); }
}
function sbFlushAdmReqQueue() {
  var list = sbAdmReqPendingLoad();
  if (!list.length || !sbIsOnline()) return Promise.resolve(0);
  var sent = 0;
  var chain = Promise.resolve();
  list.slice().forEach(function (item) {
    chain = chain.then(function () {
      return sbPostAdmission(item.schoolId, item.req).then(function (r) {
        if (r && r.ok) {
          sent++;
          sbAdmReqPendingSave(sbAdmReqPendingLoad().filter(function (x) { return !(x.req && x.req.id === item.req.id); }));
        }
      }).catch(function () {});
    });
  });
  return chain.then(function () { return sent; });
}
function sbPostAdmission(serverSchoolId, req) {
  var body = { school_id: serverSchoolId, local_id: req.id, name: req.name, dob: sbNullIfEmpty(req.dob),
    gender: req.gender || '', class_apply: req.classApply, guardian_name: req.guardianName || '',
    phone: req.phone, previous_school: req.previousSchool || '', status: 'Pending', reason: '',
    submitted: req.submitted || todayIST() };
  return sbRest('POST', 'ss_admission_requests', SB_ANON_KEY, body, 'return=minimal');
}
// v30: support request -> server (authenticated, best-effort). The local
// save already happened before this is called, so a failure here (offline,
// no session, no server school yet) never blocks the confirmation and
// never shows a scary error — the request simply stays local until the
// next successful login/backup. return=minimal so a missing SELECT on the
// table can never fail the insert (same lesson as the anon Apply form).
// v34 (P1-7): support requests are retried, not fire-and-forget. A
// request that cannot reach the server is queued in localStorage and
// re-posted on the next sync cycle (or when the device comes back
// online). A request leaves the queue only after the server confirms it.
var SB_SUPPORT_PENDING_KEY = 'schoolSaathiSupportPending';
function sbSupportPendingLoad() {
  try { var r = localStorage.getItem(SB_SUPPORT_PENDING_KEY); var a = r ? JSON.parse(r) : []; return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
function sbSupportPendingSave(list) { try { localStorage.setItem(SB_SUPPORT_PENDING_KEY, JSON.stringify(list)); } catch (e) {} }
function sbSupportQueue(req) {
  var list = sbSupportPendingLoad();
  if (!list.some(function (x) { return x.id === req.id; })) { list.push(req); sbSupportPendingSave(list); }
}
function sbFlushSupportQueue() {
  var list = sbSupportPendingLoad();
  if (!list.length) return Promise.resolve(0);
  if (!state.user || state.user.role !== 'school' || !state.sb || !state.sb.uid || !sbIsOnline()) return Promise.resolve(0);
  var sent = 0;
  var chain = Promise.resolve();
  list.slice().forEach(function (req) {
    chain = chain.then(function () {
      return sbPostSupportRequest(req).then(function (ok) {
        if (!ok) return;
        sent++;
        sbSupportPendingSave(sbSupportPendingLoad().filter(function (x) { return x.id !== req.id; }));
      });
    });
  });
  return chain.then(function () { return sent; });
}
function sbPostSupportRequest(req) {
  // Returns a promise of true when the request reached the server.
  // A failure (offline, no session, no school row yet) resolves false —
  // the caller queues it for the next cycle instead of dropping it.
  if (!state.user || state.user.role !== 'school' || !state.sb || !state.sb.uid) return Promise.resolve(false);
  return sbGetValidToken().then(function (tok) {
    if (!tok) return false;
    var post = function (schoolId) {
      if (!schoolId) return Promise.resolve(false);
      return sbRest('POST', 'ss_support_requests', tok, { school_id: schoolId, local_id: req.id, name: req.name, message: req.message, status: 'Pending' }, 'return=minimal').then(function (r) { return !!r.ok; }).catch(function () { return false; });
    };
    var sid = sbServerSchoolMap()[state.user.uid];
    if (sid) return post(sid);
    return sbGetServerSchoolId(state.sb.uid, tok).then(function (row) {
      if (row && row.id) { sbSaveServerSchool(state.user.uid, row.id); return post(row.id); }
      return false;
    }).catch(function () { return false; });
  }).catch(function () { return false; });
}



/* ================= seed data ================= */
// Seed platform schools. INVARIANT (v30 — the v26 count mismatch): the
// account status and the plan must tell the same story, or every count
// derived from them disagrees. Allowed pairs only:
//   status 'active'  <-> plan 'Active' or 'Trial'   (account is live)
//   status 'pending' <-> plan 'Pending'             (awaiting approval)
//   status 'expired' <-> plan 'Expired'             (subscription lapsed)
// So: active-status == Active-plan + Trial-plan; expired == Expired;
// pending == Pending. The harness asserts this agreement.
var SCHOOL_NAMES = [
  ['St. Xavier School','Patna',1250,'active','Active'], ['DAV Public School','Gaya',1100,'active','Active'],
  ['Bright Future School','Muzaffarpur',980,'active','Active'], ['Holy Child School','Bhagalpur',860,'active','Active'],
  ['Sunrise Academy','Darbhanga',750,'active','Active'], ['Saraswati Vidya Mandir','Gopalganj',620,'active','Active'],
  ['Gyanlok Public School','Baliwan Sagar',500,'active','Trial'], ['St. Joseph\'s School','Siwan',940,'active','Active'],
  ['Delhi Public School','Patna',1480,'active','Active'], ['Notre Dame Academy','Patna',1120,'active','Active'],
  ['Kendriya Vidyalaya','Chhapra',890,'expired','Expired'], ['Bal Vidyapeeth','Hajipur',430,'active','Trial'],
  ['St. Mary\'s School','Motihari',760,'active','Active'], ['Rose Public School','Bettiah',540,'active','Active'],
  ['Modern Public School','Samastipur',690,'active','Active'], ['Vidya Niketan','Ara',610,'active','Active'],
  ['Little Scholars Public School','Siwan',380,'pending','Pending'], ['Gyan Jyoti Vidyalaya','Chhapra',290,'pending','Pending'],
  ['Carmel High School','Patna',1050,'active','Active'], ['Don Bosco Academy','Patna',980,'active','Active'],
  ['St. Karen\'s School','Patna',870,'expired','Expired'], ['Radiant Public School','Gopalganj',450,'active','Active'],
  ['Oxford Public School','Muzaffarpur',720,'expired','Expired'], ['Mount Carmel School','Gaya',660,'expired','Expired']
];
var FIRST = ['Aarav','Vivaan','Aditya','Arjun','Sai','Reyansh','Krishna','Ishaan','Rohan','Kabir','Ananya','Diya','Aadhya','Myra','Sara','Ira','Priya','Riya','Anika','Navya','Aarush','Vihaan','Aryan','Dhruv','Meera','Kavya','Sneha','Pooja','Nikhil','Varun','Rahul','Sana','Ishita','Tanvi','Yash','Om','Dev','Rudra','Aisha','Zara','Farhan','Imran','Nisha','Kiran','Manav','Shreya'];
var LAST = ['Kumar','Singh','Sharma','Verma','Gupta','Mishra','Tiwari','Yadav','Jha','Pandey','Choudhary','Ranjan','Srivastava','Dubey','Sinha','Patel','Das','Roy','Kumari','Devi'];
var GIRL_NAMES = ['Ananya', 'Diya', 'Aadhya', 'Myra', 'Sara', 'Ira', 'Priya', 'Riya', 'Anika', 'Navya', 'Meera', 'Kavya', 'Sneha', 'Pooja', 'Sana', 'Ishita', 'Tanvi', 'Aisha', 'Zara', 'Nisha', 'Shreya'];
var CLASSES = ['Nursery-A','Nursery-B','LKG-A','LKG-B','UKG-A','UKG-B','1st-A','1st-B','2nd-A','2nd-B','3rd-A','3rd-B','4th-A','4th-B','5th-A','5th-B','6th-A','6th-B','7th-A','7th-B','8th-A','8th-B','9th-A','9th-B','10th-A','10th-B','11th-A','11th-B','12th-A','12th-B'];
// v37: the demo seed still covers only the original 6th–10th classes
// (40 students) — the fixture's counts, fee splits and harness
// assumptions stay exact. New classes get real students through
// admission, never through the seed.
var SEED_CLASSES = ['6th-A','6th-B','7th-A','7th-B','8th-A','8th-B','9th-A','9th-B','10th-A','10th-B'];
var FEE_TYPES = ['Tuition', 'Admission', 'Transport', 'Exam', 'Library', 'Activity', 'Computer Lab', 'Other'];
var MONTHS_ACAD = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
var MONTH_NUM = { Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12, Jan: 1, Feb: 2, Mar: 3 };
var FEE_TYPE_KEYS = { 'Tuition': 'feeTypeTuition', 'Admission': 'feeTypeAdmission', 'Transport': 'feeTypeTransport', 'Exam': 'feeTypeExam', 'Library': 'feeTypeLibrary', 'Activity': 'feeTypeActivity', 'Computer Lab': 'feeTypeComputer', 'Other': 'feeTypeOther' };
function defaultFeeStructure() {
  // Monthly tuition by class part. 6th–10th amounts are unchanged from
  // before v37 (800/900/1000/1200/1500); the new classes get sensible
  // defaults the admin can edit in the Fee Structure editor.
  var amt = { 'Nursery': 500, 'LKG': 500, 'UKG': 600, '1st': 600, '2nd': 650, '3rd': 700, '4th': 750, '5th': 800, '6th': 800, '7th': 900, '8th': 1000, '9th': 1200, '10th': 1500, '11th': 1800, '12th': 2000 };
  return CLASSES.map(function (c) { return { cls: c, type: 'Tuition', amount: amt[classPartOf(c)] || 1000 }; });
}
function monthStartDate(m) { // B7: 1st of the month, in the profile session's academic year
  // (Apr–Dec = session start year, Jan–Mar = start year + 1). Was hardcoded
  // 2026/2027 although the profile session is 2025–26 — fee dates landed
  // in the NEXT academic year. admYear() is the existing session-year
  // helper (profile session, '2025' fallback).
  var n = MONTH_NUM[m] || 4, y0 = parseInt(admYear(), 10), y = n >= 4 ? y0 : y0 + 1;
  return y + '-' + String(n).padStart(2, '0') + '-01';
}
var SUBJECTS = ['Mathematics','Science','English','Hindi','Social Science'];

function seedDB() {
  var schools = SCHOOL_NAMES.map(function (s, i) {
    return { id: 'sch' + (i + 1), name: s[0], city: s[1], students: s[2], status: s[3], plan: s[4],
      users: 180 + ((i * 137) % 900), since: '202' + (i % 5) + '-0' + ((i % 9) + 1) + '-15' };
  });
  // 40 students, 4 per class-section; first two are Riya & Priya (10th-A).
  // v37: the seed covers SEED_CLASSES only (6th–10th) — see CLASSES.
  var students = [];
  var fi = 0;
  SEED_CLASSES.forEach(function (cls, ci) {
    for (var r = 1; r <= 4; r++) {
      var idx = ci * 4 + (r - 1);
      var name;
      if (cls === '10th-A' && r === 1) name = 'Riya Kumari';
      else if (cls === '10th-A' && r === 2) name = 'Priya Kumari';
      else { name = FIRST[fi % FIRST.length] + ' ' + LAST[(fi * 7 + 3) % LAST.length]; fi++; }
      var feePending = (idx % 6 === 4); // ~7 of 40 pending
      var rec = { id: 'stu' + (idx + 1), name: name, cls: cls, roll: r, enr: 'ENR-' + String(idx + 1).padStart(3, '0'),
        guardian: 'Mr. ' + LAST[(idx * 5 + 1) % LAST.length],
        phone: '98' + String(10000000 + ((idx * 7919) % 89999999)),
        att: 85 + ((idx * 7) % 14), result: 62 + ((idx * 11) % 36),
        fee: feePending ? 'Pending' : 'Paid',
        status: 'Active', session: '2025–26', admissionNo: 'ADM-2025-' + String(idx + 1).padStart(3, '0'), admissionDate: '',
        dob: '', gender: GIRL_NAMES.indexOf(name.split(' ')[0]) !== -1 ? 'Girl' : 'Boy', bloodGroup: '', category: '',
        address: '', state: '', district: '', pin: '',
        fatherName: 'Mr. ' + LAST[(idx * 5 + 1) % LAST.length], motherName: 'Mrs. ' + LAST[(idx * 5 + 1) % LAST.length],
        mobile2: '', parentEmail: '', occupation: '', previousSchool: '', previousClass: '',
        documents: { birthCert: idx % 4 !== 3, tc: idx % 2 === 0, tcNumber: idx % 2 === 0 ? 'TC-' + (1000 + idx) : '', other: '' }, aadhaar: '' };
      if (cls === '10th-A' && r === 1) { rec.att = 92; rec.result = 95; rec.fee = 'Paid'; }
      if (cls === '10th-A' && r === 2) { rec.att = 94; rec.result = 91; rec.fee = 'Paid'; }
      students.push(rec);
    }
  });
  var teachers = [
    ['Sunita Sharma','Mathematics','10th-A'], ['Rajesh Kumar','Science','10th-B'], ['Anita Verma','English','9th-A'],
    ['Vikram Singh','Hindi','8th-A'], ['Pooja Mishra','Social Science','9th-B'], ['Amit Jha','Mathematics','8th-B'],
    ['Neha Gupta','Science','7th-A'], ['Suresh Yadav','English','6th-A'], ['Kavita Tiwari','Hindi','7th-B'],
    ['Manoj Pandey','Mathematics','9th-B'], ['Rekha Sinha','Science','6th-B'], ['Deepak Choudhary','English','10th-A']
  ].map(function (t, i) { return { id: 't' + (i + 1), name: t[0], subject: t[1], cls: t[2] }; });
  // Fee records: split each month's totals into exact records (deterministic, sums exact)
  var feeRecords = [], fid = 1;
  FEE_MONTHS.forEach(function (mo, mi) {
    function split(total, n, status) {
      var base = Math.floor(total / n), rem = total - base * (n - 1);
      for (var k = 0; k < n; k++) {
        var amt = (k === n - 1) ? rem : base;
        var idx = status === 'Pending' ? (mi * 4 + k) : (mi * 9 + k * 3); // pending: 20 distinct students
        var st = students[idx % students.length];
        feeRecords.push({ id: 'fee' + (fid++), studentId: st.id, student: st.name, cls: st.cls,
          month: mo.m, type: 'Tuition', amount: amt, status: status, date: '2026-0' + (mi + 4) + '-' + String(3 + ((k * 5) % 24)).padStart(2, '0') });
      }
    }
    split(mo.collected, 10, 'Collected');
    split(mo.pending, 4, 'Pending');
  });
  // Riya Kumari (demo student) gets one Collected record so her "Paid" status is evidence-based (totals unchanged).
  var riyaStu = students.find(function (s) { return s.name === 'Riya Kumari'; });
  if (riyaStu) {
    var donorRec = feeRecords.find(function (r) { return r.month === 'Apr' && r.status === 'Collected' && r.studentId === students[27].id; });
    if (donorRec) { donorRec.studentId = riyaStu.id; donorRec.student = riyaStu.name; donorRec.cls = riyaStu.cls; }
  }
  var today = todayIST();
  var attRecords = {};
  students.filter(function (s) { return s.cls === '10th-A'; }).forEach(function (s, i) {
    attRecords[s.id] = (i === 2) ? 'Absent' : (i === 3) ? 'Late' : 'Present';
  });
  return {
    v: 2,
    schools: schools,
    students: students,
    teachers: teachers,
    feeMonths: FEE_MONTHS,
    feeRecords: feeRecords,
    feeStructure: defaultFeeStructure(),
    feeExtras: { admissionFee: 0, cautionMoney: 0, annualCharges: 0, transportFee: 0 },
    admCounter: 41,
    receipts: [],
    receiptCounter: 1,
    auditLog: [],
    attendanceAgg: { present: 0, absent: 0, late: 0 },
    attendance: (function () { var a = {}; a[today + '|10th-A'] = attRecords; return a; })(),
    exams: [
      { id: 'ex1', name: 'Unit Test 1', cls: '10th-A', subject: 'Mathematics', date: '2026-08-12', total: 100 },
      { id: 'ex2', name: 'Unit Test 2', cls: '10th-A', subject: 'Science', date: '2026-09-18', total: 100 },
      { id: 'ex3', name: 'Half Yearly Exam', cls: '10th-A', subject: 'All Subjects', date: '2026-10-06', total: 100 },
      { id: 'ex4', name: 'Unit Test 1', cls: '9th-A', subject: 'Mathematics', date: '2026-08-14', total: 100 },
      { id: 'ex5', name: 'Monthly Test', cls: '8th-B', subject: 'English', date: '2026-10-20', total: 50 }
    ],
    marks: [
      { examId: 'ex1', studentId: 'stu33', marks: 95 }, { examId: 'ex1', studentId: 'stu34', marks: 91 },
      { examId: 'ex1', studentId: 'stu35', marks: 78 }, { examId: 'ex1', studentId: 'stu36', marks: 84 },
      { examId: 'ex2', studentId: 'stu33', marks: 93 }, { examId: 'ex2', studentId: 'stu34', marks: 88 },
      { examId: 'ex3', studentId: 'stu33', marks: 95 }, { examId: 'ex3', studentId: 'stu34', marks: 90 }
    ],
    homework: [
      { id: 'hw1', cls: '10th-A', subject: 'Mathematics', title: 'Ex 5.2 — Q1 to Q10', due: '2026-11-10', doneBy: ['stu34'] },
      { id: 'hw2', cls: '10th-A', subject: 'Science', title: 'Light chapter notes + diagram', due: '2026-11-11', doneBy: [] },
      { id: 'hw3', cls: '9th-A', subject: 'English', title: 'Essay — My Favourite Festival', due: '2026-11-12', doneBy: ['stu33'] },
      { id: 'hw4', cls: '8th-B', subject: 'Hindi', title: 'Nibandh — Swachh Bharat', due: '2026-11-13', doneBy: [] }
    ],
    notices: [
      { id: 'n1', title: 'Annual Sports Day', date: '2026-11-07', body: 'Annual Sports Day will be held on 20 November 2026 at the school ground. All students must report in sports uniform by 8:00 AM.' },
      { id: 'n2', title: 'Parent-Teacher Meeting', date: '2026-11-05', body: 'PTM for Classes 6–10 will be held on Saturday, 15 November 2026, 10:00 AM – 1:00 PM. Parents are requested to attend.' },
      { id: 'n3', title: 'Diwali Holidays', date: '2026-10-28', body: 'School will remain closed from 30 October to 2 November 2026 for Diwali. Classes resume on 3 November 2026.' }
    ],
    activities: [
      { icon: '💰', bg: 'green', title: 'New fee payment received', sub: 'by Priya Kumari' },
      { icon: '✅', bg: 'blue', title: 'Attendance updated', sub: 'Class 10th-A' },
      { icon: '📢', bg: 'orange', title: 'New notice published', sub: 'Annual Sports Day' }
    ],
    profile: { name: 'St. Xavier School', city: 'Patna', principal: 'Rahul Kumar', phone: '+91 98350 12345', email: 'info@stxavierpatna.edu.in', session: '2025–26', address: 'Boring Road, Patna, Bihar — 800001' }
  };
}

/* ================= empty school DB (v20) =================
   What a brand-new school gets, and what Reset All Data leaves
   behind: NOTHING but the school's identity and its fee-structure
   settings. No demo students, teachers, fees, attendance, exams,
   marks, homework, notices, receipts or audit entries. The seed
   function above stays in the code for TESTS ONLY (harness fixtures).
   In v36 no real account path may call it to populate a school, and
   the boot path no longer seeds it either — a fresh device starts
   empty (audit item 17). */
function emptyDb(profile, schools) {
  var p = profile || { name: '', city: '', principal: '', phone: '', email: '', session: '2025–26', address: '' };
  return {
    v: 2,
    schools: schools || [],
    students: [],
    teachers: [],
    feeMonths: FEE_MONTHS,
    feeRecords: [],
    feeStructure: defaultFeeStructure(),
    feeExtras: defaultFeeExtras(),
    admCounter: 1,
    receipts: [],
    receiptCounter: 1,
    auditLog: [],
    attendanceAgg: { present: 0, absent: 0, late: 0 },
    attendance: {},
    admissionRequests: [],
    exams: [],
    marks: [],
    homework: [],
    notices: [],
    activities: [],
    profile: p,
    feeClsAlignedV9: true
  };
}

/* ================= DB helpers ================= */
function migrateAttendance(d) {
  // Old shape: { date, cls, records } (single day). New: keyed by 'YYYY-MM-DD|Class'.
  if (d.attendance && d.attendance.date) {
    var key = d.attendance.date + '|' + (d.attendance.cls || '10th-A');
    var att = {}; att[key] = d.attendance.records || {};
    d.attendance = att;
  }
  if (!d.attendance || typeof d.attendance !== 'object') d.attendance = {};
  return d;
}
function migrateFeesV7(d) {
  // Fees v2 -> v7 migration for existing DBs (e.g. the user's phone): ENR numbers
  // in seed order, 'Tuition' on old fee records, default fee structure if missing.
  // Idempotent; never changes amounts or statuses.
  (d.students || []).forEach(function (s, i) {
    if (!s.enr) s.enr = 'ENR-' + String(i + 1).padStart(3, '0');
  });
  (d.feeRecords || []).forEach(function (r) { if (!r.type) r.type = 'Tuition'; });
  if (!Array.isArray(d.feeStructure) || !d.feeStructure.length) d.feeStructure = defaultFeeStructure();
  return d;
}
function migrateStudentsV9(d) {
  // Phase 1 (Student Management) migration for existing v2 DBs: admission numbers,
  // status, session, documents checklist, audit log. Idempotent; never changes
  // existing values, amounts or statuses. Admission dates are NOT fabricated —
  // old records keep admissionDate blank until edited.
  var maxAdm = 0;
  (d.students || []).forEach(function (s) {
    var m = /^ADM-(\d{4})-(\d+)$/.exec(s.admissionNo || '');
    if (m) maxAdm = Math.max(maxAdm, parseInt(m[2], 10));
  });
  var next = Math.max(maxAdm + 1, d.admCounter || 1);
  var year = ((d.profile && d.profile.session ? String(d.profile.session).match(/\d{4}/) : null) || ['2025'])[0];
  (d.students || []).forEach(function (s) {
    if (!s.admissionNo) { s.admissionNo = 'ADM-' + year + '-' + String(next).padStart(3, '0'); next++; }
    if (!s.status) s.status = 'Active';
    if (!s.session) s.session = (d.profile && d.profile.session) || '2025–26';
    if (!s.documents) s.documents = { birthCert: false, tc: false, tcNumber: '', other: '' };
    if (s.documents.birthCert == null) s.documents.birthCert = false;
    if (s.documents.tc == null) s.documents.tc = false;
  });
  // One-time repair (v9): align feeRecord.cls to the owning student's cls. All
  // current records are seed records, so this fixes the Riya 9th-A/10th-A
  // mismatch on existing DBs (incl. the user's phone). Guarded by a flag so
  // later class transfers keep OLD fee records under their historical cls —
  // the migration runs on every load, so an unconditional align would undo that.
  if (!d.feeClsAlignedV9) {
    (d.feeRecords || []).forEach(function (r) {
      var own = (d.students || []).find(function (s) { return s.id === r.studentId; });
      if (own && r.cls !== own.cls) r.cls = own.cls;
    });
    d.feeClsAlignedV9 = true;
  }
  d.admCounter = next;
  if (!Array.isArray(d.auditLog)) d.auditLog = [];
  return d;
}

/* ================= Phase 4: parent portal + admission requests =================
   Static scope: no server. A parent logs in with Admission No. + PIN on the
   device where the school's data lives; the PIN is the last 4 digits of the
   primary mobile unless the school set a custom one. Real password accounts
   arrive with the server phase. (v35: the parent portal is gone — student
   login replaced it. The PIN now belongs to the STUDENT login.) */
function parentPinFromPhone(phone) { var d = digitsOnly(phone); return d.length >= 4 ? d.slice(-4) : ''; } // v36: LEGACY only — migrateV12 below fills it for records that predate the PIN feature, so existing students keep logging in. No NEW student ever gets a phone-derived PIN (saveStudent / import generate a random one).
function migrateV12(d) {
  // Phase 4 migration for existing v2 DBs: parent PINs + admission requests.
  // Idempotent; never changes existing values, amounts or statuses.
  (d.students || []).forEach(function (s) {
    if ((s.parentPin === undefined || s.parentPin === null) && !s.parentPinHash) s.parentPin = parentPinFromPhone(s.phone); // v54 (A1): never re-fill a plaintext PIN once the student already carries a hash — otherwise every load would re-hash with a fresh salt and the sync payload would churn on every login. v55: a null (left by an older pull that materialized the server's null — the live V21/2108 loss) is the same as "no PIN set yet" and refills from the phone, exactly like undefined. '' stays cleared: the admin deliberately removed the PIN.
  });
  if (!Array.isArray(d.admissionRequests)) d.admissionRequests = [];
  return d;
}
function migrateV54(d) {
  // v54 (A1): hash every plaintext student PIN once, then drop the
  // plaintext field. Idempotent — a second run finds no plaintext left
  // (a stored hash is never re-hashed). A student with no PIN at all
  // keeps none: login stays unavailable until the admin sets one.
  // Only a NON-EMPTY plaintext PIN is deleted: an empty '' is the v36
  // cleared-PIN sentinel, and deleting it would let migrateV12 re-derive
  // the PIN from the phone on the next load (a cleared PIN would come back).
  (d.students || []).forEach(function (s) {
    if (typeof s.parentPin === 'string' && s.parentPin && !s.parentPinHash) s.parentPinHash = hashPin(s.parentPin);
    if (s.parentPin) delete s.parentPin;
  });
  return d;
}
function migrateV55(d) {
  // v55: one-time repair for the records v54 (and earlier pulls) stripped —
  // no hash, parentPin null/undefined, phone present. Re-derive the legacy
  // phone-derived PIN so the student can log in again; migrateV54 (the
  // outer step) hashes it on the same pass. Idempotent: once a hash
  // exists the record is untouched. '' is NOT repaired — it is the
  // cleared-PIN sentinel and must stay cleared. (migrateV12 above now
  // refills nulls too, so the repair also holds as a permanent guard;
  // the two steps overlap deliberately — the repair names the incident,
  // the guard keeps it from recurring.)
  (d.students || []).forEach(function (s) {
    if (!s.parentPinHash && (s.parentPin === undefined || s.parentPin === null)) {
      var pin = parentPinFromPhone(s.phone);
      if (pin) s.parentPin = pin;
    }
  });
  return d;
}
function migrateV16(d) {
  // v36: strip any stored full Aadhaar down to its last 4 digits.
  // Idempotent — a second run finds nothing over 4 digits. The audit
  // entry records the COUNT, never the numbers.
  var n = 0;
  (d.students || []).forEach(function (s) {
    var dd = digitsOnly(s.aadhaar);
    if (dd.length > 4) { s.aadhaar = dd.slice(-4); n++; }
  });
  if (n) {
    if (!Array.isArray(d.auditLog)) d.auditLog = [];
    d.auditLog.unshift({ ts: new Date().toISOString(), actor: 'system', action: 'Aadhaar cleanup', details: n + ' student Aadhaar numbers reduced to last 4 digits (v36)' });
  }
  return d;
}
function migrateV15(d) {
  // v35: teacher class assignments. Older teacher rows carry a single
  // cls — the assignment list starts from it. Idempotent; never changes
  // existing values.
  (d.teachers || []).forEach(function (te) {
    if (!Array.isArray(te.classes)) te.classes = te.cls ? [te.cls] : [];
    if (!te.cls && te.classes.length) te.cls = te.classes[0];
  });
  return d;
}
function defaultFeeExtras() { return { admissionFee: 0, cautionMoney: 0, annualCharges: 0, transportFee: 0 }; }
function migrateV13(d) {
  // Phase 5 (fee collection receipt) migration for existing v2 DBs: one-time /
  // annual fee amounts, saved receipts, receipt counter. Idempotent; never
  // changes existing values, amounts or statuses. All extra amounts default
  // to 0 — the school sets its own amounts, nothing is invented.
  if (!d.feeExtras || typeof d.feeExtras !== 'object') d.feeExtras = defaultFeeExtras();
  ['admissionFee', 'cautionMoney', 'annualCharges', 'transportFee'].forEach(function (k) {
    if (typeof d.feeExtras[k] !== 'number' || isNaN(d.feeExtras[k]) || d.feeExtras[k] < 0) d.feeExtras[k] = 0;
  });
  if (!Array.isArray(d.receipts)) d.receipts = [];
  if (!d.receiptCounter) {
    var max = 0;
    d.receipts.forEach(function (r) { var m = /^RCP-\d{4}-(\d+)$/.exec(r.receiptNo || ''); if (m) max = Math.max(max, parseInt(m[1], 10)); });
    d.receiptCounter = max + 1;
  }
  return d;
}
function readDbByKey(key) {
  try { var raw = localStorage.getItem(key); if (!raw) return null; var d = JSON.parse(raw); return (d && d.v === 2) ? d : null; }
  catch (e) { return null; }
}
function writeDbByKey(key, d) { try { localStorage.setItem(key, JSON.stringify(d)); } catch (e) {} }
function loadDB(override) {
  try {
    var raw = localStorage.getItem(DB_KEY);
    if (raw) {
      var d = JSON.parse(raw);
      if (d && d.v === 2) { var m = migrateV54(migrateV55(migrateV16(migrateV15(migrateV13(migrateV12(migrateStudentsV9(migrateFeesV7(migrateAttendance(d))))))))); saveDB(m); return m; }
      // Unknown version: keep a backup, never wipe silently.
      try { localStorage.setItem(DB_KEY + '.bak', raw); } catch (e2) { /* ignore */ }
    }
  } catch (e) { /* storage unavailable — fall back to memory */ }
  // v36: a fresh device starts EMPTY — the demo DB no longer seeds on
  // boot (audit item 17). The seed function stays in the code for TESTS
  // ONLY (harness fixtures); no account path may call it to populate a
  // school, and no UI reaches the boot DB anymore (every account opens
  // its own DB key). Existing stored DBs are untouched — only devices
  // that never stored anything get the empty start.
  var fresh = emptyDb();
  if (override) applySchoolProfile(fresh, override);
  saveDB(fresh);
  return fresh;
}
var MEM_FALLBACK = null;
function saveDB(db) {
  try { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
  catch (e) { MEM_FALLBACK = db; }
  MEM_FALLBACK = db;
  sbSyncOnSave(); // v31: server-first — queue + push local changes (no-op for local-only accounts)
}
var db = loadDB();

/* ================= state ================= */
var state = { role: null, user: null, view: 'dashboard', lang: 'en', admReqFilter: 'All', feeFilter: 'All', feeType: 'All', feeSearch: '', feeStudent: null, feeGenMonth: 'Sep', feeFormOpen: false, feePreselect: null, stuSearch: '', stuClass: 'All', stuSection: 'All', stuSession: 'All', stuGender: 'All', stuFee: 'All', stuStatus: 'All', stuPage: 1, stuSort: 'name', stuSortDir: 1, profileStudent: null, profileTab: 'overview', attCls: '10th-A', attDate: '', examId: 'ex1', stuSel: {}, collectStudent: null, collectRecordId: null, savedReceiptId: null, sb: null };

/* Phase 2: bulk import + promotion state (in-memory only, never persisted). */
var importState = { rows: null, fileName: '', result: null };
var promoState = null;
var pendingIdPrint = []; // student ids queued for the ID-card print flow (in-memory only).
var collectDraft = null; // in-memory draft of the receipt being collected (never persisted until saved).

/* ================= utils ================= */
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

/* ================= photos + school logo (v8) ================= */
function initialsOf(name) { return String(name || '').split(' ').filter(function (w) { return w; }).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase(); }
function avatarHTML(photo, name, cls) {
  var c = cls || 'avatar';
  if (photo) return '<span class="' + c + ' has-photo"><img src="' + esc(photo) + '" alt=""></span>';
  return '<span class="' + c + '">' + esc(initialsOf(name)) + '</span>';
}
function photoPrevHTML(photo, name) {
  if (photo) return '<img class="photo-prev" src="' + esc(photo) + '" alt="">';
  return '<span class="photo-prev">' + esc(initialsOf(name)) + '</span>';
}
function fitWithin(w, h, max) {
  w = +w || 0; h = +h || 0; max = +max || 0;
  if (!w || !h || !max) return { w: 0, h: 0 };
  var s = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}
function dataUrlBytes(url) { var p = String(url || '').split(',')[1] || ''; return Math.floor(p.length * 0.75); }
function compressAttempts(w, h, opts) {
  var list = [];
  if (opts.format === 'png') {
    [opts.max, Math.round(opts.max / 2)].forEach(function (m) { var d = fitWithin(w, h, m); list.push({ w: d.w, h: d.h, q: 1, format: 'png' }); });
  } else {
    [0.8, 0.7, 0.6, 0.5].forEach(function (q) { var d = fitWithin(w, h, opts.max); list.push({ w: d.w, h: d.h, q: q, format: 'jpeg' }); });
    [384, 256].forEach(function (m) { var d = fitWithin(w, h, m); list.push({ w: d.w, h: d.h, q: 0.6, format: 'jpeg' }); });
  }
  return list;
}
var PHOTO_MAX = 512, PHOTO_CAP = 120 * 1024, LOGO_MAX = 256, LOGO_CAP = 250 * 1024;
var pendingPhoto = null, pendingLogo = null;
function compressImageFile(file, opts, cb) {
  if (typeof FileReader === 'undefined' || typeof Image === 'undefined' || typeof document === 'undefined' || !document.createElement) { cb(null, 'not-supported'); return; }
  if (!file) { cb(null, 'no-file'); return; }
  var reader = new FileReader();
  reader.onerror = function () { cb(null, 'read-failed'); };
  reader.onload = function () {
    var img = new Image();
    img.onerror = function () { cb(null, 'bad-image'); };
    img.onload = function () {
      try {
        var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
        if (!iw || !ih) { cb(null, 'bad-image'); return; }
        var attempts = compressAttempts(iw, ih, opts);
        for (var i = 0; i < attempts.length; i++) {
          var a = attempts[i];
          var c = document.createElement('canvas');
          c.width = a.w; c.height = a.h;
          var cx = c.getContext('2d');
          if (!cx) { cb(null, 'no-canvas'); return; }
          if (a.format === 'jpeg') { cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, a.w, a.h); }
          cx.drawImage(img, 0, 0, a.w, a.h);
          var url = a.format === 'png' ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', a.q);
          if (dataUrlBytes(url) <= opts.cap) { cb(url, null); return; }
        }
        cb(null, 'too-big');
      } catch (e) { cb(null, 'compress-failed'); }
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}
function onStudentPhoto(input) {
  var file = input && input.files && input.files[0];
  if (!file) return;
  compressImageFile(file, { max: PHOTO_MAX, cap: PHOTO_CAP, format: 'jpeg' }, function (url, err) {
    if (!url) { toast(err === 'too-big' ? t('tPhotoTooBig') : t('tPhotoError')); input.value = ''; return; }
    pendingPhoto = url;
    var prev = $('fStPhotoPrev');
    if (prev) prev.innerHTML = photoPrevHTML(url, $('fStName') ? $('fStName').value : '');
  });
}
function clearStudentPhoto() {
  pendingPhoto = '';
  var inp = $('fStPhoto'); if (inp) inp.value = '';
  var prev = $('fStPhotoPrev');
  if (prev) prev.innerHTML = photoPrevHTML(null, $('fStName') ? $('fStName').value : '');
}
function onSchoolLogo(input) {
  var file = input && input.files && input.files[0];
  if (!file) return;
  compressImageFile(file, { max: LOGO_MAX, cap: LOGO_CAP, format: 'png' }, function (url, err) {
    if (!url) { toast(err === 'too-big' ? t('tLogoTooBig') : t('tPhotoError')); input.value = ''; return; }
    pendingLogo = url;
    var prev = $('fPfLogoPrev');
    if (prev) prev.innerHTML = '<img class="photo-prev" src="' + esc(url) + '" alt="">';
  });
}
function clearSchoolLogo() {
  pendingLogo = '';
  var inp = $('fPfLogo'); if (inp) inp.value = '';
  var prev = $('fPfLogoPrev');
  if (prev) prev.innerHTML = '<span class="photo-prev">🎓</span>';
}
function inr(n) { return '₹' + Number(n).toLocaleString('en-IN'); }
function num(n) { return Number(n).toLocaleString('en-IN'); }
function todayIST() { // IST date, not UTC (before 5:30 AM UTC date is yesterday in IST)
  var now = new Date();
  var utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}
var toastTimer = null;
function toast(msg) {
  var t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(function () {
    // v44: re-query the node (a re-render may have replaced it) and
    // clear the text when hiding, so stale text can never be read as
    // a toast still pinned on screen.
    var el = $('toast'); if (el) { el.classList.remove('show'); el.textContent = ''; }
  }, 2600);
}
/* ================= numbers in words (Indian numbering) ================= */
var WORD_ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
var WORD_TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function wordsUnder100(x) {
  if (x < 20) return WORD_ONES[x];
  var ten = WORD_TENS[Math.floor(x / 10)], one = WORD_ONES[x % 10];
  return one ? ten + ' ' + one : ten;
}
function wordsUnder1000(x) {
  var h = Math.floor(x / 100), r = x % 100, out = '';
  if (h) out = WORD_ONES[h] + ' Hundred';
  if (r) out += (out ? ' ' : '') + wordsUnder100(r);
  return out;
}
// Indian numbering: crore / lakh / thousand. 177820 -> 'One Lakh Seventy Seven
// Thousand Eight Hundred Twenty Only' (as on the DPS reference receipt).
function numberToWords(n) {
  n = Math.floor(Math.abs(+n || 0));
  if (n === 0) return 'Zero Only';
  var parts = [], crore = Math.floor(n / 10000000); n %= 10000000;
  var lakh = Math.floor(n / 100000); n %= 100000;
  var thou = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(wordsUnder1000(crore) + ' Crore');
  if (lakh) parts.push(wordsUnder1000(lakh) + ' Lakh');
  if (thou) parts.push(wordsUnder1000(thou) + ' Thousand');
  if (n) parts.push(wordsUnder1000(n));
  return parts.join(' ') + ' Only';
}
/* ================= fee extras + receipt numbers ================= */
function feeExtras() {
  if (!db.feeExtras || typeof db.feeExtras !== 'object') db.feeExtras = defaultFeeExtras();
  var e = db.feeExtras;
  ['admissionFee', 'cautionMoney', 'annualCharges', 'transportFee'].forEach(function (k) {
    if (typeof e[k] !== 'number' || isNaN(e[k]) || e[k] < 0) e[k] = 0;
  });
  return e;
}
// peek=true previews the next number without consuming it (draft display only).
function nextReceiptNo(peek) {
  if (!db.receiptCounter) migrateV13(db);
  var n = 'RCP-' + todayIST().slice(0, 4) + '-' + String(db.receiptCounter).padStart(3, '0');
  if (!peek) db.receiptCounter++;
  return n;
}
function feeRecordsDeduped() {
  // v52: the local DB can hold two rows for one fee id (live: the v46
  // verification double-POSTed each of the 3 collections, and a legacy
  // pull merged 6 server rows into the local list). Every total, chart,
  // list and export must sum the deduped view — first row per id wins,
  // the same rule the pull's mergeById uses — so the first pre-pull
  // render is already right (live v51: ₹4,800 on first login, ₹2,400
  // after the pull deduped to 3).
  var seen = {}, out = [];
  (db.feeRecords || []).forEach(function (r) {
    if (!r || !r.id || seen[r.id]) return;
    seen[r.id] = true; out.push(r);
  });
  return out;
}
function feeTotals() {
  var c = 0, p = 0;
  feeRecordsDeduped().forEach(function (r) { if (r.status === 'Collected') c += r.amount; else p += r.amount; });
  return { collected: c, pending: p };
}
function feeMonthsUsed() {
  // v37: the FULL academic year Apr–Mar, always all 12 months in
  // academic order — months with no collections show as zero in the
  // trend (feeChartData), never as a missing bar. A month found in
  // feeRecords that is not in MONTHS_ACAD (bad data) is appended
  // after the year, still sorted by month number.
  var seen = {}, list = [];
  MONTHS_ACAD.forEach(function (m) { seen[m] = 1; list.push(m); });
  db.feeRecords.forEach(function (r) { if (r.month && !seen[r.month]) { seen[r.month] = 1; list.push(r.month); } });
  var head = list.slice(0, 12);
  var tail = list.slice(12).sort(function (a, b) { return (MONTH_NUM[a] || 99) - (MONTH_NUM[b] || 99); });
  return head.concat(tail);
}
function feeRangeLabel() {
  var ms = feeMonthsUsed();
  return ms.length ? ms[0] + '–' + ms[ms.length - 1] : '';
}
function feeChartData() {
  // Month-wise totals computed LIVE from feeRecords, not the static seed ledger.
  return feeMonthsUsed().map(function (m) {
    var c = 0, p = 0;
    feeRecordsDeduped().forEach(function (r) { if (r.month === m) { if (r.status === 'Collected') c += r.amount; else p += r.amount; } });
    return { label: m, collected: c, pending: p };
  });
}
function feeTypeOf(r) { return r.type || 'Tuition'; }
function feeTypeLabel(ty) { var k = FEE_TYPE_KEYS[ty]; return k ? t(k) : ty; }
function feeAllTypes() {
  var list = FEE_TYPES.slice();
  db.feeRecords.forEach(function (r) { var ty = feeTypeOf(r); if (list.indexOf(ty) === -1) list.push(ty); });
  return list;
}
function feeTypeTotals() {
  var m = {};
  feeRecordsDeduped().forEach(function (r) {
    var ty = feeTypeOf(r);
    if (!m[ty]) m[ty] = { collected: 0, pending: 0 };
    if (r.status === 'Collected') m[ty].collected += r.amount; else m[ty].pending += r.amount;
  });
  return m;
}
function enrOf(sid) { var s = db.students.find(function (x) { return x.id === sid; }); return s ? (s.enr || '') : ''; }
function nextEnr() {
  var max = 0;
  db.students.forEach(function (s) {
    var m = /^ENR-(\d+)$/.exec(s.enr || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return 'ENR-' + String(max + 1).padStart(3, '0');
}
function refreshStudentFee(sid) {
  var s = db.students.find(function (x) { return x.id === sid; });
  if (s) s.fee = studentFeeStatus(sid);
}
function feeFiltered() {
  var q = state.feeSearch.toLowerCase(), f = state.feeFilter, ty = state.feeType;
  return feeRecordsDeduped().filter(function (r) {
    if (f !== 'All' && r.status !== f) return false;
    if (ty !== 'All' && feeTypeOf(r) !== ty) return false;
    if (q) {
      var hay = (r.student + ' ' + r.cls + ' ' + enrOf(r.studentId)).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
}
function filterFees(q) {
  // Client-side row filter only — the page is NOT re-rendered, so the search
  // input keeps focus and the typed text (same pattern as the fees search filter).
  q = (q || '').toLowerCase();
  var visible = 0, total = 0;
  document.querySelectorAll('#feeBody tr').forEach(function (tr) {
    if (tr.id === 'feeNoMatch') return;
    total++;
    var show = !q || tr.textContent.toLowerCase().indexOf(q) !== -1;
    tr.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  var nm = document.getElementById('feeNoMatch');
  if (nm) nm.style.display = visible ? 'none' : '';
  var fc = document.getElementById('feeCount');
  if (fc) fc.textContent = t('showingRec') + ' ' + visible + ' ' + t('ofRec') + ' ' + total + ' ' + t('recordsWord');
}
function studentFeeStatus(id) {
  // Derived from fee records: Pending if ANY Pending record exists, Paid if ANY Collected record exists, else no dues.
  var hasCol = false;
  for (var i = 0; i < db.feeRecords.length; i++) {
    var r = db.feeRecords[i];
    if (r.studentId !== id) continue;
    if (r.status === 'Pending') return 'Pending';
    if (r.status === 'Collected') hasCol = true;
  }
  return hasCol ? 'Paid' : '\u2014';
}

// ---------------- Phase 1: Student Management helpers ----------------
var GENDERS = ['Boy', 'Girl', 'Other'];
var BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
var CATEGORIES = ['General', 'OBC', 'SC', 'ST', 'Other'];
var SESSIONS = ['2025–26', '2024–25', '2026–27'];
var SECTIONS = ['A', 'B', 'C'];
var STU_PAGE_SIZE = 10;
var STU_STATUSES = ['Active', 'Inactive', 'Draft', 'Cancelled'];
// v34 (P0-3/P1-10): the roster rule — dues, attendance and marks are only
// for enrolled students. Draft (admission not finished) and Cancelled
// never get dues and never appear on a roster. Inactive students DO keep
// dues (they are still enrolled; only their attendance/marks stop).
function isEnrolledStudent(s) { var stt = (s && s.status) || 'Active'; return stt === 'Active' || stt === 'Inactive'; }
// B6: an exam is active unless it was soft-deleted (deleted: true).
// Marks, lists and stats all filter through this one helper.
function isActiveExam(e) { return !!e && !e.deleted; }
function classParts() {
  var out = [];
  CLASSES.forEach(function (c) { var p = c.split('-')[0]; if (out.indexOf(p) === -1) out.push(p); });
  return out;
}
function classPartOf(cls) { return (cls || '').split('-')[0]; }
function sectionOf(cls) { return (cls || '').split('-')[1] || ''; }
function digitsOnly(v) { return String(v || '').replace(/[^0-9]/g, ''); }
function maskAadhaar(a) {
  var d = digitsOnly(a);
  if (d.length === 4) return '**** **** ' + d; // v36: only the last 4 are stored
  if (d.length === 12) return '**** **** ' + d.slice(8); // legacy in-memory value
  return '—';
}
// Session containing a YYYY-MM-DD date (Apr-Mar academic year). Timezone-proof:
// parses the ISO date directly instead of new Date(), whose UTC-midnight parse
// can shift the day in far-western timezones.
function sessionOfDate(ds) {
  var m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(ds || ''));
  if (!m) return '';
  var y = parseInt(m[1], 10), mo = parseInt(m[2], 10);
  if (mo >= 4) return y + '–' + String((y + 1) % 100).padStart(2, '0');
  return (y - 1) + '–' + String(y % 100).padStart(2, '0');
}
function currentSession() { return sessionOfDate(todayIST()); }
function admYear() {
  var m = String(db.profile.session || '2025–26').match(/\d{4}/);
  return m ? m[0] : '2025';
}
function ensureAdmCounter() {
  if (!db.admCounter) {
    var max = 0;
    db.students.forEach(function (s) {
      var m = /^ADM-(\d{4})-(\d+)$/.exec(s.admissionNo || '');
      if (m) max = Math.max(max, parseInt(m[2], 10));
    });
    db.admCounter = max + 1;
  }
}
// peek=true previews the next number without consuming it (form display only).
function nextAdmNo(peek) {
  ensureAdmCounter();
  var n = 'ADM-' + admYear() + '-' + String(db.admCounter).padStart(3, '0');
  if (!peek) db.admCounter++;
  return n;
}
function nextRoll(cls) {
  var max = 0;
  db.students.forEach(function (s) { if (s.cls === cls) max = Math.max(max, s.roll || 0); });
  return max + 1;
}
function logAudit(action, details) {
  if (!Array.isArray(db.auditLog)) db.auditLog = [];
  var actor = state.user ? (state.user.name + ' (' + state.role + ')') : 'system';
  db.auditLog.unshift({ ts: new Date().toISOString(), actor: actor, action: action, details: details || '' });
  if (db.auditLog.length > 200) db.auditLog.length = 200;
}
function findDupStudent(data, excludeId) {
  var d = null;
  db.students.some(function (s) {
    if (excludeId && s.id === excludeId) return false;
    if (data.admissionNo && s.admissionNo && s.admissionNo === data.admissionNo) { d = s; return true; }
    if (data.dob && s.dob && s.dob === data.dob && s.name.trim().toLowerCase() === String(data.name || '').trim().toLowerCase()) { d = s; return true; }
    if (data.phone && s.phone && digitsOnly(s.phone) === digitsOnly(data.phone) && s.name.trim().toLowerCase() === String(data.name || '').trim().toLowerCase()) { d = s; return true; }
    return false;
  });
  return d;
}
function sessionOptions() {
  var out = [];
  db.students.forEach(function (s) { if (s.session && out.indexOf(s.session) === -1) out.push(s.session); });
  if (db.profile.session && out.indexOf(db.profile.session) === -1) out.push(db.profile.session);
  return out;
}
function studentStats() {
  var total = db.students.length, active = 0, inactive = 0, draft = 0, cancelled = 0, boys = 0, girls = 0, unspec = 0, pend = 0, attSum = 0;
  var byClass = {};
  var curSess = currentSession();
  var newAdm = 0;
  db.students.forEach(function (s) {
    var st = s.status || 'Active';
    if (st === 'Active') active++; else if (st === 'Inactive') inactive++; else if (st === 'Draft') draft++; else if (st === 'Cancelled') cancelled++;
    if (s.gender === 'Boy') boys++; else if (s.gender === 'Girl') girls++; else unspec++;
    if (studentFeeStatus(s.id) === 'Pending') pend++;
    attSum += studentAttPct(s);
    byClass[s.cls] = (byClass[s.cls] || 0) + 1;
    if (s.admissionDate && sessionOfDate(s.admissionDate) === curSess) newAdm++;
  });
  return { total: total, active: active, inactive: inactive, draft: draft, cancelled: cancelled, boys: boys, girls: girls, unspec: unspec, pendFee: pend, avgAtt: total ? Math.round(attSum / total) : 0, newAdm: newAdm, byClass: byClass };
}
function classBarsHTML(byClass) {
  var max = 0;
  CLASSES.forEach(function (c) { max = Math.max(max, byClass[c] || 0); });
  return CLASSES.map(function (c) {
    var n = byClass[c] || 0;
    var w = max ? Math.round(n / max * 100) : 0;
    return '<div class="class-bar"><b>' + esc(c) + '</b><span class="bar-track"><span class="bar-fill" style="width:' + w + '%"></span></span><span class="n">' + n + '</span></div>';
  }).join('');
}
function stuFiltered() {
  var q = (state.stuSearch || '').trim().toLowerCase();
  return db.students.filter(function (s) {
    if (state.stuClass !== 'All' && s.cls !== state.stuClass) return false;
    if (state.stuSection !== 'All' && sectionOf(s.cls) !== state.stuSection) return false;
    if (state.stuSession !== 'All' && (s.session || '') !== state.stuSession) return false;
    if (state.stuGender !== 'All' && (s.gender || '') !== state.stuGender) return false;
    if (state.stuStatus !== 'All' && (s.status || 'Active') !== state.stuStatus) return false;
    if (state.stuFee !== 'All' && studentFeeStatus(s.id) !== state.stuFee) return false;
    if (q) {
      var hay = [s.name, s.admissionNo, s.enr, s.phone].join(' ').toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
}
function stuSorted(list) {
  var col = state.stuSort || 'name', dir = state.stuSortDir || 1;
  var arr = list.slice();
  arr.sort(function (a, b) {
    var r = 0;
    if (col === 'name') r = a.name.localeCompare(b.name);
    else if (col === 'class') r = (CLASSES.indexOf(a.cls) - CLASSES.indexOf(b.cls)) || ((a.roll || 0) - (b.roll || 0));
    else if (col === 'admDate') {
      var da = a.admissionDate || '', dbv = b.admissionDate || '';
      r = !da && !dbv ? 0 : !da ? 1 : !dbv ? -1 : (da < dbv ? -1 : da > dbv ? 1 : 0);
    } else if (col === 'att') r = studentAttPct(a) - studentAttPct(b);
    return r * dir;
  });
  return arr;
}
function stuPageCount(list) { return Math.max(1, Math.ceil(list.length / STU_PAGE_SIZE)); }
function stuPageRows(list) {
  if (state.stuPage > stuPageCount(list)) state.stuPage = stuPageCount(list);
  if (state.stuPage < 1) state.stuPage = 1;
  return list.slice((state.stuPage - 1) * STU_PAGE_SIZE, state.stuPage * STU_PAGE_SIZE);
}
function sortStu(col) {
  if (state.stuSort === col) state.stuSortDir = -state.stuSortDir;
  else { state.stuSort = col; state.stuSortDir = 1; }
  renderPage();
}
function onStuSearch(el) {
  state.stuSearch = el.value;
  state.stuPage = 1;
  renderPage();
  var inp = $('stuSearchInput');
  if (inp && inp.focus) { inp.focus(); if (inp.setSelectionRange) { try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) {} } }
}
function feeSummaryFor(sid) {
  var s = db.students.find(function (x) { return x.id === sid; });
  if (!s) return null;
  var recs = feeRecordsDeduped().filter(function (r) { return r.studentId === sid; })
    .sort(function (a, b) { return (MONTH_NUM[a.month] || 99) - (MONTH_NUM[b.month] || 99) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0); });
  var billed = 0, paid = 0, pend = 0, byType = {};
  recs.forEach(function (r) {
    billed += r.amount;
    if (r.status === 'Collected') paid += r.amount; else pend += r.amount;
    var ty = feeTypeOf(r);
    if (!byType[ty]) byType[ty] = { collected: 0, pending: 0 };
    if (r.status === 'Collected') byType[ty].collected += r.amount; else byType[ty].pending += r.amount;
  });
  return { s: s, recs: recs, billed: billed, paid: paid, pend: pend, byType: byType };
}
function latestExamPct(s) {
  var exs = db.exams.filter(function (e) { return e.cls === s.cls && isActiveExam(e); }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  for (var i = 0; i < exs.length; i++) {
    var mk = db.marks.find(function (m) { return m.examId === exs[i].id && m.studentId === s.id; });
    if (mk) return { pct: Math.round(mk.marks / exs[i].total * 100), name: exs[i].name };
  }
  return null;
}
var STU_CSV_HEAD = ['Name', 'Admission No', 'Enr', 'Class', 'Section', 'Roll', "Father's Name", "Mother's Name", 'Guardian', 'Mobile', 'Secondary Mobile', 'Parent Email', 'Attendance %', 'Fee Status', 'Status', 'Session', 'Admission Date', 'DOB', 'Gender', 'Category', 'Blood Group', 'Address', 'District', 'State', 'PIN', 'Previous School', 'Previous Class', 'Birth Cert', 'TC', 'TC Number'];
function studentCSVRow(s) {
  var d = s.documents || {};
  return [s.name, s.admissionNo || '', s.enr || '', s.cls, sectionOf(s.cls), s.roll,
    s.fatherName || s.guardian, s.motherName || '', s.guardian, s.phone, s.mobile2 || '', s.parentEmail || '',
    studentAttPct(s), studentFeeStatus(s.id), s.status || 'Active', s.session || '', s.admissionDate || '', s.dob || '',
    s.gender || '', s.category || '', s.bloodGroup || '', s.address || '', s.district || '', s.state || '', s.pin || '',
    s.previousSchool || '', s.previousClass || '', d.birthCert ? 'Yes' : 'No', d.tc ? 'Yes' : 'No', d.tcNumber || ''];
}
function downloadStudentCSV(id) {
  var s = db.students.find(function (x) { return x.id === id; });
  if (!s) return;
  downloadCSV('school-saathi-student-' + (s.admissionNo || s.id) + '.csv', [STU_CSV_HEAD, studentCSVRow(s)]);
  toast('✓ ' + t('tStuCsvOne'));
}
function exportStudentsCSV() {
  var list = stuSorted(stuFiltered());
  downloadCSV('school-saathi-students-' + todayIST() + '.csv', [STU_CSV_HEAD].concat(list.map(studentCSVRow)));
  toast('✓ ' + t('tCsvExported'));
}

/* ================= Phase 2: bulk CSV import =================
   CSV only — Excel (.xlsx) is a zipped binary format and cannot be parsed
   without a library; this static build has zero external dependencies, so the
   template and the import are CSV. The UI says so (impTemplateSub). */
var IMPORT_CSV_HEAD = ['name', 'dob', 'gender', 'bloodGroup', 'category', 'address', 'state', 'district', 'pin', 'admissionDate', 'session', 'class', 'section', 'roll', 'previousSchool', 'previousClass', 'fatherName', 'motherName', 'guardianName', 'mobile', 'mobile2', 'parentEmail', 'occupation', 'birthCert', 'tc', 'tcNumber', 'aadhaar'];
function buildImportTemplate() {
  return [IMPORT_CSV_HEAD,
    ['Aarav Kumar', '2014-05-12', 'Boy', 'O+', 'OBC', 'Ward 4, Manikpur', 'Bihar', 'Gopalganj', '841428', '2026-04-01', '2026–27', '6th', 'A', '1', '', '', 'Ramesh Kumar', 'Sunita Devi', 'Ramesh Kumar', '9812345678', '', 'ramesh@example.com', 'Farmer', 'Yes', 'No', '', ''],
    ['Sneha Kumari', '2013-11-03', 'Girl', 'B+', 'General', 'Boring Road', 'Bihar', 'Patna', '800001', '2026-04-01', '2026–27', '6th', 'A', '2', 'Sunrise Academy', '5th', 'Anil Sharma', 'Pooja Sharma', 'Anil Sharma', '9812345679', '9812345680', '', 'Teacher', 'Yes', 'Yes', 'TC-2041', '']];
}
function downloadImportTemplate() {
  downloadCSV('school-saathi-import-template.csv', buildImportTemplate());
  toast(t('tImpTemplate'));
}
function parseCSV(text) {
  // Small RFC-4180 reader: quoted fields (commas, doubled quotes, newlines
  // inside quotes), CRLF/LF endings, BOM stripped, fully-empty lines skipped.
  var rows = [], row = [], field = '', inQ = false;
  var s = String(text || '').replace(/^\uFEFF/, '');
  for (var i = 0; i < s.length; i++) {
    var c = s[i];
    if (inQ) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') {
      if (field.trim() === '') { field = ''; inQ = true; } // quote opens the field (leading spaces tolerated)
      else field += c; // stray quote inside an unquoted field: keep literally
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
}
function parseImportCSV(text) {
  var grid = parseCSV(text);
  if (!grid.length) return { rows: [], error: t('impNoRows') };
  var head = grid[0].map(function (h) { return String(h || '').trim().toLowerCase(); });
  if (head.indexOf('name') === -1) return { rows: [], error: t('impBadHeader') };
  var rows = [];
  for (var i = 1; i < grid.length; i++) {
    var obj = { __line: i + 1 };
    IMPORT_CSV_HEAD.forEach(function (col) {
      var idx = head.indexOf(col.toLowerCase());
      obj[col] = idx === -1 ? '' : String(grid[i][idx] == null ? '' : grid[i][idx]).trim();
    });
    rows.push(obj);
  }
  return { rows: rows, error: null };
}
function isValidDateStr(ds) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ds || '').trim());
  if (!m) return false;
  var y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  var dt = new Date(y, mo - 1, d); // component round-trip is timezone-proof
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}
function normSession(v) {
  var s = String(v || '').trim().replace(/(\d{4})-(\d{2})/, '$1–$2');
  return /^\d{4}–\d{2}$/.test(s) ? s : '';
}
function normBool(v) {
  var s = String(v || '').trim().toLowerCase();
  if (['yes', 'y', 'true', '1'].indexOf(s) !== -1) return true;
  if (['no', 'n', 'false', '0', ''].indexOf(s) !== -1) return false;
  return null; // not a recognisable Yes/No
}
// Validates ONE import row against the same rules as the admission form.
// seenValid: normalised data objects of previously VALID rows in this file
// (in-file duplicates are checked against valid rows only, so a row with its
// own errors reports the real error instead of "duplicate").
function validateImportRow(row, seenValid) {
  var errors = [];
  var name = String(row.name || '').trim();
  if (!name) errors.push(t('impErrName'));
  var phone = digitsOnly(row.mobile);
  if (phone.length !== 10) errors.push(t('impErrMobile'));
  var phone2 = digitsOnly(row.mobile2);
  if (row.mobile2 && String(row.mobile2).trim() !== '' && phone2.length !== 10) errors.push(t('impErrMobile2'));
  var clsRaw = String(row.class || '').trim();
  var secRaw = String(row.section || '').trim().toUpperCase();
  var clsPart = clsRaw, sec = secRaw;
  if (clsRaw.indexOf('-') !== -1) { // tolerate a combined '6th-A' in the class column
    var parts = clsRaw.split('-');
    clsPart = parts[0].trim();
    if (!secRaw) sec = (parts[1] || '').trim().toUpperCase();
  }
  if (classParts().indexOf(clsPart) === -1) errors.push(t('impErrClass'));
  if (SECTIONS.indexOf(sec) === -1) errors.push(t('impErrSection'));
  var pin = digitsOnly(row.pin);
  if (row.pin && String(row.pin).trim() !== '' && pin.length !== 6) errors.push(t('impErrPin'));
  var aadhaar = digitsOnly(row.aadhaar);
  if (row.aadhaar && String(row.aadhaar).trim() !== '' && aadhaar.length !== 12) errors.push(t('impErrAadhaar'));
  var dob = String(row.dob || '').trim();
  if (dob && !isValidDateStr(dob)) errors.push(t('impErrDob'));
  var admDate = String(row.admissionDate || '').trim();
  if (admDate && !isValidDateStr(admDate)) errors.push(t('impErrAdmDate'));
  var session = '';
  if (row.session && String(row.session).trim() !== '') {
    session = normSession(row.session);
    if (!session) errors.push(t('impErrSession'));
  }
  var gender = '';
  if (row.gender && String(row.gender).trim() !== '') {
    var g = String(row.gender).trim().toLowerCase();
    gender = g === 'boy' ? 'Boy' : g === 'girl' ? 'Girl' : g === 'other' ? 'Other' : '';
    if (!gender) errors.push(t('impErrGender'));
  }
  var blood = '';
  if (row.bloodGroup && String(row.bloodGroup).trim() !== '') {
    blood = String(row.bloodGroup).trim().toUpperCase();
    if (BLOOD_GROUPS.indexOf(blood) === -1) { errors.push(t('impErrBlood')); blood = ''; }
  }
  var cat = '';
  if (row.category && String(row.category).trim() !== '') {
    var cl = String(row.category).trim().toLowerCase();
    CATEGORIES.forEach(function (c) { if (c.toLowerCase() === cl) cat = c; });
    if (!cat) errors.push(t('impErrCategory'));
  }
  var email = String(row.parentEmail || '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push(t('impErrEmail'));
  var roll = 0;
  if (row.roll && String(row.roll).trim() !== '') {
    if (!/^\d+$/.test(String(row.roll).trim()) || parseInt(row.roll, 10) < 1) errors.push(t('impErrRoll'));
    else roll = parseInt(row.roll, 10);
  }
  var bc = normBool(row.birthCert), tcB = normBool(row.tc);
  if (bc === null) errors.push(t('impErrBool') + ' (' + t('fBirthCert') + ')');
  if (tcB === null) errors.push(t('impErrBool') + ' (' + t('fTc') + ')');
  var cls = clsPart + '-' + sec;
  var data = null;
  if (!errors.length) {
    data = { name: name, cls: cls, roll: roll, guardian: String(row.guardianName || '').trim() || String(row.fatherName || '').trim() || '—',
      phone: phone, dob: dob, gender: gender, bloodGroup: blood, category: cat,
      address: String(row.address || '').trim(), state: String(row.state || '').trim(), district: String(row.district || '').trim(), pin: pin,
      session: session || db.profile.session, admissionDate: admDate || todayIST(),
      previousSchool: String(row.previousSchool || '').trim(), previousClass: String(row.previousClass || '').trim(),
      fatherName: String(row.fatherName || '').trim(), motherName: String(row.motherName || '').trim(),
      mobile2: phone2, parentEmail: email, occupation: String(row.occupation || '').trim(), aadhaar: aadhaarLast4(aadhaar),
      documents: { birthCert: !!bc, tc: !!tcB, tcNumber: String(row.tcNumber || '').trim(), other: '' } };
    var dup = findDupStudent(data, null); // same rules as the admission form
    if (dup) return { ok: false, status: 'duplicate', errors: [t('impErrDup') + ' ' + dup.name + ' (' + (dup.admissionNo || dup.enr || '') + ' • ' + dup.cls + ')'], data: null };
    var dupIn = null;
    (seenValid || []).some(function (v) {
      if (v.name.trim().toLowerCase() === name.toLowerCase() && ((dob && v.dob === dob) || (phone && digitsOnly(v.phone) === phone))) { dupIn = v; return true; }
      return false;
    });
    if (dupIn) return { ok: false, status: 'duplicate', errors: [t('impErrDupFile') + ' (' + dupIn.name + ' • ' + dupIn.cls + ')'], data: null };
  }
  return { ok: errors.length === 0, status: errors.length ? 'error' : 'valid', errors: errors, data: data };
}
function validateImportRows(rows) {
  var seen = [], out = [];
  (rows || []).forEach(function (r) {
    var v = validateImportRow(r, seen);
    if (v.ok) seen.push(v.data);
    out.push({ row: r, status: v.status, errors: v.errors, data: v.data });
  });
  return out;
}
function onImportFile(input) {
  var file = input && input.files && input.files[0];
  if (!file) return;
  if (typeof FileReader === 'undefined') { toast(t('tPhotoError')); return; }
  var reader = new FileReader();
  reader.onerror = function () { toast(t('tPhotoError')); };
  reader.onload = function () {
    var parsed = parseImportCSV(reader.result);
    if (parsed.error) { importState.rows = null; importState.result = null; toast(parsed.error); openImportModal(); return; }
    importState.rows = validateImportRows(parsed.rows);
    importState.fileName = file.name || '';
    importState.result = null;
    openImportModal();
  };
  reader.readAsText(file);
}
function importPreviewHTML() {
  var rows = importState.rows || [];
  var valid = 0, errs = 0, dups = 0, impd = 0;
  rows.forEach(function (r) {
    if (r.status === 'valid') valid++;
    else if (r.status === 'duplicate') dups++;
    else if (r.status === 'imported') impd++;
    else errs++;
  });
  var trs = rows.map(function (r, i) {
    var badgeCls = (r.status === 'valid' || r.status === 'imported') ? 'green' : r.status === 'duplicate' ? 'orange' : 'red';
    var label = r.status === 'valid' ? t('impValid') : r.status === 'imported' ? t('impImported') : r.status === 'duplicate' ? t('impDuplicate') : t('impError');
    return '<tr><td>' + (r.row.__line || i + 2) + '</td><td><b>' + esc(r.row.name || '—') + '</b></td><td>' + esc((r.row.class || '') + (r.row.section ? '-' + r.row.section : '')) + '</td><td>' + esc(r.row.mobile || '') + '</td>' +
      '<td><span class="badge ' + badgeCls + '">' + label + '</span></td><td>' + esc(r.errors.join('; ') || '—') + '</td></tr>';
  }).join('');
  var res = '';
  if (importState.result) {
    var rs = importState.result;
    res = '<div class="card" style="margin-top:12px"><h3>' + t('impSummary') + '</h3><p>' + rs.imported + ' ' + t('impImported') + ' • ' + rs.skipped + ' ' + t('impSkipped') + '</p></div>';
  }
  return '<h3 style="margin-top:14px">' + t('impPreview') + ' — ' + rows.length + ' ' + t('recordsWord') + '</h3>' +
    '<p class="muted">' + valid + ' ' + t('impValid') + ' • ' + errs + ' ' + t('impError') + ' • ' + dups + ' ' + t('impDuplicate') + (impd ? ' • ' + impd + ' ' + t('impImported') : '') + (importState.fileName ? ' • ' + esc(importState.fileName) : '') + '</p>' +
    '<div class="tbl-wrap imp-scroll"><table><thead><tr><th>#</th><th>' + t('thName') + '</th><th>' + t('thClass') + '</th><th>' + t('thPhone') + '</th><th>' + t('thStatus') + '</th><th>' + t('impReason') + '</th></tr></thead><tbody>' +
    (trs || '<tr><td colspan="6"><div class="empty">' + t('impNoRows') + '</div></td></tr>') + '</tbody></table></div>' +
    '<div class="actions" style="justify-content:flex-start">' +
    '<button class="btn green" ' + (valid ? '' : 'disabled') + ' onclick="confirmImport()">' + t('impConfirm') + ' (' + valid + ')</button>' +
    (importState.result ? '<button class="btn" onclick="closeModal();renderApp()">' + t('impDone') + '</button>' : '') + '</div>' + res;
}
function openImportModal() {
  openModal('<h3>' + t('impTitle') + '</h3>' +
    '<p class="muted">' + t('impTemplateSub') + '</p>' +
    '<div class="toolbar" style="margin:12px 0"><button class="btn ghost sm" onclick="downloadImportTemplate()">⬇ ' + t('impTemplate') + '</button>' +
    '<input type="file" id="impFile" accept=".csv,text/csv" onchange="onImportFile(this)" style="flex:1;min-width:180px"></div>' +
    '<div id="impPreviewWrap">' + (importState.rows ? importPreviewHTML() : '') + '</div>' +
    '<div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('closeW') + '</button></div>', true);
}
function confirmImport() {
  var rows = importState.rows || [];
  // v33: for a server account every number is minted from the server
  // first (one sequential pass, so no two rows share a number); offline
  // rows are imported without a number and minted on the next sync.
  // Local-only accounts mint locally, exactly as before.
  var act = sbSyncActive();
  if (act && sbIsOnline()) {
    var validCount = rows.filter(function (r) { return r.status === 'valid' && r.data; }).length;
    sbGetValidToken().then(function (tok) {
      if (!tok) throw new Error('no-token');
      return sbGetSchoolIdForSync(act.account, act.uid, tok).then(function (schoolId) {
        if (!schoolId) throw new Error('no-school-id');
        return sbFetchTakenNumbers(tok, schoolId).then(function (taken) {
          return sbMintManyAdmNos(tok, schoolId, taken, validCount);
        });
      });
    }).then(function (nums) { confirmImportRun(rows, nums); })
      .catch(function () { confirmImportRun(rows, 'pending'); });
    return;
  }
  confirmImportRun(rows, act ? 'pending' : null);
}
function confirmImportRun(rows, numberSource) {
  var imported = 0, skipped = 0;
  var numIdx = 0;
  rows.forEach(function (r, i) {
    if (r.status !== 'valid' || !r.data) { if (r.status === 'error' || r.status === 'duplicate') skipped++; return; }
    // Re-check duplicates at import time, so a second Confirm (or data that
    // changed since the preview) can never import the same student twice.
    var dup = findDupStudent(r.data, null);
    if (dup) { r.status = 'duplicate'; r.errors = [t('impErrDup') + ' ' + dup.name + ' (' + (dup.admissionNo || dup.enr || '') + ' • ' + dup.cls + ')']; skipped++; return; }
    var d = r.data;
    var nums;
    if (Array.isArray(numberSource)) nums = numberSource[numIdx++] || { admissionNo: '', enr: '' };
    else if (numberSource === 'pending') nums = { admissionNo: '', enr: '', numPending: true };
    else nums = { admissionNo: nextAdmNo(), enr: nextEnr() };
    var admNo = nums.admissionNo;
    var rec = { id: uniqueId('stu'), att: 100, result: 0, fee: '—', enr: nums.enr, admissionNo: admNo, status: 'Active' };
    if (nums.numPending) rec.numPending = true;
    Object.keys(d).forEach(function (k) { rec[k] = d[k]; });
    rec.parentPinHash = hashPin(randomPin()); // v54 (A1): imported students get a random PIN stored as a salted hash — never the phone's last 4 digits, never plaintext, and the value is never shown
    rec.roll = d.roll || nextRoll(d.cls);
    // No fee record is created on import: dues are created by Generate Fees.
    // (The single-admission form adds a ₹6,000 placeholder record; a bulk
    // import of many students must not silently inflate the fee totals.)
    db.students.push(rec);
    logAudit('Bulk import', rec.name + ' • ' + (admNo || 'pending') + ' • ' + rec.cls);
    r.status = 'imported';
    imported++;
  });
  importState.result = { imported: imported, skipped: skipped };
  saveDB(db);
  toast(t('tImpDone') + ' ' + imported + ' ' + t('impImported') + '.');
  openImportModal();
}
function donutPct(v, total) { return total ? Math.round(v / total * 100) : 0; }
function todayAtt() {
  // Live school-wide attendance for TODAY, computed from the actual
  // per-student attendance records (db.attendance, keyed 'YYYY-MM-DD|Class').
  // The old aggregate (seeded 1,150 present of 1,250) described a
  // 1,250-student school, not this one, and was only ever delta-updated from
  // that wrong baseline — so the donut showed fake numbers. 0 of 0 when
  // nothing is marked today yet.
  // v24: soft-deleted (Cancelled) students never count — their old marks
  // stay in the register, but they are not today's students anymore.
  var t = todayIST(), p = 0, a = 0, l = 0;
  var cancelled = {};
  (db.students || []).forEach(function (s) { if ((s.status || 'Active') === 'Cancelled') cancelled[s.id] = 1; });
  Object.keys(db.attendance || {}).forEach(function (k) {
    if (k.indexOf(t + '|') !== 0) return;
    var recs = db.attendance[k] || {};
    Object.keys(recs).forEach(function (id) {
      if (cancelled[id]) return;
      if (recs[id] === 'Present') p++;
      else if (recs[id] === 'Absent') a++;
      else l++;
    });
  });
  return { present: p, absent: a, late: l, total: p + a + l };
}
function studentAttPct(s) {
  // v24: a student's attendance % is computed LIVE from the actual marked
  // records in db.attendance — so the figure moves the moment attendance
  // is marked. Present and Late both count as attended (the student was
  // there); Absent does not. Only when the student has NO marked days at
  // all do we fall back to the stored s.att (the seed / import / admission
  // value). Never write the computed value back into s.att — the stored
  // value stays the fallback.
  var total = 0, attended = 0;
  Object.keys(db.attendance || {}).forEach(function (k) {
    var recs = db.attendance[k] || {};
    var m = recs[s.id];
    if (!m) return;
    total++;
    if (m === 'Present' || m === 'Late') attended++;
  });
  return total ? Math.round(attended / total * 100) : (s.att || 0);
}
/* v26: real relative time from an ISO timestamp. Returns '' when the
   entry has no timestamp — old entries that predate timestamps show
   no time rather than a fabricated one. */
function relTime(ts) {
  if (!ts) return '';
  var t = Date.parse(ts); if (isNaN(t)) return '';
  var d = Date.now() - t; if (d < 0) d = 0;
  var m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  var h = Math.floor(m / 60);
  if (h < 24) return h + ' hr ago';
  if (h < 48) return 'Yesterday';
  var dt = new Date(t);
  return dt.getDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][dt.getMonth()] + ' ' + dt.getFullYear();
}
function addActivity(icon, bg, title, sub) {
  // v26: store a real timestamp at log time. The old literal was the
  // same for every entry, however old it was.
  db.activities.unshift({ icon: icon, bg: bg, title: title, sub: sub, ts: new Date().toISOString() });
  db.activities = db.activities.slice(0, 6);
}
function csvCell(c) {
  var s = String(c);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralise spreadsheet formula injection
  return '"' + s.replace(/"/g, '""') + '"';
}
function downloadCSV(filename, rows) {
  var csv = rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n');
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function openModal(html, wide) { $('modalRoot').innerHTML = '<div class="modal-back" onclick="if(event.target===this)closeModal()"><div class="modal' + (wide ? ' wide' : '') + '">' + html + '</div></div>'; }
function closeModal() { $('modalRoot').innerHTML = ''; }
var confirmCb = null;
function confirmModal(msg, cb) {
  confirmCb = cb;
  openModal('<h3>' + t('confirmTitle') + '</h3><p style="color:var(--muted);font-size:14px">' + esc(msg) + '</p><div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button><button type="button" class="btn danger" onclick="confirmYes()">' + t('confirmYes') + '</button></div>');
}
function confirmYes() { var cb = confirmCb; confirmCb = null; closeModal(); if (cb) cb(); }

/* ================= charts (hand-rolled SVG, animated) ================= */
function donutSVG(segments, size, centerTop, centerBottom) {
  size = size || 190;
  var r = 72, c = 2 * Math.PI * r, total = 0;
  segments.forEach(function (s) { total += s.value; });
  var off = 0, arcs = '';
  segments.forEach(function (s, i) {
    var frac = total ? s.value / total : 0, len = frac * c;
    arcs += '<circle class="donut-arc" cx="100" cy="100" r="' + r + '" fill="none" stroke="' + s.color + '" stroke-width="24" ' +
      'stroke-dasharray="0 ' + c.toFixed(1) + '" data-len="' + len.toFixed(1) + '" data-off="' + (-off).toFixed(1) + '" ' +
      'transform="rotate(-90 100 100)" data-tip="' + esc(s.label) + ': ' + num(s.value) + (s.pct != null ? ' (' + s.pct + '%)' : '') + '" />';
    off += len;
  });
  return '<svg viewBox="0 0 200 200" width="' + size + '" height="' + size + '" role="img" aria-label="Donut chart">' + arcs +
    '<text x="100" y="96" text-anchor="middle" font-size="30" font-weight="800" fill="#0A1E4B">' + esc(centerTop) + '</text>' +
    '<text x="100" y="120" text-anchor="middle" font-size="12.5" fill="#64748B">' + esc(centerBottom) + '</text></svg>';
}
function animateDonuts(root) {
  (root || document).querySelectorAll('.donut-arc').forEach(function (arc, i) {
    var c = 2 * Math.PI * 72;
    setTimeout(function () {
      arc.setAttribute('stroke-dasharray', arc.getAttribute('data-len') + ' ' + c.toFixed(1));
      arc.setAttribute('stroke-dashoffset', arc.getAttribute('data-off'));
    }, 60 + i * 90);
  });
}
function barChartSVG(data) {
  // data: [{label, collected, pending}]
  if (!data || !data.length) return '<div class="empty">' + t('tNoFeeData') + '</div>';
  var W = 560, H = 260, padL = 46, padB = 30, padT = 14, maxV = 0;
  data.forEach(function (d) { maxV = Math.max(maxV, d.collected || 0, d.pending || 0); });
  maxV = Math.ceil(maxV / 50000) * 50000 || 50000;
  var iw = W - padL - 14, ih = H - padT - padB, n = data.length, gw = iw / n, bw = Math.min(26, gw / 3.4);
  var y = function (v) { return padT + ih - (v / maxV) * ih; };
  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Fee collection trend">';
  [0, 0.5, 1].forEach(function (f) {
    var yy = padT + ih * (1 - f);
    s += '<line class="grid-ln" x1="' + padL + '" y1="' + yy + '" x2="' + (W - 10) + '" y2="' + yy + '"/>' +
      '<text class="axis-lbl" x="' + (padL - 6) + '" y="' + (yy + 4) + '" text-anchor="end">' + (f === 0 ? '0' : (f * maxV / 100000).toFixed(1).replace('.0', '') + 'L') + '</text>';
  });
  data.forEach(function (d, i) {
    var cx = padL + gw * i + gw / 2, base = padT + ih;
    s += '<rect class="bar" x="' + (cx - bw - 3) + '" y="' + y(d.collected) + '" width="' + bw + '" height="' + (base - y(d.collected)) + '" fill="' + BLUE + '" rx="3" data-tip="' + (d.label || d.m) + ' Collected: ' + inr(d.collected) + '"/>';
    s += '<rect class="bar" x="' + (cx + 3) + '" y="' + y(d.pending) + '" width="' + bw + '" height="' + (base - y(d.pending)) + '" fill="' + ORANGE + '" rx="3" data-tip="' + (d.label || d.m) + ' Pending: ' + inr(d.pending) + '"/>';
    s += '<text class="axis-lbl" x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle">' + (d.label || d.m) + '</text>';
  });
  s += '</svg>';
  return s;
}
function animateBars(root) {
  // Bars render at final height now (August bars looked empty mid-animation).
  // Only animate legacy bars that still carry data-y/data-h.
  (root || document).querySelectorAll('.bar').forEach(function (b) {
    if (!b.getAttribute('data-y')) return;
    b.setAttribute('y', b.getAttribute('data-y')); b.setAttribute('height', b.getAttribute('data-h'));
  });
}
/* v26: the line chart + its animation removed with the fake growth
   chart — schools carry no created-date, so no time series can be
   computed honestly. Fee trend still uses barChartSVG. */

/* ================= i18n ================= */
var I18N = {
  en: {
    dashboard: 'Dashboard', settings: 'Settings', reports: 'Reports', students: 'Student Management', attendance: 'Attendance', fees: 'Fees', exams: 'Examinations', homework: 'Homework', notices: 'Notices', totalStudents: 'Total Students', totalTeachers: 'Total Teachers', feeCollected: 'Fee Collected', pendingFee: 'Pending Fee', logout: 'Logout',
    landFooter: '<b>School Saathi</b> — Smart Education. Better Tomorrow.<br>Built for Bihar • Free for Schools • Made with ❤️ in Gopalganj, Bihar',
    loginWelcome: 'Log in or sign up<br>to continue', loginWelcomeBack: 'Welcome back', loginNewSchool: 'New school?', loginCreateAccount: 'Create a school account →', featTitle: 'WHAT YOU GET', featAttendance: 'Attendance', featFees: 'Fees & Receipts', featExams: 'Exams & Marks', featHomework: 'Homework', featWhatsApp: 'WhatsApp Alerts', loginEmail: 'Email', loginPassword: 'Password', loginEmailPh: 'you@school.edu.in', loginPwPh: '••••••••', loginBtn: 'Log In', authLogin: 'Log In', authSignup: 'Sign Up', authNote: 'One account per school.', suSchool: 'School Name', suYourName: 'Your Name', suEmail: 'Email', suPw: 'Password', suPw2: 'Confirm Password', suBtn: 'Create Account', loginOr: 'Or continue with', demoTitle: '— One-tap demo login —', loginBack: '← Back to website',
    schoolDashboard: 'School Admin Dashboard', studentDashboard: 'Student Dashboard',
    confirmTitle: 'Confirm', cancel: 'Cancel', confirmYes: 'Yes, continue', saveBtn: 'Save',
    addStudent: 'Add Student', saveAttendance: 'Save Attendance', saveMarks: 'Save Marks', addHomework: 'Add Homework', publishNotice: 'Publish Notice', downloadReport: 'Download Report', editBtn: 'Edit', deleteBtn: 'Delete', collectBtn: 'Collect', saveSettingsBtn: 'Save Settings', resetAllData: 'Reset All Data', resetPwTitle: 'Enter your password to reset', resetPwHint: 'Resetting permanently deletes ALL school data — students, teachers, fees, attendance, exams, homework, notices and receipts. This cannot be undone.', resetConfirmMsg: 'This will permanently delete ALL data — students, teachers, fees, attendance, exams, homework, notices and receipts. This cannot be undone.', resetConfirmTitle: 'Reset — choose what to delete', resetPwLabel: 'Account password', resetPwWrong: 'Wrong password — nothing was reset.', resetPwGo: 'Verify & Continue', resetNameTitle: 'Type the school name to confirm', resetNameHint: 'This is the last step before everything is deleted. Type the exact school name.', resetNameLabel: 'School name', resetNameWrong: 'That name does not match — nothing was reset.', resetNameGo: 'Confirm Reset', publishBtn: 'Publish', assignHw: 'Assign Homework', saveStudentBtn: 'Save Student',
    attOverview: 'Attendance Overview', todayAtt: 'Today\'s Attendance', feeTrend: 'Fee Collection Trend', feeTrendSub: 'Apr – Mar (Collected vs Pending)', feeTrendSub2: 'Apr to Mar (Collected vs Pending)', recentAct: 'Recent Activities', activityLog: 'Activity Log', actLogSub: 'Full audit history — newest first.', thDetails: 'Details', actBy: 'By', supYourName: 'Your name', quickLinks: 'Quick Links', jumpTask: 'Jump to a task', enterMarks: 'Enter Marks', myHomework: 'My Homework', noticesH: 'Notices', latestNotices: 'Latest from school', contactSub: 'We reply within one working day', studentsReport: 'Students Report', feesReport: 'Fees Report', attReport: 'Attendance Report', thName: 'Name', thClass: 'Class', thRoll: 'Roll', thGuardian: 'Guardian', thPhone: 'Phone', thAtt: 'Att.', thFee: 'Fee', thAction: 'Action', thReceipt: 'Receipt', thStudent: 'Student', thMonth: 'Month', thAmount: 'Amount', thDate: 'Date', thStatus: 'Status', thMarks: 'Marks', thResult: 'Result', thRole: 'Role',
    subReports: 'Download CSV reports', subStudents: 'St. Xavier School, Patna', subAttendance: 'Mark & view attendance', subFees: 'Fee collection & pending dues', subExams: 'Exams & marks entry', subHomework: 'Assign & track homework', subNotices: 'Notice board',
    fSchoolName: 'School Name', fCity: 'City', fStudentName: 'Student Name', fClass: 'Class', fRoll: 'Roll No', fGuardian: 'Guardian', fPhone: 'Phone', fTitle: 'Title', fSubject: 'Subject', fDue: 'Due Date', fMessage: 'Message', fPrincipal: 'Principal / Admin', fEmail: 'Email', fAddress: 'Address', fSession: 'Academic Session',
    tLoggedIn: 'Logged in as', tAccountCreated: 'Account created. Welcome, ', tInvalidCreds: 'Invalid email or password.', tFillAll: 'Please fill in all fields.', tInvalidEmail: 'Please enter a valid email address.', tPwShort: 'Password must be at least 6 characters.', tPwMismatch: 'Passwords do not match.', tEmailTaken: 'An account with this email already exists. Please log in.', tLoggedOut: 'Logged out. See you soon!', tBackExit: 'Press back again to exit', tStudentAdded: 'Student added.', tStudentUpdated: 'Student updated.', tStudentDeleted: 'Student deleted.', tAttSaved: 'Attendance saved', tMarksSaved: 'Marks saved for', tHwDone: 'Homework marked done.', tHwNotDone: 'Homework marked not done.', tHwAssigned: 'Homework assigned.', tNoticePub: 'Notice published.', tReportDl: 'Report downloaded.', tSettingsSaved: 'Settings saved.', tAllReset: 'All data deleted — the school is now empty.', tSessionChanged: 'Academic session changed to', tNoChanges: 'No changes.', tFutureDate: 'Future date not allowed — showing today.', tDueFuture: 'Due date must be today or later.', tDemoLogin: 'Demo account — use one-tap login below.', tGoogleDemo: 'Demo build — please use a one-tap demo login.', tNoStudentData: 'No student data — ask your school admin to add students.', tNoExams: 'No exams yet.', tNoHw: 'No homework yet.', tNoMarks: 'No marks entered yet for this exam.', tNoMatch: 'No students match.', tNotEntered: 'Not entered', tCollectedFrom: 'collected from', tDupStudent: 'already exists in', tNotSaved: 'Not saved', tCheckMarks: 'check marks', tStudentsWord: 'students', tNoFeeData: 'No fee data yet.',
    searchStudent: 'Search student…', viewAll: 'View All →', classAvg: 'Class average', studentsMarked: 'students marked', ofWord: 'of', showingRec: 'Showing', ofRec: 'of', recordsWord: 'records.', tapDone: 'tap the box when done', myHwSub: 'Tap the box when you finish', tileAtt: 'Attendance', tileFees: 'Fees', tileResults: 'Results', tileHw: 'Homework', doneSuffix: 'done', presBtn: 'Present', absBtn: 'Absent', lateBtn: 'Late',
    qaAddStudent: 'Add Student', qaAddStudentD: 'New admission', qaMarkAtt: 'Mark Attendance', qaMarkAttD: 'Today\'s register', qaEnterMarks: 'Enter Marks', qaEnterMarksD: 'Exam results', qaGenReport: 'Generate Report', qaGenReportD: 'CSV download',
    dlStudents: 'Download Students CSV', dlFees: 'Download Fees CSV', dlAtt: 'Download Attendance CSV', repStudentsSub: 'Name, class, roll, guardian, phone, attendance, fee status', repFeesSub: 'Student, class, month, amount, status — Apr to Mar',
    subSettingsS: 'School profile', settingsSub: 'Edit and save — changes sync to the server when you are online.',
    studentsW: 'Students', perSchool: '2 per school',
    raiseSupport: 'Raise a Support Request', supportNoted: 'Support request noted — we will call you back.', collectedW: 'Collected', pendingW: 'Pending', allW: 'All', editStudent: 'Edit Student', feeTypeTuition: 'Tuition', feeTypeAdmission: 'Admission', feeTypeTransport: 'Transport', feeTypeExam: 'Exam', feeTypeLibrary: 'Library', feeTypeActivity: 'Activity', feeTypeComputer: 'Computer Lab', feeTypeOther: 'Other', allTypes: 'All Types', searchFee: 'Search name, enrollment no. or class…', thEnr: 'Enr. No.', thType: 'Type', feeByType: 'Fee by Type', feeByTypeSub: 'Collected and pending per fee type, computed live.', addFee: 'Add Fee', addFeeSub: 'Add one fee record manually for any student.', feeStruct: 'Fee Structure', feeStructSub: 'Monthly amount per class. Generate uses this to create fee records.', genFees: 'Generate Fees', saveStruct: 'Save Structure', addRow: 'Add Row', customType: 'Custom…', typeCustomPh: 'Type a custom fee type', fStudent: 'Student', fMonth: 'Month', fType: 'Fee Type', fAmount: 'Amount (₹)', fStatus: 'Status', fDate: 'Date', printList: 'Print List', printStmt: 'Print Statement', backFees: 'Back to All Fees', totalBilled: 'Total Billed', totalPaid: 'Paid', totalPending: 'Pending', feeRecsH: 'Fee Records', feeProfileSub: 'All fee records for this student in one place.', tFeeAdded: 'Fee record added.', delFeeMsg: 'Delete this pending fee record?', tFeeDeleted: 'Fee record deleted.', tPickStudent: 'Please choose a student.', tAmtPositive: 'Amount must be more than 0.', tTypeRequired: 'Please type the custom fee type.', tStructSaved: 'Fee structure saved.', tStructAdded: 'Structure row added.', tStructRemoved: 'Structure row removed.', tGenRecords: 'fee records generated for', tGenSkipped: 'already existed', tGenNotAdmitted: 'not yet admitted', tNoFeeRecs: 'No fee records yet for this student.', printTitle: 'Fee Statement', printListTitle: 'Fee List', printGenOn: 'Generated on', closeW: 'Close', saveFeeBtn: 'Save Fee', photoLabel: 'Student Photo', photoHint: 'Photo is compressed automatically (max 512px, ~120KB).', removePhoto: 'Remove photo', logoLabel: 'School Logo', logoHint: 'Logo is compressed automatically (max 256px, PNG keeps transparency).', removeLogo: 'Remove logo', tPhotoTooBig: 'That photo is too large even after compression. Please choose a smaller photo.', tLogoTooBig: 'That logo is too large even after compression. Please choose a smaller logo.', tPhotoError: 'Could not read that image. Please choose another file.', aadhaarHint: 'Optional. Only the last 4 digits are stored — the full number is never saved.', actActivate: 'Activate Student', actAtt: 'View Attendance', actDeactivate: 'Deactivate Student', actDownload: 'Download Details', actEdit: 'Edit Student', actFees: 'View Fees', actIdCard: 'Print ID Card', actResults: 'View Results', actTransfer: 'Transfer Student', actView: 'View Profile', actionsW: 'Actions', admNoAuto: 'Auto-generated', allClasses: 'All Classes', allFeeSt: 'All Fee Status', allGenders: 'All Genders', allSections: 'All Sections', allSessions: 'All Sessions', allStatus: 'All Statuses', attPct: 'Attendance', backDir: 'Back to Directory', cancelAdm: 'Cancel Admission', cancelAdmMsg: 'Cancel this admission? The student record will be kept with status Cancelled.', docMissing: 'Not received', docStatus: 'Received', docsNote: 'Document files will be uploaded in the server phase. This checklist records what has been received.', exportCsv: 'Export CSV', fAadhaar: 'Aadhaar Number (optional)', fAdmDate: 'Admission Date', fAdmNo: 'Admission Number', fBirthCert: 'Birth Certificate', fBlood: 'Blood Group', fCategory: 'Category', fDistrict: 'District', fDob: 'Date of Birth', fDocsOther: 'Other Documents (notes)', fFather: 'Father\'s Name', fGender: 'Gender', fMother: 'Mother\'s Name', fOccupation: 'Occupation', fParentEmail: 'Parent Email', fPhone2: 'Secondary Mobile', fPin: 'PIN Code', fPrevClass: 'Previous Class', fPrevSchool: 'Previous School', fSection: 'Section', fState: 'State', fTc: 'Transfer Certificate (TC)', fTcNo: 'Transfer Certificate No.', feeSt: 'Fee Status', hwDone: 'Done', hwPend: 'Pending', hwPending: 'Homework Pending', latestExam: 'Latest Exam', nextW: 'Next', noActivity: 'No activity recorded yet.', noAttRecs: 'No attendance records yet for this student.', noExamRecs: 'No examination results yet.', noHwRecs: 'No homework records for this class.', openFees: 'Open Fee Page', pgOf: 'of', pgPage: 'Page', phase3W: 'Phase 3', prevW: 'Previous', saveAddAnother: 'Save & Add Another', saveDraft: 'Save as Draft', secAcademic: 'Academic Details', secDocs: 'Documents', secParent: 'Parent / Guardian Details', secPersonal: 'Personal Details', stActive: 'Active Students', stAvgAtt: 'Average Attendance', stBoys: 'Boys', stByClass: 'Students by Class', stByClassSub: 'Number of students in each class-section.', stGenderDist: 'Boys & Girls', stGenderSub: 'Gender distribution across the school.', stGirls: 'Girls', stInactive: 'Inactive Students', stNewAdm: 'New Admissions', stNotSpec: 'Not specified', stPendFee: 'Students with Pending Fees', stTotal: 'Total Students', stuSearchPh: 'Search name, admission no. or mobile…', tActMsg: 'Activate student', tActivated: 'Student activated.', tAdmCancelled: 'Admission cancelled. The record is kept.', tAdmCreated: 'Admission saved. Admission No. ', tCsvExported: 'Student list exported.', tDeactMsg: 'Deactivate student', tDeactivated: 'Student deactivated.', tDraftSaved: 'Draft saved.', tDupFound: 'A matching student already exists: ', tInvalidAadhaar: 'Aadhaar must be 12 digits (or the last 4) — optional.', tInvalidMobile: 'Enter a valid 10-digit mobile number.', tInvalidPin: 'PIN code must be 6 digits.', tPickClass: 'Please choose a class.', tReqFields: 'Please fill Student Name, Primary Mobile, Class and Section.', tStuCsvOne: 'Student details downloaded.', tTransferred: 'Student transferred.', tabAcademic: 'Academic Records', tabActivity: 'Activity History', tabAttendance: 'Attendance History', tabDocs: 'Documents', tabFees: 'Fee History', tabHomework: 'Homework Records', tabOverview: 'Overview', tabParent: 'Parent Information', tabPersonal: 'Personal Information', tabResults: 'Examination Results', thAdmNo: 'Admission No.', thExam: 'Exam', thFather: 'Father\'s Name', transferTitle: 'Transfer Student', transferTo: 'New Class & Section', idCardSoon: 'ID Card generator comes in Phase 3.',
    impTitle: 'Bulk Import Students', impImportBtn: 'Import Students', impTemplate: 'Download Sample Template', impTemplateSub: 'CSV format only — Excel (.xlsx) files cannot be read here. Use the template columns.', impChooseFile: 'Choose CSV File', impPreview: 'Import Preview', impSummary: 'Import Summary', impValid: 'Valid', impError: 'Error', impDuplicate: 'Duplicate', impReason: 'Reason', impConfirm: 'Import Valid Rows', impDone: 'Done', impNoRows: 'No rows found in this file. Please check the template.', impBadHeader: 'This file does not look like the student template — the Name column is missing.', impNoFile: 'Please choose a CSV file first.', impNoValid: 'No valid rows to import.', impImported: 'imported', impSkipped: 'skipped', impErrName: 'Name is required', impErrMobile: 'Mobile must be 10 digits', impErrMobile2: 'Secondary mobile must be 10 digits', impErrClass: 'Class is not valid', impErrSection: 'Section must be A, B or C', impErrPin: 'PIN must be 6 digits', impErrAadhaar: 'Aadhaar must be 12 digits', impErrDob: 'Date of birth is not a valid date', impErrAdmDate: 'Admission date is not a valid date', impErrSession: 'Session is not valid (e.g. 2025–26)', impErrGender: 'Gender must be Boy, Girl or Other', impErrBlood: 'Blood group is not valid', impErrCategory: 'Category must be General, OBC, SC, ST or Other', impErrEmail: 'Parent email is not valid', impErrRoll: 'Roll must be a positive number', impErrBool: 'Must be Yes or No', impErrDup: 'Duplicate of', impErrDupFile: 'Duplicate in this file', tImpDone: 'Bulk import complete.', tImpTemplate: 'Sample template downloaded.',
    promoTitle: 'Promote Students', promoBtn: 'Promote Students', promoSingle: 'Promote Student', promoFromSession: 'Current Session', promoFromClass: 'Current Class', promoToSession: 'Target Session', promoToClass: 'Target Class', promoToSection: 'Target Section', promoSelectAll: 'Select All', promoSelectNone: 'Select None', promoSelected: 'selected', promoPromote: 'Promote Selected', promoRetain: 'Retain Selected', promoNoStudents: 'No students in this class and session.', promoNoSelect: 'Please select at least one student.', promoNoop: 'Target class and session are the same as current — nothing to change.', promoNoopRetain: 'Target session is the same as the current session — nothing to change.', promoDone: 'Promotion complete.', promoPromoted: 'promoted', promoRetained: 'retained', promoNote: 'Attendance, fees, exam marks and homework history are preserved.', promoSingleNote: 'Single student promotion', promoSkipped: 'skipped (already moved)', promoNotEligible: 'Only Active or Inactive students can be promoted.',
    idcPreview: 'ID Card Preview', idcPrint: 'Print', idcPrintCards: 'Print ID Cards', idcSelectAll: 'Select all', idcClearSel: 'Clear selection', idcReady: 'ID cards ready to print', idcEmergency: 'Emergency Contact', idcReturn: 'If found, please return to', idcNoQr: 'QR code could not be generated.',
    authStudent: 'Student', authTeacher: 'Teacher', stuAdmNo: 'Admission Number', stuPinLabel: 'Student PIN', stuLoginBtn: 'Login as Student', stuNote: 'Student login uses the PIN set by the school. Ask your school if you do not know it.', stuSub: 'Student', stuDashboard: 'My Profile', tInvalidStudent: 'Invalid admission number or PIN.', stuPinField: 'Student login PIN (optional)', stuPinPh: 'Leave blank — a random PIN is generated', stuPinTitle: 'Student PIN', stuPinNow: 'Current Student PIN', stuPinSet: 'PIN set', stuPinNone: 'No PIN set — student login unavailable for this student.', stuPinNew: 'New PIN (4–6 digits)', stuPinSetBtn: 'Set PIN', stuPinClear: 'Clear PIN', tPinLen: 'PIN must be 4–6 digits.', tPinSet: 'Student PIN set.', tPinLocked: 'Too many wrong attempts \u2014 try again in 15 minutes.', tPinCleared: 'Student PIN cleared.', tPinAuto: 'The PIN is set by the school at admission. If the student forgets it, set a new one here.', tNotAllowed: 'Your login cannot open this section.', tOwnProfileOnly: 'You can only view your own profile.', todayW: 'Today', tchrLoginBtn: 'Login as Teacher', tchrNote: 'Teacher accounts are created by the school admin.', tchrSub: 'Teacher', tchrDashboard: 'Teacher Dashboard', tchrNoDb: 'School data is not on this device — log in on the school device first.', teachers: 'Teachers', teachersSub: 'Teacher accounts and the classes they teach.', tchrAdd: 'Add Teacher', tchrEdit: 'Edit Teacher', tchrName: 'Teacher Name', tchrSubject: 'Subject', tchrClasses: 'Classes Taught', tchrEmail: 'Email', tchrPw: 'Password', tchrPwHint: 'At least 6 characters. Leave blank to keep the current password.', tchrNoLogin: 'No login', tchrSaved: 'Teacher saved.', tchrNoClasses: 'Choose at least one class.', tchrEmailTaken: 'This email is already used by another account.', tchrMyClasses: 'My Classes', tchrStudents: 'Students in my classes', tchrNoClassesYet: 'No classes assigned yet — ask the school admin to assign classes.', admissions: 'Admission Requests', admReqTitle: 'admission requests', admReqApply: 'Apply for Admission', admReqFormTitle: 'Apply for Admission', admReqSchool: 'School', admReqNoSchool: 'No school account exists on this device yet — admission requests open after a school signs up here.', admReqClassApply: 'Class Applying For', admReqSubmitted: 'Application received. The school will review it and contact you.', admReqApprove: 'Approve', admReqReject: 'Reject', admReqView: 'View', admReqReason: 'Reason (optional)', admReqApproved: 'Admission request approved.', admReqRejected: 'Admission request rejected.', admReqPrefilled: 'Prefilled from an admission request — check the details before saving.', admReqStatus: 'Status', admReqSubmittedOn: 'Submitted', admReqEmpty: 'No admission requests yet.', admReqPending: 'Pending', admReqApprovedSt: 'Approved', admReqRejectedSt: 'Rejected', admReqAll: 'All', tReqName: 'Student name is required.', tReqClass: 'Please choose the class.', tAdmReqFailed: 'Could not save the application for that school.', softDelMsg: 'Remove this student? The record is kept (soft delete) — fees, marks, attendance and homework stay saved.', tStudentRemoved: 'Student removed (record kept).', tAdmReqInvalid: 'Please fill the student name, a 10-digit mobile and the class.',
    collectFeeBtn: 'Collect Fee', rcptTitle: 'FEE RECEIPT', rcptReceiptNo: 'Receipt No', rcptDate: 'Date', rcptAdmNo: 'Adm No', rcptSession: 'Session', rcptName: 'Name', rcptClass: 'Class', rcptInstallment: 'Installment', rcptCounter: 'Counter No', rcptSlNo: 'Sl.No', rcptDesc: 'Description', rcptDue: 'Due', rcptCon: 'Con', rcptPaid: 'Paid', rcptAdmissionFee: 'Admission Fee', rcptTuitionFee: 'Tuition Fee', rcptCaution: 'Caution Money', rcptAnnual: 'Annual Charges', rcptBusFee: 'Bus Fee', rcptDues: 'Dues', rcptPayModeTitle: 'PAY MODE INFORMATION', rcptPayMode: 'Pay Mode', rcptBank: 'Bank', rcptNumber: 'Number', rcptTotal: 'Total', rcptTotalWords: 'Total in Words', rcptComputerGen: 'This is a computer generated Receipt. Does not required signature.', rcptParentCopy: 'PARENT COPY', rcptCollectorSign: 'Collector\'s Signature', rcptIncludeBus: 'Include Bus/Transport', rcptOtherFees: 'Other Fees', rcptAnnualHint: 'One-time and annual amounts used on the Collect Fee receipt. Set 0 to hide a row.', payModeCash: 'Cash', payModeCheque: 'Cheque', payModeUpi: 'UPI', payModeCard: 'Card', payModeBank: 'Bank Transfer', tFeeCollected: 'Fee collected.', tCollectZero: 'Nothing to collect — enter a Paid amount.', tCollectSaved: 'Fee collected — Receipt ', tCollectNotActive: 'This student is not active — fee cannot be collected.', rcptReceipts: 'Receipts', rcptView: 'View', rcptPrint: 'Print / Save PDF', rcptCollectAgain: 'Collect Again', rcptNoReceipts: 'No receipts yet for this student.', rcptDraft: 'Draft — not saved yet', rcptCollectSave: 'Collect & Save', rcptNoLines: 'Nothing to collect for this period — set the fee amounts in Fee Structure first.',
    sbForgotPw: 'Forgot password?', sbRecoverTitle: 'Reset Password', sbSendResetLink: 'Send Reset Link', sbResetPw: 'Set New Password', sbRecoverSent: 'If an account exists for that email, a reset link was sent. Check your inbox.', sbRecoverFailed: 'Could not send the reset link. Check your connection and try again.', sbResetDone: 'Password updated. Log in with your new password.', sbResetFailed: 'Could not update the password. The link may have expired — request a new one.', sbTooMany: 'Too many attempts — please wait a few minutes and try again.', sbEmailConfirm: 'Server account created — confirm your email to use it on other devices.', sbEmailConfirmed: 'Email confirmed — log in to continue.', sbOfflineLogin: 'You are offline — using this device’s account.', sbTitle: 'Server Backup', sbBackupNow: 'Back Up Now', sbStatusSynced: 'Backed up to the server.', sbLastAttempt: 'Last attempt', sbSyncDetailsTitle: 'Sync details', sbSyncPendingUploads: 'Pending uploads', sbSyncLastCycle: 'Last cycle', sbSyncLastFlush: 'Last flush', sbSyncLastError: 'Last error', sbSyncPushed: 'pushed', sbSyncConflicts: 'conflicts', sbSyncLeftover: 'left over', sbSyncCalls: 'calls', sbSyncQueued: 'Queued entries', sbSyncAndMore: 'and {n} more', sbStatusPending: 'Backup pending — it will run on your next login.', sbStatusUploading: 'Backing up to the server…', sbStatusFailed: 'Backup failed — it will retry on your next login.', sbStatusOffline: 'Offline — backup will run when you are back online.', sbStatusNotSchool: 'Server backup is available for school accounts.', sbBackupDone: 'Backup complete.', sbBackupFailed: 'Backup did not finish — check your connection and try again.', sbNoSchool: 'No school found for this account. Please sign up or log in with your school account.', sbDownloadNow: 'Download from Server', sbDownloadStart: 'Downloading from the server…', sbDownloadDone: 'Download complete.', sbDownloadFailed: 'Download did not finish — check your connection and try again.', sbDownloadSkipped: 'This device already has school data — download skipped to protect it.', sbDownloadOffline: 'Offline — download will run when you are back online.', sbDownloadNoServer: 'No server backup found for this school yet.', sbStatusSyncing: 'Syncing with the server…', sbStatusPendingSync: 'Offline — changes will sync when you are back online.', sbSyncDone: 'Synced with the server.', sbSyncFailed: 'Sync did not finish — it will retry on your next login.', sbSyncOffline: 'Offline — your changes are saved here and will sync later.', sbSyncConflict: 'Server had a newer copy — kept the server version.', sbNumPending: 'Admission saved. The admission number will be assigned when you are back online.', sbNumPendingReceipt: 'Fee saved. The receipt number will be assigned when you are back online.', sbStatusSessionExpired: 'Session expired — please log in again.', sbStatusNotLinked: 'Not linked to the server yet — it will link when you log in.', sbLinkServer: 'Link to Server', sbLinkDone: 'Server account linked.', sbLinkFailed: 'Could not link the server account — check your connection and try again.', sbLinkPwTitle: 'Link the server account', sbNumAssigning: 'Assigning number…', tWrongPasswordServer: 'Wrong password for the server account.', tCollectCapped: 'The paid amount was more than the due — only the due amount was taken.', resetPwHintServer: 'This deletes the data on THIS device only. The server copy will come back on the next sync unless you also wipe the server.', resetConfirmMsgServer: 'Delete this device’s data only? The server copy will return on the next sync — choose “Delete on server too” to remove it everywhere.', resetDeviceOnly: 'This device only', resetWipeServerBtn: 'Delete on server too', resetWipeServerDone: 'Server data deleted.', resetWipeServerFailed: 'Could not delete the server data — nothing was reset. Check your connection and try again.', supportQueued: 'Support request saved — it will be sent when you are back online.', admReqQueued: 'Application saved — it will be sent when you are back online.', admReqLoadingSchools: 'Loading schools…', attNotMarked: 'Not marked',
    createExam: 'Create Exam', examName: 'Exam Name', examTotal: 'Total Marks', tExamCreated: 'Exam created.', tExamInvalid: 'Please fill the exam name, class and total marks.', editExam: 'Edit Exam', deleteExam: 'Delete Exam', restoreExam: 'Restore', examDeletedH: 'Deleted Exams', examDelNote: 'A deleted exam keeps its marks — the marks stay saved but are hidden everywhere until the exam is restored.', delExamMsg: 'Delete this exam? Its marks will be kept but hidden — restore the exam to see them again.', tExamDeleted: 'Exam deleted. Its marks are kept — restore the exam to see them again.', tExamUpdated: 'Exam updated.', tExamRestored: 'Exam restored.', examClsLocked: 'Class cannot be changed — the marks belong to this class.', examMarksKept: 'Marks already entered stay as they are — percentages are recalculated with the new total.', tNoTeachers: 'No teachers yet.',
    fullBackup: 'Full Backup & Restore', fullBackupSub: 'Download all school data as one file, or restore from a backup file. Restoring replaces the data on this device.', backupExport: 'Download Full Backup', backupImport: 'Restore from Backup File', tBackupExported: 'Full backup downloaded.', tBackupRestored: 'Backup restored.', tBackupBadFile: 'This file is not a valid School Saathi backup — nothing was changed.', backupRestoreConfirm: 'Restore will REPLACE all current data on this device with the backup file. A safety backup of your current data will be downloaded first.',
    sbStatusLocalOnly: 'Not linked to the server — your data stays on this device. Link to back up.',
    waReminderBtn: 'WhatsApp Reminder', waNotifyBtn: 'Notify Parent', waShareReceiptBtn: 'Share on WhatsApp', waChatBtn: 'WhatsApp', waNotifyCol: 'Notify',
    waNoNumber: 'No valid parent mobile number for this student — WhatsApp is unavailable.',
    waOpened: 'WhatsApp opened — press Send in WhatsApp to send the message.',
    waNotAbsent: 'Only students marked Absent or Late can be notified.',
    waFeeReminderMsg: 'Namaste, this is {school}. Fee reminder for {student} (Class {cls}): {amount} is due for {month}. Please pay at the earliest. Thank you.',
    waAbsentMsg: 'Namaste, this is {school}. {student} (Class {cls}) was absent from school today ({date}). Please let us know if there is a reason. Thank you.',
    waLateMsg: 'Namaste, this is {school}. {student} (Class {cls}) arrived late to school today ({date}). Please ensure timely arrival. Thank you.',
    waReceiptMsg: 'Namaste, this is {school}. Fee receipt {receipt} — {student} (Class {cls}), {amount} paid for {month} on {date}. Thank you.',
    waGreetMsg: 'Namaste, this is {school}. This is regarding {student} (Class {cls}).',
    waSchoolContact: 'School'
  },
  hi: {
    dashboard: 'डैशबोर्ड', settings: 'सेटिंग्स', reports: 'रिपोर्ट', students: 'छात्र प्रबंधन', attendance: 'उपस्थिति', fees: 'शुल्क', exams: 'परीक्षा', homework: 'होमवर्क', notices: 'नोटिस', totalStudents: 'कुल छात्र', totalTeachers: 'कुल शिक्षक', feeCollected: 'शुल्क संग्रह', pendingFee: 'बकाया शुल्क', logout: 'लॉगआउट',
    landFooter: '<b>School Saathi</b> — Smart Education. Better Tomorrow.<br>बिहार के लिए बना • स्कूलों के लिए मुफ़्त • गोपालगंज, बिहार में बना ❤️',
    loginWelcome: 'लॉग इन करें या साइन अप करें<br>जारी रखने के लिए', loginWelcomeBack: 'फिर से स्वागत है', loginNewSchool: 'नया स्कूल?', loginCreateAccount: 'स्कूल अकाउंट बनाएँ →', featTitle: 'आपको क्या मिलेगा', featAttendance: 'उपस्थिति', featFees: 'फीस व रसीद', featExams: 'परीक्षा व अंक', featHomework: 'गृहकार्य', featWhatsApp: 'WhatsApp अलर्ट', loginEmail: 'ईमेल', loginPassword: 'पासवर्ड', loginEmailPh: 'आप@school.edu.in', loginPwPh: '••••••••', loginBtn: 'लॉग इन करें', authLogin: 'लॉग इन', authSignup: 'साइन अप', authNote: 'एक स्कूल, एक अकाउंट।', suSchool: 'स्कूल का नाम', suYourName: 'आपका नाम', suEmail: 'ईमेल', suPw: 'पासवर्ड', suPw2: 'पासवर्ड दोबारा डालें', suBtn: 'अकाउंट बनाएँ', loginOr: 'या जारी रखें', demoTitle: '— एक टैप में डेमो लॉगिन —', loginBack: '← वेबसाइट पर वापस',
    schoolDashboard: 'स्कूल एडमिन डैशबोर्ड', studentDashboard: 'छात्र डैशबोर्ड',
    confirmTitle: 'पुष्टि करें', cancel: 'रद्द करें', confirmYes: 'हाँ, जारी रखें', saveBtn: 'सहेजें',
    addStudent: 'छात्र जोड़ें', saveAttendance: 'उपस्थिति सहेजें', saveMarks: 'अंक सहेजें', addHomework: 'होमवर्क जोड़ें', publishNotice: 'नोटिस प्रकाशित करें', downloadReport: 'रिपोर्ट डाउनलोड करें', editBtn: 'बदलें', deleteBtn: 'हटाएँ', collectBtn: 'वसूलें', saveSettingsBtn: 'सेटिंग्स सहेजें', resetAllData: 'सारा डेटा रीसेट करें', resetPwTitle: 'रीसेट करने के लिए पासवर्ड डालें', resetPwHint: 'रीसेट करने से स्कूल का सारा डेटा हमेशा के लिए मिट जाएगा — छात्र, शिक्षक, फीस, उपस्थिति, परीक्षा, होमवर्क, नोटिस और रसीदें। यह वापस नहीं होगा।', resetConfirmMsg: 'इससे सारा डेटा हमेशा के लिए मिट जाएगा — छात्र, शिक्षक, फीस, उपस्थिति, परीक्षा, होमवर्क, नोटिस और रसीदें। यह वापस नहीं होगा।', resetConfirmTitle: 'रीसेट — क्या मिटाना है चुनें', resetPwLabel: 'अकाउंट पासवर्ड', resetPwWrong: 'गलत पासवर्ड — कुछ भी रीसेट नहीं हुआ।', resetPwGo: 'जाँचें और जारी रखें', resetNameTitle: 'पुष्टि के लिए स्कूल का नाम लिखें', resetNameHint: 'सब कुछ मिटने से पहले यह आखिरी कदम है। स्कूल का सही नाम लिखें।', resetNameLabel: 'स्कूल का नाम', resetNameWrong: 'यह नाम मेल नहीं खाता — कुछ भी रीसेट नहीं हुआ।', resetNameGo: 'रीसेट की पुष्टि करें', publishBtn: 'प्रकाशित करें', assignHw: 'होमवर्क सौंपें', saveStudentBtn: 'छात्र सहेजें',
    attOverview: 'उपस्थिति अवलोकन', todayAtt: 'आज की उपस्थिति', feeTrend: 'शुल्क संग्रह प्रवृत्ति', feeTrendSub: 'अप्रैल – मार्च (संग्रह बनाम बकाया)', feeTrendSub2: 'अप्रैल से मार्च (संग्रह बनाम बकाया)', recentAct: 'हाल की गतिविधियाँ', activityLog: 'गतिविधि लॉग', actLogSub: 'पूरी ऑडिट हिस्ट्री — नई पहले।', thDetails: 'विवरण', actBy: 'द्वारा', supYourName: 'आपका नाम', quickLinks: 'त्वरित लिंक', jumpTask: 'किसी कार्य पर जाएँ', enterMarks: 'अंक भरें', myHomework: 'मेरा होमवर्क', noticesH: 'नोटिस', latestNotices: 'स्कूल से नवीनतम', contactSub: 'हम एक कार्य दिवस के भीतर जवाब देते हैं', studentsReport: 'छात्र रिपोर्ट', feesReport: 'शुल्क रिपोर्ट', attReport: 'उपस्थिति रिपोर्ट', thName: 'नाम', thClass: 'कक्षा', thRoll: 'रोल', thGuardian: 'अभिभावक', thPhone: 'फ़ोन', thAtt: 'उप.', thFee: 'शुल्क', thAction: 'कार्रवाई', thReceipt: 'रसीद', thStudent: 'छात्र', thMonth: 'महीना', thAmount: 'राशि', thDate: 'तारीख', thStatus: 'स्थिति', thMarks: 'अंक', thResult: 'परिणाम', thRole: 'भूमिका',
    subReports: 'CSV रिपोर्ट डाउनलोड करें', subStudents: 'सेंट ज़ेवियर स्कूल, पटना', subAttendance: 'उपस्थिति दर्ज करें और देखें', subFees: 'शुल्क संग्रह और बकाया', subExams: 'परीक्षा और अंक प्रविष्टि', subHomework: 'होमवर्क सौंपें और देखें', subNotices: 'नोटिस बोर्ड',
    fSchoolName: 'स्कूल का नाम', fCity: 'शहर', fStudentName: 'छात्र का नाम', fClass: 'कक्षा', fRoll: 'रोल नंबर', fGuardian: 'अभिभावक', fPhone: 'फ़ोन', fTitle: 'शीर्षक', fSubject: 'विषय', fDue: 'देय तारीख', fMessage: 'संदेश', fPrincipal: 'प्रधानाचार्य / एडमिन', fEmail: 'ईमेल', fAddress: 'पता', fSession: 'शैक्षणिक सत्र',
    tLoggedIn: 'के रूप में लॉगिन हुआ', tAccountCreated: 'अकाउंट बन गया। स्वागत है, ', tInvalidCreds: 'ईमेल या पासवर्ड गलत है।', tFillAll: 'कृपया सभी फ़ील्ड भरें।', tInvalidEmail: 'कृपया सही ईमेल पता डालें।', tPwShort: 'पासवर्ड कम से कम 6 अक्षर का हो।', tPwMismatch: 'पासवर्ड मेल नहीं खाते।', tEmailTaken: 'इस ईमेल से अकाउंट पहले से बना है। कृपया लॉग इन करें।', tLoggedOut: 'लॉगआउट हो गया। फिर मिलते हैं!', tBackExit: 'बाहर निकलने के लिए बैक फिर से दबाएँ', tStudentAdded: 'छात्र जोड़ा गया।', tStudentUpdated: 'छात्र अपडेट हुआ।', tStudentDeleted: 'छात्र हटाया गया।', tAttSaved: 'उपस्थिति सहेजी गई', tMarksSaved: 'अंक सहेजे गए', tHwDone: 'होमवर्क पूर्ण के रूप में चिह्नित।', tHwNotDone: 'होमवर्क अपूर्ण के रूप में चिह्नित।', tHwAssigned: 'होमवर्क सौंपा गया।', tNoticePub: 'नोटिस प्रकाशित हुआ।', tReportDl: 'रिपोर्ट डाउनलोड हुई।', tSettingsSaved: 'सेटिंग्स सहेजी गईं।', tAllReset: 'सारा डेटा मिट गया — स्कूल अब खाली है।', tSessionChanged: 'शैक्षणिक सत्र बदला गया', tNoChanges: 'कोई बदलाव नहीं।', tFutureDate: 'भविष्य की तारीख नहीं चुन सकते — आज की तारीख दिखा रहे हैं।', tDueFuture: 'देय तारीख आज या आगे की होनी चाहिए।', tDemoLogin: 'डेमो खाता — नीचे एक-टैप लॉगिन इस्तेमाल करें।', tGoogleDemo: 'डेमो बिल्ड — कृपया एक-टैप डेमो लॉगिन इस्तेमाल करें।', tNoStudentData: 'कोई छात्र डेटा नहीं — अपने स्कूल एडमिन से छात्र जोड़ने को कहें।', tNoExams: 'अभी कोई परीक्षा नहीं है।', tNoHw: 'अभी कोई होमवर्क नहीं है।', tNoMarks: 'इस परीक्षा के लिए अभी कोई अंक नहीं भरे गए।', tNoMatch: 'कोई छात्र नहीं मिला।', tNotEntered: 'नहीं भरा गया', tCollectedFrom: 'से वसूला गया', tDupStudent: 'में पहले से मौजूद है', tNotSaved: 'सहेजा नहीं गया', tCheckMarks: 'अंक जाँचें', tStudentsWord: 'छात्र', tNoFeeData: 'अभी कोई शुल्क डेटा नहीं है।',
    searchStudent: 'छात्र खोजें…', viewAll: 'सभी देखें →', classAvg: 'कक्षा औसत', studentsMarked: 'छात्रों के अंक भरे गए', ofWord: 'में से', showingRec: 'दिखाए जा रहे हैं', ofRec: 'में से', recordsWord: 'रिकॉर्ड।', tapDone: 'पूरा होने पर बॉक्स पर टैप करें', myHwSub: 'पूरा होने पर बॉक्स पर टैप करें', tileAtt: 'उपस्थिति', tileFees: 'शुल्क', tileResults: 'परिणाम', tileHw: 'होमवर्क', doneSuffix: 'पूर्ण', presBtn: 'उपस्थित', absBtn: 'अनुपस्थित', lateBtn: 'देर से',
    qaAddStudent: 'छात्र जोड़ें', qaAddStudentD: 'नया प्रवेश', qaMarkAtt: 'उपस्थिति दर्ज करें', qaMarkAttD: 'आज का रजिस्टर', qaEnterMarks: 'अंक भरें', qaEnterMarksD: 'परीक्षा परिणाम', qaGenReport: 'रिपोर्ट बनाएँ', qaGenReportD: 'CSV डाउनलोड',
    dlStudents: 'छात्र CSV डाउनलोड करें', dlFees: 'शुल्क CSV डाउनलोड करें', dlAtt: 'उपस्थिति CSV डाउनलोड करें', repStudentsSub: 'नाम, कक्षा, रोल, अभिभावक, फ़ोन, उपस्थिति, शुल्क स्थिति', repFeesSub: 'छात्र, कक्षा, महीना, राशि, स्थिति — अप्रैल से मार्च',
    subSettingsS: 'स्कूल प्रोफ़ाइल', settingsSub: 'बदलें और सहेजें — ऑनलाइन होने पर बदलाव सर्वर पर सिंक होते हैं।',
    studentsW: 'छात्र', perSchool: 'प्रति स्कूल 2',
    raiseSupport: 'सहायता अनुरोध भेजें', supportNoted: 'सहायता अनुरोध दर्ज हुआ — हम आपको कॉल करेंगे।', collectedW: 'संग्रह', pendingW: 'बकाया', allW: 'सभी', editStudent: 'छात्र बदलें', feeTypeTuition: 'ट्यूशन', feeTypeAdmission: 'प्रवेश', feeTypeTransport: 'परिवहन', feeTypeExam: 'परीक्षा', feeTypeLibrary: 'पुस्तकालय', feeTypeActivity: 'गतिविधि', feeTypeComputer: 'कंप्यूटर लैब', feeTypeOther: 'अन्य', allTypes: 'सभी प्रकार', searchFee: 'नाम, नामांकन संख्या या कक्षा खोजें…', thEnr: 'नामांकन सं.', thType: 'प्रकार', feeByType: 'प्रकार के अनुसार शुल्क', feeByTypeSub: 'प्रति प्रकार संग्रह और बकाया, लाइव गणना।', addFee: 'शुल्क जोड़ें', addFeeSub: 'किसी भी छात्र के लिए एक शुल्क रिकॉर्ड जोड़ें।', feeStruct: 'शुल्क संरचना', feeStructSub: 'प्रति कक्षा मासिक राशि। Generate इसी से रिकॉर्ड बनाता है।', genFees: 'शुल्क बनाएँ', saveStruct: 'संरचना सहेजें', addRow: 'पंक्ति जोड़ें', customType: 'कस्टम…', typeCustomPh: 'शुल्क का प्रकार लिखें', fStudent: 'छात्र', fMonth: 'महीना', fType: 'शुल्क प्रकार', fAmount: 'राशि (₹)', fStatus: 'स्थिति', fDate: 'तारीख', printList: 'सूची छापें', printStmt: 'विवरण छापें', backFees: 'सभी शुल्क पर वापस', totalBilled: 'कुल बिल', totalPaid: 'जमा', totalPending: 'बकाया', feeRecsH: 'शुल्क रिकॉर्ड', feeProfileSub: 'इस छात्र के सभी शुल्क रिकॉर्ड एक ही जगह।', tFeeAdded: 'शुल्क रिकॉर्ड जुड़ गया।', delFeeMsg: 'यह बकाया शुल्क रिकॉर्ड हटाएँ?', tFeeDeleted: 'शुल्क रिकॉर्ड हटा दिया गया।', tPickStudent: 'कृपया छात्र चुनें।', tAmtPositive: 'राशि 0 से अधिक होनी चाहिए।', tTypeRequired: 'कृपया शुल्क का प्रकार लिखें।', tStructSaved: 'शुल्क संरचना सहेजी गई।', tStructAdded: 'संरचना पंक्ति जुड़ी।', tStructRemoved: 'संरचना पंक्ति हटाई गई।', tGenRecords: 'शुल्क रिकॉर्ड बने', tGenSkipped: 'पहले से थे', tGenNotAdmitted: 'अभी प्रवेश नहीं हुआ', tNoFeeRecs: 'इस छात्र के लिए अभी कोई शुल्क रिकॉर्ड नहीं है।', printTitle: 'शुल्क विवरण', printListTitle: 'शुल्क सूची', printGenOn: 'बनाया गया', closeW: 'बंद करें', saveFeeBtn: 'शुल्क सहेजें', photoLabel: 'छात्र की फ़ोटो', photoHint: 'फ़ोटो अपने आप छोटी हो जाती है (अधिकतम 512px, ~120KB)।', removePhoto: 'फ़ोटो हटाएँ', logoLabel: 'स्कूल का लोगो', logoHint: 'लोगो अपने आप छोटा हो जाता है (अधिकतम 256px, PNG में पारदर्शिता रहती है)।', removeLogo: 'लोगो हटाएँ', tPhotoTooBig: 'यह फ़ोटो छोटी करने के बाद भी बड़ी है। कृपया छोटी फ़ोटो चुनें।', tLogoTooBig: 'यह लोगो छोटा करने के बाद भी बड़ा है। कृपया छोटा लोगो चुनें।', tPhotoError: 'यह तस्वीर पढ़ी नहीं जा सकी। कृपया दूसरी फ़ाइल चुनें।', aadhaarHint: 'वैकल्पिक। केवल आखिरी 4 अंक सहेजे जाते हैं — पूरा नंबर कभी सहेजा नहीं जाता।', actActivate: 'छात्र सक्रिय करें', actAtt: 'उपस्थिति देखें', actDeactivate: 'छात्र निष्क्रिय करें', actDownload: 'विवरण डाउनलोड करें', actEdit: 'छात्र बदलें', actFees: 'शुल्क देखें', actIdCard: 'ID कार्ड छापें', actResults: 'परिणाम देखें', actTransfer: 'छात्र स्थानांतरित करें', actView: 'प्रोफ़ाइल देखें', actionsW: 'कार्रवाई', admNoAuto: 'स्वतः निर्मित', allClasses: 'सभी कक्षाएँ', allFeeSt: 'सभी शुल्क स्थितियाँ', allGenders: 'सभी लिंग', allSections: 'सभी अनुभाग', allSessions: 'सभी सत्र', allStatus: 'सभी स्थितियाँ', attPct: 'उपस्थिति', backDir: 'सूची पर वापस', cancelAdm: 'प्रवेश रद्द करें', cancelAdmMsg: 'यह प्रवेश रद्द करें? छात्र का रिकॉर्ड Cancelled स्थिति के साथ रखा जाएगा।', docMissing: 'प्राप्त नहीं', docStatus: 'प्राप्त', docsNote: 'दस्तावेज़ फ़ाइलें सर्वर चरण में अपलोड होंगी। यह सूची बताती है कि क्या प्राप्त हुआ है।', exportCsv: 'CSV निर्यात करें', fAadhaar: 'आधार संख्या (वैकल्पिक)', fAdmDate: 'प्रवेश तिथि', fAdmNo: 'प्रवेश संख्या', fBirthCert: 'जन्म प्रमाण पत्र', fBlood: 'रक्त समूह', fCategory: 'श्रेणी', fDistrict: 'जिला', fDob: 'जन्म तिथि', fDocsOther: 'अन्य दस्तावेज़ (नोट)', fFather: 'पिता का नाम', fGender: 'लिंग', fMother: 'माता का नाम', fOccupation: 'व्यवसाय', fParentEmail: 'अभिभावक ईमेल', fPhone2: 'दूसरा मोबाइल', fPin: 'पिन कोड', fPrevClass: 'पिछली कक्षा', fPrevSchool: 'पिछला स्कूल', fSection: 'अनुभाग', fState: 'राज्य', fTc: 'स्थानांतरण प्रमाण पत्र (TC)', fTcNo: 'TC संख्या', feeSt: 'शुल्क स्थिति', hwDone: 'पूर्ण', hwPend: 'बाकी', hwPending: 'होमवर्क बाकी', latestExam: 'हाल की परीक्षा', nextW: 'अगला', noActivity: 'अभी कोई गतिविधि दर्ज नहीं है।', noAttRecs: 'इस छात्र के लिए अभी कोई उपस्थिति रिकॉर्ड नहीं है।', noExamRecs: 'अभी कोई परीक्षा परिणाम नहीं है।', noHwRecs: 'इस कक्षा के लिए कोई होमवर्क रिकॉर्ड नहीं है।', openFees: 'शुल्क पेज खोलें', pgOf: 'का', pgPage: 'पृष्ठ', phase3W: 'Phase 3', prevW: 'पिछला', saveAddAnother: 'सहेजें और नया जोड़ें', saveDraft: 'ड्राफ़्ट सहेजें', secAcademic: 'शैक्षणिक विवरण', secDocs: 'दस्तावेज़', secParent: 'माता-पिता / अभिभावक विवरण', secPersonal: 'व्यक्तिगत विवरण', stActive: 'सक्रिय छात्र', stAvgAtt: 'औसत उपस्थिति', stBoys: 'लड़के', stByClass: 'कक्षा अनुसार छात्र', stByClassSub: 'प्रत्येक कक्षा-अनुभाग में छात्रों की संख्या।', stGenderDist: 'लड़के और लड़कियाँ', stGenderSub: 'पूरे स्कूल में लिंग वितरण।', stGirls: 'लड़कियाँ', stInactive: 'निष्क्रिय छात्र', stNewAdm: 'नए प्रवेश', stNotSpec: 'निर्दिष्ट नहीं', stPendFee: 'बकाया शुल्क वाले छात्र', stTotal: 'कुल छात्र', stuSearchPh: 'नाम, प्रवेश संख्या या मोबाइल खोजें…', tActMsg: 'छात्र सक्रिय करें', tActivated: 'छात्र सक्रिय हुआ।', tAdmCancelled: 'प्रवेश रद्द हुआ। रिकॉर्ड रखा गया है।', tAdmCreated: 'प्रवेश सहेजा गया। प्रवेश संख्या ', tCsvExported: 'छात्र सूची निर्यात हुई।', tDeactMsg: 'छात्र निष्क्रिय करें', tDeactivated: 'छात्र निष्क्रिय हुआ।', tDraftSaved: 'ड्राफ़्ट सहेजा गया।', tDupFound: 'मेल खाता छात्र पहले से मौजूद है: ', tInvalidAadhaar: 'आधार 12 अंकों का होना चाहिए (या आखिरी 4) — वैकल्पिक।', tInvalidMobile: 'सही 10 अंकों का मोबाइल नंबर डालें।', tInvalidPin: 'पिन कोड 6 अंकों का होना चाहिए।', tPickClass: 'कृपया कक्षा चुनें।', tReqFields: 'कृपया छात्र का नाम, मुख्य मोबाइल, कक्षा और अनुभाग भरें।', tStuCsvOne: 'छात्र का विवरण डाउनलोड हुआ।', tTransferred: 'छात्र स्थानांतरित हुआ।', tabAcademic: 'शैक्षणिक रिकॉर्ड', tabActivity: 'गतिविधि इतिहास', tabAttendance: 'उपस्थिति इतिहास', tabDocs: 'दस्तावेज़', tabFees: 'शुल्क इतिहास', tabHomework: 'होमवर्क रिकॉर्ड', tabOverview: 'सारांश', tabParent: 'अभिभावक जानकारी', tabPersonal: 'व्यक्तिगत जानकारी', tabResults: 'परीक्षा परिणाम', thAdmNo: 'प्रवेश सं.', thExam: 'परीक्षा', thFather: 'पिता का नाम', transferTitle: 'छात्र स्थानांतरण', transferTo: 'नई कक्षा और अनुभाग', idCardSoon: 'ID कार्ड जनरेटर Phase 3 में आएगा।',
    impTitle: 'छात्रों का बल्क आयात', impImportBtn: 'छात्र आयात करें', impTemplate: 'नमूना टेम्पलेट डाउनलोड करें', impTemplateSub: 'सिर्फ CSV प्रारूप — Excel (.xlsx) फ़ाइल यहाँ पढ़ी नहीं जा सकती। टेम्पलेट के कॉलम इस्तेमाल करें।', impChooseFile: 'CSV फ़ाइल चुनें', impPreview: 'आयात पूर्वावलोकन', impSummary: 'आयात सारांश', impValid: 'सही', impError: 'त्रुटि', impDuplicate: 'दोहरा', impReason: 'कारण', impConfirm: 'सही पंक्तियाँ आयात करें', impDone: 'पूर्ण', impNoRows: 'इस फ़ाइल में कोई पंक्ति नहीं मिली। कृपया टेम्पलेट जाँचें।', impBadHeader: 'यह फ़ाइल छात्र टेम्पलेट जैसी नहीं लगती — नाम वाला कॉलम नहीं मिला।', impNoFile: 'कृपया पहले CSV फ़ाइल चुनें।', impNoValid: 'आयात के लिए कोई सही पंक्ति नहीं है।', impImported: 'आयात हुए', impSkipped: 'छोड़े गए', impErrName: 'नाम आवश्यक है', impErrMobile: 'मोबाइल 10 अंकों का होना चाहिए', impErrMobile2: 'दूसरा मोबाइल 10 अंकों का होना चाहिए', impErrClass: 'कक्षा सही नहीं है', impErrSection: 'अनुभाग A, B या C होना चाहिए', impErrPin: 'पिन 6 अंकों का होना चाहिए', impErrAadhaar: 'आधार 12 अंकों का होना चाहिए', impErrDob: 'जन्म तिथि सही तारीख नहीं है', impErrAdmDate: 'प्रवेश तिथि सही तारीख नहीं है', impErrSession: 'सत्र सही नहीं है (जैसे 2025–26)', impErrGender: 'लिंग Boy, Girl या Other होना चाहिए', impErrBlood: 'रक्त समूह सही नहीं है', impErrCategory: 'श्रेणी General, OBC, SC, ST या Other होनी चाहिए', impErrEmail: 'अभिभावक ईमेल सही नहीं है', impErrRoll: 'रोल धनात्मक संख्या होनी चाहिए', impErrBool: 'Yes या No होना चाहिए', impErrDup: 'इसकी प्रतिलिपि', impErrDupFile: 'इस फ़ाइल में दोहरा', tImpDone: 'बल्क आयात पूर्ण हुआ।', tImpTemplate: 'नमूना टेम्पलेट डाउनलोड हुआ।',
    promoTitle: 'छात्रों को प्रोन्नत करें', promoBtn: 'छात्र प्रोन्नत करें', promoSingle: 'छात्र प्रोन्नत करें', promoFromSession: 'वर्तमान सत्र', promoFromClass: 'वर्तमान कक्षा', promoToSession: 'लक्ष्य सत्र', promoToClass: 'लक्ष्य कक्षा', promoToSection: 'लक्ष्य अनुभाग', promoSelectAll: 'सभी चुनें', promoSelectNone: 'कोई नहीं', promoSelected: 'चयनित', promoPromote: 'चयनित को प्रोन्नत करें', promoRetain: 'चयनित को रोकें', promoNoStudents: 'इस कक्षा और सत्र में कोई छात्र नहीं है।', promoNoSelect: 'कृपया कम से कम एक छात्र चुनें।', promoNoop: 'लक्ष्य कक्षा और सत्र वर्तमान जैसे ही हैं — बदलने को कुछ नहीं।', promoNoopRetain: 'लक्ष्य सत्र वर्तमान सत्र जैसा ही है — बदलने को कुछ नहीं।', promoDone: 'प्रोन्नति पूर्ण हुई।', promoPromoted: 'प्रोन्नत हुए', promoRetained: 'रोके गए', promoNote: 'उपस्थिति, शुल्क, परीक्षा अंक और होमवर्क इतिहास सुरक्षित रहता है।', promoSingleNote: 'एक छात्र की प्रोन्नति', promoSkipped: 'छोड़े गए (पहले ही स्थानांतरित)', promoNotEligible: 'केवल सक्रिय या निष्क्रिय छात्र ही प्रोन्नत हो सकते हैं।',
    idcPreview: 'ID कार्ड पूर्वावलोकन', idcPrint: 'छापें', idcPrintCards: 'ID कार्ड छापें', idcSelectAll: 'सभी चुनें', idcClearSel: 'चयन हटाएँ', idcReady: 'ID कार्ड छपाई के लिए तैयार', idcEmergency: 'आपातकालीन संपर्क', idcReturn: 'मिले तो कृपया लौटाएँ', idcNoQr: 'QR कोड नहीं बन सका।',
    authStudent: 'छात्र', authTeacher: 'शिक्षक', stuAdmNo: 'प्रवेश संख्या', stuPinLabel: 'छात्र PIN', stuLoginBtn: 'छात्र के रूप में लॉगिन करें', stuNote: 'छात्र लॉगिन स्कूल द्वारा दिए गए PIN से होता है। PIN न पता हो तो अपने स्कूल से पूछें।', stuSub: 'छात्र', stuDashboard: 'मेरी प्रोफ़ाइल', tInvalidStudent: 'प्रवेश संख्या या PIN गलत है।', stuPinField: 'छात्र लॉगिन PIN (वैकल्पिक)', stuPinPh: 'खाली छोड़ें — रैंडम PIN बनेगा', stuPinTitle: 'छात्र PIN', stuPinNow: 'वर्तमान छात्र PIN', stuPinSet: 'PIN सेट है', stuPinNone: 'कोई PIN नहीं है — इस छात्र के लिए छात्र लॉगिन उपलब्ध नहीं है।', stuPinNew: 'नया PIN (4–6 अंक)', stuPinSetBtn: 'PIN सेट करें', stuPinClear: 'PIN हटाएँ', tPinLen: 'PIN 4–6 अंकों का होना चाहिए।', tPinSet: 'छात्र PIN सेट हो गया।', tPinLocked: 'बहुत ज़्यादा गलत कोशिशें \u2014 15 मिनट बाद फिर कोशिश करें।', tPinCleared: 'छात्र PIN हटा दिया गया।', tPinAuto: 'PIN स्कूल द्वारा प्रवेश के समय दिया जाता है। छात्र भूल जाए तो यहाँ से नया PIN सेट करें।', tNotAllowed: 'आपकी लॉगिन इस सेक्शन को नहीं खोल सकती।', tOwnProfileOnly: 'आप केवल अपनी प्रोफ़ाइल देख सकते हैं।', todayW: 'आज', tchrLoginBtn: 'शिक्षक के रूप में लॉगिन करें', tchrNote: 'शिक्षक अकाउंट स्कूल एडमिन बनाता है।', tchrSub: 'शिक्षक', tchrDashboard: 'शिक्षक डैशबोर्ड', tchrNoDb: 'इस डिवाइस पर स्कूल का डेटा नहीं है — पहले स्कूल के डिवाइस पर लॉगिन करें।', teachers: 'शिक्षक', teachersSub: 'शिक्षक अकाउंट और वे जो कक्षाएँ पढ़ाते हैं।', tchrAdd: 'शिक्षक जोड़ें', tchrEdit: 'शिक्षक बदलें', tchrName: 'शिक्षक का नाम', tchrSubject: 'विषय', tchrClasses: 'पढ़ाई जाने वाली कक्षाएँ', tchrEmail: 'ईमेल', tchrPw: 'पासवर्ड', tchrPwHint: 'कम से कम 6 अक्षर। मौजूदा पासवर्ड रखने के लिए खाली छोड़ें।', tchrNoLogin: 'कोई लॉगिन नहीं', tchrSaved: 'शिक्षक सहेजा गया।', tchrNoClasses: 'कम से कम एक कक्षा चुनें।', tchrEmailTaken: 'यह ईमेल किसी और अकाउंट में इस्तेमाल हो रहा है।', tchrMyClasses: 'मेरी कक्षाएँ', tchrStudents: 'मेरी कक्षाओं के छात्र', tchrNoClassesYet: 'अभी कोई कक्षा नहीं दी गई है — स्कूल एडमिन से कक्षा देने को कहें।', admissions: 'प्रवेश आवेदन', admReqTitle: 'प्रवेश आवेदन', admReqApply: 'प्रवेश के लिए आवेदन करें', admReqFormTitle: 'प्रवेश हेतु आवेदन', admReqSchool: 'स्कूल', admReqNoSchool: 'इस डिवाइस पर अभी कोई स्कूल अकाउंट नहीं है — स्कूल के साइन अप के बाद ही आवेदन खुलेंगे।', admReqClassApply: 'किस कक्षा के लिए आवेदन', admReqSubmitted: 'आवेदन मिल गया। स्कूल इसकी समीक्षा करके आपसे संपर्क करेगा।', admReqApprove: 'स्वीकृत करें', admReqReject: 'अस्वीकृत करें', admReqView: 'देखें', admReqReason: 'कारण (वैकल्पिक)', admReqApproved: 'प्रवेश आवेदन स्वीकृत हुआ।', admReqRejected: 'प्रवेश आवेदन अस्वीकृत हुआ।', admReqPrefilled: 'प्रवेश आवेदन से भरा गया है — सहेजने से पहले विवरण जाँच लें।', admReqStatus: 'स्थिति', admReqSubmittedOn: 'जमा किया गया', admReqEmpty: 'अभी कोई प्रवेश आवेदन नहीं है।', admReqPending: 'लंबित', admReqApprovedSt: 'स्वीकृत', admReqRejectedSt: 'अस्वीकृत', admReqAll: 'सभी', tReqName: 'छात्र का नाम ज़रूरी है।', tReqClass: 'कृपया कक्षा चुनें।', tAdmReqFailed: 'उस स्कूल के लिए आवेदन सहेजा नहीं जा सका।', softDelMsg: 'इस छात्र को हटाएँ? रिकॉर्ड सहेजा रहेगा (सॉफ्ट डिलीट) — शुल्क, अंक, उपस्थिति और होमवर्क सहेजे रहेंगे।', tStudentRemoved: 'छात्र हटाया गया (रिकॉर्ड सहेजा रहा)।', tAdmReqInvalid: 'कृपया छात्र का नाम, 10 अंकों का मोबाइल और कक्षा भरें।',
    collectFeeBtn: 'शुल्क वसूलें', rcptTitle: 'शुल्क रसीद', rcptReceiptNo: 'रसीद संख्या', rcptDate: 'तारीख', rcptAdmNo: 'प्रवेश संख्या', rcptSession: 'सत्र', rcptName: 'नाम', rcptClass: 'कक्षा', rcptInstallment: 'किस्त', rcptCounter: 'काउंटर संख्या', rcptSlNo: 'क्र.सं.', rcptDesc: 'विवरण', rcptDue: 'देय', rcptCon: 'छूट', rcptPaid: 'जमा', rcptAdmissionFee: 'प्रवेश शुल्क', rcptTuitionFee: 'शिक्षण शुल्क', rcptCaution: 'जमानत राशि', rcptAnnual: 'वार्षिक शुल्क', rcptBusFee: 'बस शुल्क', rcptDues: 'बकाया', rcptPayModeTitle: 'भुगतान जानकारी', rcptPayMode: 'भुगतान माध्यम', rcptBank: 'बैंक', rcptNumber: 'संख्या', rcptTotal: 'कुल', rcptTotalWords: 'कुल (शब्दों में)', rcptComputerGen: 'यह कंप्यूटर द्वारा बनाई गई रसीद है। हस्ताक्षर की आवश्यकता नहीं है।', rcptParentCopy: 'अभिभावक प्रति', rcptCollectorSign: 'वसूलकर्ता के हस्ताक्षर', rcptIncludeBus: 'बस/परिवहन शामिल करें', rcptOtherFees: 'अन्य शुल्क', rcptAnnualHint: 'शुल्क वसूली रसीद पर दिखने वाली एकमुश्त और वार्षिक राशि। छिपाने के लिए 0 रखें।', payModeCash: 'नकद', payModeCheque: 'चेक', payModeUpi: 'UPI', payModeCard: 'कार्ड', payModeBank: 'बैंक ट्रांसफर', tFeeCollected: 'शुल्क वसूल लिया गया।', tCollectZero: 'वसूलने के लिए कुछ नहीं है — जमा राशि डालें।', tCollectSaved: 'शुल्क वसूल लिया गया — रसीद ', tCollectNotActive: 'यह छात्र सक्रिय नहीं है — शुल्क नहीं वसूला जा सकता।', rcptReceipts: 'रसीदें', rcptView: 'देखें', rcptPrint: 'प्रिंट / PDF सहेजें', rcptCollectAgain: 'फिर से वसूलें', rcptNoReceipts: 'इस छात्र की अभी कोई रसीद नहीं है।', rcptDraft: 'मसौदा — अभी सहेजा नहीं गया', rcptCollectSave: 'वसूलें और सहेजें', rcptNoLines: 'इस अवधि के लिए वसूलने को कुछ नहीं है — पहले शुल्क संरचना में राशि डालें।',
    sbNumPending: 'प्रवेश सहेजा गया। प्रवेश संख्या ऑनलाइन आने पर दी जाएगी।', sbNumPendingReceipt: 'शुल्क सहेजा गया। रसीद संख्या ऑनलाइन आने पर दी जाएगी।', sbStatusSessionExpired: 'सत्र समाप्त हो गया — कृपया दोबारा लॉग इन करें।', sbStatusNotLinked: 'अभी सर्वर से जुड़ा नहीं है — लॉग इन पर जुड़ जाएगा।', sbBackupDone: 'बैकअप पूरा हुआ।', sbBackupFailed: 'बैकअप पूरा नहीं हुआ — कनेक्शन जाँचकर फिर कोशिश करें।', sbLinkServer: 'सर्वर से जोड़ें', sbLinkDone: 'सर्वर अकाउंट जुड़ गया।', sbLinkFailed: 'सर्वर अकाउंट जुड़ा नहीं जा सका — कनेक्शन जाँचकर फिर कोशिश करें।', sbLinkPwTitle: 'सर्वर अकाउंट जोड़ें', sbNumAssigning: 'नंबर मिल रहा है…', tWrongPasswordServer: 'सर्वर अकाउंट के लिए पासवर्ड गलत है।', tCollectCapped: 'दी गई राशि बकाया से ज़्यादा थी — सिर्फ बकाया राशि ली गई।', resetPwHintServer: 'इससे सिर्फ इस डिवाइस का डेटा मिटेगा। सर्वर की कॉपी अगले सिंक पर वापस आ जाएगी, जब तक आप सर्वर भी न मिटाएँ।', resetConfirmMsgServer: 'सिर्फ इस डिवाइस का डेटा मिटाएँ? सर्वर की कॉपी अगले सिंक पर वापस आ जाएगी — हर जगह से मिटाने के लिए “सर्वर से भी मिटाएँ” चुनें।', resetDeviceOnly: 'सिर्फ यह डिवाइस', resetWipeServerBtn: 'सर्वर से भी मिटाएँ', resetWipeServerDone: 'सर्वर का डेटा मिट गया।', resetWipeServerFailed: 'सर्वर का डेटा मिटा नहीं जा सका — कुछ भी रीसेट नहीं हुआ। कनेक्शन जाँचकर फिर कोशिश करें।', supportQueued: 'सहायता अनुरोध सहेजा गया — ऑनलाइन आते ही भेजा जाएगा।', admReqQueued: 'आवेदन सहेजा गया — ऑनलाइन आते ही भेजा जाएगा।', admReqLoadingSchools: 'स्कूल लोड हो रहे हैं…', attNotMarked: 'दर्ज नहीं',
    createExam: 'परीक्षा बनाएँ', examName: 'परीक्षा का नाम', examTotal: 'कुल अंक', tExamCreated: 'परीक्षा बन गई।', tExamInvalid: 'कृपया परीक्षा का नाम, कक्षा और कुल अंक भरें।', editExam: 'परीक्षा बदलें', deleteExam: 'परीक्षा हटाएँ', restoreExam: 'वापस लाएँ', examDeletedH: 'हटाई गई परीक्षाएँ', examDelNote: 'हटाई गई परीक्षा के अंक रखे रहते हैं — वे हर जगह छिप जाते हैं और परीक्षा वापस लाने पर फिर दिखते हैं।', delExamMsg: 'यह परीक्षा हटाएँ? इसके अंक रखे रहेंगे पर दिखेंगे नहीं — परीक्षा वापस लाने पर अंक फिर दिखेंगे।', tExamDeleted: 'परीक्षा हटा दी गई। इसके अंक रखे हुए हैं — परीक्षा वापस लाने पर अंक फिर दिखेंगे।', tExamUpdated: 'परीक्षा अपडेट हो गई।', tExamRestored: 'परीक्षा वापस आ गई।', examClsLocked: 'कक्षा नहीं बदली जा सकती — अंक इसी कक्षा के हैं।', examMarksKept: 'पहले से डाले गए अंक वैसे ही रहेंगे — प्रतिशत नए कुल अंक से फिर निकलेगा।', tNoTeachers: 'अभी कोई शिक्षक नहीं है।',
    fullBackup: 'पूरा बैकअप और रिस्टोर', fullBackupSub: 'स्कूल का सारा डेटा एक फ़ाइल में डाउनलोड करें, या बैकअप फ़ाइल से वापस लाएँ। रिस्टोर करने से इस डिवाइस का डेटा बदल जाएगा।', backupExport: 'पूरा बैकअप डाउनलोड करें', backupImport: 'बैकअप फ़ाइल से रिस्टोर करें', tBackupExported: 'पूरा बैकअप डाउनलोड हो गया।', tBackupRestored: 'बैकअप रिस्टोर हो गया।', tBackupBadFile: 'यह फ़ाइल सही School Saathi बैकअप नहीं है — कुछ भी नहीं बदला।', backupRestoreConfirm: 'रिस्टोर करने से इस डिवाइस का मौजूदा सारा डेटा बैकअप फ़ाइल से बदल जाएगा। पहले आपके मौजूदा डेटा का सुरक्षा बैकअप डाउनलोड होगा।',
    sbStatusLocalOnly: 'सर्वर से जुड़ा नहीं है — डेटा इसी डिवाइस पर है। बैकअप के लिए लिंक करें।', sbLastAttempt: 'अंतिम प्रयास', sbSyncDetailsTitle: 'सिंक विवरण', sbSyncPendingUploads: 'बाकी अपलोड', sbSyncLastCycle: 'आखिरी साइकिल', sbSyncLastFlush: 'आखिरी फ्लश', sbSyncLastError: 'आखिरी गलती', sbSyncPushed: 'भेजे गए', sbSyncConflicts: 'टकराव', sbSyncLeftover: 'बचे हुए', sbSyncCalls: 'कॉल', sbSyncQueued: 'कतार में', sbSyncAndMore: 'और {n} और',
    waReminderBtn: 'WhatsApp रिमाइंडर', waNotifyBtn: 'अभिभावक को बताएं', waShareReceiptBtn: 'WhatsApp पर भेजें', waChatBtn: 'WhatsApp', waNotifyCol: 'सूचित करें',
    waNoNumber: 'इस छात्र का सही अभिभावक मोबाइल नंबर नहीं है — WhatsApp उपलब्ध नहीं है।',
    waOpened: 'WhatsApp खुल गया — संदेश भेजने के लिए WhatsApp में Send दबाएँ।',
    waNotAbsent: 'सिर्फ अनुपस्थित या देर से आए छात्रों को ही सूचित किया जा सकता है।',
    waFeeReminderMsg: 'नमस्ते, यह {school} है। {student} (कक्षा {cls}) की फीस {amount} {month} माह के लिए बाकी है। कृपया जल्द से जल्द जमा करें। धन्यवाद।',
    waAbsentMsg: 'नमस्ते, यह {school} है। {student} (कक्षा {cls}) आज ({date}) स्कूल नहीं आया/आई। कोई कारण हो तो कृपया बताएं। धन्यवाद।',
    waLateMsg: 'नमस्ते, यह {school} है। {student} (कक्षा {cls}) आज ({date}) स्कूल देर से आया/आई। कृपया समय पर भेजें। धन्यवाद।',
    waReceiptMsg: 'नमस्ते, यह {school} है। फीस रसीद {receipt} — {student} (कक्षा {cls}), {month} के लिए {amount} का भुगतान {date} को हुआ। धन्यवाद।',
    waGreetMsg: 'नमस्ते, यह {school} है। {student} (कक्षा {cls}) के बारे में बात करनी है।',
    waSchoolContact: 'स्कूल'
  }
};
function t(k) { return (I18N[state.lang] && I18N[state.lang][k]) || I18N.en[k] || k; }
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(function (el) {
    var v = t(el.getAttribute('data-i18n'));
    if (v) el.textContent = v;
  });
  document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
    var v = t(el.getAttribute('data-i18n-html'));
    if (v) el.innerHTML = v;
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
  });
}
function setLang(l) {
  state.lang = l;
  $('langEn').classList.toggle('on', l === 'en');
  $('langHi').classList.toggle('on', l === 'hi');
  var lo = $('langOne'); if (lo) lo.textContent = l === 'en' ? 'EN' : 'हिं';
  applyI18n();
  if (state.role) renderApp();
}
function toggleLang() { setLang(state.lang === 'en' ? 'hi' : 'en'); }

/* ================= auth & shell ================= */
function showView(which) {
  hideTip();
  ['login', 'app'].forEach(function (id) { $(id).classList.toggle('hidden', id !== which); });
  window.scrollTo(0, 0);
}
function showLogin() { showView('login'); try { $('sbStatus').textContent = sbStatusText(); } catch (e) {} $('loginId').focus(); }
function persistSession() {
  // The session lives in localStorage so it survives closing and reopening
  // the app (sessionStorage died with the tab/PWA, forcing a fresh login).
  // Phase 1 (CR-1/H-1): the stored session carries `at` — the time of
  // the interactive login. The 30-day max age is ABSOLUTE: re-persisting
  // (view changes, restores) keeps the original `at` when the account
  // is unchanged, so using the app never extends the lifetime. A fresh
  // `at` is stamped only when there is no stored session for this
  // account (fresh login, or a different account).
  try {
    if (state.role && state.user) {
      var at = Date.now();
      try {
        var prev = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
        if (prev && prev.role === state.role && prev.email === state.user.email && typeof prev.at === 'number' && !isNaN(prev.at)) at = prev.at;
      } catch (e) {}
      localStorage.setItem(SESSION_KEY, JSON.stringify({ role: state.role, email: state.user.email, view: state.view, at: at }));
    } else localStorage.removeItem(SESSION_KEY);
  } catch (e) { /* private mode — session just won't survive */ }
}
function clearStoredSession() {
  // Phase 1 (CR-1/H-1): drop every trace of the stored session — the
  // local session key (both storages) and the Supabase tokens.
  try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
  sbClearSession();
}
function loginAs(a, opts) {
  state.role = a.role; state.user = a; state.view = 'dashboard';
  DB_KEY = dbKeyFor(a);
  db = loadDB(a.role === 'school' ? a : null);
  showView('app'); renderApp();
  persistSession();
  lastBackAt = 0; histExiting = false;
  histArmGuard(); // fresh history for this account: [dashboard, guard] — back from the dashboard warns first, it never re-enters another account
  if (!opts || !opts.silent) toast(t('tLoggedIn') + ' ' + a.name);
}
// Phase 1 (CR-1/H-1): restoreSession is ASYNC now — it returns
// Promise<boolean>. A server-linked school session is validated against
// the server before loginAs when the device is online; offline boot is
// unchanged (no validation attempt, no forced logout).
function restoreSession() {
  try {
    var raw = null;
    try { raw = localStorage.getItem(SESSION_KEY); } catch (e) {}
    if (!raw) {
      // One-time migration: an older build kept the session in
      // sessionStorage. Adopt it once so nobody is logged out by the update.
      try {
        var old = sessionStorage.getItem(SESSION_KEY);
        if (old) {
          raw = old;
          try { localStorage.setItem(SESSION_KEY, old); } catch (e2) {}
          try { sessionStorage.removeItem(SESSION_KEY); } catch (e3) {}
        }
      } catch (e4) {}
    }
    if (!raw) return Promise.resolve(false);
    var sv = JSON.parse(raw);
    // Phase 1 (CR-1/H-1): absolute 30-day max age, counted from the
    // interactive login (persistSession never refreshes `at`). A session
    // stored before this change has no timestamp and is treated as
    // expired, so every pre-fix session needs one fresh login after the
    // update. `at` is not a signature — anyone who can edit localStorage
    // can forge it; the server check below is the real boundary for
    // online school accounts.
    if (typeof sv.at !== 'number' || isNaN(sv.at) || Date.now() - sv.at > SESSION_MAX_AGE_MS) {
      clearStoredSession();
      return Promise.resolve(false);
    }
    if (sv.role === 'student' && typeof sv.email === 'string' && sv.email.indexOf('student:') === 0) {
      // Student sessions are not in schoolSaathiAccounts: the session
      // email carries schoolUid + studentId (student:<uid>:<id>).
      // Restore by looking the student up in that school's DB. A cleared
      // PIN invalidates the session.
      var parts = sv.email.split(':');
      var stuKey = 'schoolSaathiDB_' + (parts[1] || '');
      var stuDb = readDbByKey(stuKey);
      if (!stuDb) return Promise.resolve(false);
      migrateV54(migrateV55(migrateV12(stuDb)));
      var stu = (stuDb.students || []).find(function (x) { return x.id === parts[2]; });
      if (stu && (stu.parentPinHash || stu.parentPin)) {
        DB_KEY = stuKey;
        loginAs({ role: 'student', name: stu.name, sub: t('stuSub') + ' • ' + stu.name, email: sv.email, uid: 'student-' + stu.id, studentId: stu.id, schoolUid: parts[1] }, { silent: true });
        state.view = 'dashboard';
        renderApp();
        return Promise.resolve(true);
      }
      return Promise.resolve(false);
    }
    var a = findAccount(sv.email);
    if (!a || a.role !== sv.role) return Promise.resolve(false);
    if (a.role === 'teacher' && !readDbByKey(dbKeyFor(a))) return Promise.resolve(false); // the school's data left this device — no DB to open
    // Shared tail for school + teacher restores (loginAs + view).
    function finishRestore() {
      loginAs(a, { silent: true });
      var ss = sbLoadSession();
      if (ss && ss.user_id && (!ss.email || ss.email === sv.email)) state.sb = { uid: ss.user_id, email: ss.email || sv.email };
      state.view = (NAV[a.role] || []).some(function (n) { return n[0] === sv.view; }) ? sv.view : 'dashboard';
      if (state.view !== 'dashboard') histReplaceTop({ view: state.view }); // drop the guard: the restored view sits on top
      renderApp();
      persistSession(); // re-persist AFTER applying the view — the stored view must match what the user sees (`at` is preserved, see persistSession)
      return true;
    }
    // Phase 1 (CR-1/H-1): a server-linked school session is validated
    // before loginAs — but ONLY when online. Offline boot never attempts
    // validation and never forces a logout. Local-only schools and
    // teachers keep the old local-only restore path.
    if (a.role === 'school' && sbIsOnline() && (a.sbUid || sbLoadSession())) {
      return sbValidateSchoolSession().then(function (valid) {
        if (!valid) {
          clearStoredSession();
          try { toast(t('sbStatusSessionExpired')); } catch (e) {}
          return false;
        }
        return finishRestore();
      });
    }
    return Promise.resolve(finishRestore());
  } catch (e) { return Promise.resolve(false); }
}
function switchAuth(tab) {
  var tabs = { login: ['tabLogin', 'loginForm', 'loginErr', 'loginId'], signup: ['tabSignup', 'signupForm', 'signupErr', 'suSchool'], student: ['tabStudent', 'studentForm', 'studentErr', 'studentAdmNo'], teacher: ['tabTeacher', 'teacherForm', 'teacherErr', 'teacherEmail'] };
  Object.keys(tabs).forEach(function (k) {
    var ids = tabs[k];
    var tb = $(ids[0]);
    if (tb) tb.classList.toggle('on', tab === k);
    $(ids[1]).classList.toggle('hidden', tab !== k);
    $(ids[2]).classList.add('hidden');
  });
  $('recoverForm').classList.add('hidden');
  $('resetForm').classList.add('hidden');
  // v47: "Forgot password?" only on the Log In tab (signup/student/teacher have their own flows).
  var fr47 = $('forgotRow');
  if (fr47) fr47.classList.toggle('hidden', tab !== 'login');
  // v35: the student form picks the school first — every school's first
  // student is ADM-2025-001, so a bare admission number matches the
  // wrong school (the same trap the v34 parent picker fixed).
  if (tab === 'student') fillSchoolPicker('studentSchool');
  setTimeout(function () { $(tabs[tab][3]).focus(); }, 50);
}
function togglePw(id, btn) {
  var el = $(id);
  if (!el) return;
  var show = el.type === 'password';
  el.type = show ? 'text' : 'password';
  if (btn) { btn.textContent = show ? '🙈' : '👁'; btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); }
  el.focus();
}
function fillSchoolPicker(selId) {
  var sel = $(selId);
  if (!sel) return;
  var schools = loadAccounts().filter(function (a) { return a.role === 'school'; }).filter(function (a) { return !!readDbByKey(dbKeyFor(a)); });
  var cur = sel.value;
  sel.innerHTML = schools.map(function (a) { return '<option value="' + esc(a.uid) + '">' + esc(a.school) + '</option>'; }).join('');
  if (cur && schools.some(function (a) { return a.uid === cur; })) sel.value = cur;
}
function findStudentByAdmNoInSchool(admNo, accountUid) {
  // v34 (P1-6) / v35: search ONE school's DB only. A device-wide scan
  // returns the first ADM-2025-001 on the device, which is a different
  // school's child.
  var want = String(admNo || '').trim().toLowerCase();
  if (!want) return null;
  var a = loadAccounts().filter(function (x) { return x.uid === accountUid; })[0];
  if (!a) return null;
  var key = dbKeyFor(a);
  var d = readDbByKey(key);
  if (!d) return null;
  migrateV54(migrateV55(migrateV12(d)));
  var found = null;
  (d.students || []).some(function (s) {
    if (String(s.admissionNo || '').trim().toLowerCase() === want) { found = { student: s, dbKey: key, db: d }; return true; }
    return false;
  });
  return found;
}
/* v54 (A1): local rate limit on student PIN guesses. 5 wrong attempts
   lock that student's login on this device for 15 minutes. The record
   lives in localStorage, so it survives reloads — but clearing
   localStorage resets it. This stops casual guessing, not a determined
   local attacker with device access (stated honestly, per the triage). */
var PIN_FAIL_KEY = 'schoolSaathiPinFails';
var PIN_MAX_FAILS = 5;
var PIN_LOCK_MS = 15 * 60 * 1000;
function pinFailKey(schoolUid, studentId) { return (schoolUid || '') + ':' + (studentId || ''); }
function pinFailsLoad() { try { var r = localStorage.getItem(PIN_FAIL_KEY); if (r) { var m = JSON.parse(r); if (m && typeof m === 'object') return m; } } catch (e) {} return {}; }
function pinFailsSave(m) { try { localStorage.setItem(PIN_FAIL_KEY, JSON.stringify(m)); } catch (e) {} }
function pinLockUntil(schoolUid, studentId) { var r = pinFailsLoad()[pinFailKey(schoolUid, studentId)]; if (r && r.lockedUntil && Date.now() < r.lockedUntil) return r.lockedUntil; return 0; }
function pinFailRecord(schoolUid, studentId) {
  var m = pinFailsLoad(); var k = pinFailKey(schoolUid, studentId); var r = m[k] || { n: 0, lockedUntil: 0 };
  r.n++;
  if (r.n >= PIN_MAX_FAILS) { r.lockedUntil = Date.now() + PIN_LOCK_MS; r.n = 0; }
  m[k] = r; pinFailsSave(m); return r.lockedUntil;
}
function pinFailClear(schoolUid, studentId) { var m = pinFailsLoad(); var k = pinFailKey(schoolUid, studentId); if (m[k]) { delete m[k]; pinFailsSave(m); } }
function doStudentLogin(e) {
  e.preventDefault();
  var adm = $('studentAdmNo').value.trim();
  var pin = $('studentPin').value.trim();
  var err = $('studentErr');
  var schoolUid = $('studentSchool') ? $('studentSchool').value : '';
  var found = schoolUid ? findStudentByAdmNoInSchool(adm, schoolUid) : null;
  // One generic error: never reveal whether the number or the PIN was wrong.
  var stu = found ? found.student : null;
  // v54 (A1): 5 wrong guesses lock this student's login on this device
  // for 15 minutes. The lock is checked before the PIN is compared.
  if (stu && pinLockUntil(schoolUid, stu.id)) {
    err.textContent = t('tPinLocked');
    err.classList.remove('hidden');
    return false;
  }
  var ok = false;
  if (stu && digitsOnly(pin).length >= 4) {
    if (stu.parentPinHash) ok = verifyPin(pin, stu);
    // Pre-v54 records still carry a plaintext parentPin: it verifies
    // once here, and the hash upgrade is persisted by loginAs, which
    // reloads the DB through loadDB -> migrateV54.
    else if (stu.parentPin) ok = digitsOnly(pin) === digitsOnly(stu.parentPin);
  }
  if (!found || !ok) {
    // Only a real student WITH a PIN counts toward the lockout — an
    // unknown admission number never locks anything.
    if (stu && pinHasPin(stu)) pinFailRecord(schoolUid, stu.id);
    err.textContent = t('tInvalidStudent');
    err.classList.remove('hidden');
    return false;
  }
  pinFailClear(schoolUid, stu.id);
  DB_KEY = found.dbKey;
  var acct = { role: 'student', name: found.student.name, sub: t('stuSub') + ' • ' + found.student.name, email: 'student:' + schoolUid + ':' + found.student.id, uid: 'student-' + found.student.id, studentId: found.student.id, schoolUid: schoolUid };
  err.classList.add('hidden');
  loginAs(acct);
  return false;
}
function doTeacherLogin(e) {
  e.preventDefault();
  var id = $('teacherEmail').value.trim().toLowerCase(), pw = $('teacherPw').value;
  var err = $('teacherErr');
  // Local-only login (v35): teacher accounts live in schoolSaathiAccounts
  // on this device, with no server account — no Supabase attempt.
  var a = findAccount(id);
  var chk = verifyPw(pw, a);
  var ok = a && a.role === 'teacher' && !!a.pwHash && chk.ok;
  if (ok && chk.legacy) upgradePwHash(a, pw); // v36: old djb2 hash verifies, then upgrades to salted SHA-256 on this login
  if (!ok) {
    err.textContent = t('tInvalidCreds');
    err.classList.remove('hidden');
    return false;
  }
  // The teacher opens the SCHOOL's DB — if it is not on this device
  // there is nothing to open (loginAs would seed a demo DB instead).
  if (!readDbByKey(dbKeyFor(a))) {
    err.textContent = t('tchrNoDb');
    err.classList.remove('hidden');
    return false;
  }
  err.classList.add('hidden');
  loginAs(a);
  return false;
}
function teacherRecord() {
  if (state.role !== 'teacher' || !state.user) return null;
  return db.teachers.find(function (x) { return x.id === state.user.teacherId; }) || null;
}
function teacherClasses() {
  var te = teacherRecord();
  if (!te) return [];
  return Array.isArray(te.classes) ? te.classes.slice() : (te.cls ? [te.cls] : []);
}
function canViewStudent(id) {
  // School: everything. Student: ONLY their own profile. Teacher: only
  // students in the classes they teach. Anyone else: nothing.
  if (state.role === 'school') return true;
  if (state.role === 'student') return !!state.user && id === state.user.studentId;
  if (state.role === 'teacher') {
    var s = db.students.find(function (x) { return x.id === id; });
    if (!s) return false;
    return teacherClasses().indexOf(s.cls) !== -1;
  }
  return false;
}
function teacherDashboard() {
  var te = teacherRecord();
  if (!te) return '<div class="card"><div class="empty">' + t('tNoStudentData') + '</div></div>';
  var myClasses = teacherClasses();
  var myStudents = db.students.filter(function (s) { return myClasses.indexOf(s.cls) !== -1 && isEnrolledStudent(s); });
  var today = todayIST();
  var attToday = 0;
  myClasses.forEach(function (c) {
    var recs = db.attendance[today + '|' + c] || {};
    Object.keys(recs).forEach(function (sid) { if (recs[sid] === 'Present') attToday++; });
  });
  var hwDue = db.homework.filter(function (h) { return myClasses.indexOf(h.cls) !== -1; }).length;
  var notices = db.notices.slice(0, 2).map(function (n) {
    return '<div class="notice"><b>' + esc(n.title) + '</b><span>' + esc(n.date) + '</span><p>' + esc(n.body) + '</p></div>';
  }).join('');
  var classTiles = myClasses.map(function (c) {
    var n = myStudents.filter(function (s) { return s.cls === c; }).length;
    return '<div class="tile blue"><div class="n">' + n + '</div><div class="l">' + esc(c) + '</div></div>';
  }).join('');
  return '<div class="phone"><div class="card"><div class="stu-hero">' + avatarHTML(null, te.name, 'avatar') + '</div>' +
    '<h3>' + esc(te.name) + '</h3><p>' + esc(te.subject || '') + ' • ' + esc(db.profile.name) + ', ' + esc(db.profile.city) + '</p></div>' +
    '<div class="tile-grid">' +
    '<div class="tile green"><div class="n">' + myClasses.length + '</div><div class="l">' + t('tchrMyClasses') + '</div></div>' +
    '<div class="tile yellow"><div class="n">' + myStudents.length + '</div><div class="l">' + t('tchrStudents') + '</div></div>' +
    '<div class="tile purple"><div class="n">' + attToday + '</div><div class="l">' + t('presBtn') + ' ' + t('todayW') + '</div></div>' +
    '<div class="tile blue"><div class="n">' + hwDue + '</div><div class="l">' + t('tileHw') + '</div></div>' +
    '</div></div>' +
    '<div class="card" style="margin-top:16px"><h3>' + t('tchrMyClasses') + '</h3><p class="card-sub">' + (myClasses.length ? esc(myClasses.join(', ')) : t('tchrNoClassesYet')) + '</p>' + (classTiles || '') + '</div>' +
    '<div class="card" style="margin-top:16px"><h3>' + t('noticesH') + '</h3><p class="card-sub">' + t('latestNotices') + '</p>' + notices + '</div></div>';
}
function doLogin(e) {
  e.preventDefault();
  var id = $('loginId').value.trim().toLowerCase(), pw = $('loginPw').value;
  var err = $('loginErr');
  if (!id || !pw) {
    err.textContent = t('tInvalidCreds');
    err.classList.remove('hidden');
    return false;
  }
  if (sbIsOnline()) {
    // Server first when we can reach it; the device account is the fallback
    // (offline, or the server says the password is wrong there).
    // NOTE: this returns false synchronously — the promise chain runs in the
    // background. Never return the promise: onsubmit treats a truthy
    // return as "submit the form" and the page would reload.
    sbSignIn(id, pw).then(function (res) {
      if (res.ok && res.data && res.data.access_token) { sbFinishSupabaseLogin(res.data, id, pw); return; }
      // v34 (P1-4): the server is reachable and REJECTED these
      // credentials. For an account that already has a server account
      // (sbUid), a 400 means the password is wrong — do NOT fall back to
      // the local account silently, or sync stays off without the user
      // knowing. Fall back only for local-only accounts (which have no
      // server account for the server to check) and for network errors.
      var acct = findAccount(id);
      if (acct && acct.sbUid && res.status === 400) {
        err.textContent = t('tWrongPasswordServer');
        err.classList.remove('hidden');
        return;
      }
      if (acct && acct.sbUid && res.status === 429) {
        err.textContent = t('sbTooMany');
        err.classList.remove('hidden');
        return;
      }
      sbLocalLogin(id, pw, err);
    }).catch(function () { sbLocalLogin(id, pw, err); });
  } else {
    sbLocalLogin(id, pw, err);
  }
  return false;
}
function doSignup(e) {
  e.preventDefault();
  var err = $('signupErr');
  var school = $('suSchool').value.trim(), name = $('suName').value.trim(),
      email = $('suEmail').value.trim().toLowerCase(), pw = $('suPw').value, pw2 = $('suPw2').value;
  function fail(msg) { err.textContent = msg; err.classList.remove('hidden'); return false; }
  if (!school || !name || !email || !pw || !pw2) return fail(t('tFillAll'));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(t('tInvalidEmail'));
  if (pw.length < 6) return fail(t('tPwShort'));
  if (pw !== pw2) return fail(t('tPwMismatch'));
  if (findAccount(email)) return fail(t('tEmailTaken'));
  var a = { uid: uniqueId('u'), name: name, school: school, email: email, pwHash: hashPwNew(pw), hashScheme: 'sha256', role: 'school', sub: 'School Admin • ' + school, created: new Date().toISOString().slice(0, 10), sbUid: null };
  var list = loadAccounts(); list.push(a); saveAccounts(list);
  err.classList.add('hidden');
  toast(t('tAccountCreated') + name);
  // Create the server account too, best-effort and in the background.
  // The local account above already works offline, so a server failure
  // (offline, rate-limited) never blocks signup.
  if (sbIsOnline()) {
    sbSignUp(email, pw, school, name).then(function (res) {
      if (res.status === 429) { toast(t('sbTooMany')); sbSetStatus('not-linked', 'rate-limited'); return; }
      if (!res.ok || !res.data || !res.data.user || !res.data.user.id) { sbSetStatus('not-linked', 'signup-failed'); return; }
      a.sbUid = res.data.user.id;
      var l2 = loadAccounts();
      for (var i = 0; i < l2.length; i++) if (l2[i].email === email) l2[i] = a;
      saveAccounts(l2);
      if (res.data.access_token) { sbStoreSession(res.data); state.sb = { uid: res.data.user.id, email: email }; }
      else toast(t('sbEmailConfirm'));
    }).catch(function () { sbSetStatus('not-linked', 'offline'); /* offline mid-flight — local account stands */ });
  }
  loginAs(a, { silent: true });
  return false;
}
function logout() {
  var sbUidBefore = state.sb && state.sb.uid; // v36: needed for the outbox check below, before the session is cleared
  var wasLocalOnlySchool = sbIsLocalOnlySchool(); // v37: captured before state is cleared — a local-only school logs out to the local-only line, never "Backed up"
  state.role = null; state.user = null; state.view = 'dashboard';
  state.feeStudent = null; state.feeSearch = ''; state.feeType = 'All'; state.feeFilter = 'All'; state.feeFormOpen = false; state.feePreselect = null;
  state.profileStudent = null; state.profileTab = 'overview'; state.stuPage = 1;
  state.admReqFilter = 'All';
  promoState = null; importState.rows = null; importState.result = null;
  try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
  // Sign out of the server too (best-effort) and drop the server session.
  try {
    var sbSess = sbLoadSession();
    if (sbSess && sbSess.access_token) sbSignOut(sbSess.access_token).catch(function () {});
  } catch (e2) {}
  sbClearSession();
  state.sb = null;
  sbSyncResetMemory(); // v31: drop the in-memory snapshot + pending flush timer (the persisted outbox/snapshot stay for the next login)
  sbSyncAutoStop(); // v32: stop the auto-pull interval (restarts on the next login)
  // v36 (logout-backup race): a cycle killed mid-flight by this logout
  // must not leave a transient "Syncing…" status on the login screen.
  // Pending outbox rows mean the backup will run on the next login; an
  // empty outbox means the cycle died after flushing, so "Backed up" is
  // the truthful state. A settled status (synced / failed / pending) is
  // left exactly as it was.
  try {
    // v37: a local-only school logs out to the local-only line — the
    // "Backed up" / "Pending" settle below is for server-linked schools
    // only. Forced unconditionally (not just from syncing/uploading):
    // a stale pre-v37 "Backed up" must not survive the logout.
    if (wasLocalOnlySchool) { sbSetStatus('local-only'); }
    else {
      var st0 = sbLoadStatus();
      if (st0 && (st0.state === 'syncing' || st0.state === 'uploading')) {
        var left = sbUidBefore ? sbOutboxLoad(sbUidBefore).length : 0;
        sbSetStatus(left ? 'pending' : 'synced');
      }
    }
  } catch (e3) {}
  lastBackAt = 0; histExiting = false;
  histReset('login'); // back after logout cannot re-enter the app
  $('loginId').value = ''; $('loginPw').value = '';
  $('studentAdmNo').value = ''; $('studentPin').value = '';
  $('teacherEmail').value = ''; $('teacherPw').value = '';
  $('page').innerHTML = '';
  showLogin();
  toast(t('tLoggedOut'));
}

var NAV = {
  school: [
    ['dashboard', '🏠', 'dashboard'], ['students', '🎒', 'students'], ['teachers', '👩‍🏫', 'teachers'], ['admissions', '📋', 'admissions'], ['attendance', '✅', 'attendance'],
    ['fees', '💰', 'fees'], ['exams', '📝', 'exams'], ['homework', '📚', 'homework'],
    ['notices', '📢', 'notices'], ['reports', '📄', 'reports'], ['activityLog', '📜', 'activityLog'], ['settings', '⚙️', 'settings']
  ],
  student: [
    ['dashboard', '🏠', 'dashboard'], ['homework', '📚', 'homework'], ['notices', '📢', 'notices']
  ],
  teacher: [
    ['dashboard', '🏠', 'dashboard'], ['attendance', '✅', 'attendance'], ['exams', '📝', 'exams'], ['homework', '📚', 'homework'], ['notices', '📢', 'notices']
  ]
};
var VIEW_TITLES = {
  dashboard: ['Dashboard', ''],
  settings: ['Settings', 'School settings'], reports: ['Reports', 'Download CSV reports'],
  activityLog: ['Activity Log', 'Full audit history'], teachers: ['Teachers', 'Teacher accounts & classes'],
  students: ['Student Management', 'St. Xavier School, Patna'], admissions: ['Admission Requests', 'New applications & approvals'], attendance: ['Attendance', 'Mark & view attendance'],
  fees: ['Fees', 'Fee collection & pending dues'], exams: ['Examinations', 'Exams & marks entry'],
  homework: ['Homework', 'Assign & track homework'], notices: ['Notices', 'Notice board']
};
/* ================= in-app history (Android back button) =================
   Views are swapped in place, so without history entries the Android back
   button exits the PWA at once. Every screen — top-level views AND sub-views
   (student profile, fee profile, collect page, saved receipt, promotion) —
   gets its own entry, so Back walks back through the screens actually seen.
   Entries are full states {view, sub?, guard?}; dedupe compares the whole
   state, never the view alone.
   Dashboard guard: after login the stack is [dashboard, guard]. Popping the
   guard only warns ("Press back again to exit") and re-pushes the guard; a
   second Back within 2s lets the press through, so the app exits. */
var lastBackAt = 0;
var histCur = null; // last known top history entry (full state), or null
var histExiting = false; // set while a programmatic exit-back is in flight
function histSupported() {
  try {
    return (typeof window !== 'undefined' && !!window.history && typeof window.history.pushState === 'function' && typeof window.history.replaceState === 'function');
  } catch (e) { return false; }
}
function histTopState() {
  try { if (window.history && window.history.state) return window.history.state; } catch (e) {}
  return histCur;
}
function histSameState(a, b) {
  if (!a || !b) return a === b;
  return a.view === b.view && (a.sub || null) === (b.sub || null) && !!a.guard === !!b.guard;
}
function histPush(st) {
  try {
    if (!histSupported()) return;
    var cur = histTopState();
    if (cur && cur.guard) { // navigation consumes the dashboard guard: replace it
      window.history.replaceState(st, '');
      histCur = st;
      return;
    }
    if (histSameState(cur, st)) return; // never push duplicate consecutive entries
    if (cur && cur.sub && cur.view === st.view && !st.sub) { // a list replaces its own sub-view
      window.history.replaceState(st, '');
      histCur = st;
      return;
    }
    window.history.pushState(st, '');
    histCur = st;
  } catch (e) {}
}
function histReplaceTop(st) {
  try {
    if (!histSupported()) return;
    window.history.replaceState(st, '');
    histCur = st;
  } catch (e) {}
}
function histReset(view) {
  try {
    if (!histSupported()) return;
    var st = { view: view || 'dashboard' };
    window.history.replaceState(st, '');
    histCur = st;
  } catch (e) {}
}
function histArmGuard() {
  // Stack becomes [dashboard, guard]: Back from the dashboard warns first.
  try {
    if (!histSupported()) return;
    window.history.replaceState({ view: 'dashboard' }, '');
    window.history.pushState({ view: 'dashboard', guard: 1 }, '');
    histCur = { view: 'dashboard', guard: 1 };
  } catch (e) {}
}
function histPushGuard() {
  try {
    if (!histSupported()) return;
    var st = { view: 'dashboard', guard: 1 };
    window.history.pushState(st, '');
    histCur = st;
  } catch (e) {}
}
function histExitBack() {
  // Second Back within 2s: let the press exit the app for real.
  histExiting = true;
  try { window.history.back(); } catch (e) {}
  setTimeout(function () { histExiting = false; }, 1000);
}
function clearHistSubState() {
  state.feeStudent = null; state.collectStudent = null; state.collectRecordId = null; state.savedReceiptId = null; collectDraft = null;
  state.profileStudent = null; promoState = null;
  state.feeFormOpen = false; state.feePreselect = null;
}
function applyHistState(v, sub) {
  // Restore a view (and optional sub-view) reached via Back/Forward.
  state.view = v;
  clearHistSubState();
  toggleSidebar(false);
  if (sub) {
    var parts = String(sub).split(':');
    if (parts[0] === 'profile') {
      if (v === 'fees') state.feeStudent = parts[1];
      else if (v === 'students') { state.profileStudent = parts[1]; state.profileTab = 'overview'; }
    } else if (parts[0] === 'collect' && v === 'fees') {
      var cs = db.students.find(function (x) { return x.id === parts[1]; });
      if (cs) { state.collectStudent = parts[1]; state.collectRecordId = parts[2] || null; state.feeStudent = parts[1]; collectDraft = newCollectDraft(parts[1], state.collectRecordId); }
    } else if (parts[0] === 'receipt' && v === 'fees') {
      var rc = (db.receipts || []).find(function (r) { return r.receiptNo === parts[1]; });
      if (rc) { state.collectStudent = rc.studentId; state.savedReceiptId = rc.receiptNo; state.feeStudent = rc.studentId; }
    } else if (parts[0] === 'promo' && v === 'students') {
      openPromotion(parts[1] || null, { noHist: true });
      persistSession();
      return;
    }
  }
  persistSession();
  renderApp();
}
function onPopState(ev) {
  if (!state.role || !state.user) return; // logged out: back cannot re-enter
  if (histExiting) return; // programmatic exit-back already in flight
  var prev = histCur;
  var st = ev && ev.state;
  histCur = st || null;
  var v = st && st.view;
  var sub = st && st.sub;
  if (prev && prev.guard) {
    // The guard entry was popped: a Back press while on the dashboard.
    if (state.view !== 'dashboard') { state.view = 'dashboard'; clearHistSubState(); persistSession(); toggleSidebar(false); renderApp(); }
    var now = Date.now();
    if (now - lastBackAt < 2000) { lastBackAt = 0; histExitBack(); return; } // second press: exit
    lastBackAt = now;
    toast(t('tBackExit'));
    histPushGuard(); // guard back on top, so the next press can exit
    return;
  }
  if (st && st.guard) {
    // Landed ON the guard entry (popped a view above it): we are on the dashboard.
    applyHistState('dashboard', null);
    return;
  }
  if (!v) {
    // Popped past the root entry.
    if (state.view !== 'dashboard') { applyHistState('dashboard', null); histArmGuard(); return; }
    var now2 = Date.now();
    if (now2 - lastBackAt < 2000) { lastBackAt = 0; histExitBack(); return; }
    lastBackAt = now2;
    toast(t('tBackExit'));
    histArmGuard();
    return;
  }
  var nav = NAV[state.role] || [];
  if (!nav.some(function (n) { return n[0] === v; })) { v = 'dashboard'; sub = null; }
  applyHistState(v, sub);
}
function histBack() {
  // In-page "← back" button: follow the history entry if this screen has
  // one, so Android Back and the on-screen back never disagree afterwards.
  // Returns true when a history back was triggered.
  if (histSupported() && histCur && histCur.sub) {
    try { window.history.back(); return true; } catch (e) {}
  }
  return false;
}
function backFromProfile() { if (histBack()) return; state.profileStudent = null; renderPage(); }
function backFromFeeProfile() { if (histBack()) return; state.feeStudent = null; renderPage(); }
function backFromReceipt() { if (histBack()) return; state.savedReceiptId = null; state.collectStudent = null; renderPage(); }
function go(view) {
  var nav = NAV[state.role] || [];
  var ok = nav.some(function (n) { return n[0] === view; });
  if (!ok) { toast(t('tNotAllowed')); state.view = 'dashboard'; }
  else state.view = view;
  if (state.view !== 'fees') { state.feeStudent = null; state.collectStudent = null; state.collectRecordId = null; state.savedReceiptId = null; collectDraft = null; }
  state.profileStudent = null;
  promoState = null; importState.rows = null; importState.result = null;
  persistSession();
  toggleSidebar(false);
  renderApp();
  histPush({ view: state.view });
}
function toggleSidebar(open) {
  var sb = $('sidebar'), sc = $('scrim');
  if (open === undefined) open = !sb.classList.contains('open');
  sb.classList.toggle('open', open);
  sc.classList.toggle('hidden', !open);
}
function renderApp() {
  var nav = NAV[state.role] || [];
  $('sideNav').innerHTML = nav.map(function (n) {
    return '<button class="' + (state.view === n[0] ? 'active' : '') + '" onclick="go(\'' + n[0] + '\')"><span class="ic">' + n[1] + '</span>' + esc(t(n[2])) + '</button>';
  }).join('');
  var u = state.user;
  var me = state.role === 'student' ? meStudent() : null;
  var whoPhoto = me ? me.photo : null;
  var schoolLogo = (db.profile && db.profile.logo) || null;
  var wa = $('whoAvatar');
  if (schoolLogo) { wa.innerHTML = '<img src="' + esc(schoolLogo) + '" alt="">'; wa.classList.add('has-logo'); wa.classList.remove('has-photo'); }
  else if (whoPhoto) { wa.innerHTML = '<img src="' + esc(whoPhoto) + '" alt="">'; wa.classList.add('has-photo'); wa.classList.remove('has-logo'); }
  else { wa.textContent = initialsOf(u.name); wa.classList.remove('has-photo'); wa.classList.remove('has-logo'); }
  $('whoName').textContent = u.name;
  $('whoRole').textContent = u.sub;
  var prof = db.profile;
  var bc = $('sideBrandCap');
  if (bc) bc.innerHTML = prof.logo ? '<img class="side-logo" src="' + esc(prof.logo) + '" alt="">' : '🎓';
  $('sideSchoolInfo').innerHTML = '<b style="color:#fff">' + esc(prof.name) + '</b><br>' + esc(prof.city) + ', Bihar';
  var sess = $('sessionSel');
  if (!sess.options.length) {
    ['2025–26', '2024–25', '2026–27'].forEach(function (s) {
      var o = document.createElement('option'); o.value = s; o.textContent = s; sess.appendChild(o);
    });
  }
  sess.value = prof.session;
  sess.disabled = (state.role !== 'school');
  var vt = VIEW_TITLES[state.view] || ['Dashboard', ''];
  $('topTitle').textContent = t(state.view) === state.view ? vt[0] : t(state.view);
  if (state.view === 'dashboard') $('topTitle').textContent = t('dashboard');
  $('topCrumb').textContent = state.role === 'school' ? prof.name + ', ' + prof.city : (state.role === 'student' ? t('stuDashboard') : t('tchrDashboard'));
  renderPage();
}
function changeSession(v) {
  if (state.role !== 'school') return;
  db.profile.session = v; saveDB(db);
  toast(t('tSessionChanged') + ' ' + v);
}
function renderPage() {
  var p = $('page');
  hideTip();
  var pages = state.role === 'school' ? PAGE_SCHOOL : state.role === 'teacher' ? PAGE_TEACHER : PAGE_STUDENT;
  var fn = pages[state.view];
  if (!fn) {
    // A view this role may not open refuses with a clear message instead
    // of rendering another role's data (go() normally prevents this —
    // this is the direct state.view path).
    p.innerHTML = '<div class="card"><div class="empty">' + t('tNotAllowed') + '</div></div>';
    return;
  }
  p.innerHTML = fn();
  if (state.view === 'fees' && !state.feeStudent && state.feeSearch) filterFees(state.feeSearch);
  animateDonuts(p); animateBars(p);
}

function hideTip() { var tip = $('chartTip'); if (tip) { tip.style.opacity = '0'; tip.textContent = ''; } }
/* ================= chart tooltip (mouse + touch) ================= */
document.addEventListener('pointerover', function (e) {
  var el = e.target.closest ? e.target.closest('[data-tip]') : null;
  var tip = $('chartTip');
  if (!el) { tip.style.opacity = '0'; return; }
  tip.textContent = el.getAttribute('data-tip');
  tip.style.opacity = '1';
});
document.addEventListener('pointermove', function (e) {
  var tip = $('chartTip');
  if (tip.style.opacity === '1') {
    tip.style.left = Math.min(window.innerWidth - 190, e.clientX + 12) + 'px';
    tip.style.top = (e.clientY + 14) + 'px';
  }
});
document.addEventListener('pointerout', function (e) {
  if (e.target.closest && e.target.closest('[data-tip]')) $('chartTip').style.opacity = '0';
});

/* ================= shared cards (used by the school dashboard too) ================= */
function statCard(ic, cls, label, value, chg, chgCls, countOpts) {
  var co = countOpts || {};
  // v26: every stat card renders its final value as plain text — no
  // count-up animation anywhere. A count-up card shows intermediate
  // values while it animates, so a read taken mid-animation disagrees
  // with the same figure elsewhere (the Student Management Average
  // Attendance card read 74% on its way to 100%; the profile Overview
  // tile had the same fault and went static in v25). A settled value
  // is shown from the first paint, so every read agrees.
  var v = (typeof value === 'number') ? value.toLocaleString('en-IN') : value;
  var valHtml = '<div class="val">' + (co.prefix || '') + v + (co.suffix || '') + '</div>';
  return '<div class="stat"><div class="ic ' + cls + '">' + ic + '</div><div><div class="lbl">' + esc(label) + '</div>' + valHtml +
    (chg ? '<div class="chg ' + chgCls + '">' + chg + '</div>' : '') + '</div></div>';
}
function resetPwCheck(pw) {
  // Password gate for Reset All Data: the signed-in school account's own password.
  if (!state.role || !state.user) return false;
  if (state.role === 'school') {
    var a = findAccount(state.user.email);
    return !!a && verifyPw(pw, a).ok;
  }
  return false; // student / teacher roles never reset
}
function resetAllData() {
  if (!state.role || !state.user || state.role !== 'school') return;
  // v34 (P1-5): on a server account the old wording lied — the data
  // returns on the next sync. Say so, and offer the server wipe after
  // the double gate.
  var onServer = !!(state.sb && state.sb.uid);
  openModal('<h3>' + t('resetPwTitle') + '</h3><p style="color:var(--muted);font-size:14px">' + t(onServer ? 'resetPwHintServer' : 'resetPwHint') + '</p>' +
    '<form onsubmit="return submitResetPw(event)"><div class="form-grid"><div class="full"><label>' + t('resetPwLabel') + '</label>' +
    '<input id="resetPwInput" type="password" autocomplete="current-password" placeholder="••••••••"></div></div>' +
    '<div id="resetPwErr" class="err hidden"></div>' +
    '<div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button>' +
    '<button class="btn danger" type="submit">' + t('resetPwGo') + '</button></div></form>');
  setTimeout(function () { var el = $('resetPwInput'); if (el) el.focus(); }, 50);
}
function submitResetPw(e) {
  if (e) e.preventDefault();
  var pw = $('resetPwInput') ? $('resetPwInput').value : '';
  if (!resetPwCheck(pw)) {
    var err = $('resetPwErr');
    if (err) { err.textContent = t('resetPwWrong'); err.classList.remove('hidden'); }
    return false;
  }
  closeModal();
  openResetNamePrompt();
  return false;
}
// v30: second gate for Reset All Data. The password alone is too easy to
// tap through — after it passes, the school must type its EXACT name.
// A mismatch aborts with a clear message and deletes nothing. The name
// is never shown in the prompt (typing it from memory is the point).
function openResetNamePrompt() {
  openModal('<h3>' + t('resetNameTitle') + '</h3><p style="color:var(--muted);font-size:14px">' + t('resetNameHint') + '</p>' +
    '<form onsubmit="return submitResetName(event)"><div class="form-grid"><div class="full"><label>' + t('resetNameLabel') + '</label>' +
    '<input id="resetNameInput" autocomplete="off" placeholder="' + t('resetNameLabel') + '"></div></div>' +
    '<div id="resetNameErr" class="err hidden"></div>' +
    '<div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button>' +
    '<button class="btn danger" type="submit">' + t('resetNameGo') + '</button></div></form>');
  setTimeout(function () { var el = $('resetNameInput'); if (el) el.focus(); }, 50);
}
function submitResetName(e) {
  if (e) e.preventDefault();
  var typed = ($('resetNameInput') ? $('resetNameInput').value : '').trim();
  if (typed !== (db.profile.name || '').trim()) {
    var err = $('resetNameErr');
    if (err) { err.textContent = t('resetNameWrong'); err.classList.remove('hidden'); }
    return false;
  }
  closeModal();
  // v34 (P1-5): a server account gets a choice — wipe this device only
  // (the server copy returns on the next sync) or wipe the server too.
  if (state.sb && state.sb.uid) { openResetServerChoice(); return false; }
  confirmModal(t('resetConfirmMsg'), resetAllConfirmed);
  return false;
}
function openResetServerChoice() {
  openModal('<h3>' + t('resetConfirmTitle') + '</h3><p style="color:var(--muted);font-size:14px">' + t('resetConfirmMsgServer') + '</p>' +
    '<div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button>' +
    '<button type="button" class="btn" onclick="closeModal();confirmModal(t(\'resetConfirmMsg\'), resetAllConfirmed)">' + t('resetDeviceOnly') + '</button>' +
    '<button type="button" class="btn danger" onclick="closeModal();resetAllServerWipe()">' + t('resetWipeServerBtn') + '</button></div>');
}
function sbClearServerSchool(localUid) {
  var m = sbServerSchoolMap();
  delete m[localUid];
  try { localStorage.setItem(SB_SCHOOL_MAP_KEY, JSON.stringify(m)); } catch (e) {}
}
function sbWipeServerSchool(token) {
  // v34 (P1-5): the server-side wipe for Reset All Data. Calls the
  // SECURITY DEFINER ss_wipe_school RPC (the owner cannot DELETE the
  // ss_schools row directly — that policy is admin-only). Resolves
  // { done: true } when there is nothing on the server to wipe either.
  var act = sbSyncActive();
  if (!act) return Promise.resolve({ done: false, reason: 'no-session' });
  var schoolId = sbServerSchoolMap()[act.account.uid];
  var idP = schoolId ? Promise.resolve(schoolId) : sbGetServerSchoolId(act.uid, token).then(function (row) { return row ? row.id : null; });
  return idP.then(function (sid) {
    if (!sid) return { done: true, reason: 'no-server-school' };
    return sbRest('POST', 'rpc/ss_wipe_school', token, { p_school_id: sid }).then(function (r) {
      if (!r.ok) throw new Error('wipe-' + (r.status || 'fail'));
      return { done: true, reason: 'ok' };
    });
  });
}
function resetAllServerWipe() {
  // Behind the same double gate (password + exact school name) as the
  // device-only reset. The server wipe runs FIRST: if it fails, nothing
  // is reset locally either, so the two copies never disagree.
  if (!state.sb || !state.sb.uid) { resetAllConfirmed(); return; }
  sbSyncAutoStop();
  sbSyncWithLock(function () {
    return sbGetValidToken().then(function (tok) {
      if (!tok) throw new Error('no-token');
      return sbWipeServerSchool(tok);
    });
  }).then(function (r) {
    if (r && r.done) {
      try { localStorage.removeItem(SB_MIGRATED_KEY + ':' + state.sb.uid); } catch (e) {}
      sbClearServerSchool(state.user.uid);
      resetAllConfirmed();
      toast(t('resetWipeServerDone'));
    } else {
      toast(t('resetWipeServerFailed'));
      sbSyncAutoStart();
      renderApp();
    }
  }).catch(function () {
    toast(t('resetWipeServerFailed'));
    sbSyncAutoStart();
    renderApp();
  });
}
function resetAllConfirmed() {
  // v20: reset means a REAL reset — wipe EVERYTHING to zero. What survives:
  // the school profile (name/city/principal/phone/email/address/session/
  // logo — the school's identity and login are untouched) and the
  // fee-structure defaults (6th ₹800 … 10th ₹1500, which Generate needs).
  // One-time fee amounts (Admission/Caution/Annual/Bus) go back to 0 and
  // must be re-entered in Fee Structure.
  var keepProfile = db.profile;
  db = emptyDb(keepProfile, []); // v28: no platform network list to preserve anymore
  // v31: a reset wipes THIS DEVICE only. Clear the pending outbox, the
  // server-id map and the sync snapshot for this account, so stale queued
  // changes cannot re-upload the deleted data. The server copy is NOT
  // wiped by this path: the next sync (server wins) restores it. A
  // server-side wipe is offered separately (resetAllServerWipe) behind
  // the same double gate — it runs first and only then calls this.
  if (state.sb && state.sb.uid) { sbOutboxClear(state.sb.uid); sbSrvIdsClear(state.sb.uid); }
  if (state.user) sbSnapClear(state.user.uid);
  sbSyncResetMemory();
  saveDB(db);
  state.view = 'dashboard';
  state.feeStudent = null; state.feeSearch = ''; state.feeType = 'All'; state.feeFilter = 'All'; state.feeFormOpen = false; state.feePreselect = null;
  state.profileStudent = null; state.profileTab = 'overview'; state.stuPage = 1;
  state.collectStudent = null; state.collectRecordId = null; state.savedReceiptId = null; collectDraft = null;
  state.admReqFilter = 'All';
  promoState = null; importState.rows = null; importState.result = null;
  renderApp();
  persistSession();
  toast(t('tAllReset'));
  // v34 (P1-5): the server-wipe path stops the auto interval before
  // wiping — restart it here so the 30s auto-pull keeps running.
  if (state.sb && state.sb.uid) sbSyncAutoStart();
}
function openSupportForm() {
  openModal('<h3>' + t('raiseSupport') + '</h3><p style="color:var(--muted);font-size:14px">' + t('contactSub') + '</p>' +
    '<form onsubmit="return submitSupportRequest(event)"><div class="form-grid">' +
    '<div><label>' + t('supYourName') + '</label><input id="fSupName" value="' + esc(state.user ? state.user.name : '') + '"></div>' +
    '<div class="full"><label>' + t('fMessage') + '</label><input id="fSupMsg"></div></div>' +
    '<div id="supErr" class="err hidden"></div>' +
    '<div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button>' +
    '<button class="btn" type="submit">' + t('raiseSupport') + '</button></div></form>');
}
function submitSupportRequest(e) {
  if (e) e.preventDefault();
  var name = ($('fSupName') ? $('fSupName').value : '').trim();
  var msg = ($('fSupMsg') ? $('fSupMsg').value : '').trim();
  if (!name || !msg) { var err = $('supErr'); if (err) { err.textContent = t('tFillAll'); err.classList.remove('hidden'); } return false; }
  // v30: the request is stored on this device first, always. When the
  // school has a server session it is ALSO posted to ss_support_requests.
  // v34 (P1-7): a failed or offline post is QUEUED and retried on the
  // next cycle — the user is told it will send when online, not that it
  // was "noted". There is still no Super Admin list or dashboard card in
  // the app; the owner reads the requests on the server until the Play
  // Store admin UI.
  var req = { id: uniqueId('sr'), ts: new Date().toISOString(), name: name, message: msg, status: 'Open', by: state.user ? state.user.name : '' };
  var list = [];
  try { list = JSON.parse(localStorage.getItem('schoolSaathiSupportRequests') || '[]'); } catch (e2) { list = []; }
  if (!Array.isArray(list)) list = [];
  list.unshift(req);
  if (list.length > 50) list.length = 50;
  localStorage.setItem('schoolSaathiSupportRequests', JSON.stringify(list));
  if (!sbIsOnline() || !state.sb || !state.sb.uid) {
    sbSupportQueue(req);
    closeModal();
    toast(t('supportQueued'));
    renderApp();
    return false;
  }
  sbPostSupportRequest(req).then(function (ok) { if (!ok) sbSupportQueue(req); });
  closeModal();
  toast(t('supportNoted'));
  renderApp();
  return false;
}
/* ================= SCHOOL ADMIN pages ================= */
function schoolDashboard() {
  var ft = feeTotals(), ta = todayAtt();
  var acts = db.activities.map(function (a) {
    // v26: real relative time from the entry's timestamp. Entries that
    // predate timestamps (seed + old stored entries) show no time at
    // all rather than a fabricated one.
    var when = relTime(a.ts);
    return '<div class="act"><div class="ic" style="background:var(--' + (a.bg === 'green' ? 'green' : a.bg === 'blue' ? 'blue' : 'orange') + '-soft)">' + a.icon + '</div><div><b>' + esc(a.title) + '</b><span>' + esc(a.sub) + (when ? ' • ' + esc(when) : '') + '</span></div></div>';
  }).join('');
  var logoHtml = db.profile.logo ? '<img class="dash-logo" src="' + esc(db.profile.logo) + '" alt="">' : '';
  return '<div class="page-head"><div class="prof-head">' + logoHtml + '<div><h2>' + t('schoolDashboard') + '</h2><p>' + esc(db.profile.name) + ', ' + esc(db.profile.city) + '</p></div></div>' +
    '<div class="toolbar"><button class="btn sm" onclick="downloadReportCSV(\'fees\')">⬇ ' + t('downloadReport') + '</button></div></div>' +
  '<div class="stats">' +
    statCard('🎒', 'blue', t('totalStudents'), db.students.length, '', 'up') +
    statCard('👩‍🏫', 'green', t('totalTeachers'), db.teachers.length, '', 'up') +
    statCard('💰', 'orange', t('feeCollected'), ft.collected, '', 'up', { prefix: '₹' }) +
    statCard('⏰', 'red', t('pendingFee'), ft.pending, '', 'down', { prefix: '₹' }) +
  '</div>' +
  '<div class="grid2"><div class="card"><h3>' + t('attOverview') + '</h3><p class="card-sub">' + t('todayAtt') + '</p><div class="donut-wrap">' +
    donutSVG([{ value: ta.present, color: GREEN, label: t('presBtn'), pct: donutPct(ta.present, ta.total) }, { value: ta.absent, color: RED, label: t('absBtn'), pct: donutPct(ta.absent, ta.total) }, { value: ta.late, color: ORANGE, label: t('lateBtn'), pct: donutPct(ta.late, ta.total) }], 190, donutPct(ta.present, ta.total) + '%', t('todayAtt')) +
    '<div class="legend"><div class="row"><span class="dot" style="background:' + GREEN + '"></span>' + t('presBtn') + '<b>' + num(ta.present) + '</b></div>' +
    '<div class="row"><span class="dot" style="background:' + RED + '"></span>' + t('absBtn') + '<b>' + num(ta.absent) + '</b></div>' +
    '<div class="row"><span class="dot" style="background:' + ORANGE + '"></span>' + t('lateBtn') + '<b>' + num(ta.late) + '</b></div></div>' +
  '</div></div>' +
  '<div class="card"><h3>' + t('feeTrend') + '</h3><p class="card-sub">' + feeRangeLabel() + ' (' + t('collectedW') + ' / ' + t('pendingW') + ')</p><div class="chart-box">' + barChartSVG(feeChartData()) + '</div><p class="muted" style="margin-top:8px"><span style="color:' + BLUE + '">■</span> ' + t('collectedW') + ' &nbsp; <span style="color:' + ORANGE + '">■</span> ' + t('pendingW') + '</p></div></div>' +
  '<div class="grid2"><div class="card"><div class="head-row"><div><h3>' + t('recentAct') + '</h3></div><a href="#" onclick="go(\'activityLog\');return false">' + t('viewAll') + '</a></div><div class="act-list">' + acts + '</div></div>' +
  '<div class="card"><h3>' + t('quickLinks') + '</h3><p class="card-sub">' + t('jumpTask') + '</p><div class="qa-grid">' +
    '<div class="qa" onclick="go(\'students\')"><div class="ic">🎒</div><b>' + t('qaAddStudent') + '</b><span>' + t('qaAddStudentD') + '</span></div>' +
    '<div class="qa" onclick="go(\'attendance\')"><div class="ic">✅</div><b>' + t('qaMarkAtt') + '</b><span>' + t('qaMarkAttD') + '</span></div>' +
    '<div class="qa" onclick="go(\'exams\')"><div class="ic">📝</div><b>' + t('qaEnterMarks') + '</b><span>' + t('qaEnterMarksD') + '</span></div>' +
    '<div class="qa" onclick="go(\'reports\')"><div class="ic">📄</div><b>' + t('qaGenReport') + '</b><span>' + t('qaGenReportD') + '</span></div>' +
  '</div></div></div>';
}
/* ================= Activity / Audit Log (v24) =================
   The dashboard "Recent Activities" card only shows the last few
   db.activities entries (collections, attendance saves, notices) — and
   its "View All" link was dead. The real audit trail lives in
   db.auditLog (logAudit: fee collections, fee deletions, admissions,
   transfers, promotions, PIN changes...), newest first. This page
   lists every audit entry so nothing — including a fee deletion —
   is invisible. */
function activityLogPage() {
  var rows = (db.auditLog || []).slice().sort(function (a, b) { return a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0; });
  var trs = rows.map(function (a) {
    var when = (a.ts || '').replace('T', ' ').slice(0, 19);
    return '<tr><td style="white-space:nowrap">' + esc(when) + '</td><td><b>' + esc(a.action) + '</b></td><td>' + esc(a.details || '') + '</td><td>' + esc(a.actor || '') + '</td></tr>';
  }).join('');
  return '<div class="page-head"><div><h2>' + t('activityLog') + '</h2><p>' + t('actLogSub') + '</p></div>' +
    '<div class="toolbar"><button class="btn ghost" onclick="go(\'dashboard\')">← ' + t('dashboard') + '</button></div></div>' +
    '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>' + t('thDate') + '</th><th>' + t('thAction') + '</th><th>' + t('thDetails') + '</th><th>' + t('actBy') + '</th></tr></thead><tbody>' +
    (trs || '<tr><td colspan="4"><div class="empty">' + t('noActivity') + '</div></td></tr>') + '</tbody></table></div></div>';
}
function studentsPage() {
  if (state.profileStudent) return studentProfilePage(state.profileStudent);
  if (promoState) return promotionPage();
  var st = studentStats();
  var list = stuSorted(stuFiltered());
  var pages = stuPageCount(list);
  var rows = stuPageRows(list);
  var sortArrow = function (col) { return state.stuSort === col ? (state.stuSortDir === 1 ? ' ▲' : ' ▼') : ''; };
  var trs = rows.map(function (s) {
    var fs = studentFeeStatus(s.id);
    var stt = s.status || 'Active';
    var badgeCls = stt === 'Active' ? 'green' : stt === 'Inactive' ? 'grey' : stt === 'Draft' ? 'blue' : 'red';
    return '<tr><td class="sel-col"><input type="checkbox" ' + ((state.stuSel || {})[s.id] ? 'checked' : '') + ' onchange="toggleStuSel(\'' + s.id + '\', this.checked)" aria-label="' + esc(s.name) + '"></td><td>' + avatarHTML(s.photo, s.name, 'mini-avatar') + '<button class="linklike" onclick="openStudentProfile(\'' + s.id + '\')">' + esc(s.name) + '</button></td>' +
      '<td>' + esc(s.numPending ? t('sbNumAssigning') : (s.admissionNo || '—')) + '</td><td>' + esc(s.cls) + '</td><td>' + s.roll + '</td><td>' + esc(s.fatherName || s.guardian) + '</td><td>' + esc(s.phone) + '</td><td>' + studentAttPct(s) + '%</td>' +
      '<td><span class="badge ' + (fs === 'Paid' ? 'green' : fs === 'Pending' ? 'orange' : 'grey') + '">' + fs + '</span></td>' +
      '<td><span class="badge ' + badgeCls + '">' + stt + '</span></td>' +
      '<td><button class="btn ghost sm" onclick="stuActions(\'' + s.id + '\')">⋮ ' + t('actionsW') + '</button></td></tr>';
  }).join('');
  var opt = function (vals, cur, allLabel) {
    return ['All'].concat(vals).map(function (v) {
      return '<option value="' + v + '" ' + (cur === v ? 'selected' : '') + '>' + (v === 'All' ? allLabel : v) + '</option>';
    }).join('');
  };
  var from = list.length ? (state.stuPage - 1) * STU_PAGE_SIZE + 1 : 0;
  var selCount = stuSelCount();
  var allPageSel = rows.length > 0 && rows.every(function (s) { return !!(state.stuSel || {})[s.id]; });
  var to = Math.min(list.length, state.stuPage * STU_PAGE_SIZE);
  return '<div class="page-head"><div><h2>' + t('students') + '</h2><p>' + list.length + ' ' + t('ofWord') + ' ' + db.students.length + ' ' + t('studentsW') + '</p></div>' +
    '<div class="toolbar"><input id="stuSearchInput" placeholder="' + t('stuSearchPh') + '" value="' + esc(state.stuSearch) + '" oninput="onStuSearch(this)" style="min-width:200px">' +
    '<select onchange="state.stuClass=this.value;state.stuPage=1;renderPage()">' + opt(CLASSES, state.stuClass, t('allClasses')) + '</select>' +
    '<select onchange="state.stuSection=this.value;state.stuPage=1;renderPage()">' + opt(SECTIONS, state.stuSection, t('allSections')) + '</select>' +
    '<select onchange="state.stuSession=this.value;state.stuPage=1;renderPage()">' + opt(sessionOptions(), state.stuSession, t('allSessions')) + '</select>' +
    '<select onchange="state.stuGender=this.value;state.stuPage=1;renderPage()">' + opt(GENDERS, state.stuGender, t('allGenders')) + '</select>' +
    '<select onchange="state.stuFee=this.value;state.stuPage=1;renderPage()">' + opt(['Paid', 'Pending', '—'], state.stuFee, t('allFeeSt')) + '</select>' +
    '<select onchange="state.stuStatus=this.value;state.stuPage=1;renderPage()">' + opt(STU_STATUSES, state.stuStatus, t('allStatus')) + '</select>' +
    '<button class="btn ghost" onclick="exportStudentsCSV()">⬇ ' + t('exportCsv') + '</button>' +
    '<button class="btn ghost" onclick="openImportModal()">📥 ' + t('impImportBtn') + '</button>' +
    '<button class="btn ghost" onclick="openPromotion()">⬆️ ' + t('promoBtn') + '</button>' +
    '<button class="btn" onclick="studentForm()">+ ' + t('addStudent') + '</button></div></div>' +
    '<div class="stats">' +
    statCard('👥', 'blue', t('stTotal'), st.total, '', 'up') +
    statCard('✅', 'green', t('stActive'), st.active, '', 'up') +
    statCard('⏸️', 'blue', t('stInactive'), st.inactive, '', 'up') +
    statCard('🆕', 'orange', t('stNewAdm'), st.newAdm, '', 'up') +
    statCard('⏰', 'red', t('stPendFee'), st.pendFee, '', 'down') +
    statCard('📊', 'blue', t('stAvgAtt'), st.avgAtt, '', 'up', { suffix: '%' }) +
    '</div>' +
    '<div class="grid2" style="margin-top:16px"><div class="card"><h3>' + t('stByClass') + '</h3><p class="muted">' + t('stByClassSub') + '</p><div style="margin-top:10px">' + classBarsHTML(st.byClass) + '</div></div>' +
    '<div class="card"><h3>' + t('stGenderDist') + '</h3><p class="muted">' + t('stGenderSub') + '</p><div style="display:flex;align-items:center;gap:16px;margin-top:10px">' +
    donutSVG([{ value: st.boys, color: BLUE, label: t('stBoys'), pct: donutPct(st.boys, st.total) }, { value: st.girls, color: '#EC4899', label: t('stGirls'), pct: donutPct(st.girls, st.total) }, { value: st.unspec, color: '#94A3B8', label: t('stNotSpec'), pct: donutPct(st.unspec, st.total) }], 150, String(st.total), t('studentsW')) +
    '<div><div class="type-row"><b>' + t('stBoys') + '</b><span>' + st.boys + '</span></div>' +
    '<div class="type-row"><b>' + t('stGirls') + '</b><span>' + st.girls + '</span></div>' +
    '<div class="type-row"><b>' + t('stNotSpec') + '</b><span>' + st.unspec + '</span></div></div></div></div></div>' +
    (selCount ? '<div class="card id-bulk-bar"><span><b>' + selCount + '</b> ' + t('promoSelected') + '</span><span style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" onclick="printIdCardsBulk()">🪪 ' + t('idcPrintCards') + ' (' + selCount + ')</button><button class="btn ghost sm" onclick="clearStuSel()">' + t('idcClearSel') + '</button></span></div>' : '') +
    '<div class="card" style="margin-top:16px"><div class="tbl-wrap"><table><thead><tr>' +
    '<th class="sel-col"><input type="checkbox" ' + (allPageSel ? 'checked' : '') + ' onchange="toggleStuSelAll(this.checked)" aria-label="' + t('idcSelectAll') + '"></th>' +
    '<th onclick="sortStu(\'name\')" style="cursor:pointer">' + t('thName') + sortArrow('name') + '</th>' +
    '<th>' + t('thAdmNo') + '</th>' +
    '<th onclick="sortStu(\'class\')" style="cursor:pointer">' + t('thClass') + sortArrow('class') + '</th>' +
    '<th>' + t('thRoll') + '</th><th>' + t('thFather') + '</th><th>' + t('thPhone') + '</th>' +
    '<th onclick="sortStu(\'att\')" style="cursor:pointer">' + t('thAtt') + sortArrow('att') + '</th>' +
    '<th>' + t('thFee') + '</th><th>' + t('thStatus') + '</th><th>' + t('actionsW') + '</th></tr></thead><tbody>' +
    (trs || '<tr><td colspan="11"><div class="empty">' + t('tNoMatch') + '</div></td></tr>') + '</tbody></table></div>' +
    '<div class="toolbar" style="margin-top:12px;justify-content:space-between"><span class="muted">' + t('showingRec') + ' ' + from + '–' + to + ' ' + t('ofRec') + ' ' + list.length + ' ' + t('studentsW') + '</span>' +
    '<span><button class="btn ghost sm" ' + (state.stuPage <= 1 ? 'disabled' : '') + ' onclick="state.stuPage--;renderPage()">← ' + t('prevW') + '</button> ' +
    '<span class="muted">' + t('pgPage') + ' ' + state.stuPage + ' ' + t('pgOf') + ' ' + pages + '</span> ' +
    '<button class="btn ghost sm" ' + (state.stuPage >= pages ? 'disabled' : '') + ' onclick="state.stuPage++;renderPage()">' + t('nextW') + ' →</button></span></div></div>';
}
var admEditingId = null;
function suggestRoll() {
  if (admEditingId) return;
  var cls = ($('fStCls') ? $('fStCls').value : '') + '-' + ($('fStSec') ? $('fStSec').value : 'A');
  if ($('fStRoll')) $('fStRoll').value = nextRoll(cls);
}
var admPrefill = null; // admission request being converted into an admission
function studentForm(id) {
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
  pendingPhoto = null;
  admEditingId = id || null;
  var s = id ? db.students.find(function (x) { return x.id === id; }) : null;
  var pf = (!s && admPrefill) ? admPrefill : null;
  var reqId = pf ? pf.id : '';
  var d = s ? (s.documents || {}) : {};
  var clsPart = s ? classPartOf(s.cls) : '6th';
  var secPart = s ? sectionOf(s.cls) : 'A';
  var clsOpts = classParts().map(function (c) { return '<option ' + (c === clsPart ? 'selected' : '') + '>' + c + '</option>'; }).join('');
  var secOpts = SECTIONS.map(function (x) { return '<option ' + (x === secPart ? 'selected' : '') + '>' + x + '</option>'; }).join('');
  var sessOpts = SESSIONS.map(function (x) { return '<option ' + ((s ? s.session : db.profile.session) === x ? 'selected' : '') + '>' + x + '</option>'; }).join('');
  var genOpts = [''].concat(GENDERS).map(function (g) { return '<option value="' + g + '" ' + (((s && s.gender === g) || (pf && pf.gender === g)) ? 'selected' : '') + '>' + (g || '—') + '</option>'; }).join('');
  var bloodOpts = [''].concat(BLOOD_GROUPS).map(function (b) { return '<option value="' + b + '" ' + ((s && s.bloodGroup === b) ? 'selected' : '') + '>' + (b || '—') + '</option>'; }).join('');
  var catOpts = [''].concat(CATEGORIES).map(function (c) { return '<option value="' + c + '" ' + ((s && s.category === c) ? 'selected' : '') + '>' + (c || '—') + '</option>'; }).join('');
  if (pf) {
    clsPart = pf.classApply || clsPart;
    admPrefill = null; // consumed into the form; the link now lives in fStAdmReq
  }
  // v33: for a server account the number is minted from the server on
  // save — the local peek could show a number another device already
  // owns, so the form shows Auto-generated instead.
  var admNo = s ? (s.numPending ? t('sbNumAssigning') : (s.admissionNo || '')) : (sbSyncActive() ? t('admNoAuto') : nextAdmNo(true));
  var admDate = s ? (s.admissionDate || '') : todayIST();
  var rollVal = s ? s.roll : nextRoll(clsPart + '-' + secPart);
  openModal('<h3>' + (s ? t('editStudent') : t('addStudent')) + '</h3>' +
    '<div id="fStErr" class="err hidden"></div>' +
    '<form onsubmit="return saveStudent(event,\'' + (id || '') + '\')"><div class="form-grid">' +
    '<div class="full sec-title">' + t('secPersonal') + '</div>' +
    '<input type="hidden" id="fStAdmReq" value="' + esc(reqId) + '">' +
    (pf ? '<div class="full"><p class="muted">' + t('admReqPrefilled') + '</p></div>' : '') +
    '<div><label>' + t('fStudentName') + ' *</label><input id="fStName" required value="' + esc(s ? s.name : (pf ? pf.name : '')) + '" placeholder="e.g. Aarav Kumar"></div>' +
    '<div><label>' + t('fDob') + '</label><input id="fStDob" type="date" value="' + esc(s ? (s.dob || '') : (pf ? (pf.dob || '') : '')) + '"></div>' +
    '<div><label>' + t('fGender') + '</label><select id="fStGender">' + genOpts + '</select></div>' +
    '<div><label>' + t('fBlood') + '</label><select id="fStBlood">' + bloodOpts + '</select></div>' +
    '<div><label>' + t('fCategory') + '</label><select id="fStCategory">' + catOpts + '</select></div>' +
    '<div><label>' + t('fPin') + '</label><input id="fStPin" inputmode="numeric" value="' + esc(s ? (s.pin || '') : '') + '" placeholder="800001"></div>' +
    '<div class="full"><label>' + t('fAddress') + '</label><input id="fStAddress" value="' + esc(s ? (s.address || '') : '') + '" placeholder="House no., street, area"></div>' +
    '<div><label>' + t('fState') + '</label><input id="fStState" value="' + esc(s ? (s.state || '') : '') + '" placeholder="Bihar"></div>' +
    '<div><label>' + t('fDistrict') + '</label><input id="fStDistrict" value="' + esc(s ? (s.district || '') : '') + '" placeholder="Gopalganj"></div>' +
    '<div class="full"><label>' + t('photoLabel') + '</label><div class="photo-row"><span id="fStPhotoPrev">' + photoPrevHTML(s ? s.photo : null, s ? s.name : '') + '</span>' +
    '<input type="file" id="fStPhoto" accept="image/*" onchange="onStudentPhoto(this)">' +
    '<button type="button" class="btn ghost sm" onclick="clearStudentPhoto()">' + t('removePhoto') + '</button></div>' +
    '<p class="muted">' + t('photoHint') + '</p></div>' +
    '<div class="full sec-title">' + t('secAcademic') + '</div>' +
    '<div><label>' + t('fAdmNo') + '</label><input value="' + esc(admNo) + '" disabled><p class="muted">' + t('admNoAuto') + '</p></div>' +
    '<div><label>' + t('fAdmDate') + '</label><input id="fStAdmDate" type="date" value="' + esc(admDate) + '"></div>' +
    '<div><label>' + t('fSession') + '</label><select id="fStSession">' + sessOpts + '</select></div>' +
    '<div><label>' + t('fClass') + ' *</label><select id="fStCls" onchange="suggestRoll()">' + clsOpts + '</select></div>' +
    '<div><label>' + t('fSection') + ' *</label><select id="fStSec" onchange="suggestRoll()">' + secOpts + '</select></div>' +
    '<div><label>' + t('fRoll') + '</label><input id="fStRoll" type="number" min="1" value="' + rollVal + '" required></div>' +
    '<div><label>' + t('fPrevSchool') + '</label><input id="fStPrevSchool" value="' + esc(s ? (s.previousSchool || '') : (pf ? (pf.previousSchool || '') : '')) + '"></div>' +
    '<div><label>' + t('fPrevClass') + '</label><input id="fStPrevClass" value="' + esc(s ? (s.previousClass || '') : '') + '"></div>' +
    '<div class="full sec-title">' + t('secParent') + '</div>' +
    '<div><label>' + t('fFather') + '</label><input id="fStFather" value="' + esc(s ? (s.fatherName || '') : '') + '" placeholder="Mr. Sharma"></div>' +
    '<div><label>' + t('fMother') + '</label><input id="fStMother" value="' + esc(s ? (s.motherName || '') : '') + '" placeholder="Mrs. Sharma"></div>' +
    '<div><label>' + t('fGuardian') + '</label><input id="fStG" value="' + esc(s ? s.guardian : (pf ? pf.guardianName : '')) + '" placeholder="Mr. Sharma"></div>' +
    '<div><label>' + t('fPhone') + ' *</label><input id="fStPh" value="' + esc(s ? s.phone : (pf ? pf.phone : '')) + '" placeholder="98XXXXXXXX"></div>' +
    '<div><label>' + t('fPhone2') + '</label><input id="fStPh2" value="' + esc(s ? (s.mobile2 || '') : '') + '" placeholder="98XXXXXXXX"></div>' +
    '<div><label>' + t('fParentEmail') + '</label><input id="fStParentEmail" type="email" value="' + esc(s ? (s.parentEmail || '') : '') + '" placeholder="parent@email.com"></div>' +
    '<div><label>' + t('stuPinField') + '</label><input id="fStPinLogin" inputmode="numeric" maxlength="6" value="" placeholder="' + t('stuPinPh') + '"></div>' +
    '<div><label>' + t('fOccupation') + '</label><input id="fStOccupation" value="' + esc(s ? (s.occupation || '') : '') + '" placeholder="e.g. Farmer"></div>' +
    '<div class="full sec-title">' + t('secDocs') + '</div>' +
    '<div><label class="check"><input type="checkbox" id="fStBirthCert" ' + (d.birthCert ? 'checked' : '') + '> ' + t('fBirthCert') + '</label></div>' +
    '<div><label class="check"><input type="checkbox" id="fStTc" ' + (d.tc ? 'checked' : '') + '> ' + t('fTc') + '</label></div>' +
    '<div><label>' + t('fTcNo') + '</label><input id="fStTcNo" value="' + esc(d.tcNumber || '') + '"></div>' +
    '<div><label>' + t('fAadhaar') + '</label><input id="fStAadhaar" inputmode="numeric" value="' + esc(s ? (s.aadhaar || '') : '') + '" placeholder="12-digit (optional)"><p class="muted">' + t('aadhaarHint') + '</p></div>' +
    '<div class="full"><label>' + t('fDocsOther') + '</label><input id="fStDocsOther" value="' + esc(d.other || '') + '"></div>' +
    '<div class="full"><p class="muted">' + t('docsNote') + '</p></div>' +
    '</div><div class="actions" style="flex-wrap:wrap">' +
    (s ? '<button type="button" class="btn danger" onclick="cancelAdmission(\'' + s.id + '\')">' + t('cancelAdm') + '</button>' : '') +
    '<button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button>' +
    '<button type="button" class="btn ghost" onclick="return saveStudent(event,\'' + (id || '') + '\',\'draft\')">' + t('saveDraft') + '</button>' +
    '<button type="button" class="btn ghost" onclick="return saveStudent(event,\'' + (id || '') + '\',\'another\')">' + t('saveAddAnother') + '</button>' +
    '<button class="btn" type="submit">' + t('saveStudentBtn') + '</button></div></form>', true);
}
function saveStudent(e, id, mode) {
  if (state.role !== 'school') { toast(t('tNotAllowed')); return false; }
  e.preventDefault();
  mode = mode || 'active';
  var errEl = $('fStErr');
  function fail(msg) { if (errEl) { errEl.textContent = msg; errEl.classList.remove('hidden'); } toast(msg); return false; }
  var fval = function (fid) { var el = $(fid); return el ? (el.value || '') : ''; };
  var name = fval('fStName').trim();
  var clsRaw = fval('fStCls');
  var secRaw = fval('fStSec');
  var cls = clsRaw.indexOf('-') !== -1 ? clsRaw : (clsRaw + '-' + (secRaw || 'A'));
  var phone = fval('fStPh').trim();
  if (!name || !phone || !clsRaw) return fail(t('tReqFields'));
  if (digitsOnly(phone).length !== 10) return fail(t('tInvalidMobile'));
  var pin = fval('fStPin').trim();
  if (pin && !/^\d{6}$/.test(pin)) return fail(t('tInvalidPin'));
  var pinLogin = digitsOnly(fval('fStPinLogin'));
  if (pinLogin && (pinLogin.length < 4 || pinLogin.length > 6)) return fail(t('tPinLen'));
  var aadhaar = digitsOnly(fval('fStAadhaar'));
  // v36: a fresh 12-digit number is accepted but only its last 4 are
  // stored; a 4-digit value (the stored last 4, shown on edit) saves
  // as-is. The full number is never persisted anywhere.
  if (aadhaar && aadhaar.length !== 12 && aadhaar.length !== 4) return fail(t('tInvalidAadhaar'));
  var admDateVal = fval('fStAdmDate');
  var dob = fval('fStDob');
  var data = { name: name, cls: cls, roll: parseInt(fval('fStRoll'), 10) || 1,
    guardian: fval('fStG').trim() || '—', phone: phone,
    dob: dob, gender: fval('fStGender'), bloodGroup: fval('fStBlood'),
    category: fval('fStCategory'), address: fval('fStAddress').trim(),
    state: fval('fStState').trim(), district: fval('fStDistrict').trim(), pin: pin,
    session: fval('fStSession') || db.profile.session,
    admissionDate: admDateVal || todayIST(),
    previousSchool: fval('fStPrevSchool').trim(),
    previousClass: fval('fStPrevClass').trim(),
    fatherName: fval('fStFather').trim(),
    motherName: fval('fStMother').trim(),
    mobile2: fval('fStPh2').trim(),
    parentEmail: fval('fStParentEmail').trim(),
    occupation: fval('fStOccupation').trim(),
    aadhaar: aadhaarLast4(aadhaar),
    documents: { birthCert: $('fStBirthCert') ? !!$('fStBirthCert').checked : false,
      tc: $('fStTc') ? !!$('fStTc').checked : false,
      tcNumber: fval('fStTcNo').trim(),
      other: fval('fStDocsOther').trim() } };
  // Edit with a blank date field keeps the stored date (never fabricate one on edit).
  if (id && !admDateVal) { var ex0 = db.students.find(function (x) { return x.id === id; }); if (ex0) data.admissionDate = ex0.admissionDate || ''; }
  var dup = findDupStudent(data, id || null);
  if (dup) return fail(t('tDupFound') + dup.name + ' (' + (dup.admissionNo || dup.enr || '') + ' • ' + dup.cls + ')');
  function finishSave() {
    pendingPhoto = null;
    saveDB(db); closeModal();
    if (mode === 'another') { renderApp(); studentForm(''); }
    else renderApp();
  }
  if (id) {
    var s = db.students.find(function (x) { return x.id === id; });
    if (!s) return false;
    Object.assign(s, data);
    // v54 (A1/A2): the form never shows the current PIN; a BLANK field
    // keeps the existing PIN hash (it used to reset it to the phone's
    // last 4 digits). To remove a PIN, use the profile's Clear PIN
    // button. A custom PIN is never silently overwritten by a phone
    // change.
    if (pinLogin) { s.parentPinHash = hashPin(pinLogin); delete s.parentPin; }
    s.status = mode === 'draft' ? 'Draft' : 'Active';
    if (pendingPhoto !== null) { if (pendingPhoto) s.photo = pendingPhoto; else delete s.photo; }
    logAudit('Student updated', s.name + ' • ' + (s.admissionNo || '') + ' • ' + s.cls);
    toast(t('tStudentUpdated'));
    finishSave();
    return false;
  }
  var nid = uniqueId('stu');
  // v54 (A1/A2): a blank PIN field no longer defaults to the phone's
  // last 4 digits (guessable). The admin types a PIN, or a random
  // 4-digit PIN is generated — its value is NEVER shown (not in the
  // toast, not on the profile), so if the PIN must be shared with the
  // student, the admin types it explicitly instead.
  var newPin = pinLogin || randomPin();
  function createWith(admNo, enr, numPending) {
    var newStu = Object.assign({ id: nid, att: 100, result: 0, fee: 'Pending', enr: enr, admissionNo: admNo, status: mode === 'draft' ? 'Draft' : 'Active', parentPinHash: hashPin(newPin) }, data);
    if (numPending) newStu.numPending = true;
    if (pendingPhoto) newStu.photo = pendingPhoto;
    db.students.push(newStu);
    var reqId = fval('fStAdmReq');
    if (reqId) {
      var rq = (db.admissionRequests || []).find(function (x) { return x.id === reqId; });
      if (rq && rq.status === 'Pending') {
        rq.status = 'Approved'; rq.studentId = nid;
        logAudit('Admission request approved', rq.name + ' • ' + (admNo || 'pending') + ' • ' + cls);
      }
    }
    logAudit(mode === 'draft' ? 'Admission saved as draft' : 'Admission created', name + ' • ' + (admNo || 'pending') + ' • ' + cls);
    if (numPending) toast(t('sbNumPending'));
    else toast(mode === 'draft' ? t('tDraftSaved') : t('tAdmCreated') + admNo);
    finishSave();
  }
  // v33: for a server account the number comes from the server, never
  // from the local counter — a locally guessed number is exactly what
  // collided on 9 Nov 2026. Offline the student is saved WITHOUT a
  // number (numPending) and minted on the next sync. Local-only
  // accounts mint locally, exactly as before.
  var act33 = sbSyncActive();
  if (act33 && sbIsOnline()) {
    sbMintNewStudentNumbers(act33).then(function (nums) { createWith(nums.admissionNo, nums.enr, false); })
      .catch(function () { createWith('', '', true); });
    return false;
  }
  if (act33) { createWith('', '', true); return false; }
  createWith(nextAdmNo(), nextEnr(), false);
  return false;
}
function stuActions(id) {
  var s = db.students.find(function (x) { return x.id === id; });
  if (!s) return;
  var stt = s.status || 'Active';
  var toggleBtn = stt === 'Active'
    ? '<button class="btn ghost" onclick="closeModal();deactivateStudent(\'' + s.id + '\')">' + t('actDeactivate') + '</button>'
    : (stt === 'Inactive'
      ? '<button class="btn ghost" onclick="closeModal();deactivateStudent(\'' + s.id + '\')">' + t('actActivate') + '</button>' : '');
  openModal('<h3>' + esc(s.name) + ' • ' + esc(s.cls) + '</h3><div class="menu-list">' +
    '<button class="btn ghost" onclick="closeModal();openStudentProfile(\'' + s.id + '\')">' + t('actView') + '</button>' +
    '<button class="btn ghost" onclick="closeModal();studentForm(\'' + s.id + '\')">' + t('actEdit') + '</button>' +
    '<button class="btn ghost" onclick="closeModal();viewStudentAttendance(\'' + s.id + '\')">' + t('actAtt') + '</button>' +
    '<button class="btn ghost" onclick="closeModal();viewStudentFees(\'' + s.id + '\')">' + t('actFees') + '</button>' +
    '<button class="btn ghost" onclick="closeModal();viewStudentResults(\'' + s.id + '\')">' + t('actResults') + '</button>' +
    '<button class="btn ghost" onclick="closeModal();printIdCard(\'' + s.id + '\')">🪪 ' + t('actIdCard') + '</button>' +
    '<button class="btn ghost" onclick="closeModal();downloadStudentCSV(\'' + s.id + '\')">' + t('actDownload') + '</button>' +
    '<button class="btn ghost" onclick="closeModal();transferStudent(\'' + s.id + '\')">' + t('actTransfer') + '</button>' +
    ((stt === 'Active' || stt === 'Inactive') ? '<button class="btn ghost" onclick="closeModal();promoteSingle(\'' + s.id + '\')">⬆️ ' + t('promoSingle') + '</button>' : '') +
    toggleBtn +
    '<button class="btn danger" onclick="closeModal();deleteStudent(\'' + s.id + '\')">' + t('deleteBtn') + '</button>' +
    '</div>');
}
function viewStudentAttendance(id) {
  if (state.role === 'student' || !canViewStudent(id)) { toast(t('tNotAllowed')); return; }
  var s = db.students.find(function (x) { return x.id === id; });
  if (!s) return;
  state.attCls = s.cls;
  go('attendance');
}
function viewStudentFees(id) {
  if (state.role !== 'school' || !canViewStudent(id)) { toast(t('tNotAllowed')); return; }
  state.view = 'fees'; state.feeStudent = id;
  persistSession();
  histPush({ view: 'fees', sub: 'profile:' + id });
  renderApp();
}
function viewStudentResults(id) {
  if (state.role === 'student' || !canViewStudent(id)) { toast(t('tNotAllowed')); return; }
  var s = db.students.find(function (x) { return x.id === id; });
  if (!s) return;
  var ex = db.exams.find(function (e) { return e.cls === s.cls && isActiveExam(e); });
  if (ex) state.examId = ex.id;
  go('exams');
}
function transferStudent(id) {
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
  var s = db.students.find(function (x) { return x.id === id; });
  if (!s) return;
  var clsOpts = CLASSES.map(function (c) { return '<option ' + (c === s.cls ? 'selected' : '') + '>' + c + '</option>'; }).join('');
  openModal('<h3>' + t('transferTitle') + ' — ' + esc(s.name) + '</h3><form onsubmit="return doTransfer(event,\'' + s.id + '\')"><div class="form-grid">' +
    '<div class="full"><label>' + t('transferTo') + '</label><select id="fTrCls" onchange="suggestTransferRoll()">' + clsOpts + '</select></div>' +
    '<div><label>' + t('fRoll') + '</label><input id="fTrRoll" type="number" min="1" value="' + nextRoll(s.cls) + '"></div>' +
    '</div><div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button><button class="btn" type="submit">' + t('transferTitle') + '</button></div></form>');
}
function suggestTransferRoll() {
  var cls = $('fTrCls') ? $('fTrCls').value : '';
  if (cls && $('fTrRoll')) $('fTrRoll').value = nextRoll(cls);
}
function doTransfer(e, id) {
  e.preventDefault();
  var s = db.students.find(function (x) { return x.id === id; });
  if (!s) return false;
  var toCls = $('fTrCls') ? $('fTrCls').value : '';
  if (!toCls) { toast(t('tPickClass')); return false; }
  var fromCls = s.cls;
  s.cls = toCls;
  s.roll = parseInt($('fTrRoll') ? $('fTrRoll').value : '', 10) || nextRoll(toCls);
  // NOTE: fee records keep their historical cls (the fee belonged to the old
  // class); only the student's cls changes. The v9 migration's one-time
  // fee-cls alignment is flag-guarded so it never rewrites these either.
  logAudit('Student transferred', s.name + ' • ' + (s.admissionNo || '') + ' • ' + fromCls + ' → ' + toCls);
  saveDB(db); closeModal(); renderApp();
  toast(t('tTransferred'));
  return false;
}

/* ================= Phase 2: promotion =================
   History is preserved by design: fee records keep their historical cls,
   marks stay keyed by exam, attendance stays keyed by date|old class — so a
   promoted student's whole history stays visible in the profile tabs. */
function nextSession(sess) {
  var m = /^(\d{4})–(\d{2})$/.exec(String(sess || '').trim());
  if (!m) return '';
  var y = parseInt(m[1], 10) + 1;
  return y + '–' + String((y + 1) % 100).padStart(2, '0');
}
function nextClassPart(cp) {
  var parts = classParts();
  var i = parts.indexOf(cp);
  return i === -1 ? cp : parts[Math.min(i + 1, parts.length - 1)];
}
function promoEligible(fromSession, fromCls) {
  // Only Active/Inactive students in that exact class + session.
  // Draft/Cancelled students are never listed. A second run on the same
  // class/session naturally finds none of the already-promoted students.
  return db.students.filter(function (s) {
    return s.cls === fromCls && (s.session || '') === fromSession && ((s.status || 'Active') === 'Active' || (s.status || 'Active') === 'Inactive');
  });
}
// Pure promotion core (UI-free, so the harness can drive it directly).
// sel: { ids, toSession, toCls (full '10th-A'), mode: 'promote'|'retain' }.
// Returns { promoted, retained, skipped: [{id, reason}] }.
function runPromotion(sel) {
  var out = { promoted: 0, retained: 0, skipped: [] };
  (sel.ids || []).forEach(function (id) {
    var s = db.students.find(function (x) { return x.id === id; });
    if (!s) { out.skipped.push({ id: id, reason: t('promoNotEligible') }); return; }
    var stt = s.status || 'Active';
    if (stt !== 'Active' && stt !== 'Inactive') { out.skipped.push({ id: id, reason: t('promoNotEligible') }); return; }
    var fromCls = s.cls, fromSess = s.session || '';
    if (sel.mode === 'retain') {
      if (fromSess === sel.toSession) { out.skipped.push({ id: id, reason: t('promoNoopRetain') }); return; }
      s.session = sel.toSession;
      logAudit('Student retained', s.name + ' • ' + (s.admissionNo || '') + ' • ' + 'Retained in ' + fromCls + ', session ' + fromSess + ' → ' + sel.toSession);
      out.retained++;
    } else {
      if (fromCls === sel.toCls && fromSess === sel.toSession) { out.skipped.push({ id: id, reason: t('promoNoop') }); return; }
      s.previousClass = fromCls; // v11: record the class promoted FROM (shown on the profile Academic tab)
      s.cls = sel.toCls;
      s.roll = nextRoll(sel.toCls); // next free roll in the TARGET class, in order
      s.session = sel.toSession;
      logAudit('Student promoted', s.name + ' • ' + (s.admissionNo || '') + ' • ' + fromCls + ' → ' + sel.toCls + ', session ' + fromSess + ' → ' + sel.toSession);
      out.promoted++;
    }
  });
  saveDB(db);
  return out;
}
function promoList() {
  if (!promoState) return [];
  if (promoState.mode === 'single' && promoState.singleId) {
    var s = db.students.find(function (x) { return x.id === promoState.singleId; });
    return s ? [s] : [];
  }
  return promoEligible(promoState.fromSession, promoState.fromCls);
}
function openPromotion(singleId, opts) {
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
  state.profileStudent = null; // never show profile + promotion at once
  var s = singleId ? db.students.find(function (x) { return x.id === singleId; }) : null;
  var fromSession = s ? (s.session || db.profile.session) : db.profile.session;
  var fromCls = s ? s.cls : '9th-A';
  var sel = {};
  if (singleId) sel[singleId] = true;
  promoState = {
    mode: singleId ? 'single' : 'bulk',
    singleId: singleId || null,
    fromSession: fromSession, fromCls: fromCls,
    toSession: nextSession(fromSession) || db.profile.session,
    toCls: nextClassPart(classPartOf(fromCls)), toSec: sectionOf(fromCls) || 'A',
    selected: sel, result: null
  };
  persistSession();
  if (!opts || !opts.noHist) histPush({ view: 'students', sub: singleId ? 'promo:' + singleId : 'promo' });
  renderPage();
}
function promoteSingle(id) { openPromotion(id); }
function onPromoFromChange() {
  if (!promoState) return;
  var fs = $('promoFromSession'), fc = $('promoFromClass');
  if (fs) promoState.fromSession = fs.value;
  if (fc) promoState.fromCls = fc.value;
  promoState.selected = {};
  promoState.result = null;
  renderPage();
}
function onPromoToChange() {
  if (!promoState) return;
  var ts = $('promoToSession'), tc = $('promoToClass'), tsec = $('promoToSection');
  if (ts) promoState.toSession = ts.value;
  if (tc) promoState.toCls = tc.value;
  if (tsec) promoState.toSec = tsec.value;
  renderPage();
}
function togglePromo(id, checked) {
  if (!promoState) return;
  if (checked) promoState.selected[id] = true; else delete promoState.selected[id];
  renderPage();
}
function togglePromoAll(checked) {
  if (!promoState) return;
  if (checked) promoList().forEach(function (s) { promoState.selected[s.id] = true; });
  else promoState.selected = {};
  renderPage();
}
function doPromote(mode) {
  if (!promoState) return;
  var ids = Object.keys(promoState.selected);
  if (!ids.length) { toast(t('promoNoSelect')); return; }
  var toCls = promoState.toCls + '-' + promoState.toSec;
  var res = runPromotion({ ids: ids, toSession: promoState.toSession, toCls: toCls, mode: mode });
  promoState.result = { mode: mode, promoted: res.promoted, retained: res.retained, skipped: res.skipped.length };
  promoState.selected = {};
  renderPage();
  if (res.promoted === 0 && res.retained === 0) toast(mode === 'retain' ? t('promoNoopRetain') : t('promoNoop'));
  else toast(t('promoDone') + ' ' + res.promoted + ' ' + t('promoPromoted') + ', ' + res.retained + ' ' + t('promoRetained') + '.');
}
function promotionPage() {
  var p = promoState;
  var list = promoList();
  var sessOpts = function (cur) {
    var opts = [];
    SESSIONS.concat(sessionOptions()).forEach(function (s) { if (opts.indexOf(s) === -1) opts.push(s); });
    if (opts.indexOf(cur) === -1) opts.push(cur);
    return opts.map(function (s) { return '<option ' + (s === cur ? 'selected' : '') + '>' + s + '</option>'; }).join('');
  };
  var clsOpts = function (cur) {
    return CLASSES.map(function (c) { return '<option ' + (c === cur ? 'selected' : '') + '>' + c + '</option>'; }).join('');
  };
  var cpOpts = function (cur) {
    return classParts().map(function (c) { return '<option ' + (c === cur ? 'selected' : '') + '>' + c + '</option>'; }).join('');
  };
  var secOpts = function (cur) {
    return SECTIONS.map(function (x) { return '<option ' + (x === cur ? 'selected' : '') + '>' + x + '</option>'; }).join('');
  };
  var selCount = Object.keys(p.selected).length;
  var rows = list.map(function (s) {
    var checked = !!p.selected[s.id];
    return '<label class="promo-row"><input type="checkbox" ' + (checked ? 'checked' : '') + ' ' + (p.mode === 'single' ? 'disabled' : '') + ' onchange="togglePromo(\'' + s.id + '\', this.checked)">' +
      '<span style="flex:1"><b>' + esc(s.name) + '</b> <span class="muted">• ' + esc(s.cls) + ' • ' + t('thAdmNo') + ' ' + esc(s.admissionNo || '—') + ' • ' + t('thRoll') + ' ' + s.roll + '</span></span>' +
      '<span class="badge ' + ((s.status || 'Active') === 'Active' ? 'green' : 'grey') + '">' + (s.status || 'Active') + '</span></label>';
  }).join('');
  var resHtml = '';
  if (p.result) {
    resHtml = '<div class="card" style="margin-top:16px"><h3>' + t('promoDone') + '</h3><p>' + p.result.promoted + ' ' + t('promoPromoted') + ' • ' + p.result.retained + ' ' + t('promoRetained') + ' • ' + p.result.skipped + ' ' + t('impSkipped') + '</p></div>';
  }
  return '<div class="page-head"><div><h2>' + t('promoTitle') + '</h2><p>' + t('promoNote') + '</p></div>' +
    '<div class="toolbar"><button class="btn ghost" onclick="promoState=null;renderPage()">← ' + t('backDir') + '</button></div></div>' +
    (p.mode === 'single' ? '<p class="muted" style="margin-bottom:12px">' + t('promoSingleNote') + '</p>' : '') +
    '<div class="card"><div class="form-grid">' +
    '<div><label>' + t('promoFromSession') + '</label><select id="promoFromSession" onchange="onPromoFromChange()">' + sessOpts(p.fromSession) + '</select></div>' +
    '<div><label>' + t('promoFromClass') + '</label><select id="promoFromClass" onchange="onPromoFromChange()">' + clsOpts(p.fromCls) + '</select></div>' +
    '<div><label>' + t('promoToSession') + '</label><select id="promoToSession" onchange="onPromoToChange()">' + sessOpts(p.toSession) + '</select></div>' +
    '<div><label>' + t('promoToClass') + '</label><select id="promoToClass" onchange="onPromoToChange()">' + cpOpts(p.toCls) + '</select></div>' +
    '<div><label>' + t('promoToSection') + '</label><select id="promoToSection" onchange="onPromoToChange()">' + secOpts(p.toSec) + '</select></div>' +
    '</div></div>' +
    '<div class="card" style="margin-top:16px"><div class="head-row"><div><h3>' + list.length + ' ' + t('studentsW') + '</h3><p class="card-sub">' + selCount + ' ' + t('promoSelected') + '</p></div>' +
    '<div class="toolbar"><button class="btn ghost sm" onclick="togglePromoAll(true)">' + t('promoSelectAll') + '</button>' +
    '<button class="btn ghost sm" onclick="togglePromoAll(false)">' + t('promoSelectNone') + '</button></div></div>' +
    '<div class="promo-list">' + (rows || '<div class="empty">' + t('promoNoStudents') + '</div>') + '</div>' +
    '<div class="actions" style="justify-content:flex-start;margin-top:16px"><button class="btn green" onclick="doPromote(\'promote\')">' + t('promoPromote') + '</button>' +
    '<button class="btn ghost" onclick="doPromote(\'retain\')">' + t('promoRetain') + '</button></div></div>' + resHtml;
}
function deactivateStudent(id) {
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
  var s = db.students.find(function (x) { return x.id === id; });
  if (!s) return;
  var toInactive = (s.status || 'Active') === 'Active';
  confirmModal((toInactive ? t('tDeactMsg') : t('tActMsg')) + ' — ' + s.name + '?', function () {
    s.status = toInactive ? 'Inactive' : 'Active';
    logAudit(toInactive ? 'Student deactivated' : 'Student activated', s.name + ' • ' + (s.admissionNo || '') + ' • ' + s.cls);
    saveDB(db); renderApp();
    toast(toInactive ? t('tDeactivated') : t('tActivated'));
  });
}
function cancelAdmission(id) {
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
  var s = db.students.find(function (x) { return x.id === id; });
  if (!s) return;
  confirmModal(t('cancelAdmMsg'), function () {
    s.status = 'Cancelled';
    logAudit('Admission cancelled', s.name + ' • ' + (s.admissionNo || '') + ' • ' + s.cls);
    saveDB(db); closeModal(); renderApp();
    toast(t('tAdmCancelled'));
  });
}
function openStudentProfile(id) {
  if (!canViewStudent(id)) { toast(t('tOwnProfileOnly')); return; }
  promoState = null;
  state.profileStudent = id; state.profileTab = 'overview';
  persistSession();
  histPush({ view: 'students', sub: 'profile:' + id });
  renderPage();
}
function setProfileTab(tab) { state.profileTab = tab; renderPage(); }
function studentProfilePage(id) {
  var s = db.students.find(function (x) { return x.id === id; });
  if (!s) {
    state.profileStudent = null;
    if (state.role !== 'school') return '<div class="card"><div class="empty">' + t('tNoStudentData') + '</div></div>';
    return studentsPage();
  }
  var stt = s.status || 'Active';
  var badgeCls = stt === 'Active' ? 'green' : stt === 'Inactive' ? 'grey' : stt === 'Draft' ? 'blue' : 'red';
  // v35: role-filtered tabs. A student sees their own record (no audit
  // log); a teacher never sees the fees tab (teachers cannot see fees).
  var allTabs = [['overview', 'tabOverview'], ['personal', 'tabPersonal'], ['parent', 'tabParent'], ['academic', 'tabAcademic'], ['attendance', 'tabAttendance'], ['fees', 'tabFees'], ['results', 'tabResults'], ['homework', 'tabHomework'], ['docs', 'tabDocs'], ['activity', 'tabActivity']];
  var tabs = allTabs.filter(function (tb) {
    if (tb[0] === 'activity') return state.role === 'school';
    if (tb[0] === 'fees') return state.role !== 'teacher';
    return true;
  });
  var tabBar = '<div class="tabs">' + tabs.map(function (tb) {
    return '<button class="tab-btn' + (state.profileTab === tb[0] ? ' on' : '') + '" onclick="setProfileTab(\'' + tb[0] + '\')">' + t(tb[1]) + '</button>';
  }).join('') + '</div>';
  var toolbar = state.role === 'school'
    ? '<div class="toolbar"><button class="btn ghost" onclick="backFromProfile()">← ' + t('backDir') + '</button>' +
    '<button class="btn" onclick="studentForm(\'' + s.id + '\')">' + t('editStudent') + '</button>' +
    '<button class="btn ghost" onclick="printIdCard(\'' + s.id + '\')">🪪 ' + t('actIdCard') + '</button>' + waChatBtn(s.id) +
    ((stt === 'Active' || stt === 'Inactive') ? '<button class="btn ghost" onclick="promoteSingle(\'' + s.id + '\')">⬆️ ' + t('promoSingle') + '</button>' : '') + '</div>'
    : state.role === 'teacher'
    ? '<div class="toolbar"><button class="btn ghost" onclick="backFromProfile()">← ' + t('backDir') + '</button>' +
    '<button class="btn ghost" onclick="printIdCard(\'' + s.id + '\')">🪪 ' + t('actIdCard') + '</button>' + waChatBtn(s.id) + '</div>'
    : '<div class="toolbar"><button class="btn ghost" onclick="backFromProfile()">← ' + t('backDir') + '</button><button class="btn ghost" onclick="printIdCard(\'' + s.id + '\')">🪪 ' + t('actIdCard') + '</button></div>';
  return '<div class="page-head"><div class="prof-head">' + avatarHTML(s.photo, s.name, 'big-avatar') + '<div><h2>' + esc(s.name) + '</h2><p>' + esc(s.cls) + ' • ' + t('thAdmNo') + ' ' + esc(s.admissionNo || '—') + ' • ' + t('thEnr') + ' ' + esc(s.enr || '—') + ' • <span class="badge ' + badgeCls + '">' + stt + '</span></p></div></div>' +
    toolbar + '</div>' +
    tabBar + '<div style="margin-top:16px">' + profileTabBody(s, state.profileTab || 'overview') + '</div>';
}
function profileTabBody(s, tab) {
  var d = s.documents || {};
  var kv = function (label, val) { return '<div class="kv"><b>' + label + '</b><span>' + val + '</span></div>'; };
  // v35: tabs hidden by role are also refused here, so a direct
  // setProfileTab call cannot open them either.
  if (tab === 'activity' && state.role !== 'school') return '<div class="card"><div class="empty">' + t('tNotAllowed') + '</div></div>';
  if (tab === 'fees' && state.role === 'teacher') return '<div class="card"><div class="empty">' + t('tNotAllowed') + '</div></div>';
  if (tab === 'personal') {
    return '<div class="card">' + kv(t('fStudentName'), esc(s.name)) + kv(t('fDob'), esc(s.dob || '—')) + kv(t('fGender'), esc(s.gender || '—')) + kv(t('fBlood'), esc(s.bloodGroup || '—')) + kv(t('fCategory'), esc(s.category || '—')) + kv(t('fAddress'), esc(s.address || '—')) + kv(t('fState'), esc(s.state || '—')) + kv(t('fDistrict'), esc(s.district || '—')) + kv(t('fPin'), esc(s.pin || '—')) + kv(t('fAadhaar'), maskAadhaar(s.aadhaar)) + '</div>';
  }
  if (tab === 'parent') {
    var base = '<div class="card">' + kv(t('fFather'), esc(s.fatherName || '—')) + kv(t('fMother'), esc(s.motherName || '—')) + kv(t('fGuardian'), esc(s.guardian)) + kv(t('fPhone'), esc(s.phone)) + kv(t('fPhone2'), esc(s.mobile2 || '—')) + kv(t('fParentEmail'), esc(s.parentEmail || '—')) + kv(t('fOccupation'), esc(s.occupation || '—')) + '</div>';
    if (state.role !== 'school') return base;
    var pinSet54 = pinHasPin(s); // v54 (A2): the PIN value is never rendered — at most "PIN set / not set"
    var pinBox = '<div class="card" style="margin-top:16px"><h3>' + t('stuPinTitle') + '</h3>' +
      '<div class="kv"><b>' + t('stuPinNow') + '</b><span>' + (pinSet54 ? t('stuPinSet') : '—') + '</span></div>' +
      '<p class="muted" style="margin:8px 0">' + t('tPinAuto') + (pinSet54 ? '' : ' ' + t('stuPinNone')) + '</p>' +
      '<div class="form-grid"><div><label>' + t('stuPinNew') + '</label><input id="fStuPinNew" inputmode="numeric" maxlength="6" placeholder="4–6 digits"></div></div>' +
      '<div class="toolbar" style="margin-top:12px"><button class="btn" onclick="setStudentPin(\'' + s.id + '\')">' + t('stuPinSetBtn') + '</button>' +
      '<button class="btn ghost" onclick="clearStudentPin(\'' + s.id + '\')">' + t('stuPinClear') + '</button></div></div>';
    return base + pinBox;
  }
  if (tab === 'academic') {
    return '<div class="card">' + kv(t('fAdmNo'), esc(s.admissionNo || '—')) + kv(t('fAdmDate'), esc(s.admissionDate || '—')) + kv(t('fSession'), esc(s.session || '—')) + kv(t('fClass'), esc(classPartOf(s.cls))) + kv(t('fSection'), esc(sectionOf(s.cls))) + kv(t('fRoll'), String(s.roll)) + kv(t('fPrevSchool'), esc(s.previousSchool || '—')) + kv(t('fPrevClass'), esc(s.previousClass || '—')) + kv(t('thStatus'), esc(s.status || 'Active')) + '</div>';
  }
  if (tab === 'attendance') {
    var rows = [];
    Object.keys(db.attendance).forEach(function (k) {
      var recs = db.attendance[k] || {};
      if (recs[s.id]) rows.push({ date: k.split('|')[0], cls: k.split('|')[1], st: recs[s.id] });
    });
    rows.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var shown = rows.slice(0, 30);
    var trs = shown.map(function (r) {
      return '<tr><td>' + esc(r.date) + '</td><td>' + esc(r.cls) + '</td><td><span class="badge ' + (r.st === 'Present' ? 'green' : r.st === 'Absent' ? 'red' : 'orange') + '">' + r.st + '</span></td></tr>';
    }).join('');
    return '<div class="card"><p class="muted">' + t('attPct') + ': <b>' + studentAttPct(s) + '%</b>' + (rows.length > 30 ? ' • ' + t('showingRec') + ' 30 ' + t('ofRec') + ' ' + rows.length : '') + '</p><div class="tbl-wrap"><table><thead><tr><th>' + t('thDate') + '</th><th>' + t('thClass') + '</th><th>' + t('thStatus') + '</th></tr></thead><tbody>' + (trs || '<tr><td colspan="3"><div class="empty">' + t('noAttRecs') + '</div></td></tr>') + '</tbody></table></div></div>';
  }
  if (tab === 'fees') {
    var sum = feeSummaryFor(s.id);
    if (!sum) return '<div class="card"><div class="empty">' + t('tNoFeeRecs') + '</div></div>';
    var btRows = Object.keys(sum.byType).map(function (ty) {
      return '<div class="type-row"><b>' + esc(feeTypeLabel(ty)) + '</b><span>' + t('collectedW') + ' ' + inr(sum.byType[ty].collected) + ' • ' + t('pendingW') + ' ' + inr(sum.byType[ty].pending) + '</span></div>';
    }).join('');
    var frs = sum.recs.map(function (r) {
      return '<tr><td>' + r.month + '</td><td>' + esc(feeTypeLabel(feeTypeOf(r))) + '</td><td>' + inr(r.amount) + '</td><td>' + esc(r.date) + '</td><td><span class="badge ' + (r.status === 'Collected' ? 'green' : 'orange') + '">' + r.status + '</span></td><td>' + receiptCellForRecord(r) + '</td></tr>';
    }).join('');
    return '<div class="stats">' + statCard('🧾', 'blue', t('totalBilled'), sum.billed, '', 'up', { prefix: '₹' }) + statCard('✅', 'green', t('totalPaid'), sum.paid, '', 'up', { prefix: '₹' }) + statCard('⏰', 'red', t('totalPending'), sum.pend, '', 'down', { prefix: '₹' }) + '</div>' +
      '<div class="card"><h3>' + t('feeByType') + '</h3>' + (btRows || '<p class="muted">' + t('tNoFeeRecs') + '</p>') + '</div>' +
      '<div class="card" style="margin-top:16px"><h3>' + t('feeRecsH') + '</h3><div class="tbl-wrap fee-hist-tbl"><table><thead><tr><th>' + t('thMonth') + '</th><th>' + t('thType') + '</th><th>' + t('thAmount') + '</th><th>' + t('thDate') + '</th><th>' + t('thStatus') + '</th><th>' + t('thReceipt') + '</th></tr></thead><tbody>' + (frs || '<tr><td colspan="6"><div class="empty">' + t('tNoFeeRecs') + '</div></td></tr>') + '</tbody></table></div>' +
      (state.role !== 'school' ? '' : '<div class="toolbar" style="margin-top:12px"><button class="btn" onclick="viewStudentFees(\'' + s.id + '\')">' + t('openFees') + '</button></div>') + '</div>';
  }
  if (tab === 'results') {
    var exs = db.exams.filter(function (e) { return e.cls === s.cls && isActiveExam(e); }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var rtrs = exs.map(function (ex) {
      var mk = db.marks.find(function (m) { return m.examId === ex.id && m.studentId === s.id; });
      var pct = mk ? Math.round(mk.marks / ex.total * 100) + '%' : '—';
      return '<tr><td>' + esc(ex.name) + '</td><td>' + esc(ex.subject) + '</td><td>' + esc(ex.date) + '</td><td>' + (mk ? mk.marks + ' / ' + ex.total : '—') + '</td><td>' + pct + '</td></tr>';
    }).join('');
    return '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>' + t('thExam') + '</th><th>' + t('fSubject') + '</th><th>' + t('thDate') + '</th><th>' + t('thMarks') + '</th><th>' + t('thResult') + '</th></tr></thead><tbody>' + (rtrs || '<tr><td colspan="5"><div class="empty">' + t('noExamRecs') + '</div></td></tr>') + '</tbody></table></div></div>';
  }
  if (tab === 'homework') {
    var hws = db.homework.filter(function (h) { return h.cls === s.cls; });
    var htrs = hws.map(function (h) {
      var done = (h.doneBy || []).indexOf(s.id) !== -1;
      return '<tr><td>' + esc(h.title) + '</td><td>' + esc(h.subject) + '</td><td>' + esc(h.due) + '</td><td><span class="badge ' + (done ? 'green' : 'orange') + '">' + (done ? t('hwDone') : t('hwPend')) + '</span></td></tr>';
    }).join('');
    return '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>' + t('fTitle') + '</th><th>' + t('fSubject') + '</th><th>' + t('fDue') + '</th><th>' + t('thStatus') + '</th></tr></thead><tbody>' + (htrs || '<tr><td colspan="4"><div class="empty">' + t('noHwRecs') + '</div></td></tr>') + '</tbody></table></div></div>';
  }
  if (tab === 'docs') {
    var docRow = function (label, ok) { return '<div class="kv"><b>' + label + '</b><span class="badge ' + (ok ? 'green' : 'grey') + '">' + (ok ? t('docStatus') : t('docMissing')) + '</span></div>'; };
    return '<div class="card">' + docRow(t('fBirthCert'), !!d.birthCert) + docRow(t('fTc'), !!d.tc) + kv(t('fTcNo'), esc(d.tcNumber || '—')) + kv(t('fDocsOther'), esc(d.other || '—')) + '<p class="muted" style="margin-top:10px">' + t('docsNote') + '</p></div>';
  }
  if (tab === 'activity') {
    var acts = (db.auditLog || []).filter(function (a) {
      var det = a.details || '';
      if (s.admissionNo) return det.indexOf(s.admissionNo) !== -1;
      return det.indexOf(s.name) !== -1;
    });
    var arows = acts.map(function (a) {
      return '<div class="act"><div><b>' + esc(a.action) + '</b><div class="muted">' + esc(a.details) + '</div><div class="muted">' + esc(a.ts) + ' • ' + esc(a.actor) + '</div></div></div>';
    }).join('');
    return '<div class="card">' + (arows || '<div class="empty">' + t('noActivity') + '</div>') + '</div>';
  }
  // overview (default)
  var lex = latestExamPct(s);
  var hwPend = db.homework.filter(function (h) { return h.cls === s.cls && (h.doneBy || []).indexOf(s.id) === -1; }).length;
  var sum2 = feeSummaryFor(s.id);
  var pendAmt = sum2 ? sum2.pend : 0;
  // v38: pending dues with a per-due WhatsApp reminder. This is also
  // the teacher's entry point for fee reminders (teachers cannot open
  // the Fees page) — waReminderBtn enforces the assigned-class rule,
  // and a student never sees a button here.
  var pendRecs38 = (db.feeRecords || []).filter(function (r) { return r.studentId === s.id && r.status === 'Pending'; });
  var pendHtml38 = '';
  if (pendRecs38.length && state.role !== 'student') {
    pendHtml38 = '<div class="card" style="margin-top:16px"><h3>' + t('pendingW') + '</h3>' + pendRecs38.map(function (r) {
      return '<div class="type-row"><b>' + esc(r.month) + ' • ' + esc(feeTypeLabel(feeTypeOf(r))) + '</b><span>' + inr(r.amount) + ' ' + waReminderBtn(r.id, s.id) + '</span></div>';
    }).join('') + '</div>';
  }
  return '<div class="stats">' +
    statCard('📊', 'blue', t('attPct'), studentAttPct(s), '', 'up', { suffix: '%' }) +
    statCard('💰', 'green', t('feeSt'), pendAmt, '', pendAmt ? 'down' : 'up', { prefix: '₹' }) +
    statCard('📝', 'orange', t('latestExam'), lex ? lex.pct : 0, lex ? lex.name : '', 'up', { suffix: '%' }) +
    statCard('📚', 'red', t('hwPending'), hwPend, '', 'up') +
    '</div>' +
    '<div class="card">' + kv(t('fGuardian'), esc(s.guardian)) + kv(t('fPhone'), esc(s.phone)) + kv(t('fAdmNo'), esc(s.admissionNo || '—')) + kv(t('thEnr'), esc(s.enr || '—')) + kv(t('fAdmDate'), esc(s.admissionDate || '—')) + kv(t('fSession'), esc(s.session || '—')) + kv(t('thStatus'), esc(s.status || 'Active')) + '</div>' + pendHtml38;
}
function setStudentPin(id) {
  var s = db.students.find(function (x) { return x.id === id; });
  if (!s || state.role !== 'school') return;
  var v = digitsOnly($('fStuPinNew') ? $('fStuPinNew').value : '');
  if (v.length < 4 || v.length > 6) { toast(t('tPinLen')); return; }
  s.parentPinHash = hashPin(v); delete s.parentPin; // v54 (A1): stored as a salted hash, never plaintext
  logAudit('Student PIN set', s.name + ' • ' + (s.admissionNo || '') + ' • ' + s.cls);
  saveDB(db); renderPage();
  toast(t('tPinSet'));
}
function clearStudentPin(id) {
  var s = db.students.find(function (x) { return x.id === id; });
  if (!s || state.role !== 'school') return;
  delete s.parentPinHash; s.parentPin = ''; // v54 (A1): clearing removes the hash and leaves the empty-string sentinel — deleting the field too would let migrateV12 re-derive the PIN from the phone on the next load
  logAudit('Student PIN cleared', s.name + ' • ' + (s.admissionNo || '') + ' • ' + s.cls);
  saveDB(db); renderPage();
  toast(t('tPinCleared'));
}
function deleteStudent(id) {
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
  var s = db.students.find(function (x) { return x.id === id; });
  if (!s) return;
  // Soft delete only: the record and ALL of its history (fees, marks,
  // attendance, homework) are kept. Nothing is ever hard-deleted here.
  confirmModal(t('softDelMsg') + ' — ' + s.name + '?', function () {
    s.status = 'Cancelled';
    logAudit('Student removed', s.name + ' • ' + (s.admissionNo || '') + ' • ' + s.cls + ' (soft delete — record kept)');
    saveDB(db); renderApp();
    toast(t('tStudentRemoved'));
  });
}

/* ================= v38: WhatsApp via wa.me links (MANUAL send only) =================
   HARD RULES (the user's own decisions — never break these):
   - NO automation, NO WhatsApp API, NO unofficial bot/library, NO
     auto-send, NO bulk send. The app only OPENS a wa.me chat with the
     message prefilled; the user presses Send inside WhatsApp. Same
     safe pattern as the Target Academy fee-receipt wa.me button.
   - NEVER anything that could disconnect the school's WhatsApp
     number: no WhatsApp login, no session, no QR — only wa.me links.
   - HONEST wording everywhere: the app opens WhatsApp, it cannot
     know whether the user pressed Send — buttons and logs say
     "Open WhatsApp" / "WhatsApp opened", never "Sent".
   - Templates never carry Aadhaar, PINs, passwords or any other
     sensitive field — only school name, student name, class, month,
     amount and date. */
function waNormalizePhone(raw) {
  // Indian mobiles only: 10-digit, 0-prefixed, +91-prefixed, spaces /
  // dashes all normalise to 91XXXXXXXXXX. Anything else is rejected
  // (the button is disabled and the action toasts the reason).
  var d = digitsOnly(raw);
  if (d.length === 12 && d.indexOf('91') === 0) d = d.slice(2);
  else if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1);
  if (d.length !== 10) return '';
  if ('6789'.indexOf(d.charAt(0)) === -1) return ''; // Indian mobiles start 6-9
  return '91' + d;
}
function waFill(tpl, map) {
  // Placeholder fill without regexes: {school}, {student}, {cls},
  // {month}, {amount}, {date}, {receipt}.
  var out = tpl;
  Object.keys(map).forEach(function (k) { out = out.split('{' + k + '}').join(map[k]); });
  return out;
}
function waSchoolPhoneLine() {
  // The school's contact number, when the school profile has one.
  var ph = (db.profile && db.profile.phone) ? String(db.profile.phone).trim() : '';
  return ph ? '\n' + t('waSchoolContact') + ': ' + ph : '';
}
function waOpenUrl(url) {
  // The ONE place that opens WhatsApp. wa.me only opens the chat with
  // the message prefilled — nothing is sent by the app itself.
  try { if (typeof window !== 'undefined' && window.open) window.open(url, '_blank'); } catch (e) {}
  return url;
}
function waLogOpen(kind, s) {
  // "WhatsApp opened", never "sent" — the app cannot know whether the
  // user pressed Send inside WhatsApp.
  logAudit('WhatsApp opened', kind + ' • ' + s.name + ' • ' + (s.admissionNo || '') + ' • ' + s.cls);
  saveDB(db);
}
function waCanUse(studentId) {
  // Shared role guard for every WhatsApp action (v35 roles): a student
  // can never open one; a teacher only for students in the classes
  // they teach; the school admin can use them all.
  if (state.role === 'student') return false;
  if (state.role === 'teacher') return canViewStudent(studentId);
  return state.role === 'school';
}
function waFeeReminder(recordId) {
  var r = db.feeRecords.find(function (x) { return x.id === recordId; });
  if (!r || r.status !== 'Pending') return false;
  var s = db.students.find(function (x) { return x.id === r.studentId; });
  if (!s) return false;
  if (!waCanUse(s.id)) { toast(t('tNotAllowed')); return false; }
  var norm = waNormalizePhone(s.phone);
  if (!norm) { toast(t('waNoNumber')); return false; }
  var msg = waFill(t('waFeeReminderMsg'), { school: db.profile.name, student: s.name, cls: s.cls, amount: inr(r.amount), month: r.month }) + waSchoolPhoneLine();
  waOpenUrl('https://wa.me/' + norm + '?text=' + encodeURIComponent(msg));
  waLogOpen('Fee reminder', s);
  toast(t('waOpened'));
  return true;
}
function waAbsentAlert(studentId) {
  var s = db.students.find(function (x) { return x.id === studentId; });
  if (!s) return false;
  if (!waCanUse(s.id)) { toast(t('tNotAllowed')); return false; }
  var date = state.attDate || todayIST();
  var recs = db.attendance[date + '|' + s.cls] || {};
  var mark = recs[studentId];
  if (mark !== 'Absent' && mark !== 'Late') { toast(t('waNotAbsent')); return false; }
  var norm = waNormalizePhone(s.phone);
  if (!norm) { toast(t('waNoNumber')); return false; }
  var msg = waFill(t(mark === 'Absent' ? 'waAbsentMsg' : 'waLateMsg'), { school: db.profile.name, student: s.name, cls: s.cls, date: date }) + waSchoolPhoneLine();
  waOpenUrl('https://wa.me/' + norm + '?text=' + encodeURIComponent(msg));
  waLogOpen(mark === 'Absent' ? 'Absent alert' : 'Late alert', s);
  toast(t('waOpened'));
  return true;
}
function waReceiptShare(receiptNo) {
  // School only: fees are not a teacher's area, and a student never
  // shares receipts.
  if (state.role !== 'school') { toast(t('tNotAllowed')); return false; }
  var rc = (db.receipts || []).find(function (x) { return x.receiptNo === receiptNo; });
  if (!rc) return false;
  // v47: the message names the student from the receipt itself (see
  // receiptStudent) — a stale local seed row must never rename the
  // message. The phone still comes from the local row: the receipt
  // carries no phone number.
  var rs = receiptStudent(rc);
  var s = db.students.find(function (x) { return x.id === rc.studentId; });
  if (!s) return false;
  var norm = waNormalizePhone(s.phone);
  if (!norm) { toast(t('waNoNumber')); return false; }
  var msg = waFill(t('waReceiptMsg'), { school: db.profile.name, student: rs.name, cls: rs.cls, receipt: rc.receiptNo, amount: inr(rc.total), month: rc.month, date: rc.date }) + waSchoolPhoneLine();
  waOpenUrl('https://wa.me/' + norm + '?text=' + encodeURIComponent(msg));
  waLogOpen('Receipt share', s);
  toast(t('waOpened'));
  return true;
}
function waProfileChat(studentId) {
  var s = db.students.find(function (x) { return x.id === studentId; });
  if (!s) return false;
  if (!waCanUse(s.id)) { toast(t('tNotAllowed')); return false; }
  var norm = waNormalizePhone(s.phone);
  if (!norm) { toast(t('waNoNumber')); return false; }
  var msg = waFill(t('waGreetMsg'), { school: db.profile.name, student: s.name, cls: s.cls }) + waSchoolPhoneLine();
  waOpenUrl('https://wa.me/' + norm + '?text=' + encodeURIComponent(msg));
  waLogOpen('Profile chat', s);
  toast(t('waOpened'));
  return true;
}
function waReminderBtn(recordId, studentId) {
  // The fee-reminder button for one pending due row. A student never
  // sees it; a teacher only for their own classes. When the parent
  // number is missing or invalid the button is disabled (the reason
  // is the title) — the action itself toasts the same reason.
  var s = db.students.find(function (x) { return x.id === studentId; });
  if (!s) return '';
  if (state.role === 'student') return '';
  if (state.role === 'teacher' && !canViewStudent(studentId)) return '';
  if (!waNormalizePhone(s.phone)) return '<button class="btn ghost sm" disabled title="' + esc(t('waNoNumber')) + '">💬 ' + t('waReminderBtn') + '</button>';
  return '<button class="btn ghost sm" onclick="waFeeReminder(\'' + recordId + '\')">💬 ' + t('waReminderBtn') + '</button>';
}
function waChatBtn(studentId) {
  // The profile WhatsApp button. Same visibility rules as the reminder
  // button; disabled with the reason when the parent number is unusable.
  var s = db.students.find(function (x) { return x.id === studentId; });
  if (!s) return '';
  if (state.role === 'student') return '';
  if (state.role === 'teacher' && !canViewStudent(studentId)) return '';
  if (!waNormalizePhone(s.phone)) return '<button class="btn ghost" disabled title="' + esc(t('waNoNumber')) + '">💬 ' + t('waChatBtn') + '</button>';
  return '<button class="btn ghost" onclick="waProfileChat(\'' + studentId + '\')">💬 ' + t('waChatBtn') + '</button>';
}
function attendancePage() {
  if (!state.attDate) state.attDate = todayIST();
  // v35: a teacher only ever sees their own assigned classes — the class
  // picker is restricted, and a stale attCls outside the assignment is
  // pulled back to the first assigned class.
  if (state.role === 'teacher') {
    var myCls35 = teacherClasses();
    if (!myCls35.length) return '<div class="page-head"><div><h2>' + t('attendance') + '</h2></div></div><div class="card"><div class="empty">' + t('tchrNoClassesYet') + '</div></div>';
    if (myCls35.indexOf(state.attCls) === -1) state.attCls = myCls35[0];
  }
  var cls = state.attCls;
  // v34 (P1-10): rosters are enrolled students only — Cancelled/Draft
  // never appear on the register.
  var roster = db.students.filter(function (s) { return s.cls === cls && isEnrolledStudent(s); });
  var key = state.attDate + '|' + cls;
  var recs = db.attendance[key] || {};
  var rows = roster.map(function (s) {
    var cur = recs[s.id] || 'Present';
    // v38: an Absent/Late student can be notified on WhatsApp (manual
    // wa.me chat, parent presses nothing here — the admin presses Send
    // inside WhatsApp). The button appears only for Absent/Late marks.
    var notifyCell = (cur === 'Absent' || cur === 'Late')
      ? '<button class="btn ghost sm" onclick="waAbsentAlert(\'' + s.id + '\')">💬 ' + t('waNotifyBtn') + '</button>'
      : '<span class="muted">—</span>';
    return '<tr><td><b>' + esc(s.name) + '</b></td><td>' + s.roll + '</td><td><div class="mark-btns">' +
      ['Present', 'Absent', 'Late'].map(function (m) {
        return '<button class="' + m[0].toLowerCase() + (cur === m ? ' on' : '') + '" onclick="markAtt(\'' + s.id + '\',\'' + m + '\')">' + (m === 'Present' ? t('presBtn') : m === 'Absent' ? t('absBtn') : t('lateBtn')) + '</button>';
      }).join('') + '</div></td><td>' + notifyCell + '</td></tr>';
  }).join('');
  // v34 (P1-9): an unmarked student is "Not marked", not Present — the
  // Present default lives only in the marking buttons above. Counting an
  // unmarked student as Present inflated the day's attendance.
  var counts = { Present: 0, Absent: 0, Late: 0, NotMarked: 0 };
  roster.forEach(function (s) {
    var m = recs[s.id];
    if (!m) counts.NotMarked++;
    else if (m === 'Present') counts.Present++;
    else if (m === 'Absent') counts.Absent++;
    else counts.Late++;
  });
  var clsOpts = (state.role === 'teacher' ? teacherClasses() : CLASSES).map(function (c) { return '<option ' + (cls === c ? 'selected' : '') + '>' + c + '</option>'; }).join('');
  var ta = todayAtt();
  return '<div class="page-head"><div><h2>' + t('attendance') + '</h2><p>Class ' + esc(cls) + ' • ' + esc(state.attDate) + ' — ' + counts.Present + ' ' + t('presBtn') + ', ' + counts.Absent + ' ' + t('absBtn') + ', ' + counts.Late + ' ' + t('lateBtn') + (counts.NotMarked ? ', ' + counts.NotMarked + ' ' + t('attNotMarked') : '') + '</p></div>' +
    '<div class="toolbar"><select onchange="state.attCls=this.value;renderPage()">' + clsOpts + '</select>' +
    '<input type="date" value="' + esc(state.attDate) + '" max="' + todayIST() + '" onchange="onAttDate(this.value)" style="min-width:160px">' +
    '<button class="btn green" onclick="saveAttendance()">✓ ' + t('saveAttendance') + '</button></div></div>' +
    '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>' + t('thStudent') + '</th><th>' + t('thRoll') + '</th><th>' + t('thStatus') + '</th><th>' + t('waNotifyCol') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    (state.role === 'teacher' ? '' : '<p class="muted" style="margin-top:12px">School-wide today: ' + num(ta.present) + ' Present • ' + num(ta.absent) + ' Absent • ' + num(ta.late) + ' Late (' + donutPct(ta.present, ta.total) + '% attendance).</p>') + '</div>';
}
function onAttDate(v) {
  if (v > todayIST()) { toast(t('tFutureDate')); state.attDate = todayIST(); }
  else state.attDate = v;
  renderPage();
}
function markAtt(id, m) {
  // v35: a teacher marks only their own assigned class, and only a
  // student on this class's roster.
  if (state.role === 'teacher' && teacherClasses().indexOf(state.attCls) === -1) { toast(t('tNotAllowed')); return; }
  var stu = db.students.find(function (x) { return x.id === id; });
  if (stu && stu.cls !== state.attCls) { toast(t('tNotAllowed')); return; }
  var key = state.attDate + '|' + state.attCls;
  if (!db.attendance[key]) db.attendance[key] = {};
  db.attendance[key][id] = m;
  saveDB(db); // autosave — marks are never lost on page change
  renderPage();
}
function saveAttendance() {
  // v35: a teacher saves only their own assigned class.
  if (state.role === 'teacher' && teacherClasses().indexOf(state.attCls) === -1) { toast(t('tNotAllowed')); return; }
  var key = state.attDate + '|' + state.attCls;
  var recs = db.attendance[key] || {};
  // v25: attendance saves go to the audit log too, so the full Activity
  // Log shows them. Recent Activities keeps its own db.activities entry
  // (addActivity below) — one save = one entry in each list, never two
  // in either. v34 (P1-9): counts treat unmarked as "Not marked" (a
  // separate count), matching the page header; v34 (P1-10): Cancelled/
  // Draft students are not on the roster and not in the counts.
  var counts = { Present: 0, Absent: 0, Late: 0, NotMarked: 0 };
  db.students.filter(function (s) { return s.cls === state.attCls && isEnrolledStudent(s); }).forEach(function (s) {
    var m = recs[s.id];
    if (!m) counts.NotMarked++;
    else if (m === 'Present') counts.Present++;
    else if (m === 'Absent') counts.Absent++;
    else counts.Late++;
  });
  logAudit('Attendance updated', 'Class ' + state.attCls + ' • ' + state.attDate + ' • ' + counts.Present + ' Present, ' + counts.Absent + ' Absent, ' + counts.Late + ' Late' + (counts.NotMarked ? ', ' + counts.NotMarked + ' Not marked' : ''));
  addActivity('✅', 'blue', 'Attendance updated', 'Class ' + state.attCls);
  saveDB(db);
  toast('✓ ' + t('tAttSaved') + ' — Class ' + state.attCls + ' (' + state.attDate + ').');
}
function feesPage() {
  if (state.collectStudent) return collectFeePage(state.collectStudent);
  if (state.feeStudent) return studentFeeProfile(state.feeStudent);
  var ft = feeTotals(), f = state.feeFilter, ty = state.feeType;
  var list = feeFiltered();
  var bt = feeTypeTotals();
  var btRows = Object.keys(bt).sort(function (a, b) { return (bt[b].collected + bt[b].pending) - (bt[a].collected + bt[a].pending); }).map(function (ty2) {
    return '<div class="type-row"><b>' + esc(feeTypeLabel(ty2)) + '</b><span>' + t('collectedW') + ' ' + inr(bt[ty2].collected) + ' • ' + t('pendingW') + ' ' + inr(bt[ty2].pending) + '</span></div>';
  }).join('');
  var typeOpts = ['All'].concat(feeAllTypes()).map(function (x) {
    return '<option value="' + esc(x) + '" ' + (ty === x ? 'selected' : '') + '>' + (x === 'All' ? t('allTypes') : esc(feeTypeLabel(x))) + '</option>';
  }).join('');
  var rows = list.slice(0, 120).map(function (r) {
    return '<tr><td><button class="linklike" onclick="return openFeeProfile(\'' + r.studentId + '\', event)">' + esc(r.student) + '</button></td><td>' + esc(enrOf(r.studentId)) + '</td><td>' + esc(r.cls) + '</td><td>' + r.month + '</td><td>' + esc(feeTypeLabel(feeTypeOf(r))) + '</td><td>' + inr(r.amount) + '</td><td>' + esc(r.date) + '</td>' +
      '<td><span class="badge ' + (r.status === 'Collected' ? 'green' : 'orange') + '">' + r.status + '</span></td>' +
      '<td>' + receiptCellForRecord(r) + '</td>' +
      '<td>' + (r.status === 'Pending' ? '<button class="btn green sm" onclick="openCollectFee(\'' + r.studentId + '\',\'' + r.id + '\')">' + t('collectBtn') + '</button> ' + waReminderBtn(r.id, r.studentId) + ' <button class="btn danger sm" onclick="deleteFeeRecord(\'' + r.id + '\')">' + t('deleteBtn') + '</button>' : '<span class="muted">—</span>') + '</td></tr>';
  }).join('');
  return '<div class="page-head"><div><h2>' + t('fees') + '</h2><p>' + t('collectedW') + ' ' + inr(ft.collected) + ' • ' + t('pendingW') + ' ' + inr(ft.pending) + ' (' + feeRangeLabel() + ')</p></div>' +
    '<div class="toolbar"><div class="pill-tabs">' + ['All', 'Pending', 'Collected'].map(function (x) {
      return '<button class="' + (f === x ? 'on' : '') + '" onclick="state.feeFilter=\'' + x + '\';renderPage()">' + (x === 'All' ? t('allW') : x === 'Pending' ? t('pendingW') : t('collectedW')) + '</button>';
    }).join('') + '</div>' +
    '<select onchange="state.feeType=this.value;renderPage()" aria-label="Fee type">' + typeOpts + '</select>' +
    '<input id="feeSearchInput" placeholder="' + t('searchFee') + '" value="' + esc(state.feeSearch) + '" oninput="state.feeSearch=this.value;filterFees(this.value)" style="min-width:200px">' +
    '<button class="btn ghost" onclick="printFeeList()">🖨 ' + t('printList') + '</button></div></div>' +
    '<div class="stats">' +
    statCard('💰', 'orange', t('feeCollected'), ft.collected, '', 'up', { prefix: '₹' }) +
    statCard('⏰', 'red', t('pendingFee'), ft.pending, '', 'down', { prefix: '₹' }) +
    '</div>' +
    '<div class="card"><h3>' + t('feeByType') + '</h3><p class="card-sub">' + t('feeByTypeSub') + '</p><div class="type-rows">' + (btRows || '<div class="empty">' + t('tNoFeeRecs') + '</div>') + '</div></div>' +
    '<div class="card"><h3>' + t('feeTrend') + '</h3><p class="card-sub">' + feeRangeLabel() + ' (' + t('collectedW') + ' / ' + t('pendingW') + ')</p><div class="chart-box">' + barChartSVG(feeChartData()) + '</div><p class="muted" style="margin-top:8px"><span style="color:' + BLUE + '">■</span> ' + t('collectedW') + ' &nbsp; <span style="color:' + ORANGE + '">■</span> ' + t('pendingW') + '</p></div>' +
    '<div class="card"><div class="tbl-wrap fee-list-tbl"><table><thead><tr><th>' + t('thStudent') + '</th><th>' + t('thEnr') + '</th><th>' + t('thClass') + '</th><th>' + t('thMonth') + '</th><th>' + t('thType') + '</th><th>' + t('thAmount') + '</th><th>' + t('thDate') + '</th><th>' + t('thStatus') + '</th><th>' + t('thReceipt') + '</th><th>' + t('thAction') + '</th></tr></thead><tbody id="feeBody">' +
    (rows || '<tr><td colspan="10"><div class="empty">' + t('tNoMatch') + '</div></td></tr>') + '<tr id="feeNoMatch" style="display:none"><td colspan="10"><div class="empty">' + t('tNoMatch') + '</div></td></tr></tbody></table></div>' +
    '<p class="muted" id="feeCount" style="margin-top:10px">' + t('showingRec') + ' ' + Math.min(120, list.length) + ' ' + t('ofRec') + ' ' + list.length + ' ' + t('recordsWord') + '</p></div>' +
    feeFormCard() + feeStructureCard();
}

/* ================= student fee profile ================= */
function openFeeProfile(sid, e) {
  if (e) e.preventDefault();
  state.feeStudent = sid; state.collectStudent = null; state.collectRecordId = null; state.savedReceiptId = null; collectDraft = null;
  persistSession();
  histPush({ view: 'fees', sub: 'profile:' + sid });
  renderPage();
  return false;
}
function openAddFeeFor(sid) {
  state.feeStudent = null; state.feeFormOpen = true; state.feePreselect = sid;
  renderApp();
}
function studentFeeProfile(sid) {
  var sum = feeSummaryFor(sid);
  if (!sum) { state.feeStudent = null; return feesPage(); }
  var s = sum.s, recs = sum.recs, billed = sum.billed, paid = sum.paid, pend = sum.pend, byType = sum.byType;
  var btRows = Object.keys(byType).map(function (ty2) {
    return '<div class="type-row"><b>' + esc(feeTypeLabel(ty2)) + '</b><span>' + t('collectedW') + ' ' + inr(byType[ty2].collected) + ' • ' + t('pendingW') + ' ' + inr(byType[ty2].pending) + '</span></div>';
  }).join('');
  var rows = recs.map(function (r) {
    return '<tr><td>' + r.month + '</td><td>' + esc(feeTypeLabel(feeTypeOf(r))) + '</td><td>' + inr(r.amount) + '</td><td>' + esc(r.date) + '</td>' +
      '<td><span class="badge ' + (r.status === 'Collected' ? 'green' : 'orange') + '">' + r.status + '</span></td>' +
      '<td>' + (r.status === 'Pending' ? '<button class="btn green sm" onclick="openCollectFee(\'' + s.id + '\',\'' + r.id + '\')">' + t('collectBtn') + '</button> ' + waReminderBtn(r.id, s.id) + ' <button class="btn danger sm" onclick="deleteFeeRecord(\'' + r.id + '\')">' + t('deleteBtn') + '</button>' : '<span class="muted">—</span>') + '</td></tr>';
  }).join('');
  return '<div class="page-head"><div class="prof-head">' + avatarHTML(s.photo, s.name, 'big-avatar') + '<div><h2>' + esc(s.name) + '</h2><p>' + t('thClass') + ' ' + esc(s.cls) + ' • ' + t('thEnr') + ' ' + esc(s.enr || '—') + ' • ' + t('thGuardian') + ' ' + esc(s.guardian) + ' • ' + t('thPhone') + ' ' + esc(s.phone) + '</p><p class="muted">' + t('feeProfileSub') + '</p></div></div>' +
    '<div class="toolbar"><button class="btn ghost" onclick="backFromFeeProfile()">← ' + t('backFees') + '</button>' +
    '<button class="btn green" onclick="openCollectFee(\'' + s.id + '\')">💰 ' + t('collectFeeBtn') + '</button>' +
    '<button class="btn" onclick="openAddFeeFor(\'' + s.id + '\')">+ ' + t('addFee') + '</button>' +
    '<button class="btn ghost" onclick="printStudentStatement(\'' + s.id + '\')">🖨 ' + t('printStmt') + '</button></div></div>' +
    '<div class="stats">' +
    statCard('🧾', 'blue', t('totalBilled'), billed, '', 'up', { prefix: '₹' }) +
    statCard('✅', 'green', t('totalPaid'), paid, '', 'up', { prefix: '₹' }) +
    statCard('⏰', 'red', t('totalPending'), pend, '', 'down', { prefix: '₹' }) +
    '</div>' +
    '<div class="card"><h3>' + t('feeByType') + '</h3><p class="card-sub">' + t('feeByTypeSub') + '</p><div class="type-rows">' + (btRows || '<div class="empty">' + t('tNoFeeRecs') + '</div>') + '</div></div>' +
    '<div class="card"><h3>' + t('feeRecsH') + '</h3><p class="card-sub">' + recs.length + ' ' + t('recordsWord') + '</p><div class="tbl-wrap fee-prof-tbl"><table><thead><tr><th>' + t('thMonth') + '</th><th>' + t('thType') + '</th><th>' + t('thAmount') + '</th><th>' + t('thDate') + '</th><th>' + t('thStatus') + '</th><th>' + t('thAction') + '</th></tr></thead><tbody>' + (rows || '<tr><td colspan="6"><div class="empty">' + t('tNoFeeRecs') + '</div></td></tr>') + '</tbody></table></div></div>' +
    receiptListCard(sid);
}
// v39: the receipt for one fee record — same student, same month,
// latest first; a receipt whose lines include the record's fee type
// wins over one that merely shares the month. A fee record carries
// no receipt id of its own, so the receipt view is found this way
// from the Fees list and the profile Fee History tab — stable entry
// points that do not depend on the fee profile's bottom card or on
// the one-shot view right after collecting.
function receiptForFeeRecord(r) {
  var list = (db.receipts || []).filter(function (rc) { return rc.studentId === r.studentId && rc.month === r.month && rc.receiptNo; });
  if (!list.length) return null;
  var ty = feeTypeOf(r);
  var typed = list.filter(function (rc) { return (rc.lines || []).some(function (ln) { return ln.type === ty; }); });
  var pick = typed.length ? typed : list;
  // Latest date first; among same-date receipts the EARLIEST number —
  // a receipt re-numbered by a past repair cycle is a duplicate of the
  // original, and the original number is the stable one to show (v41:
  // the v40 loop left 64 copies of each receipt under ever-higher
  // numbers; showing the latest number made the column change on
  // every render).
  pick.sort(function (a, b) { return (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.receiptNo < b.receiptNo ? -1 : 1)); });
  return pick[0];
}
function receiptCellForRecord(r) {
  // A receipt exists only for money already collected — a Pending
  // row never shows one, even when another record for the same
  // student and month was already paid (partial payments split one
  // due into a Collected part and a Pending remainder).
  if (r.status !== 'Collected') return '<span class="muted">—</span>';
  var rc = receiptForFeeRecord(r);
  if (!rc) return '<span class="muted">—</span>';
  return '<button class="linklike" onclick="openSavedReceipt(\'' + esc(rc.receiptNo) + '\')">' + esc(rc.receiptNo) + '</button>';
}
function receiptListCard(sid) {
  var rcs = (db.receipts || []).filter(function (r) { return r.studentId === sid; }).slice().reverse();
  var rcRows = rcs.map(function (r) {
    return '<tr><td>' + esc(r.receiptNo) + '</td><td>' + esc(r.date) + '</td><td>' + esc(payModeLabel(r.payMode)) + '</td><td>' + inr(r.total) + '</td>' +
      '<td><button class="btn sm" onclick="openSavedReceipt(\'' + esc(r.receiptNo) + '\')">' + t('rcptView') + '</button> ' +
      '<button class="btn ghost sm" onclick="printReceipt(\'' + esc(r.receiptNo) + '\')">🖨 ' + t('rcptPrint') + '</button> ' +
      '<button class="btn ghost sm" onclick="waReceiptShare(\'' + esc(r.receiptNo) + '\')">💬 ' + t('waShareReceiptBtn') + '</button></td></tr>';
  }).join('');
  return '<div class="card"><h3>' + t('rcptReceipts') + '</h3><p class="card-sub">' + rcs.length + ' ' + t('recordsWord') + '</p><div class="tbl-wrap"><table><thead><tr><th>' + t('rcptReceiptNo') + '</th><th>' + t('rcptDate') + '</th><th>' + t('rcptPayMode') + '</th><th>' + t('rcptTotal') + '</th><th>' + t('thAction') + '</th></tr></thead><tbody>' + (rcRows || '<tr><td colspan="5"><div class="empty">' + t('rcptNoReceipts') + '</div></td></tr>') + '</tbody></table></div></div>';
}

/* ================= manual fee + fee structure + generate ================= */
function toggleFeeForm() { state.feeFormOpen = !state.feeFormOpen; if (!state.feeFormOpen) state.feePreselect = null; renderPage(); }
function toggleCustom(selId, wrapId) {
  var s = $(selId), w = $(wrapId);
  if (s && w) w.classList.toggle('hidden', s.value !== '__custom');
}
function feeTypeSelectOpts() {
  return FEE_TYPES.map(function (x) { return '<option value="' + esc(x) + '">' + esc(feeTypeLabel(x)) + '</option>'; }).join('') + '<option value="__custom">' + t('customType') + '</option>';
}
function feeFormCard() {
  var btn = '<button class="btn ghost sm" onclick="toggleFeeForm()">' + (state.feeFormOpen ? '✕ ' + t('closeW') : '+ ' + t('addFee')) + '</button>';
  var body = '';
  if (state.feeFormOpen) {
    var stuOpts = db.students.map(function (s) {
      return '<option value="' + s.id + '" ' + (state.feePreselect === s.id ? 'selected' : '') + '>' + esc(s.name) + ' — ' + esc(s.cls) + ' (' + esc(s.enr || '') + ')</option>';
    }).join('');
    var curM = new Date().toLocaleString('en', { month: 'short' });
    if (MONTHS_ACAD.indexOf(curM) === -1) curM = 'Sep';
    var moOpts = MONTHS_ACAD.map(function (m) { return '<option ' + (m === curM ? 'selected' : '') + '>' + m + '</option>'; }).join('');
    body = '<form onsubmit="return saveFeeRecord(event)" style="margin-top:14px"><div class="form-grid">' +
      '<div><label>' + t('fStudent') + '</label><select id="fFeeStudent">' + stuOpts + '</select></div>' +
      '<div><label>' + t('fMonth') + '</label><select id="fFeeMonth">' + moOpts + '</select></div>' +
      '<div><label>' + t('fType') + '</label><select id="fFeeType" onchange="toggleCustom(\'fFeeType\',\'fFeeCustomWrap\')">' + feeTypeSelectOpts() + '</select></div>' +
      '<div><label>' + t('fAmount') + '</label><input id="fFeeAmount" type="number" min="1" step="1" placeholder="e.g. 1500" required></div>' +
      '<div><label>' + t('fStatus') + '</label><select id="fFeeStatus"><option value="Pending">' + t('pendingW') + '</option><option value="Collected">' + t('collectedW') + '</option></select></div>' +
      '<div><label>' + t('fDate') + '</label><input id="fFeeDate" type="date" value="' + todayIST() + '"></div>' +
      '<div class="full hidden" id="fFeeCustomWrap"><label>' + t('customType') + '</label><input id="fFeeCustom" placeholder="' + t('typeCustomPh') + '"></div>' +
      '</div><div class="actions" style="justify-content:flex-start"><button class="btn" type="submit">' + t('saveFeeBtn') + '</button></div></form>';
  }
  return '<div class="card"><div class="head-row"><div><h3>' + t('addFee') + '</h3><p class="card-sub">' + t('addFeeSub') + '</p></div>' + btn + '</div>' + body + '</div>';
}
function saveFeeRecord(e) {
  e.preventDefault();
  if (state.role !== 'school') { toast(t('tNotAllowed')); return false; }
  var sid = $('fFeeStudent').value;
  var s = db.students.find(function (x) { return x.id === sid; });
  if (!sid || !s) { toast(t('tPickStudent')); return false; }
  var amt = parseFloat($('fFeeAmount').value);
  if (isNaN(amt) || amt <= 0) { toast(t('tAmtPositive')); return false; }
  var ty = $('fFeeType').value;
  if (ty === '__custom') {
    ty = $('fFeeCustom').value.trim();
    if (!ty) { toast(t('tTypeRequired')); return false; }
  }
  db.feeRecords.push({ id: uniqueId('fee'), studentId: sid, student: s.name, cls: s.cls,
    month: $('fFeeMonth').value, type: ty, amount: amt, status: $('fFeeStatus').value, date: $('fFeeDate').value || todayIST() });
  refreshStudentFee(sid);
  state.feePreselect = null;
  saveDB(db); renderApp();
  toast('✓ ' + t('tFeeAdded'));
  return false;
}
function feeStructureCard() {
  var rows = (db.feeStructure || []).map(function (row, i) {
    return '<tr><td>' + esc(row.cls) + '</td><td>' + esc(feeTypeLabel(row.type)) + '</td>' +
      '<td><input type="number" min="0" step="50" value="' + row.amount + '" id="fsAmt-' + i + '" style="width:120px"></td>' +
      '<td><button class="btn danger sm" onclick="deleteFeeStructureRow(' + i + ')">' + t('deleteBtn') + '</button></td></tr>';
  }).join('');
  var clsOpts = CLASSES.map(function (c) { return '<option>' + c + '</option>'; }).join('');
  var moOpts = MONTHS_ACAD.map(function (m) { return '<option ' + (m === state.feeGenMonth ? 'selected' : '') + '>' + m + '</option>'; }).join('');
  var ex = feeExtras();
  return '<div class="card"><div class="head-row"><div><h3>' + t('feeStruct') + '</h3><p class="card-sub">' + t('feeStructSub') + '</p></div><button class="btn sm" onclick="saveFeeStructure()">' + t('saveStruct') + '</button></div>' +
    '<div class="tbl-wrap"><table><thead><tr><th>' + t('thClass') + '</th><th>' + t('thType') + '</th><th>' + t('fAmount') + '</th><th>' + t('thAction') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<div class="rcpt-ex"><h4>' + t('rcptOtherFees') + '</h4><p class="card-sub">' + t('rcptAnnualHint') + '</p><div class="form-grid">' +
    '<div><label>' + t('rcptAdmissionFee') + ' (₹)</label><input type="number" min="0" step="50" id="fsEx-admissionFee" value="' + ex.admissionFee + '"></div>' +
    '<div><label>' + t('rcptCaution') + ' (₹)</label><input type="number" min="0" step="50" id="fsEx-cautionMoney" value="' + ex.cautionMoney + '"></div>' +
    '<div><label>' + t('rcptAnnual') + ' (₹)</label><input type="number" min="0" step="50" id="fsEx-annualCharges" value="' + ex.annualCharges + '"></div>' +
    '<div><label>' + t('rcptBusFee') + ' / ' + t('fMonth') + ' (₹)</label><input type="number" min="0" step="50" id="fsEx-transportFee" value="' + ex.transportFee + '"></div>' +
    '</div></div>' +
    '<div class="toolbar" style="margin-top:14px"><select id="fsNewCls">' + clsOpts + '</select>' +
    '<select id="fsNewType" onchange="toggleCustom(\'fsNewType\',\'fsNewCustomWrap\')">' + feeTypeSelectOpts() + '</select>' +
    '<input id="fsNewAmt" type="number" min="1" step="50" placeholder="e.g. 1500" style="max-width:130px">' +
    '<button class="btn ghost sm" onclick="addFeeStructureRow()">+ ' + t('addRow') + '</button></div>' +
    '<div class="full hidden" id="fsNewCustomWrap" style="margin-top:10px"><input id="fsNewCustom" placeholder="' + t('typeCustomPh') + '" style="max-width:260px"></div>' +
    '<div class="toolbar" style="margin-top:16px;border-top:1px solid var(--border);padding-top:14px"><label style="margin:0">' + t('fMonth') + '</label>' +
    '<select id="fGenMonth" onchange="state.feeGenMonth=this.value">' + moOpts + '</select>' +
    '<button class="btn green" onclick="generateFees()">' + t('genFees') + '</button></div></div>';
}
function saveFeeStructure() {
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
  var rows = db.feeStructure || [];
  var exVals = {};
  var exKeys = ['admissionFee', 'cautionMoney', 'annualCharges', 'transportFee'];
  for (var k = 0; k < exKeys.length; k++) {
    var exInp = $('fsEx-' + exKeys[k]);
    if (!exInp || exInp.value === '' || exInp.value == null) continue; // empty input: keep the stored amount
    var exV = parseFloat(exInp.value);
    if (isNaN(exV) || exV < 0) { toast(t('tAmtPositive')); return; }
    exVals[exKeys[k]] = exV;
  }
  for (var i = 0; i < rows.length; i++) {
    var inp = $('fsAmt-' + i);
    if (!inp) continue;
    var v = parseFloat(inp.value);
    if (isNaN(v) || v < 0) { toast(t('tAmtPositive')); return; }
    rows[i].amount = v;
  }
  var ex = feeExtras();
  Object.keys(exVals).forEach(function (k) { ex[k] = exVals[k]; });
  saveDB(db); renderPage();
  toast('✓ ' + t('tStructSaved'));
}
function addFeeStructureRow() {
  var cls = $('fsNewCls').value;
  var ty = $('fsNewType').value;
  if (ty === '__custom') {
    ty = $('fsNewCustom').value.trim();
    if (!ty) { toast(t('tTypeRequired')); return; }
  }
  var amt = parseFloat($('fsNewAmt').value);
  if (isNaN(amt) || amt <= 0) { toast(t('tAmtPositive')); return; }
  if (!Array.isArray(db.feeStructure)) db.feeStructure = defaultFeeStructure();
  db.feeStructure.push({ cls: cls, type: ty, amount: amt });
  saveDB(db); renderPage();
  toast('✓ ' + t('tStructAdded'));
}
function deleteFeeStructureRow(i) {
  if (!Array.isArray(db.feeStructure) || !db.feeStructure[i]) return;
  db.feeStructure.splice(i, 1);
  saveDB(db); renderPage();
  toast(t('tStructRemoved'));
}
function deleteFeeRecord(rid) {
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
  // Only a PENDING record can be deleted. A Collected record is tied to a
  // receipt and is the payment's evidence, so it must stay.
  var r = db.feeRecords.find(function (x) { return x.id === rid; });
  if (!r || r.status !== 'Pending') return;
  var s = db.students.find(function (x) { return x.id === r.studentId; });
  confirmModal(t('delFeeMsg') + ' — ' + (s ? s.name + ' • ' : '') + r.month + ' • ' + feeTypeLabel(feeTypeOf(r)) + ' ' + inr(r.amount) + '?', function () {
    db.feeRecords = db.feeRecords.filter(function (x) { return x.id !== rid; });
    if (state.collectRecordId === rid) { state.collectStudent = null; state.collectRecordId = null; collectDraft = null; }
    if (s) refreshStudentFee(s.id);
    logAudit('Fee record deleted', (s ? s.name + ' (' + (s.enr || '') + ') • ' : '') + r.month + ' ' + feeTypeLabel(feeTypeOf(r)) + ' ' + inr(r.amount));
    saveDB(db); renderApp();
    toast('✓ ' + t('tFeeDeleted'));
  });
}
function generateFees() {
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
  var month = state.feeGenMonth;
  var sel = $('fGenMonth');
  if (sel && sel.value) month = sel.value;
  state.feeGenMonth = month;
  // B3: 'YYYY-MM' of the month being billed (session-correct via B7's
  // monthStartDate) — compared against each student's admission month.
  var monthKey = monthStartDate(month).slice(0, 7);
  var existing = {};
  db.feeRecords.forEach(function (r) { if (r.month === month) existing[r.studentId + '|' + feeTypeOf(r)] = 1; });
  var made = 0, skipped = 0, notYetAdm = 0;
  db.students.forEach(function (s) {
    // v34 (P0-3): dues only for enrolled students — Draft (admission not
    // finished) and Cancelled never get a due.
    if (!isEnrolledStudent(s)) return;
    // B3: no bill for months before the student's admission month. A blank
    // admissionDate (old records) bills as before; the admission month
    // itself is billed in full — there is no pro-rata billing.
    var admMonth = String(s.admissionDate || '').slice(0, 7);
    if (admMonth && /^\d{4}-\d{2}$/.test(admMonth) && monthKey < admMonth) { notYetAdm++; return; }
    (db.feeStructure || []).forEach(function (row) {
      if (row.cls !== s.cls) return;
      var key = s.id + '|' + row.type;
      if (existing[key]) { skipped++; return; }
      // v34 (P0-3): a deterministic id — 'fee-gen-<student>-<month>-<type>'.
      // Two devices generating the same month create the SAME local_id, so
      // the upload pass dedupes by local_id and only one Pending row ever
      // lands on the server. (A unique constraint on ss_fee_records would
      // break partial payments, which create a second Collected record for
      // the same student/month/type — so the dedupe is by id, not by
      // constraint.)
      db.feeRecords.push({ id: 'fee-gen-' + s.id + '-' + month + '-' + row.type, studentId: s.id, student: s.name, cls: s.cls,
        month: month, type: row.type, amount: row.amount, status: 'Pending', date: monthStartDate(month) });
      existing[key] = 1; made++;
    });
  });
  db.students.forEach(function (s) { s.fee = studentFeeStatus(s.id); });
  saveDB(db); renderApp();
  var msg = '✓ ' + made + ' ' + t('tGenRecords') + ' ' + month + ' • ' + skipped + ' ' + t('tGenSkipped');
  if (notYetAdm) msg += ' • ' + notYetAdm + ' ' + t('tGenNotAdmitted');
  toast(msg + '.');
}

/* ================= print ================= */
function printRowsToArea(title, sub, headHtml, bodyHtml, totalsHtml) {
  var printLogoHtml = db.profile.logo ? '<img class="print-logo" src="' + esc(db.profile.logo) + '" alt="">' : '';
  $('printArea').innerHTML = '<div class="print-stmt"><div class="print-head">' + printLogoHtml + '<div><h1>' + esc(db.profile.name) + '</h1><p class="muted">' + esc(db.profile.address || '') + ' • ' + esc(db.profile.phone || '') + '</p></div></div>' +
    '<h2>' + esc(title) + '</h2><p>' + sub + '</p><table><thead><tr>' + headHtml + '</tr></thead><tbody>' + bodyHtml + '</tbody></table>' + totalsHtml +
    '<p class="muted" style="margin-top:14px">' + t('printGenOn') + ' ' + todayIST() + '</p></div>';
  if (window.print) window.print();
}
function printStudentStatement(sid) {
  var s = db.students.find(function (x) { return x.id === sid; });
  if (!s) return;
  var recs = db.feeRecords.filter(function (r) { return r.studentId === sid; })
    .sort(function (a, b) { return (MONTH_NUM[a.month] || 99) - (MONTH_NUM[b.month] || 99) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0); });
  var billed = 0, paid = 0, pend = 0;
  recs.forEach(function (r) { billed += r.amount; if (r.status === 'Collected') paid += r.amount; else pend += r.amount; });
  var body = recs.map(function (r) {
    return '<tr><td>' + r.month + '</td><td>' + esc(feeTypeLabel(feeTypeOf(r))) + '</td><td>' + inr(r.amount) + '</td><td>' + esc(r.date) + '</td><td>' + r.status + '</td></tr>';
  }).join('');
  printRowsToArea(t('printTitle'), esc(s.name) + ' • ' + t('thClass') + ' ' + esc(s.cls) + ' • ' + t('thEnr') + ' ' + esc(s.enr || '—') + ' • ' + t('thGuardian') + ' ' + esc(s.guardian),
    '<th>' + t('thMonth') + '</th><th>' + t('thType') + '</th><th>' + t('thAmount') + '</th><th>' + t('thDate') + '</th><th>' + t('thStatus') + '</th>',
    body,
    '<div class="tot"><span>' + t('totalBilled') + ': ' + inr(billed) + '</span><span>' + t('totalPaid') + ': ' + inr(paid) + '</span><span>' + t('totalPending') + ': ' + inr(pend) + '</span></div>');
}
function printFeeList() {
  var list = feeFiltered();
  var c = 0, p = 0;
  list.forEach(function (r) { if (r.status === 'Collected') c += r.amount; else p += r.amount; });
  var body = list.slice(0, 500).map(function (r) {
    return '<tr><td>' + esc(r.student) + '</td><td>' + esc(enrOf(r.studentId)) + '</td><td>' + esc(r.cls) + '</td><td>' + r.month + '</td><td>' + esc(feeTypeLabel(feeTypeOf(r))) + '</td><td>' + inr(r.amount) + '</td><td>' + esc(r.date) + '</td><td>' + r.status + '</td></tr>';
  }).join('');
  var filt = t('fees') + ' — ' + (state.feeFilter === 'All' ? t('allW') : state.feeFilter) + ' • ' + (state.feeType === 'All' ? t('allTypes') : feeTypeLabel(state.feeType)) + (state.feeSearch ? ' • \u201c' + esc(state.feeSearch) + '\u201d' : '') + ' (' + feeRangeLabel() + ')';
  printRowsToArea(t('printListTitle'), filt,
    '<th>' + t('thStudent') + '</th><th>' + t('thEnr') + '</th><th>' + t('thClass') + '</th><th>' + t('thMonth') + '</th><th>' + t('thType') + '</th><th>' + t('thAmount') + '</th><th>' + t('thDate') + '</th><th>' + t('thStatus') + '</th>',
    body,
    '<div class="tot"><span>' + t('collectedW') + ': ' + inr(c) + '</span><span>' + t('pendingW') + ': ' + inr(p) + '</span><span>' + list.length + ' ' + t('recordsWord') + '</span></div>');
}

/* ================= Phase 3: ID cards + QR (v11) =================
   QR: Nayuki qrcodegen (MIT), vendored as qrgen.js and loaded before app.js.
   Payload: SCHOOL-SAATHI|<admissionNo>|<name>|<class>|<school>|<phone>.
   Aadhaar is NEVER in the payload, the card, or any print output. */
function idCardPayload(s) {
  return ['SCHOOL-SAATHI', (s.admissionNo || s.enr || ''), (s.name || ''), (s.cls || ''), (db.profile.name || ''), (s.phone || '')].join('|');
}
// Pure SVG render of the QR matrix (crisp at print size). Returns '' when the
// encoder is unavailable or the text cannot be encoded — never a fake image.
function qrSvgFor(text, px) {
  if (!String(text || '').trim()) return ''; // never render a QR for empty data
  if (typeof qrcodegen === 'undefined' || !qrcodegen.QrCode) return '';
  var qr;
  try { qr = qrcodegen.QrCode.encodeText(String(text || ''), qrcodegen.QrCode.Ecc.MEDIUM); }
  catch (e) { return ''; }
  var n = qr.size, border = 4, total = n + border * 2, cell = px / total;
  var rects = '';
  for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
    if (qr.getModule(x, y)) rects += '<rect x="' + ((x + border) * cell).toFixed(2) + '" y="' + ((y + border) * cell).toFixed(2) + '" width="' + cell.toFixed(2) + '" height="' + cell.toFixed(2) + '"/>';
  }
  return '<svg class="id-qr" viewBox="0 0 ' + px + ' ' + px + '" width="' + px + '" height="' + px + '" role="img" aria-label="QR code"><rect width="' + px + '" height="' + px + '" fill="#ffffff"/>' + rects + '</svg>';
}
// One student's front + back, credit-card size (85.6 x 54 mm), navy + gold.
function idCardHTML(s) {
  var logoHtml = db.profile.logo ? '<img class="id-logo-img" src="' + esc(db.profile.logo) + '" alt="">' : '<span class="id-logo-cap">🎓</span>';
  var qr = qrSvgFor(idCardPayload(s), 150);
  var qrHtml = qr || '<div class="id-qr-missing">' + t('idcNoQr') + '</div>';
  var backLines = '';
  if (s.address) backLines += '<span><b>' + t('fAddress') + ':</b> ' + esc(s.address) + '</span>';
  if (s.bloodGroup) backLines += '<span><b>' + t('fBlood') + ':</b> ' + esc(s.bloodGroup) + '</span>';
  backLines += '<span><b>' + t('idcEmergency') + ':</b> ' + esc(s.guardian || '') + ' • ' + esc(s.phone || '') + '</span>';
  return '<div class="id-sheet">' +
    '<div class="id-card id-front"><div class="id-head">' + logoHtml + '<span class="id-school">' + esc(db.profile.name) + '</span></div>' +
    '<div class="id-body">' + avatarHTML(s.photo, s.name, 'id-photo') + '<div class="id-info"><b class="id-name">' + esc(s.name) + '</b>' +
    '<span>' + t('thAdmNo') + ' ' + esc(s.admissionNo || '—') + '</span>' +
    '<span>' + t('thClass') + ' ' + esc(s.cls) + ' • ' + t('fRoll') + ' ' + s.roll + '</span>' +
    '<span>' + t('fSession') + ' ' + esc(s.session || '—') + '</span></div></div>' +
    '<div class="id-foot">' + t('fGuardian') + ': ' + esc(s.guardian || '') + ' • ' + esc(s.phone || '') + '</div></div>' +
    '<div class="id-card id-back"><div class="id-qr-wrap">' + qrHtml + '</div><div class="id-back-info">' + backLines +
    '<span class="id-return">' + t('idcReturn') + ' ' + esc(db.profile.name) + '</span></div></div></div>';
}
function idCardsPrintHTML(ids) {
  return (ids || []).map(function (id) {
    var s = db.students.find(function (x) { return x.id === id; });
    return s ? idCardHTML(s) : '';
  }).join('');
}
// Print preview modal: shows the count + the exact cards, then prints via #printArea.
function openIdCardPreview(ids) {
  ids = (ids || []).filter(function (id) { return canViewStudent(id); });
  if (!ids.length) { toast(t('tNotAllowed')); return; }
  var list = (ids || []).map(function (id) { return db.students.find(function (x) { return x.id === id; }); }).filter(function (s) { return !!s; });
  if (!list.length) { toast(t('promoNoSelect')); return; }
  pendingIdPrint = list.map(function (s) { return s.id; });
  openModal('<h3>' + t('idcPreview') + '</h3><p class="muted">' + list.length + ' ' + t('idcReady') + '</p>' +
    '<div class="id-preview">' + list.map(function (s) { return idCardHTML(s); }).join('') + '</div>' +
    '<div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button>' +
    '<button type="button" class="btn" onclick="printIdCardsNow()">🖨 ' + t('idcPrint') + '</button></div>', true);
}
function printIdCardsNow() {
  if (!pendingIdPrint.length) { closeModal(); return; }
  var n = pendingIdPrint.length;
  closeModal();
  $('printArea').innerHTML = '<div class="id-print">' + idCardsPrintHTML(pendingIdPrint) + '</div>';
  if (window.print) window.print();
  toast(n + ' ' + t('idcReady'));
}
function printIdCard(id) { openIdCardPreview([id]); }
function printIdCardsBulk() {
  var ids = Object.keys(state.stuSel || {});
  if (!ids.length) { toast(t('promoNoSelect')); return; }
  openIdCardPreview(ids);
}
function toggleStuSel(id, checked) {
  if (!state.stuSel) state.stuSel = {};
  if (checked) state.stuSel[id] = true; else delete state.stuSel[id];
  renderPage();
}
function toggleStuSelAll(checked) {
  if (!state.stuSel) state.stuSel = {};
  stuPageRows(stuSorted(stuFiltered())).forEach(function (s) {
    if (checked) state.stuSel[s.id] = true; else delete state.stuSel[s.id];
  });
  renderPage();
}
function clearStuSel() { state.stuSel = {}; renderPage(); }
function stuSelCount() { return Object.keys(state.stuSel || {}).length; }

/* ================= Phase 5: fee collection receipt (v13) =================
   Modelled on the DPS fee receipt the user sent: school header, FEE RECEIPT
   title, Receipt No / Date / Adm No / Session / Name / Class / Installment /
   CounterNo, lines table (Sl.No, Description, Due, Con, Paid), PAY MODE
   INFORMATION, Total in Words, QR, computer-generated line, PARENT COPY —
   plus the student's photo and a Collector's Signature block (user's ask).
   Lines auto-fill from real data; every Due / Con / Paid cell is editable.
   Aadhaar is NEVER on the receipt. */
var PAY_MODES = ['Cash', 'Cheque', 'UPI', 'Card', 'Bank Transfer'];
function payModeLabel(m) {
  var k = { 'Cash': 'payModeCash', 'Cheque': 'payModeCheque', 'UPI': 'payModeUpi', 'Card': 'payModeCard', 'Bank Transfer': 'payModeBank' }[m];
  return k ? t(k) : m;
}
function collectMonthDefault() {
  var curM = new Date().toLocaleString('en', { month: 'short' });
  return MONTHS_ACAD.indexOf(curM) === -1 ? 'Sep' : curM;
}
function tuitionForClass(cls) {
  var row = (db.feeStructure || []).find(function (r) { return r.cls === cls && r.type === 'Tuition'; });
  if (row) return row.amount;
  var part = classPartOf(cls);
  var row2 = (db.feeStructure || []).find(function (r) { return classPartOf(r.cls) === part && r.type === 'Tuition'; });
  return row2 ? row2.amount : 0;
}
function hasCollectedType(sid, type, session) {
  return db.feeRecords.some(function (r) {
    if (r.studentId !== sid || feeTypeOf(r) !== type || r.status !== 'Collected') return false;
    if (session) return sessionOfDate(r.date) === session;
    return true;
  });
}
function busDefault(sid) {
  return db.feeRecords.some(function (r) { return r.studentId === sid && feeTypeOf(r) === 'Transport'; });
}
// Auto-fill the receipt lines for a student + month. includeBus (default:
// a Transport record already exists for the student) controls the bus row.
function buildCollectLines(sid, prefRecordId, month, includeBus) {
  var s = db.students.find(function (x) { return x.id === sid; });
  if (!s) return [];
  var ex = feeExtras();
  var lines = [], linked = {};
  var pref = prefRecordId ? db.feeRecords.find(function (r) { return r.id === prefRecordId && r.studentId === sid; }) : null;
  if (pref) month = pref.month;
  var sess = s.session || currentSession();
  if (includeBus === undefined) includeBus = busDefault(sid);
  function addLine(key, desc, type, mo, due, recordId, kind) {
    lines.push({ key: key, desc: desc, type: type, month: mo, due: due, con: 0, paid: due, recordId: recordId || '', kind: kind });
    if (recordId) linked[recordId] = 1;
  }
  // Current-period tuition: pending record amount wins, else structure amount;
  // already Collected for this month -> nothing to collect, row omitted.
  var tuRec = db.feeRecords.find(function (r) { return r.studentId === sid && r.month === month && feeTypeOf(r) === 'Tuition' && r.status === 'Pending'; });
  var tuCol = !tuRec && db.feeRecords.some(function (r) { return r.studentId === sid && r.month === month && feeTypeOf(r) === 'Tuition' && r.status === 'Collected'; });
  var tuAmt = tuRec ? tuRec.amount : (tuCol ? 0 : tuitionForClass(s.cls));
  if (tuAmt > 0) addLine('tuition', t('rcptTuitionFee') + ' (' + month + ')', 'Tuition', month, tuAmt, tuRec ? tuRec.id : '', 'tuition');
  // One-time fees: only while the school charges them AND none collected yet.
  if (ex.admissionFee > 0 && !hasCollectedType(sid, 'Admission')) {
    var aRec = db.feeRecords.find(function (r) { return r.studentId === sid && feeTypeOf(r) === 'Admission' && r.status === 'Pending'; });
    addLine('admission', t('rcptAdmissionFee'), 'Admission', month, aRec ? aRec.amount : ex.admissionFee, aRec ? aRec.id : '', 'onetime');
  }
  if (ex.cautionMoney > 0 && !hasCollectedType(sid, 'Caution Money')) {
    var cRec = db.feeRecords.find(function (r) { return r.studentId === sid && feeTypeOf(r) === 'Caution Money' && r.status === 'Pending'; });
    addLine('caution', t('rcptCaution'), 'Caution Money', month, cRec ? cRec.amount : ex.cautionMoney, cRec ? cRec.id : '', 'onetime');
  }
  if (ex.annualCharges > 0 && !hasCollectedType(sid, 'Annual Charges', sess)) {
    var anRec = db.feeRecords.find(function (r) { return r.studentId === sid && feeTypeOf(r) === 'Annual Charges' && r.status === 'Pending' && sessionOfDate(r.date) === sess; });
    addLine('annual', t('rcptAnnual'), 'Annual Charges', month, anRec ? anRec.amount : ex.annualCharges, anRec ? anRec.id : '', 'onetime');
  }
  // Bus / transport: only when the checkbox is on (default: a Transport
  // record already exists for the student).
  if (ex.transportFee > 0 && includeBus) {
    var trRec = db.feeRecords.find(function (r) { return r.studentId === sid && r.month === month && feeTypeOf(r) === 'Transport' && r.status === 'Pending'; });
    addLine('transport', t('rcptBusFee') + ' (' + month + ')', 'Transport', month, trRec ? trRec.amount : ex.transportFee, trRec ? trRec.id : '', 'transport');
  }
  // Previous dues: one row per Pending record not already linked above.
  db.feeRecords.filter(function (r) { return r.studentId === sid && r.status === 'Pending' && !linked[r.id]; })
    .sort(function (a, b) { return (MONTH_NUM[a.month] || 99) - (MONTH_NUM[b.month] || 99) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0); })
    .forEach(function (r) {
      addLine('dues-' + r.id, t('rcptDues') + ' — ' + r.month + ' ' + feeTypeLabel(feeTypeOf(r)), feeTypeOf(r), r.month, r.amount, r.id, 'dues');
    });
  return lines;
}
// v34 (P0-2): a Paid amount above the net due (Due - Con) is never
// taken. Cap it and report the excess, so the fee records and the
// receipt total always agree — the old code stored rec.amount = net
// while the receipt total kept the full paid amount, so feeTotals()
// undercounted against receipts. Returns the excess amount capped.
function clampCollectLines(d) {
  var excess = 0;
  (d.lines || []).forEach(function (ln) {
    var net = Math.max(0, (+ln.due || 0) - (+ln.con || 0));
    var paid = +ln.paid || 0;
    if (paid > net) { excess += paid - net; ln.paid = net; }
  });
  return excess;
}
function reapplyLineEdits(oldLines, newLines) {
  newLines.forEach(function (nl) {
    var o = (oldLines || []).find(function (x) { return x.key === nl.key; });
    if (o) { nl.due = o.due; nl.con = o.con; nl.paid = o.paid; }
  });
  clampCollectLines({ lines: newLines }); // v34 (P0-2): a copied paid can exceed the new net
}
function newCollectDraft(sid, recordId) {
  var month = collectMonthDefault();
  var pref = recordId ? db.feeRecords.find(function (r) { return r.id === recordId; }) : null;
  if (pref) month = pref.month;
  return { studentId: sid, month: month, counterNo: 'COUNTER-1', payMode: 'Cash', payDate: todayIST(), bank: '', number: '', lines: buildCollectLines(sid, recordId, month), busIncluded: busDefault(sid) };
}
function openCollectFee(sid, recordId) {
  if (state.role !== 'school') return;
  var s = db.students.find(function (x) { return x.id === sid; });
  if (!s || !canViewStudent(sid)) return;
  if (s.status === 'Cancelled' || s.status === 'Draft') { toast(t('tCollectNotActive')); return; }
  state.collectStudent = sid; state.collectRecordId = recordId || null; state.savedReceiptId = null;
  state.view = 'fees'; state.feeStudent = sid;
  collectDraft = newCollectDraft(sid, recordId);
  persistSession();
  histPush({ view: 'fees', sub: 'collect:' + sid + (recordId ? ':' + recordId : '') });
  renderPage();
}
function cancelCollectFee() {
  if (histBack()) return; // the collect entry pops, landing back where it was opened from
  state.collectStudent = null; state.collectRecordId = null; state.savedReceiptId = null; collectDraft = null;
  renderPage();
}
// Read the on-screen inputs back into the draft. Missing / empty inputs
// (e.g. harness stubs) keep the draft value — never wipe it.
function readCollectInputs() {
  var d = collectDraft; if (!d) return;
  var m = $('rcptMonth'); if (m && m.value) d.month = m.value;
  var c = $('rcptCounter'); if (c && c.value.trim()) d.counterNo = c.value.trim();
  var pm = $('rcptPayMode'); if (pm && pm.value) d.payMode = pm.value;
  var pd = $('rcptPayDate'); if (pd && pd.value) d.payDate = pd.value;
  var bk = $('rcptBank'); if (bk) d.bank = bk.value || '';
  var nb = $('rcptNumber'); if (nb) d.number = nb.value || '';
  d.lines.forEach(function (ln) {
    var dv = $('rcptDue-' + ln.key), cv = $('rcptCon-' + ln.key), pv = $('rcptPaid-' + ln.key), v;
    if (dv) { v = parseFloat(dv.value); if (!isNaN(v) && v >= 0) ln.due = v; }
    if (cv) { v = parseFloat(cv.value); if (!isNaN(v) && v >= 0) ln.con = v; }
    if (pv) { v = parseFloat(pv.value); if (!isNaN(v) && v >= 0) ln.paid = v; }
  });
  // v34 (P0-2): cap Paid at the net due here too (readCollectInputs reads
  // the raw inputs, unlike collectLineEdit which caps on every keystroke)
  // and write the capped values back so the screen shows what is taken.
  var capped = clampCollectLines(d);
  if (capped > 0) d.lines.forEach(function (ln) { var pv = $('rcptPaid-' + ln.key); if (pv) pv.value = ln.paid; });
  d.cappedExcess = capped;
}
function collectDraftTotal(d) { var tot = 0; (d.lines || []).forEach(function (ln) { tot += +ln.paid || 0; }); return tot; }
function collectTotalsUpdate() {
  var d = collectDraft; if (!d) return;
  var tot = collectDraftTotal(d);
  var t1 = $('collectTotal'), t2 = $('payModeTotal'), t3 = $('totalWords');
  if (t1) t1.textContent = inr(tot);
  if (t2) t2.textContent = inr(tot);
  if (t3) t3.textContent = numberToWords(tot);
  var qr = $('rcptQr');
  if (qr) {
    var s = db.students.find(function (x) { return x.id === d.studentId; });
    var svg = qrSvgFor(receiptPayload(nextReceiptNo(true), s, tot), 120);
    if (svg) qr.innerHTML = svg;
  }
}
// Paid defaults to Due - Con and re-computes live when Due or Con changes.
function collectLineEdit(el) {
  var d = collectDraft; if (!d) return;
  var key = el.getAttribute('data-line'), field = el.getAttribute('data-field');
  var ln = d.lines.find(function (x) { return x.key === key; });
  if (!ln) return;
  var v = parseFloat(el.value); if (isNaN(v) || v < 0) v = 0;
  if (field === 'due' || field === 'con') {
    if (field === 'due') ln.due = v; else ln.con = v;
    ln.paid = Math.max(0, ln.due - ln.con);
    var p = $('rcptPaid-' + key); if (p) p.value = ln.paid;
  } else if (field === 'paid') {
    ln.paid = Math.min(v, Math.max(0, ln.due - ln.con));
    el.value = ln.paid;
  }
  collectTotalsUpdate();
}
function collectMonthChange(sel) {
  var d = collectDraft; if (!d) return;
  readCollectInputs();
  var old = d.lines; d.month = sel.value;
  d.lines = buildCollectLines(d.studentId, state.collectRecordId, d.month, d.busIncluded);
  reapplyLineEdits(old, d.lines);
  renderPage();
}
function collectBusToggle(cb) {
  var d = collectDraft; if (!d) return;
  readCollectInputs();
  var old = d.lines; d.busIncluded = !!cb.checked;
  d.lines = buildCollectLines(d.studentId, state.collectRecordId, d.month, d.busIncluded);
  reapplyLineEdits(old, d.lines);
  renderPage();
}
function collectPayModeChange(sel) {
  var d = collectDraft; if (!d) return;
  d.payMode = sel.value;
  var show = sel.value === 'Cheque' || sel.value === 'Card' || sel.value === 'Bank Transfer';
  var br = $('rcptBankRow'); if (br) br.classList.toggle('hidden', !show);
}
function receiptPayload(receiptNo, s, total) {
  return ['SCHOOL-SAATHI', 'RECEIPT', receiptNo || '', (s && (s.admissionNo || s.enr)) || '', (s && s.name) || '', total || 0].join('|');
}
function receiptViewFromDraft(d, s) {
  var tot = collectDraftTotal(d);
  return { receiptNo: nextReceiptNo(true), date: todayIST(), month: d.month, session: s.session || currentSession(), counterNo: d.counterNo, lines: d.lines, payMode: d.payMode, payDate: d.payDate, bank: d.bank, number: d.number, total: tot, totalWords: numberToWords(tot), collector: state.user ? state.user.name : '' };
}
// v47: the display student for a saved receipt, resolved from the
// receipt's own stored fields — never from a local-student lookup by
// id. A receipt carries its own student name, class and admission
// number (student_name / admission_no on the server row, name /
// admissionNo locally); the live test account proved why that
// matters: the local list still holds the demo-seed "Aarav Verma"
// under the same id (stu1794162292000) as the real V21 Test Kumar,
// so every id lookup renamed the receipt to Aarav while the fee list
// — which renders the fee record's own stored name — said V21. The
// local row supplies only the photo (the receipt carries no photo);
// name, class and admission number always come from the receipt
// itself, so even a stale local seed can never rename one.
function receiptStudent(rc) {
  var s = (db.students || []).find(function (x) { return x.id === rc.studentId; });
  return { id: rc.studentId, name: rc.name || (s && s.name) || '', cls: rc.cls || (s && s.cls) || '',
    admissionNo: rc.admissionNo || (s && s.admissionNo) || '', enr: rc.admissionNo || (s && s.enr) || '',
    photo: (s && s.photo) || null, session: rc.session || (s && s.session) || '' };
}
// One receipt renderer for the draft page, the saved view and print. Never
// includes Aadhaar (the receipt has no field for it by design).
function receiptHTML(rcpt, s, editable) {
  var logoHtml = db.profile.logo ? '<img class="rcpt-logo" src="' + esc(db.profile.logo) + '" alt="">' : '<span class="rcpt-logo-cap">🎓</span>';
  var moOpts = MONTHS_ACAD.map(function (m) { return '<option value="' + m + '" ' + (m === rcpt.month ? 'selected' : '') + '>' + m + '</option>'; }).join('');
  var meta = '<div class="rcpt-meta"><div class="rcpt-meta-grid">' +
    '<span><b>' + t('rcptReceiptNo') + '</b> : ' + esc(rcpt.receiptNo) + (editable ? ' <span class="muted">(' + t('rcptDraft') + ')</span>' : '') + '</span>' +
    '<span><b>' + t('rcptDate') + '</b> : ' + esc(rcpt.date) + '</span>' +
    '<span><b>' + t('rcptAdmNo') + '</b> : ' + esc(s.admissionNo || s.enr || '—') + '</span>' +
    '<span><b>' + t('rcptSession') + '</b> : ' + esc(rcpt.session || '') + '</span>' +
    '<span><b>' + t('rcptName') + '</b> : ' + esc(s.name) + '</span>' +
    '<span><b>' + t('rcptClass') + '</b> : ' + esc(s.cls) + '</span>' +
    '<span><b>' + t('rcptInstallment') + '</b> : ' + (editable ? '<select id="rcptMonth" onchange="collectMonthChange(this)">' + moOpts + '</select>' : esc(rcpt.month)) + '</span>' +
    '<span><b>' + t('rcptCounter') + '</b> : ' + (editable ? '<input id="rcptCounter" value="' + esc(rcpt.counterNo) + '">' : esc(rcpt.counterNo)) + '</span></div>' +
    avatarHTML(s.photo, s.name, 'rcpt-photo') + '</div>';
  var rows = rcpt.lines.map(function (ln, i) {
    if (editable) {
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(ln.desc) + '</td>' +
        '<td><input type="number" min="0" step="1" id="rcptDue-' + ln.key + '" data-line="' + ln.key + '" data-field="due" value="' + ln.due + '" oninput="collectLineEdit(this)"></td>' +
        '<td><input type="number" min="0" step="1" id="rcptCon-' + ln.key + '" data-line="' + ln.key + '" data-field="con" value="' + ln.con + '" oninput="collectLineEdit(this)"></td>' +
        '<td><input type="number" min="0" step="1" id="rcptPaid-' + ln.key + '" data-line="' + ln.key + '" data-field="paid" value="' + ln.paid + '" oninput="collectLineEdit(this)"></td></tr>';
    }
    return '<tr><td>' + (i + 1) + '</td><td>' + esc(ln.desc) + '</td><td>' + ln.due + '</td><td>' + ln.con + '</td><td>' + ln.paid + '</td></tr>';
  }).join('');
  var busBox = '';
  if (editable && feeExtras().transportFee > 0) {
    busBox = '<label class="check rcpt-bus"><input type="checkbox" id="rcptBus" ' + (collectDraft && collectDraft.busIncluded ? 'checked' : '') + ' onchange="collectBusToggle(this)"> ' + t('rcptIncludeBus') + '</label>';
  }
  var showBank = rcpt.payMode === 'Cheque' || rcpt.payMode === 'Card' || rcpt.payMode === 'Bank Transfer';
  var payOpts = PAY_MODES.map(function (m) { return '<option value="' + m + '" ' + (m === rcpt.payMode ? 'selected' : '') + '>' + payModeLabel(m) + '</option>'; }).join('');
  var pay = '<div class="rcpt-band">' + t('rcptPayModeTitle') + '</div><div class="rcpt-pay-grid">' +
    '<span><b>' + t('rcptPayMode') + '</b> ' + (editable ? '<select id="rcptPayMode" onchange="collectPayModeChange(this)">' + payOpts + '</select>' : esc(payModeLabel(rcpt.payMode))) + '</span>' +
    '<span><b>' + t('rcptDate') + '</b> ' + (editable ? '<input type="date" id="rcptPayDate" value="' + esc(rcpt.payDate) + '">' : esc(rcpt.payDate)) + '</span>' +
    '<span id="rcptBankRow" class="' + (showBank ? '' : 'hidden') + '"><b>' + t('rcptBank') + '</b> ' + (editable ? '<input id="rcptBank" value="' + esc(rcpt.bank || '') + '">' : esc(rcpt.bank || '—')) + '</span>' +
    '<span><b>' + t('rcptNumber') + '</b> ' + (editable ? '<input id="rcptNumber" value="' + esc(rcpt.number || '') + '">' : esc(rcpt.number || '—')) + '</span>' +
    '<span><b>' + t('rcptTotal') + '</b> <b id="payModeTotal">' + inr(rcpt.total) + '</b></span></div>';
  var qr = qrSvgFor(receiptPayload(rcpt.receiptNo, s, rcpt.total), 120);
  return '<div class="rcpt">' +
    '<div class="rcpt-head">' + logoHtml + '<div><div class="rcpt-school">' + esc(db.profile.name) + '</div><div class="rcpt-addr">' + esc(db.profile.address || '') + '</div></div></div>' +
    '<div class="rcpt-title">' + t('rcptTitle') + '</div>' +
    meta +
    '<div class="rcpt-lines"><div class="tbl-wrap rcpt-tbl"><table><thead><tr><th>' + t('rcptSlNo') + '</th><th>' + t('rcptDesc') + '</th><th>' + t('rcptDue') + '</th><th>' + t('rcptCon') + '</th><th>' + t('rcptPaid') + '</th></tr></thead><tbody>' + (rows || '<tr><td colspan="5"><div class="empty">' + t('rcptNoLines') + '</div></td></tr>') + '</tbody></table></div></div>' +
    busBox + pay +
    '<div class="rcpt-total"><span><b>' + t('rcptTotal') + ' :</b></span><b id="collectTotal">' + inr(rcpt.total) + '</b></div>' +
    '<div class="rcpt-words"><b>' + t('rcptTotalWords') + ':</b> <span id="totalWords">' + esc(rcpt.totalWords) + '</span></div>' +
    '<div class="rcpt-foot"><div class="rcpt-qr" id="rcptQr">' + (qr || '<div class="id-qr-missing">' + t('idcNoQr') + '</div>') + '</div>' +
    '<div class="rcpt-note">' + t('rcptComputerGen') + '</div>' +
    '<div class="rcpt-sign"><div class="rcpt-sign-line"></div><div>' + t('rcptCollectorSign') + '</div><div><b>' + esc(rcpt.collector || '') + '</b></div></div></div>' +
    '<div class="rcpt-copy">' + t('rcptParentCopy') + '</div></div>';
}
function collectFeePage(sid) {
  var s = db.students.find(function (x) { return x.id === sid; });
  if (state.savedReceiptId) {
    var rc = (db.receipts || []).find(function (r) { return r.receiptNo === state.savedReceiptId; });
    if (rc) {
      // v47: the receipt resolves its student from its own stored
      // fields (see receiptStudent) — a local row with the same id
      // must never rename it (live: the seed "Aarav Verma" under the
      // V21 id renamed every receipt detail). v41's fallback survives
      // inside the helper: a missing local row still renders from the
      // receipt's own name, class and admission number.
      var s2 = receiptStudent(rc);
      return '<div class="page-head"><div><h2>' + t('rcptTitle') + '</h2><p>' + esc(s2.name) + ' • ' + esc(s2.cls) + ' • ' + esc(s2.admissionNo || '') + '</p></div>' +
        '<div class="toolbar"><button class="btn ghost" onclick="backFromReceipt()">← ' + t('backFees') + '</button></div></div>' +
        receiptHTML(rc, s2, false) +
        '<div class="actions"><button class="btn" onclick="printReceipt(\'' + esc(rc.receiptNo) + '\')">🖨 ' + t('rcptPrint') + '</button>' +
        '<button class="btn" onclick="waReceiptShare(\'' + esc(rc.receiptNo) + '\')">💬 ' + t('waShareReceiptBtn') + '</button>' +
        '<button class="btn green" onclick="openCollectFee(\'' + s2.id + '\')">' + t('rcptCollectAgain') + '</button></div>';
    }
    state.savedReceiptId = null;
  }
  if (!s) { state.collectStudent = null; return feesPage(); }
  var d = collectDraft;
  if (!d || d.studentId !== sid) { d = collectDraft = newCollectDraft(sid, state.collectRecordId); }
  var view = receiptViewFromDraft(d, s);
  return '<div class="page-head"><div><h2>' + t('collectFeeBtn') + '</h2><p>' + esc(s.name) + ' • ' + esc(s.cls) + ' • ' + esc(s.admissionNo || '') + '</p></div>' +
    '<div class="toolbar"><button class="btn ghost" onclick="cancelCollectFee()">← ' + t('backFees') + '</button></div></div>' +
    receiptHTML(view, s, true) +
    '<div class="actions"><button class="btn green" onclick="saveCollectFee(event)">💰 ' + t('rcptCollectSave') + '</button>' +
    '<button class="btn ghost" onclick="cancelCollectFee()">' + t('cancel') + '</button></div>';
}
function saveCollectFee(e) {
  if (e) e.preventDefault();
  var d = collectDraft; if (!d) return false;
  readCollectInputs();
  var s = db.students.find(function (x) { return x.id === d.studentId; });
  if (!s) return false;
  var total = collectDraftTotal(d);
  if (total <= 0) { toast(t('tCollectZero')); return false; }
  // v33: for a server account the receipt number comes from the server,
  // never from the local counter. Offline the receipt is saved WITHOUT
  // a number (numPending) and minted on the next sync. Local-only
  // accounts mint locally, exactly as before.
  var act33 = sbSyncActive();
  if (act33 && sbIsOnline()) {
    sbMintNewReceiptNumber(act33).then(function (no) { finishCollectFee(d, s, total, no, false); })
      .catch(function () { finishCollectFee(d, s, total, '', true); });
    return false;
  }
  if (act33) { finishCollectFee(d, s, total, '', true); return false; }
  finishCollectFee(d, s, total, nextReceiptNo(false), false);
  return false;
}
function finishCollectFee(d, s, total, receiptNo, numPending) {
  var today = d.payDate || todayIST();
  // v34 (P0-2): cap Paid at the net due and recompute the total from the
  // capped lines, so the fee records and the receipt total always agree.
  var cappedExcess = clampCollectLines(d);
  total = 0;
  d.lines.forEach(function (ln) { total += +ln.paid || 0; });
  var savedLines = [];
  d.lines.forEach(function (ln, i) {
    var paid = +ln.paid || 0, due = +ln.due || 0, con = +ln.con || 0;
    var net = Math.max(0, due - con);
    // B2: the saved line carries the id of the Collected fee record
    // this line paid. The receipt content key uses those ids to tell
    // two genuinely different same-day same-amount collections apart
    // (same student, month, total, date, name and fee type). A line
    // that paid nothing has no collection behind it, so it carries
    // no id. The id is the fee record's local id, which the server
    // already stores (ss_fee_records.local_id), so it survives the
    // upload/download round trip inside the receipt's lines.
    var sl = { desc: ln.desc, type: ln.type, month: ln.month, due: due, con: con, paid: paid, recordId: '' };
    savedLines.push(sl);
    if (paid <= 0) return;
    var rec = ln.recordId ? db.feeRecords.find(function (r) { return r.id === ln.recordId; }) : null;
    if (rec) {
      if (paid >= net) { rec.status = 'Collected'; rec.amount = net; rec.date = today; sl.recordId = rec.id; }
      else {
        rec.amount = net - paid; // remainder stays Pending
        var nr = { id: uniqueId('fee'), studentId: s.id, student: s.name, cls: s.cls, month: ln.month, type: ln.type, amount: paid, status: 'Collected', date: today };
        db.feeRecords.push(nr);
        sl.recordId = nr.id;
      }
    } else {
      var nr2 = { id: uniqueId('fee'), studentId: s.id, student: s.name, cls: s.cls, month: ln.month, type: ln.type, amount: paid, status: 'Collected', date: today };
      db.feeRecords.push(nr2);
      sl.recordId = nr2.id;
      if (paid < net) db.feeRecords.push({ id: uniqueId('fee'), studentId: s.id, student: s.name, cls: s.cls, month: ln.month, type: ln.type, amount: net - paid, status: 'Pending', date: today });
    }
  });
  var rc = { receiptNo: receiptNo, studentId: s.id, admissionNo: s.admissionNo || s.enr || '', name: s.name, cls: s.cls, session: s.session || currentSession(), date: today, month: d.month, counterNo: d.counterNo, lines: savedLines, payMode: d.payMode, payDate: d.payDate, bank: d.bank, number: d.number, total: total, totalWords: numberToWords(total), collector: state.user ? state.user.name : '' };
  if (numPending) rc.numPending = true;
  if (!Array.isArray(db.receipts)) db.receipts = [];
  db.receipts.push(rc);
  refreshStudentFee(s.id);
  logAudit('Fee collected', s.name + ' • ' + (receiptNo || 'pending') + ' • ₹' + total);
  addActivity('💰', 'green', 'Fee collected', s.name + ' • ' + (receiptNo || 'pending') + ' • ' + inr(total));
  saveDB(db);
  if (numPending) {
    // No receipt number yet: show the student's fee profile instead of
    // a receipt view (there is no receipt number to open).
    state.savedReceiptId = null; state.feeStudent = s.id; collectDraft = null;
    histReplaceTop({ view: 'fees', sub: 'profile:' + s.id });
    renderApp();
    toast(t('sbNumPendingReceipt') + (cappedExcess > 0 ? ' ' + t('tCollectCapped') : ''));
    return false;
  }
  state.savedReceiptId = receiptNo; collectDraft = null;
  histReplaceTop({ view: 'fees', sub: 'receipt:' + receiptNo }); // Back from the saved receipt goes to the fee profile, not the spent collect form
  renderApp();
  toast('✓ ' + t('tCollectSaved') + receiptNo + ' • ' + inr(total) + (cappedExcess > 0 ? ' • ' + t('tCollectCapped') : ''));
  return false;
}
function openSavedReceipt(receiptNo) {
  var rc = (db.receipts || []).find(function (r) { return r.receiptNo === receiptNo; });
  if (!rc) return;
  state.collectStudent = rc.studentId; state.savedReceiptId = receiptNo; state.feeStudent = rc.studentId; state.view = 'fees';
  persistSession();
  histPush({ view: 'fees', sub: 'receipt:' + receiptNo });
  renderPage();
}
function printReceipt(receiptNo) {
  var rc = (db.receipts || []).find(function (r) { return r.receiptNo === receiptNo; });
  if (!rc) return;
  // v47: same receiptStudent resolution as the detail view — the print
  // must never say Aarav when the receipt says V21, and a missing
  // local row must not blank the print (v41).
  var s = receiptStudent(rc);
  $('printArea').innerHTML = '<div class="print-rcpt">' + receiptHTML(rc, s, false) + '</div>';
  if (window.print) window.print();
}
var PAGE_SCHOOL = { dashboard: schoolDashboard, students: studentsPage, attendance: attendancePage, fees: feesPage, exams: null, homework: null, notices: null, reports: null, settings: null };


/* ================= Phase 4: admission requests =================
   Public intake: anyone can apply from the auth screen. The request is
   saved into the chosen school's own DB on this device (static scope — no
   server, so there is no cross-device inbox yet). The school admin reviews
   it; Approve prefills the admission form, Reject keeps it in history. */
function validateAdmissionRequest(r) {
  var errs = [];
  if (!r.name) errs.push(t('tReqName'));
  if (digitsOnly(r.phone).length !== 10) errs.push(t('tInvalidMobile'));
  if (!r.classApply) errs.push(t('tReqClass'));
  return errs;
}
function saveAdmissionRequestToSchool(dbKey, req) {
  var d = readDbByKey(dbKey);
  if (!d) return false;
  migrateV12(d);
  d.admissionRequests.push(req);
  writeDbByKey(dbKey, d);
  if (DB_KEY === dbKey) db = d; // keep the in-memory DB in sync
  return true;
}
var admReqPublicCache = null; // server schools from ss_list_public_schools()
function admReqSchoolOptions() {
  // Server schools first (from the RPC), then local-only schools that are
  // not on the server yet. Values: 'srv:<uuid>' or 'local:<dbKey>'.
  var opts = '';
  var map = sbServerSchoolMap();
  var seenSrv = {};
  (admReqPublicCache || []).forEach(function (s) {
    seenSrv[s.id] = true;
    opts += '<option value="srv:' + esc(s.id) + '">' + esc(s.name) + (s.city ? ' • ' + esc(s.city) : '') + '</option>';
  });
  loadAccounts().filter(function (a) { return a.role === 'school'; }).filter(function (a) { return !!readDbByKey(dbKeyFor(a)); }).forEach(function (a) {
    var sid = map[a.uid];
    if (sid && seenSrv[sid]) return; // already listed from the server
    opts += '<option value="local:' + esc(dbKeyFor(a)) + '">' + esc(a.school) + '</option>';
  });
  return opts;
}
function openAdmissionApply() {
  var schools = loadAccounts().filter(function (a) { return a.role === 'school'; }).filter(function (a) { return !!readDbByKey(dbKeyFor(a)); });
  var schOpts = admReqSchoolOptions();
  var clsOpts = classParts().map(function (c) { return '<option>' + c + '</option>'; }).join('');
  var genOpts = [''].concat(GENDERS).map(function (g) { return '<option value="' + g + '">' + (g || '—') + '</option>'; }).join('');
  openModal('<h3>' + t('admReqFormTitle') + '</h3>' +
    (schools.length ? '' : '<p class="err" id="admReqNoSchoolMsg">' + t('admReqNoSchool') + '</p>') +
    '<form onsubmit="return saveAdmissionRequest(event)"><div class="form-grid">' +
    '<div class="full"><label>' + t('admReqSchool') + '</label><select id="fArSchool">' + schOpts + '</select></div>' +
    '<div><label>' + t('fStudentName') + ' *</label><input id="fArName" required placeholder="e.g. Aarav Kumar"></div>' +
    '<div><label>' + t('fDob') + '</label><input id="fArDob" type="date"></div>' +
    '<div><label>' + t('fGender') + '</label><select id="fArGender">' + genOpts + '</select></div>' +
    '<div><label>' + t('admReqClassApply') + ' *</label><select id="fArClass">' + clsOpts + '</select></div>' +
    '<div><label>' + t('fGuardian') + '</label><input id="fArGuardian" placeholder="Mr. Sharma"></div>' +
    '<div><label>' + t('fPhone') + ' *</label><input id="fArPhone" inputmode="numeric" placeholder="98XXXXXXXX"></div>' +
    '<div class="full"><label>' + t('fPrevSchool') + '</label><input id="fArPrevSchool" placeholder="Previous school (if any)"></div>' +
    '</div><div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button>' +
    '<button class="btn" type="submit" id="admReqSubmitBtn" ' + (schools.length ? '' : 'disabled') + '>' + t('admReqApply') + '</button></div></form>', true);
  // v34 (P1-8): the school list is not only the accounts on THIS device
  // — fetch the public list from the server so any parent can apply to
  // any school. When it returns, refresh the picker and enable the form.
  if (sbIsOnline()) {
    sbRest('POST', 'rpc/ss_list_public_schools', SB_ANON_KEY, {}).then(function (r) {
      if (!r.ok || !Array.isArray(r.data)) return;
      admReqPublicCache = r.data;
      var sel = $('fArSchool');
      if (!sel) return; // modal closed
      sel.innerHTML = admReqSchoolOptions();
      var msg = $('admReqNoSchoolMsg');
      if (msg) msg.classList.add('hidden');
      var btn = $('admReqSubmitBtn');
      if (btn) btn.disabled = false;
    }).catch(function () {});
  }
}
function saveAdmissionRequest(e) {
  e.preventDefault();
  var req = { id: uniqueId('ar'), name: ($('fArName') ? $('fArName').value : '').trim(),
    dob: $('fArDob') ? $('fArDob').value : '', gender: $('fArGender') ? $('fArGender').value : '',
    classApply: $('fArClass') ? $('fArClass').value : '', guardianName: ($('fArGuardian') ? $('fArGuardian').value : '').trim(),
    phone: ($('fArPhone') ? $('fArPhone').value : '').trim(), previousSchool: ($('fArPrevSchool') ? $('fArPrevSchool').value : '').trim(),
    status: 'Pending', reason: '', submitted: todayIST(), studentId: '' };
  var errs = validateAdmissionRequest(req);
  if (errs.length) { toast(errs.join(' ')); return false; }
  var sel = $('fArSchool') ? $('fArSchool').value : '';
  if (!sel) { toast(t('tAdmReqFailed')); return false; }
  if (sel.indexOf('srv:') === 0) {
    // A server school (chosen from the public list): the application
    // lives on the server only — there is no local DB for it on this
    // device. A failed post is queued and retried, never lost silently.
    var sid = sel.slice(4);
    sbPostAdmission(sid, req).then(function (r) {
      if (!r.ok) sbAdmReqQueue(sid, req);
    }).catch(function () { sbAdmReqQueue(sid, req); });
    closeModal();
    toast(t('admReqSubmitted'));
    return false;
  }
  // Local school: 'local:<dbKey>' (a bare dbKey also works).
  var key = sel.indexOf('local:') === 0 ? sel.slice(6) : sel;
  if (!key || !saveAdmissionRequestToSchool(key, req)) { toast(t('tAdmReqFailed')); return false; }
  // Also send to the server when this school is already backed up there.
  // v34 (P1-8): a failed or offline post is QUEUED and retried — the
  // local save above is the source of truth, so a failed server post
  // never blocks the application.
  try {
    var map = sbServerSchoolMap();
    var acct = loadAccounts().filter(function (x) { return dbKeyFor(x) === key; })[0];
    var sid2 = acct && map[acct.uid];
    if (sid2) {
      if (sbIsOnline()) {
        sbPostAdmission(sid2, req).then(function (r) { if (!r.ok) sbAdmReqQueue(sid2, req); }).catch(function () { sbAdmReqQueue(sid2, req); });
      } else {
        sbAdmReqQueue(sid2, req);
      }
    }
  } catch (e2) {}
  closeModal();
  toast(t('admReqSubmitted'));
  return false;
}
function admissionRequestsPage() {
  var list = (db.admissionRequests || []).slice().sort(function (a, b) { return a.submitted < b.submitted ? 1 : -1; });
  var f = state.admReqFilter || 'All';
  var shown = list.filter(function (r) { return f === 'All' || r.status === f; });
  var counts = { Pending: 0, Approved: 0, Rejected: 0 };
  list.forEach(function (r) { if (counts[r.status] != null) counts[r.status]++; });
  var rows = shown.map(function (r) {
    var badge = r.status === 'Pending' ? 'orange' : r.status === 'Approved' ? 'green' : 'red';
    return '<tr><td><b>' + esc(r.name) + '</b></td><td>' + esc(r.dob || '—') + '</td><td>' + esc(r.classApply) + '</td><td>' + esc(r.guardianName || '—') + '</td><td>' + esc(r.phone) + '</td><td>' + esc(r.submitted) + '</td>' +
      '<td><span class="badge ' + badge + '">' + t('admReq' + r.status) + '</span></td>' +
      '<td><div class="row-actions"><button class="btn ghost sm" onclick="viewAdmissionRequest(\'' + r.id + '\')">' + t('admReqView') + '</button>' +
      (r.status === 'Pending' ? '<button class="btn green sm" onclick="approveAdmissionRequest(\'' + r.id + '\')">' + t('admReqApprove') + '</button>' +
      '<button class="btn danger sm" onclick="rejectAdmissionRequest(\'' + r.id + '\')">' + t('admReqReject') + '</button>' : '') +
      '</div></td></tr>';
  }).join('');
  var fOpts = ['All', 'Pending', 'Approved', 'Rejected'].map(function (x) {
    var lbl = x === 'All' ? t('admReqAll') : t('admReq' + x);
    return '<option value="' + x + '" ' + (f === x ? 'selected' : '') + '>' + lbl + '</option>';
  }).join('');
  return '<div class="page-head"><div><h2>' + t('admissions') + '</h2><p>' + list.length + ' ' + t('admReqTitle') + ' — ' + counts.Pending + ' ' + t('admReqPending') + '</p></div>' +
    '<div class="toolbar"><label>' + t('admReqStatus') + '</label><select onchange="state.admReqFilter=this.value;renderPage()">' + fOpts + '</select></div></div>' +
    '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>' + t('fStudentName') + '</th><th>' + t('fDob') + '</th><th>' + t('admReqClassApply') + '</th><th>' + t('fGuardian') + '</th><th>' + t('fPhone') + '</th><th>' + t('admReqSubmittedOn') + '</th><th>' + t('admReqStatus') + '</th><th>' + t('thAction') + '</th></tr></thead>' +
    '<tbody>' + (rows || '<tr><td colspan="8"><div class="empty">' + t('admReqEmpty') + '</div></td></tr>') + '</tbody></table></div></div>';
}
function viewAdmissionRequest(id) {
  var r = (db.admissionRequests || []).find(function (x) { return x.id === id; });
  if (!r) return;
  var kv = function (label, val) { return '<div class="kv"><b>' + label + '</b><span>' + val + '</span></div>'; };
  var badge = r.status === 'Pending' ? 'orange' : r.status === 'Approved' ? 'green' : 'red';
  openModal('<h3>' + esc(r.name) + ' • ' + esc(r.classApply) + '</h3><div class="card">' +
    kv(t('fStudentName'), esc(r.name)) + kv(t('fDob'), esc(r.dob || '—')) + kv(t('fGender'), esc(r.gender || '—')) +
    kv(t('admReqClassApply'), esc(r.classApply)) + kv(t('fGuardian'), esc(r.guardianName || '—')) + kv(t('fPhone'), esc(r.phone)) +
    kv(t('fPrevSchool'), esc(r.previousSchool || '—')) + kv(t('admReqSubmittedOn'), esc(r.submitted)) +
    kv(t('admReqStatus'), '<span class="badge ' + badge + '">' + t('admReq' + r.status) + '</span>') +
    (r.status === 'Rejected' && r.reason ? kv(t('admReqReason'), esc(r.reason)) : '') +
    (r.status === 'Approved' && r.studentId ? kv(t('fAdmNo'), esc((db.students.find(function (s) { return s.id === r.studentId; }) || {}).admissionNo || '—')) : '') +
    '</div><div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button>' +
    (r.status === 'Pending' ? '<button type="button" class="btn danger" onclick="closeModal();rejectAdmissionRequest(\'' + r.id + '\')">' + t('admReqReject') + '</button>' +
    '<button type="button" class="btn green" onclick="closeModal();approveAdmissionRequest(\'' + r.id + '\')">' + t('admReqApprove') + '</button>' : '') +
    '</div>');
}
function approveAdmissionRequest(id) {
  var r = (db.admissionRequests || []).find(function (x) { return x.id === id; });
  if (!r || r.status !== 'Pending') return;
  admPrefill = r;
  studentForm('');
}
function rejectAdmissionRequest(id) {
  var r = (db.admissionRequests || []).find(function (x) { return x.id === id; });
  if (!r || r.status !== 'Pending') return;
  openModal('<h3>' + t('admReqReject') + ' — ' + esc(r.name) + '</h3><form onsubmit="return doRejectAdmissionRequest(event,\'' + r.id + '\')"><div class="form-grid">' +
    '<div class="full"><label>' + t('admReqReason') + '</label><textarea id="fArReason" rows="3" placeholder="e.g. Seats full for this class"></textarea></div>' +
    '</div><div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button>' +
    '<button class="btn danger" type="submit">' + t('admReqReject') + '</button></div></form>');
}
function doRejectAdmissionRequest(e, id) {
  e.preventDefault();
  var r = (db.admissionRequests || []).find(function (x) { return x.id === id; });
  if (!r) return false;
  r.status = 'Rejected';
  r.reason = ($('fArReason') ? $('fArReason').value : '').trim();
  logAudit('Admission request rejected', r.name + ' • ' + r.classApply + (r.reason ? ' • ' + r.reason : ''));
  saveDB(db); closeModal(); renderApp();
  toast(t('admReqRejected'));
  return false;
}
/* ================= exams / homework / notices / reports / settings ================= */
function examsPage() {
  // B6: deleted exams never appear in the picker, the list or the
  // marks table — they live only in the "Deleted exams" card below
  // (school only), where they can be restored.
  var activeExams = db.exams.filter(isActiveExam);
  var ex = activeExams.find(function (e) { return e.id === state.examId; }) || activeExams[0];
  // v35: a teacher only ever sees exams for their own assigned classes.
  // v37: a teacher WITH classes but no exams in them falls through to
  // the "no exams yet" card below (with the Create button) — the old
  // code wrongly told them no classes were assigned at all.
  if (state.role === 'teacher') {
    var myClasses37 = teacherClasses();
    if (!myClasses37.length) return '<div class="page-head"><div><h2>' + t('exams') + '</h2></div></div><div class="card"><div class="empty">' + t('tchrNoClassesYet') + '</div></div>';
    var myExams35 = activeExams.filter(function (e) { return myClasses37.indexOf(e.cls) !== -1; });
    ex = myExams35.find(function (e) { return e.id === state.examId; }) || myExams35[0];
  }
  // v37: even with no exams yet, the school/teacher can create the first one.
  if (!ex) return '<div class="page-head"><div><h2>' + t('exams') + '</h2></div><div class="toolbar"><button class="btn" onclick="examForm()">+ ' + t('createExam') + '</button></div></div><div class="card"><div class="empty">' + t('tNoExams') + '</div></div>' + deletedExamsSection();
  // v34 (P1-10): marks roster is enrolled students only — Cancelled/
  // Draft never get a marks row.
  var roster = db.students.filter(function (s) { return s.cls === ex.cls && isEnrolledStudent(s); });
  var rows = roster.map(function (s) {
    var mk = db.marks.find(function (m) { return m.examId === ex.id && m.studentId === s.id; });
    return '<tr><td><b>' + esc(s.name) + '</b></td><td>' + s.roll + '</td>' +
      '<td><input type="number" min="0" step="0.5" max="' + ex.total + '" value="' + (mk ? mk.marks : '') + '" placeholder="—" style="width:90px" id="mk-' + s.id + '"> / ' + ex.total + '</td>' +
      '<td>' + (mk ? '<b>' + Math.round(mk.marks / ex.total * 100) + '%</b>' : '<span class="muted">' + t('tNotEntered') + '</span>') + '</td></tr>';
  }).join('');
  var examList35 = state.role === 'teacher' ? activeExams.filter(function (e) { return teacherClasses().indexOf(e.cls) !== -1; }) : activeExams;
  var opts = examList35.map(function (e) { return '<option value="' + e.id + '" ' + (ex.id === e.id ? 'selected' : '') + '>' + esc(e.name) + ' — ' + esc(e.cls) + ' (' + esc(e.subject) + ')</option>'; }).join('');
  var avg = 0, n = 0;
  db.marks.forEach(function (m) { if (m.examId === ex.id) { avg += m.marks; n++; } });
  return '<div class="page-head"><div><h2>' + t('exams') + '</h2><p>' + esc(ex.name) + ' • ' + esc(ex.cls) + ' • ' + esc(ex.subject) + ' • ' + esc(ex.date) + '</p></div>' +
    '<div class="toolbar"><select onchange="state.examId=this.value;renderPage()">' + opts + '</select>' +
    '<button class="btn" onclick="examForm()">+ ' + t('createExam') + '</button>' +
    '<button class="btn" onclick="editExam(\'' + ex.id + '\')">✎ ' + t('editExam') + '</button>' +
    (state.role === 'school' ? '<button class="btn danger" onclick="deleteExam(\'' + ex.id + '\')">🗑 ' + t('deleteExam') + '</button>' : '') +
    '<button class="btn green" onclick="saveMarks(\'' + ex.id + '\')">✓ ' + t('saveMarks') + '</button></div></div>' +
    '<div class="card"><div class="head-row"><div><h3>' + t('enterMarks') + '</h3><p class="card-sub">' + (n ? t('classAvg') + ': ' + Math.round(avg / n / ex.total * 100) + '% (' + n + ' ' + t('studentsMarked') + ')' : t('tNoMarks')) + '</p></div></div>' +
    '<div class="tbl-wrap"><table><thead><tr><th>' + t('thStudent') + '</th><th>' + t('thRoll') + '</th><th>' + t('thMarks') + '</th><th>' + t('thResult') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>' + deletedExamsSection();
}
function deletedExamsSection() {
  // B6: soft-deleted exams, school only, with a Restore button each.
  // Teachers never see deleted exams. The note states the linked-data
  // rule: marks are kept but hidden until the exam is restored.
  if (state.role !== 'school') return '';
  var del = db.exams.filter(function (e) { return !!e.deleted; });
  if (!del.length) return '';
  var rows = del.map(function (e) {
    return '<div class="hw-item"><div><b>' + esc(e.name) + '</b><span>' + esc(e.cls) + ' • ' + esc(e.subject) + ' • ' + esc(e.date) + '</span></div>' +
      '<button class="btn" style="margin-left:auto" onclick="restoreExam(\'' + e.id + '\')">' + t('restoreExam') + '</button></div>';
  }).join('');
  return '<div class="card" style="margin-top:16px"><h3>' + t('examDeletedH') + '</h3><p class="card-sub">' + t('examDelNote') + '</p>' + rows + '</div>';
}
function saveMarks(examId) {
  var ex = db.exams.find(function (e) { return e.id === examId; });
  if (!ex || !isActiveExam(ex)) return; // B6: never enter marks on a deleted exam
  // v35: a teacher enters marks only for their own assigned class.
  if (state.role === 'teacher' && teacherClasses().indexOf(ex.cls) === -1) { toast(t('tNotAllowed')); return; }
  var saved = 0, bad = [];
  // v34 (P1-10): new/updated marks are only saved for enrolled students
  // (Active/Inactive). An empty input still clears an EXISTING mark for
  // any student in the class — that is cleanup of a stale record, not a
  // new mark — so the roster filter never strands an old mark.
  db.students.filter(function (s) { return s.cls === ex.cls; }).forEach(function (s) {
    var inp = $('mk-' + s.id);
    if (!inp) return;
    var mkIdx = -1;
    db.marks.forEach(function (m, i) { if (m.examId === examId && m.studentId === s.id) mkIdx = i; });
    if (inp.value === '') {
      if (mkIdx !== -1) { db.marks.splice(mkIdx, 1); saved++; } // empty = remove marks
      return;
    }
    if (!isEnrolledStudent(s)) return; // Cancelled/Draft: no new marks
    var v = parseFloat(inp.value);
    if (isNaN(v) || v < 0) { bad.push(s.name + ' (invalid)'); return; }
    if (v > ex.total) { bad.push(s.name + ' (over ' + ex.total + ')'); return; } // never silently clamp
    if (mkIdx !== -1) db.marks[mkIdx].marks = v; else db.marks.push({ examId: examId, studentId: s.id, marks: v });
    saved++;
  });
  saveDB(db); renderApp();
  if (bad.length) toast(t('tNotSaved') + ': ' + bad.join(', ') + ' — ' + t('tCheckMarks') + ' (max ' + ex.total + ').');
  else if (saved) toast('✓ ' + t('tMarksSaved') + ' ' + saved + ' ' + t('tStudentsWord') + '.');
  else toast(t('tNoChanges'));
}
function examForm(editId) {
  // v37: exam creation (audit item 6). A teacher only ever sees their
  // own assigned classes in the picker — the save re-checks it, so a
  // crafted value cannot slip through.
  // B6: with an id this is the EDIT form — same fields, prefilled.
  // Class is locked on edit (disabled select): the marks rows belong
  // to that class's roster, so changing it would strand them.
  if (state.role !== 'school' && state.role !== 'teacher') { toast(t('tNotAllowed')); return; }
  var editing = null;
  if (editId) {
    editing = db.exams.find(function (e) { return e.id === editId && isActiveExam(e); });
    if (!editing) { toast(t('tNotAllowed')); return; }
    if (state.role === 'teacher' && teacherClasses().indexOf(editing.cls) === -1) { toast(t('tNotAllowed')); return; }
    state.editExamId = editing.id;
  } else state.editExamId = null;
  var clsList = state.role === 'teacher' ? teacherClasses() : CLASSES;
  if (!clsList.length) { toast(t('tchrNoClassesYet')); return; }
  var clsOpts = editing
    ? '<option selected>' + esc(editing.cls) + '</option>'
    : clsList.map(function (c) { return '<option>' + c + '</option>'; }).join('');
  var subOpts = SUBJECTS.map(function (s) { return '<option' + (editing && editing.subject === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '<option' + (editing && editing.subject === 'All Subjects' ? ' selected' : '') + '>All Subjects</option>';
  openModal('<h3>' + (editing ? t('editExam') : t('createExam')) + '</h3><form onsubmit="return saveExam(event)"><div class="form-grid">' +
    '<div class="full"><label>' + t('examName') + ' *</label><input id="fExName" required placeholder="e.g. Unit Test 3" value="' + (editing ? esc(editing.name) : '') + '"></div>' +
    '<div><label>' + t('fClass') + ' *</label><select id="fExCls"' + (editing ? ' disabled' : '') + '>' + clsOpts + '</select></div>' +
    '<div><label>' + t('fSubject') + '</label><select id="fExSub">' + subOpts + '</select></div>' +
    '<div><label>' + t('fDate') + '</label><input id="fExDate" type="date" value="' + (editing ? esc(editing.date) : todayIST()) + '" required></div>' +
    '<div><label>' + t('examTotal') + ' *</label><input id="fExTotal" type="number" min="1" step="1" value="' + (editing ? editing.total : 100) + '" required></div>' +
    '</div>' + (editing ? '<p class="muted" style="margin-top:8px">' + t('examClsLocked') + ' ' + t('examMarksKept') + '</p>' : '') +
    '<div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button><button class="btn" type="submit">' + (editing ? t('saveBtn') : t('createExam')) + '</button></div></form>');
}
function saveExam(e) {
  e.preventDefault();
  if (state.role !== 'school' && state.role !== 'teacher') { toast(t('tNotAllowed')); return false; }
  var name = ($('fExName') ? $('fExName').value : '').trim();
  var cls = $('fExCls') ? $('fExCls').value : '';
  var subject = $('fExSub') ? $('fExSub').value : '';
  var date = $('fExDate') ? $('fExDate').value : '';
  var total = $('fExTotal') ? parseInt($('fExTotal').value, 10) : 0;
  if (!name || !cls || !date || !total || total < 1) { toast(t('tExamInvalid')); return false; }
  // v37: a teacher creates exams only for their own assigned classes.
  if (state.role === 'teacher' && teacherClasses().indexOf(cls) === -1) { toast(t('tNotAllowed')); return false; }
  if (state.editExamId) {
    // B6: EDIT — update in place. Class never changes (see examForm):
    // the marks rows belong to that class's roster. Marks already
    // entered stay exactly as entered — never silently changed or
    // deleted; percentages are recalculated against the new total,
    // and a mark above a lowered total is kept and flagged on the
    // next marks save (saveMarks rejects over-total values).
    var ex0 = db.exams.find(function (e) { return e.id === state.editExamId; });
    if (!ex0 || !isActiveExam(ex0)) { state.editExamId = null; toast(t('tNotAllowed')); return false; }
    var oldName = ex0.name;
    ex0.name = name; ex0.subject = subject; ex0.date = date; ex0.total = total;
    logAudit('Exam updated', oldName + ' → ' + name + ' • ' + ex0.cls + ' • ' + subject + ' • ' + date + ' • ' + total + ' marks');
    state.editExamId = null;
    saveDB(db); closeModal(); renderApp();
    toast('✓ ' + t('tExamUpdated'));
    return false;
  }
  var ex = { id: uniqueId('ex'), name: name, cls: cls, subject: subject, date: date, total: total };
  db.exams.push(ex);
  logAudit('Exam created', name + ' • ' + cls + ' • ' + subject + ' • ' + date + ' • ' + total + ' marks');
  state.examId = ex.id;
  saveDB(db); closeModal(); renderApp();
  toast('✓ ' + t('tExamCreated'));
  return false;
}
function editExam(id) {
  // B6: opens the same form as create, prefilled. School + teacher
  // (own classes only) — the role/class checks live in examForm.
  examForm(id);
}
function sbQueueExamChange58(ex) {
  // v58: a soft-delete / restore changes NO server payload field
  // (ss_exams has no deleted column), so the diff never queues it —
  // and without a pending outbox entry the v58 pull keep above has
  // nothing to key on. Queue it explicitly so the keep holds the
  // flag until the flush resolves it. The push itself is a no-op
  // PATCH (the server row already carries the same content) and
  // resolves the entry, so the outbox still drains and the status
  // still reaches 'synced'. Local-only accounts skip this entirely
  // (no pull can clobber the flag there). A server column for the
  // flag (cross-device delete sync) is a follow-up SQL change, not
  // this version — the delete stays local to this device until then.
  try {
    if (!sbSyncActive()) return;
    var uid58 = (state.sb && state.sb.uid) || '';
    if (!uid58 || !ex || !ex.id) return;
    sbOutboxAdd(uid58, { table: 'ss_exams', key: ex.id, op: 'upsert', row: JSON.parse(JSON.stringify(ex)), at: new Date().toISOString() });
  } catch (e58) {}
}
function deleteExam(id) {
  // B6: school only, same pattern as deleteStudent (soft delete).
  // SOFT DELETE only: the exam row and ALL of its marks stay saved —
  // nothing is ever hard-deleted here. The marks are hidden
  // everywhere (exam lists, results, latest-exam %) until the exam
  // is restored from the "Deleted exams" card. The row itself keeps
  // syncing as a normal exam (sbMapExam carries no deleted flag — no
  // SQL in this change), so the delete is local to this device; the
  // merge-keep by the ss_exams pull keeps the flag alive across
  // sync cycles, but a second device re-downloads the exam as active
  // until a server column exists (follow-up SQL, not this change).
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
  var ex = db.exams.find(function (e) { return e.id === id && isActiveExam(e); });
  if (!ex) return;
  confirmModal(t('delExamMsg') + ' — ' + ex.name + ' • ' + ex.cls + ' • ' + ex.subject + '?', function () {
    ex.deleted = true;
    sbQueueExamChange58(ex); // v58: the diff never queues a delete (no payload field changes) — queue it so the pull keep holds the flag
    if (state.examId === id) {
      var next = db.exams.filter(isActiveExam)[0];
      state.examId = next ? next.id : null;
    }
    logAudit('Exam deleted', ex.name + ' • ' + ex.cls + ' • ' + ex.subject + ' • ' + ex.date + ' (soft delete — exam and marks kept)');
    saveDB(db); renderApp();
    toast(t('tExamDeleted'));
  });
}
function restoreExam(id) {
  // B6: undoes a soft delete — the exam and its marks come back
  // everywhere at once, because neither was ever removed.
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
  var ex = db.exams.find(function (e) { return e.id === id && !!e.deleted; });
  if (!ex) return;
  ex.deleted = false;
  sbQueueExamChange58(ex); // v58: same as deleteExam — the diff never queues a restore on its own
  logAudit('Exam restored', ex.name + ' • ' + ex.cls + ' • ' + ex.subject + ' • ' + ex.date);
  saveDB(db); renderApp();
  toast('✓ ' + t('tExamRestored'));
}
function meStudent() {
  // v35: the logged-in student is found by id, never by name and never
  // by falling back to the first student in the list (the old code did
  // both — a name match could open the wrong child).
  if (state.role !== 'student' || !state.user || !state.user.studentId) return null;
  return db.students.find(function (x) { return x.id === state.user.studentId; }) || null;
}
function homeworkPage() {
  var isStudent = state.role === 'student';
  var isTeacher = state.role === 'teacher';
  var me = meStudent();
  var myCls = me ? me.cls : '10th-A';
  // v35: a teacher sees homework for their own assigned classes only
  // (and may post it); a student sees only their own class.
  var list = db.homework.filter(function (h) { return isStudent ? h.cls === myCls : isTeacher ? teacherClasses().indexOf(h.cls) !== -1 : true; });
  var items = list.map(function (h) {
    var done = me ? h.doneBy.indexOf(me.id) !== -1 : false;
    var box = isStudent
      ? '<input type="checkbox" ' + (done ? 'checked' : '') + ' onchange="toggleHw(\'' + h.id + '\', this.checked)" aria-label="Mark done">'
      : '';
    return '<div class="hw-item ' + (done ? 'done' : '') + '">' + box +
      '<div><b>' + esc(h.title) + '</b><span>' + esc(h.subject) + ' • Class ' + esc(h.cls) + ' • Due ' + esc(h.due) + (isStudent ? '' : ' • ' + h.doneBy.length + ' ' + t('doneSuffix')) + '</span></div></div>';
  }).join('');
  return '<div class="page-head"><div><h2>' + t('homework') + '</h2><p>' + (isStudent ? 'Class ' + esc(myCls) + ' — ' + t('tapDone') : t('subHomework')) + '</p></div>' +
    (isStudent ? '' : '<div class="toolbar"><button class="btn" onclick="homeworkForm()">+ ' + t('addHomework') + '</button></div>') + '</div>' +
    '<div class="card">' + (items || '<div class="empty">' + t('tNoHw') + '</div>') + '</div>';
}
function toggleHw(id, done) {
  if (state.role !== 'student') return; // only the student marks their own homework
  var h = db.homework.find(function (x) { return x.id === id; });
  if (!h) return;
  var me = meStudent();
  if (!me) return;
  var i = h.doneBy.indexOf(me.id);
  if (done && i === -1) h.doneBy.push(me);
  if (!done && i !== -1) h.doneBy.splice(i, 1);
  saveDB(db); renderPage();
  toast(done ? '✓ ' + t('tHwDone') : t('tHwNotDone'));
}
function homeworkForm() {
  // v35: a teacher assigns homework only to their own classes.
  var clsList35 = state.role === 'teacher' ? teacherClasses() : CLASSES;
  var clsOpts = clsList35.map(function (c) { return '<option>' + c + '</option>'; }).join('');
  var subOpts = SUBJECTS.map(function (s) { return '<option>' + s + '</option>'; }).join('');
  openModal('<h3>' + t('addHomework') + '</h3><form onsubmit="return saveHomework(event)"><div class="form-grid">' +
    '<div><label>' + t('fClass') + '</label><select id="fHwCls">' + clsOpts + '</select></div>' +
    '<div><label>' + t('fSubject') + '</label><select id="fHwSub">' + subOpts + '</select></div>' +
    '<div class="full"><label>' + t('fTitle') + '</label><input id="fHwTitle" required placeholder="e.g. Ex 5.2 — Q1 to Q10"></div>' +
    '<div><label>' + t('fDue') + '</label><input id="fHwDue" type="date" min="' + todayIST() + '" value="2026-11-12" required></div>' +
    '</div><div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button><button class="btn" type="submit">' + t('assignHw') + '</button></div></form>');
}
function saveHomework(e) {
  e.preventDefault();
  if ($('fHwDue').value < todayIST()) { toast(t('tDueFuture')); return false; }
  // v35: a teacher posts homework only to their own assigned class.
  if (state.role === 'teacher' && teacherClasses().indexOf($('fHwCls').value) === -1) { toast(t('tNotAllowed')); return false; }
  db.homework.unshift({ id: uniqueId('hw'), cls: $('fHwCls').value, subject: $('fHwSub').value, title: $('fHwTitle').value.trim(), due: $('fHwDue').value, doneBy: [] });
  addActivity('📚', 'orange', 'Homework assigned', $('fHwSub').value + ' • Class ' + $('fHwCls').value);
  saveDB(db); closeModal(); renderApp();
  toast(t('tHwAssigned'));
  return false;
}
function noticesPage() {
  var items = db.notices.map(function (n) {
    return '<div class="notice"><b>' + esc(n.title) + '</b><span>' + esc(n.date) + '</span><p>' + esc(n.body) + '</p></div>';
  }).join('');
  var canPost = state.role === 'school'; // v35: teachers view notices only
  return '<div class="page-head"><div><h2>' + t('notices') + '</h2><p>' + t('subNotices') + ' — ' + esc(db.profile.name) + '</p></div>' +
    (canPost ? '<div class="toolbar"><button class="btn" onclick="noticeForm()">+ ' + t('publishNotice') + '</button></div>' : '') + '</div>' +
    '<div class="card">' + items + '</div>';
}
function noticeForm() {
  openModal('<h3>' + t('publishNotice') + '</h3><form onsubmit="return saveNotice(event)"><div class="form-grid">' +
    '<div class="full"><label>' + t('fTitle') + '</label><input id="fNtTitle" required placeholder="e.g. Annual Sports Day"></div>' +
    '<div class="full"><label>' + t('fMessage') + '</label><textarea id="fNtBody" rows="3" required placeholder="Notice details…"></textarea></div>' +
    '</div><div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button><button class="btn" type="submit">' + t('publishBtn') + '</button></div></form>');
}
function saveNotice(e) {
  e.preventDefault();
  if (state.role !== 'school') { toast(t('tNotAllowed')); return false; }
  db.notices.unshift({ id: uniqueId('n'), title: $('fNtTitle').value.trim(), date: todayIST(), body: $('fNtBody').value.trim() });
  addActivity('📢', 'orange', 'New notice published', $('fNtTitle').value.trim());
  saveDB(db); closeModal(); renderApp();
  toast(t('tNoticePub'));
  return false;
}
function reportsPage() {
  return '<div class="page-head"><div><h2>' + t('reports') + '</h2><p>' + t('subReports') + ' — ' + db.profile.name + '</p></div></div>' +
  '<div class="grid2e">' +
  '<div class="card"><h3>' + t('studentsReport') + '</h3><p class="card-sub">' + t('repStudentsSub') + '</p><button class="btn" onclick="downloadReportCSV(\'students\')">⬇ ' + t('dlStudents') + '</button></div>' +
  '<div class="card"><h3>' + t('feesReport') + '</h3><p class="card-sub">' + t('repFeesSub') + '</p><button class="btn" onclick="downloadReportCSV(\'fees\')">⬇ ' + t('dlFees') + '</button></div>' +
  '<div class="card"><h3>' + t('attReport') + '</h3><p class="card-sub">Register — Class ' + state.attCls + ' • ' + (state.attDate || todayIST()) + '</p><button class="btn" onclick="downloadReportCSV(\'attendance\')">⬇ ' + t('dlAtt') + '</button></div>' +
  '</div>';
}
function downloadReportCSV(kind) {
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
  if (kind === 'students') {
    downloadCSV('school-saathi-students.csv', [['Name', 'Class', 'Roll', 'Guardian', 'Phone', 'Attendance %', 'Fee Status']]
      .concat(db.students.map(function (s) { return [s.name, s.cls, s.roll, s.guardian, s.phone, studentAttPct(s), studentFeeStatus(s.id)]; })));
  } else if (kind === 'fees') {
    downloadCSV('school-saathi-fees.csv', feeCSVRows());
  } else if (kind === 'attendance') {
    var aDate = state.attDate || todayIST();
    var recs = db.attendance[aDate + '|' + state.attCls] || {};
    downloadCSV('school-saathi-attendance.csv', [['Student', 'Class', 'Roll', 'Date', 'Status']]
      .concat(db.students.filter(function (s) { return s.cls === state.attCls && isEnrolledStudent(s); })
        .map(function (s) { return [s.name, s.cls, s.roll, aDate, recs[s.id] || t('attNotMarked')]; })));
  }
  toast('✓ ' + t('tReportDl'));
}
function feeCSVRows() {
  return [['Student', 'Enr', 'Class', 'Month', 'Type', 'Amount (INR)', 'Date', 'Status']]
    .concat(feeRecordsDeduped().map(function (r) { return [r.student, enrOf(r.studentId), r.cls, r.month, feeTypeOf(r), r.amount, r.date, r.status]; }));
}
/* ================= Full backup & restore (v37, audit item 13) =================
   Export: the whole school DB as one JSON file. Restore: replaces the
   LOCAL db with the backup's contents — never merges, never duplicates.
   Behaviour, stated exactly:
   - Export is school-admin only and downloads
     school-saathi-backup-<date>.json with {app, kind, version,
     exportedAt, school, db}.
   - Restore validates first; a bad file is refused with an error and
     the current data is untouched.
   - Before the confirm, a safety backup of the CURRENT data is
     downloaded automatically, so a mistaken restore can be undone by
     restoring that file.
   - On confirm, the local db is replaced wholesale (deep copy), the
     outbox + sync snapshot are cleared for server-linked schools, and
     saveDB triggers the normal sync path: the next cycle's
     upload-missing pass uploads restored rows the server lacks, and
     the merge pull may bring back server rows the backup did not
     contain. A restore is a LOCAL operation — it never wipes the
     server (there is no server restore). */
var lastFullBackup = null; // last exported backup object (in-memory only; the harness reads it to prove the export happened)
function buildFullBackup() {
  return { app: 'school-saathi', kind: 'full-backup', version: APP_VERSION, exportedAt: new Date().toISOString(), school: (db.profile && db.profile.name) || '', db: JSON.parse(JSON.stringify(db)) };
}
function downloadJSON(filename, obj) {
  var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function exportFullBackup() {
  if (state.role !== 'school') { toast(t('tNotAllowed')); return false; }
  var b = buildFullBackup();
  lastFullBackup = b;
  downloadJSON('school-saathi-backup-' + todayIST() + '.json', b);
  toast('✓ ' + t('tBackupExported'));
  return true;
}
function validateFullBackup(obj) {
  // Pure check — returns '' when valid, else the error key to toast.
  if (!obj || typeof obj !== 'object') return 'tBackupBadFile';
  if (obj.app !== 'school-saathi' || obj.kind !== 'full-backup') return 'tBackupBadFile';
  var d = obj.db;
  if (!d || typeof d !== 'object' || d.v !== 2) return 'tBackupBadFile';
  var arrs = ['students', 'teachers', 'feeRecords', 'exams', 'marks', 'homework', 'notices', 'receipts', 'auditLog', 'activities'];
  for (var i = 0; i < arrs.length; i++) if (!Array.isArray(d[arrs[i]])) return 'tBackupBadFile';
  if (!d.attendance || typeof d.attendance !== 'object' || Array.isArray(d.attendance)) return 'tBackupBadFile';
  if (!d.profile || typeof d.profile !== 'object') return 'tBackupBadFile';
  if (!Array.isArray(d.feeStructure)) return 'tBackupBadFile';
  return '';
}
function restoreFullBackup(obj) {
  // UI-free core: validates, then replaces the local db wholesale.
  // Returns {ok:true, counts} or {ok:false, error}. Never throws.
  var err = validateFullBackup(obj);
  if (err) return { ok: false, error: err };
  var d = JSON.parse(JSON.stringify(obj.db));
  // Run the same migrations loadDB runs, so a backup from an older
  // build still lands in the current shape (a v37 backup is a no-op).
  d = migrateV54(migrateV55(migrateV16(migrateV15(migrateV13(migrateV12(migrateStudentsV9(migrateFeesV7(migrateAttendance(d)))))))));
  var counts = { students: d.students.length, teachers: d.teachers.length, feeRecords: d.feeRecords.length, exams: d.exams.length, marks: d.marks.length, homework: d.homework.length, notices: d.notices.length, receipts: d.receipts.length };
  db = d;
  // Server-linked schools: drop the stale outbox + snapshot so the next
  // cycle re-syncs the restored db from scratch (upload-missing uploads
  // restored rows the server lacks; the merge pull may bring back server
  // rows the backup did not contain — see the header comment).
  if (state.user && state.user.sbUid) {
    try { sbOutboxClear(state.user.sbUid); } catch (e) {}
    try { sbSnapClear(state.user.sbUid); } catch (e) {}
  }
  sbSyncResetMemory();
  logAudit('Backup restored', counts.students + ' students • ' + counts.teachers + ' teachers • ' + counts.exams + ' exams • ' + counts.feeRecords + ' fee records');
  saveDB(db);
  return { ok: true, counts: counts };
}
function requestRestore(parsed) {
  // File → validate → safety backup of current data → confirm → restore.
  if (state.role !== 'school') { toast(t('tNotAllowed')); return false; }
  var err = validateFullBackup(parsed);
  if (err) { toast(t(err)); return false; }
  exportFullBackup(); // safety copy of the CURRENT data first
  confirmModal(t('backupRestoreConfirm'), function () {
    var r = restoreFullBackup(parsed);
    if (!r.ok) { toast(t(r.error)); return; }
    renderApp();
    toast('✓ ' + t('tBackupRestored'));
  });
  return true;
}
function onBackupFileChosen(input) {
  // Browser-only file reading (FileReader) — the parse/validate/restore
  // core above is UI-free and harness-covered.
  var f = input && input.files && input.files[0];
  if (!f) return;
  var reader = new FileReader();
  reader.onload = function () {
    var parsed = null;
    try { parsed = JSON.parse(reader.result); } catch (e) { parsed = null; }
    if (!parsed) { toast(t('tBackupBadFile')); }
    else requestRestore(parsed);
    try { input.value = ''; } catch (e2) {}
  };
  reader.onerror = function () { toast(t('tBackupBadFile')); try { input.value = ''; } catch (e3) {} };
  reader.readAsText(f);
}
function settingsPage() {
  pendingLogo = null;
  var p = db.profile;
  return '<div class="page-head"><div><h2>' + t('settings') + '</h2><p>' + t('subSettingsS') + '</p></div></div>' +
  '<div class="card" style="max-width:680px"><h3>' + esc(p.name) + '</h3><p class="card-sub">' + t('settingsSub') + '</p>' +
  '<form onsubmit="return saveSettings(event)"><div class="form-grid">' +
  '<div><label>' + t('fSchoolName') + '</label><input id="fPfName" value="' + esc(p.name) + '"></div>' +
  '<div><label>' + t('fCity') + '</label><input id="fPfCity" value="' + esc(p.city) + '"></div>' +
  '<div><label>' + t('fPrincipal') + '</label><input id="fPfPr" value="' + esc(p.principal) + '"></div>' +
  '<div><label>' + t('fPhone') + '</label><input id="fPfPh" value="' + esc(p.phone) + '"></div>' +
  '<div><label>' + t('fEmail') + '</label><input id="fPfEm" value="' + esc(p.email) + '"></div>' +
  '<div><label>' + t('fSession') + '</label><select id="fPfSe"><option ' + (p.session === '2025–26' ? 'selected' : '') + '>2025–26</option><option ' + (p.session === '2024–25' ? 'selected' : '') + '>2024–25</option><option ' + (p.session === '2026–27' ? 'selected' : '') + '>2026–27</option></select></div>' +
  '<div class="full"><label>' + t('fAddress') + '</label><input id="fPfAd" value="' + esc(p.address) + '"></div>' +
  '<div class="full"><label>' + t('logoLabel') + '</label><div class="photo-row"><span id="fPfLogoPrev">' + (p.logo ? '<img class="photo-prev" src="' + esc(p.logo) + '" alt="">' : '<span class="photo-prev">🎓</span>') + '</span>' +
  '<input type="file" id="fPfLogo" accept="image/*" onchange="onSchoolLogo(this)">' +
  '<button type="button" class="btn ghost sm" onclick="clearSchoolLogo()">' + t('removeLogo') + '</button></div>' +
  '<p class="muted">' + t('logoHint') + '</p></div>' +
  '</div><div class="actions" style="justify-content:flex-start"><button class="btn" type="submit">' + t('saveSettingsBtn') + '</button>' +
  '<button type="button" class="btn danger" onclick="resetAllData()">' + t('resetAllData') + '</button></div></form></div>' +
  '<div class="card" style="max-width:680px;margin-top:16px"><h3>' + t('sbTitle') + '</h3><p class="card-sub" id="sbStatusLine">' + sbStatusText() + '</p><div id="sbSyncDetails">' + sbSyncDetailsHtml() + '</div><div class="actions" style="justify-content:flex-start"><button type="button" class="btn" onclick="sbRetryMigration()">' + t('sbBackupNow') + '</button><button type="button" class="btn ghost" onclick="sbRetryDownload()">' + t('sbDownloadNow') + '</button>' + (state.user && state.user.role === 'school' && !state.user.sbUid ? '<button type="button" class="btn ghost" onclick="openLinkServerModal()">' + t('sbLinkServer') + '</button>' : '') + (sbSessionExpired ? '<button type="button" class="btn ghost" onclick="logout()">' + t('authLogin') + '</button>' : '') + '</div></div>' +
  '<div class="card" style="max-width:680px;margin-top:16px"><h3>' + t('fullBackup') + '</h3><p class="card-sub">' + t('fullBackupSub') + '</p><div class="actions" style="justify-content:flex-start"><button type="button" class="btn" onclick="exportFullBackup()">' + t('backupExport') + '</button><label class="btn ghost" style="cursor:pointer">' + t('backupImport') + '<input type="file" accept="application/json,.json" style="display:none" onchange="onBackupFileChosen(this)"></label></div></div>' +
  '<div class="card" style="max-width:680px;margin-top:16px"><h3>' + t('raiseSupport') + '</h3><p class="card-sub">' + t('contactSub') + '</p><div class="actions" style="justify-content:flex-start"><button type="button" class="btn" onclick="openSupportForm()">' + t('raiseSupport') + '</button></div></div>';
}
function saveSettings(e) {
  e.preventDefault();
  if (state.role !== 'school') { toast(t('tNotAllowed')); return false; }
  var p = db.profile;
  p.name = $('fPfName').value.trim(); p.city = $('fPfCity').value.trim();
  p.principal = $('fPfPr').value.trim(); p.phone = $('fPfPh').value.trim(); p.email = $('fPfEm').value.trim();
  p.session = $('fPfSe').value; p.address = $('fPfAd').value.trim();
  if (pendingLogo !== null) { if (pendingLogo) p.logo = pendingLogo; else delete p.logo; pendingLogo = null; }
  saveDB(db); renderApp();
  toast('✓ ' + t('tSettingsSaved'));
  return false;
}
/* ================= TEACHERS view (v35) =================
   The school admin creates teacher login accounts here: name, subject,
   classes taught, email + password. The account is a local device
   account (role 'teacher', djb2 hash — v36 replaces the hash) linked to
   the teacher record by teacherId; the teacher opens the school's DB.
   Teacher records (incl. classes[]) sync to the server like any other
   row; the login account itself is local-only in v35. */
var tchrFormClasses = []; // in-memory class selection for the teacher form
function toggleTchrClass(cls, on) {
  var i = tchrFormClasses.indexOf(cls);
  if (on && i === -1) tchrFormClasses.push(cls);
  if (!on && i !== -1) tchrFormClasses.splice(i, 1);
}
function teachersPage() {
  if (state.role !== 'school') return '<div class="card"><div class="empty">' + t('tNotAllowed') + '</div></div>';
  var rows = (db.teachers || []).map(function (te) {
    var acct = loadAccounts().find(function (a) { return a.role === 'teacher' && a.teacherId === te.id; });
    var clsList = Array.isArray(te.classes) && te.classes.length ? te.classes : (te.cls ? [te.cls] : []);
    return '<tr><td><b>' + esc(te.name) + '</b></td><td>' + esc(te.subject || '—') + '</td><td>' + esc(clsList.join(', ') || '—') + '</td><td>' + (acct ? esc(acct.email) : '<span class="muted">' + t('tchrNoLogin') + '</span>') + '</td><td><button class="btn ghost sm" onclick="teacherForm(\'' + te.id + '\')">' + t('editBtn') + '</button></td></tr>';
  }).join('');
  return '<div class="page-head"><div><h2>' + t('teachers') + '</h2><p>' + t('teachersSub') + '</p></div>' +
    '<div class="toolbar"><button class="btn" onclick="teacherForm()">+ ' + t('tchrAdd') + '</button></div></div>' +
    '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>' + t('thName') + '</th><th>' + t('tchrSubject') + '</th><th>' + t('tchrClasses') + '</th><th>' + t('tchrEmail') + '</th><th></th></tr></thead><tbody>' + (rows || '<tr><td colspan="5"><div class="empty">' + t('tNoTeachers') + '</div></td></tr>') + '</tbody></table></div></div>';
}
function teacherForm(id) {
  if (state.role !== 'school') { toast(t('tNotAllowed')); return; }
  var te = id ? db.teachers.find(function (x) { return x.id === id; }) : null;
  var acct = te ? loadAccounts().find(function (a) { return a.role === 'teacher' && a.teacherId === te.id; }) : null;
  tchrFormClasses = te ? (Array.isArray(te.classes) && te.classes.length ? te.classes.slice() : (te.cls ? [te.cls] : [])) : [];
  var clsBoxes = CLASSES.map(function (c) {
    return '<label class="check"><input type="checkbox" ' + (tchrFormClasses.indexOf(c) !== -1 ? 'checked' : '') + ' onchange="toggleTchrClass(\'' + c + '\', this.checked)"> ' + c + '</label>';
  }).join('');
  var subOpts = SUBJECTS.map(function (s) { return '<option ' + (te && te.subject === s ? 'selected' : '') + '>' + s + '</option>'; }).join('');
  openModal('<h3>' + (te ? t('tchrEdit') : t('tchrAdd')) + '</h3>' +
    '<div id="fTchrErr" class="err hidden"></div>' +
    '<form onsubmit="return saveTeacher(event,\'' + (id || '') + '\')"><div class="form-grid">' +
    '<div><label>' + t('tchrName') + ' *</label><input id="fTchrName" required value="' + esc(te ? te.name : '') + '" placeholder="e.g. Sunita Sharma"></div>' +
    '<div><label>' + t('tchrSubject') + '</label><select id="fTchrSub">' + subOpts + '</select></div>' +
    '<div class="full"><label>' + t('tchrClasses') + ' *</label><div style="display:flex;flex-wrap:wrap;gap:8px 16px">' + clsBoxes + '</div></div>' +
    '<div><label>' + t('tchrEmail') + ' *</label><input id="fTchrEmail" type="email" required value="' + esc(acct ? acct.email : '') + '" placeholder="teacher@school.edu.in" autocomplete="off"></div>' +
    '<div><label>' + t('tchrPw') + (acct ? '' : ' *') + '</label><input id="fTchrPw" type="password" ' + (acct ? '' : 'required') + ' placeholder="••••••••" autocomplete="new-password"><p class="muted">' + t('tchrPwHint') + '</p></div>' +
    '</div><div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">' + t('cancel') + '</button><button class="btn" type="submit">' + t('saveBtn') + '</button></div></form>', true);
}
function saveTeacher(e, id) {
  if (state.role !== 'school') { toast(t('tNotAllowed')); return false; }
  e.preventDefault();
  var errEl = $('fTchrErr');
  function fail(msg) { if (errEl) { errEl.textContent = msg; errEl.classList.remove('hidden'); } toast(msg); return false; }
  var name = ($('fTchrName') ? $('fTchrName').value : '').trim();
  var email = ($('fTchrEmail') ? $('fTchrEmail').value : '').trim().toLowerCase();
  var pw = $('fTchrPw') ? $('fTchrPw').value : '';
  var subject = $('fTchrSub') ? $('fTchrSub').value : '';
  if (!name || !email) return fail(t('tFillAll'));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(t('tInvalidEmail'));
  if (!tchrFormClasses.length) return fail(t('tchrNoClasses'));
  var list = loadAccounts();
  var te = id ? db.teachers.find(function (x) { return x.id === id; }) : null;
  var ownAcct = te ? list.find(function (a) { return a.role === 'teacher' && a.teacherId === te.id; }) : null;
  var existing = list.find(function (a) { return a.email === email; });
  if (existing && (!ownAcct || existing.uid !== ownAcct.uid)) return fail(t('tchrEmailTaken'));
  if (!ownAcct && pw.length < 6) return fail(t('tPwShort'));
  if (ownAcct && pw && pw.length < 6) return fail(t('tPwShort'));
  if (!te) {
    te = { id: uniqueId('t'), name: name, subject: subject, cls: tchrFormClasses[0], classes: tchrFormClasses.slice() };
    db.teachers.push(te);
  } else {
    te.name = name; te.subject = subject; te.classes = tchrFormClasses.slice(); te.cls = tchrFormClasses[0] || '';
  }
  if (ownAcct) {
    ownAcct.name = name; ownAcct.email = email; ownAcct.sub = t('tchrSub') + ' • ' + db.profile.name;
    if (pw) { ownAcct.pwHash = hashPwNew(pw); ownAcct.hashScheme = 'sha256'; }
  } else {
    list.push({ uid: uniqueId('u'), name: name, school: db.profile.name, email: email, pwHash: hashPwNew(pw), hashScheme: 'sha256', role: 'teacher', sub: t('tchrSub') + ' • ' + db.profile.name, teacherId: te.id, schoolUid: state.user.uid, created: new Date().toISOString().slice(0, 10) });
  }
  saveAccounts(list);
  logAudit(ownAcct ? 'Teacher updated' : 'Teacher added', name + ' • ' + (te.classes || []).join(', '));
  saveDB(db); closeModal(); renderApp();
  toast(t('tchrSaved'));
  return false;
}
PAGE_SCHOOL.exams = examsPage; PAGE_SCHOOL.homework = homeworkPage; PAGE_SCHOOL.notices = noticesPage;
PAGE_SCHOOL.teachers = teachersPage; PAGE_SCHOOL.reports = function () { return reportsPage(); }; PAGE_SCHOOL.settings = settingsPage; PAGE_SCHOOL.admissions = admissionRequestsPage; PAGE_SCHOOL.activityLog = activityLogPage;

/* ================= STUDENT view ================= */
function studentDashboard() {
  var me = meStudent();
  if (!me) return '<div class="phone"><div class="card"><div class="empty">' + t('tNoStudentData') + '</div></div></div>';
  // Full profile (opened from the "View full profile" button below).
  if (state.profileStudent === me.id) return studentProfilePage(me.id);
  var myHw = db.homework.filter(function (h) { return h.cls === me.cls; });
  var doneCount = myHw.filter(function (h) { return h.doneBy.indexOf(me.id) !== -1; }).length;
  var hwItems = myHw.map(function (h) {
    var done = h.doneBy.indexOf(me.id) !== -1;
    return '<div class="hw-item ' + (done ? 'done' : '') + '"><input type="checkbox" ' + (done ? 'checked' : '') + ' onchange="toggleHw(\'' + h.id + '\', this.checked)" aria-label="Mark done"><div><b>' + esc(h.title) + '</b><span>' + esc(h.subject) + ' • Due ' + esc(h.due) + '</span></div></div>';
  }).join('');
  var notices = db.notices.slice(0, 2).map(function (n) {
    return '<div class="notice"><b>' + esc(n.title) + '</b><span>' + esc(n.date) + '</span><p>' + esc(n.body) + '</p></div>';
  }).join('');
  return '<div class="phone"><div class="card"><div class="stu-hero">' + avatarHTML(me.photo, me.name, 'avatar') + '</div>' +
    '<h3>' + esc(me.name) + '</h3><p>Class ' + esc(me.cls) + ' • ' + esc(db.profile.name) + ', ' + esc(db.profile.city) + '</p>' +
    '<div class="toolbar" style="justify-content:center;margin-top:10px"><button class="btn" onclick="openStudentProfile(\'' + me.id + '\')">' + t('actView') + '</button></div></div>' +
    '<div class="tile-grid">' +
    '<div class="tile green"><div class="n">' + studentAttPct(me) + '%</div><div class="l">' + t('tileAtt') + '</div></div>' +
    '<div class="tile yellow"><div class="n">' + studentFeeStatus(me.id) + '</div><div class="l">' + t('tileFees') + '</div></div>' +
    '<div class="tile purple"><div class="n">' + me.result + '%</div><div class="l">' + t('tileResults') + '</div></div>' +
    '<div class="tile blue"><div class="n">' + myHw.length + '</div><div class="l">' + t('tileHw') + ' (' + doneCount + ' ' + t('doneSuffix') + ')</div></div>' +
    '</div></div>' +
    '<div class="card" style="margin-top:16px"><h3>' + t('myHomework') + '</h3><p class="card-sub">' + t('myHwSub') + '</p>' + hwItems + '</div>' +
    '<div class="card" style="margin-top:16px"><h3>' + t('noticesH') + '</h3><p class="card-sub">' + t('latestNotices') + '</p>' + notices + '</div></div>';
}
var PAGE_STUDENT = { dashboard: studentDashboard, homework: homeworkPage, notices: noticesPage };
var PAGE_TEACHER = { dashboard: teacherDashboard, attendance: attendancePage, exams: examsPage, homework: homeworkPage, notices: noticesPage };

/* ================= init ================= */
/* ================= App-update check (v37) =================
   Why: a stale service worker can keep serving the OLD app shell on
   the plain URL even after a new build is live (v36 was reached only
   via a brand-new query URL after ?v=36, reloads, fresh tabs and
   closing all tabs). The SW is network-first for navigations, but the
   OLD worker is the one answering until the browser installs the new
   one — so the app checks for a newer build itself.
   Mechanism:
   - version.json ({"version": 37}) is fetched with a cache-busting
     query and cache:'no-store', so even a cache-first old worker
     misses its cache and the request reaches the network.
   - If the live version is newer: ask the SW registration to update,
     then reload once the new worker takes control (controllerchange)
     or after a 2.5s fallback so a stalled update never leaves the user
     on the old build. A localStorage guard (one reload per target
     version) prevents any reload loop.
   - Offline: the fetch fails and nothing happens — the device keeps
     opening the last cached version, which is the point of the SW.
   Limits: the reload can still land on the old shell once if the new
   worker has not activated by the fallback (the browser's own SW
   update check on that navigation installs it, so the NEXT plain load
   is the new build). The check runs on boot and when the device comes
   back online; it never runs more than once per boot. */
var SW_UPDATE_KEY = 'schoolSaathiUpdateReload';
function checkAppUpdate() {
  // Returns a Promise<{checked, newer, reloaded, version?, reason?}>.
  // Never throws, never blocks the boot — a failed check is silent.
  if (typeof fetch !== 'function') return Promise.resolve({ checked: false, newer: false, reloaded: false, reason: 'no-fetch' });
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve({ checked: false, newer: false, reloaded: false, reason: 'offline' });
  var url = 'version.json?__v=' + Date.now();
  var timeout = new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, 5000); });
  return Promise.race([fetch(url, { cache: 'no-store' }), timeout]).then(function (res) {
    if (!res || !res.ok) return { checked: false, newer: false, reloaded: false, reason: 'http' };
    return res.json().catch(function () { return null; }).then(function (data) {
      if (!data || typeof data.version !== 'number') return { checked: true, newer: false, reloaded: false, reason: 'bad-marker' };
      if (data.version <= APP_VERSION) return { checked: true, newer: false, reloaded: false, version: data.version };
      var reloadedFor = null;
      try { reloadedFor = localStorage.getItem(SW_UPDATE_KEY); } catch (e) {}
      if (reloadedFor === String(data.version)) return { checked: true, newer: true, reloaded: false, version: data.version, reason: 'already-reloaded' };
      try { localStorage.setItem(SW_UPDATE_KEY, String(data.version)); } catch (e) {}
      var did = triggerSwUpdateReload();
      return { checked: true, newer: true, reloaded: did, version: data.version };
    });
  }).catch(function () { return { checked: false, newer: false, reloaded: false, reason: 'offline' }; });
}
function triggerSwUpdateReload() {
  // Ask the SW to update, then reload once the new worker takes
  // control (or after a short fallback). Returns true when a reload
  // was actually attempted (location.reload exists), false otherwise
  // (e.g. the harness vm, where location has no reload).
  var canReload = (typeof location !== 'undefined' && typeof location.reload === 'function');
  var reloaded = false;
  function doReload() {
    if (reloaded) return; reloaded = true;
    try { if (canReload) location.reload(); } catch (e) {}
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
      navigator.serviceWorker.getRegistration().then(function (reg) {
        if (reg && reg.update) reg.update().catch(function () {});
      }).catch(function () {});
      if (navigator.serviceWorker.addEventListener) navigator.serviceWorker.addEventListener('controllerchange', doReload);
      setTimeout(doReload, 2500); // fallback: reload even if the new worker never signals
      return canReload;
    }
  } catch (e) {}
  doReload();
  return canReload;
}

document.addEventListener('DOMContentLoaded', function () {
  applyI18n();
  // Phase 1 (CR-1/H-1): restoreSession is async now — the online server
  // validation runs before the app view is shown. sbBoot waits for it
  // so the first sync cycle never starts on a rejected session.
  restoreSession().then(function (ok) {
    if (!ok) showLogin();
    sbBoot(); // password-reset links + stored server session / pending backup
  });
  // v37: check for a newer build (stale-SW flip) — fire-and-forget.
  try { checkAppUpdate().catch(function () {}); } catch (e) {}
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('popstate', onPopState); // Android back button
    // v32: reconnect + foreground — pull other devices' changes the
    // moment the app comes back (online, tab visible, window focused).
    // Fire-and-forget; a failed cycle retries on the next trigger.
    window.addEventListener('online', function () {
      if (state.user && state.user.role === 'school' && state.sb) sbSyncBackgroundTick(); // v53: skip when a cycle is in flight
      // v34 (P1-7/P1-8): queued support requests and admission
      // applications retry the moment the device is back online.
      try { sbFlushSupportQueue().catch(function () {}); } catch (e) {}
      try { sbFlushAdmReqQueue().catch(function () {}); } catch (e) {}
      // v37: re-check for a newer build when the device comes online.
      try { checkAppUpdate().catch(function () {}); } catch (e2) {}
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && state.user && state.user.role === 'school' && state.sb) sbSyncBackgroundTick(); // v53: skip when a cycle is in flight
    });
    window.addEventListener('focus', function () {
      if (state.user && state.user.role === 'school' && state.sb) sbSyncBackgroundTick(); // v53: skip when a cycle is in flight
    });
  }
  if ('serviceWorker' in navigator && window.location.protocol.indexOf('http') === 0) {
    try {
      navigator.serviceWorker.register('sw.js').then(function () { /* PWA ready */ }).catch(function () { /* offline mode still works without SW */ });
    } catch (e) { /* ignore — app works without SW */ }
  }
});


