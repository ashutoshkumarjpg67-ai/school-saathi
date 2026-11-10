# School Saathi — Play Data Safety Form (DRAFT)

> **DRAFT ONLY — do not submit.** This file is a copy-ready draft of the
> Google Play **Data Safety** form answers. Filling in the Play Console form
> and submitting it is **Ashutosh's step**, after he answers the open
> questions in §8 and after the linked work (Privacy Policy — audit CR-5,
> account deletion — audit CR-6) is decided.
>
> **Source of truth:** Phase 0 audit
> (`school-saathi-phase0-audit.md`), **§6 data-collection list** and
> **finding H-13**, base v58. Every claim below traces to audit §6 or to
> code grepped on the current base — see the traceability table in §9.
> Nothing here is invented. Where the audit says **UNVERIFIED**, this draft
> says UNVERIFIED too.
>
> **Base for this draft:** origin/main `f5449e1` (**v66**). Work started at
> v64 (`cfdac97`); main advanced to v66 while this draft was written
> (v65: parent features in the student portal — display only, no new data
> collected; v66: results tile reads live marks). The draft was rebased to
> v66 and every code claim below was re-verified by grep at v66. Two §6
> items changed after the v58 audit and were re-verified in v66 code by
> grep (see §9, notes N1–N2):
> - **N1 — Teacher password upload: RESOLVED in v62.** The audit (v58)
>   said UNVERIFIED whether a teacher password is uploaded. v62 code
>   (`app.js` `sbMapTeacher`) now uploads the teacher's login email and
>   the salted `s256$` password hash to `ss_teachers` (`email`, `pw_hash`).
>   Whether SQL 18 (the server columns) is applied live is still
>   UNVERIFIED — that is a Supabase-dashboard check, not a code check.
> - **N2 — Ads SDK: dedicated grep now run (v66).** The audit said no
>   dedicated ads-SDK grep had been run. A repo-wide grep at v66 for
>   `adsbygoogle|admob|doubleclick|adsense|applovin|unityads|ironsource|
>   startapp|mopub` returns **0 hits in code** (the only matches are the
>   pattern quoted in this draft file itself). This is a code grep only,
>   not a runtime check.
>
> **Audit finding this closes (as a draft):** H-13 — "Data Safety ke liye
> data-collection list (code se verified) — form baaki hai."

---

## 0. How to use this draft

1. Open Play Console → App content → **Data Safety** → "Start" / "Manage".
2. Copy each section below into the matching Console screen, in order.
3. Do **not** tick any box this draft marks UNVERIFIED or "decision needed"
   until Ashutosh answers §8.
4. After the Console form is submitted, update this file with the submitted
   answers and the submission date, so the draft and the live form never drift.

**App facts the form assumes (from the audit):**

- App: **School Saathi** — multi-school PWA for Bihar schools, Nursery–12th.
  The app manages **minors' data** (students Nursery–12th, with DOB, photo,
  Aadhaar last-4, PIN). Primary users are **school staff** (admins, teachers);
  students are secondary users (audit CR-9 / §9 decision 14 — positioning to
  keep consistent in every Console answer).
- **No ads, no analytics/crash SDK, no in-app payments verified in code**
  (see §5). Pricing is undecided (audit H-14) — if a paid plan or Play
  Billing is added later, the "Financial info" answers must be revisited.
- Data is **never sold** and **never shared for advertising**. The only
  third party that receives data is Supabase (hosting/database, processor)
  and, only when the admin manually opens it, WhatsApp (`wa.me`).

---

## 1. Data collection — overview answers

These are the top-level Data Safety questions, answered once for the whole app:

| Console question | Draft answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** — see §2–§3 for the per-type list. |
| Is all of the user data collected by your app encrypted in transit? | **Yes** — all server traffic goes to `https://bsjqeeeemwimzldrehpw.supabase.co` over HTTPS/TLS (app.js:223 `SB_URL`). WhatsApp `wa.me` links open in the browser/WhatsApp app over HTTPS. No plain-HTTP data transfer is in the code. |
| Do you provide a way for users to request that their data be deleted? | **Partial — answer "Yes" only with the §7 caveat.** Device-side deletion exists (Delete Account, v60, §7). Full server-side account deletion (Auth user) is **not yet built** (audit CR-6, pending Edge Function). Until CR-6 ships, the honest Console answer is "Yes" with the in-app deletion path + the web-link option left for Ashutosh to decide (see §8, Q3), and the Privacy Policy must describe exactly what is deleted and what is not. Do not claim full account deletion until CR-6 is live. |
| Is your app's target audience children? | **Yes — declare it.** The app stores minors' data (Nursery–12th). Complete the Families / target-audience declarations (audit CR-9) together with this form. Consent for a minor's data is school-mediated: admission happens through the school (admission form / school enrolment), there is no self-sign-up for students. State this in the Privacy Policy (audit CR-5). |

---

## 2. Data types collected — per-type form entries

For each type, fill the Console fields exactly as shown: **Collected?
(Yes/No) · Optional or Required? · Purposes · Shared?** Storage and
encryption notes are the evidence behind the answers, not separate Console
fields.

### 2.1 School admin account — Personal info + Account credentials

| Field | Draft answer |
|---|---|
| Collected? | **Yes** |
| Data | Email address + password (Supabase Auth; app.js `doLogin`, `doSignup`). School profile: school name, city, principal name, phone, email, session, address, school logo (`logo_data_url`). Local device accounts also exist (`schoolSaathiAccounts`). |
| Optional or required? | **Required** — the app cannot be used without a school account. |
| Purposes | **Account management** (login / signup / password reset), **App functionality** (identifying the school whose data is shown and synced). |
| Shared with whom? | **Supabase only** (data processor — Auth + Postgres, project `bsjqeeeemwimzldrehpw`). Not shared with any other third party. |
| Stored where? | Device localStorage (`schoolSaathiAccounts`, session keys) + Supabase Auth (`auth.users`) and `ss_schools` table. |
| Encrypted in transit? | Yes (HTTPS/TLS to Supabase). |
| Encrypted at rest? | **No app-level encryption** — see §6. Passwords are stored as salted `s256$` SHA-256 hashes (single-iteration SHA-256 — audit CR-3; a slow KDF is pending, not shipped). Plaintext passwords are never stored. |
| Deletable? | Device copy: yes, via Delete Account (v60, §7). Server Auth user: **not yet** (CR-6 pending). |

### 2.2 Students (minors) — Personal info, Photos, and other identifiers

| Field | Draft answer |
|---|---|
| Collected? | **Yes** |
| Data | Name, class/section, roll number, enrolment number, guardian name, phone, mobile2, parent email, father/mother name, occupation, date of birth, gender, blood group, category, address / state / district / PIN code, previous school/class, admission number/date, status, result %. Documents flags only (`birthCert` / `tc` / `tcNumber` / `other` — booleans/notes, **no document file upload**: app i18n note says "Document files will be uploaded in the server phase"). |
| Optional or required? | **Required for core function** (name, class, admission number — attendance, fees and exams cannot work without them). **Optional:** photo (only if the admin adds one) and Aadhaar (only the last 4 digits, only if entered — see 2.3). The exact required/optional split per field should be confirmed against the live form UI at submission time; this draft does not invent a per-field split beyond what §6 states. |
| Purposes | **App functionality** (attendance, fees & receipts, exams & marks, homework, notices, ID cards). |
| Shared with whom? | **Supabase only** (processor). Not shared with any other third party. A student's data is visible only inside their own school (RLS `ss_school_owner(school_id) = auth.uid()`); it is **not** shared with other schools. |
| Stored where? | Device localStorage (`schoolSaathiDB_<uid>`) + Supabase `ss_students` table (project `bsjqeeeemwimzldrehpw`). |
| Encrypted in transit? | Yes (HTTPS/TLS to Supabase). |
| Encrypted at rest? | **No app-level encryption** — see §6. Student PINs are stored as salted hashes only (see 2.4); photos and other fields are plaintext in localStorage and in the Supabase table. |
| Deletable? | Yes, in-app (student delete — soft delete, record kept; fees/marks/attendance/homework stay saved). Full school wipe via Reset All Data (device + optional server wipe). Server Auth-user deletion is separate and pending (CR-6). |

### 2.3 Student photo — Photos (optional)

| Field | Draft answer |
|---|---|
| Collected? | **Yes — optional** |
| Data | Student photo as a base64 JPEG data URL (`photo_data_url` column). Compressed on device: max 512 px / 120 KB (`PHOTO_MAX`, `PHOTO_CAP`, app.js:4293). No Supabase Storage bucket is used. |
| Optional or required? | **Optional** — only collected if the admin uploads a photo for the student. |
| Purposes | **App functionality** (student profile, ID cards, fee receipts). |
| Shared with whom? | **Supabase only** (processor). Not shared with any other third party. |
| Stored where? | Device localStorage (inside the student record) + Supabase `ss_students.photo_data_url`. |
| Encrypted in transit? | Yes (HTTPS/TLS to Supabase). |
| Encrypted at rest? | **No** — base64 string stored as-is (see §6). |
| Deletable? | Yes — remove/replace the photo on the student record; deleted with the student record / school wipe. |

### 2.4 Aadhaar — Personal info (last 4 digits only, optional)

| Field | Draft answer |
|---|---|
| Collected? | **Yes — last 4 digits only, optional** |
| Data | **Only the last 4 digits** of Aadhaar. Full Aadhaar is never stored, shown, exported or printed (code: `aadhaarLast4()`, app.js:191; upload sends only last-4, app.js:849; server truncation in `supabase/09_aadhaar_last4.sql`; schema comment "never returned in full anywhere"). |
| Optional or required? | **Optional** — the field may be left blank. |
| Purposes | **App functionality** (student identity record, as entered by the school). |
| Shared with whom? | **Supabase only** (processor). Never returned in full anywhere; the parent-lookup RPC does not return Aadhaar at all (audit CR-2). |
| Stored where? | Device localStorage (last-4 only) + Supabase `ss_students.aadhaar` (last-4 only). |
| Encrypted in transit? | Yes (HTTPS/TLS to Supabase). |
| Encrypted at rest? | **No app-level encryption** (see §6). Only 4 digits are stored. |
| Deletable? | Yes — clear the field on the student record; deleted with the student record / school wipe. |
| ⚠️ UNVERIFIED | Whether any **old full-Aadhaar rows** still exist in the live Supabase database (i.e. whether SQL 09 truncation ever ran live) is **UNVERIFIED** (audit §8 item 21). Do not state in the Console that no full Aadhaar exists server-side until the live database is checked. |

### 2.5 Student PIN — Account credentials (salted hash, never plaintext)

| Field | Draft answer |
|---|---|
| Collected? | **Yes** |
| Data | Student/parent login PIN, **4–6 digits**, stored and synced **only as a salted hash** (`s256$<salt>$<hash>`, `hashPin()`, app.js:182). The plaintext PIN is never stored on the server and never shown in the UI. (Audit CR-3: single-iteration SHA-256, 4-digit PINs have only 9,000 combinations — a server-side slow-KDF verify is pending, not shipped. Do not describe the PIN as strongly protected in the Console or the policy.) |
| Optional or required? | **Optional** — a student with no PIN set cannot log in as a student ("No PIN set — student login unavailable for this student"); the PIN is set by the school at admission. |
| Purposes | **Account management** (student login authentication). |
| Shared with whom? | **Supabase only** (processor — the hash is stored in `ss_students.parent_pin`). The hash is visible to the school owner / platform admins under RLS (audit H-6) — do not claim it is hidden from the school. |
| Stored where? | Device localStorage (hash) + Supabase `ss_students.parent_pin` (hash). |
| Encrypted in transit? | Yes (HTTPS/TLS to Supabase). |
| Encrypted at rest? | **No app-level encryption** (see §6) — the PIN is protected only by salted hashing, not by encryption. |
| Deletable? | Yes — the school can clear/set a new PIN; deleted with the student record / school wipe. |
| ⚠️ UNVERIFIED | How many server `parent_pin` rows are still **legacy plaintext** (audit CR-2 blast radius) is **UNVERIFIED** — no migration sweeping plaintext PINs to hashes is in the repo. Do not state in the Console that all server PINs are hashed until the live database is checked. |

### 2.6 Teachers — Personal info + Account credentials

| Field | Draft answer |
|---|---|
| Collected? | **Yes** |
| Data | Name, subject, classes taught (`classes text[]`). Login email + password (local device accounts, app.js `doTeacherLogin`). **Since v62 (see N1):** the teacher's login email and salted `s256$` password hash are also synced up to the server row (`ss_teachers.email`, `ss_teachers.pw_hash`) so a teacher can log in from any device (SQL 18). The hash is **never pulled back down** — the device accounts store stays the source of truth. Only `s256$` hashes are sent; a legacy djb2 hash is skipped until the teacher logs in once on the school device (which upgrades it). |
| Optional or required? | **Required** for a teacher account (name; email + password for login). Classes taught are set by the school admin. |
| Purposes | **Account management** (teacher login), **App functionality** (class-scoped dashboards, attendance/homework/marks). |
| Shared with whom? | **Supabase only** (processor). Not shared with any other third party. |
| Stored where? | Device localStorage (device accounts + teacher rows) + Supabase `ss_teachers` (including `email` / `pw_hash` since v62). |
| Encrypted in transit? | Yes (HTTPS/TLS to Supabase). |
| Encrypted at rest? | **No app-level encryption** (see §6). Passwords are salted hashes only, never plaintext. |
| Deletable? | Yes — the school admin can delete a teacher account in-app; deleted with the school wipe. |
| ⚠️ UNVERIFIED | Whether SQL 18 (the `email` / `pw_hash` server columns) is actually **applied live** is UNVERIFIED — verify in the Supabase dashboard before submitting. At v58 this whole item was UNVERIFIED (audit §6); the v66 code now sends the hash, but live application is a separate check. |

### 2.7 Fees / attendance / marks / exams / homework / notices — Financial info + App activity

| Field | Draft answer |
|---|---|
| Collected? | **Yes** |
| Data | Fee records + receipts (amount, month, fee type, status, payment mode, bank, number); fee structure per class; attendance records; marks + exams; homework; notices. **These are the school's fees charged to students — NOT the app's pricing** (audit H-14). No payment gateway is used; payments are recorded manually (cash/UPI) by the school — the app records the payment, it does not process it. |
| Optional or required? | **Required for core function** — these records are the app's purpose. A school that never enters fees/attendance simply has no such rows. |
| Purposes | **App functionality** (fee collection & receipts, attendance tracking, exams & results, homework, notices, reports). |
| Shared with whom? | **Supabase only** (processor). Receipt details are shared with the parent/guardian **only when the admin manually opens a `wa.me` chat** to send a fee reminder / receipt (see §4). No automatic sharing. |
| Stored where? | Device localStorage + Supabase tables (`ss_fees`, `ss_receipts`, `ss_attendance`, `ss_marks`, `ss_exams`, `ss_homework`, `ss_notices`, project `bsjqeeeemwimzldrehpw`). |
| Encrypted in transit? | Yes (HTTPS/TLS to Supabase). |
| Encrypted at rest? | **No app-level encryption** (see §6). |
| Deletable? | Yes — fee/attendance/exam records can be deleted in-app (exam delete is soft-delete, local-only — audit M-14; deletes propagate for only 4 tables — audit M-15). Deleted with the school wipe. |

### 2.8 Admission requests (public form) — Personal info

| Field | Draft answer |
|---|---|
| Collected? | **Yes** |
| Data | Applicant name, date of birth, gender, class applied for, guardian name, phone, previous school. Submitted through the public "Apply for Admission" form (no login needed); anonymous POST to `ss_admission_requests`. |
| Optional or required? | **Required to submit the form** (name, class, 10-digit mobile are validated); otherwise not collected — the form is only filled in if a parent/guardian chooses to apply. |
| Purposes | **App functionality** (admission enquiries for the school to review, approve or reject). |
| Shared with whom? | **Supabase only** (processor). Not shared with any other third party. |
| Stored where? | Device localStorage (until synced) + Supabase `ss_admission_requests`. |
| Encrypted in transit? | Yes (HTTPS/TLS to Supabase). |
| Encrypted at rest? | **No app-level encryption** (see §6). |
| Deletable? | Yes — the school can reject/delete the request in-app; deleted with the school wipe. |

### 2.9 Support requests — Personal info

| Field | Draft answer |
|---|---|
| Collected? | **Yes** |
| Data | Name + message (support form, app.js `openSupportForm` / `submitSupportRequest`). Kept in localStorage key `schoolSaathiSupportRequests` (max 50 entries) and in the Supabase `ss_support_requests` table. |
| Optional or required? | **Optional** — only collected if the user chooses to send a support request. |
| Purposes | **Account management / customer support** (answering the user's message). |
| Shared with whom? | **Supabase only** (processor). The support email default is `support@school-saathi.in` (schema default) — see UNVERIFIED note below. |
| Stored where? | Device localStorage (max 50) + Supabase `ss_support_requests`. |
| Encrypted in transit? | Yes (HTTPS/TLS to Supabase). |
| Encrypted at rest? | **No app-level encryption** (see §6). |
| Deletable? | Yes — deleted with the school wipe / device data reset. |
| ⚠️ UNVERIFIED | Whether the `support@school-saathi.in` mailbox is actually **monitored** is UNVERIFIED (audit §6 / §8 item 17). Do not promise a support response time in the Console or the policy until Ashutosh confirms. |

---

## 3. Data types NOT collected

Tick **"No" / not collected** for each of these in the Console. Each was
verified by grep in the audit (§6) and re-checked at v66 where noted.

| Data type | Evidence |
|---|---|
| **Precise / approximate location** | Not collected. Geolocation grep: 0 hits (audit §6; re-checked at v66 in app.js: 0 hits for `geolocation` / `getCurrentPosition`). |
| **App activity — analytics / crash data** | Not collected. No analytics or crash SDK: `gtag` / `Firebase` / `Sentry`: 0 hits (audit §6; re-checked at v66: 0 hits). No usage analytics are sent anywhere. |
| **Device or other IDs** (device ID, advertising ID) | Not collected. Grep for `deviceId` / `getDeviceId` / `navigator.contacts`: 0 hits at v66. |
| **Contacts** | Not collected. No contacts access (same grep, 0 hits). |
| **Ads SDKs** | None. Dedicated repo-wide grep at v66 (`adsbygoogle|admob|doubleclick|adsense|applovin|unityads|ironsource|startapp|mopub`): **0 hits in code** (resolves audit §6 UNVERIFIED — code grep only, not a runtime check). No ads are shown in the app. |
| **SMS / call logs / files** | Not collected. Document *files* are not uploaded (only boolean/notes flags — §2.2); no SMS, call-log or file access is in the code. |
| **Payment card / bank account details of the user** | Not collected as app payment data. Fee records note a payment mode/bank/number for school fees (§2.7) — that is the school's fee bookkeeping, not the user's payment instrument, and no payment gateway processes anything. If Play Billing is ever added (pricing, audit H-14), revisit this row. |
| **Health / fitness data** | Not collected. (Blood group is a student-record field, §2.2 — it is school record data, not health/fitness tracking.) |

**Also state in the form (sharing section):** the app does **not** share data
for advertising, does **not** sell data, and uses **no** third-party
advertising or analytics SDKs.

---

## 4. Data sharing summary (Console "Data sharing" section)

| Console question | Draft answer |
|---|---|
| Is user data shared with third parties? | **Yes — with one processor, and one manual channel:** (1) **Supabase** (project `bsjqeeeemwimzldrehpw`, `https://bsjqeeeemwimzldrehpw.supabase.co`) — hosting, Auth and Postgres database. Supabase is the data processor; data is stored there so the school's records sync across the school's devices. (2) **WhatsApp, only when the admin manually opens it** — the app opens a `wa.me` link with a pre-filled fee reminder / absence alert / receipt / profile message (app.js `waFeeReminder`, `waAbsentAlert`, `waReceiptShare`, `waProfileChat`). There is **no** WhatsApp API, no session, no QR login, no auto-send and no bulk send. The message goes only to the number the admin chose, only when the admin taps send. |
| Is data shared for advertising or marketing? | **No.** |
| Is data sold? | **No.** |

---

## 5. Data retention

- There is **no automatic retention period** defined in the repo — data is
  kept until the school deletes it (per-record delete, Reset All Data, or
  Delete Account, §7). Do not invent a retention period in the Console.
- Support requests kept on-device are capped at the latest **50** entries
  (localStorage key `schoolSaathiSupportRequests`).
- Student records deleted in-app are **soft-deleted** (record kept, fees /
  marks / attendance / homework stay saved) — say so in the Privacy Policy
  if the Console or policy asks what "delete" means.
- If Ashutosh sets a retention rule later (e.g. "admission requests older
  than X are deleted"), update this section and the Privacy Policy together.

---

## 6. Security practices (Console "Data security" section)

| Console question / practice | Draft answer (honest state) |
|---|---|
| Data is encrypted in transit | **Yes** — all Supabase traffic over HTTPS/TLS (`SB_URL` is `https://…`). No plain-HTTP transfer in the code. |
| Data is encrypted at rest (app-level) | **No — not implemented.** The app stores its local database (student PIN hashes, phone numbers, Aadhaar last-4, photos) in **plaintext localStorage**, and Supabase Auth tokens in plaintext localStorage (audit H-5). Full-backup JSON exports the whole database (hashes + photos + PII) without a warning. **At-rest encryption is undecided (audit H-5, §9 decision 6)** — key-loss = data-loss risk must be understood first. Do **not** tick any at-rest encryption claim in the Console based on this draft. Supabase platform-level disk encryption is **not verified here** — do not claim it either. |
| Passwords / PINs | Stored only as salted `s256$` SHA-256 hashes (single iteration — audit CR-3). Plaintext passwords/PINs are never stored. A server-side slow KDF (PBKDF2/bcrypt/argon2) and server-side PIN verification are **pending**, not shipped. |
| Account deletion | Device-side Delete Account exists (v60, §7). Server-side Auth-user deletion is **pending** (audit CR-6 — Edge Function with `service_role`, not built). |
| Independent security review / certifications | **None.** Do not claim any. |
| Children's data handling | Minors' data is collected (Nursery–12th). Primary users are school staff; students are secondary. Consent is school-mediated via admission. Families declarations (audit CR-9) must be completed alongside this form. |

---

## 7. Data deletion — what the user can do today (Console "Data deletion" section)

State this exactly — it is the honest current state, not the target state:

1. **In-app Delete Account (v60, device-only).** Settings → "Delete Account".
   Double gate: account password + typing the exact school name. It removes
   the school account, login, students, fees, attendance — everything for
   that school **on this device only**. The server copy (if any) is **NOT**
   deleted: logging in again with the same email brings a server-linked
   school back. A school that was never linked to the server is gone for
   good. (app.js:6548 `deleteAccount`, user-facing text `delConfirmMsg`.)
2. **Reset All Data.** Deletes all school data on the device, with an option
   "Delete on server too" (`ss_wipe_school` RPC) — but the Auth user
   (`auth.users`) is **never** deleted by it, and the same email/password can
   log in again afterwards (audit CR-6).
3. **Not yet built (CR-6):** an Edge Function (with a `service_role` key,
   never in client code) that wipes the school's server data **and** deletes
   the Auth user, plus a matching in-app "Delete Account" flow that is
   distinct from Reset All Data. Until that ships, the Console deletion
   answer must describe (1) and (2) only, and the Privacy Policy must say
   the same. A web-link deletion option for the Console form is a decision
   for Ashutosh (§8, Q3).

---

## 8. Open questions for Ashutosh (do NOT answer these in the draft)

1. **Support mailbox:** Is `support@school-saathi.in` actually monitored,
   and by whom? (Audit §6 UNVERIFIED.) The Privacy Policy and the Console
   contact details depend on it.
2. **Teacher-password upload — live state:** v62 code now syncs the teacher
   email + salted password hash to `ss_teachers` (N1). Is SQL 18 applied
   live on the Supabase project, and is that upload acceptable to keep?
3. **Deletion-link option:** Should the Play Console "Data deletion" section
   offer a **web link** (in addition to the in-app flow) — e.g. a deletion
   request page/form? If yes, what URL, and who handles the requests?
4. **Old full-Aadhaar rows:** Are there any full (12-digit) Aadhaar values
   still in the live database from before SQL 09? (Audit §8 item 21.)
   If yes, they must be truncated before the form claims "last-4 only".
5. **Legacy plaintext PIN rows:** How many server `parent_pin` rows are
   still plaintext? (Audit CR-2.) Is a one-time server sweep to hash them
   approved?
6. **Encryption at rest (H-5):** Should local data be encrypted with a
   password-derived key — knowing **key-loss = data-loss**? This decides
   whether the "encrypted at rest" answer can ever become "Yes".
7. **Pricing (H-14):** Free / per-school monthly / per-student? Until this
   is decided, the form's financial-info answers assume no payments, no
   Play Billing, no in-app purchases.
8. **Families positioning (CR-9):** Confirm the Console wording: primary
   user = school staff, students = secondary users; consent for minors'
   data is school-mediated through admission. Any age-gate needed for
   teacher/student login?
9. **Retention rule:** Should any data type auto-expire (e.g. rejected
   admission requests, old support requests)? If yes, what period?
10. **Privacy Policy URL (CR-5):** The Data Safety form cross-references the
    Privacy Policy. What URL will it be hosted at? (No policy exists yet.)

---

## 9. Source traceability

Every claim above traces to one of these. "Audit §6" = Phase 0 audit report
§6 (base v58); "v66 grep" = code checked on this draft's base `f5449e1` (v66).

| Claim in this draft | Source |
|---|---|
| School admin account fields; school profile columns | Audit §6; `supabase/01_schema.sql:19-40`; app.js `doLogin` / `doSignup` |
| Student fields (name … result %, documents flags only) | Audit §6; `supabase/01_schema.sql:46-81`; app.js `sbMapStudent` |
| Photo base64, 512 px / 120 KB cap | Audit §6; app.js:4293 `PHOTO_MAX` / `PHOTO_CAP`; `photo_data_url` column |
| Aadhaar last-4 only | Audit §6; app.js:191 `aadhaarLast4()`, :849; `supabase/09_aadhaar_last4.sql`; live old rows UNVERIFIED (audit §8 item 21) |
| Student PIN salted hash only | Audit §6; app.js:182 `hashPin()`; single-iteration SHA-256 + 9,000-combo risk: audit CR-3; legacy plaintext rows UNVERIFIED (audit CR-2, §8 item 2) |
| Teacher fields; no email/password columns at v58 | Audit §6 (v58 state); v62 change: app.js `sbMapTeacher` (v66 grep, N1); SQL 18 live application UNVERIFIED |
| Fees / attendance / marks / exams / homework / notices fields | Audit §6; `supabase/01_schema.sql:90-153, 240-286` |
| Admission-request fields; anon POST | Audit §6; app.js `openAdmissionApply()`; `supabase/01_schema.sql:183-200` |
| Support requests name + message; max 50 on-device | Audit §6; app.js `openSupportForm` / `submitSupportRequest`; `supabase/01_schema.sql:203-212`, `supabase/03_support_requests.sql`; mailbox monitored UNVERIFIED (audit §8 item 17) |
| NOT collected: location, analytics/crash SDK, device ID, contacts | Audit §6 (greps, 0 hits); re-checked at v66: geolocation 0 hits, `gtag\|firebase\|sentry` 0 hits, device-ID/contacts 0 hits |
| NOT collected: ads SDK | Audit §6 said dedicated grep not run (UNVERIFIED at v58); **resolved by v66 grep: 0 hits in code** (N2) — code grep only |
| WhatsApp manual `wa.me` only, no API/session/auto-send | Audit §6; app.js `waFeeReminder` / `waAbsentAlert` / `waReceiptShare` / `waProfileChat` (v66 grep: `wa.me` opens only) |
| Stored where: Supabase project `bsjqeeeemwimzldrehpw` + device localStorage | Audit §6/§7; app.js:223 `SB_URL` (v66 grep confirmed) |
| Encrypted in transit: HTTPS/TLS | app.js:223 `SB_URL` (`https://…`); all Supabase calls use this URL |
| At-rest encryption NOT implemented | Audit H-5 (v66 grep: no `subtle.encrypt` / AES-GCM / encrypt/decrypt in app.js) |
| Device-only Delete Account (v60); server Auth-user deletion pending | Audit CR-6; app.js:6548 `deleteAccount` + `delConfirmMsg` (v66 grep confirmed); server wipe `ss_wipe_school` deletes rows, not `auth.users` |
| Minors (Nursery–12th); Families declarations needed | Audit CR-9; app.js CLASSES Nursery–12th |
| No pricing defined; plan is only a status label | Audit H-14 |
| No payment gateway verified in pricing greps; dedicated gateway grep not run | Audit H-14 / §8 item 19 — **UNVERIFIED**; do not claim "no payment processing" beyond the manual-recording fact in §2.7 |

---

*Draft prepared for audit H-13 (Phase C, item C4). Base: origin/main `f5449e1`
(v66). Status: DRAFT — Play Console submission is Ashutosh's step.*
