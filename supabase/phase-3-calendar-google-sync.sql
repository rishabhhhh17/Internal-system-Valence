-- ============================================================================
-- Phase 3.4 — Google Calendar sync columns
-- ============================================================================
-- Adds `google_event_id` to calendar_events so we can upsert (insert-or-update)
-- on every Google Calendar sync without duplicating rows.
--
-- Apply AFTER phase-3-calendar.sql (and the fixup if you ran it). Idempotent.
-- ============================================================================

alter table public.calendar_events
  add column if not exists google_event_id text;

-- Unique per (calendar_id, google_event_id) — but only when google_event_id
-- is non-null, so manually-created (app-local) events stay unconstrained.
do $$ begin
  create unique index calendar_events_google_uniq
    on public.calendar_events (calendar_id, google_event_id)
    where google_event_id is not null;
exception when duplicate_table then null; end $$;

create index if not exists calendar_events_google_event_id_idx
  on public.calendar_events (google_event_id) where google_event_id is not null;
