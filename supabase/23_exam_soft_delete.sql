-- ============================================================
-- School Saathi — 23_exam_soft_delete.sql
-- Phase B, B15-sql (audit M-14, v62 base).
--
-- THE PROBLEM (audit M-14): deleting an exam is local-only.
-- `sbQueueExamChange58` (app.js) queues the delete on this device,
-- but `ss_exams` has no `deleted` column, so the delete never reaches
-- the server. A second device pulls the exam back as active, and the
-- exam cannot be restored from the server either.
--
-- THE FIX: soft-delete columns on `ss_exams`.
--   * `deleted` boolean NOT NULL DEFAULT false — the flag the sync
--     mapper reads/writes; a deleted exam stays in the table so its
--     marks (`ss_marks.exam_id` REFERENCES ss_exams ON DELETE
--     CASCADE) are preserved and the delete can be undone.
--   * `deleted_at` timestamptz — when the delete happened (NULL while
--     active); lets the UI show "deleted on …" and lets a future
--     cleanup tell a fresh delete from an old one.
--
-- NOTHING IS DELETED BY THIS FILE. It only adds the two columns; no
-- row is marked deleted, no exam/notice/homework delete flow is
-- removed, and no app behaviour changes until the app code lands.
--
-- MERGE ORDER (two PRs, SQL first):
--   1. This PR (SQL only) — apply the file in the Supabase dashboard
--      AFTER merge, then
--   2. the parallel Phase B app.js PR (branch fix/phaseB-data) adds
--      `deleted`/`deleted_at` to the exam pull/push mappers and
--      filters deleted exams out of the exam list (with restore).
--   Merging the app PR first is harmless (the mapper would read a
--   column that does not exist yet and treat every exam as active),
--   but SQL-first is the intended order.
--
-- IDEMPOTENT: safe to re-run. `ADD COLUMN IF NOT EXISTS` skips
-- columns that are already there, and the index is created
-- `IF NOT EXISTS`. Re-running changes nothing.
--
-- UNTESTED AGAINST A LIVE DATABASE. This SQL was reviewed by reading
-- only — it has never been executed against the School Saathi
-- Supabase project (bsjqeeeemwimzldrehpw) or any other database.
-- Ashutosh must review it and apply it himself in the Supabase
-- dashboard (SQL editor), one statement at a time, and confirm the
-- columns exist before the app PR is merged.
--
-- Run ONLY against the School Saathi project (bsjqeeeemwimzldrehpw).
-- ============================================================

-- Step 1 — the soft-delete flag. Existing rows get `false`, so every
-- exam that exists today stays active exactly as before.
alter table public.ss_exams
  add column if not exists deleted boolean not null default false;

-- Step 2 — when the exam was soft-deleted (NULL = not deleted).
alter table public.ss_exams
  add column if not exists deleted_at timestamptz;

-- Step 3 — index for the exam-list filter (`where school_id = ? and
-- deleted = false`), so listing active exams does not scan soft-
-- deleted rows as the school grows.
create index if not exists ss_exams_school_deleted_idx
  on public.ss_exams (school_id, deleted);

-- Step 4 (VERIFY — read-only, run after Steps 1–3 and confirm):
--   select column_name, data_type, column_default, is_nullable
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'ss_exams'
--     and column_name in ('deleted', 'deleted_at')
--   order by column_name;
--   Expect exactly 2 rows:
--     deleted    | boolean      | false | NO
--     deleted_at | timestamp with time zone | (null) | YES
--   And: select count(*) from public.ss_exams where deleted = true;
--   Expect 0 — this file marks nothing as deleted.
