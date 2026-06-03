-- ============================================================================
-- ValenceOS · Phase 27b — Waiting On: email-silence blocker
-- ----------------------------------------------------------------------------
-- Extends Phase 27. The Chrome extension already captures Gmail threads
-- into the interactions table; api/capture.js now stamps each with
-- interaction_type='email_sent' or 'email_received' based on who sent
-- the last visible message, and resolves deal_id via the contacts join.
--
-- This phase teaches compute_waiting_for_org to detect a SECOND blocker
-- kind: 'email_silent' — the last interaction on (deal, counterparty)
-- was outbound and no inbound has happened since.
--
-- Threshold lives in a new waiting_thresholds table (one row per org).
-- Defaults: 3 days for email silence.
--
-- Idempotent.
-- ============================================================================

create table if not exists public.waiting_thresholds (
  org_id              uuid primary key references public.orgs(id) on delete cascade,
  email_silent_days   int not null default 3 check (email_silent_days between 1 and 60),
  follow_up_grace_days int not null default 0 check (follow_up_grace_days between 0 and 14),
  updated_at          timestamptz not null default now()
);

alter table public.waiting_thresholds enable row level security;

drop policy if exists waiting_thresholds_select on public.waiting_thresholds;
create policy waiting_thresholds_select on public.waiting_thresholds
  for select using (org_id in (select org_id from public.seats where user_id = auth.uid()));

drop policy if exists waiting_thresholds_write on public.waiting_thresholds;
create policy waiting_thresholds_write on public.waiting_thresholds
  for all using (org_id in (select org_id from public.seats where user_id = auth.uid()))
  with check (org_id in (select org_id from public.seats where user_id = auth.uid()));

-- Replace the detector. Now returns TWO blocker_kind values:
--   'follow_up_overdue' — manual to_followup with past follow_up_date
--   'email_silent'      — last outbound email > threshold days, no inbound
-- The waiting_overrides table is shared by both — snooze/resolve on the
-- same (deal, counterparty) silences either kind.
create or replace function public.compute_waiting_for_org(p_org_id uuid)
returns table (
  deal_id              uuid,
  client_name          text,
  counterparty_name    text,
  counterparty_company text,
  counterparty_type    text,
  blocker_kind         text,
  days_blocked         int,
  since                timestamptz,
  last_interaction_id  uuid,
  last_subject         text,
  follow_up_date       date,
  snoozed_until        timestamptz
)
language sql stable security invoker as $$
  with thresholds as (
    select
      coalesce((select email_silent_days from public.waiting_thresholds where org_id = p_org_id), 3) as email_silent_days
  ),
  -- A) manual follow_up_overdue (Phase 27 logic)
  manual_signal as (
    select distinct on (i.deal_id, lower(trim(i.counterparty_name)))
      i.deal_id,
      i.id                                  as last_interaction_id,
      i.counterparty_name,
      i.counterparty_company,
      i.counterparty_type,
      i.follow_up_date,
      coalesce(i.subject, i.notes)          as last_subject,
      coalesce(i.occurred_at, i.created_at) as since,
      lower(trim(i.counterparty_name))      as counterparty_key,
      'follow_up_overdue'::text             as blocker_kind,
      greatest((current_date - i.follow_up_date)::int, 1) as days_blocked
    from public.interactions i
    where i.org_id = p_org_id
      and i.outcome = 'to_followup'
      and i.follow_up_date is not null
      and i.follow_up_date < current_date
      and i.counterparty_name is not null
      and i.deal_id is not null
    order by i.deal_id,
             lower(trim(i.counterparty_name)),
             coalesce(i.occurred_at, i.created_at) desc
  ),
  -- B) email_silent (Phase 27b — Gmail-derived)
  email_signal as (
    select distinct on (i.deal_id, lower(trim(i.counterparty_name)))
      i.deal_id,
      i.id                                  as last_interaction_id,
      i.counterparty_name,
      i.counterparty_company,
      i.counterparty_type,
      null::date                            as follow_up_date,
      coalesce(i.subject, i.notes)          as last_subject,
      coalesce(i.occurred_at, i.created_at) as since,
      lower(trim(i.counterparty_name))      as counterparty_key,
      'email_silent'::text                  as blocker_kind,
      greatest(
        extract(day from now() - coalesce(i.occurred_at, i.created_at))::int,
        1
      ) as days_blocked
    from public.interactions i
    where i.org_id = p_org_id
      and i.interaction_type = 'email_sent'
      and i.counterparty_name is not null
      and i.deal_id is not null
      and coalesce(i.occurred_at, i.created_at) < now() - make_interval(days => (select email_silent_days from thresholds))
    order by i.deal_id,
             lower(trim(i.counterparty_name)),
             coalesce(i.occurred_at, i.created_at) desc
  ),
  -- Drop rows where a more recent interaction with the same (deal,
  -- counterparty) has already happened — that counts as a response.
  -- For email_silent we specifically need a later email_received OR meeting
  -- to count as "they replied"; for follow_up_overdue ANY later interaction
  -- counts (Phase 27 semantics preserved).
  manual_unresolved as (
    select m.*
    from manual_signal m
    where not exists (
      select 1 from public.interactions later
      where later.org_id = p_org_id
        and later.deal_id = m.deal_id
        and lower(trim(later.counterparty_name)) = m.counterparty_key
        and coalesce(later.occurred_at, later.created_at) > m.since
    )
  ),
  email_unresolved as (
    select e.*
    from email_signal e
    where not exists (
      select 1 from public.interactions later
      where later.org_id = p_org_id
        and later.deal_id = e.deal_id
        and lower(trim(later.counterparty_name)) = e.counterparty_key
        and coalesce(later.occurred_at, later.created_at) > e.since
        and later.interaction_type in ('email_received', 'meeting', 'call_logged')
    )
  ),
  -- Union the two streams, then dedupe per (deal, counterparty) preferring
  -- the manual blocker (banker said "follow up" explicitly — that beats a
  -- generic email silence on the same thread).
  all_blockers as (
    select * from manual_unresolved
    union all
    select * from email_unresolved
  ),
  deduped as (
    select distinct on (deal_id, counterparty_key) *
    from all_blockers
    order by deal_id, counterparty_key,
             case blocker_kind when 'follow_up_overdue' then 0 else 1 end,
             days_blocked desc
  ),
  with_override as (
    select d.*,
           wo.snoozed_until,
           wo.resolved_at
    from deduped d
    left join public.waiting_overrides wo
      on wo.org_id = p_org_id
     and wo.deal_id = d.deal_id
     and wo.counterparty_key = d.counterparty_key
  )
  select
    wo.deal_id,
    dl.client_name,
    wo.counterparty_name,
    wo.counterparty_company,
    wo.counterparty_type,
    wo.blocker_kind,
    wo.days_blocked,
    wo.since,
    wo.last_interaction_id,
    wo.last_subject,
    wo.follow_up_date,
    wo.snoozed_until
  from with_override wo
  join public.deals dl on dl.id = wo.deal_id
  where wo.resolved_at is null
    and (wo.snoozed_until is null or wo.snoozed_until <= now())
    and dl.stage not in ('Lost','On Hold','Closed')
  order by wo.days_blocked desc, wo.since asc;
$$;

revoke all on function public.compute_waiting_for_org(uuid) from public;
grant execute on function public.compute_waiting_for_org(uuid) to authenticated;
