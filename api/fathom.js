// Vercel function — proxies the Fathom REST API so the client doesn't
// run into CORS (Fathom doesn't send Access-Control-Allow-Origin for
// arbitrary browser origins) AND so the Fathom API key never reaches
// the browser bundle.
//
// Endpoints (all GET):
//   /api/fathom?op=list[&limit=10]
//   /api/fathom?op=meeting&id=<meeting_id>
//   /api/fathom?op=latest
//
// Env: FATHOM_API_KEY (NOT prefixed with VITE_ — this is server-only)

const BASE = 'https://api.fathom.video/external/v1'

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
      return res.status(200).json(normaliseListResponse(data))
    }
    if (op === 'meeting') {
      if (!id) return res.status(400).json({ error: 'id query param required' })
      const data = await call(`/meetings/${encodeURIComponent(id)}`, key)
      return res.status(200).json(normaliseMeeting(data))
    }
    if (op === 'latest') {
      const list = normaliseListResponse(await call(`/meetings?limit=5`, key))
      if (list.length === 0) return res.status(200).json(null)
      const detail = await call(`/meetings/${encodeURIComponent(list[0].id)}`, key)
      return res.status(200).json(normaliseMeeting(detail))
    }
    return res.status(400).json({ error: `Unknown op: ${op}` })
  } catch (err) {
    return res.status(502).json({ error: err?.message || 'Fathom proxy error' })
  }
}

async function call(path, key) {
  const r = await fetch(`${BASE}${path}`, {
    headers: {
      'X-Api-Key':     key,
      'Authorization': `Bearer ${key}`,
      'Accept':        'application/json'
    }
  })
  if (!r.ok) {
    const t = await r.text().catch(() => '')
    throw new Error(`Fathom ${r.status} ${r.statusText}${t ? ' — ' + t.slice(0, 200) : ''}`)
  }
  return r.json()
}

function normaliseListResponse(data) {
  const rows = Array.isArray(data) ? data : (data?.meetings || data?.data || data?.results || [])
  return rows.map(m => ({
    id:          m?.id || m?.meeting_id,
    title:       m?.title || m?.subject || 'Meeting',
    started_at:  m?.started_at || m?.scheduled_start || m?.start_time || null,
    ended_at:    m?.ended_at   || m?.end_time || null,
    attendees:   normaliseAttendees(m?.attendees || m?.participants),
    summary_url: m?.share_url  || m?.url || null
  }))
}

function normaliseMeeting(data) {
  return {
    id:          data?.id || null,
    title:       data?.title || data?.subject || '',
    started_at:  data?.started_at || data?.scheduled_start || null,
    ended_at:    data?.ended_at || null,
    attendees:   normaliseAttendees(data?.attendees || data?.participants),
    summary:     data?.summary?.text  || data?.summary  || '',
    transcript:  data?.transcript?.text || data?.transcript || '',
    actionItems: Array.isArray(data?.action_items) ? data.action_items : []
  }
}

function normaliseAttendees(attendees) {
  if (!Array.isArray(attendees)) return []
  return attendees.map(a => ({
    name:  a?.name || a?.full_name || a?.email || '',
    email: a?.email || ''
  }))
}
