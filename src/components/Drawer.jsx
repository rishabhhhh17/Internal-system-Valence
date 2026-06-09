import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useFocusTrap } from '../hooks/useFocusTrap.js'

export default function Drawer({ open, onClose, title, children, footer }) {
  const panelRef = useRef(null)
  useFocusTrap(panelRef, open)

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
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <div className="absolute inset-0 vl-glass-overlay animate-fade-in" onClick={onClose} />
      {/* Drawer covers the full viewport on mobile (no peek-through) and
          caps at 620px once a laptop has room. Padding tightens on
          narrow widths so labels + values fit without horizontal scroll. */}
      <div ref={panelRef} className="relative ml-auto flex h-full w-full sm:max-w-[620px] animate-slide-in-right flex-col border-l border-white/40 vl-glass-side shadow-valence-lg">
        <div className="flex items-start justify-between border-b border-valence-border/60 px-4 sm:px-6 py-3 sm:py-4 shrink-0">
          {/* Header used to be a single h2 with `truncate`. That clipped
              JSX titles (PersonDrawer + InteractionDrawer now embed a
              counterparty-type chip alongside the name) and squeezed
              InlineEditableText's input during rename. Wrap in a
              min-w-0 flex row so the chip stays visible, and only
              truncate strings — JSX titles render with whatever
              wrapping they bring. */}
          <h2 className="min-w-0 flex-1 text-base font-semibold tracking-tight text-valence-text">
            {typeof title === 'string'
              ? <span className="block truncate">{title}</span>
              : title}
          </h2>
          <button onClick={onClose} className="vl-btn-ghost -mr-2 shrink-0" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5">{children}</div>
        {footer && <div className="border-t border-valence-border/60 px-4 sm:px-6 py-3 sm:py-4 shrink-0 bg-white/60 backdrop-blur-md">{footer}</div>}
      </div>
    </div>
  )
}
