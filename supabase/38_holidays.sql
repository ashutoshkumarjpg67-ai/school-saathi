-- 38_holidays.sql — school holidays (v100)
--
-- A holiday is a whole class-day with no teaching: the attendance
-- register shows it as a Holiday (no marking), and the day is excluded
-- from every attendance % (student tile, school-wide today donut).
-- One row per class per date; the app dedupes by date|cls locally and
-- the sync upload skips rows the server already has (fetch-filter, the
-- same INSERT-only pattern as ss_notices — no unique constraint, so a
-- concurrent double-mark degrades to two rows for the same date|cls,
-- which the UI reads as one holiday).
--
-- Sync: the table mirrors ss_notices — owner policy (authenticated,
-- school owner or platform admin), table grant to authenticated, RLS on.
-- The app maps local rows with sbMapHoliday (local_id = the local id)
-- and pulls them with mergeById, exactly like notices. No anon access:
-- holidays travel only through the school's own authenticated sync.
-- A NEW table needs its table-level GRANT in the same file (SQL 30
-- lesson) — it is below, next to the policy.

create table if not exists public.ss_holidays (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.ss_schools (id) on delete cascade,
  local_id text not null,
  holiday_date date not null,
  cls text not null,
  reason text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists ss_holidays_school_idx on public.ss_holidays (school_id);
create index if not exists ss_holidays_date_idx on public.ss_holidays (school_id, holiday_date);

alter table public.ss_holidays enable row level security;

drop policy if exists ss_owner_all_ss_holidays on public.ss_holidays;
create policy ss_owner_all_ss_holidays on public.ss_holidays
  for all to authenticated
  using (public.ss_school_owner(school_id) = auth.uid() or public.is_ss_admin())
  with check (public.ss_school_owner(school_id) = auth.uid() or public.is_ss_admin());

grant select, insert, update, delete on public.ss_holidays to authenticated;
