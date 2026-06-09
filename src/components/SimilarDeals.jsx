import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Briefcase, ArrowUpRight } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { similarDealsHeuristic } from '../lib/insights.js'
import { stageToneClasses, stageMeta } from '../lib/stages.js'
import { dealTypeLabel } from '../lib/dealLabels.js'

export default function SimilarDeals({ deal }) {
  const navigate = useNavigate()
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!deal?.id) return
    if (!isSupabaseConfigured) { setCandidates([]); setLoading(false); return }
    // Guard against unmount during the round-trip — drawer can be closed
    // mid-flight by the user clicking elsewhere, which would otherwise log
    // a React "state update on unmounted component" warning.
    let alive = true
    supabase.from('deals').select('*').then(({ data }) => {
      if (!alive) return
      setCandidates(data || [])
      setLoading(false)
    })
    return () => { alive = false }
  }, [deal?.id])

  const similar = useMemo(() => similarDealsHeuristic(deal, candidates), [deal, candidates])

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-valence-border bg-gradient-to-br from-valence-blue/5 via-valence-elevated/[0.02] to-transparent p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-valence-blue-soft ring-1 ring-valence-blue/30 shrink-0">
            <Sparkles className="h-4 w-4 text-valence-blue" />
          </div>
          <div>
            <p className="text-sm font-semibold text-valence-text">Pattern-matched past deals</p>
            <p className="mt-0.5 text-[11px] text-valence-muted">
              Ranked by sector, type, side, lead and ticket size. Click to jump to any one for context.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-valence-surface animate-pulse" />)}
        </div>
      ) : similar.length === 0 ? (
        <p className="text-sm text-valence-muted rounded-lg border border-valence-border bg-valence-surface px-4 py-5 text-center">
          No meaningful matches yet. As the pipeline grows, Valence will surface analogues here.
        </p>
      ) : (
        <ul className="space-y-2">
          {similar.map(d => {
            const meta = stageMeta(d.stage)
            return (
              <li
                key={d.id}
                onClick={() => navigate(`/deals?open=${d.id}`)}
                className="group cursor-pointer flex items-center gap-3 rounded-lg border border-valence-border bg-valence-surface px-4 py-3 transition hover:border-valence-border-strong hover:bg-valence-surface"
              >
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-valence-blue-soft ring-1 ring-valence-blue/20 shrink-0">
                  <Briefcase className="h-4 w-4 text-valence-blue" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-semibold text-valence-text">{d.client_name}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-valence-muted">
                    <span className={`inline-flex rounded-full border px-1.5 py-0 text-[10px] font-semibold ${stageToneClasses(d.stage)}`}>{d.stage}</span>
                    {dealTypeLabel(d) && <span>{dealTypeLabel(d)}</span>}
                    {d.sector && <span>· {d.sector}</span>}
                    {d.ticket_size_usd_m && <span>· ${Number(d.ticket_size_usd_m).toLocaleString()}M</span>}
                    {meta.terminal && d.stage === 'Diligence' && <span className="text-valence-success">Diligence</span>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-[10px] font-semibold text-valence-blue">{d._similarity.toFixed(1)}× match</span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-valence-subtle opacity-0 group-hover:opacity-100 transition" />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
