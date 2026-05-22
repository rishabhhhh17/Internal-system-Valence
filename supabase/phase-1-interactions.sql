-- ValenceOS · Phase 1.1 — Interactions
-- Idempotent. Paste this whole file into the Supabase SQL editor.

create table if not exists public.interactions (
  id uuid primary key default gen_random_uuid(),
  interaction_purpose text not null check (interaction_purpose in
    ('pitch_for_mandate','counterparty_outreach','relationship_building','referral')),
  type text not null check (type in
    ('intro_call','pitch_meeting','coffee','email_thread','referral_in','referral_out','event','phone_call','other')),
  counterparty_name    text not null,
  counterparty_company text,
  counterparty_role    text,
  deal_id              uuid references public.deals(id) on delete set null,
  outcome              text not null check (outcome in
    ('to_followup','in_progress','converted_to_mandate','pitched_lost','interested','passed','referred_out','stay_warm','closed')),
  notes                text,
  follow_up_date       date,
  lead_owner           text,
  created_by           uuid default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists interactions_purpose_idx        on public.interactions (interaction_purpose);
create index if not exists interactions_outcome_idx        on public.interactions (outcome);
create index if not exists interactions_deal_id_idx        on public.interactions (deal_id);
create index if not exists interactions_follow_up_date_idx on public.interactions (follow_up_date);
create index if not exists interactions_created_at_idx     on public.interactions (created_at desc);

alter table public.interactions enable row level security;

drop policy if exists interactions_select_authenticated on public.interactions;
create policy interactions_select_authenticated on public.interactions
  for select using (auth.role() = 'authenticated');

drop policy if exists interactions_write_authenticated on public.interactions;
create policy interactions_write_authenticated on public.interactions
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop trigger if exists interactions_audit_update on public.interactions;
create trigger interactions_audit_update before update on public.interactions
  for each row execute function public.set_audit_update();
