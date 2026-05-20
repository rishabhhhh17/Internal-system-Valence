// Vercel serverless proxy — multi-provider LLM router.
//
// Replaces the single-purpose /api/gemini proxy for new code. Existing
// callers still hit /api/gemini, which now forwards into this router so we
// keep the surface unified.
//
// Request shape:
//   POST /api/llm
//   Headers:
//     x-llm-provider     — provider id, e.g. "gemini", "openai", "anthropic",
//                          "vercel_ai_gateway", "custom_openai". When the
//                          header is missing we infer "gemini" for backwards
//                          compatibility with the old /api/gemini callers.
//     x-llm-api-key      — caller-supplied API key. When present this wins
//                          over the server-side env var. Required for any
//                          provider other than Gemini (we only ship a
//                          managed key for Gemini).
//     x-llm-base-url     — override base URL (custom_openai only).
//   Body:
//     { model, prompt, temperature, maxOutputTokens }
//
// Response shape:
//     { data: { text }, usage: { promptTokens, completionTokens,
//                                totalTokens, estimatedCostUsd } }
//
// `data.text` is the model's response. We DELIBERATELY normalise to a
// single text field instead of passing through the provider-specific
// envelope — keeps `src/lib/llmClient.js` simple.
//
// Cost basis is computed at this layer because the proxy is where we know
// both the provider's pricing table AND the upstream's reported token
// counts. Pricing tables are pinned per provider; see PRICING below.

const PRICING = {
  // USD per 1k tokens. Inputs roughly tracked from each provider's docs as
  // of 2026-Q2 — these are PLACEHOLDERS subject to launch-day recalibration.
  gemini: {
    'gemini-2.0-flash': { in: 0.000075, out: 0.00030 },
    'gemini-2.5-flash': { in: 0.000150, out: 0.00060 },
    'gemini-2.5-pro':   { in: 0.00125,  out: 0.00500 }
  },
  openai: {
    'gpt-4o-mini':   { in: 0.00015, out: 0.00060 },
    'gpt-4o':        { in: 0.00250, out: 0.01000 },
    'gpt-4.1-mini':  { in: 0.00040, out: 0.00160 }
  },
  anthropic: {
    'claude-3-5-haiku-latest':  { in: 0.00080, out: 0.00400 },
    'claude-3-5-sonnet-latest': { in: 0.00300, out: 0.01500 },
    'claude-opus-4-5':          { in: 0.01500, out: 0.07500 }
  },
  vercel_ai_gateway: {
    // Gateway exposes provider/model pairs as the model id.
    'anthropic/claude-3-5-haiku': { in: 0.00080, out: 0.00400 },
    'openai/gpt-4o-mini':         { in: 0.00015, out: 0.00060 },
    'google/gemini-2.0-flash':    { in: 0.000075, out: 0.00030 }
  },
  custom_openai: { /* customer's deployment — we don't know their cost */ }
}

const DEFAULTS = {
  gemini:             { model: 'gemini-2.0-flash' },
  openai:             { model: 'gpt-4o-mini' },
  anthropic:          { model: 'claude-3-5-haiku-latest' },
  vercel_ai_gateway:  { model: 'anthropic/claude-3-5-haiku' },
  custom_openai:      { model: 'custom-model' }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers',
      'Content-Type, x-llm-provider, x-llm-api-key, x-llm-base-url, x-user-gemini-key')
    return res.status(204).end()
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Resolve the provider — explicit header wins; default to gemini for
  // backwards-compat with old callers that hit /api/gemini directly.
  const providerId = String(req.headers['x-llm-provider'] || 'gemini').toLowerCase()
  if (!DEFAULTS[providerId]) {
    return res.status(400).json({ error: `Unknown LLM provider: ${providerId}` })
  }

  // Resolve the key. Accept both x-llm-api-key (new) and x-user-gemini-key
  // (legacy /api/gemini header) so we don't break the old client code path.
  const userKey = String(
    req.headers['x-llm-api-key'] || req.headers['x-user-gemini-key'] || ''
  ).trim()
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
  const temperature = typeof body.temperature === 'number' ? body.temperature : 0.55
  const maxTokens   = typeof body.maxOutputTokens === 'number' ? body.maxOutputTokens : 320
  const baseUrl     = String(req.headers['x-llm-base-url'] || '').trim() || null

  try {
    let dispatched
    switch (providerId) {
      case 'gemini':            dispatched = await callGemini({ apiKey, model, prompt, temperature, maxTokens, rawPassthrough: body }); break
      case 'openai':            dispatched = await callOpenAI({ apiKey, model, prompt, temperature, maxTokens, baseUrl: null }); break
      case 'anthropic':         dispatched = await callAnthropic({ apiKey, model, prompt, temperature, maxTokens }); break
      case 'vercel_ai_gateway': dispatched = await callVercelGateway({ apiKey, model, prompt, temperature, maxTokens }); break
      case 'custom_openai':     dispatched = await callOpenAI({ apiKey, model, prompt, temperature, maxTokens, baseUrl }); break
      default:                  return res.status(400).json({ error: `Unsupported provider ${providerId}` })
    }
    if (!dispatched.ok) {
      return res.status(dispatched.status || 502).json({ error: dispatched.error || 'Upstream call failed' })
    }
    const usage = computeUsage(providerId, model, dispatched.usage)
    return res.status(200).json({
      data: {
        text: dispatched.text,
        raw: dispatched.raw || null
      },
      provider: providerId,
      model,
      usage
    })
  } catch (err) {
    return res.status(502).json({ error: err?.message || 'Upstream call failed' })
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

// ============ GEMINI ============
async function callGemini({ apiKey, model, prompt, temperature, maxTokens, rawPassthrough }) {
  const host = 'https://generativelanguage.googleapis.com/v1beta'
  let url, body
  if (rawPassthrough && rawPassthrough.url && rawPassthrough.body) {
    // Honour the legacy raw-passthrough shape the old /api/gemini supported.
    url = `${host}${rawPassthrough.url.startsWith('/') ? rawPassthrough.url : '/' + rawPassthrough.url}?key=${encodeURIComponent(apiKey)}`
    body = rawPassthrough.body
  } else {
    url = `${host}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
    body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens: maxTokens }
    }
  }
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const json = await r.json().catch(() => null)
  if (!r.ok) return { ok: false, status: r.status, error: json?.error?.message || `Gemini ${r.status}` }
  const um = json?.usageMetadata || {}
  return {
    ok: true,
    text: json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '',
    raw: json,
    usage: {
      promptTokens:    Number(um.promptTokenCount)     || 0,
      completionTokens: Number(um.candidatesTokenCount) || 0,
      totalTokens:     Number(um.totalTokenCount)      || 0
    }
  }
}

// ============ OPENAI (and OpenAI-compatible) ============
async function callOpenAI({ apiKey, model, prompt, temperature, maxTokens, baseUrl }) {
  const host = (baseUrl && baseUrl.replace(/\/+$/, '')) || 'https://api.openai.com/v1'
  const url = `${host}/chat/completions`
  const body = {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature,
    max_tokens: maxTokens
  }
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  })
  const json = await r.json().catch(() => null)
  if (!r.ok) return { ok: false, status: r.status, error: json?.error?.message || `OpenAI ${r.status}` }
  const u = json?.usage || {}
  return {
    ok: true,
    text: (json?.choices?.[0]?.message?.content || '').trim(),
    raw: json,
    usage: {
      promptTokens:     Number(u.prompt_tokens)     || 0,
      completionTokens: Number(u.completion_tokens) || 0,
      totalTokens:      Number(u.total_tokens)      || 0
    }
  }
}

// ============ ANTHROPIC ============
async function callAnthropic({ apiKey, model, prompt, temperature, maxTokens }) {
  const url = 'https://api.anthropic.com/v1/messages'
  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [{ role: 'user', content: prompt }]
  }
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  })
  const json = await r.json().catch(() => null)
  if (!r.ok) return { ok: false, status: r.status, error: json?.error?.message || `Anthropic ${r.status}` }
  const text = (json?.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim()
  const u = json?.usage || {}
  return {
    ok: true,
    text,
    raw: json,
    usage: {
      promptTokens:     Number(u.input_tokens)  || 0,
      completionTokens: Number(u.output_tokens) || 0,
      totalTokens:      (Number(u.input_tokens) || 0) + (Number(u.output_tokens) || 0)
    }
  }
}

// ============ VERCEL AI GATEWAY ============
// The Gateway exposes an OpenAI-compatible /chat/completions surface so we
// reuse the OpenAI call path with a different base URL + auth scheme.
async function callVercelGateway({ apiKey, model, prompt, temperature, maxTokens }) {
  const url = 'https://ai-gateway.vercel.sh/v1/chat/completions'
  const body = {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature,
    max_tokens: maxTokens
  }
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  })
  const json = await r.json().catch(() => null)
  if (!r.ok) return { ok: false, status: r.status, error: json?.error?.message || `Vercel Gateway ${r.status}` }
  const u = json?.usage || {}
  return {
    ok: true,
    text: (json?.choices?.[0]?.message?.content || '').trim(),
    raw: json,
    usage: {
      promptTokens:     Number(u.prompt_tokens)     || 0,
      completionTokens: Number(u.completion_tokens) || 0,
      totalTokens:      Number(u.total_tokens)      || 0
    }
  }
}

// ============ COST ============
function computeUsage(providerId, model, raw) {
  const prompt     = Number(raw?.promptTokens)     || 0
  const completion = Number(raw?.completionTokens) || 0
  const total      = Number(raw?.totalTokens)      || (prompt + completion)
  const rates = (PRICING[providerId] && PRICING[providerId][model]) || null
  let estimatedCostUsd = 0
  if (rates) {
    estimatedCostUsd = round6((prompt / 1000) * rates.in + (completion / 1000) * rates.out)
  }
  return { promptTokens: prompt, completionTokens: completion, totalTokens: total, estimatedCostUsd }
}

function round6(n) { return Math.round((Number(n) || 0) * 1e6) / 1e6 }
