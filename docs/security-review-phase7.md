# School Saathi — Security Review, Phase 7

Date: 12 November 2026 · Base: origin/main v108 (commit `1734f84`)
Roadmap: Enterprise Roadmap §6 Phase 7 ("Prove the platform under load
and attack, not just in normal use") and §8 success criteria.
Author: Phase 7 agent (Spider). Status: **review + offline tests only —
no live database was queried** (see §1 Limits).

## 1. Method and limits — read this first

- **What was reviewed:** all repo SQL files `supabase/*.sql` (files
  01–38, plus `manual-repairs/` excluded — data cleanups, no grants),
  `app.js` at v108 (11,494 lines), `index.html` (CSP, asset loading),
  and the delete-account Edge Function's contract (it uses the
  service_role client on tables directly; it calls none of the RPCs
  below).
- **What was tested offline:** `tests/phase7/grant-matrix.test.mjs`
  replays the repo's grant history the way PostgreSQL would (CREATE
  FUNCTION defaults EXECUTE to PUBLIC; GRANT/REVOKE — including the
  dynamic `EXECUTE 'revoke …'` strings in DO blocks — then add/remove
  roles in file order; DROP FUNCTION removes the entry) and asserts the
  final matrix exactly. `tests/phase7/cross-school.test.mjs` proves the
  RLS shape from the same files. Both run with `node --test
  tests/phase7/*.test.mjs` (Node built-ins only).
- **What was NOT verified (pending live evidence, §6):** the grants as
  they actually stand in the live Supabase project
  (`bsjqeeeemwimzldrehpw`). Repo files and live state can drift — a
  file applied twice, a file never applied, or a dashboard change all
  break the equivalence. Nothing in this document claims the live
  database matches the repo; §6 lists the exact live checks for BAT.
- **What this document is not:** a penetration test, a legal review,
  or a Play Store compliance check. Those belong to Phase 8.

## 2. RPC inventory — all 33 functions (roadmap Appendix C listed 20 at v67)

Grants below are the **final state after replaying SQL 01–38**
(`public` = the PostgreSQL default grant on CREATE FUNCTION).
`SD` = SECURITY DEFINER (all SD functions set `search_path` — verified
by test; the only non-SD function is the `ss_touch_updated_at`
trigger).

| Function | File(s) | SD | Final EXECUTE grant |
|---|---|---|---|
| `is_ss_admin()` | 01 | yes | authenticated, **public** ⚠️ F1 |
| `ss_is_real_school(uuid)` | 02 | yes | anon, authenticated, **public** ⚠️ F1 |
| `ss_is_super_admin()` | 31 | yes | authenticated |
| `ss_list_public_schools()` | 02 | yes | anon, authenticated, **public** ⚠️ F1 |
| `ss_log_audit(uuid,text×6)` | 34 | yes | anon, authenticated |
| `ss_next_adm_no(uuid)` | 02 | yes | authenticated, **public** ⚠️ F1 |
| `ss_next_receipt_no(uuid)` | 02 | yes | authenticated, **public** ⚠️ F1 |
| `ss_parent_lookup(text,text,uuid)` | 02/07/15/22 | yes | **nobody (postgres only)** ✅ F4 |
| `ss_parent_pin_failed(uuid,text)` | 36 | yes | anon, authenticated |
| `ss_parent_pin_ok(uuid,text)` | 36 | yes | anon, authenticated |
| `ss_parent_pin_precheck(uuid,text)` | 36 | yes | anon, authenticated |
| `ss_parent_pin_reset_by_dob(uuid,text,date,text)` | 37 | yes | anon, authenticated |
| `ss_public_schools()` | 17 | yes | anon, authenticated |
| `ss_school_login_failed(text)` | 19 | yes | anon, authenticated |
| `ss_school_login_ok(text)` | 19/21 | yes | authenticated ✅ F5 |
| `ss_school_login_precheck(text)` | 19 | yes | anon, authenticated |
| `ss_school_owner(uuid)` | 01 | yes | authenticated, **public** ⚠️ F1 |
| `ss_staff_cloud_login(uuid,text,text)` | 30 | yes | anon, authenticated |
| `ss_staff_mark_attendance(uuid,date,text,uuid,text)` | 35 | yes | anon, authenticated |
| `ss_staff_post_homework(uuid,text,text,text,date,text)` | 35 | yes | anon, authenticated |
| `ss_staff_revoke_session(uuid)` | 30 | yes | anon, authenticated |
| `ss_staff_set_marks(uuid,uuid,jsonb)` | 35 | yes | anon, authenticated |
| `ss_staff_token_owner(uuid)` | 30 | yes | **nobody (postgres only)** ✅ |
| `ss_student_cloud_login(uuid,text,text)` | 17/23/33 | yes | anon, authenticated |
| `ss_teacher_cloud_login(uuid,text,text)` | 18/23/24/33 | yes | anon, authenticated |
| `ss_teacher_mark_attendance(uuid,date,text,uuid,text)` | 18 | yes | anon, authenticated |
| `ss_teacher_post_homework(uuid,text,text,text,date,text)` | 18 | yes | anon, authenticated |
| `ss_teacher_revoke_session(uuid)` | 18 | yes | anon, authenticated |
| `ss_teacher_set_marks(uuid,uuid,jsonb)` | 18 | yes | anon, authenticated |
| `ss_teacher_student_photo(uuid,uuid)` | 24/29 | yes | anon, authenticated |
| `ss_teacher_token_owner(uuid)` | 18 | yes | **nobody (postgres only)** ✅ |
| `ss_touch_updated_at()` | 04 | no (trigger) | **public** — by design, harmless (§3) |
| `ss_wipe_school(uuid)` | 05 | yes | authenticated, **public** ⚠️ F1 |

Design patterns that hold across the inventory (verified, not assumed):

- **Login RPCs take a school id and filter by it**
  (`ss_student_cloud_login`, `ss_teacher_cloud_login`,
  `ss_staff_cloud_login` take `p_school_id` and filter
  `school_id = p_school_id`).
- **Write RPCs take a session token, never a school id**
  (`ss_*_mark_attendance`, `ss_*_post_homework`, `ss_*_set_marks`
  take `p_token`, resolve the school server-side via
  `ss_*_token_owner(p_token)`, and write with `v_owner.school_id`).
  A token for school A can never write school B rows — the school is
  derived server-side, not supplied by the caller.
- **Token-owner helpers are internal.** They carry no EXECUTE grant
  to anyone; only the write RPCs call them (same owner).
- **Rate limits are uniform: 5 fails → 15-minute lock** on all five
  login surfaces (school SQL 19, student SQL 17, teacher SQL 18,
  staff SQL 30, parent PIN SQL 36). Counters reset when the lock is
  set; only accounts that exist get a row (no enumeration, no junk
  rows). See `tests/phase7/rate-limit.test.mjs`.

## 3. Findings

### F1 — HIGH (known gap, fix already written, not yet merged): default PUBLIC EXECUTE on 7 functions

`CREATE FUNCTION` grants EXECUTE to PUBLIC by default. Files 01/02/05
granted these functions to `authenticated` (and `anon` where intended)
but never revoked PUBLIC, so an anonymous caller can CALL them:

`is_ss_admin`, `ss_school_owner`, `ss_is_real_school`,
`ss_next_adm_no`, `ss_next_receipt_no`, `ss_list_public_schools`,
`ss_wipe_school`.

**Why this was never a live hole:** every body is ownership-checked
(`ss_wipe_school` raises `'not your school'` for non-owners;
`ss_next_adm_no`/`ss_next_receipt_no` resolve the school from the
caller's auth and refuse otherwise). But `ss_school_owner()` still
resolves any school UUID to its owner UUID for an anonymous caller,
and the grants contradict the least-privilege pattern every later file
follows. **Fix: Phase 3 SQL 39
(`supabase/39_revoke_public_function_grants.sql`) revokes PUBLIC on
all seven and re-asserts the explicit grants.** This Phase 7 PR
deliberately does NOT duplicate it. **Update (v111, 12 Nov 2026):
SQL 39 MERGED** (Phase 7 PRs #44–#56, HEAD d6d9c884), and the live
grants were verified the same day (BAT): **0 PUBLIC on all 8
functions** — the end state already holds, nothing left to apply.
The grant-matrix test now pins the post-39 set.

`ss_touch_updated_at()` (the `updated_at` trigger function) also keeps
the PUBLIC default. That is standard and harmless: a trigger function
can do nothing when called outside a trigger. It is excluded from SQL
39 on purpose and stays PUBLIC.

### F2 — MEDIUM: `visibleStudents()` does not scope the parent role

`canViewStudent()` scopes the parent correctly (own child only), and
the parent UI reaches students through `meStudent()`, so this path is
not reachable from the parent dashboard today. But the helper itself
has no parent branch — it falls through to the whole school list. Any
future parent list view that calls `visibleStudents()` would leak.
Pinned by a KNOWN-GAP test in
`tests/phase7/permission-matrix.test.mjs`; fix belongs to Phase 4
(add the parent branch: filter to `state.user.studentId`).

### F3 — LOW: display still prefers Data URLs over Storage URLs

Uploads already send a data URL only when no Storage URL exists
(`sbMapStudent`, `sbSyncSchoolPayloadFromParts` — tested). But the
pull mapper still displays `photo_data_url || photo_url`, so old rows
keep downloading the heavier data URL even where a Storage URL exists.
Pinned by a GAP test in
`tests/phase7/pagination-performance.test.mjs`; closing it is Phase 3's
migration backfill, not this phase.

### F4 — CLOSED (verified): `ss_parent_lookup` is postgres-only

Unused since v65; SQL 22 revokes EXECUTE from public, anon AND
authenticated (guarded DO block, `to_regprocedure`), and the 2-arg
overload was dropped by SQL 07. The grant-matrix test asserts the
3-arg overload has no grantees and the 2-arg overload does not exist.
If any flow ever needs it again, re-grant deliberately, with a rate
limit (SQL 22 header says the same).

### F5 — CLOSED (verified in repo + app): P0-1 auth-bound login reset

SQL 21: `ss_school_login_ok` returns `unauthenticated` when
`auth.uid()` is null and `email_mismatch` when the caller's email
differs from `p_email`; only the matching row is deleted; anon and
PUBLIC are revoked, authenticated only. `app.js` `sbSchoolLoginOk`
(v68) never calls the RPC without a fresh GoTrue token (tested:
no-token call issues no request; with-token call uses the token, never
the anon key). Live proof is still pending (§6, check L2).

### F6 — OPEN, USER STEP (do not do from code): delete `rls-test@school-saathi.in`

The test Auth user is still present in `auth.users` (roadmap §10 open
decision). Deletion is dashboard-only and belongs to Ashutosh:

1. Supabase dashboard → project School Saathi → Authentication →
   Users → search `rls-test@school-saathi.in` → Delete user.
2. Confirm no school row, student, or fee record references it (it was
   created only for the RLS probe; it owns no school).
3. Tell the coordinator it is deleted so this item can close.

Do NOT delete it from any script, Edge Function, or SQL — Auth users
cannot be deleted from SQL, and no code path should try.

### F7 — No secrets in frontend code (verified)

- No `service_role` string in frontend code (comments stripped).
- The only hardcoded JWT is `SB_ANON_KEY`; its payload decodes to
  `role: anon`, `ref: bsjqeeeemwimzldrehpw`, `iss: supabase` — the
  publishable key, as designed.
- CSP in `index.html`: `default-src 'self'`, `script-src 'self'`,
  network only to the Supabase project URL; no third-party script or
  stylesheet is loaded (tested).

## 4. Table grants + RLS (summary — full proofs in the Phase 7 tests)

- RLS enabled on all 26 tables; every table except the 7 RPC-only
  login-attempt/session tables has a policy; every tenant policy is
  owner-only (`ss_school_owner(school_id) = auth.uid()` or an admin
  check). (`tests/phase7/cross-school.test.mjs`)
- Table grants: `authenticated` gets full CRUD on the 17 loop tables
  (SQL 02) + `ss_staff` (SQL 32) + `ss_holidays` (SQL 38). `anon`
  gets exactly two table grants: SELECT on `ss_platform_settings`
  (public login-screen fields) and INSERT on `ss_admission_requests`
  (Pending + real school only). The 7 RPC-only tables have no table
  grant at all.
- `ss_support_requests` UPDATE is column-scoped: table-level UPDATE
  revoked from everyone, then `grant update (status)` to
  authenticated (SQL 27).

## 5. Exit-gate status (roadmap §6 Phase 7)

| Roadmap criterion | Status |
|---|---|
| Cross-school access tests run in CI | ✅ RUNS IN CI — `tests/phase7/cross-school.test.mjs` (15 tests); `tests/run.mjs` is recursive (the earlier non-recursive-glob note was wrong), and the CI run on HEAD 2516c097 (12 Nov 2026) went green including the npm test step. |
| Rate-limit tests run in CI | ✅ Same — `tests/phase7/rate-limit.test.mjs` (20 tests) runs in CI. |
| Permission-matrix tests run in CI | ✅ Same — `tests/phase7/permission-matrix.test.mjs` (18 tests) runs in CI; the v111 parent-branch fix is pinned by the matrix test. |
| Security checklist green | ✅ Repo-side green. F1 (PUBLIC grants): SQL 39 merged and the live state matches (L1 done 12 Nov). F2 (parent list scoping): FIXED in v111. F3 (Phase 3 photo live check): still owed — needs Ashutosh's phone. |
| No PUBLIC grant remains unverified | ✅ Live-verified 12 Nov 2026 (BAT, §6 check L1): 0 PUBLIC on all 8 functions. |

**Overall (updated v111, 12 Nov 2026): Phase 7 is green except the
live checks.** What is done: full offline test coverage of the
critical flows (permission matrix, cross-school, rate limits,
pagination, performance, grants) running in CI, the security review
above, the Storage/page-weight state measured, SQL 39 merged with the
live grants matching its end state, and the F2 parent-scoping gap
fixed in v111. What is not done: the live two-school and lockout
checks (BAT), the Phase 3 photo live check (Ashutosh's phone), and
the `rls-test@school-saathi.in` deletion (Ashutosh — §F6).

## 6. Pending live evidence (for BAT / Ashutosh — exact steps)

**L1 — Live grant check (BAT, Supabase dashboard SQL editor, read-only):**

```sql
select routine_name, grantee, privilege_type
  from information_schema.routine_privileges
 where routine_schema = 'public'
   and routine_name in ('is_ss_admin','ss_school_owner',
     'ss_is_real_school','ss_next_adm_no','ss_next_receipt_no',
     'ss_list_public_schools','ss_wipe_school','ss_parent_lookup',
     'ss_school_login_ok','ss_teacher_token_owner','ss_staff_token_owner')
 order by routine_name, grantee;
```

Expect (SQL 39 merged 12 Nov 2026; L1 run the same day by BAT and
matched): no `PUBLIC` on any of them — 0 PUBLIC on all 8 functions.
(Pre-39 expectation, kept for reference: `PUBLIC` on the first seven;
`ss_parent_lookup` only the `postgres` grantee; `ss_school_login_ok`
only `authenticated`; token owners no rows.)

**L2 — Live lockout check (BAT, staging preview):** with the anon key,
call `ss_school_login_precheck` for the TEST school email (expect
`locked: false`), then 5× `ss_school_login_failed` (expect `locked:
true` on the 5th), then `ss_school_login_ok` with the anon key (expect
an error / no reset — the lock must survive), then sign in with the
correct password and confirm the matching-email reset clears it.
Never run this against a real school's email.

**L3 — Live two-school cross-access check (BAT, staging preview):**
with school-A credentials (anon key + school-A JWT), request
`ss_students?school_id=eq.<school-B-uuid>` and one row write to a
school-B row (insert/update). Expect 0 rows returned and a 4xx/RLS
denial on the write, for every tenant table. Repeat with the roles
that exist on staging (teacher token included).

**L4 — `rls-test@school-saathi.in` deletion (Ashutosh):** §F6 above.

## 7. Files changed by Phase 7 (this PR set)

- `tests/phase7/permission-matrix.test.mjs` — 18 tests (PR1).
- `tests/phase7/cross-school.test.mjs` — 15 tests (PR2).
- `tests/phase7/rate-limit.test.mjs` — 20 tests (PR3).
- `tests/phase7/pagination-performance.test.mjs` — 18 tests (PR4).
- `tests/phase7/grant-matrix.test.mjs` — 17 tests (PR5, this PR).
- `docs/security-review-phase7.md` — this document (PR5, this PR).

No `app.js`, SQL, version, or CI change in any Phase 7 PR. All PRs
depend on the Phase 1 harness PR (commit `5876a7f`).
