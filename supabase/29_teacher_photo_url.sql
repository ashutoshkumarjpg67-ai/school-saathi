-- SQL 29: Teacher on-demand student photo must return the Storage URL too (Phase 3, v80).
-- After the v78 Storage migration, a synced student photo lives in photo_url
-- (Storage) and photo_data_url is NULL. The v74 RPC (SQL 24) returned only
-- photo_data_url, so a cloud teacher opening a student profile got null and
-- saw no photo. Return both; the app prefers the data URL (offline-safe)
-- and falls back to the Storage URL.
-- One file per concern; never edit earlier numbered files.
create or replace function public.ss_teacher_student_photo(
  p_token uuid,
  p_student_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_owner record;
  v_photo_data text;
  v_photo_url text;
begin
  if p_token is null or p_student_id is null then
    return jsonb_build_object('ok', false);
  end if;
  select * into v_owner from public.ss_teacher_token_owner(p_token);
  if not found then return jsonb_build_object('ok', false, 'error', 'bad_token'); end if;
  select s.photo_data_url, s.photo_url into v_photo_data, v_photo_url
    from public.ss_students s
   where s.id = p_student_id and s.school_id = v_owner.school_id
     and exists (select 1 from public.ss_teachers t where t.id = v_owner.teacher_id and s.cls = any (coalesce(t.classes, '{}'::text[])));
  if not found then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  return jsonb_build_object('ok', true, 'photo_data_url', v_photo_data, 'photo_url', v_photo_url);
end;
$function$;

-- Grants: revoke from every grantee first, then grant by full signature (same pattern as SQL 17/18/23/24).
revoke all on function public.ss_teacher_student_photo(uuid, uuid) from public;
revoke all on function public.ss_teacher_student_photo(uuid, uuid) from anon;
revoke all on function public.ss_teacher_student_photo(uuid, uuid) from authenticated;
grant execute on function public.ss_teacher_student_photo(uuid, uuid) to anon, authenticated;
