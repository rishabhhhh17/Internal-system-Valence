// External Data Room — create shareable links to a deal's files.
// Each share has a random code, optional expiry, and an optional whitelist of
// file ids to expose. Access is logged in deal_share_access.

import { supabase, isSupabaseConfigured } from './supabase.js'

function randomCode(len = 14) {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  let out = ''
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length]
  return out
}

export async function createShare({
  dealId,
  title,
  recipientName,
  recipientEmail,
  fileIds = [],
  note,
  expiresAt,
  createdBy
}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.')
  const share_code = randomCode(14)
  const { data, error } = await supabase.from('deal_shares').insert({
    deal_id: dealId,
    share_code,
    title:          title || null,
    recipient_name: recipientName || null,
    recipient_email: recipientEmail || null,
    file_ids:       fileIds,
    note:           note || null,
    expires_at:     expiresAt || null,
    created_by:     createdBy || null
  }).select().single()
  if (error) throw error
  return data
}

export async function listShares(dealId) {
  if (!isSupabaseConfigured) return []
  const { data, error } = await supabase
    .from('deal_shares')
    .select('*')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function revokeShare(id) {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured.')
  const { error } = await supabase.from('deal_shares').update({ revoked: true }).eq('id', id)
  if (error) throw error
}

export async function deleteShare(id) {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured.')
  const { error } = await supabase.from('deal_shares').delete().eq('id', id)
  if (error) throw error
}

export async function loadShareByCode(code) {
  if (!isSupabaseConfigured) return null
  const { data: share } = await supabase
    .from('deal_shares').select('*').eq('share_code', code).maybeSingle()
  if (!share) return null
  if (share.revoked) return { ...share, _revoked: true }
  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return { ...share, _expired: true }
  }

  // Fetch deal summary (non-sensitive fields only)
  const { data: deal } = await supabase
    .from('deals')
    .select('id, client_name, deal_type, stage, sector, side, notes')
    .eq('id', share.deal_id).maybeSingle()

  // Fetch files — either the allow-list or all files for the deal
  let filesQ = supabase.from('deal_files').select('*').eq('deal_id', share.deal_id).order('created_at', { ascending: false })
  if (share.file_ids && share.file_ids.length) filesQ = filesQ.in('id', share.file_ids)
  const { data: files } = await filesQ

  return { ...share, deal, files: files || [] }
}

export async function logAccess({ shareId, event, fileId = null }) {
  if (!isSupabaseConfigured) return
  try {
    await supabase.from('deal_share_access').insert({
      share_id: shareId,
      event,
      file_id: fileId,
      user_agent: (navigator.userAgent || '').slice(0, 300)
    })
  } catch { /* best-effort */ }
}

export async function listAccess(shareId) {
  if (!isSupabaseConfigured) return []
  const { data } = await supabase.from('deal_share_access')
    .select('*').eq('share_id', shareId)
    .order('created_at', { ascending: false })
    .limit(200)
  return data || []
}

export function shareUrl(code) {
  return `${window.location.origin}/share/${code}`
}
