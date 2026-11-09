-- School Saathi backend — 03_support_requests.sql
-- v30: reshape ss_support_requests for the school-side support flow.
-- The table itself already exists from 01_schema.sql (status default
-- 'Open', no local_id, ts instead of created_at, and a broad owner+admin
-- policy in 02_rls.sql). This file does NOT re-create it — it migrates it
-- to the shape the v30 app posts, idempotently. Safe to re-run.
-- Apply AFTER 01_schema.sql + 02_rls.sql. Parent (me) applies it via the
-- Management API; the app never runs SQL itself.

-- v30 columns the app posts (local_id links the phone's local copy).
alter table public.ss_support_requests add column if not exists local_id text;
alter table public.ss_support_requests add column if not exists created_at timestamptz not null default now();

-- school_id becomes required for v30 rows. Only applied when no NULL
-- rows exist yet (the table is empty until the first v30 post), so a
-- re-run never fails on legacy rows.
do $$
begin
  if not exists (select 1 from public.ss_support_requests where school_id is null) then
    alter table public.ss_support_requests alter column school_id set not null;
  end if;
end $$;

-- 'Pending' is the v30 insert status; the original check only allowed
-- Open / In Progress / Resolved. Widen it (do not narrow: older rows
-- keep their statuses).
alter table public.ss_support_requests drop constraint if exists ss_support_requests_status_check;
alter table public.ss_support_requests add constraint ss_support_requests_status_check
  check (status in ('Pending', 'Open', 'In Progress', 'Resolved'));
alter table public.ss_support_requests alter column status set default 'Pending';

alter table public.ss_support_requests enable row level security;

-- v30 policies: a school inserts/selects ONLY its own requests, and only
-- with status 'Pending' on insert. No anon policy: anon may do nothing
-- on this table (grants in 02_rls.sql give anon nothing here either).
-- This REPLACES ss_support_owner_all from 02_rls.sql, which also granted
-- the platform admin. Admin read returns with the Play Store admin UI;
-- until then the owner reads requests with direct SQL.
drop policy if exists ss_support_owner_all on public.ss_support_requests;
drop policy if exists ss_support_school_insert on public.ss_support_requests;
create policy ss_support_school_insert on public.ss_support_requests
  for insert to authenticated
  with check (public.ss_school_owner(school_id) = auth.uid() and status = 'Pending');
drop policy if exists ss_support_school_select on public.ss_support_requests;
create policy ss_support_school_select on public.ss_support_requests
  for select to authenticated
  using (public.ss_school_owner(school_id) = auth.uid());
