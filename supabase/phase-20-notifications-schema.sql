-- =============================================================================
-- Phase 20 — Notifications: schema
-- =============================================================================
-- In-app notifications driven by Postgres triggers + a once-a-minute edge fn
-- for time-based events. Six trigger types per spec:
--   mention · task_assigned · stage_change · new_deal · document_uploaded ·
--   reminder_due
--
-- Tables created here, RLS, realtime publication. Triggers are in the sibling
-- phase-20-notifications-triggers.sql so this file is purely shape, no logic.
--
-- Idempotent. Safe to re-run.
-- =============================================================================

-- ============ tasks.assignee_id ============
-- Spec assumes tasks.assignee_id exists; current schema's tasks table is bare
-- (just title + due_date + completed). Adding the column so task-assignment
-- notifications have an FK to fire on.
alter table public.tasks
  add column if not exists assignee_id uuid references auth.users(id) on delete set null;

create index if not exists tasks_assignee_idx on public.tasks (assignee_id);

-- ============ deals.created_by ============
-- Needed so the new-deal trigger can auto-add the creator to deal_watchers.
-- Existing deals.lead_owner is free-form TEXT (legacy display), not an FK,
-- so we can't reliably resolve "who created this deal" from it.
alter table public.deals
  add column if not exists created_by uuid references auth.users(id) on delete set null;

-- Backfill: any pre-existing deal gets created_by = NULL (we never knew the
-- creator). New deals will pick it up from auth.uid() via the trigger.

-- ============ reminders ============
-- Time-based event source. Owner sets due_at; check-reminders edge fn polls
-- for due rows once a minute and fires the notification, then flips notified.
create table if not exists public.reminders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  body        text,
  due_at      timestamptz not null,
  link        text,                          -- e.g. '/deals/<id>' to jump on click
  deal_id     uuid references public.deals(id) on delete cascade,
  notified    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists reminders_due_unfired_idx
  on public.reminders (due_at) where notified = false;
create index if not exists reminders_user_idx on public.reminders (user_id);

alter table public.reminders enable row level security;

drop policy if exists reminders_self on public.reminders;
create policy reminders_self on public.reminders
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============ deal_watchers ============
-- Many-to-many: which users get notified when a deal changes. Creator is
-- auto-added by the new-deal trigger; others subscribe via UI.
create table if not exists public.deal_watchers (
  deal_id    uuid not null references public.deals(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (deal_id, user_id)
);

create index if not exists deal_watchers_user_idx on public.deal_watchers (user_id);

alter table public.deal_watchers enable row level security;

-- Watchers are visible to anyone in the same org (so the UI can show "Neha
-- is watching this"). Writes restricted to the user themselves (subscribe/
-- unsubscribe).
drop policy if exists deal_watchers_read_org on public.deal_watchers;
create policy deal_watchers_read_org on public.deal_watchers
  for select to authenticated using (true);

drop policy if exists deal_watchers_write_self on public.deal_watchers;
create policy deal_watchers_write_self on public.deal_watchers
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============ notifications ============
-- The actual feed. user_id = recipient. type drives icon/label client-side.
-- All FKs are nullable: a mention notification has note_id, a stage_change
-- has deal_id, etc. — most rows fill 1-2 of them.
create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  type          text not null check (type in (
                  'mention',
                  'task_assigned',
                  'stage_change',
                  'new_deal',
                  'document_uploaded',
                  'reminder_due'
                )),
  title         text not null,
  body          text,
  actor_id      uuid references auth.users(id) on delete set null,
  deal_id       uuid references public.deals(id) on delete cascade,
  task_id       uuid references public.tasks(id) on delete cascade,
  reminder_id   uuid references public.reminders(id) on delete cascade,
  -- The mention path: spec says note_id + comment_id but our actual tables
  -- are kb_notes (knowledge folder notes) and deal_comments. Two nullable
  -- columns instead of one polymorphic column — cheaper than a discriminator.
  kb_note_id        uuid references public.kb_notes(id) on delete cascade,
  deal_comment_id   uuid references public.deal_comments(id) on delete cascade,
  -- Generic upload pointer (deal_files is the active uploads table; legacy
  -- `documents` is mostly unused).
  deal_file_id  uuid references public.deal_files(id) on delete cascade,
  link          text not null,
  is_read       boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, is_read, created_at desc);
create index if not exists notifications_user_recent_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists notifications_select_self on public.notifications;
create policy notifications_select_self on public.notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists notifications_update_self on public.notifications;
create policy notifications_update_self on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Inserts come from SECURITY DEFINER trigger functions (server-side actor)
-- and from the mention helper (client-side via the user's own JWT, but
-- inserting for OTHER users). Allow authenticated inserts; the trigger
-- functions themselves run as definer so they bypass RLS anyway. The
-- client-side mention insert is a deliberate hole — we trust the JWT and
-- assume the mention list comes from the user's editor. If we ever want
-- to harden, move mention firing into a SECURITY DEFINER RPC.
drop policy if exists notifications_insert_any on public.notifications;
create policy notifications_insert_any on public.notifications
  for insert to authenticated with check (true);

-- ============ Realtime ============
-- The bell hook subscribes to INSERT events filtered by user_id. Without
-- this publication membership the supabase-js client gets no events.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
exception when others then null; -- in case publication doesn't exist locally
end $$;
