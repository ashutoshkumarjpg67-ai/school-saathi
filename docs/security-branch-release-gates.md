# Security branch: preparation and release gates

Status: branch-only candidate. Do not merge, deploy, change bucket visibility or run these migrations in production yet. The current release version is intentionally unchanged; reserve a new version and update all cache/version markers only after staging acceptance. The 10 fixes from the 2026-11-13 review are applied on this branch (see Included changes); the gates below still decide the rollout — no gate may be skipped.

## Included changes

- SQL 44 adds tenant-matching references for student/exam relationships and custom teacher/staff sessions. A mismatched historical row stops validation. It is never silently deleted or moved. Existing financial-row SET NULL and child-row CASCADE behavior is kept. Session rows cascade when their teacher/staff row is deleted.
- SQL 45 adds a service-role-only photo authorization broker, own-student photo grants minted through the existing PIN login, immediate revocation on PIN change, and logout revocation. It does not change either bucket's public flag. Its header now correctly requires migrations 01-44 (its foreign key needs SQL 44's unique index).
- SQL 46 keeps SQL 41's password, lockout and deleted-account checks while reducing teacher student fields. Contact guardian/phone, identity, class and academic basics stay. DOB, address, extra family details, documents and identification fields are not sent. Staff keeps its existing role-specific fields but gets opaque photo references instead of public URLs. Accountant photo access stays denied. Teacher and staff objects are now explicit column lists (teacher: id, local_id, name, subject, cls, classes; staff: id, name, role, classes) — no denylist, no email, no metadata.
- The student-photo function signs only a validated DB-owned path for 120 seconds. Owner JWTs are verified with Auth; custom sessions are checked in SQL against expiry, deletion, school and class. A principal can access their school's student photos. Staff/teacher access is limited to assigned classes. Parent/student access is limited to the student whose PIN was verified. The service secret stays in the function environment, never the app.
- Canonical old photo URLs remain identifiers in stored records. The new frontend never loads them as public image URLs. Signed display URLs live only in memory, are refreshed on render/focus, and are not stored in snapshots or sent back to the DB. Logout clears the cache and rejects late replies. Old inline JPEG/PNG data stays supported.
- The teacher-photo RPC boundary fails closed: `private-photos.js` wraps `sbTeacherStudentPhoto` so only `ss-photo:<uuid>` refs pass through — raw photo bytes (SQL 29 `photo_data_url`) and raw Storage URLs are rejected. A broker 401 (expired/revoked token) triggers the existing session-expired UX (toast + logout), reusing the `bad_token` idiom from `app.js`.
- Isolated tests use only synthetic people, schools, credentials and image bytes. No production records or photos are needed. The isolated CI pins PostgreSQL client tools to major 15 (PGDG `postgresql-client-15`) and uses trust auth — no literal password exists in the workflow or logs.

## NEVER re-apply SQL 40 after SQL 46

SQL 40's `ss_teacher_cloud_login` returns the wide pre-46 payload and has no deleted-teacher filter. Re-applying SQL 40 after SQL 46 would silently re-expand the teacher payload and re-admit deleted teachers. Apply order is 40, then 41, then 46 — and 40 must never run again after 46. SQL 46 carries the same warning in its header comment.

Post-apply verification (run after the full 40→46 chain, in staging first, then production):

```sql
-- 1. Definition check: the deployed ss_teacher_cloud_login must be the
-- SQL 46 version (explicit 6-key teacher object, deleted-teacher filter).
select pg_get_functiondef(oid) from pg_proc
 where proname = 'ss_teacher_cloud_login';
-- PASS iff the definition builds the teacher object with
-- jsonb_build_object('id', t.id, 'local_id', ...), contains
-- "not coalesce(t.deleted, false)", and contains NO 'to_jsonb(t)'.
-- 2. Behavioural check (synthetic test teacher): call the login, assert
-- the students array has none of parent_pin, aadhaar, photo_data_url,
-- dob, address, mobile2, parent_email, documents, and photo_url is only
-- 'ss-photo:' refs; set the teacher deleted=true and assert login fails;
-- restore deleted=false. The isolated suite's teacher-login block
-- (tests/security/runtime-fixtures.sql) asserts the same shape — run the
-- equivalent against the deployed function.
```

## Known limits and required staging checks

These tests are not a Supabase staging deployment. Local PostgreSQL uses small Auth/Storage schema stand-ins. HTTP tests mock Auth and Storage responses. They do not prove the hosted gateway, bucket policies, object content, actual URL format, CORS behavior or every device UI.

Before production approval:

1. Inventory the actual deployed function definitions, grants, constraints, bucket policies and object counts without publishing personal data. Do not infer listing permission from an empty anonymous list. Verify which clients are still on old builds. Historical public copies and cached copies are a separate concern. **Live-definition diff gate:** diff each deployed definition against the repo (SQL 39–46, `supabase/functions/student-photo` source, bucket policy as committed). **PASS iff zero unexplained diffs**; any diff is investigated before proceeding.
2. Create an isolated Supabase test project or equivalent local Supabase stack. Use only synthetic data, including one Storage JPEG, one PNG, one DB data URL and one missing object. Start with a private student-photos bucket there. Keep logos public if that remains the intended audience.
3. **SQL 44 pre-flight mismatch-inventory gate.** Run `scripts/check-tenant-mismatch.sql` read-only against a production dump/restore in staging — never with writes against live production. **PASS iff all 8 mismatch counts are 0.** **FAIL on any count > 0: STOP, do not run `VALIDATE CONSTRAINT`** (validation aborts the transaction). Investigate each mismatched row individually (re-point, archive, or delete only with explicit approval). Never bulk-delete student rows to make validation pass. NULL `student_id` rows in fee/receipt/admission tables are legal and are excluded by the query. The production-data run needs the user's separate go-ahead.
4. Apply current prerequisites through SQL 43, then SQL 44-46 (order matters: 44 before 45 — SQL 45's foreign key needs SQL 44's unique index). Deploy `student-photo` with gateway JWT verification disabled for this function only (`supabase functions deploy student-photo --no-verify-jwt`). This is required for custom tokens; the function itself authenticates every request. Set `PHOTO_ALLOWED_ORIGINS` to the exact intended web and native origins, comma-separated. No wildcard. Confirm HTTPS app origins and actual Capacitor origin on each platform before setting it. The environment must provide `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` server-side. **Deployed-function verification gate:** after deploy, verify in staging first, then re-verify after production deploy — deployed version/hash matches repo source; `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` present server-side; `PHOTO_ALLOWED_ORIGINS` is exactly the intended origins, no wildcard; `--no-verify-jwt` applied to this function only; smoke test — owner request succeeds, anon request denied, wrong-school request denied. **PASS only when all checks are verified against the deployed function, not the local source.** **Teacher-photo HARD gate:** verify against the live project that `ss_teacher_student_photo`, called with a real teacher token, returns **only** `{ok:true, photo_url:'ss-photo:<uuid>'}` or `{ok:true, photo_url:null}` — no `photo_data_url` key, no raw URL — for both (a) a student whose photo is a legacy data URL and (b) one whose photo is a Storage URL. If live still returns the SQL 29 shape, **do not ship the fix-5 wrapper** (teacher photos for legacy-data-URL students would silently disappear); deploy SQL 45 first, then ship. **Post-apply verification (fix 4):** after the full 40→46 chain, run the definition + behavioural checks in "NEVER re-apply SQL 40 after SQL 46" above and confirm the SQL 46 payload shape survived and deleted teachers are rejected.
5. Test owner, teacher, principal, staff, accountant, parent/student, expired/deleted/revoked sessions, wrong class/school/student, invalid JWT, offline, missing object and URL expiry. Check admission photo preview, list, profile, ID-card preview/print, receipt preview/print, student sidebar and parent dashboard. Confirm no signed URL lands in localStorage, session snapshots, exports, logs or DB writes. Old student snapshots need fresh PIN login for a photo grant. A token expires after 30 days; fresh login is then required.
   ### Role allow/deny matrix (photo broker) — every case is a required pass
   - **Owner:** own school ALLOW; other school DENY.
   - **Teacher:** assigned class ALLOW; other class DENY; other school DENY; deleted teacher DENY; expired session DENY.
   - **Principal (staff role):** school-wide ALLOW; other school DENY; deleted DENY.
   - **Staff (assigned class):** assigned class ALLOW; other class DENY.
   - **Accountant:** DENY all photos.
   - **Parent/student (PIN-verified):** own student ALLOW; sibling/unrelated student DENY; cross-school DENY; expired token DENY; PIN-change revocation → DENY; logout revocation → DENY.
   - **Anon:** DENY — cannot call the broker at all; anon list/get on the private bucket DENY.
   - **Authenticated (non-service-role):** DENY broker `EXECUTE` (cannot impersonate owner via broker).
   Required-to-pass: `tests/phase7/grant-matrix.test.mjs` (proves EXECUTE grants — static grant-history parser, not per-role behaviour) **and** `tests/security/photo-broker.test.mjs` **and** `tests/security/runtime-fixtures.sql` `test_photo` assertions (prove the behavioural matrix). All three must be green.
   ### Signed-URL expiry negative test
   Mint a signed URL (120 s TTL), then use it **after 120 s** (wait 121+ s, or use a pre-expired token) and assert access fails (403 / expired / broker returns null). Also assert no fallback to the old public URL occurs and the expired URL is never retried as a public URL. **PASS iff the post-expiry request is denied; FAIL iff it still serves bytes.**
6. Review reduced teacher fields against real role needs with synthetic accounts. Data minimization intentionally leaves removed profile fields blank; do not widen it without deciding the need.
7. Run the full existing QA harness to completion, not only the short Node tests. Confirm CI against PostgreSQL 15 (isolated CI pins the client tools to major 15; the service is `postgres:15`) and deployed migration state.
8. **Bucket-flip execute-and-verify gate.** Preconditions: items 1–7 all pass; every client confirmed on a broker-capable build (a private flip before all clients support the broker hides photos); staging private-bucket soak completed with the synthetic JPEG + PNG + DB data URL + missing object (item 2). Flip procedure: flip **only** `student-photos` to private, keep logos public; single coordinated window, never automatic on merge. Verify step: anon list/get denied; signed URL works for an allowed principal and fails for a denied role; old public URLs return 403/404; no photo renders without the broker. Abort criterion: any failure → leave the bucket public and fix in staging (mirrors the pre-flip broker rule).
9. Only after these pass, prepare a new release version and ask for a coordinated production window. SQL and frontend changes depend on each other. A private bucket flip before all clients support the broker can hide photos. Do not flip automatically on merge.

The bucket remains public until a separately approved visibility change, so this branch alone does not fix existing unauthenticated public-object access. Existing public URLs and copies remain a privacy risk until that change and a separately approved cleanup assessment. No object is deleted or relocated by this branch.

## Free-plan limits at rollout

Snapshot below is the 2026-11-13 dashboard reading — **re-measure at rollout**; the snapshot is not the gate. **PASS iff every measured metric is ≤ 80% of its free limit at rollout measurement AND the 30-day projection (current run-rate + broker-driven egress/invocations) stays < 100%. FAIL / pause rollout iff any metric is ≥ 80% or the projection breaches the limit.**

| Metric | Used / free limit (2026-11-13) | % used |
|---|---|---|
| Egress | 0.58 / 5 GB | 11.6% |
| Database size | 33 / 500 MB | 6.6% |
| Monthly active users | 42 / 50,000 | 0.08% |
| File storage | 0.00 / 1 GB | 0% |
| Log ingestion | 0.40 / 1 GB | **40% — closest to its limit** |
| Log query | 0.51 / 100 GB | 0.5% |
| Edge Function invocations | — / 500,000 / month free | project from photo-view volume |
| Realtime messages | — / 2,000,000 / month free | project from sync volume |

Concretely: projected Edge invocations must be < 400,000/month (80% of 500k); projected Realtime messages < 1,600,000/month (80% of 2M). The broker adds one Edge invocation plus signed-fetch egress per photo view, so the projection must be estimated from photo-view volume, not assumed to be zero.

## Backup and restore before production

The app's JSON export is a local-school export, not a complete server backup. Free-plan availability and quotas must be checked at the time of rollout (see "Free-plan limits at rollout" above). This plan does not assume paid backups or promise unlimited free capacity.

The production backup must be prepared privately, outside this repository:

- Database: an owner-authorized logical dump, including all public tables, custom functions, RLS/grants, session/attempt tables and the Auth data needed for restoration. Preserve definitions and a migration ledger. Managed Supabase roles/extensions may need the platform's supported restore procedure. A successful public-schema-only dump is not proof that Auth is backed up.
- Storage: bucket settings/policies, complete paginated and recursive object inventory, original bytes and metadata. Include old paths referenced by DB records. Record counts, sizes and hashes. A DB dump of `storage.objects` does not contain image bytes. Never upload the dump, object inventory, student photos, hashes of low-entropy PINs or private keys to GitHub or CI artifacts.
- Configuration: project settings, approved origins, function versions and secret names. Store actual secrets through a secure secret store, not in this document. Set restrictive filesystem permissions and encrypt backups at rest. Confirm retention and who can restore.
- Verify: independently compare table counts and fingerprints, object counts/sizes/hashes, schema/grants and Auth test logins after restoring into a separate private environment. Use synthetic fixtures for automated rehearsal; do not casually copy real children's data into test accounts. For a real-data restore, obtain the specific approval and privacy controls first. **Mandatory real-bytes restore rehearsal: restore from the real backup into a separate private environment and PASS only if, for *every* object, SHA-256 + size + count are identical to the pre-backup inventory; table counts and row fingerprints identical; schema/grants diff empty; Auth test logins succeed. FAIL on any single object-hash mismatch, count difference, or fingerprint difference — no rollout. `storage.objects` metadata alone is explicitly NOT an acceptable backup.**

`scripts/test-security-sql.mjs` rehearses a synthetic logical DB dump/restore and compares row fingerprints across its public/Auth/Storage stand-ins. It does not back up real Storage object bytes or validate a hosted Auth restore. Those checks remain release gates.

## Rollback

**Rollback rehearsal gate:** before the production window, rehearse the rollback end-to-end in staging: restore the last tested compatible private-access frontend/function pair, verify broker photo reads still work, verify no public re-exposure (anon get denied), and record elapsed time for each step. **PASS iff rehearsed with timings recorded and all rollback artifacts confirmed present** (previous frontend build, previous broker build, verified backup). **FAIL iff any step is unrehearsed or any artifact is missing.**

Before an approved rollout, record the exact deployed frontend/function/migration versions and take the verified backup above. Keep the previous frontend and broker build. Do not restore an old permissive teacher RPC or re-enable public photo access as a silent rollback.

- If broker/app checks fail before bucket flip, leave production unchanged and fix staging.
- If private-photo reads fail after an approved flip, stop the rollout. Restore the last tested compatible private-access frontend/function pair. A temporary public-bucket rollback would re-expose children's photos and requires a separate explicit decision; it is not an automatic fallback.
- SQL 44 constraints can be removed individually under a reviewed rollback if they block legitimate writes, after investigating the specific mismatch. Do not delete student rows to make validation pass.
- Keep student photo sessions and opaque refs while reverting the broker unless the replacement understands them. Do not replay an old login definition that expands sensitive payloads.
- If data was changed during a later rollout, restore only from the verified backup with a bounded reconciliation of post-backup writes. A backup is not permission to overwrite newer records.

No production backup, migration, bucket change, object cleanup or deployment is performed by these files.
