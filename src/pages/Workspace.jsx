import { Suspense, lazy, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarDays, CalendarRange, BookOpen } from 'lucide-react'

// Workspace consolidates the three "day surfaces" that used to each own a
// sidebar row — Day Planner, Team Calendar, and Knowledge — behind one nav
// entry with an in-page toggle. Fewer tabs on the left; the same tools one
// click away. Each child is the untouched page component, lazy-loaded so we
// only pull the chunk for the tab actually in view.
const Planner          = lazy(() => import('./Planner.jsx'))
const Calendar         = lazy(() => import('./Calendar.jsx'))
const KnowledgeLanding = lazy(() => import('./KnowledgeLanding.jsx'))

const TABS = [
  { id: 'planner',   label: 'Day Planner',   icon: CalendarDays,  Comp: Planner },
  { id: 'calendar',  label: 'Team Calendar', icon: CalendarRange, Comp: Calendar },
  { id: 'knowledge', label: 'Knowledge',     icon: BookOpen,      Comp: KnowledgeLanding },
]

const LS_KEY = 'valence.workspace.tab'

function isValid(id) { return TABS.some(t => t.id === id) }

export default function Workspace() {
  const [params, setParams] = useSearchParams()
  const urlTab = params.get('tab')

  const [tab, setTab] = useState(() => {
    if (isValid(urlTab)) return urlTab
    try { const s = window.localStorage.getItem(LS_KEY); if (isValid(s)) return s } catch {}
    return 'planner'
  })

  // Follow deep-links: if the URL tab changes out from under us, mirror it.
  useEffect(() => {
    if (isValid(urlTab) && urlTab !== tab) setTab(urlTab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTab])

  function select(id) {
    setTab(id)
    try { window.localStorage.setItem(LS_KEY, id) } catch {}
    const next = new URLSearchParams(params)
    next.set('tab', id)
    setParams(next, { replace: true })
  }

  const Active = (TABS.find(t => t.id === tab) || TABS[0]).Comp

  return (
    <div className="space-y-6">
      <div
        role="group"
        aria-label="Workspace section"
        className="inline-flex items-center rounded-lg border border-valence-border bg-valence-elevated p-0.5"
      >
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = id === tab
          return (
            <button
              key={id}
              onClick={() => select(id)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                active
                  ? 'bg-valence-ink text-white shadow-sm'
                  : 'text-valence-muted hover:text-valence-text'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          )
        })}
      </div>

      <Suspense fallback={<div className="text-sm text-valence-muted">Loading…</div>}>
        <Active />
      </Suspense>
    </div>
  )
}
