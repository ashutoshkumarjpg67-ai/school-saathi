-- 36_parent_pin_lockout.sql — server-side rate limit for the LOCAL parent-PIN login (v99)
--
-- The local parent login (doParentLogin) verifies the PIN against the
-- student record on the device, with only a per-device lockout
-- (pinLockUntil: 5 wrong guesses lock that admission number on that
-- device for 15 minutes). The server never saw local failures, so an
-- attacker could try 5 guesses per device forever. These RPCs mirror
-- SQL 19 (school login rate limit): the app records each local parent
-- failure server-side when online (best-effort, fail-open) and consults
-- the lock before verifying the PIN. The cloud parent login already
-- gets server lockout through ss_student_cloud_login (SQL 17/23); only
-- the LOCAL path needed these.
--
-- Design notes (mirrors SQL 19):
-- * The RPCs only touch admission numbers that HAVE a student row in
--   this school. An unknown admission number never creates an attempts
--   row (no enumeration, no junk-row flood).
-- * 5 wrong PINs lock the admission number for 15 minutes, on every
--   device. A successful local login clears the row (ss_parent_pin_ok).
-- * If an RPC call itself fails the app proceeds with the local check
--   (fail-open): the PIN is still verified, only the lock is not
--   enforced that once. Offline login keeps working with no server
--   call at all.
-- * CREATE FUNCTION grants EXECUTE to PUBLIC by default — revoked
--   explicitly below; only anon + authenticated remain (verify live
--   after applying).

create table if not exists public.ss_parent_pin_attempts (
  school_id uuid not null,
  admission_no text not null,
  fails integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (school_id, admission_no)
);
alter table public.ss_parent_pin_attempts enable row level security;
-- No policies: the table is only touched by the SECURITY DEFINER RPCs below.

create or replace function public.ss_parent_pin_precheck(p_school_id uuid, p_admission_no text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_locked timestamptz;
  v_exists boolean;
begin
  select exists(select 1 from public.ss_students s
    where s.school_id = p_school_id
    and lower(trim(s.admission_no)) = lower(trim(p_admission_no))) into v_exists;
  if not v_exists then
    return jsonb_build_object('ok', true, 'locked', false);
  end if;
  select locked_until into v_locked from public.ss_parent_pin_attempts
    where school_id = p_school_id and admission_no = lower(trim(p_admission_no));
  if v_locked is not null and v_locked > now() then
    return jsonb_build_object('ok', false, 'locked', true, 'locked_until', v_locked);
  end if;
  return jsonb_build_object('ok', true, 'locked', false);
end;
$$;

create or replace function public.ss_parent_pin_failed(p_school_id uuid, p_admission_no text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_fails integer;
  v_exists boolean;
  v_locked_until timestamptz;
begin
  select exists(select 1 from public.ss_students s
    where s.school_id = p_school_id
    and lower(trim(s.admission_no)) = lower(trim(p_admission_no))) into v_exists;
  if not v_exists then
    return jsonb_build_object('ok', true, 'locked', false);
  end if;
  insert into public.ss_parent_pin_attempts (school_id, admission_no, fails)
  values (p_school_id, lower(trim(p_admission_no)), 1)
  on conflict (school_id, admission_no) do update set fails = public.ss_parent_pin_attempts.fails + 1,
    updated_at = now()
  returning fails into v_fails;
  if v_fails >= 5 then
    v_locked_until := now() + interval '15 minutes';
    update public.ss_parent_pin_attempts set fails = 0, locked_until = v_locked_until, updated_at = now()
      where school_id = p_school_id and admission_no = lower(trim(p_admission_no));
    return jsonb_build_object('ok', false, 'locked', true, 'locked_until', v_locked_until);
  end if;
  return jsonb_build_object('ok', true, 'locked', false, 'fails', v_fails);
end;
$$;

create or replace function public.ss_parent_pin_ok(p_school_id uuid, p_admission_no text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  delete from public.ss_parent_pin_attempts
    where school_id = p_school_id and admission_no = lower(trim(p_admission_no));
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.ss_parent_pin_precheck(uuid, text) from public;
revoke execute on function public.ss_parent_pin_failed(uuid, text) from public;
revoke execute on function public.ss_parent_pin_ok(uuid, text) from public;
grant execute on function public.ss_parent_pin_precheck(uuid, text) to anon, authenticated;
grant execute on function public.ss_parent_pin_failed(uuid, text) to anon, authenticated;
grant execute on function public.ss_parent_pin_ok(uuid, text) to anon, authenticated;
