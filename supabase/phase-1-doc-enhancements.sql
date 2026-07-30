-- ValenceOS · Phase 1.8 — Doc enhancements (watermark + share access logs)
-- Idempotent. Paste into the Supabase SQL editor.

alter table public.deal_files add column if not exists watermark_enabled boolean default false;

create table if not exists public.share_access_logs (
  id uuid primary key default gen_random_uuid(),
  share_code text not null,
  file_id uuid references public.deal_files(id) on delete set null,
  viewer_ip   text,
  viewer_email text,
  user_agent  text,
  duration_seconds int,
  opened_at  timestamptz not null default now()
);
create index if not exists share_access_logs_share_code_idx on public.share_access_logs (share_code);
create index if not exists share_access_logs_opened_at_idx  on public.share_access_logs (opened_at desc);

alter table public.share_access_logs enable row level security;

drop policy if exists share_access_logs_select_authenticated on public.share_access_logs;
create policy share_access_logs_select_authenticated on public.share_access_logs
  for select using (auth.role() = 'authenticated');

-- Anon visitors with a valid share code can write a single access log row.
drop policy if exists share_access_logs_insert_anon on public.share_access_logs;
create policy share_access_logs_insert_anon on public.share_access_logs
  for insert to anon with check (true);
