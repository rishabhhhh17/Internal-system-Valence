-- ValanceOS — Supabase schema
-- Run this in the Supabase SQL editor to create all tables used by the app.
-- Safe to run multiple times (idempotent).

create extension if not exists "pgcrypto";
create extension if not exists "vector";

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
-- v3: financial snapshot + optional AI-generated CIM draft
alter table public.deals add column if not exists financials jsonb;
alter table public.deals add column if not exists cim_draft  text;
-- v4: watchlist flag (prospects we're tracking, not yet engaged)
alter table public.deals add column if not exists is_watchlist boolean not null default false;

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

-- ============ STAGE-GATE CHECKLIST ============
-- One row per (deal, stage, item_key). The app reads a canonical template from
-- src/lib/checklists.js and persists only the user-toggled state here.
create table if not exists public.deal_checklist (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references public.deals(id) on delete cascade,
  stage       text not null,
  item_key    text not null,
  done        boolean not null default false,
  done_by     text,
  done_at     timestamptz,
  created_at  timestamptz not null default now(),
  unique (deal_id, stage, item_key)
);

create index if not exists deal_checklist_deal_idx  on public.deal_checklist (deal_id);
create index if not exists deal_checklist_stage_idx on public.deal_checklist (deal_id, stage);

-- ============ DEAL TEAM (internal coverage + economics split) ============
create table if not exists public.deal_team (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references public.deals(id) on delete cascade,
  member_name text not null,
  member_email text,
  role        text,      -- Lead, Execution, Analyst, Sponsor, Advisor, etc.
  share_pct   numeric,   -- internal economics split, 0-100
  created_at  timestamptz not null default now()
);

create index if not exists deal_team_deal_idx on public.deal_team (deal_id);

-- ============ DEAL COMMENTS (internal threaded discussion) ============
create table if not exists public.deal_comments (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references public.deals(id) on delete cascade,
  author      text,                       -- free-form (email or name)
  body        text not null,
  mentions    text[] not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists deal_comments_deal_idx    on public.deal_comments (deal_id);
create index if not exists deal_comments_created_idx on public.deal_comments (created_at desc);

alter table public.deal_checklist enable row level security;
alter table public.deal_team      enable row level security;
alter table public.deal_comments  enable row level security;

-- Drop legacy permissive policies
drop policy if exists "deal_checklist_all" on public.deal_checklist;
drop policy if exists "deal_team_all"      on public.deal_team;
drop policy if exists "deal_comments_all"  on public.deal_comments;

do $$ begin create policy "deal_checklist_auth" on public.deal_checklist for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "deal_team_auth"      on public.deal_team      for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "deal_comments_auth"  on public.deal_comments  for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;

-- ============ EXTERNAL DATA ROOM SHARES ============
-- Each row is a shareable link to a specific deal's data room, scoped to
-- a subset of that deal's files, protected by a random share_code, with an
-- optional expiry and an access log (opens + downloads).
create table if not exists public.deal_shares (
  id            uuid primary key default gen_random_uuid(),
  deal_id       uuid not null references public.deals(id) on delete cascade,
  share_code    text not null unique,
  title         text,
  recipient_name  text,
  recipient_email text,
  file_ids      uuid[] not null default '{}',   -- deal_files.id to expose; empty = all
  note          text,                           -- welcome message shown on the share page
  expires_at    timestamptz,
  revoked       boolean not null default false,
  created_by    text,
  created_at    timestamptz not null default now()
);

create index if not exists deal_shares_deal_idx on public.deal_shares (deal_id);
create index if not exists deal_shares_code_idx on public.deal_shares (share_code);

-- Access log for shares (view + download events)
create table if not exists public.deal_share_access (
  id          uuid primary key default gen_random_uuid(),
  share_id    uuid not null references public.deal_shares(id) on delete cascade,
  event       text not null,                    -- 'view' | 'download'
  file_id     uuid references public.deal_files(id) on delete set null,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists deal_share_access_share_idx on public.deal_share_access (share_id);

alter table public.deal_shares enable row level security;
alter table public.deal_share_access enable row level security;

-- Drop legacy permissive policies
drop policy if exists "deal_shares_all"       on public.deal_shares;
drop policy if exists "deal_share_access_all" on public.deal_share_access;

-- Authenticated users: full access
do $$ begin create policy "deal_shares_auth_all"       on public.deal_shares       for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "deal_share_access_auth_all" on public.deal_share_access for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;

-- Public exception: anon can SELECT active shares (must know the share_code)
do $$ begin create policy "deal_shares_public_read"
  on public.deal_shares for select to anon
  using (revoked = false and (expires_at is null or expires_at > now()));
exception when duplicate_object then null; end $$;

-- Public exception: anon can SELECT files that are listed on an active share
do $$ begin create policy "deal_files_public_read"
  on public.deal_files for select to anon
  using (
    exists (
      select 1 from public.deal_shares s
      where s.deal_id = deal_files.deal_id
        and s.revoked = false
        and (s.expires_at is null or s.expires_at > now())
        and (coalesce(array_length(s.file_ids, 1), 0) = 0 or deal_files.id = any(s.file_ids))
    )
  );
exception when duplicate_object then null; end $$;

-- Public exception: anon can INSERT view/download events on an active share
do $$ begin create policy "deal_share_access_public_insert"
  on public.deal_share_access for insert to anon
  with check (
    exists (
      select 1 from public.deal_shares s
      where s.id = deal_share_access.share_id
        and s.revoked = false
        and (s.expires_at is null or s.expires_at > now())
    )
  );
exception when duplicate_object then null; end $$;

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

-- ============ RLS (locked to authenticated users) ============
-- The permissive `*_all using(true)` policies have been retired. Internal
-- tables require `authenticated` role (any signed-in user). Public share
-- exceptions live in hardening.sql and below in the deal_shares section.
alter table public.deals       enable row level security;
alter table public.documents   enable row level security;
alter table public.meetings    enable row level security;
alter table public.tasks       enable row level security;
alter table public.contacts    enable row level security;
alter table public.activities  enable row level security;
alter table public.deal_files  enable row level security;
alter table public.comps       enable row level security;

-- Drop legacy permissive policies if they exist from older schema runs
drop policy if exists "deals_all"      on public.deals;
drop policy if exists "documents_all"  on public.documents;
drop policy if exists "meetings_all"   on public.meetings;
drop policy if exists "tasks_all"      on public.tasks;
drop policy if exists "contacts_all"   on public.contacts;
drop policy if exists "activities_all" on public.activities;
drop policy if exists "deal_files_all" on public.deal_files;
drop policy if exists "comps_all"      on public.comps;

do $$ begin create policy "deals_auth"      on public.deals      for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "documents_auth"  on public.documents  for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "meetings_auth"   on public.meetings   for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "tasks_auth"      on public.tasks      for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "contacts_auth"   on public.contacts   for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "activities_auth" on public.activities for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "deal_files_auth" on public.deal_files for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "comps_auth"      on public.comps      for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;

-- ============ KNOWLEDGE FILES (uploaded by anyone, firm-wide) ============
create table if not exists public.knowledge_files (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  path         text not null,           -- path inside 'knowledge-files' bucket
  mime_type    text,
  size_bytes   bigint,
  tags         text[] not null default '{}',
  sector       text,
  uploaded_by  text,                    -- free-form, usually email
  summary      text,
  char_count   int,
  created_at   timestamptz not null default now()
);

create index if not exists knowledge_files_sector_idx on public.knowledge_files (sector);
create index if not exists knowledge_files_tags_idx   on public.knowledge_files using gin (tags);

alter table public.knowledge_files enable row level security;
drop policy if exists "knowledge_files_all" on public.knowledge_files;
do $$ begin create policy "knowledge_files_auth" on public.knowledge_files for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;

-- ============ KNOWLEDGE CHUNKS (unified search index — vector + full-text) ============
-- Every searchable item in the app lands here as one or more chunks.
-- source_type = 'document' | 'file' | 'comp' | 'deal' | 'deal_file'
create table if not exists public.knowledge_chunks (
  id           uuid primary key default gen_random_uuid(),
  source_type  text not null check (source_type in ('document','file','comp','deal','deal_file')),
  source_id    uuid not null,
  title        text,
  content      text not null,
  chunk_index  int  not null default 0,
  tsv          tsvector,
  embedding    vector(768),
  metadata     jsonb default '{}',
  created_at   timestamptz not null default now()
);

create index if not exists knowledge_chunks_source_idx on public.knowledge_chunks (source_type, source_id);
create index if not exists knowledge_chunks_tsv_idx    on public.knowledge_chunks using gin (tsv);
create index if not exists knowledge_chunks_emb_idx    on public.knowledge_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 50);

-- Auto-maintain tsvector on insert/update
create or replace function public.knowledge_chunks_tsv_trigger() returns trigger as $$
begin
  new.tsv := setweight(to_tsvector('english', coalesce(new.title,  '')), 'A')
          || setweight(to_tsvector('english', coalesce(new.content,'')), 'B');
  return new;
end $$ language plpgsql;

drop trigger if exists knowledge_chunks_tsv on public.knowledge_chunks;
create trigger knowledge_chunks_tsv before insert or update on public.knowledge_chunks
  for each row execute function public.knowledge_chunks_tsv_trigger();

alter table public.knowledge_chunks enable row level security;
drop policy if exists "knowledge_chunks_all" on public.knowledge_chunks;
do $$ begin create policy "knowledge_chunks_auth" on public.knowledge_chunks for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;

-- ============ AUTO-INDEX TRIGGERS ============
-- Documents → knowledge_chunks
create or replace function public.index_document() returns trigger as $$
begin
  delete from public.knowledge_chunks where source_type = 'document' and source_id = new.id;
  insert into public.knowledge_chunks (source_type, source_id, title, content, chunk_index, metadata)
  values ('document', new.id, new.title, new.content, 0,
          jsonb_build_object('sector', new.sector, 'tags', new.tags));
  return new;
end $$ language plpgsql;

drop trigger if exists index_document_trg on public.documents;
create trigger index_document_trg after insert or update on public.documents
  for each row execute function public.index_document();

-- Comps → knowledge_chunks
create or replace function public.index_comp() returns trigger as $$
begin
  delete from public.knowledge_chunks where source_type = 'comp' and source_id = new.id;
  insert into public.knowledge_chunks (source_type, source_id, title, content, chunk_index, metadata)
  values ('comp', new.id,
          new.target || coalesce(' / ' || new.acquirer, ''),
          concat_ws(' · ',
            'Target: ' || new.target,
            'Acquirer: ' || coalesce(new.acquirer, 'n/a'),
            'Year: '    || coalesce(new.year::text, 'n/a'),
            'Sector: '  || coalesce(new.sector, 'n/a'),
            'Type: '    || coalesce(new.deal_type, 'n/a'),
            'EV (USDm): ' || coalesce(new.ev_usd_m::text, 'n/a'),
            'Rev mult: ' || coalesce(new.revenue_multiple::text, 'n/a'),
            'EBITDA mult: ' || coalesce(new.ebitda_multiple::text, 'n/a'),
            new.notes),
          0,
          jsonb_build_object('sector', new.sector, 'year', new.year, 'deal_type', new.deal_type));
  return new;
end $$ language plpgsql;

drop trigger if exists index_comp_trg on public.comps;
create trigger index_comp_trg after insert or update on public.comps
  for each row execute function public.index_comp();

-- Deals → knowledge_chunks (searchable by client name, sector, notes)
create or replace function public.index_deal() returns trigger as $$
begin
  delete from public.knowledge_chunks where source_type = 'deal' and source_id = new.id;
  insert into public.knowledge_chunks (source_type, source_id, title, content, chunk_index, metadata)
  values ('deal', new.id, new.client_name,
          concat_ws(' · ',
            new.client_name,
            new.deal_type, new.side, new.stage, new.nda_status,
            'Sector: ' || coalesce(new.sector, 'n/a'),
            'Lead: '   || coalesce(new.lead_owner, 'n/a'),
            new.notes),
          0,
          jsonb_build_object('stage', new.stage, 'sector', new.sector, 'side', new.side));
  return new;
end $$ language plpgsql;

drop trigger if exists index_deal_trg on public.deals;
create trigger index_deal_trg after insert or update on public.deals
  for each row execute function public.index_deal();

-- Deal files → knowledge_chunks (metadata only; full text added client-side)
create or replace function public.index_deal_file() returns trigger as $$
declare deal_name text;
begin
  select client_name into deal_name from public.deals where id = new.deal_id;
  delete from public.knowledge_chunks where source_type = 'deal_file' and source_id = new.id;
  insert into public.knowledge_chunks (source_type, source_id, title, content, chunk_index, metadata)
  values ('deal_file', new.id, new.name,
          concat_ws(' · ', new.name, 'Category: ' || coalesce(new.category,'Other'), 'Deal: ' || coalesce(deal_name,'n/a')),
          0,
          jsonb_build_object('deal_id', new.deal_id, 'category', new.category));
  return new;
end $$ language plpgsql;

drop trigger if exists index_deal_file_trg on public.deal_files;
create trigger index_deal_file_trg after insert or update on public.deal_files
  for each row execute function public.index_deal_file();

-- ============ DELETE-CASCADE for knowledge_chunks ============
-- When a source row is deleted, purge its chunks. The insert/update triggers
-- above only handle upsert; deletes otherwise leave orphan chunks.
create or replace function public.unindex_source() returns trigger as $$
declare st text;
begin
  st := case TG_TABLE_NAME
    when 'documents'  then 'document'
    when 'comps'      then 'comp'
    when 'deals'      then 'deal'
    when 'deal_files' then 'deal_file'
  end;
  delete from public.knowledge_chunks where source_type = st and source_id = old.id;
  return old;
end $$ language plpgsql;

drop trigger if exists unindex_document_trg  on public.documents;
drop trigger if exists unindex_comp_trg      on public.comps;
drop trigger if exists unindex_deal_trg      on public.deals;
drop trigger if exists unindex_deal_file_trg on public.deal_files;

create trigger unindex_document_trg  after delete on public.documents  for each row execute function public.unindex_source();
create trigger unindex_comp_trg      after delete on public.comps      for each row execute function public.unindex_source();
create trigger unindex_deal_trg      after delete on public.deals      for each row execute function public.unindex_source();
create trigger unindex_deal_file_trg after delete on public.deal_files for each row execute function public.unindex_source();

-- ============ BACKFILL existing rows into knowledge_chunks ============
insert into public.knowledge_chunks (source_type, source_id, title, content, chunk_index, metadata)
select 'document', d.id, d.title, d.content, 0, jsonb_build_object('sector', d.sector, 'tags', d.tags)
from public.documents d
where not exists (select 1 from public.knowledge_chunks k where k.source_type = 'document' and k.source_id = d.id);

insert into public.knowledge_chunks (source_type, source_id, title, content, chunk_index, metadata)
select 'comp', c.id,
       c.target || coalesce(' / ' || c.acquirer, ''),
       concat_ws(' · ',
         'Target: '|| c.target,
         'Acquirer: ' || coalesce(c.acquirer,'n/a'),
         'Year: ' || coalesce(c.year::text,'n/a'),
         'Sector: '|| coalesce(c.sector,'n/a'),
         'Type: ' || coalesce(c.deal_type,'n/a'),
         'EV (USDm): ' || coalesce(c.ev_usd_m::text,'n/a'),
         'Rev mult: ' || coalesce(c.revenue_multiple::text,'n/a'),
         'EBITDA mult: ' || coalesce(c.ebitda_multiple::text,'n/a'),
         c.notes),
       0,
       jsonb_build_object('sector', c.sector, 'year', c.year, 'deal_type', c.deal_type)
from public.comps c
where not exists (select 1 from public.knowledge_chunks k where k.source_type = 'comp' and k.source_id = c.id);

insert into public.knowledge_chunks (source_type, source_id, title, content, chunk_index, metadata)
select 'deal', d.id, d.client_name,
       concat_ws(' · ', d.client_name, d.deal_type, d.side, d.stage, d.nda_status,
         'Sector: ' || coalesce(d.sector,'n/a'),
         'Lead: '   || coalesce(d.lead_owner,'n/a'),
         d.notes),
       0,
       jsonb_build_object('stage', d.stage, 'sector', d.sector, 'side', d.side)
from public.deals d
where not exists (select 1 from public.knowledge_chunks k where k.source_type = 'deal' and k.source_id = d.id);

-- ============ SEARCH RPC ============
-- Hybrid search. Full-text always, vector when an embedding is supplied.
-- ts_headline produces highlighted snippets.
create or replace function public.search_knowledge(
  query_text      text,
  query_embedding vector(768) default null,
  match_count     int default 24,
  source_filter   text[] default null
) returns table (
  id          uuid,
  source_type text,
  source_id   uuid,
  title       text,
  snippet     text,
  chunk_index int,
  metadata    jsonb,
  score       real
) as $$
  with q as (
    select
      nullif(trim(query_text), '') as qt,
      case when nullif(trim(query_text), '') is not null
           then plainto_tsquery('english', query_text) end as tsq
  )
  select
    c.id,
    c.source_type,
    c.source_id,
    c.title,
    case when q.tsq is not null
         then ts_headline('english', c.content, q.tsq,
              'MaxWords=28, MinWords=14, MaxFragments=2, StartSel=<<, StopSel=>>')
         else left(c.content, 240)
    end as snippet,
    c.chunk_index,
    c.metadata,
    case
      when query_embedding is not null and q.tsq is not null
        then (0.55 * coalesce(ts_rank(c.tsv, q.tsq), 0))::real
           + (0.45 * (1 - (c.embedding <=> query_embedding))::real)
      when query_embedding is not null
        then (1 - (c.embedding <=> query_embedding))::real
      when q.tsq is not null
        then coalesce(ts_rank(c.tsv, q.tsq), 0)::real
      else 0::real
    end as score
  from public.knowledge_chunks c, q
  where
    (source_filter is null or c.source_type = any(source_filter))
    and (
      q.tsq is null
      or c.tsv @@ q.tsq
      or (query_embedding is not null and (c.embedding <=> query_embedding) < 0.55)
    )
  order by score desc
  limit match_count;
$$ language sql stable;

grant execute on function public.search_knowledge(text, vector, int, text[]) to anon, authenticated;

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

-- Also create a public 'knowledge-files' bucket in Supabase Studio.
do $$ begin
  create policy "knowledge_files_read"   on storage.objects for select using (bucket_id = 'knowledge-files');
exception when others then null; end $$;

do $$ begin
  create policy "knowledge_files_insert" on storage.objects for insert with check (bucket_id = 'knowledge-files');
exception when others then null; end $$;

do $$ begin
  create policy "knowledge_files_delete" on storage.objects for delete using (bucket_id = 'knowledge-files');
exception when others then null; end $$;

-- ============ AUDIT COLUMNS (created_by / updated_by) ============
-- Populated automatically: created_by defaults to auth.uid() on insert;
-- updated_by is stamped by the set_audit_update trigger on each update.
alter table public.deals           add column if not exists created_by uuid default auth.uid();
alter table public.deals           add column if not exists updated_by uuid;
alter table public.deals           add column if not exists updated_at timestamptz not null default now();
alter table public.documents       add column if not exists created_by uuid default auth.uid();
alter table public.documents       add column if not exists updated_by uuid;
alter table public.documents       add column if not exists updated_at timestamptz not null default now();
alter table public.meetings        add column if not exists created_by uuid default auth.uid();
alter table public.meetings        add column if not exists updated_by uuid;
alter table public.tasks           add column if not exists created_by uuid default auth.uid();
alter table public.tasks           add column if not exists updated_by uuid;
alter table public.contacts        add column if not exists created_by uuid default auth.uid();
alter table public.contacts        add column if not exists updated_by uuid;
alter table public.activities      add column if not exists created_by uuid default auth.uid();
alter table public.deal_files      add column if not exists created_by uuid default auth.uid();
alter table public.comps           add column if not exists created_by uuid default auth.uid();
alter table public.comps           add column if not exists updated_by uuid;
alter table public.comps           add column if not exists updated_at timestamptz not null default now();
alter table public.knowledge_files add column if not exists created_by uuid default auth.uid();
alter table public.deal_checklist  add column if not exists created_by uuid default auth.uid();
alter table public.deal_checklist  add column if not exists updated_by uuid;
alter table public.deal_checklist  add column if not exists updated_at timestamptz not null default now();
alter table public.deal_team       add column if not exists created_by uuid default auth.uid();
alter table public.deal_team       add column if not exists updated_by uuid;
alter table public.deal_team       add column if not exists updated_at timestamptz not null default now();
alter table public.deal_comments   add column if not exists created_by uuid default auth.uid();
alter table public.deal_shares     add column if not exists created_by_uid uuid default auth.uid();

create or replace function public.set_audit_update() returns trigger as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$ language plpgsql;

drop trigger if exists deals_audit_update          on public.deals;
drop trigger if exists documents_audit_update      on public.documents;
drop trigger if exists comps_audit_update          on public.comps;
drop trigger if exists deal_checklist_audit_update on public.deal_checklist;
drop trigger if exists deal_team_audit_update      on public.deal_team;

create trigger deals_audit_update          before update on public.deals          for each row execute function public.set_audit_update();
create trigger documents_audit_update      before update on public.documents      for each row execute function public.set_audit_update();
create trigger comps_audit_update          before update on public.comps          for each row execute function public.set_audit_update();
create trigger deal_checklist_audit_update before update on public.deal_checklist for each row execute function public.set_audit_update();
create trigger deal_team_audit_update      before update on public.deal_team      for each row execute function public.set_audit_update();
