# School Saathi — Play Store screenshots shot list (audit H-15)

> **⚠️ STATUS: NO SCREENSHOT HAS BEEN CAPTURED YET.**
> This file is preparation only. No image in `screenshots/` exists yet, no
> screenshot has been taken, and the feature graphic has not been composed.
> Real capture is **BLOCKED** — see [§7](#7-blocked--what-still-needs-a-real-devicebrowser)
> for the exact next step. Nothing in this file, or in any file added by this
> PR, is a screenshot, a mock screenshot, or a substitute for one.

- **Audit item:** H-15 (Phase 0 audit, `school-saathi-phase0-audit.md` §H-15)
- **Base:** `origin/main` at `97ba1c0` (v65) — version **not** bumped by this PR.
  (Prepared from `cfdac97` (v64); `main` moved to v65 while this work was
  in progress, so the worktree was re-based onto v65 before the PR.)
- **App:** School Saathi PWA, multi-school management for Bihar schools.
  `manifest.json` declares `"orientation": "portrait-primary"`, so the phone
  shots are **portrait**.
- **Source of screen names:** the real views in `app.js` / `index.html`
  (school role `NAV`, `PAGE_SCHOOL`, `renderPage()`). Every shot below names
  the exact view function it shows.

---

## 1. Play Store size / format rules (what the shots must satisfy)

| Asset | Play requirement | This plan |
|---|---|---|
| Phone screenshots | JPEG or PNG, **16:9 or 9:16**, minimum **2** | 8 phone shots, all **9:16 portrait** (see §3) |
| 7-inch tablet screenshots | JPEG or PNG | 2 shots (dashboard + attendance) |
| 10-inch tablet screenshots | JPEG or PNG | 2 shots (dashboard + fees) |
| Feature graphic | **1024 × 500** px, JPEG or PNG | Composed only from a real screenshot — see §6 |

Rules that apply to every shot:

- **Real app, real build only.** Screenshots must be taken of the actual app
  running (PWA in a mobile browser, or the installed PWA / Android build when
  one exists). No mock-ups, no Figma frames, no AI-generated screens, no
  screenshots of a screenshot.
- **Captions must be truthful.** A caption may only describe what that exact
  shot shows. Never claim a number of schools, students, or downloads the app
  does not have.
- **No real minor in any shot.** No real child's photo, name, phone number,
  admission number, date of birth, or Aadhaar (even last-4) may be visible.
  See §4 for the staging rules that enforce this.

---

## 2. Screens to capture (exact views)

All shots are taken logged in as the **school** role unless the row says
otherwise. The sidebar labels are the app's own (`NAV.school`, `app.js`).

| # | File (under `screenshots/`) | App screen | View function / where it lives | What must be visible |
|---|---|---|---|---|
| 1 | `01-login.png` | Login screen (Log In tab) | `#login` in `index.html` (tabs: Log In / Student / Teacher) | Login form, School Saathi branding, "Smart Education. Better Tomorrow." No credentials filled in, no password visible |
| 2 | `02-dashboard.png` | School dashboard | `schoolDashboard()` (`app.js`) | Stat cards + charts, with **sample-data** figures only |
| 3 | `03-students.png` | Student Management list | `studentsPage()` (`app.js`) | Student list with search/filters; **sample names only, no photos** |
| 4 | `04-attendance.png` | Attendance — mark & view | `attendancePage()` (`app.js`) | Class selector + present/absent marking for a sample class |
| 5 | `05-fee-receipt.png` | Fee receipt (saved receipt view) | `receiptViewFromDraft()` / `receiptHTML()` (`app.js`) | One receipt for a sample student, sample amounts only |
| 6 | `06-exams-marks.png` | Examinations — exams & marks entry | `examsPage()` (`app.js`) | Exam list / marks entry for a sample class |
| 7 | `07-id-card.png` | ID Card preview | `idCardHTML()` / `idCardsPrintHTML()` (`app.js`, "Print ID Card" action) | One sample ID card, **no photo** (initials placeholder only) |
| 8 | `08-settings-backup.png` | Settings — Full Backup & Restore | `settingsPage()` (`app.js`, "Full Backup & Restore" section) | Settings screen scrolled to the backup section |
| 9 | `09-dashboard-tablet-7in.png` | School dashboard, 7-inch tablet | `schoolDashboard()` | Same dashboard, tablet layout |
| 10 | `10-attendance-tablet-7in.png` | Attendance, 7-inch tablet | `attendancePage()` | Same attendance view, tablet layout |
| 11 | `11-dashboard-tablet-10in.png` | School dashboard, 10-inch tablet | `schoolDashboard()` | Same dashboard, tablet layout |
| 12 | `12-fees-tablet-10in.png` | Fees, 10-inch tablet | `feesPage()` (`app.js`) | Fees list / fee profile, tablet layout |

Minimum for a Play listing is shots 1–8 (phone). Shots 9–12 are the tablet
set; if only one tablet size is available, capture the 7-inch pair first.

Note (v65): the student portal gained first-class Attendance / Fees /
Results pages (`PAGE_STUDENT`, `app.js`). They are **not** part of this
required set; if the coordinator wants them as extra Play shots later, add
them as shots 13–15 with the same staging (§4) and checklist (§8) rules.

The **feature graphic** (`feature-graphic.png`, 1024 × 500) is **not** a
screenshot — it is composed from shot 2 (`02-dashboard.png`) by
`docs/feature-graphic-compose.py` (see §6), only after that shot exists.

---

## 3. Device + orientation per shot

| Shot(s) | Device | Orientation | Notes |
|---|---|---|---|
| 1–8 | Android phone (or phone-sized browser window) | **Portrait 9:16** | App is `portrait-primary` (`manifest.json`); do not rotate |
| 9–10 | 7-inch tablet | Portrait | Same screens as phone, tablet layout |
| 11–12 | 10-inch tablet | Landscape or portrait, as the tablet shows it | Record the orientation used in the checklist (§8) |

Capture at the device's native resolution; do not upscale. Keep the status
bar / browser chrome out of the frame where the capture tool allows it (clean
full-screen PWA capture preferred). Do not crop out the app's top bar or
sidebar — the shot must show the real screen.

---

## 4. Staging — test school + sample data ONLY

**Never stage with a real school, real students, or real data.**

1. **Use a clearly-labelled test school.** Create (or reuse, if one already
   exists for testing) a school whose name says it is a test school, e.g.
   **"Sample Test School (TEST DATA — NOT REAL)"**. The name must make the
   test nature obvious in any shot where the school name is visible.
2. **Sample students only.** Add a handful of sample students by hand for the
   shots (a few per class shown). Names must be obviously sample names — do
   **not** reuse the app's seed fixtures as if they were real, and do not
   present any seed figure as a real statistic.
3. **No photos.** Leave every student photo empty. Do **not** upload any
   child's photo, and do not use a stock photo of a child as a stand-in.
   The ID-card shot uses the initials placeholder only.
4. **No real contact data.** No real phone numbers, emails, admission numbers
   belonging to real children, dates of birth, or Aadhaar digits (not even
   last-4) in any shot. Sample phone numbers, if a field requires one, must
   be obviously fake (e.g. `98765 00000`-style placeholder digits — never a
   real person's number).
5. **Sample money only.** Fee amounts in the receipt shot are sample amounts
   for the test school. Never present them as real collections.
6. **Seed fixtures are TEST fixtures only.** The app's built-in fixtures —
   the 24 fake school names in `SCHOOL_NAMES` (`app.js`) and the `seedDB()`
   sample students (40 students, classes 6th–10th) — exist for tests and the
   harness. They must **never** appear in a Play screenshot or caption as
   real schools, real students, or real stats. If a seed name is visible
   anywhere during staging, re-stage with the labelled test school instead.
7. **Log out / clean up after capture.** Delete the staging test school (or
   its sample students) from any shared/test project afterwards if it was
   created only for the shots, so sample data does not linger as if real.

---

## 5. File naming

- Directory: `screenshots/` at the repo root (does **not** exist yet — it is
  created when the first real screenshot lands, in a follow-up PR).
- Files: `screenshots/<name>.png` exactly as listed in §2
  (`01-login.png`, `02-dashboard.png`, … `12-fees-tablet-10in.png`).
- Feature graphic: `screenshots/feature-graphic.png` (1024 × 500, composed
  by the script in §6 — never hand-drawn, never a screenshot renamed).
- Keep the original capture files; do not rename a shot to a different
  screen's name after the fact. If a re-take is needed, overwrite the same
  filename and note the new date in §8.

---

## 6. Feature graphic

- Size: **1024 × 500** px, PNG.
- Tool: `docs/feature-graphic-compose.py` (Python + PIL, no other
  dependency). It takes **one real app screenshot** (PNG/JPEG) plus the
  school logo and composes the graphic: real screenshot on the right, logo +
  "School Saathi" + tagline "Smart Education. Better Tomorrow." on the left,
  on the app's theme colour (`#0A1E4B`).
- The script **refuses to run without a real screenshot input** (clean
  error, non-zero exit) and **never embeds fake UI** — the only app imagery
  in the graphic is the real screenshot file passed to it.
- Logo input: the script accepts a **PNG** logo. The repo's source logo is
  `icons/logo.svg`; PIL cannot rasterise SVG, so export it to PNG first
  (or use the shipped raster `icons/icon-512.png`) and pass that path with
  `--logo`. Passing an `.svg` path is rejected with a clear message.
- Usage (after shot 2 exists):

```sh
python3 docs/feature-graphic-compose.py \
  --screenshot screenshots/02-dashboard.png \
  --logo icons/icon-512.png \
  --output screenshots/feature-graphic.png
```

---

## 7. BLOCKED — what still needs a real device/browser

**No screenshot has been captured yet, and none can be captured on this VM.**

- This VM has **no headless-browser tooling**: no Chromium / Chrome /
  Firefox binary, no Playwright / Selenium, no `wkhtmltoimage`, and no
  `node_modules` in the clone (verified by the agent that prepared this
  file). A real screenshot therefore cannot be produced here.
- **Exact next step:** the coordinator (parent agent) arranges a live
  browser task or a real Android device:
  - **Who:** parent agent / Ashutosh (or BAT, if he assigns it).
  - **What:** open the live app (GitHub Pages PWA, current `main` build,
    v64) in a real mobile browser or on a real Android phone/tablet, log in
    to the labelled test school from §4, and capture shots 1–8 (phone
    portrait), then 9–12 (tablets) per §2–§3.
  - **Which build:** the deployed PWA from `origin/main` at `97ba1c0`
    (v65) — the same base this PR was prepared from. If `main` has moved
    on by capture day, record the new HEAD in the checklist (§8) instead.
  - After capture, the shots land in `screenshots/` in a follow-up PR, the
    checklist below is filled in, and the feature graphic is composed with
    the script in §6.

---

## 8. Capture checklist (all rows EMPTY — nothing captured yet)

| # | File | Captured by | Date | Device / browser | Build (HEAD) | Verified (no real minor data visible, caption truthful) |
|---|---|---|---|---|---|---|
| 1 | `screenshots/01-login.png` | | | | | |
| 2 | `screenshots/02-dashboard.png` | | | | | |
| 3 | `screenshots/03-students.png` | | | | | |
| 4 | `screenshots/04-attendance.png` | | | | | |
| 5 | `screenshots/05-fee-receipt.png` | | | | | |
| 6 | `screenshots/06-exams-marks.png` | | | | | |
| 7 | `screenshots/07-id-card.png` | | | | | |
| 8 | `screenshots/08-settings-backup.png` | | | | | |
| 9 | `screenshots/09-dashboard-tablet-7in.png` | | | | | |
| 10 | `screenshots/10-attendance-tablet-7in.png` | | | | | |
| 11 | `screenshots/11-dashboard-tablet-10in.png` | | | | | |
| 12 | `screenshots/12-fees-tablet-10in.png` | | | | | |
| — | `screenshots/feature-graphic.png` (1024 × 500) | | | | | |

**Verification rule for every row:** before a row is marked verified, a
second person (not the capturer) opens the file and confirms: (a) no real
minor's photo / name / phone / admission number / DOB / Aadhaar is visible;
(b) the caption that will accompany it in Play describes exactly what the
shot shows; (c) the file is the real app, not a mock or a re-draw.
