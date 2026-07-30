-- Phase 12d — Open auto-claim to any email (first-test mode).
-- =========================================================================
-- The original auto_claim_seat_for_domain() RPC only claimed seats for
-- @valencegrowth.com emails — everyone else hit the Welcome / Start-a-team
-- screen. For the first internal test we want zero friction: any signed-in
-- user lands directly in the bootstrap Valence Growth Partners workspace.
--
-- Re-enabling the domain lock later is a one-line change inside the RPC.
-- The Welcome / Start-a-team / Join-a-team flow stays in the frontend
-- code for that future state.
-- =========================================================================

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

  -- OPEN MODE for the first test — no domain check. To re-lock to
  -- @valencegrowth.com only, restore the line below before the org
  -- lookup:
  --   if lower(user_email) not like '%@valencegrowth.com' then return null; end if;

  select id into target_org_id
  from public.orgs
  where name = 'Valence Growth Partners'
  limit 1;
  if target_org_id is null then
    raise exception 'bootstrap org not found — run phase 12 migration first';
  end if;

  insert into public.seats (
    org_id, user_id, email, full_name, role, active, billable_from
  ) values (
    target_org_id, uid, user_email, user_name, 'partner', true, current_date
  )
  on conflict (org_id, user_id) where user_id is not null do nothing;

  return target_org_id;
end $$;
revoke all on function public.auto_claim_seat_for_domain() from public;
grant execute on function public.auto_claim_seat_for_domain() to authenticated;
