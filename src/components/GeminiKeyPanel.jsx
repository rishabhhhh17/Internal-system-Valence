import { useState } from 'react'
import { Sparkles, Eye, EyeOff, Loader2, Check, AlertCircle } from 'lucide-react'
import {
  getGeminiKey,
  getGeminiKeySource,
  setGeminiKey,
  clearGeminiKey,
  testGeminiKey
} from '../lib/gemini.js'
import { useToast } from './Toast.jsx'

function mask(key) {
  if (!key) return ''
  if (key.length <= 8) return '••••'
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`
}

export default function GeminiKeyPanel() {
  const toast = useToast()
  const [storedKey, setStoredKey] = useState(() => getGeminiKey() || '')
  const [storedSource, setStoredSource] = useState(() => getGeminiKeySource())
  const [draft, setDraft] = useState('')
  const [reveal, setReveal] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null) // { ok, error }

  const hasUserKey = storedSource === 'user'
  const hasEnvKey = storedSource === 'env'
  const hasAnyKey = Boolean(storedKey)

  function save() {
    const trimmed = draft.trim()
    if (!trimmed) {
      toast.error('Paste a key first')
      return
    }
    const ok = setGeminiKey(trimmed)
    if (!ok) {
      toast.error('Could not save key — browser storage blocked')
      return
    }
    setStoredKey(getGeminiKey() || '')
    setStoredSource(getGeminiKeySource())
    setDraft('')
    setTestResult(null)
    toast.success('Gemini key saved.')
  }

  function clear() {
    clearGeminiKey()
    setStoredKey(getGeminiKey() || '')
    setStoredSource(getGeminiKeySource())
    setDraft('')
    setTestResult(null)
    toast.success('Cleared your key.')
  }

  async function test() {
    const target = (draft.trim() || storedKey).trim()
    if (!target) {
      toast.error('No key to test')
      return
    }
    setTesting(true)
    setTestResult(null)
    const r = await testGeminiKey(target)
    setTesting(false)
    setTestResult(r)
  }

  return (
    <div className="vl-card p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-valence-blue-soft p-2 text-valence-blue">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-valence-text">Gemini API key</h3>
            {hasUserKey && <span className="vl-chip-blue text-[10px]">Your key</span>}
            {hasEnvKey && <span className="vl-chip text-[10px]">Build default</span>}
            {!hasAnyKey && <span className="vl-chip text-[10px]">Not set</span>}
          </div>
          <p className="text-xs text-valence-muted mt-0.5">
            Powers Ask, deal briefs, meeting summaries, and follow-up drafts. Your key is stored locally in this browser only — no server round-trip.
          </p>
        </div>
      </div>

      {hasAnyKey && (
        <div className="rounded-lg bg-valence-surface px-3.5 py-2.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-valence-subtle mb-0.5">Current key</div>
            <code className="text-xs font-mono text-valence-text">{mask(storedKey)}</code>
          </div>
          {hasUserKey && (
            <button
              type="button"
              onClick={clear}
              className="vl-btn-ghost text-xs"
            >
              Clear my key
            </button>
          )}
        </div>
      )}

      <div className="space-y-2">
        <label className="vl-label" htmlFor="gemini-key-input">
          Paste a new key
        </label>
        <div className="relative">
          <input
            id="gemini-key-input"
            type={reveal ? 'text' : 'password'}
            value={draft}
            onChange={e => { setDraft(e.target.value); setTestResult(null) }}
            placeholder="AIza…"
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
        <p className="text-[11px] text-valence-subtle">
          Get a key at <a className="text-valence-blue hover:underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer noopener">aistudio.google.com/apikey</a>. Free tier is fine for evaluation.
        </p>
      </div>

      {testResult && (
        <div className={`rounded-lg px-3 py-2.5 flex items-start gap-2 text-xs ${
          testResult.ok
            ? 'bg-valence-blue-soft text-valence-blue-deep'
            : 'bg-red-50 text-valence-danger'
        }`}>
          {testResult.ok
            ? <Check className="h-4 w-4 shrink-0 mt-0.5" />
            : <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />}
          <span>{testResult.ok ? 'Key works — Gemini responded.' : `Key rejected — ${testResult.error}`}</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={test}
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
