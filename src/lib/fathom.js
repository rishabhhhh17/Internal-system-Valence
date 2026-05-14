// Fathom integration — client side.
//
// All requests go through the Vercel function at /api/fathom so:
//   (a) CORS is handled (Fathom blocks direct cross-origin calls)
//   (b) the Fathom API key never reaches the browser bundle
//
// Configuration (server-only):
//   FATHOM_API_KEY in Vercel env (NOT prefixed VITE_)
//
// The client lib still exports `isFathomConfigured` for UI gating, but
// the value is now read from a one-shot ping to /api/fathom instead of
// a baked-in env var. We assume it's configured by default to keep the
// "Pull from Fathom" button discoverable; failures surface as toasts.

const PROXY = '/api/fathom'

// Best-effort sentinel. UI uses this to decide whether to show "wire it
// up" hint vs. just attempting the call. The proxy will return a 500 if
// the server-side key is missing, which surfaces a clear toast.
export const isFathomConfigured = true

async function call(op, params = {}) {
  const qs = new URLSearchParams({ op, ...params }).toString()
  const r = await fetch(`${PROXY}?${qs}`, { headers: { Accept: 'application/json' } })
  if (!r.ok) {
    const body = await r.json().catch(() => ({}))
    throw new Error(body?.error || `Fathom proxy ${r.status}`)
  }
  return r.json()
}

export async function listRecentMeetings({ limit = 10 } = {}) {
  return call('list', { limit })
}

export async function fetchMeeting(meetingId) {
  if (!meetingId) throw new Error('meetingId required')
  return call('meeting', { id: meetingId })
}

export async function pullLatestMeeting() {
  const m = await call('latest')
  if (!m) throw new Error('No recent Fathom meetings found.')
  return m
}
