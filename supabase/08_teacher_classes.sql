-- School Saathi v35 — teacher class assignments.
--
-- The teacher record gains a classes[] column (the class-sections that
-- teacher teaches). The app reads it in the pull mapper and writes it in
-- sbMapTeacher, so a teacher's assignment survives a sync pull instead
-- of being rebuilt from the single cls column (the merge replaces a
-- local row with the mapped server row — a field missing from the
-- mapping is silently dropped on the next pull).
--
-- APPLY BEFORE the v35 push: until this column exists, the teacher
-- upload POSTs an unknown column and the whole ss_teachers upload 400s.
-- Idempotent: the column add is guarded by IF NOT EXISTS.
--
-- RLS: unchanged — ss_teachers keeps its existing owner-only policies
-- (02_rls.sql); a new column is covered by the same row policies.

alter table public.ss_teachers
  add column if not exists classes text[] not null default '{}';
