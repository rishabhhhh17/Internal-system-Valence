-- =============================================================================
-- Phase 22 — Deal stage history (aging report data)
-- =============================================================================
-- Tracks every (deal, stage) window: when the deal entered the stage,
-- when it exited (NULL = currently in this stage), and who moved it.
--
-- Powers the /reports/aging page (stalled-deals view) and the
-- Stage History tab on a deal detail. Days-in-stage is a generated
-- column so queries don't need to do the date math themselves.
--
-- A trigger keeps the table in sync on every deal insert + every
-- update of deals.stage. A one-time backfill seeds the rows for the
-- deals that existed before this migration ran.
--
-- Idempotent. Safe to re-run.
-- =============================================================================

-- ============ Table ============
create table if not exists public.deal_stage_history (
  id            uuid primary key default gen_random_uuid(),
  deal_id       uuid not null references public.deals(id) on delete cascade,
  stage         text not null,                 -- text mirror of deals.stage; no FK because deals.stage is itself text
  entered_at    timestamptz not null default now(),
  exited_at     timestamptz,                   -- NULL while the deal is currently in this stage
  moved_by      uuid references auth.users(id) on delete set null
);
-- Note: tried GENERATED ALWAYS AS (... now() ...) for days_in_stage —
-- Postgres rejects it (generated expressions must be immutable, now() is
-- volatile). Computing days client-side from entered_at/exited_at is
-- cheap and avoids a view. AgingReport.jsx does it inline.

create index if not exists deal_stage_history_deal_idx
  on public.deal_stage_history (deal_id, entered_at desc);

-- One open row per deal at any time. Query the partial index to find
-- "what stage is each deal currently in" without scanning the whole table.
create index if not exists deal_stage_history_open_idx
  on public.deal_stage_history (deal_id) where exited_at is null;

alter table public.deal_stage_history enable row level security;

drop policy if exists deal_stage_history_read on public.deal_stage_history;
create policy deal_stage_history_read on public.deal_stage_history
  for select to authenticated using (true);

-- Writes are trigger-only — no client should ever insert directly. Lock
-- the policy down so a buggy migration of client code can't corrupt the
-- history. SECURITY DEFINER trigger function bypasses this.
drop policy if exists deal_stage_history_no_client_writes on public.deal_stage_history;
create policy deal_stage_history_no_client_writes on public.deal_stage_history
  for all to authenticated using (false) with check (false);

-- ============ Trigger ============
-- On insert: open a row at the deal's initial stage, entered_at = now().
-- On update: if stage changed, close the current open row (set exited_at)
-- and open a new row for the new stage.
create or replace function public.track_deal_stage_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.deal_stage_history (deal_id, stage, moved_by)
    values (new.id, new.stage, actor);
    return new;
  end if;

  if tg_op = 'UPDATE' and new.stage is distinct from old.stage then
    -- Close the currently-open row (if any). There SHOULD be exactly
    -- one, but the update is idempotent in case of stale data.
    update public.deal_stage_history
       set exited_at = now()
     where deal_id = new.id and exited_at is null;

    insert into public.deal_stage_history (deal_id, stage, moved_by)
    values (new.id, new.stage, actor);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_deals_track_stage_history on public.deals;
create trigger trg_deals_track_stage_history
  after insert or update of stage on public.deals
  for each row execute function public.track_deal_stage_history();

-- ============ Backfill ============
-- Seed an open row for every existing deal at its current stage. Uses
-- the deal's created_at as the proxy for entered_at — best we can do
-- without an authoritative history. Only fires once per deal (the WHERE
-- NOT EXISTS clause makes it idempotent).
insert into public.deal_stage_history (deal_id, stage, entered_at, moved_by)
select d.id, d.stage, d.created_at, null
from public.deals d
where d.stage is not null
  and not exists (
    select 1 from public.deal_stage_history h where h.deal_id = d.id
  );
