-- 55_timetable.sql — weekly class timetable (timetable feature)
--
-- One row per class-slot: class + day of week (1 = Monday … 6 = Saturday,
-- Sunday is off) + period (1–8) + subject + teacher. A slot holds at
-- most one subject: the app refuses a double-booking on save and
-- migrateTimetable dedupes by cls|day|period on load, so the table
-- carries no unique constraint — a concurrent double-save degrades to
-- two rows for the same slot, which the grid reads as one (first wins),
-- the same trade-off SQL 38 made for holidays.
--
-- Sync: the table mirrors ss_holidays — owner policy (authenticated,
-- school owner or platform admin), table grant to authenticated, RLS on.
-- The app maps local rows with sbMapTimetable (local_id = the local id)
-- and pulls them with mergeById, exactly like holidays. No anon access:
-- timetable rows travel only through the school's own authenticated sync.
-- A NEW table needs its table-level GRANT in the same file (SQL 30
-- lesson) — it is below, next to the policy.
--
-- NOTE: ss_timetable has NO updated_at (created_at only, like
-- ss_holidays) — the app's outbox find (findCols105) selects 'id' only
-- for this table, and the QA mock 42703s any select naming updated_at.
-- The server wipe (ss_wipe_school, SQL 05) and the delete-account Edge
-- Function enumerate their tables and do not list ss_timetable yet —
-- the Edge Function list is updated in this change; the wipe function
-- still needs the same one-line addition (it already omits ss_holidays,
-- ss_staff and ss_classes too — pre-existing gap, flagged for the
-- owner, not fixed here).
--
-- Apply in the Supabase SQL Editor. Until this file is applied the
-- timetable upload 404s (table not found) and the pull fails its
-- read check — local entries still work offline and sync once it runs.

create table if not exists public.ss_timetable (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.ss_schools (id) on delete cascade,
  local_id text not null,
  cls text not null,
  day_of_week smallint not null check (day_of_week between 1 and 6),
  period smallint not null check (period between 1 and 8),
  subject text not null default '',
  teacher text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists ss_timetable_school_idx on public.ss_timetable (school_id);
create index if not exists ss_timetable_slot_idx on public.ss_timetable (school_id, cls, day_of_week, period);

alter table public.ss_timetable enable row level security;

drop policy if exists ss_owner_all_ss_timetable on public.ss_timetable;
create policy ss_owner_all_ss_timetable on public.ss_timetable
  for all to authenticated
  using (public.ss_school_owner(school_id) = auth.uid() or public.is_ss_admin())
  with check (public.ss_school_owner(school_id) = auth.uid() or public.is_ss_admin());

grant select, insert, update, delete on public.ss_timetable to authenticated;
