-- 58_wipe_school_complete.sql — School Saathi
-- Updates ss_wipe_school (SQL 05) to cover all 25 school-scoped tables
-- (including ss_staff, ss_holidays, ss_classes, ss_timetable, and session/attempt tables).
-- Apply in the Supabase dashboard SQL Editor (project bsjqeeeemwimzldrehpw).

create or replace function public.ss_wipe_school(p_school_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.ss_school_owner(p_school_id) is distinct from auth.uid()
     and not public.is_ss_admin() then
    raise exception 'not your school';
  end if;

  delete from public.ss_marks where school_id = p_school_id;
  delete from public.ss_attendance where school_id = p_school_id;
  delete from public.ss_fee_records where school_id = p_school_id;
  delete from public.ss_receipts where school_id = p_school_id;
  delete from public.ss_audit_log where school_id = p_school_id;
  delete from public.ss_activities where school_id = p_school_id;
  delete from public.ss_homework where school_id = p_school_id;
  delete from public.ss_notices where school_id = p_school_id;
  delete from public.ss_exams where school_id = p_school_id;
  delete from public.ss_teachers where school_id = p_school_id;
  delete from public.ss_admission_requests where school_id = p_school_id;
  delete from public.ss_support_requests where school_id = p_school_id;
  delete from public.ss_fee_structure where school_id = p_school_id;
  delete from public.ss_students where school_id = p_school_id;
  delete from public.ss_student_login_attempts where school_id = p_school_id;
  delete from public.ss_teacher_sessions where school_id = p_school_id;
  delete from public.ss_teacher_login_attempts where school_id = p_school_id;
  delete from public.ss_staff where school_id = p_school_id;
  delete from public.ss_staff_sessions where school_id = p_school_id;
  delete from public.ss_staff_login_attempts where school_id = p_school_id;
  delete from public.ss_parent_pin_attempts where school_id = p_school_id;
  delete from public.ss_holidays where school_id = p_school_id;
  delete from public.ss_timetable where school_id = p_school_id;
  delete from public.ss_classes where school_id = p_school_id;
  delete from public.ss_parent_sessions where school_id = p_school_id;
  delete from public.ss_schools where id = p_school_id;

  return jsonb_build_object('wiped', true, 'school_id', p_school_id);
end;
$$;

revoke all on function public.ss_wipe_school(uuid) from public;
revoke all on function public.ss_wipe_school(uuid) from anon;
grant execute on function public.ss_wipe_school(uuid) to authenticated;
