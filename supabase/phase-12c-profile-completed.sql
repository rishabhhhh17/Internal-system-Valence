-- Phase 12c — One-shot profile completion flag on seats.
-- =========================================================================
-- Seats created via start_team()/join_team() capture full_name + title +
-- phone in the same step. Seats created via auto_claim_seat_for_domain()
-- (the @valencegrowth.com fast path) only have full_name from Google —
-- title and phone are empty until the user fills them.
--
-- We use an explicit `profile_completed_at` flag rather than "is title
-- null" because (a) title is genuinely optional — some partners don't
-- have one, and (b) we want a way to mark "user has seen the welcome
-- once" so the app never nags them again.
--
-- The frontend gate: after sign-in, if seat exists and
-- profile_completed_at is NULL → redirect to /complete-profile.
-- Once they save or skip, set it to now() and they're in for good.
-- =========================================================================

alter table public.seats
  add column if not exists profile_completed_at timestamptz;

-- Back-fill: every seat that already has full_name AND was created via
-- start_team/join_team probably has a complete profile. We don't know
-- which RPC was used, so the safe heuristic is: if full_name + title
-- are both set, mark it complete. Pure auto-claim seats (title null)
-- will hit the completion screen next sign-in.
update public.seats
  set profile_completed_at = added_at
  where profile_completed_at is null
    and full_name is not null
    and title is not null;

-- Update the three identity RPCs so they explicitly stamp completion
-- when they captured the data.

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
  if uid is null then raise exception 'must be signed in to start a team'; end if;
  if exists (select 1 from public.seats where user_id = uid and active = true) then
    raise exception 'user already belongs to a team';
  end if;
  if p_org_name is null or length(trim(p_org_name)) = 0 then
    raise exception 'team name required';
  end if;

  insert into public.orgs (name, plan, cycle_anchor_day)
  values (trim(p_org_name), 'we_run_ai', 1)
  returning id into new_org_id;

  insert into public.seats (
    org_id, user_id, full_name, title, phone, role,
    active, billable_from, profile_completed_at
  ) values (
    new_org_id, uid, p_full_name, p_title, p_phone, 'admin',
    true, current_date, now()
  );

  return new_org_id;
end $$;

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
  if uid is null then raise exception 'must be signed in to join a team'; end if;
  if exists (select 1 from public.seats where user_id = uid and active = true) then
    raise exception 'user already belongs to a team';
  end if;

  select id, org_id, role into invite_id, target_org_id, invite_role
  from public.org_invites
  where code = upper(trim(p_invite_code))
    and claimed_at is null
    and (expires_at is null or expires_at > now());
  if target_org_id is null then raise exception 'invite not found or expired'; end if;

  insert into public.seats (
    org_id, user_id, full_name, title, phone, role,
    active, billable_from, profile_completed_at
  ) values (
    target_org_id, uid, p_full_name, p_title, p_phone, coalesce(invite_role, 'analyst'),
    true, current_date, now()
  );

  update public.org_invites set claimed_at = now(), claimed_by = uid where id = invite_id;
  return target_org_id;
end $$;

-- auto_claim leaves profile_completed_at as NULL so the frontend prompts
-- once for title/phone before the app loads.
create or replace function public.auto_claim_seat_for_domain()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  user_email text;
  user_name text;
  target_org_id uuid;
begin
  if uid is null then raise exception 'must be signed in'; end if;
  if exists (select 1 from public.seats where user_id = uid and active = true) then
    return (select org_id from public.seats where user_id = uid and active = true limit 1);
  end if;
  select email,
         coalesce(raw_user_meta_data->>'full_name',
                  raw_user_meta_data->>'name',
                  split_part(email, '@', 1))
    into user_email, user_name
  from auth.users where id = uid;
  if user_email is null then return null; end if;
  if lower(user_email) not like '%@valencegrowth.com' then return null; end if;
  select id into target_org_id from public.orgs where name = 'Valence Growth Partners' limit 1;
  if target_org_id is null then raise exception 'bootstrap org not found — run phase 12 migration first'; end if;
  insert into public.seats (
    org_id, user_id, email, full_name, role, active, billable_from
    -- profile_completed_at intentionally null — frontend will prompt.
  ) values (
    target_org_id, uid, user_email, user_name, 'partner', true, current_date
  )
  on conflict (org_id, user_id) where user_id is not null do nothing;
  return target_org_id;
end $$;

-- New RPC the /complete-profile page calls when the user saves or
-- explicitly skips. Either way we stamp the flag so the screen never
-- shows again. The seats_self_update RLS policy lets the user UPDATE
-- their own row, but we wrap this in an RPC so the "skip" path doesn't
-- need a full update payload from the client.
create or replace function public.complete_profile(
  p_full_name text default null,
  p_title text default null,
  p_phone text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'must be signed in'; end if;
  update public.seats
    set full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
        title     = coalesce(nullif(trim(p_title), ''),     title),
        phone     = coalesce(nullif(trim(p_phone), ''),     phone),
        profile_completed_at = now()
    where user_id = uid and active = true;
end $$;
revoke all on function public.complete_profile(text, text, text) from public;
grant execute on function public.complete_profile(text, text, text) to authenticated;
