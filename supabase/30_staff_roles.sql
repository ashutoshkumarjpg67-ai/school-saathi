-- SQL 30: staff roles — Principal, Accountant, Staff (Phase 4, v85)
-- New table ss_staff + cloud login RPC, mirroring the teacher pattern
-- (SQL 18/23/24). A staff member logs in from ANY device with school +
-- email + password, without the school's data being on that device.
-- Run ONLY against the School Saathi project (bsjqeeeemwimzldrehpw).
-- Idempotent: safe to re-run.
--
-- Design notes:
-- * Roles: 'principal' (whole school, read-only oversight), 'accountant'
--   (fees, receipts, fee structure — no students' photos/PINs, no
--   attendance/homework/marks), 'staff' (their own classes, like a
--   teacher but no marks and no exams). The login payload is scoped per
--   role — a role never receives another role's data.
-- * Password hash lives in ss_staff.pw_hash (bcrypt$ minted by the
--   client with bcryptjs 2.4.3, verified server-side with pgcrypto
--   crypt() — the SQL 23 pattern). s256$ legacy is still accepted;
--   djb2 cannot be verified server-side (that staff member logs in once
--   on the school device, which upgrades the hash, then syncs).
-- * The login mints a random token (30-day expiry) stored in
--   ss_staff_sessions. Write RPCs (later steps) take the token and
--   re-check the role and the class on EVERY call.
-- * Rate limit mirrors the teacher one: 5 wrong passwords lock the
--   staff member for 15 minutes; the counter resets when the lock is
--   set. Unknown emails never create an attempts row, and the reply is
--   the same generic {ok:false} whether the email or the password was
--   wrong. The login payload never returns the password hash.

-- 1. Staff table. A staff member's email is unique per school (the app
-- enforces it locally); the partial unique index makes the login
-- lookup exact. RLS: owner-or-admin, the same policy set as ss_teachers.
create table if not exists public.ss_staff (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.ss_schools (id) on delete cascade,
  local_id text,
  name text not null,
  email text,
  role text not null default 'staff' check (role in ('principal', 'accountant', 'staff')),
  subject text not null default '',
  classes text[] not null default '{}',
  pw_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ss_staff enable row level security;
create unique index if not exists ss_staff_school_email_key
  on public.ss_staff (school_id, lower(email)) where email is not null;
create index if not exists ss_staff_school_idx on public.ss_staff (school_id);
drop policy if exists ss_owner_all_ss_staff on public.ss_staff;
create policy ss_owner_all_ss_staff on public.ss_staff for all to authenticated
  using (public.ss_school_owner(school_id) = auth.uid() or public.is_ss_admin())
  with check (public.ss_school_owner(school_id) = auth.uid() or public.is_ss_admin());

-- 2. Sessions (one row per cloud login) and failed-login attempts.
-- Only the login/write functions touch these tables; RLS is on with NO
-- policies, so direct access is denied.
create table if not exists public.ss_staff_sessions (
  token uuid primary key default gen_random_uuid(),
  staff_id uuid not null,
  school_id uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.ss_staff_sessions enable row level security;
create table if not exists public.ss_staff_login_attempts (
  school_id uuid not null,
  email text not null,
  fails integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (school_id, email)
);
alter table public.ss_staff_login_attempts enable row level security;

-- 3. Token owner (internal — NOT granted to anon; only the functions
-- below call it, as the same owner). NOTE: CREATE FUNCTION defaults to
-- EXECUTE for PUBLIC, so the revoke below is required.
create or replace function public.ss_staff_token_owner(p_token uuid)
returns table (staff_id uuid, school_id uuid, role text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select s.staff_id, s.school_id, st.role
    from public.ss_staff_sessions s
    join public.ss_staff st on st.id = s.staff_id
   where s.token = p_token and s.expires_at > now();
$function$;

-- 4. The cloud login. SECURITY DEFINER so an anonymous staff member can
-- call it; it verifies the password hash server-side and returns the
-- staff member's working data plus a session token. The payload is
-- scoped by role (see the design notes above).
create or replace function public.ss_staff_cloud_login(
  p_school_id uuid,
  p_email text,
  p_password text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_pw text := coalesce(p_password, '');
  v_att record;
  v_stf record;
  v_locked_until timestamptz;
  v_locked boolean := false;
  v_ok boolean := false;
  v_salt text;
  v_hash text;
  v_token uuid;
  v_classes text[];
  v_role text;
  v_payload jsonb;
begin
  if p_school_id is null or v_email = '' or v_pw = '' then
    return jsonb_build_object('ok', false, 'locked', false);
  end if;

  -- The staff row. Unknown emails return the generic failure WITHOUT
  -- recording an attempt (no garbage rows, no lockout DoS).
  select st.id, st.local_id, st.email, st.pw_hash, st.classes, st.role
    into v_stf
    from public.ss_staff st
   where st.school_id = p_school_id and lower(st.email) = v_email;
  if not found then
    return jsonb_build_object('ok', false, 'locked', false);
  end if;

  -- Server-side rate limit: 5 wrong passwords lock this staff member
  -- for 15 min.
  select a.fails, a.locked_until into v_att
    from public.ss_staff_login_attempts a
   where a.school_id = p_school_id and a.email = v_email;
  if found and v_att.locked_until is not null and v_att.locked_until > now() then
    return jsonb_build_object('ok', false, 'locked', true, 'locked_until', v_att.locked_until);
  end if;

  -- No password set on this staff member: login is unavailable.
  if v_stf.pw_hash is null or v_stf.pw_hash = '' then
    return jsonb_build_object('ok', false, 'locked', false);
  end if;

  if left(v_stf.pw_hash, 7) = 'bcrypt$' then
    -- bcrypt (SQL 23 pattern): bcrypt$<60-char $2a$ hash>, minted by the
    -- client with bcryptjs 2.4.3; pgcrypto crypt() verifies $2a$ natively.
    v_ok := (extensions.crypt(v_pw, substr(v_stf.pw_hash, 8)) = substr(v_stf.pw_hash, 8));
  elsif left(v_stf.pw_hash, 5) = 's256$' then
    -- Salted SHA-256 (legacy, still accepted): s256$<salt>$<hex(sha256(salt || '|' || password))>.
    v_salt := split_part(v_stf.pw_hash, '$', 2);
    v_hash := split_part(v_stf.pw_hash, '$', 3);
    v_ok := encode(extensions.digest(convert_to(v_salt || '|' || v_pw, 'UTF8'), 'sha256'), 'hex') = v_hash;
  else
    -- Legacy djb2 hashes cannot be verified server-side: the staff
    -- member logs in once on the school device (which upgrades the
    -- hash) and syncs.
    v_ok := false;
  end if;

  if not v_ok then
    insert into public.ss_staff_login_attempts (school_id, email, fails, locked_until, updated_at)
    values (p_school_id, v_email, 1, null, now())
    on conflict (school_id, email) do update
      set fails = case when public.ss_staff_login_attempts.fails + 1 >= 5 then 0 else public.ss_staff_login_attempts.fails + 1 end,
          locked_until = case when public.ss_staff_login_attempts.fails + 1 >= 5 then now() + interval '15 minutes' else null end,
          updated_at = now();
    select a.locked_until into v_locked_until
      from public.ss_staff_login_attempts a
     where a.school_id = p_school_id and a.email = v_email;
    v_locked := v_locked_until is not null and v_locked_until > now();
    return jsonb_build_object('ok', false, 'locked', v_locked);
  end if;

  -- Success: clear the attempts row and mint a 30-day session token.
  delete from public.ss_staff_login_attempts
   where school_id = p_school_id and email = v_email;
  v_token := gen_random_uuid();
  insert into public.ss_staff_sessions (token, staff_id, school_id, expires_at)
  values (v_token, v_stf.id, p_school_id, now() + interval '30 days');
  v_classes := coalesce(v_stf.classes, '{}');
  v_role := v_stf.role;

  -- Role-scoped working payload (bounded, like SQL 24). Student rows
  -- never carry photo_data_url, parent_pin or full aadhaar.
  if v_role = 'principal' then
    v_payload := jsonb_build_object(
      'students', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from (select s.id, s.local_id, s.name, s.cls, s.admission_no, s.enr, s.roll, s.gender, s.status, s.father_name, s.mother_name, s.phone, s.admission_date, s.session, s.photo_url from public.ss_students s where s.school_id = p_school_id order by s.cls, s.roll limit 5000) s),
      'attendance', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from (select * from public.ss_attendance a where a.school_id = p_school_id and a.att_date >= current_date - interval '90 days' order by a.att_date desc limit 5000) a),
      'homework', (select coalesce(jsonb_agg(to_jsonb(h)), '[]'::jsonb) from (select * from public.ss_homework h where h.school_id = p_school_id order by h.created_at desc limit 200) h),
      'notices', (select coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb) from (select * from public.ss_notices where school_id = p_school_id order by notice_date desc nulls last, created_at desc limit 50) n),
      'exams', (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) from (select * from public.ss_exams e where e.school_id = p_school_id order by e.exam_date desc limit 200) e),
      'marks', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from (select * from public.ss_marks m where m.school_id = p_school_id order by m.updated_at desc limit 10000) m),
      'fee_records', (select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) from (select * from public.ss_fee_records f where f.school_id = p_school_id order by f.created_at desc limit 5000) f),
      'fee_structure', (select coalesce(jsonb_agg(to_jsonb(fs)), '[]'::jsonb) from public.ss_fee_structure fs where fs.school_id = p_school_id)
    );
  elsif v_role = 'accountant' then
    v_payload := jsonb_build_object(
      'students', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from (select s.id, s.local_id, s.name, s.cls, s.admission_no, s.enr, s.roll, s.status from public.ss_students s where s.school_id = p_school_id order by s.cls, s.roll limit 5000) s),
      'fee_records', (select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) from (select * from public.ss_fee_records f where f.school_id = p_school_id order by f.created_at desc limit 10000) f),
      'fee_structure', (select coalesce(jsonb_agg(to_jsonb(fs)), '[]'::jsonb) from public.ss_fee_structure fs where fs.school_id = p_school_id),
      'receipts', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (select * from public.ss_receipts r where r.school_id = p_school_id order by r.created_at desc limit 5000) r),
      'notices', (select coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb) from (select * from public.ss_notices where school_id = p_school_id order by notice_date desc nulls last, created_at desc limit 50) n)
    );
  else
    -- 'staff': their own classes only, like a teacher but no marks and
    -- no exams.
    v_payload := jsonb_build_object(
      'students', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from (select s.id, s.local_id, s.name, s.cls, s.admission_no, s.enr, s.roll, s.gender, s.status, s.father_name, s.mother_name, s.phone, s.admission_date, s.session, s.photo_url from public.ss_students s where s.school_id = p_school_id and s.cls = any (v_classes) order by s.cls, s.roll limit 5000) s),
      'attendance', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from (select * from public.ss_attendance a where a.school_id = p_school_id and a.cls = any (v_classes) and a.att_date >= current_date - interval '90 days' order by a.att_date desc limit 5000) a),
      'homework', (select coalesce(jsonb_agg(to_jsonb(h)), '[]'::jsonb) from (select * from public.ss_homework h where h.school_id = p_school_id and h.cls = any (v_classes) order by h.created_at desc limit 200) h),
      'notices', (select coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb) from (select * from public.ss_notices where school_id = p_school_id order by notice_date desc nulls last, created_at desc limit 50) n)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'locked', false,
    'token', v_token,
    'staff', (select to_jsonb(st) - 'pw_hash' from public.ss_staff st where st.id = v_stf.id),
    'school', (select jsonb_build_object('id', sc.id, 'name', sc.name, 'city', sc.city) from public.ss_schools sc where sc.id = p_school_id),
    'data', v_payload
  );
end;
$function$;

-- 5. Revoke a session (cloud logout). Best-effort: the token expires in
-- 30 days even if this is never called.
create or replace function public.ss_staff_revoke_session(p_token uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
begin
  delete from public.ss_staff_sessions where token = p_token;
  return jsonb_build_object('ok', true);
end;
$function$;

-- 6. Grants: anonymous staff members must be able to call the login and
-- revoke functions. Revoke from every grantee first, then grant by full
-- signature. ss_staff_token_owner is internal and gets NO grant.
revoke all on function public.ss_staff_token_owner(uuid) from public;
revoke all on function public.ss_staff_token_owner(uuid) from anon;
revoke all on function public.ss_staff_token_owner(uuid) from authenticated;
revoke all on function public.ss_staff_cloud_login(uuid, text, text) from public;
revoke all on function public.ss_staff_cloud_login(uuid, text, text) from anon;
revoke all on function public.ss_staff_cloud_login(uuid, text, text) from authenticated;
grant execute on function public.ss_staff_cloud_login(uuid, text, text) to anon, authenticated;
revoke all on function public.ss_staff_revoke_session(uuid) from public;
revoke all on function public.ss_staff_revoke_session(uuid) from anon;
revoke all on function public.ss_staff_revoke_session(uuid) from authenticated;
grant execute on function public.ss_staff_revoke_session(uuid) to anon, authenticated;
