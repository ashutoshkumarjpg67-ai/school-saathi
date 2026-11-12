# Phase 3 verification report — secure multi-tenant database

Read-only audit of the Enterprise Roadmap Phase 3 items, done against
`origin/main` v108 (`1734f84`, 12 Nov 2026). No SQL was applied live, no
live data was touched, `ss_wipe_school` was never called. Where the
roadmap's claims differ from the repo, the repo wins and the difference
is called out below.

Companion PRs: SQL 39 (revoke PUBLIC function grants) and the flush
batch pagination fix + `tests/phase3/` regression tests.

## (a) `ss_wipe_school` — verdict: SAFE to keep, with 4 findings

Source: `supabase/05_wipe_school.sql`. App caller: `sbWipeServerSchool`
(`app.js`, `rpc/ss_wipe_school`), behind the same double gate as the
device reset (password + exact school name, `resetAllServerWipe`).

What is correct:

- Ownership check is sound. The function is `SECURITY DEFINER` and
  refuses unless `ss_school_owner(p_school_id) = auth.uid()` or the
  caller `is_ss_admin()`. An anonymous caller has `auth.uid() = NULL`,
  which is distinct from any owner, so anon cannot wipe anything.
- Coverage of tenant data is complete via explicit deletes + FK
  cascade. The function deletes marks, attendance, fee records,
  receipts, audit log, activities, homework, notices, exams, teachers,
  admission requests, support requests, fee structure, students, then
  the school row. `ss_staff` and `ss_holidays` are not listed, but both
  carry `school_id … references ss_schools (id) on delete cascade`
  (`30_staff_roles.sql`, `38_holidays.sql`), so deleting the school row
  removes them. Every `01_schema.sql` tenant table has the same cascade.

Findings (no code changed here — each needs a decision, see below):

1. **Orphaned sessions + login attempts survive a wipe.**
   `ss_teacher_sessions`, `ss_staff_sessions` and all five
   login-attempt tables (`ss_student_login_attempts`,
   `ss_teacher_login_attempts`, `ss_staff_login_attempts`,
   `ss_parent_pin_attempts`, `ss_school_login_attempts`) have no FK to
   `ss_schools`, so the wipe leaves their rows behind. Verified
   **inert**: teacher write RPCs re-check the teacher row exists
   (`18_teacher_cloud_login.sql`, `ss_teacher_mark_attendance` checks
   `ss_teachers` + classes + the student row), and
   `ss_staff_token_owner` JOINs `ss_staff` (`30_staff_roles.sql`), so a
   wiped school's staff token resolves to nothing. An orphaned token
   cannot write after a wipe — but the rows linger as garbage, and a
   wiped school's lockout state (attempt rows) would still apply if the
   same email ever re-registers. The `delete-account` Edge Function
   already deletes the SQL 17/18 attempt + session rows, but it predates
   SQL 30/36, so it does not cover `ss_staff_sessions`,
   `ss_staff_login_attempts` or `ss_parent_pin_attempts` either.
   Proposed fix (needs approval): a new SQL file that adds deletes of
   the session + attempt rows inside `ss_wipe_school`, and the same
   three tables in the Edge Function's delete list.
2. **The wipe erases its own audit trail.** It deletes the school's
   `ss_audit_log` rows, so afterwards no record exists of who wiped the
   school or when. Proposed fix (needs approval): keep one
   platform-level audit row (school_id NULL, details naming the school)
   written after the deletes.
3. **PUBLIC grant (default, never revoked).** `05_wipe_school.sql`
   grants EXECUTE to `authenticated` only, but `CREATE FUNCTION`
   grants EXECUTE to PUBLIC by default and nothing revokes it — so
   anon can *call* the function (the body still refuses, see above).
   Hardened by SQL 39 (companion PR), which revokes PUBLIC on this and
   the other affected functions. The roadmap's note "(PUBLIC grant;
   body verified in Phase 0)" is accurate about the grant existing.
4. **`ss_support_requests` survives with `school_id` set NULL**
   (`01_schema.sql`: `on delete set null`). A wiped school's support
   tickets stay visible to platform admins. That looks like intended
   retention, recorded here, not a bug.

## (b) Missing indexes — verdict: NONE missing on any hot path

The roadmap names "login-attempt tables and `ss_teacher_sessions`,
which had only a PK index". Verified table by table: the PK **is** the
lookup key for every attempt table, so no extra index is needed:

| Table | Lookup used by the RPCs | Index covering it |
|---|---|---|
| `ss_student_login_attempts` | `(school_id, admission_no)` | PK `(school_id, admission_no)` |
| `ss_teacher_login_attempts` | `(school_id, email)` | PK `(school_id, email)` |
| `ss_staff_login_attempts` | `(school_id, email)` | PK `(school_id, email)` |
| `ss_parent_pin_attempts` | `(school_id, admission_no)` | PK `(school_id, admission_no)` |
| `ss_school_login_attempts` | `email` | PK `(email)` |
| `ss_teacher_sessions` | `token` | PK `(token)` |
| `ss_staff_sessions` | `token` | PK `(token)` |

No query in the repo filters a session table by teacher/staff/school,
and no expiry sweep exists (expiry is checked inline in the token-owner
functions), so a secondary session index would be dead weight — none
added. Other tables checked: `ss_marks` is covered by its unique index
`unique (school_id, exam_id, student_id)` (school_id leading) plus
`ss_marks_exam_idx`; `ss_students` has `unique (school_id,
admission_no)`; `ss_teachers` has `ss_teachers_school_email_key`;
`ss_staff` has `ss_staff_school_idx` + `ss_staff_school_email_key`;
`ss_holidays` has school + date indexes; all other tenant tables have a
`(school_id, …)` index from `01_schema.sql`. **No new index file was
needed; adding one would duplicate an existing key.** If a future
feature lists sessions per teacher/school, add the index then.

## (c) Pagination — see companion PR

The v64 paged fetch (`sbFetchAllPages`, keyset cursor, `app.js`) already
covers the pull, download, verify and upload-dedupe paths. One unpaged
bulk fetch remained — the per-flush batch fetch — fixed in the companion
PR, with regression tests under `tests/phase3/`.

## (d) Storage migration — verdict: COMPLETE in code

- Server side: SQL 28 created the public `school-logos` /
  `student-photos` buckets (1 MB cap), the `logo_url` / `photo_url`
  columns, and owner-only write policies (first folder segment must be
  a school the caller owns). SQL 29 made `ss_teacher_student_photo`
  return both `photo_data_url` and `photo_url`.
- App side (v78/v80): `sbUploadImage` POSTs to
  `/storage/v1/object/<bucket>/<path>` with `x-upsert: true`
  (`app.js`); `sbUploadStudentPhoto` / `sbUploadSchoolLogo` run
  fire-and-forget at save time (admission save `app.js` 8478/8496,
  settings save 11078). On success the Storage URL is stored on the
  local row and the next sync sends the URL and nulls the Data URL;
  any failure (offline, no session, rejected upload) keeps the Data URL
  path. Display prefers the URL and falls back to the Data URL
  (`app.js` 2143, 2204, 2448).
- Old Data URL columns are kept as fallback and never dropped.
- Live state could not be re-verified from the repo: SQL 28 records
  the server held ZERO logos/photos on 11 Nov 2026. Whether any
  Storage photo has been uploaded since needs a BAT live check on the
  TEST school — no migration is invented here.

## (e) Function-grant re-verification — matrix (effective grants)

Replayed every GRANT/REVOKE in `supabase/*.sql` in file order.
`postgres` (owner) always holds EXECUTE; the table below shows the
roles that can call each function.

| Function | PUBLIC | anon | authenticated | Verdict |
|---|---|---|---|---|
| `is_ss_admin()` | YES (default, never revoked) | – | YES (02) | Fix in SQL 39 |
| `ss_school_owner(uuid)` | YES (default, never revoked) | – | YES (02) | Fix in SQL 39 |
| `ss_is_real_school(uuid)` | YES (default, never revoked) | YES (02) | YES (02) | Fix in SQL 39 |
| `ss_next_adm_no(uuid)` | YES (default, never revoked) | – | YES (02) | Fix in SQL 39 |
| `ss_next_receipt_no(uuid)` | YES (default, never revoked) | – | YES (02) | Fix in SQL 39 |
| `ss_list_public_schools()` | YES (default, never revoked) | YES (02) | YES (02) | Fix in SQL 39 |
| `ss_wipe_school(uuid)` | YES (default, never revoked) | – | YES (05) | Fix in SQL 39 |
| `ss_parent_lookup(text,text,uuid)` | revoked (22) | revoked (15/16/22) | revoked (22) | postgres-only — correct |
| `ss_school_login_ok(text)` | revoked (21) | revoked (21) | YES (21) | correct |
| `ss_school_login_precheck/failed(text)` | revoked (19) | YES (19) | YES (19) | correct |
| `ss_student_cloud_login(...)` | revoked (17/23/33) | YES | YES | correct |
| `ss_public_schools()` | revoked (17) | YES | YES | correct |
| `ss_teacher_cloud_login(...)` | revoked (18/23/24/33) | YES | YES | correct |
| `ss_teacher_mark_attendance / _post_homework / _set_marks` | revoked (18) | YES | YES | correct |
| `ss_teacher_revoke_session(uuid)` | revoked (18) | YES | YES | correct |
| `ss_teacher_token_owner(uuid)` | revoked (18) | revoked | revoked | internal-only — correct |
| `ss_teacher_student_photo(uuid,uuid)` | revoked (24/29) | YES | YES | correct |
| `ss_staff_cloud_login(...)` | revoked (30/33) | YES | YES | correct |
| `ss_staff_revoke_session(uuid)` | revoked (30) | YES | YES | correct |
| `ss_staff_token_owner(uuid)` | revoked (30) | revoked | revoked | internal-only — correct |
| `ss_staff_mark_attendance / _post_homework / _set_marks` | revoked (35) | YES | YES | correct |
| `ss_is_super_admin()` | revoked (31) | revoked | YES (31) | correct |
| `ss_log_audit(...)` | revoked (34) | YES | YES | correct |
| `ss_parent_pin_precheck/failed/ok(...)` | revoked (36) | YES | YES | correct |
| `ss_parent_pin_reset_by_dob(...)` | revoked (36→37) | YES | YES | correct |
| `ss_touch_updated_at()` | YES (default) | – | – | trigger fn only; no RPC exposure, left alone |

Findings:

- **Seven functions still carry the PostgreSQL default PUBLIC
  EXECUTE** (all from `01_schema.sql` / `05_wipe_school.sql`, which
  grant to `authenticated`/`anon` but never revoke PUBLIC). The bodies
  are ownership-checked (`ss_next_adm_no` / `ss_next_receipt_no` refuse
  non-owners; `ss_wipe_school` refuses non-owners; `is_ss_admin` /
  `ss_school_owner` return only a boolean / uuid), so this is not a
  live hole — but `ss_school_owner` lets an anonymous caller resolve
  any school UUID to its owner UUID, and the grants contradict the
  least-privilege pattern every later file follows. Fixed by SQL 39
  (revoke PUBLIC + re-assert the explicit grants; `REVOKE … FROM
  PUBLIC` never removes an explicit grant to `anon`/`authenticated`,
  so the anon Apply-form policy check and the owner flows keep
  working). The `delete-account` Edge Function calls none of these
  functions (it uses the service_role client on tables directly), so
  the revoke cannot break it.
- **Roadmap correction:** the roadmap says `ss_parent_lookup` is
  "authenticated and postgres only". The repo end state (SQL 22) is
  **postgres-only** — `authenticated` was revoked too (SQL 16 step 3
  decision, executed in SQL 22). The 2-arg overload was dropped by
  SQL 07. Nothing in `app.js` calls it (verified 11 Nov).
- **Revokes in SQL 15/16/22 still hold** as written: no later file
  re-grants `ss_parent_lookup` (SQL 23/33 re-grant only the cloud
  logins). `CREATE OR REPLACE` in SQL 23/24/29/33 preserves existing
  grants, so the revoke-first files are not undone by redefinition.
- **Attempt/session tables are RPC-only, as designed:** RLS enabled,
  zero policies, zero table grants (the `02_rls.sql` grant loop covers
  only the 17 named tenant tables; `ss_staff`/`ss_holidays` got their
  own grants in SQL 32/38). Direct access is denied; only the
  SECURITY DEFINER RPCs touch them.
- **`ss_platform_admins` table grant is safe:** `02_rls.sql` grants
  table access to `authenticated`, but the only policy is
  `ss_admins_admin_all` (`is_ss_admin()`), so a non-admin cannot read
  or insert rows. First admin row must be bootstrapped via SQL
  (chicken-and-egg, noted in the file).

## (f) Pull-never-deletes-unuploaded-local-row — see companion PR

Rule verified in code (`mergeById`, `app.js`): a local row absent from
the server is kept unless it is in the snapshot (deleted elsewhere),
tombstoned, a pending delete, or a demo-seed row. Regression tests
under `tests/phase3/` exercise the shipped `mergeById` function
directly (offline row survives a pull; snapshot row deleted elsewhere
drops; pending delete wins).

## Exit-gate status (roadmap Phase 3 acceptance)

| Criterion | Status |
|---|---|
| Two-school cross-access test (A cannot read/insert/update B rows) | Not run here — needs live DB access (BAT). In-repo evidence: every tenant table has `school_id` + owner/admin RLS policy; attempt/session tables are RPC-only; grant matrix above. |
| Hybrid sync test (offline row survives pull, then syncs once, server-minted number, no duplicate) | Code-verified + node regression tests (`tests/phase3/`). Live run on TEST school still needed (BAT). |
| Storage photos load; old Data URL data still displays | Code-verified (v78/v80 + SQL 28/29). Live upload check still needed (BAT). |
| No existing row lost or changed owner | No data change in these PRs (SQL files only, none applied; app.js change is a read-path paging fix). |

## Decisions needed from the user / BAT

1. Wipe follow-up: add session + attempt-row deletes inside
   `ss_wipe_school` (new SQL file) and the three newer tables
   (`ss_staff_sessions`, `ss_staff_login_attempts`,
   `ss_parent_pin_attempts`) to the `delete-account` Edge Function?
2. Wipe audit: keep a platform-level audit row (school_id NULL) so a
   wipe stays auditable after the school's log is deleted?
3. Live checks (BAT): two-school cross-access test, hybrid sync test on
   the TEST school, and a Storage photo upload/load check — none of
   these can be done from the repo alone.
