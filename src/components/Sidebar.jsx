import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Briefcase, BookOpen, CalendarDays, CalendarRange, Users, BarChart3, MessageSquare, Handshake, GanttChartSquare, Building2, Sparkles, Inbox, UserCircle } from 'lucide-react'
import Logo from './Logo.jsx'
import { supabase, isSupabaseConfigured, subscribeTable } from '../lib/supabase.js'

const TERMINAL_STAGES  = new Set(['Closed', 'Lost', 'On Hold'])
const LIVE_MANDATE_STAGES = new Set(['Mandate', 'Preparation', 'Marketing', 'Diligence', 'Negotiation', 'Closing'])

const nav = [
  { to: '/',             label: 'Today',        icon: LayoutDashboard },
  { to: '/deals',        label: 'Deal Logger',  icon: Briefcase,     badgeKey: 'activeDeals' },
  { to: '/mandates',     label: 'Live Mandates',icon: Handshake,     badgeKey: 'liveMandates' },
  { to: '/timeline',     label: 'Timeline',     icon: GanttChartSquare },
  { to: '/interactions', label: 'Interactions', icon: MessageSquare, badgeKey: 'pendingFollowUps', section: 'Relationships' },
  { to: '/people',       label: 'People',       icon: UserCircle,                                section: 'Relationships' },
  { to: '/funds',        label: 'Firm',         icon: Building2,                                 section: 'Relationships' },
  { to: '/screen',       label: 'Quick Screener',icon: Sparkles,                                 section: 'AI' },
  { to: '/inbox/intake', label: 'Intake inbox', icon: Inbox,        badgeKey: 'newIntakes',     section: 'AI' },
  { to: '/knowledge',    label: 'Knowledge',    icon: BookOpen },
  { to: '/planner',      label: 'Day Planner',  icon: CalendarDays,  badgeKey: 'todayMeetings' },
  { to: '/calendar',     label: 'Team Calendar',icon: CalendarRange },
  { to: '/analytics',    label: 'Analytics',    icon: BarChart3 },
  { to: '/team',         label: 'Team',         icon: Users }
]

function groupNav(items) {
  const out = []
  const seen = new Map()
  for (const item of items) {
    const section = item.section || 'Workspace'
    if (!seen.has(section)) { seen.set(section, out.length); out.push([section, []]) }
    out[seen.get(section)][1].push(item)
  }
  return out
}

function useSidebarCounts() {
  const [counts, setCounts] = useState({ activeDeals: 0, todayMeetings: 0, pendingFollowUps: 0, liveMandates: 0, newIntakes: 0 })

  async function load() {
    if (!isSupabaseConfigured) return
    const todayIso = new Date().toISOString().slice(0, 10)
    const [d, m, i, ix] = await Promise.all([
      supabase.from('deals').select('stage'),
      supabase.from('meetings').select('id', { count: 'exact', head: true }).eq('date', todayIso),
      supabase.from('interactions').select('id', { count: 'exact', head: true }).not('follow_up_date', 'is', null).lte('follow_up_date', todayIso),
      supabase.from('intake_submissions').select('id', { count: 'exact', head: true }).eq('status', 'new')
    ])
    const stageRows = d.data || []
    const active = stageRows.filter(x => !TERMINAL_STAGES.has(x.stage)).length
    const live = stageRows.filter(x => LIVE_MANDATE_STAGES.has(x.stage)).length
    setCounts({ activeDeals: active, todayMeetings: m.count || 0, pendingFollowUps: i.count || 0, liveMandates: live, newIntakes: ix.count || 0 })
  }

  useEffect(() => {
    load()
    if (!isSupabaseConfigured) return
    const offs = [
      subscribeTable('deals', load),
      subscribeTable('meetings', load),
      subscribeTable('interactions', load),
      subscribeTable('intake_submissions', load)
    ]
    return () => offs.forEach(o => o?.())
  }, [])

  return counts
}

export default function Sidebar() {
  const counts = useSidebarCounts()

  return (
    <aside className="hidden lg:flex lg:sticky lg:top-0 lg:h-screen lg:w-64 shrink-0 flex-col border-r border-valence-border vl-glass-side">
      <div className="flex h-16 items-center px-5 border-b border-valence-border">
        <Logo />
      </div>

      <nav className="flex-1 px-3 py-6 space-y-0.5 overflow-y-auto">
        {groupNav(nav).map(([sectionLabel, items], gi) => (
          <div key={sectionLabel} className={gi === 0 ? '' : 'pt-4'}>
            <div className="px-3 pb-3 vl-eyebrow-ink">{sectionLabel}</div>
            {items.map(({ to, label, icon: Icon, badgeKey }) => {
              const badge = badgeKey ? counts[badgeKey] : 0
              return (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  data-tour={`nav-${to === '/' ? 'today' : to.replace(/^\//, '').replace(/\//g, '-')}`}
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
                      <span className="flex-1 tracking-tight">{label}</span>
                      {badge > 0 && (
                        <span className={`inline-flex items-center justify-center rounded-full px-1.5 py-0 text-[10px] font-semibold tabular-nums ${
                          isActive
                            ? 'bg-white/15 text-white'
                            : 'bg-valence-blue-soft text-valence-blue'
                        }`}>
                          {badge > 99 ? '99+' : badge}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              )
            })}
          </div>
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
