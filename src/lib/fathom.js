// Fathom integration — pulls completed meeting transcripts + summaries from
// the Fathom API and shapes them so the InteractionDrawer can drop them
// into a logged interaction with one click.
//
// Configuration:
//   * Set VITE_FATHOM_API_KEY in your Vercel env (or `.env` for local).
//     The free Fathom plan exposes a personal API token under Settings →
//     Integrations → API. Paste it as-is.
//
// API surface (matches Fathom's public docs as of 2026 — the official
// endpoint shape may need small adjustments depending on your Fathom plan):
//
//   GET /external/v1/meetings        → list recent meetings
//   GET /external/v1/meetings/:id    → full transcript + AI summary
//
// We keep the wrapper deliberately defensive — Fathom occasionally renames
// fields and we don't want a Fathom-side rename to brick the integration.

export const fathomKey = import.meta.env.VITE_FATHOM_API_KEY
export const isFathomConfigured = Boolean(fathomKey)

const BASE = 'https://api.fathom.video/external/v1'

async function call(path, { method = 'GET', body } = {}) {
  if (!isFathomConfigured) {
    throw new Error('Fathom API key not configured (VITE_FATHOM_API_KEY).')
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'X-Api-Key':     fathomKey,
      'Authorization': `Bearer ${fathomKey}`,    // Fathom accepts either header
      'Content-Type':  'application/json',
      'Accept':        'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Fathom ${res.status} ${res.statusText}${text ? ' — ' + text.slice(0, 180) : ''}`)
  }
  return res.json()
}

/**
 * List the user's most recent meetings (limit ≤ 25). Returns a normalised
 * array: { id, title, started_at, ended_at, attendees, summary_url }.
 */
export async function listRecentMeetings({ limit = 10 } = {}) {
  const data = await call(`/meetings?limit=${limit}`)
  const rows = Array.isArray(data) ? data : (data?.meetings || data?.data || [])
  return rows.map(normaliseMeeting)
}

/**
 * Pull a single meeting's full transcript + summary + action items.
 * Returns { transcript, summary, actionItems, attendees }.
 */
export async function fetchMeeting(meetingId) {
  if (!meetingId) throw new Error('meetingId required')
  const data = await call(`/meetings/${encodeURIComponent(meetingId)}`)
  return {
    id:          data?.id || meetingId,
    title:       data?.title || data?.subject || '',
    started_at:  data?.started_at || data?.scheduled_start || null,
    ended_at:    data?.ended_at   || null,
    attendees:   normaliseAttendees(data?.attendees || data?.participants),
    summary:     data?.summary?.text  || data?.summary  || '',
    transcript:  data?.transcript?.text || data?.transcript || '',
    actionItems: Array.isArray(data?.action_items) ? data.action_items : []
  }
}

/**
 * Convenience: pull the most recent completed meeting in one round-trip.
 * Used by the InteractionDrawer's "Pull from Fathom" affordance.
 */
export async function pullLatestMeeting() {
  const recent = await listRecentMeetings({ limit: 5 })
  if (recent.length === 0) throw new Error('No recent Fathom meetings found.')
  // First entry is newest; fetch its full record so we get transcript + summary.
  return fetchMeeting(recent[0].id)
}

/**
 * Schedule the Fathom bot to join a Zoom / Google Meet / Teams call when
 * the user creates a calendar event. The InteractionDrawer + Calendar
 * surfaces both call this on event creation if the user opted in.
 *
 * Fathom auto-joins meetings on the user's calendar by default once they
 * connect Fathom to Google / Microsoft Calendar — there's no scheduling
 * endpoint required for that path. This helper is here for the OPPOSITE
 * case: ad-hoc meeting URLs that weren't on the calendar.
 */
export async function scheduleBotForMeeting({ meeting_url, title, scheduled_for }) {
  return call('/meetings/scheduled', {
    method: 'POST',
    body: { meeting_url, title, scheduled_for }
  })
}

// --- Shape normalisers ---------------------------------------------------
function normaliseMeeting(m) {
  return {
    id:          m?.id || m?.meeting_id,
    title:       m?.title || m?.subject || 'Meeting',
    started_at:  m?.started_at || m?.scheduled_start || m?.start_time || null,
    ended_at:    m?.ended_at   || m?.end_time || null,
    attendees:   normaliseAttendees(m?.attendees || m?.participants),
    summary_url: m?.share_url  || m?.url || null
  }
}

function normaliseAttendees(attendees) {
  if (!Array.isArray(attendees)) return []
  return attendees.map(a => ({
    name:  a?.name || a?.full_name || a?.email || '',
    email: a?.email || ''
  }))
}
