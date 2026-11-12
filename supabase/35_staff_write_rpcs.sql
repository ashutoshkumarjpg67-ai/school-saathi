-- SQL 35 — Staff cloud write RPCs (v98, cons fix).
--
-- The gap (found during the v97 investigation): a cloud STAFF member's
-- attendance, homework and marks NEVER reached the server. markAtt /
-- saveAttendance / saveMarks / saveHomework only ever checked
-- state.cloudTeacherToken; a staff login sets state.cloudStaffToken,
-- which no write path read — and sbSyncActive() is null for staff, so
-- the outbox never queued their local saves either. Their marks lived
-- only in the device's localStorage slice (schoolSaathiCloudDB). The one
-- server row that exists (V21 Absent, 11 Nov) arrived ~2h late through
-- an unclear shared-browser path, not a designed sync.
--
-- These three RPCs mirror the teacher write RPCs (SQL 18) exactly, but
-- resolve the token via ss_staff_token_owner and enforce role = 'staff'
-- plus class membership from ss_staff.classes. Principals are read-only
-- and accountants have no attendance/marks/homework, so they never call
-- these — the role check is a backstop, not the app's only gate.
-- The revoke RPC already exists (SQL 30 ss_staff_revoke_session); the
-- app just never called it — v98 wires that up too (logout).
--
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
  if p_status not in ('Present', 'Absent', 'Late') then return jsonb_build_object('ok', false, 'error', 'bad_status'); end if;
  select exists(select 1 from public.ss_staff st where st.id = v_owner.staff_id and p_cls = any (coalesce(st.classes, '{}'))) into v_ok;
  if not v_ok then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  select exists(select 1 from public.ss_students s where s.id = p_student_id and s.school_id = v_owner.school_id and s.cls = p_cls) into v_ok;
  if not v_ok then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  insert into public.ss_attendance (school_id, att_date, cls, student_id, status)
  values (v_owner.school_id, p_date, p_cls, p_student_id, p_status)
  on conflict (school_id, att_date, cls, student_id) do update set status = excluded.status, updated_at = now();
  return jsonb_build_object('ok', true);
end;
$function$;

create or replace function public.ss_staff_post_homework(
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
  select * into v_owner from public.ss_staff_token_owner(p_token);
  if not found then return jsonb_build_object('ok', false, 'error', 'bad_token'); end if;
  if v_owner.role <> 'staff' then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  if p_title is null or trim(p_title) = '' or p_local_id is null or trim(p_local_id) = '' then return jsonb_build_object('ok', false, 'error', 'bad_input'); end if;
  select exists(select 1 from public.ss_staff st where st.id = v_owner.staff_id and p_cls = any (coalesce(st.classes, '{}'))) into v_ok;
  if not v_ok then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  insert into public.ss_homework (school_id, local_id, cls, subject, title, due, done_by)
  values (v_owner.school_id, p_local_id, p_cls, coalesce(p_subject, ''), trim(p_title), p_due, '{}'::uuid[])
  returning * into v_row;
  return jsonb_build_object('ok', true, 'row', to_jsonb(v_row));
end;
$function$;

create or replace function public.ss_staff_set_marks(
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
  select * into v_owner from public.ss_staff_token_owner(p_token);
  if not found then return jsonb_build_object('ok', false, 'error', 'bad_token'); end if;
  if v_owner.role <> 'staff' then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  select e.id, e.cls, e.total into v_exam from public.ss_exams e where e.id = p_exam_id and e.school_id = v_owner.school_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  if not exists(select 1 from public.ss_staff st where st.id = v_owner.staff_id and v_exam.cls = any (coalesce(st.classes, '{}'))) then
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

-- Grants: anonymous staff members must be able to call these functions.
-- Revoke from every grantee first, then grant by full signature.
revoke all on function public.ss_staff_mark_attendance(uuid, date, text, uuid, text) from public;
revoke all on function public.ss_staff_mark_attendance(uuid, date, text, uuid, text) from anon;
revoke all on function public.ss_staff_mark_attendance(uuid, date, text, uuid, text) from authenticated;
grant execute on function public.ss_staff_mark_attendance(uuid, date, text, uuid, text) to anon, authenticated;
revoke all on function public.ss_staff_post_homework(uuid, text, text, text, date, text) from public;
revoke all on function public.ss_staff_post_homework(uuid, text, text, text, date, text) from anon;
revoke all on function public.ss_staff_post_homework(uuid, text, text, text, date, text) from authenticated;
grant execute on function public.ss_staff_post_homework(uuid, text, text, text, date, text) to anon, authenticated;
revoke all on function public.ss_staff_set_marks(uuid, uuid, jsonb) from public;
revoke all on function public.ss_staff_set_marks(uuid, uuid, jsonb) from anon;
revoke all on function public.ss_staff_set_marks(uuid, uuid, jsonb) from authenticated;
grant execute on function public.ss_staff_set_marks(uuid, uuid, jsonb) to anon, authenticated;
