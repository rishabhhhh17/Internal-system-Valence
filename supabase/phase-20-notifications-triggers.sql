-- =============================================================================
-- Phase 20 — Notifications: triggers
-- =============================================================================
-- Four deterministic events fire notifications via triggers:
--   stage_change         — deals.stage text column changed
--   new_deal             — row inserted into deals; auto-watches creator,
--                          notifies all OTHER active seats in the same org
--   task_assigned        — tasks.assignee_id changed (or set on insert)
--   document_uploaded    — row inserted into deal_files
--
-- The fifth event (`reminder_due`) is fired by an edge function on a cron,
-- not a trigger — see supabase/functions/check-reminders/index.ts.
--
-- The sixth (`mention`) is fired by the client when a note/comment is saved
-- — see src/lib/notifications.js. Triggers can't see the mention list
-- because mentions live in the editor JSON, not in dedicated columns we'd
-- index on insert.
--
-- All trigger functions are SECURITY DEFINER so they can write to
-- public.notifications across users (RLS would otherwise block).
-- Idempotent.
-- =============================================================================

-- ============ stage_change ============
-- Fires when deals.stage changes. Notifies every watcher of the deal
-- (except the user who made the change).
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
      '/deals/' || new.id
    from public.deal_watchers w
    where w.deal_id = new.id
      and (actor is null or w.user_id <> actor);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_deals_notify_stage_change on public.deals;
create trigger trg_deals_notify_stage_change
  after update of stage on public.deals
  for each row execute function public.notify_stage_change();

-- ============ new_deal ============
-- On insert: (a) auto-add the creator to deal_watchers, (b) notify every
-- OTHER active seat in the creator's org. If actor or org is unknown
-- (server-side insert with no JWT), we skip the team broadcast but still
-- create the row.
create or replace function public.notify_new_deal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor  uuid := auth.uid();
  actor_org uuid;
begin
  -- Tag the row with the creator if the app didn't set it explicitly.
  if new.created_by is null and actor is not null then
    new.created_by := actor;
  end if;

  -- Auto-subscribe the creator (or the explicit created_by) as a watcher.
  if new.created_by is not null then
    insert into public.deal_watchers (deal_id, user_id)
    values (new.id, new.created_by)
    on conflict do nothing;
  end if;

  -- Broadcast to other active seats in the same org. Best-effort: if we
  -- can't resolve the actor's org (e.g. seed-script insert), skip.
  if actor is not null then
    select org_id into actor_org
    from public.seats
    where user_id = actor and active
    order by added_at asc
    limit 1;

    if actor_org is not null then
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
        actor,
        new.id,
        '/deals/' || new.id
      from public.seats s
      where s.org_id = actor_org
        and s.active
        and s.user_id is not null
        and s.user_id <> actor;
    end if;
  end if;

  return new;
end;
$$;

-- BEFORE INSERT so we can set new.created_by; the watcher+notification
-- inserts then happen using the resolved created_by.
drop trigger if exists trg_deals_notify_new_deal on public.deals;
create trigger trg_deals_notify_new_deal
  before insert on public.deals
  for each row execute function public.notify_new_deal();

-- ============ task_assigned ============
-- Fires whenever assignee_id is set (insert with non-null assignee, OR
-- update changing the assignee). Notifies the NEW assignee, not the old
-- one (unassignment is silent — no point ringing someone for losing work).
create or replace function public.notify_task_assigned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
begin
  if new.assignee_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.assignee_id is not distinct from old.assignee_id then
    return new;
  end if;
  if new.assignee_id = actor then
    return new;  -- don't notify yourself
  end if;

  insert into public.notifications (
    user_id, type, title, body, actor_id, task_id, link
  ) values (
    new.assignee_id,
    'task_assigned',
    'Task assigned: ' || new.title,
    case when new.due_date is not null
         then 'Due ' || to_char(new.due_date, 'Mon DD')
         else null end,
    actor,
    new.id,
    '/today'
  );

  return new;
end;
$$;

drop trigger if exists trg_tasks_notify_assigned on public.tasks;
create trigger trg_tasks_notify_assigned
  after insert or update of assignee_id on public.tasks
  for each row execute function public.notify_task_assigned();

-- ============ document_uploaded ============
-- Fires when a row lands in deal_files. Notifies every watcher of the
-- parent deal EXCEPT the uploader. deal_files has no uploader column
-- today; we use auth.uid() at trigger time.
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
    return new;  -- unattached files don't fire
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
    '/deals/' || new.deal_id
  from public.deal_watchers w
  where w.deal_id = new.deal_id
    and (actor is null or w.user_id <> actor);

  return new;
end;
$$;

drop trigger if exists trg_deal_files_notify_uploaded on public.deal_files;
create trigger trg_deal_files_notify_uploaded
  after insert on public.deal_files
  for each row execute function public.notify_document_uploaded();
