-- 48_attendance_date_guard.sql — v135 (audit fix): the mark-attendance
-- RPCs accepted ANY date, while the app UI refuses to mark a FUTURE
-- date. Anyone with a teacher/staff token could post marks for tomorrow
-- straight to the API. This mirrors the UI rule server-side: a mark
-- (Present/Absent/Late) may not be dated after today (Asia/Kolkata, the
-- app's timezone). 'Clear' stays allowed for any date — it only removes
-- a row, and a future-dated wrong mark must remain correctable.
-- Backdating stays allowed, exactly as the UI allows it today; no new
-- attendance policy is invented here.
--
-- Both functions are replaced in full (same signatures, same grants as
-- SQL 43). Run ONLY against the School Saathi project
-- (bsjqeeeemwimzldrehpw). Idempotent: safe to re-run.

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
  -- v135: no future-dated marks (the UI already blocks them); Clear exempt.
  if p_status <> 'Clear' and p_date > (now() at time zone 'Asia/Kolkata')::date then
    return jsonb_build_object('ok', false, 'error', 'bad_date');
  end if;
  select exists(select 1 from public.ss_teachers t where t.id = v_owner.teacher_id and p_cls = any (coalesce(t.classes, '{}'))) into v_ok;
  if not v_ok then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  select exists(select 1 from public.ss_students s where s.id = p_student_id and s.school_id = v_owner.school_id and s.cls = p_cls) into v_ok;
  if not v_ok then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  if p_status = 'Clear' then
    delete from public.ss_attendance
    where school_id = v_owner.school_id and att_date = p_date and cls = p_cls and student_id = p_student_id;
    return jsonb_build_object('ok', true);
  end if;
  if p_status not in ('Present', 'Absent', 'Late') then return jsonb_build_object('ok', false, 'error', 'bad_status'); end if;
  insert into public.ss_attendance (school_id, att_date, cls, student_id, status)
  values (v_owner.school_id, p_date, p_cls, p_student_id, p_status)
  on conflict (school_id, att_date, cls, student_id) do update set status = excluded.status, updated_at = now();
  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function public.ss_teacher_mark_attendance(uuid, date, text, uuid, text) from public;
revoke all on function public.ss_teacher_mark_attendance(uuid, date, text, uuid, text) from anon;
revoke all on function public.ss_teacher_mark_attendance(uuid, date, text, uuid, text) from authenticated;
grant execute on function public.ss_teacher_mark_attendance(uuid, date, text, uuid, text) to anon, authenticated;

create or replace function public.ss_staff_mark_attendance(
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
  select * into v_owner from public.ss_staff_token_owner(p_token);
  if not found then return jsonb_build_object('ok', false, 'error', 'bad_token'); end if;
  if v_owner.role <> 'staff' then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  -- v135: no future-dated marks (the UI already blocks them); Clear exempt.
  if p_status <> 'Clear' and p_date > (now() at time zone 'Asia/Kolkata')::date then
    return jsonb_build_object('ok', false, 'error', 'bad_date');
  end if;
  select exists(select 1 from public.ss_staff st where st.id = v_owner.staff_id and p_cls = any (coalesce(st.classes, '{}'))) into v_ok;
  if not v_ok then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  select exists(select 1 from public.ss_students s where s.id = p_student_id and s.school_id = v_owner.school_id and s.cls = p_cls) into v_ok;
  if not v_ok then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  if p_status = 'Clear' then
    delete from public.ss_attendance
    where school_id = v_owner.school_id and att_date = p_date and cls = p_cls and student_id = p_student_id;
    return jsonb_build_object('ok', true);
  end if;
  if p_status not in ('Present', 'Absent', 'Late') then return jsonb_build_object('ok', false, 'error', 'bad_status'); end if;
  insert into public.ss_attendance (school_id, att_date, cls, student_id, status)
  values (v_owner.school_id, p_date, p_cls, p_student_id, p_status)
  on conflict (school_id, att_date, cls, student_id) do update set status = excluded.status, updated_at = now();
  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function public.ss_staff_mark_attendance(uuid, date, text, uuid, text) from public;
revoke all on function public.ss_staff_mark_attendance(uuid, date, text, uuid, text) from anon;
revoke all on function public.ss_staff_mark_attendance(uuid, date, text, uuid, text) from authenticated;
grant execute on function public.ss_staff_mark_attendance(uuid, date, text, uuid, text) to anon, authenticated;
