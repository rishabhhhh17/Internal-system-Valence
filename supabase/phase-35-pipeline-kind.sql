-- ============================================================================
-- Phase 35 — Pipeline mode: Companies vs LPs
-- ============================================================================
-- The tool now serves two pipelines that share the same machinery:
--   kind='company' — potential portfolio companies (the deal pipeline)
--   kind='lp'      — LP fundraising conversations
-- A global Companies/LPs toggle in the app scopes every pipeline view by kind.
-- Existing rows default to 'company'. Idempotent.
-- ============================================================================

alter table public.deals add column if not exists kind text not null default 'company';
alter table public.deals drop constraint if exists deals_kind_check;
alter table public.deals add constraint deals_kind_check check (kind in ('company', 'lp'));
