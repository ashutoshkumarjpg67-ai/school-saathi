-- PREPARATION, not a bucket flip. Requires migrations 01-43.
-- Apply with the matching Edge Function and app in an isolated test project.
-- No student/photos copied, deleted or made public by this migration.
begin;
create table if not exists public.ss_student_photo_sessions (
  token uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.ss_students(id) on delete cascade,
  school_id uuid not null,
  pin_fingerprint text not null,
  expires_at timestamptz not null default now() + interval '30 days',
  foreign key(school_id,student_id) references public.ss_students(school_id,id) on delete cascade
);
alter table public.ss_student_photo_sessions enable row level security;
revoke all on public.ss_student_photo_sessions from public, anon, authenticated;

-- Reuse the CURRENT rate-limited login and bcrypt upgrade, not a second PIN
-- implementation. Sessions do not keep plaintext PINs. PIN changes invalidate
-- them immediately. Expired rows for this student are pruned on successful login.
create or replace function public.ss_student_photo_login(p_school_id uuid,p_admission_no text,p_pin text)
returns jsonb language plpgsql volatile security definer set search_path=public as $function$
declare v jsonb; s public.ss_students; t uuid;
begin
  v := public.ss_student_cloud_login(p_school_id,p_admission_no,p_pin);
  if not coalesce((v->>'ok')::boolean,false) then return v; end if;
  select * into s from public.ss_students where id=(v->'student'->>'id')::uuid and school_id=p_school_id;
  if not found then return jsonb_build_object('ok',false); end if;
  delete from public.ss_student_photo_sessions where student_id=s.id and expires_at<=now();
  -- Bound saved device grants without affecting login lockout state.
  delete from public.ss_student_photo_sessions where token in
    (select token from public.ss_student_photo_sessions where student_id=s.id order by expires_at desc offset 9);
  t := gen_random_uuid();
  insert into public.ss_student_photo_sessions(token,student_id,school_id,pin_fingerprint)
    values(t,s.id,s.school_id,coalesce(s.parent_pin,''));
  v := jsonb_set(v,'{student}',(v->'student')-'photo_url'-'photo_data_url');
  v := jsonb_set(v,'{student,photo_url}',case when coalesce(s.photo_url,s.photo_data_url,'')<>''
    then to_jsonb('ss-photo:'||s.id::text) else 'null'::jsonb end);
  return v || jsonb_build_object('photo_token',t);
end $function$;
revoke all on function public.ss_student_photo_login(uuid,text,text) from public,anon,authenticated;
grant execute on function public.ss_student_photo_login(uuid,text,text) to anon,authenticated;
create or replace function public.ss_student_photo_logout(p_token uuid)
returns void language sql volatile security definer set search_path=public as $function$
  delete from public.ss_student_photo_sessions where token=p_token;
$function$;
revoke all on function public.ss_student_photo_logout(uuid) from public,anon,authenticated;
grant execute on function public.ss_student_photo_logout(uuid) to anon,authenticated;

-- Internal broker. Only service_role may call it. The Edge Function verifies
-- owner JWTs using auth.getUser before passing p_owner_id; never trust a body id.
-- No URL/path/school/class selected by the caller is trusted.
create or replace function public.ss_private_photo_source(
  p_student_id uuid,p_kind text,p_token uuid default null,p_owner_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $function$
declare s public.ss_students; allowed boolean:=false; path text;
begin
  select * into s from public.ss_students where id=p_student_id;
  if not found then return null; end if;
  if p_kind='owner' then
    allowed := exists(select 1 from public.ss_schools sc where sc.id=s.school_id and sc.owner_id=p_owner_id);
  elsif p_kind='teacher' then
    allowed := exists(select 1 from public.ss_teacher_sessions se join public.ss_teachers t on t.id=se.teacher_id and t.school_id=se.school_id
      where se.token=p_token and se.expires_at>now() and not coalesce(t.deleted,false)
        and se.school_id=s.school_id and s.cls=any(t.classes));
  elsif p_kind='staff' then
    allowed := exists(select 1 from public.ss_staff_sessions se join public.ss_staff st on st.id=se.staff_id and st.school_id=se.school_id
      where se.token=p_token and se.expires_at>now() and not coalesce(st.deleted,false) and se.school_id=s.school_id
        and (st.role='principal' or (st.role='staff' and s.cls=any(st.classes))));
  elsif p_kind='student' then
    allowed := exists(select 1 from public.ss_student_photo_sessions se where se.token=p_token
      and se.student_id=s.id and se.school_id=s.school_id and se.expires_at>now()
      and se.pin_fingerprint=coalesce(s.parent_pin,'') and coalesce(s.parent_pin,'')<>'');
  end if;
  if not allowed then return null; end if;
  -- Return only DB-owned metadata to the broker. It signs a validated path in
  -- student-photos, never fetches an arbitrary DB URL (SSRF), and bounds data URLs.
  if s.photo_url like '%/storage/v1/object/public/student-photos/%' then
    path := split_part(s.photo_url,'/storage/v1/object/public/student-photos/',2);
  end if;
  return jsonb_build_object('school_id',s.school_id,'local_id',s.local_id,'student_id',s.id,
    'path',path,'legacy',case when path is null then s.photo_data_url else null end);
end $function$;
revoke all on function public.ss_private_photo_source(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.ss_private_photo_source(uuid,text,uuid,uuid) to service_role;

-- Existing teacher callers keep their signature, but never receive public URLs.
create or replace function public.ss_teacher_student_photo(p_token uuid,p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $function$
declare s public.ss_students;
begin
  select st.* into s from public.ss_students st
    join public.ss_teacher_sessions se on se.school_id=st.school_id
    join public.ss_teachers t on t.id=se.teacher_id and t.school_id=se.school_id
    where st.id=p_student_id and se.token=p_token and se.expires_at>now()
      and not coalesce(t.deleted,false) and st.cls=any(t.classes);
  if not found then return jsonb_build_object('ok',false); end if;
  return jsonb_build_object('ok',true,'photo_url',case when coalesce(s.photo_url,s.photo_data_url,'')<>'' then 'ss-photo:'||s.id::text else null end);
end $function$;
revoke all on function public.ss_teacher_student_photo(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ss_teacher_student_photo(uuid,uuid) to anon,authenticated;
commit;
