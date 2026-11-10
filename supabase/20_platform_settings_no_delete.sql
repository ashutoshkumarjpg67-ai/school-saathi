-- School Saathi backend — 20_platform_settings_no_delete.sql
-- Phase B, item B12 (Phase 0 audit L-1): admin can no longer DELETE
-- the single ss_platform_settings row (id = 1).
-- Run ONLY against the School Saathi project (bsjqeeeemwimzldrehpw),
-- in the Supabase dashboard SQL editor, AFTER 02_rls.sql.
-- Idempotent: safe to re-run (DROP POLICY IF EXISTS first).
--
-- THE PROBLEM (audit L-1):
--   02_rls.sql:128-131 gives admins a FOR ALL policy on
--   ss_platform_settings, so an admin (or a bug / a stolen admin
--   session) can DELETE the single id=1 row that holds the platform
--   name, tagline, session and support email shown on the login screen.
--
-- THE FIX (this file only):
--   The admin policy is replaced with one limited to SELECT, INSERT
--   and UPDATE — DELETE is removed. The public read policy
--   (ss_settings_public_read, anon + authenticated SELECT) is untouched.
--   No delete option or flow is removed anywhere else; this table has
--   no delete UI (the app never references ss_platform_settings for
--   deletes — zero hits in app.js at v63).
--
-- NOTE on grants: 02_rls.sql also grants table-level DELETE on this
-- table to authenticated. That grant alone cannot delete anything:
--   with RLS enabled and no DELETE policy, DELETE is denied by default.
--   The grant is left as-is here (re-running 02 would restore the
--   policy this file removes only if 02 itself were re-applied — and
--   02 re-applied would recreate the FOR ALL policy, so re-run this
--   file after any re-run of 02_rls.sql).
--
-- UNTESTED against a live database: this SQL was reviewed by reading
-- only — no Postgres was available in this workspace to execute it,
-- and nothing was run against the live Supabase project. Ashutosh
-- must review it and apply it himself in the dashboard. Suggested
-- live check: as an admin, DELETE FROM ss_platform_settings WHERE
-- id = 1 must fail (0 rows / 42501); SELECT/UPDATE as admin must
-- still work.
-- Apply statement-by-statement (the SQL endpoint returns only the
-- LAST statement's result — one statement per file, as with SQL 14/15).

-- Only admins may change the platform settings — and never delete them.
drop policy if exists ss_settings_admin_write on public.ss_platform_settings;
create policy ss_settings_admin_write on public.ss_platform_settings
  for select, insert, update to authenticated
  using (public.is_ss_admin())
  with check (public.is_ss_admin());
