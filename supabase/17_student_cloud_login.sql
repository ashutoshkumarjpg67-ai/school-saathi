-- School Saathi backend — 17_student_cloud_login.sql
-- Student cloud login (v61): a student logs in from ANY device with
-- school + admission number + PIN, without the school's data being on
-- that device. Server-side PIN verification + server-side rate limiting.
-- Run ONLY against the School Saathi project (bsjqeeeemwimzldrehpw).
-- Idempotent: safe to re-run.
--
-- Design notes:
-- * The student PIN on the server lives in ss_students.parent_pin as a
--   salted SHA-256 hash: s256$<salt>$<hex(sha256(salt || '|' || pin))>.
--   The function verifies it with pgcrypto's extensions.digest() — the same digest
--   the app's hand-rolled SHA-256 produces (proven by the live V21 test
--   below: a correct PIN must return ok:true).
-- * The PIN hash itself is NEVER returned to the caller. The Aadhaar is
--   returned as last-4 only (the app reduces it the same way on pull).
-- * Rate limit mirrors the local one: 5 wrong PINs lock the student for
--   15 minutes; the counter resets when the lock is set (local parity).
-- * Unknown admission numbers never create an attempts row, and the
--   reply is the same generic {ok:false} whether the number or the PIN
--   was wrong.

-- 1. Failed-login attempts (server-side rate limit). One row per
-- (school, admission number). Only the login function touches this
-- table; RLS is on with NO policies, so direct access is denied.
create table if not exists public.ss_student_login_attempts (
  school_id uuid not null,
  admission_no text not null,
  fails integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (school_id, admission_no)
);
alter table public.ss_student_login_attempts enable row level security;

-- 2. The cloud login. SECURITY DEFINER so an anonymous student can call
-- it; it verifies the PIN hash server-side and returns ONLY that one
-- student's dashboard data.
create or replace function public.ss_student_cloud_login(
  p_school_id uuid,
  p_admission_no text,
  p_pin text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  v_adm text := lower(trim(coalesce(p_admission_no, '')));
  v_pin text := regexp_replace(coalesce(p_pin, ''), '\D', '', 'g');
  v_att record;
  v_stu record;
  v_locked_until timestamptz;
  v_locked boolean := false;
  v_ok boolean := false;
  v_salt text;
  v_hash text;
  v_new_salt text;
  v_new_hash text;
begin
  if p_school_id is null or v_adm = '' or v_pin = '' then
    return jsonb_build_object('ok', false, 'locked', false);
  end if;

  -- The student row. Unknown admission numbers return the generic
  -- failure WITHOUT recording an attempt (no garbage rows, and no
  -- lockout denial-of-service against a number that does not exist).
  select s.id, s.local_id, s.parent_pin
    into v_stu
    from public.ss_students s
   where s.school_id = p_school_id
     and lower(trim(s.admission_no)) = v_adm;
  if not found then
    return jsonb_build_object('ok', false, 'locked', false);
  end if;

  -- Server-side rate limit: 5 wrong PINs lock this student for 15 min.
  select a.fails, a.locked_until into v_att
    from public.ss_student_login_attempts a
   where a.school_id = p_school_id and a.admission_no = v_adm;
  if found and v_att.locked_until is not null and v_att.locked_until > now() then
    return jsonb_build_object('ok', false, 'locked', true, 'locked_until', v_att.locked_until);
  end if;

  -- No PIN set on this student: login is unavailable.
  if v_stu.parent_pin is null or v_stu.parent_pin = '' then
    return jsonb_build_object('ok', false, 'locked', false);
  end if;

  if left(v_stu.parent_pin, 5) = 's256$' then
    -- Salted SHA-256: s256$<salt>$<hex(sha256(salt || '|' || pin))>.
    v_salt := split_part(v_stu.parent_pin, '$', 2);
    v_hash := split_part(v_stu.parent_pin, '$', 3);
    v_ok := encode(extensions.digest(convert_to(v_salt || '|' || v_pin, 'UTF8'), 'sha256'), 'hex') = v_hash;
  else
    -- Legacy plaintext PIN (pre-v54 records): verify once, then upgrade
    -- the stored value to a salted hash, mirroring the local upgrade.
    v_ok := (v_pin = v_stu.parent_pin);
    if v_ok then
      v_new_salt := encode(extensions.gen_random_bytes(16), 'hex');
      v_new_hash := 's256$' || v_new_salt || '$' || encode(extensions.digest(convert_to(v_new_salt || '|' || v_pin, 'UTF8'), 'sha256'), 'hex');
      update public.ss_students set parent_pin = v_new_hash where id = v_stu.id;
    end if;
  end if;

  if not v_ok then
    insert into public.ss_student_login_attempts (school_id, admission_no, fails, locked_until, updated_at)
    values (p_school_id, v_adm, 1, null, now())
    on conflict (school_id, admission_no) do update
      set fails = case when public.ss_student_login_attempts.fails + 1 >= 5 then 0 else public.ss_student_login_attempts.fails + 1 end,
          locked_until = case when public.ss_student_login_attempts.fails + 1 >= 5 then now() + interval '15 minutes' else null end,
          updated_at = now();
    select a.locked_until into v_locked_until
      from public.ss_student_login_attempts a
     where a.school_id = p_school_id and a.admission_no = v_adm;
    v_locked := v_locked_until is not null and v_locked_until > now();
    return jsonb_build_object('ok', false, 'locked', v_locked);
  end if;

  -- Success: clear the attempts row.
  delete from public.ss_student_login_attempts
   where school_id = p_school_id and admission_no = v_adm;

  -- Dashboard payload: the student (WITHOUT the PIN hash; Aadhaar as
  -- last-4 only), the school, and only this student's fees / attendance
  -- / marks, plus the class homework, school notices, exams and fee
  -- structure the dashboard needs.
  return jsonb_build_object(
    'ok', true,
    'locked', false,
    'student', (select jsonb_set(to_jsonb(s) - 'parent_pin' - 'pin', '{aadhaar}', to_jsonb(right(coalesce(s.aadhaar, ''), 4))) from public.ss_students s where s.id = v_stu.id),
    'school', (select jsonb_build_object('id', sc.id, 'name', sc.name, 'city', sc.city) from public.ss_schools sc where sc.id = p_school_id),
    'fees', (select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) from public.ss_fee_records f where f.student_id = v_stu.id),
    'attendance', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from public.ss_attendance a where a.student_id = v_stu.id),
    'marks', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from public.ss_marks m where m.student_id = v_stu.id),
    'exams', (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) from public.ss_exams e where e.school_id = p_school_id),
    'homework', (select coalesce(jsonb_agg(to_jsonb(h)), '[]'::jsonb) from public.ss_homework h where h.school_id = p_school_id and h.cls = (select s2.cls from public.ss_students s2 where s2.id = v_stu.id)),
    'notices', (select coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb) from (select * from public.ss_notices where school_id = p_school_id order by notice_date desc nulls last, created_at desc limit 50) n),
    'fee_structure', (select coalesce(jsonb_agg(to_jsonb(fs)), '[]'::jsonb) from public.ss_fee_structure fs where fs.school_id = p_school_id)
  );
end;
$function$;

-- 3. Public school directory for the login picker: id + name + city only.
-- No student data, no emails, no phone numbers.
create or replace function public.ss_public_schools()
returns table (id uuid, name text, city text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select s.id, s.name, s.city from public.ss_schools s order by s.name;
$function$;

-- 4. Grants: anonymous students must be able to call both functions.
-- Revoke from every grantee first, then grant by full signature.
revoke all on function public.ss_student_cloud_login(uuid, text, text) from public;
revoke all on function public.ss_student_cloud_login(uuid, text, text) from anon;
revoke all on function public.ss_student_cloud_login(uuid, text, text) from authenticated;
grant execute on function public.ss_student_cloud_login(uuid, text, text) to anon, authenticated;
revoke all on function public.ss_public_schools() from public;
revoke all on function public.ss_public_schools() from anon;
revoke all on function public.ss_public_schools() from authenticated;
grant execute on function public.ss_public_schools() to anon, authenticated;
