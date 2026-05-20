import { useMemo, useState } from 'react'
import { Sparkles, Eye, EyeOff, Loader2, Check, AlertCircle, ChevronDown } from 'lucide-react'
import {
  listProviders,
  getActiveProvider,
  getActiveModel,
  setActiveProvider,
  setActiveModel,
  getApiKey,
  setApiKey,
  clearApiKey,
  isProviderConfigured,
  getCustomBaseUrl,
  setCustomBaseUrl
} from '../lib/llmProviders.js'
import { testGeminiKey } from '../lib/gemini.js'
import { useToast } from './Toast.jsx'

function mask(key) {
  if (!key) return ''
  if (key.length <= 8) return '••••'
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`
}

// Liveness check. Today only Gemini has a server-managed key and a known
// direct testing URL — for other providers we'd burn the customer's quota
// to verify so we skip the round-trip and trust their paste. Returns
// `null` for "not tested" rather than fake-pass to keep the UI honest.
async function testProviderKey(providerId, key) {
  if (providerId === 'gemini') {
    return testGeminiKey(key)
  }
  return null
}

export default function LlmProviderPanel() {
  const toast = useToast()
  const providers = useMemo(() => listProviders(), [])
  const [activeProviderId, setActiveProviderIdLocal] = useState(() => getActiveProvider()?.id || 'gemini')
  const activeProvider = providers.find(p => p.id === activeProviderId) || providers[0]
  const [activeModelId, setActiveModelIdLocal] = useState(() => getActiveModel()?.id || activeProvider.defaultModel)

  // Each provider keeps its own slot for the stored key + the draft, so
  // switching tabs doesn't lose what the user was typing into another one.
  const [storedKey, setStoredKey] = useState(() => getApiKey(activeProviderId) || '')
  const [draft, setDraft] = useState('')
  const [reveal, setReveal] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [baseUrl, setBaseUrlLocal] = useState(() => getCustomBaseUrl())

  const hasKey = Boolean(storedKey)
  const configured = isProviderConfigured(activeProviderId)

  function pickProvider(id) {
    if (id === activeProviderId) return
    setActiveProviderIdLocal(id)
    const next = providers.find(p => p.id === id)
    const nextModel = next?.defaultModel || null
    setActiveProvider(id, nextModel)
    setActiveModelIdLocal(nextModel)
    setStoredKey(getApiKey(id) || '')
    setDraft('')
    setTestResult(null)
    toast.success(`${next?.label || id} is now the active provider.`)
  }

  function pickModel(modelId) {
    setActiveModelIdLocal(modelId)
    setActiveModel(modelId)
    toast.success('Model updated.')
  }

  function save() {
    const trimmed = draft.trim()
    if (!trimmed) {
      toast.error('Paste a key first')
      return
    }
    const ok = setApiKey(activeProviderId, trimmed)
    if (!ok) {
      toast.error('Could not save key — browser storage blocked')
      return
    }
    setStoredKey(trimmed)
    setDraft('')
    setTestResult(null)
    toast.success(`${activeProvider.label} key saved.`)
  }

  function clearKey() {
    clearApiKey(activeProviderId)
    setStoredKey('')
    setDraft('')
    setTestResult(null)
    toast.success('Cleared your key.')
  }

  async function runTest() {
    const target = (draft.trim() || storedKey).trim()
    if (!target) {
      toast.error('No key to test')
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const r = await testProviderKey(activeProviderId, target)
      if (!r) {
        setTestResult({ ok: null, error: 'Live test not available for this provider — save and try a real request to verify.' })
      } else {
        setTestResult(r)
      }
    } finally {
      setTesting(false)
    }
  }

  function saveBaseUrl() {
    setCustomBaseUrl(baseUrl.trim())
    toast.success('Base URL updated.')
  }

  return (
    <div className="vl-card p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-valence-blue-soft p-2 text-valence-blue">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-valence-text">AI provider</h3>
            {configured
              ? <span className="vl-chip-blue text-[10px]">Configured</span>
              : <span className="vl-chip text-[10px]">Not configured</span>}
          </div>
          <p className="text-xs text-valence-muted mt-0.5">
            Choose which LLM powers Ask, deal briefs, meeting summaries, and follow-up drafts. Keys are stored locally in this browser — never sent anywhere except to the provider you pick.
          </p>
        </div>
      </div>

      {/* Provider picker (tabs) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {providers.map(p => {
          const isActive = p.id === activeProviderId
          const isConfigured = isProviderConfigured(p.id)
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => pickProvider(p.id)}
              className={`group rounded-lg border px-3 py-2.5 text-left transition ${
                isActive
                  ? 'border-valence-blue bg-valence-blue-soft'
                  : 'border-valence-border bg-valence-elevated hover:border-valence-ink/30 hover:bg-valence-surface'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-valence-text truncate">{p.label}</span>
                {isConfigured && <Check className="h-3 w-3 shrink-0 text-valence-blue" />}
              </div>
              <div className="text-[10px] text-valence-subtle mt-0.5 line-clamp-2">{p.description}</div>
            </button>
          )
        })}
      </div>

      {/* Model picker */}
      <div className="space-y-2">
        <label className="vl-label" htmlFor="llm-model-select">Model</label>
        <div className="relative">
          <select
            id="llm-model-select"
            value={activeModelId}
            onChange={e => pickModel(e.target.value)}
            className="vl-input pr-9 appearance-none text-sm"
          >
            {activeProvider.models.map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <ChevronDown className="h-3.5 w-3.5 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-valence-muted" />
        </div>
        {(() => {
          const m = activeProvider.models.find(x => x.id === activeModelId)
          if (!m) return null
          return (
            <p className="text-[11px] text-valence-subtle">
              {m.description}
              {m.inputUsdPer1K > 0 && (
                <>
                  {' '}· ${m.inputUsdPer1K.toFixed(4)} in / ${m.outputUsdPer1K.toFixed(4)} out per 1k tokens.
                </>
              )}
            </p>
          )
        })()}
      </div>

      {/* Stored key block */}
      {hasKey && (
        <div className="rounded-lg bg-valence-surface px-3.5 py-2.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-valence-subtle mb-0.5">
              Saved {activeProvider.label} key
            </div>
            <code className="text-xs font-mono text-valence-text">{mask(storedKey)}</code>
          </div>
          <button type="button" onClick={clearKey} className="vl-btn-ghost text-xs">
            Clear key
          </button>
        </div>
      )}

      {/* New key input */}
      <div className="space-y-2">
        <label className="vl-label" htmlFor="llm-key-input">
          {hasKey ? 'Replace key' : 'Paste API key'}
        </label>
        <div className="relative">
          <input
            id="llm-key-input"
            type={reveal ? 'text' : 'password'}
            value={draft}
            onChange={e => { setDraft(e.target.value); setTestResult(null) }}
            placeholder={activeProvider.keyPlaceholder}
            autoComplete="off"
            spellCheck={false}
            className="vl-input pr-10 font-mono text-sm"
          />
          <button
            type="button"
            onClick={() => setReveal(r => !r)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded text-valence-muted hover:text-valence-text"
            aria-label={reveal ? 'Hide key' : 'Reveal key'}
          >
            {reveal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
        {activeProvider.keyHelpUrl ? (
          <p className="text-[11px] text-valence-subtle">
            Get a key at{' '}
            <a className="text-valence-blue hover:underline" href={activeProvider.keyHelpUrl} target="_blank" rel="noreferrer noopener">
              {new URL(activeProvider.keyHelpUrl).host}
            </a>.
            {activeProvider.managed && ' Without a key, calls use our managed default — fine for evaluation.'}
          </p>
        ) : (
          <p className="text-[11px] text-valence-subtle">
            Use any OpenAI-compatible key. Set the base URL below.
          </p>
        )}
      </div>

      {/* Custom base URL (only for custom_openai) */}
      {activeProviderId === 'custom_openai' && (
        <div className="space-y-2">
          <label className="vl-label" htmlFor="llm-base-url">Base URL</label>
          <div className="flex items-center gap-2">
            <input
              id="llm-base-url"
              type="text"
              value={baseUrl}
              onChange={e => setBaseUrlLocal(e.target.value)}
              placeholder="https://api.example.com/v1"
              autoComplete="off"
              spellCheck={false}
              className="vl-input flex-1 font-mono text-sm"
            />
            <button type="button" onClick={saveBaseUrl} className="vl-btn-secondary-sm">Save</button>
          </div>
          <p className="text-[11px] text-valence-subtle">
            Any OpenAI-compatible endpoint — Azure OpenAI, Groq, Together, an in-house deployment. We send a standard /chat/completions request.
          </p>
        </div>
      )}

      {/* Test result */}
      {testResult && (
        <div className={`rounded-lg px-3 py-2.5 flex items-start gap-2 text-xs ${
          testResult.ok === true
            ? 'bg-valence-blue-soft text-valence-blue-deep'
            : testResult.ok === false
            ? 'bg-red-50 text-valence-danger'
            : 'bg-valence-surface text-valence-muted'
        }`}>
          {testResult.ok === true
            ? <Check className="h-4 w-4 shrink-0 mt-0.5" />
            : testResult.ok === false
            ? <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            : <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />}
          <span>
            {testResult.ok === true
              ? `${activeProvider.label} responded — key works.`
              : testResult.ok === false
              ? `Key rejected — ${testResult.error}`
              : testResult.error}
          </span>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={runTest}
          disabled={testing || (!draft.trim() && !storedKey)}
          className="vl-btn-secondary-sm"
        >
          {testing ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Testing…</> : 'Test'}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!draft.trim()}
          className="vl-btn-primary-sm"
        >
          Save key
        </button>
      </div>
    </div>
  )
}
