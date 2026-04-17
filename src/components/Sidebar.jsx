import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Briefcase, BookOpen, CalendarDays, Users, FolderOpen } from 'lucide-react'
import Logo from './Logo.jsx'

const nav = [
  { to: '/',          label: 'Overview',        icon: LayoutDashboard },
  { to: '/deals',     label: 'Deal Logger',     icon: Briefcase },
  { to: '/knowledge', label: 'Knowledge Base',  icon: BookOpen },
  { to: '/planner',   label: 'Day Planner',     icon: CalendarDays },
  { to: '/drive',     label: 'Drive',           icon: FolderOpen },
  { to: '/team',      label: 'Team Directory',  icon: Users }
]

export default function Sidebar() {
  return (
    <aside className="hidden lg:flex lg:w-64 shrink-0 flex-col border-r border-valence-border bg-valence-surface/60 backdrop-blur-sm">
      <div className="flex h-16 items-center px-5 border-b border-valence-border">
        <Logo />
      </div>

      <nav className="flex-1 px-3 py-5 space-y-1">
        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-valence-subtle">
          Workspace
        </div>
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                isActive
                  ? 'bg-valence-blue-soft text-white ring-1 ring-valence-blue/30'
                  : 'text-valence-muted hover:bg-white/[0.04] hover:text-valence-text'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={`h-4 w-4 ${isActive ? 'text-valence-blue' : 'text-valence-subtle group-hover:text-valence-text'}`} />
                <span>{label}</span>
                {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-valence-blue shadow-[0_0_8px_#3399FF]" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 pb-5">
        <div className="vl-card p-4">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-valence-success shadow-[0_0_8px_#34d399]" />
            <p className="text-xs font-semibold text-white">Mumbai · London</p>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-valence-muted">
            Buy-side &amp; sell-side advisory. Internal operating system for the core team.
          </p>
        </div>
      </div>
    </aside>
  )
}
