-- Branch preparation only. Apply to an isolated restore first, never auto-repair data.
-- Existing mismatches abort this transaction. Old single-column FKs retain
-- their CASCADE / SET NULL semantics; deferred composite checks run at commit.
begin;
create unique index if not exists ss_students_school_id_id_key on public.ss_students(school_id,id);
create unique index if not exists ss_exams_school_id_id_key on public.ss_exams(school_id,id);
create unique index if not exists ss_teachers_school_id_id_key on public.ss_teachers(school_id,id);
create unique index if not exists ss_staff_school_id_id_key on public.ss_staff(school_id,id);
do $guard$ begin
  if not exists (select 1 from pg_constraint where conname='ss_fee_records_student_id_tenant_fk' and conrelid='public.ss_fee_records'::regclass) then
    alter table public.ss_fee_records add constraint ss_fee_records_student_id_tenant_fk
      foreign key(school_id,student_id) references public.ss_students(school_id,id)
      deferrable initially deferred not valid;
  end if;
end $guard$;
alter table public.ss_fee_records validate constraint ss_fee_records_student_id_tenant_fk;
do $guard$ begin
  if not exists (select 1 from pg_constraint where conname='ss_attendance_student_id_tenant_fk' and conrelid='public.ss_attendance'::regclass) then
    alter table public.ss_attendance add constraint ss_attendance_student_id_tenant_fk
      foreign key(school_id,student_id) references public.ss_students(school_id,id)
      deferrable initially deferred not valid;
  end if;
end $guard$;
alter table public.ss_attendance validate constraint ss_attendance_student_id_tenant_fk;
do $guard$ begin
  if not exists (select 1 from pg_constraint where conname='ss_receipts_student_id_tenant_fk' and conrelid='public.ss_receipts'::regclass) then
    alter table public.ss_receipts add constraint ss_receipts_student_id_tenant_fk
      foreign key(school_id,student_id) references public.ss_students(school_id,id)
      deferrable initially deferred not valid;
  end if;
end $guard$;
alter table public.ss_receipts validate constraint ss_receipts_student_id_tenant_fk;
do $guard$ begin
  if not exists (select 1 from pg_constraint where conname='ss_admission_requests_student_id_tenant_fk' and conrelid='public.ss_admission_requests'::regclass) then
    alter table public.ss_admission_requests add constraint ss_admission_requests_student_id_tenant_fk
      foreign key(school_id,student_id) references public.ss_students(school_id,id)
      deferrable initially deferred not valid;
  end if;
end $guard$;
alter table public.ss_admission_requests validate constraint ss_admission_requests_student_id_tenant_fk;
do $guard$ begin
  if not exists (select 1 from pg_constraint where conname='ss_marks_student_id_tenant_fk' and conrelid='public.ss_marks'::regclass) then
    alter table public.ss_marks add constraint ss_marks_student_id_tenant_fk
      foreign key(school_id,student_id) references public.ss_students(school_id,id)
      deferrable initially deferred not valid;
  end if;
end $guard$;
alter table public.ss_marks validate constraint ss_marks_student_id_tenant_fk;
do $guard$ begin
  if not exists (select 1 from pg_constraint where conname='ss_marks_exam_id_tenant_fk' and conrelid='public.ss_marks'::regclass) then
    alter table public.ss_marks add constraint ss_marks_exam_id_tenant_fk
      foreign key(school_id,exam_id) references public.ss_exams(school_id,id)
      deferrable initially deferred not valid;
  end if;
end $guard$;
alter table public.ss_marks validate constraint ss_marks_exam_id_tenant_fk;
do $guard$ begin
  if not exists (select 1 from pg_constraint where conname='ss_teacher_sessions_teacher_id_tenant_fk' and conrelid='public.ss_teacher_sessions'::regclass) then
    alter table public.ss_teacher_sessions add constraint ss_teacher_sessions_teacher_id_tenant_fk
      foreign key(school_id,teacher_id) references public.ss_teachers(school_id,id) on delete cascade
      deferrable initially deferred not valid;
  end if;
end $guard$;
alter table public.ss_teacher_sessions validate constraint ss_teacher_sessions_teacher_id_tenant_fk;
do $guard$ begin
  if not exists (select 1 from pg_constraint where conname='ss_staff_sessions_staff_id_tenant_fk' and conrelid='public.ss_staff_sessions'::regclass) then
    alter table public.ss_staff_sessions add constraint ss_staff_sessions_staff_id_tenant_fk
      foreign key(school_id,staff_id) references public.ss_staff(school_id,id) on delete cascade
      deferrable initially deferred not valid;
  end if;
end $guard$;
alter table public.ss_staff_sessions validate constraint ss_staff_sessions_staff_id_tenant_fk;
commit;
