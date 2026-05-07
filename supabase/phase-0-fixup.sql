-- ValenceOS · Phase 0 v2 — FIXUP for the three errors hit while applying
-- the migration on demo-1.
--
-- 1. The existing deals_stage_check constraint hardcoded the OLD 11 stages,
--    so trying to update a row to 'Pitching' / 'Pre-Mandate' fails. We drop
--    the old constraint and add a new one with the 7-stage list.
-- 2. expected_close_date column missing — add it.
-- 3. origination_source column missing — add it.
--
-- Idempotent. Paste end-to-end into Supabase SQL Editor and run.
-- Run this ONCE BEFORE re-running phase-0-stage-migration.sql.

-- ============ MISSING COLUMNS ============
alter table public.deals
  add column if not exists expected_close_date date,
  add column if not exists origination_source  text;

-- ============ STAGE CHECK CONSTRAINT ============
-- Drop the old constraint regardless of name, then add the new one.
alter table public.deals drop constraint if exists deals_stage_check;
alter table public.deals
  add constraint deals_stage_check
  check (stage in ('Origination','Pitching','Pre-Mandate','Mandate','Closed','On Hold','Lost'));

-- ============ DATA MIGRATION ============
-- Now that the constraint allows the new stage names, collapse old stages.
update public.deals set stage = 'Pitching' where stage = 'Pitch';
update public.deals set stage = 'Mandate'
  where stage in ('Preparation','Marketing','Diligence','Negotiation','Closing');
update public.deals set stage = 'Origination'
  where stage not in ('Origination','Pitching','Pre-Mandate','Mandate','Closed','On Hold','Lost');

-- Capture the migration in the activity log (only once per deal).
insert into public.activities (deal_id, kind, body, created_at)
select d.id, 'stage_change', 'Pipeline migrated to 7-stage model', now()
from public.deals d
where not exists (
  select 1 from public.activities a
  where a.deal_id = d.id
    and a.kind = 'stage_change'
    and a.body = 'Pipeline migrated to 7-stage model'
);
