-- =============================================================================
-- Phase 24 — @mentions in kb_notes + deal_comments
-- =============================================================================
-- TipTap editor writes structured JSON; we keep the existing plain-text
-- column too so old code paths still render. Mentions are stored as a
-- uuid[] denormalised from the editor doc for cheap "notes that mention
-- me" queries (Phase 5+ feature).
--
-- Spec used `notes` + `comments`; we have `kb_notes` + `deal_comments`.
-- Same shape, different names. The notifyMentions() helper in
-- src/lib/notifications.js already targets kind: 'kb_note' | 'deal_comment'
-- so this just gives those tables the columns it expects.
--
-- Idempotent.
-- =============================================================================

-- kb_notes: knowledge-folder notes (per-mandate or firm-wide)
alter table public.kb_notes
  add column if not exists content_json     jsonb,
  add column if not exists mentioned_users  uuid[] not null default '{}';

-- deal_comments: per-mandate internal thread
alter table public.deal_comments
  add column if not exists content_json     jsonb,
  add column if not exists mentioned_users  uuid[] not null default '{}';

-- "Notes/comments that mention me" lookup — GIN array index makes
--   where me_uuid = any(mentioned_users)
-- and
--   where mentioned_users @> array[me_uuid]
-- both fast.
create index if not exists kb_notes_mentioned_users_idx
  on public.kb_notes using gin (mentioned_users);

create index if not exists deal_comments_mentioned_users_idx
  on public.deal_comments using gin (mentioned_users);
