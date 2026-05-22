-- ValenceOS · Phase 1.5 — AI Quick Screener
-- Idempotent. Paste this whole file into the Supabase SQL editor.

create table if not exists public.screener_criteria (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_default boolean not null default false,
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.screener_runs (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('fund_match','mandate_fit')),
  input_summary text,
  pdf_filename text,
  output jsonb,
  deal_id uuid references public.deals(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists screener_runs_mode_idx       on public.screener_runs (mode);
create index if not exists screener_runs_created_at_idx on public.screener_runs (created_at desc);

alter table public.screener_criteria enable row level security;
alter table public.screener_runs     enable row level security;

drop policy if exists screener_criteria_select_authenticated on public.screener_criteria;
create policy screener_criteria_select_authenticated on public.screener_criteria
  for select using (auth.role() = 'authenticated');
drop policy if exists screener_criteria_write_authenticated on public.screener_criteria;
create policy screener_criteria_write_authenticated on public.screener_criteria
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists screener_runs_select_authenticated on public.screener_runs;
create policy screener_runs_select_authenticated on public.screener_runs
  for select using (auth.role() = 'authenticated');
drop policy if exists screener_runs_write_authenticated on public.screener_runs;
create policy screener_runs_write_authenticated on public.screener_runs
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
