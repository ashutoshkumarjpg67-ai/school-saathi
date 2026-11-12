# School Saathi — Privacy Policy (DRAFT)

> **DRAFT — for Ashutosh's approval, not published.**
>
> This is a **draft only**. It is not live, not linked from the app, and not
> submitted anywhere. Hosting the policy at a public URL and linking it from
> the app and the Play Console listing happens **only after Ashutosh approves
> this text** (audit CR-5).
>
> **Base:** origin/main `60fddc1` (**v67**). Every data claim below traces to
> the Phase 0 audit (`school-saathi-phase0-audit.md`) **§6 data-collection
> list**, to the Play Data Safety form draft
> (`docs/data-safety-form-draft.md`, PR #36, base v66), or to code grepped
> at v67 — see the traceability table in §16. Nothing here is invented.
> Where the audit says **UNVERIFIED**, this draft says UNVERIFIED too.
>
> **Language:** This policy is written in English, with a short Hindi
> summary in §15. The app itself is bilingual (English / हिंदी), and the
> Hindi summary matches that. If Ashutosh wants a full Hindi translation,
> that is a separate step after approval of the English text.

---

## 1. What School Saathi is

School Saathi is a multi-school app (a web app / PWA) for schools in Bihar,
covering classes Nursery to 12th. A school uses it to keep its own records:
students, attendance, fees and receipts, exams and marks, homework, notices,
and teachers.

The app is used mainly by **school staff** — the school admin and teachers.
Students are secondary users: they can log in with a PIN to see their own
attendance, fees, results and homework.

There is **no parent login** in the app (it was removed in v35), and there is
**no "super admin" login** in the app (removed in v28).

## 2. Who this policy is for

- **School admins** who create a school account and enter school data.
- **Teachers** who log in on the school's device and work with their classes.
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
  on the device (maximum 512 pixels / 120 KB) and stored as a base64 JPEG
  data URL. It is used for the student profile, ID cards and fee receipts.
- **Aadhaar (optional, last 4 digits only):** if the school enters an
  Aadhaar number, **only the last 4 digits are ever stored, shown, exported
  or printed**. The full 12-digit number never leaves the device. The server
  also truncates it to the last 4 digits.
  - ⚠️ **UNVERIFIED:** whether any **old full-Aadhaar values** still exist
    in the live database from before the truncation was added is **not
    verified**. Do not treat "no full Aadhaar exists on the server" as a
    fact until the live database is checked.
- **Student PIN (login PIN, 4–6 digits):** the PIN is stored and synced
  **only as a salted hash** (`s256$…`). The plain PIN is never stored on the
  server and never shown in the app. The PIN is set by the school at
  admission.
  - The hash uses single-iteration SHA-256. A 4-digit PIN has only 9,000
    possible combinations, so the hash alone is **not** strong protection if
    it leaks. A stronger, server-side PIN check is planned but **not yet
    built**. Do not read this policy as claiming the PIN is strongly
    protected.
  - ⚠️ **UNVERIFIED:** how many server PIN rows are still stored as
    **legacy plaintext** (from before hashing) is **not verified** — no
    one-time sweep to hash them has been done yet.
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
  was found in the app at v67 (repo-wide grep for Razorpay/Stripe/Paytm/
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
  0 hits at v67).
- **Analytics or crash data** — there is no analytics or crash-reporting SDK
  in the app (gtag / Firebase / Sentry grep: 0 hits at v67). We do not track
  how you use the app.
- **Device or advertising IDs, contacts, SMS, call logs, files** — none of
  these are collected or accessed.
- **Ads** — there are no ads in the app and no ads SDK in the code
  (dedicated grep at v67 for AdMob/AdSense/doubleclick/AppLovin/Unity Ads/
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
  accounts) and the Postgres database tables (`ss_*`), so the school's
  records sync across the school's devices.
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
- **Student PIN lockout:** after 5 wrong PIN attempts the student login is
  locked for 15 minutes — but this lockout lives only on that device
  (clearing the device's stored data resets it). Server-side PIN lockout is
  part of the planned server-side PIN check, not yet built.
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
Account — see §10). We do not invent a retention period in this draft.

- Support requests kept on the device are capped at the latest **50**.
- A student record deleted in the app is **soft-deleted**: the record is
  kept, and the student's fees, marks, attendance and homework stay saved.

If a retention rule is set later (for example, "rejected admission requests
older than X are deleted"), this policy will be updated together with the app.

## 10. Deleting your data

This is the honest current state — not the target state.

1. **Delete Account (in the app, device-only).** Settings → "Delete
   Account". It asks for the account password and for the exact school name
   typed out (two steps). It removes the school account, login, students,
   fees, attendance — everything for that school **on this device only**.
   The server copy (if any) is **NOT** deleted: logging in again with the
   same email brings a server-linked school back. A school that was never
   linked to the server is gone for good.
2. **Reset All Data.** Deletes all school data on the device, with an option
   "Delete on server too" (which wipes the school's server rows). But the
   login account itself (`auth.users`) is **never** deleted by it, and the
   same email and password can log in again afterwards.
3. **Not yet built:** full server-side account deletion — a server function
   that wipes the school's server data **and** deletes the login account,
   plus a matching in-app flow that is clearly different from Reset All
   Data. Until that is built, this policy must not claim full account
   deletion. Whether a web-link deletion option is offered as well is a
   decision for Ashutosh (see §17, Q3).

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
- The app's primary users are school staff; students are secondary users
  (they only see their own record). No age-gate is built into teacher or
  student login today — whether one is needed is a decision for Ashutosh
  (see §17, Q8).
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
- Because full server-side account deletion is not yet built (§10, point 3),
  a deletion request for server data is handled manually for now: contact
  us (§14) and tell us the school name and email, and we will confirm what
  was deleted.

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
- **हटाना:** ऐप में "Delete Account" सिर्फ इस डिवाइस से हटाता है; सर्वर का
  अकाउंट हटाना अभी बना नहीं है।
- **संपर्क:** `support@school-saathi.in` (यह mailbox देखी जाती है या नहीं,
  यह अभी **पुष्टि नहीं** हुई है)।
- **यह DRAFT है** — Ashutosh की मंज़ूरी के बाद ही प्रकाशित होगा।

## 16. Changes to this policy

When this policy changes, the new version will replace this draft **after
Ashutosh approves it**, and the app will link to the current version. The
hosting URL is decided after approval — there is no public policy URL yet.

## 17. Open questions for Ashutosh (do NOT treat these as decided)

1. **Support mailbox:** Is `support@school-saathi.in` actually monitored,
   and by whom? What response time, if any, may the policy promise?
2. **Operator details:** What name / legal entity should the policy name as
   the operator of School Saathi? (No company or registration details exist
   in the repo — none are invented here.)
3. **Deletion-link option:** Should the Play Console "Data deletion" section
   offer a **web link** (in addition to the in-app flow) — for example, a
   deletion request page or form? If yes, what URL, and who handles the
   requests?
4. **Old full-Aadhaar rows:** Are there any full (12-digit) Aadhaar values
   still in the live database from before SQL 09? If yes, they must be
   truncated before the policy claims "last-4 only".
5. **Legacy plaintext PIN rows:** How many server `parent_pin` rows are
   still plaintext? Is a one-time server sweep to hash them approved?
6. **Encryption at rest:** Should local data be encrypted with a
   password-derived key — knowing **key-loss = data-loss**?
7. **Pricing:** Free / per-school monthly / per-student? (See Terms §6.)
   Until decided, the policy assumes no payments and no Play Billing.
8. **Families positioning / age-gate:** Confirm the wording — primary user =
   school staff, students = secondary users; consent for minors' data is
   school-mediated through admission. Is any age-gate needed for
   teacher/student login?
9. **Retention rule:** Should any data type auto-expire (for example,
   rejected admission requests, old support requests)? If yes, what period?
10. **Policy URL + hosting:** What URL will this policy be hosted at?
    (GitHub Pages or another host — to be decided after approval.)
11. **Teacher-password upload — live state:** v62 code syncs the teacher
    email + salted password hash to `ss_teachers`. Is SQL 18 applied live,
    and is keeping that upload acceptable?

---

## 18. Source traceability

Every claim above traces to one of these. "Audit §6" = Phase 0 audit report
§6 (base v58); "Data Safety draft" = `docs/data-safety-form-draft.md`
(PR #36, base v66); "v67 grep" = code checked on this draft's base
`60fddc1` (v67).

| Claim in this policy | Source |
|---|---|
| School admin account fields; school profile columns | Audit §6; `supabase/01_schema.sql:19-40`; app.js `doLogin` / `doSignup` |
| Student fields (name … result %, documents flags only) | Audit §6; `supabase/01_schema.sql:46-81`; app.js `sbMapStudent` |
| Photo base64, 512 px / 120 KB cap | Audit §6; app.js:4286 `PHOTO_MAX` / `PHOTO_CAP` (v67 grep) |
| Aadhaar last-4 only | Audit §6; app.js:191 `aadhaarLast4()`, :849; `supabase/09_aadhaar_last4.sql`; live old rows UNVERIFIED (audit §8 item 21) |
| Student PIN salted hash only; 9,000 combos; single-iteration SHA-256 | Audit §6 + CR-3; app.js:182 `hashPin()` (v67 grep) |
| Teacher fields; v62 email + `pw_hash` upload | Audit §6 (v58 state); Data Safety draft N1; app.js:859-873 `sbMapTeacher` (v67 grep); SQL 18 live application UNVERIFIED |
| Fees / attendance / marks / exams / homework / notices fields | Audit §6; `supabase/01_schema.sql:90-153, 240-286` |
| No payment gateway code | v67 grep `razorpay\|stripe\|paytm\|phonepe\|gpay\|checkout`: 0 hits in app.js/index.html/sw.js/qrgen.js/manifest.json — resolves audit §8 item 19 as a code check |
| Admission-request fields; anon POST | Audit §6; app.js `openAdmissionApply()`; `supabase/01_schema.sql:183-200` |
| Support requests name + message; max 50 on-device | Audit §6; app.js `openSupportForm` / `submitSupportRequest`; mailbox monitored UNVERIFIED (audit §8 item 17) |
| NOT collected: location, analytics/crash SDK, device ID, contacts | Audit §6; re-checked at v67: geolocation 0 hits, `gtag\|firebase\|sentry` 0 hits |
| NOT collected: ads SDK | Audit §6 said dedicated grep not run; Data Safety draft N2 resolved at v66; **re-checked at v67: 0 hits in code** — code grep only |
| WhatsApp manual `wa.me` only, no API/session/auto-send | Audit §6; app.js `wa.me` 11 occurrences at v67 (`waFeeReminder` / `waAbsentAlert` / `waReceiptShare` / `waProfileChat`) |
| Stored where: Supabase project `bsjqeeeemwimzldrehpw` + device localStorage | Audit §6/§7; app.js:223 `SB_URL` (v67 grep confirmed) |
| Encrypted in transit: HTTPS/TLS | app.js:223 `SB_URL` (`https://…`) |
| At-rest encryption NOT implemented | Audit H-5; v67 grep: no `subtle.encrypt` / AES-GCM / `encrypt(` in app.js |
| Device-only Delete Account (v60); server Auth-user deletion pending | Audit CR-6; app.js:6541 `deleteAccount` + `delConfirmMsg` (v67 grep confirmed); server wipe `ss_wipe_school` deletes rows, not `auth.users` |
| Minors (Nursery–12th); no parent login; no super admin in app | Audit CR-9; app.js CLASSES Nursery–12th; parent login removed v35, super admin removed v28 |
| No pricing defined; plan is only a status label | Audit H-14 |
| PIN lockout 5 wrong = 15 min, local-only | Audit H-4; app.js PIN lockout code |

---

*Draft prepared for audit CR-5 (Phase D, item D2). Base: origin/main `60fddc1`
(v67). Status: DRAFT — publication and hosting are Ashutosh's step, after
approval.*
