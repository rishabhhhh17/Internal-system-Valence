import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Briefcase, ArrowUpRight } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { staleDeals } from '../lib/insights.js'
import { stageToneClasses } from '../lib/stages.js'

export default function StaleDealsCard({ deals }) {
  const [activityMap, setActivityMap] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    if (!isSupabaseConfigured) { setLoading(false); return }
    const { data } = await supabase
      .from('activities')
      .select('deal_id, created_at')
      .order('created_at', { ascending: false })
    const map = {}
    for (const a of (data || [])) {
      if (!a.deal_id) continue
      if (!map[a.deal_id]) map[a.deal_id] = a.created_at
    }
    setActivityMap(map)
    setLoading(false)
  }

  const stale = useMemo(() => staleDeals(deals || [], activityMap, 7).slice(0, 5), [deals, activityMap])

  return (
    <div className="vl-card p-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="vl-section-title flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-valence-warning" /> Needs attention
          </h2>
          <p className="text-xs text-valence-muted mt-0.5">Active deals with no activity in over a week</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 rounded-lg bg-valence-surface animate-pulse" />)}
        </div>
      ) : stale.length === 0 ? (
        <p className="text-sm text-valence-muted py-2">Every active deal has been touched in the last week. Nice.</p>
      ) : (
        <ul className="space-y-2">
          {stale.map(d => (
            <li key={d.id}>
              <Link to={`/deals?open=${d.id}`} className="group flex items-center gap-3 rounded-lg border border-valence-border bg-valence-surface px-4 py-3 transition hover:border-valence-border-strong hover:bg-valence-surface">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-valence-warning/10 ring-1 ring-valence-warning/30 shrink-0">
                  <Briefcase className="h-4 w-4 text-valence-warning" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-semibold text-valence-text">{d.client_name}</p>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-valence-muted">
                    <span className={`inline-flex rounded-full border px-1.5 py-0 text-[10px] font-semibold ${stageToneClasses(d.stage)}`}>
                      {d.stage}
                    </span>
                    <span className="text-valence-warning font-semibold">
                      {d._staleDays} day{d._staleDays === 1 ? '' : 's'} idle
                    </span>
                    {d.lead_owner && <span>· {d.lead_owner}</span>}
                  </div>
                </div>
                <ArrowUpRight className="h-3.5 w-3.5 text-valence-subtle opacity-0 group-hover:opacity-100 transition" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
