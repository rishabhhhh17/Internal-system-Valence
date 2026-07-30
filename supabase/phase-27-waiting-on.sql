-- ============================================================================
-- ValenceOS · Phase 27 — Waiting On
-- ----------------------------------------------------------------------------
-- Today page has a "Waiting on" card that until now only flagged mandates
-- whose nda_status was 'Pending'. That's a tiny slice of "blocked on someone
-- else." This phase wires the card to real signal sources:
--
--   1. Banker logs an interaction with outcome='to_followup' + follow_up_date.
--   2. If that date passes AND no later interaction has been logged with the
--      same (deal_id, counterparty_name), it shows up in Waiting on.
--   3. Users can snooze (push the visible date forward) or resolve (drop it
--      until the next stale signal). State lives in waiting_overrides.
--
-- Future phases extend this same surface with email-silence / doc-pending /
-- promise-late signals — they all write rows into the interactions table
-- and reuse the same detection function.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

-- 1. waiting_overrides — per (deal, counterparty) snooze/resolve state.
--    counterparty matched by lowercased name (deals often have multiple
--    rows per counterparty across firms; we match on the name string
--    the banker logged, normalised).
create table if not exists public.waiting_overrides (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs(id) on delete cascade,
  deal_id             uuid not null references public.deals(id) on delete cascade,
  counterparty_key    text not null,                       -- lower(trim(counterparty_name))
  snoozed_until       timestamptz,
  resolved_at         timestamptz,
  resolved_note       text,
  created_by          uuid default auth.uid(),
  updated_at          timestamptz not null default now(),
  unique (org_id, deal_id, counterparty_key)
);

create index if not exists waiting_overrides_org_idx
  on public.waiting_overrides (org_id);
create index if not exists waiting_overrides_deal_idx
  on public.waiting_overrides (deal_id);
create index if not exists waiting_overrides_active_idx
  on public.waiting_overrides (org_id, deal_id, counterparty_key)
  where resolved_at is null;

alter table public.waiting_overrides enable row level security;

drop policy if exists waiting_overrides_select on public.waiting_overrides;
create policy waiting_overrides_select on public.waiting_overrides
  for select using (
    org_id in (select org_id from public.seats where user_id = auth.uid())
  );

drop policy if exists waiting_overrides_write on public.waiting_overrides;
create policy waiting_overrides_write on public.waiting_overrides
  for all using (
    org_id in (select org_id from public.seats where user_id = auth.uid())
  ) with check (
    org_id in (select org_id from public.seats where user_id = auth.uid())
  );

-- 2. compute_waiting_for_org — pure-SQL detection function. Stable, indexed,
--    cheap enough to call on every Today page mount. No materialisation
--    needed until volume warrants it.
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
language sql
stable
security invoker
as $$
  with last_signal as (
    -- Latest "to_followup" interaction per (deal, counterparty key) whose
    -- follow_up_date has now passed. distinct on collapses duplicates so
    -- we only see the most recent unresolved nudge per counterparty.
    select distinct on (i.deal_id, lower(trim(i.counterparty_name)))
      i.deal_id,
      i.id                                  as last_interaction_id,
      i.counterparty_name,
      i.counterparty_company,
      i.counterparty_type,
      i.follow_up_date,
      coalesce(i.subject, i.notes)          as last_subject,
      coalesce(i.occurred_at, i.created_at) as since,
      lower(trim(i.counterparty_name))      as counterparty_key
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
  with_later as (
    -- Drop rows where a more recent interaction with the same (deal,
    -- counterparty) has already happened — that counts as a response,
    -- the ball is no longer in their court.
    select ls.*
    from last_signal ls
    where not exists (
      select 1
      from public.interactions later
      where later.org_id = p_org_id
        and later.deal_id = ls.deal_id
        and lower(trim(later.counterparty_name)) = ls.counterparty_key
        and coalesce(later.occurred_at, later.created_at) > ls.since
    )
  ),
  with_override as (
    select wl.*,
           wo.snoozed_until,
           wo.resolved_at
    from with_later wl
    left join public.waiting_overrides wo
      on wo.org_id = p_org_id
     and wo.deal_id = wl.deal_id
     and wo.counterparty_key = wl.counterparty_key
  )
  select
    wo.deal_id,
    d.client_name,
    wo.counterparty_name,
    wo.counterparty_company,
    wo.counterparty_type,
    'follow_up_overdue'::text                            as blocker_kind,
    greatest((current_date - wo.follow_up_date)::int, 1) as days_blocked,
    wo.since,
    wo.last_interaction_id,
    wo.last_subject,
    wo.follow_up_date,
    wo.snoozed_until
  from with_override wo
  join public.deals d on d.id = wo.deal_id
  where wo.resolved_at is null
    and (wo.snoozed_until is null or wo.snoozed_until <= now())
    and d.stage not in ('Lost', 'On Hold', 'Closed')
  order by days_blocked desc, since asc;
$$;

revoke all on function public.compute_waiting_for_org(uuid) from public;
grant execute on function public.compute_waiting_for_org(uuid) to authenticated;

-- 3. snooze / resolve helpers — keep override writes atomic and validated.
create or replace function public.waiting_snooze(
  p_deal_id uuid,
  p_counterparty_name text,
  p_days int default 3
) returns public.waiting_overrides
language plpgsql
security invoker
as $$
declare
  v_org_id uuid;
  v_row    public.waiting_overrides;
begin
  if p_counterparty_name is null or btrim(p_counterparty_name) = '' then
    raise exception 'counterparty_name required';
  end if;
  if p_days < 1 or p_days > 30 then
    raise exception 'snooze days must be 1..30';
  end if;

  select org_id into v_org_id from public.deals where id = p_deal_id;
  if v_org_id is null then
    raise exception 'deal not found';
  end if;

  insert into public.waiting_overrides
    (org_id, deal_id, counterparty_key, snoozed_until, resolved_at, updated_at)
  values
    (v_org_id, p_deal_id, lower(btrim(p_counterparty_name)),
     now() + make_interval(days => p_days), null, now())
  on conflict (org_id, deal_id, counterparty_key) do update
    set snoozed_until = excluded.snoozed_until,
        resolved_at   = null,
        updated_at    = now()
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.waiting_snooze(uuid, text, int) from public;
grant execute on function public.waiting_snooze(uuid, text, int) to authenticated;

create or replace function public.waiting_resolve(
  p_deal_id uuid,
  p_counterparty_name text,
  p_note text default null
) returns public.waiting_overrides
language plpgsql
security invoker
as $$
declare
  v_org_id uuid;
  v_row    public.waiting_overrides;
begin
  if p_counterparty_name is null or btrim(p_counterparty_name) = '' then
    raise exception 'counterparty_name required';
  end if;
  select org_id into v_org_id from public.deals where id = p_deal_id;
  if v_org_id is null then
    raise exception 'deal not found';
  end if;

  insert into public.waiting_overrides
    (org_id, deal_id, counterparty_key, resolved_at, resolved_note, updated_at)
  values
    (v_org_id, p_deal_id, lower(btrim(p_counterparty_name)),
     now(), p_note, now())
  on conflict (org_id, deal_id, counterparty_key) do update
    set resolved_at   = now(),
        resolved_note = coalesce(excluded.resolved_note, public.waiting_overrides.resolved_note),
        snoozed_until = null,
        updated_at    = now()
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.waiting_resolve(uuid, text, text) from public;
grant execute on function public.waiting_resolve(uuid, text, text) to authenticated;
