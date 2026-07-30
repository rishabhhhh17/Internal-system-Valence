import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  PLANS,
  AI_DECISION,
  INVOICE_LINE_KIND,
  planMetersAi,
  computeSeatSubtotal,
  applyMonthlyFloor,
  classifyAiAttempt,
  classifyStorageUsage,
  cycleWindow,
  nextCycleStart,
  buildInvoiceLines,
  sumInvoice,
  // wrappers
  loadEffectiveConfig,
  openCycle,
  checkAiAction,
  recordAiAction,
  optInToAiOverage,
  addSeat,
  recordStorageUsage,
  closeCycle,
  getInvoiceForCycle,
  // admin aggregation
  getAdminConsumptionOverview,
  getOrgConsumptionDetail
} from '../lib/billing.js'

const CFG = Object.freeze({
  base_seat_price_usd: 80,
  volume_seat_price_usd: 60,
  volume_threshold_seats: 10,
  monthly_floor_usd: 200,
  storage_allowance_per_seat_mb: 5120,
  ai_actions_allowance_per_seat: 500,
  ai_overage_rate_usd_per_action: 0.02
})

// ============================================================================
// PURE LOGIC
// ============================================================================

describe('planMetersAi', () => {
  it('only we_run_ai meters AI', () => {
    expect(planMetersAi('we_run_ai')).toBe(true)
    expect(planMetersAi('byo_key')).toBe(false)
    expect(planMetersAi('own_key')).toBe(false)
    expect(planMetersAi(null)).toBe(false)
  })
})

describe('computeSeatSubtotal', () => {
  it('uses base price at or below threshold', () => {
    expect(computeSeatSubtotal(1, CFG).subtotal).toBe(80)
    expect(computeSeatSubtotal(5, CFG).subtotal).toBe(400)
    expect(computeSeatSubtotal(10, CFG).subtotal).toBe(800)   // exactly threshold
  })

  it('switches to volume price ONCE seats exceed threshold (flat-tier)', () => {
    const r = computeSeatSubtotal(11, CFG)
    expect(r.tier).toBe('volume')
    expect(r.unitPrice).toBe(60)
    expect(r.subtotal).toBe(660)
  })

  it('zero seats → zero subtotal', () => {
    expect(computeSeatSubtotal(0, CFG).subtotal).toBe(0)
  })

  it('coerces non-numeric / negative input safely', () => {
    expect(computeSeatSubtotal(-3, CFG).subtotal).toBe(0)
    expect(computeSeatSubtotal('abc', CFG).subtotal).toBe(0)
  })

  it('rounds to 2 decimals', () => {
    const cfg = { ...CFG, base_seat_price_usd: 33.333 }
    expect(computeSeatSubtotal(3, cfg).subtotal).toBe(100)   // 99.999 → 100
  })

  it('throws when config is missing', () => {
    expect(() => computeSeatSubtotal(5)).toThrow()
  })
})

describe('applyMonthlyFloor', () => {
  it('returns subtotal when above the floor', () => {
    expect(applyMonthlyFloor(400, 200)).toEqual({ total: 400, floorApplied: false, floorTopUp: 0 })
  })

  it('returns floor when below', () => {
    const r = applyMonthlyFloor(80, 200)
    expect(r.total).toBe(200)
    expect(r.floorApplied).toBe(true)
    expect(r.floorTopUp).toBe(120)
  })

  it('does not apply floor when equal', () => {
    expect(applyMonthlyFloor(200, 200)).toEqual({ total: 200, floorApplied: false, floorTopUp: 0 })
  })

  it('zero floor disables the floor', () => {
    expect(applyMonthlyFloor(50, 0)).toEqual({ total: 50, floorApplied: false, floorTopUp: 0 })
  })
})

describe('classifyAiAttempt', () => {
  const COMMON = { allowance: 500, overageRate: 0.02, overageOptedIn: false }

  it('byo_key plan is never metered — always allowed, never classified', () => {
    const r = classifyAiAttempt({ ...COMMON, plan: 'byo_key', actionsUsedThisCycle: 9999 })
    expect(r.decision).toBe(AI_DECISION.ALLOWED_PLAN_NOT_METERED)
    expect(r.classification).toBeNull()
  })

  it('own_key plan is never metered', () => {
    const r = classifyAiAttempt({ ...COMMON, plan: 'own_key', actionsUsedThisCycle: 9999 })
    expect(r.decision).toBe(AI_DECISION.ALLOWED_PLAN_NOT_METERED)
  })

  it('we_run_ai under allowance → included', () => {
    const r = classifyAiAttempt({ ...COMMON, plan: 'we_run_ai', actionsUsedThisCycle: 0 })
    expect(r.decision).toBe(AI_DECISION.ALLOWED_INCLUDED)
    expect(r.classification).toBe('included')
  })

  it('we_run_ai one short of allowance → still included (used < limit)', () => {
    const r = classifyAiAttempt({ ...COMMON, plan: 'we_run_ai', actionsUsedThisCycle: 499 })
    expect(r.decision).toBe(AI_DECISION.ALLOWED_INCLUDED)
  })

  it('we_run_ai AT allowance without opt-in → PAUSED', () => {
    const r = classifyAiAttempt({ ...COMMON, plan: 'we_run_ai', actionsUsedThisCycle: 500 })
    expect(r.decision).toBe(AI_DECISION.PAUSED_AWAITING_OPT_IN)
    expect(r.classification).toBeNull()
    expect(r.allowanceUsed).toBe(500)
    expect(r.allowanceLimit).toBe(500)
  })

  it('we_run_ai OVER allowance without opt-in → still PAUSED (never silent bill)', () => {
    const r = classifyAiAttempt({ ...COMMON, plan: 'we_run_ai', actionsUsedThisCycle: 600 })
    expect(r.decision).toBe(AI_DECISION.PAUSED_AWAITING_OPT_IN)
  })

  it('we_run_ai at allowance WITH opt-in → overage', () => {
    const r = classifyAiAttempt({ ...COMMON, plan: 'we_run_ai', actionsUsedThisCycle: 500, overageOptedIn: true })
    expect(r.decision).toBe(AI_DECISION.ALLOWED_OVERAGE)
    expect(r.classification).toBe('overage')
    expect(r.overageRate).toBe(0.02)
  })

  it('opt-in alone (under allowance) still routes through included tier', () => {
    const r = classifyAiAttempt({ ...COMMON, plan: 'we_run_ai', actionsUsedThisCycle: 10, overageOptedIn: true })
    expect(r.decision).toBe(AI_DECISION.ALLOWED_INCLUDED)
  })

  it('zero allowance → first action is already at/over → paused unless opted-in', () => {
    const r = classifyAiAttempt({ plan: 'we_run_ai', actionsUsedThisCycle: 0, allowance: 0, overageRate: 0.02 })
    expect(r.decision).toBe(AI_DECISION.PAUSED_AWAITING_OPT_IN)
  })
})

describe('classifyStorageUsage', () => {
  it('flags review when over allowance', () => {
    const r = classifyStorageUsage({ totalBytes: 12 * 1024 * 1024 * 1024, seatCount: 2, allowancePerSeatMb: 5120 })
    // 2 seats × 5 GB allowance = 10 GB, usage = 12 GB → over by 2 GB
    expect(r.requiresReview).toBe(true)
    expect(r.overByBytes).toBe(2 * 1024 * 1024 * 1024)
  })

  it('does not flag when under allowance', () => {
    const r = classifyStorageUsage({ totalBytes: 1024 * 1024, seatCount: 2, allowancePerSeatMb: 5120 })
    expect(r.requiresReview).toBe(false)
    expect(r.overByBytes).toBe(0)
  })

  it('zero seats → any usage flags', () => {
    const r = classifyStorageUsage({ totalBytes: 1, seatCount: 0, allowancePerSeatMb: 5120 })
    expect(r.requiresReview).toBe(true)
  })
})

describe('cycleWindow + nextCycleStart', () => {
  it('anchor on the 1st mid-month → cycle started this month', () => {
    const w = cycleWindow(1, new Date(2026, 4, 15)) // 15 May
    expect(w.period_start).toBe('2026-05-01')
    expect(w.period_end).toBe('2026-05-31')
  })

  it('anchor on the 15th, date is the 10th → cycle started LAST month on 15th', () => {
    const w = cycleWindow(15, new Date(2026, 4, 10)) // 10 May → 15 Apr cycle
    expect(w.period_start).toBe('2026-04-15')
    expect(w.period_end).toBe('2026-05-14')
  })

  it('anchor on the 1st, date is the 1st → today is the start', () => {
    const w = cycleWindow(1, new Date(2026, 4, 1))
    expect(w.period_start).toBe('2026-05-01')
  })

  it('nextCycleStart is one month later', () => {
    expect(nextCycleStart(1, new Date(2026, 4, 15))).toBe('2026-06-01')
    expect(nextCycleStart(15, new Date(2026, 4, 20))).toBe('2026-06-15')
  })

  it('clamps anchor day to 1..28 so February + 30-day months always work', () => {
    const w = cycleWindow(31, new Date(2026, 1, 10)) // requested 31, clamped to 28
    expect(w.period_start).toBe('2026-01-28')
  })
})

describe('buildInvoiceLines', () => {
  it('seats only, base tier, above floor → one seat_fee line', () => {
    const lines = buildInvoiceLines({ seatCount: 5, ...CFG, overageActions: 0 })
    expect(lines).toHaveLength(1)
    expect(lines[0].kind).toBe(INVOICE_LINE_KIND.SEAT_FEE)
    expect(lines[0].amount_usd).toBe(400)
  })

  it('seats above threshold → seat_volume line at volume price', () => {
    const lines = buildInvoiceLines({ seatCount: 12, ...CFG, overageActions: 0 })
    expect(lines[0].kind).toBe(INVOICE_LINE_KIND.SEAT_VOLUME)
    expect(lines[0].amount_usd).toBe(720)
  })

  it('seats subtotal below floor → adds monthly_floor_adjustment line', () => {
    const lines = buildInvoiceLines({ seatCount: 1, ...CFG, overageActions: 0 })
    // 1 × 80 = 80 → floor 200 → +120 adjustment
    expect(lines).toHaveLength(2)
    expect(lines[1].kind).toBe(INVOICE_LINE_KIND.MONTHLY_FLOOR_ADJUSTMENT)
    expect(lines[1].amount_usd).toBe(120)
    expect(sumInvoice(lines)).toBe(200)
  })

  it('AI overage rolls into one line', () => {
    const lines = buildInvoiceLines({ seatCount: 5, ...CFG, overageActions: 250 })
    const overage = lines.find(l => l.kind === INVOICE_LINE_KIND.AI_OVERAGE)
    expect(overage).toBeDefined()
    expect(overage.quantity).toBe(250)
    expect(overage.unit_price_usd).toBe(0.02)
    expect(overage.amount_usd).toBe(5)
  })

  it('zero seats + zero overage → empty', () => {
    const lines = buildInvoiceLines({ seatCount: 0, ...CFG, overageActions: 0 })
    // No seat line, but floor still applies if monthly_floor_usd > 0…
    // Floor only adjusts a non-zero subtotal upward; with 0 seats the
    // org isn't a billable customer yet. Spec says floor applies when
    // seats × price is BELOW the floor — that includes the zero case.
    expect(lines).toHaveLength(1)
    expect(lines[0].kind).toBe(INVOICE_LINE_KIND.MONTHLY_FLOOR_ADJUSTMENT)
    expect(lines[0].amount_usd).toBe(200)
  })

  it('sumInvoice totals every line', () => {
    const lines = buildInvoiceLines({ seatCount: 3, ...CFG, overageActions: 50 })
    // 3 × 80 = 240 (above floor 200) + 50 × 0.02 = 1 → 241
    expect(sumInvoice(lines)).toBe(241)
  })
})

// ============================================================================
// SUPABASE WRAPPERS — driven by a minimal mock so we don't need a live DB
// ============================================================================

function makeMockSupabase(initial = {}) {
  // Tiny in-memory Supabase shim. Mirrors the real client's chainable
  // builder for the methods our billing lib actually calls: from / select
  // (incl. {count,head}) / eq / neq / lte / is / or / order / limit /
  // single / maybeSingle / insert / update / upsert. Every chain is
  // thenable so `await chain` resolves to `{ data, error }` or `{ count,
  // error }` for head-count queries.
  const state = {
    orgs: initial.orgs || [],
    billing_config: initial.billing_config || [],
    seats: initial.seats || [],
    billing_cycles: initial.billing_cycles || [],
    ai_actions: initial.ai_actions || [],
    ai_overage_opt_ins: initial.ai_overage_opt_ins || [],
    storage_usage: initial.storage_usage || [],
    invoice_line_items: initial.invoice_line_items || []
  }

  function makeQuery(table) {
    const filters = []
    let mode = 'select'             // 'select' | 'select-head-count' | 'insert' | 'update' | 'upsert'
    let modePayload = null
    let order = null
    let limit = null
    let orFilter = null
    let terminalSingle = null       // null | 'single' | 'maybeSingle'

    function applyFilters(rows) {
      let out = rows
      for (const f of filters) out = out.filter(f)
      if (orFilter) out = out.filter(orFilter)
      if (order) {
        const { col, asc } = order
        out = [...out].sort((a, b) => {
          const av = a[col], bv = b[col]
          if (av === bv) return 0
          if (av == null) return asc ? -1 : 1
          if (bv == null) return asc ? 1 : -1
          return asc ? (av < bv ? -1 : 1) : (av > bv ? -1 : 1)
        })
      }
      if (limit != null) out = out.slice(0, limit)
      return out
    }

    function settle() {
      // SELECT
      if (mode === 'select-head-count') {
        return { count: applyFilters(state[table]).length, error: null }
      }
      if (mode === 'select') {
        const rows = applyFilters(state[table])
        if (terminalSingle === 'single') {
          if (rows.length !== 1) return { data: null, error: { message: 'expected single row' } }
          return { data: rows[0], error: null }
        }
        if (terminalSingle === 'maybeSingle') {
          return { data: rows[0] || null, error: null }
        }
        return { data: rows, error: null }
      }
      // INSERT
      if (mode === 'insert') {
        const list = Array.isArray(modePayload) ? modePayload : [modePayload]
        const inserted = list.map(p => ({ id: p.id || `${table}-${state[table].length + 1}`, ...p }))
        state[table].push(...inserted)
        if (terminalSingle === 'single') return { data: inserted[inserted.length - 1], error: null }
        return { data: inserted, error: null }
      }
      // UPDATE
      if (mode === 'update') {
        const matched = state[table].filter(r => filters.every(f => f(r)))
        matched.forEach(r => Object.assign(r, modePayload))
        if (terminalSingle === 'single') {
          if (matched.length === 0) return { data: null, error: { message: 'not found' } }
          return { data: matched[0], error: null }
        }
        return { data: matched, error: null }
      }
      // UPSERT
      if (mode === 'upsert') {
        const list = Array.isArray(modePayload.payload) ? modePayload.payload : [modePayload.payload]
        const onConflict = (modePayload.opts.onConflict || '').split(',').map(s => s.trim()).filter(Boolean)
        const inserted = []
        for (const p of list) {
          let target = null
          if (onConflict.length) target = state[table].find(r => onConflict.every(c => r[c] === p[c]))
          if (target) { Object.assign(target, p); inserted.push(target) }
          else {
            const row = { id: p.id || `${table}-${state[table].length + 1}`, ...p }
            state[table].push(row)
            inserted.push(row)
          }
        }
        if (terminalSingle === 'single') return { data: inserted[inserted.length - 1], error: null }
        return { data: inserted, error: null }
      }
      return { data: null, error: { message: 'unknown mode' } }
    }

    const builder = {
      select(_cols, opts) {
        // Don't overwrite a write mode that was set by insert/update/upsert
        // — in Supabase, `insert().select()` just asks for the returned
        // rows, it doesn't switch to a read.
        if (mode === 'insert' || mode === 'update' || mode === 'upsert') return builder
        if (opts && opts.count === 'exact' && opts.head === true) {
          mode = 'select-head-count'
        } else {
          mode = 'select'
        }
        return builder
      },
      eq(col, val) { filters.push(r => r[col] === val); return builder },
      neq(col, val) { filters.push(r => r[col] !== val); return builder },
      lte(col, val) { filters.push(r => r[col] <= val); return builder },
      is(col, val) {
        filters.push(r => (val === null ? r[col] === null || r[col] === undefined : r[col] === val))
        return builder
      },
      or(expr) {
        const parts = String(expr).split(',')
        orFilter = r => parts.some(p => {
          const [col, op, val] = p.split('.')
          if (op === 'eq') return String(r[col]) === val
          if (op === 'is' && val === 'null') return r[col] == null
          return false
        })
        return builder
      },
      order(col, opts = {}) { order = { col, asc: opts.ascending !== false }; return builder },
      limit(n) { limit = n; return builder },
      single() { terminalSingle = 'single'; return builder },
      maybeSingle() { terminalSingle = 'maybeSingle'; return builder },
      insert(payload) { mode = 'insert'; modePayload = payload; return builder },
      update(patch) { mode = 'update'; modePayload = patch; return builder },
      upsert(payload, opts = {}) { mode = 'upsert'; modePayload = { payload, opts }; return builder },
      // Thenable so `await builder` resolves the chain.
      then(resolve, reject) {
        try { resolve(settle()) }
        catch (e) { reject?.(e) }
      }
    }
    return builder
  }

  return {
    from(table) { return makeQuery(table) },
    _state: state
  }
}

beforeEach(() => {
  // Keep test stdout quiet on intentional errors
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('wrapper: loadEffectiveConfig', () => {
  it('returns global default when no org override', async () => {
    const sb = makeMockSupabase({
      billing_config: [
        { id: 'g', org_id: null, base_seat_price_usd: 80, volume_seat_price_usd: 60, volume_threshold_seats: 10, monthly_floor_usd: 200, storage_allowance_per_seat_mb: 5120, ai_actions_allowance_per_seat: 500, ai_overage_rate_usd_per_action: 0.02 }
      ]
    })
    const cfg = await loadEffectiveConfig(sb, 'o1')
    expect(cfg.id).toBe('g')
    expect(cfg.base_seat_price_usd).toBe(80)
  })

  it('prefers org override over global default', async () => {
    const sb = makeMockSupabase({
      billing_config: [
        { id: 'g', org_id: null, base_seat_price_usd: 80, volume_seat_price_usd: 60, volume_threshold_seats: 10, monthly_floor_usd: 200, storage_allowance_per_seat_mb: 5120, ai_actions_allowance_per_seat: 500, ai_overage_rate_usd_per_action: 0.02 },
        { id: 'o', org_id: 'o1', base_seat_price_usd: 100, volume_seat_price_usd: 75, volume_threshold_seats: 20, monthly_floor_usd: 500, storage_allowance_per_seat_mb: 5120, ai_actions_allowance_per_seat: 800, ai_overage_rate_usd_per_action: 0.03 }
      ]
    })
    const cfg = await loadEffectiveConfig(sb, 'o1')
    expect(cfg.id).toBe('o')
    expect(cfg.base_seat_price_usd).toBe(100)
    expect(cfg.monthly_floor_usd).toBe(500)
  })
})

describe('wrapper: openCycle + checkAiAction + recordAiAction', () => {
  function freshOrg(plan = 'we_run_ai') {
    return makeMockSupabase({
      orgs: [{ id: 'o1', name: 'Acme', plan, cycle_anchor_day: 1 }],
      billing_config: [
        { id: 'g', org_id: null, ...CFG }
      ],
      seats: [
        { id: 's1', org_id: 'o1', active: true, billable_from: '2020-01-01' },
        { id: 's2', org_id: 'o1', active: true, billable_from: '2020-01-01' }
      ]
    })
  }

  it('opens a cycle, snapshots seats × base price, applies floor', async () => {
    const sb = freshOrg()
    const cycle = await openCycle(sb, 'o1', new Date(2026, 4, 15))
    expect(cycle.billable_seats_count).toBe(2)
    expect(cycle.seat_subtotal_usd).toBe(160)        // 2 × 80
    expect(cycle.floor_applied).toBe(true)           // 160 < 200
    expect(cycle.plan_snapshot).toBe('we_run_ai')
    // Pre-wrote a seat_fee line + a floor adjustment line.
    const lines = sb._state.invoice_line_items.filter(l => l.cycle_id === cycle.id)
    expect(lines.some(l => l.kind === 'seat_fee')).toBe(true)
    expect(lines.some(l => l.kind === 'monthly_floor_adjustment')).toBe(true)
  })

  it('byo_key cycle: checkAiAction returns allowed_plan_not_metered', async () => {
    const sb = freshOrg('byo_key')
    await openCycle(sb, 'o1', new Date(2026, 4, 15))
    const r = await checkAiAction(sb, { orgId: 'o1', seatId: 's1' })
    expect(r.decision).toBe(AI_DECISION.ALLOWED_PLAN_NOT_METERED)
    expect(r.classification).toBeNull()
  })

  it('own_key cycle: same — never metered', async () => {
    const sb = freshOrg('own_key')
    await openCycle(sb, 'o1', new Date(2026, 4, 15))
    const r = await checkAiAction(sb, { orgId: 'o1', seatId: 's1' })
    expect(r.decision).toBe(AI_DECISION.ALLOWED_PLAN_NOT_METERED)
  })

  it('we_run_ai under allowance → included', async () => {
    const sb = freshOrg('we_run_ai')
    await openCycle(sb, 'o1', new Date(2026, 4, 15))
    const r = await checkAiAction(sb, { orgId: 'o1', seatId: 's1' })
    expect(r.decision).toBe(AI_DECISION.ALLOWED_INCLUDED)
    expect(r.classification).toBe('included')
  })

  it('we_run_ai at allowance, no opt-in → PAUSED', async () => {
    const sb = freshOrg('we_run_ai')
    const cycle = await openCycle(sb, 'o1', new Date(2026, 4, 15))
    // Pre-fill 500 included actions for seat s1
    for (let i = 0; i < 500; i++) {
      sb._state.ai_actions.push({
        id: `a-${i}`, org_id: 'o1', seat_id: 's1', cycle_id: cycle.id,
        classification: 'included', action_type: 'ask'
      })
    }
    const r = await checkAiAction(sb, { orgId: 'o1', seatId: 's1' })
    expect(r.decision).toBe(AI_DECISION.PAUSED_AWAITING_OPT_IN)
    expect(r.allowanceUsed).toBe(500)
    expect(r.allowanceLimit).toBe(500)
  })

  it('we_run_ai at allowance WITH opt-in → overage allowed', async () => {
    const sb = freshOrg('we_run_ai')
    const cycle = await openCycle(sb, 'o1', new Date(2026, 4, 15))
    for (let i = 0; i < 500; i++) {
      sb._state.ai_actions.push({ id: `a-${i}`, org_id: 'o1', seat_id: 's1', cycle_id: cycle.id, classification: 'included' })
    }
    await optInToAiOverage(sb, { orgId: 'o1', seatId: 's1', cycleId: cycle.id })
    const r = await checkAiAction(sb, { orgId: 'o1', seatId: 's1' })
    expect(r.decision).toBe(AI_DECISION.ALLOWED_OVERAGE)
    expect(r.classification).toBe('overage')
  })

  it('pause is per-seat — other seat in same org keeps included', async () => {
    const sb = freshOrg('we_run_ai')
    const cycle = await openCycle(sb, 'o1', new Date(2026, 4, 15))
    // Exhaust seat s1's allowance only
    for (let i = 0; i < 500; i++) {
      sb._state.ai_actions.push({ id: `a-${i}`, org_id: 'o1', seat_id: 's1', cycle_id: cycle.id, classification: 'included' })
    }
    const s1 = await checkAiAction(sb, { orgId: 'o1', seatId: 's1' })
    const s2 = await checkAiAction(sb, { orgId: 'o1', seatId: 's2' })
    expect(s1.decision).toBe(AI_DECISION.PAUSED_AWAITING_OPT_IN)
    expect(s2.decision).toBe(AI_DECISION.ALLOWED_INCLUDED)
  })

  it('recordAiAction rejects an invalid classification', async () => {
    const sb = freshOrg()
    const cycle = await openCycle(sb, 'o1', new Date(2026, 4, 15))
    await expect(
      recordAiAction(sb, { orgId: 'o1', seatId: 's1', cycleId: cycle.id, classification: 'bogus' })
    ).rejects.toThrow()
  })
})

describe('wrapper: addSeat — no mid-cycle proration', () => {
  it('seat added mid-cycle bills from NEXT cycle', async () => {
    const sb = makeMockSupabase({
      orgs: [{ id: 'o1', name: 'Acme', plan: 'we_run_ai', cycle_anchor_day: 1 }],
      billing_config: [{ id: 'g', org_id: null, ...CFG }]
    })
    // Simulate "today" is 15 May 2026 → cycle started 1 May, next starts 1 Jun
    const realDate = global.Date
    try {
      // Coerce new Date() with no args to a fixed instant
      const fixed = new realDate(2026, 4, 15)
      global.Date = class extends realDate {
        constructor(...args) { return args.length ? new realDate(...args) : fixed }
        static now() { return fixed.getTime() }
      }
      const seat = await addSeat(sb, { orgId: 'o1', email: 'late@x.com' })
      expect(seat.billable_from).toBe('2026-06-01')
    } finally {
      global.Date = realDate
    }
  })
})

describe('wrapper: closeCycle finalises overage line', () => {
  it('rolls up overage rows into one ai_overage line and marks cycle closed', async () => {
    const sb = makeMockSupabase({
      orgs: [{ id: 'o1', plan: 'we_run_ai', cycle_anchor_day: 1, name: 'A' }],
      billing_config: [{ id: 'g', org_id: null, ...CFG }],
      seats: [{ id: 's1', org_id: 'o1', active: true, billable_from: '2020-01-01' }]
    })
    const cycle = await openCycle(sb, 'o1', new Date(2026, 4, 15))
    // 7 overage actions across the cycle
    for (let i = 0; i < 7; i++) {
      sb._state.ai_actions.push({
        id: `o-${i}`, org_id: 'o1', seat_id: 's1', cycle_id: cycle.id, classification: 'overage'
      })
    }
    const closed = await closeCycle(sb, cycle.id)
    expect(closed.status).toBe('closed')
    const lines = sb._state.invoice_line_items.filter(l => l.cycle_id === cycle.id)
    const overage = lines.find(l => l.kind === 'ai_overage')
    expect(overage).toBeDefined()
    expect(overage.quantity).toBe(7)
    expect(overage.unit_price_usd).toBe(0.02)
    expect(overage.amount_usd).toBe(0.14)
  })

  it('no overage actions → no overage line written', async () => {
    const sb = makeMockSupabase({
      orgs: [{ id: 'o1', plan: 'we_run_ai', cycle_anchor_day: 1, name: 'A' }],
      billing_config: [{ id: 'g', org_id: null, ...CFG }],
      seats: [{ id: 's1', org_id: 'o1', active: true, billable_from: '2020-01-01' }]
    })
    const cycle = await openCycle(sb, 'o1', new Date(2026, 4, 15))
    const closed = await closeCycle(sb, cycle.id)
    expect(closed.status).toBe('closed')
    const lines = sb._state.invoice_line_items.filter(l => l.cycle_id === cycle.id && l.kind === 'ai_overage')
    expect(lines).toHaveLength(0)
  })

  it('closing an already-closed cycle is a no-op', async () => {
    const sb = makeMockSupabase({
      orgs: [{ id: 'o1', plan: 'we_run_ai', cycle_anchor_day: 1, name: 'A' }],
      billing_config: [{ id: 'g', org_id: null, ...CFG }],
      seats: [{ id: 's1', org_id: 'o1', active: true, billable_from: '2020-01-01' }]
    })
    const cycle = await openCycle(sb, 'o1', new Date(2026, 4, 15))
    await closeCycle(sb, cycle.id)
    const again = await closeCycle(sb, cycle.id)
    expect(again.status).toBe('closed')
  })
})

describe('wrapper: storage usage', () => {
  it('flags review when usage exceeds (seats × allowance)', async () => {
    const sb = makeMockSupabase({
      orgs: [{ id: 'o1', plan: 'we_run_ai', cycle_anchor_day: 1, name: 'A' }],
      billing_config: [{ id: 'g', org_id: null, ...CFG }],
      seats: [{ id: 's1', org_id: 'o1', active: true, billable_from: '2020-01-01' }]
    })
    // 1 seat × 5 GB allowance. Usage = 6 GB.
    const { row, verdict } = await recordStorageUsage(sb, { orgId: 'o1', totalBytes: 6 * 1024 * 1024 * 1024 })
    expect(verdict.requiresReview).toBe(true)
    expect(row.review_flagged).toBe(true)
  })

  it('under allowance → no flag', async () => {
    const sb = makeMockSupabase({
      orgs: [{ id: 'o1', plan: 'we_run_ai', cycle_anchor_day: 1, name: 'A' }],
      billing_config: [{ id: 'g', org_id: null, ...CFG }],
      seats: [
        { id: 's1', org_id: 'o1', active: true, billable_from: '2020-01-01' },
        { id: 's2', org_id: 'o1', active: true, billable_from: '2020-01-01' }
      ]
    })
    const { verdict } = await recordStorageUsage(sb, { orgId: 'o1', totalBytes: 1024 })
    expect(verdict.requiresReview).toBe(false)
  })
})

describe('admin: getAdminConsumptionOverview', () => {
  it('rolls up actions, tokens, cost, invoice, storage per org', async () => {
    const sb = makeMockSupabase({
      orgs: [
        { id: 'o1', name: 'Acme',    plan: 'we_run_ai', cycle_anchor_day: 1 },
        { id: 'o2', name: 'Beta',    plan: 'byo_key',   cycle_anchor_day: 1 },
        { id: 'o3', name: 'Charlie', plan: 'own_key',   cycle_anchor_day: 1 }
      ],
      billing_config: [{ id: 'g', org_id: null, ...CFG }],
      seats: [
        { id: 's1', org_id: 'o1', active: true,  billable_from: '2020-01-01' },
        { id: 's2', org_id: 'o1', active: true,  billable_from: '2020-01-01' },
        { id: 's3', org_id: 'o2', active: true,  billable_from: '2020-01-01' },
        { id: 's4', org_id: 'o3', active: false, billable_from: '2020-01-01' }  // inactive — skip
      ],
      billing_cycles: [
        { id: 'c1', org_id: 'o1', status: 'open', period_start: '2026-05-01', period_end: '2026-05-31',
          ai_actions_allowance_per_seat: 500, ai_overage_rate_usd_per_action: 0.02,
          base_seat_price_usd: 80, volume_seat_price_usd: 60, volume_threshold_seats: 10,
          monthly_floor_usd: 200, storage_allowance_per_seat_mb: 5120,
          billable_seats_count: 2, seat_subtotal_usd: 160, floor_applied: true,
          plan_snapshot: 'we_run_ai' }
      ],
      ai_actions: [
        { id: 'a1', org_id: 'o1', seat_id: 's1', cycle_id: 'c1', classification: 'included', tokens_used: 1200, estimated_cost_usd: 0.018 },
        { id: 'a2', org_id: 'o1', seat_id: 's1', cycle_id: 'c1', classification: 'included', tokens_used: 800,  estimated_cost_usd: 0.012 },
        { id: 'a3', org_id: 'o1', seat_id: 's2', cycle_id: 'c1', classification: 'overage',  tokens_used: 500,  estimated_cost_usd: 0.008 }
      ],
      invoice_line_items: [
        { id: 'i1', org_id: 'o1', cycle_id: 'c1', kind: 'seat_fee', amount_usd: 160 },
        { id: 'i2', org_id: 'o1', cycle_id: 'c1', kind: 'monthly_floor_adjustment', amount_usd: 40 },
        { id: 'i3', org_id: 'o1', cycle_id: 'c1', kind: 'ai_overage', amount_usd: 0.02 }
      ],
      storage_usage: [
        { id: 'st1', org_id: 'o1', total_bytes: 8 * 1024 * 1024 * 1024, review_flagged: false, measured_at: '2026-05-15T10:00:00Z' }
      ]
    })

    const rows = await getAdminConsumptionOverview(sb)
    const o1 = rows.find(r => r.orgId === 'o1')
    const o2 = rows.find(r => r.orgId === 'o2')
    const o3 = rows.find(r => r.orgId === 'o3')

    expect(rows).toHaveLength(3)

    // o1: we_run_ai, 2 seats, 3 actions (2 incl + 1 overage), tokens 2500, our $ 0.038
    expect(o1.plan).toBe('we_run_ai')
    expect(o1.seatCount).toBe(2)
    expect(o1.aiActionsIncluded).toBe(2)
    expect(o1.aiActionsOverage).toBe(1)
    expect(o1.aiActionsTotal).toBe(3)
    expect(o1.aiAllowanceTotal).toBe(1000)   // 2 seats × 500
    expect(o1.aiTokensUsed).toBe(2500)
    expect(o1.aiEstimatedCostUsd).toBe(0.04) // 0.018 + 0.012 + 0.008 → rounded to cent
    expect(o1.cycleInvoiceUsd).toBe(200.02)
    expect(o1.cycleFloorApplied).toBe(true)
    expect(o1.storageReviewFlagged).toBe(false)

    // o2: byo_key, 1 active seat, no AI rows
    expect(o2.plan).toBe('byo_key')
    expect(o2.seatCount).toBe(1)
    expect(o2.aiActionsTotal).toBe(0)
    expect(o2.cycleInvoiceUsd).toBe(0)

    // o3: own_key, 1 inactive seat → seatCount 0
    expect(o3.plan).toBe('own_key')
    expect(o3.seatCount).toBe(0)
  })

  it('returns zeros gracefully when nothing has flowed yet', async () => {
    const sb = makeMockSupabase({
      orgs: [{ id: 'o1', name: 'Empty', plan: 'we_run_ai', cycle_anchor_day: 1 }],
      billing_config: [{ id: 'g', org_id: null, ...CFG }],
      seats: [], billing_cycles: [], ai_actions: [],
      invoice_line_items: [], storage_usage: []
    })
    const rows = await getAdminConsumptionOverview(sb)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      orgId: 'o1',
      seatCount: 0,
      aiActionsTotal: 0,
      aiTokensUsed: 0,
      aiEstimatedCostUsd: 0,
      cycleInvoiceUsd: 0,
      storageReviewFlagged: false
    })
  })

  it('flags storage review when latest snapshot is over allowance + unresolved', async () => {
    const sb = makeMockSupabase({
      orgs: [{ id: 'o1', name: 'Heavy', plan: 'we_run_ai', cycle_anchor_day: 1 }],
      billing_config: [{ id: 'g', org_id: null, ...CFG }],
      seats: [],
      storage_usage: [
        { id: 's1', org_id: 'o1', total_bytes: 99999, review_flagged: true, review_resolved_at: null, measured_at: '2026-05-15T10:00:00Z' }
      ]
    })
    const rows = await getAdminConsumptionOverview(sb)
    expect(rows[0].storageReviewFlagged).toBe(true)
  })
})

describe('recordAiAction: token + cost capture', () => {
  it('persists tokens_used and estimated_cost_usd', async () => {
    const sb = makeMockSupabase({
      orgs: [{ id: 'o1', plan: 'we_run_ai', cycle_anchor_day: 1, name: 'A' }],
      billing_config: [{ id: 'g', org_id: null, ...CFG }],
      seats: [{ id: 's1', org_id: 'o1', active: true, billable_from: '2020-01-01' }]
    })
    const cycle = await openCycle(sb, 'o1', new Date(2026, 4, 15))
    const row = await recordAiAction(sb, {
      orgId: 'o1', seatId: 's1', cycleId: cycle.id,
      classification: 'included', actionType: 'ask',
      tokensUsed: 1234, estimatedCostUsd: 0.0185
    })
    expect(row.tokens_used).toBe(1234)
    expect(row.estimated_cost_usd).toBe(0.0185)
  })

  it('defaults tokens + cost to null when not provided', async () => {
    const sb = makeMockSupabase({
      orgs: [{ id: 'o1', plan: 'we_run_ai', cycle_anchor_day: 1, name: 'A' }],
      billing_config: [{ id: 'g', org_id: null, ...CFG }],
      seats: [{ id: 's1', org_id: 'o1', active: true, billable_from: '2020-01-01' }]
    })
    const cycle = await openCycle(sb, 'o1', new Date(2026, 4, 15))
    const row = await recordAiAction(sb, {
      orgId: 'o1', seatId: 's1', cycleId: cycle.id,
      classification: 'included'
    })
    expect(row.tokens_used).toBeNull()
    expect(row.estimated_cost_usd).toBeNull()
  })

  it('persists customer_cost_usd + key_source for managed calls', async () => {
    const sb = makeMockSupabase({
      orgs: [{ id: 'o1', plan: 'we_run_ai', cycle_anchor_day: 1, name: 'A' }],
      billing_config: [{ id: 'g', org_id: null, ...CFG }],
      seats: [{ id: 's1', org_id: 'o1', active: true, billable_from: '2020-01-01' }]
    })
    const cycle = await openCycle(sb, 'o1', new Date(2026, 4, 15))
    const row = await recordAiAction(sb, {
      orgId: 'o1', seatId: 's1', cycleId: cycle.id,
      classification: 'included', actionType: 'deal_brief',
      tokensUsed: 2400, estimatedCostUsd: 0.0072,
      customerCostUsd: 0.0144, keySource: 'managed',
      provider: 'anthropic', model: 'claude-3-5-haiku-latest'
    })
    expect(row.customer_cost_usd).toBe(0.0144)
    expect(row.key_source).toBe('managed')
    expect(row.provider).toBe('anthropic')
    expect(row.model).toBe('claude-3-5-haiku-latest')
  })

  it('records key_source=byo with zero customer_cost — we do not double-bill', async () => {
    const sb = makeMockSupabase({
      orgs: [{ id: 'o1', plan: 'we_run_ai', cycle_anchor_day: 1, name: 'A' }],
      billing_config: [{ id: 'g', org_id: null, ...CFG }],
      seats: [{ id: 's1', org_id: 'o1', active: true, billable_from: '2020-01-01' }]
    })
    const cycle = await openCycle(sb, 'o1', new Date(2026, 4, 15))
    const row = await recordAiAction(sb, {
      orgId: 'o1', seatId: 's1', cycleId: cycle.id,
      classification: 'included', actionType: 'ask',
      tokensUsed: 1000, estimatedCostUsd: 0.0,
      customerCostUsd: 0, keySource: 'byo',
      provider: 'openai', model: 'gpt-4o-mini'
    })
    expect(row.customer_cost_usd).toBe(0)
    expect(row.key_source).toBe('byo')
  })
})
