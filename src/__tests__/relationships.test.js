import { describe, it, expect } from 'vitest'
import { scorePerson, scoreAllPeople } from '../lib/relationships.js'

const today = new Date()
const daysAgo = (n) => new Date(today.getTime() - n * 86_400_000).toISOString()

describe('scorePerson', () => {
  it('returns DORMANT when there is no history', () => {
    const r = scorePerson({ id: 'p1', full_name: 'Rohan' }, [], [])
    expect(r.warmth.key).toBe('dormant')
    expect(r.score).toBe(0)
    expect(r.reasons).toEqual(['No interactions logged yet'])
  })

  it('warm score with recent + frequent positive interactions', () => {
    const interactions = [
      { id: '1', counterparty_name: 'Rohan', outcome: 'interested', created_at: daysAgo(1) },
      { id: '2', counterparty_name: 'Rohan', outcome: 'in_progress', created_at: daysAgo(10) },
      { id: '3', counterparty_name: 'Rohan', outcome: 'converted_to_mandate', created_at: daysAgo(20) },
      { id: '4', counterparty_name: 'Rohan', outcome: 'interested', created_at: daysAgo(45) },
      { id: '5', counterparty_name: 'Rohan', outcome: 'stay_warm', created_at: daysAgo(60) }
    ]
    const deals = [
      { id: 'd1', counterparty_name: 'Rohan' },
      { id: 'd2', counterparty_name: 'Rohan' }
    ]
    const r = scorePerson({ id: 'p1', full_name: 'Rohan' }, interactions, deals)
    expect(r.warmth.key).toBe('warm')
    expect(r.score).toBeGreaterThanOrEqual(75)
    expect(r.components.recency).toBeGreaterThan(80)
    expect(r.components.pipeline).toBe(75)
  })

  it('cold when last touch is over 6 months ago', () => {
    const r = scorePerson({ id: 'p1', full_name: 'Rohan' }, [
      { id: '1', counterparty_name: 'Rohan', outcome: 'interested', created_at: daysAgo(200) }
    ], [])
    expect(['cool', 'cold']).toContain(r.warmth.key)
    expect(r.components.recency).toBe(0)
  })

  it('engagement penalises negative outcomes', () => {
    const interactions = [
      { id: '1', counterparty_name: 'X', outcome: 'passed', created_at: daysAgo(15) },
      { id: '2', counterparty_name: 'X', outcome: 'pitched_lost', created_at: daysAgo(30) },
      { id: '3', counterparty_name: 'X', outcome: 'passed', created_at: daysAgo(45) }
    ]
    const r = scorePerson({ id: 'p1', full_name: 'X' }, interactions, [])
    expect(r.components.engagement).toBe(0)
    expect(r.reasons.some(s => /negative/.test(s))).toBe(true)
  })

  it('mid-range gets engaged/cool labels', () => {
    const interactions = [
      { id: '1', counterparty_name: 'X', outcome: 'to_followup', created_at: daysAgo(40) },
      { id: '2', counterparty_name: 'X', outcome: 'to_followup', created_at: daysAgo(70) }
    ]
    const r = scorePerson({ id: 'p1', full_name: 'X' }, interactions, [])
    expect(['engaged','cool','cold']).toContain(r.warmth.key)
  })

  it('reasons surface "talked today" for same-day interaction', () => {
    const r = scorePerson({ id: 'p1', full_name: 'X' }, [
      { id: '1', counterparty_name: 'X', outcome: 'interested', created_at: new Date().toISOString() }
    ], [])
    expect(r.reasons.some(s => /today/.test(s))).toBe(true)
  })
})

describe('scoreAllPeople', () => {
  it('matches interactions by case-insensitive name', () => {
    const people = [
      { id: 'p1', full_name: 'Rohan Singh' },
      { id: 'p2', full_name: 'Priya Iyer' }
    ]
    const interactions = [
      { id: 'i1', counterparty_name: 'rohan singh', outcome: 'interested', created_at: daysAgo(5) },
      { id: 'i2', counterparty_name: 'Priya Iyer',  outcome: 'passed',     created_at: daysAgo(100) }
    ]
    const map = scoreAllPeople(people, interactions, [])
    // p1's single positive recent interaction lands in engaged/warm band.
    expect(['engaged', 'warm']).toContain(map.get('p1').warmth.key)
    // p2's 100-day-old negative interaction lands in cool/cold band.
    expect(['cool', 'cold']).toContain(map.get('p2').warmth.key)
  })

  it('deduplicates interactions matched by both name + email', () => {
    const people = [{ id: 'p1', full_name: 'X', email: 'x@a.com' }]
    const interactions = [
      { id: 'i1', counterparty_name: 'X', counterparty_email: 'x@a.com',
        outcome: 'interested', created_at: daysAgo(2) }
    ]
    const map = scoreAllPeople(people, interactions, [])
    // Single interaction counted once, not twice.
    expect(map.get('p1').components.frequency).toBe(20)
  })

  it('handles empty inputs', () => {
    expect(scoreAllPeople([], [], []).size).toBe(0)
    const map = scoreAllPeople([{ id: 'p1', full_name: 'X' }], [], [])
    expect(map.get('p1').warmth.key).toBe('dormant')
  })
})
