// Vercel function — proxies the Fathom External API so the client doesn't
// run into CORS (Fathom doesn't send Access-Control-Allow-Origin for
// arbitrary browser origins) AND so the Fathom API key never reaches
// the browser bundle.
//
// Fathom API reference: https://developers.fathom.ai
// Base:   https://api.fathom.ai/external/v1
// Auth:   X-Api-Key: <key>
//
// Endpoints (all GET):
//   /api/fathom?op=list[&limit=10]
//   /api/fathom?op=meeting&id=<recording_id>   → summary + transcript merged
//   /api/fathom?op=latest                       → list + summary + transcript
//
// Env: FATHOM_API_KEY (server-only, NOT VITE_ prefixed)

const BASE = 'https://api.fathom.ai/external/v1'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  const key = process.env.FATHOM_API_KEY
  if (!key) {
    return res.status(500).json({ error: 'FATHOM_API_KEY not configured on the server.' })
  }

  const op    = String(req.query.op || 'list').toLowerCase()
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10))
  const id    = req.query.id

  try {
    if (op === 'list') {
      const data = await call(`/meetings?limit=${limit}`, key)
      return res.status(200).json(normaliseList(data))
    }

    if (op === 'meeting') {
      if (!id) return res.status(400).json({ error: 'id query param required (Fathom recording id)' })
      const merged = await fetchMeetingDetail(id, key)
      return res.status(200).json(merged)
    }

    if (op === 'latest') {
      const list = normaliseList(await call(`/meetings?limit=5`, key))
      if (list.length === 0) return res.status(200).json(null)
      // Pick the newest with a recording_id (some scheduled meetings may not
      // have one yet — skip those rather than 500'ing on a missing id).
      const newest = list.find(m => m.id) || list[0]
      if (!newest.id) return res.status(200).json({ ...newest, summary: '', transcript: '', actionItems: [] })
      const detail = await fetchMeetingDetail(newest.id, key)
      // Carry the list-level metadata (title / attendees / url) onto the
      // merged response so the caller has everything in one shot.
      return res.status(200).json({ ...newest, ...detail })
    }

    return res.status(400).json({ error: `Unknown op: ${op}` })
  } catch (err) {
    return res.status(502).json({ error: err?.message || 'Fathom proxy error' })
  }
}

// Pull summary + transcript for one recording and merge them.
async function fetchMeetingDetail(recordingId, key) {
  const [summaryRes, transcriptRes] = await Promise.allSettled([
    call(`/recordings/${encodeURIComponent(recordingId)}/summary`,   key),
    call(`/recordings/${encodeURIComponent(recordingId)}/transcript`, key)
  ])
  const summary    = summaryRes.status    === 'fulfilled' ? extractSummary(summaryRes.value)       : ''
  const transcript = transcriptRes.status === 'fulfilled' ? extractTranscript(transcriptRes.value) : ''
  return {
    id:          recordingId,
    summary,
    transcript,
    actionItems: extractActionItems(summaryRes.status === 'fulfilled' ? summaryRes.value : null)
  }
}

async function call(path, key) {
  const r = await fetch(`${BASE}${path}`, {
    headers: {
      'X-Api-Key': key,
      'Accept':    'application/json'
    }
  })
  if (!r.ok) {
    const t = await r.text().catch(() => '')
    throw new Error(`Fathom ${r.status} ${r.statusText}${t ? ' — ' + t.slice(0, 200) : ''}`)
  }
  return r.json()
}

// --- Normalisers — defensive against shape renames ----------------------

function normaliseList(data) {
  const rows = data?.items || data?.meetings || data?.data || (Array.isArray(data) ? data : [])
  return rows.map(m => ({
    id:           m?.recording_id || m?.id || m?.meeting_id || null,
    title:        m?.title || m?.meeting_title || 'Meeting',
    started_at:   m?.scheduled_start_time || m?.recording_start_time || m?.started_at || null,
    ended_at:     m?.scheduled_end_time   || m?.recording_end_time   || m?.ended_at   || null,
    attendees:    normaliseAttendees(m?.calendar_invitees || m?.attendees || m?.participants),
    share_url:    m?.share_url || m?.url || null,
    meeting_type: m?.meeting_type || null
  }))
}

function extractSummary(data) {
  // Direct shape: { summary: { ... } } — extract a readable string.
  const s = data?.summary || data
  if (!s) return ''
  if (typeof s === 'string') return s
  if (s.text) return s.text
  if (s.markdown) return s.markdown
  if (Array.isArray(s.sections)) {
    return s.sections.map(sec => {
      const heading = sec.title || sec.name || ''
      const body    = sec.text || sec.content || (Array.isArray(sec.bullets) ? sec.bullets.map(b => `• ${b}`).join('\n') : '')
      return heading ? `${heading}\n${body}` : body
    }).filter(Boolean).join('\n\n')
  }
  return JSON.stringify(s).slice(0, 2000)
}

function extractTranscript(data) {
  const t = data?.transcript || data
  if (!t) return ''
  if (typeof t === 'string') return t
  if (t.text) return t.text
  if (Array.isArray(t.utterances)) {
    return t.utterances.map(u => `${u.speaker || ''}${u.speaker ? ': ' : ''}${u.text || ''}`).join('\n')
  }
  return ''
}

function extractActionItems(data) {
  const s = data?.summary || data
  if (!s) return []
  if (Array.isArray(s.action_items)) return s.action_items
  if (Array.isArray(data?.action_items)) return data.action_items
  return []
}

function normaliseAttendees(attendees) {
  if (!Array.isArray(attendees)) return []
  return attendees.map(a => ({
    name:     a?.name || a?.full_name || a?.email || '',
    email:    a?.email || '',
    external: a?.is_external ?? null
  }))
}
