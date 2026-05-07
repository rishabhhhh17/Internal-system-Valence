-- ValenceOS · Phase 2.5 — Voice memos + hybrid search support
-- Idempotent. Paste end-to-end into Supabase SQL Editor.
--
-- Adds:
--   kb_notes.audio_url            — public URL to the uploaded audio file
--   kb_notes.audio_filename       — the original filename for display
--   kb_notes.transcript           — plain-text transcript (Gemini output)
--   kb_notes.transcript_summary   — 3-sentence summary of the transcript
--   kb_notes.transcribed_at       — when transcription last ran
--   kb_notes.embedding            — vector(768) for hybrid search
--
-- Storage bucket: create a public bucket called "kb-voice-memos" in the
-- Supabase dashboard for the audio uploads. The schema only references the
-- public URL via audio_url so no FK to storage is needed.

create extension if not exists "vector";

alter table public.kb_notes
  add column if not exists audio_url           text,
  add column if not exists audio_filename      text,
  add column if not exists transcript          text,
  add column if not exists transcript_summary  text,
  add column if not exists transcribed_at      timestamptz,
  add column if not exists embedding           vector(768);

-- Plain-text search index across title + body + transcript so the keyword
-- half of hybrid search has something efficient to lean on.
create index if not exists kb_notes_text_idx on public.kb_notes
  using gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, '') || ' ' || coalesce(transcript, '')));

-- Vector index for cosine similarity search on the embedding.
create index if not exists kb_notes_embedding_idx on public.kb_notes
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Hybrid search RPC. Combines:
--   - vector cosine similarity (when query_embedding is provided)
--   - keyword match against the gin index
--   - recency weight (notes updated in the last 30 days get a small boost)
-- Optional folder_filter scopes to one mandate's folder tree.
create or replace function public.search_kb_notes(
  query_text       text,
  query_embedding  vector(768) default null,
  folder_filter_ids uuid[] default null,
  match_count      int default 12
)
returns table (
  id uuid,
  folder_id uuid,
  title text,
  body text,
  updated_at timestamptz,
  vector_score real,
  keyword_score real,
  recency_score real,
  total_score real
) language sql stable as $$
  with scored as (
    select
      n.id, n.folder_id, n.title, n.body, n.updated_at,
      case when query_embedding is not null and n.embedding is not null
           then (1 - (n.embedding <=> query_embedding))::real
           else 0::real end as vector_score,
      case when query_text is not null and length(query_text) > 0
           then ts_rank(
             to_tsvector('english', coalesce(n.title, '') || ' ' || coalesce(n.body, '') || ' ' || coalesce(n.transcript, '')),
             plainto_tsquery('english', query_text)
           )::real
           else 0::real end as keyword_score,
      greatest(0::real, 1.0 - (extract(epoch from (now() - n.updated_at)) / (60.0 * 60.0 * 24.0 * 30.0))::real) as recency_score
    from public.kb_notes n
    where (folder_filter_ids is null or n.folder_id = any(folder_filter_ids))
      and (
        query_text is null
        or length(query_text) = 0
        or to_tsvector('english', coalesce(n.title, '') || ' ' || coalesce(n.body, '') || ' ' || coalesce(n.transcript, '')) @@ plainto_tsquery('english', query_text)
        or query_embedding is not null
      )
  )
  select
    id, folder_id, title, body, updated_at,
    vector_score, keyword_score, recency_score,
    -- 60 % vector, 30 % keyword, 10 % recency. Tune later.
    (vector_score * 0.6 + keyword_score * 0.3 + recency_score * 0.1)::real as total_score
  from scored
  order by total_score desc
  limit greatest(1, match_count);
$$;

-- Allow anon to call the RPC for the demo project.
grant execute on function public.search_kb_notes(text, vector, uuid[], int) to anon, authenticated;
