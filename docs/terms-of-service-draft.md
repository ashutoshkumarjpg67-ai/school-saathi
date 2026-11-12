# School Saathi — Terms of Service (DRAFT)

> **DRAFT — for Ashutosh's approval, not published.**
>
> This is a **draft only**. It is not live, not linked from the app, and not
> agreed to by any user. Hosting these terms at a public URL and linking them
> from the app and the Play Console listing happens **only after Ashutosh
> approves this text** (audit CR-5).
>
> **Base:** origin/main `60fddc1` (**v67**). Every factual claim below traces
> to the Phase 0 audit (`school-saathi-phase0-audit.md`), to the Play Data
> Safety form draft (`docs/data-safety-form-draft.md`, PR #36, base v66), or
> to code grepped at v67 — see the traceability table in §13. Nothing here
> is invented: no prices, no dates, no company registration details, no
> legal claims beyond what this draft itself states. Where the audit says
> **UNVERIFIED**, this draft says UNVERIFIED too.
>
> **Language:** These terms are written in English, with a short Hindi
> summary in §12. The app itself is bilingual (English / हिंदी), and the
> Hindi summary matches that. If Ashutosh wants a full Hindi translation,
> that is a separate step after approval of the English text.

---

## 1. What the service is

**School Saathi** is a multi-school app (a web app / PWA) for schools in
Bihar, covering classes Nursery to 12th. A school uses it to keep its own
records: students, attendance, fees and receipts, exams and marks, homework,
notices, and teachers.

The service consists of the app itself and the server that stores and syncs
the school's records (Supabase project `bsjqeeeemwimzldrehpw`). There is no
separate website or landing page yet, and no Android app yet — the app runs
in the browser and can be installed as a PWA.

These terms cover the use of the app by a school and by the people the school
allows to use it (teachers and students). The companion Privacy Policy
(`privacy-policy-draft.md`) explains what data is collected and how it is
handled. The two documents are meant to be read together and must agree with
each other — if they ever disagree, tell us (§11) and we will fix it.

## 2. Who may use it

- **Schools.** A school creates one school account (email + password) and
  uses the app to manage its own records. A school account is for that
  school only — schools cannot see or change each other's data.
- **School admin.** The person who creates and controls the school account.
  The admin adds students and teachers, enters fees and marks, and controls
  who can log in on the school's devices.
- **Teachers.** A teacher logs in on the school's device with the login the
  school gave them, and works only with the classes the school assigned to
  them.
- **Students.** A student logs in with the PIN the school set for them, and
  sees only their own attendance, fees, results and homework.
- **Parents / guardians do not have a login.** There is no parent login in
  the app (it was removed in v35). Parents see their child's information
  through the school, not through the app.
- There is **no "super admin" login** in the app (removed in v28).

By creating a school account or logging in, you agree to these terms. If you
do not agree, do not use the app.

## 3. Your account — your responsibility

- **Keep your login safe.** The school admin is responsible for the school
  account's email and password, and for the teacher logins and student PINs
  the school hands out. Do not share the school password with people outside
  the school. Anyone who has the school's login can open the school's
  records on that device.
- **One school, one account.** Each school account belongs to one school.
  Do not use a school account to keep another school's records.
- **Tell us if the login is misused.** If you think someone else has your
  school's password or a teacher/student login, change the password / PIN
  in the app and contact us (§11).
- **Password rules in the app today:** the minimum password length is 6
  characters. Passwords and PINs are stored only as salted hashes, never in
  plain text — but the hash is a single-iteration SHA-256, which is not
  strong protection on its own if it leaks (see Privacy Policy §8). Choose
  a password that is not easy to guess.
- **Devices:** the app stores the school's data on the device where it is
  used (browser localStorage). The school is responsible for keeping its
  devices locked and for who can open them.

## 4. Acceptable use

Use the app only for running your school's records. In particular:

- **Do not** enter false, misleading or unlawful information.
- **Do not** try to open, change or delete another school's data, or to log
  in as another school, teacher or student.
- **Do not** try to break, overload or misuse the service — including
  trying to get at other schools' records through the server, or trying to
  bypass the login.
- **Do not** use the app to send spam, or to send messages to people who
  have not agreed to hear from the school.
- **Do not** upload anything that you do not have the right to keep in the
  school's records (for example, a photo of a child whose parent/guardian
  has not agreed to it — see §5).
- The app has **no built-in way to report misuse by another user**. If you
  see misuse, contact us (§11).

## 5. Data accuracy and children's records

- **The school is responsible for the accuracy** of the records it enters:
  names, classes, fees, marks, attendance and the rest. The app shows what
  the school entered; it does not check whether it is true.
- **Children's records:** the app holds minors' school records (Nursery to
  12th). The school creates a child's record at admission and is
  responsible for having the parent/guardian's consent or authority to enter
  and keep that child's data. The app does not itself collect a parent's
  consent. (See Privacy Policy §11.)
- **Keep your own backups.** The app can export a full backup (JSON) of the
  school's data. The school should keep its own backups somewhere safe. A
  backup file contains the whole school database — treat it like a paper
  register and do not forward it to strangers.

## 6. Availability — no uptime promise

- The app is built to work **offline first**: the school can keep working
  without internet, and records sync to the server when the connection comes
  back (the app tries to sync about every 30 seconds while it is open).
- We make **no promise about uptime** and no service-level promise (no SLA).
  The service may be unavailable sometimes — for example, during maintenance
  or if the server is down. We do not promise a fix time.
- Sync needs an internet connection. If the device is offline, changes stay
  on the device until it is back online. Logging out does not force a final
  sync — unsynced changes on the device are not uploaded by logging out.
- We may update the app. When a new version is available, the app checks for
  it and reloads once to the new version. We do not promise advance notice
  for every update.

## 7. Pricing — to be decided

- **Pricing is not decided yet.** There is no price list, no subscription
  plan and no payment in the app today. No payment gateway is used and no
  in-app purchase exists (no payment-gateway code was found in the app at
  v67).
- The app stores a `plan` label for a school (`Active` / `Trial` /
  `Expired`). Today that label is **only a label** — it is not enforced: an
  `Expired` label does not block login or features. Do not read it as a
  pricing promise.
- If pricing is introduced later, these terms and the Privacy Policy will be
  updated **before** anyone is charged, and the school will be told the
  price first. Nothing in this draft agrees to a future price on your behalf.

## 8. Ending the service / deleting your account

- **The school can delete its account in the app** (Settings → "Delete
  Account"). It asks for the account password and for the exact school name
  typed out. It deletes everything for that school **on that device only**.
  The server copy (if any) is **not** deleted: logging in again with the
  same email brings a server-linked school back. A school that was never
  linked to the server is gone for good. (See Privacy Policy §10.)
- **Reset All Data** deletes all school data on the device, with an option
  "Delete on server too" (which wipes the school's server rows). But the
  login account itself is **never** deleted by it, and the same email and
  password can log in again afterwards.
- **Full server-side account deletion is not yet built.** Until it is, a
  deletion request for server data is handled manually: contact us (§11)
  with the school name and email, and we will confirm what was deleted.
- **Ending the service by us:** no provider-side suspension or termination
  process is defined in the app today. Whether and how the service may be
  suspended or ended for a school — and what notice is given — is a
  decision for Ashutosh (see §13, Q4). This draft does not invent a
  suspension power.

## 9. Liability — in plain language

- The app is provided **as it is**, without warranties of any kind. We do
  not promise that the app is error-free, always available, or fit for any
  particular purpose beyond keeping school records as described in §1.
- **Your records are your responsibility.** If data is lost — for example,
  because a device's stored data was cleared, a backup file was lost, or the
  school's login was shared — we are not liable for recreating it. Keep your
  own backups (§5).
- **Fees and money:** the app only records fee payments the school enters by
  hand (cash/UPI). It does not process payments and does not hold money. Any
  dispute about a fee is between the school and the parent/guardian, not
  with us.
- **What the app does not do:** it does not verify the truth of the records
  the school enters, it does not check a parent's consent, and it does not
  guarantee that a record synced from one device is the same on another
  device if the devices were offline when changes were made.
- Nothing in this section removes liability that cannot be removed by law.
  The limits above are draft wording for Ashutosh's approval — they are not
  a lawyer's advice and the app has had no independent legal review (see
  §13, Q6).

## 10. Changes to these terms

- These terms may change. When they do, the new version will replace this
  draft **after Ashutosh approves it**, and the app will link to the current
  version.
- If pricing is introduced (§7), or if the deletion flow (§8) or the
  children's-data rules (§5) change, the terms will be updated **before**
  the change takes effect, and the school will be told.
- Continuing to use the app after the terms change means you accept the new
  terms. If you do not accept them, stop using the app and delete your
  account (§8).

## 11. Contact us

- **Email:** `support@school-saathi.in`
  - ⚠️ **UNVERIFIED:** whether this mailbox is actually monitored, and by
    whom, is **not verified**. Do not promise a support response time until
    Ashutosh confirms it.

## 12. हिंदी सारांश (Hindi summary)

**School Saathi** बिहार के स्कूलों (Nursery–12th) के लिए एक ऐप है — छात्र,
उपस्थिति, फीस, परीक्षा और होमवर्क का रिकॉर्ड रखने के लिए।

- **कौन इस्तेमाल कर सकता है:** स्कूल (एडमिन), शिक्षक और छात्र (PIN से)।
  माता-पिता का कोई लॉगिन **नहीं** है।
- **आपकी ज़िम्मेदारी:** लॉगिन/पासवर्ड सुरक्षित रखें, सही जानकारी डालें,
  बच्चों के रिकॉर्ड के लिए माता-पिता की सहमति की ज़िम्मेदारी **स्कूल की** है,
  और अपना बैकअप खुद संभालकर रखें।
- **क्या नहीं करना है:** गलत जानकारी डालना, दूसरे स्कूल का डेटा खोलने की
  कोशिश करना, स्पैम भेजना, या सर्विस को नुकसान पहुँचाना।
- **उपलब्धता:** ऐप ऑफलाइन भी चलता है; कोई uptime की गारंटी **नहीं** है।
- **कीमत:** अभी तय **नहीं** हुई है — ऐप में कोई भुगतान नहीं है।
- **अकाउंट हटाना:** ऐप में "Delete Account" सिर्फ इस डिवाइस से हटाता है;
  सर्वर का अकाउंट हटाना अभी बना नहीं है।
- **संपर्क:** `support@school-saathi.in` (यह mailbox देखी जाती है या नहीं,
  यह अभी **पुष्टि नहीं** हुई है)।
- **यह DRAFT है** — Ashutosh की मंज़ूरी के बाद ही लागू होगा।

---

## 13. Open questions for Ashutosh (do NOT treat these as decided)

1. **Support mailbox:** Is `support@school-saathi.in` actually monitored,
   and by whom? What response time, if any, may the terms promise?
2. **Operator details:** What name / legal entity should the terms name as
   the operator of School Saathi? (No company or registration details exist
   in the repo — none are invented here.)
3. **Pricing:** Free / per-school monthly / per-student? What happens when a
   trial ends or a payment fails? Until this is decided, §7 must stay as
   "to be decided".
4. **Suspension / termination by the provider:** Should the terms give the
   operator a right to suspend or end a school's account (for example, for
   misuse under §4)? If yes, on what grounds, and with what notice?
5. **Governing law / disputes:** Which law governs these terms, and where
   are disputes settled? (Nothing is stated in this draft — it needs a
   decision, and ideally a lawyer's look.)
6. **Legal review:** Has any lawyer reviewed these drafts? The liability
   wording in §9 is plain-language draft wording, not legal advice.
7. **Terms URL + hosting:** What URL will these terms be hosted at?
   (GitHub Pages or another host — to be decided after approval, together
   with the Privacy Policy URL.)
8. **Families positioning / age-gate:** Confirm the wording — primary user =
   school staff, students = secondary users; consent for minors' data is
   school-mediated through admission. Is any age-gate needed for
   teacher/student login?
9. **Misuse reporting:** Should there be a way to report misuse inside the
   app, or is email contact (§11) enough for now?
10. **Backups / data loss:** Should the terms promise anything about server
    backups, or stay silent? (No server-backup promise exists in the repo
    today — do not invent one.)

---

## 14. Source traceability

Every factual claim above traces to one of these. "Audit §6" = Phase 0
audit report §6 (base v58); "Data Safety draft" =
`docs/data-safety-form-draft.md` (PR #36, base v66); "v67 grep" = code
checked on this draft's base `60fddc1` (v67).

| Claim in these terms | Source |
|---|---|
| App purpose: multi-school PWA, Nursery–12th, school records | Audit §7 architecture summary |
| Primary users school staff; students secondary | Audit CR-9 / §9 decision 14 |
| No parent login (removed v35); no super admin in app (removed v28) | Audit §7; app.js / index.html (3 login tabs only) |
| Teacher works only with assigned classes; student sees only own record | Audit §7 roles & dashboards |
| Minimum password length 6; salted `s256$` hash, single-iteration SHA-256 | Audit CR-3 |
| Device storage: browser localStorage | Audit §7 data model |
| No payment gateway code; no in-app purchase | v67 grep `razorpay\|stripe\|paytm\|phonepe\|gpay\|checkout`: 0 hits — resolves audit §8 item 19 as a code check |
| `plan` label Active/Trial/Expired, not enforced | Audit H-14 |
| Offline-first; sync ~30 s; logout does not flush outbox | Audit §7 sync summary |
| Device-only Delete Account (v60); server Auth-user deletion pending | Audit CR-6; app.js:6541 `deleteAccount` + `delConfirmMsg` (v67 grep confirmed) |
| Reset All Data + `ss_wipe_school` deletes rows, not `auth.users` | Audit CR-6 |
| Support email default; mailbox monitored UNVERIFIED | Audit §6; `supabase/01_schema.sql:221`; audit §8 item 17 |
| No uptime/SLA promise in the repo | No SLA exists in the repo (audit — no such claim anywhere) |
| Minors' data; school-mediated consent | Audit CR-9; Data Safety draft §1 |
| No landing page / Android app yet | Audit CR-4, H-16 |

---

*Draft prepared for audit CR-5 (Phase D, item D2). Base: origin/main `60fddc1`
(v67). Status: DRAFT — publication and hosting are Ashutosh's step, after
approval.*
