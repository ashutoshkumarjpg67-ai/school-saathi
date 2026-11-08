# School Saathi

**School Saathi — Smart Education. Better Tomorrow.** Multi-school management system for schools in Bihar with Super Admin, School Admin & Student dashboards — attendance, fees, exams, homework, notices & reports.

## Run

Static site — no build step, no server, no npm. Open `index.html` in any browser, or host the folder on GitHub Pages.

## Features

- **Landing page** — hero, live platform stats, features, role demos
- **Super Admin dashboard** — 24 schools, 12,450 users, growth chart, 75% subscription donut, Top 5 schools, approve/remove schools, users, subscriptions, analytics, reports
- **School Admin dashboard** — students, teachers, fee collection, attendance donut, fee trend, recent activities
- **Working modules** — student management (add/edit/delete), attendance marking, fee collection, exams & marks entry, homework, notices, CSV reports, settings
- **Student view** — attendance, fees, results, homework with done toggle
- **Animated charts** — donut sweep, growing bars, drawing line chart, count-up numbers, hover tooltips, toasts
- **Hindi + English** toggle in the top bar
- **PWA-ready** — installable, works offline after first load (manifest + service worker, network-first navigation)

## Logins

No demo logins. The platform owner signs in as Super Admin (`super@school-saathi.in`). Schools sign up from the login screen — each school starts empty, with its own data on that device.

## Data

Platform demo data is seeded once into `localStorage` (`schoolSaathiDBv1`) and never overwritten on reload — your edits persist on the device. Use **Reset Demo Data** (Settings) to restore the seed. Every school that signs up starts with an empty database under its own key.

## Deploy (GitHub Pages)

Push this folder to the `school-saathi` repo, then enable **Settings → Pages → Deploy from branch → main → /(root)**. The live site works in Chrome on PC and mobile; the service worker is network-first for navigation, so new deploys reach users (bump `CACHE_NAME` in `sw.js` on each release).
