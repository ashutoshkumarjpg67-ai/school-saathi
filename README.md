# School Saathi

**School Saathi — Smart Education. Better Tomorrow.** Multi-school management system for schools in Bihar — School Admin, Teacher & Student dashboards: attendance, fees, exams, homework, notices & reports.

## Run

Static site — no build step, no server, no npm. Open `index.html` in any browser, or host the folder on GitHub Pages.

## Features

- **School Admin dashboard** — students, attendance, fees & receipts, exams & marks, homework, notices, CSV reports, settings
- **Student login** — admission number + PIN, school-scoped; attendance, fees, results & homework
- **Teacher login** — email + password, assigned classes only
- **Fees** — collection with printable receipts (QR), defaulter list, WhatsApp reminders via wa.me (manual send)
- **Attendance** — class-wise marking
- **Exams & marks** — exam creation, marks entry, results
- **Backup & restore** — full school data backup and restore from Settings
- **Sync** — Supabase-backed sync with offline localStorage fallback
- **Hindi + English** toggle in the top bar
- **PWA-ready** — installable, works offline after first load (manifest + service worker, network-first navigation)

## Accounts

There are no demo logins. Each school creates its own account from the login screen ("New school? Create a school account"). New schools start empty — no demo data is seeded.

## Data

Each school's data is stored per school (Supabase + localStorage on the device). Use **Backup** (Settings) to export a full copy of your school's data.

## Deploy (GitHub Pages)

Push this folder to the `school-saathi` repo, then enable **Settings → Pages → Deploy from branch → main → /(root)**. The live site works in Chrome on PC and mobile; the service worker is network-first for navigation, so new deploys reach users (bump `CACHE_NAME` in `sw.js` on each release).

## Contributing / Verifying a change

Before pushing, run the pre-push checks in `TESTING.md` (`node --check` on the four JS files + `node scripts/check-version.mjs`), then live-test on the test school only — never on real student data. Fill in every box of the pull-request template, including the live-test line (or the "live test skipped" reason + who said so). CI runs the same checks automatically on every push and PR.
