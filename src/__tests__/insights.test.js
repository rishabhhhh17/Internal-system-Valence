import { describe, it, expect } from 'vitest'
import {
  expectedFee,
  forecastPipeline,
  STAGE_PROBABILITY,
  similarDealsHeuristic,
  staleDeals,
  stageVelocity
} from '../lib/insights.js'
import { STAGES } from '../lib/stages.js'

describe('insights', () => {
  describe('STAGE_PROBABILITY', () => {
    it('assigns monotonically non-decreasing probability across the active funnel', () => {
      const active = STAGES.filter(s => !s.terminal).map(s => s.id)
      let prev = 0
      for (const id of active) {
        const p = STAGE_PROBABILITY[id]
        expect(p).toBeGreaterThanOrEqual(prev)
        prev = p
      }
    })

    it('assigns 1.0 to Closed and 0 to Lost', () => {
      expect(STAGE_PROBABILITY.Closed).toBe(1)
      expect(STAGE_PROBABILITY.Lost).toBe(0)
    })
  })

  describe('expectedFee', () => {
    it('combines retainer and success fee', () => {
      const d = { ticket_size_usd_m: 100, fee_success_pct: 2, fee_retainer_usd: 50_000 }
      // 100M × 2% = 2M + 50k = 2,050,000
      expect(expectedFee(d)).toBe(2_050_000)
    })

    it('handles missing fields gracefully', () => {
      expect(expectedFee({})).toBe(0)
      expect(expectedFee({ ticket_size_usd_m: 50 })).toBe(0) // no fee structure
    })
  })

  describe('forecastPipeline', () => {
    it('sums probability-weighted fees and tracks recognised (closed) separately', () => {
      const deals = [
        { stage: 'Closed',  ticket_size_usd_m: 100, fee_success_pct: 2 },   // 2M recognised
        { stage: 'Mandate', ticket_size_usd_m: 100, fee_success_pct: 2 },   // 2M × 0.75 = 1.5M weighted
        { stage: 'Lost',    ticket_size_usd_m: 100, fee_success_pct: 2 }    // 0
      ]
      const r = forecastPipeline(deals)
      expect(r.recognised).toBe(2_000_000)
      // weighted includes Closed (1.0 × 2M) + Mandate (0.75 × 2M) = 3.5M
      expect(r.weighted).toBe(3_500_000)
    })
  })

  describe('staleDeals', () => {
    it('flags non-terminal deals with no recent activity', () => {
      const oldIso = new Date(Date.now() - 14 * 24 * 3600_000).toISOString()
      const freshIso = new Date(Date.now() - 1 * 24 * 3600_000).toISOString()
      const deals = [
        { id: 'a', stage: 'Mandate',     updated_at: oldIso },
        { id: 'b', stage: 'Closed',      updated_at: oldIso }, // terminal — excluded
        { id: 'c', stage: 'Pre-Mandate', updated_at: freshIso }
      ]
      const stale = staleDeals(deals, {}, 7)
      expect(stale.map(d => d.id)).toEqual(['a'])
      expect(stale[0]._staleDays).toBeGreaterThanOrEqual(7)
    })
  })

  describe('similarDealsHeuristic', () => {
    it('ranks same sector + same type highest', () => {
      const target = { id: 't', sector: 'Energy', deal_subtype: 'm_and_a', ma_side: 'sell', ticket_size_usd_m: 100 }
      const pool = [
        { id: 'same',      sector: 'Energy',  deal_subtype: 'm_and_a',   ma_side: 'sell', ticket_size_usd_m: 100 },
        { id: 'adjacent',  sector: 'Energy',  deal_subtype: 'fundraise', ticket_size_usd_m: 20 },
        { id: 'unrelated', sector: 'Fintech', deal_subtype: 'exit',      ticket_size_usd_m: 500 }
      ]
      const top = similarDealsHeuristic(target, pool, { limit: 3 })
      expect(top[0].id).toBe('same')
      expect(top.some(d => d.id === 'unrelated')).toBe(false)
    })
  })

  describe('stageVelocity', () => {
    it('returns a row per active stage with null avg when no data', () => {
      const v = stageVelocity([])
      const activeStageIds = STAGES.filter(s => !s.terminal).map(s => s.id)
      expect(v.map(x => x.stage)).toEqual(activeStageIds)
      expect(v.every(x => x.avgDays == null)).toBe(true)
    })
  })
})
