import { describe, it, expect } from 'vitest'
import { STAGE_CHECKLISTS, progress } from '../lib/checklists.js'
import { STAGES } from '../lib/stages.js'

describe('stage-gate checklists', () => {
  it('defines a template for every non-terminal stage', () => {
    const activeStages = STAGES.filter(s => !s.terminal).map(s => s.id)
    for (const id of activeStages) {
      expect(STAGE_CHECKLISTS[id]).toBeDefined()
      expect(STAGE_CHECKLISTS[id].length).toBeGreaterThan(0)
    }
  })

  it('every item has a key, label, and required flag', () => {
    for (const items of Object.values(STAGE_CHECKLISTS)) {
      for (const item of items) {
        expect(item.key).toBeTruthy()
        expect(item.label).toBeTruthy()
        expect(typeof item.required).toBe('boolean')
      }
    }
  })

  describe('progress()', () => {
    it('returns 100% / unblocked for a stage with no items', () => {
      const p = progress(new Set(), 'NoSuchStage')
      expect(p.percent).toBe(100)
      expect(p.blocked).toBe(false)
      expect(p.total).toBe(0)
    })

    it('is blocked when a required item is outstanding', () => {
      const p = progress(new Set(), 'Mandate')
      expect(p.blocked).toBe(true)
      expect(p.done).toBe(0)
    })

    it('becomes unblocked when every required item is done', () => {
      const required = STAGE_CHECKLISTS.Mandate.filter(i => i.required).map(i => i.key)
      const p = progress(new Set(required), 'Mandate')
      expect(p.blocked).toBe(false)
      expect(p.doneRequired).toBe(p.required)
    })

    it('computes percent as done/total', () => {
      const items = STAGE_CHECKLISTS.Mandate
      const half = Math.floor(items.length / 2)
      const doneKeys = new Set(items.slice(0, half).map(i => i.key))
      const p = progress(doneKeys, 'Mandate')
      expect(p.percent).toBe(Math.round((half / items.length) * 100))
    })
  })
})
