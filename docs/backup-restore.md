# Backup & restore — procedure and proof (Phase 1)

School Saathi has full backup/restore built into the app (Settings):
**Backup** exports the whole school database as one JSON file
(`school-saathi-backup-<date>.json`); **Restore** imports such a file
back. This document is the procedure, and the proof that the round-trip
works — proven on **fixture / staging data only, never on live data or
a real school**.

## How it works in the app

- **Export** — `buildFullBackup()` (app.js) writes
  `{ app: 'school-saathi', kind: 'full-backup', version: APP_VERSION,
  exportedAt, school, db }`. The file downloads from the browser.
- **Restore** — `restoreFullBackup()` validates first
  (`validateFullBackup()` rejects anything that is not a
  `school-saathi` `full-backup` with a `v: 2` database and all expected
  tables), then replaces the **local** database wholesale and re-runs
  the same migrations a normal load runs, so a backup from an older
  build still lands in the current shape. A restore never wipes the
  server — there is no server restore.
- **Safety copy** — restoring from a file first exports a safety backup
  of the *current* data (`requestRestore()`), so a bad restore can be
  undone by restoring the safety copy.
- **Reset** — "Reset All Data" (Settings) wipes the local school
  database on that device only. It does **not** touch the server, and
  it does **not** clear the browser's site data for the shared
  `github.io` origin (never do that — the Gym app's localStorage-only
  data lives on the same origin).

## Procedure (staging / TEST school only)

1. Open the staging preview link (see `docs/staging.md`) with the TEST
   school / seeded fixtures loaded.
2. Note the counts: students, teachers, fee records, exams, marks,
   homework, notices (Dashboard / relevant lists).
3. Settings → **Backup** → save the JSON file. Check the file opens
   and says `"kind": "full-backup"`.
4. Settings → **Reset All Data** → confirm. The school now shows
   0 students, 0 fee records — the wipe is visible.
5. Settings → **Restore** → choose the file from step 3 → confirm.
6. Verify every count from step 2 is back exactly. Open one student,
   one fee receipt and one exam to confirm the content (not just the
   counts) came back.
7. Record the result: date, staging link, counts before / after wipe /
   after restore.

## Automated proof (harness, fixture data)

`npm test` runs the round-trip on the seeded fixtures in
`tests/smoke.test.mjs` ("backup export -> wipe -> restore"):

- `seedDB()` → 40 students, 12 teachers, 70 fee records, 5 exams,
  8 marks, 4 homework, 3 notices; fee sums ₹8,45,000 collected /
  ₹1,20,000 pending.
- `buildFullBackup()` → `kind: full-backup`, `version: APP_VERSION`,
  school `St. Xavier School`.
- Wipe with `emptyDb()` → 0 students.
- `restoreFullBackup()` → `{ ok: true }` with counts
  40 / 12 / 70 / 5 / 8 / 4 / 3 / 0 (receipts), and a save + reload
  still shows 40 students.
- Bad files (`null`, `{}`, wrong app, wrong db version) are rejected
  with `tBackupBadFile` and the live database is untouched.

Evidence (12 Nov 2026, v108, local run): `npm test` — **18/18 green**,
including both backup tests. The same tests run in CI on every push
and PR (`.github/workflows/ci.yml`).

## What is NOT proven here

- The **browser click-through** (download dialog, file picker) on the
  staging preview — that needs a human pass in a real browser following
  the procedure above. The export/validate/restore *logic* is proven by
  the harness; the file-picker UI around it is not.
- Restore of a backup from a much older build — migrations cover the
  known versions; an untested old file should be restored on staging
  first, never on live.

## Rules

- Backup before **every** risky step (restore, reset, version jump).
- Never restore a file you did not export yourself from this app.
- Never test reset/restore on the live site or a real school.
- Keep at least one backup file outside the phone (e.g. emailed to
  yourself or saved on a laptop) — a backup that lives only on the
  device you just reset is no backup.
