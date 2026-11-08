# School Saathi

**School Saathi — Smart Education. Better Tomorrow.** Multi-school management system for schools in Bihar with Super Admin, School Admin & Student dashboards — attendance, fees, exams, homework, notices & reports.

## Run

Static site — no build step, no server, no npm. Open `index.html` in any browser, or host the folder on GitHub Pages.

## Features

- **Landing page** — hero, live platform stats, features, role demos
- **Super Admin dashboard** — 24 schools, 12,450 users, growth chart, 75% subscription donut, Top 5 schools, approve/remove schools, users, subscriptions, analytics, reports
- **School Admin dashboard (St. Xavier School, Patna)** — 1,250 students, 85 teachers, ₹8,45,000 fee collected, 92% attendance donut, fee trend Apr–Aug, recent activities
- **Working modules** — student management (add/edit/delete), attendance marking, fee collection, exams & marks entry, homework, notices, CSV reports, settings
- **Student view** — Riya Kumari, Class 10th-A: attendance 92%, fees paid, results 95%, homework with done toggle
- **Animated charts** — donut sweep, growing bars, drawing line chart, count-up numbers, hover tooltips, toasts
- **Hindi + English** toggle in the top bar
- **PWA-ready** — installable, works offline after first load (manifest + service worker, network-first navigation)

## Demo logins (one-tap on the login screen)

| Role | Email | Password |
| --- | --- | --- |
| Super Admin | super@school-saathi.in | admin123 |
| School Admin (Rahul Kumar) | rahul@stxavier.in | admin123 |
| Student (Riya Kumari) | riya@student.in | student123 |

## Data

Demo data is seeded once into `localStorage` (`schoolSaathiDBv1`) and never overwritten on reload — your edits persist on the device. Use **Reset Demo Data** (Settings) to restore the seed.

## Deploy (GitHub Pages)

Push this folder to the `school-saathi` repo, then enable **Settings → Pages → Deploy from branch → main → /(root)**. The live site works in Chrome on PC and mobile; the service worker is network-first for navigation, so new deploys reach users (bump `CACHE_NAME` in `sw.js` on each release).
