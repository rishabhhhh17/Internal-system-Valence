// Gmail activity auto-logger. Scans inbox/sent for messages to/from any
// counterparty on a deal, then writes one `activities` row per message.
// Metadata-only (subject + sender + date), never the body.

import { supabase, isSupabaseConfigured } from './supabase.js'
import { googleToken, GoogleAuthExpired } from './google.js'
import { logActivity } from './activity.js'

async function gfetch(url) {
  const token = await googleToken()
  if (!token) throw new GoogleAuthExpired()
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 401) throw new GoogleAuthExpired()
  if (!res.ok) throw new Error(`Gmail API ${res.status}`)
  return res.json()
}

// Search Gmail for messages involving any of the given emails, newest first.
async function searchMessages(emails, { days = 30, maxResults = 50 } = {}) {
  const oldest = `${Math.max(1, days)}d`
  const q = emails.map(e => `from:${e} OR to:${e}`).join(' OR ')
  const search = encodeURIComponent(`(${q}) newer_than:${oldest}`)
  const idsRes = await gfetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${search}&maxResults=${maxResults}`)
  return idsRes.messages || []
}

async function readHeaders(messageId) {
  const data = await gfetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date`
  )
  const headers = data.payload?.headers || []
  const pick = (name) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || ''
  return {
    id: data.id,
    threadId: data.threadId,
    from: pick('From'),
    to: pick('To'),
    cc: pick('Cc'),
    subject: pick('Subject'),
    date: pick('Date'),
    snippet: data.snippet || '',
    internalDate: data.internalDate ? new Date(Number(data.internalDate)) : new Date()
  }
}

// Main: for one deal, fetch its contacts, scan Gmail for activity, log new rows.
// De-duplicates against existing activities by the message id we put in the body.
export async function syncGmailActivity({ dealId, days = 30, onProgress } = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured.')

  // Fetch contacts for the deal
  const { data: contacts, error: cErr } = await supabase
    .from('contacts').select('name, email').eq('deal_id', dealId)
  if (cErr) throw cErr
  const emails = (contacts || []).map(c => c.email).filter(Boolean)
  if (!emails.length) return { scanned: 0, added: 0, reason: 'No counterparty emails logged for this deal.' }

  // Pull existing activity rows with a gmail: marker so we don't double-count
  const { data: existing } = await supabase
    .from('activities').select('body').eq('deal_id', dealId).ilike('body', 'gmail:%')
  const haveIds = new Set((existing || []).map(a => (a.body.match(/gmail:([A-Za-z0-9_-]+)/) || [])[1]).filter(Boolean))

  onProgress?.({ stage: 'search', label: `Searching last ${days}d of Gmail…` })
  const hits = await searchMessages(emails, { days, maxResults: 80 })

  let added = 0
  let scanned = 0
  for (const hit of hits) {
    scanned++
    if (haveIds.has(hit.id)) continue
    onProgress?.({ stage: 'read', label: `Reading ${scanned}/${hits.length}…` })
    let meta
    try { meta = await readHeaders(hit.id) } catch { continue }

    // Check who the counterparty-side email was
    const parties = [meta.from, meta.to, meta.cc].join(', ').toLowerCase()
    const matchedEmail = emails.find(e => parties.includes(e.toLowerCase())) || emails[0]
    const direction = meta.from.toLowerCase().includes(matchedEmail.toLowerCase()) ? 'Received from' : 'Sent to'
    const contact = contacts.find(c => c.email?.toLowerCase() === matchedEmail.toLowerCase())
    const subject = meta.subject || '(no subject)'

    const body = `gmail:${hit.id} · ${direction} ${contact?.name || matchedEmail}: ${subject}`
    try {
      await logActivity({ dealId, kind: 'email_drafted', body })
      added++
    } catch { /* soft-fail per message */ }
  }

  onProgress?.({ stage: 'done', label: `Done — ${added} new activity entries.` })
  return { scanned, added }
}
