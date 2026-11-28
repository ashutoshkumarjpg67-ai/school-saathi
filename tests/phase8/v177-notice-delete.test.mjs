import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAppContext } from '../harness.mjs';

test('v177: deleteNotice immediately queues directDelete + tombstone and deletes from server even with clock skew', async () => {
  const app = createAppContext();
  const res = await app.run(`(async function () {
    db = seedDB();
    db.notices = [{ id: 'n-del-1', title: 'Winter Leave', date: '2026-11-28', body: 'Closed' }];
    state.role = 'school';
    state.user = { uid: 'u1', role: 'school', sbUid: 'sb1', name: 'Admin' };
    state.sb = { uid: 'sb1', email: 'a@b.com' };
    sbStoreSession({ access_token: 'tok', refresh_token: 'rt', expires_in: 3600 });
    // Intercept confirmModal & renderApp for headless harness
    var origConfirm = confirmModal, origRender = renderApp;
    confirmModal = function (msg, fn) { fn(); };
    renderApp = function () {};
    deleteNotice('n-del-1');
    confirmModal = origConfirm; renderApp = origRender;
    var outbox = sbOutboxLoad('sb1');
    var delEntry = outbox.find(function (e) { return e.table === 'ss_notices' && e.key === 'n-del-1' && e.op === 'delete'; });
    var tomb = sbTombLoad('sb1');
    var hasTomb = !!(tomb.ss_notices && tomb.ss_notices['n-del-1']);
    // Simulate clock skew where server created_at is 60s ahead of browser entry.at
    var deletedId = null;
    sbRest = function (method, path) {
      if (method === 'DELETE' && path.indexOf('ss_notices?id=eq.') === 0) {
        deletedId = path.split('id=eq.')[1];
        return Promise.resolve({ ok: true, status: 204, data: null });
      }
      return Promise.resolve({ ok: true, status: 200, data: [] });
    };
    var batch = {
      ss_notices: [{
        id: 'srv-uuid-99',
        school_id: 'sch-1',
        local_id: 'n-del-1',
        title: 'Winter Leave',
        created_at: new Date(Date.now() + 60000).toISOString()
      }]
    };
    var pushRes = await sbSyncPushEntry(delEntry, 'tok', 'sch-1', { stu: {}, exam: {} }, 'sb1', batch);
    return {
      localCount: db.notices.length,
      directDelete: !!(delEntry && delEntry.directDelete),
      hasTomb: hasTomb,
      pushed: !!(pushRes && pushRes.pushed),
      deletedId: deletedId
    };
  })()`);
  assert.equal(res.localCount, 0);
  assert.equal(res.directDelete, true);
  assert.equal(res.hasTomb, true);
  assert.equal(res.pushed, true);
  assert.equal(res.deletedId, 'srv-uuid-99');
});
