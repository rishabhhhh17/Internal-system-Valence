import { useEffect, useState } from 'react'
import { NavLink, useSearchParams } from 'react-router-dom'
import { LayoutDashboard, Briefcase, BookOpen, CalendarDays, CalendarRange, Users, BarChart3, MessageSquare, Handshake, GanttChartSquare, Building2, Sparkles, Inbox, UserCircle, Settings as SettingsIcon, Wallet, Upload, ChevronDown, ChevronRight, Eye, Trash2, Plus, Clock } from 'lucide-react'
import Logo from './Logo.jsx'
import { supabase, isSupabaseConfigured, subscribeTable } from '../lib/supabase.js'
import { useSavedViews, filtersFromUrl } from '../hooks/useSavedViews.js'
import SaveViewDialog from './SaveViewDialog.jsx'

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
  // Quick Screener (investor ranking) hidden from nav for now — route
  // still resolves so any saved deeplink keeps working.
  // { to: '/screen',       label: 'Quick Screener',icon: Sparkles,                                 section: 'AI' },
  { to: '/import',       label: 'Import',       icon: Upload,                                    section: 'AI' },
  { to: '/inbox/intake', label: 'Intake inbox', icon: Inbox,        badgeKey: 'newIntakes',     section: 'AI' },
  // Internal-only — what every customer is burning. Hidden once we ship
  // a proper role gate; for now the partner is the only one running this build.
  { to: '/admin/billing', label: 'Billing · admin', icon: Wallet,                                section: 'Admin' },
  { to: '/knowledge',    label: 'Knowledge',    icon: BookOpen },
  { to: '/planner',      label: 'Day Planner',  icon: CalendarDays,  badgeKey: 'todayMeetings' },
  { to: '/calendar',     label: 'Team Calendar',icon: CalendarRange },
  // Firm pulse lives as a small topbar icon now — surfaced near the
  // notifications bell rather than in the main nav, since it's a glance-
  // at-it surface, not a destination partners come back to daily.
  { to: '/analytics',    label: 'Analytics',    icon: BarChart3 },
  { to: '/reports/aging',label: 'Aging Report', icon: Clock,        section: 'Reports' },
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

        {/* Saved Views — appended after the main nav so it doesn't intrude
            on the canonical IA. Stays collapsed by default to keep the
            sidebar quiet for users who don't use views. */}
        <SavedViewsSection />
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

// ============ Saved Views section ============
// Lists My Views + Team Views. Clicking a view navigates to /deals with
// that view's filters applied via useSavedViews().applyView(). Both
// sub-groups collapse independently — saved state lives in localStorage
// so the user's preference sticks across reloads.
function SavedViewsSection() {
  const { myViews, teamViews, applyView, deleteView } = useSavedViews()
  const [searchParams] = useSearchParams()
  const [myOpen, setMyOpen]     = useState(() => readBool('valence.sidebar.myViews.open', true))
  const [teamOpen, setTeamOpen] = useState(() => readBool('valence.sidebar.teamViews.open', true))
  const [saveOpen, setSaveOpen] = useState(false)

  // Pull current filters from the URL when the user clicks "+ New view" —
  // that way the dialog pre-populates the chips for whatever pipeline
  // view they're looking at right now. If they're on Today or another
  // non-pipeline page, the dialog will warn them about empty filters.
  const currentFilters = filtersFromUrl(searchParams)

  // Keep the section always visible. Even with zero views, the "+ New
  // view" button is the discovery affordance — without it, nobody finds
  // the feature.
  return (
    <div className="pt-4">
      <div className="px-3 pb-3 flex items-center justify-between">
        <span className="vl-eyebrow-ink">Saved views</span>
        <button
          onClick={() => setSaveOpen(true)}
          className="inline-flex items-center gap-1 rounded text-[10px] font-semibold uppercase tracking-[0.14em] text-valence-blue hover:text-valence-blue-hover transition"
          title="Save current filters as a view"
        >
          <Plus className="h-3 w-3" /> New
        </button>
      </div>

      {myViews.length > 0 && (
        <ViewGroup
          label="My views"
          open={myOpen}
          onToggle={() => { const next = !myOpen; setMyOpen(next); writeBool('valence.sidebar.myViews.open', next) }}
          views={myViews}
          onApply={(v) => applyView(v)}
          onDelete={(v) => { if (confirm(`Delete view “${v.name}”?`)) deleteView(v.id) }}
          showDelete
        />
      )}

      {teamViews.length > 0 && (
        <ViewGroup
          label="Team views"
          open={teamOpen}
          onToggle={() => { const next = !teamOpen; setTeamOpen(next); writeBool('valence.sidebar.teamViews.open', next) }}
          views={teamViews}
          onApply={(v) => applyView(v)}
        />
      )}

      {myViews.length === 0 && teamViews.length === 0 && (
        <p className="px-3 text-[11px] text-valence-subtle italic">
          No views yet — apply filters on Deal Logger, then click <span className="text-valence-blue font-semibold">+ New</span>.
        </p>
      )}

      <SaveViewDialog
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        currentFilters={currentFilters}
      />
    </div>
  )
}

function ViewGroup({ label, open, onToggle, views, onApply, onDelete, showDelete }) {
  return (
    <div className="space-y-0.5">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-valence-subtle hover:text-valence-text transition"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {label}
        <span className="ml-1 text-valence-border">·</span>
        <span className="tabular-nums text-valence-muted">{views.length}</span>
      </button>

      {open && views.map(v => (
        <div key={v.id} className="group flex items-center gap-1 pr-2">
          <button
            onClick={() => onApply(v)}
            className="flex-1 min-w-0 flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-valence-muted hover:bg-valence-surface hover:text-valence-text transition"
            title={v.name}
          >
            <span className="text-sm shrink-0">{v.emoji || <Eye className="h-3.5 w-3.5 text-valence-subtle inline" />}</span>
            <span className="flex-1 truncate text-left tracking-tight">{v.name}</span>
          </button>
          {showDelete && onDelete && (
            <button
              onClick={() => onDelete(v)}
              className="opacity-0 group-hover:opacity-100 transition grid h-6 w-6 place-items-center rounded hover:bg-valence-danger/10 text-valence-subtle hover:text-valence-danger"
              title="Delete view"
              aria-label="Delete view"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function readBool(key, fallback) {
  try {
    const v = window.localStorage?.getItem(key)
    if (v === null || v === undefined) return fallback
    return v === '1'
  } catch { return fallback }
}
function writeBool(key, value) {
  try { window.localStorage?.setItem(key, value ? '1' : '0') } catch {}
}
