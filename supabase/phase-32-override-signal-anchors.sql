-- ============================================================================
-- ValenceOS · Phase 32 — signal_anchor on override tables
-- ----------------------------------------------------------------------------
-- Overrides used to apply forever, even after the underlying signal
-- naturally reset:
--   * banker marks "Helix · 14d stale" done → logs activity →
--     14 days later the deal is stale AGAIN with a NEW last_activity
--     timestamp → the old override silently hid it
--   * banker resolves a Waiting On row → sends another email weeks
--     later, no reply → email_silent signal forms with the SAME
--     (deal, counterparty) key → the old override still hid it
--
-- Fix: store an opaque signal_anchor text with the override at write
-- time. The client compares it to the current signal's anchor and
-- ignores any override whose anchor doesn't match. The row stays around
-- (audit trail + the override is restored if the same anchor returns,
-- which is useful for cyclical signals), but stops applying once the
-- underlying state has moved.
--
-- Anchor convention (client-determined, opaque to the DB):
--   priority stale-<deal>     → 'stale:'   + last_activity ISO
--   priority closing-<deal>   → 'closing:' + target_close ISO
--   priority int-<interaction>→ 'int:'     + follow_up_date ISO
--   waiting follow_up_overdue → since ISO from compute_waiting_for_org
--   waiting email_silent      → since ISO from compute_waiting_for_org
--
-- Idempotent. Safe to re-run.
-- ============================================================================

alter table public.priority_overrides
  add column if not exists signal_anchor text;
alter table public.waiting_overrides
  add column if not exists signal_anchor text;

-- Update RPCs to accept and store signal_anchor. ON CONFLICT also
-- refreshes the anchor so a fresh resolve on a new signal state writes
-- the new anchor cleanly.

create or replace function public.priority_resolve(
  p_priority_key text,
  p_note text default null,
  p_signal_anchor text default null
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
    (org_id, priority_key, resolved_at, resolved_note, signal_anchor, updated_at)
  values
    (v_org, p_priority_key, now(), p_note, p_signal_anchor, now())
  on conflict (org_id, priority_key) do update
    set resolved_at = now(),
        resolved_note = coalesce(excluded.resolved_note, public.priority_overrides.resolved_note),
        signal_anchor = excluded.signal_anchor,
        snoozed_until = null,
        updated_at = now()
  returning * into v_row;
  return v_row;
end; $$;

create or replace function public.priority_snooze(
  p_priority_key text,
  p_days int default 3,
  p_signal_anchor text default null
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
    (org_id, priority_key, snoozed_until, signal_anchor, resolved_at, updated_at)
  values
    (v_org, p_priority_key, now() + make_interval(days => p_days), p_signal_anchor, null, now())
  on conflict (org_id, priority_key) do update
    set snoozed_until = excluded.snoozed_until,
        signal_anchor = excluded.signal_anchor,
        resolved_at = null,
        updated_at = now()
  returning * into v_row;
  return v_row;
end; $$;

create or replace function public.waiting_snooze(
  p_deal_id uuid,
  p_counterparty_name text,
  p_days int default 3,
  p_signal_anchor text default null
) returns public.waiting_overrides
language plpgsql security invoker as $$
declare
  v_org_id uuid;
  v_row public.waiting_overrides;
begin
  if p_counterparty_name is null or btrim(p_counterparty_name) = '' then
    raise exception 'counterparty_name required';
  end if;
  if p_days < 1 or p_days > 30 then
    raise exception 'snooze days must be 1..30';
  end if;
  select org_id into v_org_id from public.deals where id = p_deal_id;
  if v_org_id is null then raise exception 'deal not found'; end if;

  insert into public.waiting_overrides
    (org_id, deal_id, counterparty_key, snoozed_until, signal_anchor, resolved_at, updated_at)
  values
    (v_org_id, p_deal_id, lower(btrim(p_counterparty_name)),
     now() + make_interval(days => p_days), p_signal_anchor, null, now())
  on conflict (org_id, deal_id, counterparty_key) do update
    set snoozed_until = excluded.snoozed_until,
        signal_anchor = excluded.signal_anchor,
        resolved_at = null,
        updated_at = now()
  returning * into v_row;
  return v_row;
end; $$;

create or replace function public.waiting_resolve(
  p_deal_id uuid,
  p_counterparty_name text,
  p_note text default null,
  p_signal_anchor text default null
) returns public.waiting_overrides
language plpgsql security invoker as $$
declare
  v_org_id uuid;
  v_row public.waiting_overrides;
begin
  if p_counterparty_name is null or btrim(p_counterparty_name) = '' then
    raise exception 'counterparty_name required';
  end if;
  select org_id into v_org_id from public.deals where id = p_deal_id;
  if v_org_id is null then raise exception 'deal not found'; end if;

  insert into public.waiting_overrides
    (org_id, deal_id, counterparty_key, resolved_at, resolved_note, signal_anchor, updated_at)
  values
    (v_org_id, p_deal_id, lower(btrim(p_counterparty_name)),
     now(), p_note, p_signal_anchor, now())
  on conflict (org_id, deal_id, counterparty_key) do update
    set resolved_at = now(),
        resolved_note = coalesce(excluded.resolved_note, public.waiting_overrides.resolved_note),
        signal_anchor = excluded.signal_anchor,
        snoozed_until = null,
        updated_at = now()
  returning * into v_row;
  return v_row;
end; $$;

revoke all on function public.priority_resolve(text, text, text) from public;
revoke all on function public.priority_snooze(text, int, text)   from public;
revoke all on function public.waiting_snooze(uuid, text, int, text)   from public;
revoke all on function public.waiting_resolve(uuid, text, text, text) from public;
grant execute on function public.priority_resolve(text, text, text)   to authenticated;
grant execute on function public.priority_snooze(text, int, text)     to authenticated;
grant execute on function public.waiting_snooze(uuid, text, int, text)   to authenticated;
grant execute on function public.waiting_resolve(uuid, text, text, text) to authenticated;
