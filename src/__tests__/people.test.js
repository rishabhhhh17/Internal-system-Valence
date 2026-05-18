import { describe, it, expect } from 'vitest'
import {
  extractCompanies,
  applyCompanyAssignment,
  wouldChangeCompany,
  locationLine,
  fullDisplayName
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
