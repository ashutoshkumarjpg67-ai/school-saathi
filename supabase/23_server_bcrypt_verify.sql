-- SQL 23: server bcrypt verification (audit P1-1, v72)
-- The client (v72) now mints bcrypt$ hashes with bcryptjs 2.4.3
-- ($2a$, cost 10). pgcrypto crypt() verifies $2a$ natively — proven
-- live 11 Nov (client-minted $2a$ hashes for 'test1234' and PIN '2108'
-- both verify server-side). bcryptjs 3.x emits $2b$, which pgcrypto
-- does NOT verify (crypt() returns garbage), so 2.4.3 is pinned.
-- This file re-creates the two cloud-login functions with a bcrypt$
-- branch added FIRST (before the s256$ branch); s256$ stays accepted
-- forever, djb2/plaintext behaviour is unchanged except the student
-- legacy-plaintext upgrade now mints bcrypt$ instead of s256$.
-- Idempotent: safe to re-run. Grants are re-stated (same as SQL 17/18).
-- Run ONLY against the School Saathi project (bsjqeeeemwimzldrehpw).

-- 1. Student cloud login (was SQL 17): bcrypt$ branch + legacy
-- plaintext upgrade now mints bcrypt$.
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

  if left(v_stu.parent_pin, 7) = 'bcrypt$' then
    -- bcrypt (v72, P1-1): bcrypt$<60-char $2a$ hash>. The client mints
    -- these with bcryptjs 2.4.3; pgcrypto crypt() verifies $2a$ natively.
    v_ok := (extensions.crypt(v_pin, substr(v_stu.parent_pin, 8)) = substr(v_stu.parent_pin, 8));
  elsif left(v_stu.parent_pin, 5) = 's256$' then
    -- Salted SHA-256 (legacy, still accepted): s256$<salt>$<hex(sha256(salt || '|' || pin))>.
    v_salt := split_part(v_stu.parent_pin, '$', 2);
    v_hash := split_part(v_stu.parent_pin, '$', 3);
    v_ok := encode(extensions.digest(convert_to(v_salt || '|' || v_pin, 'UTF8'), 'sha256'), 'hex') = v_hash;
  else
    -- Legacy plaintext PIN (pre-v54 records): verify once, then upgrade
    -- the stored value to bcrypt, mirroring the local upgrade.
    v_ok := (v_pin = v_stu.parent_pin);
    if v_ok then
      v_new_hash := 'bcrypt$' || extensions.crypt(v_pin, extensions.gen_salt('bf', 10));
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

-- 2. Teacher cloud login (was SQL 18): bcrypt$ branch added. The
-- djb2 else-branch is unchanged (still cannot verify server-side).
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

  if left(v_tch.pw_hash, 7) = 'bcrypt$' then
    -- bcrypt (v72, P1-1): bcrypt$<60-char $2a$ hash>, minted by the
    -- client with bcryptjs 2.4.3; pgcrypto crypt() verifies $2a$ natively.
    v_ok := (extensions.crypt(v_pw, substr(v_tch.pw_hash, 8)) = substr(v_tch.pw_hash, 8));
  elsif left(v_tch.pw_hash, 5) = 's256$' then
    -- Salted SHA-256 (legacy, still accepted): s256$<salt>$<hex(sha256(salt || '|' || password))>.
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

-- 3. Grants (same as SQL 17/18): revoke from every grantee first, then
-- grant by full signature. CREATE OR REPLACE preserves grants, but the
-- explicit block keeps the file self-contained and auditable.
revoke all on function public.ss_student_cloud_login(uuid, text, text) from public;
revoke all on function public.ss_student_cloud_login(uuid, text, text) from anon;
revoke all on function public.ss_student_cloud_login(uuid, text, text) from authenticated;
grant execute on function public.ss_student_cloud_login(uuid, text, text) to anon, authenticated;
revoke all on function public.ss_teacher_cloud_login(uuid, text, text) from public;
revoke all on function public.ss_teacher_cloud_login(uuid, text, text) from anon;
revoke all on function public.ss_teacher_cloud_login(uuid, text, text) from authenticated;
grant execute on function public.ss_teacher_cloud_login(uuid, text, text) to anon, authenticated;
