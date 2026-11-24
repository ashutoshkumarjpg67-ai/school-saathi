-- SQL 56: Super Admin school stats (Super Admin dashboard, v147)
-- One admin-only RPC returning every school with its basic counts, so
-- the Super Admin dashboard lists schools with student / teacher /
-- staff numbers in a single call instead of one query per school.
--
-- Counts use only what the existing schema already provides:
--   students: ss_students rows with status Active or Inactive — the
--     same "enrolled" rule as the app's isEnrolledStudent() (Draft and
--     Cancelled are not enrolled, so they are not counted);
--   teachers: ss_teachers rows where deleted is false (SQL 41);
--   staff:    ss_staff rows where deleted is false (SQL 41).
-- No PII is returned: only the school's own row (name, city, session,
-- plan, status, is_demo, created_at) plus the three counts. No school
-- data is edited, no login-as-school, no wipe/delete power — this RPC
-- is read-only.
--
-- Fails CLOSED: the function raises unless the caller's JWT uid is in
-- ss_platform_admins (is_ss_admin, SQL 01/31), so the grant to
-- authenticated is not the boundary — a non-admin caller gets an
-- error, never rows. SECURITY DEFINER so the counts run as the
-- function owner (RLS on the counted tables would otherwise hide
-- other schools' rows from the admin's own read).
--
-- Run ONLY against the School Saathi project (bsjqeeeemwimzldrehpw).
-- Idempotent: safe to re-run.
-- The app works without this file (the schools list still loads and
-- the counts show as unavailable), so applying it is not a blocker —
-- but the counts appear only after it is applied.

create or replace function public.ss_super_admin_school_stats()
returns table (
  school_id uuid,
  name text,
  city text,
  session text,
  plan text,
  status text,
  is_demo boolean,
  created_at timestamptz,
  student_count bigint,
  teacher_count bigint,
  staff_count bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_ss_admin() then
    raise exception 'not a super admin';
  end if;
  return query
  select
    s.id,
    s.name,
    s.city,
    s.session,
    s.plan,
    s.status,
    s.is_demo,
    s.created_at,
    (select count(*) from public.ss_students st
      where st.school_id = s.id and st.status in ('Active', 'Inactive')),
    (select count(*) from public.ss_teachers t
      where t.school_id = s.id and not coalesce(t.deleted, false)),
    (select count(*) from public.ss_staff stf
      where stf.school_id = s.id and not coalesce(stf.deleted, false))
  from public.ss_schools s
  order by s.name;
end;
$function$;

revoke all on function public.ss_super_admin_school_stats() from public;
revoke all on function public.ss_super_admin_school_stats() from anon;
revoke all on function public.ss_super_admin_school_stats() from authenticated;
grant execute on function public.ss_super_admin_school_stats() to authenticated;
