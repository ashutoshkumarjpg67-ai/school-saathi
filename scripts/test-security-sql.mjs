// Zero JS dependencies. Needs psql, pg_dump, pg_restore on PATH.
// Refuses non-local hosts and any DB except school_saathi_security_test.
import {spawnSync} from 'node:child_process';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const root=new URL('../',import.meta.url);
if (!['127.0.0.1','localhost','::1'].includes(process.env.PGHOST || '') || process.env.PGDATABASE!=='school_saathi_security_test') {
 console.error('Refused: set PGHOST to localhost and PGDATABASE=school_saathi_security_test. Never use production credentials.');process.exit(1);
}
function run(cmd,args,input) {
 const out=spawnSync(cmd,args,{input,encoding:'utf8',maxBuffer:32*1024*1024});
 if(out.status!==0) throw new Error(cmd+' failed: '+(out.stderr || out.error || '').toString());
 return (out.stdout || '')+'\n'+(out.stderr || '');
}
const sql=s=>run('psql',['-X','-v','ON_ERROR_STOP=1','-At'],s);
const dir=mkdtempSync(join(tmpdir(),'school-saathi-synthetic-'));
try {
 sql(readFileSync(new URL('../tests/security/bootstrap.sql',import.meta.url),'utf8'));
 for(const f of readdirSync(new URL('../supabase',import.meta.url)).filter(f=>/^\d.*\.sql$/.test(f)).sort()) sql(readFileSync(new URL('../supabase/'+f,import.meta.url),'utf8'));
 console.log('PASS all repository migrations parse and apply in isolated PostgreSQL');
 // Idempotence: rerunning only new migrations must preserve behavior.
 for(const f of ['44_tenant_reference_guards.sql','45_private_photo_access.sql','46_minimal_login_payloads.sql']) sql(readFileSync(new URL('../supabase/'+f,import.meta.url),'utf8'));
 const probes=sql(readFileSync(new URL('../tests/security/runtime-fixtures.sql',import.meta.url),'utf8'));
 console.log(probes.split('\n').filter(l=>l.includes('PASS')).join('\n'));
 // Fix 8 detection probe: the mismatch scan must actually catch mismatches.
 // Temp tables (no FKs) seeded with dangling and cross-school rows; a
 // single psql invocation because temp tables do not survive across calls.
 sql(`create temp table probe_students(school_id uuid, id uuid);
 create temp table probe_exams(school_id uuid, id uuid);
 create temp table probe_teachers(school_id uuid, id uuid);
 create temp table probe_staff(school_id uuid, id uuid);
 create temp table probe_fee(school_id uuid, student_id uuid);
 create temp table probe_att(school_id uuid, student_id uuid);
 create temp table probe_rec(school_id uuid, student_id uuid);
 create temp table probe_adm(school_id uuid, student_id uuid);
 create temp table probe_marks(school_id uuid, student_id uuid, exam_id uuid);
 create temp table probe_tch(school_id uuid, teacher_id uuid);
 create temp table probe_stf(school_id uuid, staff_id uuid);
 insert into probe_students values ('aaaaaaaa-1111-4111-8111-000000000001','aaaaaaaa-2222-4222-8222-000000000001'),('aaaaaaaa-1111-4111-8111-000000000002','aaaaaaaa-2222-4222-8222-000000000002');
 insert into probe_exams values ('aaaaaaaa-1111-4111-8111-000000000001','aaaaaaaa-3333-4333-8333-000000000001');
 insert into probe_teachers values ('aaaaaaaa-1111-4111-8111-000000000001','aaaaaaaa-4444-4444-8444-000000000001');
 insert into probe_staff values ('aaaaaaaa-1111-4111-8111-000000000001','aaaaaaaa-5555-4555-8555-000000000001');
 insert into probe_fee values ('aaaaaaaa-1111-4111-8111-000000000001','aaaaaaaa-2222-4222-8222-000000000009'),('aaaaaaaa-1111-4111-8111-000000000001','aaaaaaaa-2222-4222-8222-000000000002');
 insert into probe_att values ('aaaaaaaa-1111-4111-8111-000000000001','aaaaaaaa-2222-4222-8222-000000000009');
 insert into probe_rec values ('aaaaaaaa-1111-4111-8111-000000000001','aaaaaaaa-2222-4222-8222-000000000009');
 insert into probe_adm values ('aaaaaaaa-1111-4111-8111-000000000001','aaaaaaaa-2222-4222-8222-000000000009');
 insert into probe_marks values ('aaaaaaaa-1111-4111-8111-000000000001','aaaaaaaa-2222-4222-8222-000000000009','aaaaaaaa-3333-4333-8333-000000000001'),('aaaaaaaa-1111-4111-8111-000000000001','aaaaaaaa-2222-4222-8222-000000000001','aaaaaaaa-3333-4333-8333-000000000009');
 insert into probe_tch values ('aaaaaaaa-1111-4111-8111-000000000001','aaaaaaaa-4444-4444-8444-000000000009');
 insert into probe_stf values ('aaaaaaaa-1111-4111-8111-000000000001','aaaaaaaa-5555-4555-8555-000000000009');
 select public.test_assert((select count(*)=2 from probe_fee f where f.student_id is not null and not exists (select 1 from probe_students s where s.school_id=f.school_id and s.id=f.student_id)),'mismatch scan catches dangling + cross-school fee rows');
 select public.test_assert((select count(*)=1 from probe_att a where not exists (select 1 from probe_students s where s.school_id=a.school_id and s.id=a.student_id)),'mismatch scan catches dangling attendance row');
 select public.test_assert((select count(*)=1 from probe_rec r where r.student_id is not null and not exists (select 1 from probe_students s where s.school_id=r.school_id and s.id=r.student_id)),'mismatch scan catches dangling receipt row');
 select public.test_assert((select count(*)=1 from probe_adm ar where ar.student_id is not null and not exists (select 1 from probe_students s where s.school_id=ar.school_id and s.id=ar.student_id)),'mismatch scan catches dangling admission row');
 select public.test_assert((select count(*)=1 from probe_marks m where not exists (select 1 from probe_students s where s.school_id=m.school_id and s.id=m.student_id)),'mismatch scan catches dangling marks student row');
 select public.test_assert((select count(*)=1 from probe_marks m where not exists (select 1 from probe_exams e where e.school_id=m.school_id and e.id=m.exam_id)),'mismatch scan catches dangling marks exam row');
 select public.test_assert((select count(*)=1 from probe_tch t where not exists (select 1 from probe_teachers te where te.school_id=t.school_id and te.id=t.teacher_id)),'mismatch scan catches dangling teacher session row');
 select public.test_assert((select count(*)=1 from probe_stf st where not exists (select 1 from probe_staff sf where sf.school_id=st.school_id and sf.id=st.staff_id)),'mismatch scan catches dangling staff session row');`);
 console.log('PASS mismatch scan detects seeded dangling/cross-school rows');
 const snapshot=`select string_agg(tab||':'||n||':'||hash,E'\\n' order by tab) from public.test_fingerprints();`;
 sql(`create function public.test_fingerprints() returns table(tab text,n bigint,hash text) language plpgsql as $$ declare t record;begin
 for t in select schemaname,tablename from pg_tables where schemaname in ('public','auth','storage') order by 1,2 loop
 return query execute format($q$select %L::text,count(*),md5(coalesce(string_agg(to_jsonb(x)::text,chr(10) order by to_jsonb(x)::text),'')) from %I.%I x$q$,t.schemaname||'.'||t.tablename,t.schemaname,t.tablename);
 end loop;end $$;`);
 const before=sql(snapshot);
 const dump=join(dir,'synthetic-only.dump');
 run('pg_dump',['--format=custom','--no-owner','--no-acl','--file='+dump]);
 sql('drop schema public cascade;create schema public;drop schema auth cascade;drop schema storage cascade;drop schema extensions cascade;');
 run('pg_restore',['--exit-on-error','--no-owner','--no-acl','--dbname='+process.env.PGDATABASE,dump]);
 const after=sql(snapshot);
 if(before!==after) throw new Error('Synthetic restore fingerprint mismatch');
 sql(`select public.test_assert(public.test_photo('teacher',1) is not null,'restored photo broker retains scope');
 select public.test_assert(public.test_photo('teacher',3) is null,'restored broker still denies cross-school photo');`);
 console.log('PASS synthetic DB backup/restore: row fingerprints equal across public/auth/storage');
 console.log('NOTE: storage API/files/auth gateway are mocks, not a Supabase staging integration test.');
} finally {rmSync(dir,{recursive:true,force:true});}
