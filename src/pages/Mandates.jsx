import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO, differenceInCalendarDays, formatDistanceToNowStrict } from 'date-fns'
import { Briefcase, Filter, Users, AlertTriangle, ArrowUpRight } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { stageMeta, stageToneClasses } from '../lib/stages.js'
import ConfigBanner from '../components/ConfigBanner.jsx'
import EmptyState from '../components/EmptyState.jsx'

// Per spec: Live Mandates only — engaged through Closing. No Origination or Pitch
// (those are Interactions territory) and no terminal stages.
const LIVE_STAGES = ['Mandate', 'Preparation', 'Marketing', 'Diligence', 'Negotiation', 'Closing']
const STALE_THRESHOLD_DAYS = 21

export default function Mandates() {
  const [deals, setDeals]           = useState([])
  const [activities, setActivities] = useState([])
  const [loading, setLoading]       = useState(true)
  const [loadError, setLoadError]   = useState(null)
  const [ownerFilter, setOwnerFilter] = useState('All')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setLoadError(null)
    if (!isSupabaseConfigured) {
      setDeals(DEMO_MANDATES); setActivities([]); setLoading(false); return
    }
    try {
      const fetchPromise = Promise.all([
        supabase.from('deals').select('*').in('stage', LIVE_STAGES).order('updated_at', { ascending: false }),
        supabase.from('activities').select('deal_id, kind, created_at').eq('kind', 'stage_change')
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
      setLoadError(err?.message || 'Couldn\'t load mandates.')
      setDeals([]); setActivities([])
    } finally {
      setLoading(false)
    }
  }

  const enriched = useMemo(() => {
    const lastStageChange = new Map()
    for (const a of activities) {
      const t = new Date(a.created_at)
      const prev = lastStageChange.get(a.deal_id)
      if (!prev || t > prev) lastStageChange.set(a.deal_id, t)
    }
    const today = new Date()
    return deals.map(d => {
      const stageSince = lastStageChange.get(d.id) || new Date(d.updated_at || d.created_at || today)
      const daysInStage = Math.max(0, differenceInCalendarDays(today, stageSince))
      const closeIso = d.expected_close_date || d.target_close
      let daysToClose = null
      if (closeIso) {
        const t = typeof closeIso === 'string' ? parseISO(closeIso) : new Date(closeIso)
        if (!Number.isNaN(t.getTime())) daysToClose = differenceInCalendarDays(t, today)
      }
      return { ...d, _stageSince: stageSince, _daysInStage: daysInStage, _daysToClose: daysToClose, _closeIso: closeIso }
    })
  }, [deals, activities])

  const owners = useMemo(() => {
    const set = new Set()
    for (const d of enriched) if (d.lead_owner) set.add(d.lead_owner)
    return ['All', ...Array.from(set).sort()]
  }, [enriched])

  const filtered = useMemo(() => {
    return enriched.filter(d => ownerFilter === 'All' || d.lead_owner === ownerFilter)
  }, [enriched, ownerFilter])

  // Group by stage in canonical Live order, sort within group by days-in-stage desc.
  const grouped = useMemo(() => {
    const map = new Map(LIVE_STAGES.map(s => [s, []]))
    for (const d of filtered) {
      const bucket = map.get(d.stage)
      if (bucket) bucket.push(d)
    }
    for (const arr of map.values()) arr.sort((a, b) => b._daysInStage - a._daysInStage)
    return Array.from(map.entries()).filter(([, arr]) => arr.length > 0)
  }, [filtered])

  const totalLive = filtered.length

  return (
    <div className="space-y-6">
      <ConfigBanner />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="vl-eyebrow-ink">Live Mandates</p>
          <h1 className="mt-2 font-display text-feature font-bold text-valence-text">
            Active book — engaged through closing.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-valence-muted">
            Every mandate currently in motion. Grouped by stage. Slowest-moving deals surface at the top of each group.
          </p>
        </div>
        <Link to="/deals" className="vl-btn-secondary"><Briefcase className="h-4 w-4" /> Open Deal Logger</Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Filter className="h-3 w-3" /> Lead owner</span>
        {owners.map(o => (
          <button
            key={o}
            onClick={() => setOwnerFilter(o)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
              ownerFilter === o
                ? 'border-valence-blue/40 bg-valence-blue-soft text-valence-text'
                : 'border-valence-border bg-white text-valence-muted hover:text-valence-text'
            }`}
          >{o}</button>
        ))}
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-valence-border bg-white px-2.5 py-1 text-[11px] text-valence-muted">
          <Users className="h-3 w-3" /> {totalLive} live mandate{totalLive === 1 ? '' : 's'}
        </span>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : loadError ? (
        <EmptyState icon={Briefcase} title="Couldn't load mandates" description={loadError} action={<button onClick={load} className="vl-btn-primary">Retry</button>} />
      ) : grouped.length === 0 ? (
        <EmptyState icon={Briefcase} title="No live mandates" description="Mandates appear here once a deal moves into Mandate or beyond." action={<Link to="/deals" className="vl-btn-primary">Open Deal Logger</Link>} />
      ) : (
        <div className="space-y-6">
          {grouped.map(([stage, rows]) => (
            <section key={stage} className="vl-card overflow-hidden">
              <header className="flex items-center justify-between border-b border-valence-border px-5 py-3 bg-valence-surface">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${stageToneClasses(stage)}`}>{stage}</span>
                  <span className="text-[11px] text-valence-muted">{stageMeta(stage).short}</span>
                </div>
                <span className="text-[11px] tabular-nums text-valence-muted">{rows.length} mandate{rows.length === 1 ? '' : 's'}</span>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-valence-subtle">
                      <th className="px-5 py-2 font-semibold">Company</th>
                      <th className="px-3 py-2 font-semibold">Sector</th>
                      <th className="px-3 py-2 font-semibold">Side</th>
                      <th className="px-3 py-2 font-semibold">Lead owner</th>
                      <th className="px-3 py-2 font-semibold text-right">Days in stage</th>
                      <th className="px-3 py-2 font-semibold">Target close</th>
                      <th className="px-3 py-2 font-semibold">Last activity</th>
                      <th className="px-5 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(d => <MandateRow key={d.id} d={d} />)}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function MandateRow({ d }) {
  const stale = d._daysInStage > STALE_THRESHOLD_DAYS
  return (
    <tr className="border-t border-valence-border/60 hover:bg-valence-surface/60 transition">
      <td className="px-5 py-3 font-semibold text-valence-text">
        <Link to={`/deals?open=${d.id}`} className="inline-flex items-center gap-1.5 hover:text-valence-blue">
          {d.client_name}
          {stale && <span title="More than three weeks in this stage" className="inline-flex"><AlertTriangle className="h-3 w-3 text-valence-warning" /></span>}
        </Link>
      </td>
      <td className="px-3 py-3 text-valence-muted">{d.sector || '—'}</td>
      <td className="px-3 py-3 text-valence-muted">{normalizeSide(d.side) || '—'}</td>
      <td className="px-3 py-3 text-valence-muted">{d.lead_owner || '—'}</td>
      <td className={`px-3 py-3 text-right tabular-nums ${stale ? 'font-semibold text-valence-warning' : 'text-valence-text'}`}>
        {d._daysInStage}d
      </td>
      <td className="px-3 py-3 text-valence-muted">
        {d._closeIso ? (
          <span className={d._daysToClose != null && d._daysToClose < 0 ? 'text-valence-danger font-semibold' : ''}>
            {format(parseISO(String(d._closeIso).slice(0, 10)), 'd MMM yyyy')}
            {d._daysToClose != null && (
              <span className="ml-1 text-[10px] text-valence-subtle">
                ({d._daysToClose >= 0 ? `${d._daysToClose}d` : `${Math.abs(d._daysToClose)}d late`})
              </span>
            )}
          </span>
        ) : '—'}
      </td>
      <td className="px-3 py-3 text-[11px] text-valence-muted">{formatDistanceToNowStrict(d._stageSince, { addSuffix: true })}</td>
      <td className="px-5 py-3 text-right">
        <Link to={`/deals?open=${d.id}`} className="inline-flex items-center gap-1 text-[11px] font-semibold text-valence-blue hover:text-valence-blue-hover">
          Open <ArrowUpRight className="h-3 w-3" />
        </Link>
      </td>
    </tr>
  )
}

function normalizeSide(side) {
  if (!side) return null
  if (/^buy/i.test(side)) return 'Buy'
  if (/^sell/i.test(side)) return 'Sell'
  return side
}

function TableSkeleton() {
  return (
    <div className="vl-card p-5 space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="grid grid-cols-7 gap-3">
          {Array.from({ length: 7 }).map((__, j) => (
            <div key={j} className="h-3 rounded bg-valence-surface animate-pulse" />
          ))}
        </div>
      ))}
    </div>
  )
}

// Minimal demo set — used when Supabase isn't configured. The Mandates page is a
// secondary view of the same deal pipeline, so the demo set mirrors what the
// Deal Logger demo array contains in active stages.
const today = new Date()
const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return d.toISOString() }
const daysFwd = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return d.toISOString().slice(0,10) }
const DEMO_MANDATES = [
  { id: 'm1', client_name: 'Nimbus Health',     stage: 'Diligence',   sector: 'Healthcare',     side: 'Sell-side', lead_owner: 'Neha Jain',       expected_close_date: daysFwd(75),  updated_at: daysAgo(28), created_at: daysAgo(210) },
  { id: 'm2', client_name: 'Quantum Edge',      stage: 'Marketing',   sector: 'Fintech',        side: 'Sell-side', lead_owner: 'James Whitfield', expected_close_date: daysFwd(150), updated_at: daysAgo(7),  created_at: daysAgo(95)  },
  { id: 'm3', client_name: 'Meridian EdTech',   stage: 'Negotiation', sector: 'EdTech',         side: 'Sell-side', lead_owner: 'Priya Mehta',     expected_close_date: daysFwd(45),  updated_at: daysAgo(12), created_at: daysAgo(160) },
  { id: 'm4', client_name: 'Orion Realty',      stage: 'Closing',     sector: 'Real Estate',    side: 'Sell-side', lead_owner: 'Neha Jain',       expected_close_date: daysFwd(25),  updated_at: daysAgo(3),  created_at: daysAgo(275) },
  { id: 'm5', client_name: 'Aegis Logistics',   stage: 'Preparation', sector: 'Logistics',      side: 'Sell-side', lead_owner: 'Oliver Hayes',    expected_close_date: daysFwd(180), updated_at: daysAgo(40), created_at: daysAgo(60) },
  { id: 'm6', client_name: 'Solstice Solar',    stage: 'Mandate',     sector: 'Renewables',     side: 'Sell-side', lead_owner: 'Neha Jain',       expected_close_date: daysFwd(170), updated_at: daysAgo(5),  created_at: daysAgo(42) },
  { id: 'm7', client_name: 'Pelican Foods',     stage: 'Diligence',   sector: 'Consumer',       side: 'Sell-side', lead_owner: 'Priya Mehta',     expected_close_date: daysFwd(90),  updated_at: daysAgo(18), created_at: daysAgo(120) },
  { id: 'm8', client_name: 'Tidewater Logistics', stage: 'Marketing', sector: 'Logistics',      side: 'Sell-side', lead_owner: 'Oliver Hayes',    expected_close_date: daysFwd(120), updated_at: daysAgo(10), created_at: daysAgo(72) },
  { id: 'm9', client_name: 'Halcyon Pharma',    stage: 'Diligence',   sector: 'Healthcare',     side: 'Buy-side',  lead_owner: 'Neha Jain',       expected_close_date: daysFwd(65),  updated_at: daysAgo(45), created_at: daysAgo(110) }
]
