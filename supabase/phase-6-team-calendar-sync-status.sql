-- ValenceOS · Phase 6 — Team-calendar per-row sync status
-- Idempotent. Paste end-to-end into Supabase SQL Editor.
--
-- Tracks the result of the most recent Google sync attempt for each
-- team_calendars row so the UI can surface "✓ synced 2m ago" vs
-- "⚠️ awaiting share" without making the user dig through dev tools.

alter table public.team_calendars add column if not exists last_synced_at  timestamptz;
alter table public.team_calendars add column if not exists last_sync_status text;     -- 'ok' | 'forbidden' | 'error' | 'auth_expired'
alter table public.team_calendars add column if not exists last_sync_error  text;

-- Cheap index for the right rail's order-by-status query.
create index if not exists team_calendars_sync_status_idx
  on public.team_calendars (last_sync_status);
