// tests/phase7/grant-matrix.test.mjs — Phase 7 (roadmap §6 Phase 7):
// RLS and grant re-verification after every revoke, plus the security
// review of all RPCs — computed from the repo SQL files (supabase/*.sql,
// files 01–38), not from a live database (this agent cannot query it).
//
// The parser below replays the repo's grant history the way PostgreSQL
// would: CREATE FUNCTION grants EXECUTE to PUBLIC by default; GRANT /
// REVOKE (including the dynamic EXECUTE 'revoke …' strings inside DO
// blocks, SQL 15/22 style) then add/remove roles, in file order; DROP
// FUNCTION removes the entry. The final matrix is asserted exactly.
//
// KNOWN GAP (pinned, not hidden): 8 functions still carry the default
// PUBLIC grant at v108 — the 7 that Phase 3's SQL 39 revokes (not yet
// merged to main) plus ss_touch_updated_at, a trigger function that
// keeps PUBLIC by design (it can do nothing outside a trigger). When
// SQL 39 lands, the PUBLIC set below must shrink to
// ['ss_touch_updated_at()'] — the test says so in its message.
//
// Run: node --test tests/phase7/*.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SQL_DIR = join(ROOT, 'supabase');
const sqlFiles = readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql')).sort();

// --- Grant-history parser (see header) ---------------------------------
function buildGrantMatrix() {
  let sql = sqlFiles.map((f) => readFileSync(join(SQL_DIR, f), 'utf8')).join('\n');
  sql = sql.replace(/--[^\n]*/g, ' '); // strip line comments
  const flat = sql.replace(/\s+/g, ' ');
  // Dynamic SQL inside DO blocks: execute 'revoke …'; — replay it too.
  const dyn = [...flat.matchAll(/execute\s+'((?:[^']|'')+)'/gi)].map((m) => m[1].replace(/''/g, "'"));
  const all = flat + ' ' + dyn.join('; ') + ';'; // trailing ';' so the last dynamic revoke matches
  const normSig = (sig) => {
    const inner = sig.trim().replace(/^\(/, '').replace(/\)$/, '');
    if (!inner.trim()) return '()';
    return '(' + inner.split(',').map((p) => {
      let t = p.trim().replace(/\s+default\s+.*$/i, '').trim();
      t = t.replace(/^[a-z_][a-z_0-9]*\s+/i, ''); // strip param name
      return t.toLowerCase();
    }).join(',') + ')';
  };
  const normKey = (name, sig) => name.toLowerCase() + normSig(sig);
  const events = [];
  for (const m of all.matchAll(/create or replace function\s+(public\.)?([a-z_0-9]+)\s*(\([^)]*\))/gi)) {
    events.push({ i: m.index, kind: 'create', k: normKey(m[2], m[3]) });
  }
  for (const m of all.matchAll(/drop function if exists\s+(public\.)?([a-z_0-9]+)\s*(\([^)]*\))/gi)) {
    events.push({ i: m.index, kind: 'drop', k: normKey(m[2], m[3]) });
  }
  for (const m of all.matchAll(/(grant|revoke)\s+(execute|all)\s+on function\s+(public\.)?([a-z_0-9]+)\s*(\([^)]*\))\s+(to|from)\s+([a-z, ]+?);/gi)) {
    events.push({ i: m.index, kind: m[1].toLowerCase(), k: normKey(m[4], m[5]), roles: m[7] });
  }
  events.sort((a, b) => a.i - b.i);
  const grants = new Map(); // 'fn(types)' -> Set(roles)
  for (const e of events) {
    if (e.kind === 'create') { if (!grants.has(e.k)) grants.set(e.k, new Set(['public'])); }
    else if (e.kind === 'drop') { grants.delete(e.k); }
    else {
      if (!grants.has(e.k)) continue; // grant/revoke on a dropped function: no-op
      const set = grants.get(e.k);
      for (const r of e.roles.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)) {
        if (e.kind === 'grant') set.add(r); else set.delete(r);
      }
    }
  }
  return grants;
}

const MATRIX = buildGrantMatrix();
const byRoles = (roles) => [...MATRIX.entries()]
  .filter(([, v]) => v.size === roles.length && roles.every((r) => v.has(r)))
  .map(([k]) => k).sort();
const withRole = (role) => [...MATRIX.entries()].filter(([, v]) => v.has(role)).map(([k]) => k).sort();

// The 8 functions that still carry the default PUBLIC grant at v108.
// Seven are closed by Phase 3 SQL 39 (not yet merged); the eighth,
// ss_touch_updated_at, is the updated_at TRIGGER function — PUBLIC by
// design, harmless (it can do nothing outside a trigger).
const EXPECTED_PUBLIC = [
  'is_ss_admin()',
  'ss_is_real_school(uuid)',
  'ss_list_public_schools()',
  'ss_next_adm_no(uuid)',
  'ss_next_receipt_no(uuid)',
  'ss_school_owner(uuid)',
  'ss_touch_updated_at()',
  'ss_wipe_school(uuid)',
];

describe('grant matrix (from repo SQL 01-38)', () => {
  it('33 RPCs exist in the repo (roadmap Appendix C listed 20 at v67)', () => {
    assert.equal(MATRIX.size, 33, [...MATRIX.keys()].sort().join(', '));
  });

  it('PUBLIC execute remains on exactly the 8 known functions (KNOWN GAP — SQL 39 closes 7)', () => {
    assert.deepEqual(
      withRole('public'),
      [...EXPECTED_PUBLIC].sort(),
      'PUBLIC set changed: if Phase 3 SQL 39 landed, shrink this list to [ss_touch_updated_at()] — do not silently widen it',
    );
  });

  it('ss_wipe_school is callable by authenticated (and PUBLIC, known gap) but its body is ownership-checked', () => {
    assert.deepEqual([...MATRIX.get('ss_wipe_school(uuid)')].sort(), ['authenticated', 'public']);
    const wipe = readFileSync(join(SQL_DIR, '05_wipe_school.sql'), 'utf8');
    assert.match(wipe, /if public\.ss_school_owner\(p_school_id\) is distinct from auth\.uid\(\)\s+and not public\.is_ss_admin\(\) then\s+raise exception 'not your school'/,
      'ss_wipe_school must refuse non-owners inside its body — the grant alone must never be the protection');
  });

  it('ss_parent_lookup is postgres-only (unused since v65, SQL 22)', () => {
    assert.deepEqual([...MATRIX.get('ss_parent_lookup(text,text,uuid)')], [],
      'ss_parent_lookup must be executable by nobody (revoked from public, anon AND authenticated in SQL 22)');
    assert.ok(!MATRIX.has('ss_parent_lookup(text,text)'), 'the 2-arg overload was dropped by SQL 07 and must stay gone');
  });

  it('token-owner helpers are postgres-only (internal, never granted)', () => {
    assert.deepEqual([...MATRIX.get('ss_teacher_token_owner(uuid)')], []);
    assert.deepEqual([...MATRIX.get('ss_staff_token_owner(uuid)')], []);
  });

  it('ss_school_login_ok is authenticated-only (P0-1, SQL 21)', () => {
    assert.deepEqual([...MATRIX.get('ss_school_login_ok(text)')], ['authenticated']);
  });

  it('login RPCs are anon + authenticated (they run before any session exists)', () => {
    assert.deepEqual(byRoles(['anon', 'authenticated']), [
      // NOTE: ss_list_public_schools() is anon+authenticated+PUBLIC —
      // it sits in the EXPECTED_PUBLIC list above, not here.
      'ss_log_audit(uuid,text,text,text,text,text,text)',
      'ss_parent_pin_failed(uuid,text)',
      'ss_parent_pin_ok(uuid,text)',
      'ss_parent_pin_precheck(uuid,text)',
      'ss_parent_pin_reset_by_dob(uuid,text,date,text)',
      'ss_public_schools()',
      'ss_school_login_failed(text)',
      'ss_school_login_precheck(text)',
      'ss_staff_cloud_login(uuid,text,text)',
      'ss_staff_mark_attendance(uuid,date,text,uuid,text)',
      'ss_staff_post_homework(uuid,text,text,text,date,text)',
      'ss_staff_revoke_session(uuid)',
      'ss_staff_set_marks(uuid,uuid,jsonb)',
      'ss_student_cloud_login(uuid,text,text)',
      'ss_teacher_cloud_login(uuid,text,text)',
      'ss_teacher_mark_attendance(uuid,date,text,uuid,text)',
      'ss_teacher_post_homework(uuid,text,text,text,date,text)',
      'ss_teacher_revoke_session(uuid)',
      'ss_teacher_set_marks(uuid,uuid,jsonb)',
      'ss_teacher_student_photo(uuid,uuid)',
    ]);
  });

  it('authenticated-only functions are exactly the super-admin check and the login reset', () => {
    assert.deepEqual(byRoles(['authenticated']), ['ss_is_super_admin()', 'ss_school_login_ok(text)']);
  });

  it('no function grants EXECUTE to any other role (only anon / authenticated / public exist)', () => {
    for (const [fn, roles] of MATRIX) {
      for (const r of roles) assert.ok(['anon', 'authenticated', 'public'].includes(r), `${fn} grants to unexpected role '${r}'`);
    }
  });
});

describe('SECURITY DEFINER hygiene (static)', () => {
  function fnBlocks() {
    let sql = sqlFiles.map((f) => readFileSync(join(SQL_DIR, f), 'utf8')).join('\n');
    sql = sql.replace(/--[^\n]*/g, ' ');
    const blocks = [
      ...sql.matchAll(/create or replace function\s+public\.([a-z_0-9]+)\s*\([^)]*\)[\s\S]*?as \$\$[\s\S]*?\$\$;/gi),
      ...sql.matchAll(/create or replace function\s+public\.([a-z_0-9]+)\s*\([^)]*\)[\s\S]*?as \$function\$[\s\S]*?\$function\$;/gi),
    ];
    return blocks.map((b) => ({ name: b[1], head: b[0].slice(0, b[0].indexOf('as $')) }));
  }

  it('every SECURITY DEFINER function sets search_path (no search_path-hijack hole)', () => {
    const blocks = fnBlocks();
    assert.equal(blocks.length, 42, 'expected 42 CREATE FUNCTION blocks in SQL 01-38');
    for (const { name, head } of blocks) {
      if (/security definer/i.test(head)) {
        assert.match(head, /set search_path/i, `${name}: SECURITY DEFINER without search_path`);
      }
    }
  });

  it('only the trigger function is not SECURITY DEFINER', () => {
    const blocks = fnBlocks();
    const plain = blocks.filter(({ head }) => !/security definer/i.test(head)).map(({ name }) => name);
    assert.deepEqual(plain, ['ss_touch_updated_at']);
  });
});

describe('table grants (static)', () => {
  it('anon table access is exactly two grants (settings SELECT, admission INSERT)', () => {
    let sql = sqlFiles.map((f) => readFileSync(join(SQL_DIR, f), 'utf8')).join('\n');
    sql = sql.replace(/--[^\n]*/g, ' ');
    const flat = sql.replace(/\s+/g, ' ');
    const anonGrants = [...flat.matchAll(/grant (select|insert|update|delete|all)(?: \([^)]*\))? on public\.(ss_[a-z_0-9]+) to ([^;]+?);/gi)]
      .filter((m) => m[3].split(',').map((s) => s.trim()).includes('anon'))
      .map((m) => `${m[2]}:${m[1]}`);
    assert.deepEqual(anonGrants.sort(), ['ss_admission_requests:insert', 'ss_platform_settings:select']);
  });

  it('authenticated gets CRUD on the 17 loop tables + ss_staff + ss_holidays, and nothing else', () => {
    const src02 = readFileSync(join(SQL_DIR, '02_rls.sql'), 'utf8');
    // 02_rls.sql has TWO foreach loops: the 12-table policy loop first,
    // then the grants loop. The grants loop is the one containing
    // ss_platform_settings.
    const loops = [...src02.matchAll(/foreach t in array array\[([\s\S]*?)\]/g)];
    const loop = loops.find((m) => m[1].includes('ss_platform_settings'));
    assert.ok(loop, '02_rls.sql grant loop not found');
    const loopTables = [...loop[1].matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]).sort();
    assert.equal(loopTables.length, 17, `grants loop should list 17 tables, got ${loopTables.length}`);
    // The 17 loop tables are granted by DYNAMIC SQL (execute format('grant
    // select, insert, update, delete on public.%I to authenticated', t)) —
    // no literal grant statement exists for them. Assert the loop's
    // format string is the CRUD grant, and the only LITERAL CRUD grants
    // are the two tables that postdate the loop (ss_staff, ss_holidays).
    assert.match(src02, /execute format\('grant select, insert, update, delete on public\.%I to authenticated', t\)/,
      '02_rls.sql grant loop must grant full CRUD to authenticated');
    let sql = sqlFiles.map((f) => readFileSync(join(SQL_DIR, f), 'utf8')).join('\n');
    sql = sql.replace(/--[^\n]*/g, ' ');
    const flat = sql.replace(/\s+/g, ' ');
    const literalCrud = [...flat.matchAll(/grant select, insert, update, delete on public\.(ss_[a-z_0-9]+) to authenticated;/gi)].map((m) => m[1]).sort();
    assert.deepEqual(literalCrud, ['ss_holidays', 'ss_staff']);
    const crud = new Set([...loopTables, ...literalCrud]);
    assert.deepEqual([...crud].sort(), [...loopTables, 'ss_holidays', 'ss_staff'].sort());
  });

  it('the 7 RPC-only tables have no table grant at all', () => {
    let sql = sqlFiles.map((f) => readFileSync(join(SQL_DIR, f), 'utf8')).join('\n');
    sql = sql.replace(/--[^\n]*/g, ' ');
    const flat = sql.replace(/\s+/g, ' ');
    for (const t of ['ss_parent_pin_attempts', 'ss_school_login_attempts', 'ss_staff_login_attempts', 'ss_staff_sessions', 'ss_student_login_attempts', 'ss_teacher_login_attempts', 'ss_teacher_sessions']) {
      assert.doesNotMatch(flat, new RegExp(`grant [^;]* on public\\.${t} `, 'i'), `${t} must stay RPC-only — a table grant would bypass the RPCs`);
    }
  });
});

describe('no secrets in frontend code (static)', () => {
  function frontendWithoutComments() {
    const files = ['app.js', 'index.html', 'sw.js', 'qrgen.js', 'js/bcrypt.js', 'js/modules/crypto.js', 'js/modules/i18n.js'];
    let out = '';
    for (const f of files) {
      let src = readFileSync(join(ROOT, f), 'utf8');
      src = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
      out += `\n${src}`;
    }
    return out;
  }

  it('no service_role key anywhere in frontend code', () => {
    assert.doesNotMatch(frontendWithoutComments(), /service_role/i);
  });

  it('the shipped Supabase key is the anon (publishable) key, not a privileged key', () => {
    const appJs = readFileSync(join(ROOT, 'app.js'), 'utf8');
    const m = appJs.match(/var SB_ANON_KEY = '([^']+)'/);
    assert.ok(m, 'SB_ANON_KEY not found in app.js');
    const payload = JSON.parse(Buffer.from(m[1].split('.')[1], 'base64url').toString('utf8'));
    assert.equal(payload.role, 'anon');
    assert.equal(payload.ref, 'bsjqeeeemwimzldrehpw');
    assert.equal(payload.iss, 'supabase');
  });

  it('no other JWT-shaped key is hardcoded in frontend code', () => {
    const src = frontendWithoutComments();
    const jwts = [...src.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g)].map((m) => m[0]);
    assert.equal(jwts.length, 1, `expected exactly 1 JWT (the anon key), found ${jwts.length}`);
  });
});
