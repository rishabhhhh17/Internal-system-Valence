-- ============================================================
-- ValanceOS · Hardening fix — drop ALL stale anon policies
-- ============================================================
-- Our audit found that deals/documents/tasks/meetings still allow
-- anon reads. That means there's at least one leftover permissive
-- policy on each with a name we didn't drop by name. This block
-- drops EVERY existing policy on the 11 internal tables and
-- re-creates the single authenticated-only policy.
--
-- Safe to re-run. Won't touch deal_shares / deal_share_access /
-- deal_files which have intentional anon exceptions.
-- ============================================================

-- Step 1: Show me everything that currently exists (diagnostic)
select tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('deals','documents','tasks','meetings','contacts','activities',
                    'comps','knowledge_files','knowledge_chunks','deal_checklist',
                    'deal_team','deal_comments')
order by tablename, policyname;

-- Step 2: Drop every policy on every internal table, then recreate
-- the canonical authenticated-only one. Using a DO block so we can
-- enumerate dynamically.
do $$
declare
  t text;
  p text;
  tables text[] := array[
    'deals','documents','tasks','meetings','contacts','activities',
    'comps','knowledge_files','knowledge_chunks','deal_checklist',
    'deal_team','deal_comments'
  ];
begin
  foreach t in array tables loop
    for p in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I', p, t);
    end loop;
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_auth', t
    );
  end loop;
end $$;

-- Step 3: Verify — the only policy on each of these 11 tables
-- should now be <tablename>_auth, scoped to {authenticated}.
select tablename, policyname, roles
from pg_policies
where schemaname = 'public'
  and tablename in ('deals','documents','tasks','meetings','contacts','activities',
                    'comps','knowledge_files','knowledge_chunks','deal_checklist',
                    'deal_team','deal_comments')
order by tablename, policyname;
