// pull-pagination.test.mjs — Phase 3 (c): the pull must page past the
// server's row cap instead of silently truncating a table.
//
// Tests the SHIPPED sbFetchAllPages from app.js (v64 paged fetch,
// keyset cursor over id) by extracting its source and running it in a
// vm sandbox against a fake sbRest server. Node built-ins only:
//   node --test "tests/phase3/*.test.mjs"
//
// What the fake server honours: order=id.asc, limit=<n> and the
// id=gt.<last id> cursor — exactly the query sbFetchAllPages builds.

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { extractFunction, extractVar } from './extract-app-fn.mjs';

function loadFetchAll(sbRest) {
  const ctx = vm.createContext({ sbRest, Promise, console });
  vm.runInContext(extractVar('SB_PAGE_SIZE') + '\n' + extractFunction('sbFetchAllPages'), ctx);
  return ctx.sbFetchAllPages;
}

// Fake PostgREST: `total` rows with zero-padded ids (lexicographic order
// == numeric order), honouring limit + id=gt cursor.
function makeServer(total) {
  const rows = [];
  for (let i = 1; i <= total; i++) rows.push({ id: 'r' + String(i).padStart(6, '0'), v: i });
  let calls = 0;
  const seenQueries = [];
  const sbRest = async (method, q, token) => {
    calls++;
    seenQueries.push(q);
    assert.equal(method, 'GET');
    const limit = Number(/limit=(\d+)/.exec(q)[1]);
    const gt = /id=gt\.([^&]+)/.exec(q);
    const after = gt ? decodeURIComponent(gt[1]) : null;
    const page = rows.filter((r) => !after || r.id > after).slice(0, limit);
    return { ok: true, status: 200, data: page };
  };
  return { sbRest, calls: () => calls, queries: seenQueries, rows };
}

test('12,500 rows come back whole: 3 pages, in order, no duplicates', async () => {
  const server = makeServer(12500);
  const fetchAll = loadFetchAll(server.sbRest);
  const r = await fetchAll('ss_students', '*', 'school-1', 'tok');
  assert.equal(r.ok, true);
  assert.equal(r.data.length, 12500);
  // Array.from: the rows come back as a vm-realm array (the function runs
  // in a vm sandbox), and strict deepEqual compares prototypes — copy
  // both sides into host-realm arrays first.
  assert.deepEqual(Array.from(r.data, (x) => x.id), Array.from(server.rows, (x) => x.id));
  assert.equal(server.calls(), 3);
  // Every page asked for the 5000-row page size, in id order.
  for (const q of server.queries) {
    assert.match(q, /order=id\.asc&limit=5000/);
    assert.match(q, /school_id=eq\.school-1/);
  }
});

test('a 3-row table stops after one short page', async () => {
  const server = makeServer(3);
  const fetchAll = loadFetchAll(server.sbRest);
  const r = await fetchAll('ss_notices', '*', 'school-1', 'tok');
  assert.equal(r.data.length, 3);
  assert.equal(server.calls(), 1);
});

test('exactly 5000 rows need a second (empty) page to prove completion', async () => {
  const server = makeServer(5000);
  const fetchAll = loadFetchAll(server.sbRest);
  const r = await fetchAll('ss_fee_records', '*', 'school-1', 'tok');
  assert.equal(r.data.length, 5000);
  assert.equal(server.calls(), 2);
});

test('a page that does not advance the cursor throws instead of looping forever', async () => {
  let n = 0;
  const stuck = async () => {
    n++;
    // Always returns the same full page: the cursor never advances.
    const data = [];
    for (let i = 1; i <= 5000; i++) data.push({ id: 'r' + String(i).padStart(6, '0') });
    return { ok: true, status: 200, data };
  };
  const fetchAll = loadFetchAll(stuck);
  await assert.rejects(fetchAll('ss_students', '*', 'school-1', 'tok'), /page-stuck-ss_students/);
  assert.equal(n, 2);
});

test('a failed page rejects with the table name', async () => {
  const failing = async () => ({ ok: false, status: 500, data: { message: 'boom' } });
  const fetchAll = loadFetchAll(failing);
  await assert.rejects(fetchAll('ss_students', '*', 'school-1', 'tok'), /read-ss_students/);
});

test('the flush batch path uses the paged fetch, not a bare GET', async () => {
  // Regression guard for the Phase 3 fix: app.js must not contain an
  // unpaged bulk table GET in the flush pass (the v64 pull fix missed
  // that one call site). The paged helper is the only bulk fetcher.
  const { readFileSync } = await import('node:fs');
  const appSrc = readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
  assert.equal(
    appSrc.includes("sbRest('GET', tb + '?select=*&school_id=eq.'"),
    false,
    'flush batch still uses an unpaged sbRest GET'
  );
  assert.match(appSrc, /sbFetchAllPages\(tb, '\*', schoolId, tok\)/);
});
