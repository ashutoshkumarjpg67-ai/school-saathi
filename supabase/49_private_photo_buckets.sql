-- 49_private_photo_buckets.sql — flip school-logos / student-photos to PRIVATE
--
-- DO NOT RUN until ALL of these hold (see supabase/functions/photo-url/README.md):
--   1. The photo-url Edge Function is deployed (Verify JWT OFF).
--   2. The app version that calls it is live and verified for owner,
--      teacher and parent happy paths.
--   3. Negative probes pass: wrong/expired/revoked teacher token,
--      cross-school student, wrong PIN, locked parent — all refused.
--
-- After this file runs, public photo URLs stop working; only signed URLs
-- minted by photo-url (service role) read the objects.
-- Run ONLY against the School Saathi project (bsjqeeeemwimzldrehpw),
-- in the Supabase dashboard SQL editor. Idempotent.
--
-- Rollback is NOT "make the buckets public again" — that re-exposes every
-- photo. Roll back by fixing/removing the photo-url function instead.

update storage.buckets set public = false
where id in ('school-logos', 'student-photos');

-- Explicit SELECT policy for authenticated owners on their own folder keeps
-- the dashboard Storage UI usable for the signed-in owner; anonymous reads
-- stay denied (private bucket). Signed URLs bypass RLS via the service role.
drop policy if exists "school-logos owner read" on storage.objects;
create policy "school-logos owner read" on storage.objects
  for select to authenticated
  using (bucket_id = 'school-logos'
    and (storage.foldername(name))[1] in
      (select s.id::text from public.ss_schools s where s.owner_id = auth.uid()));

drop policy if exists "student-photos owner read" on storage.objects;
create policy "student-photos owner read" on storage.objects
  for select to authenticated
  using (bucket_id = 'student-photos'
    and (storage.foldername(name))[1] in
      (select s.id::text from public.ss_schools s where s.owner_id = auth.uid()));

-- Sanity check (returns 2 rows, both is_public = false).
select id, public as is_public from storage.buckets
where id in ('school-logos', 'student-photos') order by id;
