// tests/phase7/pagination-performance.test.mjs — Phase 7 (roadmap §6
// Phase 7): pagination behaviour + lightweight-page budgets + the
// Storage-images-instead-of-Data-URLs state.
//
// PAGINATION — the 5000-row silent-miss is FIXED in app.js at v108
// (v64 sbFetchAllPages: keyset cursor id=gt.<last id>, pages of 5000).
// These tests prove the fix against the real function with a stubbed
// sbRest: a table with more than 5000 rows comes back whole, in order,
// and a misbehaving server cannot spin the loop forever. Phase 3 owns
// the implementation; Phase 7 only tests it — no pull path is
// re-implemented here.
//
// PERFORMANCE — first-load weight is pinned with generous budgets so a
// future change that balloons the page fails loudly instead of
// silently. Measured at v108 (see the budget test): app.js ~698 KB,
// whole first load ~963 KB. The budgets below leave headroom on purpose.
// The CSP (no third-party scripts, Supabase only) is pinned too.
//
// STORAGE IMAGES — the v78 migration is PARTIAL, and these tests pin
// the exact current state rather than pretending it is done:
//   UPLOAD: a data URL is sent ONLY when no Storage URL exists
//   (sbMapStudent / sbSyncSchoolPayloadFromParts).
//   DISPLAY: the data URL is still preferred when present
//   (sbRowToStudent: photo_data_url || photo_url — offline-safe).
//   GAP: old rows still carry photo_data_url/logo_data_url, and the
//   display path still prefers them, so Storage does not yet shrink
//   what a device downloads. Closing that gap is Phase 3's migration
//   work, not this PR's.
//
// Run: node --test tests/phase7/*.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { statSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppContext } from '../harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Build a stubbed app whose sbRest serves canned pages per table.
// pages: { table: [ [rows...], [rows...], ... ] } — one array per page.
function stubbedApp(pages) {
  const app = createAppContext();
  app.run(`
    globalThis.__ph7calls = [];
    globalThis.__ph7pages = ${JSON.stringify(pages)};
    sbRest = function (method, path, token, body) {
      globalThis.__ph7calls.push(path);
      var m = path.match(/^([a-z_0-9]+)\\?/);
      var table = m ? m[1] : path;
      var page = (globalThis.__ph7pages[table] || []).shift() || [];
      return Promise.resolve({ ok: true, status: 200, data: page });
    };
  `);
  return app;
}

function calls(app) {
  return JSON.parse(app.run('JSON.stringify(globalThis.__ph7calls)'));
}

function pageOf(n, startId) {
  const rows = [];
  for (let i = 0; i < n; i++) rows.push({ id: 'row-' + String(startId + i).padStart(6, '0') });
  return rows;
}

describe('sbFetchAllPages — the 5000-row silent-miss fix (v64)', () => {
  it('SB_PAGE_SIZE is 5000', () => {
    const app = createAppContext();
    assert.equal(app.run('SB_PAGE_SIZE'), 5000);
  });

  it('12,500 rows come back whole, in order, across 3 pages', async () => {
    const app = stubbedApp({ ss_students: [pageOf(5000, 1), pageOf(5000, 5001), pageOf(2500, 10001)] });
    const res = await app.run(`sbFetchAllPages('ss_students', 'id', 'school-1', 'tok')`);
    assert.equal(res.ok, true);
    assert.equal(res.data.length, 12500);
    assert.equal(res.data[0].id, 'row-000001');
    assert.equal(res.data[4999].id, 'row-005000');
    assert.equal(res.data[5000].id, 'row-005001');
    assert.equal(res.data[12499].id, 'row-012500');
    const cs = calls(app);
    assert.equal(cs.length, 3, 'exactly 3 page fetches');
    assert.match(cs[0], /limit=5000$/, 'first page has no cursor');
    assert.match(cs[1], /id=gt\.row-005000/, 'second page continues after the last id of page 1');
    assert.match(cs[2], /id=gt\.row-010000/, 'third page continues after the last id of page 2');
    for (const c of cs) assert.match(c, /order=id\.asc/, 'pages follow server id order');
  });

  it('exactly 5000 rows: one full page, then an empty page stops the loop', async () => {
    const app = stubbedApp({ ss_students: [pageOf(5000, 1), []] });
    const res = await app.run(`sbFetchAllPages('ss_students', 'id', 'school-1', 'tok')`);
    assert.equal(res.data.length, 5000);
    assert.equal(calls(app).length, 2, 'the empty second page is what stops the loop');
  });

  it('a short page stops the loop immediately (no extra fetch)', async () => {
    const app = stubbedApp({ ss_students: [pageOf(120, 1)] });
    const res = await app.run(`sbFetchAllPages('ss_students', 'id', 'school-1', 'tok')`);
    assert.equal(res.data.length, 120);
    assert.equal(calls(app).length, 1);
  });

  it('an empty table is one call and an empty result', async () => {
    const app = stubbedApp({ ss_students: [[]] });
    const res = await app.run(`sbFetchAllPages('ss_students', 'id', 'school-1', 'tok')`);
    assert.equal(res.data.length, 0);
    assert.equal(calls(app).length, 1);
  });

  it('a page that does not advance the cursor throws instead of looping forever', async () => {
    // Every page returns the same last id: the server is misbehaving.
    const stuck = [pageOf(5000, 1), pageOf(5000, 1), pageOf(5000, 1)];
    const app = stubbedApp({ ss_students: stuck });
    await assert.rejects(
      app.run(`sbFetchAllPages('ss_students', 'id', 'school-1', 'tok')`),
      /page-stuck-ss_students/,
      'a stuck cursor must throw, never spin',
    );
    assert.ok(calls(app).length <= 3, 'at most a couple of fetches before the throw');
  });

  it('a server error aborts the pull with a named error', async () => {
    const app = createAppContext();
    app.run(`
      sbRest = function () { return Promise.resolve({ ok: false, status: 500, data: { message: 'boom' } }); };
    `);
    await assert.rejects(
      app.run(`sbFetchAllPages('ss_students', 'id', 'school-1', 'tok')`),
      /read-ss_students/,
    );
  });

  it('select columns always include id (the cursor needs it)', async () => {
    const app = stubbedApp({ ss_students: [[{ id: 'a', name: 'x' }], []] });
    await app.run(`sbFetchAllPages('ss_students', 'name', 'school-1', 'tok')`);
    assert.match(calls(app)[0], /select=name,id|select=id,name/, 'id is appended when the caller did not ask for it');
    const app2 = stubbedApp({ ss_students: [[{ id: 'a' }], []] });
    await app2.run(`sbFetchAllPages('ss_students', '*', 'school-1', 'tok')`);
    assert.match(calls(app2)[0], /select=\*/, 'a * select stays *');
  });
});

describe('Storage images instead of Data URLs — current state (v78, partial)', () => {
  it('UPLOAD (sbMapStudent): a data URL is sent only when no Storage URL exists', () => {
    const app = createAppContext();
    const withUrl = JSON.parse(app.run(`JSON.stringify(sbMapStudent({ photoUrl: 'https://bsjqeeeemwimzldrehpw.supabase.co/storage/v1/object/public/photos/x.jpg', photo: 'data:image/jpeg;base64,AAAA' }, 'school-1'))`));
    assert.equal(withUrl.photo_url, 'https://bsjqeeeemwimzldrehpw.supabase.co/storage/v1/object/public/photos/x.jpg');
    assert.equal(withUrl.photo_data_url, null, 'no data URL is uploaded when a Storage URL exists');
    const withoutUrl = JSON.parse(app.run(`JSON.stringify(sbMapStudent({ photoUrl: null, photo: 'data:image/jpeg;base64,AAAA' }, 'school-1'))`));
    assert.equal(withoutUrl.photo_data_url, 'data:image/jpeg;base64,AAAA', 'offline / upload-failed rows still fall back to the data URL');
    assert.equal(withoutUrl.photo_url, null);
  });

  it('UPLOAD (sbSyncSchoolPayloadFromParts): logo data URL only when no logo URL exists', () => {
    const app = createAppContext();
    const withUrl = JSON.parse(app.run(`JSON.stringify(sbSyncSchoolPayloadFromParts({ logoUrl: 'https://bsjqeeeemwimzldrehpw.supabase.co/storage/v1/object/public/logos/y.png', logo: 'data:image/png;base64,BBBB' }, {}, 1, 1))`));
    assert.equal(withUrl.logo_url, 'https://bsjqeeeemwimzldrehpw.supabase.co/storage/v1/object/public/logos/y.png');
    assert.equal(withUrl.logo_data_url, null);
    const withoutUrl = JSON.parse(app.run(`JSON.stringify(sbSyncSchoolPayloadFromParts({ logoUrl: null, logo: 'data:image/png;base64,BBBB' }, {}, 1, 1))`));
    assert.equal(withoutUrl.logo_data_url, 'data:image/png;base64,BBBB');
  });

  it('DISPLAY (sbRowToStudent): a row with only a Storage URL still shows its photo', () => {
    const app = createAppContext();
    const row = JSON.parse(app.run(`JSON.stringify(sbRowToStudent({ local_id: 'l1', name: 'Asha', cls: '6th-A', photo_url: 'https://example.test/p.jpg', photo_data_url: null }))`));
    assert.equal(row.photo, 'https://example.test/p.jpg');
    assert.equal(row.photoUrl, 'https://example.test/p.jpg');
  });

  it('DISPLAY (sbRowToStudent): a legacy row with only a data URL still shows its photo (offline-safe)', () => {
    const app = createAppContext();
    const row = JSON.parse(app.run(`JSON.stringify(sbRowToStudent({ local_id: 'l1', name: 'Asha', cls: '6th-A', photo_url: null, photo_data_url: 'data:image/jpeg;base64,AAAA' }))`));
    assert.equal(row.photo, 'data:image/jpeg;base64,AAAA');
    assert.equal(row.photoUrl, null);
  });

  it('GAP (pinned, not hidden): display still prefers the data URL when both exist', () => {
    // sbRowToStudent: photo: row.photo_data_url || row.photo_url. Until
    // Phase 3 backfills old rows to Storage-only, a device keeps
    // downloading the heavier data URL even where a Storage URL exists.
    const app = createAppContext();
    const row = JSON.parse(app.run(`JSON.stringify(sbRowToStudent({ local_id: 'l1', name: 'Asha', cls: '6th-A', photo_url: 'https://example.test/p.jpg', photo_data_url: 'data:image/jpeg;base64,AAAA' }))`));
    assert.equal(row.photo, 'data:image/jpeg;base64,AAAA');
  });

  it('PULL (sbRowToStudent): a full Aadhaar from an old server row is reduced to last-4 on pull', () => {
    const app = createAppContext();
    const row = JSON.parse(app.run(`JSON.stringify(sbRowToStudent({ local_id: 'l1', name: 'Asha', cls: '6th-A', aadhaar: '123456789012' }))`));
    assert.equal(row.aadhaar, '9012');
  });
});

describe('lightweight pages — weight budgets + CSP (v108)', () => {
  // First-load files: everything index.html loads before first paint,
  // plus the service worker. Measured at v108: app.js 698,328 B;
  // total 963,102 B (~941 KiB). Budgets leave ~25% headroom on purpose:
  // they guard against accidental bloat, not against deliberate growth.
  const FIRST_LOAD = ['app.js', 'index.html', 'styles.css', 'qrgen.js', 'js/bcrypt.js', 'js/modules/i18n.js', 'js/modules/crypto.js', 'sw.js'];

  it('first-load total stays under 1.2 MB', () => {
    let total = 0;
    const sizes = {};
    for (const f of FIRST_LOAD) {
      const n = statSync(join(ROOT, f)).size;
      sizes[f] = n;
      total += n;
    }
    assert.ok(total < 1.2 * 1024 * 1024, `first-load total ${total} B exceeds the 1.2 MB budget (${JSON.stringify(sizes)})`);
  });

  it('app.js stays under 800 KB', () => {
    const n = statSync(join(ROOT, 'app.js')).size;
    assert.ok(n < 800 * 1024, `app.js is ${n} B, over the 800 KB budget`);
  });

  it('CSP allows scripts only from self, and network only to Supabase', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
    assert.ok(csp, 'index.html must carry a Content-Security-Policy');
    assert.match(csp[1], /default-src 'self'/);
    assert.match(csp[1], /script-src 'self'/, 'no third-party scripts');
    assert.doesNotMatch(csp[1], /script-src[^;]*https?:\/\/(?!bsjqeeeemwimzldrehpw\.supabase\.co)/, 'no non-Supabase script host');
    assert.match(csp[1], /connect-src 'self' https:\/\/bsjqeeeemwimzldrehpw\.supabase\.co/);
  });

  it('index.html loads no third-party script or stylesheet', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const externals = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(externals, [], `third-party assets found: ${externals.join(', ')}`);
  });
});
