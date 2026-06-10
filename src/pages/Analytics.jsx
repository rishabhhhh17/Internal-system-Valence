import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import {
  BarChart3, TrendingUp, Briefcase, Trophy,
  Activity, MapPin, ArrowRight, Info, CalendarDays, PieChart,
  AlertTriangle, Building2, Filter, Printer, Layers, Users,
  Hourglass, Scale, ShieldAlert, Flame, Globe2,
  Handshake, CalendarClock
} from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { stageMeta, stageToneClasses, stageLabel, migrateStage, activeStagesForMode } from '../lib/stages.js'
import {
  distribution, conversionLadder,
  geographyMix, winRateTrend, activityHeatmap,
  stageAgingList, sectorStageMatrix, bookBuildingCurve,
  originationMix, riskFlags, scopeDeals,
  dropoffByOwner
} from '../lib/insights.js'
import { usePipelineMode } from '../hooks/usePipelineMode.js'
import { useCurrency } from '../hooks/useCurrency.jsx'
import ConfigBanner from '../components/ConfigBanner.jsx'
import VelocityChart from '../components/VelocityChart.jsx'
import { SHOW_METRICS } from '../lib/featureFlags.js'
import StaleDealsCard from '../components/StaleDealsCard.jsx'
import ExpertsWidget from '../components/ExpertsWidget.jsx'
import InfoDot from '../components/InfoDot.jsx'

const STALE_THRESHOLD_DAYS = 30

// Richer demo dataset — 18 deals with repeat clients, dates, sides, origination
// sources, and full fee structures. Built so every chart has real data to chew on.
const now = new Date()
const daysAgo = (n) => { const d = new Date(now); d.setDate(d.getDate() - n); return d.toISOString() }
const daysFwd = (n) => { const d = new Date(now); d.setDate(d.getDate() + n); return d.toISOString().slice(0,10) }

const DEMO_DEALS = [
  { id: 'd1',  client_name: 'Nimbus Health',       deal_type: 'M&A',   side: 'Sell', stage: 'Diligence',   nda_status: 'Signed',  sector: 'Healthcare',     ticket_size_usd_m: 180, fee_success_pct: 1.75, fee_retainer_usd: 50000,  lead_owner: 'Neha Jain', origination_source: 'Existing client',  created_at: daysAgo(210), expected_close_date: daysFwd(75) },
  { id: 'd2',  client_name: 'Arclight Capital',    deal_type: 'PE/VC', side: 'Buy',  stage: 'Origination', nda_status: 'Pending', sector: 'Infrastructure', ticket_size_usd_m: 120, fee_success_pct: 2.00, fee_retainer_usd: 25000,  lead_owner: 'Priya Mehta',     origination_source: 'Referral',         created_at: daysAgo(24) },
  { id: 'd3',  client_name: 'Quantum Edge',        deal_type: 'ECM',   side: 'Sell', stage: 'Marketing',   nda_status: 'Signed',  sector: 'Fintech',        ticket_size_usd_m: 250, fee_success_pct: 2.50, fee_retainer_usd: 75000,  lead_owner: 'James Whitfield', origination_source: 'Referral',         created_at: daysAgo(95),  expected_close_date: daysFwd(150) },
  { id: 'd4',  client_name: 'Meridian EdTech',     deal_type: 'PE/VC', side: 'Sell', stage: 'Negotiation', nda_status: 'Signed',  sector: 'EdTech',         ticket_size_usd_m:  35, fee_success_pct: 3.50, fee_retainer_usd: 20000,  lead_owner: 'Priya Mehta',     origination_source: 'Outbound',         created_at: daysAgo(160), expected_close_date: daysFwd(45) },
  { id: 'd5',  client_name: 'Orion Realty',        deal_type: 'PE/VC', side: 'Sell', stage: 'Closing',     nda_status: 'Signed',  sector: 'Real Estate',    ticket_size_usd_m: 320, fee_success_pct: 1.50, fee_retainer_usd: 80000,  lead_owner: 'Neha Jain', origination_source: 'Existing client',  created_at: daysAgo(275), expected_close_date: daysFwd(25) },
  { id: 'd6',  client_name: 'Aegis Logistics',     deal_type: 'M&A',   side: 'Sell', stage: 'Preparation', nda_status: 'Signed',  sector: 'Logistics',      ticket_size_usd_m: 210, fee_success_pct: 1.85, fee_retainer_usd: 60000,  lead_owner: 'Oliver Hayes',    origination_source: 'Inbound / RFP',    created_at: daysAgo(60),  expected_close_date: daysFwd(180) },
  { id: 'd7',  client_name: 'Solstice Solar',      deal_type: 'PE/VC', side: 'Sell', stage: 'Mandate',     nda_status: 'Signed',  sector: 'Renewables',     ticket_size_usd_m:  90, fee_success_pct: 2.25, fee_retainer_usd: 30000,  lead_owner: 'Neha Jain', origination_source: 'Sponsor network',  created_at: daysAgo(42),  expected_close_date: daysFwd(170) },
  { id: 'd8',  client_name: 'Kestrel Biotech',     deal_type: 'M&A',   side: 'Buy',  stage: 'Pitch',       nda_status: 'Pending', sector: 'Healthcare',     ticket_size_usd_m:  75, fee_success_pct: 2.75,                            lead_owner: 'James Whitfield', origination_source: 'Outbound',         created_at: daysAgo(14) },
  { id: 'd9',  client_name: 'Pelican Foods',       deal_type: 'PE/VC', side: 'Sell', stage: 'Diligence',   nda_status: 'Signed',  sector: 'Consumer',       ticket_size_usd_m:  55, fee_success_pct: 3.00, fee_retainer_usd: 25000,  lead_owner: 'Priya Mehta',     origination_source: 'Referral',         created_at: daysAgo(120), expected_close_date: daysFwd(90) },
  { id: 'd10', client_name: 'Silverline Hotels',   deal_type: 'M&A',   side: 'Sell', stage: 'Closed',      nda_status: 'Signed',  sector: 'Hospitality',    ticket_size_usd_m: 140, fee_success_pct: 1.80, fee_retainer_usd: 50000,  lead_owner: 'Oliver Hayes',    origination_source: 'Existing client',  created_at: daysAgo(330) },
  { id: 'd11', client_name: 'Halcyon Pharma',      deal_type: 'M&A',   side: 'Sell', stage: 'Closed',      nda_status: 'Signed',  sector: 'Healthcare',     ticket_size_usd_m: 195, fee_success_pct: 2.00, fee_retainer_usd: 60000,  lead_owner: 'Neha Jain', origination_source: 'Existing client',  created_at: daysAgo(290) },
  { id: 'd12', client_name: 'Brightline Mobility', deal_type: 'PE/VC', side: 'Sell', stage: 'Lost',        nda_status: 'Signed',  sector: 'Mobility',       ticket_size_usd_m:  65, fee_success_pct: 2.50,                            lead_owner: 'Priya Mehta',     origination_source: 'Inbound / RFP',    created_at: daysAgo(180) },
  { id: 'd13', client_name: 'Copperfield Infra',   deal_type: 'PE/VC', side: 'Buy',  stage: 'On Hold',     nda_status: 'Signed',  sector: 'Infrastructure', ticket_size_usd_m: 280, fee_success_pct: 1.75, fee_retainer_usd: 75000,  lead_owner: 'James Whitfield', origination_source: 'Sponsor network',  created_at: daysAgo(220) },
  { id: 'd14', client_name: 'Tidewater Logistics', deal_type: 'ECM',   side: 'Sell', stage: 'Marketing',   nda_status: 'Signed',  sector: 'Logistics',      ticket_size_usd_m: 410, fee_success_pct: 1.25, fee_retainer_usd: 100000, lead_owner: 'Oliver Hayes',    origination_source: 'Existing client',  created_at: daysAgo(72),  expected_close_date: daysFwd(120) },
  { id: 'd15', client_name: 'Lumen Fintech',       deal_type: 'PE/VC', side: 'Sell', stage: 'Origination', nda_status: 'Pending', sector: 'Fintech',        ticket_size_usd_m:  45, fee_success_pct: 3.25,                            lead_owner: 'Neha Jain', origination_source: 'Outbound',         created_at: daysAgo(8) },
  { id: 'd16', client_name: 'Nimbus Health',       deal_type: 'ECM',   side: 'Sell', stage: 'Preparation', nda_status: 'Signed',  sector: 'Healthcare',     ticket_size_usd_m: 110, fee_success_pct: 2.00, fee_retainer_usd: 40000,  lead_owner: 'Neha Jain', origination_source: 'Existing client',  created_at: daysAgo(35),  expected_close_date: daysFwd(200) },
  { id: 'd17', client_name: 'Halcyon Pharma',      deal_type: 'PE/VC', side: 'Buy',  stage: 'Diligence',   nda_status: 'Signed',  sector: 'Healthcare',     ticket_size_usd_m:  95, fee_success_pct: 2.75, fee_retainer_usd: 35000,  lead_owner: 'Neha Jain', origination_source: 'Existing client',  created_at: daysAgo(110), expected_close_date: daysFwd(65) },
  { id: 'd18', client_name: 'Evermark Retail',     deal_type: 'M&A',   side: 'Sell', stage: 'Pitch',       nda_status: 'Pending', sector: 'Consumer',       ticket_size_usd_m: 160, fee_success_pct: 1.90,                            lead_owner: 'Sophie Laurent',  origination_source: 'Outbound',         created_at: daysAgo(18) }
]

const PERIODS = [
  { id: 'QTD', label: 'QTD' },
  { id: 'YTD', label: 'YTD' },
  { id: 'LTM', label: 'LTM' },
  { id: 'ALL', label: 'All time' }
]

export default function Analytics() {
  const { money, amount, currency } = useCurrency()
  const [pipelineMode] = usePipelineMode()
  // The demo array still uses old stage names; migrate them on init so the
  // component doesn't need a 18-row data rewrite. Live data from Supabase
  // is already migrated by the Phase 0 SQL.
  // Demo data is ONLY a fallback when Supabase isn't configured (local
  // dev, broken env). With a real backend, we start empty and let the
  // fetch on mount populate. The previous version always initialised
  // with DEMO_DEALS and only overwrote when `d.data?.length` was
  // truthy — which meant a real org with zero deals saw 18 fake deals
  // worth millions in pipeline. Bad first impression for tomorrow's
  // pilot, fixed by gating the seed on isSupabaseConfigured.
  const [deals, setDeals] = useState(() =>
    isSupabaseConfigured ? [] : DEMO_DEALS.map(d => ({ ...d, stage: migrateStage(d.stage) }))
  )
  const [activities, setActivities] = useState([])
  const [sectorFilter, setSectorFilter] = useState('all')
  const [period, setPeriod]         = useState('LTM')
  // Active-stage ids for the current pipeline (company vs LP) — drives the
  // funnel ladder + sector×stage matrix so they reflect the right taxonomy.
  const activeIds = activeStagesForMode(pipelineMode).map(s => s.id)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    ;(async () => {
      const [d, a] = await Promise.all([
        supabase.from('deals').select('*').eq('kind', pipelineMode).order('created_at', { ascending: false }),
        supabase.from('activities').select('deal_id, kind, body, created_at').order('created_at', { ascending: false }).limit(2000)
      ])
      if (d.data?.length) setDeals(d.data)
      setActivities(a.data || [])
    })()
  }, [pipelineMode])

  const sectors = useMemo(() => ['all', ...new Set(deals.map(d => d.sector).filter(Boolean))], [deals])

  // Scope → filter by period first, then by sector
  const scoped = useMemo(() => scopeDeals(deals, period), [deals, period])
  const filteredDeals = useMemo(() =>
    sectorFilter === 'all' ? scoped : scoped.filter(d => d.sector === sectorFilter),
  [scoped, sectorFilter])

  // ── Core aggregates ──
  const active         = useMemo(() => filteredDeals.filter(d => !stageMeta(d.stage).terminal),                         [filteredDeals])

  // ── Distributions & deeper cuts ──
  const sectorDist   = useMemo(() => distribution(filteredDeals, d => d.sector),       [filteredDeals])
  const dealTypeDist = useMemo(() => distribution(filteredDeals, d => {
    // Live deals carry deal_subtype ('m_and_a'|'fundraise'|'exit') + deal_types[]
    // ('transaction'|'advisory'); the legacy singular `deal_type` is no longer
    // written, so derive a readable label from the current model.
    if (d.deal_subtype === 'm_and_a')  return 'M&A'
    if (d.deal_subtype === 'fundraise') return 'Fundraise'
    if (d.deal_subtype === 'exit')      return 'Exit'
    const types = d.deal_types || []
    if (types.includes('advisory'))     return 'Advisory'
    if (types.includes('transaction'))  return 'Transaction'
    return d.deal_type || 'Uncategorised'
  }), [filteredDeals])
  const ladder       = useMemo(() => conversionLadder(filteredDeals, { activeIds }),  [filteredDeals, activeIds])
  const geo          = useMemo(() => geographyMix(filteredDeals),                      [filteredDeals])
  const trend        = useMemo(() => winRateTrend(filteredDeals, activities, { windows: 6 }), [filteredDeals, activities])
  const heatmap      = useMemo(() => activityHeatmap(activities, { weeks: 12 }),       [activities])
  const aging        = useMemo(() => stageAgingList(filteredDeals, activities),        [filteredDeals, activities])
  const matrix       = useMemo(() => sectorStageMatrix(filteredDeals, { activeIds }),  [filteredDeals, activeIds])
  const curve        = useMemo(() => bookBuildingCurve(filteredDeals, { months: 12 }), [filteredDeals])
  const origin       = useMemo(() => originationMix(filteredDeals),                    [filteredDeals])
  const flags        = useMemo(() => riskFlags(filteredDeals),                         [filteredDeals])
  const dropoffRows  = useMemo(() => dropoffByOwner(filteredDeals),                    [filteredDeals])

  const updatedLabel = format(new Date(), "d MMM yyyy · HH:mm")

  // ── Pipeline health (operational, not money) ──
  const pipelineHealth = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const horizon = new Date(today)
    horizon.setDate(horizon.getDate() + 30)
    const closing30 = filteredDeals.filter(d => {
      if (!['Partner Call', 'Memo'].includes(d.stage)) return false
      const iso = d.expected_close_date || d.target_close
      if (!iso) return false
      const t = new Date(iso)
      return !Number.isNaN(t.getTime()) && t >= today && t <= horizon
    }).length

    const activeAging = aging.filter(d => !stageMeta(d.stage).terminal)
    const avgDays = activeAging.length
      ? Math.round(activeAging.reduce((s, d) => s + (d._stageDays || 0), 0) / activeAging.length)
      : 0
    const stalled = activeAging.filter(d => (d._stageDays || 0) > STALE_THRESHOLD_DAYS).length
    return { activeCount: active.length, avgDays, closing30, stalled }
  }, [filteredDeals, aging, active])

  // Empty-state: signed-in user with no deals yet. We don't want to
  // render the 18-chart wall against zero data — every chart would
  // either be empty or show "0%". Surface a clear "log your first
  // deal" prompt instead.
  if (isSupabaseConfigured && deals.length === 0) {
    return (
      <div className="space-y-10">
        <ConfigBanner />
        <div>
          <p className="vl-eyebrow-ink">Analytics · Internal</p>
          <h1 className="mt-2 font-display text-feature font-bold text-valence-text">
            The firm, in numbers.
          </h1>
        </div>
        <div className="vl-card p-8 text-center max-w-xl mx-auto">
          <p className="text-sm font-semibold text-valence-text">No deals to chart yet.</p>
          <p className="mt-2 text-xs text-valence-muted leading-relaxed">
            Log your first deal on <a href="/deals" className="text-valence-blue hover:underline">/deals</a>{' '}
            and Analytics fills in automatically — pipeline, conversion ladder, fee composition, velocity, the lot.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-10">
      <ConfigBanner />

      {/* ── Header ── */}
      <div className="flex flex-wrap items-end justify-between gap-4 print:gap-2">
        <div>
          <p className="vl-eyebrow-ink">Analytics · Internal</p>
          <h1 className="mt-2 font-display text-feature font-bold text-valence-text">
            The firm, in numbers.
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-valence-muted print:hidden">
          <div className="inline-flex items-center rounded-full border border-valence-border bg-valence-elevated p-0.5">
            {PERIODS.map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                  period === p.id ? 'bg-valence-ink text-white' : 'text-valence-muted hover:text-valence-text'
                }`}
              >{p.label}</button>
            ))}
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-valence-border bg-valence-elevated px-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-valence-success shadow-[0_0_6px_#22c55e]" />
            Updated {updatedLabel}
          </span>
          <span className="rounded-full border border-valence-border bg-valence-elevated px-2.5 py-1">Currency · {currency}</span>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-full border border-valence-border bg-valence-elevated px-2.5 py-1 text-valence-muted hover:text-valence-text"
          ><Printer className="h-3 w-3" /> Print</button>
        </div>
      </div>

      {/* Sector filter */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <span className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Filter className="h-3 w-3" /> Scope</span>
        {sectors.map(s => (
          <button
            key={s}
            onClick={() => setSectorFilter(s)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
              sectorFilter === s
                ? 'border-valence-blue/40 bg-valence-blue-soft text-valence-text'
                : 'border-valence-border bg-valence-elevated text-valence-muted hover:text-valence-text'
            }`}
          >{s === 'all' ? 'All sectors' : s}</button>
        ))}
      </div>

      {/* ── Pipeline health · operational, not money ── */}
      {(() => {
        const reachedDD = filteredDeals.filter(d => d.stage === 'Diligence').length
        const passedDD  = filteredDeals.filter(d => d.stage === 'Passed').length
        const resolved  = reachedDD + passedDD
        const dropoffRate = resolved ? `${Math.round((passedDD / resolved) * 100)}%` : '—'
        return (
      <section className="grid grid-cols-2 gap-px bg-valence-border rounded-2xl overflow-hidden border border-valence-border md:grid-cols-4">
        <KPI label="Active deals"         info="Deals not in a terminal stage (Diligence / Passed)." value={pipelineHealth.activeCount}              sub="Active through Memo"            icon={Handshake} accent />
        <KPI label="Avg days in stage"    info="Mean days each active deal has sat in its current stage."  value={pipelineHealth.avgDays}                  sub="Lower is healthier"             icon={Hourglass} />
        <KPI label="Reached diligence"    info="Deals that have graduated into Diligence (DD)." value={reachedDD}             sub="Graduated to DD"                  icon={CalendarClock} />
        <KPI label="Drop-off rate"        info="Passed ÷ (reached DD + passed). Share of resolved deals that leaked before diligence." value={dropoffRate} sub="Passed vs reached DD" icon={Flame} />
      </section>
        )
      })()}

      {/* ══════ PIPELINE ══════ */}
      <SectionHeading kicker="I" title="Pipeline" subtitle="What's on the board and where it's stuck" icon={Layers} />

      <section className="vl-card p-8">
        <CardTitle icon={BarChart3} title="Funnel & conversion" subtitle="Advance % = deals that moved past this stage. Where the funnel narrows is where you're losing deals." right={<Link to="/deals" className="text-xs font-semibold text-valence-blue hover:text-valence-blue-hover inline-flex items-center gap-1">Open board <ArrowRight className="h-3 w-3" /></Link>} />
        <FunnelLadder ladder={ladder} mode={pipelineMode} />
      </section>

      <section className="vl-card p-8">
        <CardTitle icon={Layers} title="Sector × Stage matrix" subtitle="Where the book is concentrated. Darker = more deals." />
        <SectorStageHeatmap matrix={matrix} />
      </section>

      <section className="vl-card p-8">
        <CardTitle icon={Hourglass} title="Stage aging" subtitle="How long current deals have sat in their present stage. Slipping-risk at the top." />
        <StageAgingTable aging={aging} />
      </section>

      {/* ══════ COMPOSITION ══════ */}
      <SectionHeading kicker="II" title="Composition" subtitle="What the book is made of" icon={PieChart} />

      <section className="grid gap-6 lg:grid-cols-2">
        <DistributionCard title="Sector mix"  subtitle="Deals by sector" items={sectorDist} money={money} icon={PieChart} />
        <DistributionCard title="Deal type"   subtitle="M&A · Fundraise · Exit · Advisory" items={dealTypeDist} money={money} icon={Briefcase} />
      </section>

      {/* ══════ DROP-OFF ══════ */}
      <SectionHeading kicker="III" title="Drop-off" subtitle="Where deals leak — by stage and by owner" icon={Flame} />

      <section className="grid gap-6 lg:grid-cols-2">
        {/* VelocityChart carries gut-feel benchmark numbers — hidden on the
            pitch deploy until we have enough real firm data to defend the
            comparison line. Toggle via VITE_SHOW_METRICS=true. */}
        {SHOW_METRICS ? <VelocityChart /> : null}
        <WinRateTrendCard trend={trend} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <DropoffByOwnerCard rows={dropoffRows} />
        <OriginationCard origin={origin} />
      </section>

      {/* ══════ FORWARD-LOOKING ══════ */}
      <SectionHeading kicker="IV" title="Forward-looking" subtitle="Deal flow over time" icon={CalendarDays} />

      <section className="vl-card p-8">
        <CardTitle icon={TrendingUp} title="Deal-flow curve" subtitle="Cumulative deals sourced over the trailing 12 months." right={curve.illustrative && <IllustrativeBadge />} />
        <BookCurve curve={curve} />
      </section>

      {/* ══════ COVERAGE & QUALITY ══════ */}
      <SectionHeading kicker="V" title="Coverage & quality" subtitle="Team, clients, data hygiene" icon={Scale} />

      <section className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <GeographyCard geo={geo} money={money} />
        <HeatmapCard heatmap={heatmap} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <RiskFlagsCard flags={flags} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <StaleDealsCard deals={filteredDeals} />
        <ExpertsWidget deals={filteredDeals} />
      </section>

      <div className="rounded-xl border border-dashed border-valence-border bg-valence-elevated px-5 py-4 text-xs text-valence-muted">
        <p className="inline-flex items-start gap-2">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-valence-blue" />
          <span>
            Period · <b className="text-valence-text">{period}</b>. Scope · <b className="text-valence-text">{sectorFilter === 'all' ? 'all sectors' : sectorFilter}</b>.
            Sections marked <span className="rounded bg-valence-warning/10 px-1 text-valence-warning">Illustrative</span> use modelled series where real traces are thin — they respect current stage distributions, fee structures, and deal counts.
          </span>
        </p>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   Layout primitives
   ═══════════════════════════════════════════════════════════════════════ */

function SectionHeading({ kicker, title, subtitle, icon: Icon }) {
  return (
    <div className="relative flex items-end justify-between border-t border-valence-border pt-6">
      <div className="flex items-start gap-4">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-valence-ink text-white">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-valence-blue">Section {kicker}</p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-valence-text">{title}</h2>
          <p className="mt-1 text-xs text-valence-muted">{subtitle}</p>
        </div>
      </div>
    </div>
  )
}

function CardTitle({ icon: Icon, title, subtitle, right }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div>
        <h3 className="vl-section-title flex items-center gap-2"><Icon className="h-4 w-4 text-valence-blue" /> {title}</h3>
        {subtitle && <p className="mt-1 text-xs text-valence-muted">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

function KPI({ label, value, sub, icon: Icon, accent = false, info }) {
  return (
    <div className={`bg-valence-elevated p-5 ${accent ? 'ring-1 ring-valence-blue/20' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="vl-eyebrow-ink inline-flex items-center gap-1.5">
          {label}
          {info && <InfoDot text={info} />}
        </span>
        <Icon className={`h-3.5 w-3.5 ${accent ? 'text-valence-blue' : 'text-valence-subtle'}`} />
      </div>
      <p className="mt-3 font-display text-2xl font-bold tracking-[-0.02em] text-valence-text tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-[10px] text-valence-muted">{sub}</p>}
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

/* ═══════════════════════════════════════════════════════════════════════
   Funnel + conversion
   ═══════════════════════════════════════════════════════════════════════ */
function FunnelLadder({ ladder, mode }) {
  const maxCount = Math.max(1, ...ladder.map(r => r.count))
  return (
    <div className="space-y-2.5">
      {ladder.map((r, i) => {
        const next = ladder[i + 1]
        const width = (r.count / maxCount) * 100
        return (
          <div key={r.stage}>
            <div className="flex items-center gap-4">
              <span className={`inline-flex w-28 justify-center rounded-full border px-2 py-1 text-[10px] font-semibold shrink-0 ${stageToneClasses(r.stage)}`}>{stageLabel(r.stage, mode)}</span>
              <div className="relative flex-1 h-8 rounded-md bg-valence-surface overflow-hidden border border-valence-border">
                <div className="h-full rounded-r-md bg-gradient-to-r from-valence-blue/40 to-valence-blue transition-all" style={{ width: `${width}%` }} />
                <span className="absolute inset-0 flex items-center justify-between px-3 text-[11px] font-semibold tabular-nums text-valence-text">
                  <span className="text-valence-muted">{stageMeta(r.stage).short}</span>
                  <span>{r.count}</span>
                </span>
              </div>
            </div>
            {next && r.count > 0 && (
              <div
                className="ml-28 pl-4 mt-1 mb-1 flex items-center gap-2 text-[10px] text-valence-subtle"
                title={`${r.conversion != null ? Math.round(r.conversion * 100) : 0}% of deals in ${r.stage} have advanced to ${next.stage} or beyond.`}
              >
                <span className="h-2 w-px bg-valence-border" />
                <span>→ {stageLabel(next.stage, mode)}</span>
                <span className={`rounded-full px-1.5 py-0.5 font-semibold ${r.conversion >= 0.5 ? 'bg-valence-success/10 text-valence-success' : r.conversion >= 0.25 ? 'bg-valence-warning/10 text-valence-warning' : 'bg-valence-danger/10 text-valence-danger'}`}>
                  {r.conversion != null ? `${Math.round(r.conversion * 100)}% advance` : '—'}
                </span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   Sector × Stage matrix heatmap
   ═══════════════════════════════════════════════════════════════════════ */
function SectorStageHeatmap({ matrix }) {
  const { sectors, stages } = matrix
  const max = Math.max(1, ...sectors.flatMap(s => s.cells.map(c => c.count)))
  function tone(count) {
    if (!count) return 'bg-valence-surface text-valence-subtle'
    const pct = count / max
    if (pct > 0.75) return 'bg-valence-blue text-white'
    if (pct > 0.5)  return 'bg-valence-blue/70 text-white'
    if (pct > 0.25) return 'bg-valence-blue/40 text-valence-text'
    return 'bg-valence-blue/20 text-valence-text'
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-[11px]">
        <thead>
          <tr>
            <th className="p-2 text-left vl-eyebrow-ink w-32">Sector</th>
            {stages.map(s => (
              <th key={s} className="p-2 text-center vl-eyebrow-ink whitespace-nowrap">{stageMeta(s).short}</th>
            ))}
            <th className="p-2 text-right vl-eyebrow-ink">Total</th>
          </tr>
        </thead>
        <tbody>
          {sectors.map(row => (
            <tr key={row.sector} className="border-t border-valence-border">
              <td className="p-2 font-semibold text-valence-text">{row.sector}</td>
              {row.cells.map(c => (
                <td key={c.stage} className="p-1">
                  <div className={`grid h-8 place-items-center rounded font-semibold tabular-nums ${tone(c.count)}`}>
                    {c.count || ''}
                  </div>
                </td>
              ))}
              <td className="p-2 text-right font-semibold tabular-nums text-valence-text">{row.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   Stage aging table
   ═══════════════════════════════════════════════════════════════════════ */
function StageAgingTable({ aging }) {
  const top = aging.slice(0, 8)
  function toneForDays(days) {
    if (days >= 45) return 'text-valence-danger bg-valence-danger/10'
    if (days >= 21) return 'text-valence-warning bg-valence-warning/10'
    return 'text-valence-muted bg-valence-surface'
  }
  if (!top.length) return <p className="text-sm text-valence-muted">No active deals in scope.</p>
  return (
    <ul className="space-y-1.5">
      {top.map(d => (
        <li key={d.id} className="flex items-center gap-3 rounded-lg border border-valence-border bg-valence-elevated px-3 py-2">
          <span className={`inline-flex w-24 shrink-0 justify-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${stageToneClasses(d.stage)}`}>{d.stage}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-valence-text">{d.client_name}</p>
            <p className="text-[11px] text-valence-muted">
              {d.deal_type}{d.sector ? ` · ${d.sector}` : ''}{d.lead_owner ? ` · ${d.lead_owner}` : ''}
            </p>
          </div>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneForDays(d._stageDays)}`}>
            <Hourglass className="h-3 w-3" /> {d._stageDays}d
          </span>
        </li>
      ))}
    </ul>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   Composition cards
   ═══════════════════════════════════════════════════════════════════════ */
function DistributionCard({ title, subtitle, items, money, icon: Icon }) {
  const maxVal = Math.max(1, ...items.map(x => x.valueUsdM))
  if (!items.length) {
    return (
      <div className="vl-card p-6">
        <CardTitle icon={Icon} title={title} subtitle={subtitle} />
        <p className="mt-6 text-sm text-valence-muted">No data yet.</p>
      </div>
    )
  }
  return (
    <div className="vl-card p-6">
      <CardTitle icon={Icon} title={title} subtitle={subtitle} />
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
              <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-valence-blue/40 to-valence-blue" style={{ width: `${(x.valueUsdM / maxVal) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   Productivity
   ═══════════════════════════════════════════════════════════════════════ */

function DropoffByOwnerCard({ rows }) {
  if (!rows?.length) {
    return (
      <div className="vl-card p-6">
        <CardTitle icon={Users} title="Drop-off by owner" subtitle="Passed vs reached diligence, per deal lead" />
        <p className="mt-4 text-sm text-valence-muted">No deals in scope.</p>
      </div>
    )
  }
  return (
    <div className="vl-card p-6">
      <CardTitle icon={Users} title="Drop-off by owner" subtitle="Passed vs reached diligence, per deal lead" />
      <div className="overflow-x-auto">
        <table className="min-w-full text-[11px]">
          <thead>
            <tr className="border-b border-valence-border">
              <th className="p-2 text-left vl-eyebrow-ink">Owner</th>
              <th className="p-2 text-right vl-eyebrow-ink">Total</th>
              <th className="p-2 text-right vl-eyebrow-ink">Active</th>
              <th className="p-2 text-right vl-eyebrow-ink">Reached</th>
              <th className="p-2 text-right vl-eyebrow-ink">Passed</th>
              <th className="p-2 text-right vl-eyebrow-ink w-28">Drop-off</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const high = r.passRate != null && r.passRate >= 50
              const rateTone = r.passRate == null
                ? 'text-valence-subtle'
                : high ? 'text-valence-danger' : 'text-valence-muted'
              return (
                <tr key={r.owner} className="border-t border-valence-border">
                  <td className="p-2 font-semibold text-valence-text">{r.owner}</td>
                  <td className="p-2 text-right tabular-nums text-valence-text">{r.total}</td>
                  <td className="p-2 text-right tabular-nums text-valence-muted">{r.active}</td>
                  <td className="p-2 text-right tabular-nums font-semibold text-valence-success">{r.reached}</td>
                  <td className="p-2 text-right tabular-nums font-semibold text-valence-danger">{r.passed}</td>
                  <td className="p-2">
                    <div className="flex items-center justify-end gap-2">
                      {r.passRate != null && (
                        <div className="relative h-1.5 w-12 rounded-full bg-valence-surface overflow-hidden">
                          <div className={`absolute inset-y-0 left-0 rounded-full ${high ? 'bg-valence-danger' : 'bg-valence-warning'}`} style={{ width: `${r.passRate}%` }} />
                        </div>
                      )}
                      <span className={`tabular-nums font-semibold ${rateTone}`}>{r.passRate == null ? '—' : `${r.passRate}%`}</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[10px] text-valence-subtle">Reached = graduated to Diligence · Passed = dropped before DD. Drop-off = passed ÷ resolved.</p>
    </div>
  )
}

function OriginationCard({ origin }) {
  const max = Math.max(1, ...origin.items.map(i => i.count))
  return (
    <div className="vl-card p-6">
      <CardTitle icon={Globe2} title="Sourcing channels" subtitle="How deals are entering the firm" right={origin.illustrative && <IllustrativeBadge />} />
      <ul className="space-y-2.5">
        {origin.items.map(i => (
          <li key={i.source}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-semibold text-valence-text">{i.source}</span>
              <span className="tabular-nums text-valence-muted">{i.count}</span>
            </div>
            <div className="relative h-2 rounded-full bg-valence-surface overflow-hidden">
              <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-valence-ink/50 to-valence-ink" style={{ width: `${(i.count / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function WinRateTrendCard({ trend }) {
  const anyIllustrative = trend.some(t => t.illustrative)
  const pts = trend.map((t, i) => ({ x: i / Math.max(1, trend.length - 1), y: t.rate == null ? 0.5 : t.rate }))
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * 100} ${100 - p.y * 100}`).join(' ')
  const area = `${path} L 100 100 L 0 100 Z`
  return (
    <div className="vl-card p-6">
      <CardTitle icon={Trophy} title="Win rate trend" subtitle="Rolling 4-week close rate · closed ÷ (closed + lost)" right={anyIllustrative && <IllustrativeBadge />} />
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
          {pts.map((p, i) => <circle key={i} cx={p.x * 100} cy={100 - p.y * 100} r="1.2" fill="#3399FF" vectorEffect="non-scaling-stroke" />)}
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

/* ═══════════════════════════════════════════════════════════════════════
   Forward-looking
   ═══════════════════════════════════════════════════════════════════════ */

function BookCurve({ curve }) {
  const pts = curve.points
  const maxC = Math.max(1, ...pts.map(p => p.cumulative))
  const maxA = Math.max(1, ...pts.map(p => p.added))
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i / (pts.length - 1)) * 100} ${100 - (p.cumulative / maxC) * 100}`).join(' ')
  const area = `${line} L 100 100 L 0 100 Z`
  return (
    <div>
      <div className="relative h-40 rounded-md border border-valence-border bg-valence-surface overflow-hidden">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <defs>
            <linearGradient id="bb-grad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#3399FF" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#3399FF" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#bb-grad)" />
          <path d={line} fill="none" stroke="#3399FF" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          {pts.map((p, i) => (
            <circle key={i} cx={(i / (pts.length - 1)) * 100} cy={100 - (p.cumulative / maxC) * 100} r="1.4" fill="#3399FF" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      </div>
      <div className="mt-3 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${pts.length}, minmax(0, 1fr))` }}>
        {pts.map(p => (
          <div key={p.label} className="text-center">
            <div className="h-6 flex items-end justify-center">
              <div className="w-full rounded-t bg-valence-blue/30" style={{ height: `${(p.added / maxA) * 100}%` }} />
            </div>
            <p className="text-[9px] text-valence-subtle mt-0.5">{p.label}</p>
            <p className="text-[10px] font-semibold tabular-nums text-valence-text">{p.cumulative}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-valence-subtle">Line · cumulative live deals. Bars · new deals added per month.</p>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   Coverage & quality
   ═══════════════════════════════════════════════════════════════════════ */
function GeographyCard({ geo, money }) {
  const total = geo.mumbai.count + geo.london.count
  const mumbaiPct = total ? (geo.mumbai.count / total) * 100 : 0
  return (
    <div className="vl-card p-6">
      <CardTitle icon={MapPin} title="Geography" subtitle="Coverage split across our two offices" />
      <div className="relative h-3 rounded-full overflow-hidden border border-valence-border">
        <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-valence-blue/70 to-valence-blue" style={{ width: `${mumbaiPct}%` }} />
        <div className="absolute inset-y-0 right-0 bg-valence-ink/80" style={{ width: `${100 - mumbaiPct}%` }} />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-valence-border bg-valence-elevated p-4">
          <p className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Building2 className="h-3 w-3 text-valence-blue" /> Mumbai</p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums text-valence-text">{geo.mumbai.count}</p>
          <p className="text-[11px] text-valence-muted mt-0.5">{money(geo.mumbai.valueUsdM)} aggregate</p>
        </div>
        <div className="rounded-lg border border-valence-border bg-valence-elevated p-4">
          <p className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Building2 className="h-3 w-3 text-valence-ink" /> London</p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums text-valence-text">{geo.london.count}</p>
          <p className="text-[11px] text-valence-muted mt-0.5">{money(geo.london.valueUsdM)} aggregate</p>
        </div>
      </div>
      <p className="mt-4 text-[10px] text-valence-subtle">Inferred from lead owner until a first-class <span className="rounded bg-valence-surface px-1">geo</span> field lands on deals.</p>
    </div>
  )
}

function HeatmapCard({ heatmap }) {
  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  const rows = Array.from({ length: 7 }, () => [])
  heatmap.grid.forEach((cell) => {
    const dow = (cell.date.getDay() + 6) % 7
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
      <CardTitle icon={Activity} title={`Team activity · ${heatmap.weeks} weeks`} subtitle="Every logged activity — stage changes, notes, files, meetings" right={heatmap.illustrative && <IllustrativeBadge />} />
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
                  return <div key={ri} title={`${cell.date.toDateString()} · ${cell.count} event${cell.count === 1 ? '' : 's'}`} className={`h-3.5 w-3.5 rounded-[3px] border ${tone(cell.count)}`} />
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

function RiskFlagsCard({ flags }) {
  const grouped = { high: [], warn: [], info: [] }
  for (const f of flags) grouped[f.severity]?.push(f)
  const order = [['high', 'High'], ['warn', 'Warn'], ['info', 'Info']]
  return (
    <div className="vl-card p-6">
      <CardTitle icon={ShieldAlert} title="Data hygiene" subtitle="Issues that hurt the integrity of these numbers" right={<span className="inline-flex items-center gap-1 rounded-full bg-valence-surface border border-valence-border px-2 py-0.5 text-[11px] font-semibold text-valence-muted">{flags.length} open</span>} />
      {!flags.length ? (
        <p className="text-sm text-valence-muted">No flags. Every deal in scope has owner, sector, size, fee structure.</p>
      ) : (
        <div className="space-y-3">
          {order.map(([sev, lbl]) => grouped[sev].length ? (
            <div key={sev}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-valence-muted mb-1.5">{lbl}</p>
              <ul className="space-y-1">
                {grouped[sev].slice(0, 6).map((f, i) => (
                  <li key={i} className={`flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-[11px] ${sev === 'high' ? 'border-valence-danger/30 bg-valence-danger/5 text-valence-danger' : sev === 'warn' ? 'border-valence-warning/30 bg-valence-warning/5 text-valence-warning' : 'border-valence-border bg-valence-surface text-valence-muted'}`}>
                    <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                    <span className="text-valence-text">{f.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null)}
        </div>
      )}
    </div>
  )
}
