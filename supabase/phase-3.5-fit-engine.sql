-- ValenceOS · Phase 3.5 — Fit Engine
-- Score opportunities (intake submissions / deals) against firm investment
-- criteria. One default criteria row is auto-seeded; the user can clone /
-- override to spawn additional criteria sets later.
--
-- Idempotent. Paste this whole file into the Supabase SQL editor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Geography column on the two scored entities.
--    `deals` and `intake_submissions` already track sector + ev numbers, but
--    geo is now a first-class fit dimension, so it gets a column rather than
--    living in a free-text field.
-- ----------------------------------------------------------------------------
alter table public.deals               add column if not exists geography text;
alter table public.intake_submissions  add column if not exists geography text;

-- ----------------------------------------------------------------------------
-- 2. fit_criteria — firm-level criteria sets.
--    Multiple sets allowed (e.g. firm-wide default + per-partner overlays);
--    is_default flags the one used when the caller doesn't pick.
-- ----------------------------------------------------------------------------
create table if not exists public.fit_criteria (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  is_default        boolean not null default false,
  sectors           text[] not null default '{}',
  excluded_sectors  text[] not null default '{}',
  ev_min_usd_m      numeric,
  ev_max_usd_m      numeric,
  geographies       text[] not null default '{}',
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid default auth.uid(),
  updated_by        uuid default auth.uid()
);

create index if not exists fit_criteria_default_idx
  on public.fit_criteria (is_default) where is_default = true;

-- ----------------------------------------------------------------------------
-- 3. fit_assessments — latest score + action per (entity, criteria).
--    Stored not derived: lets us record what the user *did* after scoring
--    (mark fit / pass / ask for more / override) plus a reason for overrides.
-- ----------------------------------------------------------------------------
create table if not exists public.fit_assessments (
  id            uuid primary key default gen_random_uuid(),
  entity_type   text not null check (entity_type in ('intake','deal','fund')),
  entity_id     uuid not null,
  criteria_id   uuid not null references public.fit_criteria(id) on delete cascade,
  fit_score     int  not null check (fit_score between 0 and 100),
  verdict       text not null check (verdict in ('strong_fit','fit','maybe','pass','excluded')),
  breakdown     jsonb not null default '{}',
  reasons       text[] not null default '{}',
  action        text check (action in ('mark_fit','pass','ask_more_info','override')),
  action_reason text,
  action_at     timestamptz,
  action_by     uuid,
  assessed_at   timestamptz not null default now(),
  unique(entity_type, entity_id, criteria_id)
);

create index if not exists fit_assessments_entity_idx
  on public.fit_assessments (entity_type, entity_id);
create index if not exists fit_assessments_verdict_idx
  on public.fit_assessments (verdict);

-- ----------------------------------------------------------------------------
-- 4. RLS — authenticated full access; demo anon mirrors (per CLAUDE.md rule).
-- ----------------------------------------------------------------------------
alter table public.fit_criteria    enable row level security;
alter table public.fit_assessments enable row level security;

drop policy if exists fit_criteria_select_authenticated on public.fit_criteria;
create policy fit_criteria_select_authenticated on public.fit_criteria
  for select using (auth.role() = 'authenticated');
drop policy if exists fit_criteria_write_authenticated on public.fit_criteria;
create policy fit_criteria_write_authenticated on public.fit_criteria
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists demo_anon_select on public.fit_criteria;
create policy demo_anon_select on public.fit_criteria for select to anon using (true);
drop policy if exists demo_anon_write on public.fit_criteria;
create policy demo_anon_write on public.fit_criteria for all to anon using (true) with check (true);

drop policy if exists fit_assessments_select_authenticated on public.fit_assessments;
create policy fit_assessments_select_authenticated on public.fit_assessments
  for select using (auth.role() = 'authenticated');
drop policy if exists fit_assessments_write_authenticated on public.fit_assessments;
create policy fit_assessments_write_authenticated on public.fit_assessments
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists demo_anon_select on public.fit_assessments;
create policy demo_anon_select on public.fit_assessments for select to anon using (true);
drop policy if exists demo_anon_write on public.fit_assessments;
create policy demo_anon_write on public.fit_assessments for all to anon using (true) with check (true);

-- ----------------------------------------------------------------------------
-- 5. Audit trigger — bumps updated_at + updated_by on fit_criteria edits.
--    set_audit_update() is defined in schema.sql.
-- ----------------------------------------------------------------------------
drop trigger if exists fit_criteria_audit_update on public.fit_criteria;
create trigger fit_criteria_audit_update before update on public.fit_criteria
  for each row execute function public.set_audit_update();

-- ----------------------------------------------------------------------------
-- 6. Seed the default firm criteria.
--    Only inserts when no default exists; safe to re-run.
-- ----------------------------------------------------------------------------
insert into public.fit_criteria (
  name, is_default, sectors, excluded_sectors,
  ev_min_usd_m, ev_max_usd_m, geographies, notes
)
select
  'Default Valence criteria',
  true,
  array['Healthcare','Fintech','Consumer','Infrastructure','Renewables','Logistics','Real Estate'],
  array[]::text[],
  50,
  750,
  array['India','UK','SE Asia'],
  'Auto-seeded firm criteria. Override any field; flip is_default=false here before promoting another set to default.'
where not exists (
  select 1 from public.fit_criteria where is_default = true
);
