-- Phase 39 — domain-locked auto-claim for Valence Growth Partners.
--
-- Applied to the live DB via migration
-- `lock_auto_claim_to_valencegrowthpartners_domain`. Kept here so the repo
-- reflects the schema. Only @valencegrowthpartners.com Google Workspace
-- accounts auto-join the VGP org; everyone else returns null and the frontend
-- routes them to /welcome (invite code / onboarding) — same as before. An
-- existing active seat (e.g. the founding gmail admin) is always honoured, so
-- no one gets locked out.

create or replace function public.auto_claim_seat_for_domain()
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid       uuid := auth.uid();
  v_email     text;
  v_org       uuid;
  v_existing  uuid;
  v_has_admin boolean;
  v_role      text;
begin
  if v_uid is null then
    return null;
  end if;

  v_email := lower(coalesce(
    nullif(auth.jwt() ->> 'email', ''),
    (select email from auth.users where id = v_uid)
  ));
  if v_email is null then
    return null;
  end if;

  -- Honour an existing active seat first (keeps the gmail-based admin working).
  select org_id into v_existing
    from public.seats
   where user_id = v_uid and active is true
   limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  -- Domain gate.
  if v_email not like '%@valencegrowthpartners.com' then
    return null;
  end if;

  select id into v_org
    from public.orgs
   where lower(name) = 'valence growth partners'
   order by created_at asc
   limit 1;
  if v_org is null then
    return null;
  end if;

  -- Reactivate a pre-seeded seat if present, else insert. First admin wins;
  -- the rest join as analysts.
  update public.seats
     set active = true, email = coalesce(email, v_email)
   where user_id = v_uid and org_id = v_org;
  if found then
    return v_org;
  end if;

  select exists(
    select 1 from public.seats
     where org_id = v_org and active is true and role = 'admin'
  ) into v_has_admin;
  v_role := case when v_has_admin then 'analyst' else 'admin' end;

  insert into public.seats (org_id, user_id, email, active, role, added_at)
  values (v_org, v_uid, v_email, true, v_role, now());

  return v_org;
end
$function$;
