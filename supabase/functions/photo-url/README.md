# photo-url — Edge Function (photo privacy)

Mints short-lived (5-minute) signed URLs for student photos and school
logos after verifying the caller, so the storage buckets can stop being
public. It exists because the buckets are PUBLIC today: anyone who has or
guesses a photo URL can read a student's photo. Once this function is
deployed and the app uses it, the buckets flip to private (SQL 49) and a
photo URL is useless without a role-verified signed mint.

## What it does

POST body JSON, three caller modes (exactly one per request):

| mode | credentials | may fetch |
| --- | --- | --- |
| owner | `Authorization: Bearer <supabase access token>` | any photo / the logo of the school the JWT owns (`ss_schools.owner_id = jwt.sub`) |
| teacher | `teacher_token` (ss_teacher_sessions) | photos of students in the teacher's own classes (same scope as `ss_teacher_student_photo`, SQL 24/29); expired or revoked tokens fail |
| parent | `school_id` + `admission_no` + `pin` | only their own child's photo, verified by the live `ss_student_cloud_login` RPC so bcrypt$/s256$/legacy PINs all work, with the same server-side lockout (5 wrong PINs lock 15 minutes) |

Actions: `student` (one `student_id`) for every mode, `school` (logo plus
all student photos of the school) for owners only.

Rules enforced here:

- Object paths are built on the server (`<school_id>/<student_id>.jpg`,
  `<school_id>/logo.png`). The caller never supplies a path; owner and
  teacher modes never take a school id from the client at all.
- The service_role key comes from the functions runtime environment
  (`SUPABASE_SERVICE_ROLE_KEY`) and never appears in code, logs, or the
  client. PINs/tokens arrive in the POST body only and are never logged.
- Wrong/expired/revoked credentials get 401, cross-scope requests 403,
  locked parents 423, missing photos 404.
- Responses include `expires_in` (300s) so clients re-mint instead of
  caching past expiry.

## Deploy

Dashboard Edge Functions editor or `supabase functions deploy photo-url`,
then turn the function's **Verify JWT** setting OFF: the gateway must not
demand a Supabase JWT because parents and teachers authenticate with
custom credentials verified inside the function. Verification is never
skipped — it just happens in code instead of at the gateway.

The app treats a missing/unreachable function as "not set up yet" and
keeps the public-URL fallback, so deploying this function changes nothing
until the app version that calls it is live and verified.

## Order of operations

1. Deploy this function.
2. Deploy the app version that calls it (falls back to public URLs when
   the function is absent).
3. Verify per role: owner, teacher, parent happy paths; wrong token /
   expired token / cross-school student / wrong PIN / locked parent all
   refused; old public URLs still work (bucket still public).
4. Apply SQL 49 (buckets private, read policies for signed access).
5. Re-verify every role; old public URLs now 400/404, signed URLs work.

## Rollback

Fix forward. Do NOT flip the buckets back to public as a rollback — that
re-exposes every photo. If the function misbehaves, the app falls back to
public URLs only while the buckets are still public; after SQL 49, remove
or fix the function, never re-open the buckets.
