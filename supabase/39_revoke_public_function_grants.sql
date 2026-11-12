-- 39_revoke_public_function_grants.sql — School Saathi Phase 3 (grant re-verification).
--
-- PostgreSQL grants EXECUTE on a newly created function to PUBLIC by
-- default. Files 01_schema.sql and 05_wipe_school.sql granted the
-- functions below to authenticated (and anon, where intended) but never
-- revoked PUBLIC, so an anonymous caller could CALL them. The bodies
-- are ownership-checked, so this was never a live hole — but
-- ss_school_owner() would still resolve any school UUID to its owner
-- UUID for an anonymous caller, and the grants contradict the
-- least-privilege revoke-first pattern every later file follows
-- (17/18/19/23/24/30/31/33/34/35/36/37).
--
-- This file revokes PUBLIC on those seven functions and re-asserts the
-- explicit grants. A REVOKE FROM PUBLIC never removes an explicit
-- grant to anon/authenticated, so the anon Apply-form policy check
-- (ss_is_real_school) and every owner flow keep working unchanged.
-- The delete-account Edge Function calls none of these functions (it
-- uses the service_role client on tables directly), so the revoke
-- cannot break it. No behaviour change, no data change.
--
-- Also re-asserts SQL 22: ss_parent_lookup stays postgres-only
-- (guarded DO block, repo style from SQL 15/22).
--
-- Idempotent: safe to re-run (REVOKE of a non-held privilege is a
-- notice, not an error; GRANT is a no-op when already granted).
-- Apply in the Supabase dashboard SQL editor (live apply is the
-- owner's/BAT's step — never from the app).
--
-- Verify after applying:
--   select routine_name, grantee, privilege_type
--     from information_schema.routine_privileges
--    where routine_schema = 'public'
--      and routine_name in ('is_ss_admin','ss_school_owner',
--        'ss_is_real_school','ss_next_adm_no','ss_next_receipt_no',
--        'ss_list_public_schools','ss_wipe_school','ss_parent_lookup')
--    order by routine_name, grantee;
-- Expect: no 'PUBLIC' grantee on any of them; ss_parent_lookup has
-- only the 'postgres' grantee (if listed at all).

-- 1. Revoke the default PUBLIC execute on the 01/05 functions.
revoke execute on function public.is_ss_admin() from public;
revoke execute on function public.ss_school_owner(uuid) from public;
revoke execute on function public.ss_is_real_school(uuid) from public;
revoke execute on function public.ss_next_adm_no(uuid) from public;
revoke execute on function public.ss_next_receipt_no(uuid) from public;
revoke execute on function public.ss_list_public_schools() from public;
revoke execute on function public.ss_wipe_school(uuid) from public;

-- 2. Re-assert the explicit grants (same as 02_rls.sql / 05_wipe_school.sql).
grant execute on function public.is_ss_admin() to authenticated;
grant execute on function public.ss_school_owner(uuid) to authenticated;
grant execute on function public.ss_is_real_school(uuid) to anon, authenticated;
grant execute on function public.ss_next_adm_no(uuid) to authenticated;
grant execute on function public.ss_next_receipt_no(uuid) to authenticated;
grant execute on function public.ss_list_public_schools() to anon, authenticated;
grant execute on function public.ss_wipe_school(uuid) to authenticated;

-- 3. Re-assert SQL 22: ss_parent_lookup stays postgres-only.
-- (The 2-arg overload was dropped by SQL 07, so only the 3-arg
-- overload is revoked here.)
do $$
begin
  if to_regprocedure('public.ss_parent_lookup(text, text, uuid)') is not null then
    execute 'revoke execute on function public.ss_parent_lookup(text, text, uuid) from public';
    execute 'revoke execute on function public.ss_parent_lookup(text, text, uuid) from anon';
    execute 'revoke execute on function public.ss_parent_lookup(text, text, uuid) from authenticated';
  end if;
end
$$;
