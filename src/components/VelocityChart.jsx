import { useEffect, useMemo, useState } from 'react'
import { TrendingUp, Clock, AlertTriangle } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { stageVelocity } from '../lib/insights.js'
import { stageToneClasses } from '../lib/stages.js'

export default function VelocityChart() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    if (!isSupabaseConfigured) { setRows(stageVelocity([])); setLoading(false); return }
    const { data } = await supabase.from('activities').select('deal_id, kind, body, created_at')
    setRows(stageVelocity(data || []))
    setLoading(false)
  }

  const maxAvg = useMemo(() => Math.max(1, ...rows.map(r => r.avgDays || 0)), [rows])
  const bottleneck = useMemo(() => rows.filter(r => r.avgDays != null).sort((a, b) => b.avgDays - a.avgDays)[0], [rows])

  return (
    <div className="vl-card p-6">
      <div className="flex items-center justify-between mb-1">
        <div>
          <h2 className="vl-section-title flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-valence-blue" /> Pipeline velocity
          </h2>
          <p className="text-xs text-valence-muted mt-0.5">Average days each active mandate spends in a stage</p>
        </div>
        {bottleneck?.avgDays != null && (
          <div className="rounded-lg border border-valence-warning/30 bg-valence-warning/10 px-3 py-1.5 text-[11px] text-valence-warning">
            <AlertTriangle className="inline h-3 w-3 mr-1 -mt-0.5" />
            Bottleneck: <b className="text-white">{bottleneck.stage}</b> · {Math.round(bottleneck.avgDays)}d avg
          </div>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {loading ? Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-7 rounded bg-white/[0.04] animate-pulse" />
        )) : rows.map(r => (
          <div key={r.stage} className="flex items-center gap-3">
            <span className={`inline-flex w-28 justify-center rounded-full border px-2 py-1 text-[10px] font-semibold shrink-0 ${stageToneClasses(r.stage)}`}>
              {r.stage}
            </span>
            <div className="relative flex-1 h-6 rounded-md bg-white/[0.03] overflow-hidden">
              <div
                className="h-full rounded-md bg-gradient-to-r from-valence-blue/30 to-valence-blue/80 transition-all"
                style={{ width: r.avgDays ? `${(r.avgDays / maxAvg) * 100}%` : '2%' }}
              />
              <span className="absolute inset-0 flex items-center justify-end pr-2 text-[11px] font-semibold tabular-nums text-white">
                {r.avgDays != null ? `${Math.round(r.avgDays)}d` : '—'}
              </span>
            </div>
            <span className="text-[10px] text-valence-subtle w-10 text-right tabular-nums">
              n={r.sampleSize}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[10px] text-valence-subtle flex items-center gap-1.5">
        <Clock className="h-3 w-3" /> Computed from stage_change activity. Sample size (n) grows as the team logs stage progressions.
      </p>
    </div>
  )
}
