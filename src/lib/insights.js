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
