import { supabase, isSupabaseConfigured } from './supabase.js'

const BUCKET = 'deal-files'

function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export async function uploadDealFile({ dealId, file, category = 'Other' }) {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured')
  const path = `${dealId}/${Date.now()}-${sanitize(file.name)}`
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined
  })
  if (upErr) throw upErr

  const { data, error } = await supabase.from('deal_files').insert({
    deal_id:    dealId,
    name:       file.name,
    path,
    size_bytes: file.size,
    mime_type:  file.type || null,
    category
  }).select().single()
  if (error) throw error
  return data
}

export function publicUrlFor(path) {
  if (!isSupabaseConfigured) return '#'
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

export async function deleteDealFile(fileRow) {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured')
  await supabase.storage.from(BUCKET).remove([fileRow.path])
  const { error } = await supabase.from('deal_files').delete().eq('id', fileRow.id)
  if (error) throw error
}

export function formatBytes(n) {
  if (!n && n !== 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

// ---- KB files (firm library + mandate folder uploads) ----
// Same shape as deal files, but scoped purely by folder_id so the same
// helpers serve mandate-scoped and firm-wide folders.

const KB_BUCKET = 'kb-files'

export async function uploadKbFile({ folderId, file }) {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured')
  const path = `${folderId}/${Date.now()}-${sanitize(file.name)}`
  const { error: upErr } = await supabase.storage.from(KB_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined
  })
  if (upErr) throw upErr
  const { data, error } = await supabase.from('kb_files').insert({
    folder_id:  folderId,
    name:       file.name,
    path,
    size_bytes: file.size,
    mime_type:  file.type || null
  }).select().single()
  if (error) throw error
  return data
}

export function kbFilePublicUrl(path) {
  if (!isSupabaseConfigured) return '#'
  return supabase.storage.from(KB_BUCKET).getPublicUrl(path).data.publicUrl
}

export async function deleteKbFile(fileRow) {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured')
  await supabase.storage.from(KB_BUCKET).remove([fileRow.path])
  const { error } = await supabase.from('kb_files').delete().eq('id', fileRow.id)
  if (error) throw error
}
