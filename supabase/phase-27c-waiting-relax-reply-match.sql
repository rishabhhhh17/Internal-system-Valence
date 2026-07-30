-- ============================================================================
-- ValenceOS · Phase 27c — Waiting On: relax what clears email_silent
-- ----------------------------------------------------------------------------
-- Phase 27b's email_unresolved CTE only treated email_received / meeting /
-- call_logged as "they replied". That left legacy interaction_type values
-- (whatsapp, pitch_meeting, phone_call, email_thread) unable to clear a
-- silent outbound email — so a banker who took a WhatsApp follow-up call
-- would still see "No reply" in Waiting On.
--
-- Now any later interaction that ISN'T another outbound email_sent counts
-- as a response. Symmetric with manual_unresolved's "any later interaction"
-- behaviour.
--
-- Idempotent.
-- ============================================================================

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
    select coalesce((select email_silent_days from public.waiting_thresholds where org_id = p_org_id), 3) as email_silent_days
  ),
  manual_signal as (
    select distinct on (i.deal_id, lower(trim(i.counterparty_name)))
      i.deal_id, i.id as last_interaction_id,
      i.counterparty_name, i.counterparty_company, i.counterparty_type,
      i.follow_up_date,
      coalesce(i.subject, i.notes) as last_subject,
      coalesce(i.occurred_at, i.created_at) as since,
      lower(trim(i.counterparty_name)) as counterparty_key,
      'follow_up_overdue'::text as blocker_kind,
      greatest((current_date - i.follow_up_date)::int, 1) as days_blocked
    from public.interactions i
    where i.org_id = p_org_id
      and i.outcome = 'to_followup'
      and i.follow_up_date is not null
      and i.follow_up_date < current_date
      and i.counterparty_name is not null
      and i.deal_id is not null
    order by i.deal_id, lower(trim(i.counterparty_name)), coalesce(i.occurred_at, i.created_at) desc
  ),
  email_signal as (
    select distinct on (i.deal_id, lower(trim(i.counterparty_name)))
      i.deal_id, i.id as last_interaction_id,
      i.counterparty_name, i.counterparty_company, i.counterparty_type,
      null::date as follow_up_date,
      coalesce(i.subject, i.notes) as last_subject,
      coalesce(i.occurred_at, i.created_at) as since,
      lower(trim(i.counterparty_name)) as counterparty_key,
      'email_silent'::text as blocker_kind,
      greatest(extract(day from now() - coalesce(i.occurred_at, i.created_at))::int, 1) as days_blocked
    from public.interactions i
    where i.org_id = p_org_id
      and i.interaction_type = 'email_sent'
      and i.counterparty_name is not null
      and i.deal_id is not null
      and coalesce(i.occurred_at, i.created_at) < now() - make_interval(days => (select email_silent_days from thresholds))
    order by i.deal_id, lower(trim(i.counterparty_name)), coalesce(i.occurred_at, i.created_at) desc
  ),
  manual_unresolved as (
    select m.* from manual_signal m
    where not exists (
      select 1 from public.interactions later
      where later.org_id = p_org_id
        and later.deal_id = m.deal_id
        and lower(trim(later.counterparty_name)) = m.counterparty_key
        and coalesce(later.occurred_at, later.created_at) > m.since
    )
  ),
  -- Relaxed: any later interaction that isn't another outbound email_sent
  -- clears the silence (covers WhatsApp / phone_call / pitch_meeting /
  -- email_thread / new-style email_received / call_logged / meeting).
  email_unresolved as (
    select e.* from email_signal e
    where not exists (
      select 1 from public.interactions later
      where later.org_id = p_org_id
        and later.deal_id = e.deal_id
        and lower(trim(later.counterparty_name)) = e.counterparty_key
        and coalesce(later.occurred_at, later.created_at) > e.since
        and coalesce(later.interaction_type, '') <> 'email_sent'
    )
  ),
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
    select d.*, wo.snoozed_until, wo.resolved_at
    from deduped d
    left join public.waiting_overrides wo
      on wo.org_id = p_org_id and wo.deal_id = d.deal_id and wo.counterparty_key = d.counterparty_key
  )
  select
    wo.deal_id, dl.client_name, wo.counterparty_name, wo.counterparty_company,
    wo.counterparty_type, wo.blocker_kind, wo.days_blocked, wo.since,
    wo.last_interaction_id, wo.last_subject, wo.follow_up_date, wo.snoozed_until
  from with_override wo
  join public.deals dl on dl.id = wo.deal_id
  where wo.resolved_at is null
    and (wo.snoozed_until is null or wo.snoozed_until <= now())
    and dl.stage not in ('Lost','On Hold','Closed')
  order by wo.days_blocked desc, wo.since asc;
$$;

revoke all on function public.compute_waiting_for_org(uuid) from public;
grant execute on function public.compute_waiting_for_org(uuid) to authenticated;
