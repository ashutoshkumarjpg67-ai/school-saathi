-- SQL 44 pre-flight mismatch inventory (security-branch fix 8).
--
-- Read-only. Run BEFORE "validate constraint" in SQL 44, against a
-- production dump/restore in staging — never with writes against live
-- production. PASS iff every mismatch_count is 0.
-- FAIL on any count > 0: STOP, do not run VALIDATE CONSTRAINT
-- (validation aborts the transaction); investigate each mismatched row
-- individually (re-point, archive, or delete only with explicit approval).
-- Never bulk-delete rows to make validation pass.
--
-- NULL student_id rows in fee/receipt/admission tables are legal (archived
-- rows after ON DELETE SET NULL) and are excluded by the IS NOT NULL filter.
-- The composite (school_id, student_id) match catches BOTH dangling IDs
-- AND cross-school references (a student who exists under another school);
-- a single-column student_id check would miss the latter.
--
-- Same queries are asserted clean in tests/security/runtime-fixtures.sql
-- and detection-tested (seeded mismatches are caught) in
-- scripts/test-security-sql.mjs. The production-data run stays a gated
-- rollout step: it needs the user's separate go-ahead.
--
-- How to run (staging restore only):
--   psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/check-tenant-mismatch.sql

-- Summary form: one row per check, all zeros when clean (the gate form).
select 'ss_fee_records.student'        as check_name, count(*) as mismatch_count
  from public.ss_fee_records f
 where f.student_id is not null
   and not exists (select 1 from public.ss_students s
                    where s.school_id = f.school_id and s.id = f.student_id)
union all
select 'ss_attendance.student', count(*)
  from public.ss_attendance a
 where not exists (select 1 from public.ss_students s
                    where s.school_id = a.school_id and s.id = a.student_id)
union all
select 'ss_receipts.student', count(*)
  from public.ss_receipts r
 where r.student_id is not null
   and not exists (select 1 from public.ss_students s
                    where s.school_id = r.school_id and s.id = r.student_id)
union all
select 'ss_admission_requests.student', count(*)
  from public.ss_admission_requests ar
 where ar.student_id is not null
   and not exists (select 1 from public.ss_students s
                    where s.school_id = ar.school_id and s.id = ar.student_id)
union all
select 'ss_marks.student', count(*)
  from public.ss_marks m
 where not exists (select 1 from public.ss_students s
                    where s.school_id = m.school_id and s.id = m.student_id)
union all
select 'ss_marks.exam', count(*)
  from public.ss_marks m
 where not exists (select 1 from public.ss_exams e
                    where e.school_id = m.school_id and e.id = m.exam_id)
union all
select 'ss_teacher_sessions.teacher', count(*)
  from public.ss_teacher_sessions t
 where not exists (select 1 from public.ss_teachers te
                    where te.school_id = t.school_id and te.id = t.teacher_id)
union all
select 'ss_staff_sessions.staff', count(*)
  from public.ss_staff_sessions st
 where not exists (select 1 from public.ss_staff sf
                    where sf.school_id = st.school_id and sf.id = st.staff_id)
order by check_name;

-- Gate assertion form (single boolean): true means clean.
select count(*) = 0 as sql44_preflight_clean
from (
  select 1 from public.ss_fee_records f
   where f.student_id is not null
     and not exists (select 1 from public.ss_students s
                      where s.school_id = f.school_id and s.id = f.student_id)
  union all
  select 1 from public.ss_attendance a
   where not exists (select 1 from public.ss_students s
                      where s.school_id = a.school_id and s.id = a.student_id)
  union all
  select 1 from public.ss_receipts r
   where r.student_id is not null
     and not exists (select 1 from public.ss_students s
                      where s.school_id = r.school_id and s.id = r.student_id)
  union all
  select 1 from public.ss_admission_requests ar
   where ar.student_id is not null
     and not exists (select 1 from public.ss_students s
                      where s.school_id = ar.school_id and s.id = ar.student_id)
  union all
  select 1 from public.ss_marks m
   where not exists (select 1 from public.ss_students s
                      where s.school_id = m.school_id and s.id = m.student_id)
  union all
  select 1 from public.ss_marks m
   where not exists (select 1 from public.ss_exams e
                      where e.school_id = m.school_id and e.id = m.exam_id)
  union all
  select 1 from public.ss_teacher_sessions t
   where not exists (select 1 from public.ss_teachers te
                      where te.school_id = t.school_id and te.id = t.teacher_id)
  union all
  select 1 from public.ss_staff_sessions st
   where not exists (select 1 from public.ss_staff sf
                      where sf.school_id = st.school_id and sf.id = st.staff_id)
) scan;

-- Detail form: returns the offending rows (zero rows when clean).
-- Run one per table; same pattern for the rest.
select f.id, f.school_id, f.student_id, f.student_name, f.cls, f.month
  from public.ss_fee_records f
 where f.student_id is not null
   and not exists (select 1 from public.ss_students s
                    where s.school_id = f.school_id and s.id = f.student_id);
select a.id, a.school_id, a.student_id, a.att_date, a.cls
  from public.ss_attendance a
 where not exists (select 1 from public.ss_students s
                    where s.school_id = a.school_id and s.id = a.student_id);
select r.id, r.school_id, r.student_id, r.receipt_no, r.student_name
  from public.ss_receipts r
 where r.student_id is not null
   and not exists (select 1 from public.ss_students s
                    where s.school_id = r.school_id and s.id = r.student_id);
select ar.id, ar.school_id, ar.student_id, ar.name, ar.status
  from public.ss_admission_requests ar
 where ar.student_id is not null
   and not exists (select 1 from public.ss_students s
                    where s.school_id = ar.school_id and s.id = ar.student_id);
select m.id, m.school_id, m.student_id, m.exam_id
  from public.ss_marks m
 where not exists (select 1 from public.ss_students s
                    where s.school_id = m.school_id and s.id = m.student_id);
select m.id, m.school_id, m.exam_id, m.student_id
  from public.ss_marks m
 where not exists (select 1 from public.ss_exams e
                    where e.school_id = m.school_id and e.id = m.exam_id);
select t.id, t.school_id, t.teacher_id
  from public.ss_teacher_sessions t
 where not exists (select 1 from public.ss_teachers te
                    where te.school_id = t.school_id and te.id = t.teacher_id);
select st.id, st.school_id, st.staff_id
  from public.ss_staff_sessions st
 where not exists (select 1 from public.ss_staff sf
                    where sf.school_id = st.school_id and sf.id = st.staff_id);
