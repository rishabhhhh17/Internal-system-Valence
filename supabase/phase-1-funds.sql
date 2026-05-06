-- ValenceOS · Phase 1.4 — Fund CRM
-- Idempotent. Paste this whole file into the Supabase SQL editor.

create table if not exists public.funds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  fund_type text not null check (fund_type in ('VC','PE','Growth','Family Office','Sovereign','Hedge Fund','Strategic Corp Dev','Other')),
  hq_city    text,
  hq_country text,
  aum_usd_m  numeric,
  check_size_min_usd_m numeric,
  check_size_max_usd_m numeric,
  sectors    text[] default '{}',
  stages     text[] default '{}',
  geographies text[] default '{}',
  website    text,
  warmth     text default 'cold' check (warmth in ('hot','warm','cold','dormant')),
  last_touched_at date,
  notes      text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists funds_warmth_idx     on public.funds (warmth);
create index if not exists funds_fund_type_idx  on public.funds (fund_type);
create index if not exists funds_last_touched_idx on public.funds (last_touched_at desc);

create table if not exists public.fund_contacts (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds(id) on delete cascade,
  name text not null,
  role text,
  email text,
  phone text,
  linkedin_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fund_contacts_fund_id_idx on public.fund_contacts (fund_id);

create table if not exists public.deal_fund_pings (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  fund_id uuid not null references public.funds(id) on delete cascade,
  status text default 'shortlisted' check (status in ('shortlisted','reached_out','meeting_set','passed','interested','in_dd','offered')),
  pinged_at timestamptz default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deal_id, fund_id)
);
create index if not exists deal_fund_pings_deal_id_idx on public.deal_fund_pings (deal_id);
create index if not exists deal_fund_pings_fund_id_idx on public.deal_fund_pings (fund_id);

alter table public.funds            enable row level security;
alter table public.fund_contacts    enable row level security;
alter table public.deal_fund_pings  enable row level security;

drop policy if exists funds_select_authenticated on public.funds;
create policy funds_select_authenticated on public.funds
  for select using (auth.role() = 'authenticated');
drop policy if exists funds_write_authenticated on public.funds;
create policy funds_write_authenticated on public.funds
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists fund_contacts_select_authenticated on public.fund_contacts;
create policy fund_contacts_select_authenticated on public.fund_contacts
  for select using (auth.role() = 'authenticated');
drop policy if exists fund_contacts_write_authenticated on public.fund_contacts;
create policy fund_contacts_write_authenticated on public.fund_contacts
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists deal_fund_pings_select_authenticated on public.deal_fund_pings;
create policy deal_fund_pings_select_authenticated on public.deal_fund_pings
  for select using (auth.role() = 'authenticated');
drop policy if exists deal_fund_pings_write_authenticated on public.deal_fund_pings;
create policy deal_fund_pings_write_authenticated on public.deal_fund_pings
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop trigger if exists funds_audit_update           on public.funds;
create trigger funds_audit_update before update on public.funds
  for each row execute function public.set_audit_update();

drop trigger if exists fund_contacts_audit_update   on public.fund_contacts;
create trigger fund_contacts_audit_update before update on public.fund_contacts
  for each row execute function public.set_audit_update();

drop trigger if exists deal_fund_pings_audit_update on public.deal_fund_pings;
create trigger deal_fund_pings_audit_update before update on public.deal_fund_pings
  for each row execute function public.set_audit_update();
