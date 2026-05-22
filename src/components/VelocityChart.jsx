import { useEffect, useMemo, useState } from 'react'
import { TrendingUp, Clock, AlertTriangle, ArrowDown, ArrowUp } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { stageVelocity } from '../lib/insights.js'
import { stageToneClasses } from '../lib/stages.js'

// Rough boutique-IB benchmarks — based on the ~mid-market sell-side /
// fund-raise mandates Valence runs. Sourced from a partner's gut, not
// hard data — partner can edit when they have firm-specific numbers.
// Stages outside the active book (Closed / On Hold / Lost) intentionally
// omitted — they're terminal, average-days isn't a useful read.
const BENCHMARK_DAYS = {
  'Origination':  14,
  'Pitching':     21,
  'Pre-Mandate':  18,
  'Mandate':      90
}

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
            Bottleneck: <b className="text-valence-text">{bottleneck.stage}</b> · {Math.round(bottleneck.avgDays)}d avg
          </div>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {loading ? Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-7 rounded bg-valence-surface animate-pulse" />
        )) : rows.map(r => {
          const benchmark = BENCHMARK_DAYS[r.stage]
          const delta     = r.avgDays != null && benchmark ? Math.round(r.avgDays) - benchmark : null
          // Faster than benchmark = good (emerald). Slower = caution (amber).
          // ±2d tolerance treated as on-par (neutral).
          const tone =
            delta == null      ? 'text-valence-subtle'
          : delta <= -3        ? 'text-emerald-700'
          : delta >=  3        ? 'text-amber-700'
          :                       'text-valence-muted'
          return (
            <div key={r.stage} className="flex items-center gap-3">
              <span className={`inline-flex w-28 justify-center rounded-full border px-2 py-1 text-[10px] font-semibold shrink-0 ${stageToneClasses(r.stage)}`}>
                {r.stage}
              </span>
              <div className="relative flex-1 h-6 rounded-md bg-valence-surface overflow-hidden">
                <div
                  className="h-full rounded-md bg-gradient-to-r from-valence-blue/30 to-valence-blue/80 transition-all"
                  style={{ width: r.avgDays ? `${(r.avgDays / maxAvg) * 100}%` : '2%' }}
                />
                {/* Benchmark notch — vertical line at the typical-day mark
                    so partners see at a glance if they're tracking on-pace. */}
                {benchmark && (
                  <span
                    aria-hidden
                    className="absolute top-0 bottom-0 w-px bg-valence-ink/40"
                    style={{ left: `${Math.min(100, (benchmark / maxAvg) * 100)}%` }}
                    title={`Benchmark · ${benchmark}d`}
                  />
                )}
                <span className="absolute inset-0 flex items-center justify-end pr-2 text-[11px] font-semibold tabular-nums text-valence-text">
                  {r.avgDays != null ? `${Math.round(r.avgDays)}d` : '—'}
                </span>
              </div>
              {/* Delta vs benchmark — small inline tag */}
              <span className={`inline-flex items-center gap-0.5 w-20 justify-end text-[10px] font-semibold tabular-nums ${tone}`} title={benchmark ? `Typical: ${benchmark}d` : 'No benchmark'}>
                {delta == null
                  ? '—'
                  : delta === 0
                    ? 'on par'
                    : <>{delta < 0 ? <ArrowDown className="h-2.5 w-2.5" /> : <ArrowUp className="h-2.5 w-2.5" />}{Math.abs(delta)}d vs typical</>}
              </span>
              <span className="text-[10px] text-valence-subtle w-10 text-right tabular-nums">
                n={r.sampleSize}
              </span>
            </div>
          )
        })}
      </div>

      <p className="mt-4 text-[10px] text-valence-subtle flex items-center gap-1.5">
        <Clock className="h-3 w-3" /> Computed from stage_change activity. Sample size (n) grows as the team logs stage progressions.
      </p>
    </div>
  )
}
