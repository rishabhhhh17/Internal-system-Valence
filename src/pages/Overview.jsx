import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Briefcase, BookOpen, CalendarDays, Users, ArrowUpRight,
  TrendingUp, Sparkles, Activity, DollarSign, FolderOpen, ArrowRight
} from 'lucide-react'
import { format } from 'date-fns'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { STAGES, stageMeta, stageToneClasses } from '../lib/stages.js'
import { forecastPipeline } from '../lib/insights.js'
import ConfigBanner from '../components/ConfigBanner.jsx'
import VelocityChart from '../components/VelocityChart.jsx'
import StaleDealsCard from '../components/StaleDealsCard.jsx'
import ExpertsWidget from '../components/ExpertsWidget.jsx'

const demoDeals = [
  { client_name: 'Nimbus Health',    deal_type: 'M&A',   stage: 'Diligence',   nda_status: 'Signed',  sector: 'Healthcare',     ticket_size_usd_m: 180, fee_success_pct: 1.75, fee_retainer_usd: 50000 },
  { client_name: 'Arclight Capital', deal_type: 'PE/VC', stage: 'Origination', nda_status: 'Pending', sector: 'Infrastructure', ticket_size_usd_m: 120, fee_success_pct: 2.00 },
  { client_name: 'Quantum Edge',     deal_type: 'ECM',   stage: 'Marketing',   nda_status: 'Signed',  sector: 'Fintech',        ticket_size_usd_m: 250, fee_success_pct: 2.50, fee_retainer_usd: 75000 },
  { client_name: 'Meridian EdTech',  deal_type: 'PE/VC', stage: 'Negotiation', nda_status: 'Signed',  sector: 'EdTech',         ticket_size_usd_m:  35, fee_success_pct: 3.50 },
  { client_name: 'Orion Realty',     deal_type: 'PE/VC', stage: 'Closing',     nda_status: 'Signed',  sector: 'Real Estate',    ticket_size_usd_m: 320, fee_success_pct: 1.50 }
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
    return { totalActive: active.length, total: deals.length, pipelineValue, closedValue }
  }, [deals])

  const forecast = useMemo(() => forecastPipeline(deals), [deals])

  const funnelCounts = useMemo(() => {
    const g = Object.fromEntries(STAGES.map(s => [s.id, 0]))
    for (const d of deals) if (g[d.stage] != null) g[d.stage] += 1
    return g
  }, [deals])

  const maxFunnel = Math.max(1, ...Object.values(funnelCounts))

  return (
    <div className="space-y-12">
      <ConfigBanner />

      {/* Editorial hero — mirrors valencegrowth.com rhythm */}
      <section className="relative overflow-hidden rounded-2xl border border-valence-border bg-white vl-circles py-20 px-8 lg:px-16 lg:py-28">
        <div className="absolute inset-0 bg-valence-grid opacity-50" aria-hidden />
        <div className="relative max-w-3xl z-10">
          <p className="vl-eyebrow">Live workspace · {today}</p>
          <h1 className="mt-6 font-display text-hero font-bold text-valence-text">
            One operating layer for a boutique advisory firm.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-valence-muted lg:text-lg">
            Pipeline, knowledge, and the day ahead — unified for the Valence core team across Mumbai and London.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link to="/deals" className="vl-btn-primary">
              Open Deal Logger <ArrowUpRight className="h-4 w-4" />
            </Link>
            <Link to="/knowledge" className="vl-btn-secondary">
              <Sparkles className="h-4 w-4 text-valence-blue" /> Ask the firm
            </Link>
            <span className="inline-flex items-center gap-2 pl-2 text-xs text-valence-muted">
              <span className="vl-kbd">⌘K</span> to search · <span className="vl-kbd">?</span> for shortcuts
            </span>
          </div>
        </div>
      </section>

      {/* Stat row */}
      <section className="grid grid-cols-2 gap-px bg-valence-border rounded-2xl overflow-hidden border border-valence-border md:grid-cols-4">
        <StatCell label="Pipeline value" value={`$${fmt(pipeline.pipelineValue)}M`} sub={`${pipeline.totalActive} active mandate${pipeline.totalActive === 1 ? '' : 's'}`} icon={TrendingUp} />
        <StatCell label="Expected fees"  value={fmtUSD(forecast.weighted)} sub="Probability-weighted" icon={DollarSign} />
        <StatCell label="Knowledge docs" value={stats.docs} sub="Indexed across the firm" icon={BookOpen} />
        <StatCell label="Open tasks"     value={stats.tasks} sub="Across the team today" icon={Activity} />
      </section>

      {/* Funnel + Quick actions */}
      <section className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 vl-card p-8">
          <div className="mb-8 flex items-end justify-between">
            <div>
              <p className="vl-eyebrow-ink">The funnel</p>
              <h2 className="mt-2 font-display text-feature font-bold text-valence-text">
                Every mandate, plainly placed.
              </h2>
            </div>
            <Link to="/deals" className="inline-flex items-center gap-1.5 text-sm font-semibold text-valence-blue hover:text-valence-blue-hover">
              View board <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <ul className="space-y-2">
            {STAGES.map(s => {
              const count = funnelCounts[s.id] || 0
              const width = (count / maxFunnel) * 100
              return (
                <li key={s.id} title={s.desc} className="flex items-center gap-4">
                  <span className={`inline-flex w-28 justify-center rounded-full border px-2 py-1 text-[10px] font-semibold shrink-0 ${stageToneClasses(s.id)}`}>
                    {s.id}
                  </span>
                  <div className="relative flex-1 h-7 rounded-md bg-valence-surface overflow-hidden border border-valence-border">
                    <div
                      className={`h-full rounded-r-md transition-all ${
                        s.terminal
                          ? (s.id === 'Closed' ? 'bg-valence-success/50' : s.id === 'Lost' ? 'bg-valence-danger/40' : 'bg-valence-warning/40')
                          : 'bg-gradient-to-r from-valence-blue/40 to-valence-blue'
                      }`}
                      style={{ width: `${width}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-end pr-3 text-[11px] font-semibold tabular-nums text-valence-text">
                      {count || ''}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="space-y-3">
          <QuickAction to="/knowledge" icon={Sparkles}     title="Ask the firm"       body="Plain-English questions, answers grounded in your memos, files, and deals." accent />
          <QuickAction to="/deals"     icon={Briefcase}    title="Deal Logger"        body="Kanban, data rooms, AI briefs, and a similarity engine." />
          <QuickAction to="/planner"   icon={CalendarDays} title="Day Planner"        body="Real calendar, free slots, one-tap meeting proposals." />
          <QuickAction to="/drive"     icon={FolderOpen}   title="Drive"              body="Your Google Drive, at your fingertips." />
          <QuickAction to="/team"      icon={Users}        title="Team"               body="Coverage, at a glance." />
        </div>
      </section>

      {/* Insights */}
      <section className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2"><VelocityChart /></div>
        <StaleDealsCard deals={deals} />
      </section>

      <section>
        <ExpertsWidget deals={deals} />
      </section>
    </div>
  )
}

function StatCell({ label, value, sub, icon: Icon }) {
  return (
    <div className="bg-white p-7">
      <div className="flex items-center justify-between">
        <span className="vl-eyebrow-ink">{label}</span>
        <Icon className="h-4 w-4 text-valence-subtle" />
      </div>
      <p className="mt-6 font-display text-4xl font-bold tracking-[-0.04em] text-valence-text tabular-nums">{value}</p>
      {sub && <p className="mt-1.5 text-[11px] text-valence-muted">{sub}</p>}
    </div>
  )
}

function QuickAction({ to, icon: Icon, title, body, accent = false }) {
  return (
    <Link to={to} className={`vl-card vl-card-hover block p-5 group ${accent ? 'ring-1 ring-valence-blue/20' : ''}`}>
      <div className="flex items-start gap-3">
        <div className={`grid h-10 w-10 place-items-center rounded-lg shrink-0 ${accent ? 'bg-valence-blue-soft' : 'bg-valence-surface border border-valence-border'}`}>
          <Icon className={`h-4 w-4 ${accent ? 'text-valence-blue' : 'text-valence-muted'}`} />
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

function fmt(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString()
}

function fmtUSD(n) {
  if (!n || n < 1) return '$0'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${Math.round(n / 1_000).toLocaleString()}k`
  return `$${Math.round(n).toLocaleString()}`
}
