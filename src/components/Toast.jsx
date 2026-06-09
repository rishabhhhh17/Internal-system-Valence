import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'

const ToastCtx = createContext(null)

export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast used outside ToastProvider')
  return ctx
}

let seq = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts(t => t.filter(x => x.id !== id))
  }, [])

  const push = useCallback((payload) => {
    const id = ++seq
    const t = { id, kind: 'info', duration: 4200, ...payload }
    setToasts(list => [...list, t])
    if (t.duration > 0) setTimeout(() => dismiss(id), t.duration)
    return id
  }, [dismiss])

  const api = {
    show:    (msg, opts = {}) => push({ message: msg, ...opts }),
    info:    (msg, opts = {}) => push({ message: msg, kind: 'info', ...opts }),
    success: (msg, opts = {}) => push({ message: msg, kind: 'success', ...opts }),
    error:   (msg, opts = {}) => push({ message: msg, kind: 'error', duration: 6000, ...opts }),
    dismiss
  }

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-6 right-6 z-[80] flex w-full max-w-sm flex-col gap-2">
        {toasts.map(t => <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />)}
      </div>
    </ToastCtx.Provider>
  )
}

function ToastItem({ toast, onDismiss }) {
  const Icon = toast.kind === 'success' ? CheckCircle2 : toast.kind === 'error' ? AlertTriangle : Info
  const tone = toast.kind === 'success' ? 'text-valence-success border-valence-success/30 bg-valence-success/10'
             : toast.kind === 'error'   ? 'text-valence-danger  border-valence-danger/30  bg-valence-danger/10'
             :                            'text-valence-blue    border-valence-blue/30    bg-valence-blue-soft'
  return (
    <div className="pointer-events-auto animate-slide-up rounded-xl border border-valence-border-strong bg-valence-surface/95 backdrop-blur-sm shadow-valence">
      <div className="flex items-start gap-3 px-4 py-3">
        <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${tone}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          {toast.title && <p className="text-sm font-semibold text-valence-text">{toast.title}</p>}
          <p className="text-sm leading-snug text-valence-text">{toast.message}</p>
          {toast.action && (
            <button
              type="button"
              onClick={() => { toast.action.onClick?.(); onDismiss() }}
              className="mt-1 text-xs font-semibold text-valence-blue hover:text-valence-blue-hover underline-offset-2 hover:underline"
            >
              {toast.action.label}
            </button>
          )}
        </div>
        <button onClick={onDismiss} className="vl-btn-ghost -mr-1 -mt-1" aria-label="Dismiss">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
