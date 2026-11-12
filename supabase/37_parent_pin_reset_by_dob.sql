-- 37_parent_pin_reset_by_dob.sql — parent PIN self-service via date of birth (v99)
--
-- Parents have no SMS/email route to reset a forgotten PIN, so the
-- safe self-service is admission number + the student's date of birth
-- (both already on file). This RPC verifies the DOB server-side and
-- sets a new PIN, so the check can never be bypassed by editing the
-- app. The local parent-PIN reset (same DOB check against the record
-- on the device) covers schools that are not server-linked; the cloud
-- path always goes through this RPC.
--
-- Rules:
-- * Unknown admission numbers return ok:false WITHOUT recording a
--   failure (no enumeration, no junk-row flood).
-- * A locked admission number (5 wrong PINs/DOBs, SQL 36) cannot reset
--   until the 15-minute lock expires.
-- * A student with no DOB on file cannot use this route — the RPC
--   returns error 'no_dob' and the parent must ask the school admin
--   (the admin's Set PIN already exists in the app).
-- * A wrong DOB records a failure through ss_parent_pin_failed, so
--   DOB guessing is rate-limited exactly like PIN guessing.
-- * The new PIN must be 4-6 digits; it is hashed server-side with
--   pgcrypto (bcrypt$ + $2a$ salt, the same scheme the app mints) and
--   stored in ss_students.parent_pin — the plaintext PIN is never
--   stored. A successful reset clears the attempts row and writes an
--   audit row so the school admin sees the reset.
-- * CREATE FUNCTION grants EXECUTE to PUBLIC by default — revoked
--   explicitly below; only anon + authenticated remain (verify live
--   after applying).

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
  if v_stu.dob <> p_dob then
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

revoke execute on function public.ss_parent_pin_reset_by_dob(uuid, text, date, text) from public;
grant execute on function public.ss_parent_pin_reset_by_dob(uuid, text, date, text) to anon, authenticated;
