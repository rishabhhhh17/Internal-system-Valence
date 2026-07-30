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

    // Phase 27b — pull the authed user's email so gmail captures can be
    // classified as email_sent vs email_received by comparing against the
    // last message's From header. Falls back to email_received when we
    // don't have a clear sender so older captures don't false-flag.
    const { data: userInfo } = await sb.auth.getUser()
    const userEmail = (userInfo?.user?.email || '').toLowerCase()

    switch (body.kind) {
      case 'gmail_thread':  return await handleGmailThread(sb, orgId, userEmail, body, res)
      case 'gcal_event':    return await handleCalendarEvent(sb, orgId, body, res)
      default:
        return res.status(400).json({ error: `Unknown capture kind: ${body.kind}` })
    }
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Capture failed' })
  }
}

// ============ GMAIL THREAD ============
async function handleGmailThread(sb, orgId, userEmail, body, res) {
  const { threadId, subject, occurredAt, snippet, participants, lastFrom } = body
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

  // Upsert each participant as a person. The previous fetch-then-insert
  // pattern raced under concurrent captures — two extension clicks landed
  // inside each other's existence-check window and both inserted. Phase 30
  // added a unique partial index on (org_id, lower(trim(email))) where
  // email is real, so we now use ON CONFLICT to either get the existing
  // row's id or insert + return atomically.
  const people = []
  for (const p of (participants || [])) {
    const email = (p.email || '').toLowerCase().trim()
    if (!email || !email.includes('@')) continue
    const name = (p.name || '').trim() || email.split('@')[0]
    const company = email.split('@')[1]?.split('.')[0] || null
    const { data: upserted, error: upErr } = await sb.from('people')
      .upsert(
        {
          org_id: orgId,
          full_name: name,
          email,
          company: company ? capitalise(company) : null,
          notes: 'Auto-captured from Gmail.'
        },
        { onConflict: 'org_id,email', ignoreDuplicates: false }
      )
      .select('id')
      .single()
    if (upErr || !upserted) continue
    people.push({ id: upserted.id, isNew: false, email })
  }

  // counterparty_name = first non-self participant. With userEmail known
  // we pick the actual external participant rather than slot 0 (which is
  // often the user themselves on outbound).
  const externalParticipants = (participants || []).filter(p => {
    const e = (p.email || '').toLowerCase()
    return e && e !== userEmail
  })
  const lead = externalParticipants[0] || (participants || [])[0]

  // Direction: lastFrom is the sender of the last visible message. If
  // that's us, the ball is in their court (a Waiting On candidate).
  const senderIsUs      = !!(userEmail && lastFrom && lastFrom === userEmail)
  const interactionType = senderIsUs ? 'email_sent' : 'email_received'

  // Try to attach this thread to a deal — contacts is the canonical
  // (deal_id, email) link in this schema. Pick the most recently-updated
  // matching deal so live mandates win over closed ones.
  let dealId = null
  const partEmails = externalParticipants
    .map(p => (p.email || '').toLowerCase())
    .filter(e => e && e.includes('@'))
  if (partEmails.length) {
    const { data: dealHit } = await sb
      .from('contacts')
      .select('deal_id, deals(updated_at)')
      .in('email', partEmails)
      .not('deal_id', 'is', null)
      .order('updated_at', { ascending: false, referencedTable: 'deals' })
      .limit(1)
    dealId = dealHit?.[0]?.deal_id || null
  }

  // Link the people row for the lead so the relationship graph + Waiting
  // On signal can find them.
  const leadEmail  = (lead?.email || '').toLowerCase()
  const leadPerson = people.find(p => p.email === leadEmail)

  // type='email' and outcome='neutral' both fail the CHECK constraints
  // (legal: 'email_thread' / 'in_progress'). See PR #205.
  const { error: intErr } = await sb.from('interactions')
    .insert({
      org_id: orgId,
      deal_id: dealId,
      external_person_id: leadPerson?.id || null,
      counterparty_name: lead?.name || lead?.email || 'Unknown',
      counterparty_company: extractCompanyFromEmail(lead?.email),
      type: 'email_thread',
      interaction_type: interactionType,
      outcome: 'in_progress',
      subject,
      summary: snippet || null,
      source: 'gmail',
      source_id: threadId || null,
      notes: snippet ? `Subject: ${subject}\n\n${snippet}` : `Subject: ${subject}`,
      occurred_at: occurredAt || new Date().toISOString(),
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

  // Same race fix as the Gmail handler — switch to ON CONFLICT upsert
  // now that Phase 30's unique partial index on (org_id, lower(trim(email)))
  // exists.
  const people = []
  for (const a of (attendees || [])) {
    const email = (a.email || '').toLowerCase().trim()
    if (!email || !email.includes('@')) continue
    const name = (a.name || '').trim() || email.split('@')[0]
    const { data: upserted, error: upErr } = await sb.from('people')
      .upsert(
        {
          org_id: orgId,
          full_name: name,
          email,
          company: extractCompanyFromEmail(email),
          notes: 'Auto-captured from Google Calendar.'
        },
        { onConflict: 'org_id,email', ignoreDuplicates: false }
      )
      .select('id')
      .single()
    if (upErr || !upserted) continue
    people.push({ id: upserted.id, isNew: false })
  }

  // type='meeting' isn't in interactions_type_check; the closest legal
  // value is 'pitch_meeting' (already used by 302+ live rows). outcome
  // 'neutral' is also not in the CHECK list — every capture has been
  // silently 23514ing.
  const lead = (attendees || [])[0]
  const { error: intErr } = await sb.from('interactions')
    .insert({
      org_id: orgId,
      counterparty_name: lead?.name || lead?.email || title,
      counterparty_company: extractCompanyFromEmail(lead?.email),
      type: 'pitch_meeting',
      outcome: 'in_progress',
      source: 'gcal',
      notes: [
        title,
        timeText ? `When: ${timeText}` : null,
        location ? `Where: ${location}` : null,
        attendees?.length ? `Attendees: ${attendees.length}` : null
      ].filter(Boolean).join('\n'),
      occurred_at: occurredAt || new Date().toISOString(),
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
