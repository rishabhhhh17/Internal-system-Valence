-- =============================================================================
-- Phase 25 — Notification fixes (3 HIGH bugs from the post-merge audit)
-- =============================================================================
-- 1. Triggers emit /deals/<id> which 404s — the codebase's canonical pattern
--    is /deals?open=<id>. Affects stage_change + document_uploaded + new_deal.
-- 2. notifications.insert policy was `with check (true)` — any signed-in user
--    could fabricate notification rows for any uuid (incl. fake mentions
--    forged as another partner). Tighten so writes require self-involvement.
-- 3. notify_new_deal resolved actor_org from auth.uid(), not new.created_by.
--    Server-side seeds / admin paths that explicitly set created_by could
--    therefore fan-out notifications to the wrong org's seats.
--
-- Idempotent — uses CREATE OR REPLACE for fns, DROP/CREATE for the policy.
-- =============================================================================

-- ============ Bug 2: tighten notifications insert policy ============
-- Server-side triggers run as SECURITY DEFINER and bypass RLS, so they're
-- unaffected. The remaining client-side write path is notifyMentions(),
-- which inserts rows where actor_id = the current user — that path stays
-- allowed by the new policy. Anything else (a malicious devtools insert
-- targeting another user with a forged actor) is now blocked.
drop policy if exists notifications_insert_any on public.notifications;
create policy notifications_insert_self_involved on public.notifications
  for insert to authenticated
  with check (
    user_id = auth.uid()      -- you can write to your own bell (rare path; reminders fire this way client-side if ever needed)
    or actor_id = auth.uid()  -- or you're the one doing the mentioning
  );

-- ============ Bug 1 + 3: fix notify_stage_change link ============
create or replace function public.notify_stage_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
begin
  if new.stage is distinct from old.stage then
    insert into public.notifications (
      user_id, type, title, body, actor_id, deal_id, link
    )
    select
      w.user_id,
      'stage_change',
      new.client_name || ' moved to ' || coalesce(new.stage, '(no stage)'),
      'Previous stage: ' || coalesce(old.stage, '(none)'),
      actor,
      new.id,
      '/deals?open=' || new.id          -- was '/deals/' || new.id (404)
    from public.deal_watchers w
    where w.deal_id = new.id
      and (actor is null or w.user_id <> actor);
  end if;
  return new;
end;
$$;

-- ============ Bug 1 + 3: fix notify_new_deal link AND org resolution ============
-- actor_org now comes from the resolved created_by (the canonical creator),
-- not from auth.uid(). This matters when server-side or admin paths set
-- created_by explicitly to a user different from the SQL session's auth.uid().
create or replace function public.notify_new_deal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor       uuid := auth.uid();
  creator_org uuid;
begin
  -- Tag the row with the creator if the app didn't set it explicitly.
  if new.created_by is null and actor is not null then
    new.created_by := actor;
  end if;

  -- Auto-subscribe the creator as a watcher.
  if new.created_by is not null then
    insert into public.deal_watchers (deal_id, user_id)
    values (new.id, new.created_by)
    on conflict do nothing;
  end if;

  -- Broadcast to other active seats in the CREATOR's org (not the JWT's
  -- org — they can differ on service-role inserts). Best-effort: skip if
  -- created_by is null or has no active seat.
  if new.created_by is not null then
    select org_id into creator_org
    from public.seats
    where user_id = new.created_by and active
    order by added_at asc
    limit 1;

    if creator_org is not null then
      insert into public.notifications (
        user_id, type, title, body, actor_id, deal_id, link
      )
      select
        s.user_id,
        'new_deal',
        'New mandate added: ' || new.client_name,
        case
          when new.sector is not null then 'Sector: ' || new.sector
          else null
        end,
        new.created_by,                              -- actor = canonical creator
        new.id,
        '/deals?open=' || new.id                     -- was '/deals/' || new.id
      from public.seats s
      where s.org_id = creator_org
        and s.active
        and s.user_id is not null
        and s.user_id <> new.created_by;
    end if;
  end if;

  return new;
end;
$$;

-- ============ Bug 1: fix notify_document_uploaded link ============
create or replace function public.notify_document_uploaded()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  deal_name text;
begin
  if new.deal_id is null then
    return new;
  end if;

  select client_name into deal_name from public.deals where id = new.deal_id;

  insert into public.notifications (
    user_id, type, title, body, actor_id, deal_id, deal_file_id, link
  )
  select
    w.user_id,
    'document_uploaded',
    'New file on ' || coalesce(deal_name, 'a mandate'),
    new.name,
    actor,
    new.deal_id,
    new.id,
    '/deals?open=' || new.deal_id        -- was '/deals/' || new.deal_id
  from public.deal_watchers w
  where w.deal_id = new.deal_id
    and (actor is null or w.user_id <> actor);

  return new;
end;
$$;

-- Triggers themselves don't need re-attachment — they reference the
-- functions by name, and CREATE OR REPLACE swapped the bodies in place.
