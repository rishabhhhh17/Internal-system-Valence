import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// The module reads `import.meta.env.VITE_GEMINI_API_KEY` + localStorage at
// import time. We need a fresh module instance per test to exercise the
// init paths, so use dynamic import after stubbing globals.

class MemoryStorage {
  constructor() { this.data = new Map() }
  getItem(k) { return this.data.has(k) ? this.data.get(k) : null }
  setItem(k, v) { this.data.set(k, String(v)) }
  removeItem(k) { this.data.delete(k) }
}

let storage

beforeEach(() => {
  vi.resetModules()
  storage = new MemoryStorage()
  vi.stubGlobal('window', { localStorage: storage })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function loadModule() {
  return await import('../lib/gemini.js?t=' + Date.now())
}

describe('Gemini key resolution at import', () => {
  it('falls back to managed mode when no user key is set', async () => {
    // Design change (dual-key failover): the server holds a managed key, so
    // with no user key the source is 'managed' (not 'none') and AI is still
    // configured. There is no longer an unconfigured 'none' state.
    const m = await loadModule()
    expect(m.getGeminiKey()).toBeNull()        // no USER key
    expect(m.isGeminiConfigured).toBe(true)    // managed fallback covers it
    expect(m.geminiKeySource).toBe('managed')
  })

  it('reads user key from localStorage if present', async () => {
    storage.setItem('valence.settings.geminiKey', 'AIza-user-key')
    const m = await loadModule()
    expect(m.getGeminiKey()).toBe('AIza-user-key')
    expect(m.isGeminiConfigured).toBe(true)
    expect(m.geminiKeySource).toBe('user')
  })
})

describe('setGeminiKey', () => {
  it('persists a new key and updates live state', async () => {
    const m = await loadModule()
    expect(m.setGeminiKey('AIza-new')).toBe(true)
    expect(m.getGeminiKey()).toBe('AIza-new')
    expect(m.getGeminiKeySource()).toBe('user')
    expect(storage.getItem('valence.settings.geminiKey')).toBe('AIza-new')
  })

  it('trims whitespace before storing', async () => {
    const m = await loadModule()
    m.setGeminiKey('   AIza-spaces   ')
    expect(m.getGeminiKey()).toBe('AIza-spaces')
    expect(storage.getItem('valence.settings.geminiKey')).toBe('AIza-spaces')
  })

  it('clearGeminiKey removes the stored key', async () => {
    const m = await loadModule()
    m.setGeminiKey('AIza-temp')
    expect(m.isGeminiConfigured).toBe(true)
    m.clearGeminiKey()
    expect(m.getGeminiKey()).toBeNull()
    // Clearing the user key drops back to the managed fallback, not 'none'.
    expect(m.getGeminiKeySource()).toBe('managed')
    expect(storage.getItem('valence.settings.geminiKey')).toBeNull()
  })

  it('setGeminiKey with empty string clears', async () => {
    const m = await loadModule()
    m.setGeminiKey('AIza-temp')
    m.setGeminiKey('')
    expect(m.getGeminiKey()).toBeNull()
  })

  it('handles non-string input safely', async () => {
    const m = await loadModule()
    m.setGeminiKey(null)
    expect(m.getGeminiKey()).toBeNull()
    m.setGeminiKey(undefined)
    expect(m.getGeminiKey()).toBeNull()
  })
})

describe('localStorage unavailable / blocked', () => {
  it('readUserGeminiKey does not throw and returns null', async () => {
    vi.stubGlobal('window', {})
    const m = await loadModule()
    expect(m.getGeminiKey()).toBeNull()
    // No user key available (storage blocked) → managed fallback.
    expect(m.geminiKeySource).toBe('managed')
  })

  it('setGeminiKey returns false when storage throws', async () => {
    vi.stubGlobal('window', {
      get localStorage() { throw new Error('blocked') }
    })
    const m = await loadModule()
    expect(m.setGeminiKey('AIza-x')).toBe(false)
  })
})

describe('testGeminiKey', () => {
  it('returns ok:false with explanatory error when no key is given', async () => {
    const m = await loadModule()
    const r = await m.testGeminiKey('')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/no key/i)
  })

  it('returns ok:true on a 200 response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })))
    const m = await loadModule()
    const r = await m.testGeminiKey('AIza-ok')
    expect(r.ok).toBe(true)
  })

  it('returns ok:false with API error message on a 4xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'API key not valid' } })
    })))
    const m = await loadModule()
    const r = await m.testGeminiKey('AIza-bad')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('API key not valid')
  })

  it('returns ok:false with HTTP status when body is unparseable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => { throw new Error('bad json') }
    })))
    const m = await loadModule()
    const r = await m.testGeminiKey('AIza-down')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('HTTP 503')
  })

  it('returns ok:false with network error on fetch reject', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('connection refused') }))
    const m = await loadModule()
    const r = await m.testGeminiKey('AIza-net')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('connection refused')
  })
})
