-- School Saathi backend — 02_rls.sql
-- Row Level Security for every ss_ table. Model:
--   * A school account (Supabase Auth user) sees/owns ONLY its own school's
--     rows: public.ss_school_owner(school_id) = auth.uid().
--   * Platform admins (rows in ss_platform_admins) can read all schools' rows
--     and manage platform tables. Admin status is a lookup table, never a
--     hard-coded email in a policy.
--   * anon (public): NO access, except TWO narrow paths:
--       - ss_admission_requests INSERT only (public Apply form), status forced Pending.
--       - ss_platform_settings SELECT (name/tagline/session/support email shown on the login screen).
--       - RPCs ss_list_public_schools() and ss_parent_lookup() (SECURITY DEFINER,
--         defined in 01_schema.sql; the parent RPC returns a row only on an exact
--         admission_no + PIN match and never returns aadhaar).
--   * Parent portal: no password account in v1; parents use ss_parent_lookup()
--     (PIN-gated). Full parent accounts are a later step (see BACKEND_PLAN.md).
-- Idempotent: DROP POLICY IF EXISTS before each CREATE POLICY.

-- ================= enable RLS on every ss_ table =================
alter table public.ss_platform_admins enable row level security;
alter table public.ss_schools enable row level security;
alter table public.ss_students enable row level security;
alter table public.ss_fee_structure enable row level security;
alter table public.ss_fee_records enable row level security;
alter table public.ss_attendance enable row level security;
alter table public.ss_receipts enable row level security;
alter table public.ss_audit_log enable row level security;
alter table public.ss_activities enable row level security;
alter table public.ss_admission_requests enable row level security;
alter table public.ss_support_requests enable row level security;
alter table public.ss_platform_settings enable row level security;
alter table public.ss_teachers enable row level security;
alter table public.ss_exams enable row level security;
alter table public.ss_marks enable row level security;
alter table public.ss_homework enable row level security;
alter table public.ss_notices enable row level security;

-- ================= ss_platform_admins: admins only =================
drop policy if exists ss_admins_admin_all on public.ss_platform_admins;
create policy ss_admins_admin_all on public.ss_platform_admins
  for all to authenticated using (public.is_ss_admin())
  with check (public.is_ss_admin());
-- NOTE: the FIRST admin row cannot be created through this policy (chicken
-- and egg). It must be inserted once via SQL as the database owner (see
-- BACKEND_PLAN.md "bootstrap"). After that, admins manage the table.

-- ================= ss_schools =================
-- Owner reads/updates their own school; admins read all.
drop policy if exists ss_schools_owner_read on public.ss_schools;
create policy ss_schools_owner_read on public.ss_schools
  for select to authenticated
  using (owner_id = auth.uid() or public.is_ss_admin());
drop policy if exists ss_schools_owner_update on public.ss_schools;
create policy ss_schools_owner_update on public.ss_schools
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
-- Signup creates a school row owned by the caller.
drop policy if exists ss_schools_owner_insert on public.ss_schools;
create policy ss_schools_owner_insert on public.ss_schools
  for insert to authenticated
  with check (owner_id = auth.uid());
-- Deletes are admin-only (a school is never deleted by its owner through the app).
drop policy if exists ss_schools_admin_delete on public.ss_schools;
create policy ss_schools_admin_delete on public.ss_schools
  for delete to authenticated using (public.is_ss_admin());

-- ================= school-scoped tables =================
-- One policy set per table: owner (via ss_schools.owner_id) or admin, all ops.
-- Tables: ss_students, ss_fee_structure, ss_fee_records, ss_attendance,
-- ss_receipts, ss_audit_log, ss_activities, ss_teachers, ss_exams,
-- ss_marks, ss_homework, ss_notices.
do $$
declare
  t text;
begin
  foreach t in array array[
    'ss_students','ss_fee_structure','ss_fee_records','ss_attendance',
    'ss_receipts','ss_audit_log','ss_activities','ss_teachers','ss_exams',
    'ss_marks','ss_homework','ss_notices'
  ] loop
    execute format('drop policy if exists %I on public.%I', 'ss_owner_all_' || t, t);
    execute format(
      'create policy %I on public.%I for all to authenticated ' ||
      'using (public.ss_school_owner(school_id) = auth.uid() or public.is_ss_admin()) ' ||
      'with check (public.ss_school_owner(school_id) = auth.uid() or public.is_ss_admin())',
      'ss_owner_all_' || t, t);
  end loop;
end $$;

-- ================= ss_admission_requests =================
-- Owner/admin: full access to their school's rows.
drop policy if exists ss_admreq_owner_all on public.ss_admission_requests;
create policy ss_admreq_owner_all on public.ss_admission_requests
  for all to authenticated
  using (public.ss_school_owner(school_id) = auth.uid() or public.is_ss_admin())
  with check (public.ss_school_owner(school_id) = auth.uid() or public.is_ss_admin());
-- Public Apply form: anon may INSERT only, and only as Pending with a real school.
-- No SELECT/UPDATE/DELETE for anon: applications are invisible to the public.
-- NOTE: the school check MUST go through ss_is_real_school() (SECURITY DEFINER).
-- A direct EXISTS on ss_schools here breaks the insert: anon has no SELECT
-- grant on ss_schools, so the policy check itself fails with 42501.
drop policy if exists ss_admreq_anon_insert on public.ss_admission_requests;
create policy ss_admreq_anon_insert on public.ss_admission_requests
  for insert to anon
  with check (
    status = 'Pending'
    and public.ss_is_real_school(school_id)
  );

-- ================= ss_support_requests =================
-- A school sees/inserts only its own requests; admins see/manage all.
drop policy if exists ss_support_owner_all on public.ss_support_requests;
create policy ss_support_owner_all on public.ss_support_requests
  for all to authenticated
  using (public.ss_school_owner(school_id) = auth.uid() or public.is_ss_admin())
  with check (public.ss_school_owner(school_id) = auth.uid() or public.is_ss_admin());
-- NOTE: platform support requests raised by the Super Admin themself carry
-- school_id NULL; only admins can insert/select those (covered by the policy
-- above via is_ss_admin()).

-- ================= ss_platform_settings =================
-- Anyone (even logged out) may read the 4 public fields for the login screen.
drop policy if exists ss_settings_public_read on public.ss_platform_settings;
create policy ss_settings_public_read on public.ss_platform_settings
  for select to anon, authenticated using (true);
-- Only admins may change them.
drop policy if exists ss_settings_admin_write on public.ss_platform_settings;
create policy ss_settings_admin_write on public.ss_platform_settings
  for all to authenticated
  using (public.is_ss_admin())
  with check (public.is_ss_admin());

-- ================= grants =================
-- PostgREST (anon + authenticated roles) needs table privileges; RLS still applies.
-- Scoped to ss_ tables ONLY: never widen grants on the Target Academy tables.
do $$
declare
  t text;
begin
  foreach t in array array[
    'ss_platform_admins','ss_schools','ss_students','ss_fee_structure',
    'ss_fee_records','ss_attendance','ss_receipts','ss_audit_log',
    'ss_activities','ss_admission_requests','ss_support_requests',
    'ss_platform_settings','ss_teachers','ss_exams','ss_marks',
    'ss_homework','ss_notices'
  ] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
grant select on public.ss_platform_settings to anon;
grant insert on public.ss_admission_requests to anon;
grant execute on function public.ss_list_public_schools() to anon, authenticated;
grant execute on function public.ss_is_real_school(uuid) to anon, authenticated;
grant execute on function public.ss_parent_lookup(text, text) to anon, authenticated;
grant execute on function public.ss_next_adm_no(uuid) to authenticated;
grant execute on function public.ss_next_receipt_no(uuid) to authenticated;
-- Helper functions used inside RLS policies must stay executable by the
-- callers the policies apply to (SECURITY DEFINER only changes WHO the
-- function runs as, not who may call it). They return a boolean / uuid only.
grant execute on function public.is_ss_admin() to authenticated;
grant execute on function public.ss_school_owner(uuid) to authenticated;
