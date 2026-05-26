import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Briefcase, BookOpen, CalendarDays, CalendarRange, Users, BarChart3, MessageSquare, Handshake, GanttChartSquare, Building2, Sparkles, Inbox, UserCircle, Settings as SettingsIcon, Wallet, Upload, XCircle, FileText, FileUp } from 'lucide-react'
import Logo from './Logo.jsx'
import { supabase, isSupabaseConfigured, subscribeTable } from '../lib/supabase.js'
import { useAllFeatureFlags } from '../hooks/useFeatureFlag.js'

const TERMINAL_STAGES  = new Set(['Closed', 'Lost', 'On Hold'])
const LIVE_MANDATE_STAGES = new Set(['Mandate', 'Preparation', 'Marketing', 'Diligence', 'Negotiation', 'Closing'])

// Each entry can carry an optional `featureId` — when present, the nav
// item only renders when useAllFeatureFlags()[featureId] is true. Items
// without a featureId always show (Today, Knowledge, Team Calendar etc.
// are universal). This is how a VC ends up with a different sidebar
// than an IB without forking the navigation file.
const nav = [
  { to: '/',             label: 'Today',        icon: LayoutDashboard },
  { to: '/deals',        label: 'Deal Status',  icon: Briefcase,     badgeKey: 'liveMandates', featureId: 'deal_status' },
  { to: '/timeline',     label: 'Timeline',     icon: GanttChartSquare,                       featureId: 'timeline' },
  { to: '/screen',       label: 'Thesis-Fit',   icon: Sparkles,                               featureId: 'thesis_fit_checker' },
  { to: '/portfolio',    label: 'Portfolio',    icon: Building2,                              featureId: 'portfolio_tracker' },
  { to: '/passes',       label: 'Passes',       icon: XCircle,                                featureId: 'pass_tracker' },
  { to: '/lp-pack',      label: 'LP Pack',      icon: FileText,                               featureId: 'lp_reporting' },
  { to: '/interactions', label: 'Interactions', icon: MessageSquare, badgeKey: 'pendingFollowUps', section: 'Relationships', featureId: 'interactions_feed' },
  { to: '/people',       label: 'People',       icon: UserCircle,                             section: 'Relationships', featureId: 'people_crm' },
  { to: '/funds',        label: 'Firm',         icon: Building2,                              section: 'Relationships' },
  { to: '/import',       label: 'Import',       icon: Upload,                                 section: 'AI' },
  { to: '/deck',         label: 'Deck Summary', icon: FileUp,                                 section: 'AI', featureId: 'deck_summariser' },
  { to: '/inbox/intake', label: 'Intake inbox', icon: Inbox,        badgeKey: 'newIntakes',   section: 'AI', featureId: 'intake_inbox' },
  // Internal-only — what every customer is burning. Hidden once we ship
  // a proper role gate; for now the partner is the only one running this build.
  { to: '/admin/billing', label: 'Billing · admin', icon: Wallet,                             section: 'Admin' },
  { to: '/knowledge',    label: 'Knowledge',    icon: BookOpen },
  { to: '/planner',      label: 'Day Planner',  icon: CalendarDays,  badgeKey: 'todayMeetings', featureId: 'day_planner' },
  { to: '/calendar',     label: 'Team Calendar',icon: CalendarRange,                          featureId: 'team_calendar' },
  // Firm pulse lives as a small topbar icon now — surfaced near the
  // notifications bell rather than in the main nav, since it's a glance-
  // at-it surface, not a destination partners come back to daily.
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
  // Per-org feature flags, keyed by feature id. Used below to filter
  // nav items so a VC ends up with a genuinely different sidebar
  // than an IB without forking this file.
  const flags  = useAllFeatureFlags()
  const visibleNav = nav.filter(item => {
    if (!item.featureId) return true
    // Default to true if the flag hasn't resolved yet (e.g. mid-load)
    // so we don't strip nav out from under the user during a refresh.
    return flags[item.featureId] !== false
  })

  return (
    <aside className="hidden lg:flex lg:sticky lg:top-0 lg:h-screen lg:w-64 shrink-0 flex-col border-r border-valence-border vl-glass-side">
      <div className="flex h-16 items-center px-5 border-b border-valence-border">
        <Logo />
      </div>

      <nav className="flex-1 px-3 py-6 space-y-0.5 overflow-y-auto">
        {groupNav(visibleNav).map(([sectionLabel, items], gi) => (
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

      {/* Sidebar footer — minimal status pip + offices. Drops the marketing
          tagline so the sidebar reads as an operational tool, not a sales
          page. */}
      <div className="px-3 pb-5 pt-2 space-y-2">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              isActive
                ? 'bg-valence-ink text-white'
                : 'text-valence-muted hover:bg-valence-surface hover:text-valence-text'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <SettingsIcon className={`h-4 w-4 ${isActive ? 'text-valence-blue' : 'text-valence-subtle group-hover:text-valence-text'}`} />
              <span className="flex-1 tracking-tight">Settings</span>
            </>
          )}
        </NavLink>
        <div className="flex items-center gap-2 px-2 text-[11px] text-valence-subtle">
          <span className="h-1.5 w-1.5 rounded-full bg-valence-blue shadow-[0_0_6px_#3399FF]" />
          <span className="font-medium text-valence-muted">Mumbai</span>
          <span className="text-valence-subtle/50">·</span>
          <span className="font-medium text-valence-muted">London</span>
        </div>
      </div>
    </aside>
  )
}
