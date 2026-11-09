-- ============================================================
-- School Saathi — 14_cleanup_seed_upload_test_school.sql
-- v45 cleanup: remove the demo-seed rows the v44 flood uploaded
-- into the TEST school, and restore the real test data.
--
-- TEST SCHOOL ONLY: id c637ac25-befb-4edc-8f6c-10cd8c8d9128
-- ("Test Sunrise School", test@sunrise.test).
-- NEVER run this without the user's go-ahead (same rule as the
-- v41 dedup SQL 13). NEVER run it against VM School (Ankit Kumar)
-- or any other school — every statement below is scoped to the
-- test-school id above.
--
-- DO THIS FIRST: close the stale v44 browser tab that is still
-- uploading the seed (the flood was still climbing at probe time:
-- fee records 51 -> 71 between 23:20 and 00:05 IST). If the tab
-- stays open, the seed re-uploads after this cleanup. Then apply
-- this file, then open the app on v45 — the next sync's pull drops
-- the local seed rows and the dashboard returns to 1 student.
--
-- PROBE-VERIFIED targets (read-only probes, 10 Nov 2026 ~00:05 IST):
--   39 seed students  (local_id stu2..stu40; stu1 was adopted into
--                       the V21 row, local_id stu1794162292000)
--   12 seed teachers  (local_id t1..t12)
--   64 seed fee records and climbing (71 total, 7 real — deleted by
--                       joining to the seed student uuids, so this
--                       catches all of them whenever it runs)
--   5 seed exams, 4 seed homework, 3 seed notices, 8 seed marks,
--   4 seed attendance rows (exactly the seed's shape)
--   2 extra receipts: RCP-2026-151 (Nov, V21, Rs 800) and
--                       RCP-2026-152 (Oct, V21, Rs 800) — duplicates
--                       of 001/002 under minted numbers
--   ADM-2025-001 currently named "Aarav Verma" (seed name) on the
--   same local_id stu1794162292000 — rename back to "V21 Test Kumar"
--   School row currently named "St. Xavier School", Patna, principal
--   "Rahul Kumar", adm_counter 41, receipt_counter 1 (the seed's
--   profile + counters, written by the flood's upload pass).
--
-- NOTE on city/principal: the real test school's city/principal are
-- not recorded anywhere, so this file restores only the school NAME
-- and the two counters and leaves city/principal untouched. They
-- still carry the seed values (Patna / Rahul Kumar) after this runs
-- — correct them from the app's profile screen, or by a follow-up
-- SQL once the real values are known.
--
-- IDEMPOTENT: every statement is safe to re-run — a second run
-- deletes 0 rows, re-sets the same name and the same counters.
-- Expected end state (see the verify block at the end):
--   1 student (V21 Test Kumar, ADM-2025-001), 0 teachers,
--   7 fee records, 3 receipts (001/002/003), 0 exams/homework/
--   notices/marks/attendance, adm_counter 2, receipt_counter 4.
-- ============================================================

-- ------------------------------------------------------------
-- STEP 0 — PREVIEW (expected counts; run first, compare, then
-- continue only if they match the probe-verified targets above)
-- ------------------------------------------------------------
SELECT 'seed_students' AS what, COUNT(*) AS n FROM ss_students WHERE school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128' AND local_id IN ('stu2','stu3','stu4','stu5','stu6','stu7','stu8','stu9','stu10','stu11','stu12','stu13','stu14','stu15','stu16','stu17','stu18','stu19','stu20','stu21','stu22','stu23','stu24','stu25','stu26','stu27','stu28','stu29','stu30','stu31','stu32','stu33','stu34','stu35','stu36','stu37','stu38','stu39','stu40');
SELECT 'seed_teachers' AS what, COUNT(*) AS n FROM ss_teachers WHERE school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128' AND local_id IN ('t1','t2','t3','t4','t5','t6','t7','t8','t9','t10','t11','t12');
SELECT 'seed_exams' AS what, COUNT(*) AS n FROM ss_exams WHERE school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128' AND local_id IN ('ex1','ex2','ex3','ex4','ex5');
SELECT 'seed_homework' AS what, COUNT(*) AS n FROM ss_homework WHERE school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128' AND local_id IN ('hw1','hw2','hw3','hw4');
SELECT 'seed_notices' AS what, COUNT(*) AS n FROM ss_notices WHERE school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128' AND local_id IN ('n1','n2','n3');
SELECT 'extra_receipts' AS what, COUNT(*) AS n FROM ss_receipts WHERE school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128' AND receipt_no IN ('RCP-2026-151','RCP-2026-152');
SELECT 'adm001_name' AS what, name AS n FROM ss_students WHERE school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128' AND admission_no = 'ADM-2025-001';

-- ------------------------------------------------------------
-- STEP 1 — seed fee records (join to the seed student uuids).
-- Runs BEFORE the student delete below, so the join still works.
-- The count is still climbing while the stale tab uploads — the
-- join catches every seed fee record whenever this runs.
-- ------------------------------------------------------------
DELETE FROM ss_fee_records WHERE school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128' AND student_id IN (SELECT id FROM ss_students WHERE school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128' AND local_id IN ('stu2','stu3','stu4','stu5','stu6','stu7','stu8','stu9','stu10','stu11','stu12','stu13','stu14','stu15','stu16','stu17','stu18','stu19','stu20','stu21','stu22','stu23','stu24','stu25','stu26','stu27','stu28','stu29','stu30','stu31','stu32','stu33','stu34','stu35','stu36','stu37','stu38','stu39','stu40'));

-- ------------------------------------------------------------
-- STEP 2 — seed marks (join to the seed student / exam uuids)
-- ------------------------------------------------------------
DELETE FROM ss_marks WHERE school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128' AND (student_id IN (SELECT id FROM ss_students WHERE school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128' AND local_id IN ('stu2','stu3','stu4','stu5','stu6','stu7','stu8','stu9','stu10','stu11','stu12','stu13','stu14','stu15','stu16','stu17','stu18','stu19','stu20','stu21','stu22','stu23','stu24','stu25','stu26','stu27','stu28','stu29','stu30','stu31','stu32','stu33','stu34','stu35','stu36','stu37','stu38','stu39','stu40')) OR exam_id IN (SELECT id FROM ss_exams WHERE school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128' AND local_id IN ('ex1','ex2','ex3','ex4','ex5')));

-- ------------------------------------------------------------
-- STEP 3 — seed attendance (join to the seed student uuids)
-- ------------------------------------------------------------
DELETE FROM ss_attendance WHERE school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128' AND student_id IN (SELECT id FROM ss_students WHERE school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128' AND local_id IN ('stu2','stu3','stu4','stu5','stu6','stu7','stu8','stu9','stu10','stu11','stu12','stu13','stu14','stu15','stu16','stu17','stu18','stu19','stu20','stu21','stu22','stu23','stu24','stu25','stu26','stu27','stu28','stu29','stu30','stu31','stu32','stu33','stu34','stu35','stu36','stu37','stu38','stu39','stu40'));

-- ------------------------------------------------------------
-- STEP 4 — seed exams, homework, notices (local_id pattern)
-- ------------------------------------------------------------
DELETE FROM ss_exams WHERE school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128' AND local_id IN ('ex1','ex2','ex3','ex4','ex5');
DELETE FROM ss_homework WHERE school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128' AND local_id IN ('hw1','hw2','hw3','hw4');
DELETE FROM ss_notices WHERE school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128' AND local_id IN ('n1','n2','n3');

-- ------------------------------------------------------------
-- STEP 5 — the 39 seed students and 12 seed teachers.
-- stu1 is NOT deleted: it was adopted into the V21 row
-- (local_id stu1794162292000) and is renamed in Step 7.
-- ------------------------------------------------------------
DELETE FROM ss_students WHERE school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128' AND local_id IN ('stu2','stu3','stu4','stu5','stu6','stu7','stu8','stu9','stu10','stu11','stu12','stu13','stu14','stu15','stu16','stu17','stu18','stu19','stu20','stu21','stu22','stu23','stu24','stu25','stu26','stu27','stu28','stu29','stu30','stu31','stu32','stu33','stu34','stu35','stu36','stu37','stu38','stu39','stu40');
DELETE FROM ss_teachers WHERE school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128' AND local_id IN ('t1','t2','t3','t4','t5','t6','t7','t8','t9','t10','t11','t12');

-- ------------------------------------------------------------
-- STEP 6 — the 2 extra receipts (duplicates of 001/002 under
-- minted numbers 151/152). 001/002/003 are NOT touched.
-- ------------------------------------------------------------
DELETE FROM ss_receipts WHERE school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128' AND receipt_no IN ('RCP-2026-151','RCP-2026-152');

-- ------------------------------------------------------------
-- STEP 7 — rename ADM-2025-001 back to the real test student
-- ------------------------------------------------------------
UPDATE ss_students SET name = 'V21 Test Kumar' WHERE school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128' AND admission_no = 'ADM-2025-001' AND local_id = 'stu1794162292000';

-- ------------------------------------------------------------
-- STEP 8 — heal the school row: real name + real counters.
-- adm_counter 2 (V21 holds ADM-2025-001; the next admission gets
-- 002), receipt_counter 4 (001/002/003 exist; the next receipt is
-- RCP-2026-004). City/principal are left untouched — see the header
-- note (they still carry the seed values Patna / Rahul Kumar).
-- ------------------------------------------------------------
UPDATE ss_schools SET name = 'Test Sunrise School', adm_counter = 2, receipt_counter = 4 WHERE id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128';

-- ------------------------------------------------------------
-- STEP 9 — VERIFY (expected: 1 student V21 Test Kumar, 0 teachers,
-- 7 fee records, 3 receipts 001/002/003, 0 exams/homework/notices/
-- marks/attendance, adm_counter 2, receipt_counter 4)
-- ------------------------------------------------------------
SELECT 'students' AS what, COUNT(*) AS n FROM ss_students WHERE school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128';
SELECT 'student_name' AS what, name AS n FROM ss_students WHERE school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128' AND admission_no = 'ADM-2025-001';
SELECT 'teachers' AS what, COUNT(*) AS n FROM ss_teachers WHERE school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128';
SELECT 'fee_records' AS what, COUNT(*) AS n FROM ss_fee_records WHERE school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128';
SELECT 'receipts' AS what, COUNT(*) AS n FROM ss_receipts WHERE school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128';
SELECT 'receipt_nos' AS what, string_agg(receipt_no, ', ' ORDER BY receipt_no) AS n FROM ss_receipts WHERE school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128';
SELECT 'exams' AS what, COUNT(*) AS n FROM ss_exams WHERE school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128';
SELECT 'homework' AS what, COUNT(*) AS n FROM ss_homework WHERE school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128';
SELECT 'notices' AS what, COUNT(*) AS n FROM ss_notices WHERE school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128';
SELECT 'marks' AS what, COUNT(*) AS n FROM ss_marks WHERE school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128';
SELECT 'attendance' AS what, COUNT(*) AS n FROM ss_attendance WHERE school_id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128';
SELECT 'school' AS what, name AS n, adm_counter, receipt_counter FROM ss_schools WHERE id = 'c637ac25-befb-4edc-8f6c-10cd8c8d9128';
