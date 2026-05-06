import { useMemo, useRef, useEffect } from 'react'
import { format, parseISO, differenceInCalendarDays, addDays, startOfMonth, addMonths } from 'date-fns'
import { stageToneClasses } from '../lib/stages.js'

// Default per-stage durations, in days. Used to project future stages forward
// from the current stage's start when no expected_close_date pulls them.
export const STAGE_DEFAULT_DAYS = {
  Mandate:     7,
  Preparation: 21,
  Marketing:   28,
  Diligence:   35,
  Negotiation: 21,
  Closing:     14
}

// The full ordered list of stages a live mandate progresses through. Used to
// derive past / current / future segments deterministically.
const LIVE_STAGES = ['Mandate', 'Preparation', 'Marketing', 'Diligence', 'Negotiation', 'Closing']

const ZOOMS = {
  weeks:    { px: 12,  monthLabel: false, weekLabel: true,  monthsRange: { back: 6, fwd: 9 } },
  months:   { px: 4,   monthLabel: true,  weekLabel: false, monthsRange: { back: 6, fwd: 9 } },
  quarters: { px: 1.5, monthLabel: true,  weekLabel: false, monthsRange: { back: 6, fwd: 9 } }
}

// Build the past/current/future segments for a single deal. activitiesByDeal is
// a Map<dealId, [stage_change activities sorted ascending by created_at]>.
function buildSegments(deal, activitiesByDeal, today) {
  const stageOrder = LIVE_STAGES
  const acts = activitiesByDeal.get(deal.id) || []
  const stageStartByStage = new Map()

  // Initial stage starts at deal.created_at (or today if missing).
  let cursor = deal.created_at ? new Date(deal.created_at) : new Date(today)
  let lastStage = LIVE_STAGES[0]
  stageStartByStage.set(lastStage, cursor)

  for (const a of acts) {
    const t = new Date(a.created_at)
    if (a.body) {
      // Activity body is "Origination → Pitch" style. Pull the destination.
      const m = String(a.body).match(/→\s*([\w\s]+)/)
      const dest = m ? m[1].trim() : null
      if (dest && stageOrder.includes(dest)) {
        if (!stageStartByStage.has(dest)) stageStartByStage.set(dest, t)
        lastStage = dest
      }
    }
  }

  // Make sure the deal's current stage has a start, even if the activity log is thin.
  if (!stageStartByStage.has(deal.stage)) {
    stageStartByStage.set(deal.stage, new Date(deal.updated_at || deal.created_at || today))
  }

  // Build past + current segments.
  const segments = []
  const currentStageIdx = stageOrder.indexOf(deal.stage)
  if (currentStageIdx === -1) return segments

  for (let i = 0; i <= currentStageIdx; i++) {
    const s = stageOrder[i]
    const start = stageStartByStage.get(s) || new Date(today)
    const end = i < currentStageIdx
      ? (stageStartByStage.get(stageOrder[i + 1]) || new Date(today))
      : new Date(today)
    segments.push({ stage: s, start, end, kind: i === currentStageIdx ? 'current' : 'past' })
  }

  // Build future segments — projected forward from "today" toward expected_close_date.
  const closeIso = deal.expected_close_date || deal.target_close
  const closeDate = closeIso ? parseISO(String(closeIso).slice(0, 10)) : null

  let futureCursor = new Date(today)
  for (let i = currentStageIdx + 1; i < stageOrder.length; i++) {
    const s = stageOrder[i]
    const remainingStages = stageOrder.slice(i)
    const totalRemainingDefaultDays = remainingStages.reduce((acc, st) => acc + (STAGE_DEFAULT_DAYS[st] || 14), 0)
    const totalRemainingActualDays = closeDate ? Math.max(7, differenceInCalendarDays(closeDate, futureCursor)) : null
    const scale = totalRemainingActualDays && totalRemainingActualDays > 0 ? totalRemainingActualDays / totalRemainingDefaultDays : 1
    const stageDays = Math.max(2, Math.round((STAGE_DEFAULT_DAYS[s] || 14) * scale))
    const end = addDays(futureCursor, stageDays)
    segments.push({ stage: s, start: new Date(futureCursor), end, kind: 'future' })
    futureCursor = end
  }

  return segments
}

export default function TimelineGantt({ deals, activities, zoom = 'months', onOpenDeal }) {
  const cfg = ZOOMS[zoom] || ZOOMS.months
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d }, [])
  const range = useMemo(() => ({
    start: addDays(today, -cfg.monthsRange.back * 30),
    end:   addDays(today,  cfg.monthsRange.fwd * 30)
  }), [today, cfg])
  const totalDays = differenceInCalendarDays(range.end, range.start)
  const totalPx = Math.round(totalDays * cfg.px)

  const activitiesByDeal = useMemo(() => {
    const map = new Map()
    const sorted = [...activities].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    for (const a of sorted) {
      if (!map.has(a.deal_id)) map.set(a.deal_id, [])
      map.get(a.deal_id).push(a)
    }
    return map
  }, [activities])

  const rows = useMemo(() => deals.map(d => ({
    deal: d,
    segments: buildSegments(d, activitiesByDeal, today)
  })), [deals, activitiesByDeal, today])

  // Month grid lines + labels.
  const monthMarks = useMemo(() => {
    const marks = []
    let cursor = startOfMonth(range.start)
    while (cursor < range.end) {
      const offsetDays = Math.max(0, differenceInCalendarDays(cursor, range.start))
      marks.push({ date: cursor, x: offsetDays * cfg.px })
      cursor = addMonths(cursor, 1)
    }
    return marks
  }, [range, cfg])

  const todayX = differenceInCalendarDays(today, range.start) * cfg.px

  // On mount, scroll the today line roughly into view (1/3 from the left).
  const scrollerRef = useRef(null)
  useEffect(() => {
    if (!scrollerRef.current) return
    scrollerRef.current.scrollLeft = Math.max(0, todayX - scrollerRef.current.clientWidth / 3)
  }, [todayX, zoom])

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-valence-border bg-valence-surface px-5 py-10 text-center text-sm text-valence-muted">
        No live mandates to chart yet.
      </div>
    )
  }

  return (
    <div className="vl-card overflow-hidden">
      <div className="grid grid-cols-[260px_1fr]">
        {/* Sticky left column */}
        <div className="border-r border-valence-border bg-white">
          <div className="h-12 border-b border-valence-border px-4 flex items-end pb-2">
            <span className="vl-eyebrow-ink">Mandate</span>
          </div>
          {rows.map(({ deal }) => (
            <div key={deal.id} className="h-14 border-b border-valence-border/60 px-4 py-2">
              <button onClick={() => onOpenDeal?.(deal)} className="w-full text-left">
                <p className="truncate text-sm font-semibold text-valence-text">{deal.client_name}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-valence-muted">
                  {deal.sector && <span className="rounded bg-valence-surface border border-valence-border px-1.5 py-0">{deal.sector}</span>}
                  {deal.side && <span className="rounded bg-valence-surface border border-valence-border px-1.5 py-0">{normalizeSide(deal.side)}</span>}
                  {deal.lead_owner && <span className="text-valence-subtle truncate">{deal.lead_owner}</span>}
                </div>
              </button>
            </div>
          ))}
        </div>

        {/* Scrollable timeline area */}
        <div ref={scrollerRef} className="overflow-x-auto bg-valence-surface/40">
          <div className="relative" style={{ width: totalPx }}>
            {/* Month axis */}
            <div className="sticky top-0 z-10 h-12 border-b border-valence-border bg-white/95 backdrop-blur">
              {monthMarks.map(m => (
                <div key={m.date.toISOString()} className="absolute top-0 h-full" style={{ left: m.x }}>
                  <div className="h-full border-l border-valence-border/60" />
                  <span className="absolute top-2 left-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-valence-muted whitespace-nowrap">
                    {format(m.date, cfg.px >= 4 ? 'MMM yyyy' : "MMM ''yy")}
                  </span>
                </div>
              ))}
              <div className="absolute top-0 h-full pointer-events-none" style={{ left: todayX }}>
                <div className="h-full w-px bg-valence-blue" />
                <span className="absolute top-2 left-1.5 inline-flex items-center gap-1 rounded-full bg-valence-blue text-white px-1.5 py-0 text-[10px] font-semibold">Today</span>
              </div>
            </div>

            {/* Rows */}
            {rows.map(({ deal, segments }) => (
              <div key={deal.id} className="relative h-14 border-b border-valence-border/60">
                {/* Faint month grid in row */}
                {monthMarks.map(m => (
                  <div key={m.date.toISOString()} className="absolute top-0 bottom-0 w-px bg-valence-border/40" style={{ left: m.x }} />
                ))}
                {/* Today line in row */}
                <div className="absolute top-0 bottom-0 w-px bg-valence-blue/60 pointer-events-none" style={{ left: todayX }} />
                {segments.map((seg, i) => {
                  const x = Math.max(0, differenceInCalendarDays(seg.start, range.start)) * cfg.px
                  const w = Math.max(2, differenceInCalendarDays(seg.end, seg.start)) * cfg.px
                  return (
                    <button
                      key={i}
                      onClick={() => onOpenDeal?.(deal)}
                      title={`${deal.client_name} · ${seg.stage} · ${format(seg.start, 'd MMM')} → ${format(seg.end, 'd MMM')}`}
                      className={`absolute top-3 h-8 rounded-md border text-[10px] font-semibold tracking-tight transition hover:brightness-105 ${segmentClass(seg)}`}
                      style={{ left: x, width: w }}
                    >
                      {w > 60 && <span className="px-2 truncate">{seg.stage}</span>}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function segmentClass(seg) {
  const tone = stageToneClasses(seg.stage)
  if (seg.kind === 'past') return `${tone} opacity-90`
  if (seg.kind === 'current') return `${tone} ring-1 ring-valence-blue animate-pulse`
  return 'border-dashed border-valence-border bg-white text-valence-muted'
}

function normalizeSide(side) {
  if (!side) return null
  if (/^buy/i.test(side)) return 'Buy'
  if (/^sell/i.test(side)) return 'Sell'
  return side
}
