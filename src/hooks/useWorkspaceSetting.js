import { useEffect, useState } from 'react'
import {
  getWorkspaceSetting,
  subscribeWorkspace,
  WORKSPACE_DEFAULTS
} from '../lib/workspace.js'

// Reactive read of a workspace setting. Re-renders the calling component
// when the setting changes anywhere in the app (or in another tab via the
// browser's storage event). `fallback` defaults to the registered default
// for the key.
export function useWorkspaceSetting(key, fallback) {
  const [value, setValue] = useState(() => getWorkspaceSetting(key, fallback))

  useEffect(() => {
    const unsubscribe = subscribeWorkspace(changedKey => {
      if (changedKey === key) setValue(getWorkspaceSetting(key, fallback))
    })
    function onStorage(e) {
      if (e?.key && e.key.endsWith(`.${key}`)) {
        setValue(getWorkspaceSetting(key, fallback))
      }
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', onStorage)
    }
    return () => {
      unsubscribe()
      if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
    }
  }, [key, fallback])

  return value
}

export { WORKSPACE_DEFAULTS }
