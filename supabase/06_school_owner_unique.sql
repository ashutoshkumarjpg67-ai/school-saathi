-- 06_school_owner_unique.sql — School Saathi v34 (P1-11).
-- One school row per owner. Without this, two devices signing in for the
-- first time at the same moment could both GET no row and both POST one,
-- leaving duplicate ss_schools rows for the same owner (sbEnsureServerSchool
-- is GET-then-POST and takes data[0]). The app now also handles the 409
-- from a rejected second insert by re-reading the existing row.
--
-- Live data check before applying: the audit (9 Nov 2026) found exactly 1
-- ss_schools row, so no duplicates exist to clean up. Idempotent.
-- Apply BEFORE or WITH v34 (either order is safe; the app handles 409).

create unique index if not exists ss_schools_owner_uidx
  on public.ss_schools (owner_id);
