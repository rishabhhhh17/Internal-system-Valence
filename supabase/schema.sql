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
update public.deals set stage = 'Pitching' where stage = 'Pitch';
update public.deals set stage = 'Mandate'
  where stage in ('Preparation','Marketing','Diligence','Negotiation','Closing');
update public.deals set stage = 'Origination'
  where stage not in ('Origination','Pitching','Pre-Mandate','Mandate','Closed','On Hold','Lost');

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
  entity_type text not null check (entity_type in ('person','fund','mandate')),
  entity_id   uuid not null,
  created_at  timestamptz not null default now()
);
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
