<!-- PR template — School Saathi (audit H-19). Fill in every box; a PR with
     empty boxes is not ready to merge. See TESTING.md for the full checklist. -->

## What this PR does

<!-- One or two sentences: what changes, and why. -->

## Verification (all boxes must be checked or explained)

- [ ] `node --check` passes on all four files (`app.js`, `qrgen.js`, `sw.js`, `scripts/check-version.mjs`)
- [ ] `node scripts/check-version.mjs` passes — count: __/11 (paste the actual count)
- [ ] Test harness result: <!-- e.g. "harness X/Y passed", or "harness not in repo — manual live test" (CR-8: the harness is currently external) -->
- [ ] Live test done — smoke checklist in TESTING.md §2 run on the test school
      <!-- OR, if skipped (delete this line if live-tested): -->
- [ ] Live test skipped — reason: <!-- why --> / said by: <!-- who -->
- [ ] Version bump: <!-- yes, v__ → v__ (all markers updated) / no, docs/process-only change, no version bump -->
- [ ] Delete flows untouched — no student/exam/teacher/fee delete, reset, or wipe flow was removed or changed

## Notes for the reviewer

<!-- Anything the reviewer should check first, known limits, follow-ups. -->
