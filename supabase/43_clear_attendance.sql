-- 43_clear_attendance.sql — v120 (Phase 5, Module 6): the mark-attendance
-- RPCs accept a 'Clear' status that DELETES the row, so a cloud teacher or
-- staff member can correct a wrong mark the same way the school device can
-- (the local delete queues a delete op, v102/v110). The marks RPCs already
-- delete on a null mark — this mirrors that precedent for attendance.
-- The Clear branch runs AFTER the same guards as a mark (token owner, the
-- class assignment, the student in this school+class), so it cannot delete
-- another school's rows. Signatures are unchanged, so the grant matrix is
-- untouched (still 49 functions, same grants).

-- Teacher: ss_teacher_mark_attendance (first created in SQL 18).
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

-- Staff: ss_staff_mark_attendance (first created in SQL 35).
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
