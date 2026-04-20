import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp, DollarSign, Activity, BarChart3, ArrowUpRight, Briefcase, BookOpen } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { stageMeta } from '../lib/stages.js'
import { forecastPipeline } from '../lib/insights.js'
import { useCurrency } from '../hooks/useCurrency.jsx'
import ConfigBanner from '../components/ConfigBanner.jsx'
import MorningBriefing from '../components/MorningBriefing.jsx'

export default function Overview() {
  const { money, amount } = useCurrency()
  const [deals, setDeals] = useState([])
  const [openTasks, setOpenTasks] = useState(0)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    ;(async () => {
      const [d, t] = await Promise.all([
        supabase.from('deals').select('stage, ticket_size_usd_m, fee_success_pct, fee_retainer_usd'),
        supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('completed', false)
      ])
      if (d.data) setDeals(d.data)
      setOpenTasks(t.count || 0)
    })()
  }, [])

  const pulse = useMemo(() => {
    const active = deals.filter(d => !stageMeta(d.stage).terminal)
    const pipelineValue = active.reduce((s, d) => s + (Number(d.ticket_size_usd_m) || 0), 0)
    const { weighted } = forecastPipeline(deals)
    return { activeCount: active.length, pipelineValue, weighted }
  }, [deals])

  return (
    <div className="space-y-10">
      <ConfigBanner />

      <MorningBriefing />

      {/* Pulse — tasteful three-up strip, quiet but informative */}
      <section>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="vl-eyebrow-ink">The pulse</p>
            <p className="mt-1 text-xs text-valence-muted">A quick glance — the full dashboard lives in Analytics.</p>
          </div>
          <Link to="/analytics" className="inline-flex items-center gap-1.5 text-xs font-semibold text-valence-blue hover:text-valence-blue-hover">
            <BarChart3 className="h-3.5 w-3.5" /> Open Analytics <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-valence-border bg-valence-border sm:grid-cols-3">
          <PulseCell label="Active pipeline" value={money(pulse.pipelineValue)} sub={`${pulse.activeCount} mandate${pulse.activeCount === 1 ? '' : 's'}`} icon={TrendingUp} accent />
          <PulseCell label="Expected fees" value={amount(pulse.weighted)} sub="Probability-weighted" icon={DollarSign} />
          <PulseCell label="Open tasks" value={openTasks} sub="Across the team today" icon={Activity} />
        </div>
      </section>

      {/* Quiet jump row — two lightweight shortcuts */}
      <section className="grid gap-4 md:grid-cols-2">
        <JumpCard to="/deals" icon={Briefcase} title="Deal Logger" body="Every live mandate — funnel, rooms, briefs." />
        <JumpCard to="/knowledge" icon={BookOpen} title="Knowledge" body="Firm memos, comps, and your private Drive." />
      </section>
    </div>
  )
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
