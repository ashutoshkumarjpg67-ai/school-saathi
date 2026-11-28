/* School Saathi service worker — offline-first app shell, NETWORK-FIRST navigation.
   Versioned cache: bump CACHE_NAME on every deploy so old builds never stick.
   Lesson learned (VidyaSetu / gym app, Nov 2026): cache-first navigation served stale
   builds after deploys. Navigation is network-first here; static assets are
   cache-first with background refresh. Per-file precache: one missing file (e.g.
   an icon not yet uploaded) must not fail the whole app shell.
   v37: version.json is network-first too — the in-app update check must see the
   LIVE version, never a cached marker. */
var CACHE_NAME = 'school-saathi-v177';
var APP_SHELL = [
  './',
  'index.html',
  'landing.html',
  'styles.css?v=177',
  'app.js?v=177',
  'js/modules/fees-ui.js?v=177',
  'js/modules/students-ops.js?v=177',
  'js/modules/academics-ui.js?v=177',
  'js/modules/people-ui.js?v=177',
  'js/modules/certificates.js?v=177',
  'js/modules/crypto.js?v=177',
  'js/modules/vault.js?v=177',
  'js/modules/storage.js?v=177',
  'js/modules/realtime.js?v=177',
  'js/modules/turnstile.js?v=177',
  'js/modules/push.js?v=177',
  'js/modules/i18n.js?v=177',
  'js/bcrypt.js?v=177',
  'qrgen.js?v=177',
  'version.json',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-512-maskable.png',
  'icons/apple-touch-icon.png',
  'icons/logo.svg',
  'privacy-policy.html',
  'terms-of-service.html'
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

// v161: Web Push notification display & click-to-open handler.
self.addEventListener('push', function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {
    try { data = { body: event.data ? event.data.text() : '' }; } catch (e2) {}
  }
  var title = data.title || 'School Saathi';
  var opts = {
    body: data.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: data
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ('focus' in list[i]) return list[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});
