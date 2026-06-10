// Relationship strength scoring.
//
// Per-person warmth derived from interaction history + deal involvement.
// Pure functions — no Supabase, no fetch. The caller passes in the
// people, interactions, and deals arrays it already has loaded, and
// gets back a `Map<personId, RelationshipScore>` plus helpers.
//
// We score on a 0–100 scale, broken into four components:
//
//   recency      40%   — how long since the last interaction
//   frequency    30%   — count of interactions in the last 90 days
//   engagement   15%   — fraction of positive outcomes
//   pipeline     15%   — count of deals where this person is a
//                        counterparty (named or by company match)
//
// Categorical "warmth" labels are bucketed off the score so the UI
// chip is easy to read at a glance. Reasoning text accompanies each
// score so a partner can tap the chip and see WHY it's amber, not
// just that it is.
//
// Matching person ↔ interaction is fuzzy: people.full_name is matched
// (case-insensitively) against interactions.counterparty_name. Not
// perfect, but good enough until we add an explicit FK.

// ============ CONSTANTS ============

const NOW = () => Date.now()
const DAY = 86_400_000

// Recency decay anchors — { days, score }. Linear interpolation between.
const RECENCY_ANCHORS = [
  { d: 0,   s: 100 },
  { d: 7,   s: 85 },
  { d: 30,  s: 60 },
  { d: 60,  s: 40 },
  { d: 90,  s: 20 },
  { d: 180, s: 0 }
]

// Frequency curve — interactions in last 90 days.
const FREQUENCY_CURVE = [
  { count: 0, s: 0 },
  { count: 1, s: 20 },
  { count: 3, s: 50 },
  { count: 6, s: 80 },
  { count: 10, s: 100 }
]

// Pipeline curve — distinct deals this person touches.
const PIPELINE_CURVE = [
  { count: 0, s: 0 },
  { count: 1, s: 50 },
  { count: 2, s: 75 },
  { count: 3, s: 100 }
]

// Outcomes counted as "positive" / "negative" signal for engagement %.
const POSITIVE_OUTCOMES = new Set([
  'interested', 'in_progress', 'converted_to_mandate', 'stay_warm'
])
const NEGATIVE_OUTCOMES = new Set([
  'passed', 'pitched_lost'
])

// Warmth buckets — score → label. Order from highest to lowest.
const WARMTH_BUCKETS = [
  { min: 75, key: 'warm',    label: 'Warm',     tone: 'success' },
  { min: 50, key: 'engaged', label: 'Engaged',  tone: 'blue' },
  { min: 25, key: 'cool',    label: 'Cool',     tone: 'muted' },
  { min: 0,  key: 'cold',    label: 'Cold',     tone: 'warning' }
]

// Special case — zero interactions ever. Different from "Cold" (had
// activity once but it's been ages).
const DORMANT = { key: 'dormant', label: 'No history', tone: 'subtle' }

// ============ PUBLIC API ============

// Compute warmth for one person from pre-filtered interactions + deals.
//   person       — { id, full_name, company, email, ... }
//   interactions — array of interaction rows belonging to this person
//   deals        — array of deals this person is a counterparty on
// Returns { score, warmth, components, reasons }.
export function scorePerson(person, interactions, deals) {
  const ints = Array.isArray(interactions) ? interactions : []
  const dls  = Array.isArray(deals) ? deals : []

  if (ints.length === 0 && dls.length === 0) {
    return {
      score: 0,
      warmth: DORMANT,
      components: { recency: 0, frequency: 0, engagement: 0, pipeline: 0 },
      reasons: ['No interactions logged yet']
    }
  }

  const now = NOW()

  // Recency — days since most recent interaction.
  const lastTouchTs = ints.reduce((acc, i) => {
    const t = new Date(i.created_at || 0).getTime()
    return t > acc ? t : acc
  }, 0)
  const daysSince = lastTouchTs > 0 ? Math.floor((now - lastTouchTs) / DAY) : 9999
  const recency = interpolate(daysSince, RECENCY_ANCHORS, true)

  // Frequency — count of interactions in last 90 days.
  const recentCount = ints.filter(i => {
    const t = new Date(i.created_at || 0).getTime()
    return t > 0 && (now - t) <= 90 * DAY
  }).length
  const frequency = curve(recentCount, FREQUENCY_CURVE)

  // Engagement — % positive outcomes among scored interactions.
  const signaled = ints.filter(i => POSITIVE_OUTCOMES.has(i.outcome) || NEGATIVE_OUTCOMES.has(i.outcome))
  let engagement = 50  // default neutral when there are interactions but no
                       // strong signal either way
  if (signaled.length > 0) {
    const pos = signaled.filter(i => POSITIVE_OUTCOMES.has(i.outcome)).length
    engagement = Math.round((pos / signaled.length) * 100)
  } else if (ints.length === 0) {
    engagement = 0
  }

  // Pipeline — distinct deals.
  const dealIds = new Set(dls.map(d => d.id).filter(Boolean))
  const pipeline = curve(dealIds.size, PIPELINE_CURVE)

  // Weighted sum.
  const score = Math.round(
    recency    * 0.40 +
    frequency  * 0.30 +
    engagement * 0.15 +
    pipeline   * 0.15
  )

  // Reasoning bullets so the UI can show "why" on hover.
  const reasons = []
  if (lastTouchTs > 0) {
    if (daysSince <= 7)        reasons.push(`Talked ${daysSince === 0 ? 'today' : daysSince === 1 ? 'yesterday' : daysSince + ' days ago'}`)
    else if (daysSince <= 30)  reasons.push(`Last interaction ${daysSince} days ago — still fresh`)
    else if (daysSince <= 90)  reasons.push(`Last interaction ${daysSince} days ago — drifting`)
    else                       reasons.push(`Last interaction ${daysSince}+ days ago — gone cold`)
  }
  if (recentCount > 0)         reasons.push(`${recentCount} interaction${recentCount === 1 ? '' : 's'} in the last 90 days`)
  if (dealIds.size > 0)        reasons.push(`${dealIds.size} live deal${dealIds.size === 1 ? '' : 's'} as contact`)
  if (signaled.length > 0) {
    const pos = signaled.filter(i => POSITIVE_OUTCOMES.has(i.outcome)).length
    const neg = signaled.length - pos
    if (pos > neg) reasons.push(`${pos} of ${signaled.length} outcomes positive`)
    else if (neg > pos) reasons.push(`${neg} of ${signaled.length} outcomes negative`)
  }

  return {
    score,
    warmth: bucketFor(score),
    components: { recency, frequency, engagement, pipeline },
    reasons
  }
}

// Compute scores for ALL people in a single pass.
//   people       — array of person rows for this org
//   interactions — array of every interaction for this org
//   deals        — array of every deal for this org
// Returns Map<personId, RelationshipScore>.
export function scoreAllPeople(people, interactions, deals) {
  // Pre-group interactions + deals by lowercased name (and email if
  // present) so we don't re-filter the full array per person.
  const byName  = new Map()   // 'rohan' -> [interactions]
  const byEmail = new Map()
  for (const i of (interactions || [])) {
    const n = (i.counterparty_name || '').toLowerCase().trim()
    if (n) push(byName, n, i)
    const e = (i.counterparty_email || '').toLowerCase().trim()
    if (e) push(byEmail, e, i)
  }
  const dealsByCounterparty = new Map()
  for (const d of (deals || [])) {
    const n = (d.counterparty_name || d.client_name || '').toLowerCase().trim()
    if (n) push(dealsByCounterparty, n, d)
  }

  const out = new Map()
  for (const p of (people || [])) {
    const name  = (p.full_name || '').toLowerCase().trim()
    const email = (p.email || '').toLowerCase().trim()
    const ints  = uniqueById([
      ...(byName.get(name) || []),
      ...(byEmail.get(email) || [])
    ])
    const dls = uniqueById(dealsByCounterparty.get(name) || [])
    out.set(p.id, scorePerson(p, ints, dls))
  }
  return out
}

// ============ INTERNAL HELPERS ============

function push(map, key, val) {
  const arr = map.get(key) || []
  arr.push(val)
  map.set(key, arr)
}

function uniqueById(arr) {
  const seen = new Set()
  const out = []
  for (const item of arr) {
    if (!item?.id) continue
    if (seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

// Linear interpolation between anchor points. Anchors must be sorted by
// the keyed property ascending. `clampHigh = true` clamps to the highest
// anchor's score when input exceeds the last anchor's key.
function interpolate(val, anchors, clampHigh = false) {
  if (val <= anchors[0].d) return anchors[0].s
  if (val >= anchors[anchors.length - 1].d) {
    return clampHigh ? anchors[anchors.length - 1].s : 0
  }
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i], b = anchors[i + 1]
    if (val >= a.d && val <= b.d) {
      const t = (val - a.d) / (b.d - a.d)
      return Math.round(a.s + t * (b.s - a.s))
    }
  }
  return 0
}

// Like interpolate but for the count-curve shape.
function curve(val, anchors) {
  if (val <= 0) return anchors[0].s
  if (val >= anchors[anchors.length - 1].count) return anchors[anchors.length - 1].s
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i], b = anchors[i + 1]
    if (val >= a.count && val <= b.count) {
      const t = (val - a.count) / (b.count - a.count)
      return Math.round(a.s + t * (b.s - a.s))
    }
  }
  return 0
}

function bucketFor(score) {
  for (const b of WARMTH_BUCKETS) {
    if (score >= b.min) return b
  }
  return WARMTH_BUCKETS[WARMTH_BUCKETS.length - 1]
}

export { DORMANT as DORMANT_WARMTH }
