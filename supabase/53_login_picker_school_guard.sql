-- 53_login_picker_school_guard.sql — the LOGIN-picker school directory
-- lists only listable schools (residual of the blank-name audit item).
--
-- Live finding (2026-11-20): ss_public_schools() (SQL 17, feeding the
-- student/parent/teacher/staff LOGIN pickers) returned every ss_schools
-- row: a blank-name school (ea78639c-226f-479e-809b-d966e76e4416), two
-- leftover TEST schools and is_demo fixtures. The Apply form's
-- ss_list_public_schools() was tightened in 46_public_school_list_guard
-- (v135); this applies the SAME listable rule to the login directory:
--   is_demo = false AND a non-blank name.
--
-- No data is deleted or hidden from owners: the rows stay in ss_schools,
-- every role keeps full access to its own school, and an unnamed school
-- simply does not appear in a public picker until it has a name. A
-- legitimate school (named, is_demo = false) is untouched.
--
-- Run ONLY against the School Saathi project (bsjqeeeemwimzldrehpw).
-- Idempotent: safe to re-run.
-- Emergency rollback (restores the SQL 17 unfiltered directory):
--   create or replace function public.ss_public_schools()
--   returns table (id uuid, name text, city text)
--   language sql stable security definer set search_path to 'public'
--   as $function$ select s.id, s.name, s.city from public.ss_schools s order by s.name; $function$;

create or replace function public.ss_public_schools()
returns table (id uuid, name text, city text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select s.id, s.name, s.city from public.ss_schools s
  where s.is_demo = false and length(btrim(s.name)) > 0 order by s.name;
$function$;

revoke all on function public.ss_public_schools() from public;
revoke all on function public.ss_public_schools() from anon;
revoke all on function public.ss_public_schools() from authenticated;
grant execute on function public.ss_public_schools() to anon, authenticated;
