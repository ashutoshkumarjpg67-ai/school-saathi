-- 45_audit_activity_local_id.sql — v135 (audit fix): stable local ids for
-- the append-only logs.
--
-- The sync dedupe keys for ss_audit_log (ts to the second | actor |
-- action | details) and ss_activities (title | sub) can collapse two
-- DISTINCT entries that share them — the second entry was deduped away
-- and never reached the server. v135 app entries carry a stable localId
-- (minted once at log time), which the key now includes; this file adds
-- the matching nullable columns.
--
-- DEPLOY ORDER: run this BEFORE the v135 app ships. A v135 app posting
-- local_id to a project without these columns fails with PGRST204 and
-- its sync stalls; an OLD app against THIS schema is unaffected (it
-- never sends local_id).
--
-- Legacy rows keep local_id NULL. The app's key treats NULL and a
-- missing local id as the same empty suffix, so pre-change server rows
-- still dedupe against their local copies and nothing re-uploads.
-- No backfill: minting ids for old rows would CHANGE their keys and
-- re-post every one of them.
--
-- Run ONLY against the School Saathi project (bsjqeeeemwimzldrehpw).
-- Idempotent: safe to re-run.

alter table public.ss_audit_log add column if not exists local_id text;
alter table public.ss_activities add column if not exists local_id text;

comment on column public.ss_audit_log.local_id is 'App-minted stable id (v135). Part of the sync dedupe key; NULL on rows uploaded before v135.';
comment on column public.ss_activities.local_id is 'App-minted stable id (v135). Part of the sync dedupe key; NULL on rows uploaded before v135.';
