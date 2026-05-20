// /api/capture — Vercel serverless endpoint for the ValenceOS Chrome
// extension.
//
// The extension scrapes Gmail threads + Calendar events from the page
// the user is looking at and POSTs them here. We validate the user's
// Supabase JWT, resolve their seat (and therefore their org), and
// dispatch to the right RPC depending on the capture kind.
//
// Auth model:
//   Authorization: Bearer <supabase_access_token>
//   The token is the same one the web app uses — issued by Supabase
//   Auth on Google sign-in. We don't store it; we just verify and use
//   it to scope writes.
//
// Request body:
//   { kind: 'gmail_thread' | 'gcal_event', ...payload }
//
// Response:
//   { ok: true, created: { people: N, interaction: 1 } }
//   { ok: false, error: '...' }

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-extension-version')
    return res.status(204).end()
  }
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(503).json({ error: 'Supabase not configured on server' })
  }

  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return res.status(401).json({ error: 'Missing bearer token' })

  // Per-request Supabase client that runs under the user's JWT — every
  // insert is automatically scoped via RLS (org_id = current_user_org_id).
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  })

  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
  body = body || {}

  try {
    // Resolve the active seat → org_id. If the user has no seat the
    // extension capture has nowhere to land.
    const { data: orgId, error: orgErr } = await sb.rpc('current_user_org_id')
    if (orgErr) return res.status(500).json({ error: orgErr.message })
    if (!orgId)  return res.status(403).json({ error: 'No active seat — finish onboarding in the workspace first.' })

    switch (body.kind) {
      case 'gmail_thread':  return await handleGmailThread(sb, orgId, body, res)
      case 'gcal_event':    return await handleCalendarEvent(sb, orgId, body, res)
      default:
        return res.status(400).json({ error: `Unknown capture kind: ${body.kind}` })
    }
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Capture failed' })
  }
}

// ============ GMAIL THREAD ============
async function handleGmailThread(sb, orgId, body, res) {
  const { threadId, subject, occurredAt, snippet, participants } = body
  if (!subject) return res.status(400).json({ error: 'Missing subject' })

  // Dedupe: skip if we already captured this thread for this org.
  if (threadId) {
    const { data: existing } = await sb.from('interactions')
      .select('id')
      .eq('external_id', `gmail:${threadId}`)
      .eq('org_id', orgId)
      .limit(1)
    if (existing && existing.length > 0) {
      return res.status(200).json({
        ok: true,
        created: { people: 0, interaction: 0 },
        note: 'Already captured this thread.'
      })
    }
  }

  // Upsert each participant as a person. Match by lowercase email to
  // avoid creating duplicates from different cases.
  const people = []
  for (const p of (participants || [])) {
    const email = (p.email || '').toLowerCase().trim()
    if (!email || !email.includes('@')) continue
    const name = (p.name || '').trim() || email.split('@')[0]
    const { data: existing } = await sb.from('people')
      .select('id, full_name, email, company')
      .eq('org_id', orgId)
      .ilike('email', email)
      .limit(1)
    if (existing && existing.length > 0) {
      people.push({ id: existing[0].id, isNew: false, email })
    } else {
      const company = email.split('@')[1]?.split('.')[0] || null
      const { data: created, error: insErr } = await sb.from('people')
        .insert({
          org_id: orgId,
          full_name: name,
          email,
          company: company ? capitalise(company) : null,
          notes: 'Auto-captured from Gmail.'
        })
        .select('id')
        .single()
      if (insErr) continue
      people.push({ id: created.id, isNew: true, email })
    }
  }

  // Log the interaction. counterparty_name = first non-self participant.
  const lead = (participants || [])[0]
  const { error: intErr } = await sb.from('interactions')
    .insert({
      org_id: orgId,
      counterparty_name: lead?.name || lead?.email || 'Unknown',
      counterparty_company: extractCompanyFromEmail(lead?.email),
      type: 'email',
      outcome: 'neutral',
      notes: snippet ? `Subject: ${subject}\n\n${snippet}` : `Subject: ${subject}`,
      created_at: occurredAt || new Date().toISOString(),
      external_id: threadId ? `gmail:${threadId}` : null
    })
  if (intErr) return res.status(500).json({ error: intErr.message })

  return res.status(200).json({
    ok: true,
    created: {
      people: people.filter(p => p.isNew).length,
      interaction: 1,
      matchedExistingPeople: people.filter(p => !p.isNew).length
    }
  })
}

// ============ CALENDAR EVENT ============
async function handleCalendarEvent(sb, orgId, body, res) {
  const { eventId, title, occurredAt, timeText, location, attendees } = body
  if (!title) return res.status(400).json({ error: 'Missing title' })

  if (eventId) {
    const { data: existing } = await sb.from('interactions')
      .select('id')
      .eq('external_id', `gcal:${eventId}`)
      .eq('org_id', orgId)
      .limit(1)
    if (existing && existing.length > 0) {
      return res.status(200).json({
        ok: true,
        created: { people: 0, interaction: 0 },
        note: 'Already captured this event.'
      })
    }
  }

  const people = []
  for (const a of (attendees || [])) {
    const email = (a.email || '').toLowerCase().trim()
    if (!email || !email.includes('@')) continue
    const name = (a.name || '').trim() || email.split('@')[0]
    const { data: existing } = await sb.from('people')
      .select('id')
      .eq('org_id', orgId)
      .ilike('email', email)
      .limit(1)
    if (existing && existing.length > 0) {
      people.push({ id: existing[0].id, isNew: false })
    } else {
      const company = extractCompanyFromEmail(email)
      const { data: created, error: insErr } = await sb.from('people')
        .insert({
          org_id: orgId,
          full_name: name,
          email,
          company,
          notes: 'Auto-captured from Google Calendar.'
        })
        .select('id')
        .single()
      if (insErr) continue
      people.push({ id: created.id, isNew: true })
    }
  }

  const lead = (attendees || [])[0]
  const { error: intErr } = await sb.from('interactions')
    .insert({
      org_id: orgId,
      counterparty_name: lead?.name || lead?.email || title,
      counterparty_company: extractCompanyFromEmail(lead?.email),
      type: 'meeting',
      outcome: 'neutral',
      notes: [
        title,
        timeText ? `When: ${timeText}` : null,
        location ? `Where: ${location}` : null,
        attendees?.length ? `Attendees: ${attendees.length}` : null
      ].filter(Boolean).join('\n'),
      created_at: occurredAt || new Date().toISOString(),
      external_id: eventId ? `gcal:${eventId}` : null
    })
  if (intErr) return res.status(500).json({ error: intErr.message })

  return res.status(200).json({
    ok: true,
    created: {
      people: people.filter(p => p.isNew).length,
      interaction: 1,
      matchedExistingPeople: people.filter(p => !p.isNew).length
    }
  })
}

// ============ HELPERS ============
function extractCompanyFromEmail(email) {
  if (!email || !email.includes('@')) return null
  const domain = email.split('@')[1] || ''
  if (!domain) return null
  // Skip generic domains — we don't want to fill `company` with "Gmail".
  const generic = new Set(['gmail.com','outlook.com','hotmail.com','yahoo.com','icloud.com','proton.me','protonmail.com'])
  if (generic.has(domain.toLowerCase())) return null
  return capitalise(domain.split('.')[0])
}

function capitalise(s) {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}
