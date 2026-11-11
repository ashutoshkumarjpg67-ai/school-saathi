-- SQL 24: teacher cloud login, bounded payload (audit P1-2, v74)
-- Re-creates ss_teacher_cloud_login (SQL 23's bcrypt$ + s256$ verification
-- is UNCHANGED) with a capped working payload, and adds an on-demand
-- student-photo RPC. Run ONLY against the School Saathi project
-- (bsjqeeeemwimzldrehpw). Idempotent: safe to re-run.
-- Rollback: re-run SQL 23 (restores the unbounded function; the photo
-- RPC stays, harmlessly unused).
--
-- Why: the v62 login returned one unbounded jsonb_agg payload — every
-- attendance row ever, every mark, and every student's photo inline
-- (~120KB each). At 500+ students that is ~5-15 MB on every teacher
-- login. The new bounds (same single-call shape, no rewrite):
--   * students: explicit columns only — photo_data_url, parent_pin (the
--     parent PIN hash) and aadhaar (full number, PII) are EXCLUDED. The
--     app's sbRowToStudent already treats all three as missing (photo
--     null, PIN hash unset, aadhaar ''), so old clients keep working.
--   * attendance: last 90 days only, most recent first, LIMIT 5000.
--     The teacher dashboard's attendance % now reflects the recent
--     window; older rows stay on the server.
--   * homework: most recent first, LIMIT 200.
--   * notices: LIMIT 50 (unchanged).
--   * exams: class-filtered like every other collection (was: ALL exams
--     in the school), LIMIT 200.
--   * marks: most recently updated first, LIMIT 10000.
-- Photos come back on demand: ss_teacher_student_photo returns one
-- student's photo_data_url for a valid teacher token, only when the
-- student is in one of that teacher's classes. The app calls it when a
-- cloud teacher opens a student profile.

-- 1. Teacher cloud login (was SQL 23): verification, rate limit and
-- token minting are byte-identical to SQL 23; only the payload changes.
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

  -- Working payload (BOUNDED — see the header): the teacher (WITHOUT the
  -- password hash), the school, and only the teacher's own classes.
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
    'attendance', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from (select * from public.ss_attendance a where a.school_id = p_school_id and a.cls = any (v_classes) and a.att_date >= current_date - interval '90 days' order by a.att_date desc limit 5000) a),
    'homework', (select coalesce(jsonb_agg(to_jsonb(h)), '[]'::jsonb) from (select * from public.ss_homework h where h.school_id = p_school_id and h.cls = any (v_classes) order by h.due desc nulls last limit 200) h),
    'notices', (select coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb) from (select * from public.ss_notices where school_id = p_school_id order by notice_date desc nulls last, created_at desc limit 50) n),
    'exams', (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) from (select * from public.ss_exams e where e.school_id = p_school_id and e.cls = any (v_classes) order by e.exam_date desc nulls last limit 200) e),
    'marks', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from (select * from public.ss_marks m where m.school_id = p_school_id and m.student_id in (select s2.id from public.ss_students s2 where s2.school_id = p_school_id and s2.cls = any (v_classes)) order by m.updated_at desc limit 10000) m)
  );
end;
$function$;

-- 2. On-demand student photo. A cloud teacher fetches one student's
-- photo only when opening that student's profile. The student must be
-- in one of the teacher's classes; anything else is not_allowed (and a
-- bad/expired token is bad_token). Read-only, so STABLE.
create or replace function public.ss_teacher_student_photo(
  p_token uuid,
  p_student_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_owner record;
  v_photo text;
begin
  if p_token is null or p_student_id is null then
    return jsonb_build_object('ok', false);
  end if;
  select * into v_owner from public.ss_teacher_token_owner(p_token);
  if not found then return jsonb_build_object('ok', false, 'error', 'bad_token'); end if;
  select s.photo_data_url into v_photo
    from public.ss_students s
   where s.id = p_student_id and s.school_id = v_owner.school_id
     and exists (select 1 from public.ss_teachers t where t.id = v_owner.teacher_id and s.cls = any (coalesce(t.classes, '{}'::text[])));
  if not found then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  return jsonb_build_object('ok', true, 'photo_data_url', v_photo);
end;
$function$;

-- 3. Grants: revoke from every grantee first, then grant by full
-- signature (same pattern as SQL 17/18/23).
revoke all on function public.ss_teacher_cloud_login(uuid, text, text) from public;
revoke all on function public.ss_teacher_cloud_login(uuid, text, text) from anon;
revoke all on function public.ss_teacher_cloud_login(uuid, text, text) from authenticated;
grant execute on function public.ss_teacher_cloud_login(uuid, text, text) to anon, authenticated;
revoke all on function public.ss_teacher_student_photo(uuid, uuid) from public;
revoke all on function public.ss_teacher_student_photo(uuid, uuid) from anon;
revoke all on function public.ss_teacher_student_photo(uuid, uuid) from authenticated;
grant execute on function public.ss_teacher_student_photo(uuid, uuid) to anon, authenticated;
