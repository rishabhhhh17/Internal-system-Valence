-- ValenceOS · Phase 6 — Files inside KB folders
-- Idempotent. Paste end-to-end into Supabase SQL Editor.
--
-- Adds a generic kb_files table so any folder (mandate-scoped or firm-wide)
-- can hold uploaded documents alongside notes. Mirrors deal_files but is
-- scoped purely by folder_id, so the same code path works for the firm
-- library + per-mandate folders.

create table if not exists public.kb_files (
  id          uuid primary key default gen_random_uuid(),
  folder_id   uuid not null references public.kb_folders(id) on delete cascade,
  name        text not null,
  path        text not null,
  size_bytes  bigint,
  mime_type   text,
  uploaded_by uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists kb_files_folder_idx     on public.kb_files (folder_id);
create index if not exists kb_files_created_at_idx on public.kb_files (created_at desc);

alter table public.kb_files enable row level security;
drop policy if exists kb_files_select_authenticated on public.kb_files;
create policy kb_files_select_authenticated on public.kb_files for select using (auth.role() = 'authenticated');
drop policy if exists kb_files_write_authenticated on public.kb_files;
create policy kb_files_write_authenticated on public.kb_files for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists demo_anon_select on public.kb_files;
create policy demo_anon_select on public.kb_files for select to anon using (true);
drop policy if exists demo_anon_write on public.kb_files;
create policy demo_anon_write on public.kb_files for all to anon using (true) with check (true);

-- Storage bucket — public so signed URLs aren't required for demo mode.
insert into storage.buckets (id, name, public)
values ('kb-files', 'kb-files', true)
on conflict (id) do update set public = excluded.public;

-- Storage RLS for the bucket — open for both anon (demo) and authenticated.
drop policy if exists kb_files_storage_select on storage.objects;
create policy kb_files_storage_select on storage.objects for select using (bucket_id = 'kb-files');
drop policy if exists kb_files_storage_insert on storage.objects;
create policy kb_files_storage_insert on storage.objects for insert with check (bucket_id = 'kb-files');
drop policy if exists kb_files_storage_delete on storage.objects;
create policy kb_files_storage_delete on storage.objects for delete using (bucket_id = 'kb-files');
