-- ValenceOS · Phase 0 v2 — Daily Notes (new landing screen)
-- One row per (user, date). Auto-created on first load each day.
-- The body is plain text + light rich-text (bold, italic, lists, links);
-- AI-generated priorities live in ai_summary jsonb so they regenerate without
-- nuking what the user has typed.
--
-- Idempotent.

create table if not exists public.daily_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  date        date not null,
  body        text not null default '',
  ai_summary  jsonb,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, date)
);
create index if not exists daily_notes_user_date_idx on public.daily_notes (user_id, date desc);

alter table public.daily_notes enable row level security;

drop policy if exists daily_notes_select_authenticated on public.daily_notes;
create policy daily_notes_select_authenticated on public.daily_notes
  for select using (auth.role() = 'authenticated');

drop policy if exists daily_notes_write_authenticated on public.daily_notes;
create policy daily_notes_write_authenticated on public.daily_notes
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Open RLS for the demo project so the page renders without a session.
-- Drop these two policies when you re-enable auth.
drop policy if exists demo_anon_select on public.daily_notes;
create policy demo_anon_select on public.daily_notes
  for select to anon using (true);

drop policy if exists demo_anon_write on public.daily_notes;
create policy demo_anon_write on public.daily_notes
  for all to anon using (true) with check (true);
