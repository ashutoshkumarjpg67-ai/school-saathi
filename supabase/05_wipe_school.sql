-- 05_wipe_school.sql — School Saathi v34 (P1-5).
-- Server-side wipe for Reset All Data. The app's device-only reset used to
-- lie on server accounts ("permanently deletes ALL school data") because the
-- server copy returned on the next sync. v34 offers a real server wipe
-- behind the same double gate (password + exact school name).
--
-- Why a function: the owner cannot DELETE the ss_schools row directly —
-- that RLS policy is admin-only (02_rls.sql) — and a client-side delete
-- of every child row would be slow and partial on failure. This SECURITY
-- DEFINER function deletes every school-scoped row in one transaction,
-- ownership-checked (caller must own the school or be a platform admin).
-- Idempotent: wiping an already-empty school is a no-op that returns
-- { wiped: true }.
-- Apply AFTER v34 ships (the app calls rpc/ss_wipe_school).

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

  -- Child rows first (marks/attendance/fee records reference students and
  -- exams), the school row last.
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
  delete from public.ss_schools where id = p_school_id;

  return jsonb_build_object('wiped', true, 'school_id', p_school_id);
end;
$$;

grant execute on function public.ss_wipe_school(uuid) to authenticated;
