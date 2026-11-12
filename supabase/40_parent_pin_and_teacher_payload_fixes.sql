-- School Saathi backend — 40_parent_pin_and_teacher_payload_fixes.sql
-- v114 — fixes for the external review of v113 (12 Nov 2026, commit 204de96).
-- The review verified each of these against the repo + live database;
-- BAT re-verified every one against the live functions with
-- pg_get_functiondef before writing this file.
--
-- (1) NULL-DOB bypass in ss_parent_pin_reset_by_dob (SQL 37): the check
--     `if v_stu.dob <> p_dob` evaluates to NULL when p_dob is NULL, so
--     the mismatch branch never ran and any parent PIN could be reset
--     with only the admission number. Fixed: an explicit NULL guard
--     (a NULL DOB now counts as a failed guess, rate-limited) plus
--     IS DISTINCT FROM so NULL can never slip through again.
-- (2) Lockout clearing in ss_parent_pin_ok (SQL 36): the old 2-arg RPC
--     deleted the attempts row with no proof at all, anon-granted, so
--     anyone could clear any admission number's 15-minute lockout.
--     Fixed: the old signature is DROPPED and replaced with a 4-arg
--     version that clears only on proof — the correct PIN (same
--     bcrypt$/s256$/legacy verification as the student login) or the
--     correct DOB. A wrong proof records a failure (rate-limited);
--     while a lock is live a wrong proof just reports it. The app
--     passes the PIN after a local/cloud login and the DOB after a
--     local PIN reset (the two places it already proved identity).
-- (3) Teacher login whole-row students (SQL 33 line 235): the payload
--     shipped to_jsonb(s) for every student — parent_pin hash and
--     photo_data_url included. Parent PINs are 4-6 digits, so a bcrypt
--     hash of one falls to offline brute force in minutes; a teacher
--     account (or a stolen teacher device) handed out every parent
--     PIN. Fixed: the students payload is now the SQL 24 whitelist
--     (jsonb_build_object, explicit columns — no parent_pin, no
--     photo_data_url, no aadhaar). Everything else in the function —
--     auth, s256$-to-bcrypt upgrade, token, other tables — is byte-for-
--     byte the SQL 33 version. Teachers still fetch a single photo on
--     demand via ss_teacher_student_photo (SQL 29, token-checked).
--     The staff login (SQL 33 lines 349/361/371) and the student login
--     (SQL 33 line 118) already whitelist — checked, unchanged.
--
-- Earlier files are NOT edited (one file per concern). Apply in the
-- dashboard SQL editor, then verify live:
--   select pg_get_functiondef(oid) from pg_proc
--     where proname in ('ss_parent_pin_reset_by_dob','ss_parent_pin_ok',
--     'ss_teacher_cloud_login');
-- Behaviour checks (anon key, test school Test Sunrise, V21 ADM-2025-001):
--   * reset RPC with p_dob NULL + a valid new PIN -> ok:false, PIN unchanged
--   * _ok RPC with no proof -> ok:false (and a failure is recorded)
--   * teacher login (cloudteacher@test.in) -> students[0] has NO
--     parent_pin key and NO photo_data_url key
-- Clean up the ss_parent_pin_attempts rows these probes create.

create or replace function public.ss_parent_pin_reset_by_dob(
  p_school_id uuid,
  p_admission_no text,
  p_dob date,
  p_new_pin text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_stu record;
  v_locked timestamptz;
  v_fail jsonb;
  v_new_hash text;
begin
  select s.id, s.name, s.cls, s.dob into v_stu from public.ss_students s
    where s.school_id = p_school_id
    and lower(trim(s.admission_no)) = lower(trim(p_admission_no));
  if not found then
    return jsonb_build_object('ok', false);
  end if;
  select locked_until into v_locked from public.ss_parent_pin_attempts
    where school_id = p_school_id and admission_no = lower(trim(p_admission_no));
  if v_locked is not null and v_locked > now() then
    return jsonb_build_object('ok', false, 'locked', true, 'locked_until', v_locked);
  end if;
  if v_stu.dob is null then
    return jsonb_build_object('ok', false, 'error', 'no_dob');
  end if;
  -- v114: a NULL p_dob must NEVER pass the check. In SQL, dob <> NULL
  -- is NULL (not true), so the old comparison silently skipped the
  -- mismatch branch and reset the PIN. A NULL DOB is now a failed
  -- guess (rate-limited like any wrong DOB), and the comparison uses
  -- IS DISTINCT FROM so NULL can never slip through again.
  if p_dob is null then
    select ss_parent_pin_failed(p_school_id, p_admission_no) into v_fail;
    return jsonb_build_object('ok', false, 'locked', coalesce((v_fail->>'locked')::boolean, false));
  end if;
  if v_stu.dob is distinct from p_dob then
    select ss_parent_pin_failed(p_school_id, p_admission_no) into v_fail;
    return jsonb_build_object('ok', false, 'locked', coalesce((v_fail->>'locked')::boolean, false));
  end if;
  if p_new_pin is null or p_new_pin !~ '^[0-9]{4,6}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_pin');
  end if;
  v_new_hash := 'bcrypt$' || extensions.crypt(p_new_pin, extensions.gen_salt('bf', 10));
  update public.ss_students set parent_pin = v_new_hash, updated_at = now() where id = v_stu.id;
  delete from public.ss_parent_pin_attempts
    where school_id = p_school_id and admission_no = lower(trim(p_admission_no));
  insert into public.ss_audit_log (school_id, actor, action, details)
    values (p_school_id, v_stu.name || ' (parent)', 'Parent PIN reset',
      'Admission ' || trim(p_admission_no) || ' • ' || coalesce(v_stu.cls, ''));
  return jsonb_build_object('ok', true);
end;
$$;

-- (2) ss_parent_pin_ok — DROPPED old signature first: a CREATE with a
-- different signature would leave the vulnerable 2-arg function live.
drop function if exists public.ss_parent_pin_ok(uuid, text);
create or replace function public.ss_parent_pin_ok(
  p_school_id uuid,
  p_admission_no text,
  p_pin text default null,
  p_dob date default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_stu record;
  v_locked timestamptz;
  v_fail jsonb;
  v_proof boolean := false;
  v_salt text;
  v_hash text;
begin
  select s.id, s.parent_pin, s.dob into v_stu from public.ss_students s
    where s.school_id = p_school_id
    and lower(trim(s.admission_no)) = lower(trim(p_admission_no));
  if not found then
    -- Unknown admission number: same silent ok as before (no enumeration).
    return jsonb_build_object('ok', true);
  end if;
  -- PIN proof: same verification as ss_student_cloud_login (SQL 33).
  if p_pin is not null and v_stu.parent_pin is not null and v_stu.parent_pin <> '' then
    if left(v_stu.parent_pin, 7) = 'bcrypt$' then
      v_proof := (extensions.crypt(p_pin, substr(v_stu.parent_pin, 8)) = substr(v_stu.parent_pin, 8));
    elsif left(v_stu.parent_pin, 5) = 's256$' then
      v_salt := split_part(v_stu.parent_pin, '$', 2);
      v_hash := split_part(v_stu.parent_pin, '$', 3);
      v_proof := encode(extensions.digest(convert_to(v_salt || '|' || p_pin, 'UTF8'), 'sha256'), 'hex') = v_hash;
    else
      v_proof := (p_pin = v_stu.parent_pin);
    end if;
  end if;
  -- DOB proof: knowing the DOB already allows a PIN reset (SQL 37),
  -- so accepting it here adds no new attack surface.
  if not v_proof and p_dob is not null and v_stu.dob is not null and v_stu.dob = p_dob then
    v_proof := true;
  end if;
  if not v_proof then
    select locked_until into v_locked from public.ss_parent_pin_attempts
      where school_id = p_school_id and admission_no = lower(trim(p_admission_no));
    if v_locked is not null and v_locked > now() then
      return jsonb_build_object('ok', false, 'locked', true, 'locked_until', v_locked);
    end if;
    select ss_parent_pin_failed(p_school_id, p_admission_no) into v_fail;
    return jsonb_build_object('ok', false, 'locked', coalesce((v_fail->>'locked')::boolean, false));
  end if;
  delete from public.ss_parent_pin_attempts
    where school_id = p_school_id and admission_no = lower(trim(p_admission_no));
  return jsonb_build_object('ok', true);
end;
$$;

-- (3) ss_teacher_cloud_login — SQL 33 version, students payload
-- replaced with the SQL 24 whitelist (see header).
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
  v_new_hash text;
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
    -- v95 (hash sweep): a successful s256$ login upgrades the stored
    -- password to bcrypt, so the legacy hash disappears on next login.
    if v_ok then
      v_new_hash := 'bcrypt$' || extensions.crypt(v_pw, extensions.gen_salt('bf', 10));
      update public.ss_teachers set pw_hash = v_new_hash where id = v_tch.id;
    end if;
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
    'students', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'local_id', s.local_id, 'name', s.name, 'cls', s.cls, 'roll', s.roll,
        'enr', s.enr, 'guardian', s.guardian, 'phone', s.phone, 'mobile2', s.mobile2,
        'parent_email', s.parent_email, 'father_name', s.father_name, 'mother_name', s.mother_name,
        'occupation', s.occupation, 'dob', s.dob, 'gender', s.gender, 'blood_group', s.blood_group,
        'category', s.category, 'address', s.address, 'state', s.state, 'district', s.district,
        'pin', s.pin, 'previous_school', s.previous_school, 'previous_class', s.previous_class,
        'admission_no', s.admission_no, 'admission_date', s.admission_date, 'session', s.session,
        'status', s.status, 'result', s.result, 'documents', s.documents
      )), '[]'::jsonb) from public.ss_students s where s.school_id = p_school_id and s.cls = any (v_classes)),
    'attendance', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from public.ss_attendance a where a.school_id = p_school_id and a.cls = any (v_classes)),
    'homework', (select coalesce(jsonb_agg(to_jsonb(h)), '[]'::jsonb) from public.ss_homework h where h.school_id = p_school_id and h.cls = any (v_classes)),
    'notices', (select coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb) from (select * from public.ss_notices where school_id = p_school_id order by notice_date desc nulls last, created_at desc limit 50) n),
    'exams', (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) from public.ss_exams e where e.school_id = p_school_id),
    'marks', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from public.ss_marks m where m.school_id = p_school_id and m.student_id in (select s2.id from public.ss_students s2 where s2.school_id = p_school_id and s2.cls = any (v_classes)))
  );
end;
$function$;

-- Grants (explicit, per function — CREATE grants EXECUTE to PUBLIC by
-- default, so PUBLIC is revoked on every function touched here).
revoke execute on function public.ss_parent_pin_reset_by_dob(uuid, text, date, text) from public;
grant execute on function public.ss_parent_pin_reset_by_dob(uuid, text, date, text) to anon, authenticated;
revoke execute on function public.ss_parent_pin_ok(uuid, text, text, date) from public;
grant execute on function public.ss_parent_pin_ok(uuid, text, text, date) to anon, authenticated;
revoke execute on function public.ss_teacher_cloud_login(uuid, text, text) from public;
grant execute on function public.ss_teacher_cloud_login(uuid, text, text) to anon, authenticated;
