# delete-account — Edge Function (audit CR-6, Phase D)

Deletes a school's **server** account for good: every `ss_*` row for the
school, then the school row, then the Supabase Auth user. This is the
server-side half of Delete Account. The device-only half already ships in
the app (v60, Settings → Delete Account); this function is what makes the
"Delete from server too" choice real.

## What it does

1. Verifies the caller's JWT (gateway `verify_jwt` **and** a `getUser`
   check inside the function) and finds the school whose `owner_id`
   equals the JWT `sub`. The school is never taken from a client-supplied
   id — a caller can only delete their own school.
2. Deletes the school's rows across the `ss_*` tables — the 14 tables
   `ss_wipe_school` (05) covers **plus** `ss_student_login_attempts`
   (SQL 17), `ss_teacher_sessions` and `ss_teacher_login_attempts`
   (SQL 18), which the RPC does not cover — then the school row, then
   the email-keyed `ss_school_login_attempts` row (SQL 19) and any
   `ss_platform_admins` row.
3. Deletes the Auth user with the Admin API. The same email can then sign
   up again as a brand-new, empty school; the old data cannot come back.
4. Returns `{ deleted: true, school_id, school_name }` on success, or
   `{ error: ... }` with 401 / 404 (`no-school`) / 500 on failure.

## What it does NOT do

- It does **not** touch the device: the app clears local data and logs
  out only after the function reports success.
- It does **not** delete any other school — ownership is checked before
  any delete runs.
- It holds **no secrets in the repo**. The service_role key is read from
  the functions runtime environment (`SUPABASE_SERVICE_ROLE_KEY`) and
  never appears in code, in this README, or in any commit.

## Deploy — Ashutosh's step (do NOT deploy from a PR)

```bash
supabase login
supabase link --project-ref bsjqeeeemwimzldrehpw   # School Saathi project
supabase functions deploy delete-account
```

No secrets to set: `SUPABASE_URL`, `SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` are provided to Edge Functions by the
Supabase runtime automatically.

**JWT verification must stay ON** (it is the default): in the Supabase
dashboard → Edge Functions → `delete-account` → Settings, "Verify JWT"
must be enabled. If it is ever turned off, anyone with the anon key
could call the function — the in-function `getUser` check would still
reject them, but do not rely on that alone.

## Verify (test school only — never a real school)

```bash
# 1. Log the TEST school in and copy its access token, then:
curl -i -X POST https://bsjqeeeemwimzldrehpw.supabase.co/functions/v1/delete-account \
  -H "apikey: <anon key>" \
  -H "Authorization: Bearer <test school access token>" \
  -H "Content-Type: application/json" -d '{}'
# Expect: 200 {"deleted":true,...}
# 2. In the Supabase dashboard → Authentication → Users: the test user
#    must be gone. 3. Logging in with that email must fail. 4. Signing
#    up again with the same email must create a brand-new, empty school.
```

## Until it is deployed

The app checks for the function before claiming anything: if the
endpoint answers 404 (function not deployed yet), the app deletes the
account from **this device only** and tells the user plainly that
"server deletion is not set up yet". It never claims a server delete
succeeded when it did not.
