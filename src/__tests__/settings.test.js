import { describe, it, expect } from 'vitest'
import { SETTINGS_SECTIONS, findSection } from '../lib/settings.js'

describe('SETTINGS_SECTIONS', () => {
  it('contains the four canonical sections in order', () => {
    expect(SETTINGS_SECTIONS.map(s => s.id)).toEqual([
      'workspace',
      'integrations',
      'data',
      'appearance'
    ])
  })

  it('every section has a label and description', () => {
    for (const s of SETTINGS_SECTIONS) {
      expect(s.label).toBeTruthy()
      expect(s.description).toBeTruthy()
    }
  })
})

describe('findSection', () => {
  it('returns the section for a known id', () => {
    expect(findSection('integrations').label).toBe('Integrations')
  })

  it('falls back to the first section for an unknown id', () => {
    expect(findSection('does-not-exist').id).toBe('workspace')
    expect(findSection(null).id).toBe('workspace')
    expect(findSection(undefined).id).toBe('workspace')
  })
})
