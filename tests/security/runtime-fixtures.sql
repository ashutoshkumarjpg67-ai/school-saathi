-- SYNTHETIC ONLY. Run by scripts/test-security-sql.mjs in a dedicated local DB.
create function public.test_assert(ok boolean,label text) returns void language plpgsql as $$ begin
 if ok is distinct from true then raise exception 'FAIL %',label; end if;
 raise notice 'PASS %',label;
end $$;
insert into auth.users(id,email) values
 ('aaaaaaaa-0000-4000-8000-000000000001','owner-a@example.invalid'),
 ('aaaaaaaa-0000-4000-8000-000000000002','owner-b@example.invalid');
insert into public.ss_schools(id,owner_id,name) values
 ('aaaaaaaa-1111-4111-8111-000000000001','aaaaaaaa-0000-4000-8000-000000000001','Synthetic A'),
 ('aaaaaaaa-1111-4111-8111-000000000002','aaaaaaaa-0000-4000-8000-000000000002','Synthetic B');
insert into public.ss_students(id,school_id,local_id,name,cls,admission_no,parent_pin,dob,photo_url,address,aadhaar) values
 ('aaaaaaaa-2222-4222-8222-000000000001','aaaaaaaa-1111-4111-8111-000000000001','stu1','Synthetic A1','1-A','A1','1234','2015-01-01','https://example.invalid/storage/v1/object/public/student-photos/aaaaaaaa-1111-4111-8111-000000000001/stu1.jpg','SYNTHETIC ONLY','000000001234'),
 ('aaaaaaaa-2222-4222-8222-000000000002','aaaaaaaa-1111-4111-8111-000000000001','stu2','Synthetic A2','2-A','A2','1234',null,null,'SYNTHETIC ONLY',null),
 ('aaaaaaaa-2222-4222-8222-000000000003','aaaaaaaa-1111-4111-8111-000000000002','stu3','Synthetic B1','1-A','B1','1234','2015-01-01',null,'SYNTHETIC ONLY',null);
insert into public.ss_teachers(id,school_id,name,email,classes,pw_hash) values
 ('aaaaaaaa-3333-4333-8333-000000000001','aaaaaaaa-1111-4111-8111-000000000001','Synthetic Teacher','teacher@example.invalid',array['1-A'],'bcrypt$'||extensions.crypt('synthetic-password',extensions.gen_salt('bf',4)));
insert into public.ss_teacher_sessions(token,teacher_id,school_id,expires_at) values
 ('aaaaaaaa-4444-4444-8444-000000000001','aaaaaaaa-3333-4333-8333-000000000001','aaaaaaaa-1111-4111-8111-000000000001',now()+interval '1 day');
insert into public.ss_staff(id,school_id,name,role,classes) values
 ('aaaaaaaa-5555-4555-8555-000000000001','aaaaaaaa-1111-4111-8111-000000000001','Synthetic Principal','principal','{}'),
 ('aaaaaaaa-5555-4555-8555-000000000002','aaaaaaaa-1111-4111-8111-000000000001','Synthetic Staff','staff',array['1-A']),
 ('aaaaaaaa-5555-4555-8555-000000000003','aaaaaaaa-1111-4111-8111-000000000001','Synthetic Accountant','accountant','{}');
insert into public.ss_staff_sessions(token,staff_id,school_id,expires_at)
 select ('aaaaaaaa-6666-4666-8666-'||right(id::text,12))::uuid,id,school_id,now()+interval '1 day' from public.ss_staff;
create function public.test_photo(kind text,student_no int,token_no int default 1,owner_no int default 1) returns jsonb language sql as $$
 select public.ss_private_photo_source(
 ('aaaaaaaa-2222-4222-8222-'||lpad(student_no::text,12,'0'))::uuid,kind,
 (case when kind='teacher' then 'aaaaaaaa-4444-4444-8444-' when kind='staff' then 'aaaaaaaa-6666-4666-8666-' else 'aaaaaaaa-7777-4777-8777-' end||lpad(token_no::text,12,'0'))::uuid,
 ('aaaaaaaa-0000-4000-8000-'||lpad(owner_no::text,12,'0'))::uuid);
$$;
select public.test_assert(public.test_photo('owner',1) is not null,'owner own school allowed');
select public.test_assert(public.test_photo('owner',3) is null,'owner other school denied');
select public.test_assert(public.test_photo('teacher',1) is not null,'teacher assigned class allowed');
select public.test_assert(public.test_photo('teacher',2) is null,'teacher other class denied');
select public.test_assert(public.test_photo('teacher',3) is null,'teacher other school denied');
select public.test_assert(public.test_photo('staff',2,1) is not null,'principal school wide allowed');
select public.test_assert(public.test_photo('staff',3,1) is null,'principal other school denied');
select public.test_assert(public.test_photo('staff',1,2) is not null,'staff assigned class allowed');
select public.test_assert(public.test_photo('staff',2,2) is null,'staff other class denied');
select public.test_assert(public.test_photo('staff',1,3) is null,'accountant denied photos');
update public.ss_teachers set deleted=true;
select public.test_assert(public.test_photo('teacher',1) is null,'deleted teacher denied');
update public.ss_teachers set deleted=false;
update public.ss_staff set deleted=true where role='principal';
select public.test_assert(public.test_photo('staff',1,1) is null,'deleted principal denied');
update public.ss_staff set deleted=false;
update public.ss_teacher_sessions set expires_at=now()-interval '1 second';
select public.test_assert(public.test_photo('teacher',1) is null,'expired teacher denied');
update public.ss_teacher_sessions set expires_at=now()+interval '1 day';
update public.ss_staff_sessions set expires_at=now()-interval '1 second' where staff_id='aaaaaaaa-5555-4555-8555-000000000002';
select public.test_assert(public.test_photo('staff',1,2) is null,'expired staff denied');
update public.ss_staff_sessions set expires_at=now()+interval '1 day';
select public.test_assert(not has_function_privilege('anon','public.ss_private_photo_source(uuid,text,uuid,uuid)','execute'),'anon cannot call broker');
select public.test_assert(not has_function_privilege('authenticated','public.ss_private_photo_source(uuid,text,uuid,uuid)','execute'),'authenticated cannot impersonate owner via broker');
select public.test_assert(has_function_privilege('service_role','public.ss_private_photo_source(uuid,text,uuid,uuid)','execute'),'service role can call broker');
set role service_role;
select public.test_assert(public.test_photo('teacher',1) is not null,'actual service role can execute scoped broker');
reset role;
set role anon;
do $$ begin
 begin perform public.ss_private_photo_source('aaaaaaaa-2222-4222-8222-000000000001','owner',null,'aaaaaaaa-0000-4000-8000-000000000001');
 raise exception 'FAIL anonymous broker invocation accepted';
 exception when insufficient_privilege then raise notice 'PASS actual anonymous broker invocation denied'; end;
end $$;
reset role;
-- Existing SQL40 safety regressions use only synthetic rows.
select public.test_assert(not (public.ss_parent_pin_reset_by_dob('aaaaaaaa-1111-4111-8111-000000000001','A1',null,'9999')->>'ok')::boolean,'NULL supplied DOB cannot reset PIN');
select public.test_assert(not (public.ss_parent_pin_reset_by_dob('aaaaaaaa-1111-4111-8111-000000000001','A2','2015-01-01','9999')->>'ok')::boolean,'NULL stored DOB cannot reset PIN');
select public.ss_parent_pin_failed('aaaaaaaa-1111-4111-8111-000000000001','A1');
select public.ss_parent_pin_ok('aaaaaaaa-1111-4111-8111-000000000001','A1','wrong',null);
select public.test_assert(exists(select 1 from public.ss_parent_pin_attempts where admission_no='a1'),'wrong proof does not clear lockout attempts');
-- Student/parent own-photo session inherits the established PIN login.
do $$ declare v jsonb; tok uuid; before_count int; begin
 v:=public.ss_student_photo_login('aaaaaaaa-1111-4111-8111-000000000001','A1','1234');
 perform public.test_assert((v->>'ok')::boolean,'correct PIN login succeeds');
 perform public.test_assert(v->'student'->>'photo_url'='ss-photo:aaaaaaaa-2222-4222-8222-000000000001','student photo becomes opaque reference');
 perform public.test_assert(not (v->'student' ? 'photo_data_url'),'student payload no inline photo');
 tok:=(v->>'photo_token')::uuid;
 perform public.test_assert(public.ss_private_photo_source('aaaaaaaa-2222-4222-8222-000000000001','student',tok,null) is not null,'own student or parent photo allowed');
 perform public.test_assert(public.ss_private_photo_source('aaaaaaaa-2222-4222-8222-000000000002','student',tok,null) is null,'student sibling/unrelated photo denied');
 perform public.test_assert(public.ss_private_photo_source('aaaaaaaa-2222-4222-8222-000000000003','student',tok,null) is null,'student cross school photo denied');
 update public.ss_student_photo_sessions set expires_at=now()-interval '1 second' where token=tok;
 perform public.test_assert(public.ss_private_photo_source('aaaaaaaa-2222-4222-8222-000000000001','student',tok,null) is null,'expired student token denied');
 update public.ss_student_photo_sessions set expires_at=now()+interval '1 day' where token=tok;
 update public.ss_students set parent_pin='changed-synthetic-pin' where id='aaaaaaaa-2222-4222-8222-000000000001';
 perform public.test_assert(public.ss_private_photo_source('aaaaaaaa-2222-4222-8222-000000000001','student',tok,null) is null,'PIN change revokes student photo session');
 update public.ss_students set parent_pin= (select pin_fingerprint from public.ss_student_photo_sessions where token=tok) where id='aaaaaaaa-2222-4222-8222-000000000001';
 perform public.ss_student_photo_logout(tok);
 perform public.test_assert(public.ss_private_photo_source('aaaaaaaa-2222-4222-8222-000000000001','student',tok,null) is null,'student logout revokes photo session');
 select count(*) into before_count from public.ss_student_photo_sessions;
 v:=public.ss_student_photo_login('aaaaaaaa-1111-4111-8111-000000000001','A1','9999');
 perform public.test_assert(not (v->>'ok')::boolean,'bad PIN rejected');
 perform public.test_assert((select count(*)=before_count from public.ss_student_photo_sessions),'bad PIN mints no session');
end $$;
-- New teacher login keeps auth/deleted/class scope but drops extra personal fields.
do $$ declare v jsonb; s jsonb; begin
 v:=public.ss_teacher_cloud_login('aaaaaaaa-1111-4111-8111-000000000001','teacher@example.invalid','synthetic-password');
 perform public.test_assert((v->>'ok')::boolean,'teacher login preserved');
 perform public.test_assert(jsonb_array_length(v->'students')=1,'teacher gets assigned class only');
 s:=v->'students'->0;
 perform public.test_assert(not (s ?| array['parent_pin','aadhaar','dob','address','documents','occupation','photo_data_url']),'teacher extra sensitive fields absent');
 perform public.test_assert(s->>'photo_url'='ss-photo:aaaaaaaa-2222-4222-8222-000000000001','teacher only opaque photo ref');
 update public.ss_teachers set deleted=true;
 perform public.test_assert(not (public.ss_teacher_cloud_login('aaaaaaaa-1111-4111-8111-000000000001','teacher@example.invalid','synthetic-password')->>'ok')::boolean,'deleted teacher still cannot log in');
 update public.ss_teachers set deleted=false;
end $$;
-- NULL student refs used by archived financial rows stay legal.
insert into public.ss_fee_records(school_id,student_id,student_name,cls,month,amount) values('aaaaaaaa-1111-4111-8111-000000000001',null,'Synthetic archive','1-A','Jan',10);
do $$ begin
 begin insert into public.ss_fee_records(school_id,student_id,student_name,cls,month,amount) values('aaaaaaaa-1111-4111-8111-000000000001','aaaaaaaa-2222-4222-8222-000000000003','Synthetic','1-A','Jan',10); set constraints all immediate;
 raise exception 'FAIL cross-school fees accepted';
 exception when foreign_key_violation then raise notice 'PASS cross-school fees blocked'; end;
end $$;
do $$ begin
 begin insert into public.ss_attendance(school_id,student_id,att_date,cls,status) values('aaaaaaaa-1111-4111-8111-000000000001','aaaaaaaa-2222-4222-8222-000000000003',current_date,'1-A','Present'); set constraints all immediate;
 raise exception 'FAIL cross-school attendance accepted';
 exception when foreign_key_violation then raise notice 'PASS cross-school attendance blocked'; end;
end $$;
do $$ begin
 begin insert into public.ss_receipts(school_id,student_id,receipt_no,student_name,cls,receipt_date,month,total) values('aaaaaaaa-1111-4111-8111-000000000001','aaaaaaaa-2222-4222-8222-000000000003','TEST','Synthetic','1-A',current_date,'Jan',10); set constraints all immediate;
 raise exception 'FAIL cross-school receipts accepted';
 exception when foreign_key_violation then raise notice 'PASS cross-school receipts blocked'; end;
end $$;
-- Preserve existing ON DELETE SET NULL for same-school archived fees.
insert into public.ss_fee_records(school_id,student_id,student_name,cls,month,amount) values('aaaaaaaa-1111-4111-8111-000000000001','aaaaaaaa-2222-4222-8222-000000000002','Synthetic deleted','2-A','Jan',10);
delete from public.ss_students where id='aaaaaaaa-2222-4222-8222-000000000002';
select public.test_assert(exists(select 1 from public.ss_fee_records where student_name='Synthetic deleted' and student_id is null),'original SET NULL behavior preserved');
select public.test_assert((select count(*)=2 from public.ss_schools),'two synthetic schools preserved');
