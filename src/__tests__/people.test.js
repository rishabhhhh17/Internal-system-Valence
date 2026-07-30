import { describe, it, expect } from 'vitest'
import {
  extractCompanies,
  applyCompanyAssignment,
  wouldChangeCompany,
  locationLine,
  fullDisplayName,
  parseBulkPeople,
  buildInsertableBulk
} from '../lib/people.js'

describe('extractCompanies', () => {
  it('returns [] for non-array input', () => {
    expect(extractCompanies(null)).toEqual([])
    expect(extractCompanies(undefined)).toEqual([])
    expect(extractCompanies('')).toEqual([])
  })

  it('returns [] when no people have a company', () => {
    expect(extractCompanies([{ id: 1 }, { id: 2, company: '' }])).toEqual([])
  })

  it('counts members per company', () => {
    const r = extractCompanies([
      { id: 1, company: 'Acme' },
      { id: 2, company: 'Acme' },
      { id: 3, company: 'Beta' }
    ])
    expect(r).toEqual([
      { name: 'Acme', count: 2 },
      { name: 'Beta', count: 1 }
    ])
  })

  it('sorts by count desc then name asc', () => {
    const r = extractCompanies([
      { company: 'Zeta' },
      { company: 'Alpha' },
      { company: 'Alpha' }
    ])
    expect(r).toEqual([
      { name: 'Alpha', count: 2 },
      { name: 'Zeta', count: 1 }
    ])
  })

  it('trims surrounding whitespace and treats blanks as empty', () => {
    const r = extractCompanies([
      { company: '  Acme  ' },
      { company: 'Acme' },
      { company: '   ' }
    ])
    expect(r).toEqual([{ name: 'Acme', count: 2 }])
  })

  it('ignores null/undefined entries safely', () => {
    const r = extractCompanies([null, undefined, { company: 'X' }])
    expect(r).toEqual([{ name: 'X', count: 1 }])
  })
})

describe('applyCompanyAssignment', () => {
  const people = [
    { id: 'a', full_name: 'Alice', company: 'Acme' },
    { id: 'b', full_name: 'Bob',   company: null },
    { id: 'c', full_name: 'Carol', company: 'Beta' }
  ]

  it('updates only the target person', () => {
    const next = applyCompanyAssignment(people, 'b', 'Acme')
    expect(next[0]).toEqual({ id: 'a', full_name: 'Alice', company: 'Acme' })
    expect(next[1]).toEqual({ id: 'b', full_name: 'Bob',   company: 'Acme' })
    expect(next[2]).toEqual({ id: 'c', full_name: 'Carol', company: 'Beta' })
  })

  it('does not mutate the input array or its objects', () => {
    const next = applyCompanyAssignment(people, 'a', 'NewCo')
    expect(people[0].company).toBe('Acme')
    expect(next).not.toBe(people)
    expect(next[0]).not.toBe(people[0])
  })

  it('clears the company when passed empty string', () => {
    const next = applyCompanyAssignment(people, 'a', '')
    expect(next[0].company).toBeNull()
  })

  it('clears the company when passed only whitespace', () => {
    const next = applyCompanyAssignment(people, 'a', '   ')
    expect(next[0].company).toBeNull()
  })

  it('returns the input unchanged for unknown id', () => {
    const next = applyCompanyAssignment(people, 'missing', 'X')
    expect(next).toHaveLength(3)
    expect(next.map(p => p.company)).toEqual(['Acme', null, 'Beta'])
  })

  it('returns input for empty/falsy id', () => {
    expect(applyCompanyAssignment(people, '', 'X')).toBe(people)
    expect(applyCompanyAssignment(people, null, 'X')).toBe(people)
  })

  it('returns input for non-array people', () => {
    expect(applyCompanyAssignment(null, 'a', 'X')).toBeNull()
  })
})

describe('wouldChangeCompany', () => {
  const people = [
    { id: 'a', company: 'Acme' },
    { id: 'b', company: null }
  ]

  it('true when target value differs', () => {
    expect(wouldChangeCompany(people, 'a', 'Beta')).toBe(true)
  })

  it('false when target value matches existing', () => {
    expect(wouldChangeCompany(people, 'a', 'Acme')).toBe(false)
  })

  it('false when target value differs only by whitespace', () => {
    expect(wouldChangeCompany(people, 'a', '  Acme  ')).toBe(false)
  })

  it('treats null company as empty string for comparison', () => {
    expect(wouldChangeCompany(people, 'b', '')).toBe(false)
    expect(wouldChangeCompany(people, 'b', 'X')).toBe(true)
  })

  it('false for unknown id', () => {
    expect(wouldChangeCompany(people, 'missing', 'X')).toBe(false)
  })

  it('false for non-array people', () => {
    expect(wouldChangeCompany(null, 'a', 'X')).toBe(false)
  })
})

// Lock down the existing helpers so future edits don't regress them.
describe('locationLine / fullDisplayName regression', () => {
  it('locationLine joins city + country', () => {
    expect(locationLine({ city: 'Mumbai', country: 'India' })).toBe('Mumbai, India')
    expect(locationLine({ city: 'Mumbai' })).toBe('Mumbai')
    expect(locationLine({})).toBe('')
    expect(locationLine(null)).toBe('')
  })

  it('fullDisplayName includes parenthesized role', () => {
    expect(fullDisplayName({ full_name: 'Alice', role: 'CFO' })).toBe('Alice (CFO)')
    expect(fullDisplayName({ full_name: 'Alice' })).toBe('Alice')
    expect(fullDisplayName(null)).toBe('')
  })
})

describe('parseBulkPeople', () => {
  it('returns empty for blank input', () => {
    expect(parseBulkPeople('').rows).toEqual([])
    expect(parseBulkPeople(null).rows).toEqual([])
    expect(parseBulkPeople(undefined).rows).toEqual([])
  })

  it('parses one-name-per-line', () => {
    const r = parseBulkPeople('Alice\nBob\nCarol')
    expect(r.rows.map(x => x.full_name)).toEqual(['Alice', 'Bob', 'Carol'])
    expect(r.rows.every(x => x.errors.length === 0)).toBe(true)
  })

  it('counts blank + comment lines as skipped', () => {
    const r = parseBulkPeople('Alice\n\n# header\n  \nBob')
    expect(r.rows).toHaveLength(2)
    expect(r.skipped).toBe(3)
  })

  it('extracts email from <angle brackets>', () => {
    const r = parseBulkPeople('Alice Smith <alice@x.com>')
    expect(r.rows[0]).toMatchObject({ full_name: 'Alice Smith', email: 'alice@x.com' })
  })

  it('extracts email from inline form', () => {
    const r = parseBulkPeople('Alice Smith alice@x.com')
    expect(r.rows[0]).toMatchObject({ full_name: 'Alice Smith', email: 'alice@x.com' })
  })

  it('parses pipe-separated lines', () => {
    const r = parseBulkPeople('Alice | CEO | alice@x.com')
    expect(r.rows[0]).toMatchObject({
      full_name: 'Alice',
      role: 'CEO',
      email: 'alice@x.com'
    })
  })

  it('parses comma-separated lines without email', () => {
    const r = parseBulkPeople('Alice, CEO, Acme')
    expect(r.rows[0]).toMatchObject({
      full_name: 'Alice',
      role: 'CEO',
      company: 'Acme'
    })
  })

  it('parses tab-separated lines', () => {
    const r = parseBulkPeople('Alice\tCEO\talice@x.com')
    expect(r.rows[0]).toMatchObject({
      full_name: 'Alice',
      role: 'CEO',
      email: 'alice@x.com'
    })
  })

  it('parses em-dash separator', () => {
    const r = parseBulkPeople('Alice Smith — CEO at Acme')
    expect(r.rows[0]).toMatchObject({
      full_name: 'Alice Smith',
      role: 'CEO',
      company: 'Acme'
    })
  })

  it('parses hyphen separator', () => {
    const r = parseBulkPeople('Alice Smith - CEO')
    expect(r.rows[0]).toMatchObject({
      full_name: 'Alice Smith',
      role: 'CEO'
    })
  })

  it('parses "at <Company>" tail', () => {
    const r = parseBulkPeople('Alice Smith - CEO at Acme Holdings')
    expect(r.rows[0]).toMatchObject({
      full_name: 'Alice Smith',
      role: 'CEO',
      company: 'Acme Holdings'
    })
  })

  it('handles comma-separated with embedded email', () => {
    const r = parseBulkPeople('Alice Smith, CEO, alice@x.com')
    expect(r.rows[0]).toMatchObject({
      full_name: 'Alice Smith',
      role: 'CEO',
      email: 'alice@x.com'
    })
  })

  it('applies defaultCompany when row has no company', () => {
    const r = parseBulkPeople('Alice\nBob', { defaultCompany: 'Acme' })
    expect(r.rows.every(x => x.company === 'Acme')).toBe(true)
  })

  it('preserves per-row company even when defaultCompany is set', () => {
    const r = parseBulkPeople('Alice at Beta\nBob', { defaultCompany: 'Acme' })
    expect(r.rows[0].company).toBe('Beta')
    expect(r.rows[1].company).toBe('Acme')
  })

  it('flags missing name', () => {
    const r = parseBulkPeople('   <foo@x.com>')
    expect(r.rows[0].errors).toContain('Missing name')
  })
})

describe('buildInsertableBulk', () => {
  it('filters out rows missing required name', () => {
    const rows = [
      { full_name: 'Alice', email: 'a@x.com', errors: [] },
      { full_name: '', errors: ['Missing name'] },
      { full_name: 'Bob', errors: [] }
    ]
    const out = buildInsertableBulk(rows)
    expect(out.map(r => r.full_name)).toEqual(['Alice', 'Bob'])
  })

  it('omits empty optional fields from the payload', () => {
    const out = buildInsertableBulk([{ full_name: 'Alice', errors: [], role: '', email: '' }])
    expect(out[0]).toEqual({ full_name: 'Alice' })
  })

  it('keeps non-empty fields', () => {
    const out = buildInsertableBulk([{ full_name: 'Alice', email: 'a@x.com', role: 'CFO', company: 'Acme', errors: [] }])
    expect(out[0]).toEqual({ full_name: 'Alice', email: 'a@x.com', role: 'CFO', company: 'Acme' })
  })

  it('applies defaultCompany when row has none', () => {
    const out = buildInsertableBulk(
      [{ full_name: 'Alice', errors: [] }, { full_name: 'Bob', company: 'Beta', errors: [] }],
      { defaultCompany: 'Acme' }
    )
    expect(out[0].company).toBe('Acme')
    expect(out[1].company).toBe('Beta')
  })

  it('returns [] for non-array input', () => {
    expect(buildInsertableBulk(null)).toEqual([])
    expect(buildInsertableBulk(undefined)).toEqual([])
  })
})
