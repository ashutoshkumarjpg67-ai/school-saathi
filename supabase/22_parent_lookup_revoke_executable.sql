-- SQL 22: executable parent-lookup revoke (audit P0-2)
-- ss_parent_lookup is UNUSED by design since v65 (parent features were
-- folded into the student portal; no call exists in app.js — verified
-- 11 Nov). File 16 contained only comments, so re-running the repo
-- files re-opened the hole (file 07 grants anon). This file makes the
-- revoke real and executable, and closes the remaining `authenticated`
-- grant too (file 16 Step 3 decision): postgres-only is the least
-- privilege for an unused function. If any flow ever needs it again,
-- re-grant deliberately, with a rate limit.
-- Guarded by to_regprocedure (never the pg_get_function_identity_arguments
-- string comparison — that silently matched nothing in the first draft
-- of file 16). The 2-arg overload is gone (verified live 11 Nov: only
-- the 3-arg overload exists), so nothing is revoked for it.
-- The revoke changes NO data and NO app behaviour (nothing calls it).
do $$
begin
  if to_regprocedure('public.ss_parent_lookup(text, text, uuid)') is not null then
    execute 'revoke execute on function public.ss_parent_lookup(text, text, uuid) from public';
    execute 'revoke execute on function public.ss_parent_lookup(text, text, uuid) from anon';
    execute 'revoke execute on function public.ss_parent_lookup(text, text, uuid) from authenticated';
  end if;
end
$$;
