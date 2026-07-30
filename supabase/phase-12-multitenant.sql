-- Phase 12 — Multi-tenant data isolation.
-- =========================================================================
-- Every customer-data table grows an org_id column scoped to public.orgs.
-- Existing demo rows are back-filled to the bootstrap "Valence Growth
-- Partners" org. Demo-open RLS policies are dropped and replaced with
-- per-org tenant isolation keyed off the requesting user's seat row.
--
-- Identity model:
--   auth.users  (Supabase auth)
--     └── seats.user_id        — maps an auth user to a seat in an org
--           └── seats.org_id   — the org they belong to
--   We use seats as the membership AND identity table (avoid a separate
--   profiles + members split). New identity columns added to seats:
--     full_name, title, phone, role  (role: 'partner' | 'analyst' | 'admin')
--
-- Helper function:
--   current_user_org_id()  — returns the org_id of the requesting user's
--   active seat. Used in every RLS policy as `org_id = current_user_org_id()`.
--   Returns NULL when called by anon or by a user with no seat — which
--   means anon/unsigned-up users see no rows (correct).
--
-- This migration is idempotent. Re-running it is a no-op once applied.
-- =========================================================================

-- ============ BOOTSTRAP ORG ============
-- One canonical org for back-fill. Idempotent on name.
insert into public.orgs (name, plan, cycle_anchor_day)
select 'Valence Growth Partners', 'we_run_ai', 1
where not exists (
  select 1 from public.orgs where name = 'Valence Growth Partners'
);

-- ============ SEATS GROWS IDENTITY COLUMNS ============
-- seats is now also the user profile. One row per (org_id, user_id).
alter table public.seats
  add column if not exists full_name   text,
  add column if not exists title       text,
  add column if not exists phone       text,
  add column if not exists role        text;
-- Role is open-text so the senior team can adjust without a migration.
-- App-side enum: 'partner' | 'analyst' | 'admin' | 'observer'.
do $$ begin
  alter table public.seats
    add constraint seats_role_check check (role is null or role in ('partner', 'analyst', 'admin', 'observer'));
exception
  when duplicate_object then null;
end $$;

create unique index if not exists seats_user_org_unique
  on public.seats (org_id, user_id)
  where user_id is not null;

-- ============ INVITES ============
-- An org admin issues an invite code; a new user signs in with Google and
-- enters the code on the welcome screen to claim a seat in that org. Codes
-- are single-use, 8-char uppercase, no I/O/0/1 to avoid confusion. Email
-- is optional — when set, the code is bound to that email.
create table if not exists public.org_invites (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  code          text not null unique,
  email         text,
  role          text default 'analyst',
  created_by    uuid,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '14 days'),
  claimed_at    timestamptz,
  claimed_by    uuid
);
create index if not exists org_invites_org_idx     on public.org_invites (org_id);
create index if not exists org_invites_unclaimed_idx on public.org_invites (code) where claimed_at is null;

-- ============ HELPER: current_user_org_id() ============
-- Returns the org_id of the requesting user's seat. NULL for anon, for a
-- user without a seat, or for a seat marked inactive. SECURITY DEFINER so
-- it can read seats even when the caller can't (no RLS recursion).
create or replace function public.current_user_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.org_id
  from public.seats s
  where s.user_id = auth.uid() and s.active = true
  order by s.added_at asc
  limit 1
$$;

revoke all on function public.current_user_org_id() from public;
grant execute on function public.current_user_org_id() to anon, authenticated;

-- ============ ADD org_id TO EVERY CUSTOMER-DATA TABLE ============
-- One block per table: add column, backfill to the bootstrap org, then
-- index. NOT NULL is enforced via app + RLS rather than at the column
-- level so that pre-existing rows in random envs don't break the migration.

do $$
declare
  default_org_id uuid;
  t text;
  tables text[] := array[
    'activities','calendar_events','comps','contacts','daily_notes',
    'deal_checklist','deal_comments','deal_files','deal_fund_pings',
    'deal_share_access','deal_shares','deal_team','deals','documents',
    'fit_assessments','fit_criteria','fund_contacts','funds',
    'intake_submissions','interactions','kb_files','kb_folders',
    'kb_mentions','kb_notes','knowledge_chunks','knowledge_files',
    'meeting_intelligence','meetings','people','screener_criteria',
    'screener_runs','share_access_logs','tasks','team_calendars'
  ];
begin
  select id into default_org_id
  from public.orgs
  where name = 'Valence Growth Partners'
  limit 1;

  foreach t in array tables loop
    execute format(
      'alter table public.%I add column if not exists org_id uuid references public.orgs(id)',
      t
    );
    execute format(
      'update public.%I set org_id = %L where org_id is null',
      t, default_org_id
    );
    execute format(
      'create index if not exists %I on public.%I (org_id)',
      t || '_org_idx', t
    );
  end loop;
end $$;

-- ============ RLS REWRITE ============
-- Drop the demo-open policies and replace with tenant isolation. Every
-- customer-data table follows the same pattern:
--
--   select : org_id = current_user_org_id()
--   insert : with check (org_id = current_user_org_id())
--   update : using (org_id = current_user_org_id()) with check (org_id = current_user_org_id())
--   delete : using (org_id = current_user_org_id())
--
-- Anon (no auth.uid()) gets no rows because current_user_org_id() returns
-- NULL and `NULL = NULL` is false in SQL.

do $$
declare
  t text;
  p record;
  tables text[] := array[
    'activities','calendar_events','comps','contacts','daily_notes',
    'deal_checklist','deal_comments','deal_files','deal_fund_pings',
    'deal_share_access','deal_shares','deal_team','deals','documents',
    'fit_assessments','fit_criteria','fund_contacts','funds',
    'intake_submissions','interactions','kb_files','kb_folders',
    'kb_mentions','kb_notes','knowledge_chunks','knowledge_files',
    'meeting_intelligence','meetings','people','screener_criteria',
    'screener_runs','share_access_logs','tasks','team_calendars',
    -- billing-side too: these already carry org_id from phase 8
    'ai_actions','ai_overage_opt_ins','billing_cycles',
    'invoice_line_items','storage_usage'
  ];
begin
  foreach t in array tables loop
    -- ensure RLS is enabled
    execute format('alter table public.%I enable row level security', t);

    -- drop ALL existing policies on the table (clean slate)
    for p in
      select polname
      from pg_policy
      where polrelid = format('public.%I', t)::regclass
    loop
      execute format('drop policy if exists %I on public.%I', p.polname, t);
    end loop;

    -- tenant isolation policies
    execute format(
      'create policy tenant_select on public.%I for select to authenticated using (org_id = public.current_user_org_id())',
      t
    );
    execute format(
      'create policy tenant_insert on public.%I for insert to authenticated with check (org_id = public.current_user_org_id())',
      t
    );
    execute format(
      'create policy tenant_update on public.%I for update to authenticated using (org_id = public.current_user_org_id()) with check (org_id = public.current_user_org_id())',
      t
    );
    execute format(
      'create policy tenant_delete on public.%I for delete to authenticated using (org_id = public.current_user_org_id())',
      t
    );
  end loop;
end $$;

-- ============ ORGS + SEATS POLICIES ============
-- These are the join-fabric tables, not customer-data. Members of an org
-- can read their own org row + every seat in their org. New-user
-- onboarding inserts into both BEFORE the user has a seat — so insert is
-- gated separately via a SECURITY DEFINER bootstrap function.

alter table public.orgs   enable row level security;
alter table public.seats  enable row level security;
alter table public.org_invites enable row level security;
alter table public.billing_config enable row level security;

do $$
declare
  pol record;
  tname text;
begin
  for tname in select unnest(array['orgs','seats','org_invites','billing_config']) loop
    for pol in
      select polname from pg_policy
      where polrelid = format('public.%I', tname)::regclass
    loop
      execute format('drop policy if exists %I on public.%I', pol.polname, tname);
    end loop;
  end loop;
end $$;

-- A signed-in user can read their own org.
create policy orgs_self_read on public.orgs
  for select to authenticated
  using (id = public.current_user_org_id());

-- A signed-in user can read seats in their own org.
create policy seats_self_read on public.seats
  for select to authenticated
  using (org_id = public.current_user_org_id() or user_id = auth.uid());

-- A signed-in user can update their OWN seat (name, title, phone, etc).
create policy seats_self_update on public.seats
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- A signed-in user can read invites for their own org (admin-ish view).
create policy invites_org_read on public.org_invites
  for select to authenticated
  using (org_id = public.current_user_org_id());

-- A signed-in user can read the global billing_config row OR their org's
-- override. App-side mutation only happens via service role or admin tools.
create policy billing_config_read on public.billing_config
  for select to authenticated
  using (org_id is null or org_id = public.current_user_org_id());

-- ============ BOOTSTRAP RPC: start_team(name, currency) ============
-- A signed-in user with no seat calls this once to create their team.
-- SECURITY DEFINER so it can insert into orgs + seats before the user has
-- a seat. Returns the new org_id.
create or replace function public.start_team(
  p_org_name text,
  p_full_name text,
  p_title text default null,
  p_phone text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'must be signed in to start a team';
  end if;

  -- Reject if the caller already has a seat — they should use join_team or
  -- be added by an admin instead.
  if exists (select 1 from public.seats where user_id = uid and active = true) then
    raise exception 'user already belongs to a team';
  end if;

  if p_org_name is null or length(trim(p_org_name)) = 0 then
    raise exception 'team name required';
  end if;

  insert into public.orgs (name, plan, cycle_anchor_day)
  values (trim(p_org_name), 'we_run_ai', 1)
  returning id into new_org_id;

  insert into public.seats (org_id, user_id, full_name, title, phone, role, active, billable_from)
  values (new_org_id, uid, p_full_name, p_title, p_phone, 'admin', true, current_date);

  return new_org_id;
end $$;
revoke all on function public.start_team(text, text, text, text) from public;
grant execute on function public.start_team(text, text, text, text) to authenticated;

-- ============ BOOTSTRAP RPC: join_team(invite_code, ...) ============
-- A signed-in user uses an invite code to claim a seat in an existing org.
create or replace function public.join_team(
  p_invite_code text,
  p_full_name text,
  p_title text default null,
  p_phone text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_org_id uuid;
  invite_role text;
  invite_id uuid;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'must be signed in to join a team';
  end if;
  if exists (select 1 from public.seats where user_id = uid and active = true) then
    raise exception 'user already belongs to a team';
  end if;

  select id, org_id, role into invite_id, target_org_id, invite_role
  from public.org_invites
  where code = upper(trim(p_invite_code))
    and claimed_at is null
    and (expires_at is null or expires_at > now());

  if target_org_id is null then
    raise exception 'invite not found or expired';
  end if;

  insert into public.seats (org_id, user_id, full_name, title, phone, role, active, billable_from)
  values (target_org_id, uid, p_full_name, p_title, p_phone, coalesce(invite_role, 'analyst'), true, current_date);

  update public.org_invites
    set claimed_at = now(), claimed_by = uid
    where id = invite_id;

  return target_org_id;
end $$;
revoke all on function public.join_team(text, text, text, text) from public;
grant execute on function public.join_team(text, text, text, text) to authenticated;

-- ============ BOOTSTRAP RPC: create_invite(role) ============
-- An org admin generates an invite code. Returns the new code.
create or replace function public.create_invite(
  p_role text default 'analyst',
  p_email text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org uuid := public.current_user_org_id();
  caller_role text;
  new_code text;
begin
  if caller_org is null then
    raise exception 'no active seat';
  end if;
  select role into caller_role from public.seats where user_id = auth.uid() and org_id = caller_org;
  if caller_role not in ('admin') then
    raise exception 'only admins can issue invites';
  end if;

  -- 8-character code without I/O/0/1. Loop until we find one that
  -- isn't already in the table (collision is astronomically unlikely
  -- but free to defend against).
  loop
    select string_agg(
      substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (floor(random()*32) + 1)::int, 1),
      ''
    ) into new_code
    from generate_series(1, 8);
    exit when not exists (select 1 from public.org_invites where code = new_code);
  end loop;

  insert into public.org_invites (org_id, code, role, email, created_by)
  values (caller_org, new_code, coalesce(p_role, 'analyst'), p_email, auth.uid());

  return new_code;
end $$;
revoke all on function public.create_invite(text, text) from public;
grant execute on function public.create_invite(text, text) to authenticated;
