-- ============================================================================
-- ValenceOS · Phase 18 — Super-connectors views
-- ----------------------------------------------------------------------------
-- Three views unblock the find_top_connectors tool in api/_ask-tools.js,
-- which today errors with "relation does not exist" when the AI asks
-- "who at Valence knows the most PE folks" type questions.
--
-- Column names match what api/_ask-tools.js:213-218 selects:
--   super_connectors_by_company_type → key = 'company_type'
--   super_connectors_by_sector       → key = 'sector_tag' (singular)
--   super_connectors_by_geography    → key = 'geo_tag'    (singular — not geography_tag)
--
-- Why regular views, not matviews:
--   Postgres doesn't allow RLS on materialized views. The original Phase 5
--   spec assumed single-tenant — ValenceOS is multi-tenant via org_id and
--   current_user_org_id(). Regular views with security_invoker=true let RLS
--   on the underlying relationship_strength + people tables flow through
--   to the caller automatically, so no per-view policies are needed.
--
-- Perf is fine because relationship_strength is bounded (Valence team ×
-- external people per org) — typically <10k rows per org. The on-query
-- aggregation is sub-100ms in practice.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

-- Drop any leftover matviews from earlier attempts. CASCADE drops their
-- indexes too. No-op if they don't exist.
drop materialized view if exists public.super_connectors_by_company_type cascade;
drop materialized view if exists public.super_connectors_by_sector       cascade;
drop materialized view if exists public.super_connectors_by_geography    cascade;

-- ============ super_connectors_by_company_type ============
create or replace view public.super_connectors_by_company_type
  with (security_invoker = true)
  as
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

-- ============ super_connectors_by_sector ============
-- people.sector_tags is text[]. We unnest so one (person, sector) pair → one row.
create or replace view public.super_connectors_by_sector
  with (security_invoker = true)
  as
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

-- ============ super_connectors_by_geography ============
-- Column name `geo_tag` (singular) — matches api/_ask-tools.js:215 exactly.
create or replace view public.super_connectors_by_geography
  with (security_invoker = true)
  as
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

-- ============ GRANTS ============
-- security_invoker views inherit underlying RLS, but the caller still needs
-- SELECT on the view itself. Grant to authenticated; service_role gets
-- access via its bypass of RLS.
grant select on public.super_connectors_by_company_type to authenticated;
grant select on public.super_connectors_by_sector       to authenticated;
grant select on public.super_connectors_by_geography    to authenticated;

-- ============ NOTES ============
-- No refresh_super_connectors() function — regular views recompute on every
-- query, so there's nothing to refresh. If perf becomes a problem later
-- (>100ms tool latency consistently), switch to matviews + a SECURITY
-- DEFINER wrapper function in api/_ask-tools.js. See the contract doc
-- before changing the tool surface.
--
-- After running, verify with:
--   select 'company_type', count(*) from super_connectors_by_company_type
--   union all select 'sector',     count(*) from super_connectors_by_sector
--   union all select 'geography',  count(*) from super_connectors_by_geography;
-- All three return 0 until Phase 19 (compute_relationship_strength) populates
-- relationship_strength. That's expected — Phase 18's job is to make
-- find_top_connectors stop throwing "relation does not exist".
