import { createContext, useContext, useEffect, useState, useMemo } from 'react'

// Two-mode UX: 'simple' for partners scanning a page, 'detailed' for analysts
// digging in. Persisted per-route in localStorage so a user's mode preference
// for one page doesn't override another.

const Ctx = createContext({ get: () => 'simple', set: () => {} })

const KEY = 'valence.viewMode.v1'

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') }
  catch { return {} }
}
function writeAll(map) {
  try { localStorage.setItem(KEY, JSON.stringify(map)) } catch {}
}

export function ViewModeProvider({ children }) {
  const [map, setMap] = useState(() => readAll())

  useEffect(() => { writeAll(map) }, [map])

  const value = useMemo(() => ({
    get: (page) => map[page] || 'simple',
    set: (page, mode) => setMap(prev => ({ ...prev, [page]: mode }))
  }), [map])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useViewMode(pageKey) {
  const ctx = useContext(Ctx)
  return {
    mode: ctx.get(pageKey),
    isSimple: ctx.get(pageKey) === 'simple',
    isDetailed: ctx.get(pageKey) === 'detailed',
    setMode: (m) => ctx.set(pageKey, m)
  }
}
