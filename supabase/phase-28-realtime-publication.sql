-- ============================================================================
-- ValenceOS · Phase 28 — Realtime publication (multi-user sync)
-- ----------------------------------------------------------------------------
-- subscribeTable() in src/lib/supabase.js opens a postgres_changes channel
-- on a given table. Those channels only fire for tables listed in the
-- `supabase_realtime` publication. Until now the publication contained
-- ONLY `notifications`, so every other client-side subscription
-- (interactions, deals, daily_notes, etc.) has been a silent no-op —
-- teammates' writes did not propagate to other open Today / Deals / Team
-- Calendar tabs without a hard refresh. The "Today updates live" claim
-- on the KPI strip + Pulse + Priorities was a lie.
--
-- This phase adds every table the React app already subscribes to, plus
-- the new Phase 27 waiting_overrides / waiting_thresholds tables so
-- cross-teammate snooze/resolve actions push instantly.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

do $$
declare
  t text;
  tables text[] := array[
    'interactions',
    'deals',
    'waiting_overrides',
    'waiting_thresholds',
    'daily_notes',
    'activities',
    'calendar_events',
    'meeting_intelligence',
    'people'
  ];
begin
  foreach t in array tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
