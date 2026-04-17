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

  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${sanitize(file.name)}`
  let uploadedPath = null
  let fileRowId = null

  async function rollback(stage) {
    // Best-effort cleanup so a half-indexed file never lingers
    try { if (fileRowId) await supabase.from('knowledge_chunks').delete().eq('source_type', 'file').eq('source_id', fileRowId) } catch {}
    try { if (fileRowId) await supabase.from('knowledge_files').delete().eq('id', fileRowId) } catch {}
    try { if (uploadedPath) await supabase.storage.from(BUCKET).remove([uploadedPath]) } catch {}
    console.warn('uploadKnowledgeFile rollback at stage:', stage)
  }

  try {
    onProgress?.({ stage: 'upload', pct: 0.05, label: 'Uploading' })
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined
    })
    if (upErr) {
      if (/not.?found|bucket/i.test(upErr.message))
        throw new Error('Storage bucket "knowledge-files" is missing. Create it in Supabase → Storage → New bucket (public).')
      throw new Error(upErr.message)
    }
    uploadedPath = path

    onProgress?.({ stage: 'parse', pct: 0.2, label: 'Reading content' })
    let text = ''
    try {
      text = await extractText(file, {
        onProgress: (frac, label) => onProgress?.({ stage: 'parse', pct: 0.15 + 0.35 * frac, label })
      })
    } catch (e) {
      throw new Error(`Could not read content: ${e.message}`)
    }
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
    fileRowId = fileRow.id

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
    } else if (embeddingsEnabled()) {
      // Embed concurrently in groups of 4 for throughput; fail-soft per chunk.
      const concurrency = 4
      const inserted = new Array(chunks.length).fill(false)
      let done = 0
      async function worker(start) {
        for (let i = start; i < chunks.length; i += concurrency) {
          const vec = await embedText(chunks[i], { title: file.name }).catch(() => null)
          const { error } = await supabase.from('knowledge_chunks').insert({
            source_type: 'file', source_id: fileRow.id, title: file.name,
            content: chunks[i], chunk_index: i, embedding: vec,
            metadata: { sector, tags }
          })
          if (!error) inserted[i] = true
          done += 1
          onProgress?.({ stage: 'embed', pct: 0.6 + 0.4 * (done / chunks.length), label: `Indexing ${done}/${chunks.length}` })
        }
      }
      await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i)))
    } else {
      const rows = chunks.map((content, i) => ({
        source_type: 'file', source_id: fileRow.id, title: file.name,
        content, chunk_index: i, metadata: { sector, tags }
      }))
      for (let i = 0; i < rows.length; i += 50) {
        const { error } = await supabase.from('knowledge_chunks').insert(rows.slice(i, i + 50))
        if (error) throw error
        onProgress?.({ stage: 'index', pct: 0.6 + 0.4 * ((i + 50) / rows.length), label: 'Indexing chunks' })
      }
    }

    onProgress?.({ stage: 'done', pct: 1, label: 'Done' })
    return fileRow
  } catch (err) {
    await rollback(err?.message || 'unknown')
    throw err
  }
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
