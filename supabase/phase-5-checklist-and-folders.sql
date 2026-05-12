-- Phase 5 — Checklist customisation + firm-wide template folders.
--
-- 1. deal_checklist.label    text  -- null = template item (label looked up
--                                     by item_key from STAGE_CHECKLISTS in
--                                     src/lib/checklists.js); non-null =
--                                     user-authored custom item, label is
--                                     the visible text, item_key is a
--                                     stable `custom:<uuid>` identifier.
--
-- 2. deal_checklist.required boolean  -- per-row required flag for custom
--                                        items. Template items derive
--                                        required-ness from the template.
--
-- 3. knowledge_files.folder_id  -- nullable FK to kb_folders so firm-wide
--                                  files can be organised into named
--                                  template folders (e.g. "Standard NDAs",
--                                  "Engagement Letters") instead of one
--                                  flat list. Files without a folder still
--                                  render in the unsorted bucket.
--
-- Safe to re-run. No constraint changes; only nullable columns added.

alter table public.deal_checklist
  add column if not exists label    text,
  add column if not exists required boolean;

alter table public.knowledge_files
  add column if not exists folder_id uuid references public.kb_folders(id) on delete set null;

create index if not exists knowledge_files_folder_idx on public.knowledge_files (folder_id);
