/* School Saathi — js/modules/storage.js (v157: IndexedDB overflow & boot hydration).
   Classic script, no build step: loaded with defer AFTER vault.js and BEFORE app.js.
   Solves the ~5 MB localStorage ceiling for large schools (500-5,000+ students)
   without rewriting synchronous saveDB()/loadDB() callers:
   - Every saveDB mirrors the sealed DB envelope to IndexedDB (hundreds of MB quota).
   - On QuotaExceededError, saveDB evicts .bak/.quarantine and retries localStorage;
     if the payload still exceeds localStorage, it stores a tiny pointer
     ('ss_idb_ptr:<key>') in localStorage and persists the full sealed DB in IndexedDB.
   - On boot/login, sbIdbHydrateDB() asynchronously loads the full DB from IndexedDB
     when localStorage holds a pointer (or is empty) and invokes the callback. */
'use strict';

var SB_IDB_NAME = 'schoolSaathiIDB';
var SB_IDB_STORE = 'kv';
var SB_IDB_PTR_PREFIX = 'ss_idb_ptr:';

function sbIdbSupported() {
  try {
    return typeof indexedDB !== 'undefined' && !!indexedDB && typeof indexedDB.open === 'function';
  } catch (e) { return false; }
}

function sbIdbMirrorSet(key, val, onDone) {
  try {
    if (!sbIdbSupported()) { if (onDone) onDone(false); return false; }
    var req = indexedDB.open(SB_IDB_NAME, 1);
    req.onupgradeneeded = function () {
      var idb = req.result;
      if (!idb.objectStoreNames.contains(SB_IDB_STORE)) idb.createObjectStore(SB_IDB_STORE);
    };
    req.onsuccess = function () {
      try {
        var idb = req.result;
        var tx = idb.transaction(SB_IDB_STORE, 'readwrite');
        tx.objectStore(SB_IDB_STORE).put(val, key);
        tx.oncomplete = function () {
          try { idb.close(); } catch (eC) {}
          if (onDone) onDone(true);
        };
        tx.onerror = function () {
          try { idb.close(); } catch (eC2) {}
          if (onDone) onDone(false);
        };
      } catch (eTx) { if (onDone) onDone(false); }
    };
    req.onerror = function () { if (onDone) onDone(false); };
    return true;
  } catch (e) {
    if (onDone) onDone(false);
    return false;
  }
}

function sbIdbMirrorGet(key, cb) {
  try {
    if (!sbIdbSupported()) { if (cb) cb(null); return; }
    var req = indexedDB.open(SB_IDB_NAME, 1);
    req.onupgradeneeded = function () {
      var idb = req.result;
      if (!idb.objectStoreNames.contains(SB_IDB_STORE)) idb.createObjectStore(SB_IDB_STORE);
    };
    req.onsuccess = function () {
      try {
        var idb = req.result;
        var tx = idb.transaction(SB_IDB_STORE, 'readonly');
        var g = tx.objectStore(SB_IDB_STORE).get(key);
        g.onsuccess = function () {
          try { idb.close(); } catch (eC) {}
          if (cb) cb(g.result || null);
        };
        g.onerror = function () {
          try { idb.close(); } catch (eC2) {}
          if (cb) cb(null);
        };
      } catch (eTx) { if (cb) cb(null); }
    };
    req.onerror = function () { if (cb) cb(null); };
  } catch (e) { if (cb) cb(null); }
}

function sbIsIdbPointer(rawStored) {
  return typeof rawStored === 'string' && rawStored.indexOf(SB_IDB_PTR_PREFIX) === 0;
}

function sbIdbHydrateDB(key, onHydrated) {
  sbIdbMirrorGet(key, function (rawStored) {
    if (!rawStored || typeof rawStored !== 'string') return;
    try {
      var raw = (typeof vaultDecode === 'function') ? vaultDecode(rawStored) : rawStored;
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (parsed && parsed.v === 2 && onHydrated) onHydrated(parsed);
    } catch (e) {}
  });
}

function sbLocalStorageUsageKB() {
  try {
    var total = 0, i, k, v;
    if (typeof localStorage === 'undefined' || !localStorage) return 0;
    if (typeof localStorage.length === 'number' && typeof localStorage.key === 'function') {
      for (i = 0; i < localStorage.length; i++) {
        k = localStorage.key(i);
        v = k ? localStorage.getItem(k) : '';
        total += (k ? k.length : 0) + (v ? v.length : 0);
      }
    } else if (typeof DB_KEY === 'string') {
      var cur = localStorage.getItem(DB_KEY);
      if (cur) total += DB_KEY.length + cur.length;
    }
    return Math.round((total * 2) / 1024); // UTF-16 bytes -> KB
  } catch (e) { return 0; }
}
