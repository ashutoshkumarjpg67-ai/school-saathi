-- SQL 52 (app v141, photo privacy): server-verified, revocable parent
-- photo sessions. Before this a parent re-verified their PIN only at
-- login, so a signed photo URL could never be re-minted mid-session
-- (the PIN is never kept anywhere). This is the parent equivalent of
-- the teacher/staff session pattern (SQL 18/30): a 30-day token the
-- app holds in sessionStorage and the photo-url edge function re-checks
-- live on every re-mint. The token can only ever sign the ONE student
-- the PIN login verified - exactly the PIN path's scope, never more.
--
-- PIN verification is NOT re-implemented: ss_parent_session_open
-- delegates to the live ss_student_cloud_login (SQL 17/23/33 - bcrypt$,
-- s256$, legacy - with the SQL 36 lockout), so no parallel PIN logic
-- can drift from the real one.

create table if not exists public.ss_parent_sessions (
  token uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.ss_students (id) on delete cascade,
  school_id uuid not null references public.ss_schools (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table public.ss_parent_sessions enable row level security;
create index if not exists ss_parent_sessions_student_idx
  on public.ss_parent_sessions (student_id);

-- Open: verify via the live login RPC, then issue the token. A failed
-- or locked login returns unchanged, so the app's error path is exact.
create or replace function public.ss_parent_session_open(p_school_id uuid, p_admission_no text, p_pin text)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  v_login jsonb;
  v_token uuid;
begin
  v_login := public.ss_student_cloud_login(p_school_id, p_admission_no, p_pin);
  if v_login is null or coalesce((v_login ->> 'ok')::boolean, false) = false then
    return v_login;
  end if;
  insert into public.ss_parent_sessions (student_id, school_id, expires_at)
  values ((v_login -> 'student' ->> 'id')::uuid, p_school_id, now() + interval '30 days')
  returning token into v_token;
  delete from public.ss_parent_sessions where expires_at <= now(); -- lazy sweep of expired rows
  return jsonb_set(v_login, '{token}', to_jsonb(v_token));
end;
$function$;

-- Revoke: holding the token is the authority to kill it (SQL 30's
-- ss_staff_revoke_session pattern). Called on logout, best-effort.
create or replace function public.ss_parent_revoke_session(p_token uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
begin
  delete from public.ss_parent_sessions where token = p_token;
  return jsonb_build_object('ok', true);
end;
$function$;

-- Grants: the app reaches the RPCs with the anon key (PIN in the POST
-- body, exactly like the login RPC); the photo-url function reads the
-- sessions table as service_role. No table policies and no client
-- table grants: clients only ever hold a token string.
revoke all on public.ss_parent_sessions from public;
revoke all on function public.ss_parent_session_open(uuid, text, text) from public;
revoke all on function public.ss_parent_revoke_session(uuid) from public;
grant execute on function public.ss_parent_session_open(uuid, text, text) to anon;
grant execute on function public.ss_parent_revoke_session(uuid) to anon;
grant select on public.ss_parent_sessions to service_role;
