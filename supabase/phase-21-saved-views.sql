-- =============================================================================
-- Phase 21 — Saved Views (Smart Lists)
-- =============================================================================
-- Lets a user save any pipeline-filter combo as a named view. Private by
-- default. Optional team-share flag — when set, every other authenticated
-- user in the same org can apply it from "Team Views" in the sidebar.
--
-- Filters are stored as JSONB so the schema doesn't grow every time we add
-- a new filter dimension. The shape the UI writes today:
--   {
--     "stage":       ["Mandate", "Pitching"],
--     "sector":      ["Healthcare"],
--     "deal_types":  ["transaction"],
--     "ma_side":     "sell",
--     "lead_owner":  "Neha Jain"
--   }
-- The client serialises this back into ?stage=…&sector=… URL params via
-- useSavedViews.applyView().
--
-- Idempotent.
-- =============================================================================

create table if not exists public.saved_views (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  org_id          uuid references public.orgs(id) on delete cascade,
  name            text not null,
  emoji           text,                              -- single emoji char shown in sidebar; null = default
  pipeline_type   text check (pipeline_type in ('transaction', 'advisory', 'all')),
  filters         jsonb not null default '{}'::jsonb,
  sort            jsonb default '{}'::jsonb,
  visible_columns text[],
  is_shared       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists saved_views_user_idx       on public.saved_views (user_id, created_at desc);
create index if not exists saved_views_org_shared_idx on public.saved_views (org_id) where is_shared = true;

alter table public.saved_views enable row level security;

-- Read: own views, plus shared views from anyone in the same org.
-- org_id may be null on legacy rows; treat that as "not in any org" and only
-- visible to the owner.
drop policy if exists saved_views_read on public.saved_views;
create policy saved_views_read on public.saved_views
  for select to authenticated using (
    user_id = auth.uid()
    or (is_shared and org_id is not null and org_id = public.current_user_org_id())
  );

-- Insert/update/delete: only the owner.
drop policy if exists saved_views_write_self on public.saved_views;
create policy saved_views_write_self on public.saved_views
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Auto-bump updated_at on update so the sidebar's freshness sort works.
create or replace function public.saved_views_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_saved_views_touch on public.saved_views;
create trigger trg_saved_views_touch
  before update on public.saved_views
  for each row execute function public.saved_views_touch_updated_at();

-- Auto-fill org_id from the actor's current org on insert if the client
-- didn't pass it. Keeps the team-share lookup correct without forcing
-- every client write to know the org id.
create or replace function public.saved_views_fill_org()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.org_id is null then
    new.org_id := public.current_user_org_id();
  end if;
  return new;
end $$;

drop trigger if exists trg_saved_views_fill_org on public.saved_views;
create trigger trg_saved_views_fill_org
  before insert on public.saved_views
  for each row execute function public.saved_views_fill_org();
