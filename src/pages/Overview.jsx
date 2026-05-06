import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { differenceInDays, isWithinInterval, parseISO, startOfToday, addDays } from 'date-fns'
import {
  Activity, AlertTriangle, ArrowUpRight, BarChart3, BookOpen, Briefcase,
  CalendarClock, FileSearch, Flame, Handshake
} from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { stageMeta } from '../lib/stages.js'
import { useViewMode } from '../hooks/useViewMode.jsx'
import ConfigBanner from '../components/ConfigBanner.jsx'
import MorningBriefing from '../components/MorningBriefing.jsx'
import ViewModeToggle from '../components/ViewModeToggle.jsx'

const ACTIVE_MANDATE_STAGES = ['Mandate', 'Preparation', 'Marketing', 'Diligence', 'Negotiation', 'Closing']
const STALE_THRESHOLD_DAYS = 30

export default function Overview() {
  const { isDetailed } = useViewMode('overview')
  const [deals, setDeals] = useState([])
  const [activities, setActivities] = useState([])

  useEffect(() => {
    if (!isSupabaseConfigured) return
    ;(async () => {
      const [d, a] = await Promise.all([
        supabase.from('deals').select('id, client_name, stage, sector, lead_owner, expected_close_date, target_close, nda_status, ticket_size_usd_m, fee_success_pct, fee_retainer_usd, updated_at, created_at'),
        supabase.from('activities').select('deal_id, kind, created_at').eq('kind', 'stage_change')
      ])
      if (d.data) setDeals(d.data)
      if (a.data) setActivities(a.data)
    })()
  }, [])

  const ops = useMemo(() => computeOps(deals, activities), [deals, activities])
  const attention = useMemo(() => computeAttention(deals, activities), [deals, activities])

  return (
    <div className="space-y-10">
      <div className="flex justify-end">
        <ViewModeToggle pageKey="overview" />
      </div>
      <ConfigBanner />

      <MorningBriefing />

      {/* Pipeline pulse — operational, not money */}
      <section>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="vl-eyebrow-ink">Pipeline pulse</p>
            <p className="mt-1 text-xs text-valence-muted">Live state of the book — flow, not fees.</p>
          </div>
          <Link to="/analytics" className="inline-flex items-center gap-1.5 text-xs font-semibold text-valence-blue hover:text-valence-blue-hover">
            <BarChart3 className="h-3.5 w-3.5" /> Open Analytics <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-valence-border bg-valence-border lg:grid-cols-4">
          <PulseCell label="Live mandates"      value={ops.live}      sub={ops.live ? 'Engaged through Closing' : 'No active mandates'} icon={Handshake}     accent />
          <PulseCell label="In diligence"       value={ops.diligence} sub={ops.diligence ? 'Counterparties in the room' : 'Nothing in DD'}      icon={FileSearch} />
          <PulseCell label="Closing this month" value={ops.closing30} sub={ops.closing30 ? 'Target close within 30 days' : 'Nothing closing in 30d'} icon={CalendarClock} />
          <PulseCell label="Stalled"            value={ops.stalled}   sub={ops.stalled ? `> ${STALE_THRESHOLD_DAYS} days in stage` : 'Nothing stalled'}        icon={Flame} />
        </div>
      </section>

      {/* Needs attention — operational triage list. Detailed view only. */}
      {isDetailed && <section className="vl-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-valence-warning" />
            <p className="vl-eyebrow-ink">Needs attention</p>
          </div>
          <Link to="/deals" className="text-[11px] font-semibold text-valence-blue hover:text-valence-blue-hover">
            Open Deal Logger <ArrowUpRight className="inline h-3 w-3" />
          </Link>
        </div>
        {attention.length === 0 ? (
          <div className="rounded-xl border border-dashed border-valence-border bg-valence-surface px-5 py-6 text-center">
            <p className="text-sm text-valence-muted">Nothing flagged. Book is clean.</p>
          </div>
        ) : (
          <ul className="divide-y divide-valence-border/60">
            {attention.map(item => (
              <li key={item.id} className="flex items-start gap-3 py-3">
                <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${SEVERITY_DOT[item.severity]}`} />
                <div className="min-w-0 flex-1">
                  <Link to={`/deals?open=${item.deal_id}`} className="text-sm text-valence-text hover:text-valence-blue">
                    {item.message}
                  </Link>
                  {item.detail && <p className="mt-0.5 text-[11px] text-valence-muted">{item.detail}</p>}
                </div>
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-valence-subtle">{item.severity}</span>
              </li>
            ))}
          </ul>
        )}
      </section>}

      {/* Quiet jump row — two lightweight shortcuts */}
      <section className="grid gap-4 md:grid-cols-2">
        <JumpCard to="/deals"     icon={Briefcase} title="Deal Logger" body="Every live mandate — funnel, rooms, briefs." />
        <JumpCard to="/knowledge" icon={BookOpen}  title="Knowledge"   body="Firm memos, comps, and your private Drive." />
      </section>
    </div>
  )
}

const SEVERITY_DOT = {
  high: 'bg-valence-danger',
  warn: 'bg-valence-warning',
  info: 'bg-valence-blue'
}

function computeOps(deals, activities) {
  const today = startOfToday()
  const horizon = addDays(today, 30)
  const live = deals.filter(d => ACTIVE_MANDATE_STAGES.includes(d.stage)).length
  const diligence = deals.filter(d => d.stage === 'Diligence').length

  const closing30 = deals.filter(d => {
    if (!['Closing', 'Negotiation'].includes(d.stage)) return false
    const iso = d.expected_close_date || d.target_close
    if (!iso) return false
    const t = typeof iso === 'string' ? parseISO(iso) : new Date(iso)
    if (Number.isNaN(t.getTime())) return false
    return isWithinInterval(t, { start: today, end: horizon })
  }).length

  const lastChange = new Map()
  for (const a of activities) {
    const t = new Date(a.created_at)
    const prev = lastChange.get(a.deal_id)
    if (!prev || t > prev) lastChange.set(a.deal_id, t)
  }
  const stalled = deals.filter(d => {
    if (stageMeta(d.stage).terminal) return false
    const since = lastChange.get(d.id) || new Date(d.updated_at || d.created_at || today)
    return differenceInDays(today, since) > STALE_THRESHOLD_DAYS
  }).length

  return { live, diligence, closing30, stalled }
}

function computeAttention(deals, activities) {
  const today = startOfToday()
  const horizon7 = addDays(today, 7)
  const lastChange = new Map()
  for (const a of activities) {
    const t = new Date(a.created_at)
    const prev = lastChange.get(a.deal_id)
    if (!prev || t > prev) lastChange.set(a.deal_id, t)
  }

  const items = []
  for (const d of deals) {
    if (stageMeta(d.stage).terminal) continue
    const name = d.client_name || 'Untitled mandate'

    const since = lastChange.get(d.id) || new Date(d.updated_at || d.created_at || today)
    const days = differenceInDays(today, since)
    if (days > STALE_THRESHOLD_DAYS) {
      items.push({ id: `${d.id}-stale`, deal_id: d.id, severity: 'warn', message: `${name} — ${days} days in ${d.stage}`, detail: 'Stage hasn\'t moved. Worth a touch.' })
    }

    const closeIso = d.expected_close_date || d.target_close
    if (closeIso && ['Closing', 'Negotiation'].includes(d.stage)) {
      const t = typeof closeIso === 'string' ? parseISO(closeIso) : new Date(closeIso)
      if (!Number.isNaN(t.getTime()) && isWithinInterval(t, { start: today, end: horizon7 })) {
        items.push({ id: `${d.id}-close`, deal_id: d.id, severity: 'high', message: `${name} — target close within 7 days`, detail: `Stage: ${d.stage}` })
      }
    }

    if (['Mandate', 'Preparation', 'Marketing', 'Diligence'].includes(d.stage) && d.nda_status === 'Pending') {
      items.push({ id: `${d.id}-nda`, deal_id: d.id, severity: 'info', message: `${name} — NDA still pending past Mandate`, detail: 'Chase the counterparty.' })
    }

    if (!d.lead_owner) {
      items.push({ id: `${d.id}-owner`, deal_id: d.id, severity: 'warn', message: `${name} — no lead owner assigned`, detail: 'Pick someone before next stage.' })
    }
  }

  const order = { high: 0, warn: 1, info: 2 }
  return items.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 5)
}

function PulseCell({ label, value, sub, icon: Icon, accent = false }) {
  return (
    <div className={`bg-white p-6 ${accent ? 'ring-1 ring-valence-blue/20' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="vl-eyebrow-ink">{label}</span>
        <Icon className={`h-3.5 w-3.5 ${accent ? 'text-valence-blue' : 'text-valence-subtle'}`} />
      </div>
      <p className="mt-3 font-display text-2xl font-bold tracking-[-0.02em] text-valence-text tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-[11px] text-valence-muted">{sub}</p>}
    </div>
  )
}

function JumpCard({ to, icon: Icon, title, body }) {
  return (
    <Link to={to} className="vl-card vl-card-hover group block p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-valence-surface border border-valence-border shrink-0">
          <Icon className="h-4 w-4 text-valence-muted group-hover:text-valence-blue transition" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-valence-text flex items-center justify-between">
            {title}
            <ArrowUpRight className="h-3.5 w-3.5 text-valence-subtle group-hover:text-valence-blue transition" />
          </p>
          <p className="mt-1 text-xs leading-relaxed text-valence-muted">{body}</p>
        </div>
      </div>
    </Link>
  )
}
