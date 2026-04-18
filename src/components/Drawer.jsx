import { useEffect } from 'react'
import { X } from 'lucide-react'

export default function Drawer({ open, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative ml-auto flex h-full w-full max-w-[520px] animate-slide-in-right flex-col border-l border-valence-border-strong bg-valence-surface shadow-valence">
        <div className="flex items-start justify-between border-b border-valence-border px-6 py-4">
          <h2 className="text-base font-semibold tracking-tight text-valence-text">{title}</h2>
          <button onClick={onClose} className="vl-btn-ghost -mr-2" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="border-t border-valence-border px-6 py-4">{footer}</div>}
      </div>
    </div>
  )
}
