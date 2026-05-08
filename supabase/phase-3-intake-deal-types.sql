-- ============================================================================
-- Phase 3.1 — Smart Intake form: new deal-type model
-- ============================================================================
-- Mirrors the new deal-type taxonomy from Phase 0 v2 onto `intake_submissions`
-- so the public form can capture Transaction (fundraise / m_and_a / exit) +
-- Advisory mandates with the same conditional fields as the internal Deals
-- form.
--
-- Idempotent. Legacy `deal_side` / `ev_ask_usd_m` columns stay nullable so
-- historical rows survive.
-- ============================================================================

alter table public.intake_submissions
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
  alter table public.intake_submissions
    add constraint intake_submissions_deal_subtype_chk
    check (deal_subtype is null or deal_subtype in ('fundraise','m_and_a','exit'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.intake_submissions
    add constraint intake_submissions_ma_side_chk
    check (ma_side is null or ma_side in ('buy','sell','undecided'));
exception when duplicate_object then null; end $$;
