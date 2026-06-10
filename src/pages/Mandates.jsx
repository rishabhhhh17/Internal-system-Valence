import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { parseISO, differenceInCalendarDays } from 'date-fns'
import { Briefcase, Users } from 'lucide-react'
import { supabase, isSupabaseConfigured, subscribeTable } from '../lib/supabase.js'
import { liveStagesForMode } from '../lib/stages.js'
import { usePipelineMode } from '../hooks/usePipelineMode.js'
import ConfigBanner from '../components/ConfigBanner.jsx'
import EmptyState from '../components/EmptyState.jsx'
import DocumentTracker from '../components/DocumentTracker.jsx'
import { useToast } from '../components/Toast.jsx'
import { humanError } from '../lib/userError.js'

// The Active Deals route is now the Document tracker: it lists the active deals
// (the actively-worked middle of the funnel — Analyst/Partner/Memo for
// companies, Meeting/Fund DD/Soft-circled for LPs) and, per deal, which
// documents are in and which are still outstanding.

export default function Mandates() {
  const toast = useToast()
  const [pipelineMode] = usePipelineMode()
  const isLp = pipelineMode === 'lp'
  const LIVE_STAGES = liveStagesForMode(pipelineMode)
  const [deals, setDeals]           = useState([])
  const [activities, setActivities] = useState([])
  const [loading, setLoading]       = useState(true)
  const [loadError, setLoadError]   = useState(null)

  // Re-load on mount and whenever the pipeline mode flips (company ↔ lp).
  useEffect(() => { load() }, [pipelineMode])

  // Live sync — teammate's stage change / new doc status appears here without a
  // reload. Refresh SILENTLY (no skeleton) so a realtime echo of our own click
  // doesn't flash the whole table. subscribeTable fires on every deals write,
  // including the dd_docs update we just made.
  useEffect(() => {
    if (!isSupabaseConfigured) return
    const off = subscribeTable('deals', () => load({ silent: true }))
    return () => off()
  }, [])

  // Optimistic in-place patch + Supabase update. If the request fails, the
  // toast surfaces the error and the next load() will reconcile.
  async function updateField(dealId, field, value) {
    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, [field]: value } : d))
    if (!isSupabaseConfigured) return
    const { error } = await supabase.from('deals').update({ [field]: value }).eq('id', dealId)
    if (error) toast.error(humanError(error, 'Could not update deal'))
    // re-pull the row in the background so derived fields (days-in-stage etc.) stay current
    if (field === 'stage') load()
  }

  // Toggle a single document's status in the deal's dd_docs jsonb. Marking a
  // doc Received stamps today's date (keeps any earlier date if re-received);
  // anything else clears the date.
  function cycleDoc(dealId, docKey, nextStatus) {
    const deal = deals.find(d => d.id === dealId)
    if (!deal) return
    const docs = { ...(deal.dd_docs || {}) }
    const prev = docs[docKey] || {}
    const todayIso = new Date().toISOString().slice(0, 10)
    docs[docKey] = {
      status: nextStatus,
      date: nextStatus === 'received' ? (prev.date || todayIso) : null
    }
    updateField(dealId, 'dd_docs', docs)
  }

  // `silent` skips the skeleton flash — used for realtime refreshes (e.g. the
  // echo of a doc-status click) so the table updates in place instead of
  // blinking to a loader and back on every change.
  async function load({ silent = false } = {}) {
    if (!silent) { setLoading(true); setLoadError(null) }
    if (!isSupabaseConfigured) {
      setDeals(DEMO_MANDATES); setActivities([]); setLoading(false); return
    }
    try {
      const fetchPromise = Promise.all([
        supabase.from('deals').select('*').eq('kind', pipelineMode).in('stage', LIVE_STAGES).order('updated_at', { ascending: false }),
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
      // On a silent background refresh, keep what's on screen rather than
      // wiping the table for a transient blip — only surface errors on a
      // foreground load.
      if (!silent) { setLoadError(err?.message || 'Couldn\'t load deals.'); setDeals([]); setActivities([]) }
    } finally {
      if (!silent) setLoading(false)
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

  const totalLive = enriched.length

  return (
    <div className="space-y-6">
      <ConfigBanner />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="vl-eyebrow-ink">Document tracker</p>
          <h1 className="mt-2 font-display text-feature font-bold text-valence-text">
            {isLp ? 'LP collateral — what’s shared, what’s pending.' : 'Diligence docs — what’s in, what’s outstanding.'}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-valence-border bg-valence-elevated px-2.5 py-1 text-[11px] text-valence-muted">
            <Users className="h-3 w-3" /> {totalLive} active deal{totalLive === 1 ? '' : 's'}
          </span>
          <Link to="/deals" className="vl-btn-secondary"><Briefcase className="h-4 w-4" /> Open Pipeline</Link>
        </div>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : loadError ? (
        <EmptyState icon={Briefcase} title="Couldn't load deals" description={loadError} action={<button onClick={load} className="vl-btn-primary">Retry</button>} />
      ) : enriched.length === 0 ? (
        <EmptyState icon={Briefcase} title="No active deals to track" description={isLp ? 'LPs appear here once they reach a pitch meeting or beyond.' : 'Companies appear here once a deal is in an active stage.'} action={<Link to="/deals" className="vl-btn-primary">Open Pipeline</Link>} />
      ) : (
        <DocumentTracker deals={enriched} mode={pipelineMode} onCycle={cycleDoc} />
      )}
    </div>
  )
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

// Minimal demo set — used when Supabase isn't configured. The Active Deals page
// is a secondary view of the same deal pipeline, so the demo set mirrors what
// the Pipeline demo array contains in active stages.
const today = new Date()
const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return d.toISOString() }
const daysFwd = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return d.toISOString().slice(0,10) }
const DEMO_MANDATES = [
  { id: 'm1', client_name: 'Nimbus Health',       stage: 'Memo',         sector: 'Healthcare',  side: 'Sell-side', lead_owner: 'Neha Jain',       expected_close_date: daysFwd(75),  updated_at: daysAgo(28), created_at: daysAgo(210) },
  { id: 'm2', client_name: 'Quantum Edge',        stage: 'Memo',         sector: 'Fintech',     side: 'Sell-side', lead_owner: 'James Whitfield', expected_close_date: daysFwd(150), updated_at: daysAgo(7),  created_at: daysAgo(95)  },
  { id: 'm3', client_name: 'Meridian EdTech',     stage: 'Memo',         sector: 'EdTech',      side: 'Sell-side', lead_owner: 'Priya Mehta',     expected_close_date: daysFwd(45),  updated_at: daysAgo(12), created_at: daysAgo(160) },
  { id: 'm4', client_name: 'Orion Realty',        stage: 'Memo',         sector: 'Real Estate', side: 'Sell-side', lead_owner: 'Neha Jain',       expected_close_date: daysFwd(25),  updated_at: daysAgo(3),  created_at: daysAgo(275) },
  { id: 'm5', client_name: 'Aegis Logistics',     stage: 'Analyst Call', sector: 'Logistics',   side: 'Sell-side', lead_owner: 'Oliver Hayes',    expected_close_date: daysFwd(180), updated_at: daysAgo(40), created_at: daysAgo(60)  },
  { id: 'm6', client_name: 'Solstice Solar',      stage: 'Partner Call', sector: 'Renewables',  side: 'Sell-side', lead_owner: 'Neha Jain',       expected_close_date: daysFwd(170), updated_at: daysAgo(5),  created_at: daysAgo(42)  },
  { id: 'm7', client_name: 'Pelican Foods',       stage: 'Memo',         sector: 'Consumer',    side: 'Sell-side', lead_owner: 'Priya Mehta',     expected_close_date: daysFwd(90),  updated_at: daysAgo(18), created_at: daysAgo(120) },
  { id: 'm8', client_name: 'Tidewater Logistics', stage: 'Partner Call', sector: 'Logistics',   side: 'Sell-side', lead_owner: 'Oliver Hayes',    expected_close_date: daysFwd(120), updated_at: daysAgo(10), created_at: daysAgo(72)  },
  { id: 'm9', client_name: 'Halcyon Pharma',      stage: 'Memo',         sector: 'Healthcare',  side: 'Buy-side',  lead_owner: 'Neha Jain',       expected_close_date: daysFwd(65),  updated_at: daysAgo(45), created_at: daysAgo(110) }
]
