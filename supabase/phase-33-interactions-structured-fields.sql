-- ============================================================================
-- Phase 33 — Interactions: structured fields (reconcile schema drift)
-- ============================================================================
-- These columns were applied to the live database out-of-band (Phase 3.7 /
-- Phase 4 interaction-drawer work) but never committed as a migration, so a
-- DB rebuilt from this repo's SQL would 400 on every interaction save with
-- `column "context" does not exist`. This file backfills the gap so the repo
-- SQL matches production.
--
-- Columns (verified against live `public.interactions`):
--   context           text         — structured "what was discussed" block
--   takeaways         text         — structured key-takeaways block
--   next_steps        text         — structured next-steps block
--   is_complete       boolean      — follow-up completed flag (NOT NULL, default false)
--   mandate_link_mode text         — how the interaction links to mandates
--   origination       text         — inbound / outbound / referral / intro
--   deal_ids          uuid[]       — multi-mandate links (alongside scalar deal_id)
--
-- Idempotent. Safe to run on a project that already has these columns.
-- ============================================================================

alter table public.interactions add column if not exists context     text;
alter table public.interactions add column if not exists takeaways   text;
alter table public.interactions add column if not exists next_steps  text;
alter table public.interactions add column if not exists is_complete boolean not null default false;
alter table public.interactions add column if not exists mandate_link_mode text;
alter table public.interactions add column if not exists origination text;
alter table public.interactions add column if not exists deal_ids    uuid[];

-- CHECK constraints (drop-then-add so the file is re-runnable, matching the
-- pattern in phase-3-context-expansion.sql).
alter table public.interactions
  drop constraint if exists interactions_mandate_link_mode_chk,
  drop constraint if exists interactions_origination_chk;

alter table public.interactions
  add constraint interactions_mandate_link_mode_chk
    check (mandate_link_mode is null or mandate_link_mode in ('self', 'general', 'multi', 'specific'));

alter table public.interactions
  add constraint interactions_origination_chk
    check (origination is null or origination in ('inbound', 'outbound', 'referral', 'intro'));
