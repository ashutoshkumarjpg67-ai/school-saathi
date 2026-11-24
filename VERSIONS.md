## v146 — parent PIN reset by DOB removed; school-issued random PIN only

- **DOB reset is gone:** the parent login no longer offers a PIN reset with admission number + date of birth — both are known to classmates and teachers, so anyone could set a child's parent PIN. A parent who forgot the PIN is now told to ask the school.
- **Admin-issued reset:** the school admin's student-profile PIN card gains "Generate new PIN" — a fresh 6-digit random PIN, shown once to share with the parent out-of-band (in person / phone / the school's own WhatsApp). Only the salted hash is stored; the reset is audited and clears the lockout. The same PIN is set on the server through the new `ss_admin_reset_parent_pin` RPC (school-owner check, authenticated session only) when online; offline it rides the student upsert.
- **6-digit PINs:** new and changed PINs must be 6 digits (4-digit was too weak). Existing 4–5 digit PINs keep working until changed. `randomPin()` now mints 6 digits.
- **Server side (SQL 54, apply in the SQL Editor):** drops `ss_parent_pin_reset_by_dob` and the DOB proof in `ss_parent_pin_ok` (a DOB alone could clear the lockout once the reset was gone). Until SQL 54 is applied, the old RPC still exists on the server even though no app version calls it.

## v136 — public Apply picker: deliberate school choice

- **Placeholder option:** the public Apply-for-Admission picker pre-selected the first listed school, so an untouched School field silently applied there. A disabled empty-value "Select school" placeholder now leads the list; submitting without a choice shows a dedicated "Please choose a school" message (EN + HI). A school the parent already picked survives the async server-list refresh. Server side, the SQL 46 listable-school policy already rejects inserts without a valid listable school_id.

## v135 — audit fixes: JS-string escaping, server-side Super Admin check, audit/activity dedupe keys

- **Inline-handler escaping (XSS/SyntaxError):** class and subject names were interpolated raw — or `esc()`-only, which the HTML parser decodes before the JS runs — into `onclick`/`onchange` JS strings (classes page, class form, teacher form, staff form, teacher dashboard tile). An apostrophe in a class name broke the handler. New `jsAttr()` helper (JSON.stringify + HTML escape) is used for every free-text handler argument; the raw-unescaped checkbox labels and `<option>` texts in the same forms are escaped too. Receipt-number handlers switched to `jsAttr` for the same reason.
- **Super Admin link check is server-side:** the Super Admin's personal email was hard-coded in the two link guards (app bundle). The link flow now authenticates first and asks the server (`ss_is_super_admin`, SQL 31) with the new session token before saving anything. The check fails CLOSED: when it cannot be evaluated the link is held with an error, never allowed.
- **Audit log / activities dedupe keys:** the old keys (`ts|actor|action|details` at second precision, `title|sub`) collapsed distinct entries. New entries carry a stable `localId` (minted once at log time) which the keys include; legacy entries keep an empty suffix matching the pre-change server rows, so nothing re-uploads. Requires SQL 45 (`local_id` columns) to be applied BEFORE this app version syncs.

# Version kaise badhayein

- `version.json` me version badlo — ye ekmatra source of truth hai.
- Phir wahi number baaki jagah daalo: `app.js` me `APP_VERSION`, `index.html` me `?v=` (3) aur sidebar footer `vN`, `sw.js` me `CACHE_NAME` aur `APP_SHELL` ke `?v=` (3).
- Check chalao: `node scripts/check-version.mjs` — mismatch par exit code 1 aata hai; bina pass kiye push mat karo.
