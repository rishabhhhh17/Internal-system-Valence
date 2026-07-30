-- ValenceOS · Phase 1 v2 — People CRM + Interactions wiring + WhatsApp stubs
-- Idempotent. Paste into the Supabase SQL editor and run.
--
-- New table:
--   people                — persona-driven CRM, top-level. Includes how_to_talk,
--                           relationship_history, favours_bank, things_to_avoid,
--                           mutuals — all visible to every team member.
--
-- Extends:
--   interactions          — adds person_id FK plus WhatsApp stubs (kind enum,
--                           whatsapp_thread_id, whatsapp_message_count). Schema
--                           ready; the UI surfaces 'whatsapp' as a manual kind
--                           but no API integration yet.

-- ============ PEOPLE ============
create table if not exists public.people (
  id                  uuid primary key default gen_random_uuid(),
  full_name           text not null,
  role                text,
  company             text,
  fund_id             uuid references public.funds(id) on delete set null,
  email               text,
  phone               text,
  linkedin_url        text,
  whatsapp            text,
  city                text,
  country             text,
  -- Persona fields — visible to everyone on the team. No tiers.
  how_to_talk          text,
  relationship_history text,
  what_they_care_about text,
  favours_bank         text,
  things_to_avoid      text,
  mutuals              text,
  tags                text[] default '{}',
  last_touched_at     date,
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists people_name_idx    on public.people (full_name);
create index if not exists people_company_idx on public.people (company);
create index if not exists people_fund_idx    on public.people (fund_id);

alter table public.people enable row level security;

drop policy if exists people_select_authenticated on public.people;
create policy people_select_authenticated on public.people
  for select using (auth.role() = 'authenticated');
drop policy if exists people_write_authenticated on public.people;
create policy people_write_authenticated on public.people
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Open RLS for the demo project so /people renders without auth.
drop policy if exists demo_anon_select on public.people;
create policy demo_anon_select on public.people for select to anon using (true);
drop policy if exists demo_anon_write on public.people;
create policy demo_anon_write on public.people for all to anon using (true) with check (true);

-- ============ INTERACTIONS — Person FK + WhatsApp stubs ============
alter table public.interactions
  add column if not exists person_id              uuid references public.people(id) on delete set null,
  add column if not exists whatsapp_thread_id     text,
  add column if not exists whatsapp_message_count int;

create index if not exists interactions_person_id_idx on public.interactions (person_id);

-- Extend the kind enum: drop the old constraint and re-add with 'whatsapp' included.
alter table public.interactions drop constraint if exists interactions_type_check;
do $$ begin
  alter table public.interactions
    add constraint interactions_type_check
    check (type in ('intro_call','pitch_meeting','coffee','email_thread','referral_in','referral_out','event','phone_call','whatsapp','other'));
exception when duplicate_object then null; end $$;
