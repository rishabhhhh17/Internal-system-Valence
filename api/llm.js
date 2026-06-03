// Vercel serverless proxy — multi-provider LLM router.
//
// SECURITY: the managed server key (process.env.*_API_KEY) is only used for
// callers who present a valid Supabase JWT (Authorization: Bearer <token>).
// Bring-your-own-key callers (x-llm-api-key) are allowed without a JWT since
// they pay their own cost. This stops an anonymous internet caller from
// draining the firm's managed LLM quota.
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

// Per-1k-token pricing.
//   `ours` — our marginal cost (what we pay upstream).
//   `customer` — what we bill the customer when they're on the
//     MANAGED plan for this provider (i.e. we supply the key). When the
//     customer brings their own key, we bill them nothing for tokens; the
//     provider invoices them directly.
//   PLACEHOLDERS — the customer-facing markup is roughly 2× our cost
//   today; senior team to lock in real numbers before launch.
const PRICING = {
  gemini: {
    'gemini-2.0-flash': { ours: { in: 0.000075, out: 0.00030 },  customer: { in: 0.00015, out: 0.00060 } },
    'gemini-2.5-flash': { ours: { in: 0.000150, out: 0.00060 },  customer: { in: 0.00030, out: 0.00120 } },
    'gemini-2.5-pro':   { ours: { in: 0.00125,  out: 0.00500 },  customer: { in: 0.00250, out: 0.01000 } }
  },
  openai: {
    'gpt-4o-mini':   { ours: { in: 0.00015, out: 0.00060 }, customer: { in: 0.00030, out: 0.00120 } },
    'gpt-4o':        { ours: { in: 0.00250, out: 0.01000 }, customer: { in: 0.00500, out: 0.02000 } },
    'gpt-4.1-mini':  { ours: { in: 0.00040, out: 0.00160 }, customer: { in: 0.00080, out: 0.00320 } }
  },
  anthropic: {
    'claude-3-5-haiku-latest':  { ours: { in: 0.00080, out: 0.00400 }, customer: { in: 0.00160, out: 0.00800 } },
    'claude-3-5-sonnet-latest': { ours: { in: 0.00300, out: 0.01500 }, customer: { in: 0.00600, out: 0.03000 } },
    'claude-opus-4-5':          { ours: { in: 0.01500, out: 0.07500 }, customer: { in: 0.03000, out: 0.15000 } }
  },
  vercel_ai_gateway: {
    'anthropic/claude-3-5-haiku': { ours: { in: 0.00080,  out: 0.00400 }, customer: { in: 0.00160, out: 0.00800 } },
    'openai/gpt-4o-mini':         { ours: { in: 0.00015,  out: 0.00060 }, customer: { in: 0.00030, out: 0.00120 } },
    'google/gemini-2.0-flash':    { ours: { in: 0.000075, out: 0.00030 }, customer: { in: 0.00015, out: 0.00060 } }
  },
  custom_openai: { /* customer's deployment — we don't know their cost */ }
}

// Per-provider fallback chains for transient upstream failures (429, 503,
// 5xx). When the proxy hits a rate-limit on the primary model, retry once
// with the next model in the chain. Keeps live customers from seeing
// "AI not configured" mid-call when one model's free-tier pool is
// momentarily exhausted. Ordered strongest-to-cheapest so we degrade
// gracefully rather than escalate.
const FALLBACK_CHAINS = {
  gemini: ['gemini-2.5-flash-lite', 'gemini-2.0-flash-lite']
}

const DEFAULTS = {
  gemini:             { model: 'gemini-2.5-flash-lite' },
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
      'Content-Type, Authorization, x-llm-provider, x-llm-api-key, x-llm-base-url, x-user-gemini-key')
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

  // Gate the MANAGED server key behind a valid Supabase session. BYO-key
  // callers (userKey present) are charged to their own key, so they pass.
  if (!userKey) {
    const ok = await hasValidSession(req)
    if (!ok) {
      return res.status(401).json({ error: 'Sign in to use the managed AI, or supply your own API key.' })
    }
  }

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
  if (prompt.length > MAX_PROMPT_CHARS) {
    return res.status(413).json({ error: `Prompt too large (${prompt.length} chars; max ${MAX_PROMPT_CHARS}).` })
  }
  const temperature = typeof body.temperature === 'number' ? body.temperature : 0.55
  const maxTokens   = typeof body.maxOutputTokens === 'number' ? body.maxOutputTokens : 320
  const baseUrl     = String(req.headers['x-llm-base-url'] || '').trim() || null

  // Build the model attempt-chain. First entry = requested model. Then
  // walk the provider's FALLBACK_CHAINS (skipping the requested model so
  // we don't retry the same one). Stop at the first call that succeeds.
  // Transient failure = HTTP 429 or 5xx from upstream; everything else
  // (auth, malformed prompt, etc) returns immediately so the user gets
  // the real error.
  const attemptChain = [model]
  for (const m of FALLBACK_CHAINS[providerId] || []) {
    if (m !== model) attemptChain.push(m)
  }
  const TRANSIENT = (s) => s === 429 || (s >= 500 && s < 600)

  try {
    let dispatched, attemptedModel
    for (let i = 0; i < attemptChain.length; i++) {
      attemptedModel = attemptChain[i]
      switch (providerId) {
        case 'gemini':            dispatched = await callGemini({ apiKey, model: attemptedModel, prompt, temperature, maxTokens, rawPassthrough: body }); break
        case 'openai':            dispatched = await callOpenAI({ apiKey, model: attemptedModel, prompt, temperature, maxTokens, baseUrl: null }); break
        case 'anthropic':         dispatched = await callAnthropic({ apiKey, model: attemptedModel, prompt, temperature, maxTokens }); break
        case 'vercel_ai_gateway': dispatched = await callVercelGateway({ apiKey, model: attemptedModel, prompt, temperature, maxTokens }); break
        case 'custom_openai':     dispatched = await callOpenAI({ apiKey, model: attemptedModel, prompt, temperature, maxTokens, baseUrl }); break
        default:                  return res.status(400).json({ error: `Unsupported provider ${providerId}` })
      }
      if (dispatched.ok) break
      // Don't fall through on permanent errors (auth, bad input, etc.)
      if (!TRANSIENT(dispatched.status)) break
      // Last attempt — out of fallbacks
      if (i === attemptChain.length - 1) break
      // else: loop and try the next model in the chain
    }
    if (!dispatched.ok) {
      return res.status(dispatched.status || 502).json({ error: dispatched.error || 'Upstream call failed' })
    }
    // For accounting / logging, set `model` to whatever we ended up actually
    // calling so the response (and downstream usage metering) reports truth.
    const effectiveModel = attemptedModel
    // keySource records whether the customer is paying the upstream
    // provider directly (BYO) or paying us (managed). When BYO,
    // customerCostUsd is zero — we don't double-bill. When managed,
    // customerCostUsd is what their invoice line will be for this call.
    const keySource = userKey ? 'byo' : 'managed'
    const usage = computeUsage(providerId, effectiveModel, dispatched.usage, keySource)
    return res.status(200).json({
      data: {
        text: dispatched.text,
        raw: dispatched.raw || null
      },
      provider: providerId,
      model: effectiveModel,
      requestedModel: model,
      fellBack: effectiveModel !== model,
      keySource,
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

// Validate the caller's Supabase JWT. Returns true only for a real signed-in
// user. Used to gate the managed key. Lazy-imports supabase-js so the
// function cold-starts fast when a BYO key is used (no validation needed).
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

// Hard cap on prompt size — stops a single request from maxing input tokens
// (cost) or being used to abuse the proxy. ~48k chars ≈ 12k tokens, plenty
// for a deal brief or transcript summary.
const MAX_PROMPT_CHARS = 48000

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
// Returns two cost numbers:
//   - estimatedCostUsd : OUR marginal cost (we pay this upstream). Always
//     present so admin can see real burn.
//   - customerCostUsd  : what we BILL the customer for this call. Zero
//     when keySource === 'byo' (customer paid the upstream directly).
function computeUsage(providerId, model, raw, keySource) {
  const prompt     = Number(raw?.promptTokens)     || 0
  const completion = Number(raw?.completionTokens) || 0
  const total      = Number(raw?.totalTokens)      || (prompt + completion)
  const rates = (PRICING[providerId] && PRICING[providerId][model]) || null
  let estimatedCostUsd = 0
  let customerCostUsd  = 0
  if (rates) {
    estimatedCostUsd = round6((prompt / 1000) * rates.ours.in + (completion / 1000) * rates.ours.out)
    if (keySource !== 'byo' && rates.customer) {
      customerCostUsd = round6((prompt / 1000) * rates.customer.in + (completion / 1000) * rates.customer.out)
    }
  }
  return { promptTokens: prompt, completionTokens: completion, totalTokens: total, estimatedCostUsd, customerCostUsd }
}

function round6(n) { return Math.round((Number(n) || 0) * 1e6) / 1e6 }
