-- ValenceOS — Supabase schema
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

-- ============ PUBLIC SHARE RPC ============
-- Returns only the 7 non-sensitive deal columns needed by the /share/:code
-- page. Runs as security definer so it bypasses RLS on `deals` — the
-- sensitive columns (fee_*, ticket_size_usd_m, financials, cim_draft,
-- created_by, etc.) are never exposed.
create or replace function public.get_shared_deal(p_share_code text)
returns table (
  id          uuid,
  client_name text,
  deal_type   text,
  stage       text,
  sector      text,
  side        text,
  notes       text
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.client_name, d.deal_type, d.stage, d.sector, d.side, d.notes
  from public.deals d
  join public.deal_shares s on s.deal_id = d.id
  where s.share_code = p_share_code
    and s.revoked = false
    and (s.expires_at is null or s.expires_at > now())
  limit 1;
$$;

grant execute on function public.get_shared_deal(text) to anon, authenticated;

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

-- ============ INTERACTIONS (Phase 1.1) ============
create table if not exists public.interactions (
  id uuid primary key default gen_random_uuid(),
  interaction_purpose text not null check (interaction_purpose in
    ('pitch_for_mandate','counterparty_outreach','relationship_building','referral')),
  type text not null check (type in
    ('intro_call','pitch_meeting','coffee','email_thread','referral_in','referral_out','event','phone_call','other')),
  counterparty_name    text not null,
  counterparty_company text,
  counterparty_role    text,
  deal_id              uuid references public.deals(id) on delete set null,
  outcome              text not null check (outcome in
    ('to_followup','in_progress','converted_to_mandate','pitched_lost','interested','passed','referred_out','stay_warm','closed')),
  notes                text,
  follow_up_date       date,
  lead_owner           text,
  created_by           uuid default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists interactions_purpose_idx        on public.interactions (interaction_purpose);
create index if not exists interactions_outcome_idx        on public.interactions (outcome);
create index if not exists interactions_deal_id_idx        on public.interactions (deal_id);
create index if not exists interactions_follow_up_date_idx on public.interactions (follow_up_date);
create index if not exists interactions_created_at_idx     on public.interactions (created_at desc);

alter table public.interactions enable row level security;

drop policy if exists interactions_select_authenticated on public.interactions;
create policy interactions_select_authenticated on public.interactions
  for select using (auth.role() = 'authenticated');

drop policy if exists interactions_write_authenticated on public.interactions;
create policy interactions_write_authenticated on public.interactions
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop trigger if exists interactions_audit_update on public.interactions;
create trigger interactions_audit_update before update on public.interactions
  for each row execute function public.set_audit_update();
-- ValenceOS · Phase 1.4 — Fund CRM
-- Idempotent. Paste this whole file into the Supabase SQL editor.

create table if not exists public.funds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  fund_type text not null check (fund_type in ('VC','PE','Growth','Family Office','Sovereign','Hedge Fund','Strategic Corp Dev','Other')),
  hq_city    text,
  hq_country text,
  aum_usd_m  numeric,
  check_size_min_usd_m numeric,
  check_size_max_usd_m numeric,
  sectors    text[] default '{}',
  stages     text[] default '{}',
  geographies text[] default '{}',
  website    text,
  warmth     text default 'cold' check (warmth in ('hot','warm','cold','dormant')),
  last_touched_at date,
  notes      text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists funds_warmth_idx     on public.funds (warmth);
create index if not exists funds_fund_type_idx  on public.funds (fund_type);
create index if not exists funds_last_touched_idx on public.funds (last_touched_at desc);

create table if not exists public.fund_contacts (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds(id) on delete cascade,
  name text not null,
  role text,
  email text,
  phone text,
  linkedin_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fund_contacts_fund_id_idx on public.fund_contacts (fund_id);

create table if not exists public.deal_fund_pings (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  fund_id uuid not null references public.funds(id) on delete cascade,
  status text default 'shortlisted' check (status in ('shortlisted','reached_out','meeting_set','passed','interested','in_dd','offered')),
  pinged_at timestamptz default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deal_id, fund_id)
);
create index if not exists deal_fund_pings_deal_id_idx on public.deal_fund_pings (deal_id);
create index if not exists deal_fund_pings_fund_id_idx on public.deal_fund_pings (fund_id);

alter table public.funds            enable row level security;
alter table public.fund_contacts    enable row level security;
alter table public.deal_fund_pings  enable row level security;

drop policy if exists funds_select_authenticated on public.funds;
create policy funds_select_authenticated on public.funds
  for select using (auth.role() = 'authenticated');
drop policy if exists funds_write_authenticated on public.funds;
create policy funds_write_authenticated on public.funds
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists fund_contacts_select_authenticated on public.fund_contacts;
create policy fund_contacts_select_authenticated on public.fund_contacts
  for select using (auth.role() = 'authenticated');
drop policy if exists fund_contacts_write_authenticated on public.fund_contacts;
create policy fund_contacts_write_authenticated on public.fund_contacts
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists deal_fund_pings_select_authenticated on public.deal_fund_pings;
create policy deal_fund_pings_select_authenticated on public.deal_fund_pings
  for select using (auth.role() = 'authenticated');
drop policy if exists deal_fund_pings_write_authenticated on public.deal_fund_pings;
create policy deal_fund_pings_write_authenticated on public.deal_fund_pings
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop trigger if exists funds_audit_update           on public.funds;
create trigger funds_audit_update before update on public.funds
  for each row execute function public.set_audit_update();

drop trigger if exists fund_contacts_audit_update   on public.fund_contacts;
create trigger fund_contacts_audit_update before update on public.fund_contacts
  for each row execute function public.set_audit_update();

drop trigger if exists deal_fund_pings_audit_update on public.deal_fund_pings;
create trigger deal_fund_pings_audit_update before update on public.deal_fund_pings
  for each row execute function public.set_audit_update();
-- ValenceOS · Phase 1.5 — AI Quick Screener
-- Idempotent. Paste this whole file into the Supabase SQL editor.

create table if not exists public.screener_criteria (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_default boolean not null default false,
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.screener_runs (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('fund_match','mandate_fit')),
  input_summary text,
  pdf_filename text,
  output jsonb,
  deal_id uuid references public.deals(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists screener_runs_mode_idx       on public.screener_runs (mode);
create index if not exists screener_runs_created_at_idx on public.screener_runs (created_at desc);

alter table public.screener_criteria enable row level security;
alter table public.screener_runs     enable row level security;

drop policy if exists screener_criteria_select_authenticated on public.screener_criteria;
create policy screener_criteria_select_authenticated on public.screener_criteria
  for select using (auth.role() = 'authenticated');
drop policy if exists screener_criteria_write_authenticated on public.screener_criteria;
create policy screener_criteria_write_authenticated on public.screener_criteria
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists screener_runs_select_authenticated on public.screener_runs;
create policy screener_runs_select_authenticated on public.screener_runs
  for select using (auth.role() = 'authenticated');
drop policy if exists screener_runs_write_authenticated on public.screener_runs;
create policy screener_runs_write_authenticated on public.screener_runs
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
-- ValenceOS · Phase 1.6 — Smart Intake Portal
-- Idempotent. Paste into the Supabase SQL editor.
-- After running, create a public storage bucket called "intake-decks" in
-- the Supabase dashboard so the public form can upload pitch decks.

create table if not exists public.intake_submissions (
  id uuid primary key default gen_random_uuid(),
  company_name   text not null,
  contact_name   text not null,
  contact_email  text not null,
  contact_phone  text,
  sector         text,
  deal_side      text,
  ev_ask_usd_m   numeric,
  situation      text,
  deck_url       text,
  source         text,
  status         text not null default 'new' check (status in ('new','reviewed','converted','passed','spam')),
  ai_screener_output jsonb,
  deal_id        uuid references public.deals(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists intake_submissions_status_idx     on public.intake_submissions (status);
create index if not exists intake_submissions_created_at_idx on public.intake_submissions (created_at desc);

alter table public.intake_submissions enable row level security;

-- Authenticated users (the firm) can read and update.
drop policy if exists intake_submissions_select_authenticated on public.intake_submissions;
create policy intake_submissions_select_authenticated on public.intake_submissions
  for select using (auth.role() = 'authenticated');

drop policy if exists intake_submissions_update_authenticated on public.intake_submissions;
create policy intake_submissions_update_authenticated on public.intake_submissions
  for update using (auth.role() = 'authenticated');

-- Anon visitors can ONLY insert (the public intake form). They cannot read
-- or modify rows; the only path is one-shot creation.
drop policy if exists intake_submissions_insert_anon on public.intake_submissions;
create policy intake_submissions_insert_anon on public.intake_submissions
  for insert to anon with check (true);

drop trigger if exists intake_submissions_audit_update on public.intake_submissions;
create trigger intake_submissions_audit_update before update on public.intake_submissions
  for each row execute function public.set_audit_update();
-- ValenceOS · Phase 1.7 — Meeting Intelligence
-- Idempotent. Paste into the Supabase SQL editor.

create table if not exists public.meeting_intelligence (
  id uuid primary key default gen_random_uuid(),
  deal_id      uuid references public.deals(id) on delete cascade,
  meeting_id   uuid references public.meetings(id),
  source       text check (source in ('otter','fireflies','granola','manual','other')),
  transcript_text text,
  transcript_url  text,
  founder_highlights jsonb default '[]',
  red_flags          jsonb default '[]',
  claims_to_verify   jsonb default '[]',
  action_items       jsonb default '[]',
  summary            text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists meeting_intelligence_deal_id_idx    on public.meeting_intelligence (deal_id);
create index if not exists meeting_intelligence_meeting_id_idx on public.meeting_intelligence (meeting_id);
create index if not exists meeting_intelligence_created_at_idx on public.meeting_intelligence (created_at desc);

alter table public.meeting_intelligence enable row level security;

drop policy if exists meeting_intelligence_select_authenticated on public.meeting_intelligence;
create policy meeting_intelligence_select_authenticated on public.meeting_intelligence
  for select using (auth.role() = 'authenticated');
drop policy if exists meeting_intelligence_write_authenticated on public.meeting_intelligence;
create policy meeting_intelligence_write_authenticated on public.meeting_intelligence
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop trigger if exists meeting_intelligence_audit_update on public.meeting_intelligence;
create trigger meeting_intelligence_audit_update before update on public.meeting_intelligence
  for each row execute function public.set_audit_update();
-- ValenceOS · Phase 1.8 — Doc enhancements (watermark + share access logs)
-- Idempotent. Paste into the Supabase SQL editor.

alter table public.deal_files add column if not exists watermark_enabled boolean default false;

create table if not exists public.share_access_logs (
  id uuid primary key default gen_random_uuid(),
  share_code text not null,
  file_id uuid references public.deal_files(id) on delete set null,
  viewer_ip   text,
  viewer_email text,
  user_agent  text,
  duration_seconds int,
  opened_at  timestamptz not null default now()
);
create index if not exists share_access_logs_share_code_idx on public.share_access_logs (share_code);
create index if not exists share_access_logs_opened_at_idx  on public.share_access_logs (opened_at desc);

alter table public.share_access_logs enable row level security;

drop policy if exists share_access_logs_select_authenticated on public.share_access_logs;
create policy share_access_logs_select_authenticated on public.share_access_logs
  for select using (auth.role() = 'authenticated');

-- Anon visitors with a valid share code can write a single access log row.
drop policy if exists share_access_logs_insert_anon on public.share_access_logs;
create policy share_access_logs_insert_anon on public.share_access_logs
  for insert to anon with check (true);

-- ============ PHASE 0 v2 — STAGE MIGRATION (idempotent) ============
-- Drop the old 11-stage CHECK before mutating data (legacy rows might fall
-- outside the old set after migration). Re-add the new 7-stage CHECK below.
alter table public.deals drop constraint if exists deals_stage_check;

update public.deals set stage = 'Pitching' where stage = 'Pitch';
update public.deals set stage = 'Mandate'
  where stage in ('Preparation','Marketing','Diligence','Negotiation','Closing');
update public.deals set stage = 'Origination'
  where stage not in ('Origination','Pitching','Pre-Mandate','Mandate','Closed','On Hold','Lost');

-- All rows now sit in one of the 7 valid stages, so this won't trip.
alter table public.deals
  add constraint deals_stage_check
  check (stage in ('Origination','Pitching','Pre-Mandate','Mandate','Closed','On Hold','Lost'));

-- Phase 0 fixup-2: legacy NOT NULLs blocked the new deal-type model where
-- demo rows insert deal_type=null + nda_status=null. Drop both.
alter table public.deals alter column deal_type  drop not null;
alter table public.deals alter column nda_status drop not null;

-- ============ PHASE 0 v2 — DEAL TYPE MODEL ============
alter table public.deals
  add column if not exists deal_types                 text[] not null default '{}',
  add column if not exists deal_subtype               text,
  add column if not exists target_raise_usd_m         numeric,
  add column if not exists target_valuation_usd_m     numeric,
  add column if not exists company_stage              text,
  add column if not exists ma_side                    text,
  add column if not exists acquisition_brief          text,
  add column if not exists target_exit_usd_m          numeric,
  add column if not exists target_exit_valuation_usd_m numeric,
  add column if not exists exit_investor_name         text,
  add column if not exists engagement_brief           text;

do $$ begin
  alter table public.deals
    add constraint deals_deal_subtype_chk
    check (deal_subtype is null or deal_subtype in ('fundraise','m_and_a','exit'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.deals
    add constraint deals_ma_side_chk
    check (ma_side is null or ma_side in ('buy','sell','undecided'));
exception when duplicate_object then null; end $$;

-- ============ PHASE 0 v2 — DAILY NOTES ============
create table if not exists public.daily_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  date        date not null,
  body        text not null default '',
  ai_summary  jsonb,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, date)
);
create index if not exists daily_notes_user_date_idx on public.daily_notes (user_id, date desc);
alter table public.daily_notes enable row level security;
drop policy if exists daily_notes_select_authenticated on public.daily_notes;
create policy daily_notes_select_authenticated on public.daily_notes
  for select using (auth.role() = 'authenticated');
drop policy if exists daily_notes_write_authenticated on public.daily_notes;
create policy daily_notes_write_authenticated on public.daily_notes
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists demo_anon_select on public.daily_notes;
create policy demo_anon_select on public.daily_notes
  for select to anon using (true);
drop policy if exists demo_anon_write on public.daily_notes;
create policy demo_anon_write on public.daily_notes
  for all to anon using (true) with check (true);
-- ValenceOS · Phase 1 v2 — People CRM + Interactions wiring + WhatsApp stubs
-- Idempotent. Paste into the Supabase SQL editor and run.
--
-- New table:
--   people                — persona-driven CRM, top-level. Includes how_to_talk,
--                           relationship_history, favours_bank, things_to_avoid,
--                           mutuals — all visible to every team member.
--
-- Extends:
--   interactions          — adds person_id FK plus WhatsApp stubs (kind enum,
--                           whatsapp_thread_id, whatsapp_message_count). Schema
--                           ready; the UI surfaces 'whatsapp' as a manual kind
--                           but no API integration yet.

-- ============ PEOPLE ============
create table if not exists public.people (
  id                  uuid primary key default gen_random_uuid(),
  full_name           text not null,
  role                text,
  company             text,
  fund_id             uuid references public.funds(id) on delete set null,
  email               text,
  phone               text,
  linkedin_url        text,
  whatsapp            text,
  city                text,
  country             text,
  -- Persona fields — visible to everyone on the team. No tiers.
  how_to_talk          text,
  relationship_history text,
  what_they_care_about text,
  favours_bank         text,
  things_to_avoid      text,
  mutuals              text,
  tags                text[] default '{}',
  last_touched_at     date,
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists people_name_idx    on public.people (full_name);
create index if not exists people_company_idx on public.people (company);
create index if not exists people_fund_idx    on public.people (fund_id);

alter table public.people enable row level security;

drop policy if exists people_select_authenticated on public.people;
create policy people_select_authenticated on public.people
  for select using (auth.role() = 'authenticated');
drop policy if exists people_write_authenticated on public.people;
create policy people_write_authenticated on public.people
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Open RLS for the demo project so /people renders without auth.
drop policy if exists demo_anon_select on public.people;
create policy demo_anon_select on public.people for select to anon using (true);
drop policy if exists demo_anon_write on public.people;
create policy demo_anon_write on public.people for all to anon using (true) with check (true);

-- ============ INTERACTIONS — Person FK + WhatsApp stubs ============
alter table public.interactions
  add column if not exists person_id              uuid references public.people(id) on delete set null,
  add column if not exists whatsapp_thread_id     text,
  add column if not exists whatsapp_message_count int;

create index if not exists interactions_person_id_idx on public.interactions (person_id);

-- Extend the kind enum: drop the old constraint and re-add with 'whatsapp' included.
alter table public.interactions drop constraint if exists interactions_type_check;
do $$ begin
  alter table public.interactions
    add constraint interactions_type_check
    check (type in ('intro_call','pitch_meeting','coffee','email_thread','referral_in','referral_out','event','phone_call','whatsapp','other'));
exception when duplicate_object then null; end $$;
-- ValenceOS · Phase 2 v2 — Knowledge Base restructure
-- Folder hierarchy per mandate, structured notes, and global cross-linking
-- via kb_mentions (parsed from [[wikilinks]] in note bodies).
--
-- Idempotent. Paste end-to-end into Supabase SQL Editor.

-- ============ FOLDERS ============
-- Tree structure: a mandate has a root folder; activities live under root;
-- categories (Notes / Documents / Feedback) live under activities. firm_wide
-- folders sit at the top level with mandate_id null.
create table if not exists public.kb_folders (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.kb_folders(id) on delete cascade,
  mandate_id  uuid references public.deals(id) on delete cascade,
  name        text not null,
  folder_type text not null check (folder_type in ('mandate_root','activity','category','firm_wide')),
  sort_order  int  not null default 0,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists kb_folders_parent_idx  on public.kb_folders (parent_id);
create index if not exists kb_folders_mandate_idx on public.kb_folders (mandate_id);

alter table public.kb_folders enable row level security;
drop policy if exists kb_folders_select_authenticated on public.kb_folders;
create policy kb_folders_select_authenticated on public.kb_folders for select using (auth.role() = 'authenticated');
drop policy if exists kb_folders_write_authenticated on public.kb_folders;
create policy kb_folders_write_authenticated on public.kb_folders for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists demo_anon_select on public.kb_folders;
create policy demo_anon_select on public.kb_folders for select to anon using (true);
drop policy if exists demo_anon_write on public.kb_folders;
create policy demo_anon_write on public.kb_folders for all to anon using (true) with check (true);

-- ============ NOTES ============
-- A note attaches to one folder. body is plain text + light rich text
-- (saved as plain string with simple inline tokens like **bold** /
-- *italic* / [[type:id|name]] / #tag). No markdown editor; the UI uses a
-- minimal toolbar.
create table if not exists public.kb_notes (
  id          uuid primary key default gen_random_uuid(),
  folder_id   uuid not null references public.kb_folders(id) on delete cascade,
  title       text not null,
  body        text not null default '',
  tags        text[] default '{}',
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists kb_notes_folder_idx     on public.kb_notes (folder_id);
create index if not exists kb_notes_updated_at_idx on public.kb_notes (updated_at desc);

alter table public.kb_notes enable row level security;
drop policy if exists kb_notes_select_authenticated on public.kb_notes;
create policy kb_notes_select_authenticated on public.kb_notes for select using (auth.role() = 'authenticated');
drop policy if exists kb_notes_write_authenticated on public.kb_notes;
create policy kb_notes_write_authenticated on public.kb_notes for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists demo_anon_select on public.kb_notes;
create policy demo_anon_select on public.kb_notes for select to anon using (true);
drop policy if exists demo_anon_write on public.kb_notes;
create policy demo_anon_write on public.kb_notes for all to anon using (true) with check (true);

-- ============ MENTIONS ============
-- Cross-link join table. Parsed client-side from [[type:id]] tokens in a
-- note body and upserted on save. entity_type is one of: person, fund,
-- mandate. (strategic deferred per Phase 0 sign-off.)
create table if not exists public.kb_mentions (
  id          uuid primary key default gen_random_uuid(),
  note_id     uuid not null references public.kb_notes(id) on delete cascade,
  entity_type text not null check (entity_type in ('person','fund','mandate','note')),
  entity_id   uuid not null,
  created_at  timestamptz not null default now()
);
-- If the table was created by a pre-2.6 migration, widen the constraint.
alter table public.kb_mentions drop constraint if exists kb_mentions_entity_type_check;
alter table public.kb_mentions
  add constraint kb_mentions_entity_type_check
  check (entity_type in ('person','fund','mandate','note'));
create index if not exists kb_mentions_entity_idx on public.kb_mentions (entity_type, entity_id);
create index if not exists kb_mentions_note_idx   on public.kb_mentions (note_id);

alter table public.kb_mentions enable row level security;
drop policy if exists kb_mentions_select_authenticated on public.kb_mentions;
create policy kb_mentions_select_authenticated on public.kb_mentions for select using (auth.role() = 'authenticated');
drop policy if exists kb_mentions_write_authenticated on public.kb_mentions;
create policy kb_mentions_write_authenticated on public.kb_mentions for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists demo_anon_select on public.kb_mentions;
create policy demo_anon_select on public.kb_mentions for select to anon using (true);
drop policy if exists demo_anon_write on public.kb_mentions;
create policy demo_anon_write on public.kb_mentions for all to anon using (true) with check (true);

-- ============ DEAL_FILES → FOLDER_ID ============
-- Files attach to a KB folder so they live alongside notes inside the
-- mandate's folder hierarchy. Nullable for backwards compatibility with
-- existing deal_files rows.
alter table public.deal_files add column if not exists folder_id uuid references public.kb_folders(id) on delete set null;
create index if not exists deal_files_folder_idx on public.deal_files (folder_id);
-- ValenceOS · Phase 2.5 — Voice memos + hybrid search support
-- Idempotent. Paste end-to-end into Supabase SQL Editor.
--
-- Adds:
--   kb_notes.audio_url            — public URL to the uploaded audio file
--   kb_notes.audio_filename       — the original filename for display
--   kb_notes.transcript           — plain-text transcript (Gemini output)
--   kb_notes.transcript_summary   — 3-sentence summary of the transcript
--   kb_notes.transcribed_at       — when transcription last ran
--   kb_notes.embedding            — vector(768) for hybrid search
--
-- Storage bucket: create a public bucket called "kb-voice-memos" in the
-- Supabase dashboard for the audio uploads. The schema only references the
-- public URL via audio_url so no FK to storage is needed.

create extension if not exists "vector";

alter table public.kb_notes
  add column if not exists audio_url           text,
  add column if not exists audio_filename      text,
  add column if not exists transcript          text,
  add column if not exists transcript_summary  text,
  add column if not exists transcribed_at      timestamptz,
  add column if not exists embedding           vector(768);

-- Plain-text search index across title + body + transcript so the keyword
-- half of hybrid search has something efficient to lean on.
create index if not exists kb_notes_text_idx on public.kb_notes
  using gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, '') || ' ' || coalesce(transcript, '')));

-- Vector index for cosine similarity search on the embedding.
create index if not exists kb_notes_embedding_idx on public.kb_notes
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Hybrid search RPC. Combines:
--   - vector cosine similarity (when query_embedding is provided)
--   - keyword match against the gin index
--   - recency weight (notes updated in the last 30 days get a small boost)
-- Optional folder_filter scopes to one mandate's folder tree.
create or replace function public.search_kb_notes(
  query_text       text,
  query_embedding  vector(768) default null,
  folder_filter_ids uuid[] default null,
  match_count      int default 12
)
returns table (
  id uuid,
  folder_id uuid,
  title text,
  body text,
  updated_at timestamptz,
  vector_score real,
  keyword_score real,
  recency_score real,
  total_score real
) language sql stable as $$
  with scored as (
    select
      n.id, n.folder_id, n.title, n.body, n.updated_at,
      case when query_embedding is not null and n.embedding is not null
           then (1 - (n.embedding <=> query_embedding))::real
           else 0::real end as vector_score,
      case when query_text is not null and length(query_text) > 0
           then ts_rank(
             to_tsvector('english', coalesce(n.title, '') || ' ' || coalesce(n.body, '') || ' ' || coalesce(n.transcript, '')),
             plainto_tsquery('english', query_text)
           )::real
           else 0::real end as keyword_score,
      greatest(0::real, 1.0 - (extract(epoch from (now() - n.updated_at)) / (60.0 * 60.0 * 24.0 * 30.0))::real) as recency_score
    from public.kb_notes n
    where (folder_filter_ids is null or n.folder_id = any(folder_filter_ids))
      and (
        query_text is null
        or length(query_text) = 0
        or to_tsvector('english', coalesce(n.title, '') || ' ' || coalesce(n.body, '') || ' ' || coalesce(n.transcript, '')) @@ plainto_tsquery('english', query_text)
        or query_embedding is not null
      )
  )
  select
    id, folder_id, title, body, updated_at,
    vector_score, keyword_score, recency_score,
    -- 60 % vector, 30 % keyword, 10 % recency. Tune later.
    (vector_score * 0.6 + keyword_score * 0.3 + recency_score * 0.1)::real as total_score
  from scored
  order by total_score desc
  limit greatest(1, match_count);
$$;

-- Allow anon to call the RPC for the demo project.
grant execute on function public.search_kb_notes(text, vector, uuid[], int) to anon, authenticated;

-- ============================================================================
-- Phase 3.1 — Smart Intake form: new deal-type model
-- ============================================================================
-- Mirrors the new deal-type taxonomy from Phase 0 v2 onto `intake_submissions`
-- so the public form can capture Transaction (fundraise / m_and_a / exit) +
-- Advisory mandates with the same conditional fields as the internal Deals
-- form.
--
-- Idempotent. Legacy `deal_side` / `ev_ask_usd_m` columns stay nullable so
-- historical rows survive.
-- ============================================================================

alter table public.intake_submissions
  add column if not exists deal_types                 text[] not null default '{}',
  add column if not exists deal_subtype               text,
  add column if not exists target_raise_usd_m         numeric,
  add column if not exists target_valuation_usd_m     numeric,
  add column if not exists company_stage              text,
  add column if not exists ma_side                    text,
  add column if not exists acquisition_brief          text,
  add column if not exists target_exit_usd_m          numeric,
  add column if not exists target_exit_valuation_usd_m numeric,
  add column if not exists exit_investor_name         text,
  add column if not exists engagement_brief           text;

do $$ begin
  alter table public.intake_submissions
    add constraint intake_submissions_deal_subtype_chk
    check (deal_subtype is null or deal_subtype in ('fundraise','m_and_a','exit'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.intake_submissions
    add constraint intake_submissions_ma_side_chk
    check (ma_side is null or ma_side in ('buy','sell','undecided'));
exception when duplicate_object then null; end $$;

-- ============================================================================
-- Phase 3.3 — Team Calendar overlay
-- ============================================================================
-- Stores team-member calendars + the events on them. The Google Calendar
-- integration is deferred to a future phase (Workspace OAuth needs a Calendar
-- scope wired in). For the demo, calendars and events are written directly
-- via the app and re-render in the overlay.
--
-- `google_calendar_id` is nullable. When set + the user has connected their
-- Google account, sync logic will populate `calendar_events` from the
-- Calendar API. Without it, events are app-local.
--
-- Idempotent.
-- ============================================================================

create table if not exists public.team_calendars (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  owner_email         text,
  color               text not null default 'blue',
  google_calendar_id  text,
  is_active           boolean not null default true,
  lead_owner          text,
  created_by          uuid default auth.uid(),
  updated_by          uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
alter table public.team_calendars add column if not exists updated_by uuid;
-- Phase 6 — track per-calendar Google-sync outcome so the UI can show
-- "✓ synced 2m ago" vs "⚠️ awaiting share" instead of failing silently.
alter table public.team_calendars add column if not exists last_synced_at   timestamptz;
alter table public.team_calendars add column if not exists last_sync_status text;     -- 'ok' | 'forbidden' | 'error' | 'auth_expired'
alter table public.team_calendars add column if not exists last_sync_error  text;

create index if not exists team_calendars_active_idx on public.team_calendars (is_active);
create index if not exists team_calendars_owner_email_idx on public.team_calendars (lower(owner_email));
create index if not exists team_calendars_sync_status_idx on public.team_calendars (last_sync_status);

create table if not exists public.calendar_events (
  id           uuid primary key default gen_random_uuid(),
  calendar_id  uuid not null references public.team_calendars(id) on delete cascade,
  title        text not null,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  location     text,
  attendees    jsonb not null default '[]'::jsonb,
  description  text,
  deal_id      uuid references public.deals(id) on delete set null,
  meeting_kind text,
  created_by   uuid default auth.uid(),
  updated_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint calendar_events_time_chk check (ends_at > starts_at)
);
alter table public.calendar_events add column if not exists updated_by uuid;

create index if not exists calendar_events_calendar_id_idx on public.calendar_events (calendar_id);
create index if not exists calendar_events_starts_at_idx   on public.calendar_events (starts_at);
create index if not exists calendar_events_deal_id_idx     on public.calendar_events (deal_id);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.team_calendars enable row level security;
alter table public.calendar_events enable row level security;

drop policy if exists team_calendars_select_authenticated on public.team_calendars;
create policy team_calendars_select_authenticated on public.team_calendars
  for select using (auth.role() = 'authenticated');

drop policy if exists team_calendars_write_authenticated on public.team_calendars;
create policy team_calendars_write_authenticated on public.team_calendars
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists calendar_events_select_authenticated on public.calendar_events;
create policy calendar_events_select_authenticated on public.calendar_events
  for select using (auth.role() = 'authenticated');

drop policy if exists calendar_events_write_authenticated on public.calendar_events;
create policy calendar_events_write_authenticated on public.calendar_events
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Demo-mode anon RLS — see HANDOFF.md gotcha #4. Drop these to lock the demo
-- back down for production.
drop policy if exists demo_anon_select on public.team_calendars;
create policy demo_anon_select on public.team_calendars for select to anon using (true);
drop policy if exists demo_anon_write on public.team_calendars;
create policy demo_anon_write on public.team_calendars for all to anon using (true) with check (true);

drop policy if exists demo_anon_select on public.calendar_events;
create policy demo_anon_select on public.calendar_events for select to anon using (true);
drop policy if exists demo_anon_write on public.calendar_events;
create policy demo_anon_write on public.calendar_events for all to anon using (true) with check (true);

-- ----------------------------------------------------------------------------
-- Audit triggers
-- ----------------------------------------------------------------------------
drop trigger if exists team_calendars_audit_update on public.team_calendars;
create trigger team_calendars_audit_update before update on public.team_calendars
  for each row execute function public.set_audit_update();

drop trigger if exists calendar_events_audit_update on public.calendar_events;
create trigger calendar_events_audit_update before update on public.calendar_events
  for each row execute function public.set_audit_update();

-- ============================================================================
-- Phase 3.4 — Google Calendar sync columns
-- ============================================================================
-- Adds `google_event_id` to calendar_events so we can upsert (insert-or-update)
-- on every Google Calendar sync without duplicating rows.
--
-- Apply AFTER phase-3-calendar.sql (and the fixup if you ran it). Idempotent.
-- ============================================================================

alter table public.calendar_events
  add column if not exists google_event_id text;

-- Unique per (calendar_id, google_event_id) — but only when google_event_id
-- is non-null, so manually-created (app-local) events stay unconstrained.
do $$ begin
  create unique index calendar_events_google_uniq
    on public.calendar_events (calendar_id, google_event_id)
    where google_event_id is not null;
exception when duplicate_table then null; end $$;

create index if not exists calendar_events_google_event_id_idx
  on public.calendar_events (google_event_id) where google_event_id is not null;

-- ============================================================================
-- Phase 3.6 — Interactions: expand contexts beyond the pre-mandate funnel
-- ============================================================================
-- The DB column stays `interaction_purpose` for backwards compatibility, but
-- the UI relabels to "Context" and grows from 4 → 12 options spanning the
-- full mandate lifecycle:
--
--   Pre-mandate (existing 4):
--     pitch_for_mandate · counterparty_outreach · relationship_building · referral
--   Live mandate execution (new 5):
--     client_update · investor_buyer_engagement · diligence_session ·
--     negotiation · closing_coordination
--   Post / cross-cutting (new 3):
--     post_close_followup · co_advisor_sync · industry_intel
--
-- New outcomes added: action_required · completed · blocked · signed.
-- Existing outcomes stay valid.
--
-- Idempotent. Safe to run on a project that already has the original
-- constraints from Phase 1.
-- ============================================================================

-- Drop old CHECK constraints if they exist
alter table public.interactions
  drop constraint if exists interactions_interaction_purpose_check,
  drop constraint if exists interactions_outcome_check;

-- Re-add wider CHECK on interaction_purpose (the column name stays the same)
alter table public.interactions
  add constraint interactions_interaction_purpose_check
    check (interaction_purpose in (
      'pitch_for_mandate',
      'counterparty_outreach',
      'relationship_building',
      'referral',
      'client_update',
      'investor_buyer_engagement',
      'diligence_session',
      'negotiation',
      'closing_coordination',
      'post_close_followup',
      'co_advisor_sync',
      'industry_intel'
    ));

-- Re-add wider CHECK on outcome
alter table public.interactions
  add constraint interactions_outcome_check
    check (outcome in (
      'to_followup',
      'in_progress',
      'converted_to_mandate',
      'pitched_lost',
      'interested',
      'passed',
      'referred_out',
      'stay_warm',
      'closed',
      'action_required',
      'completed',
      'blocked',
      'signed'
    ));

-- ============================================================================
-- Phase 3.7 — Interactions: transcript / voice memo / external source fields
-- ============================================================================
-- Bankers want to attach the artefact of an interaction (call recording
-- transcript, Fathom transcript, voice memo) to the row, not just notes.
-- This adds the storage columns; the UI in InteractionDrawer wires three
-- input sources: paste / upload, voice memo (Gemini transcribe), and
-- external pull (Fathom — stub for now).
--
-- Idempotent.
-- ============================================================================

alter table public.interactions
  add column if not exists transcript          text,
  add column if not exists transcript_summary  text,
  add column if not exists audio_url           text,
  add column if not exists audio_filename      text,
  add column if not exists transcribed_at      timestamptz,
  add column if not exists transcript_source   text,
  add column if not exists external_ref        text;

do $$ begin
  alter table public.interactions
    add constraint interactions_transcript_source_chk
    check (transcript_source is null or transcript_source in (
      'manual', 'upload', 'voice_memo', 'fathom', 'otter', 'fireflies', 'granola', 'zoom', 'meet', 'other'
    ));
exception when duplicate_object then null; end $$;

create index if not exists interactions_transcribed_at_idx
  on public.interactions (transcribed_at desc) where transcribed_at is not null;

-- ============================================================================
-- Phase 3.5 — Fit Engine
-- ============================================================================
-- Score opportunities (intake submissions / deals) against firm investment
-- criteria. The default criteria row is auto-seeded; the user can clone or
-- override to spawn additional sets later. Mirrored from
-- supabase/phase-3.5-fit-engine.sql.
-- ============================================================================

alter table public.deals               add column if not exists geography text;
alter table public.intake_submissions  add column if not exists geography text;

create table if not exists public.fit_criteria (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  is_default        boolean not null default false,
  sectors           text[] not null default '{}',
  excluded_sectors  text[] not null default '{}',
  ev_min_usd_m      numeric,
  ev_max_usd_m      numeric,
  geographies       text[] not null default '{}',
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid default auth.uid(),
  updated_by        uuid default auth.uid()
);

create index if not exists fit_criteria_default_idx
  on public.fit_criteria (is_default) where is_default = true;

create table if not exists public.fit_assessments (
  id            uuid primary key default gen_random_uuid(),
  entity_type   text not null check (entity_type in ('intake','deal','fund')),
  entity_id     uuid not null,
  criteria_id   uuid not null references public.fit_criteria(id) on delete cascade,
  fit_score     int  not null check (fit_score between 0 and 100),
  verdict       text not null check (verdict in ('strong_fit','fit','maybe','pass','excluded')),
  breakdown     jsonb not null default '{}',
  reasons       text[] not null default '{}',
  action        text check (action in ('mark_fit','pass','ask_more_info','override')),
  action_reason text,
  action_at     timestamptz,
  action_by     uuid,
  assessed_at   timestamptz not null default now(),
  unique(entity_type, entity_id, criteria_id)
);

create index if not exists fit_assessments_entity_idx
  on public.fit_assessments (entity_type, entity_id);
create index if not exists fit_assessments_verdict_idx
  on public.fit_assessments (verdict);

alter table public.fit_criteria    enable row level security;
alter table public.fit_assessments enable row level security;

drop policy if exists fit_criteria_select_authenticated on public.fit_criteria;
create policy fit_criteria_select_authenticated on public.fit_criteria
  for select using (auth.role() = 'authenticated');
drop policy if exists fit_criteria_write_authenticated on public.fit_criteria;
create policy fit_criteria_write_authenticated on public.fit_criteria
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists demo_anon_select on public.fit_criteria;
create policy demo_anon_select on public.fit_criteria for select to anon using (true);
drop policy if exists demo_anon_write on public.fit_criteria;
create policy demo_anon_write on public.fit_criteria for all to anon using (true) with check (true);

drop policy if exists fit_assessments_select_authenticated on public.fit_assessments;
create policy fit_assessments_select_authenticated on public.fit_assessments
  for select using (auth.role() = 'authenticated');
drop policy if exists fit_assessments_write_authenticated on public.fit_assessments;
create policy fit_assessments_write_authenticated on public.fit_assessments
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists demo_anon_select on public.fit_assessments;
create policy demo_anon_select on public.fit_assessments for select to anon using (true);
drop policy if exists demo_anon_write on public.fit_assessments;
create policy demo_anon_write on public.fit_assessments for all to anon using (true) with check (true);

drop trigger if exists fit_criteria_audit_update on public.fit_criteria;
create trigger fit_criteria_audit_update before update on public.fit_criteria
  for each row execute function public.set_audit_update();

insert into public.fit_criteria (
  name, is_default, sectors, excluded_sectors,
  ev_min_usd_m, ev_max_usd_m, geographies, notes
)
select
  'Default Valence criteria',
  true,
  array['Healthcare','Fintech','Consumer','Infrastructure','Renewables','Logistics','Real Estate'],
  array[]::text[],
  50,
  750,
  array['India','UK','SE Asia'],
  'Auto-seeded firm criteria. Override any field; flip is_default=false here before promoting another set to default.'
where not exists (
  select 1 from public.fit_criteria where is_default = true
);

-- ============================================================================
-- Phase 3.8 — Demo-mode RLS refresh
-- ============================================================================
-- Mirrors supabase/phase-3.8-demo-rls-refresh.sql — re-applies
-- demo_anon_select + demo_anon_write to every operational table so demo-mode
-- writes (memos on /knowledge/shared etc.) work even after hardening.sql is
-- re-run. Idempotent. Drop these policies + flip the App.jsx auth gate to
-- lock down for production.
-- ============================================================================
-- ============ PHASE 5 — Checklist customisation + KB file folders ============
-- deal_checklist gets `label` (text) + `required` (boolean) so users can add
-- custom checklist items per-stage with their own labels and required flags.
-- Template items leave label=null and look up the label by item_key.
-- knowledge_files gets `folder_id` so firm-wide files can be organised into
-- named template folders (Standard NDAs, Engagement Letters, etc.).
alter table public.deal_checklist
  add column if not exists label    text,
  add column if not exists required boolean;
alter table public.knowledge_files
  add column if not exists folder_id uuid references public.kb_folders(id) on delete set null;
create index if not exists knowledge_files_folder_idx on public.knowledge_files (folder_id);

do $$
declare
  t text;
  tables text[] := array[
    'deals','activities','meetings','tasks','contacts','documents','comps',
    'deal_checklist','deal_team','deal_comments','deal_files',
    'deal_shares','deal_share_access',
    'knowledge_files','knowledge_chunks','share_access_logs',
    'daily_notes',
    'people','interactions','funds','fund_contacts','deal_fund_pings',
    'screener_runs','screener_criteria','intake_submissions',
    'meeting_intelligence',
    'kb_folders','kb_notes','kb_mentions',
    'team_calendars','calendar_events',
    'fit_criteria','fit_assessments'
  ];
begin
  foreach t in array tables loop
    if not exists (
      select 1 from pg_tables where schemaname = 'public' and tablename = t
    ) then continue; end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists demo_anon_select on public.%I', t);
    execute format('create policy demo_anon_select on public.%I for select to anon using (true)', t);
    execute format('drop policy if exists demo_anon_write on public.%I', t);
    execute format('create policy demo_anon_write on public.%I for all to anon using (true) with check (true)', t);
  end loop;
end $$;

-- ============ PHASE 6 — KB FILES ============
-- Files attached to a kb_folders row. Works for firm-library folders and
-- mandate-scoped folders alike since the row is keyed purely by folder_id.
create table if not exists public.kb_files (
  id          uuid primary key default gen_random_uuid(),
  folder_id   uuid not null references public.kb_folders(id) on delete cascade,
  name        text not null,
  path        text not null,
  size_bytes  bigint,
  mime_type   text,
  uploaded_by uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists kb_files_folder_idx     on public.kb_files (folder_id);
create index if not exists kb_files_created_at_idx on public.kb_files (created_at desc);

alter table public.kb_files enable row level security;
drop policy if exists kb_files_select_authenticated on public.kb_files;
create policy kb_files_select_authenticated on public.kb_files for select using (auth.role() = 'authenticated');
drop policy if exists kb_files_write_authenticated on public.kb_files;
create policy kb_files_write_authenticated on public.kb_files for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists demo_anon_select on public.kb_files;
create policy demo_anon_select on public.kb_files for select to anon using (true);
drop policy if exists demo_anon_write on public.kb_files;
create policy demo_anon_write on public.kb_files for all to anon using (true) with check (true);

-- Storage bucket + RLS for kb-files.
insert into storage.buckets (id, name, public)
values ('kb-files', 'kb-files', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists kb_files_storage_select on storage.objects;
create policy kb_files_storage_select on storage.objects for select using (bucket_id = 'kb-files');
drop policy if exists kb_files_storage_insert on storage.objects;
create policy kb_files_storage_insert on storage.objects for insert with check (bucket_id = 'kb-files');
drop policy if exists kb_files_storage_delete on storage.objects;
create policy kb_files_storage_delete on storage.objects for delete using (bucket_id = 'kb-files');

-- =========================================================================
-- Phase 10 — LLM provider + model on each AI action.
-- Mirrors supabase/phase-10-llm-provider-model.sql. Nullable so legacy
-- rows survive untouched; admin views read NULL as "unknown".
-- =========================================================================
alter table public.ai_actions
  add column if not exists provider text,
  add column if not exists model    text;

create index if not exists ai_actions_org_provider_idx
  on public.ai_actions (org_id, provider);

-- =========================================================================
-- Phase 11 — customer-billed cost + key source on each AI action.
-- Mirrors supabase/phase-11-customer-cost-and-key-source.sql.
-- =========================================================================
alter table public.ai_actions
  add column if not exists customer_cost_usd numeric,
  add column if not exists key_source        text;

create index if not exists ai_actions_org_key_source_idx
  on public.ai_actions (org_id, key_source);
-- Phase 8 — Multi-tenant billing model.
-- =========================================================================
-- Implements the seat + AI overage logic described in the partner brief:
--
--   - Plan per org: byo_key | we_run_ai | own_key
--   - Seat billing: per-seat, upfront, monthly, no mid-cycle proration.
--     Tiered (base price below a threshold, volume price at/above), with
--     a per-client monthly floor.
--   - AI overage (we_run_ai only): per-seat allowance, hard pause at the
--     allowance until the user opts in to the overage rate. Opt-in is
--     consent; overage flows as an itemised invoice line.
--   - Storage: tracked + flagged for admin review when over the per-seat
--     allowance. Never auto-billed.
--
-- No payment processing here. This file defines the state — what is owed,
-- what is paused, what flag is raised — and exposes it via plain tables
-- that the JS lib in src/lib/billing.js drives.
-- =========================================================================

-- ============ ORGANISATIONS ============
-- The multi-tenant root. Every billing row hangs off org_id. Existing
-- domain tables (deals, people, funds, …) stay single-tenant for now;
-- they can be back-filled with org_id in a later migration. The billing
-- model is fully org-aware and doesn't depend on that back-fill.
create table if not exists public.orgs (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  -- Plans: byo_key + own_key are seat-only (we never bill them for AI).
  -- we_run_ai unlocks the AI-overage state machine below.
  plan         text not null check (plan in ('byo_key', 'we_run_ai', 'own_key')),
  -- The day-of-month the monthly cycle anchors to. Default = today so a
  -- new org's first cycle starts immediately.
  cycle_anchor_day int not null default 1 check (cycle_anchor_day between 1 and 28),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists orgs_plan_idx on public.orgs (plan);

-- ============ BILLING CONFIG ============
-- Single source of truth for the pricing knobs. One row with org_id IS NULL
-- is the GLOBAL DEFAULT — every org inherits from it unless an org-scoped
-- override row exists. Resolver picks the override when present.
--
-- The AI allowance + overage rate are intentionally placeholders. They
-- MUST be calibrated against real measured usage before going live.
create table if not exists public.billing_config (
  id                                  uuid primary key default gen_random_uuid(),
  org_id                              uuid references public.orgs(id) on delete cascade,
  -- Tiered seat pricing (flat tiers — see resolver).
  base_seat_price_usd                 numeric not null default 80,
  volume_seat_price_usd               numeric not null default 60,
  volume_threshold_seats              int     not null default 10,
  -- Floor: if (seats × seat price) < floor → bill floor instead.
  monthly_floor_usd                   numeric not null default 200,
  -- Storage allowance per seat, in MB. Tracked + displayed; never auto-billed.
  storage_allowance_per_seat_mb       int     not null default 5120,   -- 5 GB / seat
  -- AI allowance per seat per cycle, in "AI actions".
  -- ▼ PLACEHOLDER — calibrate from real measured usage before launch.
  ai_actions_allowance_per_seat       int     not null default 500,
  -- Overage rate when a seat opts in past the allowance.
  -- ▼ PLACEHOLDER — calibrate from real measured usage + cost basis.
  ai_overage_rate_usd_per_action      numeric not null default 0.02,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A given org has at most one override row.
  unique (org_id)
);

-- Seed the global default row (org_id IS NULL). Idempotent.
insert into public.billing_config (org_id) values (null)
  on conflict do nothing;

-- ============ SEATS ============
-- One row per user-in-an-org. Seats added mid-cycle don't bill until the
-- NEXT cycle (billable_from is set to the next cycle's start at creation
-- time by the JS lib).
create table if not exists public.seats (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  user_id         uuid,                       -- optional FK to auth.users
  email           text,
  active          boolean not null default true,
  added_at        timestamptz not null default now(),
  -- Date the seat first counts toward the seat-fee snapshot. The lib sets
  -- this to the NEXT cycle's period_start when a seat is added mid-cycle.
  billable_from   date not null default current_date,
  deactivated_at  timestamptz
);
create index if not exists seats_org_active_idx on public.seats (org_id) where active = true;
create index if not exists seats_billable_from_idx on public.seats (billable_from);

-- ============ BILLING CYCLES ============
-- One row per (org, monthly period). Snapshots the plan + every pricing
-- knob at cycle-open so config changes mid-cycle don't retroactively
-- re-price the open cycle.
create table if not exists public.billing_cycles (
  id                                uuid primary key default gen_random_uuid(),
  org_id                            uuid not null references public.orgs(id) on delete cascade,
  period_start                      date not null,
  period_end                        date not null,
  -- Frozen snapshot at cycle open
  plan_snapshot                     text    not null check (plan_snapshot in ('byo_key', 'we_run_ai', 'own_key')),
  base_seat_price_usd               numeric not null,
  volume_seat_price_usd             numeric not null,
  volume_threshold_seats            int     not null,
  monthly_floor_usd                 numeric not null,
  storage_allowance_per_seat_mb     int     not null,
  ai_actions_allowance_per_seat     int     not null,
  ai_overage_rate_usd_per_action    numeric not null,
  -- Computed at cycle open from seats with billable_from <= period_start
  billable_seats_count              int     not null default 0,
  seat_subtotal_usd                 numeric not null default 0,
  floor_applied                     boolean not null default false,
  -- Lifecycle
  status                            text    not null default 'open' check (status in ('open', 'closed')),
  opened_at                         timestamptz not null default now(),
  closed_at                         timestamptz,
  unique (org_id, period_start)
);
create index if not exists billing_cycles_open_idx on public.billing_cycles (org_id, status) where status = 'open';

-- ============ AI ACTIONS LEDGER ============
-- One row per billable AI action. The lib writes here in real time as
-- features (Ask / Screener / Deal Brief / Email Draft / etc.) fire.
-- Classification = 'included' until the seat's allowance is exhausted;
-- 'overage' only after explicit opt-in (see ai_overage_opt_ins).
create table if not exists public.ai_actions (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  seat_id         uuid not null references public.seats(id) on delete cascade,
  cycle_id        uuid not null references public.billing_cycles(id) on delete cascade,
  action_type     text,                           -- 'ask' | 'screener' | 'deal_brief' | …
  classification  text not null check (classification in ('included', 'overage')),
  occurred_at     timestamptz not null default now()
);
create index if not exists ai_actions_seat_cycle_idx on public.ai_actions (seat_id, cycle_id);
create index if not exists ai_actions_org_cycle_idx  on public.ai_actions (org_id, cycle_id);

-- ============ AI OVERAGE OPT-INS ============
-- Per-seat consent for the CURRENT cycle. Opt-in is the contract that the
-- partner accepts overage charges; resets every cycle so consent is
-- always fresh.
create table if not exists public.ai_overage_opt_ins (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  seat_id       uuid not null references public.seats(id) on delete cascade,
  cycle_id      uuid not null references public.billing_cycles(id) on delete cascade,
  opted_in_at   timestamptz not null default now(),
  opted_in_by   uuid,
  unique (seat_id, cycle_id)
);

-- ============ STORAGE USAGE SNAPSHOTS ============
-- Periodic reading of an org's total storage. The JS lib flags a row for
-- 'review needed' when the total exceeds (seats × allowance_per_seat).
-- Admin clears review via review_resolved_at.
create table if not exists public.storage_usage (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs(id) on delete cascade,
  cycle_id            uuid references public.billing_cycles(id) on delete cascade,
  total_bytes         bigint not null default 0,
  measured_at         timestamptz not null default now(),
  review_flagged      boolean not null default false,
  review_resolved_at  timestamptz,
  review_note         text
);
create index if not exists storage_usage_org_measured_idx on public.storage_usage (org_id, measured_at desc);
create index if not exists storage_usage_open_flags_idx
  on public.storage_usage (org_id) where review_flagged = true and review_resolved_at is null;

-- ============ INVOICE LINE ITEMS ============
-- The resolution of a cycle. Multiple rows per cycle: a base seat fee
-- (or floor adjustment), and zero-or-more AI overage tallies. No PDF
-- generation, no payment processing — this is the source data that any
-- future biller (Stripe / manual invoice / etc.) would consume.
create table if not exists public.invoice_line_items (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  cycle_id        uuid not null references public.billing_cycles(id) on delete cascade,
  kind            text not null check (kind in (
    'seat_fee',                  -- base × (seats below threshold)
    'seat_volume',               -- volume × (seats at/above threshold)
    'monthly_floor_adjustment',  -- top-up so total = floor
    'ai_overage',                -- one tally per cycle
    'storage_review'             -- only when admin closes the review with a charge — manual entry
  )),
  description     text not null,
  quantity        numeric,
  unit_price_usd  numeric,
  amount_usd      numeric not null,
  metadata        jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists invoice_lines_cycle_idx on public.invoice_line_items (cycle_id);
create index if not exists invoice_lines_org_idx   on public.invoice_line_items (org_id);

-- ============ ROW LEVEL SECURITY ============
-- Every billing table: an org member can only see their own org's rows.
-- Membership is encoded via seats.user_id matching auth.uid(). Service
-- role bypasses RLS (for admin tooling).
--
-- Demo policies stay in effect so the existing anon-RLS-open setup keeps
-- working for the unauthenticated demo build. Real auth simply tightens
-- the read paths via the authenticated policy.

alter table public.orgs                enable row level security;
alter table public.billing_config      enable row level security;
alter table public.seats               enable row level security;
alter table public.billing_cycles      enable row level security;
alter table public.ai_actions          enable row level security;
alter table public.ai_overage_opt_ins  enable row level security;
alter table public.storage_usage       enable row level security;
alter table public.invoice_line_items  enable row level security;

-- Helper: is the calling user a seat in this org?
create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1 from public.seats s
     where s.org_id = target_org
       and s.active = true
       and s.user_id = auth.uid()
  );
$$;

-- Org-member read policies on every billing table.
do $$
begin
  -- orgs
  drop policy if exists orgs_member_read on public.orgs;
  create policy orgs_member_read on public.orgs
    for select to authenticated
    using (is_org_member(id));

  -- billing_config (org-specific override OR global default both visible)
  drop policy if exists billing_config_member_read on public.billing_config;
  create policy billing_config_member_read on public.billing_config
    for select to authenticated
    using (org_id is null or is_org_member(org_id));

  drop policy if exists seats_member_read on public.seats;
  create policy seats_member_read on public.seats
    for select to authenticated
    using (is_org_member(org_id));

  drop policy if exists cycles_member_read on public.billing_cycles;
  create policy cycles_member_read on public.billing_cycles
    for select to authenticated
    using (is_org_member(org_id));

  drop policy if exists ai_actions_member_read on public.ai_actions;
  create policy ai_actions_member_read on public.ai_actions
    for select to authenticated
    using (is_org_member(org_id));

  drop policy if exists opt_ins_member_read on public.ai_overage_opt_ins;
  create policy opt_ins_member_read on public.ai_overage_opt_ins
    for select to authenticated
    using (is_org_member(org_id));

  drop policy if exists storage_member_read on public.storage_usage;
  create policy storage_member_read on public.storage_usage
    for select to authenticated
    using (is_org_member(org_id));

  drop policy if exists invoice_member_read on public.invoice_line_items;
  create policy invoice_member_read on public.invoice_line_items
    for select to authenticated
    using (is_org_member(org_id));
end $$;

-- Demo / anon policies — open read+write so the demo build keeps working.
-- Tighten these in production. (Service role always bypasses RLS.)
do $$
begin
  drop policy if exists demo_anon_all on public.orgs;
  create policy demo_anon_all on public.orgs for all to anon using (true) with check (true);

  drop policy if exists demo_anon_all on public.billing_config;
  create policy demo_anon_all on public.billing_config for all to anon using (true) with check (true);

  drop policy if exists demo_anon_all on public.seats;
  create policy demo_anon_all on public.seats for all to anon using (true) with check (true);

  drop policy if exists demo_anon_all on public.billing_cycles;
  create policy demo_anon_all on public.billing_cycles for all to anon using (true) with check (true);

  drop policy if exists demo_anon_all on public.ai_actions;
  create policy demo_anon_all on public.ai_actions for all to anon using (true) with check (true);

  drop policy if exists demo_anon_all on public.ai_overage_opt_ins;
  create policy demo_anon_all on public.ai_overage_opt_ins for all to anon using (true) with check (true);

  drop policy if exists demo_anon_all on public.storage_usage;
  create policy demo_anon_all on public.storage_usage for all to anon using (true) with check (true);

  drop policy if exists demo_anon_all on public.invoice_line_items;
  create policy demo_anon_all on public.invoice_line_items for all to anon using (true) with check (true);
end $$;
-- Phase 12 — Multi-tenant data isolation.
-- =========================================================================
-- Every customer-data table grows an org_id column scoped to public.orgs.
-- Existing demo rows are back-filled to the bootstrap "Valence Growth
-- Partners" org. Demo-open RLS policies are dropped and replaced with
-- per-org tenant isolation keyed off the requesting user's seat row.
--
-- Identity model:
--   auth.users  (Supabase auth)
--     └── seats.user_id        — maps an auth user to a seat in an org
--           └── seats.org_id   — the org they belong to
--   We use seats as the membership AND identity table (avoid a separate
--   profiles + members split). New identity columns added to seats:
--     full_name, title, phone, role  (role: 'partner' | 'analyst' | 'admin')
--
-- Helper function:
--   current_user_org_id()  — returns the org_id of the requesting user's
--   active seat. Used in every RLS policy as `org_id = current_user_org_id()`.
--   Returns NULL when called by anon or by a user with no seat — which
--   means anon/unsigned-up users see no rows (correct).
--
-- This migration is idempotent. Re-running it is a no-op once applied.
-- =========================================================================

-- ============ BOOTSTRAP ORG ============
-- One canonical org for back-fill. Idempotent on name.
insert into public.orgs (name, plan, cycle_anchor_day)
select 'Valence Growth Partners', 'we_run_ai', 1
where not exists (
  select 1 from public.orgs where name = 'Valence Growth Partners'
);

-- ============ SEATS GROWS IDENTITY COLUMNS ============
-- seats is now also the user profile. One row per (org_id, user_id).
alter table public.seats
  add column if not exists full_name   text,
  add column if not exists title       text,
  add column if not exists phone       text,
  add column if not exists role        text;
-- Role is open-text so the senior team can adjust without a migration.
-- App-side enum: 'partner' | 'analyst' | 'admin' | 'observer'.
do $$ begin
  alter table public.seats
    add constraint seats_role_check check (role is null or role in ('partner', 'analyst', 'admin', 'observer'));
exception
  when duplicate_object then null;
end $$;

create unique index if not exists seats_user_org_unique
  on public.seats (org_id, user_id)
  where user_id is not null;

-- ============ INVITES ============
-- An org admin issues an invite code; a new user signs in with Google and
-- enters the code on the welcome screen to claim a seat in that org. Codes
-- are single-use, 8-char uppercase, no I/O/0/1 to avoid confusion. Email
-- is optional — when set, the code is bound to that email.
create table if not exists public.org_invites (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  code          text not null unique,
  email         text,
  role          text default 'analyst',
  created_by    uuid,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '14 days'),
  claimed_at    timestamptz,
  claimed_by    uuid
);
create index if not exists org_invites_org_idx     on public.org_invites (org_id);
create index if not exists org_invites_unclaimed_idx on public.org_invites (code) where claimed_at is null;

-- ============ HELPER: current_user_org_id() ============
-- Returns the org_id of the requesting user's seat. NULL for anon, for a
-- user without a seat, or for a seat marked inactive. SECURITY DEFINER so
-- it can read seats even when the caller can't (no RLS recursion).
create or replace function public.current_user_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.org_id
  from public.seats s
  where s.user_id = auth.uid() and s.active = true
  order by s.added_at asc
  limit 1
$$;

revoke all on function public.current_user_org_id() from public;
grant execute on function public.current_user_org_id() to anon, authenticated;

-- ============ ADD org_id TO EVERY CUSTOMER-DATA TABLE ============
-- One block per table: add column, backfill to the bootstrap org, then
-- index. NOT NULL is enforced via app + RLS rather than at the column
-- level so that pre-existing rows in random envs don't break the migration.

do $$
declare
  default_org_id uuid;
  t text;
  tables text[] := array[
    'activities','calendar_events','comps','contacts','daily_notes',
    'deal_checklist','deal_comments','deal_files','deal_fund_pings',
    'deal_share_access','deal_shares','deal_team','deals','documents',
    'fit_assessments','fit_criteria','fund_contacts','funds',
    'intake_submissions','interactions','kb_files','kb_folders',
    'kb_mentions','kb_notes','knowledge_chunks','knowledge_files',
    'meeting_intelligence','meetings','people','screener_criteria',
    'screener_runs','share_access_logs','tasks','team_calendars'
  ];
begin
  select id into default_org_id
  from public.orgs
  where name = 'Valence Growth Partners'
  limit 1;

  foreach t in array tables loop
    execute format(
      'alter table public.%I add column if not exists org_id uuid references public.orgs(id)',
      t
    );
    execute format(
      'update public.%I set org_id = %L where org_id is null',
      t, default_org_id
    );
    execute format(
      'create index if not exists %I on public.%I (org_id)',
      t || '_org_idx', t
    );
  end loop;
end $$;

-- ============ RLS REWRITE ============
-- Drop the demo-open policies and replace with tenant isolation. Every
-- customer-data table follows the same pattern:
--
--   select : org_id = current_user_org_id()
--   insert : with check (org_id = current_user_org_id())
--   update : using (org_id = current_user_org_id()) with check (org_id = current_user_org_id())
--   delete : using (org_id = current_user_org_id())
--
-- Anon (no auth.uid()) gets no rows because current_user_org_id() returns
-- NULL and `NULL = NULL` is false in SQL.

do $$
declare
  t text;
  p record;
  tables text[] := array[
    'activities','calendar_events','comps','contacts','daily_notes',
    'deal_checklist','deal_comments','deal_files','deal_fund_pings',
    'deal_share_access','deal_shares','deal_team','deals','documents',
    'fit_assessments','fit_criteria','fund_contacts','funds',
    'intake_submissions','interactions','kb_files','kb_folders',
    'kb_mentions','kb_notes','knowledge_chunks','knowledge_files',
    'meeting_intelligence','meetings','people','screener_criteria',
    'screener_runs','share_access_logs','tasks','team_calendars',
    -- billing-side too: these already carry org_id from phase 8
    'ai_actions','ai_overage_opt_ins','billing_cycles',
    'invoice_line_items','storage_usage'
  ];
begin
  foreach t in array tables loop
    -- ensure RLS is enabled
    execute format('alter table public.%I enable row level security', t);

    -- drop ALL existing policies on the table (clean slate)
    for p in
      select polname
      from pg_policy
      where polrelid = format('public.%I', t)::regclass
    loop
      execute format('drop policy if exists %I on public.%I', p.polname, t);
    end loop;

    -- tenant isolation policies
    execute format(
      'create policy tenant_select on public.%I for select to authenticated using (org_id = public.current_user_org_id())',
      t
    );
    execute format(
      'create policy tenant_insert on public.%I for insert to authenticated with check (org_id = public.current_user_org_id())',
      t
    );
    execute format(
      'create policy tenant_update on public.%I for update to authenticated using (org_id = public.current_user_org_id()) with check (org_id = public.current_user_org_id())',
      t
    );
    execute format(
      'create policy tenant_delete on public.%I for delete to authenticated using (org_id = public.current_user_org_id())',
      t
    );
  end loop;
end $$;

-- ============ ORGS + SEATS POLICIES ============
-- These are the join-fabric tables, not customer-data. Members of an org
-- can read their own org row + every seat in their org. New-user
-- onboarding inserts into both BEFORE the user has a seat — so insert is
-- gated separately via a SECURITY DEFINER bootstrap function.

alter table public.orgs   enable row level security;
alter table public.seats  enable row level security;
alter table public.org_invites enable row level security;
alter table public.billing_config enable row level security;

do $$
declare
  pol record;
  tname text;
begin
  for tname in select unnest(array['orgs','seats','org_invites','billing_config']) loop
    for pol in
      select polname from pg_policy
      where polrelid = format('public.%I', tname)::regclass
    loop
      execute format('drop policy if exists %I on public.%I', pol.polname, tname);
    end loop;
  end loop;
end $$;

-- A signed-in user can read their own org.
create policy orgs_self_read on public.orgs
  for select to authenticated
  using (id = public.current_user_org_id());

-- A signed-in user can read seats in their own org.
create policy seats_self_read on public.seats
  for select to authenticated
  using (org_id = public.current_user_org_id() or user_id = auth.uid());

-- A signed-in user can update their OWN seat (name, title, phone, etc).
create policy seats_self_update on public.seats
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- A signed-in user can read invites for their own org (admin-ish view).
create policy invites_org_read on public.org_invites
  for select to authenticated
  using (org_id = public.current_user_org_id());

-- A signed-in user can read the global billing_config row OR their org's
-- override. App-side mutation only happens via service role or admin tools.
create policy billing_config_read on public.billing_config
  for select to authenticated
  using (org_id is null or org_id = public.current_user_org_id());

-- ============ BOOTSTRAP RPC: start_team(name, currency) ============
-- A signed-in user with no seat calls this once to create their team.
-- SECURITY DEFINER so it can insert into orgs + seats before the user has
-- a seat. Returns the new org_id.
create or replace function public.start_team(
  p_org_name text,
  p_full_name text,
  p_title text default null,
  p_phone text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'must be signed in to start a team';
  end if;

  -- Reject if the caller already has a seat — they should use join_team or
  -- be added by an admin instead.
  if exists (select 1 from public.seats where user_id = uid and active = true) then
    raise exception 'user already belongs to a team';
  end if;

  if p_org_name is null or length(trim(p_org_name)) = 0 then
    raise exception 'team name required';
  end if;

  insert into public.orgs (name, plan, cycle_anchor_day)
  values (trim(p_org_name), 'we_run_ai', 1)
  returning id into new_org_id;

  insert into public.seats (org_id, user_id, full_name, title, phone, role, active, billable_from)
  values (new_org_id, uid, p_full_name, p_title, p_phone, 'admin', true, current_date);

  return new_org_id;
end $$;
revoke all on function public.start_team(text, text, text, text) from public;
grant execute on function public.start_team(text, text, text, text) to authenticated;

-- ============ BOOTSTRAP RPC: join_team(invite_code, ...) ============
-- A signed-in user uses an invite code to claim a seat in an existing org.
create or replace function public.join_team(
  p_invite_code text,
  p_full_name text,
  p_title text default null,
  p_phone text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_org_id uuid;
  invite_role text;
  invite_id uuid;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'must be signed in to join a team';
  end if;
  if exists (select 1 from public.seats where user_id = uid and active = true) then
    raise exception 'user already belongs to a team';
  end if;

  select id, org_id, role into invite_id, target_org_id, invite_role
  from public.org_invites
  where code = upper(trim(p_invite_code))
    and claimed_at is null
    and (expires_at is null or expires_at > now());

  if target_org_id is null then
    raise exception 'invite not found or expired';
  end if;

  insert into public.seats (org_id, user_id, full_name, title, phone, role, active, billable_from)
  values (target_org_id, uid, p_full_name, p_title, p_phone, coalesce(invite_role, 'analyst'), true, current_date);

  update public.org_invites
    set claimed_at = now(), claimed_by = uid
    where id = invite_id;

  return target_org_id;
end $$;
revoke all on function public.join_team(text, text, text, text) from public;
grant execute on function public.join_team(text, text, text, text) to authenticated;

-- ============ BOOTSTRAP RPC: create_invite(role) ============
-- An org admin generates an invite code. Returns the new code.
create or replace function public.create_invite(
  p_role text default 'analyst',
  p_email text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org uuid := public.current_user_org_id();
  caller_role text;
  new_code text;
begin
  if caller_org is null then
    raise exception 'no active seat';
  end if;
  select role into caller_role from public.seats where user_id = auth.uid() and org_id = caller_org;
  if caller_role not in ('admin') then
    raise exception 'only admins can issue invites';
  end if;

  -- 8-character code without I/O/0/1. Loop until we find one that
  -- isn't already in the table (collision is astronomically unlikely
  -- but free to defend against).
  loop
    select string_agg(
      substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (floor(random()*32) + 1)::int, 1),
      ''
    ) into new_code
    from generate_series(1, 8);
    exit when not exists (select 1 from public.org_invites where code = new_code);
  end loop;

  insert into public.org_invites (org_id, code, role, email, created_by)
  values (caller_org, new_code, coalesce(p_role, 'analyst'), p_email, auth.uid());

  return new_code;
end $$;
revoke all on function public.create_invite(text, text) from public;
grant execute on function public.create_invite(text, text) to authenticated;
-- Phase 12b — Auto-claim Valence seat for @valencegrowth.com sign-ins.
-- =========================================================================
-- Multi-tenancy is the right default, but the Valence team itself doesn't
-- need to go through Welcome → Start a team → fill profile every time a
-- new partner signs in. This RPC short-circuits that for anyone whose
-- auth.users.email ends in @valencegrowth.com: it creates a seat in the
-- bootstrap "Valence Growth Partners" org and returns the org_id.
--
-- Everyone else still sees the Welcome screen and the normal start/join
-- flow — the multi-tenant capability is preserved for any future firm.
--
-- Called from the client on first sign-in when useSeat() returns no seat
-- AND the user's email matches the allowed-domain list. Safe to call
-- repeatedly — it bails out if the user already has a seat.

create or replace function public.auto_claim_seat_for_domain()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  user_email text;
  user_name text;
  target_org_id uuid;
begin
  if uid is null then
    raise exception 'must be signed in';
  end if;

  -- Bail if the user already has an active seat.
  if exists (select 1 from public.seats where user_id = uid and active = true) then
    return (select org_id from public.seats where user_id = uid and active = true limit 1);
  end if;

  -- Read the user's email + display name from auth.users. We're in a
  -- SECURITY DEFINER context so we can touch auth.users.
  select email,
         coalesce(raw_user_meta_data->>'full_name',
                  raw_user_meta_data->>'name',
                  split_part(email, '@', 1))
    into user_email, user_name
  from auth.users
  where id = uid;

  if user_email is null then
    return null;
  end if;

  -- Allowed-domain list — extend here when we add more "trusted" firms
  -- we want to skip Welcome for. For now: Valence Growth Partners only.
  if lower(user_email) not like '%@valencegrowth.com' then
    return null;  -- caller falls back to Welcome screen
  end if;

  -- Resolve the bootstrap Valence Growth Partners org.
  select id into target_org_id
  from public.orgs
  where name = 'Valence Growth Partners'
  limit 1;

  if target_org_id is null then
    raise exception 'bootstrap org not found — run phase 12 migration first';
  end if;

  insert into public.seats (org_id, user_id, email, full_name, role, active, billable_from)
  values (target_org_id, uid, user_email, user_name, 'partner', true, current_date)
  on conflict (org_id, user_id) where user_id is not null do nothing;

  return target_org_id;
end $$;

revoke all on function public.auto_claim_seat_for_domain() from public;
grant execute on function public.auto_claim_seat_for_domain() to authenticated;
-- Phase 12c — One-shot profile completion flag on seats.
-- =========================================================================
-- Seats created via start_team()/join_team() capture full_name + title +
-- phone in the same step. Seats created via auto_claim_seat_for_domain()
-- (the @valencegrowth.com fast path) only have full_name from Google —
-- title and phone are empty until the user fills them.
--
-- We use an explicit `profile_completed_at` flag rather than "is title
-- null" because (a) title is genuinely optional — some partners don't
-- have one, and (b) we want a way to mark "user has seen the welcome
-- once" so the app never nags them again.
--
-- The frontend gate: after sign-in, if seat exists and
-- profile_completed_at is NULL → redirect to /complete-profile.
-- Once they save or skip, set it to now() and they're in for good.
-- =========================================================================

alter table public.seats
  add column if not exists profile_completed_at timestamptz;

-- Back-fill: every seat that already has full_name AND was created via
-- start_team/join_team probably has a complete profile. We don't know
-- which RPC was used, so the safe heuristic is: if full_name + title
-- are both set, mark it complete. Pure auto-claim seats (title null)
-- will hit the completion screen next sign-in.
update public.seats
  set profile_completed_at = added_at
  where profile_completed_at is null
    and full_name is not null
    and title is not null;

-- Update the three identity RPCs so they explicitly stamp completion
-- when they captured the data.

create or replace function public.start_team(
  p_org_name text,
  p_full_name text,
  p_title text default null,
  p_phone text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'must be signed in to start a team'; end if;
  if exists (select 1 from public.seats where user_id = uid and active = true) then
    raise exception 'user already belongs to a team';
  end if;
  if p_org_name is null or length(trim(p_org_name)) = 0 then
    raise exception 'team name required';
  end if;

  insert into public.orgs (name, plan, cycle_anchor_day)
  values (trim(p_org_name), 'we_run_ai', 1)
  returning id into new_org_id;

  insert into public.seats (
    org_id, user_id, full_name, title, phone, role,
    active, billable_from, profile_completed_at
  ) values (
    new_org_id, uid, p_full_name, p_title, p_phone, 'admin',
    true, current_date, now()
  );

  return new_org_id;
end $$;

create or replace function public.join_team(
  p_invite_code text,
  p_full_name text,
  p_title text default null,
  p_phone text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_org_id uuid;
  invite_role text;
  invite_id uuid;
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'must be signed in to join a team'; end if;
  if exists (select 1 from public.seats where user_id = uid and active = true) then
    raise exception 'user already belongs to a team';
  end if;

  select id, org_id, role into invite_id, target_org_id, invite_role
  from public.org_invites
  where code = upper(trim(p_invite_code))
    and claimed_at is null
    and (expires_at is null or expires_at > now());
  if target_org_id is null then raise exception 'invite not found or expired'; end if;

  insert into public.seats (
    org_id, user_id, full_name, title, phone, role,
    active, billable_from, profile_completed_at
  ) values (
    target_org_id, uid, p_full_name, p_title, p_phone, coalesce(invite_role, 'analyst'),
    true, current_date, now()
  );

  update public.org_invites set claimed_at = now(), claimed_by = uid where id = invite_id;
  return target_org_id;
end $$;

-- auto_claim leaves profile_completed_at as NULL so the frontend prompts
-- once for title/phone before the app loads.
create or replace function public.auto_claim_seat_for_domain()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  user_email text;
  user_name text;
  target_org_id uuid;
begin
  if uid is null then raise exception 'must be signed in'; end if;
  if exists (select 1 from public.seats where user_id = uid and active = true) then
    return (select org_id from public.seats where user_id = uid and active = true limit 1);
  end if;
  select email,
         coalesce(raw_user_meta_data->>'full_name',
                  raw_user_meta_data->>'name',
                  split_part(email, '@', 1))
    into user_email, user_name
  from auth.users where id = uid;
  if user_email is null then return null; end if;
  if lower(user_email) not like '%@valencegrowth.com' then return null; end if;
  select id into target_org_id from public.orgs where name = 'Valence Growth Partners' limit 1;
  if target_org_id is null then raise exception 'bootstrap org not found — run phase 12 migration first'; end if;
  insert into public.seats (
    org_id, user_id, email, full_name, role, active, billable_from
    -- profile_completed_at intentionally null — frontend will prompt.
  ) values (
    target_org_id, uid, user_email, user_name, 'partner', true, current_date
  )
  on conflict (org_id, user_id) where user_id is not null do nothing;
  return target_org_id;
end $$;

-- New RPC the /complete-profile page calls when the user saves or
-- explicitly skips. Either way we stamp the flag so the screen never
-- shows again. The seats_self_update RLS policy lets the user UPDATE
-- their own row, but we wrap this in an RPC so the "skip" path doesn't
-- need a full update payload from the client.
create or replace function public.complete_profile(
  p_full_name text default null,
  p_title text default null,
  p_phone text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'must be signed in'; end if;
  update public.seats
    set full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
        title     = coalesce(nullif(trim(p_title), ''),     title),
        phone     = coalesce(nullif(trim(p_phone), ''),     phone),
        profile_completed_at = now()
    where user_id = uid and active = true;
end $$;
revoke all on function public.complete_profile(text, text, text) from public;
grant execute on function public.complete_profile(text, text, text) to authenticated;
-- Phase 12d — Open auto-claim to any email (first-test mode).
-- =========================================================================
-- The original auto_claim_seat_for_domain() RPC only claimed seats for
-- @valencegrowth.com emails — everyone else hit the Welcome / Start-a-team
-- screen. For the first internal test we want zero friction: any signed-in
-- user lands directly in the bootstrap Valence Growth Partners workspace.
--
-- Re-enabling the domain lock later is a one-line change inside the RPC.
-- The Welcome / Start-a-team / Join-a-team flow stays in the frontend
-- code for that future state.
-- =========================================================================

create or replace function public.auto_claim_seat_for_domain()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  user_email text;
  user_name text;
  target_org_id uuid;
begin
  if uid is null then raise exception 'must be signed in'; end if;

  if exists (select 1 from public.seats where user_id = uid and active = true) then
    return (select org_id from public.seats where user_id = uid and active = true limit 1);
  end if;

  select email,
         coalesce(raw_user_meta_data->>'full_name',
                  raw_user_meta_data->>'name',
                  split_part(email, '@', 1))
    into user_email, user_name
  from auth.users where id = uid;
  if user_email is null then return null; end if;

  -- OPEN MODE for the first test — no domain check. To re-lock to
  -- @valencegrowth.com only, restore the line below before the org
  -- lookup:
  --   if lower(user_email) not like '%@valencegrowth.com' then return null; end if;

  select id into target_org_id
  from public.orgs
  where name = 'Valence Growth Partners'
  limit 1;
  if target_org_id is null then
    raise exception 'bootstrap org not found — run phase 12 migration first';
  end if;

  insert into public.seats (
    org_id, user_id, email, full_name, role, active, billable_from
  ) values (
    target_org_id, uid, user_email, user_name, 'partner', true, current_date
  )
  on conflict (org_id, user_id) where user_id is not null do nothing;

  return target_org_id;
end $$;
revoke all on function public.auto_claim_seat_for_domain() from public;
grant execute on function public.auto_claim_seat_for_domain() to authenticated;
-- Phase 16 — Chrome extension auto-capture.
-- =========================================================================
-- Adds an `external_id` column to interactions so the /api/capture
-- endpoint can dedupe Gmail threads + Calendar events:
--   external_id = 'gmail:<thread_id>'
--   external_id = 'gcal:<event_id>'
-- Same thread / event POSTed twice from the extension is a no-op rather
-- than a duplicate row.
-- =========================================================================

alter table public.interactions
  add column if not exists external_id text;

create unique index if not exists interactions_org_external_unique
  on public.interactions (org_id, external_id)
  where external_id is not null;

-- The /api/capture endpoint runs under the user's Supabase JWT, so the
-- existing tenant_isolation RLS policies on `interactions` and `people`
-- already gate writes to org_id = current_user_org_id(). No new policies
-- needed for this phase.
-- Phase 17 — Relationship Intelligence Layer (foundation schema).
-- =========================================================================
-- This is the schema-only foundation for the Affinity-style relationship
-- intelligence layer described in the spec. Subsequent phases (ingestion
-- workers, nightly scoring, AI query layer, profile UI) build on these
-- tables and columns.
--
-- Design decisions worth flagging:
--
-- 1. The existing public.interactions table predates this work. It has
--    `counterparty_name text not null` (no FK). We DO NOT drop it. We
--    add nullable FK columns alongside (valence_person_id +
--    external_person_id). Legacy rows keep working. New ingestion (the
--    Chrome extension already merged + future Edge Functions) writes
--    the FK columns. Once every row is migrated, the legacy columns
--    can be dropped in a follow-up phase.
--
-- 2. Company classification fields live on public.people (not a
--    separate companies table) for now. The spec says "extend rather
--    than duplicate". When we have real company-level data (domain
--    aliases, parent/sub relationships, etc.) we'll spin out a
--    companies table; for v1, classification by email domain + AI
--    enrichment writes to the person row is enough.
--
-- 3. user_google_tokens persists per-user refresh tokens so the
--    ingestion Edge Functions (Phase 2) can authenticate without an
--    active session. Tokens are encrypted at rest in Supabase. Only
--    Edge Functions (running with service-role key) and the row's
--    owner (via RLS) can read.
--
-- 4. relationship_strength is computed nightly, not on read. The chip
--    UI reads from this table. The internal numeric score is stored
--    but never exposed to the UI — only the bucket label.
-- =========================================================================

-- ============ EXTEND public.people ============
alter table public.people
  add column if not exists is_valence_team   boolean default false,
  add column if not exists company_type      text,
  add column if not exists sector_tags       text[] default '{}',
  add column if not exists geography_tags    text[] default '{}',
  add column if not exists last_enriched_at  timestamptz,
  -- Email + company FK / canonical for matching. The Chrome extension
  -- writes email lowercased; we want a case-insensitive unique
  -- constraint per org so dedupe works across capture sources.
  add column if not exists email_normalised  text generated always as (lower(email)) stored;

create index if not exists people_company_type_idx on public.people (company_type);
create index if not exists people_email_normalised_idx on public.people (org_id, email_normalised) where email_normalised is not null;
create index if not exists people_is_valence_team_idx on public.people (org_id) where is_valence_team = true;

-- The company_type enum is enforced at the app layer via the AI
-- enrichment prompt + the search_people tool spec. We don't lock it
-- down with a CHECK constraint because new categories may emerge.
-- App-side enum:
--   pe_fund | vc_fund | investment_bank | family_office |
--   corporate_buyer | founder | lawyer | banker | other

-- ============ EXTEND public.interactions ============
-- Add the FK columns the spec calls for, plus an interaction_type that
-- matches the spec's enum. The legacy `type` column (intro_call /
-- pitch_meeting / coffee / ...) stays so existing rows + manual UI
-- entries keep working. New ingestion writes both.

alter table public.interactions
  add column if not exists valence_person_id   uuid references public.people(id) on delete set null,
  add column if not exists external_person_id  uuid references public.people(id) on delete set null,
  add column if not exists interaction_type    text,
  add column if not exists occurred_at         timestamptz,
  add column if not exists subject             text,
  add column if not exists summary             text,
  add column if not exists source              text,
  add column if not exists source_id           text;

-- interaction_type values: email_sent | email_received | meeting | call_logged
-- source values: gmail | gcal | manual | chrome_extension
-- These are enforced via app code, not CHECK, so we don't break inserts
-- during the migration period when the legacy `type` column is still in use.

create index if not exists interactions_valence_person_idx
  on public.interactions (valence_person_id, occurred_at desc)
  where valence_person_id is not null;

create index if not exists interactions_external_person_idx
  on public.interactions (external_person_id, occurred_at desc)
  where external_person_id is not null;

create index if not exists interactions_pair_idx
  on public.interactions (valence_person_id, external_person_id, occurred_at desc)
  where valence_person_id is not null and external_person_id is not null;

-- Source-based dedupe — the Edge Functions look up (source, source_id)
-- before inserting. Unique constraint with WHERE so legacy rows
-- (no source_id) don't conflict.
create unique index if not exists interactions_source_unique
  on public.interactions (org_id, source, source_id)
  where source is not null and source_id is not null;

-- ============ relationship_strength ============
-- One row per (valence_person, external_person) pair. Recomputed by the
-- nightly job. score_internal lives in the column but the app never
-- selects it for display — only the bucket.
create table if not exists public.relationship_strength (
  org_id               uuid not null references public.orgs(id) on delete cascade,
  valence_person_id    uuid not null references public.people(id) on delete cascade,
  external_person_id   uuid not null references public.people(id) on delete cascade,
  bucket               text not null check (bucket in ('strong','warm','cool','cold')),
  score_internal       numeric not null,
  last_interaction_at  timestamptz,
  interaction_count    int    not null default 0,
  computed_at          timestamptz not null default now(),
  primary key (valence_person_id, external_person_id)
);
create index if not exists relationship_strength_org_idx on public.relationship_strength (org_id);
create index if not exists relationship_strength_external_bucket_idx
  on public.relationship_strength (external_person_id, bucket);
create index if not exists relationship_strength_valence_bucket_idx
  on public.relationship_strength (valence_person_id, bucket);

alter table public.relationship_strength enable row level security;

-- Tenant isolation — same pattern as every other customer-data table.
drop policy if exists tenant_select on public.relationship_strength;
create policy tenant_select on public.relationship_strength
  for select to authenticated
  using (org_id = public.current_user_org_id());
-- Writes go through the nightly cron + a SECURITY DEFINER function so
-- ordinary users can't poison the table. No insert/update/delete
-- policy for authenticated.

-- ============ sync_state ============
-- Per-user, per-source last successful sync timestamp. The ingestion
-- workers query this on every tick.
create table if not exists public.sync_state (
  user_id        uuid not null,
  source         text not null check (source in ('gmail','gcal')),
  org_id         uuid not null references public.orgs(id) on delete cascade,
  last_synced_at timestamptz,
  last_error     text,
  last_error_at  timestamptz,
  updated_at     timestamptz not null default now(),
  primary key (user_id, source)
);
create index if not exists sync_state_org_idx on public.sync_state (org_id);

alter table public.sync_state enable row level security;
drop policy if exists self_read on public.sync_state;
create policy self_read on public.sync_state
  for select to authenticated
  using (user_id = auth.uid());

-- ============ user_google_tokens ============
-- Refresh tokens persisted so Edge Functions can mint access tokens
-- without an active user session. Encrypted at rest in Supabase.
-- Only the row's owner (via RLS) or the service role can read.
create table if not exists public.user_google_tokens (
  user_id        uuid primary key,
  org_id         uuid not null references public.orgs(id) on delete cascade,
  refresh_token  text not null,
  scopes         text[] not null default '{}',
  -- The access token is cached server-side with a TTL. We don't
  -- depend on a stale value here; this is for audit only.
  last_refreshed_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.user_google_tokens enable row level security;
drop policy if exists self_read on public.user_google_tokens;
create policy self_read on public.user_google_tokens
  for select to authenticated
  using (user_id = auth.uid());

-- ============ enrichment_queue ============
-- Lightweight queue table. The enrich_person Edge Function (Phase 3)
-- polls this on its tick.
create table if not exists public.enrichment_queue (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  person_id     uuid not null references public.people(id) on delete cascade,
  reason        text not null check (reason in ('new_person','stale','manual')),
  queued_at     timestamptz not null default now(),
  picked_at     timestamptz,
  completed_at  timestamptz,
  last_error    text
);
create index if not exists enrichment_queue_pending_idx
  on public.enrichment_queue (queued_at)
  where completed_at is null;

alter table public.enrichment_queue enable row level security;
drop policy if exists tenant_select on public.enrichment_queue;
create policy tenant_select on public.enrichment_queue
  for select to authenticated
  using (org_id = public.current_user_org_id());

-- ============ HELPERS ============
-- Helper to bucket an internal score per the spec. Used by Phase 4's
-- nightly scoring function.
create or replace function public.bucket_for_score(s numeric)
returns text
language sql immutable
as $$
  select case
    when s >= 30 then 'strong'
    when s >= 10 then 'warm'
    when s >= 3  then 'cool'
    else              'cold'
  end
$$;

-- Helper to weight an interaction by type, per spec.
create or replace function public.interaction_weight(itype text)
returns numeric
language sql immutable
as $$
  select case itype
    when 'meeting'        then 3.0
    when 'call_logged'    then 3.0
    when 'email_received' then 2.0
    when 'email_sent'     then 1.0
    else 0.0
  end
$$;

-- Helper to compute the time-decay factor per spec.
create or replace function public.interaction_decay(days int)
returns numeric
language sql immutable
as $$
  select case
    when days <= 30  then 1.0
    when days <= 90  then 0.5
    when days <= 180 then 0.25
    when days <= 365 then 0.10
    else 0.0
  end
$$;

-- ============================================================================
-- PHASE 18 — Super-connectors matviews
-- Mirrored from supabase/phase-18-super-connectors.sql. Column names match
-- api/_ask-tools.js (note geography view uses `geo_tag`, singular).
-- ============================================================================

drop materialized view if exists public.super_connectors_by_company_type;
create materialized view public.super_connectors_by_company_type as
select
  rs.org_id, rs.valence_person_id, p.company_type,
  count(*) filter (where rs.bucket in ('strong','warm')) as strong_warm_count,
  count(*)                                                as total_count
from public.relationship_strength rs
join public.people p on p.id = rs.external_person_id
where rs.bucket in ('strong','warm','cool')
  and p.company_type is not null
group by rs.org_id, rs.valence_person_id, p.company_type;

create unique index if not exists super_connectors_by_company_type_pk
  on public.super_connectors_by_company_type (org_id, valence_person_id, company_type);
create index if not exists super_connectors_by_company_type_lookup
  on public.super_connectors_by_company_type (company_type, strong_warm_count desc);

drop materialized view if exists public.super_connectors_by_sector;
create materialized view public.super_connectors_by_sector as
select
  rs.org_id, rs.valence_person_id, st.sector_tag,
  count(*) filter (where rs.bucket in ('strong','warm')) as strong_warm_count,
  count(*)                                                as total_count
from public.relationship_strength rs
join public.people p on p.id = rs.external_person_id
cross join lateral unnest(p.sector_tags) as st(sector_tag)
where rs.bucket in ('strong','warm','cool')
group by rs.org_id, rs.valence_person_id, st.sector_tag;

create unique index if not exists super_connectors_by_sector_pk
  on public.super_connectors_by_sector (org_id, valence_person_id, sector_tag);
create index if not exists super_connectors_by_sector_lookup
  on public.super_connectors_by_sector (sector_tag, strong_warm_count desc);

drop materialized view if exists public.super_connectors_by_geography;
create materialized view public.super_connectors_by_geography as
select
  rs.org_id, rs.valence_person_id, gt.geo_tag,
  count(*) filter (where rs.bucket in ('strong','warm')) as strong_warm_count,
  count(*)                                                as total_count
from public.relationship_strength rs
join public.people p on p.id = rs.external_person_id
cross join lateral unnest(p.geography_tags) as gt(geo_tag)
where rs.bucket in ('strong','warm','cool')
group by rs.org_id, rs.valence_person_id, gt.geo_tag;

create unique index if not exists super_connectors_by_geography_pk
  on public.super_connectors_by_geography (org_id, valence_person_id, geo_tag);
create index if not exists super_connectors_by_geography_lookup
  on public.super_connectors_by_geography (geo_tag, strong_warm_count desc);

alter materialized view public.super_connectors_by_company_type enable row level security;
alter materialized view public.super_connectors_by_sector       enable row level security;
alter materialized view public.super_connectors_by_geography    enable row level security;

drop policy if exists tenant_select on public.super_connectors_by_company_type;
drop policy if exists tenant_select on public.super_connectors_by_sector;
drop policy if exists tenant_select on public.super_connectors_by_geography;

create policy tenant_select on public.super_connectors_by_company_type
  for select to authenticated using (org_id = public.current_user_org_id());
create policy tenant_select on public.super_connectors_by_sector
  for select to authenticated using (org_id = public.current_user_org_id());
create policy tenant_select on public.super_connectors_by_geography
  for select to authenticated using (org_id = public.current_user_org_id());

create or replace function public.refresh_super_connectors()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view concurrently public.super_connectors_by_company_type;
  refresh materialized view concurrently public.super_connectors_by_sector;
  refresh materialized view concurrently public.super_connectors_by_geography;
end $$;

revoke all on function public.refresh_super_connectors() from public;
grant execute on function public.refresh_super_connectors() to authenticated, service_role;
