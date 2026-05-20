import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { ArrowRight } from 'lucide-react'

// Stage-history table for the Timeline page. One row per live mandate,
// columns for each stage in the canonical 7-stage funnel. Each cell shows
// the date the deal *entered* that stage (derived from activities.kind =
// 'stage_change' rows, falling back to deal.created_at for the initial
// stage). The current stage cell is highlighted; never-entered cells are
// shown as a quiet em-dash so the path through the funnel reads at a glance.

// Stages in the order the partner wants to read them. Terminal stages
// (Closed / On Hold / Lost) share a single rightmost "Outcome" column so
// the main funnel reads as a clean 5-column path.
const FUNNEL_STAGES = ['Origination', 'Pitching', 'Pre-Mandate', 'Mandate']
const TERMINAL_STAGES = new Set(['Closed', 'On Hold', 'Lost'])

// Parse the destination stage out of a stage_change activity body. The
// canonical format is "<from> → <to>" (em-arrow). Fall back to scanning
// for any known stage name in the body for older entries.
const DEST_RE = /→\s*([\w\s-]+?)$/
function stageFromActivity(body) {
  if (!body) return null
  const m = String(body).match(DEST_RE)
  if (m) return m[1].trim()
  return null
}

function buildStageMap(deal, activitiesByDeal) {
  const out = {}
  const acts = (activitiesByDeal.get(deal.id) || []).filter(a => a.kind === 'stage_change')
  // Initial stage timestamp = deal.created_at (seeded as Origination).
  if (deal.created_at) out['Origination'] = new Date(deal.created_at)
  for (const a of acts) {
    const dest = stageFromActivity(a.body)
    if (!dest) continue
    // Earliest timestamp wins (first time the deal entered the stage).
    if (!out[dest] || new Date(a.created_at) < out[dest]) {
      out[dest] = new Date(a.created_at)
    }
  }
  // If the deal is currently in a stage we never saw a stage_change for,
  // fall back to deal.updated_at so the cell isn't blank — better to show
  // "we landed here on…" than to leave the partner squinting.
  if (deal.stage && !out[deal.stage] && deal.updated_at) {
    out[deal.stage] = new Date(deal.updated_at)
  }
  return out
}

export default function TimelineTable({ deals, activities, onOpenDeal }) {
  const activitiesByDeal = useMemo(() => {
    const map = new Map()
    for (const a of activities) {
      if (!map.has(a.deal_id)) map.set(a.deal_id, [])
      map.get(a.deal_id).push(a)
    }
    return map
  }, [activities])

  const rows = useMemo(() => deals.map(d => ({
    deal: d,
    stageMap: buildStageMap(d, activitiesByDeal)
  })), [deals, activitiesByDeal])

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-valence-border bg-valence-surface px-5 py-10 text-center text-sm text-valence-muted">
        No mandates to chart yet. Log a deal to see its journey.
      </div>
    )
  }

  return (
    <div className="vl-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-valence-surface/60">
          <tr className="border-b border-valence-border">
            <th className="sticky left-0 z-10 bg-valence-surface/60 px-4 py-3 text-left vl-eyebrow-ink">Mandate</th>
            {FUNNEL_STAGES.map(s => (
              <th key={s} className="px-4 py-3 text-left vl-eyebrow-ink whitespace-nowrap">{s}</th>
            ))}
            <th className="px-4 py-3 text-left vl-eyebrow-ink whitespace-nowrap">Outcome</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ deal, stageMap }) => {
            const terminal = TERMINAL_STAGES.has(deal.stage) ? deal.stage : null
            const terminalAt = terminal ? stageMap[terminal] : null
            return (
              <tr
                key={deal.id}
                onClick={() => onOpenDeal?.(deal)}
                className="border-b border-valence-border/60 hover:bg-valence-blue-soft/30 transition cursor-pointer"
              >
                <td className="sticky left-0 z-10 bg-valence-elevated px-4 py-3 align-top">
                  <p className="font-semibold text-valence-text">{deal.client_name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-valence-muted">
                    {deal.sector && <span className="rounded bg-valence-surface px-1.5 py-0">{deal.sector}</span>}
                    {deal.lead_owner && <span className="text-valence-subtle">{deal.lead_owner}</span>}
                  </div>
                </td>
                {FUNNEL_STAGES.map(stage => {
                  const at = stageMap[stage]
                  const isCurrent = deal.stage === stage
                  return (
                    <td key={stage} className="px-4 py-3 align-top whitespace-nowrap">
                      {at ? (
                        <div className={`inline-flex flex-col gap-0.5 ${isCurrent ? 'text-valence-blue font-semibold' : 'text-valence-text'}`}>
                          <span className="text-sm tabular-nums">{format(at, 'd MMM yyyy')}</span>
                          {isCurrent && <span className="text-[9px] uppercase tracking-[0.14em] text-valence-blue">Current</span>}
                        </div>
                      ) : (
                        <span className="text-valence-subtle">—</span>
                      )}
                    </td>
                  )
                })}
                <td className="px-4 py-3 align-top whitespace-nowrap">
                  {terminal ? (
                    <div className="inline-flex flex-col gap-0.5">
                      <span className={`text-sm font-semibold ${
                        terminal === 'Closed' ? 'text-valence-success' :
                        terminal === 'Lost'   ? 'text-valence-danger'  :
                                                 'text-valence-warning'
                      }`}>{terminal}</span>
                      {terminalAt && <span className="text-[10px] text-valence-muted tabular-nums">{format(terminalAt, 'd MMM yyyy')}</span>}
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] text-valence-muted">
                      <ArrowRight className="h-3 w-3" /> In flight
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
