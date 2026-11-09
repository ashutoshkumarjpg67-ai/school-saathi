-- 07_parent_lookup_scope.sql — School Saathi v34 (P1-6).
-- The parent lookup matched by admission number alone across ALL schools:
-- every school's first student is ADM-2025-001, so a parent could land on
-- another school's child. The app now picks the school first and passes it
-- here; the lookup is scoped to that school when p_school_id is given.
--
-- The third parameter defaults to NULL, so existing 2-argument calls keep
-- working (unscoped, as before). Dropping the 2-arg function first avoids
-- two overloads with different grants; the grant is re-applied below.
-- Idempotent. Apply WITH v34 (the app does not call this RPC yet — the
-- in-app parent login is local — so applying it early is also safe).

drop function if exists public.ss_parent_lookup(text, text);

create or replace function public.ss_parent_lookup(p_admission_no text, p_pin text, p_school_id uuid default null)
returns table (
  id uuid, school_id uuid, name text, cls text, roll integer, enr text,
  guardian text, phone text, father_name text, mother_name text,
  dob date, gender text, admission_no text, admission_date date,
  session text, status text, result numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.school_id, s.name, s.cls, s.roll, s.enr,
         s.guardian, s.phone, s.father_name, s.mother_name,
         s.dob, s.gender, s.admission_no, s.admission_date,
         s.session, s.status, s.result
  from public.ss_students s
  where lower(trim(s.admission_no)) = lower(trim(p_admission_no))
    and s.parent_pin = p_pin
    and (p_school_id is null or s.school_id = p_school_id);
$$;

grant execute on function public.ss_parent_lookup(text, text, uuid) to anon, authenticated;
