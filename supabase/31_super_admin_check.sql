-- SQL 31: Super Admin check for the app (Phase 4, v85)
-- The platform-admin infrastructure already exists (SQL 01/02):
-- ss_platform_admins holds the Super Admin Auth uids, and
-- is_ss_admin() returns true when auth.uid() is one of them. The app
-- needs to ask "am I a Super Admin?" after a school-tab login, so this
-- file adds a thin callable wrapper with explicit grants.
-- The Super Admin row for ashutoshkumarjpg67@gmail.com
-- (uid f245699a-f0fa-4ec7-9812-8c56f013c08e) is already seeded
-- (BACKEND_PLAN.md bootstrap). This file does NOT insert it again.
-- Run ONLY against the School Saathi project (bsjqeeeemwimzldrehpw).
-- Idempotent: safe to re-run.

-- The check: true only when the caller's JWT uid is in
-- ss_platform_admins. SECURITY DEFINER so the lookup runs as the
-- function owner (the table has RLS with no anon policy).
create or replace function public.ss_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.is_ss_admin();
$function$;

-- Grants: authenticated only (an anonymous caller has no uid, so the
-- check would be false anyway, but the grant makes the intent explicit).
revoke all on function public.ss_is_super_admin() from public;
revoke all on function public.ss_is_super_admin() from anon;
revoke all on function public.ss_is_super_admin() from authenticated;
grant execute on function public.ss_is_super_admin() to authenticated;
