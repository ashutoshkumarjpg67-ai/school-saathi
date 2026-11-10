-- ============================================================
-- School Saathi — 24_homework_done_by_fk.sql
-- Phase B, B23-sql (audit M-20, v64 base).
--
-- THE PROBLEM (audit M-20): `ss_homework.done_by` is a `uuid[]`
-- holding student server ids, with no foreign key. A deleted
-- student leaves dangling ids in homework rows. (Cosmetic today:
-- the app's pull mapper filters unknown ids on read, so a dangling
-- id renders as "not done" rather than erroring — but the dead ids
-- pile up and nothing ever cleans them.)
--
-- WHY THERE IS NO REAL `FOREIGN KEY` HERE — READ THIS FIRST:
-- Postgres cannot declare a foreign key on the *elements* of an
-- array column. `done_by uuid[] REFERENCES ss_students(id)` is not
-- valid SQL, and no CHECK constraint can join to another table.
-- A true declarative FK needs a schema redesign — a normalized
-- link table such as `ss_homework_done(homework_id, student_id)`
-- with a real FK and ON DELETE CASCADE — which is out of scope for
-- this migration (it would also need the app's homework mapper and
-- sync code rewritten). This file does NOT fake an FK.
--
-- WHAT THIS FILE DOES INSTEAD (the closest enforceable equivalent
-- for a uuid[] column):
--   Step 1 — DATA CLEANUP: strip every id from every `done_by`
--     array that is not a student of the SAME school (deleted
--     students, and any id that never belonged to this school).
--     Idempotent: re-running finds no dangling ids and updates 0 rows.
--   Step 2 — CASCADE-EQUIVALENT TRIGGER: after a student row is
--     deleted, a trigger removes that student's id from the
--     `done_by` arrays of the same school's homework rows. This is
--     the `ON DELETE CASCADE` behaviour a real FK would give, and it
--     stops NEW dangling ids at the source — the exact bug M-20
--     describes. The trigger function is SECURITY DEFINER (same
--     pattern as `is_ss_admin()` / `ss_school_owner()` in
--     01_schema.sql) so the prune is not blocked by RLS on
--     `ss_homework` when a student is deleted through the app's
--     RLS-scoped delete.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO (honest trade-off):
--   No strict BEFORE INSERT/UPDATE validation trigger that rejects
--   a homework row whose `done_by` holds an unknown student id.
--   The app pushes homework rows through the sync outbox, and a
--   stale id — e.g. a student deleted on device B while device A
--   still holds a homework edit naming them — would make the whole
--   homework upsert fail and wedge the outbox entry. A dangling id
--   is cosmetic on read (the mapper filters it) but a rejected
--   write is a sync failure, so insert-time rejection is the wrong
--   enforcement point here. If a normalized link table is ever
--   built, THAT is where a real FK belongs.
--
-- NOTHING IS DELETED EXCEPT DEAD REFERENCES. Step 1 removes only
-- ids that point at no student of the same school; no homework row
-- and no student row is deleted, and no delete option/flow is
-- removed.
--
-- IDEMPOTENT: safe to re-run. Step 1 updates 0 rows on a clean
-- database; Step 2 uses CREATE OR REPLACE FUNCTION and
-- DROP TRIGGER IF EXISTS + CREATE TRIGGER.
--
-- UNTESTED AGAINST A LIVE DATABASE. This SQL was reviewed by reading
-- only — it has never been executed against the School Saathi
-- Supabase project (bsjqeeeemwimzldrehpw) or any other database.
-- Ashutosh must review it and apply it himself in the Supabase
-- dashboard (SQL editor), one statement at a time, and run the
-- Step 3 verify queries before calling this done.
--
-- Run ONLY against the School Saathi project (bsjqeeeemwimzldrehpw).
-- ============================================================

-- Step 1 — CLEANUP: drop dangling ids from existing `done_by`
-- arrays. Keeps only ids that exist in `ss_students` with the same
-- `school_id` as the homework row, preserving the original order.
-- (The WHERE clause means a second run touches 0 rows.)
update public.ss_homework h
set done_by = (
  select coalesce(array_agg(u.sid order by u.ord), '{}'::uuid[])
  from unnest(h.done_by) with ordinality as u(sid, ord)
  where exists (
    select 1 from public.ss_students s
    where s.id = u.sid and s.school_id = h.school_id
  )
)
where exists (
  select 1 from unnest(h.done_by) as u(sid)
  where not exists (
    select 1 from public.ss_students s
    where s.id = u.sid and s.school_id = h.school_id
  )
);

-- Step 2a — the prune function (ON DELETE CASCADE equivalent for
-- the array). SECURITY DEFINER so RLS on ss_homework cannot block
-- the cleanup when the student delete comes through the app.
create or replace function public.ss_homework_prune_deleted_student()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.ss_homework
  set done_by = array_remove(done_by, OLD.id)
  where school_id = OLD.school_id
    and OLD.id = any(done_by);
  return OLD;
end;
$function$;

-- Step 2b — fire it after every student delete.
drop trigger if exists ss_homework_prune_deleted_student on public.ss_students;
create trigger ss_homework_prune_deleted_student
  after delete on public.ss_students
  for each row execute function public.ss_homework_prune_deleted_student();

-- Step 3 (VERIFY — read-only, run after Steps 1–2 and confirm):
--   -- (a) no dangling ids remain:
--   select count(*) as rows_with_dangling_done_by
--   from public.ss_homework h
--   where exists (
--     select 1 from unnest(h.done_by) as u(sid)
--     where not exists (
--       select 1 from public.ss_students s
--       where s.id = u.sid and s.school_id = h.school_id
--     )
--   );
--   Expect: 0.
--   -- (b) the trigger exists and is enabled:
--   select tgname, tgenabled
--   from pg_trigger
--   where tgrelid = 'public.ss_students'::regclass
--     and tgname = 'ss_homework_prune_deleted_student';
--   Expect: 1 row, tgenabled = 'O' (origin / enabled).
--   -- (c) spot-check the cascade (use a real test student id, then
--   -- restore from backup if needed — do NOT test on a live student):
--   -- delete one test student, then confirm their id no longer
--   -- appears in any done_by array of that school.
