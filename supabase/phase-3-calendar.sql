-- ============================================================================
-- Phase 3.3 — Team Calendar overlay
-- ============================================================================
-- Stores team-member calendars + the events on them. The Google Calendar
-- integration is deferred to a future phase (Workspace OAuth needs a Calendar
-- scope wired in). For the demo, calendars and events are written directly
-- via the app and re-render in the overlay.
--
-- `google_calendar_id` is nullable. When set + the user has connected their
-- Google account, sync logic will populate `calendar_events` from the
-- Calendar API. Without it, events are app-local.
--
-- Idempotent.
-- ============================================================================

create table if not exists public.team_calendars (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  owner_email         text,
  color               text not null default 'blue',
  google_calendar_id  text,
  is_active           boolean not null default true,
  lead_owner          text,
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists team_calendars_active_idx on public.team_calendars (is_active);
create index if not exists team_calendars_owner_email_idx on public.team_calendars (lower(owner_email));

create table if not exists public.calendar_events (
  id           uuid primary key default gen_random_uuid(),
  calendar_id  uuid not null references public.team_calendars(id) on delete cascade,
  title        text not null,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  location     text,
  attendees    jsonb not null default '[]'::jsonb,
  description  text,
  deal_id      uuid references public.deals(id) on delete set null,
  meeting_kind text,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint calendar_events_time_chk check (ends_at > starts_at)
);

create index if not exists calendar_events_calendar_id_idx on public.calendar_events (calendar_id);
create index if not exists calendar_events_starts_at_idx   on public.calendar_events (starts_at);
create index if not exists calendar_events_deal_id_idx     on public.calendar_events (deal_id);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.team_calendars enable row level security;
alter table public.calendar_events enable row level security;

drop policy if exists team_calendars_select_authenticated on public.team_calendars;
create policy team_calendars_select_authenticated on public.team_calendars
  for select using (auth.role() = 'authenticated');

drop policy if exists team_calendars_write_authenticated on public.team_calendars;
create policy team_calendars_write_authenticated on public.team_calendars
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists calendar_events_select_authenticated on public.calendar_events;
create policy calendar_events_select_authenticated on public.calendar_events
  for select using (auth.role() = 'authenticated');

drop policy if exists calendar_events_write_authenticated on public.calendar_events;
create policy calendar_events_write_authenticated on public.calendar_events
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Demo-mode anon RLS — see HANDOFF.md gotcha #4. Drop these to lock the demo
-- back down for production.
drop policy if exists demo_anon_select on public.team_calendars;
create policy demo_anon_select on public.team_calendars for select to anon using (true);
drop policy if exists demo_anon_write on public.team_calendars;
create policy demo_anon_write on public.team_calendars for all to anon using (true) with check (true);

drop policy if exists demo_anon_select on public.calendar_events;
create policy demo_anon_select on public.calendar_events for select to anon using (true);
drop policy if exists demo_anon_write on public.calendar_events;
create policy demo_anon_write on public.calendar_events for all to anon using (true) with check (true);

-- ----------------------------------------------------------------------------
-- Audit triggers
-- ----------------------------------------------------------------------------
drop trigger if exists team_calendars_audit_update on public.team_calendars;
create trigger team_calendars_audit_update before update on public.team_calendars
  for each row execute function public.set_audit_update();

drop trigger if exists calendar_events_audit_update on public.calendar_events;
create trigger calendar_events_audit_update before update on public.calendar_events
  for each row execute function public.set_audit_update();
