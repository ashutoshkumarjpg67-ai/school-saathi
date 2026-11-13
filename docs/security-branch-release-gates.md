# Security branch: preparation and release gates

Status: branch-only candidate. Do not merge, deploy, change bucket visibility or run these migrations in production yet. The current release version is intentionally unchanged; reserve a new version and update all cache/version markers only after staging acceptance.

## Included changes

- SQL 44 adds tenant-matching references for student/exam relationships and custom teacher/staff sessions. A mismatched historical row stops validation. It is never silently deleted or moved. Existing financial-row SET NULL and child-row CASCADE behavior is kept. Session rows cascade when their teacher/staff row is deleted.
- SQL 45 adds a service-role-only photo authorization broker, own-student photo grants minted through the existing PIN login, immediate revocation on PIN change, and logout revocation. It does not change either bucket's public flag.
- SQL 46 keeps SQL 41's password, lockout and deleted-account checks while reducing teacher student fields. Contact guardian/phone, identity, class and academic basics stay. DOB, address, extra family details, documents and identification fields are not sent. Staff keeps its existing role-specific fields but gets opaque photo references instead of public URLs. Accountant photo access stays denied.
- The student-photo function signs only a validated DB-owned path for 120 seconds. Owner JWTs are verified with Auth; custom sessions are checked in SQL against expiry, deletion, school and class. A principal can access their school's student photos. Staff/teacher access is limited to assigned classes. Parent/student access is limited to the student whose PIN was verified. The service secret stays in the function environment, never the app.
- Canonical old photo URLs remain identifiers in stored records. The new frontend never loads them as public image URLs. Signed display URLs live only in memory, are refreshed on render/focus, and are not stored in snapshots or sent back to the DB. Logout clears the cache and rejects late replies. Old inline JPEG/PNG data stays supported.
- Isolated tests use only synthetic people, schools, credentials and image bytes. No production records or photos are needed.

## Known limits and required staging checks

These tests are not a Supabase staging deployment. Local PostgreSQL uses small Auth/Storage schema stand-ins. HTTP tests mock Auth and Storage responses. They do not prove the hosted gateway, bucket policies, object content, actual URL format, CORS behavior or every device UI.

Before production approval:

1. Inventory the actual deployed function definitions, grants, constraints, bucket policies and object counts without publishing personal data. Do not infer listing permission from an empty anonymous list. Verify which clients are still on old builds. Historical public copies and cached copies are a separate concern.
2. Create an isolated Supabase test project or equivalent local Supabase stack. Use only synthetic data, including one Storage JPEG, one PNG, one DB data URL and one missing object. Start with a private student-photos bucket there. Keep logos public if that remains the intended audience.
3. Apply current prerequisites through SQL 43, then SQL 44-46. Deploy `student-photo` with gateway JWT verification disabled for this function only (`supabase functions deploy student-photo --no-verify-jwt`). This is required for custom tokens; the function itself authenticates every request. Set `PHOTO_ALLOWED_ORIGINS` to the exact intended web and native origins, comma-separated. No wildcard. Confirm HTTPS app origins and actual Capacitor origin on each platform before setting it. The environment must provide `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` server-side.
4. Test owner, teacher, principal, staff, accountant, parent/student, expired/deleted/revoked sessions, wrong class/school/student, invalid JWT, offline, missing object and URL expiry. Check admission photo preview, list, profile, ID-card preview/print, receipt preview/print, student sidebar and parent dashboard. Confirm no signed URL lands in localStorage, session snapshots, exports, logs or DB writes. Old student snapshots need fresh PIN login for a photo grant. A token expires after 30 days; fresh login is then required.
5. Review reduced teacher fields against real role needs with synthetic accounts. Data minimization intentionally leaves removed profile fields blank; do not widen it without deciding the need.
6. Run the full existing QA harness to completion, not only the short Node tests. Confirm CI against the intended PostgreSQL version and deployed migration state.
7. Only after these pass, prepare a new release version and ask for a coordinated production window. SQL and frontend changes depend on each other. A private bucket flip before all clients support the broker can hide photos. Do not flip automatically on merge.

The bucket remains public until a separately approved visibility change, so this branch alone does not fix existing unauthenticated public-object access. Existing public URLs and copies remain a privacy risk until that change and a separately approved cleanup assessment. No object is deleted or relocated by this branch.

## Backup and restore before production

The app's JSON export is a local-school export, not a complete server backup. Free-plan availability and quotas must be checked at the time of rollout. This plan does not assume paid backups or promise unlimited free capacity.

The production backup must be prepared privately, outside this repository:

- Database: an owner-authorized logical dump, including all public tables, custom functions, RLS/grants, session/attempt tables and the Auth data needed for restoration. Preserve definitions and a migration ledger. Managed Supabase roles/extensions may need the platform's supported restore procedure. A successful public-schema-only dump is not proof that Auth is backed up.
- Storage: bucket settings/policies, complete paginated and recursive object inventory, original bytes and metadata. Include old paths referenced by DB records. Record counts, sizes and hashes. A DB dump of `storage.objects` does not contain image bytes. Never upload the dump, object inventory, student photos, hashes of low-entropy PINs or private keys to GitHub or CI artifacts.
- Configuration: project settings, approved origins, function versions and secret names. Store actual secrets through a secure secret store, not in this document. Set restrictive filesystem permissions and encrypt backups at rest. Confirm retention and who can restore.
- Verify: independently compare table counts and fingerprints, object counts/sizes/hashes, schema/grants and Auth test logins after restoring into a separate private environment. Use synthetic fixtures for automated rehearsal; do not casually copy real children's data into test accounts. For a real-data restore, obtain the specific approval and privacy controls first.

`scripts/test-security-sql.mjs` rehearses a synthetic logical DB dump/restore and compares row fingerprints across its public/Auth/Storage stand-ins. It does not back up real Storage object bytes or validate a hosted Auth restore. Those checks remain release gates.

## Rollback

Before an approved rollout, record the exact deployed frontend/function/migration versions and take the verified backup above. Keep the previous frontend and broker build. Do not restore an old permissive teacher RPC or re-enable public photo access as a silent rollback.

- If broker/app checks fail before bucket flip, leave production unchanged and fix staging.
- If private-photo reads fail after an approved flip, stop the rollout. Restore the last tested compatible private-access frontend/function pair. A temporary public-bucket rollback would re-expose children's photos and requires a separate explicit decision; it is not an automatic fallback.
- SQL 44 constraints can be removed individually under a reviewed rollback if they block legitimate writes, after investigating the specific mismatch. Do not delete student rows to make validation pass.
- Keep student photo sessions and opaque refs while reverting the broker unless the replacement understands them. Do not replay an old login definition that expands sensitive payloads.
- If data was changed during a later rollout, restore only from the verified backup with a bounded reconciliation of post-backup writes. A backup is not permission to overwrite newer records.

No production backup, migration, bucket change, object cleanup or deployment is performed by these files.
