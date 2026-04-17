-- ValanceOS — Supabase schema
-- Run this in the Supabase SQL editor to create all tables used by the app.
-- Safe to run multiple times (idempotent).

create extension if not exists "pgcrypto";

-- ============ DEALS ============
create table if not exists public.deals (
  id            uuid primary key default gen_random_uuid(),
  client_name   text not null,
  deal_type     text not null,
  stage         text not null,
  nda_status    text not null,
  deck_url      text,
  notes         text,
  created_at    timestamptz not null default now()
);

-- IB-native fields (added in v2 — idempotent)
alter table public.deals add column if not exists side              text;
alter table public.deals add column if not exists sector            text;
alter table public.deals add column if not exists ticket_size_usd_m numeric;
alter table public.deals add column if not exists fee_retainer_usd  numeric;
alter table public.deals add column if not exists fee_success_pct   numeric;
alter table public.deals add column if not exists target_close      date;
alter table public.deals add column if not exists lead_owner        text;

-- Drop old v1 CHECK constraints BEFORE migrating legacy stage values, so the
-- updates are not blocked by the old vocabulary.
alter table public.deals drop constraint if exists deals_deal_type_check;
alter table public.deals drop constraint if exists deals_stage_check;
alter table public.deals drop constraint if exists deals_nda_status_check;
alter table public.deals drop constraint if exists deals_side_chk;

-- Migrate legacy stage values from v1 schema (Sourcing/Active) to v2 funnel
update public.deals set stage = 'Origination' where stage = 'Sourcing';
update public.deals set stage = 'Marketing'   where stage = 'Active';

do $$ begin
  alter table public.deals add constraint deals_deal_type_check  check (deal_type in ('M&A','ECM','PE/VC','DCM'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.deals add constraint deals_stage_check      check (stage in ('Origination','Pitch','Mandate','Preparation','Marketing','Diligence','Negotiation','Closing','Closed','On Hold','Lost'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.deals add constraint deals_nda_status_check check (nda_status in ('Signed','Pending','Not Required'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.deals add constraint deals_side_chk         check (side in ('Buy-side','Sell-side','Advisory'));
exception when duplicate_object then null; end $$;

create index if not exists deals_stage_idx    on public.deals (stage);
create index if not exists deals_type_idx     on public.deals (deal_type);
create index if not exists deals_nda_idx      on public.deals (nda_status);
create index if not exists deals_sector_idx   on public.deals (sector);
create index if not exists deals_created_idx  on public.deals (created_at desc);

-- ============ KNOWLEDGE BASE ============
create table if not exists public.documents (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  content     text not null,
  tags        text[] not null default '{}',
  sector      text,
  created_at  timestamptz not null default now()
);

create index if not exists documents_sector_idx  on public.documents (sector);
create index if not exists documents_tags_idx    on public.documents using gin (tags);
create index if not exists documents_created_idx on public.documents (created_at desc);

-- ============ MEETINGS ============
create table if not exists public.meetings (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  date            date not null,
  time            time not null,
  attendee_name   text not null,
  attendee_email  text not null,
  status          text not null default 'Proposed' check (status in ('Proposed','Confirmed','Declined','Completed')),
  created_at      timestamptz not null default now()
);

-- Optional link to a deal so meetings surface in the deal's activity feed
alter table public.meetings add column if not exists deal_id uuid references public.deals(id) on delete set null;

create index if not exists meetings_date_idx on public.meetings (date);
create index if not exists meetings_deal_idx on public.meetings (deal_id);

-- ============ TASKS ============
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  due_date    date,
  completed   boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists tasks_due_idx       on public.tasks (due_date);
create index if not exists tasks_completed_idx on public.tasks (completed);

-- ============ CONTACTS / COUNTERPARTIES ============
create table if not exists public.contacts (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid references public.deals(id) on delete cascade,
  name        text not null,
  email       text,
  phone       text,
  company     text,
  role        text,  -- Founder/CEO, Fund Partner, Legal Counsel, Co-advisor, Observer, etc.
  notes       text,
  created_at  timestamptz not null default now()
);

create index if not exists contacts_deal_idx on public.contacts (deal_id);

-- ============ ACTIVITY LOG ============
create table if not exists public.activities (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid references public.deals(id) on delete cascade,
  kind        text not null,  -- created, stage_change, note, nda_signed, teaser_sent, meeting, file_upload, email_drafted
  body        text,
  created_at  timestamptz not null default now()
);

create index if not exists activities_deal_idx    on public.activities (deal_id);
create index if not exists activities_created_idx on public.activities (created_at desc);

-- ============ DEAL FILES ============
create table if not exists public.deal_files (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid references public.deals(id) on delete cascade,
  name        text not null,
  path        text not null,   -- path inside the 'deal-files' Storage bucket
  size_bytes  bigint,
  mime_type   text,
  category    text check (category in ('Teaser','NDA','IM','Deck','LOI','Diligence','SPA','Engagement Letter','Other')),
  created_at  timestamptz not null default now()
);

create index if not exists deal_files_deal_idx on public.deal_files (deal_id);

-- ============ COMPARABLE TRANSACTIONS (COMPS) ============
create table if not exists public.comps (
  id                  uuid primary key default gen_random_uuid(),
  target              text not null,
  acquirer            text,
  year                int,
  sector              text,
  deal_type           text,
  ev_usd_m            numeric,
  revenue_multiple    numeric,
  ebitda_multiple     numeric,
  notes               text,
  created_at          timestamptz not null default now()
);

create index if not exists comps_sector_idx on public.comps (sector);
create index if not exists comps_year_idx   on public.comps (year desc);

-- ============ RLS (internal tool — permissive anon policies) ============
alter table public.deals       enable row level security;
alter table public.documents   enable row level security;
alter table public.meetings    enable row level security;
alter table public.tasks       enable row level security;
alter table public.contacts    enable row level security;
alter table public.activities  enable row level security;
alter table public.deal_files  enable row level security;
alter table public.comps       enable row level security;

do $$ begin create policy "deals_all"      on public.deals      for all using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "documents_all"  on public.documents  for all using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "meetings_all"   on public.meetings   for all using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "tasks_all"      on public.tasks      for all using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "contacts_all"   on public.contacts   for all using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "activities_all" on public.activities for all using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "deal_files_all" on public.deal_files for all using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "comps_all"      on public.comps      for all using (true) with check (true); exception when duplicate_object then null; end $$;

-- ============ STORAGE ============
-- After running this SQL, create a public bucket called "deal-files" in
-- Supabase Studio → Storage → New bucket. A public bucket is sufficient on
-- its own; the policies below are best-effort (they require elevated
-- permissions on storage.objects that the anon SQL editor user may not have).

do $$ begin
  create policy "deal_files_read"    on storage.objects for select using (bucket_id = 'deal-files');
exception when others then null; end $$;

do $$ begin
  create policy "deal_files_insert"  on storage.objects for insert with check (bucket_id = 'deal-files');
exception when others then null; end $$;

do $$ begin
  create policy "deal_files_delete"  on storage.objects for delete using (bucket_id = 'deal-files');
exception when others then null; end $$;
