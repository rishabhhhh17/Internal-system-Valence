import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// llmProviders.js reads localStorage at call time (not import time, except
// for the legacy slot). We still re-import per test to get a clean state
// in case other tests pollute the module cache.

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

async function load() {
  return await import('../lib/llmProviders.js?t=' + Date.now())
}

describe('provider catalogue', () => {
  it('lists at least Gemini, OpenAI, Anthropic, Vercel AI Gateway, and a custom slot', async () => {
    const m = await load()
    const ids = m.PROVIDERS.map(p => p.id)
    expect(ids).toEqual(expect.arrayContaining(['gemini', 'openai', 'anthropic', 'vercel_ai_gateway', 'custom_openai']))
  })

  it('every provider has at least one model with a default that exists in the model list', async () => {
    const m = await load()
    for (const p of m.PROVIDERS) {
      expect(p.models.length).toBeGreaterThan(0)
      expect(p.models.some(mod => mod.id === p.defaultModel)).toBe(true)
    }
  })

  it('only Gemini is marked managed', async () => {
    const m = await load()
    const managed = m.PROVIDERS.filter(p => p.managed).map(p => p.id)
    expect(managed).toEqual(['gemini'])
  })
})

describe('active provider + model resolution', () => {
  it('falls back to Gemini default when nothing is set', async () => {
    const m = await load()
    expect(m.getActiveProviderId()).toBe('gemini')
    expect(m.getActiveModelId()).toBe('gemini-2.0-flash')
  })

  it('honours a stored provider + model', async () => {
    storage.setItem('valence.settings.llm.provider', 'openai')
    storage.setItem('valence.settings.llm.model', 'gpt-4o')
    const m = await load()
    expect(m.getActiveProviderId()).toBe('openai')
    expect(m.getActiveModelId()).toBe('gpt-4o')
  })

  it('falls back to the provider default if the stored model is unknown for the provider', async () => {
    storage.setItem('valence.settings.llm.provider', 'openai')
    storage.setItem('valence.settings.llm.model', 'gemini-2.0-flash') // wrong provider
    const m = await load()
    expect(m.getActiveModelId()).toBe('gpt-4o-mini')
  })

  it('setActiveProvider snaps to provider default when no model is supplied', async () => {
    const m = await load()
    expect(m.setActiveProvider('anthropic')).toBe(true)
    expect(m.getActiveProviderId()).toBe('anthropic')
    expect(m.getActiveModelId()).toBe('claude-3-5-haiku-latest')
  })

  it('setActiveProvider with explicit model persists both', async () => {
    const m = await load()
    expect(m.setActiveProvider('openai', 'gpt-4o')).toBe(true)
    expect(m.getActiveModelId()).toBe('gpt-4o')
  })

  it('setActiveProvider rejects unknown providers', async () => {
    const m = await load()
    expect(m.setActiveProvider('groq-direct')).toBe(false)
  })
})

describe('per-provider API keys', () => {
  it('starts empty for every provider', async () => {
    const m = await load()
    for (const p of m.PROVIDERS) {
      expect(m.getApiKey(p.id)).toBeNull()
    }
  })

  it('persists a key under its provider slot only', async () => {
    const m = await load()
    m.setApiKey('openai', 'sk-openai-key')
    expect(m.getApiKey('openai')).toBe('sk-openai-key')
    expect(m.getApiKey('anthropic')).toBeNull()
  })

  it('Gemini key is mirrored to the legacy slot so old code keeps working', async () => {
    const m = await load()
    m.setApiKey('gemini', 'AIza-new')
    expect(storage.getItem('valence.settings.geminiKey')).toBe('AIza-new')
  })

  it('legacy gemini slot is honoured when the new slot is empty', async () => {
    storage.setItem('valence.settings.geminiKey', 'AIza-legacy')
    const m = await load()
    expect(m.getApiKey('gemini')).toBe('AIza-legacy')
  })

  it('clearApiKey wipes the slot', async () => {
    const m = await load()
    m.setApiKey('anthropic', 'sk-ant-key')
    m.clearApiKey('anthropic')
    expect(m.getApiKey('anthropic')).toBeNull()
  })

  it('trims whitespace before storing', async () => {
    const m = await load()
    m.setApiKey('openai', '   sk-spaces   ')
    expect(m.getApiKey('openai')).toBe('sk-spaces')
  })
})

describe('isProviderConfigured', () => {
  it('Gemini is always configured even without a user key (managed by server)', async () => {
    const m = await load()
    expect(m.isProviderConfigured('gemini')).toBe(true)
  })

  it('non-managed providers require a user key', async () => {
    const m = await load()
    expect(m.isProviderConfigured('openai')).toBe(false)
    m.setApiKey('openai', 'sk-test')
    expect(m.isProviderConfigured('openai')).toBe(true)
  })
})

describe('getActiveConfig', () => {
  it('returns a snapshot of provider + model + key + configured flag', async () => {
    const m = await load()
    m.setActiveProvider('openai', 'gpt-4o-mini')
    m.setApiKey('openai', 'sk-foo')
    const cfg = m.getActiveConfig()
    expect(cfg.providerId).toBe('openai')
    expect(cfg.modelId).toBe('gpt-4o-mini')
    expect(cfg.apiKey).toBe('sk-foo')
    expect(cfg.configured).toBe(true)
  })

  it('for custom_openai includes the baseUrl', async () => {
    const m = await load()
    m.setActiveProvider('custom_openai')
    m.setApiKey('custom_openai', 'foo')
    m.setCustomBaseUrl('https://example.com/v1')
    const cfg = m.getActiveConfig()
    expect(cfg.baseUrl).toBe('https://example.com/v1')
  })

  it('SSR-safe — does not throw when window is undefined', async () => {
    vi.stubGlobal('window', undefined)
    const m = await load()
    expect(() => m.getActiveConfig()).not.toThrow()
  })
})
