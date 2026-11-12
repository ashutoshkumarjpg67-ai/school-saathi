-- SQL 34 — Audit RPC for cloud writes (v97, cons fix).
--
-- The gap: a cloud teacher's attendance, homework and marks go through
-- token-authenticated RPCs, so no local audit row ever existed for them —
-- the school admin's Activity Log never saw their work. Local saves
-- already call logAudit (attendance) but marks never did, and homework
-- wrote only the dashboard activity, never the audit log.
--
-- This RPC lets a cloud teacher OR staff member post an audit row (and
-- the dashboard Recent Activities row) to the server directly. The actor
-- name + role and the school_id are resolved from the session token ON
-- THE SERVER (ss_teacher_token_owner / ss_staff_token_owner) — the caller
-- supplies only the action text and details, so the actor can never be
-- spoofed and the row can never land on another school.
--
-- The app calls it fire-and-forget after a successful cloud save
-- (attendance save, marks save, homework post); a failed audit insert
-- must never break the save it describes. The v62 harness pins that a
-- cloud save writes NO local audit row — the RPC is the only record.
--
create or replace function public.ss_log_audit(
  p_token uuid,
  p_action text,
  p_details text,
  p_title text,
  p_sub text,
  p_icon text,
  p_bg text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  v_school_id uuid;
  v_actor text;
  v_tch record;
  v_stf record;
begin
  -- Teacher token first, then staff token. A token that owns neither
  -- session is rejected without revealing which check failed.
  select * into v_tch from public.ss_teacher_token_owner(p_token);
  if found then
    v_school_id := v_tch.school_id;
    select t.name into v_actor from public.ss_teachers t where t.id = v_tch.teacher_id;
    v_actor := coalesce(v_actor, 'Teacher') || ' (teacher)';
  else
    select * into v_stf from public.ss_staff_token_owner(p_token);
    if not found then return jsonb_build_object('ok', false, 'error', 'bad_token'); end if;
    v_school_id := v_stf.school_id;
    select st.name into v_actor from public.ss_staff st where st.id = v_stf.staff_id;
    v_actor := coalesce(v_actor, 'Staff') || ' (' || coalesce(v_stf.role, 'staff') || ')';
  end if;
  if p_action is null or trim(p_action) = '' then return jsonb_build_object('ok', false, 'error', 'bad_input'); end if;
  insert into public.ss_audit_log (school_id, actor, action, details)
  values (v_school_id, v_actor, trim(p_action), coalesce(p_details, ''));
  -- The dashboard Recent Activities entry is optional: only when a title is given.
  if p_title is not null and trim(p_title) <> '' then
    insert into public.ss_activities (school_id, icon, bg, title, sub)
    values (v_school_id, coalesce(p_icon, ''), coalesce(p_bg, ''), trim(p_title), coalesce(p_sub, ''));
  end if;
  return jsonb_build_object('ok', true);
end;
$function$;

-- Grants: anonymous cloud teachers/staff must be able to call it.
-- Revoke from every grantee first, then grant by full signature.
revoke all on function public.ss_log_audit(uuid, text, text, text, text, text, text) from public;
revoke all on function public.ss_log_audit(uuid, text, text, text, text, text, text) from anon;
revoke all on function public.ss_log_audit(uuid, text, text, text, text, text, text) from authenticated;
grant execute on function public.ss_log_audit(uuid, text, text, text, text, text, text) to anon, authenticated;
