import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Briefcase, BookOpen, CalendarDays, Users, Search } from 'lucide-react'

const items = [
  { to: '/',          label: 'Home',      icon: LayoutDashboard },
  { to: '/deals',     label: 'Deals',     icon: Briefcase },
  { to: '/knowledge', label: 'Ask',       icon: BookOpen },
  { to: '/planner',   label: 'Day',       icon: CalendarDays },
  { to: '/team',      label: 'Team',      icon: Users }
]

function openPalette() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
}

export default function MobileNav() {
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
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-semibold transition ${
                  isActive
                    ? 'bg-valence-ink text-white'
                    : 'text-valence-muted'
                }`
              }
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  )
}
