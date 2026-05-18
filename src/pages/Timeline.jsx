import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Filter, GanttChartSquare, Table as TableIcon } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { useViewMode } from '../hooks/useViewMode.jsx'
import ConfigBanner from '../components/ConfigBanner.jsx'
import EmptyState from '../components/EmptyState.jsx'
import TimelineGantt from '../components/TimelineGantt.jsx'
import TimelineTable from '../components/TimelineTable.jsx'
import ViewModeToggle from '../components/ViewModeToggle.jsx'

const ZOOM_OPTIONS = ['weeks', 'months', 'quarters']
// Stages the Gantt chart treats as "in flight". Terminal stages get
// surfaced in the Table view (with their close-out date) but aren't
// drawn as bars on the timeline.
const NON_TERMINAL_STAGES = new Set(['Origination','Pitching','Pre-Mandate','Mandate'])

export default function Timeline() {
  const { isDetailed } = useViewMode('timeline')
  const [deals, setDeals]           = useState([])
  const [activities, setActivities] = useState([])
  const [loading, setLoading]       = useState(true)
  const [loadError, setLoadError]   = useState(null)
  const [zoom, setZoom]             = useState('months')
  const [view, setView]             = useState('gantt')   // 'gantt' | 'table'
  const [ownerFilter, setOwnerFilter]   = useState('All')
  const [sectorFilter, setSectorFilter] = useState('All')
  const [sideFilter, setSideFilter]     = useState('All')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setLoadError(null)
    if (!isSupabaseConfigured) { setDeals(DEMO_DEALS); setActivities(DEMO_ACTIVITIES); setLoading(false); return }
    try {
      const fetchPromise = Promise.all([
        // Pull every deal — the Table view surfaces terminal-stage rows so
        // the partner can see when a mandate closed / went on hold / was
        // lost. The Gantt filters terminal rows out itself when rendering.
        supabase.from('deals').select('*').order('updated_at', { ascending: false }),
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
  const sides   = useMemo(() => Array.from(new Set(deals.map(d => normalizeSide(d.side)).filter(Boolean))).sort(), [deals])

  const filtered = useMemo(() => deals.filter(d =>
    (ownerFilter  === 'All' || d.lead_owner === ownerFilter) &&
    (sectorFilter === 'All' || d.sector === sectorFilter) &&
    (sideFilter   === 'All' || normalizeSide(d.side) === sideFilter)
  ), [deals, ownerFilter, sectorFilter, sideFilter])

  function openDeal(deal) {
    if (deal?.id) window.location.href = `/deals?open=${deal.id}`
  }

  return (
    <div className="space-y-6">
      <ConfigBanner />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="vl-eyebrow-ink">Timeline</p>
          <h1 className="mt-2 font-display text-feature font-bold text-valence-text">
            Where every mandate sits in time.
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <ViewModeToggle pageKey="timeline" />
          {/* Gantt vs Table toggle. Table view shows per-stage date stamps
              (Origination / Pitching / Pre-Mandate / Mandate / Outcome) so
              the partner can audit when each transition happened. */}
          <div className="inline-flex items-center rounded-full border border-valence-border bg-valence-elevated p-0.5">
            <button onClick={() => setView('gantt')} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${view === 'gantt' ? 'bg-valence-ink text-white' : 'text-valence-muted hover:text-valence-text'}`}>
              <GanttChartSquare className="h-3 w-3" /> Gantt
            </button>
            <button onClick={() => setView('table')} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${view === 'table' ? 'bg-valence-ink text-white' : 'text-valence-muted hover:text-valence-text'}`}>
              <TableIcon className="h-3 w-3" /> Table
            </button>
          </div>
          {view === 'gantt' && (
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

      {/* Filter strip — Detailed view only. Simple keeps the chrome quiet. */}
      {isDetailed && (
        <div className="flex flex-wrap items-center gap-3">
          <FilterRow label="Lead owner" value={ownerFilter}  onChange={setOwnerFilter}  options={['All', ...owners]} />
          <FilterRow label="Sector"     value={sectorFilter} onChange={setSectorFilter} options={['All', ...sectors]} />
          <FilterRow label="Side"       value={sideFilter}   onChange={setSideFilter}   options={['All', ...sides]} />
        </div>
      )}

      {loading ? (
        <div className="vl-card p-10 grid place-items-center text-sm text-valence-muted">Drawing the timeline…</div>
      ) : loadError ? (
        <EmptyState icon={GanttChartSquare} title="Couldn't load timeline" description={loadError} action={<button onClick={load} className="vl-btn-primary">Retry</button>} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={GanttChartSquare}
          title={deals.length === 0 ? 'No mandates to chart yet' : 'No mandates match your filters'}
          description={deals.length === 0 ? 'Log a mandate in Deal Logger and it\'ll appear here automatically.' : 'Try widening the owner / sector / side filters.'}
          action={deals.length === 0 ? <Link to="/deals" className="vl-btn-primary">Open Deal Logger</Link> : null}
        />
      ) : view === 'table' ? (
        <TimelineTable deals={filtered} activities={activities} onOpenDeal={openDeal} />
      ) : (
        // Gantt keeps to in-flight stages; terminal ones live in the table view.
        <TimelineGantt deals={filtered.filter(d => NON_TERMINAL_STAGES.has(d.stage))} activities={activities} zoom={zoom} onOpenDeal={openDeal} />
      )}
    </div>
  )
}

function FilterRow({ label, value, onChange, options }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Filter className="h-3 w-3" /> {label}</span>
      {options.map(o => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
            value === o
              ? 'border-valence-blue/40 bg-valence-blue-soft text-valence-text'
              : 'border-valence-border bg-valence-elevated text-valence-muted hover:text-valence-text'
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
  { id: 'tl1', client_name: 'Nimbus Health',   stage: 'Mandate',     sector: 'Healthcare',     side: 'Sell-side', lead_owner: 'Neha Jain',       expected_close_date: daysFwd(75),  updated_at: daysAgo(28), created_at: daysAgo(210) },
  { id: 'tl2', client_name: 'Quantum Edge',    stage: 'Mandate',     sector: 'Fintech',        side: 'Sell-side', lead_owner: 'James Whitfield', expected_close_date: daysFwd(150), updated_at: daysAgo(7),  created_at: daysAgo(95)  },
  { id: 'tl3', client_name: 'Meridian EdTech', stage: 'Mandate',     sector: 'EdTech',         side: 'Sell-side', lead_owner: 'Priya Mehta',     expected_close_date: daysFwd(45),  updated_at: daysAgo(12), created_at: daysAgo(160) },
  { id: 'tl4', client_name: 'Orion Realty',    stage: 'Mandate',     sector: 'Real Estate',    side: 'Sell-side', lead_owner: 'Neha Jain',       expected_close_date: daysFwd(25),  updated_at: daysAgo(3),  created_at: daysAgo(275) },
  { id: 'tl5', client_name: 'Aegis Logistics', stage: 'Pre-Mandate', sector: 'Logistics',      side: 'Sell-side', lead_owner: 'Oliver Hayes',    expected_close_date: daysFwd(180), updated_at: daysAgo(40), created_at: daysAgo(60)  },
  { id: 'tl6', client_name: 'Solstice Solar',  stage: 'Pre-Mandate', sector: 'Renewables',     side: 'Sell-side', lead_owner: 'Neha Jain',       expected_close_date: daysFwd(170), updated_at: daysAgo(5),  created_at: daysAgo(42)  },
  { id: 'tl7', client_name: 'Halo Beverages',  stage: 'Pre-Mandate', sector: 'Consumer',       side: 'Buy-side',  lead_owner: 'James Whitfield', expected_close_date: daysFwd(120), updated_at: daysAgo(15), created_at: daysAgo(50)  },
  { id: 'tl8', client_name: 'Vertex Bridge',   stage: 'Mandate',     sector: 'Infrastructure', side: 'Sell-side', lead_owner: 'Oliver Hayes',    expected_close_date: daysFwd(220), updated_at: daysAgo(20), created_at: daysAgo(180) }
]

// Demo activity log so the timeline tells a story even without Supabase. We
// stage stage_change events alongside meeting / file / nda / teaser / note
// / brief / contact dots — gives the partner a feel for cross-deal velocity.
const DEMO_ACTIVITIES = [
  // Nimbus Health (Healthcare · Mandate · closes in 75d)
  { deal_id: 'tl1', kind: 'stage_change',    body: 'Pre-Mandate → Mandate', created_at: daysAgo(120) },
  { deal_id: 'tl1', kind: 'nda_signed',      body: 'NDA executed with Apollo Hospitals', created_at: daysAgo(115) },
  { deal_id: 'tl1', kind: 'teaser_sent',     body: 'Teaser circulated to 18 healthcare PE',  created_at: daysAgo(95) },
  { deal_id: 'tl1', kind: 'meeting',         body: 'Mgmt presentation · KKR',                created_at: daysAgo(70) },
  { deal_id: 'tl1', kind: 'meeting',         body: 'Mgmt presentation · Bain Capital',       created_at: daysAgo(55) },
  { deal_id: 'tl1', kind: 'file_upload',     body: 'Audited FY24 financials',                created_at: daysAgo(40) },
  { deal_id: 'tl1', kind: 'note',            body: 'Two LOIs in hand',                       created_at: daysAgo(10) },

  // Quantum Edge (Fintech · Mandate · closes in 150d)
  { deal_id: 'tl2', kind: 'stage_change',    body: 'Pre-Mandate → Mandate',     created_at: daysAgo(60) },
  { deal_id: 'tl2', kind: 'brief_generated', body: 'CIM v1 generated',           created_at: daysAgo(48) },
  { deal_id: 'tl2', kind: 'teaser_sent',     body: 'Teaser to 12 fintech-focused investors', created_at: daysAgo(35) },
  { deal_id: 'tl2', kind: 'meeting',         body: 'Pitch · Tiger Global',       created_at: daysAgo(22) },
  { deal_id: 'tl2', kind: 'email_drafted',   body: 'Process letter draft',       created_at: daysAgo(8)  },

  // Meridian EdTech (EdTech · Mandate · closes in 45d)
  { deal_id: 'tl3', kind: 'stage_change',    body: 'Pre-Mandate → Mandate',     created_at: daysAgo(95) },
  { deal_id: 'tl3', kind: 'meeting',         body: 'Diligence call · Sequoia',  created_at: daysAgo(72) },
  { deal_id: 'tl3', kind: 'file_upload',     body: 'Technical due-diligence pack', created_at: daysAgo(60) },
  { deal_id: 'tl3', kind: 'meeting',         body: 'Site visit · Bengaluru campus', created_at: daysAgo(45) },
  { deal_id: 'tl3', kind: 'meeting',         body: 'IC presentation · Lightspeed',  created_at: daysAgo(20) },
  { deal_id: 'tl3', kind: 'note',            body: 'Final bid date set', created_at: daysAgo(4) },

  // Orion Realty (Real Estate · Mandate · closes in 25d)
  { deal_id: 'tl4', kind: 'stage_change',    body: 'Pre-Mandate → Mandate',     created_at: daysAgo(180) },
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
  { deal_id: 'tl6', kind: 'note',            body: 'Targeting Q3 mandate',        created_at: daysAgo(3)  },

  // Halo Beverages (Consumer · Pre-Mandate · Buy-side)
  { deal_id: 'tl7', kind: 'meeting',         body: 'Intro · Pinnacle Foods',     created_at: daysAgo(38) },
  { deal_id: 'tl7', kind: 'meeting',         body: 'Intro · Wholesum',           created_at: daysAgo(25) },
  { deal_id: 'tl7', kind: 'note',            body: 'Three targets shortlisted',  created_at: daysAgo(10) },

  // Vertex Bridge (Infrastructure · Mandate)
  { deal_id: 'tl8', kind: 'stage_change',    body: 'Pre-Mandate → Mandate',     created_at: daysAgo(140) },
  { deal_id: 'tl8', kind: 'teaser_sent',     body: 'Teaser to 6 infra funds',   created_at: daysAgo(120) },
  { deal_id: 'tl8', kind: 'meeting',         body: 'Mgmt meet · Macquarie',     created_at: daysAgo(85) },
  { deal_id: 'tl8', kind: 'file_upload',     body: 'Concession agreement docs', created_at: daysAgo(50) },
  { deal_id: 'tl8', kind: 'brief_generated', body: 'CIM v2 generated',          created_at: daysAgo(25) }
]
