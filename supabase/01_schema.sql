-- School Saathi backend — 01_schema.sql
-- Target Academy project (atdynurhryjqawvqhvan). ALL School Saathi tables
-- use the ss_ prefix: the project already has unprefixed tables named
-- attendance, fee_records, audit_logs etc. — never touch those.
-- Idempotent: safe to re-run (CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE).
-- Money is numeric(12,2). IDs are uuid. Local app ids (stu1, fee1, ar...)
-- are kept in local_id columns for the migration mapping only.

-- ---------- platform admins (lookup table, drives Super Admin access) ----------
create table if not exists public.ss_platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users (id) on delete set null,
  note text
);
comment on table public.ss_platform_admins is 'Supabase Auth user ids that act as School Saathi Super Admin. Never hard-code an email in a policy; add/remove rows here.';

-- ---------- schools (one row per school account) ----------
create table if not exists public.ss_schools (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  city text not null default '',
  principal text not null default '',
  phone text not null default '',
  email text not null default '',
  session text not null default '2025–26',
  address text not null default '',
  logo_data_url text, -- compressed data URL for now; Supabase Storage later
  plan text not null default 'Active' check (plan in ('Active', 'Expired', 'Trial')),
  status text not null default 'active' check (status in ('active', 'pending')),
  is_demo boolean not null default false, -- demo directory entries (the 24 seed schools); real schools are false
  adm_counter integer not null default 1,
  receipt_counter integer not null default 1,
  admission_fee numeric(12,2) not null default 0,
  caution_money numeric(12,2) not null default 0,
  annual_charges numeric(12,2) not null default 0,
  transport_fee numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ss_schools_owner_idx on public.ss_schools (owner_id);
comment on table public.ss_schools is 'One row per school account. feeExtras live here as 4 columns (was db.feeExtras). adm/receipt counters live here (was db.admCounter / db.receiptCounter).';

-- ---------- students ----------
create table if not exists public.ss_students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.ss_schools (id) on delete cascade,
  local_id text, -- app id (stu1...) for migration mapping
  name text not null,
  cls text not null, -- e.g. 10th-A
  roll integer not null default 0,
  enr text,
  guardian text not null default '',
  phone text not null default '',
  mobile2 text not null default '',
  parent_email text not null default '',
  father_name text not null default '',
  mother_name text not null default '',
  occupation text not null default '',
  dob date,
  gender text not null default '' check (gender in ('', 'Boy', 'Girl')),
  blood_group text not null default '',
  category text not null default '',
  address text not null default '',
  state text not null default '',
  district text not null default '',
  pin text not null default '',
  previous_school text not null default '',
  previous_class text not null default '',
  admission_no text,
  admission_date date,
  session text not null default '',
  status text not null default 'Active' check (status in ('Active', 'Inactive', 'Draft', 'Cancelled')),
  result numeric(5,2), -- stored exam-result % (seed field); attendance % is NOT stored, it is computed live
  parent_pin text, -- 4-6 digits; default = last 4 of parent mobile
  photo_data_url text, -- compressed data URL (~120KB); Supabase Storage later
  documents jsonb not null default '{"birthCert": false, "tc": false, "tcNumber": "", "other": ""}'::jsonb,
  aadhaar text, -- PII: optional, never returned in full anywhere; excluded from the parent RPC
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, admission_no),
  unique (school_id, enr)
);
create index if not exists ss_students_school_idx on public.ss_students (school_id);
create index if not exists ss_students_cls_idx on public.ss_students (school_id, cls);
comment on column public.ss_students.aadhaar is 'PII. Optional. Never shown in full, never in export/print/ID card/receipt. Excluded from ss_parent_lookup return.';

-- ---------- fee structure (one row per class + fee type) ----------
create table if not exists public.ss_fee_structure (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.ss_schools (id) on delete cascade,
  cls text not null,
  fee_type text not null,
  amount numeric(12,2) not null default 0,
  unique (school_id, cls, fee_type)
);
create index if not exists ss_fee_structure_school_idx on public.ss_fee_structure (school_id);

-- ---------- fee records ----------
create table if not exists public.ss_fee_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.ss_schools (id) on delete cascade,
  student_id uuid references public.ss_students (id) on delete set null,
  local_id text, -- app id (fee1...) for migration mapping
  student_name text not null, -- denormalised like the app (snapshot at record time)
  cls text not null,
  month text not null, -- Apr..Mar
  fee_type text not null default 'Tuition',
  amount numeric(12,2) not null,
  status text not null default 'Pending' check (status in ('Pending', 'Collected')),
  record_date date,
  created_at timestamptz not null default now()
);
create index if not exists ss_fee_records_school_idx on public.ss_fee_records (school_id);
create index if not exists ss_fee_records_student_idx on public.ss_fee_records (student_id);

-- ---------- attendance (one row per school + date + class + student) ----------
create table if not exists public.ss_attendance (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.ss_schools (id) on delete cascade,
  att_date date not null,
  cls text not null,
  student_id uuid not null references public.ss_students (id) on delete cascade,
  status text not null check (status in ('Present', 'Absent', 'Late')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, att_date, cls, student_id)
);
create index if not exists ss_attendance_school_date_idx on public.ss_attendance (school_id, att_date, cls);

-- ---------- receipts ----------
create table if not exists public.ss_receipts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.ss_schools (id) on delete cascade,
  student_id uuid references public.ss_students (id) on delete set null,
  receipt_no text not null, -- RCP-YYYY-NNN, unique per school
  admission_no text not null default '',
  student_name text not null,
  cls text not null,
  session text not null default '',
  receipt_date date not null,
  month text not null,
  counter_no integer not null default 0,
  lines jsonb not null default '[]'::jsonb, -- [{desc, type, month, due, con, paid}]
  pay_mode text not null default 'Cash',
  pay_date date,
  bank text not null default '',
  number text not null default '',
  total numeric(12,2) not null,
  total_words text not null default '',
  collector text not null default '',
  created_at timestamptz not null default now(),
  unique (school_id, receipt_no)
);
create index if not exists ss_receipts_school_idx on public.ss_receipts (school_id);
create index if not exists ss_receipts_student_idx on public.ss_receipts (student_id);

-- ---------- audit log (app caps at 200 per school; enforced in app code) ----------
create table if not exists public.ss_audit_log (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.ss_schools (id) on delete cascade,
  ts timestamptz not null default now(),
  actor text not null default 'system',
  action text not null,
  details text not null default ''
);
create index if not exists ss_audit_log_school_ts_idx on public.ss_audit_log (school_id, ts desc);

-- ---------- activities (dashboard "Recent Activities", app caps at 6) ----------
create table if not exists public.ss_activities (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.ss_schools (id) on delete cascade,
  icon text not null default '',
  bg text not null default '',
  title text not null,
  sub text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists ss_activities_school_idx on public.ss_activities (school_id, created_at desc);

-- ---------- admission requests (public Apply form) ----------
create table if not exists public.ss_admission_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.ss_schools (id) on delete cascade,
  local_id text, -- app id (ar...) for migration mapping
  name text not null,
  dob date,
  gender text not null default '',
  class_apply text not null,
  guardian_name text not null default '',
  phone text not null,
  previous_school text not null default '',
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected')),
  reason text not null default '',
  submitted date not null default current_date,
  student_id uuid references public.ss_students (id) on delete set null, -- set on approve
  created_at timestamptz not null default now()
);
create index if not exists ss_admission_requests_school_idx on public.ss_admission_requests (school_id, status);

-- ---------- support requests (platform-wide, not per-school DB) ----------
create table if not exists public.ss_support_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.ss_schools (id) on delete set null, -- submitting school, if known
  ts timestamptz not null default now(),
  name text not null,
  message text not null,
  status text not null default 'Open' check (status in ('Open', 'In Progress', 'Resolved')),
  submitted_by uuid references auth.users (id) on delete set null,
  submitted_by_name text not null default ''
);
create index if not exists ss_support_requests_school_idx on public.ss_support_requests (school_id, ts desc);

-- ---------- platform settings (single row, id = 1) ----------
create table if not exists public.ss_platform_settings (
  id smallint primary key default 1 check (id = 1),
  name text not null default 'School Saathi',
  tagline text not null default 'Smart Education. Better Tomorrow.',
  session text not null default '2025–26',
  support_email text not null default 'support@school-saathi.in',
  updated_at timestamptz not null default now()
);
insert into public.ss_platform_settings (id) values (1)
  on conflict (id) do nothing;

-- ---------- teachers ----------
create table if not exists public.ss_teachers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.ss_schools (id) on delete cascade,
  local_id text,
  name text not null,
  subject text not null default '',
  cls text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists ss_teachers_school_idx on public.ss_teachers (school_id);

-- ---------- exams ----------
create table if not exists public.ss_exams (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.ss_schools (id) on delete cascade,
  local_id text,
  name text not null,
  cls text not null,
  subject text not null default '',
  exam_date date,
  total numeric(5,2) not null default 100,
  created_at timestamptz not null default now()
);
create index if not exists ss_exams_school_idx on public.ss_exams (school_id);

-- ---------- marks ----------
create table if not exists public.ss_marks (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.ss_schools (id) on delete cascade,
  exam_id uuid not null references public.ss_exams (id) on delete cascade,
  student_id uuid not null references public.ss_students (id) on delete cascade,
  marks numeric(5,2) not null,
  unique (school_id, exam_id, student_id)
);
create index if not exists ss_marks_exam_idx on public.ss_marks (exam_id);

-- ---------- homework ----------
create table if not exists public.ss_homework (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.ss_schools (id) on delete cascade,
  local_id text,
  cls text not null,
  subject text not null default '',
  title text not null,
  due date,
  done_by uuid[] not null default '{}', -- student ids (no FK: array column)
  created_at timestamptz not null default now()
);
create index if not exists ss_homework_school_idx on public.ss_homework (school_id);

-- ---------- notices ----------
create table if not exists public.ss_notices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.ss_schools (id) on delete cascade,
  local_id text,
  title text not null,
  notice_date date,
  body text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists ss_notices_school_idx on public.ss_notices (school_id);

-- ---------- helpers ----------
-- Is the caller a platform admin? SECURITY DEFINER so RLS on
-- ss_platform_admins does not block the check itself.
create or replace function public.is_ss_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.ss_platform_admins where user_id = auth.uid());
$$;

-- Owner of a school (null when the school does not exist).
create or replace function public.ss_school_owner(p_school_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select owner_id from public.ss_schools where id = p_school_id;
$$;

-- Is this a real (non-demo) school? SECURITY DEFINER so the anon Apply-form
-- policy can check it without anon needing SELECT on ss_schools (anon must
-- never be able to read the schools table directly).
create or replace function public.ss_is_real_school(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.ss_schools where id = p_school_id and is_demo = false);
$$;

-- Next admission number for a school, transactionally (locks the school row).
-- Returns e.g. ADM-2025-042. Uses the school's session year.
create or replace function public.ss_next_adm_no(p_school_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year text;
  v_n integer;
begin
  -- Caller must own the school (or be platform admin); otherwise anyone
  -- with the function grant could burn another school's counters.
  if public.ss_school_owner(p_school_id) is distinct from auth.uid()
     and not public.is_ss_admin() then
    raise exception 'not your school';
  end if;
  select coalesce(substring(session from '[0-9]{4}'), '2025') into v_year
    from public.ss_schools where id = p_school_id for update;
  if v_year is null then raise exception 'school not found'; end if;
  update public.ss_schools set adm_counter = adm_counter + 1, updated_at = now()
    where id = p_school_id returning adm_counter - 1 into v_n;
  return 'ADM-' || v_year || '-' || lpad(v_n::text, 3, '0');
end;
$$;

-- Next receipt number for a school, transactionally. Returns e.g. RCP-2026-002.
create or replace function public.ss_next_receipt_no(p_school_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  -- Caller must own the school (or be platform admin); otherwise anyone
  -- with the function grant could burn another school's counters.
  if public.ss_school_owner(p_school_id) is distinct from auth.uid()
     and not public.is_ss_admin() then
    raise exception 'not your school';
  end if;
  update public.ss_schools set receipt_counter = receipt_counter + 1, updated_at = now()
    where id = p_school_id returning receipt_counter - 1 into v_n;
  if v_n is null then raise exception 'school not found'; end if;
  return 'RCP-' || extract(year from now())::text || '-' || lpad(v_n::text, 3, '0');
end;
$$;

-- Public school list for the Apply-for-Admission form: id + name + city only,
-- real (non-demo) schools. SECURITY DEFINER so anon can call it without
-- reading ss_schools directly.
create or replace function public.ss_list_public_schools()
returns table (id uuid, name text, city text)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.name, s.city from public.ss_schools s
  where s.is_demo = false order by s.name;
$$;

-- Parent portal lookup: admission number + PIN. Returns the ONE matching
-- student (without aadhaar) or nothing. PIN-gated, no password account needed.
-- Rate limiting / brute-force protection belongs in the app / edge layer;
-- this function alone must never be used to enumerate students (it returns a
-- row only on an exact admission_no + parent_pin match).
create or replace function public.ss_parent_lookup(p_admission_no text, p_pin text)
returns table (
  id uuid, school_id uuid, name text, cls text, roll integer, enr text,
  guardian text, phone text, father_name text, mother_name text,
  dob date, gender text, admission_no text, admission_date date,
  session text, status text, result numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.school_id, s.name, s.cls, s.roll, s.enr,
         s.guardian, s.phone, s.father_name, s.mother_name,
         s.dob, s.gender, s.admission_no, s.admission_date,
         s.session, s.status, s.result
  from public.ss_students s
  where lower(trim(s.admission_no)) = lower(trim(p_admission_no))
    and s.parent_pin = p_pin;
$$;
