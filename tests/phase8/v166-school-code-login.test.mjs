import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppContext } from '../harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

test('v166: index.html uses School Code text inputs (no public school dropdowns) for Student/Parent/Teacher/Staff', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  for (const id of ['studentSchool', 'parentSchool', 'teacherSchool', 'staffSchool']) {
    assert.match(html, new RegExp('<input id="' + id + '" type="text"'), id + ' must be a text input');
    assert.doesNotMatch(html, new RegExp('<select id="' + id + '"'), id + ' must not be a public select dropdown');
  }
});

test('v166: sbResolveSchoolCode resolves exact code via ss_resolve_school_code RPC', async () => {
  const app = createAppContext();
  assert.equal(app.run('typeof sbResolveSchoolCode'), 'function');
  assert.equal(app.run('typeof sbFindLocalSchoolByCode'), 'function');
  assert.equal(app.run('typeof copySchoolCode'), 'function');

  const res = await app.run(`(async function () {
    var calls = [];
    sbFetch = function (url, opts) {
      calls.push({ url: url, opts: opts });
      return Promise.resolve({ ok: true, data: { ok: true, id: 'srv-uuid-1', name: 'Don Basco', school_code: 'SS-2DZ6' } });
    };
    var out = await sbResolveSchoolCode(' ss-2dz6 ');
    return { out: out, calls: calls };
  })()`);

  assert.equal(res.out.ok, true);
  assert.equal(res.out.id, 'srv-uuid-1');
  assert.equal(res.calls.length, 1);
  assert.match(res.calls[0].url, /\/rest\/v1\/rpc\/ss_resolve_school_code$/);
  assert.deepEqual(JSON.parse(res.calls[0].opts.body), { p_code: 'SS-2DZ6' });
});

test('v166: 61_school_code.sql defines school_code column, trigger, and ss_resolve_school_code RPC', () => {
  const sql = readFileSync(join(ROOT, 'supabase/61_school_code.sql'), 'utf8');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS school_code text/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.ss_resolve_school_code/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.ss_resolve_school_code\(text\) TO anon, authenticated/i);
});
