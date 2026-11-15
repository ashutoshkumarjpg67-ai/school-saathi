-- SQL 44: principal cloud payload gains the audit log (Phase 5, Module 16 fix, v130)
-- The v129 live check (15 Nov 2026) found the principal's Activity Log EMPTY
-- on a cloud login: ss_staff_cloud_login (SQL 30) never returned audit rows,
-- and mapCloudStaffPayload never set d.auditLog, so the principal saw
-- "Showing 0 of 0 records" even though the school has 87+ audit rows.
-- This redefines ss_staff_cloud_login with an 'audit_log' key (ts, actor,
-- action, details - newest first, limit 500) in the PRINCIPAL payload only;
-- the principal is the only staff role with Activity Log access (PERMS).
-- The accountant and staff payloads are UNCHANGED. Idempotent: safe to re-run.
-- Grants are re-asserted (create or replace keeps them, but the SQL 30/41
-- pattern re-asserts the grant block after every redefinition).
--
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
      'teachers', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select t.id, t.local_id, t.name, t.subject, t.cls, t.classes from public.ss_teachers t where t.school_id = p_school_id order by t.name limit 500) t),
      'attendance', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from (select * from public.ss_attendance a where a.school_id = p_school_id and a.att_date >= current_date - interval '90 days' order by a.att_date desc limit 5000) a),
      'homework', (select coalesce(jsonb_agg(to_jsonb(h)), '[]'::jsonb) from (select * from public.ss_homework h where h.school_id = p_school_id order by h.created_at desc limit 200) h),
      'notices', (select coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb) from (select * from public.ss_notices where school_id = p_school_id order by notice_date desc nulls last, created_at desc limit 50) n),
      'exams', (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) from (select * from public.ss_exams e where e.school_id = p_school_id order by e.exam_date desc limit 200) e),
      'marks', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from (select * from public.ss_marks m where m.school_id = p_school_id order by m.updated_at desc limit 10000) m),
      'fee_records', (select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) from (select * from public.ss_fee_records f where f.school_id = p_school_id order by f.created_at desc limit 5000) f),
      'fee_structure', (select coalesce(jsonb_agg(to_jsonb(fs)), '[]'::jsonb) from public.ss_fee_structure fs where fs.school_id = p_school_id),
      'audit_log', (select coalesce(jsonb_agg(to_jsonb(au)), '[]'::jsonb) from (select au.ts, au.actor, au.action, au.details from public.ss_audit_log au where au.school_id = p_school_id order by au.ts desc limit 500) au)
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
-- Grants (same as SQL 30): anonymous staff members must be able to call login.
revoke all on function public.ss_staff_cloud_login(uuid, text, text) from public;
revoke all on function public.ss_staff_cloud_login(uuid, text, text) from anon;
revoke all on function public.ss_staff_cloud_login(uuid, text, text) from authenticated;
grant execute on function public.ss_staff_cloud_login(uuid, text, text) to anon, authenticated;
