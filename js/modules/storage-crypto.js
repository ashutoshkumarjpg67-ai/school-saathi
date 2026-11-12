/* School Saathi — js/modules/storage-crypto.js (H-5: encryption at rest).
   Device-key encryption for the values localStorage/sessionStorage hold:
   the school DB, its .bak, the accounts list, the local session and the
   Supabase session token. Classic script, NO build step: loaded with
   defer BEFORE app.js in index.html (and before app.js in the QA harness
   vm), so these globals exist by the time app.js runs.

   DESIGN (device key — the user's choice):
   - One random AES-256-GCM key per device, generated once via WebCrypto
     and stored as a NON-extractable CryptoKey in IndexedDB (database
     'schoolSaathiKeys', one object store, one record). The raw key bytes
     are never written anywhere — not to localStorage, not to disk by us.
   - Envelope format, versioned: `enc1:<base64 IV>:<base64 ciphertext>`,
     fresh 12-byte random IV per value. AES-GCM's built-in auth tag means
     a flipped bit fails decryption instead of producing silent garbage.
   - WebCrypto is async but the app's storage calls are sync (saveDB has
     43 call sites, loadDB/loadAccounts/readDbByKey are sync). Two rules
     keep callers unchanged:
       1. A decrypted-value CACHE holds plaintext in memory. Sync readers
          (sbProtGet) read the cache; sync writers (sbProtSet) update the
          cache and enqueue the encrypted write. Boot warms the cache
          (sbCryptoWarmAll) before the first renderApp, so the cache is
          hot whenever the app runs.
       2. Writes go through a SERIALISED async queue (last-write-wins,
          in-order). saveDB keeps its sync signature and its boolean
          return; in encrypted mode `true` now means "queued", not
          "persisted" — a queued write that later fails (quota) re-raises
          the quota warning through the existing warning bar.
   - The in-memory `db` object stays the read source of truth (the app
     already works that way; MEM_FALLBACK exists), so a queued write
     that has not landed yet never shows stale data on screen.
   - PLAINTEXT FALLBACK: when IndexedDB or WebCrypto is unavailable
     (old browser, or the Node vm harness, which has neither), the module
     stays in plaintext mode (sbCryptoEncrypted === false) and sbProt*
     behave exactly like raw localStorage/sessionStorage calls. Existing
     tests keep passing on the plaintext path; real browsers (HTTPS) get
     encryption. Fallback is explicit (the flag) and surfaced once by the
     app through the existing storage-warning bar when sensitive data is
     actually stored unencrypted.
   - MIGRATION: a stored legacy plaintext value is decrypted-into-cache
     at warm-up and its encrypted rewrite is enqueued (primary only).
     The .bak is NOT rewritten by migration — it stays the safety net
     until the first successful encrypted saveDB writes it encrypted.
     Values the key cannot decrypt are never silently dropped: they go
     through the existing .bak recovery / quarantine / warning path.
   - THREAT MODEL (honest): this protects against OFFLINE inspection —
     someone reading the browser-profile files, or a copied localStorage
     dump. It does NOT protect against code already running in the page
     (that code can call the same WebCrypto APIs), and it does not
     encrypt exported backup files (those stay user-readable by design).
   - NOT encrypted (deliberate): the storage-warning marker, the
     support-requests queue, the sync status/outbox/snapshot keys, the
     server-school map, and the cloud student/teacher snapshots in
     sessionStorage (tab-scoped server copies). */
'use strict';

var sbCryptoEncrypted = false; // true once a device key is loaded and AES-GCM round-trips
var sbCryptoReady = false; // true once init has run (either mode)
var sbCryptoKey = null; // non-extractable CryptoKey (AES-256-GCM); IndexedDB only, never in localStorage
var sbCryptoCache = {}; // storage key -> plaintext string (decrypted values, this page load)
var sbCryptoProtected = {}; // storage key -> 'local' | 'session' (keys routed through sbProt*)
var sbCryptoQueue = Promise.resolve(); // serial write queue; a failed step never breaks the chain
var sbCryptoLastError = null; // last queued-write error (quota etc.), for diagnostics/tests
var SB_CRYPTO_IDB_NAME = 'schoolSaathiKeys';
var SB_CRYPTO_IDB_STORE = 'keys';
var SB_CRYPTO_KEY_ID = 'device-key';
var SB_CRYPTO_PREFIX = 'enc1:';

function sbCryptoIsEnvelope(s) {
  return typeof s === 'string' && s.indexOf(SB_CRYPTO_PREFIX) === 0;
}

/* --- base64 (binary-safe, chunked so multi-MB DBs never blow the stack) --- */
function sbCryptoB64Encode(bytes) {
  var bin = '', i, CHUNK = 0x8000;
  for (i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
function sbCryptoB64Decode(b64) {
  var bin = atob(b64), out = new Uint8Array(bin.length), i;
  for (i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* --- IndexedDB (promise wrapper; the only IDB surface the module uses) --- */
function sbCryptoIdbRequest(req) {
  return new Promise(function (resolve, reject) {
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error || new Error('IndexedDB request failed')); };
  });
}
function sbCryptoOpenIdb() {
  return new Promise(function (resolve, reject) {
    var req;
    try { req = indexedDB.open(SB_CRYPTO_IDB_NAME, 1); } catch (e) { reject(e); return; }
    req.onupgradeneeded = function () {
      try { req.result.createObjectStore(SB_CRYPTO_IDB_STORE); } catch (e2) {}
    };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error || new Error('IndexedDB open failed')); };
  });
}
function sbCryptoLoadOrCreateKey() {
  return sbCryptoOpenIdb().then(function (db) {
    var store = db.transaction(SB_CRYPTO_IDB_STORE, 'readonly').objectStore(SB_CRYPTO_IDB_STORE);
    return sbCryptoIdbRequest(store.get(SB_CRYPTO_KEY_ID)).then(function (key) {
      if (key) return key;
      return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']).then(function (newKey) {
        var store2 = db.transaction(SB_CRYPTO_IDB_STORE, 'readwrite').objectStore(SB_CRYPTO_IDB_STORE);
        return sbCryptoIdbRequest(store2.put(newKey, SB_CRYPTO_KEY_ID)).then(function () { return newKey; });
      });
    });
  });
}

/* --- init: load (or create) the device key; verify it round-trips --- */
function sbCryptoInit() {
  if (sbCryptoReady) return Promise.resolve(sbCryptoEncrypted);
  sbCryptoReady = true;
  // Plaintext fallback, decided up front: no IndexedDB or no WebCrypto
  // (old browser, Node vm harness) means no encryption, never an error.
  if (typeof indexedDB === 'undefined' || typeof crypto === 'undefined' || !crypto.subtle || !crypto.getRandomValues) {
    sbCryptoEncrypted = false;
    return Promise.resolve(false);
  }
  return sbCryptoLoadOrCreateKey().then(function (key) {
    if (!key) { sbCryptoEncrypted = false; return false; }
    sbCryptoKey = key;
    sbCryptoEncrypted = true;
    // Probe: a key that cannot round-trip (corrupt IDB entry, broken
    // WebCrypto) must fall back to plaintext, never to silent garbage.
    return sbCryptoEncryptText('school-saathi-probe').then(function (env) {
      if (!env) { sbCryptoEncrypted = false; sbCryptoKey = null; return false; }
      return sbCryptoDecryptText(env).then(function (back) {
        if (back !== 'school-saathi-probe') { sbCryptoEncrypted = false; sbCryptoKey = null; return false; }
        sbCryptoAttachStorageListener();
        return true;
      });
    });
  }).catch(function () {
    sbCryptoEncrypted = false;
    sbCryptoKey = null;
    return false;
  });
}

/* --- envelope encrypt / decrypt --- */
function sbCryptoEncryptText(plain) {
  if (!sbCryptoEncrypted || !sbCryptoKey) return Promise.resolve(null);
  var iv = new Uint8Array(12);
  try { crypto.getRandomValues(iv); } catch (e) { return Promise.resolve(null); }
  var data;
  try { data = new TextEncoder().encode(plain); } catch (e2) { return Promise.resolve(null); }
  return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, sbCryptoKey, data).then(function (ct) {
    return SB_CRYPTO_PREFIX + sbCryptoB64Encode(iv) + ':' + sbCryptoB64Encode(new Uint8Array(ct));
  }).catch(function () { return null; });
}
function sbCryptoDecryptText(stored) {
  if (typeof stored !== 'string' || !stored) return Promise.resolve(null);
  if (!sbCryptoIsEnvelope(stored)) return Promise.resolve(stored); // legacy plaintext passes through
  if (!sbCryptoEncrypted || !sbCryptoKey) return Promise.resolve(null); // cannot decrypt without the key
  var parts = stored.split(':');
  if (parts.length !== 3) return Promise.resolve(null);
  var iv, ct;
  try { iv = sbCryptoB64Decode(parts[1]); ct = sbCryptoB64Decode(parts[2]); } catch (e) { return Promise.resolve(null); }
  if (iv.length !== 12) return Promise.resolve(null);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, sbCryptoKey, ct).then(function (pt) {
    try { return new TextDecoder().decode(pt); } catch (e2) { return null; }
  }).catch(function () { return null; }); // auth-tag failure = tamper / torn write, never garbage
}

/* --- raw storage access (sync; no decrypt, no cache) --- */
function sbCryptoRawPeek(storage, key) {
  try {
    var store = storage === 'session' ? sessionStorage : localStorage;
    var v = store.getItem(key);
    return (v === null || v === undefined) ? null : v;
  } catch (e) { return null; }
}

/* --- warm-up: decrypt the protected keys into the cache (boot only) ---
   specs: [{ storage: 'local'|'session', key: string, migrate: bool }]
   Returns Promise<legacySpecs[]> — the specs whose stored value was
   legacy plaintext and should be rewritten encrypted (primary only;
   the .bak of a DB key is warmed with migrate:false and is rewritten
   by the first saveDB after boot, so it stays the safety net until then). */
function sbCryptoWarmAll(specs) {
  var legacy = [];
  var chain = Promise.resolve();
  (specs || []).forEach(function (spec) {
    chain = chain.then(function () {
      var raw = sbCryptoRawPeek(spec.storage, spec.key);
      if (raw === null) return;
      if (sbCryptoIsEnvelope(raw)) {
        return sbCryptoDecryptText(raw).then(function (plain) {
          if (plain === null) return; // undecryptable: leave uncached (reads see "absent", loadDB takes the .bak/quarantine path)
          sbCryptoCache[spec.key] = plain;
          sbCryptoProtected[spec.key] = spec.storage;
        });
      }
      sbCryptoCache[spec.key] = raw; // legacy plaintext
      sbCryptoProtected[spec.key] = spec.storage;
      if (spec.migrate) legacy.push(spec);
    });
  });
  return chain.then(function () { return legacy; });
}

/* --- migration: enqueue encrypted rewrites for legacy values --- */
function sbCryptoMigrateLegacy(legacySpecs) {
  (legacySpecs || []).forEach(function (spec) {
    var plain = sbCryptoCache[spec.key];
    if (typeof plain !== 'string') return;
    sbCryptoEnqueueWrite(spec.storage, spec.key, plain, false);
  });
}

/* --- serialised async write queue --- */
function sbCryptoNoteWriteError(e) {
  sbCryptoLastError = e || new Error('encrypted write failed');
  // Quota is the only write failure the app has UX for: re-raise it
  // through the existing sticky warning bar (sbStorageWarnSet is an
  // app.js global; the typeof guard keeps this module harness-safe).
  try {
    if (typeof sbStorageWarnSet === 'function' && e && (e.name === 'QuotaExceededError' || e.code === 22 || /quota/i.test(String(e.message || '')))) {
      sbStorageWarnSet('quota');
    }
  } catch (e2) {}
}
function sbCryptoWriteStep(storage, key, plain, withBak) {
  return sbCryptoEncryptText(plain).then(function (env) {
    if (env === null) { sbCryptoNoteWriteError(new Error('encrypt failed for ' + key)); return false; }
    var store = storage === 'session' ? sessionStorage : localStorage;
    try { store.setItem(key, env); } catch (e) { sbCryptoNoteWriteError(e); return false; }
    if (withBak) {
      // Same envelope for the .bak (same plaintext, same value) — the
      // equality of DB and .bak is public knowledge, not a leak. The
      // .bak write only runs when the primary write succeeded, exactly
      // like the old sync saveDB, so a failed primary never destroys
      // the previous good .bak.
      try { store.setItem(key + '.bak', env); } catch (e2) { /* .bak failure never breaks the primary save */ }
    }
    return true;
  }).catch(function (e) { sbCryptoNoteWriteError(e); return false; });
}
function sbCryptoEnqueueWrite(storage, key, plain, withBak) {
  sbCryptoQueue = sbCryptoQueue.then(function () {
    return sbCryptoWriteStep(storage, key, plain, withBak);
  }).catch(function () { /* a failed step never breaks the chain */ });
  return sbCryptoQueue;
}
function sbCryptoFlush() { return sbCryptoQueue; }

/* --- sync protected access (what app.js calls) --- */
function sbProtGet(storage, key) {
  try {
    if (sbCryptoEncrypted) {
      if (Object.prototype.hasOwnProperty.call(sbCryptoCache, key)) return sbCryptoCache[key];
      return null; // cold cache in encrypted mode: treat as absent (fail-safe)
    }
    var store = storage === 'session' ? sessionStorage : localStorage;
    return store.getItem(key);
  } catch (e) { return null; }
}
function sbProtSet(storage, key, plain, withBak) {
  // In plaintext-fallback mode this throws exactly like raw setItem
  // (saveDB's try/catch and its quota handling see the same error).
  // In encrypted mode it never throws: the write is queued.
  if (sbCryptoEncrypted) {
    sbCryptoCache[key] = plain;
    if (withBak) sbCryptoCache[key + '.bak'] = plain;
    sbCryptoProtected[key] = storage;
    sbCryptoEnqueueWrite(storage, key, plain, !!withBak);
    return true;
  }
  var store = storage === 'session' ? sessionStorage : localStorage;
  store.setItem(key, plain);
  if (withBak) { try { store.setItem(key + '.bak', plain); } catch (eBak) {} }
  return true;
}
function sbProtRemove(storage, key) {
  try { delete sbCryptoCache[key]; } catch (e) {}
  try { delete sbCryptoProtected[key]; } catch (e2) {}
  try {
    var store = storage === 'session' ? sessionStorage : localStorage;
    store.removeItem(key);
  } catch (e3) {}
}

/* --- cross-tab cache refresh: another tab's write must not leave this
   tab reading a stale cached value. The 'storage' event only fires in
   OTHER tabs, so there is no echo. --- */
function sbCryptoAttachStorageListener() {
  try {
    if (typeof window === 'undefined' || !window.addEventListener) return;
    window.addEventListener('storage', function (ev) {
      try {
        if (!ev || !ev.key || !sbCryptoProtected[ev.key]) return;
        if (ev.newValue === null || ev.newValue === undefined) { delete sbCryptoCache[ev.key]; return; }
        if (sbCryptoIsEnvelope(ev.newValue)) {
          sbCryptoDecryptText(ev.newValue).then(function (plain) {
            if (plain !== null) sbCryptoCache[ev.key] = plain;
          });
        } else {
          sbCryptoCache[ev.key] = ev.newValue;
        }
      } catch (e) {}
    });
  } catch (e2) {}
}
