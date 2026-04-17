// Orchestrates the Knowledge Base: uploading files, chunking, embedding,
// indexing into knowledge_chunks, and searching via the Postgres RPC.

import { supabase, isSupabaseConfigured } from './supabase.js'
import { extractText, chunkText, fileTypeFor } from './fileParse.js'
import { embedText, embedQuery, embeddingsEnabled } from './embeddings.js'

const BUCKET = 'knowledge-files'

function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

// Upload a file to Supabase Storage, extract text, chunk, (optionally) embed,
// and index everything into knowledge_chunks.
export async function uploadKnowledgeFile({
  file, tags = [], sector = null, uploadedBy = null, onProgress
}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.')

  const path = `${Date.now()}-${sanitize(file.name)}`

  onProgress?.({ stage: 'upload', pct: 0.05, label: 'Uploading' })
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined
  })
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`)

  onProgress?.({ stage: 'parse', pct: 0.2, label: 'Reading content' })
  const text = await extractText(file, {
    onProgress: (frac, label) =>
      onProgress?.({ stage: 'parse', pct: 0.15 + 0.35 * frac, label })
  }).catch(e => { throw new Error(`Parse failed: ${e.message}`) })

  const chunks = chunkText(text || '')

  onProgress?.({ stage: 'meta', pct: 0.55, label: 'Saving metadata' })
  const { data: fileRow, error: metaErr } = await supabase.from('knowledge_files').insert({
    name:        file.name,
    path,
    mime_type:   file.type || null,
    size_bytes:  file.size,
    tags,
    sector,
    uploaded_by: uploadedBy,
    char_count:  text.length,
    summary:     text.slice(0, 400)
  }).select().single()
  if (metaErr) throw metaErr

  // Write one chunk row immediately so search still finds the file even if
  // embedding is skipped or fails.
  onProgress?.({ stage: 'index', pct: 0.6, label: 'Indexing' })
  if (chunks.length === 0) {
    await supabase.from('knowledge_chunks').insert({
      source_type: 'file',
      source_id:   fileRow.id,
      title:       file.name,
      content:     file.name,
      chunk_index: 0,
      metadata:    { sector, tags }
    })
  } else {
    // If embeddings are enabled, do them — else write chunks without vectors.
    if (embeddingsEnabled()) {
      for (let i = 0; i < chunks.length; i++) {
        const vec = await embedText(chunks[i], { title: file.name }).catch(() => null)
        await supabase.from('knowledge_chunks').insert({
          source_type: 'file',
          source_id:   fileRow.id,
          title:       file.name,
          content:     chunks[i],
          chunk_index: i,
          embedding:   vec,
          metadata:    { sector, tags }
        })
        onProgress?.({
          stage: 'embed',
          pct: 0.6 + 0.4 * ((i + 1) / chunks.length),
          label: `Indexing chunk ${i + 1}/${chunks.length}`
        })
      }
    } else {
      const rows = chunks.map((content, i) => ({
        source_type: 'file',
        source_id:   fileRow.id,
        title:       file.name,
        content,
        chunk_index: i,
        metadata:    { sector, tags }
      }))
      // Insert in batches of 50 so the Supabase payload stays small
      for (let i = 0; i < rows.length; i += 50) {
        await supabase.from('knowledge_chunks').insert(rows.slice(i, i + 50))
        onProgress?.({ stage: 'index', pct: 0.6 + 0.4 * ((i + 50) / rows.length), label: 'Indexing chunks' })
      }
    }
  }

  onProgress?.({ stage: 'done', pct: 1, label: 'Done' })
  return fileRow
}

export async function deleteKnowledgeFile(file) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.')
  try { await supabase.storage.from(BUCKET).remove([file.path]) } catch {}
  await supabase.from('knowledge_chunks').delete().eq('source_type', 'file').eq('source_id', file.id)
  const { error } = await supabase.from('knowledge_files').delete().eq('id', file.id)
  if (error) throw error
}

export function filePublicUrl(path) {
  if (!isSupabaseConfigured) return '#'
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

// Unified search — full-text always, semantic added when Gemini is configured.
export async function searchKnowledge(query, { matchCount = 24, sourceFilter = null } = {}) {
  if (!isSupabaseConfigured) return { results: [], mode: 'unconfigured' }
  const q = (query || '').trim()

  let queryEmbedding = null
  let mode = 'lexical'
  if (q && embeddingsEnabled()) {
    try {
      queryEmbedding = await embedQuery(q)
      mode = 'hybrid'
    } catch {
      queryEmbedding = null
    }
  }

  const { data, error } = await supabase.rpc('search_knowledge', {
    query_text:      q,
    query_embedding: queryEmbedding,
    match_count:     matchCount,
    source_filter:   sourceFilter
  })
  if (error) throw error

  return { results: data || [], mode }
}

// Group results by (source_type, source_id) so a file with 5 matching chunks
// shows up once with the best chunk as the preview.
export function groupResults(results) {
  const by = new Map()
  for (const r of results) {
    const key = `${r.source_type}:${r.source_id}`
    const existing = by.get(key)
    if (!existing || r.score > existing.top.score) {
      by.set(key, { top: r, matches: (existing?.matches || 0) + 1 })
    } else {
      existing.matches += 1
    }
  }
  return Array.from(by.values())
    .sort((a, b) => b.top.score - a.top.score)
    .map(({ top, matches }) => ({ ...top, matchCount: matches }))
}
