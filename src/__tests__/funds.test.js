import { describe, it, expect } from 'vitest'
import {
  scoreFundForDeal,
  matchFundsForDeal,
  screenerModeForDeal,
  audienceLabelFor,
  isFundMatchApplicable,
  DEMO_FUNDS
} from '../lib/funds.js'

const peakXV    = DEMO_FUNDS.find(f => f.name === 'Peak XV Partners')
const accel     = DEMO_FUNDS.find(f => f.name === 'Accel India')
const tiger     = DEMO_FUNDS.find(f => f.name === 'Tiger Global')
const kkr       = DEMO_FUNDS.find(f => f.name === 'KKR')
const brookfield = DEMO_FUNDS.find(f => f.name === 'Brookfield Asset Mgmt')
const tata      = DEMO_FUNDS.find(f => f.name === 'Tata Capital — Corp Dev')
const gic       = DEMO_FUNDS.find(f => f.name === 'GIC')
const reliance  = DEMO_FUNDS.find(f => f.name === 'Reliance Family Office')

describe('screenerModeForDeal', () => {
  it('returns null for advisory-only mandates', () => {
    expect(screenerModeForDeal({ deal_types: ['advisory'] })).toBeNull()
    expect(screenerModeForDeal({ deal_types: [] })).toBeNull()
    expect(screenerModeForDeal({})).toBeNull()
    expect(screenerModeForDeal(null)).toBeNull()
  })

  it('returns the transaction subtype for transaction mandates', () => {
    expect(screenerModeForDeal({ deal_types: ['transaction'], deal_subtype: 'fundraise' })).toBe('fundraise')
    expect(screenerModeForDeal({ deal_types: ['transaction'], deal_subtype: 'm_and_a' })).toBe('m_and_a')
    expect(screenerModeForDeal({ deal_types: ['transaction'], deal_subtype: 'exit' })).toBe('exit')
  })

  it('handles mixed transaction + advisory by reading the transaction subtype', () => {
    expect(screenerModeForDeal({ deal_types: ['transaction', 'advisory'], deal_subtype: 'fundraise' })).toBe('fundraise')
  })

  it('returns null when transaction is selected but no subtype set', () => {
    expect(screenerModeForDeal({ deal_types: ['transaction'], deal_subtype: null })).toBeNull()
  })
})

describe('audienceLabelFor', () => {
  it('uses banker-friendly plurals per mode', () => {
    expect(audienceLabelFor('fundraise').plural).toBe('investors')
    expect(audienceLabelFor('m_and_a').plural).toBe('acquirers')
    expect(audienceLabelFor('exit').plural).toBe('secondary buyers')
    expect(audienceLabelFor(null).plural).toBe('funds')
  })
})

describe('isFundMatchApplicable', () => {
  it('returns false for advisory-only', () => {
    expect(isFundMatchApplicable({ deal_types: ['advisory'] })).toBe(false)
  })
  it('returns true for any transaction subtype', () => {
    expect(isFundMatchApplicable({ deal_types: ['transaction'], deal_subtype: 'fundraise' })).toBe(true)
    expect(isFundMatchApplicable({ deal_types: ['transaction'], deal_subtype: 'm_and_a' })).toBe(true)
    expect(isFundMatchApplicable({ deal_types: ['transaction'], deal_subtype: 'exit' })).toBe(true)
  })
})

describe('scoreFundForDeal — fundraise mode', () => {
  const deal = {
    deal_types: ['transaction'],
    deal_subtype: 'fundraise',
    sector: 'Fintech',
    target_raise_usd_m: 80,
    stage: 'Series B'
  }

  it('rewards sector + stage + cheque match + warmth', () => {
    const r = scoreFundForDeal(peakXV, deal, 'fundraise')
    // Peak XV: Fintech in sectors (35), 'Series B' in stages (20), 80 in [5,100] (25), hot warmth (12), recent (6) = 98
    expect(r.score).toBeGreaterThanOrEqual(80)
    expect(r.reasons).toEqual(expect.arrayContaining([expect.stringMatching(/Fintech/)]))
  })

  it('penalises cheque-band mismatch', () => {
    const r = scoreFundForDeal(accel, deal, 'fundraise')
    // Accel: Fintech (35), Series B (20), 80 outside [2,60] by 30% margin → -10, warm (8), no recency = 53
    expect(r.score).toBeLessThan(scoreFundForDeal(peakXV, deal, 'fundraise').score)
    expect(r.reasons).toEqual(expect.arrayContaining([expect.stringMatching(/Cheque size mismatch/)]))
  })

  it('does not filter VC funds out (fundraise has no fund-type whitelist)', () => {
    const r = scoreFundForDeal(peakXV, deal, 'fundraise')
    expect(r.score).toBeGreaterThan(0)
  })
})

describe('scoreFundForDeal — m_and_a mode', () => {
  const deal = {
    deal_types: ['transaction'],
    deal_subtype: 'm_and_a',
    ma_side: 'buy',
    sector: 'Infrastructure',
    acquisition_brief: 'Looking for $100–250M EV infra assets in renewables.'
  }

  it('zeros out VC funds (not eligible acquirers)', () => {
    const r = scoreFundForDeal(peakXV, deal, 'm_and_a')
    expect(r.score).toBe(0)
  })

  it('rewards Strategic Corp Dev acquirers', () => {
    const dealConsumer = { ...deal, sector: 'Consumer' }
    const r = scoreFundForDeal(tata, dealConsumer, 'm_and_a')
    // Tata Corp Dev: Consumer in sectors (45), Strategic acquirer bonus (18), warm (8), recent (6) = 77
    expect(r.score).toBeGreaterThan(60)
    expect(r.reasons).toEqual(expect.arrayContaining([expect.stringMatching(/Strategic acquirer/)]))
  })

  it('rewards PE with sector thesis fit', () => {
    const r = scoreFundForDeal(brookfield, deal, 'm_and_a')
    // Brookfield: Infrastructure in sectors (45 — m_and_a weight), PE bonus (12), warm (8), recent (6) = 71
    expect(r.score).toBeGreaterThan(60)
    expect(r.reasons).toEqual(expect.arrayContaining([expect.stringMatching(/PE platform thesis/)]))
  })

  it('does not apply cheque-band scoring for M&A', () => {
    const r = scoreFundForDeal(brookfield, deal, 'm_and_a')
    expect(r.reasons.join(' ')).not.toMatch(/Cheque size/)
  })
})

describe('scoreFundForDeal — exit mode', () => {
  const deal = {
    deal_types: ['transaction'],
    deal_subtype: 'exit',
    sector: 'Real Estate',
    target_exit_usd_m: 320,
    exit_investor_name: 'Brookfield'
  }

  it('rewards sovereigns with secondary appetite', () => {
    const r = scoreFundForDeal(gic, deal, 'exit')
    // GIC: Real Estate in sectors (35), 320 in [100,2000] (25), Sovereign bonus (14), warm (8), recent (6) = 88
    expect(r.score).toBeGreaterThan(70)
    expect(r.reasons).toEqual(expect.arrayContaining([expect.stringMatching(/Sovereign secondary appetite/)]))
  })

  it('zeros out VCs (not eligible secondary buyers)', () => {
    const r = scoreFundForDeal(peakXV, deal, 'exit')
    expect(r.score).toBe(0)
  })

  it('still applies cheque-band scoring for exits (numeric ask exists)', () => {
    const r = scoreFundForDeal(brookfield, deal, 'exit')
    expect(r.reasons.join(' ')).toMatch(/cheques|Cheque/)
  })
})

describe('matchFundsForDeal', () => {
  it('returns empty for advisory mandates', () => {
    const advisoryDeal = { deal_types: ['advisory'], sector: 'Consumer' }
    expect(matchFundsForDeal(DEMO_FUNDS, advisoryDeal)).toEqual([])
  })

  it('infers mode from the deal when not passed', () => {
    const deal = { deal_types: ['transaction'], deal_subtype: 'fundraise', sector: 'Fintech', target_raise_usd_m: 80, stage: 'Series B' }
    const matches = matchFundsForDeal(DEMO_FUNDS, deal)
    expect(matches.length).toBeGreaterThan(0)
    expect(matches[0].score).toBeGreaterThanOrEqual(matches[matches.length - 1].score)
  })

  it('respects the limit', () => {
    const deal = { deal_types: ['transaction'], deal_subtype: 'fundraise', sector: 'Fintech', target_raise_usd_m: 80, stage: 'Series B' }
    expect(matchFundsForDeal(DEMO_FUNDS, deal, { limit: 3 })).toHaveLength(3)
  })

  it('only returns eligible fund-types for M&A', () => {
    const deal = { deal_types: ['transaction'], deal_subtype: 'm_and_a', ma_side: 'buy', sector: 'Consumer' }
    const matches = matchFundsForDeal(DEMO_FUNDS, deal, { limit: 12 })
    const allowedTypes = new Set(['PE', 'Strategic Corp Dev', 'Growth', 'Sovereign'])
    for (const m of matches) {
      expect(allowedTypes.has(m.fund.fund_type)).toBe(true)
    }
  })
})
