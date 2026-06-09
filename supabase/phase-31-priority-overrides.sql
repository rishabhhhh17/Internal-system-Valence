-- ============================================================================
-- ValenceOS · Phase 31 — Priority overrides
-- ----------------------------------------------------------------------------
-- Today's Priorities card had no clear-it-from-the-list affordance.
-- Bankers had to open the source interaction and edit its outcome, OR
-- log a new touch on the same counterparty and wait for the detector
-- to drop the row. Friction.
--
-- This phase mirrors Phase 27's waiting_overrides — same lifecycle model,
-- shared across teammates, keyed on a string so the same table can hold
-- any priority kind:
--   * 'stale-<deal_id>'   for stale-mandate rows
--   * 'closing-<deal_id>' for close-window rows
--   * 'int-<interaction>' for overdue follow-up rows
--
-- waiting_overrides keys on (deal, counterparty) because that's the
-- semantic dedupe key for a counterparty signal. Priorities are
-- heterogeneous so we use the p.id string the React side already
-- assigns — fewer moving parts, no schema coupling between the two.
--
-- The detector still computes the raw list every render. We just FILTER
-- by override state on the client. Source-of-truth stays the interaction
-- row, so the firm's audit history is intact: a "marked done" priority
-- still appears on the interactions timeline forever.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

create table if not exists public.priority_overrides (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  priority_key    text not null,
  snoozed_until   timestamptz,
  resolved_at     timestamptz,
  resolved_note   text,
  created_by      uuid default auth.uid(),
  updated_at      timestamptz not null default now(),
  unique (org_id, priority_key)
);

create index if not exists priority_overrides_org_idx
  on public.priority_overrides (org_id);
create index if not exists priority_overrides_active_idx
  on public.priority_overrides (org_id, priority_key) where resolved_at is null;

alter table public.priority_overrides enable row level security;

drop policy if exists priority_overrides_select on public.priority_overrides;
create policy priority_overrides_select on public.priority_overrides
  for select using (org_id in (select org_id from public.seats where user_id = auth.uid()));

drop policy if exists priority_overrides_write on public.priority_overrides;
create policy priority_overrides_write on public.priority_overrides
  for all using (org_id in (select org_id from public.seats where user_id = auth.uid()))
  with check (org_id in (select org_id from public.seats where user_id = auth.uid()));

-- RPC helpers. SECURITY INVOKER so the seat-RLS applies.
create or replace function public.priority_resolve(
  p_priority_key text,
  p_note text default null
) returns public.priority_overrides
language plpgsql security invoker as $$
declare
  v_org uuid;
  v_row public.priority_overrides;
begin
  if p_priority_key is null or btrim(p_priority_key) = '' then
    raise exception 'priority_key required';
  end if;
  select org_id into v_org from public.seats where user_id = auth.uid() limit 1;
  if v_org is null then raise exception 'no seat'; end if;
  insert into public.priority_overrides
    (org_id, priority_key, resolved_at, resolved_note, updated_at)
  values
    (v_org, p_priority_key, now(), p_note, now())
  on conflict (org_id, priority_key) do update
    set resolved_at = now(),
        resolved_note = coalesce(excluded.resolved_note, public.priority_overrides.resolved_note),
        snoozed_until = null,
        updated_at = now()
  returning * into v_row;
  return v_row;
end; $$;

create or replace function public.priority_snooze(
  p_priority_key text,
  p_days int default 3
) returns public.priority_overrides
language plpgsql security invoker as $$
declare
  v_org uuid;
  v_row public.priority_overrides;
begin
  if p_priority_key is null or btrim(p_priority_key) = '' then
    raise exception 'priority_key required';
  end if;
  if p_days < 1 or p_days > 30 then
    raise exception 'snooze days must be 1..30';
  end if;
  select org_id into v_org from public.seats where user_id = auth.uid() limit 1;
  if v_org is null then raise exception 'no seat'; end if;
  insert into public.priority_overrides
    (org_id, priority_key, snoozed_until, resolved_at, updated_at)
  values
    (v_org, p_priority_key, now() + make_interval(days => p_days), null, now())
  on conflict (org_id, priority_key) do update
    set snoozed_until = excluded.snoozed_until,
        resolved_at = null,
        updated_at = now()
  returning * into v_row;
  return v_row;
end; $$;

-- Undo for the 5-second toast. Clears both resolved_at and snoozed_until
-- by DELETEing the row so a subsequent resolve writes cleanly on conflict.
create or replace function public.priority_unresolve(
  p_priority_key text
) returns void
language plpgsql security invoker as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.seats where user_id = auth.uid() limit 1;
  if v_org is null then return; end if;
  delete from public.priority_overrides
   where org_id = v_org and priority_key = p_priority_key;
end; $$;

revoke all on function public.priority_resolve(text, text) from public;
revoke all on function public.priority_snooze(text, int)   from public;
revoke all on function public.priority_unresolve(text)     from public;
grant execute on function public.priority_resolve(text, text) to authenticated;
grant execute on function public.priority_snooze(text, int)   to authenticated;
grant execute on function public.priority_unresolve(text)     to authenticated;

-- Realtime publication — teammates see clears within ~1.5s.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and tablename='priority_overrides'
  ) then
    alter publication supabase_realtime add table public.priority_overrides;
  end if;
end $$;
