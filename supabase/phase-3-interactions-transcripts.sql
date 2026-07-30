-- ============================================================================
-- Phase 3.7 — Interactions: transcript / voice memo / external source fields
-- ============================================================================
-- Bankers want to attach the artefact of an interaction (call recording
-- transcript, Fathom transcript, voice memo) to the row, not just notes.
-- This adds the storage columns; the UI in InteractionDrawer wires three
-- input sources: paste / upload, voice memo (Gemini transcribe), and
-- external pull (Fathom — stub for now).
--
-- Idempotent.
-- ============================================================================

alter table public.interactions
  add column if not exists transcript          text,
  add column if not exists transcript_summary  text,
  add column if not exists audio_url           text,
  add column if not exists audio_filename      text,
  add column if not exists transcribed_at      timestamptz,
  add column if not exists transcript_source   text,
  add column if not exists external_ref        text;

do $$ begin
  alter table public.interactions
    add constraint interactions_transcript_source_chk
    check (transcript_source is null or transcript_source in (
      'manual', 'upload', 'voice_memo', 'fathom', 'otter', 'fireflies', 'granola', 'zoom', 'meet', 'other'
    ));
exception when duplicate_object then null; end $$;

create index if not exists interactions_transcribed_at_idx
  on public.interactions (transcribed_at desc) where transcribed_at is not null;
