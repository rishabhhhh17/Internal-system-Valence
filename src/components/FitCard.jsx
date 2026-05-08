import { useEffect, useMemo, useState } from 'react'
import { Check, X, HelpCircle, ShieldAlert, RefreshCw, Loader2 } from 'lucide-react'
import {
  assessFit,
  normalizeEntity,
  loadDefaultCriteria,
  loadAssessment,
  saveAssessment,
  ACTION_LABEL,
  ACTION_ORDER,
  VERDICT_LABEL,
  VERDICT_TONE,
  DEFAULT_CRITERIA
} from '../lib/fit.js'

const ACTION_ICON = {
  mark_fit:      Check,
  pass:          X,
  ask_more_info: HelpCircle,
  override:      ShieldAlert
}

// FitCard — renders the engine output for one entity (intake row or deal),
// plus the four action buttons. Self-contained: loads default criteria + any
// existing assessment from Supabase; degrades to local DEFAULT_CRITERIA when
// Supabase isn't configured. Pass `criteria` to skip the load.
export default function FitCard({
  entity,
  entityType = 'deal',
  criteria: criteriaProp,
  onActionRecorded,
  className = ''
}) {
  const [criteria, setCriteria]     = useState(criteriaProp || null)
  const [stored,   setStored]       = useState(null)
  const [assessing, setAssessing]   = useState(false)
  const [persisting, setPersisting] = useState(false)
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [overrideText, setOverrideText] = useState('')
  const [error, setError]           = useState(null)

  // Resolve criteria (passed in OR loaded once).
  useEffect(() => {
    if (criteriaProp) { setCriteria(criteriaProp); return }
    let cancelled = false
    loadDefaultCriteria().then(c => { if (!cancelled) setCriteria(c || DEFAULT_CRITERIA) })
    return () => { cancelled = true }
  }, [criteriaProp])

  // Load any persisted assessment for this entity once we have criteria.
  useEffect(() => {
    if (!criteria || !entity?.id) return
    let cancelled = false
    loadAssessment({ entityType, entityId: entity.id, criteriaId: criteria.id })
      .then(row => { if (!cancelled) setStored(row) })
    return () => { cancelled = true }
  }, [criteria, entity?.id, entityType])

  // Live score — computed every render against the entity's current shape.
  const live = useMemo(() => {
    if (!criteria) return null
    const shape = normalizeEntity(entity, entityType)
    return assessFit(shape, criteria)
  }, [entity, entityType, criteria])

  if (!criteria || !live) {
    return (
      <div className={`vl-card p-6 ${className}`}>
        <div className="flex items-center gap-2 text-sm text-valence-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading Fit Engine…
        </div>
      </div>
    )
  }

  // Persist + invoke action.
  async function takeAction(action, reason = null) {
    if (!entity?.id || persisting) return
    setPersisting(true); setError(null)
    const result = await saveAssessment({
      entityType,
      entityId: entity.id,
      criteria,
      scored: live,
      action,
      actionReason: reason
    })
    setPersisting(false)
    if (!result.ok) {
      // Demo mode: no Supabase → record locally so the UI still updates.
      const fallback = {
        ...live,
        action,
        action_reason: reason,
        action_at: new Date().toISOString()
      }
      setStored(fallback)
      if (result.reason !== 'no_supabase') setError(result.reason)
    } else {
      setStored(result.row)
    }
    if (action === 'override') { setOverrideOpen(false); setOverrideText('') }
    onActionRecorded?.({ action, reason, scored: live })
  }

  function reassess() {
    // The score is already live (recomputed every render). The button exists
    // so the user has a deliberate "I just changed the entity, refresh me"
    // affordance — clear the stored verdict so the new score shows uncluttered.
    setStored(null)
  }

  const verdictTone  = VERDICT_TONE[live.verdict]
  const verdictLabel = VERDICT_LABEL[live.verdict]
  const lastAction   = stored?.action

  return (
    <div className={`vl-card p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <span className="vl-eyebrow-ink">Mandate Fit</span>
          <h3 className="vl-section-title text-lg mt-1">{criteria.name}</h3>
        </div>
        <button
          type="button"
          onClick={reassess}
          className="vl-btn-ghost shrink-0"
          title="Re-score against current entity values"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Re-assess
        </button>
      </div>

      {/* Score + verdict */}
      <div className="flex items-center gap-4 mb-5">
        <div className={`flex h-20 w-20 flex-col items-center justify-center rounded-2xl border ${verdictTone}`}>
          <span className="text-3xl font-bold leading-none">{live.score}</span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] mt-1">/ 100</span>
        </div>
        <div className="min-w-0">
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${verdictTone}`}>
            {verdictLabel}
          </span>
          {lastAction && (
            <p className="mt-2 text-xs text-valence-muted">
              Last action:{' '}
              <span className="font-medium text-valence-text">{ACTION_LABEL[lastAction]}</span>
              {stored?.action_reason ? <> — “{stored.action_reason}”</> : null}
            </p>
          )}
        </div>
      </div>

      {/* Breakdown bars */}
      <div className="space-y-2.5 mb-5">
        <BreakdownRow
          label="Sector"
          hit={live.breakdown.sector.hit}
          weight={live.breakdown.sector.weight}
          value={live.breakdown.sector.value || 'Unspecified'}
          targetText={`vs ${(live.breakdown.sector.target || []).join(' · ') || 'any'}`}
        />
        <BreakdownRow
          label="Enterprise Value"
          hit={live.breakdown.ev.hit}
          weight={live.breakdown.ev.weight}
          value={live.breakdown.ev.value != null ? `$${formatM(live.breakdown.ev.value)}` : 'Unknown'}
          targetText={`vs $${rangeText(live.breakdown.ev.target_min, live.breakdown.ev.target_max)} band`}
        />
        <BreakdownRow
          label="Geography"
          hit={live.breakdown.geo.hit}
          weight={live.breakdown.geo.weight}
          value={live.breakdown.geo.value || 'Unspecified'}
          targetText={`vs ${(live.breakdown.geo.target || []).join(' · ') || 'any'}`}
        />
        {live.breakdown.excluded && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            Hard exclude triggered — verdict locked to Excluded regardless of other dimensions.
          </div>
        )}
      </div>

      {/* Reasons */}
      <ul className="mb-5 space-y-1">
        {live.reasons.map((r, i) => (
          <li key={i} className="text-xs text-valence-muted">• {r}</li>
        ))}
      </ul>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {ACTION_ORDER.map(action => {
          const Icon = ACTION_ICON[action]
          const isPrimary = action === 'mark_fit'
          const isOverride = action === 'override'
          return (
            <button
              key={action}
              type="button"
              disabled={persisting}
              onClick={() => isOverride ? setOverrideOpen(o => !o) : takeAction(action)}
              className={isPrimary ? 'vl-btn-primary-sm' : 'vl-btn-secondary-sm'}
              title={ACTION_LABEL[action]}
            >
              <Icon className="h-3.5 w-3.5" /> {ACTION_LABEL[action]}
            </button>
          )
        })}
        {persisting && <Loader2 className="h-4 w-4 animate-spin text-valence-muted ml-1" />}
      </div>

      {/* Override reason form */}
      {overrideOpen && (
        <div className="mt-3 rounded-lg border border-valence-border bg-valence-surface p-3">
          <label className="vl-label">Override reason</label>
          <textarea
            value={overrideText}
            onChange={e => setOverrideText(e.target.value)}
            rows={2}
            placeholder="Why are we proceeding despite the engine's verdict?"
            className="vl-input w-full text-sm"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={!overrideText.trim() || persisting}
              onClick={() => takeAction('override', overrideText.trim())}
              className="vl-btn-primary-sm"
            >
              Save override
            </button>
            <button
              type="button"
              onClick={() => { setOverrideOpen(false); setOverrideText('') }}
              className="vl-btn-ghost"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-rose-700">Couldn't save: {error}</p>
      )}
    </div>
  )
}

function BreakdownRow({ label, hit, weight, value, targetText }) {
  const pct = hit ? 100 : 0
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-semibold text-valence-text">{label}</span>
        <span className={hit ? 'text-emerald-700 font-semibold' : 'text-valence-muted'}>
          {hit ? `+${weight}` : `0 / ${weight}`}
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-valence-surface overflow-hidden">
        <div
          className={`h-full ${hit ? 'bg-emerald-500' : 'bg-rose-300'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-valence-muted">
        <span className="truncate">{value}</span>
        <span className="truncate ml-2">{targetText}</span>
      </div>
    </div>
  )
}

function formatM(n) {
  if (n == null) return '—'
  if (n >= 1000) return `${(n / 1000).toFixed(1)}B`
  if (n >= 100) return `${Math.round(n)}M`
  return `${n}M`
}
function rangeText(min, max) {
  if (min == null && max == null) return 'any'
  if (min == null) return `≤${formatM(max)}`
  if (max == null) return `≥${formatM(min)}`
  return `${formatM(min)}–${formatM(max)}`
}
