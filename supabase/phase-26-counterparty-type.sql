-- =============================================================================
-- Phase 26 — Counterparty type (founder / investor / general) + auto-backfill
-- =============================================================================
-- Top ask from the partner call: "spent too much time on founder meetings and
-- not enough on LP meetings" — a glance-able visual cue across calendar,
-- interactions, and team views. Three types map to the IB workflow:
--
--   founder   = client side: companies we're advising on a mandate.
--               In VC-speak: the founders pitching.
--   investor  = counterparty side: funds, PE, strategics — the LPs of the
--               world. The buyers in a sell-side mandate.
--   general   = everyone else: lawyers, accountants, internal team,
--               networking, conferences.
--
-- Idempotent. Safe to re-run.
-- =============================================================================

-- ============ Columns ============
alter table public.interactions
  add column if not exists counterparty_type text;

alter table public.calendar_events
  add column if not exists counterparty_type text;

-- Constraint added in a separate DO so we don't fail if the value already
-- exists from a previous partial run.
do $$ begin
  alter table public.interactions
    add constraint interactions_counterparty_type_chk
    check (counterparty_type is null or counterparty_type in ('founder','investor','general'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.calendar_events
    add constraint calendar_events_counterparty_type_chk
    check (counterparty_type is null or counterparty_type in ('founder','investor','general'));
exception when duplicate_object then null; end $$;

-- Indexes so the team-distribution view aggregates cheaply.
create index if not exists interactions_counterparty_type_idx
  on public.interactions (counterparty_type)
  where counterparty_type is not null;

create index if not exists calendar_events_counterparty_type_idx
  on public.calendar_events (counterparty_type)
  where counterparty_type is not null;

-- ============ Backfill: interactions ============
-- Order matters: person.tags wins over interaction_purpose because tags
-- are the more reliable signal (manually curated per-person), purpose
-- is a free-form-y enum that captures intent but not always identity.
--
-- 1. If person is tagged founder/client → founder
-- 2. If person is tagged investor/fund/lp/fund-principal → investor
-- 3. If counterparty_company matches a row in public.funds → investor
-- 4. Otherwise lean on interaction_purpose:
--      pitch_for_mandate    → founder  (we're pitching FOR a mandate;
--                                       the counterparty is a potential
--                                       client/founder)
--      counterparty_outreach → investor (we have a mandate, reaching
--                                        out to funds/buyers)
--      relationship_building → general
--      referral              → general
-- 5. Last resort → general
update public.interactions i
set counterparty_type = sub.t
from (
  select
    i2.id,
    coalesce(
      -- Layer 1: person tags
      (select case
         when p.tags && array['founder','client']                                 then 'founder'
         when p.tags && array['investor','fund','fund-principal','lp','sovereign'] then 'investor'
         else null
       end
       from public.people p where p.id = i2.person_id),
      -- Layer 2: fund-name match
      (select 'investor' from public.funds f
        where lower(f.name) = lower(coalesce(i2.counterparty_company,''))
        limit 1),
      -- Layer 3: purpose
      case i2.interaction_purpose
        when 'pitch_for_mandate'     then 'founder'
        when 'counterparty_outreach' then 'investor'
        when 'relationship_building' then 'general'
        when 'referral'              then 'general'
      end,
      'general'
    ) as t
  from public.interactions i2
  where i2.counterparty_type is null
) sub
where i.id = sub.id and i.counterparty_type is null;

-- ============ Backfill: calendar_events ============
-- 1. If deal_id is set and meeting_kind is intro/phone → founder
--    (mandate-scoped meetings are with the client we're advising)
-- 2. If any attendee email looks like a fund domain → investor
-- 3. If meeting_kind is pitch_meeting → investor
--    (in our schema pitch_meeting = pitching the deal to funds)
-- 4. Else general
update public.calendar_events e
set counterparty_type = sub.t
from (
  select
    e2.id,
    coalesce(
      -- Fund-domain hint from attendees
      (select 'investor' from jsonb_array_elements(coalesce(e2.attendees, '[]'::jsonb)) a
        where a->>'email' is not null
          and (lower(a->>'email') ~ '@(.*?)(capital|ventures|partners|vc|fund|lp|invest|pe)\.'
               or lower(a->>'email') ~ '@(brookfield|kkr|carlyle|blackstone|gic|temasek|mubadala|apollo|kedaara|bain|chryscap|premji|peakxv|sequoia|lightspeed|norwest|multiples)\.')
        limit 1),
      -- Pitch meetings in our schema = pitching deals to funds
      case when e2.meeting_kind = 'pitch_meeting' then 'investor' end,
      -- Mandate-scoped calls/intros = client-side
      case when e2.deal_id is not null and e2.meeting_kind in ('intro_call','phone_call','coffee') then 'founder' end,
      'general'
    ) as t
  from public.calendar_events e2
  where e2.counterparty_type is null
) sub
where e.id = sub.id and e.counterparty_type is null;

-- ============ Verification ============
-- Counts after backfill — useful for the post-paste sanity check.
-- (Returned to the caller as the query result.)
select 'interactions: founder'  as t, count(*)::int as n from public.interactions where counterparty_type = 'founder'
union all
select 'interactions: investor',     count(*)::int from public.interactions where counterparty_type = 'investor'
union all
select 'interactions: general',      count(*)::int from public.interactions where counterparty_type = 'general'
union all
select 'interactions: unclassified', count(*)::int from public.interactions where counterparty_type is null
union all
select 'calendar: founder',          count(*)::int from public.calendar_events where counterparty_type = 'founder'
union all
select 'calendar: investor',         count(*)::int from public.calendar_events where counterparty_type = 'investor'
union all
select 'calendar: general',          count(*)::int from public.calendar_events where counterparty_type = 'general'
union all
select 'calendar: unclassified',     count(*)::int from public.calendar_events where counterparty_type is null
order by t;
