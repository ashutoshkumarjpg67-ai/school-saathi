-- School Saathi backend — 20_exam_deleted_flag.sql
-- Exam delete sync (v67): a soft-deleted exam now travels across
-- devices. Before this file, ss_exams had no deleted column, so a
-- delete made on one device stayed local — the server row stayed
-- active and a second device re-downloaded the exam as if nothing
-- had happened (the v58 pull keep only held the flag on the device
-- that deleted it). With this column, the flag uploads on PATCH
-- (sbMapExam carries it), the pull reads it, and a restore from
-- another device propagates too.
-- Run ONLY against the School Saathi project (bsjqeeeemwimzldrehpw).
-- Idempotent: safe to re-run.
--
-- Design notes:
-- * One boolean column, default false — every existing exam stays
--   active. No data migration, no backfill.
-- * No new function, no new policy, no grant change: the column
--   rides the existing ss_exams RLS policies (owner-only) and the
--   existing anon/authenticated table grants, exactly like the
--   other exam columns. The app reads/writes it through PostgREST
--   like any other field.
-- * The local app keeps the v58 pending-upsert keep in the pull:
--   a delete/restore that has not flushed yet still holds its local
--   flag through a pull. The old B6 unconditional keep (which forced
--   the local flag back on every cycle and would have blocked a
--   restore from another device) is removed in the v67 app build.

alter table public.ss_exams
  add column if not exists deleted boolean not null default false;

-- Verify (run separately — the SQL endpoint returns only the last
-- statement's result):
--   select column_name, data_type, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'ss_exams'
--      and column_name = 'deleted';
--   select count(*) as total, count(*) filter (where deleted) as deleted
--     from public.ss_exams;
