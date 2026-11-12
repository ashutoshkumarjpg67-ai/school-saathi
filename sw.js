/* School Saathi service worker — offline-first app shell, NETWORK-FIRST navigation.
   Versioned cache: bump CACHE_NAME on every deploy so old builds never stick.
   Lesson learned (VidyaSetu / gym app, Nov 2026): cache-first navigation served stale
   builds after deploys. Navigation is network-first here; static assets are
   cache-first with background refresh. Per-file precache: one missing file (e.g.
   an icon not yet uploaded) must not fail the whole app shell.
   v37: version.json is network-first too — the in-app update check must see the
   LIVE version, never a cached marker. */
var CACHE_NAME = 'school-saathi-v102';
var APP_SHELL = [
  './',
  'index.html',
  'styles.css?v=102',
  'app.js?v=102',
  'js/modules/crypto.js?v=102',
  'js/modules/i18n.js?v=102',
  'js/bcrypt.js?v=102',
  'qrgen.js?v=102',
  'version.json',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-512-maskable.png',
  'icons/apple-touch-icon.png',
  'icons/logo.svg'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // Cache each file separately — a single 404 must not fail the whole shell.
      return Promise.all(APP_SHELL.map(function (u) {
        return cache.add(u).catch(function () { /* single-file miss: ignore */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never cache cross-origin

  if (req.mode === 'navigate') {
    // NETWORK-FIRST for navigations (incl. "/" with no .html) — always try live first.
    event.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); }).catch(function () {});
        }
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) { return hit || caches.match('index.html'); });
      })
    );
    return;
  }

  // v37: the version marker is always network-first — the in-app update
  // check must see the LIVE version, never a cached one. Offline it
  // falls back to the cached marker (or fails, which the check treats
  // as "no update" and keeps the cached app running).
  if (url.pathname.endsWith('version.json')) {
    event.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put('version.json', copy); }).catch(function () {});
        }
        return res;
      }).catch(function () {
        return caches.match('version.json');
      })
    );
    return;
  }

  // Static assets: cache-first, refresh in background (stale-while-revalidate).
  event.respondWith(
    caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); }).catch(function () {});
        }
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    })
  );
});
