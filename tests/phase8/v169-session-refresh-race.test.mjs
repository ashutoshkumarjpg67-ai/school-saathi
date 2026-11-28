import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAppContext } from '../harness.mjs';

test('v169: concurrent sbGetValidToken() calls deduplicate to a single sbRefresh() request', async () => {
  const app = createAppContext();
  const res = await app.run(`(async function () {
    var refreshCalls = 0;
    sbStoreSession({ access_token: 'old-jwt', refresh_token: 'rt-1', expires_in: 10 });
    sbRefresh = function (rt) {
      refreshCalls++;
      return new Promise(function (resolve) {
        setTimeout(function () {
          resolve({ ok: true, status: 200, data: { access_token: 'new-jwt', refresh_token: 'rt-2', expires_in: 3600 } });
        }, 15);
      });
    };
    var pair = await Promise.all([sbGetValidToken(), sbGetValidToken(), sbGetValidToken()]);
    return { refreshCalls: refreshCalls, pair: pair };
  })()`);
  assert.equal(res.refreshCalls, 1);
  assert.deepEqual([...res.pair], ['new-jwt', 'new-jwt', 'new-jwt']);
});

test('v169: sbLoadSession prefers fresher localStorage token over stale sessionStorage token', () => {
  const app = createAppContext();
  const tok = app.run(`(function () {
    var ss = {};
    globalThis.sessionStorage = {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(ss, k) ? ss[k] : null; },
      setItem: function (k, v) { ss[k] = String(v); },
      removeItem: function (k) { delete ss[k]; }
    };
    sessionStorage.setItem(SB_SESSION_KEY, vaultEncode(JSON.stringify({ access_token: 'stale-jwt', refresh_token: 'rt-old', expires_at: Date.now() - 1000 })));
    localStorage.setItem(SB_SESSION_KEY, vaultEncode(JSON.stringify({ access_token: 'fresh-jwt', refresh_token: 'rt-new', expires_at: Date.now() + 3600000 })));
    return sbLoadSession().access_token;
  })()`);
  assert.equal(tok, 'fresh-jwt');
});

test('v169: transient 503 refresh error does not wipe stored session or set sbSessionExpired', async () => {
  const app = createAppContext();
  const res = await app.run(`(async function () {
    sbStoreSession({ access_token: 'old-jwt', refresh_token: 'rt-1', expires_in: 10 });
    sbRefresh = function () { return Promise.resolve({ ok: false, status: 503, data: null }); };
    var tok = await sbGetValidToken();
    return { tok: tok, expired: sbSessionExpired, stillStored: !!sbLoadSession() };
  })()`);
  assert.equal(res.tok, null);
  assert.equal(res.expired, false);
  assert.equal(res.stillStored, true);
});
