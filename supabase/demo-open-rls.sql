-- ValenceOS · Demo-mode RLS opener
-- For the demo-1 Supabase project ONLY. This grants anon (unauthenticated)
-- visitors full read AND write access to every operational table so the app
-- works end-to-end without anyone having to sign in.
--
-- DO NOT run this on a production project. To revert, drop the demo_anon_*
-- policies — the original `*_authenticated` policies stay in place.

-- ============ READ + WRITE FOR ANON ============
-- One pair of policies per table. Idempotent.

do $$
declare
  t text;
  tables text[] := array[
    'deals','activities','meetings','tasks','contacts','documents','comps',
    'knowledge_files','deal_files','deal_shares','deal_share_access',
    'interactions','funds','fund_contacts','deal_fund_pings',
    'screener_runs','screener_criteria','intake_submissions',
    'meeting_intelligence','share_access_logs'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists demo_anon_select on public.%I', t);
    execute format('create policy demo_anon_select on public.%I for select to anon using (true)', t);

    execute format('drop policy if exists demo_anon_write on public.%I', t);
    execute format('create policy demo_anon_write on public.%I for all to anon using (true) with check (true)', t);
  end loop;
end $$;
