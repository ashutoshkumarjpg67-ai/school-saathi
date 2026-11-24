-- 54_drop_dob_pin_reset.sql — School Saathi v146: DOB-based parent PIN reset REMOVED
--
-- User decision 24 Nov 2026: the parent PIN is reset ONLY by the school
-- issuing a fresh random PIN (no SMS exists). The admission-number +
-- date-of-birth self-service is gone for both reasons it was unsafe:
--
-- * ss_parent_pin_reset_by_dob (SQL 37) let anyone who knew a student's
--   admission number and DOB — both known to classmates and teachers —
--   set that child's parent PIN to a value of their choosing and open
--   the parent dashboard (fees, attendance, marks, photos).
-- * ss_parent_pin_ok (SQL 40) accepted a DOB as proof to clear the
--   5-fail lockout. Its header said that "adds no new attack surface"
--   because the DOB already allowed a reset — that reasoning dies with
--   the reset: with the DOB route gone, a DOB alone would let an
--   attacker clear the lock and keep guessing PINs 5 at a time,
--   forever. The DOB proof is removed with it.
--
-- What replaces it (app v146):
-- * The school admin's student-profile PIN card gains "Generate new
--   PIN": a 6-digit random PIN (crypto random), shown ONCE to the admin
--   to share with the parent out-of-band (in person / phone / the
--   school's own WhatsApp). Only the salted hash is stored, locally
--   and on the server (the student upsert already carries parent_pin).
-- * ss_admin_reset_parent_pin below: the same reset for a student
--   whose record is not on the admin's device. It takes the PIN the
--   app generated, verifies the caller OWNS the school
--   (ss_school_owner = auth.uid(), super admin excepted), hashes the
--   PIN server-side, clears the lockout and audits. Authenticated
--   ONLY — never anon: the caller must hold the school's GoTrue
--   session token.
-- * New PINs are 6 digits. Existing 4-5 digit PINs keep working until
--   changed (grandfathered — reissuing every parent's PIN overnight
--   would lock the school out of its own parents).
--
-- Apply in the Supabase SQL Editor. Until this file is applied the
-- DOB RPC still exists on the server even though no app version calls
-- it — the hole closes only when this runs.

-- (1) The DOB reset itself: gone.
drop function if exists public.ss_parent_pin_reset_by_dob(uuid, text, date, text);

-- (2) ss_parent_pin_ok: drop the 4-arg version (SQL 40) and redefine it
-- with PIN proof only. A CREATE with a different signature would leave
-- the vulnerable 4-arg function live.
drop function if exists public.ss_parent_pin_ok(uuid, text, text, date);
create or replace function public.ss_parent_pin_ok(
  p_school_id uuid,
  p_admission_no text,
  p_pin text default null
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
  select s.id, s.parent_pin into v_stu from public.ss_students s
    where s.school_id = p_school_id
    and lower(trim(s.admission_no)) = lower(trim(p_admission_no));
  if not found then
    -- Unknown admission number: same silent ok as before (no enumeration).
    return jsonb_build_object('ok', true);
  end if;
  -- PIN proof: same verification as ss_student_cloud_login (SQL 33).
  -- No DOB proof anymore (see header): a DOB must never clear a lock.
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

revoke execute on function public.ss_parent_pin_ok(uuid, text, text) from public;
grant execute on function public.ss_parent_pin_ok(uuid, text, text) to anon, authenticated;

-- (3) Admin-issued reset: the school owner (or super admin) sets a
-- parent PIN the app generated. The PIN arrives over TLS, is hashed
-- here with pgcrypto bcrypt, and is never stored in plaintext.
create or replace function public.ss_admin_reset_parent_pin(
  p_school_id uuid,
  p_admission_no text,
  p_new_pin text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_stu record;
  v_new_hash text;
begin
  -- Only the school's owner (or the super admin) may reset a PIN for
  -- this school. An anon caller has no auth.uid() and is refused here.
  if public.ss_school_owner(p_school_id) is distinct from auth.uid()
    and not public.is_ss_admin() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select s.id, s.name, s.cls into v_stu from public.ss_students s
    where s.school_id = p_school_id
    and lower(trim(s.admission_no)) = lower(trim(p_admission_no));
  if not found then
    return jsonb_build_object('ok', false);
  end if;
  if p_new_pin is null or p_new_pin !~ '^[0-9]{6}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_pin');
  end if;
  v_new_hash := 'bcrypt$' || extensions.crypt(p_new_pin, extensions.gen_salt('bf', 10));
  update public.ss_students set parent_pin = v_new_hash, updated_at = now() where id = v_stu.id;
  delete from public.ss_parent_pin_attempts
    where school_id = p_school_id and admission_no = lower(trim(p_admission_no));
  insert into public.ss_audit_log (school_id, actor, action, details)
    values (p_school_id, 'school admin', 'Parent PIN reset (admin-issued)',
      'Admission ' || trim(p_admission_no) || ' • ' || coalesce(v_stu.cls, ''));
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.ss_admin_reset_parent_pin(uuid, text, text) from public;
grant execute on function public.ss_admin_reset_parent_pin(uuid, text, text) to authenticated;
