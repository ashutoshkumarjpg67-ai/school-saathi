-- SQL 21: auth-bound school login lockout reset (audit P0-1, app v68)
-- ss_school_login_ok previously deleted ANY email's attempts row for ANY
-- caller (anon included), so the 5-fails / 15-minute lock could be reset
-- by an anonymous caller and the throttle was unenforceable.
-- Now the reset only happens when the caller's own authenticated email
-- matches p_email. Anonymous callers are revoked.
-- The app calls this only on the successful-login branch (doLogin), with
-- the fresh GoTrue access token — see app.js sbSchoolLoginOk (v68).
-- precheck/failed stay anon: they run before any session exists.
create or replace function public.ss_school_login_ok(p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;
  select email into v_email from auth.users where id = v_uid;
  if v_email is null or lower(v_email) <> lower(p_email) then
    return jsonb_build_object('ok', false, 'reason', 'email_mismatch');
  end if;
  delete from public.ss_school_login_attempts where email = lower(p_email);
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.ss_school_login_ok(text) from public;
revoke execute on function public.ss_school_login_ok(text) from anon;
grant execute on function public.ss_school_login_ok(text) to authenticated;
