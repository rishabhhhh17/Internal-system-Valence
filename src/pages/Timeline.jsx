import { useEffect, useMemo, useState } from 'react'
import { Filter, GanttChartSquare } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import ConfigBanner from '../components/ConfigBanner.jsx'
import EmptyState from '../components/EmptyState.jsx'
import TimelineGantt from '../components/TimelineGantt.jsx'

const LIVE_STAGES = ['Mandate', 'Preparation', 'Marketing', 'Diligence', 'Negotiation', 'Closing']
const ZOOM_OPTIONS = ['weeks', 'months', 'quarters']

export default function Timeline() {
  const [deals, setDeals]           = useState([])
  const [activities, setActivities] = useState([])
  const [loading, setLoading]       = useState(true)
  const [loadError, setLoadError]   = useState(null)
  const [zoom, setZoom]             = useState('months')
  const [ownerFilter, setOwnerFilter]   = useState('All')
  const [sectorFilter, setSectorFilter] = useState('All')
  const [sideFilter, setSideFilter]     = useState('All')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setLoadError(null)
    if (!isSupabaseConfigured) { setDeals(DEMO_DEALS); setActivities([]); setLoading(false); return }
    try {
      const fetchPromise = Promise.all([
        supabase.from('deals').select('*').in('stage', LIVE_STAGES).order('updated_at', { ascending: false }),
        supabase.from('activities').select('deal_id, kind, body, created_at').eq('kind', 'stage_change')
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
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-valence-muted">
            Past stages from the activity log. Current stage pulsing on today's line.
            Future stages projected from target close — adjust the zoom for the right altitude.
          </p>
        </div>
        <div className="inline-flex items-center rounded-full border border-valence-border bg-white p-0.5">
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
      </div>

      {/* Filter strip */}
      <div className="flex flex-wrap items-center gap-3">
        <FilterRow label="Lead owner" value={ownerFilter}  onChange={setOwnerFilter}  options={['All', ...owners]} />
        <FilterRow label="Sector"     value={sectorFilter} onChange={setSectorFilter} options={['All', ...sectors]} />
        <FilterRow label="Side"       value={sideFilter}   onChange={setSideFilter}   options={['All', ...sides]} />
      </div>

      {loading ? (
        <div className="vl-card p-10 grid place-items-center text-sm text-valence-muted">Drawing the timeline…</div>
      ) : loadError ? (
        <EmptyState icon={GanttChartSquare} title="Couldn't load timeline" description={loadError} action={<button onClick={load} className="vl-btn-primary">Retry</button>} />
      ) : (
        <TimelineGantt deals={filtered} activities={activities} zoom={zoom} onOpenDeal={openDeal} />
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
              : 'border-valence-border bg-white text-valence-muted hover:text-valence-text'
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
  { id: 'tl1', client_name: 'Nimbus Health',   stage: 'Diligence',   sector: 'Healthcare',     side: 'Sell-side', lead_owner: 'Neha Jain',       expected_close_date: daysFwd(75),  updated_at: daysAgo(28), created_at: daysAgo(210) },
  { id: 'tl2', client_name: 'Quantum Edge',    stage: 'Marketing',   sector: 'Fintech',        side: 'Sell-side', lead_owner: 'James Whitfield', expected_close_date: daysFwd(150), updated_at: daysAgo(7),  created_at: daysAgo(95)  },
  { id: 'tl3', client_name: 'Meridian EdTech', stage: 'Negotiation', sector: 'EdTech',         side: 'Sell-side', lead_owner: 'Priya Mehta',     expected_close_date: daysFwd(45),  updated_at: daysAgo(12), created_at: daysAgo(160) },
  { id: 'tl4', client_name: 'Orion Realty',    stage: 'Closing',     sector: 'Real Estate',    side: 'Sell-side', lead_owner: 'Neha Jain',       expected_close_date: daysFwd(25),  updated_at: daysAgo(3),  created_at: daysAgo(275) },
  { id: 'tl5', client_name: 'Aegis Logistics', stage: 'Preparation', sector: 'Logistics',      side: 'Sell-side', lead_owner: 'Oliver Hayes',    expected_close_date: daysFwd(180), updated_at: daysAgo(40), created_at: daysAgo(60)  },
  { id: 'tl6', client_name: 'Solstice Solar',  stage: 'Mandate',     sector: 'Renewables',     side: 'Sell-side', lead_owner: 'Neha Jain',       expected_close_date: daysFwd(170), updated_at: daysAgo(5),  created_at: daysAgo(42)  }
]
