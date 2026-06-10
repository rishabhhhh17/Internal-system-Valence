// Auto-capture — turn the connected Google account into logged interactions
// with zero manual entry. Scans Calendar events + Gmail metadata over a recent
// window, matches counterparties to People CRM rows BY EMAIL, and writes one
// deduped interaction per (event/message × matched person).
//
// Because warmth (src/lib/relationships.js) is derived from interactions, every
// captured row automatically freshens last-interaction + relationship strength
// for that person — no extra wiring.
//
// Scope (v1): Calendar + Gmail, email matching, dedup via source_id, metadata
// only (title / subject — never the body). Out of scope: an always-on
// background daemon, full-text capture, fuzzy name matching beyond email.

import { supabase, isSupabaseConfigured } from './supabase.js'
import { googleToken, GoogleAuthExpired, listEventsBetween } from './google.js'

const DAY = 86_400_000
// Gmail's q= is one big OR over addresses; cap how many we search so the query
// stays sane on large People books. Calendar matches the full book (it's keyed
// on attendee emails already present on each event).
const GMAIL_EMAIL_CAP = 30

async function gfetch(url) {
  const token = await googleToken()
  if (!token) throw new GoogleAuthExpired()
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 401) throw new GoogleAuthExpired()
  if (!res.ok) throw new Error(`Gmail API ${res.status}`)
  return res.json()
}

async function searchGmail(emails, days, maxResults = 60) {
  if (!emails.length) return []
  const q = emails.map(e => `from:${e} OR to:${e}`).join(' OR ')
  const search = encodeURIComponent(`(${q}) newer_than:${Math.max(1, days)}d`)
  const res = await gfetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${search}&maxResults=${maxResults}`)
  return res.messages || []
}

async function readHeaders(id) {
  const data = await gfetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date`
  )
  const h = data.payload?.headers || []
  const pick = (n) => h.find(x => x.name?.toLowerCase() === n.toLowerCase())?.value || ''
  return {
    from: pick('From'), to: pick('To'), cc: pick('Cc'), subject: pick('Subject'),
    when: data.internalDate ? new Date(Number(data.internalDate)) : new Date()
  }
}

function buildEmailIndex(people) {
  const m = new Map()
  for (const p of people || []) {
    const e = (p.email || '').toLowerCase().trim()
    if (e) m.set(e, p)
  }
  return m
}

function mkRow({ person, source, source_id, when, subject, type }) {
  const iso = (when instanceof Date ? when : new Date(when || Date.now())).toISOString()
  const label = source === 'calendar' ? 'Meeting' : 'Email'
  return {
    counterparty_name: person.full_name,           // warmth matches on this
    counterparty_company: person.company || null,
    person_id: person.id,
    // org_id intentionally omitted — interactions_set_org_id stamps it from the
    // signed-in user so the row lands in their workspace under RLS.
    source,
    source_id,
    type,
    interaction_type: type,
    subject: subject || null,
    summary: `${label}: ${subject || (source === 'calendar' ? '(untitled)' : '(no subject)')}`,
    occurred_at: iso,
    created_at: iso,                                // recency keys on created_at
    is_complete: true
    // The `source` value ('calendar'|'gmail') is what marks a row as
    // auto-captured everywhere (badge, dedup, counts) — origination is left
    // for the inbound/outbound/referral/intro taxonomy.
  }
}

// Run a capture pass. Returns { calendar:{scanned,added}, gmail:{scanned,added}, added }.
export async function captureFromGoogle({ days = 90, sources = ['calendar', 'gmail'], selfEmail = '', onProgress } = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured.')
  const self = (selfEmail || '').toLowerCase().trim()

  onProgress?.({ label: 'Loading contacts…' })
  const { data: people, error: pErr } = await supabase.from('people').select('id, full_name, email, company')
  if (pErr) throw pErr
  const emailIndex = buildEmailIndex(people)
  if (emailIndex.size === 0) return { calendar: { scanned: 0, added: 0 }, gmail: { scanned: 0, added: 0 }, added: 0, reason: 'No contacts with emails to match against.' }

  // Dedup against everything we've captured before.
  const { data: existing } = await supabase.from('interactions').select('source_id').in('source', ['calendar', 'gmail'])
  const seen = new Set((existing || []).map(r => r.source_id).filter(Boolean))

  const now = new Date()
  const start = new Date(now.getTime() - days * DAY)
  const rows = []
  const stats = { calendar: { scanned: 0, added: 0 }, gmail: { scanned: 0, added: 0 } }

  if (sources.includes('calendar')) {
    onProgress?.({ label: 'Scanning calendar…' })
    let events = []
    try { events = await listEventsBetween(start, now) } catch (e) { if (e instanceof GoogleAuthExpired) throw e }
    for (const ev of events) {
      stats.calendar.scanned++
      if (ev.allDay) continue
      for (const a of (ev.attendees || [])) {
        const email = (a.email || '').toLowerCase().trim()
        if (!email || email === self) continue
        const person = emailIndex.get(email)
        if (!person) continue
        const sid = `cal:${ev.id}:${email}`
        if (seen.has(sid)) continue
        seen.add(sid)
        rows.push(mkRow({ person, source: 'calendar', source_id: sid, when: ev.start, subject: ev.summary, type: 'event' }))
        stats.calendar.added++
      }
    }
  }

  if (sources.includes('gmail')) {
    onProgress?.({ label: 'Scanning inbox…' })
    const emails = [...emailIndex.keys()].slice(0, GMAIL_EMAIL_CAP)
    let hits = []
    try { hits = await searchGmail(emails, days) } catch (e) { if (e instanceof GoogleAuthExpired) throw e }
    for (const hit of hits) {
      stats.gmail.scanned++
      const sid = `gmail:${hit.id}`
      if (seen.has(sid)) continue
      let meta
      try { meta = await readHeaders(hit.id) } catch { continue }
      const parties = `${meta.from} ${meta.to} ${meta.cc}`.toLowerCase()
      let matched = null
      for (const email of emails) { if (parties.includes(email)) { matched = emailIndex.get(email); break } }
      if (!matched) continue
      seen.add(sid)
      rows.push(mkRow({ person: matched, source: 'gmail', source_id: sid, when: meta.when, subject: meta.subject, type: 'email_thread' }))
      stats.gmail.added++
    }
  }

  if (rows.length) {
    onProgress?.({ label: `Saving ${rows.length}…` })
    const { error } = await supabase.from('interactions').insert(rows)
    if (error) throw error
  }
  onProgress?.({ label: 'Done' })
  return { ...stats, added: stats.calendar.added + stats.gmail.added }
}

// Count interactions auto-captured in the last `days` (for the surface card).
export async function countRecentCaptures({ days = 7 } = {}) {
  if (!isSupabaseConfigured) return { total: 0, calendar: 0, gmail: 0 }
  const since = new Date(Date.now() - days * DAY).toISOString()
  const { data } = await supabase
    .from('interactions').select('source')
    .in('source', ['calendar', 'gmail'])
    .gte('occurred_at', since)
  const rows = data || []
  return {
    total: rows.length,
    calendar: rows.filter(r => r.source === 'calendar').length,
    gmail: rows.filter(r => r.source === 'gmail').length
  }
}
