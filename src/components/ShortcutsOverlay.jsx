import { useEffect, useState } from 'react'
import { Keyboard, X } from 'lucide-react'

const GROUPS = [
  {
    name: 'Navigation',
    items: [
      ['⌘ K',   'Open Command Palette'],
      ['?',     'Show this overlay'],
      ['Esc',   'Close any modal / drawer'],
      ['G then D', 'Go to Deals'],
      ['G then K', 'Go to Knowledge'],
      ['G then P', 'Go to Planner'],
      ['G then V', 'Go to Private (your Drive)'],
      ['G then T', 'Go to Team'],
      ['G then O', 'Go to Overview']
    ]
  },
  {
    name: 'Ask',
    items: [
      ['↵',       'Send question'],
      ['Shift ↵', 'New line inside question']
    ]
  },
  {
    name: 'Deal Logger',
    items: [
      ['Drag', 'Move a card between funnel stages'],
      ['Click row / card', 'Open the deal drawer'],
      ['Tab inside drawer', 'Cycle between Overview / Files / Counterparties / Activity / Similar / AI Brief']
    ]
  }
]

export default function ShortcutsOverlay() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e) => {
      // Open on `?` (shift+/)
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        const tag = (e.target?.tagName || '').toLowerCase()
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape') setOpen(false)

      // g-then-X navigation
      if (!e.metaKey && !e.ctrlKey && e.key.toLowerCase() === 'g') {
        const tag = (e.target?.tagName || '').toLowerCase()
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return
        window._valenceLastG = Date.now()
      } else if (window._valenceLastG && Date.now() - window._valenceLastG < 1200) {
        const tag = (e.target?.tagName || '').toLowerCase()
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return
        const map = { d: '/deals', k: '/knowledge', p: '/planner', v: '/knowledge/private', t: '/team', o: '/' }
        const path = map[e.key.toLowerCase()]
        if (path) {
          window._valenceLastG = 0
          window.history.pushState({}, '', path)
          window.dispatchEvent(new PopStateEvent('popstate'))
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative z-10 w-full max-w-2xl animate-slide-up rounded-2xl border border-valence-border-strong bg-valence-surface shadow-valence">
        <div className="flex items-center justify-between border-b border-valence-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-valence-blue-soft ring-1 ring-valence-blue/30">
              <Keyboard className="h-4 w-4 text-valence-blue" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-valence-text">Keyboard shortcuts</h2>
              <p className="text-[11px] text-valence-muted">Power-user paths. Press <span className="vl-kbd">?</span> anywhere.</p>
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="vl-btn-ghost" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-6 px-6 py-5">
          {GROUPS.map(g => (
            <div key={g.name}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-valence-blue mb-2">{g.name}</p>
              <ul className="space-y-1.5">
                {g.items.map(([keys, label]) => (
                  <li key={label} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-valence-text">{label}</span>
                    <span className="inline-flex items-center gap-1">
                      {keys.split(' ').map((k, i) => (
                        <span key={i} className="vl-kbd">{k}</span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
