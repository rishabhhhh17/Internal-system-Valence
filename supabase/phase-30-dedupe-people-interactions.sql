-- ============================================================================
-- ValenceOS · Phase 30 — De-dupe people + interactions, lock in constraints
-- ----------------------------------------------------------------------------
-- The audit found:
--   * 11 real-email dupe groups in `people` (16 extra rows). Same person
--     showed up multiple times across "company" variants (e.g. Yohaan at
--     IFF / India Food Fund / Individual / Individuals).
--   * 39 interaction signature dupes (same org, deal, counterparty,
--     occurred_at — i.e. someone double-clicked Save or two import runs
--     overlapped).
--   * 12 `email='-'` placeholder rows masquerading as a dupe group; these
--     are 12 different people with junk-email from an old import.
--
-- Root cause: no unique constraint on people (org, email), plus
-- /api/capture.js used a non-atomic "fetch then insert" check that races
-- under concurrent extension clicks.
--
-- Already applied to live Supabase via MCP. Files checked in for replay.
-- Idempotent. Safe to re-run.
-- ============================================================================

-- Step 0 — normalise junk-email placeholders to NULL.
update public.people
set email = null
where email is not null and (
  trim(email) = '' or trim(email) in ('-','--','—','n/a','na','none','x','xxx')
  or trim(email) !~ '@'
);

-- Step 1 — merge real-email dupes. Canonical = oldest row per
-- (org_id, lower(email)). Repoint every FK that lands on a duplicate
-- people.id at the canonical, then drop the duplicates.
with grp as (
  select lower(trim(email)) as k, org_id,
    (array_agg(id order by created_at))[1]  as canonical,
    (array_agg(id order by created_at))[2:] as duplicates
  from public.people
  where email is not null and email like '%@%.%'
  group by 1,2
  having count(*) > 1
),
flat as (
  select canonical, unnest(duplicates) as dupe_id from grp
),
rp1 as (
  update public.interactions i set person_id = f.canonical
  from flat f where i.person_id = f.dupe_id returning 1
),
rp2 as (
  update public.interactions i set valence_person_id = f.canonical
  from flat f where i.valence_person_id = f.dupe_id returning 1
),
rp3 as (
  update public.interactions i set external_person_id = f.canonical
  from flat f where i.external_person_id = f.dupe_id returning 1
),
rp4 as (
  update public.enrichment_queue e set person_id = f.canonical
  from flat f where e.person_id = f.dupe_id returning 1
),
rp5 as (
  delete from public.relationship_strength rs
  using flat f
  where rs.valence_person_id = f.dupe_id or rs.external_person_id = f.dupe_id
  returning 1
),
del_people as (
  delete from public.people p using flat f where p.id = f.dupe_id returning 1
)
select
  (select count(*) from rp1) as inter_person_repoints,
  (select count(*) from rp2) as inter_valence_repoints,
  (select count(*) from rp3) as inter_external_repoints,
  (select count(*) from rp4) as enrichq_repoints,
  (select count(*) from rp5) as relstr_deletes,
  (select count(*) from del_people) as people_deleted;

-- Step 2 — dedupe interactions by (org, deal, counterparty, occurred_at).
-- Keep the oldest of each group. waiting_overrides references via
-- counterparty_name text key, not interactions.id — no cascade concerns.
with grp as (
  select org_id, deal_id, lower(trim(counterparty_name)) as cp, occurred_at,
    (array_agg(id order by created_at))[2:] as duplicates
  from public.interactions
  where occurred_at is not null and counterparty_name is not null
  group by 1,2,3,4
  having count(*) > 1
),
flat as (select unnest(duplicates) as dupe_id from grp)
delete from public.interactions i using flat f where i.id = f.dupe_id;

-- Step 3 — lock it in.
create unique index if not exists people_org_email_uniq
  on public.people (org_id, lower(trim(email)))
  where email is not null and email like '%@%.%';

create unique index if not exists interactions_org_external_uniq
  on public.interactions (org_id, external_id)
  where external_id is not null;
