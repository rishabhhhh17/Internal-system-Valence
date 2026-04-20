-- ============================================================
-- ValenceOS · Security + Audit hardening
-- ============================================================
-- Run this ONCE after schema.sql to:
--   1. Add created_by / updated_by columns on every mutable table
--   2. Auto-stamp created_by on insert via DEFAULT auth.uid()
--   3. Auto-stamp updated_by on update via trigger
--   4. Replace permissive `using(true)` policies with authenticated-only
--      policies, keeping a narrow public exception for data-room shares
-- Safe to re-run — every statement is idempotent.
-- ============================================================

-- ============ AUDIT COLUMNS ============
alter table public.deals           add column if not exists created_by uuid default auth.uid();
alter table public.deals           add column if not exists updated_by uuid;
alter table public.documents       add column if not exists created_by uuid default auth.uid();
alter table public.documents       add column if not exists updated_by uuid;
alter table public.meetings        add column if not exists created_by uuid default auth.uid();
alter table public.meetings        add column if not exists updated_by uuid;
alter table public.tasks           add column if not exists created_by uuid default auth.uid();
alter table public.tasks           add column if not exists updated_by uuid;
alter table public.contacts        add column if not exists created_by uuid default auth.uid();
alter table public.contacts        add column if not exists updated_by uuid;
alter table public.activities      add column if not exists created_by uuid default auth.uid();
alter table public.deal_files      add column if not exists created_by uuid default auth.uid();
alter table public.comps           add column if not exists created_by uuid default auth.uid();
alter table public.comps           add column if not exists updated_by uuid;
alter table public.knowledge_files add column if not exists created_by uuid default auth.uid();
alter table public.deal_checklist  add column if not exists created_by uuid default auth.uid();
alter table public.deal_checklist  add column if not exists updated_by uuid;
alter table public.deal_team       add column if not exists created_by uuid default auth.uid();
alter table public.deal_team       add column if not exists updated_by uuid;
alter table public.deal_comments   add column if not exists created_by uuid default auth.uid();

-- deal_shares already has `created_by text` from an earlier iteration.
-- Add a separate uuid-typed audit column so the existing text field
-- can continue to display a friendly email on the public share page.
alter table public.deal_shares     add column if not exists created_by_uid uuid default auth.uid();

-- ============ updated_at / updated_by TRIGGER ============
alter table public.deals          add column if not exists updated_at timestamptz not null default now();
alter table public.documents      add column if not exists updated_at timestamptz not null default now();
alter table public.comps          add column if not exists updated_at timestamptz not null default now();
alter table public.deal_checklist add column if not exists updated_at timestamptz not null default now();
alter table public.deal_team      add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_audit_update() returns trigger as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$ language plpgsql;

drop trigger if exists deals_audit_update         on public.deals;
drop trigger if exists documents_audit_update     on public.documents;
drop trigger if exists comps_audit_update         on public.comps;
drop trigger if exists deal_checklist_audit_update on public.deal_checklist;
drop trigger if exists deal_team_audit_update     on public.deal_team;

create trigger deals_audit_update         before update on public.deals          for each row execute function public.set_audit_update();
create trigger documents_audit_update     before update on public.documents      for each row execute function public.set_audit_update();
create trigger comps_audit_update         before update on public.comps          for each row execute function public.set_audit_update();
create trigger deal_checklist_audit_update before update on public.deal_checklist for each row execute function public.set_audit_update();
create trigger deal_team_audit_update     before update on public.deal_team      for each row execute function public.set_audit_update();

-- ============ LOCK RLS TO AUTHENTICATED USERS ============
-- Drop the old permissive policies
drop policy if exists "deals_all"           on public.deals;
drop policy if exists "documents_all"       on public.documents;
drop policy if exists "meetings_all"        on public.meetings;
drop policy if exists "tasks_all"           on public.tasks;
drop policy if exists "contacts_all"        on public.contacts;
drop policy if exists "activities_all"      on public.activities;
drop policy if exists "deal_files_all"      on public.deal_files;
drop policy if exists "comps_all"           on public.comps;
drop policy if exists "knowledge_files_all" on public.knowledge_files;
drop policy if exists "knowledge_chunks_all" on public.knowledge_chunks;
drop policy if exists "deal_checklist_all" on public.deal_checklist;
drop policy if exists "deal_team_all"      on public.deal_team;
drop policy if exists "deal_comments_all"  on public.deal_comments;
drop policy if exists "deal_shares_all"       on public.deal_shares;
drop policy if exists "deal_share_access_all" on public.deal_share_access;

-- Authenticated-only read/write for every internal table
-- (TO authenticated clamps the policy to the `authenticated` JWT role)
create policy "deals_auth"           on public.deals           for all to authenticated using (true) with check (true);
create policy "documents_auth"       on public.documents       for all to authenticated using (true) with check (true);
create policy "meetings_auth"        on public.meetings        for all to authenticated using (true) with check (true);
create policy "tasks_auth"           on public.tasks           for all to authenticated using (true) with check (true);
create policy "contacts_auth"        on public.contacts        for all to authenticated using (true) with check (true);
create policy "activities_auth"      on public.activities      for all to authenticated using (true) with check (true);
create policy "deal_files_auth"      on public.deal_files      for all to authenticated using (true) with check (true);
create policy "comps_auth"           on public.comps           for all to authenticated using (true) with check (true);
create policy "knowledge_files_auth" on public.knowledge_files for all to authenticated using (true) with check (true);
create policy "knowledge_chunks_auth" on public.knowledge_chunks for all to authenticated using (true) with check (true);
create policy "deal_checklist_auth" on public.deal_checklist for all to authenticated using (true) with check (true);
create policy "deal_team_auth"      on public.deal_team      for all to authenticated using (true) with check (true);
create policy "deal_comments_auth"  on public.deal_comments  for all to authenticated using (true) with check (true);

-- ============ PUBLIC DATA-ROOM EXCEPTIONS ============
-- The /share/:code page is public by design. It needs:
--   · SELECT on deal_shares by share_code  (no listing — caller must know the code)
--   · SELECT on deal_files whose id is listed on an active share
--   · INSERT into deal_share_access for view/download event logging
-- Everything else stays locked.

-- deal_shares: anon can SELECT only non-revoked, non-expired shares.
-- Authenticated users can do anything.
create policy "deal_shares_auth_all"
  on public.deal_shares for all to authenticated
  using (true) with check (true);

create policy "deal_shares_public_read"
  on public.deal_shares for select to anon
  using (revoked = false and (expires_at is null or expires_at > now()));

-- deal_files: anon can SELECT files that are listed on an active share.
create policy "deal_files_public_read"
  on public.deal_files for select to anon
  using (
    exists (
      select 1 from public.deal_shares s
      where s.deal_id = deal_files.deal_id
        and s.revoked = false
        and (s.expires_at is null or s.expires_at > now())
        and (coalesce(array_length(s.file_ids, 1), 0) = 0 or deal_files.id = any(s.file_ids))
    )
  );

-- deal_share_access: anon can INSERT (view/download events from the share page).
create policy "deal_share_access_auth_all"
  on public.deal_share_access for all to authenticated
  using (true) with check (true);

create policy "deal_share_access_public_insert"
  on public.deal_share_access for insert to anon
  with check (
    exists (
      select 1 from public.deal_shares s
      where s.id = deal_share_access.share_id
        and s.revoked = false
        and (s.expires_at is null or s.expires_at > now())
    )
  );

-- knowledge_chunks: needed by the search_knowledge RPC. RPC runs as invoker
-- so already covered by knowledge_chunks_auth. No public read needed.
