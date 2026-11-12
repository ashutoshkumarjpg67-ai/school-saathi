# Cloudflare assessment — Phase 1 (ASSESSMENT ONLY, no change made)

Status: **BLOCKED — nothing set up, nothing changed.** This note records
exactly what is blocked and what the user would need to provide before
Cloudflare setup can start. No account was created, no DNS was changed,
no domain was touched.

## What Cloudflare would be (roadmap §5.5)

An **additional infrastructure layer only**, in front of the GitHub
Pages site — DNS, CDN, SSL, WAF and DDoS protection, and caching.
It does **NOT** do database, authentication, RLS, Edge Functions, or
any app data. Supabase stays the backend; GitHub Pages stays the
primary hosting (Cloudflare Pages is backup only, never a second live
host).

Cache rules when it is eventually set up:

- HTML and `version.json` — **no-cache** (a cached old shell is how
  stale-version bugs happen; the app already had service-worker cache
  problems).
- Static assets (`app.js`, `styles.css`, icons) — may be cached
  (they carry `?v=N` markers).
- Supabase API calls — **must bypass the Cloudflare cache**.

## What is blocked

| Need | Status |
|---|---|
| Custom domain (e.g. `school-saathi.in` or similar) | **None on file.** The site today is `ashutoshkumarjpg67-ai.github.io/school-saathi/` — a `github.io` sub-path, which cannot be put behind Cloudflare DNS. A custom domain is a precondition. |
| Cloudflare account | **None on file.** No account exists for this project, and none was created (creating accounts is the owner's step). |
| DNS control of the domain | **N/A until a domain exists.** DNS would move (or point) to Cloudflare's nameservers — an owner-only change. |
| Cost decision | Free tier is enough for development and the VM School pilot (roadmap §5.5). Any paid upgrade needs explicit approval, funded from school fees (₹299–499/month per school, roadmap figure). No payment was made or promised. |

## What the user needs to provide (in order)

1. **A custom domain** — buy (or choose) one, e.g. `school-saathi.in`.
   Buying it is the owner's step; the expected cost was estimated in the
   separate Play Store roadmap, not re-quoted here.
2. **A Cloudflare account** — free account created by the owner
   (email + password), or an invitation for the assistant to be added
   to the owner's account. No credentials in chat.
3. **DNS access** — the domain's registrar login, or the owner making
   the nameserver change themselves on instruction.
4. **Go-ahead** — explicit approval to point the domain at Cloudflare
   and then at GitHub Pages, with a named low-traffic window (the site
   must not be re-pointed during school hours).

## What setup will look like (when unblocked)

1. Add the domain to Cloudflare (free plan), note the two nameservers.
2. Change nameservers at the registrar; wait for propagation.
3. DNS: `CNAME` (or `A` records) to GitHub Pages for the site;
   SSL mode Full (Strict) once GitHub Pages serves HTTPS for the
   custom domain.
4. Cache rules as above; then verify: site loads on the custom domain,
   `version.json` is never cached (change the version, reload, confirm
   the new number), Supabase login/sync still works, and the old
   `github.io` URL still works as a fallback.
5. Only then is Phase 1's Cloudflare item done.

## What NOT to do (roadmap §9)

- Do not move database, Auth or any app data to Cloudflare.
- Do not cache HTML or `version.json`, and do not let Cloudflare cache
  Supabase API calls.
- Do not run GitHub Pages and Cloudflare Pages as two live hosts.
- Do not start this setup until the domain + account + go-ahead above
  are all in place.
