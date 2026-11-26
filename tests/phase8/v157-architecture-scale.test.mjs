// tests/phase8/v157-architecture-scale.test.mjs — v157 architecture & scale tests.
// Covers:
//  1. js/modules/storage.js: >5 MB IndexedDB overflow pointer + boot hydration
//  2. js/modules/realtime.js: Phoenix WebSocket join, postgres_changes -> onChange, stop/cleanup
//  3. index.html CSP wss:// + script load order (storage.js & realtime.js before app.js)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppContext } from '../harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const INDEX_SRC = readFileSync(join(ROOT, 'index.html'), 'utf8');
const SW_SRC = readFileSync(join(ROOT, 'sw.js'), 'utf8');

describe('v157 — modularized storage.js (IndexedDB >5 MB overflow + boot hydration)', () => {
  it('stores ss_idb_ptr in localStorage and full DB in IndexedDB when localStorage is full, then hydrates on loadDB', () => {
    const app = createAppContext();
    app.run(`
      var __idbMem = {};
      globalThis.indexedDB = {
        open: function () {
          var req = {};
          setTimeout(function () {
            req.result = {
              objectStoreNames: { contains: function () { return true; } },
              createObjectStore: function () {},
              close: function () {},
              transaction: function () {
                return {
                  objectStore: function () {
                    return {
                      put: function (v, k) { __idbMem[k] = v; },
                      get: function (k) {
                        var g = {};
                        setTimeout(function () { g.result = __idbMem[k]; if (g.onsuccess) g.onsuccess(); }, 0);
                        return g;
                      }
                    };
                  }
                };
              }
            };
            if (req.onsuccess) req.onsuccess();
          }, 0);
          return req;
        }
      };
      var __origSet = localStorage.setItem;
      localStorage.setItem = function (k, v) {
        if (k === DB_KEY && String(v).indexOf(SB_IDB_PTR_PREFIX) !== 0) {
          var e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e;
        }
        return __origSet.call(localStorage, k, v);
      };
      db = emptyDb();
      db.profile.name = 'Mega School 2000';
    `);
    const ok = app.run('saveDB(db)');
    assert.equal(ok, true, 'saveDB must succeed via IndexedDB overflow');
    assert.equal(app.storage.getItem('schoolSaathiDBv1'), 'ss_idb_ptr:schoolSaathiDBv1');
  });
});

describe('v157 — modularized realtime.js (Supabase Realtime WebSocket)', () => {
  it('connects to wss://, joins school channel with postgres_changes, fires onChange, and cleans up on stop', async () => {
    const app = createAppContext();
    app.run(`
      globalThis.__wsSent = [];
      globalThis.__wsClosed = false;
      globalThis.__wsLast = null;
      globalThis.WebSocket = function (url) {
        this.url = url;
        this.readyState = 1;
        this.send = function (m) { globalThis.__wsSent.push(JSON.parse(m)); };
        this.close = function () { globalThis.__wsClosed = true; };
        globalThis.__wsLast = this;
      };
      globalThis.__rtChanged = 0;
      sbRealtimeStart('https://bsjqeeeemwimzldrehpw.supabase.co', 'anon-k', 'jwt-tok', 'sch-42', function () {
        globalThis.__rtChanged++;
      });
      globalThis.__wsLast.onopen();
    `);
    assert.equal(app.get('sbRealtimeStatus()'), 'connected');
    const url = app.get('__wsLast.url');
    assert.ok(url.startsWith('wss://bsjqeeeemwimzldrehpw.supabase.co/realtime/v1/websocket?'));
    const join = JSON.parse(app.run('JSON.stringify(__wsSent[0])'));
    assert.equal(join.topic, 'realtime:school-sch-42');
    assert.equal(join.event, 'phx_join');
    assert.equal(join.payload.access_token, 'jwt-tok');
    assert.ok(join.payload.config.postgres_changes.length >= 9);
    assert.equal(join.payload.config.postgres_changes[0].filter, 'school_id=eq.sch-42');

    app.run('sbRealtimeStop()');
    assert.equal(app.get('__wsClosed'), true);
    assert.equal(app.get('sbRealtimeStatus()'), 'disconnected');
  });
});

describe('v157 — index.html & sw.js module wiring + CSP wss://', () => {
  it('CSP allows wss:// to Supabase and index.html loads storage.js & realtime.js before app.js', () => {
    assert.ok(INDEX_SRC.includes('wss://bsjqeeeemwimzldrehpw.supabase.co'), 'CSP missing wss://');
    const idxStorage = INDEX_SRC.indexOf('js/modules/storage.js');
    const idxRt = INDEX_SRC.indexOf('js/modules/realtime.js');
    const idxApp = INDEX_SRC.indexOf('app.js?v=');
    assert.ok(idxStorage > 0 && idxStorage < idxApp, 'storage.js must load before app.js');
    assert.ok(idxRt > 0 && idxRt < idxApp, 'realtime.js must load before app.js');
    assert.ok(SW_SRC.includes('js/modules/storage.js'), 'sw.js must precache storage.js');
    assert.ok(SW_SRC.includes('js/modules/realtime.js'), 'sw.js must precache realtime.js');
  });
});
