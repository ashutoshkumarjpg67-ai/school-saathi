// pull-keeps-local-rows.test.mjs — Phase 3 (f): a pull must never delete
// an un-uploaded local row.
//
// Tests the SHIPPED mergeById from app.js (the merge inside
// sbApplyServerRows, used by the pull) by extracting its source and
// running it in a vm sandbox with stubbed dependencies. Node built-ins
// only:
//   node --test "tests/phase3/*.test.mjs"
//
// Scenario (roadmap hybrid-sync test, local half): a record created
// offline is not on the server yet; a pull runs before the sync; the
// local row must still be present afterwards. The server-minted-number
// + no-duplicate half is covered by the numbering RPCs (ss_next_adm_no
// / ss_next_receipt_no) and the upload dedupe, and needs a live TEST
// school run (BAT) — it cannot be proven from the repo alone.

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { extractFunction } from './extract-app-fn.mjs';

function loadMerge(overrides = {}) {
  const snapshot = new Set(overrides.snapshot || []);
  const kept = [];
  const requeued = [];
  const seedIds = new Set(overrides.seedIds || []);
  const ctx = vm.createContext({
    Promise,
    console,
    // mergeIsSeedRow closes over `d` in app.js; the sandbox provides it.
    d: {},
    seedStudentIds: {},
    seedExamIds: {},
    sbIsSeedRow: (table, row) => seedIds.has(row.id),
    outboxDelete102: overrides.outboxDelete102 || {},
    tomb105: overrides.tomb105 || {},
    outboxUpsert46: overrides.outboxUpsert46 || { feeRecords: {}, students: {} },
    snapHas: (table, id) => snapshot.has(table + ':' + id),
    keep: (table, id) => kept.push(table + ':' + id),
    tombRequeue106: (table, id) => requeued.push(table + ':' + id),
  });
  vm.runInContext(
    extractFunction('mergeIsSeedRow') + '\n' + extractFunction('mergeById'),
    ctx
  );
  const mergeById = ctx.mergeById;
  return {
    kept,
    requeued,
    merge: (table, localArr, serverRows) => mergeById(table, localArr, serverRows, (r) => r),
  };
}

const ids = (rows) => Array.from(rows, (r) => r.id).sort(); // Array.from: rows is a vm-realm array (mergeById runs in a vm sandbox) and strict deepEqual compares prototypes — copy into a host-realm array first.

test('offline local-only row survives a pull (not on server, not in snapshot)', () => {
  const { merge, kept } = loadMerge();
  const merged = merge(
    'ss_students',
    [{ id: 'srv-1', name: 'Synced' }, { id: 'local-1', name: 'Offline' }],
    [{ id: 'srv-1', name: 'Synced' }]
  );
  assert.deepEqual(ids(merged), ['local-1', 'srv-1']);
  assert.ok(kept.includes('ss_students:local-1'));
});

test('row deleted elsewhere still drops (in snapshot, absent from server)', () => {
  const { merge } = loadMerge({ snapshot: ['ss_students:gone-1'] });
  const merged = merge(
    'ss_students',
    [{ id: 'srv-1' }, { id: 'gone-1' }],
    [{ id: 'srv-1' }]
  );
  assert.deepEqual(ids(merged), ['srv-1']);
});

test('pending delete wins: the server row is not pulled back', () => {
  const { merge } = loadMerge({
    outboxDelete102: { ss_students: { 'del-1': true } },
  });
  const merged = merge('ss_students', [], [{ id: 'del-1' }]);
  assert.deepEqual(ids(merged), []);
});

test('tombstoned server row is skipped and its delete is re-queued', () => {
  const { merge, requeued } = loadMerge({
    tomb105: { ss_students: { 'z-1': true } },
  });
  const merged = merge('ss_students', [], [{ id: 'z-1' }]);
  assert.deepEqual(ids(merged), []);
  assert.deepEqual(requeued, ['ss_students:z-1']);
});

test('demo-seed local row drops (never the account’s data)', () => {
  const { merge } = loadMerge({ seedIds: ['seed-1'] });
  const merged = merge('ss_students', [{ id: 'seed-1' }], []);
  assert.deepEqual(ids(merged), []);
});

test('fee record with a pending outbox upsert is kept even when snapshotted', () => {
  const { merge, kept } = loadMerge({
    snapshot: ['ss_fee_records:f-1'],
    outboxUpsert46: { feeRecords: { 'f-1': true }, students: {} },
  });
  const merged = merge('ss_fee_records', [{ id: 'f-1' }], []);
  assert.deepEqual(ids(merged), ['f-1']);
  assert.ok(kept.includes('ss_fee_records:f-1'));
});

test('fee record snapshotted with NO pending upsert still drops', () => {
  const { merge } = loadMerge({ snapshot: ['ss_fee_records:f-1'] });
  const merged = merge('ss_fee_records', [{ id: 'f-1' }], []);
  assert.deepEqual(ids(merged), []);
});

test('duplicate server rows for one id collapse to one local row', () => {
  const { merge } = loadMerge();
  const merged = merge(
    'ss_students',
    [],
    [
      { id: 'd-1', name: 'First' },
      { id: 'd-1', name: 'Duplicate' },
    ]
  );
  assert.deepEqual(ids(merged), ['d-1']);
  assert.equal(merged[0].name, 'First');
});
