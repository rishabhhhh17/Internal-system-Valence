// Billing model — state + enforcement only. No payment processing, no PDF
// generation. Surfaces what each org owes, which seats are paused, and
// which need admin attention via callable functions any UI or test can
// invoke.
//
// Two layers:
//   1. PURE LOGIC (no Supabase, fully testable) — pricing math, allowance
//      checks, classification of an AI action attempt.
//   2. SUPABASE WRAPPERS (require an injectable client) — open/close
//      cycles, persist seats / actions / opt-ins / storage snapshots /
//      invoice lines. Every wrapper accepts the supabase client as the
//      first argument so tests can pass a mock.
//
// Resolved status objects are plain JSON. Callers route UI from the
// `kind` field, not by string-parsing messages.

// ============ CONSTANTS ============
export const PLANS = Object.freeze({
  BYO_KEY:    'byo_key',
  WE_RUN_AI:  'we_run_ai',
  OWN_KEY:    'own_key'
})

export const VALID_PLANS = Object.freeze(['byo_key', 'we_run_ai', 'own_key'])

// Plans that bill the org for AI usage. byo_key + own_key never do.
export function planMetersAi(plan) {
  return plan === PLANS.WE_RUN_AI
}

// AI action decision codes (UI routes by these).
export const AI_DECISION = Object.freeze({
  ALLOWED_INCLUDED:          'allowed_included',
  ALLOWED_OVERAGE:           'allowed_overage',
  ALLOWED_PLAN_NOT_METERED:  'allowed_plan_not_metered',
  PAUSED_AWAITING_OPT_IN:    'paused_awaiting_opt_in'
})

export const INVOICE_LINE_KIND = Object.freeze({
  SEAT_FEE:                 'seat_fee',
  SEAT_VOLUME:              'seat_volume',
  MONTHLY_FLOOR_ADJUSTMENT: 'monthly_floor_adjustment',
  AI_OVERAGE:               'ai_overage',
  STORAGE_REVIEW:           'storage_review'
})

// ---------------------------------------------------------------------------
// PURE LOGIC
// ---------------------------------------------------------------------------

// Seat-fee subtotal at a flat-tier price.
//   seats ≤ threshold        → seats × base_seat_price_usd
//   seats > threshold        → seats × volume_seat_price_usd  (all-seats price)
//
// Returns { subtotal, unitPrice, tier } — `tier` is the price label used so
// the caller can record the right kind of invoice line.
export function computeSeatSubtotal(seatCount, config) {
  if (!config) throw new Error('billing config required')
  const n = Math.max(0, Number(seatCount) || 0)
  const threshold = Number(config.volume_threshold_seats)
  const base    = Number(config.base_seat_price_usd)
  const volume  = Number(config.volume_seat_price_usd)
  const useVolume = n > threshold
  const unitPrice = useVolume ? volume : base
  const subtotal = round2(n * unitPrice)
  return {
    seatCount: n,
    unitPrice,
    tier: useVolume ? 'volume' : 'base',
    subtotal
  }
}

// Apply the per-client monthly floor. Returns { total, floorApplied,
// floorTopUp } — floorTopUp is what the caller writes as the
// 'monthly_floor_adjustment' invoice line.
export function applyMonthlyFloor(seatSubtotal, monthlyFloorUsd) {
  const subtotal = round2(seatSubtotal)
  const floor    = round2(Number(monthlyFloorUsd) || 0)
  if (subtotal >= floor) return { total: subtotal, floorApplied: false, floorTopUp: 0 }
  return { total: floor, floorApplied: true, floorTopUp: round2(floor - subtotal) }
}

// Decide what to do with an AI action attempt — pure function over
// counters. The caller fetches state then asks this what to do.
//
// inputs:
//   plan                  — the org's plan
//   actionsUsedThisCycle  — count of ai_actions rows for this seat in cycle
//   allowance             — config.ai_actions_allowance_per_seat
//   overageOptedIn        — bool, is there an opt-in row for (seat, cycle)
//   overageRate           — config.ai_overage_rate_usd_per_action
//
// returns { decision, classification, allowanceUsed, allowanceLimit,
//          overageCount, overageRate }
export function classifyAiAttempt({
  plan,
  actionsUsedThisCycle,
  allowance,
  overageOptedIn,
  overageRate
} = {}) {
  // byo_key / own_key — we never meter or bill them for AI. Allowed
  // unconditionally; no row gets written by the caller in this mode.
  if (!planMetersAi(plan)) {
    return {
      decision: AI_DECISION.ALLOWED_PLAN_NOT_METERED,
      classification: null,
      allowanceUsed: 0,
      allowanceLimit: 0,
      overageCount: 0,
      overageRate: 0
    }
  }
  const used = Math.max(0, Number(actionsUsedThisCycle) || 0)
  const limit = Math.max(0, Number(allowance) || 0)

  if (used < limit) {
    return {
      decision: AI_DECISION.ALLOWED_INCLUDED,
      classification: 'included',
      allowanceUsed: used,
      allowanceLimit: limit,
      overageCount: 0,
      overageRate: Number(overageRate) || 0
    }
  }
  // At or beyond allowance — only continue if the seat has opted in.
  if (overageOptedIn) {
    return {
      decision: AI_DECISION.ALLOWED_OVERAGE,
      classification: 'overage',
      allowanceUsed: used,
      allowanceLimit: limit,
      overageCount: Math.max(0, used - limit),
      overageRate: Number(overageRate) || 0
    }
  }
  return {
    decision: AI_DECISION.PAUSED_AWAITING_OPT_IN,
    classification: null,
    allowanceUsed: used,
    allowanceLimit: limit,
    overageCount: 0,
    overageRate: Number(overageRate) || 0
  }
}

// Storage allowance check. Returns { overByBytes, requiresReview }.
// `requiresReview === true` means an admin should look — we never auto-bill.
export function classifyStorageUsage({
  totalBytes,
  seatCount,
  allowancePerSeatMb
}) {
  const used      = Math.max(0, Number(totalBytes) || 0)
  const seats     = Math.max(0, Number(seatCount) || 0)
  const allowance = Math.max(0, Number(allowancePerSeatMb) || 0) * seats * 1024 * 1024
  const overByBytes = Math.max(0, used - allowance)
  return {
    totalBytes: used,
    allowanceBytes: allowance,
    overByBytes,
    requiresReview: overByBytes > 0
  }
}

// Cycle window. Anchor day is the day-of-month (1..28). Returns
// { period_start, period_end } as ISO yyyy-MM-dd strings.
export function cycleWindow(anchorDay, fromDate = new Date()) {
  const d = new Date(fromDate.getFullYear(), fromDate.getMonth(), Math.max(1, Math.min(28, Number(anchorDay) || 1)))
  // If the anchored day is after the from-date, this cycle started LAST month
  if (d > fromDate) d.setMonth(d.getMonth() - 1)
  const end = new Date(d); end.setMonth(end.getMonth() + 1); end.setDate(end.getDate() - 1)
  return {
    period_start: toIsoDate(d),
    period_end:   toIsoDate(end)
  }
}

// Next cycle's period_start — what we set seats.billable_from to when a
// seat is added mid-cycle (so it doesn't bill until next cycle).
export function nextCycleStart(anchorDay, fromDate = new Date()) {
  const w = cycleWindow(anchorDay, fromDate)
  const next = parseIsoDate(w.period_start)
  next.setMonth(next.getMonth() + 1)
  return toIsoDate(next)
}

// Build the invoice line items for a cycle from its snapshot + AI overage
// tally. Pure — caller persists. Returns an array of
// { kind, description, quantity, unit_price_usd, amount_usd, metadata }.
export function buildInvoiceLines({
  seatCount,
  base_seat_price_usd,
  volume_seat_price_usd,
  volume_threshold_seats,
  monthly_floor_usd,
  overageActions,
  ai_overage_rate_usd_per_action
}) {
  const lines = []
  const seats = computeSeatSubtotal(seatCount, {
    base_seat_price_usd,
    volume_seat_price_usd,
    volume_threshold_seats
  })
  // One seat line at the tier price.
  if (seats.seatCount > 0) {
    const kind = seats.tier === 'volume' ? INVOICE_LINE_KIND.SEAT_VOLUME : INVOICE_LINE_KIND.SEAT_FEE
    lines.push({
      kind,
      description: `Seats × ${seats.seatCount} @ $${seats.unitPrice} (${seats.tier} tier)`,
      quantity: seats.seatCount,
      unit_price_usd: seats.unitPrice,
      amount_usd: seats.subtotal,
      metadata: { tier: seats.tier }
    })
  }
  // Floor top-up if needed.
  const floored = applyMonthlyFloor(seats.subtotal, monthly_floor_usd)
  if (floored.floorApplied) {
    lines.push({
      kind: INVOICE_LINE_KIND.MONTHLY_FLOOR_ADJUSTMENT,
      description: `Monthly floor adjustment (floor $${Number(monthly_floor_usd).toFixed(2)})`,
      quantity: 1,
      unit_price_usd: floored.floorTopUp,
      amount_usd: floored.floorTopUp,
      metadata: { floor_usd: Number(monthly_floor_usd), seat_subtotal_usd: seats.subtotal }
    })
  }
  // AI overage — single rollup line per cycle.
  const overageQty = Math.max(0, Number(overageActions) || 0)
  if (overageQty > 0) {
    const rate = Number(ai_overage_rate_usd_per_action) || 0
    lines.push({
      kind: INVOICE_LINE_KIND.AI_OVERAGE,
      description: `AI overage: ${overageQty} actions × $${rate}/action`,
      quantity: overageQty,
      unit_price_usd: rate,
      amount_usd: round2(overageQty * rate),
      metadata: { rate, actions: overageQty }
    })
  }
  return lines
}

export function sumInvoice(lines) {
  return round2((lines || []).reduce((s, l) => s + (Number(l.amount_usd) || 0), 0))
}

// ---------------------------------------------------------------------------
// SUPABASE WRAPPERS
// ---------------------------------------------------------------------------

// Resolve effective config for an org: org override row if present, else
// the global default (org_id IS NULL). Throws on no result so misconfig
// surfaces loudly rather than silently using zeros.
export async function loadEffectiveConfig(supabase, orgId) {
  if (!orgId) throw new Error('orgId required')
  const { data, error } = await supabase
    .from('billing_config')
    .select('*')
    .or(`org_id.eq.${orgId},org_id.is.null`)
    .order('org_id', { nullsFirst: false })
    .limit(2)
  if (error) throw error
  const rows = data || []
  const override = rows.find(r => r.org_id === orgId)
  const def      = rows.find(r => r.org_id === null)
  const cfg = override || def
  if (!cfg) throw new Error('No billing_config — seed the global default row')
  return cfg
}

// Open the next monthly cycle for an org. Snapshots plan + every pricing
// knob + the seat count at start. Idempotent on (org_id, period_start).
export async function openCycle(supabase, orgId, asOf = new Date()) {
  const { data: org, error: orgErr } = await supabase
    .from('orgs')
    .select('*')
    .eq('id', orgId)
    .single()
  if (orgErr || !org) throw new Error(orgErr?.message || 'Org not found')

  const cfg    = await loadEffectiveConfig(supabase, orgId)
  const window = cycleWindow(org.cycle_anchor_day, asOf)

  // Count billable seats as-of period_start
  const { count: billableSeats } = await supabase
    .from('seats')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('active', true)
    .lte('billable_from', window.period_start)

  const seats = computeSeatSubtotal(billableSeats || 0, cfg)
  const floored = applyMonthlyFloor(seats.subtotal, cfg.monthly_floor_usd)

  const cyclePayload = {
    org_id: orgId,
    period_start: window.period_start,
    period_end:   window.period_end,
    plan_snapshot: org.plan,
    base_seat_price_usd: cfg.base_seat_price_usd,
    volume_seat_price_usd: cfg.volume_seat_price_usd,
    volume_threshold_seats: cfg.volume_threshold_seats,
    monthly_floor_usd: cfg.monthly_floor_usd,
    storage_allowance_per_seat_mb: cfg.storage_allowance_per_seat_mb,
    ai_actions_allowance_per_seat: cfg.ai_actions_allowance_per_seat,
    ai_overage_rate_usd_per_action: cfg.ai_overage_rate_usd_per_action,
    billable_seats_count: seats.seatCount,
    seat_subtotal_usd: seats.subtotal,
    floor_applied: floored.floorApplied,
    status: 'open'
  }

  // Upsert by unique (org_id, period_start). If it already exists, return
  // the existing row unchanged.
  const { data: existing } = await supabase
    .from('billing_cycles')
    .select('*')
    .eq('org_id', orgId)
    .eq('period_start', window.period_start)
    .maybeSingle()
  if (existing) return existing

  const { data: created, error } = await supabase
    .from('billing_cycles')
    .insert(cyclePayload)
    .select()
    .single()
  if (error) throw error

  // Pre-write the seat fee line item so an open cycle already has its
  // baseline. Overage rows accumulate as actions happen.
  const lines = buildInvoiceLines({
    seatCount: created.billable_seats_count,
    base_seat_price_usd: created.base_seat_price_usd,
    volume_seat_price_usd: created.volume_seat_price_usd,
    volume_threshold_seats: created.volume_threshold_seats,
    monthly_floor_usd: created.monthly_floor_usd,
    overageActions: 0,
    ai_overage_rate_usd_per_action: created.ai_overage_rate_usd_per_action
  })
  if (lines.length > 0) {
    await supabase.from('invoice_line_items').insert(
      lines.map(l => ({ org_id: orgId, cycle_id: created.id, ...l }))
    )
  }
  return created
}

export async function getOpenCycle(supabase, orgId) {
  const { data, error } = await supabase
    .from('billing_cycles')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'open')
    .order('period_start', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

// Real-time "what should this AI action do?" — the only entry point UI
// uses to gate an AI feature. Returns the same shape classifyAiAttempt
// returns, plus `cycle` and `seat` echoes so callers can pass them
// to recordAiAction.
export async function checkAiAction(supabase, { orgId, seatId }) {
  const cycle = await getOpenCycle(supabase, orgId)
  if (!cycle) throw new Error('No open billing cycle — call openCycle first')

  // Plan-gate before doing extra queries.
  if (!planMetersAi(cycle.plan_snapshot)) {
    return {
      ...classifyAiAttempt({ plan: cycle.plan_snapshot }),
      cycle, seatId
    }
  }

  const [usedCountRes, optInRes] = await Promise.all([
    supabase.from('ai_actions')
      .select('*', { count: 'exact', head: true })
      .eq('seat_id', seatId)
      .eq('cycle_id', cycle.id),
    supabase.from('ai_overage_opt_ins')
      .select('id', { head: true, count: 'exact' })
      .eq('seat_id', seatId)
      .eq('cycle_id', cycle.id)
  ])

  const result = classifyAiAttempt({
    plan: cycle.plan_snapshot,
    actionsUsedThisCycle: usedCountRes.count || 0,
    allowance: cycle.ai_actions_allowance_per_seat,
    overageOptedIn: (optInRes.count || 0) > 0,
    overageRate: cycle.ai_overage_rate_usd_per_action
  })
  return { ...result, cycle, seatId }
}

// Write an ai_actions row reflecting a successful call. Caller must have
// FIRST gone through checkAiAction and observed an "allowed_*" decision.
// Records the classification ('included' | 'overage') so the cycle close
// rolls up correctly. `tokensUsed`, `estimatedCostUsd`, `provider`, and
// `model` are optional — pass them when the caller knows the underlying
// LLM's response so admin can see, per customer, which provider's bill
// we're carrying.
export async function recordAiAction(supabase, {
  orgId, seatId, cycleId, actionType, classification,
  tokensUsed = null, estimatedCostUsd = null,
  provider = null, model = null
}) {
  if (classification !== 'included' && classification !== 'overage') {
    throw new Error('classification must be included|overage')
  }
  const { data, error } = await supabase
    .from('ai_actions')
    .insert({
      org_id: orgId,
      seat_id: seatId,
      cycle_id: cycleId,
      action_type: actionType || null,
      classification,
      tokens_used: tokensUsed,
      estimated_cost_usd: estimatedCostUsd,
      provider,
      model
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// ============ ADMIN CONSUMPTION ============
// Internal view of what every org is burning. Returns one row per org
// with: plan, seats, AI actions used (broken down by included / overage),
// tokens consumed, estimated cost we incurred, current cycle invoice
// total, storage usage + review flag.
//
// This is the "what do customers consume in tokens and money — on our
// end" surface. NOT customer-facing. UI gates access separately.
export async function getAdminConsumptionOverview(supabase) {
  const [orgsRes, cyclesRes, actionsRes, linesRes, storageRes, seatsRes] = await Promise.all([
    supabase.from('orgs').select('*'),
    supabase.from('billing_cycles').select('*').eq('status', 'open'),
    supabase.from('ai_actions').select('org_id, classification, tokens_used, estimated_cost_usd, provider, model'),
    supabase.from('invoice_line_items').select('*'),
    supabase.from('storage_usage')
      .select('org_id, total_bytes, review_flagged, review_resolved_at, measured_at')
      .order('measured_at', { ascending: false }),
    supabase.from('seats').select('org_id, active')
  ])
  if (orgsRes.error) throw orgsRes.error

  const orgs = orgsRes.data || []
  const cyclesByOrg = indexBy(cyclesRes.data || [], 'org_id')
  const seatsByOrg  = countWhere(seatsRes.data || [], 'org_id', r => r.active)

  // Roll up AI rows per org. We also bucket per (provider, model) so
  // admin can see, e.g. "this customer is on 80% Anthropic / 20% Gemini
  // this cycle."
  const aiByOrg = new Map()
  for (const a of (actionsRes.data || [])) {
    const row = aiByOrg.get(a.org_id) || {
      includedCount: 0,
      overageCount:  0,
      tokensTotal:   0,
      costTotal:     0,
      providers:     new Map()    // key "<provider>|<model>" → { count, tokens, cost }
    }
    if (a.classification === 'included') row.includedCount += 1
    if (a.classification === 'overage')  row.overageCount  += 1
    row.tokensTotal += Number(a.tokens_used)        || 0
    row.costTotal   += Number(a.estimated_cost_usd) || 0
    const providerKey = `${a.provider || 'unknown'}|${a.model || 'unknown'}`
    const bucket = row.providers.get(providerKey) || { provider: a.provider || null, model: a.model || null, count: 0, tokens: 0, cost: 0 }
    bucket.count  += 1
    bucket.tokens += Number(a.tokens_used)        || 0
    bucket.cost   += Number(a.estimated_cost_usd) || 0
    row.providers.set(providerKey, bucket)
    aiByOrg.set(a.org_id, row)
  }

  // Latest storage snapshot per org + open review flag
  const storageByOrg = new Map()
  for (const s of (storageRes.data || [])) {
    if (!storageByOrg.has(s.org_id)) {
      storageByOrg.set(s.org_id, {
        bytes:        s.total_bytes || 0,
        flagged:      Boolean(s.review_flagged && !s.review_resolved_at),
        measured_at:  s.measured_at
      })
    }
  }

  // Cycle invoice total per cycle_id → roll up to org via the open cycle
  const invoiceByCycle = new Map()
  for (const l of (linesRes.data || [])) {
    const cur = invoiceByCycle.get(l.cycle_id) || 0
    invoiceByCycle.set(l.cycle_id, cur + (Number(l.amount_usd) || 0))
  }

  return orgs.map(org => {
    const cycle = cyclesByOrg.get(org.id) || null
    const ai    = aiByOrg.get(org.id) || { includedCount: 0, overageCount: 0, tokensTotal: 0, costTotal: 0, providers: new Map() }
    const storage = storageByOrg.get(org.id) || { bytes: 0, flagged: false, measured_at: null }
    const cycleInvoice = cycle ? round2(invoiceByCycle.get(cycle.id) || 0) : 0
    const seatCount = seatsByOrg.get(org.id) || 0
    const allowanceLimit = cycle ? Number(cycle.ai_actions_allowance_per_seat) * seatCount : 0
    return {
      orgId:               org.id,
      orgName:             org.name,
      plan:                org.plan,
      seatCount,
      // AI
      aiActionsIncluded:   ai.includedCount,
      aiActionsOverage:    ai.overageCount,
      aiActionsTotal:      ai.includedCount + ai.overageCount,
      aiAllowanceTotal:    allowanceLimit,                          // sum across all seats
      aiTokensUsed:        ai.tokensTotal,
      aiEstimatedCostUsd:  round2(ai.costTotal),                    // what we paid the provider
      // Per-(provider,model) breakdown so admin can see which LLM bill
      // this customer is generating. Sorted by cost desc; biggest hit first.
      aiProviderMix:       Array.from(ai.providers.values())
                             .map(b => ({ ...b, cost: round2(b.cost) }))
                             .sort((a, b) => b.cost - a.cost || b.count - a.count),
      // Money customer owes for THIS cycle (snapshot)
      cycleInvoiceUsd:     cycleInvoice,
      cycleId:             cycle?.id || null,
      cyclePeriodStart:    cycle?.period_start || null,
      cyclePeriodEnd:      cycle?.period_end || null,
      cycleFloorApplied:   cycle?.floor_applied || false,
      // Storage
      storageBytes:        storage.bytes,
      storageReviewFlagged:storage.flagged,
      storageMeasuredAt:   storage.measured_at
    }
  })
}

// Detail view for one org — current cycle invoice lines + recent AI calls.
export async function getOrgConsumptionDetail(supabase, orgId) {
  const cycle = await getOpenCycle(supabase, orgId)
  if (!cycle) return { cycle: null, lines: [], recentActions: [] }
  const [linesRes, actionsRes] = await Promise.all([
    supabase.from('invoice_line_items')
      .select('*')
      .eq('cycle_id', cycle.id)
      .order('created_at', { ascending: true }),
    supabase.from('ai_actions')
      .select('*')
      .eq('cycle_id', cycle.id)
      .order('occurred_at', { ascending: false })
      .limit(50)
  ])
  return {
    cycle,
    lines: linesRes.data || [],
    recentActions: actionsRes.data || [],
    invoiceTotalUsd: sumInvoice(linesRes.data || [])
  }
}

// Persist the opt-in to the overage rate for the CURRENT cycle.
// Unique-(seat, cycle) means it's safe to call this more than once.
export async function optInToAiOverage(supabase, { orgId, seatId, cycleId, optedInBy }) {
  const { data, error } = await supabase
    .from('ai_overage_opt_ins')
    .upsert(
      { org_id: orgId, seat_id: seatId, cycle_id: cycleId, opted_in_by: optedInBy || null },
      { onConflict: 'seat_id,cycle_id' }
    )
    .select()
    .single()
  if (error) throw error
  return data
}

// Add a seat. Mid-cycle = billable from the NEXT cycle (no proration).
export async function addSeat(supabase, { orgId, email, userId }) {
  const { data: org, error: orgErr } = await supabase
    .from('orgs')
    .select('cycle_anchor_day')
    .eq('id', orgId)
    .single()
  if (orgErr) throw orgErr
  const window = cycleWindow(org.cycle_anchor_day)
  const today  = toIsoDate(new Date())
  // If today is the cycle start, this seat IS billable this cycle.
  // Otherwise, push to next cycle.
  const billable_from = today === window.period_start
    ? window.period_start
    : nextCycleStart(org.cycle_anchor_day)
  const { data, error } = await supabase
    .from('seats')
    .insert({ org_id: orgId, email: email || null, user_id: userId || null, billable_from })
    .select()
    .single()
  if (error) throw error
  return data
}

// Snapshot storage usage. Caller computes total_bytes (e.g. by summing
// kb_files.size_bytes for the org). We flag for review when over allowance.
export async function recordStorageUsage(supabase, { orgId, totalBytes, cycleId = null }) {
  const cfg = await loadEffectiveConfig(supabase, orgId)
  const { count: seatCount } = await supabase
    .from('seats')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('active', true)
  const verdict = classifyStorageUsage({
    totalBytes,
    seatCount: seatCount || 0,
    allowancePerSeatMb: cfg.storage_allowance_per_seat_mb
  })
  const { data, error } = await supabase
    .from('storage_usage')
    .insert({
      org_id: orgId,
      cycle_id: cycleId,
      total_bytes: verdict.totalBytes,
      review_flagged: verdict.requiresReview
    })
    .select()
    .single()
  if (error) throw error
  return { row: data, verdict }
}

// Admin-only: list orgs with open (review_flagged && unresolved) rows.
export async function listOrgsNeedingStorageReview(supabase) {
  const { data, error } = await supabase
    .from('storage_usage')
    .select('org_id, total_bytes, measured_at, orgs(name)')
    .eq('review_flagged', true)
    .is('review_resolved_at', null)
    .order('measured_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function resolveStorageReview(supabase, { storageUsageId, note }) {
  const { data, error } = await supabase
    .from('storage_usage')
    .update({ review_resolved_at: new Date().toISOString(), review_note: note || null })
    .eq('id', storageUsageId)
    .select()
    .single()
  if (error) throw error
  return data
}

// Close a cycle — finalize the overage rollup line and mark closed.
export async function closeCycle(supabase, cycleId) {
  const { data: cycle, error: cErr } = await supabase
    .from('billing_cycles')
    .select('*')
    .eq('id', cycleId)
    .single()
  if (cErr || !cycle) throw new Error(cErr?.message || 'Cycle not found')
  if (cycle.status === 'closed') return cycle

  // Count overage actions for the cycle (sum across all seats).
  const { count: overageCount } = await supabase
    .from('ai_actions')
    .select('*', { count: 'exact', head: true })
    .eq('cycle_id', cycleId)
    .eq('classification', 'overage')

  if ((overageCount || 0) > 0) {
    const rate = Number(cycle.ai_overage_rate_usd_per_action) || 0
    await supabase.from('invoice_line_items').insert({
      org_id: cycle.org_id,
      cycle_id: cycleId,
      kind: INVOICE_LINE_KIND.AI_OVERAGE,
      description: `AI overage: ${overageCount} actions × $${rate}/action`,
      quantity: overageCount,
      unit_price_usd: rate,
      amount_usd: round2((overageCount || 0) * rate),
      metadata: { rate, actions: overageCount }
    })
  }

  const { data, error } = await supabase
    .from('billing_cycles')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('id', cycleId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getInvoiceForCycle(supabase, cycleId) {
  const { data, error } = await supabase
    .from('invoice_line_items')
    .select('*')
    .eq('cycle_id', cycleId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return { lines: data || [], total_usd: sumInvoice(data || []) }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

function toIsoDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseIsoDate(s) {
  const [y, m, d] = String(s).split('-').map(Number)
  return new Date(y, m - 1, d)
}

function indexBy(rows, key) {
  const m = new Map()
  for (const r of rows) m.set(r[key], r)
  return m
}

function countWhere(rows, key, pred) {
  const m = new Map()
  for (const r of rows) {
    if (!pred(r)) continue
    m.set(r[key], (m.get(r[key]) || 0) + 1)
  }
  return m
}
