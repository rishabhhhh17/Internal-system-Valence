-- ValenceOS · Phase 1.7 — Meeting Intelligence
-- Idempotent. Paste into the Supabase SQL editor.

create table if not exists public.meeting_intelligence (
  id uuid primary key default gen_random_uuid(),
  deal_id      uuid references public.deals(id) on delete cascade,
  meeting_id   uuid references public.meetings(id),
  source       text check (source in ('otter','fireflies','granola','manual','other')),
  transcript_text text,
  transcript_url  text,
  founder_highlights jsonb default '[]',
  red_flags          jsonb default '[]',
  claims_to_verify   jsonb default '[]',
  action_items       jsonb default '[]',
  summary            text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists meeting_intelligence_deal_id_idx    on public.meeting_intelligence (deal_id);
create index if not exists meeting_intelligence_meeting_id_idx on public.meeting_intelligence (meeting_id);
create index if not exists meeting_intelligence_created_at_idx on public.meeting_intelligence (created_at desc);

alter table public.meeting_intelligence enable row level security;

drop policy if exists meeting_intelligence_select_authenticated on public.meeting_intelligence;
create policy meeting_intelligence_select_authenticated on public.meeting_intelligence
  for select using (auth.role() = 'authenticated');
drop policy if exists meeting_intelligence_write_authenticated on public.meeting_intelligence;
create policy meeting_intelligence_write_authenticated on public.meeting_intelligence
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop trigger if exists meeting_intelligence_audit_update on public.meeting_intelligence;
create trigger meeting_intelligence_audit_update before update on public.meeting_intelligence
  for each row execute function public.set_audit_update();
