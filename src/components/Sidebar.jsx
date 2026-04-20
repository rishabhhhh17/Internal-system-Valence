import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Briefcase, BookOpen, CalendarDays, Users, BarChart3 } from 'lucide-react'
import Logo from './Logo.jsx'

const nav = [
  { to: '/',          label: 'Overview',        icon: LayoutDashboard },
  { to: '/deals',     label: 'Deal Logger',     icon: Briefcase },
  { to: '/knowledge', label: 'Knowledge',       icon: BookOpen },
  { to: '/planner',   label: 'Day Planner',     icon: CalendarDays },
  { to: '/analytics', label: 'Analytics',       icon: BarChart3 },
  { to: '/team',      label: 'Team',            icon: Users }
]

export default function Sidebar() {
  return (
    <aside className="hidden lg:flex lg:sticky lg:top-0 lg:h-screen lg:w-64 shrink-0 flex-col border-r border-valence-border bg-white">
      <div className="flex h-16 items-center px-5 border-b border-valence-border">
        <Logo />
      </div>

      <nav className="flex-1 px-3 py-6 space-y-0.5">
        <div className="px-3 pb-3 vl-eyebrow-ink">
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
                  ? 'bg-valence-ink text-white'
                  : 'text-valence-muted hover:bg-valence-surface hover:text-valence-text'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={`h-4 w-4 ${isActive ? 'text-valence-blue' : 'text-valence-subtle group-hover:text-valence-text'}`} />
                <span className="tracking-tight">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 pb-5">
        <div className="vl-ink-card p-4 relative overflow-hidden">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-valence-blue/20 blur-2xl" aria-hidden />
          <div className="relative">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-valence-blue shadow-[0_0_8px_#3399FF]" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">Live</p>
            </div>
            <p className="mt-2 text-sm font-semibold text-white leading-tight">
              Mumbai <span className="text-valence-blue">·</span> London
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-white/60">
              Advisory across buy-side and sell-side mandates.
            </p>
          </div>
        </div>
      </div>
    </aside>
  )
}
