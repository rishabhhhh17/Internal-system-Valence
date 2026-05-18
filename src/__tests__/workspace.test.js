import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getWorkspaceSetting,
  setWorkspaceSetting,
  clearWorkspaceSetting,
  subscribeWorkspace,
  effectiveBrowserTitle,
  WORKSPACE_KEYS,
  WORKSPACE_DEFAULTS
} from '../lib/workspace.js'

class MemoryStorage {
  constructor() { this.data = new Map() }
  getItem(k) { return this.data.has(k) ? this.data.get(k) : null }
  setItem(k, v) { this.data.set(k, String(v)) }
  removeItem(k) { this.data.delete(k) }
}

let storage

beforeEach(() => {
  storage = new MemoryStorage()
  vi.stubGlobal('window', { localStorage: storage, addEventListener: () => {}, removeEventListener: () => {} })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('WORKSPACE_KEYS / DEFAULTS shape', () => {
  it('every registered key has a matching default', () => {
    for (const key of Object.values(WORKSPACE_KEYS)) {
      expect(WORKSPACE_DEFAULTS).toHaveProperty(key)
    }
  })

  it('density defaults to comfortable', () => {
    expect(WORKSPACE_DEFAULTS.density).toBe('comfortable')
  })
})

describe('getWorkspaceSetting', () => {
  it('returns the registered default when nothing is stored', () => {
    expect(getWorkspaceSetting(WORKSPACE_KEYS.firmName)).toBe('Valence')
    expect(getWorkspaceSetting(WORKSPACE_KEYS.density)).toBe('comfortable')
  })

  it('returns an explicit fallback when one is passed', () => {
    expect(getWorkspaceSetting(WORKSPACE_KEYS.firmName, 'X')).toBe('X')
  })

  it('returns the stored value when present', () => {
    storage.setItem('valence.workspace.firmName', 'Custom')
    expect(getWorkspaceSetting(WORKSPACE_KEYS.firmName)).toBe('Custom')
  })

  it('falls back when stored density value is not in the allowed set', () => {
    storage.setItem('valence.workspace.density', 'spacious')
    expect(getWorkspaceSetting(WORKSPACE_KEYS.density)).toBe('comfortable')
  })
})

describe('setWorkspaceSetting', () => {
  it('writes a non-default value', () => {
    expect(setWorkspaceSetting(WORKSPACE_KEYS.firmName, 'Custom Co')).toBe(true)
    expect(storage.getItem('valence.workspace.firmName')).toBe('Custom Co')
  })

  it('removes the key when set to the registered default (keeps storage clean)', () => {
    storage.setItem('valence.workspace.firmName', 'Custom')
    setWorkspaceSetting(WORKSPACE_KEYS.firmName, 'Valence')
    expect(storage.getItem('valence.workspace.firmName')).toBeNull()
  })

  it('removes the key when set to empty / null / undefined', () => {
    storage.setItem('valence.workspace.firmName', 'Custom')
    setWorkspaceSetting(WORKSPACE_KEYS.firmName, '')
    expect(storage.getItem('valence.workspace.firmName')).toBeNull()

    storage.setItem('valence.workspace.firmName', 'Custom')
    setWorkspaceSetting(WORKSPACE_KEYS.firmName, null)
    expect(storage.getItem('valence.workspace.firmName')).toBeNull()
  })

  it('rejects unknown keys', () => {
    expect(setWorkspaceSetting('not.a.real.key', 'X')).toBe(false)
  })

  it('rejects invalid density tokens', () => {
    expect(setWorkspaceSetting(WORKSPACE_KEYS.density, 'spacious')).toBe(false)
    expect(setWorkspaceSetting(WORKSPACE_KEYS.density, 'compact')).toBe(true)
    expect(setWorkspaceSetting(WORKSPACE_KEYS.density, 'comfortable')).toBe(true)
  })

  it('trims string input before storing', () => {
    setWorkspaceSetting(WORKSPACE_KEYS.firmName, '   Custom   ')
    expect(storage.getItem('valence.workspace.firmName')).toBe('Custom')
  })
})

describe('clearWorkspaceSetting', () => {
  it('removes the stored value', () => {
    setWorkspaceSetting(WORKSPACE_KEYS.firmName, 'Custom')
    clearWorkspaceSetting(WORKSPACE_KEYS.firmName)
    expect(storage.getItem('valence.workspace.firmName')).toBeNull()
    expect(getWorkspaceSetting(WORKSPACE_KEYS.firmName)).toBe('Valence')
  })
})

describe('subscribeWorkspace', () => {
  it('fires the callback with the changed key on write', () => {
    const fn = vi.fn()
    const off = subscribeWorkspace(fn)
    setWorkspaceSetting(WORKSPACE_KEYS.firmName, 'Custom')
    expect(fn).toHaveBeenCalledWith(WORKSPACE_KEYS.firmName)
    off()
  })

  it('stops firing after unsubscribe', () => {
    const fn = vi.fn()
    const off = subscribeWorkspace(fn)
    off()
    setWorkspaceSetting(WORKSPACE_KEYS.firmName, 'Custom')
    expect(fn).not.toHaveBeenCalled()
  })

  it('a throwing subscriber does not break other subscribers', () => {
    const bad = vi.fn(() => { throw new Error('oops') })
    const good = vi.fn()
    subscribeWorkspace(bad)
    subscribeWorkspace(good)
    setWorkspaceSetting(WORKSPACE_KEYS.firmName, 'Custom')
    expect(good).toHaveBeenCalled()
  })

  it('returns a no-op for non-function input', () => {
    const off = subscribeWorkspace(null)
    expect(typeof off).toBe('function')
    expect(() => off()).not.toThrow()
  })
})

describe('effectiveBrowserTitle', () => {
  it('returns "<firmName>OS" when no explicit title is set', () => {
    expect(effectiveBrowserTitle()).toBe('ValenceOS')
    setWorkspaceSetting(WORKSPACE_KEYS.firmName, 'Custom')
    expect(effectiveBrowserTitle()).toBe('CustomOS')
  })

  it('honors an explicit browserTitle override', () => {
    setWorkspaceSetting(WORKSPACE_KEYS.browserTitle, 'My Firm Dashboard')
    expect(effectiveBrowserTitle()).toBe('My Firm Dashboard')
  })
})

describe('localStorage unavailable', () => {
  it('get returns default without throwing', () => {
    vi.stubGlobal('window', {})
    expect(() => getWorkspaceSetting(WORKSPACE_KEYS.firmName)).not.toThrow()
    expect(getWorkspaceSetting(WORKSPACE_KEYS.firmName)).toBe('Valence')
  })

  it('set returns false without throwing', () => {
    vi.stubGlobal('window', {})
    expect(setWorkspaceSetting(WORKSPACE_KEYS.firmName, 'X')).toBe(false)
  })
})
