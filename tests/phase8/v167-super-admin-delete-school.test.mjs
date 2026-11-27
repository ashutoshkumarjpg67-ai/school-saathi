import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppContext } from '../harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

test('v167: doSuperDeleteSchool enforces typed name match and calls admin-delete-school Edge Function', async () => {
  const app = createAppContext();
  assert.equal(app.run('typeof superDeleteSchoolModal'), 'function');
  assert.equal(app.run('typeof doSuperDeleteSchool'), 'function');

  const res = await app.run(`(async function () {
    state.role = 'superadmin';
    state.superSchools = [
      { id: 's-1', name: 'Dummy School', city: 'Patna', session: '2025-26' },
      { id: 's-2', name: 'Real School', city: 'Gaya', session: '2025-26' }
    ];
    state.superStats = [{ school_id: 's-1', students: 0 }, { school_id: 's-2', students: 50 }];
    var calls = [];
    sbLoadSession = function () { return { access_token: 'sa-jwt' }; };
    sbFetch = function (url, opts) {
      calls.push({ url: url, opts: opts });
      return Promise.resolve({ ok: true, data: { deleted: true, school_id: 's-1' } });
    };
    renderApp = function () {};
    closeModal = function () {};
    toast = function () {};
    var nameEl = { value: 'Wrong Name' };
    var errEl = { textContent: '', classList: { add() {}, remove() {} } };
    $ = function (id) { if (id === 'saDelName') return nameEl; if (id === 'saDelErr') return errEl; return null; };
    doSuperDeleteSchool(null, 's-1', 'Dummy School');
    var callsAfterMismatch = calls.length;
    nameEl.value = 'Dummy School';
    doSuperDeleteSchool(null, 's-1', 'Dummy School');
    await new Promise(function (r) { setTimeout(r, 15); });
    return { callsAfterMismatch: callsAfterMismatch, calls: calls, remaining: state.superSchools.map(function (x) { return x.id; }) };
  })()`);

  assert.equal(res.callsAfterMismatch, 0);
  assert.equal(res.calls.length, 1);
  assert.match(res.calls[0].url, /\/functions\/v1\/admin-delete-school$/);
  assert.deepEqual(JSON.parse(res.calls[0].opts.body), { school_id: 's-1' });
  assert.deepEqual([...res.remaining], ['s-2']);
});

test('v167: admin-delete-school Edge Function verifies ss_platform_admins and blocks self-delete', () => {
  const fn = readFileSync(join(ROOT, 'supabase/functions/admin-delete-school/index.ts'), 'utf8');
  assert.match(fn, /ss_platform_admins/);
  assert.match(fn, /forbidden.*403/);
  assert.match(fn, /cannot-delete-own-admin/);
  assert.match(fn, /'ss_push_tokens'/);
});
