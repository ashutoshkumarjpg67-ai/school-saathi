# Two-Device Conflict Test Plan — School Saathi

**Status: PLAN ONLY — no test in this plan has been executed yet.**
**Audit item:** M-32 (Phase 0 audit, §4) — "Two-device conflict (LWW) — live UNVERIFIED".
**Base:** v63, origin/main `88a26c35abfff435332f314326717cea7ccf7ae0`. **Applies to:** server-linked school accounts only
(Supabase project `bsjqeeeemwimzldrehpw`). Local-only accounts never sync, so
none of these tests apply to them.

**How to use this plan:** work the cases in order on two real devices, fill in
the results table in §5 as you go, and file any mismatch between the expected
outcome and what actually happens as a bug against audit item M-32. Do not
edit the "Expected outcome" column to match what happened — record the
difference in Notes instead.

---

## 1. How the code says conflicts resolve (read before testing)

Every claim below is from the v63 code, not from a live test. If a test
disagrees with this section, the code reading is what is wrong — or the code
is — and the disagreement itself is the finding.

### 1.1 Last-write-wins by `updated_at`

- `supabase/04_server_first.sql` adds `updated_at timestamptz not null default
  now()` to the nine synced tables that lacked it (the other three —
  `ss_schools`, `ss_students`, `ss_attendance` — already had it) and installs
  a `BEFORE UPDATE` trigger, `ss_touch_updated_at()`, on all twelve synced
  tables. Every server-side UPDATE stamps `new.updated_at = now()` —
  **server clock**.
- A local save queues an outbox entry whose `at` field is the **device clock**
  at queue time (`app.js:2628`: `at: new Date().toISOString()`).
- On push, `sbSyncPushEntry` reads the server row first and compares
  (`app.js:2903`, same check for the school row at `app.js:2841`):

  `if (row.updated_at && entry.at && new Date(row.updated_at) > new Date(entry.at))
  return { pushed: false, conflict: true };`

  i.e. the server copy wins when its `updated_at` is strictly newer than the
  local change's `at`. On an exact tie (`==`) the comparison is false, so the
  local change is pushed and wins.

### 1.2 What the loser sees

- The losing outbox entry is **dropped** (not retried): `app.js:3012-3016`
  counts it (`conflicts++`) and removes it from the outbox.
- `sbSyncSnapSetFromLocalRow` (`app.js:2589-2600`) marks the losing row quiet
  at its current local hash so the next diff does not re-queue the same losing
  change forever.
- The **next pull restores the server version** on the losing device
  (`app.js:2166-2175`, header comment). Until that pull runs, the losing
  device still shows its own (losing) value.
- The conflict is visible only in **Settings → Sync details → Last flush**
  ("conflicts N", `app.js:479`). The string `sbSyncConflict` ("Server had a
  newer copy — kept the server version.", `app.js:5160`) exists in I18N; whether
  a toast is actually shown on a conflict was not verified in code — check
  during the tests and record it.

### 1.3 The pull merges, never replaces

`sbSyncPullRun` (`app.js:3113`) fetches the school row plus 11 tables
(`app.js:3133`: `ss_fee_structure`, `ss_students`, `ss_teachers`, `ss_exams`,
`ss_fee_records`, `ss_attendance`, `ss_receipts`, `ss_marks`, `ss_homework`,
`ss_notices`, `ss_admission_requests`). `sbApplyServerRows` (`app.js:1738`)
**merges**: a local row that has not reached the server yet is kept
(`app.js:1755-1765`), and a row that **is** in the last synced snapshot but is
absent on the server "was deleted elsewhere and still drops"
(`app.js:1766-1775`). A row with a **pending outbox upsert is kept** even if
the snapshot says it was synced (`app.js:1785-1800`) — this matters for T3.

### 1.4 Deletes are special, and only for four tables

- Only `SB_SYNC_DELETABLE = ['ss_fee_records', 'ss_fee_structure',
  'ss_attendance', 'ss_marks']` (`app.js:2477`) propagates a local delete to
  the server (`app.js:2632-2641`). A row deleted locally in any other table
  (students, teachers, exams, homework, notices, receipts, …) is **restored
  by the next pull** — the delete never leaves the device.
- The delete path (`app.js:2801-2811`) issues a plain `DELETE` against the
  server row and performs **no `updated_at` comparison** — a delete does not
  lose to a newer server edit the way an upsert does. (T3 checks what that
  means in practice.)

### 1.5 Receipt / admission numbers are minted server-side, atomically

- `ss_next_receipt_no` (`supabase/01_schema.sql:355-375`) and
  `ss_next_adm_no` (`:329-353`) are `SECURITY DEFINER` functions that increment
  the school row's counter in a single `UPDATE … RETURNING` statement, so two
  simultaneous calls cannot return the same number.
- The RPC alone is not the whole story: the live counter can sit behind the
  highest used number, so the app checks each candidate against the server's
  taken set and retries until a free number comes back ("mint-until-free",
  `app.js:2187-2188`). A row saved while offline gets **no number at all**
  (`numPending`) and is numbered on the next online cycle (`app.js:2187-2210`
  comment) — a device never guesses a number for a server account.
- History: a 9 Nov 2026 live incident produced 192 duplicate receipts when
  the same-number check misfired (v41 fix, `app.js:2881-2900` comment). T4/T5
  re-prove the fixed behaviour under real contention.

### 1.6 Known weak spots this plan is designed to expose

1. **Clock skew:** the winner is decided by comparing server-clock
   `updated_at` against device-clock `entry.at`. A device whose clock runs
   fast can win conflicts it should lose, and a slow clock can lose ones it
   should win. T6 observes this.
2. **Silent loser:** the losing edit vanishes with no toast (unverified) and
   only a counter in Sync details. T1/T2 check what the user actually sees.
3. **Delete vs edit race:** the delete path skips the LWW check, while the
   pull's pending-upsert keep-rule can resurrect a row the other device
   deleted. T3 checks which one wins in each order.

---

## 2. Setup (do once, before T1)

1. **Two devices** (phone + laptop, or two phones), both on the same Wi-Fi /
   mobile data, both logged in to the **same school account** via Supabase
   (same email). Confirm on each: Settings → Sync details shows the same
   school and status "Synced".
2. **Clock check:** on each device, note the displayed time and compare with
   a reference (e.g. time.is). Record both offsets in the results table
   notes. Do **not** correct the clocks — the plan needs the real offsets.
3. **Test data:** create one scratch student on device A (e.g. name
   `CONFLICT-TEST`, class 6), let it sync, and confirm it appears on device
   B. All edits in T1–T3 use this student (or a fee record / receipt made
   for them). Use values that are unmistakable, e.g. guardian phone
   `9000000001` on A vs `9000000002` on B.
4. **Sync trigger:** after each step, force a cycle on the device under test
   (close/reopen the app, or Settings → Back Up Now / Download from Server)
   and wait for status "Synced" before judging the result. The automatic
   cycle also runs every 30 s while the app is open and on focus/online
   (`app.js:2178-2185`).
5. **Cleanup (after all tests):** delete the scratch student and its fee
   records/receipts from device A, sync, confirm they are gone on device B,
   and note the cleanup in the results table.

---

## 3. Test cases

### T1 — Same-record edit on both devices, then sync (both online)

**Purpose:** the basic LWW case.

1. On device A, change the scratch student's guardian phone to
   `9000000001`. Wait for A to show "Synced".
2. On device B (which now has A's edit), change the same field to
   `9000000002`. Wait for B to show "Synced".
3. On device A, change the same field again to `9000000003` **without**
   pulling first — in practice: edit quickly, or turn B's sync off
   (airplane mode on B) — then re-enable sync on both and wait for both to
   show "Synced".

   Simpler deterministic variant (preferred): put B in airplane mode, edit
   the field on B to `9000000002`, edit the same field on A to `9000000001`
   and let A sync, then take B off airplane mode and wait for B to sync.

**Expected outcome:** exactly one value survives on the server and, after
both devices have synced, on both devices — the value whose change has the
later `updated_at`. In the preferred variant that is B's `9000000002`
(B edited after A synced, so B's server write is later). A's losing value
`9000000001` disappears from A after A's next pull.

**Pass means:** (a) both devices converge to the same single value;
(b) the surviving value is the later edit; (c) the losing device's Sync
details "conflicts" count increased by 1; (d) no duplicate student row
appears on either device or on the server.

**Record:** what the losing device showed before its next pull, whether any
toast appeared, and the final value on each device.

### T2 — Offline edit on A + online edit on B, then A comes online

**Purpose:** the offline/online race — the case the merge pull was built for.

1. Put device A in airplane mode. Edit the scratch student's guardian phone
   on A to `9000000011`.
2. On device B (online), edit the same field to `9000000012`. Wait for B to
   show "Synced".
3. Take A off airplane mode. Wait for A to show "Synced", then check B again.

**Expected outcome:** B's `9000000012` wins — when A's queued change flushes,
the server row's `updated_at` (B's write) is newer than A's queued `at`, so
A's push is skipped as a conflict (`app.js:2903`) and A's next pull restores
`9000000012` on A. A's offline edit is lost, silently except for the
conflicts counter.

**Pass means:** (a) both devices end on `9000000012`; (b) A's Sync details
"conflicts" count increased by 1; (c) A's outbox drains (status reaches
"Synced", not stuck on "Backup pending"); (d) no duplicate student.

**Record:** whether A showed any toast/notice that its edit was discarded,
and how long after reconnecting A converged.

### T3 — Delete on A vs edit on B

**Purpose:** deletes do not go through LWW — find out what actually wins.
Run as two sub-cases.

#### T3a — Deletable table: a fee record

1. Create a fee record for the scratch student (small amount, e.g. ₹100)
   and let it sync to both devices.
2. Put B in airplane mode. On B, edit that fee record (e.g. change the
   amount to ₹150) — B now holds a pending upsert.
3. On A (online), delete the same fee record. Wait for A to show "Synced"
   and confirm the record is gone from the server (check on A after a
   fresh pull, or in the Supabase dashboard).
4. Take B off airplane mode and wait for B to sync. Then check A again
   after one more sync cycle.

**Expected outcome (code reading):** A's delete removes the server row
(the delete path has no `updated_at` check, `app.js:2801-2811`). On B's
pull, the record is in B's snapshot but absent on the server — **but** B
has a pending upsert for it, and the merge keep-rule
(`app.js:1785-1800`) keeps rows with a pending upsert. So the expected
sequence is: B's record survives B's pull, B's flush then re-pushes it
(no server row to conflict against, so it re-inserts), and the record
**resurrects on the server and on A**. If instead the record stays deleted
everywhere, that contradicts the keep-rule — record it as a FAIL with the
exact sequence observed.

**Pass means:** the outcome matches one of the two documented behaviours
(resurrect-via-pending-upsert, or stays-deleted) **and** both devices agree
after two full sync cycles; no duplicate fee record appears; the receipt
linked to the record, if any, is in the same state on both devices.

#### T3b — Non-deletable table: the student

1. Put B in airplane mode. On B, edit the scratch student's guardian phone
   to `9000000022`.
2. On A (online), delete the scratch student (student delete flow).
   Wait for A to show "Synced".
3. Take B off airplane mode, wait for B to sync, then check A again.

**Expected outcome:** the student delete never propagates — students are
not in `SB_SYNC_DELETABLE` (`app.js:2477`), so A has no delete op to push
and the next pull **restores the student on A**. B's edit (`9000000022`)
syncs normally and wins. End state: the student exists on both devices
with B's value.

**Pass means:** (a) the student is present on both devices after syncing;
(b) its guardian phone is `9000000022` on both; (c) no duplicate student
row on either device or the server.

### T4 — Receipt-number contention (two devices minting simultaneously)

**Purpose:** prove the atomic RPC + mint-until-free path holds under real
contention (regression check for the 9 Nov 2026 duplicate-receipt incident).

1. Both devices online and synced. On A and on B, **at the same moment**,
   collect a fee for two different students (or the same scratch student
   twice with different months) — tap "Collect" on both devices within a
   few seconds of each other.
2. Wait for both to show "Synced". Note the receipt number each device
   shows (e.g. `RCP-2026-014`).
3. Repeat once more, this time with **both devices offline**: collect a fee
   on each while in airplane mode, then bring both online together and wait
   for both to sync.

**Expected outcome:** every receipt ends up with a **distinct** receipt
number; no two receipts share a number on either device or in
`ss_receipts` on the server; no receipt is lost (the count of receipts for
the students equals the number collected); offline-collected receipts get
their numbers only after reconnecting (`numPending`, `app.js:2187-2210`)
and never show a locally guessed number while offline.

**Pass means:** (a) all receipt numbers unique across both devices and the
server; (b) receipt count on A == receipt count on B == server count for
the test students; (c) no receipt appears twice (same number, same content)
on either device; (d) the offline pair were numberless until reconnect.

**Record:** the exact receipt numbers minted in each round and the server
`receipt_counter` before/after (Settings shows the counter indirectly; the
Supabase dashboard shows it exactly).

### T5 — Admission-number contention (same mechanism, student adds)

1. Both devices online and synced. At the same moment, admit a new student
   on A and a different new student on B (different names).
2. Wait for both to show "Synced" and check both devices.

**Expected outcome:** the two students get **distinct** admission numbers
(`ADM-YYYY-NNN`, via `ss_next_adm_no`, `supabase/01_schema.sql:329-353`)
and distinct ENRs; both students appear on both devices; neither device
loses its student (the 9 Nov 2026 wipe — a colliding laptop student
deleted by a server-wins pull — must not recur).

**Pass means:** (a) admission numbers distinct; (b) both students present
on both devices; (c) no duplicate student rows.

### T6 — Clock-skew observation (optional, needs a spare device or a clock change)

**Purpose:** confirm or refute the skew weakness in §1.6(1). Only run if a
device clock can be moved safely — **do not change the clock on a device
used for real school work**, and restore it immediately afterwards.

1. Note both devices' real clock offsets (from §2 step 2).
2. Set device B's clock **5 minutes fast**, then repeat T1's preferred
   variant (B edits offline, A edits and syncs, B reconnects).
3. Restore B's clock, repeat the same variant with clocks correct, and
   compare winners.

**Expected outcome (code reading):** with B 5 minutes fast, B's queued
`at` is later than the server row's `updated_at` even though B edited
first, so B's change is pushed and **wins despite being the earlier edit**
— the opposite of T1's result. With clocks correct, the result matches T1.

**Pass means:** the test records which value won in each run and whether
the winner flipped with the clock. Either flip (confirming the weakness)
or no flip (contradicting the code reading — e.g. if the server stamps
`entry.at` itself) is a valid result **as long as it is recorded**; an
unrecorded or ambiguous run is a fail. If the flip is confirmed, file it
as a follow-up finding against M-32 (fix direction: compare server
timestamps, or have the server stamp `at`).

---

## 4. What "pass" means overall

The plan passes when **every** case above passes on its own terms **and**
both devices agree on all test data after a final sync cycle (same students,
same fee records, same receipts, same numbers). A single divergence that is
recorded with exact steps, values and device states is not a pass — it is a
filed bug, and the plan is re-run after the fix.

---

## 5. Results

**⚠️ No test in this plan has been executed yet. Every row below is empty
by design — fill it in only when the test has actually been run.**

| Case | Tested by | Date | Result (Pass / Fail) | Notes (values seen, device states, toasts, counter values) |
|---|---|---|---|---|
| T1 — Same-record edit, both online | | | | |
| T2 — Offline edit A + online edit B | | | | |
| T3a — Delete (fee record) vs edit | | | | |
| T3b — Delete (student) vs edit | | | | |
| T4 — Receipt-number contention | | | | |
| T5 — Admission-number contention | | | | |
| T6 — Clock-skew observation | | | | |
| Cleanup — scratch data removed, both devices agree | | | | |

Device clock offsets recorded at setup (§2 step 2): A: ____  B: ____

---

## 6. Sources

- Phase 0 audit M-32 (`school-saathi-phase0-audit.md` §4): "Code ke hisaab
  se conflict resolution LWW by `updated_at` hai (04_server_first.sql).
  Live two-device edit test is audit me nahi hua."
- `supabase/04_server_first.sql` — `updated_at` columns + touch trigger.
- `supabase/01_schema.sql:329-375` — `ss_next_adm_no` / `ss_next_receipt_no`.
- `app.js` (v63): push LWW check `:2841`, `:2903`; outbox queue `:2628`;
  conflict drop + count `:3012-3016`; snapshot quieting `:2589-2600`; pull
  `:3113`, table list `:3133`; merge rules `:1738-1800`; deletable tables
  `:2477`, `:2632-2641`; delete path `:2801-2811`; numbering
  `:2187-2210`; Sync details `:479`.
