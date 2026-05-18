-- Phase 7 — Flatten the per-mandate folder structure.
-- =========================================================================
-- The default folder templates dropped sub-categories (Investor Meetings
-- → Notes / Documents / Feedback collapsed into just Investor Meetings).
-- This one-off cleans up the existing rows in kb_folders so the live
-- structure matches the new templates:
--
--   1. Re-parent every kb_note that lives in a sub-folder up to that
--      sub-folder's parent. No notes are lost.
--   2. Delete the now-empty sub-folders.
--
-- Idempotent — safe to re-run; second run is a no-op because there are no
-- sub-folders left.
-- =========================================================================

-- Re-parent notes from any 2-level-deep folder into its parent.
update public.kb_notes n
   set folder_id = f.parent_id
  from public.kb_folders f
 where n.folder_id = f.id
   and f.parent_id is not null
   and f.mandate_id is not null;        -- only touch per-mandate sub-folders

-- Delete the now-empty sub-folders. (parent_id IS NULL = root folder for
-- a mandate; we keep those.)
delete from public.kb_folders
 where parent_id is not null
   and mandate_id is not null
   and not exists (
     select 1 from public.kb_notes n where n.folder_id = kb_folders.id
   );

-- Belt and braces: if any sub-folders still exist with notes (shouldn't
-- after the update above), surface them. Comment out if you want a
-- silent run.
-- select id, name, parent_id, mandate_id from public.kb_folders
--  where parent_id is not null and mandate_id is not null;
