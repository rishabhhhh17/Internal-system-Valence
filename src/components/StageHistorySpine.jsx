import { useEffect, useMemo, useState } from 'react'
import { format, differenceInDays } from 'date-fns'
import { ChevronRight, Clock } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { STAGES } from '../lib/stages.js'

// Visible on the deal Overview directly under the progress bar. Answers the
// partner's question at a glance: "When did we start with them, when did we
// pre-mandate, when did we mandate, where are we now?"
//
// Reads activities.kind = 'stage_change' (body format "<from> → <to>") to
// learn the date the deal *entered* each stage. Fallbacks:
//   - First stage stamp = deal.created_at
//   - Current stage with no recorded transition = deal.updated_at
//
// Renders only stages the deal actually touched, in chronological order.
// Never-entered stages stay invisible — no em-dashes, no clutter.

const DEST_RE = /→\s*([\w\s-]+?)\s*$/

const STAGE_TONE = {
  Origination:  'border-valence-border bg-valence-elevated text-valence-text',
  Pitching:     'border-valence-border bg-valence-elevated text-valence-text',
  'Pre-Mandate':'border-valence-blue/30 bg-valence-blue-soft text-valence-text',
  Mandate:      'border-valence-blue/40 bg-valence-blue-soft text-valence-text',
  Closed:       'border-valence-success/40 bg-valence-success/10 text-valence-success',
  Lost:         'border-valence-danger/40 bg-valence-danger/10 text-valence-danger',
  'On Hold':    'border-valence-warning/40 bg-valence-warning/10 text-valence-warning'
}

const CURRENT_RING = 'ring-2 ring-valence-blue/40 shadow-sm'

function stageFromBody(body) {
  if (!body) return null
  const m = String(body).match(DEST_RE)
  return m ? m[1].trim() : null
}

function buildHistory(deal, stageChanges) {
  // Map<stage, Date> for first-entry timestamps.
  const entryAt = new Map()

  // Origination always seeded from deal.created_at.
  if (deal.created_at) entryAt.set('Origination', new Date(deal.created_at))

  for (const a of stageChanges) {
    const dest = stageFromBody(a.body)
    if (!dest) continue
    const at = new Date(a.created_at)
    if (!entryAt.has(dest) || at < entryAt.get(dest)) entryAt.set(dest, at)
  }

  // Current stage with no recorded transition (older deal, demo mode):
  // fall back to deal.updated_at so the partner sees a date.
  if (deal.stage && !entryAt.has(deal.stage)) {
    entryAt.set(deal.stage, deal.updated_at ? new Date(deal.updated_at) : new Date(deal.created_at))
  }

  // Order by canonical pipeline order so the spine reads left-to-right.
  const canonical = STAGES.map(s => s.id)
  const ordered = Array.from(entryAt.entries())
    .sort((a, b) => canonical.indexOf(a[0]) - canonical.indexOf(b[0]))

  // Annotate each node with days spent in that stage (next entry - this entry,
  // or now - this for the current/last).
  const now = new Date()
  return ordered.map(([stage, at], i) => {
    const nextAt = ordered[i + 1]?.[1]
    const endAt = nextAt || now
    const days = Math.max(0, differenceInDays(endAt, at))
    const isCurrent = stage === deal.stage
    return { stage, at, days, isCurrent, isLast: i === ordered.length - 1 }
  })
}

export default function StageHistorySpine({ deal }) {
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!deal?.id) return
      if (!isSupabaseConfigured) { setActivities([]); setLoading(false); return }
      setLoading(true)
      const { data } = await supabase
        .from('activities')
        .select('id, kind, body, created_at')
        .eq('deal_id', deal.id)
        .eq('kind', 'stage_change')
        .order('created_at', { ascending: true })
      if (!cancelled) {
        setActivities(data || [])
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [deal?.id])

  const nodes = useMemo(() => buildHistory(deal, activities), [deal, activities])

  if (loading || nodes.length === 0) return null

  return (
    <div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-semibold uppercase tracking-wider text-valence-muted">Stage history</span>
        <span className="inline-flex items-center gap-1 text-valence-subtle">
          <Clock className="h-3 w-3" /> Days in each stage
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-stretch gap-1.5">
        {nodes.map((n, i) => (
          <div key={n.stage} className="inline-flex items-stretch gap-1.5">
            <div
              className={`min-w-[7rem] rounded-lg border px-3 py-2 text-left transition ${
                STAGE_TONE[n.stage] || 'border-valence-border bg-valence-elevated text-valence-text'
              } ${n.isCurrent ? CURRENT_RING : ''}`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-valence-muted">{n.stage}</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums">{format(n.at, 'd MMM yyyy')}</p>
              <p className="mt-0.5 text-[10px] text-valence-muted">
                {n.isCurrent ? `${n.days}d so far · current` : `${n.days}d`}
              </p>
            </div>
            {i < nodes.length - 1 && (
              <div className="flex items-center text-valence-subtle">
                <ChevronRight className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
