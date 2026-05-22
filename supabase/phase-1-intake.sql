-- ValenceOS · Phase 1.6 — Smart Intake Portal
-- Idempotent. Paste into the Supabase SQL editor.
-- After running, create a public storage bucket called "intake-decks" in
-- the Supabase dashboard so the public form can upload pitch decks.

create table if not exists public.intake_submissions (
  id uuid primary key default gen_random_uuid(),
  company_name   text not null,
  contact_name   text not null,
  contact_email  text not null,
  contact_phone  text,
  sector         text,
  deal_side      text,
  ev_ask_usd_m   numeric,
  situation      text,
  deck_url       text,
  source         text,
  status         text not null default 'new' check (status in ('new','reviewed','converted','passed','spam')),
  ai_screener_output jsonb,
  deal_id        uuid references public.deals(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists intake_submissions_status_idx     on public.intake_submissions (status);
create index if not exists intake_submissions_created_at_idx on public.intake_submissions (created_at desc);

alter table public.intake_submissions enable row level security;

-- Authenticated users (the firm) can read and update.
drop policy if exists intake_submissions_select_authenticated on public.intake_submissions;
create policy intake_submissions_select_authenticated on public.intake_submissions
  for select using (auth.role() = 'authenticated');

drop policy if exists intake_submissions_update_authenticated on public.intake_submissions;
create policy intake_submissions_update_authenticated on public.intake_submissions
  for update using (auth.role() = 'authenticated');

-- Anon visitors can ONLY insert (the public intake form). They cannot read
-- or modify rows; the only path is one-shot creation.
drop policy if exists intake_submissions_insert_anon on public.intake_submissions;
create policy intake_submissions_insert_anon on public.intake_submissions
  for insert to anon with check (true);

drop trigger if exists intake_submissions_audit_update on public.intake_submissions;
create trigger intake_submissions_audit_update before update on public.intake_submissions
  for each row execute function public.set_audit_update();
