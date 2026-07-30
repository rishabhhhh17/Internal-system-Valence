import { describe, it, expect } from 'vitest'
import { STAGES, ACTIVE_STAGES, TERMINAL_STAGES, LIVE_MANDATE_STAGES, LIVE_PIPELINE_STAGES, stageMeta, stageProgress, migrateStage } from '../lib/stages.js'

describe('stages', () => {
  it('has exactly 7 stages (5 active + 2 terminal)', () => {
    expect(STAGES).toHaveLength(7)
    expect(ACTIVE_STAGES).toHaveLength(5)
    expect(TERMINAL_STAGES).toHaveLength(2)
  })

  it('active stages are the pre-diligence funnel', () => {
    expect(ACTIVE_STAGES.map(s => s.id)).toEqual(['Sourced', 'Information Received', 'Analyst Call', 'Partner Call', 'Memo'])
  })

  it('terminal stages are Diligence (graduation) and Passed', () => {
    expect(TERMINAL_STAGES.map(s => s.id).sort()).toEqual(['Diligence', 'Passed'])
  })

  it('LIVE_PIPELINE_STAGES is the actively-worked set', () => {
    expect(LIVE_PIPELINE_STAGES).toEqual(['Analyst Call', 'Partner Call', 'Memo'])
    expect(LIVE_MANDATE_STAGES).toEqual(LIVE_PIPELINE_STAGES) // back-compat alias
  })

  it('every stage has a description', () => {
    for (const s of STAGES) {
      expect(s.desc).toBeTruthy()
      expect(s.desc.length).toBeGreaterThan(10)
    }
  })

  describe('stageMeta()', () => {
    it('returns the matching stage', () => {
      expect(stageMeta('Memo').id).toBe('Memo')
    })

    it('falls back to the first stage for unknown ids', () => {
      expect(stageMeta('Nonsense').id).toBe('Sourced')
    })
  })

  describe('stageProgress()', () => {
    it('returns 1.0 for Diligence and 0 for Passed', () => {
      expect(stageProgress('Diligence')).toBe(1)
      expect(stageProgress('Passed')).toBe(0)
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
    it('maps the old IB pipeline to the new funnel', () => {
      expect(migrateStage('Origination')).toBe('Information Received')
      expect(migrateStage('Pitch')).toBe('Analyst Call')
      expect(migrateStage('Pitching')).toBe('Analyst Call')
      expect(migrateStage('Pre-Mandate')).toBe('Partner Call')
      expect(migrateStage('Mandate')).toBe('Memo')
      expect(migrateStage('Closed')).toBe('Diligence')
      expect(migrateStage('Lost')).toBe('Passed')
      expect(migrateStage('On Hold')).toBe('Sourced')
    })

    it('collapses old execution-phase stages into Memo', () => {
      for (const old of ['Preparation', 'Marketing', 'Negotiation', 'Closing']) {
        expect(migrateStage(old)).toBe('Memo')
      }
    })

    it('passes through current stage names unchanged', () => {
      for (const s of STAGES) {
        expect(migrateStage(s.id)).toBe(s.id)
      }
    })

    it('parks unknown stages at Sourced', () => {
      expect(migrateStage('Bogus')).toBe('Sourced')
      expect(migrateStage(undefined)).toBe('Sourced')
    })
  })
})
