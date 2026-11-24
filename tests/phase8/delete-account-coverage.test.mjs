// tests/phase8/delete-account-coverage.test.mjs — account-delete drift guard.
//
// The delete-account Edge Function must delete EVERY school-scoped row
// and every per-school Storage object, or a deleted school leaves
// orphans behind. This test recomputes the school-scoped table list
// from the repo SQL files (supabase/*.sql) and asserts the function's
// CHILD_TABLES covers it — so the next table added by a SQL migration
// fails this test until the function is updated too. It also checks the
// non-school_id cleanup (email-keyed login attempts, platform admins),
// that the platform-wide settings row is never deleted, and that the
// Storage buckets the function cleans match the buckets SQL 28 creates.
//
// Computed from the repo only — no live database, no network.
// Run: node --test tests/phase8/delete-account-coverage.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SQL_DIR = join(ROOT, 'supabase');
const FN_PATH = join(ROOT, 'supabase', 'functions', 'delete-account', 'index.ts');

// Every CREATE TABLE ss_* block, up to its closing ");" line.
function schoolScopedTables() {
  const out = new Set();
  for (const f of readdirSync(SQL_DIR).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(SQL_DIR, f), 'utf8');
    for (const m of sql.matchAll(/create table if not exists public\.(ss_[a-z_0-9]+)\s*\(/gi)) {
      const end = sql.indexOf('\n);', m.index);
      const block = end === -1 ? '' : sql.slice(m.index, end);
      if (/\bschool_id\b/.test(block)) out.add(m[1]);
    }
  }
  return [...out].sort();
}

function parseFnList(src, name) {
  const m = src.match(new RegExp(name + '\\s*=\\s*\\[([^\\]]*)\\]', 's'));
  assert.ok(m, name + ' list not found in delete-account/index.ts');
  return [...m[1].matchAll(/'([a-z_0-9-]+)'/g)].map((x) => x[1]);
}

const fnSrc = readFileSync(FN_PATH, 'utf8');
const childTables = parseFnList(fnSrc, 'const CHILD_TABLES');
const storageBuckets = parseFnList(fnSrc, 'const STORAGE_BUCKETS');

describe('delete-account coverage (from supabase/*.sql)', () => {
  it('CHILD_TABLES covers every school-scoped ss_* table', () => {
    const scoped = schoolScopedTables();
    assert.ok(scoped.length > 0, 'no school-scoped tables found — parser broke?');
    const missing = scoped.filter((t) => !childTables.includes(t));
    assert.deepEqual(missing, [], 'tables missing from CHILD_TABLES: ' + missing.join(', '));
  });

  it('CHILD_TABLES has no unknown table', () => {
    const scoped = new Set(schoolScopedTables());
    const extra = childTables.filter((t) => !scoped.has(t));
    assert.deepEqual(extra, [], 'CHILD_TABLES entries with no school_id column: ' + extra.join(', '));
  });

  it('non-school_id rows are still cleaned up', () => {
    assert.ok(/ss_school_login_attempts/.test(fnSrc), 'email-keyed ss_school_login_attempts delete missing');
    assert.ok(/ss_platform_admins/.test(fnSrc), 'ss_platform_admins delete missing');
  });

  it('platform-wide settings are never deleted', () => {
    assert.ok(!childTables.includes('ss_platform_settings'), 'ss_platform_settings must never be in CHILD_TABLES');
    assert.ok(!/from\('ss_platform_settings'\)\.delete/.test(fnSrc), 'ss_platform_settings must never be deleted');
  });

  it('Storage buckets cleaned match the buckets SQL 28 creates', () => {
    const sql28 = readFileSync(join(SQL_DIR, '28_storage_buckets.sql'), 'utf8');
    const created = [...sql28.matchAll(/\('([a-z-]+)',\s*'\1'/g)].map((m) => m[1]);
    assert.deepEqual([...storageBuckets].sort(), [...created].sort(),
      'STORAGE_BUCKETS ' + JSON.stringify(storageBuckets) + ' != buckets created by SQL 28 ' + JSON.stringify(created));
  });

  it('storage is deleted before any row, fail-closed', () => {
    const callAt = fnSrc.indexOf('await deleteSchoolStorage(admin');
    const loopAt = fnSrc.indexOf('for (const table of CHILD_TABLES)');
    assert.ok(callAt !== -1, 'deleteSchoolStorage call missing');
    assert.ok(loopAt !== -1, 'CHILD_TABLES delete loop missing');
    assert.ok(callAt < loopAt, 'storage must be deleted BEFORE the row deletes');
    assert.ok(/storage-delete-failed/.test(fnSrc), 'storage-delete-failed error path missing');
  });
});
