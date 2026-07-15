-- Phase 40 — server-side Google credentials for the background Gmail → People
-- sync. Applied via migration `google_credentials_for_server_side_gmail_sync`.
--
-- Refresh tokens are sensitive: RLS is ON with NO policies, so clients can
-- never read this table. The client writes only through the SECURITY DEFINER
-- save_google_credential() RPC (which stores the caller's own token, scoped to
-- their active seat's org). The /api/gmail-sync cron reads it with the
-- service-role key and mints access tokens to scan Gmail metadata, auto-adding
-- new external senders to that org's People list.

create table if not exists public.google_credentials (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  org_id          uuid not null references public.orgs(id) on delete cascade,
  google_email    text,
  refresh_token   text not null,
  last_history_id text,
  last_synced_at  timestamptz,
  sync_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.google_credentials enable row level security;
-- (No policies on purpose — refresh tokens are never client-readable.)

create or replace function public.save_google_credential(
  p_refresh_token text,
  p_google_email  text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_refresh_token is null or length(btrim(p_refresh_token)) = 0 then
    return;
  end if;
  select org_id into v_org
    from public.seats
   where user_id = v_uid and active is true
   limit 1;
  if v_org is null then
    return;
  end if;

  insert into public.google_credentials (user_id, org_id, google_email, refresh_token, updated_at)
  values (v_uid, v_org, p_google_email, p_refresh_token, now())
  on conflict (user_id) do update
     set refresh_token = excluded.refresh_token,
         org_id        = excluded.org_id,
         google_email  = coalesce(excluded.google_email, public.google_credentials.google_email),
         updated_at    = now();
end
$function$;

revoke all on function public.save_google_credential(text, text) from public;
grant execute on function public.save_google_credential(text, text) to authenticated;
