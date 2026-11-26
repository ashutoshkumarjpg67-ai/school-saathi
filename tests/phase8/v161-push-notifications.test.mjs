import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppContext } from '../harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

test('v161: js/modules/push.js exposes sbPushSaveToken, sbPushRegister, and sbPushSend', async () => {
  const app = createAppContext();
  assert.equal(app.run('typeof sbPushSaveToken'), 'function');
  assert.equal(app.run('typeof sbPushRegister'), 'function');
  assert.equal(app.run('typeof sbPushSend'), 'function');

  // Safe no-op when Capacitor is absent
  app.run("sbPushRegister('s1', 'school', 'u1', '', 'jwt-1')");
  assert.equal(app.run('SB_PUSH_REGISTERED'), false);

  // Mock Capacitor PushNotifications plugin + sbRest
  const saved = await app.run(`(async function () {
    var calls = [];
    sbRest = function (method, path, jwt, body, prefer) {
      calls.push({ method: method, path: path, jwt: jwt, body: body, prefer: prefer });
      return Promise.resolve({ ok: true });
    };
    var regCb = null;
    window.Capacitor = {
      Plugins: {
        PushNotifications: {
          requestPermissions: function () { return Promise.resolve({ receive: 'granted' }); },
          addListener: function (ev, cb) { if (ev === 'registration') regCb = cb; },
          register: function () { if (regCb) regCb({ value: 'fcm-token-abc' }); }
        }
      }
    };
    sbPushRegister('school-1', 'school', 'uid-1', 'Class 5', 'jwt-tok');
    await new Promise(function (r) { setTimeout(r, 15); });
    return calls;
  })()`);

  assert.equal(saved.length, 1);
  assert.equal(saved[0].method, 'POST');
  assert.match(saved[0].path, /^ss_push_tokens\?on_conflict=school_id,token/);
  assert.equal(saved[0].body.token, 'fcm-token-abc');
  assert.equal(saved[0].body.platform, 'android');

  // sbPushSend calls /functions/v1/send-push with Bearer JWT
  const sent = await app.run(`(async function () {
    var reqs = [];
    sbIsOnline = function () { return true; };
    sbLoadSession = function () { return { access_token: 'sess-jwt' }; };
    sbFetch = function (url, opts) {
      reqs.push({ url: url, opts: opts });
      return Promise.resolve({ ok: true });
    };
    await sbPushSend('Holiday', 'School closed tomorrow', { cls: 'Class 5' });
    return reqs;
  })()`);

  assert.equal(sent.length, 1);
  assert.match(sent[0].url, /\/functions\/v1\/send-push$/);
  assert.equal(sent[0].opts.headers.Authorization, 'Bearer sess-jwt');
  const body = JSON.parse(sent[0].opts.body);
  assert.equal(body.title, 'Holiday');
  assert.equal(body.cls, 'Class 5');
});

test('v161: sw.js caches push.js and handles push + notificationclick events', () => {
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  assert.match(sw, /js\/modules\/push\.js\?v=161/);
  assert.match(sw, /addEventListener\('push'/);
  assert.match(sw, /addEventListener\('notificationclick'/);
  assert.match(sw, /showNotification/);
});

test('v161: send-push Edge Function and SQL 60 enforce JWT, RLS, and clean 503 when unconfigured', () => {
  const fn = readFileSync(join(ROOT, 'supabase/functions/send-push/index.ts'), 'utf8');
  assert.match(fn, /FCM_SERVICE_ACCOUNT_JSON/);
  assert.match(fn, /fcm-not-configured.*503/);
  assert.match(fn, /fcm\.googleapis\.com\/v1\/projects/);
  assert.match(fn, /ss_push_tokens/);

  const sql = readFileSync(join(ROOT, 'supabase/60_push_tokens.sql'), 'utf8');
  assert.match(sql, /create table if not exists public\.ss_push_tokens/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /grant select, insert, update, delete on public\.ss_push_tokens to service_role/i);

  const del = readFileSync(join(ROOT, 'supabase/functions/delete-account/index.ts'), 'utf8');
  assert.match(del, /'ss_push_tokens'/);
});
