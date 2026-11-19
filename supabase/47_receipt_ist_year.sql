-- 47_receipt_ist_year.sql — v135 (audit fix): the server receipt number
-- must use the same year as the app.
--
-- ss_next_receipt_no used extract(year from now()) — UTC, since the
-- project runs in UTC — while the app mints RCP-<IST year>-NNN
-- (todayIST). Around the New Year (Dec 31 18:30 UTC – Jan 1 00:00 UTC)
-- the two years disagree and a server-minted receipt number breaks the
-- school's sequence format. The app's users are in IST, so the server
-- now mints with the Asia/Kolkata year, matching the app.
--
-- Ownership/authorization is unchanged (owner or platform admin only).
-- Run ONLY against the School Saathi project (bsjqeeeemwimzldrehpw).
-- Idempotent: safe to re-run.

create or replace function public.ss_next_receipt_no(p_school_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  -- Caller must own the school (or be platform admin); otherwise anyone
  -- with the function grant could burn another school's counters.
  if public.ss_school_owner(p_school_id) is distinct from auth.uid()
     and not public.is_ss_admin() then
    raise exception 'not your school';
  end if;
  update public.ss_schools set receipt_counter = receipt_counter + 1, updated_at = now()
    where id = p_school_id returning receipt_counter - 1 into v_n;
  if v_n is null then raise exception 'school not found'; end if;
  -- v135: IST year, matching the app's todayIST()-minted numbers.
  return 'RCP-' || extract(year from (now() at time zone 'Asia/Kolkata'))::text || '-' || lpad(v_n::text, 3, '0');
end;
$$;

revoke all on function public.ss_next_receipt_no(uuid) from public;
revoke all on function public.ss_next_receipt_no(uuid) from anon;
revoke all on function public.ss_next_receipt_no(uuid) from authenticated;
grant execute on function public.ss_next_receipt_no(uuid) to authenticated;
