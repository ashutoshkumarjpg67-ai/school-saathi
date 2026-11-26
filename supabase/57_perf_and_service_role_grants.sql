-- 57_perf_and_service_role_grants.sql — School Saathi
-- Applied live on bsjqeeeemwimzldrehpw (26 Nov 2026):
--   1. Fix mutable search_path on public.ss_touch_updated_at()
--   2. Grant service_role table privileges required by delete-account Edge Function
--   3. Optimize 22 RLS policies to use (select auth.uid()) (fixes auth_rls_initplan)
--   4. Add covering indexes on 6 unindexed foreign keys

-- 1. Function search_path hardening
alter function public.ss_touch_updated_at() set search_path = '';

-- 2. service_role grants for delete-account Edge Function
grant select, insert, update, delete on
  public.ss_marks,
  public.ss_attendance,
  public.ss_fee_records,
  public.ss_receipts,
  public.ss_audit_log,
  public.ss_activities,
  public.ss_homework,
  public.ss_notices,
  public.ss_exams,
  public.ss_teachers,
  public.ss_admission_requests,
  public.ss_support_requests,
  public.ss_fee_structure,
  public.ss_students,
  public.ss_student_login_attempts,
  public.ss_teacher_sessions,
  public.ss_teacher_login_attempts,
  public.ss_staff,
  public.ss_staff_sessions,
  public.ss_staff_login_attempts,
  public.ss_parent_pin_attempts,
  public.ss_holidays,
  public.ss_timetable,
  public.ss_classes,
  public.ss_parent_sessions,
  public.ss_schools,
  public.ss_school_login_attempts,
  public.ss_platform_admins
to service_role;

-- 3. Optimize 22 RLS policies in-place with (select auth.uid())
do $$
declare
  tbl text;
  pol text;
begin
  for tbl in
    select unnest(array[
      'ss_activities','ss_attendance','ss_audit_log','ss_classes','ss_exams',
      'ss_fee_records','ss_fee_structure','ss_holidays','ss_homework','ss_marks',
      'ss_notices','ss_receipts','ss_staff','ss_students','ss_teachers','ss_timetable'
    ])
  loop
    pol := 'ss_owner_all_' || tbl;
    execute format(
      'alter policy %I on public.%I using ((public.ss_school_owner(school_id) = (select auth.uid())) or public.is_ss_admin()) with check ((public.ss_school_owner(school_id) = (select auth.uid())) or public.is_ss_admin())',
      pol, tbl
    );
  end loop;
end $$;

alter policy ss_admreq_owner_all on public.ss_admission_requests
  using ((public.ss_school_owner(school_id) = (select auth.uid())) or public.is_ss_admin())
  with check ((public.ss_school_owner(school_id) = (select auth.uid())) or public.is_ss_admin());

alter policy ss_schools_owner_insert on public.ss_schools
  with check (owner_id = (select auth.uid()));

alter policy ss_schools_owner_read on public.ss_schools
  using ((owner_id = (select auth.uid())) or public.is_ss_admin());

alter policy ss_schools_owner_update on public.ss_schools
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

alter policy ss_support_school_insert on public.ss_support_requests
  with check ((public.ss_school_owner(school_id) = (select auth.uid())) and (status = 'Pending'::text));

alter policy ss_support_school_select on public.ss_support_requests
  using (public.ss_school_owner(school_id) = (select auth.uid()));

-- 4. Covering indexes on 6 unindexed foreign keys
create index if not exists ss_admission_requests_student_id_idx on public.ss_admission_requests (student_id);
create index if not exists ss_attendance_student_id_idx on public.ss_attendance (student_id);
create index if not exists ss_marks_student_id_idx on public.ss_marks (student_id);
create index if not exists ss_parent_sessions_school_id_idx on public.ss_parent_sessions (school_id);
create index if not exists ss_platform_admins_granted_by_idx on public.ss_platform_admins (granted_by);
create index if not exists ss_support_requests_submitted_by_idx on public.ss_support_requests (submitted_by);
