-- 46_public_school_list_guard.sql — v135 (audit fix): the public Apply
-- form must never list or accept an application for a nameless school.
--
-- Live finding: a school row with a BLANK name (id
-- ea78639c-226f-479e-809b-d966e76e4416) is returned by
-- ss_list_public_schools() (it is_demo = false) and sorts FIRST in the
-- picker (order by name), so an applicant who does not touch the picker
-- applies to it by default. The anon insert policy accepted it too
-- (ss_is_real_school only checks is_demo).
--
-- This file:
--   1. adds ss_is_listable_school(uuid): a real school with a non-blank
--      name, SECURITY DEFINER like ss_is_real_school (anon has no SELECT
--      on ss_schools, so the policy check must go through a definer);
--   2. tightens ss_list_public_schools() to exclude blank names;
--   3. re-creates the anon insert policy on ss_admission_requests to
--      require a LISTABLE school.
--
-- No data is deleted or hidden anywhere else: the row stays in
-- ss_schools, its owner keeps full access, and it simply cannot receive
-- public applications while it has no name.
--
-- Run ONLY against the School Saathi project (bsjqeeeemwimzldrehpw).
-- Idempotent: safe to re-run.

create or replace function public.ss_is_listable_school(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.ss_schools s
    where s.id = p_school_id and s.is_demo = false and length(btrim(s.name)) > 0
  );
$function$;

revoke all on function public.ss_is_listable_school(uuid) from public;
revoke all on function public.ss_is_listable_school(uuid) from anon;
revoke all on function public.ss_is_listable_school(uuid) from authenticated;
grant execute on function public.ss_is_listable_school(uuid) to anon, authenticated;

create or replace function public.ss_list_public_schools()
returns table (id uuid, name text, city text)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.name, s.city from public.ss_schools s
  where s.is_demo = false and length(btrim(s.name)) > 0 order by s.name;
$$;

revoke all on function public.ss_list_public_schools() from public;
revoke all on function public.ss_list_public_schools() from anon;
revoke all on function public.ss_list_public_schools() from authenticated;
grant execute on function public.ss_list_public_schools() to anon, authenticated;

drop policy if exists ss_admreq_anon_insert on public.ss_admission_requests;
create policy ss_admreq_anon_insert on public.ss_admission_requests
  for insert to anon
  with check (
    status = 'Pending'
    and public.ss_is_listable_school(school_id)
  );
