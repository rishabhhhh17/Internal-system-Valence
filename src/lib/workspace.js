// Workspace preferences — firm name, density, etc. localStorage-backed
// so they survive reloads without a Supabase round-trip. Pub/sub helper
// lets the topbar / logo re-render when the partner edits a value from
// the Settings page.

const PREFIX = 'valence.workspace.'

export const WORKSPACE_KEYS = Object.freeze({
  firmName:    'firmName',
  firmKicker:  'firmKicker',
  density:     'density',           // 'comfortable' | 'compact'
  browserTitle:'browserTitle'
})

export const WORKSPACE_DEFAULTS = Object.freeze({
  firmName: 'Valence',
  firmKicker: 'Growth Partners',
  density: 'comfortable',
  browserTitle: ''  // empty = use the firm name
})

const VALID_DENSITY = new Set(['comfortable', 'compact'])

function safeStorage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage
  } catch {
    return null
  }
}

function fullKey(key) {
  return PREFIX + key
}

// ============ READ / WRITE ============

export function getWorkspaceSetting(key, fallback) {
  const store = safeStorage()
  const fb = fallback === undefined ? (WORKSPACE_DEFAULTS[key] ?? '') : fallback
  if (!store) return fb
  const raw = store.getItem(fullKey(key))
  if (raw === null) return fb
  if (key === WORKSPACE_KEYS.density) {
    return VALID_DENSITY.has(raw) ? raw : fb
  }
  return raw
}

export function setWorkspaceSetting(key, value) {
  const store = safeStorage()
  if (!store) return false
  if (!Object.values(WORKSPACE_KEYS).includes(key)) return false
  // Density only accepts a known token.
  if (key === WORKSPACE_KEYS.density && value && !VALID_DENSITY.has(value)) return false
  try {
    const v = value === null || value === undefined ? '' : String(value).trim()
    if (v === '' || v === WORKSPACE_DEFAULTS[key]) {
      store.removeItem(fullKey(key))
    } else {
      store.setItem(fullKey(key), v)
    }
  } catch {
    return false
  }
  emit(key)
  return true
}

export function clearWorkspaceSetting(key) {
  return setWorkspaceSetting(key, '')
}

// ============ PUB/SUB ============
// Components subscribe to specific keys; emit fires after a successful
// write so the topbar / logo re-render without a manual reload.

const subscribers = new Set()

function emit(key) {
  for (const fn of subscribers) {
    try { fn(key) } catch { /* swallow — subscriber bug shouldn't break others */ }
  }
  // Cross-tab support: localStorage 'storage' event already fires for
  // other tabs; we ping our own tab here.
}

export function subscribeWorkspace(callback) {
  if (typeof callback !== 'function') return () => {}
  subscribers.add(callback)
  return () => subscribers.delete(callback)
}

// ============ DERIVED ============

export function effectiveBrowserTitle() {
  const explicit = getWorkspaceSetting(WORKSPACE_KEYS.browserTitle, '')
  if (explicit && explicit.trim()) return explicit.trim()
  const firmName = getWorkspaceSetting(WORKSPACE_KEYS.firmName, WORKSPACE_DEFAULTS.firmName)
  return `${firmName}OS`
}
