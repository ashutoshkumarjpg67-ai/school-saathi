# Testing — School Saathi

How to verify a change before pushing, and how to live-test it after merge.
Every PR must show its verification (see `.github/PULL_REQUEST_TEMPLATE.md`).
No version bump in this file's scope — version rules live in `VERSIONS.md`
and `scripts/check-version.mjs`.

## 1. Pre-push checks (copy-paste, run from the repo root)

```sh
node --check app.js
node --check qrgen.js
node --check sw.js
node --check scripts/check-version.mjs
node scripts/check-version.mjs
```

All four `node --check` commands must pass (no output = pass), and
`check-version` must report all checks PASS (11/11 as of v66 — paste the
actual count in your PR; the count grows if new version markers are added).
Do not push with a failing check. There is deliberately no `npm install` /
`npm test` step: this repo has no npm dependencies and no build step.

## 2. Smoke checklist (after merge, on the live site)

Run through these on the **test school only** (see §3). Tick each one in the
PR or in a follow-up comment; note anything skipped and why.

- [ ] School login (email + password) works; wrong password is rejected
- [ ] Student login (admission number + PIN) works; wrong PIN is rejected
- [ ] Teacher login (email + password) works; teacher sees only assigned classes
- [ ] Attendance: mark a class present/absent, save, reload — marks stick
- [ ] Fees: record a fee, print/download the receipt (QR visible)
- [ ] Exams: create an exam, edit it, enter marks, then delete it — the
      create → edit → delete round-trip works and nothing lingers
- [ ] Backup: export a full backup from Settings, then restore it — data
      comes back intact
- [ ] Offline → online sync: go offline, make a change (e.g. mark
      attendance), go back online — the change syncs and survives a reload
- [ ] Two-device check (when the change touches sync): follow
      `docs/two-device-conflict-test-plan.md` — note: that plan lives in
      open PR #28 and is **not on main yet**; use the PR branch copy until
      it merges

## 3. Live-test rules

- **Test school only, never real student data.** Never live-test on a real
  school's data or a real student's record.
- **Backup first.** Export a full backup (Settings → Backup) before
  live-testing any merged change, so a bad merge can be rolled back.
- **Merge one PR at a time and live-test before the next.** Do not stack
  merges: merge one PR, run the smoke checklist (§2), fix what fails, and
  only then merge the next PR. (This is how the v57 B6 live failure — an
  edit that reverted and a delete that did not stick — was caught late.)
- **"Live test skipped" line is mandatory in every PR.** If live testing
  was skipped, the PR body must say so, with the reason and who said so
  (e.g. "Live test skipped — Ashutosh said to merge without live test").
  A PR with no live-test line is not ready to merge.

## 4. Test harness (audit CR-8)

The automated test harness is **currently external — it is not in this
repo**. There is no `npm test` to run and no harness file to import.
Do not claim a harness run in a PR until the harness lands in-repo.

Once the harness lands in-repo (CR-8), this section will say:

```sh
npm test   # placeholder — does NOT work yet; harness not in repo
```

...plus which suites exist and what "pass" means (harness X/Y + check-version
A/B in the commit message). Until then, verification is the pre-push checks
in §1 plus the manual smoke checklist in §2, and CI (`.github/workflows/ci.yml`)
runs §1 automatically on every push and PR. (CI itself is untested on GitHub
until the first PR run — see the workflow file's header comment.)

## 5. CI

`.github/workflows/ci.yml` runs `node --check` (4 files) +
`node scripts/check-version.mjs` on every push and pull request.
Branch protection ("Require status checks to pass" on `main`) is a GitHub-UI
step for the repo owner — no repo file can turn it on.
