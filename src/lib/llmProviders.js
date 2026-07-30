// LLM provider registry + active-provider state.
//
// Today the app speaks only Google Gemini. As we onboard external firms, the
// senior team wants the option for customers to pick another LLM (OpenAI,
// Anthropic, the Vercel AI Gateway, or any OpenAI-compatible endpoint they
// already pay for). This module is the single source of truth for:
//
//   1. The catalogue of supported providers — id, label, models, default
//      model, key shape, marginal cost basis. Adding a new provider means
//      one entry here and one branch in /api/llm.
//   2. The user's active provider + model + per-provider API keys, persisted
//      in localStorage so the browser never round-trips to learn what to use.
//   3. Light helpers (getActiveProvider, setActiveProvider, getApiKey,
//      setApiKey) so UI panels don't have to know the storage layout.
//
// Storage layout (all under the `valence.settings.llm.*` namespace):
//   valence.settings.llm.provider        — provider id, e.g. "gemini"
//   valence.settings.llm.model           — model id within that provider
//   valence.settings.llm.key.<provider>  — API key for that provider (BYO)
//
// The legacy `valence.settings.geminiKey` slot is read on import so a
// customer who set their Gemini key before this migration doesn't lose it.
//
// All exports are SSR-safe — every localStorage read is wrapped to no-op
// when window is undefined.

// ============ PROVIDER CATALOGUE ============
//
// Each provider entry:
//   id              — short slug; matches the /api/llm `provider` param
//   label           — display name in the picker
//   description     — one-line caption shown under the radio
//   keyHelpUrl      — where the customer goes to mint a key
//   keyPlaceholder  — placeholder for the key input
//   keyPrefix       — optional sanity-check prefix ("sk-", "AIza"); not
//                     enforced because customers will paste whatever and
//                     we don't want to false-reject a renamed format
//   defaultModel    — the model used when none is picked
//   models          — array of { id, label, description,
//                     inputUsdPer1K, outputUsdPer1K,
//                     customerInputUsdPer1K, customerOutputUsdPer1K }.
//                     - inputUsdPer1K / outputUsdPer1K are OUR marginal
//                       cost (what we pay the upstream).
//                     - customerInputUsdPer1K / customerOutputUsdPer1K
//                       are what we BILL the customer when they're on
//                       the managed plan for this provider — i.e. our
//                       cost + markup.  Placeholders today; senior team
//                       to lock in real numbers.
//   supportsStreaming — informational only (we don't use streaming yet)
//   supportsEmbeddings — whether this provider can serve text-embedding-* —
//                     today only Gemini is wired for embeddings.
//   managed         — true when WE can supply the key (server has the env
//                     var on file). All five providers default to true so
//                     a customer can pick any LLM and have us handle the
//                     key — they can ALSO bring their own to bypass our
//                     pricing.  The proxy verifies the server env var
//                     actually exists at request time and falls back to
//                     "BYO required" if it's missing.

export const PROVIDERS = Object.freeze([
  {
    id: 'gemini',
    label: 'Google Gemini',
    description: 'Default. Fast, low-cost, multimodal. Free tier covers light use.',
    keyHelpUrl: 'https://aistudio.google.com/apikey',
    keyPlaceholder: 'AIza…',
    keyPrefix: 'AIza',
    // Default model: gemini-2.5-flash-lite. Free-tier per-minute quota
    // on gemini-2.5-flash + gemini-2.0-flash exhausts quickly under
    // demo load. flash-lite has the largest free-tier pool and similar
    // quality for the kinds of calls this app makes (Today summary,
    // deal brief, fund-match JSON). The proxy ALSO has an automatic
    // fallback chain — if even flash-lite hits 429, it retries with
    // 2.0-flash-lite before surfacing the error. The customer can
    // still pick a heavier model from the models[] list.
    defaultModel: 'gemini-2.5-flash-lite',
    models: [
      {
        id: 'gemini-2.5-flash-lite',
        label: 'Gemini 2.5 Flash-Lite',
        description: 'Default. Cheapest + fastest — ideal for everyday logging + summaries.',
        inputUsdPer1K: 0.0001,
        outputUsdPer1K: 0.0004,
        customerInputUsdPer1K: 0.0002,
        customerOutputUsdPer1K: 0.0008
      },
      {
        id: 'gemini-2.0-flash',
        label: 'Gemini 2.0 Flash',
        description: 'Best price-to-quality for everyday calls.',
        inputUsdPer1K: 0.000075,
        outputUsdPer1K: 0.00030,
        customerInputUsdPer1K: 0.00015,
        customerOutputUsdPer1K: 0.00060
      },
      {
        id: 'gemini-2.5-flash',
        label: 'Gemini 2.5 Flash',
        description: 'Newer flash — slightly higher quality, similar cost.',
        inputUsdPer1K: 0.000150,
        outputUsdPer1K: 0.00060,
        customerInputUsdPer1K: 0.00030,
        customerOutputUsdPer1K: 0.00120
      },
      {
        id: 'gemini-2.5-pro',
        label: 'Gemini 2.5 Pro',
        description: 'Higher reasoning quality; use for deal briefs / long context.',
        inputUsdPer1K: 0.00125,
        outputUsdPer1K: 0.00500,
        customerInputUsdPer1K: 0.00250,
        customerOutputUsdPer1K: 0.01000
      }
    ],
    supportsStreaming: true,
    supportsEmbeddings: true,
    managed: true
  },
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'Pick OpenAI. We can supply the key or you can bring your own.',
    keyHelpUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-…',
    keyPrefix: 'sk-',
    defaultModel: 'gpt-4o-mini',
    models: [
      {
        id: 'gpt-4o-mini',
        label: 'GPT-4o mini',
        description: 'Cheap + capable. Closest analogue to Gemini Flash.',
        inputUsdPer1K: 0.00015,
        outputUsdPer1K: 0.00060,
        customerInputUsdPer1K: 0.00030,
        customerOutputUsdPer1K: 0.00120
      },
      {
        id: 'gpt-4o',
        label: 'GPT-4o',
        description: 'Flagship. Use for high-stakes prose.',
        inputUsdPer1K: 0.0025,
        outputUsdPer1K: 0.0100,
        customerInputUsdPer1K: 0.00500,
        customerOutputUsdPer1K: 0.02000
      },
      {
        id: 'gpt-4.1-mini',
        label: 'GPT-4.1 mini',
        description: 'Newer mini — favours instruction following.',
        inputUsdPer1K: 0.00040,
        outputUsdPer1K: 0.00160,
        customerInputUsdPer1K: 0.00080,
        customerOutputUsdPer1K: 0.00320
      }
    ],
    supportsStreaming: true,
    supportsEmbeddings: false,
    managed: true
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    description: 'Pick Claude. We can supply the key or you can bring your own.',
    keyHelpUrl: 'https://console.anthropic.com/settings/keys',
    keyPlaceholder: 'sk-ant-…',
    keyPrefix: 'sk-ant',
    defaultModel: 'claude-3-5-haiku-latest',
    models: [
      {
        id: 'claude-3-5-haiku-latest',
        label: 'Claude 3.5 Haiku',
        description: 'Fast + cheap. Comparable footprint to Gemini Flash.',
        inputUsdPer1K: 0.00080,
        outputUsdPer1K: 0.00400,
        customerInputUsdPer1K: 0.00160,
        customerOutputUsdPer1K: 0.00800
      },
      {
        id: 'claude-3-5-sonnet-latest',
        label: 'Claude 3.5 Sonnet',
        description: 'Balanced. Strong on structured briefs + JSON.',
        inputUsdPer1K: 0.00300,
        outputUsdPer1K: 0.01500,
        customerInputUsdPer1K: 0.00600,
        customerOutputUsdPer1K: 0.03000
      },
      {
        id: 'claude-opus-4-5',
        label: 'Claude Opus 4.5',
        description: 'Frontier model. Use sparingly — most expensive option.',
        inputUsdPer1K: 0.01500,
        outputUsdPer1K: 0.07500,
        customerInputUsdPer1K: 0.03000,
        customerOutputUsdPer1K: 0.15000
      }
    ],
    supportsStreaming: true,
    supportsEmbeddings: false,
    managed: true
  },
  {
    id: 'vercel_ai_gateway',
    label: 'Vercel AI Gateway',
    description: 'One key, every provider. Failover + observability included.',
    keyHelpUrl: 'https://vercel.com/dashboard/ai-gateway',
    keyPlaceholder: 'vag_…',
    keyPrefix: 'vag_',
    defaultModel: 'anthropic/claude-3-5-haiku',
    models: [
      {
        id: 'anthropic/claude-3-5-haiku',
        label: 'Anthropic · Claude 3.5 Haiku',
        description: 'Cheap Claude through the Gateway.',
        inputUsdPer1K: 0.00080,
        outputUsdPer1K: 0.00400,
        customerInputUsdPer1K: 0.00160,
        customerOutputUsdPer1K: 0.00800
      },
      {
        id: 'openai/gpt-4o-mini',
        label: 'OpenAI · GPT-4o mini',
        description: 'Cheap GPT through the Gateway.',
        inputUsdPer1K: 0.00015,
        outputUsdPer1K: 0.00060,
        customerInputUsdPer1K: 0.00030,
        customerOutputUsdPer1K: 0.00120
      },
      {
        id: 'google/gemini-2.0-flash',
        label: 'Google · Gemini 2.0 Flash',
        description: 'Gemini through the Gateway.',
        inputUsdPer1K: 0.000075,
        outputUsdPer1K: 0.00030,
        customerInputUsdPer1K: 0.00015,
        customerOutputUsdPer1K: 0.00060
      }
    ],
    supportsStreaming: true,
    supportsEmbeddings: false,
    managed: true
  },
  {
    id: 'custom_openai',
    label: 'Custom (OpenAI-compatible)',
    description: 'Point at any OpenAI-compatible endpoint — Azure OpenAI, Together, Groq, an in-house deployment, etc.',
    keyHelpUrl: null,
    keyPlaceholder: 'your-api-key',
    keyPrefix: null,
    defaultModel: 'custom-model',
    models: [
      {
        id: 'custom-model',
        label: 'Custom model',
        description: 'Whatever your endpoint exposes. Set the base URL separately.',
        inputUsdPer1K: 0,
        outputUsdPer1K: 0
      }
    ],
    supportsStreaming: false,
    supportsEmbeddings: false,
    managed: false
  }
])

export const DEFAULT_PROVIDER_ID = 'gemini'

// ============ STORAGE KEYS ============
const LS_PROVIDER = 'valence.settings.llm.provider'
const LS_MODEL    = 'valence.settings.llm.model'
const LS_BASE_URL = 'valence.settings.llm.baseUrl'   // only used by custom_openai
const LS_KEY_NS   = 'valence.settings.llm.key.'      // + provider id
const LEGACY_GEMINI_KEY = 'valence.settings.geminiKey'

// ============ HELPERS ============
function safeLocalGet(key) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage.getItem(key) || null
  } catch { return null }
}
function safeLocalSet(key, value) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false
    if (value === null || value === undefined || value === '') {
      window.localStorage.removeItem(key)
    } else {
      window.localStorage.setItem(key, String(value))
    }
    return true
  } catch { return false }
}

export function listProviders() { return PROVIDERS.slice() }

export function getProvider(id) {
  return PROVIDERS.find(p => p.id === id) || null
}

export function getProviderModel(providerId, modelId) {
  const p = getProvider(providerId)
  if (!p) return null
  return p.models.find(m => m.id === modelId) || null
}

// Resolve the active provider id with a sensible fallback chain:
//   1. explicit user pick in localStorage
//   2. DEFAULT_PROVIDER_ID
export function getActiveProviderId() {
  const stored = safeLocalGet(LS_PROVIDER)
  if (stored && getProvider(stored)) return stored
  return DEFAULT_PROVIDER_ID
}

export function getActiveProvider() {
  return getProvider(getActiveProviderId())
}

export function getActiveModelId() {
  const providerId = getActiveProviderId()
  const stored = safeLocalGet(LS_MODEL)
  const provider = getProvider(providerId)
  if (!provider) return null
  if (stored && provider.models.some(m => m.id === stored)) return stored
  return provider.defaultModel
}

export function getActiveModel() {
  return getProviderModel(getActiveProviderId(), getActiveModelId())
}

// Set provider + model in one shot. When `modelId` is null/undefined we
// snap to the provider's default model so we never leave a stale model id
// from the previous provider.
export function setActiveProvider(providerId, modelId = null) {
  const provider = getProvider(providerId)
  if (!provider) return false
  safeLocalSet(LS_PROVIDER, provider.id)
  const nextModel = (modelId && provider.models.some(m => m.id === modelId))
    ? modelId
    : provider.defaultModel
  safeLocalSet(LS_MODEL, nextModel)
  return true
}

export function setActiveModel(modelId) {
  const provider = getActiveProvider()
  if (!provider) return false
  if (!provider.models.some(m => m.id === modelId)) return false
  return safeLocalSet(LS_MODEL, modelId)
}

// Per-provider API key. Each provider has its own slot — switching from
// OpenAI to Gemini doesn't make you re-paste your OpenAI key when you
// switch back.
export function getApiKey(providerId) {
  const id = providerId || getActiveProviderId()
  if (id === 'gemini') {
    const fresh = safeLocalGet(LS_KEY_NS + id)
    if (fresh) return fresh
    // legacy slot — only honoured for Gemini so older customers keep working
    return safeLocalGet(LEGACY_GEMINI_KEY)
  }
  return safeLocalGet(LS_KEY_NS + id)
}

export function setApiKey(providerId, key) {
  if (!getProvider(providerId)) return false
  const trimmed = typeof key === 'string' ? key.trim() : ''
  const ok = safeLocalSet(LS_KEY_NS + providerId, trimmed)
  // Mirror to legacy slot for backwards-compat with anything still reading
  // valence.settings.geminiKey directly. Only for Gemini.
  if (providerId === 'gemini') safeLocalSet(LEGACY_GEMINI_KEY, trimmed)
  return ok
}

export function clearApiKey(providerId) { return setApiKey(providerId, '') }

// "Have we got something usable for this provider?" Used by the panel UI
// and by the call site to decide whether to throw "not configured".
// Gemini is `managed`: even with no user key the server's GEMINI_API_KEY
// stands in, so configured === true. For non-managed providers, the user
// MUST have supplied a key.
export function isProviderConfigured(providerId) {
  const p = getProvider(providerId)
  if (!p) return false
  const userKey = getApiKey(providerId)
  if (userKey) return true
  return Boolean(p.managed)
}

// Custom OpenAI-compatible endpoint base URL. Only relevant for custom_openai.
export function getCustomBaseUrl() { return safeLocalGet(LS_BASE_URL) || '' }
export function setCustomBaseUrl(url) { return safeLocalSet(LS_BASE_URL, url || '') }

// Snapshot of everything the UI / proxy needs in one call.
export function getActiveConfig() {
  const provider = getActiveProvider()
  const modelId = getActiveModelId()
  const model = getProviderModel(provider?.id, modelId)
  return {
    providerId: provider?.id || null,
    provider,
    modelId,
    model,
    apiKey: provider ? getApiKey(provider.id) : null,
    baseUrl: provider?.id === 'custom_openai' ? getCustomBaseUrl() : null,
    configured: provider ? isProviderConfigured(provider.id) : false
  }
}
