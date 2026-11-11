-- School Saathi backend — 23_owner_update_with_check.sql
-- Phase B, item B13 (Phase 0 audit M-5): an owner can no longer flip
-- is_demo / plan / status on their own school row.
-- Run ONLY against the School Saathi project (bsjqeeeemwimzldrehpw),
-- in the Supabase dashboard SQL editor, AFTER 02_rls.sql.
-- Idempotent: safe to re-run (DROP POLICY IF EXISTS first).
--
-- THE PROBLEM (audit M-5):
--   02_rls.sql:53-56 gives owners an UPDATE policy whose WITH CHECK is
--   only owner_id = auth.uid(). An owner could set is_demo = false and
--   land in the public Apply list (ss_list_public_schools shows every
--   is_demo = false school), or flip plan / status at will.
--
-- THE FIX (this file only):
--   The owner UPDATE policy gains a WITH CHECK that the proposed row
--   keeps the stored is_demo, plan and status (compared with the row
--   as stored, via IS NOT DISTINCT FROM, so NULLs compare safely).
--   The owner can still update everything else on their row — name,
--   city, profile, fees and the counters (see below).
--
-- COUNTERS DELIBERATELY NOT RESTRICTED (verified in app.js at v63):
--   The app PATCHes adm_counter / receipt_counter directly on
--   ss_schools in three places, so restricting them here would break
--   sync: the sync push payload (sbSyncSchoolPayloadFromParts,
--   app.js:2330-2341, sent at :2598 and :2837), the first-sync counter
--   merge (:1607) and the counter heal after pull (:3461-3466).
--   Restricting counters needs the app to mint numbers only through
--   the ss_next_adm_no / ss_next_receipt_no RPCs first — a separate
--   app change, not this file. is_demo / plan / status are safe to
--   lock down now: the app sets them only once, at signup INSERT
--   (app.js:1043), and never PATCHes them.
--
-- HOW THE CHECK WORKS (read this before applying):
--   WITH CHECK cannot see the OLD row directly, so the check compares
--   the proposed row against a subquery of the stored row. The subquery
--   runs under the statement snapshot, so it reads the pre-update row.
--   The subquery's SELECT is governed by the owner-read policy
--   (ss_schools_owner_read), which the updating owner passes.
--
-- UNTESTED against a live database: this SQL was reviewed by reading
-- only — no Postgres was available in this workspace to execute it,
-- and nothing was run against the live Supabase project. Ashutosh
-- must review it and apply it himself in the dashboard. Suggested
-- live checks, as the school owner: (1) UPDATE ss_schools SET
-- is_demo = false / plan = 'Trial' / status = 'pending' must fail
-- (0 rows); (2) a normal profile PATCH (name/city) and a counter
-- PATCH must still succeed. If the subquery form misbehaves live,
-- the fallback is a BEFORE UPDATE trigger enforcing the same three
-- columns — do not silently widen the policy instead.
-- Apply statement-by-statement (the SQL endpoint returns only the
-- LAST statement's result — one statement per file, as with SQL 14/15).

-- Owner updates their own school; is_demo / plan / status must stay as stored.
drop policy if exists ss_schools_owner_update on public.ss_schools;
create policy ss_schools_owner_update on public.ss_schools
  for update to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.ss_schools old
      where old.id = ss_schools.id
        and old.is_demo is not distinct from ss_schools.is_demo
        and old.plan is not distinct from ss_schools.plan
        and old.status is not distinct from ss_schools.status
    )
  );
