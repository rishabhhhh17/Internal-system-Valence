// Global pipeline mode — flips the whole app between the two pipelines:
//   'company' — founders / potential portfolio companies (the deal pipeline)
//   'lp'      — LP fundraising conversations
// Note: the mode id stays 'company' (and deals.kind='company') for back-compat;
// only the user-facing label is "Founders".
// Persisted in localStorage and broadcast via a custom event so every
// component using usePipelineMode() re-renders (and re-fetches) on a toggle,
// without threading a context provider through the tree.

import { useEffect, useState } from 'react'

const KEY = 'valence.pipelineMode'
const EVT = 'valence:pipeline-mode'

export const PIPELINE_MODES = [
  { id: 'company', label: 'Founders', sub: 'Deal pipeline' },
  { id: 'lp',      label: 'LPs',      sub: 'Fundraising' }
]

export function getPipelineMode() {
  try {
    return window.localStorage?.getItem(KEY) === 'lp' ? 'lp' : 'company'
  } catch { return 'company' }
}

export function setPipelineMode(mode) {
  const m = mode === 'lp' ? 'lp' : 'company'
  try { window.localStorage?.setItem(KEY, m) } catch { /* private mode */ }
  try { window.dispatchEvent(new CustomEvent(EVT, { detail: m })) } catch { /* SSR */ }
}

// Human label for the entity in the current mode — "founder" vs "LP".
export function modeNoun(mode, { cap = false, plural = false } = {}) {
  const base = mode === 'lp' ? (plural ? 'LPs' : 'LP') : (plural ? 'founders' : 'founder')
  return cap && mode !== 'lp' ? base.charAt(0).toUpperCase() + base.slice(1) : base
}

export function usePipelineMode() {
  const [mode, setMode] = useState(getPipelineMode)
  useEffect(() => {
    const onChange = () => setMode(getPipelineMode())
    window.addEventListener(EVT, onChange)
    window.addEventListener('storage', onChange) // cross-tab sync
    return () => {
      window.removeEventListener(EVT, onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [])
  return [mode, setPipelineMode]
}
