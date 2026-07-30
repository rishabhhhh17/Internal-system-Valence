-- ValenceOS · Phase 0 v2 — Deal type model rewrite
-- Old taxonomy (M&A / ECM / PE/VC / DCM in `deal_type`) doesn't fit Valence's
-- actual business. New model:
--   deal_types text[]        — multi-select: 'transaction' and/or 'advisory'
--   deal_subtype text        — required when 'transaction' is selected:
--                               'fundraise' | 'm_and_a' | 'exit'
-- Plus type-conditional fields (target raise, M&A brief, exit info,
-- advisory brief, etc.) added as nullable columns.
--
-- The legacy `deal_type`, `side`, `ticket_size_usd_m`, `fee_retainer_usd`,
-- `fee_success_pct`, `deck_url` columns are kept nullable for safety; UI
-- stops referencing them.
--
-- Idempotent.

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

-- Constraint: subtype value must be one of the allowed options when set.
do $$ begin
  alter table public.deals
    add constraint deals_deal_subtype_chk
    check (deal_subtype is null or deal_subtype in ('fundraise','m_and_a','exit'));
exception when duplicate_object then null; end $$;

-- Constraint: ma_side value must be one of the allowed options when set.
do $$ begin
  alter table public.deals
    add constraint deals_ma_side_chk
    check (ma_side is null or ma_side in ('buy','sell','undecided'));
exception when duplicate_object then null; end $$;

-- Backfill: every row that hasn't been classified yet gets 'transaction' +
-- a best-guess subtype mapped from the old `deal_type` text.
update public.deals
set deal_types  = array['transaction'],
    deal_subtype = case
      when lower(coalesce(deal_type, '')) like '%m&a%'      then 'm_and_a'
      when lower(coalesce(deal_type, '')) like '%pe%'       then 'fundraise'
      when lower(coalesce(deal_type, '')) like '%vc%'       then 'fundraise'
      when lower(coalesce(deal_type, '')) like '%ecm%'      then 'fundraise'
      when lower(coalesce(deal_type, '')) like '%dcm%'      then 'fundraise'
      else 'fundraise'
    end
where (deal_types is null or array_length(deal_types, 1) is null);

-- Backfill `ma_side` from the old `side` column for M&A deals.
update public.deals
set ma_side = case
  when side ilike 'buy%'  then 'buy'
  when side ilike 'sell%' then 'sell'
  else 'undecided'
end
where deal_subtype = 'm_and_a' and ma_side is null and side is not null;
