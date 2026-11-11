-- School Saathi backend — 18_teacher_cloud_login.sql
-- Teacher cloud login (v62): a teacher logs in from ANY device with
-- school + email + password, without the school's data being on that
-- device. The teacher's work goes through token-authenticated RPCs, so
-- attendance, homework and marks land on the server directly.
-- Run ONLY against the School Saathi project (bsjqeeeemwimzldrehpw).
-- Idempotent: safe to re-run.
--
-- Design notes:
-- * The teacher's password hash lives in ss_teachers.pw_hash (salted
--   SHA-256, s256$<salt>$<hex>), synced up from the school device by the
--   app's hash-diff sync: sbMapTeacher now emits email + pw_hash, so
--   every teacher row's hash changes once and the flush PATCHes it up.
--   Only s256$ hashes are sent; a legacy djb2 hash is skipped — that
--   teacher logs in once on the school device (which upgrades the hash)
--   and syncs, then cloud login works.
-- * The login mints a random token (30-day expiry) stored in
--   ss_teacher_sessions. Write RPCs take the token, resolve it to
--   (teacher, school) via ss_teacher_token_owner, and re-check that the
--   class is one of the teacher's assigned classes on EVERY call — a
--   stolen token can only touch that teacher's own classes.
-- * Rate limit mirrors the student one: 5 wrong passwords lock the
--   teacher for 15 minutes; the counter resets when the lock is set.
--   Unknown emails never create an attempts row, and the reply is the
--   same generic {ok:false} whether the email or the password was wrong.
-- * The login payload never returns the password hash. Attendance and
--   marks upsert on their natural unique keys; homework inserts with an
--   empty done_by list.

-- 1. Teacher credentials on the server. A teacher's email is unique per
-- school (the app already enforces it locally); the partial unique index
-- makes the login lookup exact.
alter table public.ss_teachers add column if not exists email text;
alter table public.ss_teachers add column if not exists pw_hash text;
create unique index if not exists ss_teachers_school_email_key
  on public.ss_teachers (school_id, lower(email)) where email is not null;

-- 2. Sessions (one row per cloud login) and failed-login attempts.
-- Only the login/write functions touch these tables; RLS is on with NO
-- policies, so direct access is denied.
create table if not exists public.ss_teacher_sessions (
  token uuid primary key default gen_random_uuid(),
  teacher_id uuid not null,
  school_id uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.ss_teacher_sessions enable row level security;
create table if not exists public.ss_teacher_login_attempts (
  school_id uuid not null,
  email text not null,
  fails integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (school_id, email)
);
alter table public.ss_teacher_login_attempts enable row level security;

-- 3. Token owner (internal — NOT granted to anon; only the functions
-- below call it, as the same owner). NOTE: CREATE FUNCTION defaults to
-- EXECUTE for PUBLIC, so the revoke below is required — without it any
-- anonymous caller could resolve a token to its teacher and school.
create or replace function public.ss_teacher_token_owner(p_token uuid)
returns table (teacher_id uuid, school_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select s.teacher_id, s.school_id from public.ss_teacher_sessions s
   where s.token = p_token and s.expires_at > now();
$function$;

-- 4. The cloud login. SECURITY DEFINER so an anonymous teacher can call
-- it; it verifies the password hash server-side and returns the teacher's
-- working data plus a session token.
create or replace function public.ss_teacher_cloud_login(
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
  v_tch record;
  v_locked_until timestamptz;
  v_locked boolean := false;
  v_ok boolean := false;
  v_salt text;
  v_hash text;
  v_token uuid;
  v_classes text[];
begin
  if p_school_id is null or v_email = '' or v_pw = '' then
    return jsonb_build_object('ok', false, 'locked', false);
  end if;

  -- The teacher row. Unknown emails return the generic failure WITHOUT
  -- recording an attempt (no garbage rows, no lockout DoS).
  select t.id, t.local_id, t.email, t.pw_hash, t.classes
    into v_tch
    from public.ss_teachers t
   where t.school_id = p_school_id and lower(t.email) = v_email;
  if not found then
    return jsonb_build_object('ok', false, 'locked', false);
  end if;

  -- Server-side rate limit: 5 wrong passwords lock this teacher for 15 min.
  select a.fails, a.locked_until into v_att
    from public.ss_teacher_login_attempts a
   where a.school_id = p_school_id and a.email = v_email;
  if found and v_att.locked_until is not null and v_att.locked_until > now() then
    return jsonb_build_object('ok', false, 'locked', true, 'locked_until', v_att.locked_until);
  end if;

  -- No password set on this teacher: login is unavailable.
  if v_tch.pw_hash is null or v_tch.pw_hash = '' then
    return jsonb_build_object('ok', false, 'locked', false);
  end if;

  if left(v_tch.pw_hash, 5) = 's256$' then
    -- Salted SHA-256: s256$<salt>$<hex(sha256(salt || '|' || password))>.
    v_salt := split_part(v_tch.pw_hash, '$', 2);
    v_hash := split_part(v_tch.pw_hash, '$', 3);
    v_ok := encode(extensions.digest(convert_to(v_salt || '|' || v_pw, 'UTF8'), 'sha256'), 'hex') = v_hash;
  else
    -- Legacy djb2 hashes cannot be verified server-side: the teacher logs
    -- in once on the school device (which upgrades the hash) and syncs.
    v_ok := false;
  end if;

  if not v_ok then
    insert into public.ss_teacher_login_attempts (school_id, email, fails, locked_until, updated_at)
    values (p_school_id, v_email, 1, null, now())
    on conflict (school_id, email) do update
      set fails = case when public.ss_teacher_login_attempts.fails + 1 >= 5 then 0 else public.ss_teacher_login_attempts.fails + 1 end,
          locked_until = case when public.ss_teacher_login_attempts.fails + 1 >= 5 then now() + interval '15 minutes' else null end,
          updated_at = now();
    select a.locked_until into v_locked_until
      from public.ss_teacher_login_attempts a
     where a.school_id = p_school_id and a.email = v_email;
    v_locked := v_locked_until is not null and v_locked_until > now();
    return jsonb_build_object('ok', false, 'locked', v_locked);
  end if;

  -- Success: clear the attempts row and mint a 30-day session token.
  delete from public.ss_teacher_login_attempts
   where school_id = p_school_id and email = v_email;
  v_token := gen_random_uuid();
  insert into public.ss_teacher_sessions (token, teacher_id, school_id, expires_at)
  values (v_token, v_tch.id, p_school_id, now() + interval '30 days');
  v_classes := coalesce(v_tch.classes, '{}');

  -- Working payload: the teacher (WITHOUT the password hash), the school,
  -- and only the teacher's own classes — their students, attendance,
  -- homework, notices, exams, and marks for those students.
  return jsonb_build_object(
    'ok', true,
    'locked', false,
    'token', v_token,
    'teacher', (select to_jsonb(t) - 'pw_hash' from public.ss_teachers t where t.id = v_tch.id),
    'school', (select jsonb_build_object('id', sc.id, 'name', sc.name, 'city', sc.city) from public.ss_schools sc where sc.id = p_school_id),
    'students', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.ss_students s where s.school_id = p_school_id and s.cls = any (v_classes)),
    'attendance', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from public.ss_attendance a where a.school_id = p_school_id and a.cls = any (v_classes)),
    'homework', (select coalesce(jsonb_agg(to_jsonb(h)), '[]'::jsonb) from public.ss_homework h where h.school_id = p_school_id and h.cls = any (v_classes)),
    'notices', (select coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb) from (select * from public.ss_notices where school_id = p_school_id order by notice_date desc nulls last, created_at desc limit 50) n),
    'exams', (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) from public.ss_exams e where e.school_id = p_school_id),
    'marks', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from public.ss_marks m where m.school_id = p_school_id and m.student_id in (select s2.id from public.ss_students s2 where s2.school_id = p_school_id and s2.cls = any (v_classes)))
  );
end;
$function$;

-- 5. Mark one student's attendance. The class must be the teacher's,
-- and the student must be on that class's roster.
create or replace function public.ss_teacher_mark_attendance(
  p_token uuid,
  p_date date,
  p_cls text,
  p_student_id uuid,
  p_status text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  v_owner record;
  v_ok boolean := false;
begin
  select * into v_owner from public.ss_teacher_token_owner(p_token);
  if not found then return jsonb_build_object('ok', false, 'error', 'bad_token'); end if;
  if p_status not in ('Present', 'Absent', 'Late') then return jsonb_build_object('ok', false, 'error', 'bad_status'); end if;
  select exists(select 1 from public.ss_teachers t where t.id = v_owner.teacher_id and p_cls = any (coalesce(t.classes, '{}'))) into v_ok;
  if not v_ok then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  select exists(select 1 from public.ss_students s where s.id = p_student_id and s.school_id = v_owner.school_id and s.cls = p_cls) into v_ok;
  if not v_ok then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  insert into public.ss_attendance (school_id, att_date, cls, student_id, status)
  values (v_owner.school_id, p_date, p_cls, p_student_id, p_status)
  on conflict (school_id, att_date, cls, student_id) do update set status = excluded.status, updated_at = now();
  return jsonb_build_object('ok', true);
end;
$function$;

-- 6. Post homework to one of the teacher's classes.
create or replace function public.ss_teacher_post_homework(
  p_token uuid,
  p_cls text,
  p_subject text,
  p_title text,
  p_due date,
  p_local_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  v_owner record;
  v_ok boolean := false;
  v_row record;
begin
  select * into v_owner from public.ss_teacher_token_owner(p_token);
  if not found then return jsonb_build_object('ok', false, 'error', 'bad_token'); end if;
  if p_title is null or trim(p_title) = '' or p_local_id is null or trim(p_local_id) = '' then return jsonb_build_object('ok', false, 'error', 'bad_input'); end if;
  select exists(select 1 from public.ss_teachers t where t.id = v_owner.teacher_id and p_cls = any (coalesce(t.classes, '{}'))) into v_ok;
  if not v_ok then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  insert into public.ss_homework (school_id, local_id, cls, subject, title, due, done_by)
  values (v_owner.school_id, p_local_id, p_cls, coalesce(p_subject, ''), trim(p_title), p_due, '{}'::uuid[])
  returning * into v_row;
  return jsonb_build_object('ok', true, 'row', to_jsonb(v_row));
end;
$function$;

-- 7. Set marks for one exam (batch). An entry with marks null DELETES
-- that student's mark (the app sends null for a cleared input). Marks
-- outside 0..total are skipped, never silently clamped.
create or replace function public.ss_teacher_set_marks(
  p_token uuid,
  p_exam_id uuid,
  p_marks jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  v_owner record;
  v_exam record;
  v_n integer := 0;
  v_item jsonb;
  v_sid uuid;
  v_marks numeric;
begin
  select * into v_owner from public.ss_teacher_token_owner(p_token);
  if not found then return jsonb_build_object('ok', false, 'error', 'bad_token'); end if;
  select e.id, e.cls, e.total into v_exam from public.ss_exams e where e.id = p_exam_id and e.school_id = v_owner.school_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  if not exists(select 1 from public.ss_teachers t where t.id = v_owner.teacher_id and v_exam.cls = any (coalesce(t.classes, '{}'))) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  for v_item in select * from jsonb_array_elements(coalesce(p_marks, '[]'::jsonb)) loop
    v_sid := (v_item ->> 'student_id')::uuid;
    if not exists(select 1 from public.ss_students s where s.id = v_sid and s.school_id = v_owner.school_id and s.cls = v_exam.cls) then continue; end if;
    if (v_item ->> 'marks') is null then
      delete from public.ss_marks where school_id = v_owner.school_id and exam_id = p_exam_id and student_id = v_sid;
      v_n := v_n + 1;
    else
      v_marks := (v_item ->> 'marks')::numeric;
      if v_marks < 0 or v_marks > v_exam.total then continue; end if;
      insert into public.ss_marks (school_id, exam_id, student_id, marks)
      values (v_owner.school_id, p_exam_id, v_sid, v_marks)
      on conflict (school_id, exam_id, student_id) do update set marks = excluded.marks, updated_at = now();
      v_n := v_n + 1;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'updated', v_n);
end;
$function$;

-- 8. Revoke a session (cloud logout). Best-effort: the token expires in
-- 30 days even if this is never called.
create or replace function public.ss_teacher_revoke_session(p_token uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
begin
  delete from public.ss_teacher_sessions where token = p_token;
  return jsonb_build_object('ok', true);
end;
$function$;

-- 9. Grants: anonymous teachers must be able to call these functions.
-- Revoke from every grantee first, then grant by full signature.
-- ss_teacher_token_owner is internal and gets NO grant — revoke the
-- default PUBLIC grant explicitly (see section 3).
revoke all on function public.ss_teacher_token_owner(uuid) from public;
revoke all on function public.ss_teacher_token_owner(uuid) from anon;
revoke all on function public.ss_teacher_token_owner(uuid) from authenticated;
revoke all on function public.ss_teacher_cloud_login(uuid, text, text) from public;
revoke all on function public.ss_teacher_cloud_login(uuid, text, text) from anon;
revoke all on function public.ss_teacher_cloud_login(uuid, text, text) from authenticated;
grant execute on function public.ss_teacher_cloud_login(uuid, text, text) to anon, authenticated;
revoke all on function public.ss_teacher_mark_attendance(uuid, date, text, uuid, text) from public;
revoke all on function public.ss_teacher_mark_attendance(uuid, date, text, uuid, text) from anon;
revoke all on function public.ss_teacher_mark_attendance(uuid, date, text, uuid, text) from authenticated;
grant execute on function public.ss_teacher_mark_attendance(uuid, date, text, uuid, text) to anon, authenticated;
revoke all on function public.ss_teacher_post_homework(uuid, text, text, text, date, text) from public;
revoke all on function public.ss_teacher_post_homework(uuid, text, text, text, date, text) from anon;
revoke all on function public.ss_teacher_post_homework(uuid, text, text, text, date, text) from authenticated;
grant execute on function public.ss_teacher_post_homework(uuid, text, text, text, date, text) to anon, authenticated;
revoke all on function public.ss_teacher_set_marks(uuid, uuid, jsonb) from public;
revoke all on function public.ss_teacher_set_marks(uuid, uuid, jsonb) from anon;
revoke all on function public.ss_teacher_set_marks(uuid, uuid, jsonb) from authenticated;
grant execute on function public.ss_teacher_set_marks(uuid, uuid, jsonb) to anon, authenticated;
revoke all on function public.ss_teacher_revoke_session(uuid) from public;
revoke all on function public.ss_teacher_revoke_session(uuid) from anon;
revoke all on function public.ss_teacher_revoke_session(uuid) from authenticated;
grant execute on function public.ss_teacher_revoke_session(uuid) to anon, authenticated;
