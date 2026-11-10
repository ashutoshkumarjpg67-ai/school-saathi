-- 15_revoke_parent_lookup_anon.sql — School Saathi Phase 1 security fix (CR-2).
-- Phase 0 audit (v58, 2026-11-10) finding CR-2: ss_parent_lookup is an
-- anon-callable PIN oracle.
--
-- Problem (audit CR-2):
--   * The RPC is SECURITY DEFINER with GRANT EXECUTE TO anon (07:37) — anyone
--     with the publishable anon key + project URL can call it, no login.
--   * It compares a plaintext PIN: `s.parent_pin = p_pin` (01_schema.sql:396-418).
--     Admission numbers are sequential (ADM-YYYY-NNN, every school's first
--     student is ADM-2025-001) and the PIN is only 4 digits (10,000 combos).
--   * There is NO rate limit anywhere (01:391-395 says rate limiting belongs
--     in the "app/edge layer" — but there is no Edge Function in the repo and
--     the app never calls this RPC at all).
--   * Since v54 the server stores a salted hash (s256$...) so the RPC can
--     never match a hashed row — but it CAN still match legacy plaintext
--     parent_pin rows. How many such rows exist on the live DB is UNVERIFIED.
--
-- What this file does:
--   * REVOKE EXECUTE on ss_parent_lookup from ANON *AND* PUBLIC, for BOTH
--     signatures:
--       - ss_parent_lookup(text, text, uuid) — the live 3-arg version,
--         granted to anon in 07_parent_lookup_scope.sql:37.
--       - ss_parent_lookup(text, text) — the old 2-arg version, whose grant
--         in 02_rls.sql:154 is stale (07 dropped the 2-arg function first).
--   * Why PUBLIC as well (BAT live check, 2026-11-10): PostgreSQL grants
--     EXECUTE on a new function to the PUBLIC role by default, and `anon`
--     is a member of PUBLIC — so revoking from anon alone leaves the hole
--     open. The repo files contain no explicit PUBLIC grant; it is the
--     default. Only revoking from PUBLIC (plus anon) actually closes it.
--   * `authenticated` is deliberately NOT revoked — the owner path is
--     unchanged for now, exactly as the audit recommended.
--   * The function itself is NOT dropped — it stays for a future hash-based
--     parent flow behind an Edge Function with rate limiting.
--
-- Zero app impact:
--   * The app NEVER calls this RPC — grep for `ss_parent_lookup` in app.js
--     at v58 returns 0 call sites (verified 2026-11-10). Parent login in the
--     app is local-only by design (removed from the server in v35).
--
-- How to apply (this file alone changes NOTHING live):
--   * Supabase dashboard -> SQL editor -> paste this file -> Run.
--   * Merging the PR only adds the file to the repo; the live DB changes
--     only when Ashutosh runs it in the dashboard.
--
-- Verify after applying:
--   * Anon key se RPC call karo (POST /rest/v1/rpc/ss_parent_lookup) ->
--     401/403 aana chahiye (pehle 200 + student row milta tha).
--   * Authenticated owner call unaffected rehta hai (grant sirf anon aur
--     PUBLIC se hata hai; authenticated ka explicit grant rehta hai).
--   * Check grants with:
--       select routine_name, grantee, privilege_type
--       from information_schema.routine_privileges
--       where routine_name = 'ss_parent_lookup';
--     -> `anon` aur `PUBLIC` rows gayab honi chahiye; `authenticated`
--     row rehni chahiye.
--
-- Idempotent: safe to re-run. Each revoke is guarded by an existence check
-- (the 2-arg function was already dropped by 07, so an unguarded revoke
-- on it would error on a DB where 07 was applied).

-- FIX 2026-11-10 (same bug BAT caught on SQL 16 live apply, commit
-- 231908b2): the existence checks below used to compare
-- pg_get_function_identity_arguments(p.oid) to 'text, text, uuid' —
-- but that function returns NAMED args ('p_admission_no text,
-- p_pin text, p_school_id uuid'), so the comparison was always false
-- and the block ran clean while revoking NOTHING. The checks now use
-- to_regprocedure, which resolves by name+types and returns NULL when
-- the overload is absent. Do NOT go back to the identity-args string
-- comparison.
do $$
begin
  if to_regprocedure('public.ss_parent_lookup(text, text, uuid)') is not null then
    execute 'revoke execute on function public.ss_parent_lookup(text, text, uuid) from public';
    execute 'revoke execute on function public.ss_parent_lookup(text, text, uuid) from anon';
    raise notice 'revoked public + anon execute on ss_parent_lookup(text, text, uuid)';
  else
    raise notice 'ss_parent_lookup(text, text, uuid) not found — nothing to revoke';
  end if;

  if to_regprocedure('public.ss_parent_lookup(text, text)') is not null then
    execute 'revoke execute on function public.ss_parent_lookup(text, text) from public';
    execute 'revoke execute on function public.ss_parent_lookup(text, text) from anon';
    raise notice 'revoked public + anon execute on ss_parent_lookup(text, text)';
  else
    raise notice 'ss_parent_lookup(text, text) not found — nothing to revoke';
  end if;
end $$;
