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
  it('contains the canonical sections in order', () => {
    expect(SETTINGS_SECTIONS.map(s => s.id)).toEqual([
      'workspace',
      'team',
      'appearance',
      'scoring',
      'terminology',
      'security',
      'integrations',
      'data'
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

  it('every tool currently in the registry is in coming-soon state', () => {
    // Fathom was the only configurable tool and is now removed from the
    // frontend — the rest stay as placeholders until they're wired.
    for (const t of MEETING_TOOLS) {
      expect(t.status).toBe('coming-soon')
    }
  })
})

describe('getAvailableMeetingTools', () => {
  it('returns the full list when no flags are set', () => {
    expect(getAvailableMeetingTools()).toHaveLength(MEETING_TOOLS.length)
    expect(getAvailableMeetingTools({ pitchMode: false })).toHaveLength(MEETING_TOOLS.length)
  })

  it('filters out pitchHidden tools in pitch mode (no-op today, hook for future)', () => {
    // No tool is currently pitchHidden but the filter must keep working
    // so we can add one later without breaking the picker.
    const list = getAvailableMeetingTools({ pitchMode: true })
    expect(list.length).toBe(MEETING_TOOLS.filter(t => !t.pitchHidden).length)
  })
})

describe('isValidMeetingTool', () => {
  it('accepts known ids', () => {
    expect(isValidMeetingTool('otter')).toBe(true)
    expect(isValidMeetingTool('read-ai')).toBe(true)
    expect(isValidMeetingTool('fireflies')).toBe(true)
  })

  it('rejects unknown ids', () => {
    expect(isValidMeetingTool('fathom')).toBe(false)  // explicit: Fathom is gone from the frontend
    expect(isValidMeetingTool('zoom')).toBe(false)
    expect(isValidMeetingTool('')).toBe(false)
    expect(isValidMeetingTool(null)).toBe(false)
    expect(isValidMeetingTool(undefined)).toBe(false)
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

  it('refuses to write any of the current coming-soon tools', () => {
    // Every tool in the registry is presently coming-soon, so setMeetingTool
    // refuses them — the picker is informational on the pitch branch.
    expect(setMeetingTool('otter')).toBe(false)
    expect(setMeetingTool('read-ai')).toBe(false)
    expect(setMeetingTool('fireflies')).toBe(false)
    expect(getMeetingTool()).toBeNull()
  })

  it('rejects unknown ids without writing', () => {
    expect(setMeetingTool('zoom')).toBe(false)
    expect(setMeetingTool('fathom')).toBe(false)  // Fathom intentionally removed
    expect(getMeetingTool()).toBeNull()
  })

  it('clears with null', () => {
    // Seed storage directly since no current tool is configurable.
    storage.setItem('valence.settings.meetingTool', 'otter')
    expect(setMeetingTool(null)).toBe(true)
    expect(storage.getItem('valence.settings.meetingTool')).toBeNull()
  })

  it('clears with empty string', () => {
    storage.setItem('valence.settings.meetingTool', 'otter')
    expect(setMeetingTool('')).toBe(true)
    expect(storage.getItem('valence.settings.meetingTool')).toBeNull()
  })

  it('returns null for a stored value that is no longer recognized', () => {
    storage.setItem('valence.settings.meetingTool', 'deprecated-tool')
    expect(getMeetingTool()).toBeNull()
  })

  it('returns null for a previously-stored fathom (cross-version safety)', () => {
    // A user who upgraded from the pre-strip build may have 'fathom' in
    // localStorage. The reader filters it out cleanly.
    storage.setItem('valence.settings.meetingTool', 'fathom')
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
    expect(() => setMeetingTool('otter')).not.toThrow()
    expect(setMeetingTool('otter')).toBe(false)
  })

  it('survives a localStorage getter that throws', () => {
    vi.stubGlobal('window', {
      get localStorage() { throw new Error('blocked') }
    })
    expect(() => getMeetingTool()).not.toThrow()
    expect(getMeetingTool()).toBeNull()
    expect(setMeetingTool('otter')).toBe(false)
  })
})
