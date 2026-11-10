# Activity History Is Per-Device

**Audit item:** M-20 (second half), Phase 0 audit §4.
**Base:** v64, origin/main `cfdac970d835d1178bc00e95eccf0d704ffba73b`. **Scope:** one page, documentation only —
no code or SQL change is proposed here.

## What happens

`ss_audit_log` and `ss_activities` are **append-only and never pulled**.
The sync pull (`sbSyncPullRun`, `app.js:3142`) fetches the school row plus
exactly 11 tables (`app.js:3158`: `ss_fee_structure`, `ss_students`,
`ss_teachers`, `ss_exams`, `ss_fee_records`, `ss_attendance`, `ss_receipts`,
`ss_marks`, `ss_homework`, `ss_notices`, `ss_admission_requests`) —
audit and activities are not in that list, by design. The code says so
directly (`app.js:3147-3149`): "Audit log / activities are NOT pulled
(append-only; the push uploads new entries, the server keeps them)."

The push direction does work: new local entries are uploaded to the server
(migration/upload step `app.js:1565-1584`; dedupe-by-natural-key on push
`app.js:2843-2845`). So the server accumulates every device's entries, but
no device ever downloads them back.

## Consequence

**Activity history is per-device.** Actions performed on device A (fee
collected, student added, attendance marked) appear in device A's Activity
/ audit views and never appear on device B. Device B shows only what was
done on device B (plus whatever it had locally before linking). The same
applies to any counts or summaries derived from those two tables — two
devices logged into the same school can legitimately show different
activity histories, and that is expected behaviour, not a sync failure.

## Related: `ss_homework.done_by` has no foreign key

`ss_homework.done_by` is a `uuid[]` array of student server ids with no
foreign key (`supabase/01_schema.sql:273` — the column comment itself says
"no FK: array column"). Deleting a student therefore leaves dangling ids in
homework rows. Today this is cosmetic: the read mapper filters unknown ids
(`app.js:2124`, same filter at `:883` and `:5683`/`:5786`), so a homework
row with a deleted student's id renders without error.

Adding that FK is **not** part of this note — it is a separate, parallel
SQL change (needs Supabase-dashboard approval) and is deliberately not
duplicated here. This note only documents the current state.

## If this ever changes

Either pull audit/activities as a read-only mirror, or keep it as documented
here. Whichever is chosen, this note and the `app.js:3147-3149` comment must
be updated together — a silent change would make the two devices' histories
disagree with what this document promises.
