// Fit Engine — score opportunities (intake submissions / deals) against firm
// investment criteria. The scorer is a pure function so it's testable and
// runs identically with or without Supabase. Persistence helpers below are
// thin wrappers over the `fit_assessments` + `fit_criteria` tables.

import { supabase, isSupabaseConfigured } from './supabase'

// ---------------------------------------------------------------------------
// Defaults — mirror the seed in supabase/phase-3.5-fit-engine.sql so the UI
// has something sensible to render before the SQL is applied.
// ---------------------------------------------------------------------------
export const DEFAULT_CRITERIA = Object.freeze({
  id: 'default-local',
  name: 'Default Valence criteria',
  is_default: true,
  sectors: ['Healthcare', 'Fintech', 'Consumer', 'Infrastructure', 'Renewables', 'Logistics', 'Real Estate'],
  excluded_sectors: [],
  ev_min_usd_m: 50,
  ev_max_usd_m: 750,
  geographies: ['India', 'UK', 'SE Asia']
})

// Weights chosen so a perfect 3/3 hits 100. Sector is heaviest because
// thesis mismatch is the #1 reason the firm passes; geo is lightest because
// Valence does occasionally go out-of-region for the right counterparty.
const WEIGHTS = Object.freeze({ sector: 40, ev: 35, geo: 25 })

const VERDICT_THRESHOLDS = Object.freeze([
  { min: 80, verdict: 'strong_fit' },
  { min: 60, verdict: 'fit' },
  { min: 40, verdict: 'maybe' },
  { min: 0,  verdict: 'pass' }
])

export const VERDICT_LABEL = Object.freeze({
  strong_fit: 'Strong fit',
  fit:        'Fit',
  maybe:      'Worth a look',
  pass:       'Pass',
  excluded:   'Excluded'
})

// Tailwind utility classes — match the chip palette already used elsewhere.
export const VERDICT_TONE = Object.freeze({
  strong_fit: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  fit:        'bg-blue-100 text-blue-800 border-blue-200',
  maybe:      'bg-amber-100 text-amber-800 border-amber-200',
  pass:       'bg-slate-100 text-slate-700 border-slate-200',
  excluded:   'bg-rose-100 text-rose-800 border-rose-200'
})

export const ACTION_LABEL = Object.freeze({
  mark_fit:      'Mark as Fit',
  pass:          'Pass',
  ask_more_info: 'Ask for More Info',
  override:      'Override'
})

// Order matters — UI renders buttons in this sequence (per the user's sign-off).
export const ACTION_ORDER = Object.freeze(['mark_fit', 'pass', 'ask_more_info', 'override'])

// ---------------------------------------------------------------------------
// Normalization — entities arrive in different shapes (deal, intake row,
// fund). normalizeEntity flattens to { sector, ev_usd_m, geography } so the
// scorer doesn't care about source.
// ---------------------------------------------------------------------------
export function normalizeEntity(entity, entityType = 'deal') {
  if (!entity) return { sector: null, ev_usd_m: null, geography: null }

  const sector = entity.sector || null
  const geography = entity.geography || null

  let ev_usd_m = null
  if (entityType === 'intake') {
    ev_usd_m = numOrNull(entity.ev_ask_usd_m)
  } else {
    // Deals: prefer explicit valuation, fall back to raise/exit asks. None of
    // these are perfect EV proxies but they're the right magnitude for the
    // sieve we're trying to do here.
    ev_usd_m =
      numOrNull(entity.target_valuation_usd_m) ??
      numOrNull(entity.target_exit_valuation_usd_m) ??
      numOrNull(entity.target_raise_usd_m) ??
      numOrNull(entity.target_exit_usd_m) ??
      numOrNull(entity.ticket_size_usd_m) ??
      numOrNull(entity.financials?.enterprise_value_usd_m)
  }
  return { sector, ev_usd_m, geography }
}

// ---------------------------------------------------------------------------
// Pure scorer. Returns:
//   {
//     score:    0–100,
//     verdict:  'strong_fit' | 'fit' | 'maybe' | 'pass' | 'excluded',
//     reasons:  string[]   // short user-readable lines
//     breakdown: {
//       sector: { hit, weight, value, target },
//       ev:     { hit, weight, value, target_min, target_max },
//       geo:    { hit, weight, value, target },
//       excluded: boolean
//     }
//   }
// ---------------------------------------------------------------------------
export function assessFit(entityShape, criteria = DEFAULT_CRITERIA) {
  const { sector, ev_usd_m, geography } = entityShape || {}
  const c = criteria || DEFAULT_CRITERIA

  const sectorN = norm(sector)
  const geoN    = norm(geography)
  const allowedSectors  = (c.sectors || []).map(norm)
  const excludedSectors = (c.excluded_sectors || []).map(norm)
  const allowedGeos     = (c.geographies || []).map(norm)
  const evMin = numOrNull(c.ev_min_usd_m)
  const evMax = numOrNull(c.ev_max_usd_m)

  const reasons = []
  const breakdown = {
    sector: { hit: false, weight: WEIGHTS.sector, value: sector || null, target: c.sectors || [] },
    ev:     { hit: false, weight: WEIGHTS.ev,     value: ev_usd_m,        target_min: evMin, target_max: evMax },
    geo:    { hit: false, weight: WEIGHTS.geo,    value: geography || null, target: c.geographies || [] },
    excluded: false
  }

  // Hard exclude — short-circuits to verdict='excluded' with score=0.
  if (sectorN && excludedSectors.includes(sectorN)) {
    breakdown.excluded = true
    reasons.push(`Excluded sector: ${sector}`)
    return { score: 0, verdict: 'excluded', reasons, breakdown }
  }

  let score = 0
  if (sectorN && allowedSectors.includes(sectorN)) {
    breakdown.sector.hit = true
    score += WEIGHTS.sector
    reasons.push(`Sector match: ${sector}`)
  } else if (sectorN) {
    reasons.push(`Sector outside thesis: ${sector}`)
  } else {
    reasons.push('Sector unspecified')
  }

  if (ev_usd_m != null) {
    const min = evMin ?? -Infinity
    const max = evMax ?? Infinity
    if (ev_usd_m >= min && ev_usd_m <= max) {
      breakdown.ev.hit = true
      score += WEIGHTS.ev
      reasons.push(`EV $${fmtM(ev_usd_m)} inside $${fmtRange(evMin, evMax)} band`)
    } else {
      reasons.push(`EV $${fmtM(ev_usd_m)} outside $${fmtRange(evMin, evMax)} band`)
    }
  } else {
    reasons.push('EV unknown')
  }

  if (geoN && allowedGeos.includes(geoN)) {
    breakdown.geo.hit = true
    score += WEIGHTS.geo
    reasons.push(`Geography match: ${geography}`)
  } else if (geoN) {
    reasons.push(`Geography outside coverage: ${geography}`)
  } else {
    reasons.push('Geography unspecified')
  }

  const clamped = Math.max(0, Math.min(100, Math.round(score)))
  return { score: clamped, verdict: verdictFor(clamped), reasons, breakdown }
}

export function verdictFor(score) {
  for (const t of VERDICT_THRESHOLDS) if (score >= t.min) return t.verdict
  return 'pass'
}

// ---------------------------------------------------------------------------
// Persistence helpers — DB-aware. Degrade silently when Supabase is not
// configured (the scorer still runs; we just can't store the action).
// ---------------------------------------------------------------------------
export async function loadDefaultCriteria() {
  if (!isSupabaseConfigured) return DEFAULT_CRITERIA
  const { data, error } = await supabase
    .from('fit_criteria')
    .select('*')
    .eq('is_default', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return DEFAULT_CRITERIA
  return data
}

export async function loadAssessment({ entityType, entityId, criteriaId }) {
  if (!isSupabaseConfigured || !entityType || !entityId || !criteriaId) return null
  const { data, error } = await supabase
    .from('fit_assessments')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('criteria_id', criteriaId)
    .maybeSingle()
  if (error) return null
  return data
}

// Re-score and upsert. If the user clicks an action button, pass it in here
// so the row records what they did + an optional reason.
export async function saveAssessment({
  entityType,
  entityId,
  criteria,
  scored,
  action = null,
  actionReason = null
}) {
  if (!isSupabaseConfigured) return { ok: false, reason: 'no_supabase' }
  if (!entityType || !entityId || !criteria?.id || !scored) {
    return { ok: false, reason: 'bad_args' }
  }
  const row = {
    entity_type:   entityType,
    entity_id:     entityId,
    criteria_id:   criteria.id,
    fit_score:     scored.score,
    verdict:       scored.verdict,
    breakdown:     scored.breakdown,
    reasons:       scored.reasons,
    action,
    action_reason: actionReason,
    action_at:     action ? new Date().toISOString() : null,
    assessed_at:   new Date().toISOString()
  }
  const { data, error } = await supabase
    .from('fit_assessments')
    .upsert(row, { onConflict: 'entity_type,entity_id,criteria_id' })
    .select()
    .maybeSingle()
  if (error) return { ok: false, reason: error.message }
  return { ok: true, row: data }
}

// ---------------------------------------------------------------------------
// Tiny helpers
// ---------------------------------------------------------------------------
function norm(v) { return (v ?? '').toString().toLowerCase().trim() }
function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
function fmtM(n) {
  if (n == null) return '—'
  if (n >= 1000) return `${(n / 1000).toFixed(1)}B`
  if (n >= 100)  return `${Math.round(n)}M`
  return `${n}M`
}
function fmtRange(min, max) {
  if (min == null && max == null) return 'any'
  if (min == null) return `≤${fmtM(max)}`
  if (max == null) return `≥${fmtM(min)}`
  return `${fmtM(min)}–${fmtM(max)}`
}
