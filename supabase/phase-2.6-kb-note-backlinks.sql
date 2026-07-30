-- Phase 2.6: Note-to-note backlinks.
-- Extends kb_mentions.entity_type to allow 'note' so a wikilink in a note
-- body can target another KB note. Powers the "Linked from" panel rendered
-- inside KbNoteEditor: every note shows who else points at it.
--
-- Safe to re-run. Drops + recreates the CHECK constraint with the wider set.

alter table public.kb_mentions drop constraint if exists kb_mentions_entity_type_check;

alter table public.kb_mentions
  add constraint kb_mentions_entity_type_check
  check (entity_type in ('person','fund','mandate','note'));

-- No new index needed: the existing kb_mentions_entity_idx on
-- (entity_type, entity_id) already covers backlinks lookups
-- (entity_type='note' and entity_id=:noteId).
