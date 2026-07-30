// /api/gmail-sync — background Gmail → People sync (Vercel Cron).
//
// For every user who connected Google with the gmail.readonly scope (their
// refresh token is stored server-side in google_credentials), this mints a
// fresh access token, scans recent Gmail message *metadata* (From/To/Cc
// headers only — never bodies), and auto-adds any NEW external sender to
// that user's org People list. Internal teammates (@the firm domain) and
// people already on file (matched by email) are skipped.
//
// Security: only callable with the Vercel Cron secret. Writes use the
// Supabase service-role key, so people land in the right org via the
// org_id we set explicitly (the people BEFORE-INSERT trigger only fills
// org_id when null, so our value is preserved).
//
// Env (set on the Vercel project — server-only, no VITE_ prefix):
//   SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY,
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, CRON_SECRET,
//   VALENCE_INTERNAL_DOMAIN (optional, defaults to valencegrowthpartners.com)
//
// Until the OAuth consent screen actually grants gmail.readonly and users
// re-consent, the Gmail calls 403 and each credential is marked with a
// sync_error — no rows are written, nothing breaks.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL   = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY
const CLIENT_ID      = process.env.GOOGLE_CLIENT_ID
const CLIENT_SECRET  = process.env.GOOGLE_CLIENT_SECRET
const CRON_SECRET    = process.env.CRON_SECRET
const INTERNAL_DOMAIN = (process.env.VALENCE_INTERNAL_DOMAIN || 'valencegrowthpartners.com').toLowerCase()

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'

const MAX_MESSAGES = 150   // cap scanned messages per user per run (bounds cost)
const MAX_DAYS = 30        // never look back further than this

export default async function handler(req, res) {
  // Gate: the endpoint writes to everyone's People list, so it must never be
  // open. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
  if (!CRON_SECRET) return res.status(503).json({ error: 'CRON_SECRET not configured' })
  if ((req.headers.authorization || '') !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (!SUPABASE_URL || !SERVICE_KEY) return res.status(503).json({ error: 'Supabase service role not configured' })
  if (!CLIENT_ID || !CLIENT_SECRET) return res.status(503).json({ error: 'Google client not configured' })

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  })

  const { data: creds, error: credErr } = await sb.from('google_credentials').select('*')
  if (credErr) return res.status(500).json({ error: credErr.message })

  const summary = { processed: 0, added: 0, matched: 0, scanned: 0, errors: [] }

  for (const cred of (creds || [])) {
    try {
      const token = await mintAccessToken(cred.refresh_token)
      if (!token) {
        await markError(sb, cred.user_id, 'token refresh failed (reconnect Google)')
        summary.errors.push({ user: cred.user_id, error: 'token refresh failed' })
        continue
      }

      const days = windowDays(cred.last_synced_at)
      const ids = await listMessageIds(token, `newer_than:${days}d -in:chats`, MAX_MESSAGES)
      summary.scanned += ids.length

      // Collect unique external addresses across the scanned messages.
      const found = new Map() // email -> best-known display name
      for (const id of ids) {
        for (const a of await messageAddresses(token, id)) {
          const e = a.email
          if (!e || e === (cred.google_email || '').toLowerCase()) continue
          if (e.endsWith('@' + INTERNAL_DOMAIN)) continue
          if (!found.has(e) || (!found.get(e) && a.name)) found.set(e, a.name)
        }
      }

      let added = 0, matched = 0
      for (const [email, name] of found) {
        const r = await upsertPerson(sb, cred.org_id, email, name)
        if (r === 'added') added++
        else if (r === 'matched') matched++
      }

      await sb.from('google_credentials').update({
        last_synced_at: new Date().toISOString(),
        sync_error: null,
        updated_at: new Date().toISOString()
      }).eq('user_id', cred.user_id)

      summary.processed++
      summary.added += added
      summary.matched += matched
    } catch (e) {
      const msg = String(e?.message || e).slice(0, 300)
      summary.errors.push({ user: cred.user_id, error: msg })
      await markError(sb, cred.user_id, msg)
    }
  }

  return res.status(200).json({ ok: true, ...summary })
}

async function markError(sb, userId, msg) {
  try {
    await sb.from('google_credentials')
      .update({ sync_error: msg, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
  } catch { /* non-fatal */ }
}

// First run looks back a week; later runs cover the gap since last success
// (+1 day of slack), capped at MAX_DAYS.
function windowDays(lastSyncedAt) {
  if (!lastSyncedAt) return 7
  const ms = Date.now() - new Date(lastSyncedAt).getTime()
  const days = Math.ceil(ms / 86_400_000) + 1
  return Math.min(Math.max(days, 1), MAX_DAYS)
}

async function mintAccessToken(refreshToken) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  })
  const r = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  })
  const d = await r.json().catch(() => ({}))
  return r.ok && d.access_token ? d.access_token : null
}

async function listMessageIds(token, q, cap) {
  const ids = []
  let pageToken = ''
  while (ids.length < cap) {
    const params = new URLSearchParams({ q, maxResults: '100' })
    if (pageToken) params.set('pageToken', pageToken)
    const r = await fetch(`${GMAIL_BASE}/messages?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!r.ok) {
      // 403 = the gmail.readonly scope isn't granted yet (consent screen not
      // updated / user hasn't re-consented). Surface it so it lands in
      // sync_error rather than silently looking "done".
      throw new Error(`Gmail list ${r.status}: ${(await r.text().catch(() => '')) || r.statusText}`)
    }
    const d = await r.json()
    for (const m of (d.messages || [])) ids.push(m.id)
    if (!d.nextPageToken) break
    pageToken = d.nextPageToken
  }
  return ids.slice(0, cap)
}

async function messageAddresses(token, id) {
  const params = new URLSearchParams({ format: 'metadata' })
  params.append('metadataHeaders', 'From')
  params.append('metadataHeaders', 'To')
  params.append('metadataHeaders', 'Cc')
  const r = await fetch(`${GMAIL_BASE}/messages/${id}?${params}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!r.ok) return []
  const d = await r.json().catch(() => ({}))
  const headers = d.payload?.headers || []
  const out = []
  for (const h of headers) {
    if (h.name === 'From' || h.name === 'To' || h.name === 'Cc') {
      out.push(...parseAddresses(h.value))
    }
  }
  return out
}

// Parse an RFC 5322 address-list header into [{ email, name }]. Naive comma
// split — adequate for From/To/Cc; malformed fragments are dropped.
function parseAddresses(value) {
  if (!value) return []
  return value.split(',').map(part => {
    const m = part.match(/<([^>]+)>/)
    const email = (m ? m[1] : part).trim().toLowerCase()
    let name = m ? part.slice(0, part.indexOf('<')).trim() : ''
    name = name.replace(/^["']|["']$/g, '').trim()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null
    return { email, name }
  }).filter(Boolean)
}

// Find a person by email (case-insensitive, via the functional unique index)
// or create one. Returns 'added' | 'matched'.
async function upsertPerson(sb, orgId, email, name) {
  const norm = email.toLowerCase().trim()
  const escaped = norm.replace(/[\\%_]/g, m => `\\${m}`)
  const { data: found } = await sb.from('people')
    .select('id').eq('org_id', orgId).ilike('email', escaped).limit(1).maybeSingle()
  if (found?.id) return 'matched'

  const { error } = await sb.from('people').insert({
    org_id: orgId,
    full_name: (name && name.trim()) || norm.split('@')[0],
    email: norm,                       // email_normalised is a GENERATED column — never insert it
    company: companyFromEmail(norm),
    is_valence_team: false,
    relationship_history: 'Auto-added from Gmail.'  // people has no `notes` column
  })
  if (error) {
    if (error.code === '23505') return 'matched' // lost a race — already exists
    throw error
  }
  return 'added'
}

const GENERIC = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'yahoo.com',
  'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'aol.com'
])
function companyFromEmail(email) {
  const domain = (email.split('@')[1] || '').toLowerCase()
  if (!domain || GENERIC.has(domain)) return null
  const core = domain.split('.')[0]
  return core ? core.charAt(0).toUpperCase() + core.slice(1) : null
}
