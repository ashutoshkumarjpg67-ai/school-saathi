-- School Saathi backend — 04_server_first.sql
-- v31: server-first data plane ("Target app ki tarah").
-- The v31 sync resolves conflicts last-write-wins by updated_at, so every
-- content table the sync touches must carry updated_at, kept fresh by a
-- trigger on every UPDATE. Nine tables lacked the column; three already
-- had it (ss_schools, ss_students, ss_attendance).
-- Idempotent: safe to re-run (ADD COLUMN IF NOT EXISTS, DROP TRIGGER IF
-- EXISTS before CREATE TRIGGER). Apply AFTER 01_schema.sql + 02_rls.sql
-- + 03_support_requests.sql. Parent (me) applies it via the Management
-- API; the app never runs SQL itself.
--
-- NO policy changes are needed here: 02_rls.sql already gives every
-- synced table a FOR ALL authenticated policy for the owning school
-- (ss_owner_all_<table> via ss_school_owner(school_id) = auth.uid())
-- plus select/insert/update/delete grants to authenticated, and
-- 03_support_requests.sql covers ss_support_requests. The sync uses
-- only those existing policies — no anon access is added anywhere.

-- ---------- updated_at columns (only where missing) ----------
alter table public.ss_fee_structure add column if not exists updated_at timestamptz not null default now();
alter table public.ss_fee_records add column if not exists updated_at timestamptz not null default now();
alter table public.ss_receipts add column if not exists updated_at timestamptz not null default now();
alter table public.ss_admission_requests add column if not exists updated_at timestamptz not null default now();
alter table public.ss_teachers add column if not exists updated_at timestamptz not null default now();
alter table public.ss_exams add column if not exists updated_at timestamptz not null default now();
alter table public.ss_marks add column if not exists updated_at timestamptz not null default now();
alter table public.ss_homework add column if not exists updated_at timestamptz not null default now();
alter table public.ss_notices add column if not exists updated_at timestamptz not null default now();

-- ---------- touch trigger: keep updated_at fresh on every UPDATE ----------
-- Runs as the invoking user and touches only NEW (no table access), so it
-- never trips RLS. The sync reads updated_at to decide last-write-wins;
-- without the trigger a PATCH that changes a row would keep a stale
-- timestamp and lose the next conflict it should win.
create or replace function public.ss_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'ss_schools','ss_students','ss_fee_structure','ss_fee_records',
    'ss_attendance','ss_receipts','ss_admission_requests','ss_teachers',
    'ss_exams','ss_marks','ss_homework','ss_notices'
  ] loop
    execute format('drop trigger if exists ss_touch_%I on public.%I', t, t);
    execute format('create trigger ss_touch_%I before update on public.%I for each row execute function public.ss_touch_updated_at()', t, t);
  end loop;
end $$;
