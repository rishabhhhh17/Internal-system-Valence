-- Phase 16 — Chrome extension auto-capture.
-- =========================================================================
-- Adds an `external_id` column to interactions so the /api/capture
-- endpoint can dedupe Gmail threads + Calendar events:
--   external_id = 'gmail:<thread_id>'
--   external_id = 'gcal:<event_id>'
-- Same thread / event POSTed twice from the extension is a no-op rather
-- than a duplicate row.
-- =========================================================================

alter table public.interactions
  add column if not exists external_id text;

create unique index if not exists interactions_org_external_unique
  on public.interactions (org_id, external_id)
  where external_id is not null;

-- The /api/capture endpoint runs under the user's Supabase JWT, so the
-- existing tenant_isolation RLS policies on `interactions` and `people`
-- already gate writes to org_id = current_user_org_id(). No new policies
-- needed for this phase.
