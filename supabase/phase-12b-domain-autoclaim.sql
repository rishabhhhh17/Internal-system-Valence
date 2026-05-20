-- Phase 12b — Auto-claim Valence seat for @valencegrowth.com sign-ins.
-- =========================================================================
-- Multi-tenancy is the right default, but the Valence team itself doesn't
-- need to go through Welcome → Start a team → fill profile every time a
-- new partner signs in. This RPC short-circuits that for anyone whose
-- auth.users.email ends in @valencegrowth.com: it creates a seat in the
-- bootstrap "Valence Growth Partners" org and returns the org_id.
--
-- Everyone else still sees the Welcome screen and the normal start/join
-- flow — the multi-tenant capability is preserved for any future firm.
--
-- Called from the client on first sign-in when useSeat() returns no seat
-- AND the user's email matches the allowed-domain list. Safe to call
-- repeatedly — it bails out if the user already has a seat.

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
  if uid is null then
    raise exception 'must be signed in';
  end if;

  -- Bail if the user already has an active seat.
  if exists (select 1 from public.seats where user_id = uid and active = true) then
    return (select org_id from public.seats where user_id = uid and active = true limit 1);
  end if;

  -- Read the user's email + display name from auth.users. We're in a
  -- SECURITY DEFINER context so we can touch auth.users.
  select email,
         coalesce(raw_user_meta_data->>'full_name',
                  raw_user_meta_data->>'name',
                  split_part(email, '@', 1))
    into user_email, user_name
  from auth.users
  where id = uid;

  if user_email is null then
    return null;
  end if;

  -- Allowed-domain list — extend here when we add more "trusted" firms
  -- we want to skip Welcome for. For now: Valence Growth Partners only.
  if lower(user_email) not like '%@valencegrowth.com' then
    return null;  -- caller falls back to Welcome screen
  end if;

  -- Resolve the bootstrap Valence Growth Partners org.
  select id into target_org_id
  from public.orgs
  where name = 'Valence Growth Partners'
  limit 1;

  if target_org_id is null then
    raise exception 'bootstrap org not found — run phase 12 migration first';
  end if;

  insert into public.seats (org_id, user_id, email, full_name, role, active, billable_from)
  values (target_org_id, uid, user_email, user_name, 'partner', true, current_date)
  on conflict (org_id, user_id) where user_id is not null do nothing;

  return target_org_id;
end $$;

revoke all on function public.auto_claim_seat_for_domain() from public;
grant execute on function public.auto_claim_seat_for_domain() to authenticated;
