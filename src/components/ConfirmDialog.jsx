import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'

const ConfirmCtx = createContext(null)

export function useConfirm() {
  const ctx = useContext(ConfirmCtx)
  if (!ctx) throw new Error('useConfirm used outside ConfirmProvider')
  return ctx
}

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null)
  const resolver = useRef(null)

  const confirm = useCallback((opts) => {
    return new Promise(resolve => {
      resolver.current = resolve
      setState({
        title:        opts?.title         || 'Are you sure?',
        body:         opts?.body          || '',
        confirmLabel: opts?.confirmLabel  || 'Confirm',
        cancelLabel:  opts?.cancelLabel   || 'Cancel',
        destructive:  opts?.destructive   ?? false
      })
    })
  }, [])

  const close = useCallback((result) => {
    setState(null)
    const r = resolver.current
    resolver.current = null
    r?.(result)
  }, [])

  useEffect(() => {
    if (!state) return
    const onKey = (e) => { if (e.key === 'Escape') close(false) }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [state, close])

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 animate-fade-in">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => close(false)} />
          <div className="relative z-10 w-full max-w-md animate-slide-up rounded-2xl border border-valence-border-strong bg-valence-surface shadow-valence">
            <div className="flex items-start justify-between px-6 pt-6">
              <div className="flex items-center gap-3">
                <div className={`grid h-10 w-10 place-items-center rounded-xl border ${state.destructive ? 'border-valence-danger/30 bg-valence-danger/10 text-valence-danger' : 'border-valence-blue/30 bg-valence-blue-soft text-valence-blue'}`}>
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <h2 className="text-base font-semibold tracking-tight text-white">{state.title}</h2>
              </div>
              <button onClick={() => close(false)} className="vl-btn-ghost -mr-2 -mt-1" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            {state.body && (
              <p className="px-6 pt-3 text-sm leading-relaxed text-valence-muted">{state.body}</p>
            )}
            <div className="flex items-center justify-end gap-2 px-6 py-5">
              <button onClick={() => close(false)} className="vl-btn-secondary">{state.cancelLabel}</button>
              <button
                autoFocus
                onClick={() => close(true)}
                className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition focus:outline-none focus:ring-2 ${
                  state.destructive
                    ? 'bg-valence-danger hover:bg-valence-danger/90 focus:ring-valence-danger/40'
                    : 'bg-valence-blue hover:bg-valence-blue-hover focus:ring-valence-blue-ring'
                }`}
              >
                {state.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  )
}
