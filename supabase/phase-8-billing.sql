-- Phase 8 — Multi-tenant billing model.
-- =========================================================================
-- Implements the seat + AI overage logic described in the partner brief:
--
--   - Plan per org: byo_key | we_run_ai | own_key
--   - Seat billing: per-seat, upfront, monthly, no mid-cycle proration.
--     Tiered (base price below a threshold, volume price at/above), with
--     a per-client monthly floor.
--   - AI overage (we_run_ai only): per-seat allowance, hard pause at the
--     allowance until the user opts in to the overage rate. Opt-in is
--     consent; overage flows as an itemised invoice line.
--   - Storage: tracked + flagged for admin review when over the per-seat
--     allowance. Never auto-billed.
--
-- No payment processing here. This file defines the state — what is owed,
-- what is paused, what flag is raised — and exposes it via plain tables
-- that the JS lib in src/lib/billing.js drives.
-- =========================================================================

-- ============ ORGANISATIONS ============
-- The multi-tenant root. Every billing row hangs off org_id. Existing
-- domain tables (deals, people, funds, …) stay single-tenant for now;
-- they can be back-filled with org_id in a later migration. The billing
-- model is fully org-aware and doesn't depend on that back-fill.
create table if not exists public.orgs (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  -- Plans: byo_key + own_key are seat-only (we never bill them for AI).
  -- we_run_ai unlocks the AI-overage state machine below.
  plan         text not null check (plan in ('byo_key', 'we_run_ai', 'own_key')),
  -- The day-of-month the monthly cycle anchors to. Default = today so a
  -- new org's first cycle starts immediately.
  cycle_anchor_day int not null default 1 check (cycle_anchor_day between 1 and 28),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists orgs_plan_idx on public.orgs (plan);

-- ============ BILLING CONFIG ============
-- Single source of truth for the pricing knobs. One row with org_id IS NULL
-- is the GLOBAL DEFAULT — every org inherits from it unless an org-scoped
-- override row exists. Resolver picks the override when present.
--
-- The AI allowance + overage rate are intentionally placeholders. They
-- MUST be calibrated against real measured usage before going live.
create table if not exists public.billing_config (
  id                                  uuid primary key default gen_random_uuid(),
  org_id                              uuid references public.orgs(id) on delete cascade,
  -- Tiered seat pricing (flat tiers — see resolver).
  base_seat_price_usd                 numeric not null default 80,
  volume_seat_price_usd               numeric not null default 60,
  volume_threshold_seats              int     not null default 10,
  -- Floor: if (seats × seat price) < floor → bill floor instead.
  monthly_floor_usd                   numeric not null default 200,
  -- Storage allowance per seat, in MB. Tracked + displayed; never auto-billed.
  storage_allowance_per_seat_mb       int     not null default 5120,   -- 5 GB / seat
  -- AI allowance per seat per cycle, in "AI actions".
  -- ▼ PLACEHOLDER — calibrate from real measured usage before launch.
  ai_actions_allowance_per_seat       int     not null default 500,
  -- Overage rate when a seat opts in past the allowance.
  -- ▼ PLACEHOLDER — calibrate from real measured usage + cost basis.
  ai_overage_rate_usd_per_action      numeric not null default 0.02,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A given org has at most one override row.
  unique (org_id)
);

-- Seed the global default row (org_id IS NULL). Idempotent.
insert into public.billing_config (org_id) values (null)
  on conflict do nothing;

-- ============ SEATS ============
-- One row per user-in-an-org. Seats added mid-cycle don't bill until the
-- NEXT cycle (billable_from is set to the next cycle's start at creation
-- time by the JS lib).
create table if not exists public.seats (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  user_id         uuid,                       -- optional FK to auth.users
  email           text,
  active          boolean not null default true,
  added_at        timestamptz not null default now(),
  -- Date the seat first counts toward the seat-fee snapshot. The lib sets
  -- this to the NEXT cycle's period_start when a seat is added mid-cycle.
  billable_from   date not null default current_date,
  deactivated_at  timestamptz
);
create index if not exists seats_org_active_idx on public.seats (org_id) where active = true;
create index if not exists seats_billable_from_idx on public.seats (billable_from);

-- ============ BILLING CYCLES ============
-- One row per (org, monthly period). Snapshots the plan + every pricing
-- knob at cycle-open so config changes mid-cycle don't retroactively
-- re-price the open cycle.
create table if not exists public.billing_cycles (
  id                                uuid primary key default gen_random_uuid(),
  org_id                            uuid not null references public.orgs(id) on delete cascade,
  period_start                      date not null,
  period_end                        date not null,
  -- Frozen snapshot at cycle open
  plan_snapshot                     text    not null check (plan_snapshot in ('byo_key', 'we_run_ai', 'own_key')),
  base_seat_price_usd               numeric not null,
  volume_seat_price_usd             numeric not null,
  volume_threshold_seats            int     not null,
  monthly_floor_usd                 numeric not null,
  storage_allowance_per_seat_mb     int     not null,
  ai_actions_allowance_per_seat     int     not null,
  ai_overage_rate_usd_per_action    numeric not null,
  -- Computed at cycle open from seats with billable_from <= period_start
  billable_seats_count              int     not null default 0,
  seat_subtotal_usd                 numeric not null default 0,
  floor_applied                     boolean not null default false,
  -- Lifecycle
  status                            text    not null default 'open' check (status in ('open', 'closed')),
  opened_at                         timestamptz not null default now(),
  closed_at                         timestamptz,
  unique (org_id, period_start)
);
create index if not exists billing_cycles_open_idx on public.billing_cycles (org_id, status) where status = 'open';

-- ============ AI ACTIONS LEDGER ============
-- One row per billable AI action. The lib writes here in real time as
-- features (Ask / Screener / Deal Brief / Email Draft / etc.) fire.
-- Classification = 'included' until the seat's allowance is exhausted;
-- 'overage' only after explicit opt-in (see ai_overage_opt_ins).
create table if not exists public.ai_actions (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  seat_id         uuid not null references public.seats(id) on delete cascade,
  cycle_id        uuid not null references public.billing_cycles(id) on delete cascade,
  action_type     text,                           -- 'ask' | 'screener' | 'deal_brief' | …
  classification  text not null check (classification in ('included', 'overage')),
  occurred_at     timestamptz not null default now()
);
create index if not exists ai_actions_seat_cycle_idx on public.ai_actions (seat_id, cycle_id);
create index if not exists ai_actions_org_cycle_idx  on public.ai_actions (org_id, cycle_id);

-- ============ AI OVERAGE OPT-INS ============
-- Per-seat consent for the CURRENT cycle. Opt-in is the contract that the
-- partner accepts overage charges; resets every cycle so consent is
-- always fresh.
create table if not exists public.ai_overage_opt_ins (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  seat_id       uuid not null references public.seats(id) on delete cascade,
  cycle_id      uuid not null references public.billing_cycles(id) on delete cascade,
  opted_in_at   timestamptz not null default now(),
  opted_in_by   uuid,
  unique (seat_id, cycle_id)
);

-- ============ STORAGE USAGE SNAPSHOTS ============
-- Periodic reading of an org's total storage. The JS lib flags a row for
-- 'review needed' when the total exceeds (seats × allowance_per_seat).
-- Admin clears review via review_resolved_at.
create table if not exists public.storage_usage (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs(id) on delete cascade,
  cycle_id            uuid references public.billing_cycles(id) on delete cascade,
  total_bytes         bigint not null default 0,
  measured_at         timestamptz not null default now(),
  review_flagged      boolean not null default false,
  review_resolved_at  timestamptz,
  review_note         text
);
create index if not exists storage_usage_org_measured_idx on public.storage_usage (org_id, measured_at desc);
create index if not exists storage_usage_open_flags_idx
  on public.storage_usage (org_id) where review_flagged = true and review_resolved_at is null;

-- ============ INVOICE LINE ITEMS ============
-- The resolution of a cycle. Multiple rows per cycle: a base seat fee
-- (or floor adjustment), and zero-or-more AI overage tallies. No PDF
-- generation, no payment processing — this is the source data that any
-- future biller (Stripe / manual invoice / etc.) would consume.
create table if not exists public.invoice_line_items (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  cycle_id        uuid not null references public.billing_cycles(id) on delete cascade,
  kind            text not null check (kind in (
    'seat_fee',                  -- base × (seats below threshold)
    'seat_volume',               -- volume × (seats at/above threshold)
    'monthly_floor_adjustment',  -- top-up so total = floor
    'ai_overage',                -- one tally per cycle
    'storage_review'             -- only when admin closes the review with a charge — manual entry
  )),
  description     text not null,
  quantity        numeric,
  unit_price_usd  numeric,
  amount_usd      numeric not null,
  metadata        jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists invoice_lines_cycle_idx on public.invoice_line_items (cycle_id);
create index if not exists invoice_lines_org_idx   on public.invoice_line_items (org_id);

-- ============ ROW LEVEL SECURITY ============
-- Every billing table: an org member can only see their own org's rows.
-- Membership is encoded via seats.user_id matching auth.uid(). Service
-- role bypasses RLS (for admin tooling).
--
-- Demo policies stay in effect so the existing anon-RLS-open setup keeps
-- working for the unauthenticated demo build. Real auth simply tightens
-- the read paths via the authenticated policy.

alter table public.orgs                enable row level security;
alter table public.billing_config      enable row level security;
alter table public.seats               enable row level security;
alter table public.billing_cycles      enable row level security;
alter table public.ai_actions          enable row level security;
alter table public.ai_overage_opt_ins  enable row level security;
alter table public.storage_usage       enable row level security;
alter table public.invoice_line_items  enable row level security;

-- Helper: is the calling user a seat in this org?
create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1 from public.seats s
     where s.org_id = target_org
       and s.active = true
       and s.user_id = auth.uid()
  );
$$;

-- Org-member read policies on every billing table.
do $$
begin
  -- orgs
  drop policy if exists orgs_member_read on public.orgs;
  create policy orgs_member_read on public.orgs
    for select to authenticated
    using (is_org_member(id));

  -- billing_config (org-specific override OR global default both visible)
  drop policy if exists billing_config_member_read on public.billing_config;
  create policy billing_config_member_read on public.billing_config
    for select to authenticated
    using (org_id is null or is_org_member(org_id));

  drop policy if exists seats_member_read on public.seats;
  create policy seats_member_read on public.seats
    for select to authenticated
    using (is_org_member(org_id));

  drop policy if exists cycles_member_read on public.billing_cycles;
  create policy cycles_member_read on public.billing_cycles
    for select to authenticated
    using (is_org_member(org_id));

  drop policy if exists ai_actions_member_read on public.ai_actions;
  create policy ai_actions_member_read on public.ai_actions
    for select to authenticated
    using (is_org_member(org_id));

  drop policy if exists opt_ins_member_read on public.ai_overage_opt_ins;
  create policy opt_ins_member_read on public.ai_overage_opt_ins
    for select to authenticated
    using (is_org_member(org_id));

  drop policy if exists storage_member_read on public.storage_usage;
  create policy storage_member_read on public.storage_usage
    for select to authenticated
    using (is_org_member(org_id));

  drop policy if exists invoice_member_read on public.invoice_line_items;
  create policy invoice_member_read on public.invoice_line_items
    for select to authenticated
    using (is_org_member(org_id));
end $$;

-- Demo / anon policies — open read+write so the demo build keeps working.
-- Tighten these in production. (Service role always bypasses RLS.)
do $$
begin
  drop policy if exists demo_anon_all on public.orgs;
  create policy demo_anon_all on public.orgs for all to anon using (true) with check (true);

  drop policy if exists demo_anon_all on public.billing_config;
  create policy demo_anon_all on public.billing_config for all to anon using (true) with check (true);

  drop policy if exists demo_anon_all on public.seats;
  create policy demo_anon_all on public.seats for all to anon using (true) with check (true);

  drop policy if exists demo_anon_all on public.billing_cycles;
  create policy demo_anon_all on public.billing_cycles for all to anon using (true) with check (true);

  drop policy if exists demo_anon_all on public.ai_actions;
  create policy demo_anon_all on public.ai_actions for all to anon using (true) with check (true);

  drop policy if exists demo_anon_all on public.ai_overage_opt_ins;
  create policy demo_anon_all on public.ai_overage_opt_ins for all to anon using (true) with check (true);

  drop policy if exists demo_anon_all on public.storage_usage;
  create policy demo_anon_all on public.storage_usage for all to anon using (true) with check (true);

  drop policy if exists demo_anon_all on public.invoice_line_items;
  create policy demo_anon_all on public.invoice_line_items for all to anon using (true) with check (true);
end $$;
