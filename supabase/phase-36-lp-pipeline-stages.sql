-- ============================================================================
-- Phase 36 — Dedicated LP fundraising-conversation funnel
-- ============================================================================
-- The LP pipeline (kind='lp') used to reuse the company deal funnel. It now
-- has its own stages so the board reads in fundraising terms:
--   Identified → Introduced → Meeting → Fund DD → Soft-circled
--   → Committed (graduation) / Passed (drop)
--
-- Storage detail: the two terminal *ids* are deliberately SHARED with the
-- company funnel ('Diligence' = the success graduation, shown as "Committed"
-- for LPs; 'Passed' = the drop) so every terminal-keyed analytic (drop-off,
-- win-rate, KPIs) keeps working across both pipelines without branching. Only
-- the five active LP ids are new and need to be allowed by the CHECK.
--
-- Existing kind='lp' rows were seeded on the company funnel; remap them:
--   Sourced → LP Sourced              Information Received → LP Introduced
--   Analyst Call → LP Meeting         Partner Call → LP Due Diligence
--   Memo → LP Soft Circle             Diligence / Passed → unchanged
--
-- Idempotent: the CASE only rewrites known company ids on lp rows; the
-- constraint is dropped-then-added. Safe to re-run.
-- ============================================================================

alter table public.deals drop constraint if exists deals_stage_check;

update public.deals set stage = case stage
  when 'Sourced'              then 'LP Sourced'
  when 'Information Received' then 'LP Introduced'
  when 'Analyst Call'        then 'LP Meeting'
  when 'Partner Call'        then 'LP Due Diligence'
  when 'Memo'                then 'LP Soft Circle'
  else stage end
where kind = 'lp';

alter table public.deals add constraint deals_stage_check
  check (stage in (
    -- company deal funnel
    'Sourced', 'Information Received', 'Analyst Call',
    'Partner Call', 'Memo',
    -- LP fundraising funnel (active)
    'LP Sourced', 'LP Introduced', 'LP Meeting',
    'LP Due Diligence', 'LP Soft Circle',
    -- shared terminals
    'Diligence', 'Passed'
  ));
