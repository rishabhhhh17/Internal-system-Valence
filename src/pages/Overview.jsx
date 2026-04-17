import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Briefcase, BookOpen, CalendarDays, Users, ArrowUpRight,
  TrendingUp, CheckCircle2, Sparkles, Activity
} from 'lucide-react'
import { format } from 'date-fns'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { STAGES, stageMeta, stageToneClasses } from '../lib/stages.js'
import ConfigBanner from '../components/ConfigBanner.jsx'

const demoDeals = [
  { client_name: 'Nimbus Health',    deal_type: 'M&A',   stage: 'Diligence',   nda_status: 'Signed',  sector: 'Healthcare',     ticket_size_usd_m: 180 },
  { client_name: 'Arclight Capital', deal_type: 'PE/VC', stage: 'Origination', nda_status: 'Pending', sector: 'Infrastructure', ticket_size_usd_m: 120 },
  { client_name: 'Quantum Edge',     deal_type: 'ECM',   stage: 'Marketing',   nda_status: 'Signed',  sector: 'Fintech',        ticket_size_usd_m: 250 },
  { client_name: 'Meridian EdTech',  deal_type: 'PE/VC', stage: 'Negotiation', nda_status: 'Signed',  sector: 'EdTech',         ticket_size_usd_m:  35 },
  { client_name: 'Orion Realty',     deal_type: 'PE/VC', stage: 'Closing',     nda_status: 'Signed',  sector: 'Real Estate',    ticket_size_usd_m: 320 }
]

export default function Overview() {
  const [stats, setStats] = useState({ docs: 0, tasks: 0 })
  const [deals, setDeals] = useState(demoDeals)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    ;(async () => {
      const [kb, t, d] = await Promise.all([
        supabase.from('documents').select('*', { count: 'exact', head: true }),
        supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('completed', false),
        supabase.from('deals').select('*').order('created_at', { ascending: false })
      ])
      setStats({ docs: kb.count || 0, tasks: t.count || 0 })
      if (d.data?.length) setDeals(d.data)
    })()
  }, [])

  const today = format(new Date(), "EEEE, d MMMM yyyy")

  const pipeline = useMemo(() => {
    const active = deals.filter(d => !stageMeta(d.stage).terminal)
    const pipelineValue = active.reduce((s, d) => s + (Number(d.ticket_size_usd_m) || 0), 0)
    const closedValue   = deals.filter(d => d.stage === 'Closed').reduce((s, d) => s + (Number(d.ticket_size_usd_m) || 0), 0)
    return {
      totalActive: active.length,
      total: deals.length,
      pipelineValue, closedValue
    }
  }, [deals])

  const funnelCounts = useMemo(() => {
    const g = Object.fromEntries(STAGES.map(s => [s.id, 0]))
    for (const d of deals) if (g[d.stage] != null) g[d.stage] += 1
    return g
  }, [deals])

  const maxFunnel = Math.max(1, ...Object.values(funnelCounts))

  return (
    <div className="space-y-8">
      <ConfigBanner />

      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-valence-border bg-valence-hero p-6 lg:p-10">
        <div className="absolute inset-0 bg-valence-grid opacity-40" aria-hidden />
        <div className="relative">
          <div className="flex items-center gap-2 text-xs font-medium text-valence-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-valence-success shadow-[0_0_8px_#34d399]" />
            Live workspace · {today}
          </div>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-[1.15] tracking-tight text-white lg:text-[40px]">
            A single operating layer for <span className="text-valence-blue">Valence Growth Partners</span>.
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-valence-muted lg:text-base">
            Pipeline, files, knowledge and the day ahead — unified across Mumbai and London.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/deals" className="vl-btn-primary">Open Deal Logger <ArrowUpRight className="h-4 w-4" /></Link>
            <Link to="/planner" className="vl-btn-secondary">Plan the day</Link>
            <span className="inline-flex items-center gap-2 text-xs text-valence-muted pl-3">
              Tip: press <span className="vl-kbd">⌘K</span> anywhere to jump to a deal, doc or counterparty.
            </span>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Pipeline value" value={`$${fmt(pipeline.pipelineValue)}M`} sub={`${pipeline.totalActive} active`} icon={TrendingUp} accent />
        <StatCard label="Closed value"   value={`$${fmt(pipeline.closedValue)}M`}   sub="Success fees recognised" icon={CheckCircle2} />
        <StatCard label="Knowledge docs" value={stats.docs}                          sub="Searchable institutional memory" icon={BookOpen} />
        <StatCard label="Open tasks"     value={stats.tasks}                         sub="Across the team today"          icon={Activity} />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        {/* Funnel snapshot */}
        <div className="lg:col-span-2 vl-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="vl-section-title">The Valence funnel</h2>
              <p className="text-xs text-valence-muted mt-0.5">Where every live mandate sits right now</p>
            </div>
            <Link to="/deals" className="text-xs font-semibold text-valence-blue hover:text-white">View board →</Link>
          </div>
          <ul className="space-y-1.5">
            {STAGES.map(s => {
              const count = funnelCounts[s.id] || 0
              const width = (count / maxFunnel) * 100
              return (
                <li key={s.id} title={s.desc} className="flex items-center gap-3">
                  <span className={`inline-flex w-28 justify-center rounded-full border px-2 py-1 text-[10px] font-semibold ${stageToneClasses(s.id)}`}>
                    {s.id}
                  </span>
                  <div className="flex-1 h-6 rounded-md bg-white/[0.03] overflow-hidden relative">
                    <div
                      className={`h-full rounded-md transition-all ${
                        s.terminal
                          ? (s.id === 'Closed' ? 'bg-valence-success/40' : s.id === 'Lost' ? 'bg-valence-danger/40' : 'bg-valence-warning/40')
                          : 'bg-gradient-to-r from-valence-blue/30 to-valence-blue/80'
                      }`}
                      style={{ width: `${width}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-end pr-2 text-[11px] font-semibold tabular-nums text-white">
                      {count || ''}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Quick actions */}
        <div className="space-y-4">
          <QuickAction to="/deals"     icon={Briefcase}    title="Deal Logger"    body="Kanban + data rooms + AI briefs." />
          <QuickAction to="/knowledge" icon={BookOpen}     title="Knowledge Base" body="Memos, templates and precedent comps." />
          <QuickAction to="/planner"   icon={CalendarDays} title="Day Planner"    body="Meetings, tasks and scheduling assistant." />
          <QuickAction to="/team"      icon={Users}        title="Team Directory" body="Who covers what, at a glance." />
        </div>
      </section>
    </div>
  )
}

function StatCard({ label, value, sub, icon: Icon, accent = false }) {
  return (
    <div className={`vl-card relative overflow-hidden p-5 ${accent ? 'ring-1 ring-valence-blue/20' : ''}`}>
      {accent && <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-valence-blue/10 blur-2xl" aria-hidden />}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-valence-muted">{label}</span>
        <Icon className={`h-4 w-4 ${accent ? 'text-valence-blue' : 'text-valence-subtle'}`} />
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-white">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-valence-muted">{sub}</p>}
    </div>
  )
}

function QuickAction({ to, icon: Icon, title, body }) {
  return (
    <Link to={to} className="vl-card vl-card-hover block p-5 group">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-valence-blue-soft ring-1 ring-valence-blue/20">
          <Icon className="h-4 w-4 text-valence-blue" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-white flex items-center justify-between">
            {title}
            <ArrowUpRight className="h-3.5 w-3.5 text-valence-subtle group-hover:text-valence-blue transition" />
          </p>
          <p className="mt-1 text-xs leading-relaxed text-valence-muted">{body}</p>
        </div>
      </div>
    </Link>
  )
}

function fmt(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString()
}
