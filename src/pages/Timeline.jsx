import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Filter, GanttChartSquare, Table as TableIcon, Activity, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { useViewMode } from '../hooks/useViewMode.jsx'
import { usePipelineMode } from '../hooks/usePipelineMode.js'
import { TERMINAL_STAGE_IDS, liveStagesForMode } from '../lib/stages.js'
import ConfigBanner from '../components/ConfigBanner.jsx'
import EmptyState from '../components/EmptyState.jsx'
import TimelineGantt from '../components/TimelineGantt.jsx'
import TimelineTable from '../components/TimelineTable.jsx'
import ViewModeToggle from '../components/ViewModeToggle.jsx'

const ZOOM_OPTIONS = ['weeks', 'months', 'quarters']
// Stages the Gantt chart treats as "in flight". Both funnels share the two
// terminal ids (Diligence / Passed), so a terminal blacklist works for the
// company AND the LP pipeline — terminal deals get surfaced in the Table
// view (with their close-out date) but aren't drawn as bars.
const TERMINAL_IDS = new Set(TERMINAL_STAGE_IDS)
const isInFlight = (d) => !TERMINAL_IDS.has(d.stage)

// Threshold below which we auto-default to Table — a Gantt with 3 rows
// and lots of empty cells looks like a broken product. Table is denser.
const GANTT_MIN_USEFUL_ROWS = 5
const STALE_DAYS_THRESHOLD  = 21

export default function Timeline() {
  const { isDetailed } = useViewMode('timeline')
  const [pipelineMode] = usePipelineMode()
  const [deals, setDeals]           = useState([])
  const [activities, setActivities] = useState([])
  const [loading, setLoading]       = useState(true)
  const [loadError, setLoadError]   = useState(null)
  const [zoom, setZoom]             = useState('months')
  // View defaults to null so the auto-select can kick in after data loads.
  // Once the user explicitly picks Gantt or Table, that choice sticks.
  const [view, setView]             = useState(null)
  const [ownerFilter, setOwnerFilter]   = useState('All')
  const [sectorFilter, setSectorFilter] = useState('All')
  const [sideFilter, setSideFilter]     = useState('All')

  // Re-load on mount and whenever the pipeline mode flips (company ↔ lp).
  useEffect(() => { load() }, [pipelineMode])

  async function load() {
    setLoading(true); setLoadError(null)
    if (!isSupabaseConfigured) { setDeals(DEMO_DEALS); setActivities(DEMO_ACTIVITIES); setLoading(false); return }
    try {
      const fetchPromise = Promise.all([
        // Pull every deal — the Table view surfaces terminal-stage rows so
        // the partner can see when a mandate closed / went on hold / was
        // lost. The Gantt filters terminal rows out itself when rendering.
        supabase.from('deals').select('*').eq('kind', pipelineMode).order('updated_at', { ascending: false }),
        // Pull every activity kind for these deals — stage_change drives
        // segment boundaries; meeting / nda_signed / teaser_sent / file_upload
        // / note / email_drafted / brief_generated / contact_added become
        // marker dots on the row (see TimelineGantt#MARKER_KIND).
        supabase.from('activities').select('deal_id, kind, body, created_at')
      ])
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out — check your connection or Supabase status.')), 10_000)
      )
      const [d, a] = await Promise.race([fetchPromise, timeoutPromise])
      if (d.error) throw d.error
      setDeals(d.data || [])
      setActivities(a.data || [])
    } catch (err) {
      console.error(err)
      setLoadError(err?.message || 'Couldn\'t load timeline.')
      setDeals([]); setActivities([])
    } finally {
      setLoading(false)
    }
  }

  const owners  = useMemo(() => uniqueValues(deals, 'lead_owner'), [deals])
  const sectors = useMemo(() => uniqueValues(deals, 'sector'),     [deals])
  const sides   = useMemo(() => Array.from(new Set(deals.map(d => normalizeSide(d.ma_side || d.side)).filter(Boolean))).sort(), [deals])

  const filtered = useMemo(() => deals.filter(d =>
    (ownerFilter  === 'All' || d.lead_owner === ownerFilter) &&
    (sectorFilter === 'All' || d.sector === sectorFilter) &&
    (sideFilter   === 'All' || normalizeSide(d.ma_side || d.side) === sideFilter)
  ), [deals, ownerFilter, sectorFilter, sideFilter])

  // Stats for the header strip. Computed off the FULL deal set, not the
  // filtered set, so the partner always sees the firm's actual position
  // even after narrowing the view.
  const stats = useMemo(() => computeStats(deals, activities, pipelineMode), [deals, activities, pipelineMode])

  // Auto-select the better view for the data shape: Gantt is great when
  // there are enough live mandates with dates to draw a meaningful chart,
  // Table is better when the data is sparse (which is most of the time
  // for a fresh customer with 1-4 mandates).
  const activeView = useMemo(() => {
    if (view) return view
    const liveCount = filtered.filter(isInFlight).length
    return liveCount >= GANTT_MIN_USEFUL_ROWS ? 'gantt' : 'table'
  }, [view, filtered])

  function openDeal(deal) {
    if (deal?.id) window.location.href = `/deals?open=${deal.id}`
  }

  return (
    <div className="space-y-5">
      <ConfigBanner />

      {/* Compact header — page label, primary stat, view controls. No
          fluffy h1; partners want to know the firm's state in two
          seconds. */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-valence-text">Timeline</h1>
          <span className="text-sm text-valence-muted">
            {stats.live} active deal{stats.live === 1 ? '' : 's'}
            {stats.live > 0 && ` · ${stats.inMandate} in execution`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ViewModeToggle pageKey="timeline" />
          <div className="inline-flex items-center rounded-full border border-valence-border bg-valence-elevated p-0.5">
            <button onClick={() => setView('gantt')} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${activeView === 'gantt' ? 'bg-valence-ink text-white' : 'text-valence-muted hover:text-valence-text'}`}>
              <GanttChartSquare className="h-3 w-3" /> Gantt
            </button>
            <button onClick={() => setView('table')} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${activeView === 'table' ? 'bg-valence-ink text-white' : 'text-valence-muted hover:text-valence-text'}`}>
              <TableIcon className="h-3 w-3" /> Table
            </button>
          </div>
          {activeView === 'gantt' && (
            <div className="inline-flex items-center rounded-full border border-valence-border bg-valence-elevated p-0.5">
              {ZOOM_OPTIONS.map(z => (
                <button
                  key={z}
                  onClick={() => setZoom(z)}
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold capitalize transition ${
                    zoom === z ? 'bg-valence-ink text-white' : 'text-valence-muted hover:text-valence-text'
                  }`}
                >{z}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stats strip — partner glance metrics. Each card is a tight
          number + label, not a marketing graphic. */}
      {!loading && deals.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatCard icon={<Activity className="h-3.5 w-3.5" />}
            label="Active deals" value={stats.live} tone="ink" />
          <StatCard icon={<Clock className="h-3.5 w-3.5" />}
            label="Closing in 90 days" value={stats.closingSoon} tone="blue" />
          <StatCard icon={<AlertTriangle className="h-3.5 w-3.5" />}
            label="Stale (>21d no interaction)" value={stats.stale}
            tone={stats.stale > 0 ? 'warning' : 'muted'} />
          <StatCard icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            label={pipelineMode === 'lp' ? 'Committed' : 'Reached diligence'} value={stats.closedQuarter} tone="success" />
        </div>
      )}

      {/* Filter strip — Detailed view only. Simple keeps the chrome quiet. */}
      {isDetailed && (
        <div className="flex flex-wrap items-center gap-3">
          <FilterRow label="Lead owner" value={ownerFilter}  onChange={setOwnerFilter}  options={['All', ...owners]} />
          <FilterRow label="Sector"     value={sectorFilter} onChange={setSectorFilter} options={['All', ...sectors]} />
          <FilterRow label="Role"       value={sideFilter}   onChange={setSideFilter}   options={['All', ...sides]} />
        </div>
      )}

      {loading ? (
        <div className="vl-card p-10 grid place-items-center text-sm text-valence-muted">Drawing the timeline…</div>
      ) : loadError ? (
        <EmptyState icon={GanttChartSquare} title="Couldn't load timeline" description={loadError} action={<button onClick={load} className="vl-btn-primary">Retry</button>} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={GanttChartSquare}
          title={deals.length === 0 ? 'No deals to chart yet' : 'No deals match your filters'}
          description={deals.length === 0 ? 'Log a deal in Pipeline and it\'ll appear here automatically.' : 'Try widening the owner / sector / role filters.'}
          action={deals.length === 0 ? <Link to="/deals" className="vl-btn-primary">Open Pipeline</Link> : null}
        />
      ) : activeView === 'table' ? (
        <TimelineTable deals={filtered} activities={activities} mode={pipelineMode} onOpenDeal={openDeal} />
      ) : (
        // Gantt keeps to in-flight stages; terminal ones live in the table view.
        <TimelineGantt deals={filtered.filter(isInFlight)} activities={activities} zoom={zoom} mode={pipelineMode} onOpenDeal={openDeal} />
      )}
    </div>
  )
}

// ============ STATS ============
// Computed off the raw deals + activities, not the filtered ones, so the
// partner always sees the firm's actual position.
function computeStats(deals, activities, mode) {
  // Deepest actively-worked stage for this funnel (Memo / LP Soft Circle) —
  // drives the "in execution" count.
  const liveStages = liveStagesForMode(mode)
  const deepestId = liveStages[liveStages.length - 1]
  const now = Date.now()
  const ms21d   = 21  * 86_400_000
  const ms90d   = 90  * 86_400_000
  const quarter = quarterBounds(new Date())
  const lastTouchByDeal = new Map()
  for (const a of activities || []) {
    if (!a.deal_id || !a.created_at) continue
    const t = new Date(a.created_at).getTime()
    const cur = lastTouchByDeal.get(a.deal_id) || 0
    if (t > cur) lastTouchByDeal.set(a.deal_id, t)
  }
  let live = 0, inMandate = 0, closingSoon = 0, stale = 0, closedQuarter = 0
  for (const d of deals) {
    const isLive = isInFlight(d)
    if (isLive) {
      live += 1
      if (d.stage === deepestId) inMandate += 1
      const closeDate = d.expected_close_date || d.target_close
      if (closeDate) {
        const t = new Date(closeDate).getTime() - now
        if (t >= 0 && t <= ms90d) closingSoon += 1
      }
      const lastTouch = lastTouchByDeal.get(d.id) || (d.updated_at ? new Date(d.updated_at).getTime() : 0)
      if (lastTouch && (now - lastTouch) > ms21d) stale += 1
    }
    if (d.stage === 'Diligence' && d.updated_at) {
      const t = new Date(d.updated_at).getTime()
      if (t >= quarter.start && t <= quarter.end) closedQuarter += 1
    }
  }
  return { live, inMandate, closingSoon, stale, closedQuarter }
}

function quarterBounds(d) {
  const q = Math.floor(d.getMonth() / 3)
  const start = new Date(d.getFullYear(), q * 3, 1).getTime()
  const end   = new Date(d.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999).getTime()
  return { start, end }
}

function StatCard({ icon, label, value, tone = 'ink' }) {
  // Tone maps to a colour ring on the icon — keeps the cards visually
  // identical in size, lets the eye scan colour for severity.
  const ring = ({
    ink:     'bg-valence-ink/5 text-valence-ink-soft border-valence-ink/15',
    blue:    'bg-valence-blue-soft text-valence-blue-deep border-valence-blue/20',
    success: 'bg-valence-success/10 text-valence-success border-valence-success/30',
    warning: 'bg-valence-warning/10 text-valence-warning border-valence-warning/30',
    muted:   'bg-valence-surface text-valence-muted border-valence-border'
  })[tone] || 'bg-valence-surface text-valence-muted border-valence-border'
  return (
    <div className="vl-card px-4 py-3 flex items-center gap-3">
      <span className={`grid h-8 w-8 place-items-center rounded-lg border ${ring}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.12em] text-valence-subtle">{label}</p>
        <p className="text-lg font-semibold tabular-nums text-valence-text leading-none mt-1">{value}</p>
      </div>
    </div>
  )
}

function FilterRow({ label, value, onChange, options }) {
  // IB-grade filter chips: monochrome, outline-only. Active state uses
  // an inverted ink fill instead of a saturated blue tint so the row
  // reads as a control surface, not decoration.
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-valence-subtle inline-flex items-center gap-1.5 mr-1">
        <Filter className="h-3 w-3" /> {label}
      </span>
      {options.map(o => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`rounded-md border px-2 py-0.5 text-[11px] font-medium transition ${
            value === o
              ? 'border-valence-ink bg-valence-ink text-white'
              : 'border-valence-border bg-valence-elevated text-valence-muted hover:border-valence-ink/30 hover:text-valence-text'
          }`}
        >{o}</button>
      ))}
    </div>
  )
}

function uniqueValues(rows, key) {
  return Array.from(new Set(rows.map(r => r[key]).filter(Boolean))).sort()
}
function normalizeSide(side) {
  if (!side) return null
  if (/^buy/i.test(side)) return 'Buy'
  if (/^sell/i.test(side)) return 'Sell'
  return side
}

const today = new Date()
const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return d.toISOString() }
const daysFwd = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return d.toISOString().slice(0,10) }
const DEMO_DEALS = [
  { id: 'tl1', client_name: 'Nimbus Health',   stage: 'Memo',         sector: 'Healthcare',     side: 'Sell-side', lead_owner: 'Neha Jain',       expected_close_date: daysFwd(75),  updated_at: daysAgo(28), created_at: daysAgo(210) },
  { id: 'tl2', client_name: 'Quantum Edge',    stage: 'Memo',         sector: 'Fintech',        side: 'Sell-side', lead_owner: 'James Whitfield', expected_close_date: daysFwd(150), updated_at: daysAgo(7),  created_at: daysAgo(95)  },
  { id: 'tl3', client_name: 'Meridian EdTech', stage: 'Memo',         sector: 'EdTech',         side: 'Sell-side', lead_owner: 'Priya Mehta',     expected_close_date: daysFwd(45),  updated_at: daysAgo(12), created_at: daysAgo(160) },
  { id: 'tl4', client_name: 'Orion Realty',    stage: 'Memo',         sector: 'Real Estate',    side: 'Sell-side', lead_owner: 'Neha Jain',       expected_close_date: daysFwd(25),  updated_at: daysAgo(3),  created_at: daysAgo(275) },
  { id: 'tl5', client_name: 'Aegis Logistics', stage: 'Partner Call', sector: 'Logistics',      side: 'Sell-side', lead_owner: 'Oliver Hayes',    expected_close_date: daysFwd(180), updated_at: daysAgo(40), created_at: daysAgo(60)  },
  { id: 'tl6', client_name: 'Solstice Solar',  stage: 'Partner Call', sector: 'Renewables',     side: 'Sell-side', lead_owner: 'Neha Jain',       expected_close_date: daysFwd(170), updated_at: daysAgo(5),  created_at: daysAgo(42)  },
  { id: 'tl7', client_name: 'Halo Beverages',  stage: 'Analyst Call', sector: 'Consumer',       side: 'Buy-side',  lead_owner: 'James Whitfield', expected_close_date: daysFwd(120), updated_at: daysAgo(15), created_at: daysAgo(50)  },
  { id: 'tl8', client_name: 'Vertex Bridge',   stage: 'Memo',         sector: 'Infrastructure', side: 'Sell-side', lead_owner: 'Oliver Hayes',    expected_close_date: daysFwd(220), updated_at: daysAgo(20), created_at: daysAgo(180) }
]

// Demo activity log so the timeline tells a story even without Supabase. We
// stage stage_change events alongside meeting / file / nda / teaser / note
// / brief / contact dots — gives the partner a feel for cross-deal velocity.
const DEMO_ACTIVITIES = [
  // Nimbus Health (Healthcare · Mandate · closes in 75d)
  { deal_id: 'tl1', kind: 'stage_change',    body: 'Partner Call → Memo', created_at: daysAgo(120) },
  { deal_id: 'tl1', kind: 'nda_signed',      body: 'NDA executed with Apollo Hospitals', created_at: daysAgo(115) },
  { deal_id: 'tl1', kind: 'teaser_sent',     body: 'Teaser circulated to 18 healthcare PE',  created_at: daysAgo(95) },
  { deal_id: 'tl1', kind: 'meeting',         body: 'Mgmt presentation · KKR',                created_at: daysAgo(70) },
  { deal_id: 'tl1', kind: 'meeting',         body: 'Mgmt presentation · Bain Capital',       created_at: daysAgo(55) },
  { deal_id: 'tl1', kind: 'file_upload',     body: 'Audited FY24 financials',                created_at: daysAgo(40) },
  { deal_id: 'tl1', kind: 'note',            body: 'Two LOIs in hand',                       created_at: daysAgo(10) },

  // Quantum Edge (Fintech · Mandate · closes in 150d)
  { deal_id: 'tl2', kind: 'stage_change',    body: 'Partner Call → Memo',     created_at: daysAgo(60) },
  { deal_id: 'tl2', kind: 'brief_generated', body: 'CIM v1 generated',           created_at: daysAgo(48) },
  { deal_id: 'tl2', kind: 'teaser_sent',     body: 'Teaser to 12 fintech-focused investors', created_at: daysAgo(35) },
  { deal_id: 'tl2', kind: 'meeting',         body: 'Pitch · Tiger Global',       created_at: daysAgo(22) },
  { deal_id: 'tl2', kind: 'email_drafted',   body: 'Process letter draft',       created_at: daysAgo(8)  },

  // Meridian EdTech (EdTech · Mandate · closes in 45d)
  { deal_id: 'tl3', kind: 'stage_change',    body: 'Partner Call → Memo',     created_at: daysAgo(95) },
  { deal_id: 'tl3', kind: 'meeting',         body: 'Diligence call · Sequoia',  created_at: daysAgo(72) },
  { deal_id: 'tl3', kind: 'file_upload',     body: 'Technical due-diligence pack', created_at: daysAgo(60) },
  { deal_id: 'tl3', kind: 'meeting',         body: 'Site visit · Bengaluru campus', created_at: daysAgo(45) },
  { deal_id: 'tl3', kind: 'meeting',         body: 'IC presentation · Lightspeed',  created_at: daysAgo(20) },
  { deal_id: 'tl3', kind: 'note',            body: 'Final bid date set', created_at: daysAgo(4) },

  // Orion Realty (Real Estate · Mandate · closes in 25d)
  { deal_id: 'tl4', kind: 'stage_change',    body: 'Partner Call → Memo',     created_at: daysAgo(180) },
  { deal_id: 'tl4', kind: 'teaser_sent',     body: 'Teaser to 8 sovereigns + family offices', created_at: daysAgo(160) },
  { deal_id: 'tl4', kind: 'meeting',         body: 'Mgmt meet · GIC',            created_at: daysAgo(110) },
  { deal_id: 'tl4', kind: 'meeting',         body: 'Mgmt meet · Brookfield',     created_at: daysAgo(80)  },
  { deal_id: 'tl4', kind: 'file_upload',     body: 'Valuation reports',          created_at: daysAgo(50)  },
  { deal_id: 'tl4', kind: 'contact_added',   body: 'Added Brookfield India MD',  created_at: daysAgo(35)  },
  { deal_id: 'tl4', kind: 'meeting',         body: 'Final negotiation',          created_at: daysAgo(7)   },

  // Aegis Logistics (Logistics · Pre-Mandate)
  { deal_id: 'tl5', kind: 'meeting',         body: 'Intro · founder coffee',     created_at: daysAgo(45) },
  { deal_id: 'tl5', kind: 'note',            body: 'Founder still deciding',     created_at: daysAgo(32) },
  { deal_id: 'tl5', kind: 'meeting',         body: 'Follow-up call',             created_at: daysAgo(18) },

  // Solstice Solar (Renewables · Pre-Mandate)
  { deal_id: 'tl6', kind: 'meeting',         body: 'Pitch meeting · partner Adi', created_at: daysAgo(40) },
  { deal_id: 'tl6', kind: 'file_upload',     body: 'Project pipeline deck',       created_at: daysAgo(28) },
  { deal_id: 'tl6', kind: 'email_drafted',   body: 'Engagement letter draft',     created_at: daysAgo(12) },
  { deal_id: 'tl6', kind: 'note',            body: 'Targeting Q3 partner call',   created_at: daysAgo(3)  },

  // Halo Beverages (Consumer · Pre-Mandate · Buy-side)
  { deal_id: 'tl7', kind: 'meeting',         body: 'Intro · Pinnacle Foods',     created_at: daysAgo(38) },
  { deal_id: 'tl7', kind: 'meeting',         body: 'Intro · Wholesum',           created_at: daysAgo(25) },
  { deal_id: 'tl7', kind: 'note',            body: 'Three targets shortlisted',  created_at: daysAgo(10) },

  // Vertex Bridge (Infrastructure · Mandate)
  { deal_id: 'tl8', kind: 'stage_change',    body: 'Partner Call → Memo',     created_at: daysAgo(140) },
  { deal_id: 'tl8', kind: 'teaser_sent',     body: 'Teaser to 6 infra funds',   created_at: daysAgo(120) },
  { deal_id: 'tl8', kind: 'meeting',         body: 'Mgmt meet · Macquarie',     created_at: daysAgo(85) },
  { deal_id: 'tl8', kind: 'file_upload',     body: 'Concession agreement docs', created_at: daysAgo(50) },
  { deal_id: 'tl8', kind: 'brief_generated', body: 'CIM v2 generated',          created_at: daysAgo(25) }
]
