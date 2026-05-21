-- ============================================================================
-- ValenceOS · Phase 18 — Super-connectors materialized views
-- ----------------------------------------------------------------------------
-- Three matviews unblock the find_top_connectors tool in /api/_ask-tools.js,
-- which today errors with "relation does not exist" when the AI asks
-- "who at Valence knows the most PE folks" type questions.
--
-- Column names are chosen to match what api/_ask-tools.js:213-218 selects:
--   super_connectors_by_company_type → key = 'company_type'
--   super_connectors_by_sector       → key = 'sector_tag'   (singular)
--   super_connectors_by_geography    → key = 'geo_tag'      (singular, NOT geography_tag)
--
-- Multi-tenant: each row carries org_id. RLS on the matviews filters to the
-- caller's org via current_user_org_id(). Refresh function recomputes all
-- three; Phase 19 (relationship scoring cron) calls it after writing into
-- relationship_strength so the views stay in lock-step.
--
-- Idempotent: drops + recreates the matviews so iterating on the GROUP BY is
-- safe to re-run. Nothing else depends on them yet.
-- ============================================================================

-- ============ super_connectors_by_company_type ============
drop materialized view if exists public.super_connectors_by_company_type;

create materialized view public.super_connectors_by_company_type as
select
  rs.org_id,
  rs.valence_person_id,
  p.company_type,
  count(*) filter (where rs.bucket in ('strong','warm')) as strong_warm_count,
  count(*)                                                as total_count
from public.relationship_strength rs
join public.people p on p.id = rs.external_person_id
where rs.bucket in ('strong','warm','cool')               -- Cold excluded from totals (per spec Phase 5)
  and p.company_type is not null
group by rs.org_id, rs.valence_person_id, p.company_type;

-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY.
create unique index if not exists super_connectors_by_company_type_pk
  on public.super_connectors_by_company_type (org_id, valence_person_id, company_type);

-- Query index — the tool filters by company_type and orders by strong_warm_count desc.
create index if not exists super_connectors_by_company_type_lookup
  on public.super_connectors_by_company_type (company_type, strong_warm_count desc);

-- ============ super_connectors_by_sector ============
-- people.sector_tags is text[]. We unnest so one (person, sector) pair → one row.
drop materialized view if exists public.super_connectors_by_sector;

create materialized view public.super_connectors_by_sector as
select
  rs.org_id,
  rs.valence_person_id,
  st.sector_tag,
  count(*) filter (where rs.bucket in ('strong','warm')) as strong_warm_count,
  count(*)                                                as total_count
from public.relationship_strength rs
join public.people p on p.id = rs.external_person_id
cross join lateral unnest(p.sector_tags) as st(sector_tag)
where rs.bucket in ('strong','warm','cool')
group by rs.org_id, rs.valence_person_id, st.sector_tag;

create unique index if not exists super_connectors_by_sector_pk
  on public.super_connectors_by_sector (org_id, valence_person_id, sector_tag);

create index if not exists super_connectors_by_sector_lookup
  on public.super_connectors_by_sector (sector_tag, strong_warm_count desc);

-- ============ super_connectors_by_geography ============
-- Note column name `geo_tag` — matches api/_ask-tools.js:215 exactly.
drop materialized view if exists public.super_connectors_by_geography;

create materialized view public.super_connectors_by_geography as
select
  rs.org_id,
  rs.valence_person_id,
  gt.geo_tag,
  count(*) filter (where rs.bucket in ('strong','warm')) as strong_warm_count,
  count(*)                                                as total_count
from public.relationship_strength rs
join public.people p on p.id = rs.external_person_id
cross join lateral unnest(p.geography_tags) as gt(geo_tag)
where rs.bucket in ('strong','warm','cool')
group by rs.org_id, rs.valence_person_id, gt.geo_tag;

create unique index if not exists super_connectors_by_geography_pk
  on public.super_connectors_by_geography (org_id, valence_person_id, geo_tag);

create index if not exists super_connectors_by_geography_lookup
  on public.super_connectors_by_geography (geo_tag, strong_warm_count desc);

-- ============ ROW LEVEL SECURITY ============
-- Materialized views do not inherit RLS from base tables — Postgres treats
-- them as cached results owned by the MV creator. We enable RLS explicitly
-- and add tenant policies that mirror the pattern on relationship_strength.
alter materialized view public.super_connectors_by_company_type enable row level security;
alter materialized view public.super_connectors_by_sector       enable row level security;
alter materialized view public.super_connectors_by_geography    enable row level security;

drop policy if exists tenant_select on public.super_connectors_by_company_type;
drop policy if exists tenant_select on public.super_connectors_by_sector;
drop policy if exists tenant_select on public.super_connectors_by_geography;

create policy tenant_select on public.super_connectors_by_company_type
  for select to authenticated
  using (org_id = public.current_user_org_id());

create policy tenant_select on public.super_connectors_by_sector
  for select to authenticated
  using (org_id = public.current_user_org_id());

create policy tenant_select on public.super_connectors_by_geography
  for select to authenticated
  using (org_id = public.current_user_org_id());

-- ============ REFRESH FUNCTION ============
-- Called by the Phase 19 nightly scoring job AFTER relationship_strength
-- has been recomputed. CONCURRENT refresh keeps readers unblocked while
-- the matview rebuilds — that's why we needed the unique indexes above.
--
-- SECURITY DEFINER so it can refresh regardless of who triggered it. We
-- revoke from public and grant only to authenticated + service_role so a
-- random anon caller cannot kick off a refresh storm.
create or replace function public.refresh_super_connectors()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view concurrently public.super_connectors_by_company_type;
  refresh materialized view concurrently public.super_connectors_by_sector;
  refresh materialized view concurrently public.super_connectors_by_geography;
end $$;

revoke all on function public.refresh_super_connectors() from public;
grant execute on function public.refresh_super_connectors() to authenticated, service_role;

-- ============ INITIAL POPULATION ============
-- The matviews were created WITH DATA (the default), so they're already
-- populated. But CONCURRENT refresh requires at least one prior refresh
-- of any kind — and since we just dropped + recreated, the next concurrent
-- refresh in refresh_super_connectors() needs a non-concurrent seed first.
-- This block does that seed safely.
refresh materialized view public.super_connectors_by_company_type;
refresh materialized view public.super_connectors_by_sector;
refresh materialized view public.super_connectors_by_geography;

-- ============ SANITY CHECK ============
-- After running, you can verify with:
--   select count(*) from public.super_connectors_by_company_type;
--   select count(*) from public.super_connectors_by_sector;
--   select count(*) from public.super_connectors_by_geography;
--
-- These will be 0 until Phase 19 (compute_relationship_strength) populates
-- relationship_strength. That's expected — the goal of Phase 18 is to
-- make find_top_connectors stop throwing "relation does not exist".
-- After Phase 19 runs, re-run `select public.refresh_super_connectors();`
-- and the counts will reflect real (Valence person × company_type) pairs.
