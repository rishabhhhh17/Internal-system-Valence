// Vercel serverless proxy for Google Gemini. The browser bundle no longer
// holds an API key — clients post to /api/gemini and this function adds
// the key server-side. Two prior leaks this kills:
//
//   1. VITE_GEMINI_API_KEY was being inlined into the production JS — anyone
//      with DevTools could lift it and drain the quota.
//   2. The "bring your own key" path in Settings → Integrations also
//      flowed through fetch() with the key in the URL — fine for the
//      partner's own key but useless for OUR fallback.
//
// The proxy accepts either:
//   - { model, prompt, temperature, maxOutputTokens } — convenience shape
//     that matches what src/lib/gemini.js used to send to Google directly.
//   - { url, body }                                    — raw passthrough
//     for callers that need full control of the Gemini endpoint.
//
// Key precedence:
//   1. Caller-provided key in the `x-user-gemini-key` header (BYO key from
//      Settings). Never logged or stored.
//   2. Server-side env var GEMINI_API_KEY  (our managed key).
//
// Returns whatever Gemini returned, plus a normalized `usage` block so
// callers can record tokens / cost without re-parsing.

const GEMINI_HOST = 'https://generativelanguage.googleapis.com/v1beta'
const DEFAULT_MODEL = 'gemini-2.0-flash'

// Rough cost basis per 1k tokens — Gemini 2.0 Flash blended in / out.
// PLACEHOLDER — recalibrate from the Google pricing page before launch.
const COST_USD_PER_1K_TOKENS = 0.000_15

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-user-gemini-key')
    return res.status(204).end()
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Resolve key: caller header wins; server env is fallback.
  const userKey = String(req.headers['x-user-gemini-key'] || '').trim()
  const serverKey = process.env.GEMINI_API_KEY || ''
  const key = userKey || serverKey
  if (!key) {
    return res.status(503).json({ error: 'Gemini not configured — set GEMINI_API_KEY on the server or provide a user key.' })
  }

  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
  body = body || {}

  // Build the upstream call from convenience shape OR pass through raw.
  let upstreamUrl
  let upstreamBody
  if (body.url && body.body) {
    upstreamUrl = `${GEMINI_HOST}${body.url.startsWith('/') ? body.url : '/' + body.url}?key=${encodeURIComponent(key)}`
    upstreamBody = body.body
  } else {
    const model = body.model || DEFAULT_MODEL
    upstreamUrl = `${GEMINI_HOST}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`
    upstreamBody = {
      contents: [{ parts: [{ text: String(body.prompt || '') }] }],
      generationConfig: {
        temperature: typeof body.temperature === 'number' ? body.temperature : 0.55,
        maxOutputTokens: typeof body.maxOutputTokens === 'number' ? body.maxOutputTokens : 320
      }
    }
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(upstreamBody)
    })
    const json = await upstream.json().catch(() => null)
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: json?.error?.message || `Gemini error ${upstream.status}`
      })
    }
    // Normalize usage so the client doesn't have to dig into the response shape.
    const usage = extractUsage(json)
    return res.status(200).json({ data: json, usage })
  } catch (err) {
    return res.status(502).json({ error: err?.message || 'Upstream call failed' })
  }
}

function extractUsage(json) {
  const um = json?.usageMetadata || {}
  const prompt = Number(um.promptTokenCount) || 0
  const completion = Number(um.candidatesTokenCount) || 0
  const total = Number(um.totalTokenCount) || (prompt + completion)
  const estimatedCostUsd = round6((total / 1000) * COST_USD_PER_1K_TOKENS)
  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: total,
    estimatedCostUsd
  }
}

function round6(n) { return Math.round((Number(n) || 0) * 1e6) / 1e6 }
