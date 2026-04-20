import { describe, it, expect } from 'vitest'
import { STAGES, ACTIVE_STAGES, TERMINAL_STAGES, stageMeta, stageProgress } from '../lib/stages.js'

describe('stages', () => {
  it('has exactly 11 stages (8 active + 3 terminal)', () => {
    expect(STAGES).toHaveLength(11)
    expect(ACTIVE_STAGES).toHaveLength(8)
    expect(TERMINAL_STAGES).toHaveLength(3)
  })

  it('terminal stages are Closed, On Hold, Lost', () => {
    expect(TERMINAL_STAGES.map(s => s.id).sort()).toEqual(['Closed', 'Lost', 'On Hold'])
  })

  it('every stage has a description', () => {
    for (const s of STAGES) {
      expect(s.desc).toBeTruthy()
      expect(s.desc.length).toBeGreaterThan(10)
    }
  })

  describe('stageMeta()', () => {
    it('returns the matching stage', () => {
      expect(stageMeta('Diligence').id).toBe('Diligence')
    })

    it('falls back to the first stage for unknown ids', () => {
      expect(stageMeta('Nonsense').id).toBe('Origination')
    })
  })

  describe('stageProgress()', () => {
    it('returns 1.0 for Closed and 0 for On Hold / Lost', () => {
      expect(stageProgress('Closed')).toBe(1)
      expect(stageProgress('On Hold')).toBe(0)
      expect(stageProgress('Lost')).toBe(0)
    })

    it('returns a strictly increasing fraction across active funnel', () => {
      let prev = 0
      for (const s of ACTIVE_STAGES) {
        const p = stageProgress(s.id)
        expect(p).toBeGreaterThan(prev)
        prev = p
      }
    })
  })
})
