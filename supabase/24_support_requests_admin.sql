-- School Saathi backend — 24_support_requests_admin.sql
-- Phase B, item B14 (Phase 0 audit M-8): admins can read support
-- requests again and move a ticket's status (Open -> Resolved);
-- nothing wider is re-opened.
-- Run ONLY against the School Saathi project (bsjqeeeemwimzldrehpw),
-- in the Supabase dashboard SQL editor, AFTER 02_rls.sql and
-- 03_support_requests.sql.
-- Idempotent: safe to re-run (DROP POLICY IF EXISTS / REVOKE first).
--
-- THE PROBLEM (audit M-8):
--   03_support_requests.sql replaced the 02 owner+admin policy with
--   owner-only INSERT (Pending only) + owner-only SELECT. Since then
--   an admin cannot read support requests through RLS at all, and
--   there is NO update policy — a ticket's status can never move
--   Open -> Resolved from the app.
--
-- THE FIX (this file only):
--   1. Admin SELECT policy (read-only): admins see every request.
--   2. Admin UPDATE policy: admins may update a request, and the
--      WITH CHECK keeps the result an admin-owned row with a valid
--      status ('Pending' / 'Open' / 'In Progress' / 'Resolved' — the
--      same list as the table check constraint from 03).
--   3. Column-level grant: table-level UPDATE is revoked from
--      authenticated and re-granted for the status column ONLY, so
--      even with the UPDATE policy an admin (or a compromised admin
--      token) cannot rewrite a ticket's school, name or message —
--      only its status. This is the Postgres mechanism for
--      "update this column only"; the policy alone cannot express it.
--
-- NOT TOUCHED (owners keep exactly what 03 gave them):
--   ss_support_school_insert (owner INSERT, Pending only) and
--   ss_support_school_select (owner SELECT of their own requests)
--   are left alone. No admin INSERT or DELETE policy is added —
--   admins still cannot file or delete tickets through RLS.
--
-- WHY THE GRANT CHANGE IS SAFE (verified in app.js at v63):
--   The app only POSTs (INSERTs) support requests (:3821); it never
--   PATCHes them. Owners have no UPDATE policy on this table, so no
--   owner flow loses an update path. No SECURITY DEFINER function
--   updates this table. Revoking table-level UPDATE from
--   authenticated therefore breaks nothing the app does.
--
-- WARNING: 02_rls.sql grants table-level UPDATE on this table to
--   authenticated. If 02_rls.sql is ever re-run, it restores full
--   UPDATE — re-run this file after any re-run of 02_rls.sql.
--
-- UNTESTED against a live database: this SQL was reviewed by reading
-- only — no Postgres was available in this workspace to execute it,
-- and nothing was run against the live Supabase project. Ashutosh
-- must review it and apply it himself in the dashboard. Suggested
-- live checks: (1) as admin, SELECT sees all requests; (2) as admin,
-- UPDATE ... SET status = 'Resolved' succeeds; (3) as admin, UPDATE
-- ... SET message = 'x' fails (42501); (4) as a school owner, SELECT
-- still sees only their own requests and INSERT still works.
-- Apply statement-by-statement (the SQL endpoint returns only the
-- LAST statement's result — one statement per file, as with SQL 14/15).

-- 1. Admin read: every support request, read-only.
drop policy if exists ss_support_admin_select on public.ss_support_requests;
create policy ss_support_admin_select on public.ss_support_requests
  for select to authenticated
  using (public.is_ss_admin());

-- 2. Admin status update: status column only (see the grant in step 3),
--    and only to a valid status.
drop policy if exists ss_support_admin_update_status on public.ss_support_requests;
create policy ss_support_admin_update_status on public.ss_support_requests
  for update to authenticated
  using (public.is_ss_admin())
  with check (
    public.is_ss_admin()
    and status in ('Pending', 'Open', 'In Progress', 'Resolved')
  );

-- 3. Column-level grant: UPDATE is allowed on the status column only.
--    Revoke table-level UPDATE from every grantee first (repo style,
--    as in 18_teacher_cloud_login.sql), then grant the single column.
revoke update on public.ss_support_requests from public;
revoke update on public.ss_support_requests from anon;
revoke update on public.ss_support_requests from authenticated;
grant update (status) on public.ss_support_requests to authenticated;
