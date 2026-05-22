import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Briefcase, BookOpen, CalendarDays, Users, Search,
  Menu, X, MessageSquare, Building2, FolderTree, Activity, Inbox,
  Sparkles, Calendar as CalendarIcon, ListChecks, BarChart3, Settings as SettingsIcon
} from 'lucide-react'

// Primary nav row — five entries that fit comfortably on a 375px iPhone.
const primary = [
  { to: '/',          label: 'Home',     icon: LayoutDashboard },
  { to: '/deals',     label: 'Deals',    icon: Briefcase },
  { to: '/knowledge', label: 'Knowledge',icon: BookOpen },
  { to: '/planner',   label: 'Day',      icon: CalendarDays }
]

// Full route map — every sidebar entry. Anything not in `primary` lives in
// the More sheet so mobile users aren't locked out of Live Mandates /
// Timeline / Interactions / People / Funds / Quick Screener / Intake inbox
// / Team Calendar / Analytics / Team.
const more = [
  { to: '/mandates',    label: 'Live Mandates', icon: ListChecks },
  { to: '/timeline',    label: 'Timeline',      icon: Activity },
  { to: '/calendar',    label: 'Team Calendar', icon: CalendarIcon },
  { to: '/interactions',label: 'Interactions',  icon: MessageSquare },
  { to: '/people',      label: 'People',        icon: Users },
  { to: '/funds',       label: 'Firm',          icon: Building2 },
  // Quick Screener hidden from nav for now — route still resolves.
  // { to: '/screen',      label: 'Quick Screener',icon: Sparkles },
  { to: '/inbox/intake',label: 'Intake inbox',  icon: Inbox },
  { to: '/feed',        label: 'Firm pulse',    icon: Activity },
  { to: '/analytics',   label: 'Analytics',     icon: BarChart3 },
  { to: '/team',        label: 'Team',          icon: FolderTree },
  { to: '/settings',    label: 'Settings',      icon: SettingsIcon }
]

function openPalette() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
}

export default function MobileNav() {
  const [sheetOpen, setSheetOpen] = useState(false)
  const { pathname } = useLocation()

  // Close the sheet automatically on route change so tapping a More entry
  // doesn't leave the overlay sitting on top of the new page.
  useEffect(() => { setSheetOpen(false) }, [pathname])
  useEffect(() => {
    if (!sheetOpen) return
    function onKey(e) { if (e.key === 'Escape') setSheetOpen(false) }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [sheetOpen])

  return (
    <>
      <button
        onClick={openPalette}
        aria-label="Open search"
        className="fixed bottom-20 right-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-valence-ink text-white shadow-ink-glow lg:hidden transition active:scale-95"
      >
        <Search className="h-5 w-5" />
      </button>

      <nav className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 lg:hidden">
        <div className="flex items-center gap-1 rounded-full border border-valence-border bg-white/95 p-1 shadow-valence backdrop-blur">
          {primary.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-semibold transition ${
                  isActive ? 'bg-valence-ink text-white' : 'text-valence-muted'
                }`
              }
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
            </NavLink>
          ))}
          <button
            onClick={() => setSheetOpen(true)}
            className="flex items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-semibold text-valence-muted transition active:scale-95"
            aria-label="More routes"
          >
            <Menu className="h-3.5 w-3.5" />
            <span>More</span>
          </button>
        </div>
      </nav>

      {/* Bottom sheet for everything the primary row can't fit. */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setSheetOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-valence-border bg-valence-elevated shadow-2xl">
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-valence-border">
              <p className="text-sm font-semibold text-valence-text">All sections</p>
              <button onClick={() => setSheetOpen(false)} className="rounded-md p-1 text-valence-muted hover:bg-valence-surface"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-3 grid grid-cols-2 gap-2">
              {[...primary, ...more].map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                      isActive
                        ? 'border-valence-blue/30 bg-valence-blue-soft text-valence-text'
                        : 'border-valence-border bg-valence-elevated text-valence-text active:bg-valence-surface'
                    }`
                  }
                >
                  <Icon className="h-4 w-4 text-valence-blue shrink-0" />
                  <span className="truncate">{label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
