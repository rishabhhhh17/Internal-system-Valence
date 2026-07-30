-- ============================================================================
-- Phase 34 — Repoint the deal pipeline to the pre-diligence investor funnel
-- ============================================================================
-- The product repositioned from an investment-banking advisory tool to a
-- VC/PE pre-diligence pipeline. The deal stages change from the old IB model
-- (Origination / Pitching / Pre-Mandate / Mandate / Closed / On Hold / Lost)
-- to the investor funnel:
--   Sourced → Information Received → Analyst Call → Partner Call → Memo
--   → Diligence (graduation — DD begins, exits the tool) / Passed (drop-off)
--
-- Mapping applied to existing rows:
--   Origination → Information Received   Pitching/Pitch → Analyst Call
--   Pre-Mandate → Partner Call           Mandate + (Preparation/Marketing/
--   Negotiation/Closing) → Memo          Closed → Diligence
--   On Hold → Sourced                    Lost → Passed
--
-- Idempotent enough to re-run: the CASE only rewrites known old values; the
-- constraint is dropped-then-added. Safe on a DB already migrated.
-- ============================================================================

alter table public.deals drop constraint if exists deals_stage_check;

update public.deals set stage = case stage
  when 'Origination' then 'Information Received'
  when 'Pitching'    then 'Analyst Call'
  when 'Pitch'       then 'Analyst Call'
  when 'Pre-Mandate' then 'Partner Call'
  when 'Preparation' then 'Memo'
  when 'Marketing'   then 'Memo'
  when 'Negotiation' then 'Memo'
  when 'Closing'     then 'Memo'
  when 'Mandate'     then 'Memo'
  when 'Closed'      then 'Diligence'
  when 'On Hold'     then 'Sourced'
  when 'Lost'        then 'Passed'
  else stage end
where stage is not null;

alter table public.deals add constraint deals_stage_check
  check (stage in (
    'Sourced', 'Information Received', 'Analyst Call',
    'Partner Call', 'Memo', 'Diligence', 'Passed'
  ));
