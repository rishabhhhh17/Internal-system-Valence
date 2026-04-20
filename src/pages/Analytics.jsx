import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import {
  BarChart3, TrendingUp, TrendingDown, DollarSign, Briefcase, Target, Trophy,
  Activity, MapPin, Sparkles, ArrowRight, Info, CalendarDays, PieChart,
  AlertTriangle, Zap, Building2, Filter
} from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { STAGES, ACTIVE_STAGES, stageMeta, stageToneClasses } from '../lib/stages.js'
import {
  forecastPipeline, expectedFee, distribution, conversionLadder, feeByQuarter,
  geographyMix, winRateTrend, activityHeatmap, winLossSummary, avgTicket,
  STAGE_PROBABILITY
} from '../lib/insights.js'
import { useCurrency } from '../hooks/useCurrency.jsx'
import ConfigBanner from '../components/ConfigBanner.jsx'
import VelocityChart from '../components/VelocityChart.jsx'
import StaleDealsCard from '../components/StaleDealsCard.jsx'
import ExpertsWidget from '../components/ExpertsWidget.jsx'

// Richer demo dataset so the analytics page looks complete when Supabase is
// empty. These are clearly synthetic but plausible for a boutique advisory.
const DEMO_DEALS = [
  { id: 'd1',  client_name: 'Nimbus Health',      deal_type: 'M&A',   stage: 'Diligence',   nda_status: 'Signed',  sector: 'Healthcare',     ticket_size_usd_m: 180, fee_success_pct: 1.75, fee_retainer_usd: 50000, lead_owner: 'Rishabh Kapadia' },
  { id: 'd2',  client_name: 'Arclight Capital',   deal_type: 'PE/VC', stage: 'Origination', nda_status: 'Pending', sector: 'Infrastructure', ticket_size_usd_m: 120, fee_success_pct: 2.00,                          lead_owner: 'Priya Mehta' },
  { id: 'd3',  client_name: 'Quantum Edge',       deal_type: 'ECM',   stage: 'Marketing',   nda_status: 'Signed',  sector: 'Fintech',        ticket_size_usd_m: 250, fee_success_pct: 2.50, fee_retainer_usd: 75000, lead_owner: 'James Whitfield' },
  { id: 'd4',  client_name: 'Meridian EdTech',    deal_type: 'PE/VC', stage: 'Negotiation', nda_status: 'Signed',  sector: 'EdTech',         ticket_size_usd_m:  35, fee_success_pct: 3.50,                          lead_owner: 'Priya Mehta' },
  { id: 'd5',  client_name: 'Orion Realty',       deal_type: 'PE/VC', stage: 'Closing',     nda_status: 'Signed',  sector: 'Real Estate',    ticket_size_usd_m: 320, fee_success_pct: 1.50,                          lead_owner: 'Rishabh Kapadia' },
  { id: 'd6',  client_name: 'Aegis Logistics',    deal_type: 'M&A',   stage: 'Preparation', nda_status: 'Signed',  sector: 'Logistics',      ticket_size_usd_m: 210, fee_success_pct: 1.85, fee_retainer_usd: 60000, lead_owner: 'Oliver Hayes' },
  { id: 'd7',  client_name: 'Solstice Solar',     deal_type: 'PE/VC', stage: 'Mandate',     nda_status: 'Signed',  sector: 'Renewables',     ticket_size_usd_m:  90, fee_success_pct: 2.25,                          lead_owner: 'Rishabh Kapadia' },
  { id: 'd8',  client_name: 'Kestrel Biotech',    deal_type: 'M&A',   stage: 'Pitch',       nda_status: 'Pending', sector: 'Healthcare',     ticket_size_usd_m:  75, fee_success_pct: 2.75,                          lead_owner: 'James Whitfield' },
  { id: 'd9',  client_name: 'Pelican Foods',      deal_type: 'PE/VC', stage: 'Diligence',   nda_status: 'Signed',  sector: 'Consumer',       ticket_size_usd_m:  55, fee_success_pct: 3.00,                          lead_owner: 'Priya Mehta' },
  { id: 'd10', client_name: 'Silverline Hotels',  deal_type: 'M&A',   stage: 'Closed',      nda_status: 'Signed',  sector: 'Hospitality',    ticket_size_usd_m: 140, fee_success_pct: 1.80, fee_retainer_usd: 50000, lead_owner: 'Oliver Hayes' },
  { id: 'd11', client_name: 'Halcyon Pharma',     deal_type: 'M&A',   stage: 'Closed',      nda_status: 'Signed',  sector: 'Healthcare',     ticket_size_usd_m: 195, fee_success_pct: 2.00,                          lead_owner: 'Rishabh Kapadia' },
  { id: 'd12', client_name: 'Brightline Mobility',deal_type: 'PE/VC', stage: 'Lost',        nda_status: 'Signed',  sector: 'Mobility',       ticket_size_usd_m:  65, fee_success_pct: 2.50,                          lead_owner: 'Priya Mehta' },
  { id: 'd13', client_name: 'Copperfield Infra',  deal_type: 'PE/VC', stage: 'On Hold',     nda_status: 'Signed',  sector: 'Infrastructure', ticket_size_usd_m: 280, fee_success_pct: 1.75,                          lead_owner: 'James Whitfield' },
  { id: 'd14', client_name: 'Tidewater Logistics',deal_type: 'ECM',   stage: 'Marketing',   nda_status: 'Signed',  sector: 'Logistics',      ticket_size_usd_m: 410, fee_success_pct: 1.25, fee_retainer_usd: 100000, lead_owner: 'Oliver Hayes' },
  { id: 'd15', client_name: 'Lumen Fintech',      deal_type: 'PE/VC', stage: 'Origination', nda_status: 'Pending', sector: 'Fintech',        ticket_size_usd_m:  45, fee_success_pct: 3.25,                          lead_owner: 'Rishabh Kapadia' }
]

export default function Analytics() {
  const { money, amount, currency } = useCurrency()
  const [deals, setDeals]           = useState(DEMO_DEALS)
  const [activities, setActivities] = useState([])
  const [loading, setLoading]       = useState(true)
  const [sectorFilter, setSectorFilter] = useState('all')
  const [simUplift, setSimUplift]   = useState(15) // % uplift on diligence→close in what-if

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return }
    ;(async () => {
      const [d, a] = await Promise.all([
        supabase.from('deals').select('*').order('created_at', { ascending: false }),
        supabase.from('activities').select('deal_id, kind, body, created_at').order('created_at', { ascending: false }).limit(2000)
      ])
      if (d.data?.length) setDeals(d.data)
      setActivities(a.data || [])
      setLoading(false)
    })()
  }, [])

  // Filter deals by sector if selected
  const sectors = useMemo(() => ['all', ...new Set(deals.map(d => d.sector).filter(Boolean))], [deals])
  const filteredDeals = useMemo(() =>
    sectorFilter === 'all' ? deals : deals.filter(d => d.sector === sectorFilter),
  [deals, sectorFilter])

  // Core metrics
  const active = useMemo(() => filteredDeals.filter(d => !stageMeta(d.stage).terminal), [filteredDeals])
  const pipelineValue = useMemo(() => active.reduce((s, d) => s + (Number(d.ticket_size_usd_m) || 0), 0), [active])
  const forecast = useMemo(() => forecastPipeline(filteredDeals), [filteredDeals])
  const winLoss = useMemo(() => winLossSummary(filteredDeals), [filteredDeals])
  const avg = useMemo(() => avgTicket(filteredDeals), [filteredDeals])

  // Distributions
  const sectorDist   = useMemo(() => distribution(filteredDeals, d => d.sector),    [filteredDeals])
  const dealTypeDist = useMemo(() => distribution(filteredDeals, d => d.deal_type), [filteredDeals])
  const ladder       = useMemo(() => conversionLadder(filteredDeals),               [filteredDeals])
  const quarters     = useMemo(() => feeByQuarter(filteredDeals, { quarters: 4 }),  [filteredDeals])
  const geo          = useMemo(() => geographyMix(filteredDeals),                   [filteredDeals])
  const trend        = useMemo(() => winRateTrend(filteredDeals, activities, { windows: 6 }), [filteredDeals, activities])
  const heatmap      = useMemo(() => activityHeatmap(activities, { weeks: 12 }),    [activities])

  // What-if simulator: uplift on Diligence→Negotiation conversion
  const whatIf = useMemo(() => {
    const baseline = forecast.weighted
    // Find deals in Diligence and inflate their probability by uplift %
    const bumped = filteredDeals.map(d => {
      if (d.stage !== 'Diligence') return d
      return { ...d, _p: Math.min(1, (STAGE_PROBABILITY.Diligence ?? 0.7) * (1 + simUplift / 100)) }
    })
    let scenario = 0
    for (const d of bumped) {
      const fee = expectedFee(d)
      const p = d._p ?? (STAGE_PROBABILITY[d.stage] ?? 0)
      scenario += fee * p
    }
    return { baseline, scenario, delta: scenario - baseline }
  }, [filteredDeals, forecast.weighted, simUplift])

  const updatedLabel = format(new Date(), "d MMM yyyy · HH:mm")

  return (
    <div className="space-y-8">
      <ConfigBanner />

      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="vl-eyebrow-ink">Analytics</p>
          <h1 className="mt-2 font-display text-feature font-bold text-valence-text">
            The firm, in numbers.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-valence-muted">
            Pipeline, conversion, fees, velocity. Live where data exists; clearly flagged where illustrative.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-valence-muted">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-valence-border bg-white px-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-valence-success shadow-[0_0_6px_#22c55e]" />
            Updated {updatedLabel}
          </span>
          <span className="rounded-full border border-valence-border bg-white px-2.5 py-1">Currency · {currency}</span>
        </div>
      </div>

      {/* Sector filter chip row */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Filter className="h-3 w-3" /> Scope</span>
        {sectors.map(s => (
          <button
            key={s}
            onClick={() => setSectorFilter(s)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
              sectorFilter === s
                ? 'border-valence-blue/40 bg-valence-blue-soft text-valence-text'
                : 'border-valence-border bg-white text-valence-muted hover:text-valence-text'
            }`}
          >
            {s === 'all' ? 'All sectors' : s}
          </button>
        ))}
      </div>

      {/* KPI strip */}
      <section className="grid grid-cols-2 gap-px bg-valence-border rounded-2xl overflow-hidden border border-valence-border md:grid-cols-3 lg:grid-cols-6">
        <KPI label="Pipeline value" value={money(pipelineValue)} sub={`${active.length} active`} icon={TrendingUp} accent />
        <KPI label="Weighted fees"  value={amount(forecast.weighted)} sub="Probability-adjusted" icon={DollarSign} />
        <KPI label="Recognised"     value={amount(forecast.recognised)} sub="Closed — fee booked" icon={Trophy} />
        <KPI label="Win rate"       value={winLoss.rate != null ? `${Math.round(winLoss.rate * 100)}%` : '—'} sub={`${winLoss.closed}W · ${winLoss.lost}L`} icon={Target} />
        <KPI label="Avg ticket"     value={avg ? money(avg) : '—'} sub="Active mandates only" icon={Briefcase} />
        <KPI label="Active mandates"value={active.length} sub={`of ${filteredDeals.length} tracked`} icon={Activity} />
      </section>

      {/* Funnel + Conversion ladder */}
      <section className="vl-card p-8">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="vl-section-title flex items-center gap-2"><BarChart3 className="h-4 w-4 text-valence-blue" /> Funnel & conversion</h2>
            <p className="mt-1 text-xs text-valence-muted">Count by stage and stage-to-stage conversion. Lost and On Hold excluded from conversion math.</p>
          </div>
          <Link to="/deals" className="inline-flex items-center gap-1.5 text-xs font-semibold text-valence-blue hover:text-valence-blue-hover">
            Open board <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <FunnelLadder ladder={ladder} />
      </section>

      {/* Two-column: Sector mix + Deal type mix */}
      <section className="grid gap-6 lg:grid-cols-2">
        <DistributionCard title="Sector mix" subtitle="Mandates by sector, with aggregate ticket value" items={sectorDist} money={money} icon={PieChart} />
        <DistributionCard title="Deal type" subtitle="M&A · PE/VC · ECM split across the book" items={dealTypeDist} money={money} icon={Briefcase} />
      </section>

      {/* Fee forecast by quarter */}
      <section className="vl-card p-8">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="vl-section-title flex items-center gap-2"><CalendarDays className="h-4 w-4 text-valence-blue" /> Fee forecast · next 4 quarters</h2>
            <p className="mt-1 text-xs text-valence-muted">Probability-weighted fee recognition window. Committed = Closing / Negotiation / Closed.</p>
          </div>
        </div>
        <QuarterBars quarters={quarters} amount={amount} />
      </section>

      {/* Velocity + Win-rate trend */}
      <section className="grid gap-6 lg:grid-cols-2">
        <VelocityChart />
        <WinRateTrendCard trend={trend} />
      </section>

      {/* What-if simulator */}
      <section className="vl-card p-8 relative overflow-hidden">
        <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-valence-blue/10 blur-3xl" aria-hidden />
        <div className="relative">
          <div className="mb-4">
            <h2 className="vl-section-title flex items-center gap-2"><Zap className="h-4 w-4 text-valence-blue" /> What-if · Diligence uplift</h2>
            <p className="mt-1 text-xs text-valence-muted">Model how improving conversion on deals currently in Diligence would move probability-weighted fees.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-[1fr_auto]">
            <div>
              <div className="flex items-center justify-between mb-2 text-sm">
                <label className="text-valence-muted">Uplift on Diligence conversion</label>
                <span className="font-display text-2xl font-bold tabular-nums text-valence-text">+{simUplift}%</span>
              </div>
              <input
                type="range" min="0" max="40" step="1"
                value={simUplift}
                onChange={e => setSimUplift(Number(e.target.value))}
                className="w-full accent-valence-blue"
              />
              <div className="mt-2 flex justify-between text-[10px] text-valence-subtle">
                <span>0%</span><span>20%</span><span>40%</span>
              </div>
            </div>
            <div className="rounded-xl border border-valence-border bg-valence-surface p-5 min-w-[240px]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-valence-muted">Scenario weighted fees</p>
              <p className="mt-2 font-display text-3xl font-bold tabular-nums text-valence-text">{amount(whatIf.scenario)}</p>
              <p className="mt-1 text-xs text-valence-muted">Baseline {amount(whatIf.baseline)}</p>
              <p className={`mt-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${whatIf.delta >= 0 ? 'bg-valence-success/10 text-valence-success' : 'bg-valence-danger/10 text-valence-danger'}`}>
                {whatIf.delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {whatIf.delta >= 0 ? '+' : ''}{amount(whatIf.delta)}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Geography + Activity heatmap */}
      <section className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <GeographyCard geo={geo} money={money} />
        <HeatmapCard heatmap={heatmap} />
      </section>

      {/* Stale deals + Experts */}
      <section className="grid gap-6 lg:grid-cols-2">
        <StaleDealsCard deals={filteredDeals} />
        <ExpertsWidget deals={filteredDeals} />
      </section>

      {/* Footer note */}
      <div className="rounded-xl border border-dashed border-valence-border bg-white px-5 py-4 text-xs text-valence-muted">
        <p className="inline-flex items-start gap-2">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-valence-blue" />
          <span>
            Figures scoped to {sectorFilter === 'all' ? 'the full book' : <b className="text-valence-text">{sectorFilter}</b>}. Metrics labelled <span className="rounded bg-valence-warning/10 px-1 text-valence-warning">illustrative</span> use modelled activity when real traces are thin — they respect current stage distributions and fee structures.
          </span>
        </p>
      </div>
    </div>
  )
}

/* ---------------- KPI cell ---------------- */
function KPI({ label, value, sub, icon: Icon, accent = false }) {
  return (
    <div className={`bg-white p-6 ${accent ? 'ring-1 ring-valence-blue/20' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="vl-eyebrow-ink">{label}</span>
        <Icon className={`h-4 w-4 ${accent ? 'text-valence-blue' : 'text-valence-subtle'}`} />
      </div>
      <p className="mt-4 font-display text-3xl font-bold tracking-[-0.03em] text-valence-text tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-[11px] text-valence-muted">{sub}</p>}
    </div>
  )
}

/* ---------------- Funnel + conversion ladder ---------------- */
function FunnelLadder({ ladder }) {
  const maxCount = Math.max(1, ...ladder.map(r => r.count))
  return (
    <div className="space-y-2.5">
      {ladder.map((r, i) => {
        const next = ladder[i + 1]
        const width = (r.count / maxCount) * 100
        return (
          <div key={r.stage}>
            <div className="flex items-center gap-4">
              <span className={`inline-flex w-28 justify-center rounded-full border px-2 py-1 text-[10px] font-semibold shrink-0 ${stageToneClasses(r.stage)}`}>
                {r.stage}
              </span>
              <div className="relative flex-1 h-8 rounded-md bg-valence-surface overflow-hidden border border-valence-border">
                <div
                  className="h-full rounded-r-md bg-gradient-to-r from-valence-blue/40 to-valence-blue transition-all"
                  style={{ width: `${width}%` }}
                />
                <span className="absolute inset-0 flex items-center justify-between px-3 text-[11px] font-semibold tabular-nums text-valence-text">
                  <span className="text-valence-muted">{stageMeta(r.stage).short}</span>
                  <span>{r.count}</span>
                </span>
              </div>
            </div>
            {next && r.count > 0 && (
              <div className="ml-28 pl-4 mt-1 mb-1 flex items-center gap-2 text-[10px] text-valence-subtle">
                <span className="h-2 w-px bg-valence-border" />
                <span>→ {next.stage}</span>
                <span className={`rounded-full px-1.5 py-0.5 font-semibold ${r.conversion >= 0.5 ? 'bg-valence-success/10 text-valence-success' : r.conversion >= 0.25 ? 'bg-valence-warning/10 text-valence-warning' : 'bg-valence-danger/10 text-valence-danger'}`}>
                  {r.conversion != null ? `${Math.round(r.conversion * 100)}% carry` : '—'}
                </span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ---------------- Horizontal distribution bars ---------------- */
function DistributionCard({ title, subtitle, items, money, icon: Icon }) {
  const maxVal = Math.max(1, ...items.map(x => x.valueUsdM))
  const maxCount = Math.max(1, ...items.map(x => x.count))
  if (!items.length) {
    return (
      <div className="vl-card p-6">
        <h3 className="vl-section-title flex items-center gap-2"><Icon className="h-4 w-4 text-valence-blue" /> {title}</h3>
        <p className="text-xs text-valence-muted mt-1">{subtitle}</p>
        <p className="mt-6 text-sm text-valence-muted">No data yet.</p>
      </div>
    )
  }
  return (
    <div className="vl-card p-6">
      <div className="mb-4">
        <h3 className="vl-section-title flex items-center gap-2"><Icon className="h-4 w-4 text-valence-blue" /> {title}</h3>
        <p className="text-xs text-valence-muted mt-1">{subtitle}</p>
      </div>
      <ul className="space-y-3">
        {items.slice(0, 8).map(x => (
          <li key={x.key}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-semibold text-valence-text">{x.key}</span>
              <span className="tabular-nums text-valence-muted">
                {x.count} · <span className="text-valence-text font-semibold">{money(x.valueUsdM)}</span>
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-valence-surface overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-valence-blue/40 to-valence-blue"
                style={{ width: `${(x.valueUsdM / maxVal) * 100}%` }}
              />
            </div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <div className="h-0.5 flex-1 bg-valence-border" />
              <span className="text-[9px] tabular-nums text-valence-subtle">count share {Math.round((x.count / maxCount) * 100)}%</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ---------------- Quarterly fee forecast ---------------- */
function QuarterBars({ quarters, amount }) {
  const max = Math.max(1, ...quarters.map(q => q.weightedFeeUsd))
  return (
    <div className="grid grid-cols-4 gap-4">
      {quarters.map(q => {
        const hWeighted = (q.weightedFeeUsd / max) * 100
        const hCommitted = (q.committedFeeUsd / max) * 100
        return (
          <div key={q.label} className="rounded-xl border border-valence-border bg-white p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-valence-muted">{q.label}</p>
              <p className="text-[10px] text-valence-subtle">{q.dealCount} deal{q.dealCount === 1 ? '' : 's'}</p>
            </div>
            <div className="relative mt-3 h-32 rounded-md bg-valence-surface overflow-hidden">
              <div
                className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-valence-blue/30 to-valence-blue/70"
                style={{ height: `${hWeighted}%` }}
              />
              <div
                className="absolute bottom-0 left-0 right-0 bg-valence-blue/90"
                style={{ height: `${hCommitted}%` }}
              />
            </div>
            <p className="mt-3 font-display text-lg font-bold tabular-nums text-valence-text">{amount(q.weightedFeeUsd)}</p>
            <p className="text-[10px] text-valence-muted">Committed {amount(q.committedFeeUsd)}</p>
          </div>
        )
      })}
    </div>
  )
}

/* ---------------- Win rate trend ---------------- */
function WinRateTrendCard({ trend }) {
  const anyIllustrative = trend.some(t => t.illustrative)
  const pts = trend.map((t, i) => ({
    x: i / Math.max(1, trend.length - 1),
    y: t.rate == null ? 0.5 : t.rate
  }))
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * 100} ${100 - p.y * 100}`).join(' ')
  const area = `${path} L 100 100 L 0 100 Z`

  return (
    <div className="vl-card p-6">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="vl-section-title flex items-center gap-2"><Trophy className="h-4 w-4 text-valence-blue" /> Win rate trend</h2>
          <p className="text-xs text-valence-muted mt-0.5">Rolling 4-week close rate · closed ÷ (closed + lost)</p>
        </div>
        {anyIllustrative && <IllustrativeBadge />}
      </div>
      <div className="relative h-40 rounded-md border border-valence-border bg-valence-surface overflow-hidden">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <defs>
            <linearGradient id="wr-grad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#3399FF" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#3399FF" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#wr-grad)" />
          <path d={path} fill="none" stroke="#3399FF" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
          {pts.map((p, i) => (
            <circle key={i} cx={p.x * 100} cy={100 - p.y * 100} r="1.2" fill="#3399FF" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      </div>
      <div className="mt-3 grid grid-cols-6 gap-2 text-center text-[10px] text-valence-subtle">
        {trend.map(t => (
          <div key={t.label}>
            <p className="font-semibold text-valence-text tabular-nums">{t.rate != null ? `${Math.round(t.rate * 100)}%` : '—'}</p>
            <p>{t.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------------- Geography mix ---------------- */
function GeographyCard({ geo, money }) {
  const total = geo.mumbai.count + geo.london.count
  const mumbaiPct = total ? (geo.mumbai.count / total) * 100 : 0
  return (
    <div className="vl-card p-6">
      <div className="mb-4">
        <h3 className="vl-section-title flex items-center gap-2"><MapPin className="h-4 w-4 text-valence-blue" /> Geography</h3>
        <p className="text-xs text-valence-muted mt-0.5">Coverage split across our two offices</p>
      </div>
      <div className="relative h-3 rounded-full overflow-hidden border border-valence-border">
        <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-valence-blue/70 to-valence-blue" style={{ width: `${mumbaiPct}%` }} />
        <div className="absolute inset-y-0 right-0 bg-valence-ink/80" style={{ width: `${100 - mumbaiPct}%` }} />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-valence-border bg-white p-4">
          <p className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Building2 className="h-3 w-3 text-valence-blue" /> Mumbai</p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums text-valence-text">{geo.mumbai.count}</p>
          <p className="text-[11px] text-valence-muted mt-0.5">{money(geo.mumbai.valueUsdM)} aggregate</p>
        </div>
        <div className="rounded-lg border border-valence-border bg-white p-4">
          <p className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Building2 className="h-3 w-3 text-valence-ink" /> London</p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums text-valence-text">{geo.london.count}</p>
          <p className="text-[11px] text-valence-muted mt-0.5">{money(geo.london.valueUsdM)} aggregate</p>
        </div>
      </div>
      <p className="mt-4 text-[10px] text-valence-subtle">
        Inferred from lead owner until a first-class <span className="rounded bg-valence-surface px-1">geo</span> field lands on deals.
      </p>
    </div>
  )
}

/* ---------------- Activity heatmap ---------------- */
function HeatmapCard({ heatmap }) {
  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  // Arrange into 7 rows (Mon–Sun) × N columns (weeks)
  const rows = Array.from({ length: 7 }, () => [])
  heatmap.grid.forEach((cell, i) => {
    const dow = (cell.date.getDay() + 6) % 7 // Mon=0
    rows[dow].push(cell)
  })
  function tone(count) {
    if (!count) return 'bg-valence-surface border-valence-border'
    const pct = count / heatmap.max
    if (pct > 0.75) return 'bg-valence-blue border-valence-blue/60'
    if (pct > 0.5)  return 'bg-valence-blue/70 border-valence-blue/40'
    if (pct > 0.25) return 'bg-valence-blue/40 border-valence-blue/30'
    return 'bg-valence-blue/20 border-valence-blue/20'
  }
  return (
    <div className="vl-card p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="vl-section-title flex items-center gap-2"><Activity className="h-4 w-4 text-valence-blue" /> Team activity · {heatmap.weeks} weeks</h3>
          <p className="text-xs text-valence-muted mt-0.5">Every logged activity — stage changes, notes, files, meetings</p>
        </div>
        {heatmap.illustrative && <IllustrativeBadge />}
      </div>
      <div className="flex gap-2">
        <div className="flex flex-col justify-between py-0.5 text-[9px] text-valence-subtle">
          {dayLabels.map((d, i) => <span key={i} className="h-3.5 leading-none">{d}</span>)}
        </div>
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-1">
            {Array.from({ length: heatmap.weeks }).map((_, wi) => (
              <div key={wi} className="flex flex-col gap-1">
                {rows.map((row, ri) => {
                  const cell = row[wi]
                  if (!cell) return <div key={ri} className="h-3.5 w-3.5" />
                  return (
                    <div
                      key={ri}
                      title={`${cell.date.toDateString()} · ${cell.count} event${cell.count === 1 ? '' : 's'}`}
                      className={`h-3.5 w-3.5 rounded-[3px] border ${tone(cell.count)}`}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 text-[10px] text-valence-subtle">
        <span>less</span>
        <div className="h-2.5 w-2.5 rounded-sm bg-valence-surface border border-valence-border" />
        <div className="h-2.5 w-2.5 rounded-sm bg-valence-blue/20 border border-valence-blue/20" />
        <div className="h-2.5 w-2.5 rounded-sm bg-valence-blue/40 border border-valence-blue/30" />
        <div className="h-2.5 w-2.5 rounded-sm bg-valence-blue/70 border border-valence-blue/40" />
        <div className="h-2.5 w-2.5 rounded-sm bg-valence-blue border border-valence-blue/60" />
        <span>more</span>
      </div>
    </div>
  )
}

function IllustrativeBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-valence-warning/30 bg-valence-warning/10 px-2 py-0.5 text-[10px] font-semibold text-valence-warning">
      <AlertTriangle className="h-2.5 w-2.5" /> Illustrative
    </span>
  )
}
