-- ValenceOS · Phase 0 v2 — Stage system migration
-- Old 11-stage pipeline (Origination, Pitch, Mandate, Preparation, Marketing,
-- Diligence, Negotiation, Closing, Closed, On Hold, Lost) is collapsed to a
-- 7-stage pipeline. The execution-phase stages (Preparation through Closing)
-- become activity log entries inside the new "Mandate" stage.
--
-- Idempotent: safe to run multiple times.

update public.deals set stage = 'Pitching' where stage = 'Pitch';

update public.deals set stage = 'Mandate'
  where stage in ('Preparation','Marketing','Diligence','Negotiation','Closing');

-- Anything that doesn't match the new enum gets parked at Origination so the
-- Deal Logger doesn't crash on an unknown stage.
update public.deals set stage = 'Origination'
  where stage not in ('Origination','Pitching','Pre-Mandate','Mandate','Closed','On Hold','Lost');

-- Optional: capture the migration in the activity log so the timeline still
-- knows when the deal entered its current stage.
insert into public.activities (deal_id, kind, body, created_at)
select d.id, 'stage_change', 'Pipeline migrated to 7-stage model', now()
from public.deals d
where not exists (
  select 1 from public.activities a
  where a.deal_id = d.id
    and a.kind = 'stage_change'
    and a.body = 'Pipeline migrated to 7-stage model'
);
