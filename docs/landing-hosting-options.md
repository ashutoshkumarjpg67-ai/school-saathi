# Landing page — hosting options

**Context.** School Saathi is a PWA served from the GitHub Pages root of this
repo (`https://ashutoshkumarjpg67-ai.github.io/school-saathi/`). Today the
root serves the app login directly (`index.html`). `landing.html` (added in
the same PR as this doc) is a **standalone page, not wired as the entry
point** — nothing in this PR changes `index.html`, `manifest.json`, `sw.js`,
the PWA `start_url`/`scope`, or how the app is installed or opened.

**Decision needed.** Where should the landing page live long-term, and what
should the site root serve? This doc compares the two options and recommends
one. It does **not** decide hosting by itself.

## Option A — `/app` split inside this repo

Move the app under a sub-path and make the landing page the root:

- `index.html` (root) becomes the landing page (today's `landing.html`
  content, renamed or copied).
- The app moves to `/app/` — `app/index.html`, `app/app.js`,
  `app/styles.css`, `app/sw.js`, `app/manifest.json`, icons, etc.
- `manifest.json`: `start_url` changes from `index.html` to `/app/` (or
  `/app/index.html`) and `scope` changes from `.` to `/app/` (or the repo
  sub-path equivalent).
- `sw.js`: the precache list and fetch handler must be re-based to the new
  paths; the service worker's scope becomes `/app/`.
- All versioned asset URLs (`?v=64` cache-busters, `version.json` fetch,
  icon paths) must be re-checked under the new base path.

**Pros**

- One repo, one deployment, one URL family: the landing and the app stay
  together and deploy in a single push.
- No new repo, DNS, or domain work.

**Cons / risks**

- **PWA breakage risk (the big one).** Installed users have the app pinned
  to the current `start_url`/`scope`. Changing them can break the installed
  icon, the offline shell, and the update flow until the new service worker
  takes over — and a wrong scope can leave the old worker serving stale
  files. This needs a careful migration and a live re-test of install,
  offline open, and update on a real device.
- **Every internal path moves.** `sw.js` precache, `manifest.json` icons,
  `qrgen.js`/`app.js` references, and any hard-coded `index.html` links must
  all be re-based; a missed path is a silent 404 in production.
- **Effort:** a medium refactor plus a full PWA regression pass
  (install → offline → update → login → sync), not a rename.

## Option B — Separate repo / subdomain (or a second GitHub Pages project page) for the landing

Keep this repo and the app exactly as they are. Publish the landing page
from a separate place:

- A new repo (e.g. `school-saathi-landing`) published as its own GitHub
  Pages project page, **or** a subdomain (e.g. `www.school-saathi.in`) —
  the subdomain route needs a domain and DNS, which we do not have today.
- The landing links to the app at
  `https://ashutoshkumarjpg67-ai.github.io/school-saathi/` ("Open the app").
- The app repo is untouched: `index.html`, `manifest.json`, `sw.js`,
  `start_url`, `scope`, precache list, and versioning all stay exactly as
  they are.

**Pros**

- **Zero risk to the live app.** No PWA change, no service-worker
  migration, no re-test of install/offline/update. The app keeps working
  for installed users without any action from them.
- **Small effort.** Copy `landing.html` (plus `icons/logo.svg` and the icon
  files it references) into the new repo and publish. Privacy/terms pages
  and screenshots can land there later without touching the app repo.
- **Clean separation.** Marketing pages change often; the app repo stays
  focused on the app, its version checks, and its release process.

**Cons / risks**

- Two repos / two deployments to keep in sync (landing links must point at
  the live app URL; if the app URL ever changes, the landing link must be
  updated).
- A second GitHub Pages project page has a different URL from the app
  (unless a custom domain/subdomain is set up later), so the landing URL
  and the app URL are not the same host.
- The subdomain variant needs a domain purchase/registration and DNS
  setup — extra cost and a decision of its own.

## Recommendation

**Recommend Option B — a separate repo / project page for the landing, app
untouched.**

Reasons, in order:

1. **Risk:** Option A risks breaking the installed PWA for existing schools
   (start_url/scope/service-worker migration). Option B risks nothing in
   the live app.
2. **Effort:** Option B is a copy-and-publish; Option A is a refactor plus
   a full PWA regression pass on a real device.
3. **PWA impact:** Option B has none. Option A touches every PWA surface
   (`start_url`, `scope`, `sw.js` precache, update flow).

Option A only becomes the better choice if a single URL family matters more
than the migration risk — e.g. if the Play Store listing or school onboarding
material must show one domain for both the landing and the app. Even then,
do it as a planned migration with a device-tested install/offline/update
pass, not as a side effect of adding a landing page.

## What changes after approval (wiring steps — chosen option, B)

1. Create the landing repo (e.g. `school-saathi-landing`) and publish it
   on GitHub Pages.
2. Copy `landing.html` → `index.html` in the new repo, plus `icons/logo.svg`
   and `icons/icon-192.png` (the only local assets the page references).
3. Check the "Open the app" / "Create a school account" links point at the
   live app URL above; check the page renders on mobile and desktop.
4. When they exist, add `privacy-policy.html`, `terms.html`
   (policy text is CR-5, still pending — do not invent it) and the
   `screenshots/*.png` files (H-15, separate work), and remove the
   "coming soon" / "screenshot pending" markers for whatever has landed.
5. Optionally later: point a custom domain/subdomain at the landing repo
   (needs a domain + DNS decision) and link it from the app's login screen.

## If Option A is chosen instead (wiring steps)

1. Move the app files under `/app/`; move the landing content to root
   `index.html`.
2. Update `manifest.json` (`start_url`, `scope`, icon paths) and `sw.js`
   (precache list, fetch scope) to the new base path; re-check every
   `?v=N` asset URL and the `version.json` fetch.
3. Bump nothing else: the version stays as-is; this is a move, not a
   release.
4. Live-test on a real device before merging: fresh install, offline open,
   update from the old installed version, login, and one sync round-trip.
   Do not merge on a code-only review.

## Open items this doc does not decide

- **Pricing** is TBD (audit H-14) — the landing says so honestly and will
  be updated when pricing is decided.
- **Privacy Policy / Terms text** (audit CR-5) — still pending; the landing
  links to clearly-marked future locations and invents no policy text.
- **Screenshots** (audit H-15) — the landing has placeholder slots marked
  "screenshot pending"; real screenshots are separate work.
- **Support mailbox** — `support@school-saathi.in` is the address listed in
  the app's schema (`supabase/01_schema.sql`); whether the mailbox is
  actively monitored is **UNVERIFIED**.

## Decision question for Ashutosh

**Landing page hosting — which option do you choose: (A) `/app` split in
this repo (landing at the root, app moves under `/app/`, PWA start_url/scope
and service worker change, needs a device-tested install/offline/update
pass), or (B) separate repo / project page for the landing, app untouched
(recommended — zero risk to the live app, copy-and-publish)? If (B), do you
want it as a second GitHub Pages project page, or on a subdomain (needs a
domain + DNS)?**
