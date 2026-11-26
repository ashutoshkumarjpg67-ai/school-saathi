-- 60_push_tokens.sql — School Saathi v161 (Firebase FCM Push Notifications)
-- Stores per-device FCM registration tokens scoped to each school (Android & Web).
-- Applied live on bsjqeeeemwimzldrehpw (27 Nov 2026).

create table if not exists public.ss_push_tokens (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.ss_schools (id) on delete cascade,
  role text not null default 'school',
  recipient_id text not null default '',
  cls text not null default '',
  platform text not null default 'android',
  token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, token)
);

create index if not exists ss_push_tokens_school_idx on public.ss_push_tokens (school_id);
create index if not exists ss_push_tokens_school_cls_idx on public.ss_push_tokens (school_id, cls);

alter table public.ss_push_tokens enable row level security;

drop policy if exists ss_owner_all_ss_push_tokens on public.ss_push_tokens;
create policy ss_owner_all_ss_push_tokens on public.ss_push_tokens
  for all to authenticated
  using ((public.ss_school_owner(school_id) = (select auth.uid())) or public.is_ss_admin())
  with check ((public.ss_school_owner(school_id) = (select auth.uid())) or public.is_ss_admin());

grant select, insert, update, delete on public.ss_push_tokens to authenticated;
grant select, insert, update, delete on public.ss_push_tokens to service_role;
