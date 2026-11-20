-- 49_private_photo_buckets.sql — flip student-photos to PRIVATE
--
-- EXECUTED 2026-11-20, scoped to student-photos ONLY (app v145+).
-- school-logos INTENTIONALLY STAYS PUBLIC: the dashboard, printed
-- receipts, ID cards and print views render db.profile.logo directly
-- (no signing session is in scope on those paths), so flipping the logo
-- bucket would break the owner's own renders. Do NOT "finish" this
-- migration by flipping school-logos without first routing those render
-- paths through signed URLs.
--
-- Pre-conditions (held at execution time; see supabase/functions/photo-url/README.md):
--   1. The photo-url Edge Function is deployed (Verify JWT OFF).
--   2. The app version that calls it is live and verified for owner,
--      teacher, staff, principal and parent happy paths.
--   3. Negative probes pass: wrong/expired/revoked token, cross-school
--      and cross-class student, wrong PIN, locked parent — all refused.
--
-- After this file runs, public student-photo URLs stop working; only
-- signed URLs minted by photo-url (service role) read the objects.
-- Run ONLY against the School Saathi project (bsjqeeeemwimzldrehpw),
-- in the Supabase dashboard SQL editor. Idempotent.
--
-- Emergency rollback (restores the exact pre-flip state):
--   update storage.buckets set public = true where id = 'student-photos';
-- That re-exposes photos, so it is only an emergency revert while a
-- compatibility fix ships — never a resolution.

update storage.buckets set public = false
where id = 'student-photos';

-- Explicit SELECT policy for authenticated owners on their own folder keeps
-- the dashboard Storage UI usable for the signed-in owner; anonymous reads
-- stay denied (private bucket). Signed URLs bypass RLS via the service role.
drop policy if exists "student-photos owner read" on storage.objects;
create policy "student-photos owner read" on storage.objects
  for select to authenticated
  using (bucket_id = 'student-photos'
    and (storage.foldername(name))[1] in
      (select s.id::text from public.ss_schools s where s.owner_id = auth.uid()));

-- Sanity check (student-photos is_public = false, school-logos is_public = true).
select id, public as is_public from storage.buckets
where id in ('school-logos', 'student-photos') order by id;
