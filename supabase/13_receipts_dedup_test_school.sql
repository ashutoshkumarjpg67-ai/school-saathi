-- School Saathi v41 — DEDUP the receipts the v40 repair loop created on the
-- TEST school only (Test Sunrise School).
-- WRITE ONLY — DO NOT APPLY BLINDLY. Review the preview first, then run the
-- statements in order. Never edit 01-09; this file is additive only.
--
-- WHAT HAPPENED (9 Nov 2026, live, read-only probes):
-- The v40 repair pass re-minted a new server receipt number for every
-- Collected fee record on every sync cycle (its same-number comparison
-- failed whenever the stored student-id map was empty, which is the
-- normal state on the first cycle after login). The test school now
-- holds 192 rows in ss_receipts: exactly 3 real receipts, each copied
-- 64 times under ever-higher numbers —
--   Nov  RCP-2026-001 … RCP-2026-193  (student 40fa5f30-e243-4ccd-b181-5004071a9c0c, total 800, date 2026-11-08)
--   Oct  RCP-2026-002 … RCP-2026-194  (same student, total 800, date 2026-11-09)
--   Dec  RCP-2026-003 … RCP-2026-195  (same student, total 800, date 2026-11-09)
-- and receipt_counter = 196. VM School (2a1698d1-7e6f-4265-8ee5-24ac14a3a4f2)
-- holds 0 receipts and counter 1 — THIS FILE NEVER TOUCHES IT.
--
-- WHAT THIS FILE DOES, for Test Sunrise School ONLY
-- (id c637ac25-befb-4edc-8f6c-10cd8c8d9128, re-verified by read-only probe
-- 9 Nov 2026 ~21:30 IST):
--   1. PREVIEW what would be deleted (expect 189 rows, all duplicates of
--      RCP-2026-001/002/003 — run this first and check it before the DELETE).
--   2. DELETE the duplicates, keeping the EARLIEST number per
--      (student_id, month, total, receipt_date) — i.e. keep 001/002/003.
--   3. HEAL receipt_counter to max(kept receipt seq) + 1 = 4.
--   4. VERIFY: 3 receipts left, counter 4.
-- Idempotent: safe to re-run (after the first run the preview is empty
-- and the DELETE affects 0 rows). The v41 app code stops the loop, so no
-- new duplicates appear after this runs — apply the dedup only AFTER v41
-- is live, or the loop (v40 code) will re-create them.
-- NOTE: the Management API returns only the LAST statement's result, so
-- run each statement (or the file) in the Supabase SQL Editor and read
-- each result as it comes back.

-- ============ 1. PREVIEW (run first — expect 189 rows) ============
select receipt_no, student_name, month, total, receipt_date, created_at
from public.ss_receipts
where school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128'
  and receipt_no not in (
    select min(receipt_no)
    from public.ss_receipts
    where school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128'
    group by student_id, month, total, receipt_date
  )
order by receipt_no;

-- ============ 2. DELETE the duplicates, keep the earliest number ============
delete from public.ss_receipts r
using (
  select student_id, month, total, receipt_date, min(receipt_no) as keep_no
  from public.ss_receipts
  where school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128'
  group by student_id, month, total, receipt_date
) k
where r.school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128'
  and r.student_id = k.student_id
  and r.month = k.month
  and r.total = k.total
  and r.receipt_date = k.receipt_date
  and r.receipt_no <> k.keep_no;

-- ============ 3. HEAL the counter to one past the highest kept number ============
update public.ss_schools
set receipt_counter = (
  select coalesce(max(cast(split_part(receipt_no, '-', 3) as integer)), 0) + 1
  from public.ss_receipts
  where school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128'
)
where id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128';

-- ============ 4. VERIFY (expect 3 receipts, counter 4) ============
select receipt_no, student_name, month, total, receipt_date
from public.ss_receipts
where school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128'
order by receipt_no;

select id, name, receipt_counter
from public.ss_schools
where id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128';
