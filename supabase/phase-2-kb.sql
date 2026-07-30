-- ValenceOS · Phase 2 v2 — Knowledge Base restructure
-- Folder hierarchy per mandate, structured notes, and global cross-linking
-- via kb_mentions (parsed from [[wikilinks]] in note bodies).
--
-- Idempotent. Paste end-to-end into Supabase SQL Editor.

-- ============ FOLDERS ============
-- Tree structure: a mandate has a root folder; activities live under root;
-- categories (Notes / Documents / Feedback) live under activities. firm_wide
-- folders sit at the top level with mandate_id null.
create table if not exists public.kb_folders (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.kb_folders(id) on delete cascade,
  mandate_id  uuid references public.deals(id) on delete cascade,
  name        text not null,
  folder_type text not null check (folder_type in ('mandate_root','activity','category','firm_wide')),
  sort_order  int  not null default 0,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists kb_folders_parent_idx  on public.kb_folders (parent_id);
create index if not exists kb_folders_mandate_idx on public.kb_folders (mandate_id);

alter table public.kb_folders enable row level security;
drop policy if exists kb_folders_select_authenticated on public.kb_folders;
create policy kb_folders_select_authenticated on public.kb_folders for select using (auth.role() = 'authenticated');
drop policy if exists kb_folders_write_authenticated on public.kb_folders;
create policy kb_folders_write_authenticated on public.kb_folders for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists demo_anon_select on public.kb_folders;
create policy demo_anon_select on public.kb_folders for select to anon using (true);
drop policy if exists demo_anon_write on public.kb_folders;
create policy demo_anon_write on public.kb_folders for all to anon using (true) with check (true);

-- ============ NOTES ============
-- A note attaches to one folder. body is plain text + light rich text
-- (saved as plain string with simple inline tokens like **bold** /
-- *italic* / [[type:id|name]] / #tag). No markdown editor; the UI uses a
-- minimal toolbar.
create table if not exists public.kb_notes (
  id          uuid primary key default gen_random_uuid(),
  folder_id   uuid not null references public.kb_folders(id) on delete cascade,
  title       text not null,
  body        text not null default '',
  tags        text[] default '{}',
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists kb_notes_folder_idx     on public.kb_notes (folder_id);
create index if not exists kb_notes_updated_at_idx on public.kb_notes (updated_at desc);

alter table public.kb_notes enable row level security;
drop policy if exists kb_notes_select_authenticated on public.kb_notes;
create policy kb_notes_select_authenticated on public.kb_notes for select using (auth.role() = 'authenticated');
drop policy if exists kb_notes_write_authenticated on public.kb_notes;
create policy kb_notes_write_authenticated on public.kb_notes for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists demo_anon_select on public.kb_notes;
create policy demo_anon_select on public.kb_notes for select to anon using (true);
drop policy if exists demo_anon_write on public.kb_notes;
create policy demo_anon_write on public.kb_notes for all to anon using (true) with check (true);

-- ============ MENTIONS ============
-- Cross-link join table. Parsed client-side from [[type:id]] tokens in a
-- note body and upserted on save. entity_type is one of: person, fund,
-- mandate. (strategic deferred per Phase 0 sign-off.)
create table if not exists public.kb_mentions (
  id          uuid primary key default gen_random_uuid(),
  note_id     uuid not null references public.kb_notes(id) on delete cascade,
  entity_type text not null check (entity_type in ('person','fund','mandate')),
  entity_id   uuid not null,
  created_at  timestamptz not null default now()
);
create index if not exists kb_mentions_entity_idx on public.kb_mentions (entity_type, entity_id);
create index if not exists kb_mentions_note_idx   on public.kb_mentions (note_id);

alter table public.kb_mentions enable row level security;
drop policy if exists kb_mentions_select_authenticated on public.kb_mentions;
create policy kb_mentions_select_authenticated on public.kb_mentions for select using (auth.role() = 'authenticated');
drop policy if exists kb_mentions_write_authenticated on public.kb_mentions;
create policy kb_mentions_write_authenticated on public.kb_mentions for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists demo_anon_select on public.kb_mentions;
create policy demo_anon_select on public.kb_mentions for select to anon using (true);
drop policy if exists demo_anon_write on public.kb_mentions;
create policy demo_anon_write on public.kb_mentions for all to anon using (true) with check (true);

-- ============ DEAL_FILES → FOLDER_ID ============
-- Files attach to a KB folder so they live alongside notes inside the
-- mandate's folder hierarchy. Nullable for backwards compatibility with
-- existing deal_files rows.
alter table public.deal_files add column if not exists folder_id uuid references public.kb_folders(id) on delete set null;
create index if not exists deal_files_folder_idx on public.deal_files (folder_id);
