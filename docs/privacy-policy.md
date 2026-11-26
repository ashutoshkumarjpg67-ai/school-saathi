# School Saathi — Privacy Policy

> **Last updated: 26 November 2026 · App version 156** (base: origin/main
> `e9a47c7`, v146, plus the v147 policy pages).
>
> This policy is published at
> `https://ashutoshkumarjpg67-ai.github.io/school-saathi/privacy-policy.html`
> (and the Cloudflare Pages mirror) and linked from the app's login screen
> and Settings. It is written in English, with a short Hindi summary in
> §15. The app itself is bilingual (English / हिंदी). A full Hindi
> translation is a separate step.
>
> Every data claim below traces to the Phase 0 audit
> (`school-saathi-phase0-audit.md`) **§6 data-collection list**, to the
> Play Data Safety form draft (`docs/data-safety-form-draft.md`), or to code
> checked at v146 — see the traceability table in §18. Nothing here is
> invented. Where the underlying fact is **UNVERIFIED**, this policy says
> UNVERIFIED too.
>
> **No legal review:** this policy has had no independent legal review. The
> support mailbox, the operator's legal details and the governing law are
> still to be confirmed by the owner — see §17.

---

## 1. What School Saathi is

School Saathi is a multi-school app (a web app / PWA, also available as an
Android app — the same web app in a Capacitor wrapper) for schools in Bihar,
covering classes Nursery to 12th. A school uses it to keep its own records:
students, attendance, fees and receipts, exams and marks, homework, notices,
and teachers.

The app is used mainly by **school staff** — the school admin and teachers.
Students and parents are secondary users: students log in with a PIN to see
their own attendance, fees, results and homework, and parents log in with
their child's admission number and the PIN the school set.

There is **no "super admin" login screen** in the app — platform
administration is a server-side role only (see §6).

## 2. Who this policy is for

- **School admins** who create a school account and enter school data.
- **Teachers** who log in on the school's device and work with their classes.
- **Parents / guardians** who log in with their child's admission number
  and PIN to see attendance, fees, results and homework.
- **Students and their parents/guardians**, whose records the school keeps
  in the app. Students do not sign up themselves — the school adds them at
  admission.

If you are a parent or guardian and you have a question about your child's
record in School Saathi, please ask the school first. The school entered the
record and is responsible for it (see §12).

## 3. What data we collect

### 3.1 School admin account

- **Email address and password** (used for login, sign-up and password
  reset through Supabase Auth).
- **School profile:** school name, city, principal's name, phone, email,
  session (academic year), address, and school logo.
- The app also keeps **local device accounts** on the device where the school
  logs in, so the school can log in on that device.

### 3.2 Students (including children)

Students are minors (Nursery to 12th). The school enters these details:

- Name, class and section, roll number, enrolment number.
- Guardian's name, phone number, second mobile number, parent email,
  father/mother name and occupation.
- Date of birth, gender, blood group, category.
- Address, state, district, PIN code, previous school and class.
- Admission number and date, status, result percentage.
- **Documents:** only flags/notes (for example, whether a birth certificate
  or transfer certificate is on file). **No document files are uploaded.**
- **Photo (optional):** only if the school adds one. The photo is compressed
  on the device first (maximum 512 pixels / ~120 KB) and then uploaded to
  the school's private photo storage on the server (`student-photos`
  bucket), where it is opened only through a short-lived signed link. A
  base64 copy is kept on the device only as an offline fallback when the
  upload has not happened yet. The photo is used for the student profile,
  ID cards and fee receipts.
- **Aadhaar (optional, last 4 digits only):** if the school enters an
  Aadhaar number, **only the last 4 digits are ever stored, shown, exported
  or printed**. The full 12-digit number never leaves the device. The server
  also truncates it to the last 4 digits.
  - ⚠️ **UNVERIFIED:** whether any **old full-Aadhaar values** still exist
    in the live database from before the truncation was added is **not
    verified**. Do not treat "no full Aadhaar exists on the server" as a
    fact until the live database is checked.
- **Student / parent PIN (login PIN):** the school sets the PIN at admission
  and can issue a new one (admin "Generate new PIN" — a fresh 6-digit
  random PIN, shown once so the school can share it with the parent). The
  PIN is stored and synced **only as a salted hash** (`s256$…`). The plain
  PIN is never stored on the server and never shown in the app again after
  it is issued. Resetting a PIN with a date of birth was removed in v146 —
  a forgotten PIN can only be replaced by the school.
  - The hash uses single-iteration SHA-256, so the hash alone is **not**
    strong protection if it leaks. The real protection is that the PIN is
    **checked on the server** (`ss_student_cloud_login`) when the school's
    data is on the server, with a server-side lockout after wrong attempts.
    On a device without the server copy, the check is local, with a
    5-wrong-attempts / 15-minute lockout on that device.
  - ⚠️ **UNVERIFIED:** whether any server PIN rows are still stored as
    **legacy plaintext** (from before hashing) is **not verified** by a
    server-side check. The app now hashes a legacy plaintext PIN as soon as
    it sees one and uploads the hash on the next sync, so old rows heal
    themselves when the school opens the app — but no one-time server sweep
    has been run to confirm zero plaintext rows remain.
  - The PIN hash is visible to the school owner (and to platform admins —
    see §6) under the server rules. Do not read this policy as saying the
    hash is hidden from the school.

### 3.3 Teachers

- Name, subject, classes taught.
- Login email and password for the teacher login on the school's device.
- Since v62, the teacher's login email and salted password hash are also
  synced to the server, so a teacher can log in from another device. Only
  `s256$` hashes are sent — never a plain password, and an old-style hash is
  skipped until the teacher logs in once on the school device.
  - ⚠️ **UNVERIFIED:** whether the server columns for this (SQL 18) are
    actually applied on the live database is **not verified** — that is a
    Supabase-dashboard check.

### 3.4 Fees, attendance, marks, exams, homework, notices

- Fee records and receipts (amount, month, fee type, status, payment mode,
  bank, number), fee structure per class, attendance records, marks and
  exams, homework, notices.
- These are **the school's fees charged to students** — not the app's
  pricing. The app does not process payments: the school records a payment
  (cash/UPI) by hand; the app only keeps the record. No payment-gateway code
  was found in the app at v146 (repo-wide grep for Razorpay/Stripe/Paytm/
  PhonePe/Google Pay/checkout: 0 hits — a code check, not a runtime check).
  The app collects **no payment card or bank account details**.

### 3.5 Admission requests (public form)

Anyone can fill in the "Apply for Admission" form without logging in. It
collects: applicant name, date of birth, gender, class applied for,
guardian's name, phone, previous school. The school reviews the request and
approves or rejects it.

### 3.6 Support requests

If you use the in-app support form, we collect your **name and message**.
On the device, at most the latest **50** support requests are kept.

## 4. What we do NOT collect

- **Location** — the app never asks for your location (geolocation grep:
  0 hits at v146).
- **Analytics or crash data** — there is no analytics or crash-reporting SDK
  in the app (gtag / Firebase / Sentry grep: 0 hits at v146). We do not track
  how you use the app.
- **Device or advertising IDs, contacts, SMS, call logs, files** — none of
  these are collected or accessed.
- **Ads** — there are no ads in the app and no ads SDK in the code
  (dedicated grep at v146 for AdMob/AdSense/doubleclick/AppLovin/Unity Ads/
  ironSource/StartApp/MoPub: 0 hits in code — a code check, not a runtime
  check).

## 5. Why we collect it (purpose)

| Data | Purpose |
|---|---|
| School account + profile | Login, sign-up, password reset; identifying which school's data is shown and synced. |
| Student records | Attendance, fees and receipts, exams and marks, homework, notices, ID cards. |
| Student photo | Student profile, ID cards, fee receipts. |
| Aadhaar last-4 | Student identity record, as entered by the school. |
| Student PIN (hash) | Student login authentication. |
| Teacher records | Teacher login, class-scoped dashboards, attendance, homework and marks. |
| Fees / attendance / marks | The app's core function: the school's fee bookkeeping, attendance tracking, exams and results, reports. |
| Admission requests | Admission enquiries for the school to review, approve or reject. |
| Support requests | Answering the user's message. |

We do **not** use the data for advertising, marketing, or any purpose other
than running the school's records in the app.

## 6. Where data is stored

- **On the school's device**, in the browser's localStorage
  (school accounts, the school database, the login session, support
  requests).
- **On our server:** Supabase project `bsjqeeeemwimzldrehpw`
  (`https://bsjqeeeemwimzldrehpw.supabase.co`) — Supabase Auth (login
  accounts), the Postgres database tables (`ss_*`), and private file
  storage (`student-photos` for student photos, `school-logos` for school
  logos), so the school's records sync across the school's devices.
- A school's data is visible only inside that school. The server rules
  (row-level security) allow a school owner to see only their own school's
  rows; schools cannot see each other's data. One exception the school
  should know about: the database also has a platform-admin role
  (`ss_platform_admins`) that can access schools' data under the server
  rules. There is no platform-admin login in the app itself — this is a
  database-level role — and whether any admin rows exist, and who holds
  them, is **not verified** here.

## 7. Who we share data with

- **Supabase (data processor).** Supabase hosts the database and the login
  service. Data is stored there so the school's records sync across
  devices. Supabase is the only third party that receives data automatically.
- **WhatsApp — only when the school admin manually opens it.** The app can
  open a `wa.me` link with a pre-filled fee reminder, absence alert, receipt
  or profile message. There is no WhatsApp API, no automatic sending and no
  bulk sending. The message goes only to the number the admin chose, only
  when the admin taps send.
- **We do not sell data. We do not share data for advertising or marketing.
  We use no third-party advertising or analytics SDKs.**

## 8. How data is protected

- **In transit:** all traffic to Supabase goes over HTTPS/TLS. WhatsApp
  `wa.me` links also open over HTTPS. No data is sent over plain HTTP.
- **Passwords and PINs:** stored only as salted `s256$` SHA-256 hashes
  (single iteration). Plain passwords and PINs are never stored. A slower,
  server-side check (PBKDF2 / bcrypt / argon2) is planned but **not yet
  built**.
- **Student / parent PIN lockout:** after 5 wrong PIN attempts the login is
  locked for 15 minutes. When the school's data is on the server, the
  lockout is enforced on the server too (`ss_student_cloud_login`). On a
  device without the server copy, the lockout lives only on that device
  (clearing the device's stored data resets it).
- **At rest — honest statement: no app-level encryption yet.** The app
  stores its local database (including PIN hashes, phone numbers, Aadhaar
  last-4 and photos) as **plaintext in localStorage**, and login tokens as
  plaintext in localStorage. A full-backup JSON export contains the whole
  database (hashes, photos and personal data) without a warning. Encrypting
  stored data is **undecided** — it needs a decision first, because losing
  the encryption key would mean losing the data. Supabase's own
  platform-level disk encryption is **not verified here** and is not claimed.
- **Independent security review / certifications:** none. We do not claim any.

**What this means in plain words:** anyone who can open the school's device
or its browser storage can read the school's stored data. Keep the school's
device locked, do not share the school's login, and treat a full-backup file
like a paper register — keep it safe and do not forward it to strangers.

## 9. How long we keep data (retention)

There is **no automatic retention period** in the app today. Data is kept
until the school deletes it (per-record delete, Reset All Data, or Delete
Account — see §10). We do not invent a retention period in this policy.

- Support requests kept on the device are capped at the latest **50**.
- A student record deleted in the app is **soft-deleted**: the record is
  kept, and the student's fees, marks, attendance and homework stay saved.

If a retention rule is set later (for example, "rejected admission requests
older than X are deleted"), this policy will be updated together with the app.

## 10. Deleting your data

This is the honest current state — not the target state.

1. **Delete Account (in the app).** Settings → "Delete Account". It asks
   for the account password and for the exact school name typed out (two
   steps). If the school is linked to the server, the app then asks whether
   to delete **from this device only** or **from the server too**. "From the
   server too" runs a server function that wipes the school's server rows
   **and deletes the login account** — after that, the same email cannot
   log in again. "This device only" removes everything for that school on
   this device; logging in again with the same email brings a server-linked
   school back. A school that was never linked to the server is gone for
   good either way.
   - If the server function has not been deployed yet, the app says so
     honestly and only the device-only deletion runs — it never claims a
     server deletion happened.
2. **Reset All Data.** Deletes all school data on the device, with an option
   "Delete on server too" (which wipes the school's server rows). But the
   login account itself (`auth.users`) is **never** deleted by it, and the
   same email and password can log in again afterwards.

Individual records (a student, a teacher, a fee record, an exam) can also be
deleted in the app by the school admin. Exam deletion is a soft delete.

## 11. Children's data

- The app handles **minors' school records** (Nursery to 12th): name, date
  of birth, photo, Aadhaar last-4, PIN hash and the rest of §3.2.
- **Consent is school-mediated.** Students do not sign up themselves. A
  child's record is created by the school at admission (admission form or
  school enrolment), and the **school is responsible for having the
  parent/guardian's consent or authority** to enter and keep that child's
  data. The app does not itself collect a parent's consent, and this policy
  does not invent a consent mechanism.
- The app's primary users are school staff; students and parents are
  secondary users (a parent sees only their own child's record, with the
  admission number and PIN the school gave them). No age-gate is built into
  teacher, student or parent login today — whether one is needed is a
  decision for Ashutosh (see §17, Q8).
- We do not use children's data for advertising, and we do not share it
  with advertisers.

## 12. The school's responsibilities

The school admin is responsible for:

- Keeping the school's login password and teacher/student PINs safe, and
  for who on the school's devices can open the app.
- The **accuracy** of the records the school enters (names, fees, marks,
  attendance).
- Having the parent/guardian's consent or authority for each child's record
  (§11).
- Keeping its own backups (the app's full-backup export) somewhere safe.
- What the school sends out of the app itself — for example, a receipt or
  reminder the admin chooses to send over WhatsApp (§7).

## 13. Your rights

- **School admin:** you can view, correct and delete the records you
  entered, in the app. You can export a full backup, reset all data, or
  delete the account on the device (§10).
- **Parent / guardian / student:** ask your school to show, correct or
  delete your (or your child's) record. If the school cannot help, contact
  us (§14) and we will pass the request to the school — we cannot change a
  school's records without the school.
- Because server-side deletion depends on the server function being
  deployed (§10, point 1), a deletion request for server data can also be
  made manually: contact us (§14) and tell us the school name and email,
  and we will confirm what was deleted.

## 14. Contact us

- **Email:** `support@school-saathi.in`
  - ⚠️ **UNVERIFIED:** whether this mailbox is actually monitored, and by
    whom, is **not verified**. Do not promise a support response time until
    Ashutosh confirms it.

## 15. हिंदी सारांश (Hindi summary)

**School Saathi** बिहार के स्कूलों (Nursery–12th) के लिए एक ऐप है — छात्र,
उपस्थिति, फीस, परीक्षा और होमवर्क का रिकॉर्ड रखने के लिए।

- **क्या डेटा लेते हैं:** स्कूल अकाउंट (ईमेल + पासवर्ड), छात्रों का रिकॉर्ड
  (नाम, कक्षा, जन्म तिथि, फोटो, आधार के **सिर्फ आखिरी 4 अंक**, PIN का hash),
  शिक्षकों का रिकॉर्ड, फीस/उपस्थिति/अंक, दाखिले के आवेदन, और सपोर्ट मैसेज।
  माता-पिता अपने बच्चे की प्रवेश संख्या और PIN से लॉगिन करते हैं।
- **कहाँ रहता है:** स्कूल के डिवाइस पर और Supabase सर्वर
  (`bsjqeeeemwimzldrehpw`) पर। एक स्कूल का डेटा दूसरे स्कूल को नहीं दिखता।
- **किससे साझा करते हैं:** सिर्फ Supabase (सर्वर) से, और WhatsApp से सिर्फ
  तब जब एडमिन खुद `wa.me` लिंक खोले। डेटा **बेचते नहीं**, विज्ञापन के लिए
  **साझा नहीं करते**, कोई विज्ञापन/analytics SDK **नहीं** है।
- **सुरक्षा:** सर्वर से बातचीत HTTPS से होती है। पासवर्ड/PIN सिर्फ hash के
  रूप में रखे जाते हैं। लेकिन डिवाइस पर डेटा **बिना encryption** रखा जाता है
  — डिवाइस को लॉक रखें, लॉगिन किसी से साझा न करें।
- **बच्चों का डेटा:** छात्र नाबालिग हैं। उनका रिकॉर्ड स्कूल दाखिले के समय
  बनाता है — माता-पिता की सहमति की ज़िम्मेदारी **स्कूल की** है।
- **हटाना:** ऐप में "Delete Account" से डिवाइस से या सर्वर से भी हटाया जा
  सकता है — सर्वर से हटाने पर लॉगिन अकाउंट भी मिट जाता है।
- **संपर्क:** `support@school-saathi.in` (यह mailbox देखी जाती है या नहीं,
  यह अभी **पुष्टि नहीं** हुई है)।
- **आखिरी अपडेट:** 24 नवंबर 2026।

## 16. Changes to this policy

When this policy changes, the new version will replace this page, and the
app will link to the current version. The policy is hosted at
`https://ashutoshkumarjpg67-ai.github.io/school-saathi/privacy-policy.html`
(and the Cloudflare Pages mirror). Material changes — for example, a new
kind of data collected, or pricing — will be reflected here **before** the
change takes effect.

## 17. Open questions for Ashutosh (do NOT treat these as decided)

1. **Support mailbox:** Is `support@school-saathi.in` actually monitored,
   and by whom? What response time, if any, may the policy promise?
2. **Operator details:** What name / legal entity should the policy name as
   the operator of School Saathi? (No company or registration details exist
   in the repo — none are invented here.)
3. **Old full-Aadhaar rows:** Are there any full (12-digit) Aadhaar values
   still in the live database from before SQL 09? If yes, they must be
   truncated before the policy claims "last-4 only".
4. **Legacy plaintext PIN rows:** Is a one-time server sweep to confirm zero
   plaintext `parent_pin` rows approved? (The app heals rows on pull, but
   no server-side confirmation has been run.)
5. **Encryption at rest:** Should local data be encrypted with a
   password-derived key — knowing **key-loss = data-loss**?
6. **Pricing:** Free / per-school monthly / per-student? (See Terms §6.)
   Until decided, the policy assumes no payments and no Play Billing.
7. **Families positioning / age-gate:** Confirm the wording — primary user =
   school staff, students and parents = secondary users; consent for minors'
   data is school-mediated through admission. Is any age-gate needed for
   teacher/student/parent login?
8. **Retention rule:** Should any data type auto-expire (for example,
   rejected admission requests, old support requests)? If yes, what period?
9. **Teacher-password upload — live state:** v62 code syncs the teacher
    email + salted password hash to `ss_teachers`. Is SQL 18 applied live,
    and is keeping that upload acceptable?

---

## 18. Source traceability

Every claim above traces to one of these. "Audit §6" = Phase 0 audit report
§6 (base v58); "Data Safety draft" = `docs/data-safety-form-draft.md`;
"v146 check" = code checked on this policy's base, origin/main `e9a47c7`
(v146).

| Claim in this policy | Source |
|---|---|
| School admin account fields; school profile columns | Audit §6; `supabase/01_schema.sql:19-40`; app.js `doLogin` / `doSignup` |
| Student fields (name … result %, documents flags only) | Audit §6; `supabase/01_schema.sql:46-81`; app.js `sbMapStudent` |
| Photo: 512 px / ~120 KB cap, private Storage bucket, signed URLs | Audit §6; app.js `PHOTO_MAX` / `PHOTO_CAP`; `sbUploadImage('student-photos', …)`; SQL 49 private buckets (v146 check) |
| Aadhaar last-4 only | Audit §6; app.js:191 `aadhaarLast4()`, :849; `supabase/09_aadhaar_last4.sql`; live old rows UNVERIFIED (audit §8 item 21) |
| Student PIN salted hash only; 6-digit random PINs; server verify + lockout | Audit §6 + CR-3; `hashPin()` / `randomPin()`; `ss_student_cloud_login` (SQL 17); v146 DOB-reset removal (v146 check) |
| Parent login (admission no + PIN, server-checked when cloud) | index.html `tabParent` / `doParentLogin`; `ss_student_cloud_login` (v146 check) |
| Teacher fields; v62 email + `pw_hash` upload | Audit §6 (v58 state); Data Safety draft N1; app.js `sbMapTeacher` (v146 check); SQL 18 live application UNVERIFIED |
| Fees / attendance / marks / exams / homework / notices fields | Audit §6; `supabase/01_schema.sql:90-153, 240-286` |
| No payment gateway code | v146 check `razorpay\|stripe\|paytm\|phonepe\|gpay\|checkout`: 0 hits in app.js/index.html/sw.js/qrgen.js/manifest.json — resolves audit §8 item 19 as a code check |
| Admission-request fields; anon POST | Audit §6; app.js `openAdmissionApply()`; `supabase/01_schema.sql:183-200` |
| Support requests name + message; max 50 on-device | Audit §6; app.js `openSupportForm` / `submitSupportRequest`; mailbox monitored UNVERIFIED (audit §8 item 17) |
| NOT collected: location, analytics/crash SDK, device ID, contacts | Audit §6; re-checked at v146: geolocation 0 hits, `gtag\|firebase\|sentry` 0 hits |
| NOT collected: ads SDK | Audit §6 said dedicated grep not run; Data Safety draft N2 resolved at v66; **re-checked at v146: 0 hits in code** — code grep only |
| WhatsApp manual `wa.me` only, no API/session/auto-send | Audit §6; app.js `wa.me` 12 occurrences at v146 (`waFeeReminder` / `waAbsentAlert` / `waReceiptShare` / `waProfileChat`) |
| Stored where: Supabase project `bsjqeeeemwimzldrehpw` + device localStorage | Audit §6/§7; app.js:223 `SB_URL` (v146 check confirmed) |
| Encrypted in transit: HTTPS/TLS | app.js:223 `SB_URL` (`https://…`) |
| At-rest encryption NOT implemented | Audit H-5; v146 check: no `subtle.encrypt` / AES-GCM / `encrypt(` in app.js |
| Delete Account: device-only or server too (Edge Function deletes auth user) | Audit CR-6; app.js `deleteAccountOnServer` + `sbCallDeleteAccountFunction`; `supabase/functions/delete-account` (`auth.admin.deleteUser`) (v146 check) |
| Minors (Nursery–12th); parent login exists; no super-admin login screen | Audit CR-9; app.js CLASSES Nursery–12th; index.html `tabParent`; server-side `ss_is_super_admin` (SQL 31) only |
| No pricing defined; plan is only a status label | Audit H-14 |
| PIN lockout 5 wrong = 15 min, server + local | Audit H-4; `PIN_LOCK_MS`, `pinLockUntil`; `ss_student_cloud_login` server lockout (v146 check) |

---

*Prepared for audit CR-5 (Phase D, item D2). Base: origin/main `e9a47c7`
(v146), published as v147. Status: published in the app and on the public
site; the open items in §17 still need the owner's confirmation.*
