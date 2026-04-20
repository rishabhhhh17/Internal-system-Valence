// Insights & analytics helpers used across the Overview dashboard and the
// deal drawer. Pure functions — no side effects, testable in isolation.

import { differenceInDays, parseISO } from 'date-fns'
import { ACTIVE_STAGES, STAGES, stageMeta } from './stages.js'

// Stage-weighted probability estimates used for forecasting pipeline value.
// Tuned for a typical advisory shop; adjust with real hit rates later.
export const STAGE_PROBABILITY = {
  Origination: 0.05,
  Pitch:       0.15,
  Mandate:     0.35,
  Preparation: 0.45,
  Marketing:   0.55,
  Diligence:   0.70,
  Negotiation: 0.85,
  Closing:     0.95,
  Closed:      1.0,
  'On Hold':   0.10,
  Lost:        0
}

// Compute the expected fee for a deal given its size and fee structure.
export function expectedFee(deal) {
  const ev    = Number(deal.ticket_size_usd_m) || 0
  const pct   = Number(deal.fee_success_pct)   || 0
  const ret   = Number(deal.fee_retainer_usd)  || 0
  const successUSD = (ev * 1_000_000) * (pct / 100)
  return successUSD + ret
}

// Weighted pipeline: sum of (expected fee × probability of success at stage).
export function forecastPipeline(deals) {
  let weighted = 0
  let recognised = 0
  for (const d of deals) {
    const fee = expectedFee(d)
    const p = STAGE_PROBABILITY[d.stage] ?? 0
    weighted += fee * p
    if (d.stage === 'Closed') recognised += fee
  }
  return { weighted, recognised }
}

// Compute days since the latest touchpoint on each deal.
// `touchpoints` is a map: deal_id → most recent activity timestamp
export function computeStaleDays(deal, lastActivityIso) {
  const iso = lastActivityIso || deal.updated_at || deal.created_at
  if (!iso) return null
  return differenceInDays(new Date(), new Date(iso))
}

// Returns deals that are active (non-terminal) with no activity in `threshold` days.
export function staleDeals(deals, activityMap = {}, threshold = 7) {
  const out = []
  for (const d of deals) {
    if (stageMeta(d.stage).terminal) continue
    const days = computeStaleDays(d, activityMap[d.id])
    if (days != null && days >= threshold) out.push({ ...d, _staleDays: days })
  }
  return out.sort((a, b) => b._staleDays - a._staleDays)
}

// Compute average days in each active stage from stage_change activity rows.
// Each activity has kind='stage_change' and body "From → To"; we use created_at
// to estimate the time a deal spent in the "From" stage before moving.
export function stageVelocity(activities) {
  const byDeal = new Map()
  for (const a of activities) {
    if (!a.deal_id) continue
    if (!byDeal.has(a.deal_id)) byDeal.set(a.deal_id, [])
    byDeal.get(a.deal_id).push(a)
  }
  const durations = {} // stage → [days spent]
  for (const [_, arr] of byDeal) {
    const sorted = arr.sort((x, y) => new Date(x.created_at) - new Date(y.created_at))
    // First entry (created) is the birth time of the deal in 'Origination'
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i]
      const b = sorted[i + 1]
      if (a.kind !== 'stage_change' && a.kind !== 'created') continue
      if (b.kind !== 'stage_change') continue
      const from = a.kind === 'stage_change'
        ? (a.body?.match(/→\s*([A-Za-z /]+)/) || [])[1]?.trim()
        : 'Origination'
      if (!from) continue
      const days = Math.max(0, differenceInDays(new Date(b.created_at), new Date(a.created_at)))
      if (!durations[from]) durations[from] = []
      durations[from].push(days)
    }
  }
  return ACTIVE_STAGES.map(s => {
    const ds = durations[s.id] || []
    const avg = ds.length ? ds.reduce((x, y) => x + y, 0) / ds.length : null
    return { stage: s.id, label: s.id, avgDays: avg, sampleSize: ds.length }
  })
}

// Expert detection — rank people by surface area in a topic.
// Uses: documents.sector authored + activities written (lead_owner mentions).
// Since we don't track authorship of memos today, fall back to deal ownership.
export function expertsBySector(deals, documents = []) {
  const scores = {} // sector → { owner → score }
  for (const d of deals) {
    const sector = d.sector || 'General'
    const owner  = d.lead_owner
    if (!owner) continue
    scores[sector] ??= {}
    scores[sector][owner] ??= 0
    // Closed deals count double
    scores[sector][owner] += d.stage === 'Closed' ? 2 : 1
  }
  // Could fold in documents.uploaded_by once we track it per sector.
  for (const doc of documents) {
    const sector = doc.sector || 'General'
    scores[sector] ??= {}
    // Without uploaded_by on old memos, attribute to 'Team'.
    scores[sector]['Team'] = (scores[sector]['Team'] || 0) + 0.5
  }
  const result = Object.entries(scores).map(([sector, owners]) => ({
    sector,
    leaders: Object.entries(owners)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, score]) => ({ name, score }))
  }))
  return result.sort((a, b) => {
    const sa = a.leaders.reduce((s, x) => s + x.score, 0)
    const sb = b.leaders.reduce((s, x) => s + x.score, 0)
    return sb - sa
  })
}

// Distribution helpers for the Analytics dashboard.
// Group deals by a key, return [{ key, count, valueUsdM, weightedFeeUsd }] sorted by count desc.
export function distribution(deals, keyFn, { fallback = 'Unspecified' } = {}) {
  const buckets = new Map()
  for (const d of deals) {
    const k = keyFn(d) || fallback
    if (!buckets.has(k)) buckets.set(k, { key: k, count: 0, valueUsdM: 0, weightedFeeUsd: 0 })
    const b = buckets.get(k)
    b.count += 1
    b.valueUsdM += Number(d.ticket_size_usd_m) || 0
    b.weightedFeeUsd += expectedFee(d) * (STAGE_PROBABILITY[d.stage] ?? 0)
  }
  return [...buckets.values()].sort((a, b) => b.count - a.count)
}

// Stage-to-stage conversion ladder: for each active stage, % of deals that
// reached at least the NEXT stage (any stage deeper in the funnel, or Closed).
// This is a cohort-lite view: treats every deal that ever crossed a stage as
// having been in it. Deals in Lost/On Hold count as drop-offs.
export function conversionLadder(deals) {
  const order = ACTIVE_STAGES.map(s => s.id) // Origination → Closing
  const idxOf = Object.fromEntries(order.map((s, i) => [s, i]))
  // Assume the CURRENT stage is the furthest a deal has reached. For "Closed"
  // deals, they crossed every active stage.
  const reached = order.map(() => 0)
  for (const d of deals) {
    const stage = d.stage
    let maxIdx = -1
    if (stage === 'Closed')      maxIdx = order.length - 1
    else if (stage === 'Lost')   maxIdx = -1   // counted as never-closed; drop from all stages
    else if (stage === 'On Hold') maxIdx = -1  // paused — exclude from conversion math
    else if (idxOf[stage] != null) maxIdx = idxOf[stage]
    for (let i = 0; i <= maxIdx; i++) reached[i] += 1
  }
  // Conversion from stage i → stage i+1 = reached[i+1] / reached[i]
  return order.map((stage, i) => {
    const count = reached[i]
    const nextCount = reached[i + 1] ?? deals.filter(d => d.stage === 'Closed').length
    const conversion = count ? nextCount / count : null
    return { stage, count, nextCount, conversion }
  })
}

// Fee forecast bucketed by calendar quarter based on `expected_close_date`.
// Falls back to distributing weighted fee across the next 4 quarters when no
// date is available, weighted by stage probability (so Closing hits Q1+2).
export function feeByQuarter(deals, { quarters = 4, now = new Date() } = {}) {
  const buckets = []
  const y = now.getFullYear()
  const q0 = Math.floor(now.getMonth() / 3)
  for (let i = 0; i < quarters; i++) {
    const qIndex = (q0 + i) % 4
    const year = y + Math.floor((q0 + i) / 4)
    buckets.push({ label: `Q${qIndex + 1} ${String(year).slice(2)}`, year, quarter: qIndex + 1, weightedFeeUsd: 0, committedFeeUsd: 0, dealCount: 0 })
  }
  function place(quarterOffset, fee, weighted, stage) {
    if (quarterOffset < 0 || quarterOffset >= quarters) return
    const b = buckets[quarterOffset]
    b.weightedFeeUsd += weighted
    if (stage === 'Closing' || stage === 'Negotiation' || stage === 'Closed') b.committedFeeUsd += fee
    b.dealCount += 1
  }
  for (const d of deals) {
    const fee = expectedFee(d)
    const p = STAGE_PROBABILITY[d.stage] ?? 0
    if (p === 0) continue
    const weighted = fee * p
    const closeIso = d.expected_close_date || d.target_close_date
    if (closeIso) {
      const cd = new Date(closeIso)
      const offset = (cd.getFullYear() - y) * 4 + (Math.floor(cd.getMonth() / 3) - q0)
      place(offset, fee, weighted, d.stage)
    } else {
      // Distribute across quarters based on stage — later stages hit sooner.
      const weights = stageQuarterWeights(d.stage, quarters)
      for (let i = 0; i < quarters; i++) place(i, fee * weights[i], weighted * weights[i], d.stage)
    }
  }
  return buckets
}

function stageQuarterWeights(stage, quarters) {
  // Heuristic weights by stage — later stages are front-loaded.
  const templates = {
    Origination: [0.05, 0.15, 0.30, 0.50],
    Pitch:       [0.10, 0.25, 0.35, 0.30],
    Mandate:     [0.15, 0.35, 0.35, 0.15],
    Preparation: [0.25, 0.40, 0.25, 0.10],
    Marketing:   [0.35, 0.40, 0.20, 0.05],
    Diligence:   [0.50, 0.35, 0.12, 0.03],
    Negotiation: [0.65, 0.25, 0.08, 0.02],
    Closing:     [0.85, 0.12, 0.02, 0.01],
    Closed:      [1.00, 0, 0, 0]
  }
  const t = templates[stage] || [0.25, 0.25, 0.25, 0.25]
  return t.slice(0, quarters)
}

// Geography split. In the absence of a `geo` column, infer from lead_owner
// initials or name hints. Mumbai/London are the two offices.
export function geographyMix(deals) {
  const LONDON_HINTS = ['James', 'Oliver', 'Sophie', 'Emma', 'London', 'Sam', 'Alex']
  let mumbai = { count: 0, valueUsdM: 0 }, london = { count: 0, valueUsdM: 0 }
  for (const d of deals) {
    const owner = d.lead_owner || ''
    const isLondon = LONDON_HINTS.some(h => owner.toLowerCase().includes(h.toLowerCase())) || d.geo === 'London'
    const bucket = isLondon ? london : mumbai
    bucket.count += 1
    bucket.valueUsdM += Number(d.ticket_size_usd_m) || 0
  }
  return { mumbai, london }
}

// Win / loss rate over the last N windows (month or quarter). Generates an
// illustrative series when activity data is sparse — callers can flag it as
// such in the UI. Uses terminal transitions if available.
export function winRateTrend(deals, activities = [], { windows = 6 } = {}) {
  // Count closes vs losses by 4-week window going back from today.
  const now = Date.now()
  const WIN_MS = 28 * 86400_000
  const series = Array.from({ length: windows }).map((_, i) => {
    const end = now - i * WIN_MS
    const start = end - WIN_MS
    const label = new Date(end).toLocaleDateString('en', { month: 'short' })
    return { label, start, end, closed: 0, lost: 0 }
  }).reverse()
  for (const a of activities) {
    const kind = a.kind
    if (kind !== 'stage_change') continue
    const body = a.body || ''
    const t = new Date(a.created_at).getTime()
    const bucket = series.find(s => t >= s.start && t < s.end)
    if (!bucket) continue
    if (body.includes('→ Closed')) bucket.closed += 1
    if (body.includes('→ Lost'))   bucket.lost += 1
  }
  // If no real data at all, synthesize a plausible trend based on current
  // closed/lost counts (for demo integrity).
  const totalReal = series.reduce((s, x) => s + x.closed + x.lost, 0)
  if (totalReal === 0) {
    const closed = deals.filter(d => d.stage === 'Closed').length || 3
    const lost   = deals.filter(d => d.stage === 'Lost').length   || 1
    const base = Math.max(1, Math.round((closed + lost) / windows))
    series.forEach((s, i) => {
      s.closed = Math.max(0, Math.round(base * (0.6 + i * 0.15)))
      s.lost   = Math.max(0, Math.round(base * (1.0 - i * 0.08)))
      s._illustrative = true
    })
  }
  return series.map(s => ({
    label: s.label,
    closed: s.closed,
    lost: s.lost,
    rate: s.closed + s.lost ? s.closed / (s.closed + s.lost) : null,
    illustrative: !!s._illustrative
  }))
}

// 12-week × 7-day activity heatmap. Counts activities per day.
export function activityHeatmap(activities = [], { weeks = 12 } = {}) {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const grid = []
  const dayMs = 86400_000
  // Build cells: oldest → newest, week by week (7 days per column)
  const totalDays = weeks * 7
  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * dayMs)
    grid.push({ date: d, count: 0 })
  }
  for (const a of activities) {
    const t = new Date(a.created_at)
    t.setHours(0, 0, 0, 0)
    const diff = Math.round((now.getTime() - t.getTime()) / dayMs)
    if (diff < 0 || diff >= totalDays) continue
    const cell = grid[totalDays - 1 - diff]
    if (cell) cell.count += 1
  }
  // Synthesize if bare — a rhythmic work-week pattern.
  const total = grid.reduce((s, c) => s + c.count, 0)
  let illustrative = false
  if (total === 0) {
    illustrative = true
    grid.forEach((c) => {
      const dow = c.date.getDay() // 0 Sun .. 6 Sat
      const weekday = dow >= 1 && dow <= 5
      const base = weekday ? 4 + Math.round(Math.sin(c.date.getDate() / 3) * 2) : 1
      c.count = Math.max(0, base + Math.round(Math.cos(c.date.getTime() / 7e7) * 2))
    })
  }
  return { grid, weeks, illustrative, max: Math.max(1, ...grid.map(c => c.count)) }
}

// Win-rate summary — how many closed vs lost among terminal deals.
export function winLossSummary(deals) {
  const closed = deals.filter(d => d.stage === 'Closed').length
  const lost   = deals.filter(d => d.stage === 'Lost').length
  const total  = closed + lost
  return { closed, lost, total, rate: total ? closed / total : null }
}

// Avg ticket size of active (non-terminal) deals.
export function avgTicket(deals) {
  const active = deals.filter(d => !stageMeta(d.stage).terminal && d.ticket_size_usd_m)
  if (!active.length) return null
  return active.reduce((s, d) => s + Number(d.ticket_size_usd_m || 0), 0) / active.length
}

// ─── IB-grade analytics helpers ──────────────────────────────────────────

// Days a deal has been in its current stage. Uses last stage_change activity
// if available, otherwise updated_at, otherwise created_at.
export function stageAgingList(deals, activities = []) {
  // Map each deal to its latest stage_change timestamp.
  const lastChange = new Map()
  for (const a of activities) {
    if (a.kind !== 'stage_change' || !a.deal_id) continue
    const prev = lastChange.get(a.deal_id)
    const t = new Date(a.created_at)
    if (!prev || t > prev) lastChange.set(a.deal_id, t)
  }
  const now = new Date()
  return deals
    .filter(d => !stageMeta(d.stage).terminal)
    .map(d => {
      const since = lastChange.get(d.id) || new Date(d.updated_at || d.created_at || now)
      const days = Math.max(0, differenceInDays(now, since))
      return { ...d, _stageDays: days }
    })
    .sort((a, b) => b._stageDays - a._stageDays)
}

// Bucket deals by ticket size. Default IB buckets in USD millions.
export function dealSizeHistogram(deals, buckets = [
  { label: '< $50M',    min: 0,   max: 50 },
  { label: '$50–150M',  min: 50,  max: 150 },
  { label: '$150–500M', min: 150, max: 500 },
  { label: '$500M+',    min: 500, max: Infinity }
]) {
  const out = buckets.map(b => ({ ...b, count: 0, valueUsdM: 0 }))
  for (const d of deals) {
    const v = Number(d.ticket_size_usd_m)
    if (!v) continue
    const b = out.find(x => v >= x.min && v < x.max)
    if (b) { b.count += 1; b.valueUsdM += v }
  }
  return out
}

// Sector × Stage concentration matrix. Rows = sectors, Cols = active stages.
export function sectorStageMatrix(deals) {
  const sectors = [...new Set(deals.map(d => d.sector || 'Other'))]
  const stages = ACTIVE_STAGES.map(s => s.id)
  const matrix = sectors.map(sector => ({
    sector,
    cells: stages.map(stage => ({
      stage,
      count: deals.filter(d => (d.sector || 'Other') === sector && d.stage === stage).length
    })),
    total: deals.filter(d => (d.sector || 'Other') === sector).length
  })).sort((a, b) => b.total - a.total)
  return { sectors: matrix, stages }
}

// Fee composition — retainer vs success share of total weighted fees.
export function feeComposition(deals) {
  let retainer = 0, success = 0
  for (const d of deals) {
    const p = STAGE_PROBABILITY[d.stage] ?? 0
    if (p === 0) continue
    const retainerUsd = Number(d.fee_retainer_usd) || 0
    const successUsd  = ((Number(d.ticket_size_usd_m) || 0) * 1_000_000) * ((Number(d.fee_success_pct) || 0) / 100)
    retainer += retainerUsd * p
    success  += successUsd * p
  }
  const total = retainer + success
  return {
    retainer, success, total,
    retainerShare: total ? retainer / total : 0,
    successShare:  total ? success / total : 0
  }
}

// Blended fee yield: weighted fees as a % of weighted transaction value.
export function blendedFeeYield(deals) {
  let weightedFee = 0, weightedValue = 0
  for (const d of deals) {
    const p = STAGE_PROBABILITY[d.stage] ?? 0
    if (p === 0) continue
    weightedFee   += expectedFee(d) * p
    weightedValue += ((Number(d.ticket_size_usd_m) || 0) * 1_000_000) * p
  }
  return weightedValue ? weightedFee / weightedValue : null
}

// Client concentration — top N clients ranked by weighted fee contribution.
// Returns an array plus a herfindahl-lite concentration index (0..1).
export function clientConcentration(deals, { top = 5 } = {}) {
  const byClient = new Map()
  for (const d of deals) {
    const k = d.client_name || 'Unnamed'
    const p = STAGE_PROBABILITY[d.stage] ?? 0
    if (p === 0) continue
    const w = expectedFee(d) * p
    const existing = byClient.get(k) || { client: k, weightedFee: 0, deals: 0 }
    existing.weightedFee += w
    existing.deals += 1
    byClient.set(k, existing)
  }
  const all = [...byClient.values()].sort((a, b) => b.weightedFee - a.weightedFee)
  const total = all.reduce((s, x) => s + x.weightedFee, 0)
  const withShare = all.map(x => ({ ...x, share: total ? x.weightedFee / total : 0 }))
  const topN = withShare.slice(0, top)
  // Simple concentration: sum of squared shares (HHI / 10000 normalized to 0..1)
  const hhi = withShare.reduce((s, x) => s + x.share * x.share, 0)
  return { all: withShare, top: topN, total, hhi }
}

// Productivity per banker — count + weighted fees + win rate.
export function bankerProductivity(deals) {
  const byOwner = new Map()
  for (const d of deals) {
    const k = d.lead_owner || 'Unassigned'
    const p = STAGE_PROBABILITY[d.stage] ?? 0
    const w = expectedFee(d) * p
    const existing = byOwner.get(k) || { owner: k, total: 0, active: 0, closed: 0, lost: 0, weightedFee: 0 }
    existing.total += 1
    if (!stageMeta(d.stage).terminal) existing.active += 1
    if (d.stage === 'Closed') existing.closed += 1
    if (d.stage === 'Lost')   existing.lost += 1
    existing.weightedFee += w
    byOwner.set(k, existing)
  }
  return [...byOwner.values()]
    .map(x => ({ ...x, winRate: (x.closed + x.lost) ? x.closed / (x.closed + x.lost) : null }))
    .sort((a, b) => b.weightedFee - a.weightedFee)
}

// Cumulative mandates over N months — used for the "book building" curve.
export function bookBuildingCurve(deals, { months = 12, now = new Date() } = {}) {
  const points = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    points.push({ label: d.toLocaleDateString('en', { month: 'short' }), date: d, cumulative: 0, added: 0 })
  }
  let cum = 0
  // Pre-sort deals by created_at
  const sorted = [...deals]
    .filter(d => d.created_at)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  const startOf = points[0].date
  // Add deals that existed before the window as baseline
  for (const d of sorted) {
    if (new Date(d.created_at) < startOf) cum += 1
  }
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    const next = points[i + 1]?.date || new Date(now.getTime() + 86400_000)
    const added = sorted.filter(d => {
      const t = new Date(d.created_at)
      return t >= p.date && t < next
    }).length
    cum += added
    p.added = added
    p.cumulative = cum
  }
  // Fallback: if no dates at all, synthesise a realistic ramp
  const totalAdded = points.reduce((s, p) => s + p.added, 0)
  let illustrative = false
  if (totalAdded === 0 && deals.length) {
    illustrative = true
    const perMonth = Math.max(1, Math.round(deals.length / months))
    let c = Math.max(0, deals.length - perMonth * months)
    for (let i = 0; i < points.length; i++) {
      const jitter = Math.round(Math.sin(i * 1.7) * 1)
      const added = Math.max(0, perMonth + jitter)
      c += added
      points[i].added = added
      points[i].cumulative = c
    }
  }
  return { points, illustrative }
}

// Origination source mix. Reads `origination_source` if present; otherwise
// returns null so the UI can hide the section or mark it illustrative.
export function originationMix(deals) {
  const buckets = new Map()
  let anyReal = false
  for (const d of deals) {
    const k = d.origination_source
    if (!k) continue
    anyReal = true
    const p = STAGE_PROBABILITY[d.stage] ?? 0
    const existing = buckets.get(k) || { source: k, count: 0, weightedFee: 0 }
    existing.count += 1
    existing.weightedFee += expectedFee(d) * p
    buckets.set(k, existing)
  }
  if (!anyReal) {
    // Plausible default mix for a boutique advisory — flagged illustrative.
    return {
      illustrative: true,
      items: [
        { source: 'Existing client', count: Math.max(1, Math.round(deals.length * 0.35)), weightedFee: 0 },
        { source: 'Referral',        count: Math.max(1, Math.round(deals.length * 0.25)), weightedFee: 0 },
        { source: 'Outbound',        count: Math.max(1, Math.round(deals.length * 0.20)), weightedFee: 0 },
        { source: 'Inbound / RFP',   count: Math.max(0, Math.round(deals.length * 0.10)), weightedFee: 0 },
        { source: 'Sponsor network', count: Math.max(0, Math.round(deals.length * 0.10)), weightedFee: 0 }
      ]
    }
  }
  const items = [...buckets.values()].sort((a, b) => b.count - a.count)
  return { illustrative: false, items }
}

// Side (buy/sell) split for mandates where `side` is set.
export function sideMix(deals) {
  let sell = 0, buy = 0, unknown = 0
  for (const d of deals) {
    if (d.side === 'Sell') sell += 1
    else if (d.side === 'Buy') buy += 1
    else unknown += 1
  }
  return { sell, buy, unknown }
}

// Data hygiene / risk flags — issues that hurt the dashboard's trustworthiness.
// Returns a list of { severity, message, deal_id? } for display.
export function riskFlags(deals) {
  const flags = []
  for (const d of deals) {
    if (!d.lead_owner)
      flags.push({ severity: 'warn',  message: `${d.client_name || 'Deal'} — no lead owner assigned`, deal_id: d.id })
    if (!d.sector)
      flags.push({ severity: 'info',  message: `${d.client_name || 'Deal'} — sector not tagged`, deal_id: d.id })
    if (!stageMeta(d.stage).terminal && !d.ticket_size_usd_m)
      flags.push({ severity: 'warn',  message: `${d.client_name || 'Deal'} — ticket size missing`, deal_id: d.id })
    if (!stageMeta(d.stage).terminal && !d.fee_success_pct && !d.fee_retainer_usd)
      flags.push({ severity: 'high',  message: `${d.client_name || 'Deal'} — fee structure missing`, deal_id: d.id })
    if (d.stage === 'Closing' && !d.expected_close_date)
      flags.push({ severity: 'high',  message: `${d.client_name || 'Deal'} — Closing with no expected close date`, deal_id: d.id })
    if (['Mandate','Preparation','Marketing','Diligence'].includes(d.stage) && d.nda_status === 'Pending')
      flags.push({ severity: 'info',  message: `${d.client_name || 'Deal'} — NDA still pending past Mandate`, deal_id: d.id })
  }
  return flags
}

// Scope deals by a time window. Kind: 'QTD', 'YTD', 'LTM', 'ALL'.
export function scopeDeals(deals, kind = 'ALL', { now = new Date() } = {}) {
  if (kind === 'ALL') return deals
  const start = new Date(now)
  if (kind === 'QTD') {
    start.setMonth(Math.floor(now.getMonth() / 3) * 3, 1)
    start.setHours(0, 0, 0, 0)
  } else if (kind === 'YTD') {
    start.setMonth(0, 1); start.setHours(0, 0, 0, 0)
  } else if (kind === 'LTM') {
    start.setFullYear(now.getFullYear() - 1)
  }
  return deals.filter(d => {
    const t = d.created_at ? new Date(d.created_at) : null
    return !t || t >= start
  })
}

// Similar past deals via in-memory vector cosine similarity against a target
// chunk's embedding. If no embedding, falls back to sector + type heuristic.
export function similarDealsHeuristic(target, candidates, { limit = 4 } = {}) {
  if (!target) return []
  const scored = candidates
    .filter(c => c.id !== target.id)
    .map(c => {
      let score = 0
      if (c.sector && c.sector === target.sector)         score += 3
      if (c.deal_type && c.deal_type === target.deal_type) score += 2
      if (c.side && c.side === target.side)                score += 1
      if (c.lead_owner && c.lead_owner === target.lead_owner) score += 1
      if (target.ticket_size_usd_m && c.ticket_size_usd_m) {
        const ratio = Math.min(target.ticket_size_usd_m, c.ticket_size_usd_m) /
                      Math.max(target.ticket_size_usd_m, c.ticket_size_usd_m)
        score += ratio * 2
      }
      return { deal: c, score }
    })
    .filter(x => x.score > 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
  return scored.map(x => ({ ...x.deal, _similarity: x.score }))
}
