-- ============================================================================
-- Phase 40 — Founders / LPs split for the Relationships CRM (funds.kind)
-- ============================================================================
-- The /funds page now serves two audiences via the global toggle:
--   kind='founder' — founder companies (stage = stages[0], sectors = tags)
--   kind='lp'      — limited partners (archetype = fund_type, geographies[])
-- Existing phase-39 rows are founders. Seeds a starter LP book for the demo
-- org. Idempotent: column add is guarded, founder backfill only hits NULLs,
-- LP seed only runs when no LPs exist yet for the org.
-- ============================================================================

alter table public.funds add column if not exists kind text not null default 'founder';
alter table public.funds drop constraint if exists funds_kind_check;
alter table public.funds add constraint funds_kind_check check (kind in ('founder', 'lp'));

-- Widen fund_type so LP archetypes validate alongside the founder rows' 'Other'.
alter table public.funds drop constraint if exists funds_fund_type_check;
alter table public.funds add constraint funds_fund_type_check check (fund_type = any (array[
  'VC','PE','Growth','Family Office','Sovereign','Hedge Fund','Strategic Corp Dev','Other',
  'Endowment','Foundation','Pension Fund','Corporate Venture'
]));

-- Existing rows in the demo org are founders.
update public.funds set kind = 'founder'
where org_id = 'dec0ffee-0000-4000-8000-000000000001' and kind is distinct from 'lp';

-- Seed the LP relationship book (archetype in fund_type, geographies[] array).
insert into public.funds (name, kind, fund_type, geographies, warmth, last_touched_at, notes, org_id)
select * from (values
  ('Cedar Foundation',        'lp', 'Foundation',        '{"North America"}'::text[],            'hot',     '2026-06-06'::date, 'Anchor interest; wants quarterly updates.', 'dec0ffee-0000-4000-8000-000000000001'::uuid),
  ('Evergreen Endowment',     'lp', 'Endowment',         '{"North America","Europe"}'::text[],   'hot',     '2026-06-04'::date, null, 'dec0ffee-0000-4000-8000-000000000001'::uuid),
  ('Maple Pension Fund',      'lp', 'Pension Fund',      '{"North America"}'::text[],            'warm',    '2026-05-28'::date, null, 'dec0ffee-0000-4000-8000-000000000001'::uuid),
  ('Gulf Sovereign Capital',  'lp', 'Family Office',     '{"MENA"}'::text[],                     'warm',    '2026-05-22'::date, null, 'dec0ffee-0000-4000-8000-000000000001'::uuid),
  ('Lotus Family Office',     'lp', 'Family Office',     '{"India","MENA"}'::text[],             'warm',    '2026-05-30'::date, null, 'dec0ffee-0000-4000-8000-000000000001'::uuid),
  ('Horizon Fund-of-Funds',   'lp', 'Family Office',     '{"India","SE Asia"}'::text[],          'cold',    '2026-04-18'::date, null, 'dec0ffee-0000-4000-8000-000000000001'::uuid),
  ('Tata Corporate Ventures', 'lp', 'Corporate Venture', '{"India"}'::text[],                    'warm',    '2026-05-25'::date, null, 'dec0ffee-0000-4000-8000-000000000001'::uuid),
  ('Sequoia Heritage',        'lp', 'Endowment',         '{"North America"}'::text[],   'cold',    '2026-03-20'::date, null, 'dec0ffee-0000-4000-8000-000000000001'::uuid),
  ('Crescent Endowment',      'lp', 'Endowment',         '{"MENA","Europe"}'::text[],            'cold',    '2026-04-05'::date, null, 'dec0ffee-0000-4000-8000-000000000001'::uuid),
  ('Banyan Foundation',       'lp', 'Foundation',        '{"India"}'::text[],                    'dormant', '2026-01-28'::date, null, 'dec0ffee-0000-4000-8000-000000000001'::uuid)
) as v(name, kind, fund_type, geographies, warmth, last_touched_at, notes, org_id)
where not exists (
  select 1 from public.funds f
  where f.org_id = 'dec0ffee-0000-4000-8000-000000000001' and f.kind = 'lp'
);
