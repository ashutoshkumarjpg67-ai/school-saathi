-- 19_school_login_rate_limit.sql — server-side rate limit for the SCHOOL login (v63)
--
-- The school password is verified by Supabase Auth (GoTrue), which only
-- rate-limits per IP (/auth/v1/token: 150 requests per 5 minutes per IP,
-- bursts up to 30). It has NO per-account attempt counter, so one school's
-- password could be hammered from many IPs forever. This file adds the
-- per-account lock the app checks before calling GoTrue: 5 wrong passwords
-- lock the email for 15 minutes. The lock lives on the server, so it
-- survives a device wipe and applies on every device.
--
-- Design notes (mirrors SQL 17/18):
-- * The RPCs only lock emails that HAVE a Supabase Auth account. A
--   local-only school (no server account) is never locked out of its
--   local login, and an unknown email never creates an attempts row
--   (no enumeration, no junk-row flood).
-- * The app calls precheck BEFORE sbSignIn, records a failure only on a
--   400 (wrong password — never on 429 or network errors), and clears
--   the row on a successful login. If the precheck RPC itself fails the
--   app proceeds to GoTrue (fail-open): the password is still checked,
--   only the lock is not enforced that once.
-- * CREATE FUNCTION grants EXECUTE to PUBLIC by default — revoked
--   explicitly below for all three functions; only anon + authenticated
--   remain (verify live after applying).

create table if not exists public.ss_school_login_attempts (
  email text primary key,
  fails integer not null default 0,
  locked_until timestamptz
);
alter table public.ss_school_login_attempts enable row level security;
-- No policies: the table is only touched by the SECURITY DEFINER RPCs below.

create or replace function public.ss_school_login_precheck(p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_locked timestamptz;
  v_exists boolean;
begin
  select exists(select 1 from auth.users u where lower(u.email) = lower(p_email)) into v_exists;
  if not v_exists then
    return jsonb_build_object('ok', true, 'locked', false);
  end if;
  select locked_until into v_locked from public.ss_school_login_attempts where email = lower(p_email);
  if v_locked is not null and v_locked > now() then
    return jsonb_build_object('ok', false, 'locked', true, 'locked_until', v_locked);
  end if;
  return jsonb_build_object('ok', true, 'locked', false);
end;
$$;

create or replace function public.ss_school_login_failed(p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_fails integer;
  v_exists boolean;
  v_locked_until timestamptz;
begin
  select exists(select 1 from auth.users u where lower(u.email) = lower(p_email)) into v_exists;
  if not v_exists then
    return jsonb_build_object('ok', true, 'locked', false);
  end if;
  insert into public.ss_school_login_attempts (email, fails) values (lower(p_email), 1)
  on conflict (email) do update set fails = public.ss_school_login_attempts.fails + 1
  returning fails into v_fails;
  if v_fails >= 5 then
    v_locked_until := now() + interval '15 minutes';
    update public.ss_school_login_attempts set fails = 0, locked_until = v_locked_until where email = lower(p_email);
    return jsonb_build_object('ok', false, 'locked', true, 'locked_until', v_locked_until);
  end if;
  return jsonb_build_object('ok', true, 'locked', false, 'fails', v_fails);
end;
$$;

create or replace function public.ss_school_login_ok(p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  delete from public.ss_school_login_attempts where email = lower(p_email);
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.ss_school_login_precheck(text) from public;
revoke execute on function public.ss_school_login_failed(text) from public;
revoke execute on function public.ss_school_login_ok(text) from public;
grant execute on function public.ss_school_login_precheck(text) to anon, authenticated;
grant execute on function public.ss_school_login_failed(text) to anon, authenticated;
grant execute on function public.ss_school_login_ok(text) to anon, authenticated;
