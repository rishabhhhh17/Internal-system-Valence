// Vercel serverless: refresh a Google access token from a stored refresh token.
//
// Why this exists: Google's provider access token (used for Calendar / Drive /
// Tasks) expires after ~1h, and Supabase does NOT refresh provider tokens for
// us — it only refreshes its own JWT. So once the access token dies, the app
// shows "Reconnect Google" even though we hold a valid refresh token. This
// endpoint exchanges that refresh token (which Supabase hands back as
// `provider_refresh_token` on sign-in and the client stashes) for a fresh
// access token, using the Google OAuth client secret server-side.
//
// Env required (set on the Vercel project, NOT VITE_-prefixed so they stay
// server-only): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET — the same OAuth 2.0
// client configured in Supabase's Google provider.
//
// Request:  POST { refresh_token }
// Response: { access_token, expires_in }  |  { error, detail? }

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Google refresh not configured', detail: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing on the server.' })
  }

  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
  const refreshToken = body?.refresh_token
  if (!refreshToken) {
    // No refresh token on the client → the OAuth never returned one (the user
    // needs to re-consent with offline access). Signal that distinctly.
    return res.status(400).json({ error: 'no_refresh_token', detail: 'No Google refresh token — reconnect with consent.' })
  }

  try {
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
    const g = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    })
    const data = await g.json().catch(() => ({}))
    if (!g.ok || !data.access_token) {
      // invalid_grant = refresh token revoked/expired → user must reconnect.
      return res.status(g.status === 400 ? 401 : 502).json({
        error: data.error === 'invalid_grant' ? 'refresh_revoked' : 'google_error',
        detail: data.error_description || data.error || `Google ${g.status}`
      })
    }
    return res.status(200).json({
      access_token: data.access_token,
      expires_in: data.expires_in || 3600
    })
  } catch (e) {
    return res.status(502).json({ error: 'google_unreachable', detail: String(e?.message || e) })
  }
}
