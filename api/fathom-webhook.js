// Vercel function — receives the "new meeting content ready" webhook from
// Fathom and auto-creates an `interactions` row in Supabase. This is the
// real integration: the partner doesn't have to click "Pull from Fathom"
// after every call, the meeting just appears in ValenceOS.
//
// Setup:
//   1. Register this URL as a Fathom webhook (POST /webhooks) with
//      include_transcript + include_summary + include_action_items = true.
//   2. Server env vars on Vercel:
//        FATHOM_WEBHOOK_SECRET           (whsec_…)  — signs every payload
//        VITE_SUPABASE_URL    or SUPABASE_URL
//        VITE_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY
//
// Signature verification follows the standard webhook scheme Fathom uses
// (id + timestamp + raw body, HMAC-SHA256, base64). Per their docs.

import crypto from 'node:crypto'

export const config = {
  api: {
    // We need the raw body for signature verification — Vercel's default
    // parser would mangle it. Read the stream manually below.
    bodyParser: false
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const raw = await readRaw(req)
  let payload
  try { payload = JSON.parse(raw) }
  catch { return res.status(400).json({ error: 'invalid JSON' }) }

  // ---- Verify signature ----------------------------------------------------
  // Skipped only if FATHOM_WEBHOOK_SECRET isn't set (dev / local testing).
  const secret = process.env.FATHOM_WEBHOOK_SECRET
  if (secret) {
    const sigHeader = req.headers['webhook-signature'] || ''
    const id        = req.headers['webhook-id']        || ''
    const tsHeader  = req.headers['webhook-timestamp'] || ''
    const ok = verifySignature({ id, ts: tsHeader, body: raw, secretWithPrefix: secret, sigHeader })
    if (!ok) return res.status(401).json({ error: 'bad signature' })
    // Replay protection — 5-minute window
    const ts = Number(tsHeader)
    if (!ts || Math.abs(Date.now() / 1000 - ts) > 300) {
      return res.status(401).json({ error: 'timestamp out of tolerance' })
    }
  }

  // ---- Shape the interaction row ------------------------------------------
  const meeting     = payload?.meeting || payload?.recording || payload || {}
  const recordingId = meeting?.recording_id || meeting?.id || null
  const title       = meeting?.title || meeting?.meeting_title || 'Fathom meeting'
  const startedAt   = meeting?.recording_start_time || meeting?.scheduled_start_time || meeting?.started_at || new Date().toISOString()

  // Pick the first external attendee — that's the counterparty for an IB.
  const invitees    = meeting?.calendar_invitees || meeting?.attendees || payload?.calendar_invitees || []
  const external    = (invitees || []).filter(a => a && (a.is_external === true || a.email && !a.email.includes('valencegrowth')))
  const cp          = external[0] || invitees[0] || null
  const counterpartyName    = cp?.name || cp?.email || ''
  const counterpartyCompany = guessCompany(cp?.email || '', meeting)

  // Body — summary preferred, transcript as fallback.
  const summary    = extractSummary(payload)
  const transcript = extractTranscript(payload)
  const actionItems = Array.isArray(payload?.action_items) ? payload.action_items
                    : Array.isArray(payload?.summary?.action_items) ? payload.summary.action_items
                    : []
  const notes = [
    summary || '',
    actionItems.length > 0 ? '\n\nAction items:\n' + actionItems.map(a => `• ${typeof a === 'string' ? a : (a.text || JSON.stringify(a))}`).join('\n') : '',
    '\n\n— auto-logged from Fathom'
  ].filter(Boolean).join('').trim()

  // ---- Insert via Supabase REST -------------------------------------------
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anonKey     = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) {
    return res.status(500).json({ error: 'Supabase env not configured on the server.' })
  }

  // Idempotency: if a row with this recording_id already exists, skip the
  // insert. We stash recording_id in the `external_ref` column.
  if (recordingId) {
    const dupe = await fetch(`${supabaseUrl}/rest/v1/interactions?external_ref=eq.${encodeURIComponent(`fathom:${recordingId}`)}&select=id`, {
      headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` }
    })
    if (dupe.ok) {
      const rows = await dupe.json().catch(() => [])
      if (Array.isArray(rows) && rows.length > 0) {
        return res.status(200).json({ ok: true, deduped: true, interaction_id: rows[0].id })
      }
    }
  }

  const insertRes = await fetch(`${supabaseUrl}/rest/v1/interactions`, {
    method: 'POST',
    headers: {
      'apikey':        anonKey,
      'Authorization': `Bearer ${anonKey}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation'
    },
    body: JSON.stringify({
      // `interaction_purpose` is NOT NULL — pick the most defensible
      // default for an auto-imported meeting. The user can edit later.
      interaction_purpose:  'relationship_building',
      counterparty_name:    counterpartyName || 'Fathom meeting',
      counterparty_company: counterpartyCompany || null,
      type:                 'meeting',
      outcome:              'in_progress',
      notes,
      transcript,
      transcript_summary:   summary,
      external_ref:         recordingId ? `fathom:${recordingId}` : null,
      created_at:           startedAt
    })
  })

  if (!insertRes.ok) {
    const text = await insertRes.text().catch(() => '')
    return res.status(502).json({ error: `Supabase insert failed: ${insertRes.status}`, detail: text.slice(0, 400) })
  }

  const inserted = await insertRes.json()
  return res.status(200).json({ ok: true, interaction_id: inserted?.[0]?.id || null, title })
}

// ---- helpers ---------------------------------------------------------------

function readRaw(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => { data += chunk })
    req.on('end',  () => resolve(data))
    req.on('error', reject)
  })
}

function verifySignature({ id, ts, body, secretWithPrefix, sigHeader }) {
  if (!sigHeader || !id || !ts || !secretWithPrefix) return false
  const rawSecret = secretWithPrefix.startsWith('whsec_')
    ? Buffer.from(secretWithPrefix.slice('whsec_'.length), 'base64')
    : Buffer.from(secretWithPrefix, 'base64')
  const signed = `${id}.${ts}.${body}`
  const expected = crypto.createHmac('sha256', rawSecret).update(signed).digest('base64')
  // Header format: "v1,<sig> v1,<sig>" — version-prefixed, space-delimited
  const provided = sigHeader.split(' ').map(s => s.replace(/^v\d+,/, ''))
  for (const sig of provided) {
    try {
      if (crypto.timingSafeEqual(Buffer.from(sig, 'base64'), Buffer.from(expected, 'base64'))) return true
    } catch { /* length mismatch — try next */ }
  }
  return false
}

function extractSummary(payload) {
  const s = payload?.summary
  if (!s) return ''
  if (typeof s === 'string') return s
  if (s.text)     return s.text
  if (s.markdown) return s.markdown
  if (Array.isArray(s.sections)) {
    return s.sections.map(sec => {
      const heading = sec.title || sec.name || ''
      const body = sec.text || sec.content || (Array.isArray(sec.bullets) ? sec.bullets.map(b => `• ${b}`).join('\n') : '')
      return heading ? `${heading}\n${body}` : body
    }).filter(Boolean).join('\n\n')
  }
  return ''
}

function extractTranscript(payload) {
  const t = payload?.transcript
  if (!t) return ''
  if (typeof t === 'string') return t
  if (t.text) return t.text
  if (Array.isArray(t.utterances)) {
    return t.utterances.map(u => `${u.speaker || ''}${u.speaker ? ': ' : ''}${u.text || ''}`).join('\n')
  }
  return ''
}

// Heuristic — split company from email domain, skip our own domain.
function guessCompany(email, meeting) {
  if (!email || !email.includes('@')) return ''
  const domain = email.split('@')[1].toLowerCase()
  if (!domain || domain.includes('valencegrowth') || domain.includes('gmail') || domain.includes('outlook') || domain.includes('hotmail')) return ''
  // domain like "kedaara.com" → "Kedaara"
  const base = domain.split('.')[0]
  return base.charAt(0).toUpperCase() + base.slice(1)
}
