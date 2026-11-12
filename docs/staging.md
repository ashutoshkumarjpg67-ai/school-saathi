# Staging — School Saathi (Phase 1)

Staging is where every change is proven **before** it touches the live
site. The live site is https://ashutoshkumarjpg67-ai.github.io/school-saathi/
(`main` branch, GitHub Pages). Staging is a **separate branch served as a
preview link** — no new paid service, no new account, no deploy.

## What staging is

| | Live | Staging |
|---|---|---|
| Branch | `main` | `staging` (long-lived, mirrors `main` at the last verified version) |
| URL | https://ashutoshkumarjpg67-ai.github.io/school-saathi/ | https://raw.githack.com/ashutoshkumarjpg67-ai/school-saathi/staging/index.html |
| Data | Real school data | **Test data only** — seeded fixtures / TEST school, never a real school |

## One-time setup (coordinator / owner only)

```bash
git fetch origin
git checkout -b staging origin/main
git push -u origin staging
```

Then open the staging preview link above and confirm the login screen
renders (same version number as live, in the sidebar footer).

## Updating staging

Staging is updated **only** from `main`, and only after CI is green on
`main` (or on the PR being tested — see below):

```bash
git fetch origin
git checkout staging
git merge --ff-only origin/main   # fast-forward only; never force-push
git push origin staging
```

Rules:

- **Never merge `staging` into `main`.** Staging follows main, not the
  other way round.
- **Never commit directly to `staging`.** Fixes go to `main` (via PR)
  and are then fast-forwarded into staging.
- **Never force-push `staging`.** If it diverges, stop and ask — do not
  rewrite it.
- **Never test with a real school's data or account on staging.** Use
  the seeded fixtures (see `scripts/seed-fixtures.js`) or the TEST
  school only.

## Testing a PR on staging (preview links)

Any branch can be previewed without touching `staging`:

```
https://raw.githack.com/ashutoshkumarjpg67-ai/school-saathi/<branch>/index.html
```

1. Push the PR branch.
2. Open its githack preview link (first load can take a minute —
   githack builds the preview on demand).
3. Hard-reload once (`Ctrl+Shift+R`) — the service worker caches the
   app shell, and a stale shell is the most common "it still shows the
   old version" cause. The sidebar footer version number must match
   the PR's version.
4. Test with fixture / TEST-school data only.
5. Record the result (preview link + what passed/failed) in the PR.

## What staging proves (Phase 1 exit gate)

- Staging renders and behaves like live at the same version.
- `npm test` is green (`tests/smoke.test.mjs`).
- Backup → reset → import round-trips on staging data
  (see `docs/backup-restore.md`).

## If staging breaks

Live is untouched — staging is a separate branch and a separate URL.
Fix on `main` via PR, then fast-forward `staging` again. If the preview
link itself serves stale files, append a fresh `?v=` cache-buster is
**not** needed — the app's own `?v=N` asset markers already change
with each version; a hard reload is enough.
