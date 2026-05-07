import { describe, it, expect } from 'vitest'
import { STAGES, ACTIVE_STAGES, TERMINAL_STAGES, LIVE_MANDATE_STAGES, stageMeta, stageProgress, migrateStage } from '../lib/stages.js'

describe('stages', () => {
  it('has exactly 7 stages (4 active + 3 terminal)', () => {
    expect(STAGES).toHaveLength(7)
    expect(ACTIVE_STAGES).toHaveLength(4)
    expect(TERMINAL_STAGES).toHaveLength(3)
  })

  it('active stages are Origination → Pitching → Pre-Mandate → Mandate', () => {
    expect(ACTIVE_STAGES.map(s => s.id)).toEqual(['Origination', 'Pitching', 'Pre-Mandate', 'Mandate'])
  })

  it('terminal stages are Closed, On Hold, Lost', () => {
    expect(TERMINAL_STAGES.map(s => s.id).sort()).toEqual(['Closed', 'Lost', 'On Hold'])
  })

  it('LIVE_MANDATE_STAGES is Pre-Mandate + Mandate', () => {
    expect(LIVE_MANDATE_STAGES).toEqual(['Pre-Mandate', 'Mandate'])
  })

  it('every stage has a description', () => {
    for (const s of STAGES) {
      expect(s.desc).toBeTruthy()
      expect(s.desc.length).toBeGreaterThan(10)
    }
  })

  describe('stageMeta()', () => {
    it('returns the matching stage', () => {
      expect(stageMeta('Mandate').id).toBe('Mandate')
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

  describe('migrateStage()', () => {
    it('maps Pitch → Pitching', () => {
      expect(migrateStage('Pitch')).toBe('Pitching')
    })

    it('collapses execution-phase stages into Mandate', () => {
      for (const old of ['Preparation', 'Marketing', 'Diligence', 'Negotiation', 'Closing']) {
        expect(migrateStage(old)).toBe('Mandate')
      }
    })

    it('passes through current stage names unchanged', () => {
      for (const s of STAGES) {
        expect(migrateStage(s.id)).toBe(s.id)
      }
    })

    it('parks unknown stages at Origination', () => {
      expect(migrateStage('Bogus')).toBe('Origination')
      expect(migrateStage(undefined)).toBe('Origination')
    })
  })
})
