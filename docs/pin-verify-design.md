# CR-3 — Server-side PIN verification: design doc

**Status: DESIGN DOC ONLY — no code, no decision yet.**
**Audit item:** Phase 0 audit CR-3 (single-iteration SHA-256 + 4-digit PIN).
**Base verified against:** origin/main `60fddc1` (v67), 2026-11-10.
**Scope:** student PIN verification only. Related items are named where they touch
this design, but this doc does **not** decide them: H-3 (phone-derived PINs,
open PR #15), H-4 (lockout), H-5 (at-rest encryption), H-6 (owner access to
`parent_pin` hashes), CR-2 (`ss_parent_lookup`).
**Rule for this doc:** no KDF parameters are presented as chosen, no rollout
dates are given. Where options exist, they are options with trade-offs.
Nothing in this doc authorises a build — the build starts only after
Ashutosh answers the decision questions in §5.

---

## 1. Current state at v67 (verified by grep — see §6 for sources)

### 1.1 What v61 / v62 already verify server-side

**Student cloud login (v61, SQL 17) — done.**

- `supabase/17_student_cloud_login.sql` defines `ss_student_cloud_login`
  (SECURITY DEFINER, granted to `anon` + `authenticated`, no `PUBLIC`).
  It looks up the student by school + admission number, checks the PIN
  hash on the server, and returns only that one student's dashboard
  payload. The PIN hash itself is never returned; Aadhaar comes back as
  last-4 only.
- Server-side rate limit already exists: `ss_student_login_attempts`
  (one row per school + admission number), 5 wrong PINs lock that
  student for 15 minutes; unknown admission numbers never create a row
  and always get the same generic `{ok:false}`.
- App side: `doStudentLogin` (`app.js:5563`) branches on a
  `cloud:<server-uuid>` school to `doStudentCloudLogin` /
  `sbStudentCloudLogin` (`app.js:5616–5621`; v61 comment at
  `app.js:5609–5615`), which calls
  `rpc/ss_student_cloud_login`. The cloud session is a read-only slice
  (`loginCloudStudent`), stored as a snapshot and cleared on logout.
  No local-login change was made in v61.

**Teacher cloud login (v62, SQL 18) — done, same pattern.**

- `supabase/18_teacher_cloud_login.sql` verifies the teacher password
  server-side with the same server rate limit, plus 30-day session
  tokens and token-authenticated write RPCs. App side:
  `doTeacherLogin` (`app.js:5817`) branches to cloud login for
  `cloud:` schools.

**School login server rate limit (v63, SQL 19) — done, for context.**

- `ss_school_login_precheck` / `ss_school_login_failed` /
  `ss_school_login_ok` RPCs hold a per-email server lock (5 wrong
  passwords = 15 min). A failed precheck fails open. This covers the
  *school* password, not the student PIN.

### 1.2 The honest nuance v61/v62 do NOT fix: the KDF is still fast SHA-256

Both the local and the server verify use the **same single-iteration
salted SHA-256**. The server just runs the same digest with pgcrypto:

- Local: `hashPwNew()` (`app.js:147–152`) stores
  `s256$<salt>$<hex(sha256(salt + '|' + pw))>`; salt is 16 random bytes
  (`randomHex(16)`); the digest is a hand-rolled synchronous SHA-256
  (`sha256Hex`, `app.js:104–146` — hand-rolled because the login paths
  are synchronous and WebCrypto's digest is async).
- Server: SQL 17 verifies with
  `encode(extensions.digest(convert_to(v_salt || '|' || v_pin, 'UTF8'), 'sha256'), 'hex')`
  — one iteration, same format. SQL 18 does the same for teacher
  passwords.

So what v61/v62 actually fixed is **where the check runs and who counts
the failures** (server-side, tamper-proof, shared across devices). They
did **not** make the hash itself slow. A leaked hash is still a fast
hash on either side. Any design that claims to "fix CR-3" must address
both halves: (a) verify location + rate limiting, and (b) hash strength.
v61/v62 did (a) for the cloud path only.

### 1.3 What is still local-only: the local student PIN path

- **Local login path:** `doStudentLogin` (`app.js:5563–5610`) — when the
  school's data is on the device, the PIN is checked against the local
  record: `verifyPin(pin, stu)` (`app.js:183–186`) → `verifyPw` →
  single-iteration SHA-256. A legacy plaintext `parentPin` still
  verifies by direct comparison (`app.js:5592`) for pre-v54 records,
  and `migrateV54` (`app.js:4135–4145`) hashes it on load.
- **PIN space:** `randomPin()` (`app.js:94–97`) makes a 4-digit PIN,
  1000–9999 — **9,000 combinations**. An admin may set 4–6 digits
  (`tPinLen: 'PIN must be 4–6 digits'`, enforced at `app.js:6873`
  and `app.js:7387`). A 6-digit PIN has 900,000 combinations *if*
  random; an admin-chosen one (e.g. a birth year) can be far weaker.
- **Lockout is device-local only:** `PIN_FAIL_KEY =
  'schoolSaathiPinFails'`, `PIN_MAX_FAILS = 5`, `PIN_LOCK_MS = 15 min`
  (`app.js:5527–5540`). The record lives in localStorage; clearing
  localStorage, using private mode, or using another device resets it.
  The code comment at `app.js:5522–5526` says this honestly: it stops
  casual guessing, not a determined local attacker. (v59 added the same
  device-local pattern for school/teacher logins, `LOGIN_FAIL_KEY`,
  `app.js:5541–5561`.)
- **Phone-derived PINs still exist for legacy records (H-3):**
  `parentPinFromPhone()` (`app.js:4125`), `migrateV12`
  (`app.js:4126–4130`) and `migrateV55` (`app.js:4149–4162`) still
  re-derive a PIN from the phone's last 4 digits when a record has no
  hash. No *new* student gets a phone-derived PIN (admission/import
  generate a random one, `app.js:4995`, `app.js:6935`), but the
  re-derive code still runs on old records. PR #15 ("Phase 1 (H-3):
  remove phone-derived student PINs", branch
  `fix/phase1-sec-phone-pin`) is **open, non-draft, unmerged**; per the
  handover notes its decision is moot for now because there are no real
  students yet.
- **The hash travels in sync:** upload sends the hash
  (`parent_pin: s.parentPinHash || null`, `app.js:847`); pull maps a
  hash to `parentPinHash` and a non-hash server value to plaintext
  `parentPin` (`app.js:1736–1737`). The school owner can therefore
  read every student's PIN hash from the server column (audit H-6) —
  the owner RLS policy grants all operations including `parent_pin`.

### 1.4 The exact attack the audit describes (CR-3)

1. The attacker obtains a PIN hash. Leak paths that exist today:
   a stolen phone / copied localStorage (the whole DB, hashes included,
   is plaintext in localStorage — audit H-5); a shared full-backup JSON
   (`buildFullBackup` exports the whole DB, hashes included); or the
   server column `ss_students.parent_pin`, readable by the school owner
   / platform admin (audit H-6).
2. The attacker tries PIN candidates **offline**, computing
   `sha256(salt + '|' + candidate)` themselves. There is no rate limit
   off-device: the 5-fail/15-min lockout only exists inside the app, and
   only on the device that holds it. Clearing localStorage resets it.
3. With 9,000 possible 4-digit PINs and a fast hash, the audit states
   the whole space falls in a fraction of a second. (Timing not
   re-measured in this task — see §6.)
4. The recovered PIN logs the attacker in as that student — from any
   device, via the cloud login (v61), which cannot tell a guessed PIN
   from the real one except through the server lockout, which only
   triggers after 5 *online* failures.

Two precisions the audit's one-line summary does not spell out, but
which change what a fix can achieve:

- **On a stolen school device the PIN is not the main prize.** The
  device already holds the whole school DB in plaintext localStorage
  (H-5). The PIN's real job there is casual separation between students
  on a shared device, not protection against a determined thief. No
  local-PIN redesign can fix that; only at-rest encryption (H-5) can.
- **The sharpest incremental risk is the server column (H-6).** A
  leaked owner token yields *every* student's hash at once, and the
  cloud login turns each cracked PIN into a login from anywhere. That
  is why the server-side lockout (v61) matters — and why hash strength
  still matters even after v61: the lockout only slows *online*
  guessing, it does nothing against an *offline* crack of a leaked
  hash.

### 1.5 What CR-3 does NOT cover

- **School/teacher passwords** share `hashPwNew` (same fast hash), but
  they are longer (minimum 6 characters, `app.js:761`) and their
  online paths already have server-side rate limiting (v62 teacher
  cloud, v63 school login). Changing the password KDF is a separate
  decision; this doc only decides the PIN. (Any build that touches
  `hashPwNew` must state whether passwords change too, or PINs get
  their own hash function — see Option B.)
- **CR-2** (`ss_parent_lookup` anon PIN oracle) and **H-5** (at-rest
  encryption) are separate items with their own fixes/decisions.
- **Live state I could not verify from the repo:** whether SQL 17 /
  SQL 18 have actually been applied to the live Supabase project (no
  DB access in this task); the audit's brute-force timing claim
  (not re-measured); whether any real students exist yet (handover
  notes say none — not independently verified here).

---

## 2. Design options

All three options assume the v61/v62 cloud path stays as it is unless
the option says otherwise. None of them invents KDF parameters or dates:
the audit suggests PBKDF2 ≥100k iterations / bcrypt / argon2id as the
*class* of solution; the exact algorithm and parameters are a build-time
decision, to be justified in the build PR.

### Option A — Server-side verify for online logins + honest local fallback (RECOMMENDED — see §3)

**How it works.** When the device is online, the student PIN is
verified on the server — either by extending the existing SQL 17 RPC
pattern (`ss_student_cloud_login` already does server-side PIN check +
server lockout) or by a new Edge Function, if a slow KDF is chosen
that Postgres cannot provide (sub-decision for the build, see below).
The server returns a short-lived session token; the app never sees the
stored hash. When the device is offline, the existing local verify
(`doStudentLogin` local branch, `verifyPin`) still works, with the
local lockout kept — and the app says so honestly (e.g. an "offline
login" indication), because the offline path keeps today's security
level.

**What changes (files/functions only, no code).**

- New: `supabase/functions/verify-student-pin/` — only if the Edge
  Function route is chosen. There is no `supabase/functions/`
  directory today; this would be the repo's first Edge Function.
- Optional new SQL: a slow-hash column or re-hash migration, and
  reuse/extension of `ss_student_login_attempts` (SQL 17) for the
  server lockout.
- `app.js`: `doStudentLogin` (online branch), the
  `sbStudentCloudLogin` / `doStudentCloudLogin` area, session restore
  for the new token. `hashPin` / `verifyPin` stay for the offline
  fallback. UI strings in `index.html` / `app.js` only if new copy is
  needed.

**Offline-login behaviour.** Preserved. A student can still log in on
the school device with no network. The trade-off is explicit: the
offline path is the weak path, and it stays weak (fast hash + local
lockout). An attacker who can force the app offline — or who simply
uses a stolen device — still faces only the local checks.

**Migration path for existing PINs.** A stored `s256$` hash cannot be
converted into a slow-KDF hash without the plaintext PIN, so migration
is lazy by necessity: on the next successful *online* login the server
re-hashes the presented PIN with the slow KDF and stores that; until
then the old `s256$` hash keeps working behind the server lockout.
Legacy plaintext rows keep the existing upgrade paths (`migrateV54`
locally, SQL 17's upgrade-on-success server-side). Phone-derived PINs:
decide together with PR #15 whether the re-derive code is removed
when this lands or left alone.

**Risks.**

- New infrastructure if the Edge Function route is chosen: deploy step
  (Supabase dashboard/CLI), logs, cold starts, Free-plan limits — and
  a paused project means no online logins at all. The SQL 17 RPC route
  avoids all of that, which is why the RPC-first sub-choice matters.
- Server down ⇒ online login fails. The local fallback covers it, but
  the fallback *is* the weak path — so the security gain exists only
  while the server is up.
- Lockout as denial-of-service: admission numbers are sequential and
  guessable (`ADM-YYYY-NNN`, first `ADM-2025-001` per school — audit
  CR-2), so anyone who knows a number can lock that student out for
  15 minutes with 5 wrong guesses. Server-side lockout makes this
  worse than the current device-local one, because it locks the student
  on *every* device at once.
- Secrets: if the server issues session tokens, the signing secret
  lives in Supabase dashboard secrets — never in the repo, never in
  client code. No `service_role` key anywhere near the client (same
  rule as CR-6).

### Option B — Slow KDF + longer PIN for local logins (no server round-trip)

**How it works.** Replace the PIN hash with a slow KDF (PBKDF2 /
bcrypt / argon2id class — exact choice at build time) and make random
PINs 6 digits. Login still verifies locally, with the local lockout
kept as defence-in-depth. Nothing needs the network.

**What changes (files/functions only, no code).**

- `app.js`: `hashPwNew` / `hashPin` / `verifyPw` / `verifyPin`
  (decision needed: PINs get their own hash function, or passwords
  change too); `randomPin` (6 digits); PIN-set UI (`tPinLen`,
  `app.js:6873`, `app.js:7387`, `maxlength="6"`).
- `supabase/17_student_cloud_login.sql` and
  `supabase/18_teacher_cloud_login.sql`: the server verify must
  understand the new hash format, or the local and cloud paths verify
  *different* hashes — a fork that must be decided explicitly, not
  drifted into.
- The hand-rolled sync SHA-256 (`sha256Hex`) and its harness FIPS
  vectors stay unless the password path also moves.

**Offline-login behaviour.** Unchanged — fully offline, no server
dependency. This is B's main advantage.

**Migration path for existing PINs.** Same lazy re-hash problem as A:
existing `s256$` hashes can only be upgraded when the plaintext PIN
is presented at a successful login; until then they keep working.
Existing 4-digit PINs keep working until reset or re-hashed. New
6-digit random PINs must be communicated to students/parents — today
the PIN is never rendered after it is set, so the admission flow needs
a "show the PIN once" step (admin-only, already the pattern for new
students).

**Risks.**

- **B does not fix offline brute-force; it only slows it.** A 4-digit
  PIN is 9,000 candidates — even at an illustrative ~100 ms per slow
  hash that is ~15 minutes for the whole space (illustrative
  arithmetic, not a measurement). A random 6-digit PIN is 900,000
  candidates, ~25 hours at the same rate. Better, but still bounded —
  and only if the PIN is actually random and 6 digits.
- A slow KDF in JS blocks the UI thread if kept synchronous; the
  async WebCrypto PBKDF2 route means the currently-synchronous login
  flow becomes async — a real refactor of `doStudentLogin` and
  friends. Argon2 has no built-in browser implementation and would
  need a WASM library — a new dependency in a zero-dependency repo.
- If local goes slow-KDF but the server stays `s256$`, the two paths
  diverge and the cloud login's security is unchanged. B only helps if
  both sides move together.

### Option C — Cloud-login-only for students; local PIN retired

**How it works.** Student login always goes through
`ss_student_cloud_login` (SQL 17, already built in v61). The local
PIN path is removed: no local hash check, no local PIN lockout, no
`parentPinHash` in the local DB. Students on the school device log in
exactly as they do from home.

**What changes (files/functions only, no code).**

- `app.js`: `doStudentLogin` (local branch removed), `verifyPin` /
  `hashPin` local use retired, PIN lockout helpers retired,
  `parentPinHash` removed from local student records and from sync
  (upload mapping `app.js:847`, pull mapper `app.js:1736–1737`,
  merge-keep `app.js:1944–1946`), UI strings updated.
- SQL 17 stays the verify path. Note: C does **not** fix the fast
  hash by itself — it only centralises verification behind the server
  lockout. The KDF question (slow hash) remains open under C too.

**Offline-login behaviour.** Student login stops working with no
network. On an offline school device there is no student portal at
all — no attendance, fees or results viewing. Admin/teacher local
logins are separate paths and are unaffected.

**Migration path for existing PINs.** None needed for verification:
the server already holds the `s256$` hash and SQL 17 already verifies
it. Local hashes are deleted. Students/parents keep the same PIN —
now always server-checked. Schools need to be told the student portal
needs internet.

**Risks.**

- Biggest product risk of the three: offline-first is a core promise
  of this app (it works offline and syncs later), and many schools
  have patchy connectivity. This option trades that away for the
  student role.
- A Supabase outage — or a paused Free-tier project — locks *every*
  student out at once. Whole-school lockout, with no fallback.
- Admission-number enumeration + server lockout denial-of-service (as
  in A) becomes the *only* gate, with no local path to fall back to.
- Still leaves the fast-hash problem for anyone who can read the
  server column (H-6): a leaked hash is still cracked offline in
  negligible time, and the cracked PIN now works from anywhere.

### Comparison

| | A: server verify + local fallback | B: slow KDF + longer PIN | C: cloud-only |
|---|---|---|---|
| Offline student login | Yes (weaker, stated) | Yes (unchanged) | **No** |
| Fixes online guessing | Yes (server lockout) | No (local only) | Yes (server lockout) |
| Fixes offline hash cracking | No for fallback; yes for online path once slow KDF lands | Slows it only | No (hash still fast) |
| New infrastructure | Maybe (Edge Function) or none (RPC) | None (maybe a WASM lib) | None |
| Migration pain | Lazy re-hash | Lazy re-hash + PIN re-issue | Delete local hashes |
| Worst-case failure | Fallback is the weak path | Still brute-forceable given time | Whole school locked out if server down |

---

## 3. Recommendation (a recommendation, not a decision)

**Recommend Option A, starting from the SQL 17 RPC pattern, with the
Edge Function added only if a slow KDF is chosen that Postgres cannot
provide.**

Reasons:

1. It is the only option that preserves offline student login — the
   app's core promise — while fixing the online attack, which is the
   realistic attack: a PIN guessed or cracked elsewhere and used
   through cloud login from any device.
2. It reuses a proven pattern instead of inventing one: v61 already
   does server-side PIN check + server lockout as a Postgres RPC. A
   extends that to the on-device path rather than building a second
   login system.
3. B alone cannot fix offline brute-force — it only buys time — and it
   needs an async login refactor plus (for Argon2) a new dependency,
   for a gain that evaporates if the PIN stays 4 digits.
4. C's product cost is too high to impose without Ashutosh explicitly
   accepting it: no offline student login, and a single Supabase
   outage locks out every student at once.

What A honestly does **not** do: it does not make the offline fallback
safe. The fallback keeps today's fast hash and local lockout, and this
doc must not be read as claiming otherwise. The residual risk is
contained, not eliminated — and it should be paired, as a separate
follow-up decision (H-6), with stop
...[truncated 10448 chars]