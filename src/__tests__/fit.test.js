import { describe, it, expect } from 'vitest'
import {
  assessFit,
  normalizeEntity,
  verdictFor,
  DEFAULT_CRITERIA,
  ACTION_ORDER,
  validateCriteria
} from '../lib/fit.js'

describe('verdictFor', () => {
  it('bands score → verdict', () => {
    expect(verdictFor(100)).toBe('strong_fit')
    expect(verdictFor(80)).toBe('strong_fit')
    expect(verdictFor(79)).toBe('fit')
    expect(verdictFor(60)).toBe('fit')
    expect(verdictFor(59)).toBe('maybe')
    expect(verdictFor(40)).toBe('maybe')
    expect(verdictFor(39)).toBe('pass')
    expect(verdictFor(0)).toBe('pass')
  })
})

describe('assessFit — perfect match against default criteria', () => {
  it('hits all three dimensions → score 100, verdict strong_fit', () => {
    const out = assessFit({ sector: 'Healthcare', ev_usd_m: 250, geography: 'India' })
    expect(out.score).toBe(100)
    expect(out.verdict).toBe('strong_fit')
    expect(out.breakdown.sector.hit).toBe(true)
    expect(out.breakdown.ev.hit).toBe(true)
    expect(out.breakdown.geo.hit).toBe(true)
    expect(out.breakdown.excluded).toBe(false)
  })

  it('case-insensitive on sector + geography', () => {
    const out = assessFit({ sector: 'fintech', ev_usd_m: 100, geography: 'india' })
    expect(out.score).toBe(100)
  })
})

describe('assessFit — partial fits', () => {
  it('sector + geo hit, EV out of band → 65, fit', () => {
    const out = assessFit({ sector: 'Fintech', ev_usd_m: 1500, geography: 'UK' })
    expect(out.score).toBe(40 + 25) // sector + geo, EV missed
    expect(out.verdict).toBe('fit')
    expect(out.breakdown.ev.hit).toBe(false)
  })

  it('only sector hit → 40, maybe', () => {
    const out = assessFit({ sector: 'Healthcare', ev_usd_m: null, geography: null })
    expect(out.score).toBe(40)
    expect(out.verdict).toBe('maybe')
  })

  it('only EV hit → 35, pass', () => {
    const out = assessFit({ sector: 'Tobacco', ev_usd_m: 200, geography: 'Brazil' })
    expect(out.score).toBe(35)
    expect(out.verdict).toBe('pass')
  })
})

describe('assessFit — hard exclude short-circuits', () => {
  it('excluded sector returns excluded regardless of other matches', () => {
    const criteria = { ...DEFAULT_CRITERIA, excluded_sectors: ['Defence'] }
    const out = assessFit({ sector: 'Defence', ev_usd_m: 250, geography: 'India' }, criteria)
    expect(out.verdict).toBe('excluded')
    expect(out.score).toBe(0)
    expect(out.breakdown.excluded).toBe(true)
    expect(out.reasons.some(r => /Excluded sector/i.test(r))).toBe(true)
  })

  it('case-insensitive exclusion', () => {
    const criteria = { ...DEFAULT_CRITERIA, excluded_sectors: ['Crypto'] }
    const out = assessFit({ sector: 'CRYPTO', ev_usd_m: 100, geography: 'UK' }, criteria)
    expect(out.verdict).toBe('excluded')
  })
})

describe('assessFit — EV band edges', () => {
  it('hits at min boundary', () => {
    const out = assessFit({ sector: 'Healthcare', ev_usd_m: 50, geography: 'India' })
    expect(out.breakdown.ev.hit).toBe(true)
  })
  it('hits at max boundary', () => {
    const out = assessFit({ sector: 'Healthcare', ev_usd_m: 750, geography: 'India' })
    expect(out.breakdown.ev.hit).toBe(true)
  })
  it('one dollar below min misses', () => {
    const out = assessFit({ sector: 'Healthcare', ev_usd_m: 49, geography: 'India' })
    expect(out.breakdown.ev.hit).toBe(false)
  })
})

describe('assessFit — empty / null entity', () => {
  it('empty entity → 0, pass, three "unspecified" reasons', () => {
    const out = assessFit({})
    expect(out.score).toBe(0)
    expect(out.verdict).toBe('pass')
    expect(out.reasons.length).toBe(3)
  })
  it('null entity is safe', () => {
    const out = assessFit(null)
    expect(out.score).toBe(0)
    expect(out.verdict).toBe('pass')
  })
})

describe('normalizeEntity', () => {
  it('intake → ev_ask_usd_m', () => {
    const n = normalizeEntity({ sector: 'Fintech', ev_ask_usd_m: 120, geography: 'India' }, 'intake')
    expect(n).toEqual({ sector: 'Fintech', ev_usd_m: 120, geography: 'India' })
  })

  it('deal → prefers target_valuation_usd_m over raise/exit', () => {
    const n = normalizeEntity({
      sector: 'Healthcare',
      target_valuation_usd_m: 400,
      target_raise_usd_m: 80,
      geography: 'UK'
    }, 'deal')
    expect(n.ev_usd_m).toBe(400)
  })

  it('deal → falls through to target_raise_usd_m when valuation missing', () => {
    const n = normalizeEntity({
      sector: 'Healthcare',
      target_raise_usd_m: 80,
      geography: 'UK'
    }, 'deal')
    expect(n.ev_usd_m).toBe(80)
  })

  it('deal → financials.enterprise_value_usd_m as last fallback', () => {
    const n = normalizeEntity({
      sector: 'Logistics',
      financials: { enterprise_value_usd_m: 600 },
      geography: 'SE Asia'
    }, 'deal')
    expect(n.ev_usd_m).toBe(600)
  })

  it('null/undefined safe', () => {
    expect(normalizeEntity(null)).toEqual({ sector: null, ev_usd_m: null, geography: null })
  })
})

describe('ACTION_ORDER', () => {
  it('renders the exact button sequence the user signed off on', () => {
    expect(ACTION_ORDER).toEqual(['mark_fit', 'pass', 'ask_more_info', 'override'])
  })
})

describe('validateCriteria', () => {
  it('rejects missing/non-object input', () => {
    expect(validateCriteria(null).ok).toBe(false)
    expect(validateCriteria(undefined).ok).toBe(false)
    expect(validateCriteria('text').ok).toBe(false)
  })

  it('accepts a clean payload and normalizes lists', () => {
    const r = validateCriteria({
      name: 'Test',
      sectors: ['Healthcare', 'Fintech'],
      excluded_sectors: ['Crypto'],
      geographies: ['India'],
      ev_min_usd_m: 50,
      ev_max_usd_m: 500
    })
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
    expect(r.normalized.sectors).toEqual(['Healthcare', 'Fintech'])
    expect(r.normalized.is_default).toBe(true)
  })

  it('dedupes and trims sectors / excluded / geographies', () => {
    const r = validateCriteria({
      sectors: ['Healthcare', '  Healthcare  ', '', 'Fintech'],
      excluded_sectors: ['Crypto', 'Crypto'],
      geographies: ['India', ' India ']
    })
    expect(r.normalized.sectors).toEqual(['Healthcare', 'Fintech'])
    expect(r.normalized.excluded_sectors).toEqual(['Crypto'])
    expect(r.normalized.geographies).toEqual(['India'])
  })

  it('flags overlap between allowed and excluded sectors', () => {
    const r = validateCriteria({
      sectors: ['Healthcare', 'Crypto'],
      excluded_sectors: ['Crypto']
    })
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toMatch(/Crypto/)
  })

  it('coerces EV fields to numbers, accepts strings', () => {
    const r = validateCriteria({
      ev_min_usd_m: '100',
      ev_max_usd_m: '500'
    })
    expect(r.ok).toBe(true)
    expect(r.normalized.ev_min_usd_m).toBe(100)
    expect(r.normalized.ev_max_usd_m).toBe(500)
  })

  it('allows null/empty EV fields', () => {
    const r = validateCriteria({
      ev_min_usd_m: '',
      ev_max_usd_m: null
    })
    expect(r.ok).toBe(true)
    expect(r.normalized.ev_min_usd_m).toBeNull()
    expect(r.normalized.ev_max_usd_m).toBeNull()
  })

  it('rejects non-numeric EV', () => {
    const r = validateCriteria({ ev_min_usd_m: 'abc' })
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/EV min/)
  })

  it('rejects negative EV', () => {
    expect(validateCriteria({ ev_min_usd_m: -1 }).ok).toBe(false)
    expect(validateCriteria({ ev_max_usd_m: -100 }).ok).toBe(false)
  })

  it('rejects min > max', () => {
    const r = validateCriteria({ ev_min_usd_m: 500, ev_max_usd_m: 100 })
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/EV min must be/)
  })

  it('accepts min == max as a single-point band', () => {
    const r = validateCriteria({ ev_min_usd_m: 100, ev_max_usd_m: 100 })
    expect(r.ok).toBe(true)
  })

  it('falls back to a default name when blank', () => {
    const r = validateCriteria({ name: '   ' })
    expect(r.normalized.name).toBe('Default firm criteria')
  })

  it('treats non-array list inputs as empty', () => {
    const r = validateCriteria({
      sectors: 'Healthcare',
      excluded_sectors: null,
      geographies: undefined
    })
    expect(r.normalized.sectors).toEqual([])
    expect(r.normalized.excluded_sectors).toEqual([])
    expect(r.normalized.geographies).toEqual([])
  })

  it('always sets is_default: true on the normalized payload', () => {
    const r = validateCriteria({ is_default: false, name: 'X' })
    expect(r.normalized.is_default).toBe(true)
  })

  it('does not regress assessFit against the existing DEFAULT_CRITERIA shape', () => {
    // Sanity — the validator output must be a structural match for what
    // assessFit consumes via DEFAULT_CRITERIA.
    const { normalized } = validateCriteria({
      sectors: ['Healthcare'],
      geographies: ['India'],
      ev_min_usd_m: 50,
      ev_max_usd_m: 750
    })
    const scored = assessFit({ sector: 'Healthcare', ev_usd_m: 250, geography: 'India' }, normalized)
    expect(scored.score).toBe(100)
  })
})
