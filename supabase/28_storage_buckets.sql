-- 28_storage_buckets.sql — Phase 3: school logos / student photos move to Supabase Storage
--
-- Today (11 Nov 2026) the server holds ZERO logos and ZERO photos
-- (0 bytes in logo_data_url / photo_data_url), so there is nothing to
-- migrate. This file builds the Storage path for FUTURE uploads: two
-- public buckets, URL columns, and owner-only write policies. The old
-- Data URL columns are KEPT as fallback and are never dropped here.
--
-- Run ONLY against the School Saathi project (bsjqeeeemwimzldrehpw),
-- in the Supabase dashboard SQL editor or via the Management API.
-- Idempotent: safe to re-run (ON CONFLICT DO NOTHING / IF NOT EXISTS /
-- DROP POLICY IF EXISTS first).
--
-- Design:
-- * Buckets are PUBLIC (anyone can read a logo/photo URL); writes are
--   restricted to the school's owner. Object path is
--   <school_id>/logo.png (school-logos) and
--   <school_id>/<student_id>.jpg (student-photos). The policy checks
--   the FIRST folder segment against a school the caller owns
--   (ss_schools.owner_id = auth.uid()).
-- * The app uploads in the BACKGROUND after a save (fire-and-forget):
--   the save itself never waits (the admission/settings forms stay
--   synchronous). On success the Storage URL is recorded on the local
--   row and persisted, so the next sync cycle's hash diff sends the URL
--   (and nulls the Data URL column). If the first flush already sent
--   the Data URL, the next cycle corrects the server row. Offline / no
--   account / upload failure → Data URL path unchanged.
-- * Display prefers the URL and falls back to the Data URL.

-- 1. Buckets (public read; 1 MB cap — the app already caps logos at
-- 250 KB and photos at 120 KB before upload).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('school-logos', 'school-logos', true, 1048576, array['image/png', 'image/jpeg']),
  ('student-photos', 'student-photos', true, 1048576, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- 2. URL columns (old Data URL columns kept as fallback).
alter table public.ss_schools add column if not exists logo_url text;
alter table public.ss_students add column if not exists photo_url text;

-- 3. Owner-only write policies on storage.objects.
-- (Public read needs no policy: a public bucket serves objects to
-- anyone via its public URL.)
--
-- NOTE (11 Nov 2026, found by live test): the folder check MUST stay
-- OUTSIDE the EXISTS subquery. An earlier version wrote
--   exists (select 1 from ss_schools s where ... s.id::text = (storage.foldername(name))[1])
-- and Postgres resolved the bare `name` to ss_schools.name (the school
-- NAME, e.g. 'Test Sunrise School') instead of storage.objects.name,
-- so foldername() returned [] and EVERY upload failed with 42501 —
-- even into the caller's own folder. The IN form below keeps `name`
-- in the outer expression, where it is storage.objects.name.
drop policy if exists "school-logos owner write" on storage.objects;
create policy "school-logos owner write" on storage.objects
  for all to authenticated
  using (bucket_id = 'school-logos'
    and (storage.foldername(name))[1] in
      (select s.id::text from public.ss_schools s where s.owner_id = auth.uid()))
  with check (bucket_id = 'school-logos'
    and (storage.foldername(name))[1] in
      (select s.id::text from public.ss_schools s where s.owner_id = auth.uid()));

drop policy if exists "student-photos owner write" on storage.objects;
create policy "student-photos owner write" on storage.objects
  for all to authenticated
  using (bucket_id = 'student-photos'
    and (storage.foldername(name))[1] in
      (select s.id::text from public.ss_schools s where s.owner_id = auth.uid()))
  with check (bucket_id = 'student-photos'
    and (storage.foldername(name))[1] in
      (select s.id::text from public.ss_schools s where s.owner_id = auth.uid()));

-- 4. Sanity check (returns 2 rows): buckets exist and are public.
select id, public as is_public, file_size_limit from storage.buckets
where id in ('school-logos', 'student-photos') order by id;
