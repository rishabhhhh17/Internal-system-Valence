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
