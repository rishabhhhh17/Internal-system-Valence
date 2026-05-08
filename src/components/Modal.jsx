import { useEffect } from 'react'
import { X } from 'lucide-react'

export default function Modal({ open, onClose, title, description, children, size = 'md' }) {
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

  const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-3xl' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 vl-glass-overlay" onClick={onClose} />
      <div className={`relative z-10 w-full ${widths[size]} animate-slide-up vl-glass max-h-[85vh] overflow-hidden flex flex-col`}>
        <div className="flex items-start justify-between border-b border-valence-border px-6 py-4 shrink-0">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-valence-text">{title}</h2>
            {description && <p className="mt-1 text-xs text-valence-muted leading-relaxed">{description}</p>}
          </div>
          <button onClick={onClose} className="vl-btn-ghost -mr-2" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
