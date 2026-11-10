-- School Saathi — 25_receipt_year_ist.sql
-- Phase B (M-13): receipt year in IST, not DB-server UTC.
--
-- Problem (audit M-13): ss_next_receipt_no built the receipt number as
-- 'RCP-' || extract(year from now()) — now() is the database server's
-- clock (UTC on Supabase), while the app dates receipts in IST
-- (todayIST(), app.js). Between 00:00 and 05:29 IST on 1 January, a
-- receipt dated 2027 got number RCP-2026-... .
--
-- Fix: redefine ss_next_receipt_no (CREATE OR REPLACE, same signature,
-- same ownership check, same counter logic) so the year comes from
-- now() AT TIME ZONE 'Asia/Kolkata'. The counter sequence is untouched:
-- the same receipt_counter increments in the same order.
--
-- Additive only — run in the Supabase dashboard SQL editor. Nothing here
-- runs itself. UNTESTED against a live DB: review before applying, then
-- verify with a manual call (a receipt minted at 00:30 IST on 1 January
-- must read RCP-<new-year>-...). No version bump.
-- Live test suggestion: after applying, mint one test receipt and check
-- its number year matches the IST date; the counter must continue
-- (no reset, no duplicates).

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
  return 'RCP-' || extract(year from now() at time zone 'Asia/Kolkata')::text || '-' || lpad(v_n::text, 3, '0');
end;
$$;
