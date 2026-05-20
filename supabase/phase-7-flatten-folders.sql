-- Phase 7 — Flatten the per-mandate folder structure.
-- =========================================================================
-- The default folder templates dropped sub-categories (Investor Meetings
-- → Notes / Documents / Feedback collapsed into just Investor Meetings).
-- This one-off cleans up the existing rows in kb_folders so the live
-- structure matches the new templates.
--
-- Folder hierarchy uses kb_folders.folder_type:
--   'mandate_root' — the mandate's top-level (parent_id NULL)
--   'activity'     — Level-1 (Investor Meetings / Internal / Diligence / …)
--   'category'     — Level-2 (Notes / Documents / Feedback)
--
-- Steps:
--   1. Re-parent every note that lives in a category folder up to its
--      parent activity folder. No notes are lost.
--   2. Delete the now-empty category folders.
--
-- Idempotent — safe to re-run; second run is a no-op because no category
-- folders remain.
-- =========================================================================

-- Re-parent notes from category folders into their activity parent.
update public.kb_notes n
   set folder_id = f.parent_id
  from public.kb_folders f
 where n.folder_id = f.id
   and f.folder_type = 'category'
   and f.parent_id is not null;

-- Delete category (Level-2) folders. mandate_root and activity stay.
delete from public.kb_folders
 where folder_type = 'category';
