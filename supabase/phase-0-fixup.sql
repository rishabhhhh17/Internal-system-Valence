-- ValenceOS · Phase 0 v2 — FIXUP for the errors hit while applying the
-- migration on demo-1.
--
-- 1. The existing deals_stage_check constraint hardcoded the OLD 11 stages,
--    so trying to update a row to 'Pitching' / 'Pre-Mandate' fails with
--    23514 ("check constraint violated").
-- 2. expected_close_date column was missing on the deals table.
-- 3. origination_source column was missing on the deals table.
--
-- ORDER MATTERS: drop the constraint FIRST, migrate the data, only then
-- add the new constraint — otherwise the existing old-stage rows trip
-- the new check.
--
-- Idempotent. Paste end-to-end into Supabase SQL Editor and run.

-- ============ MISSING COLUMNS ============
alter table public.deals
  add column if not exists expected_close_date date,
  add column if not exists origination_source  text;

-- ============ DROP THE OLD STAGE CONSTRAINT ============
alter table public.deals drop constraint if exists deals_stage_check;

-- ============ DATA MIGRATION (now safe, no constraint blocking) ============
update public.deals set stage = 'Pitching' where stage = 'Pitch';
update public.deals set stage = 'Mandate'
  where stage in ('Preparation','Marketing','Diligence','Negotiation','Closing');
update public.deals set stage = 'Origination'
  where stage not in ('Origination','Pitching','Pre-Mandate','Mandate','Closed','On Hold','Lost');

-- ============ ADD THE NEW STAGE CONSTRAINT ============
-- All rows now sit in one of the 7 valid stages, so this won't trip.
alter table public.deals
  add constraint deals_stage_check
  check (stage in ('Origination','Pitching','Pre-Mandate','Mandate','Closed','On Hold','Lost'));

-- ============ AUDIT LOG ============
insert into public.activities (deal_id, kind, body, created_at)
select d.id, 'stage_change', 'Pipeline migrated to 7-stage model', now()
from public.deals d
where not exists (
  select 1 from public.activities a
  where a.deal_id = d.id
    and a.kind = 'stage_change'
    and a.body = 'Pipeline migrated to 7-stage model'
);
