// Server-Sent-Events streaming proxy for the active LLM.
//
// rag.js (Ask) and cim.js (CIM draft) both stream text into the UI a
// chunk at a time. Up until Phase 11 they hit Gemini's streamGenerateContent
// endpoint directly with the public API key baked into the JS bundle —
// the exact leak pattern we wanted to kill. This endpoint takes their
// place: same SSE protocol on the client side, but the API key is
// resolved server-side (either the customer's BYO key in
// x-llm-api-key, or our server env var).
//
// Output normalisation: every chunk we send to the client is a single
// line of the form `data: TEXT\n\n` where TEXT is the incremental piece
// of the model's response. The done sentinel is `data: [DONE]\n\n`.
// That format works regardless of which upstream provider served the
// call, so clients have one parser to maintain.
//
// Provider coverage today:
//   - gemini             — pass-through of streamGenerateContent SSE.
//   - openai             — /v1/chat/completions with stream:true.
//   - anthropic          — /v1/messages with stream:true.
//   - vercel_ai_gateway  — OpenAI-compatible chat/completions endpoint.
//   - custom_openai      — same as openai, against a customer base URL.

const DEFAULTS = {
  gemini:             { model: 'gemini-2.5-flash-lite' },
  openai:             { model: 'gpt-4o-mini' },
  anthropic:          { model: 'claude-3-5-haiku-latest' },
  vercel_ai_gateway:  { model: 'anthropic/claude-3-5-haiku' },
  custom_openai:      { model: 'custom-model' }
}

// Same fallback chain as /api/llm — when a model returns 429 or 5xx, the
// next model in the list takes over. Keeps a streaming AI panel from
// dying with "[ERROR] Gemini 429" mid-demo when the primary model's
// per-minute pool is exhausted.
const FALLBACK_CHAINS = {
  gemini: ['gemini-2.5-flash-lite', 'gemini-2.0-flash-lite']
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers',
      'Content-Type, Authorization, x-llm-provider, x-llm-api-key, x-llm-base-url, x-user-gemini-key')
    return res.status(204).end()
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const providerId = String(req.headers['x-llm-provider'] || 'gemini').toLowerCase()
  if (!DEFAULTS[providerId]) {
    return res.status(400).json({ error: `Unknown LLM provider: ${providerId}` })
  }

  const userKey = String(
    req.headers['x-llm-api-key'] || req.headers['x-user-gemini-key'] || ''
  ).trim()
  // Gate the managed server key behind a valid Supabase JWT (BYO keys pass).
  if (!userKey) {
    const ok = await hasValidSession(req)
    if (!ok) return res.status(401).json({ error: 'Sign in to use the managed AI, or supply your own API key.' })
  }
  const serverKey = resolveServerKey(providerId)
  const apiKey = userKey || serverKey
  if (!apiKey) {
    return res.status(503).json({
      error: providerId === 'gemini'
        ? 'Gemini not configured — set GEMINI_API_KEY on the server or provide a user key.'
        : `${providerId} requires a user-supplied API key in x-llm-api-key.`
    })
  }

  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
  body = body || {}
  const model       = body.model || DEFAULTS[providerId].model
  const prompt      = String(body.prompt || '')
  if (prompt.length > 48000) {
    return res.status(413).json({ error: `Prompt too large (${prompt.length} chars; max 48000).` })
  }
  const temperature = typeof body.temperature === 'number' ? body.temperature : 0.45
  const maxTokens   = typeof body.maxOutputTokens === 'number' ? body.maxOutputTokens : 700
  const baseUrl     = String(req.headers['x-llm-base-url'] || '').trim() || null

  // Open the SSE channel.
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  // Browser CORS bypass for the streaming endpoint when fetched from a
  // different origin (mostly relevant in local dev with two ports).
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.flushHeaders?.()

  const writeChunk = (text) => {
    if (!text) return
    // Single-line `data: …` per SSE spec; the client reads one line at a
    // time so we strip any embedded newlines (rare in token deltas but
    // possible) into spaces.
    res.write(`data: ${String(text).replace(/\n/g, ' ')}\n\n`)
  }
  const writeDone = () => { res.write('data: [DONE]\n\n'); res.end() }

  try {
    switch (providerId) {
      case 'gemini':            await streamGemini({ apiKey, model, prompt, temperature, maxTokens, writeChunk }); break
      case 'openai':            await streamOpenAI({ apiKey, model, prompt, temperature, maxTokens, writeChunk, baseUrl: null }); break
      case 'anthropic':         await streamAnthropic({ apiKey, model, prompt, temperature, maxTokens, writeChunk }); break
      case 'vercel_ai_gateway': await streamVercelGateway({ apiKey, model, prompt, temperature, maxTokens, writeChunk }); break
      case 'custom_openai':     await streamOpenAI({ apiKey, model, prompt, temperature, maxTokens, writeChunk, baseUrl }); break
    }
  } catch (err) {
    res.write(`data: [ERROR] ${err?.message || 'stream failed'}\n\n`)
  } finally {
    writeDone()
  }
}

function resolveServerKey(providerId) {
  switch (providerId) {
    case 'gemini':            return process.env.GEMINI_API_KEY || ''
    case 'openai':            return process.env.OPENAI_API_KEY || ''
    case 'anthropic':         return process.env.ANTHROPIC_API_KEY || ''
    case 'vercel_ai_gateway': return process.env.VERCEL_AI_GATEWAY_KEY || process.env.AI_GATEWAY_API_KEY || ''
    case 'custom_openai':     return process.env.CUSTOM_OPENAI_API_KEY || ''
    default:                  return ''
  }
}

// Validate the caller's Supabase JWT — gates the managed server key.
async function hasValidSession(req) {
  try {
    const auth = req.headers['authorization'] || req.headers['Authorization'] || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
    if (!token) return false
    const url  = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
    const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
    if (!url || !anon) return false
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } })
    const { data, error } = await sb.auth.getUser()
    return !error && !!data?.user
  } catch {
    return false
  }
}

// ============ GEMINI ============
// Walks the fallback chain. If the requested model returns 429/5xx,
// silently retry the next model and stream from that one instead.
// Only emits chunks once a model actually starts producing them — so a
// failed primary doesn't leak partial output to the client before the
// fallback takes over.
async function streamGemini({ apiKey, model, prompt, temperature, maxTokens, writeChunk }) {
  const TRANSIENT = (s) => s === 429 || (s >= 500 && s < 600)
  const chain = [model, ...((FALLBACK_CHAINS.gemini || []).filter(m => m !== model))]
  let lastErr = null
  for (const m of chain) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:streamGenerateContent?key=${encodeURIComponent(apiKey)}&alt=sse`
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens: maxTokens }
      })
    })
    if (!r.ok || !r.body) {
      const t = await r.text().catch(() => '')
      lastErr = new Error(`Gemini ${r.status}: ${t.slice(0, 200)}`)
      if (TRANSIENT(r.status)) continue   // try next model in chain
      throw lastErr                        // permanent error → bail
    }
    await parseSseStream(r.body, (json) => {
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      if (text) writeChunk(text)
    })
    return  // success — done
  }
  throw lastErr || new Error('Gemini: all fallback models exhausted')
}

// ============ OPENAI / VERCEL GATEWAY / CUSTOM ============
async function streamOpenAI({ apiKey, model, prompt, temperature, maxTokens, writeChunk, baseUrl }) {
  const host = (baseUrl && baseUrl.replace(/\/+$/, '')) || 'https://api.openai.com/v1'
  const r = await fetch(`${host}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'text/event-stream'
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature,
      max_tokens: maxTokens,
      stream: true
    })
  })
  if (!r.ok || !r.body) {
    const t = await r.text().catch(() => '')
    throw new Error(`OpenAI ${r.status}: ${t.slice(0, 200)}`)
  }
  await parseSseStream(r.body, (json) => {
    const text = json?.choices?.[0]?.delta?.content || ''
    if (text) writeChunk(text)
  })
}

async function streamVercelGateway(args) {
  // Same SSE shape — different host + auth.
  const host = 'https://ai-gateway.vercel.sh/v1'
  const r = await fetch(`${host}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${args.apiKey}`,
      'Accept': 'text/event-stream'
    },
    body: JSON.stringify({
      model: args.model,
      messages: [{ role: 'user', content: args.prompt }],
      temperature: args.temperature,
      max_tokens: args.maxTokens,
      stream: true
    })
  })
  if (!r.ok || !r.body) {
    const t = await r.text().catch(() => '')
    throw new Error(`Vercel Gateway ${r.status}: ${t.slice(0, 200)}`)
  }
  await parseSseStream(r.body, (json) => {
    const text = json?.choices?.[0]?.delta?.content || ''
    if (text) args.writeChunk(text)
  })
}

// ============ ANTHROPIC ============
// Anthropic's SSE shape: each event has its own `event:` name, payload in
// `data:`. We watch for `content_block_delta` events with text deltas.
async function streamAnthropic({ apiKey, model, prompt, temperature, maxTokens, writeChunk }) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Accept': 'text/event-stream'
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      stream: true,
      messages: [{ role: 'user', content: prompt }]
    })
  })
  if (!r.ok || !r.body) {
    const t = await r.text().catch(() => '')
    throw new Error(`Anthropic ${r.status}: ${t.slice(0, 200)}`)
  }
  await parseSseStream(r.body, (json) => {
    if (json?.type === 'content_block_delta') {
      const text = json?.delta?.text || ''
      if (text) writeChunk(text)
    }
  })
}

// ============ SSE PARSER ============
// Pulls `data:` lines off a streaming response body and JSON-parses each
// one, calling `onJson` with the resulting object. Skips empty payloads
// and the [DONE] sentinel without erroring.
async function parseSseStream(body, onJson) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try { onJson(JSON.parse(payload)) } catch { /* mid-line chunk; ignore */ }
    }
  }
}
