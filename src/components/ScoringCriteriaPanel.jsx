import { useEffect, useState } from 'react'
import { Target, Plus, X, Loader2, Check } from 'lucide-react'
import {
  DEFAULT_CRITERIA,
  loadDefaultCriteria,
  saveDefaultCriteria,
  validateCriteria
} from '../lib/fit.js'
import { isSupabaseConfigured } from '../lib/supabase.js'
import { humanError } from '../lib/userError.js'
import { useToast } from './Toast.jsx'

function ChipEditor({ label, values, onChange, placeholder, tone = 'neutral' }) {
  const [draft, setDraft] = useState('')

  function add(raw) {
    const v = String(raw || '').trim()
    if (!v) return
    if (values.includes(v)) { setDraft(''); return }
    onChange([...values, v])
    setDraft('')
  }

  function remove(v) {
    onChange(values.filter(x => x !== v))
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      if (draft.trim()) { e.preventDefault(); add(draft) }
    } else if (e.key === 'Backspace' && !draft && values.length) {
      onChange(values.slice(0, -1))
    }
  }

  const toneClass = tone === 'danger'
    ? 'border-rose-200 bg-rose-50 text-rose-800'
    : 'border-valence-blue/30 bg-valence-blue-soft text-valence-blue-deep'

  return (
    <div className="space-y-1.5">
      <label className="vl-label">{label}</label>
      <div className="rounded-lg border border-valence-border bg-valence-elevated p-2 flex flex-wrap gap-1.5">
        {values.map(v => (
          <span key={v} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${toneClass}`}>
            {v}
            <button type="button" onClick={() => remove(v)} className="opacity-70 hover:opacity-100" aria-label={`Remove ${v}`}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => draft.trim() && add(draft)}
          placeholder={values.length === 0 ? placeholder : '+ add'}
          className="flex-1 min-w-[120px] text-xs px-1 py-0.5 outline-none bg-transparent"
        />
      </div>
    </div>
  )
}

export default function ScoringCriteriaPanel() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [criteria, setCriteria] = useState(DEFAULT_CRITERIA)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    loadDefaultCriteria()
      .then(c => { if (!cancelled) setCriteria(c || DEFAULT_CRITERIA) })
      .catch(() => { if (!cancelled) setCriteria(DEFAULT_CRITERIA) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  function patch(updates) {
    setCriteria(prev => ({ ...prev, ...updates }))
  }

  function resetToDefaults() {
    setCriteria(DEFAULT_CRITERIA)
  }

  async function save() {
    const { ok, errors } = validateCriteria(criteria)
    if (!ok) {
      toast.error(errors[0])
      return
    }
    setSaving(true)
    try {
      const saved = await saveDefaultCriteria(criteria)
      setCriteria(saved)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1500)
      toast.success('Criteria updated.')
    } catch (e) {
      toast.error(humanError(e, 'Could not save criteria'))
    } finally {
      setSaving(false)
    }
  }

  const validation = validateCriteria(criteria)

  return (
    <div className="vl-card p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-valence-blue-soft p-2 text-valence-blue">
          <Target className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-valence-text">Investment criteria</h3>
            {savedFlash && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-valence-blue">
                <Check className="h-3 w-3" /> Saved
              </span>
            )}
          </div>
          <p className="text-xs text-valence-muted mt-0.5">
            Drives Quick Screener, Thesis-fit verdicts, and Fund-Match suggestions. Sectors and geographies are exact-match (case-insensitive); the EV band is inclusive.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg bg-valence-surface px-4 py-6 text-center text-xs text-valence-muted">
          <Loader2 className="h-4 w-4 mx-auto animate-spin mb-2" />
          Loading criteria…
        </div>
      ) : (
        <>
          <ChipEditor
            label="Allowed sectors"
            values={criteria.sectors || []}
            onChange={v => patch({ sectors: v })}
            placeholder="Healthcare, Fintech, Consumer…"
          />
          <ChipEditor
            label="Excluded sectors (hard pass)"
            values={criteria.excluded_sectors || []}
            onChange={v => patch({ excluded_sectors: v })}
            placeholder="Crypto, Adult, Gambling…"
            tone="danger"
          />
          <ChipEditor
            label="Geographies"
            values={criteria.geographies || []}
            onChange={v => patch({ geographies: v })}
            placeholder="India, UK, SE Asia…"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="vl-label">EV min (USD $M)</label>
              <input
                type="number"
                min="0"
                value={criteria.ev_min_usd_m ?? ''}
                onChange={e => patch({ ev_min_usd_m: e.target.value === '' ? null : Number(e.target.value) })}
                className="vl-input"
                placeholder="50"
              />
            </div>
            <div>
              <label className="vl-label">EV max (USD $M)</label>
              <input
                type="number"
                min="0"
                value={criteria.ev_max_usd_m ?? ''}
                onChange={e => patch({ ev_max_usd_m: e.target.value === '' ? null : Number(e.target.value) })}
                className="vl-input"
                placeholder="750"
              />
            </div>
          </div>

          {!validation.ok && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-900">
              {validation.errors.join(' · ')}
            </div>
          )}

          {!isSupabaseConfigured && (
            <p className="text-[11px] text-valence-subtle italic">
              Demo mode — changes apply for the current session but won't persist without Supabase.
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={resetToDefaults}
              disabled={saving}
              className="vl-btn-ghost text-xs"
            >
              Reset to defaults
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || !validation.ok}
              className="vl-btn-primary-sm"
            >
              {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : 'Save criteria'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
