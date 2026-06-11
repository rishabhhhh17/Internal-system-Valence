// Per-firm label overrides — clients rename pipeline stages and document
// titles to their own terminology (e.g. "Memo" → "I Memo") without touching
// the stored IDs. Display layers resolve through stageLabel()/docLabel(); the
// DB keeps the stable id/key forever.
//
// Stored as one JSON blob in localStorage. Keys are namespaced by scope so the
// two funnels (and the shared terminal ids) stay independent:
//   stage:  s:<company|lp>:<stageId>
//   doc:    d:<company|lp>:<docKey>
//
// NOTE: localStorage today (matches the rest of the workspace settings) → it's
// per-browser. Moving overrides to an org-scoped table makes them firm-wide;
// that's the follow-up.

const KEY = 'valence.labelOverrides'
const EVT = 'valence:labels'

let cache = null

function read() {
  if (cache) return cache
  try { cache = JSON.parse(window.localStorage?.getItem(KEY) || '{}') || {} }
  catch { cache = {} }
  return cache
}

if (typeof window !== 'undefined') {
  // Cross-tab edits invalidate the in-memory cache.
  window.addEventListener('storage', e => { if (e.key === KEY) cache = null })
}

export function stageOverrideKey(mode, id) { return `s:${mode === 'lp' ? 'lp' : 'company'}:${id}` }
export function docOverrideKey(mode, key)  { return `d:${mode === 'lp' ? 'lp' : 'company'}:${key}` }

export function overrideFor(key) {
  const v = read()[key]
  return v && String(v).trim() ? String(v) : null
}

export function getAllOverrides() { return { ...read() } }

// Set (or clear, when value is empty) one override and notify listeners.
export function setLabelOverride(key, value) {
  const next = { ...read() }
  const trimmed = (value || '').trim()
  if (trimmed) next[key] = trimmed
  else delete next[key]
  cache = next
  try { window.localStorage?.setItem(KEY, JSON.stringify(next)) } catch { /* private mode */ }
  try { window.dispatchEvent(new CustomEvent(EVT)) } catch { /* SSR */ }
  return next
}

export const LABELS_EVENT = EVT
