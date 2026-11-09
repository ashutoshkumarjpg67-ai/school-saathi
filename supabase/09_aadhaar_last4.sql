-- School Saathi v36 — Aadhaar: keep only the last 4 digits (audit item 16).
-- The app (v36+) never uploads a full Aadhaar anymore (sbMapStudent sends
-- only the last 4, and local records are stripped on load by migrateV16).
-- This truncates any full number already stored on the server.
-- Idempotent: safe to re-run (only rows longer than 4 digits change).
-- Never edit 01-08; this file is additive only.
update public.ss_students
  set aadhaar = right(aadhaar, 4)
  where aadhaar is not null and length(aadhaar) > 4;
comment on column public.ss_students.aadhaar is 'PII. Last 4 digits ONLY (v36) — the full number is never stored, shown, exported, printed or put on an ID card/receipt. Excluded from ss_parent_lookup return.';
