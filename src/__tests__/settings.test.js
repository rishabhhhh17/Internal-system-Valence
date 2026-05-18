import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  SETTINGS_SECTIONS,
  findSection,
  MEETING_TOOLS,
  getAvailableMeetingTools,
  isValidMeetingTool,
  getMeetingTool,
  setMeetingTool
} from '../lib/settings.js'

// ------------ section registry ------------

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

  it('section ids are unique', () => {
    const ids = SETTINGS_SECTIONS.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
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
    expect(findSection('').id).toBe('workspace')
  })
})

// ------------ meeting tool registry ------------

describe('MEETING_TOOLS', () => {
  it('has unique ids', () => {
    const ids = MEETING_TOOLS.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every tool has id, label, status', () => {
    for (const t of MEETING_TOOLS) {
      expect(t.id).toBeTruthy()
      expect(t.label).toBeTruthy()
      expect(['configurable', 'coming-soon']).toContain(t.status)
    }
  })

  it('Fathom is marked pitchHidden', () => {
    const fathom = MEETING_TOOLS.find(t => t.id === 'fathom')
    expect(fathom).toBeDefined()
    expect(fathom.pitchHidden).toBe(true)
  })
})

describe('getAvailableMeetingTools', () => {
  it('returns all tools in main mode', () => {
    expect(getAvailableMeetingTools()).toHaveLength(MEETING_TOOLS.length)
    expect(getAvailableMeetingTools({ pitchMode: false })).toHaveLength(MEETING_TOOLS.length)
  })

  it('hides pitchHidden tools in pitch mode', () => {
    const list = getAvailableMeetingTools({ pitchMode: true })
    expect(list.find(t => t.id === 'fathom')).toBeUndefined()
    expect(list.length).toBe(MEETING_TOOLS.filter(t => !t.pitchHidden).length)
  })
})

describe('isValidMeetingTool', () => {
  it('accepts known ids in main mode', () => {
    expect(isValidMeetingTool('fathom')).toBe(true)
    expect(isValidMeetingTool('otter')).toBe(true)
  })

  it('rejects unknown ids', () => {
    expect(isValidMeetingTool('zoom')).toBe(false)
    expect(isValidMeetingTool('')).toBe(false)
    expect(isValidMeetingTool(null)).toBe(false)
    expect(isValidMeetingTool(undefined)).toBe(false)
  })

  it('rejects fathom in pitch mode', () => {
    expect(isValidMeetingTool('fathom', { pitchMode: true })).toBe(false)
    expect(isValidMeetingTool('otter', { pitchMode: true })).toBe(true)
  })
})

// ------------ meeting tool persistence ------------

class MemoryStorage {
  constructor() { this.data = new Map() }
  getItem(k) { return this.data.has(k) ? this.data.get(k) : null }
  setItem(k, v) { this.data.set(k, String(v)) }
  removeItem(k) { this.data.delete(k) }
  clear() { this.data.clear() }
}

let storage

beforeEach(() => {
  storage = new MemoryStorage()
  vi.stubGlobal('window', { localStorage: storage })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getMeetingTool / setMeetingTool', () => {
  it('returns null when nothing is stored', () => {
    expect(getMeetingTool()).toBeNull()
  })

  it('round-trips a configurable tool', () => {
    expect(setMeetingTool('fathom')).toBe(true)
    expect(getMeetingTool()).toBe('fathom')
  })

  it('rejects a coming-soon tool', () => {
    expect(setMeetingTool('otter')).toBe(false)
    expect(getMeetingTool()).toBeNull()
  })

  it('rejects unknown ids without writing', () => {
    expect(setMeetingTool('zoom')).toBe(false)
    expect(getMeetingTool()).toBeNull()
  })

  it('clears with null', () => {
    setMeetingTool('fathom')
    expect(getMeetingTool()).toBe('fathom')
    expect(setMeetingTool(null)).toBe(true)
    expect(getMeetingTool()).toBeNull()
  })

  it('clears with empty string', () => {
    setMeetingTool('fathom')
    expect(setMeetingTool('')).toBe(true)
    expect(getMeetingTool()).toBeNull()
  })

  it('does not return fathom when reading in pitch mode (graceful filter)', () => {
    setMeetingTool('fathom', { pitchMode: false })
    expect(getMeetingTool({ pitchMode: false })).toBe('fathom')
    expect(getMeetingTool({ pitchMode: true })).toBeNull()
  })

  it('refuses to write fathom in pitch mode', () => {
    expect(setMeetingTool('fathom', { pitchMode: true })).toBe(false)
    expect(getMeetingTool()).toBeNull()
  })

  it('returns null for a stored value that is no longer recognized', () => {
    storage.setItem('valence.settings.meetingTool', 'deprecated-tool')
    expect(getMeetingTool()).toBeNull()
  })
})

describe('localStorage unavailable', () => {
  it('getMeetingTool returns null without throwing', () => {
    vi.stubGlobal('window', {})
    expect(() => getMeetingTool()).not.toThrow()
    expect(getMeetingTool()).toBeNull()
  })

  it('setMeetingTool returns false without throwing', () => {
    vi.stubGlobal('window', {})
    expect(() => setMeetingTool('fathom')).not.toThrow()
    expect(setMeetingTool('fathom')).toBe(false)
  })

  it('survives a localStorage getter that throws', () => {
    vi.stubGlobal('window', {
      get localStorage() { throw new Error('blocked') }
    })
    expect(() => getMeetingTool()).not.toThrow()
    expect(getMeetingTool()).toBeNull()
    expect(setMeetingTool('fathom')).toBe(false)
  })
})
