-- 42_classes.sql — classes, sections and subjects (Phase 5, Module 5 — v119).
--
-- Classes were a hardcoded 30-item list in the app (Nursery-A … 12th-B,
-- A/B only) and subjects a hardcoded 5-item list, so a school could
-- never add a section (6th-C), rename a class, or teach a new subject.
-- This file adds the server side: one row per class-section per school,
-- with the class name and its subject list. The app maps local rows
-- with sbMapClass (local_id = the class name) and pulls them with
-- mergeById, exactly like teachers since SQL 30.
--
-- Sync: owner policy (authenticated, school owner or platform admin),
-- table grant to authenticated in THIS file (SQL 30 lesson), RLS on.
-- updated_at + the ss_touch_updated_at trigger (SQL 04 pattern): the
-- v31 last-write-wins sync compares server updated_at against the
-- outbox entry's timestamp, so a class edit must refresh it.
-- unique(school_id, local_id): one row per class per school — a
-- concurrent double-add degrades to a single failed upsert, never
-- two rows for the same class.
-- No anon access: classes travel only through the school's own
-- authenticated sync. Table-only file: no function grants change.

create table if not exists public.ss_classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.ss_schools (id) on delete cascade,
  local_id text not null,
  cls text not null,
  subjects text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, local_id)
);
create index if not exists ss_classes_school_idx on public.ss_classes (school_id);
create index if not exists ss_classes_school_cls_idx on public.ss_classes (school_id, cls);

drop trigger if exists ss_touch_ss_classes on public.ss_classes;
create trigger ss_touch_ss_classes before update on public.ss_classes
  for each row execute function public.ss_touch_updated_at();

alter table public.ss_classes enable row level security;

drop policy if exists ss_owner_all_ss_classes on public.ss_classes;
create policy ss_owner_all_ss_classes on public.ss_classes
  for all to authenticated
  using (public.ss_school_owner(school_id) = auth.uid() or public.is_ss_admin())
  with check (public.ss_school_owner(school_id) = auth.uid() or public.is_ss_admin());

grant select, insert, update, delete on public.ss_classes to authenticated;
