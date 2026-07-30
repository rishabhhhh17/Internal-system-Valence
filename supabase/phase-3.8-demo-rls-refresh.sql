-- ValenceOS · Phase 3.8 — Demo-mode RLS refresh
-- ============================================================================
-- Re-applies `demo_anon_select` + `demo_anon_write` policies to EVERY
-- operational table in the public schema. Safe to re-run anytime.
--
-- WHY: a memo publish on /knowledge/shared returned "new row violates
-- row-level security policy for table 'documents'". Root cause: the
-- demo_anon_* policies on `documents` (and a handful of foundational
-- tables) had been stripped — likely when hardening.sql was re-run
-- after the initial demo-open-rls.sql pass.
--
-- This script enumerates every public table and (re)applies the demo
-- pair, so demo-mode writes work end-to-end.
--
-- DO NOT run this on production. Drop the demo_anon_* policies + flip
-- the App.jsx auth gate from `if (false && ...)` to `if (...)` to lock
-- down for real users.
-- ============================================================================

do $$
declare
  t text;
  tables text[] := array[
    -- Foundational (schema.sql)
    'deals','activities','meetings','tasks','contacts','documents','comps',
    'deal_checklist','deal_team','deal_comments','deal_files',
    'deal_shares','deal_share_access',
    'knowledge_files','knowledge_chunks','share_access_logs',
    -- Phase 0 v2
    'daily_notes',
    -- Phase 1
    'people','interactions','funds','fund_contacts','deal_fund_pings',
    'screener_runs','screener_criteria','intake_submissions',
    'meeting_intelligence',
    -- Phase 2
    'kb_folders','kb_notes','kb_mentions',
    -- Phase 3
    'team_calendars','calendar_events',
    -- Phase 3.5
    'fit_criteria','fit_assessments'
  ];
begin
  foreach t in array tables loop
    if not exists (
      select 1 from pg_tables where schemaname = 'public' and tablename = t
    ) then
      raise notice 'Skipping % — table does not exist', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists demo_anon_select on public.%I', t);
    execute format('create policy demo_anon_select on public.%I for select to anon using (true)', t);

    execute format('drop policy if exists demo_anon_write on public.%I', t);
    execute format('create policy demo_anon_write on public.%I for all to anon using (true) with check (true)', t);
  end loop;
end $$;

-- ============================================================================
-- Verification (paste after the script above runs):
-- ============================================================================
-- select tablename,
--        bool_or(policyname = 'demo_anon_select') as has_select,
--        bool_or(policyname = 'demo_anon_write')  as has_write
-- from pg_tables t
-- left join pg_policies p
--   on p.schemaname = t.schemaname and p.tablename = t.tablename
-- where t.schemaname = 'public'
-- group by tablename
-- order by tablename;
-- Expect every operational table to have has_select=true and has_write=true.
