import { useMemo, useRef, useEffect } from 'react'
import { format, parseISO, differenceInCalendarDays, addDays, startOfMonth, addMonths } from 'date-fns'

// Per-sector palette. Each row gets the colour of the mandate's sector so a
// partner can scan the timeline and tell at a glance what kind of business
// is happening when. Past/current/future is encoded by opacity / ring /
// dashed, NOT by hue.
const SECTOR_PALETTE = {
  Healthcare:     { bg: 'bg-emerald-100', border: 'border-emerald-300', text: 'text-emerald-800', ring: 'ring-emerald-400', ghost: 'border-emerald-300/60', accent: 'bg-emerald-400' },
  Fintech:        { bg: 'bg-violet-100',  border: 'border-violet-300',  text: 'text-violet-800',  ring: 'ring-violet-400',  ghost: 'border-violet-300/60',  accent: 'bg-violet-400'  },
  Consumer:       { bg: 'bg-amber-100',   border: 'border-amber-300',   text: 'text-amber-900',   ring: 'ring-amber-400',   ghost: 'border-amber-300/60',   accent: 'bg-amber-400'   },
  Infrastructure: { bg: 'bg-slate-100',   border: 'border-slate-300',   text: 'text-slate-800',   ring: 'ring-slate-400',   ghost: 'border-slate-300/60',   accent: 'bg-slate-400'   },
  Renewables:     { bg: 'bg-lime-100',    border: 'border-lime-300',    text: 'text-lime-800',    ring: 'ring-lime-400',    ghost: 'border-lime-300/60',    accent: 'bg-lime-400'    },
  Logistics:      { bg: 'bg-orange-100',  border: 'border-orange-300',  text: 'text-orange-900',  ring: 'ring-orange-400',  ghost: 'border-orange-300/60',  accent: 'bg-orange-400'  },
  'Real Estate':  { bg: 'bg-rose-100',    border: 'border-rose-300',    text: 'text-rose-800',    ring: 'ring-rose-400',    ghost: 'border-rose-300/60',    accent: 'bg-rose-400'    },
  EdTech:         { bg: 'bg-cyan-100',    border: 'border-cyan-300',    text: 'text-cyan-800',    ring: 'ring-cyan-400',    ghost: 'border-cyan-300/60',    accent: 'bg-cyan-400'    },
  Mobility:       { bg: 'bg-indigo-100',  border: 'border-indigo-300',  text: 'text-indigo-800',  ring: 'ring-indigo-400',  ghost: 'border-indigo-300/60',  accent: 'bg-indigo-400'  },
  Hospitality:    { bg: 'bg-fuchsia-100', border: 'border-fuchsia-300', text: 'text-fuchsia-800', ring: 'ring-fuchsia-400', ghost: 'border-fuchsia-300/60', accent: 'bg-fuchsia-400' },
  Media:          { bg: 'bg-pink-100',    border: 'border-pink-300',    text: 'text-pink-800',    ring: 'ring-pink-400',    ghost: 'border-pink-300/60',    accent: 'bg-pink-400'    }
}
const SECTOR_FALLBACK = { bg: 'bg-blue-100', border: 'border-blue-300', text: 'text-blue-800', ring: 'ring-blue-400', ghost: 'border-blue-300/60', accent: 'bg-blue-400' }

function paletteFor(deal) {
  return SECTOR_PALETTE[deal?.sector] || SECTOR_FALLBACK
}

// Activity-marker styling. Tiny dots overlaid below the segment bar so the
// row tells you not just "this is a Mandate" but "two meetings, a teaser,
// and an NDA happened in here." Each kind has a distinct hue + glyph in the
// tooltip.
const MARKER_KIND = {
  meeting:         { dot: 'bg-blue-500',    label: 'Meeting' },
  nda_signed:      { dot: 'bg-emerald-500', label: 'NDA signed' },
  teaser_sent:     { dot: 'bg-violet-500',  label: 'Teaser sent' },
  file_upload:     { dot: 'bg-amber-500',   label: 'File uploaded' },
  note:            { dot: 'bg-slate-400',   label: 'Note added' },
  email_drafted:   { dot: 'bg-cyan-500',    label: 'Email drafted' },
  brief_generated: { dot: 'bg-indigo-500',  label: 'Brief generated' },
  contact_added:   { dot: 'bg-rose-500',    label: 'Contact added' }
}
const MARKER_KINDS = Object.keys(MARKER_KIND)

// Default per-stage durations, in days. The new model has only two live
// stages — Pre-Mandate (paperwork) and Mandate (execution). Mandate is
// long because it absorbs what used to be Preparation through Closing.
export const STAGE_DEFAULT_DAYS = {
  'Pre-Mandate': 14,
  'Mandate':     90
}

// The ordered list of stages a live mandate progresses through. Used to
// derive past / current / future segments deterministically.
const LIVE_STAGES = ['Pre-Mandate', 'Mandate']

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
    if (a.kind && a.kind !== 'stage_change') continue
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

// Pull markers (non-stage-change activities) for a single deal, scoped to
// the visible time range so off-screen events don't pollute the row.
function buildMarkers(deal, activitiesByDeal, range) {
  const acts = activitiesByDeal.get(deal.id) || []
  const out = []
  for (const a of acts) {
    if (!MARKER_KINDS.includes(a.kind)) continue
    const t = new Date(a.created_at)
    if (t < range.start || t > range.end) continue
    out.push({ kind: a.kind, when: t, body: a.body || '' })
  }
  return out.sort((a, b) => a.when - b.when)
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
    segments: buildSegments(d, activitiesByDeal, today),
    markers:  buildMarkers(d, activitiesByDeal, range)
  })), [deals, activitiesByDeal, today, range])

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
    <div className="space-y-3">
      <Legend rows={rows} />

      <div className="vl-card overflow-hidden">
        <div className="grid grid-cols-[260px_1fr]">
          {/* Sticky left column */}
          <div className="border-r border-valence-border bg-white">
            <div className="h-12 border-b border-valence-border px-4 flex items-end pb-2">
              <span className="vl-eyebrow-ink">Mandate</span>
            </div>
            {rows.map(({ deal }) => {
              const p = paletteFor(deal)
              return (
                <div key={deal.id} className="relative h-14 border-b border-valence-border/60 px-4 py-2">
                  <span className={`absolute left-0 top-2 bottom-2 w-1 rounded-r ${p.accent}`} aria-hidden />
                  <button onClick={() => onOpenDeal?.(deal)} className="w-full text-left pl-2">
                    <p className="truncate text-sm font-semibold text-valence-text">{deal.client_name}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-valence-muted">
                      {deal.sector && <span className={`rounded ${p.bg} ${p.border} ${p.text} border px-1.5 py-0`}>{deal.sector}</span>}
                      {deal.side && <span className="rounded bg-valence-surface border border-valence-border px-1.5 py-0">{normalizeSide(deal.side)}</span>}
                      {deal.lead_owner && <span className="text-valence-subtle truncate">{deal.lead_owner}</span>}
                    </div>
                  </button>
                </div>
              )
            })}
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
              {rows.map(({ deal, segments, markers }) => {
                const p = paletteFor(deal)
                const closeIso = deal.expected_close_date || deal.target_close
                const closeDate = closeIso ? parseISO(String(closeIso).slice(0, 10)) : null
                const closeX = closeDate ? differenceInCalendarDays(closeDate, range.start) * cfg.px : null

                return (
                  <div key={deal.id} className="relative h-14 border-b border-valence-border/60">
                    {/* Faint month grid in row */}
                    {monthMarks.map(m => (
                      <div key={m.date.toISOString()} className="absolute top-0 bottom-0 w-px bg-valence-border/40" style={{ left: m.x }} />
                    ))}
                    {/* Today line in row */}
                    <div className="absolute top-0 bottom-0 w-px bg-valence-blue/60 pointer-events-none" style={{ left: todayX }} />

                    {/* Stage segments — coloured by sector */}
                    {segments.map((seg, i) => {
                      const x = Math.max(0, differenceInCalendarDays(seg.start, range.start)) * cfg.px
                      const w = Math.max(2, differenceInCalendarDays(seg.end, seg.start)) * cfg.px
                      return (
                        <div key={i} className="absolute top-2 h-7" style={{ left: x, width: w }}>
                          <button
                            onClick={() => onOpenDeal?.(deal)}
                            title={`${deal.client_name} · ${seg.stage} · ${format(seg.start, 'd MMM')} → ${format(seg.end, 'd MMM')}`}
                            className={`relative h-full w-full rounded-md border text-[10px] font-semibold tracking-tight transition hover:brightness-105 ${segmentClass(seg, p)}`}
                          >
                            {w > 60 && <span className="px-2 truncate block leading-7">{seg.stage}</span>}
                            {seg.kind === 'current' && (
                              <span className="absolute -top-2 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-valence-ink text-white px-1.5 py-0 text-[9px] font-bold uppercase tracking-[0.14em] shadow-valence whitespace-nowrap">
                                We are here
                              </span>
                            )}
                          </button>
                        </div>
                      )
                    })}

                    {/* Activity markers — tiny dots below the bar */}
                    {markers.map((m, i) => {
                      const x = differenceInCalendarDays(m.when, range.start) * cfg.px
                      const def = MARKER_KIND[m.kind]
                      if (!def) return null
                      return (
                        <span
                          key={`m-${i}`}
                          title={`${def.label} · ${format(m.when, 'd MMM')}${m.body ? ' — ' + m.body : ''}`}
                          className={`absolute top-10 h-1.5 w-1.5 -translate-x-1/2 rounded-full ${def.dot} ring-1 ring-white shadow-sm pointer-events-auto`}
                          style={{ left: x }}
                        />
                      )
                    })}

                    {/* Target close flag */}
                    {closeX != null && closeX >= 0 && closeX <= totalPx && (
                      <span
                        title={`Target close: ${format(closeDate, 'd MMM yyyy')}`}
                        className="absolute top-1 h-12 w-px bg-valence-ink/80 pointer-events-auto"
                        style={{ left: closeX }}
                      >
                        <span className="absolute -top-0 -translate-x-1/2 inline-flex items-center gap-0.5 rounded-sm bg-valence-ink text-white px-1 py-0 text-[8px] font-bold uppercase tracking-[0.1em] whitespace-nowrap">
                          ▸ Close
                        </span>
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function segmentClass(seg, palette) {
  const p = palette || SECTOR_FALLBACK
  if (seg.kind === 'past')    return `${p.bg} ${p.border} ${p.text} opacity-70`
  if (seg.kind === 'current') return `${p.bg} ${p.border} ${p.text} ring-2 ${p.ring}`
  return `bg-white border-dashed ${p.ghost} ${p.text}`
}

function normalizeSide(side) {
  if (!side) return null
  if (/^buy/i.test(side)) return 'Buy'
  if (/^sell/i.test(side)) return 'Sell'
  return side
}

// Legend strip — sectors visible on this view + the marker glossary. Helps
// a partner who hasn't memorised the palette read the chart.
function Legend({ rows }) {
  const sectors = Array.from(new Set(rows.map(r => r.deal.sector).filter(Boolean)))
  const markerKinds = Array.from(new Set(rows.flatMap(r => r.markers.map(m => m.kind))))
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-valence-border bg-white/70 px-4 py-2 text-[11px]">
      {sectors.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="vl-eyebrow-ink">Sectors</span>
          {sectors.map(s => {
            const p = SECTOR_PALETTE[s] || SECTOR_FALLBACK
            return (
              <span key={s} className={`inline-flex items-center gap-1 rounded-full border ${p.border} ${p.bg} ${p.text} px-2 py-0.5 text-[10px] font-semibold`}>
                <span className={`h-1.5 w-1.5 rounded-full ${p.accent}`} />{s}
              </span>
            )
          })}
        </div>
      )}
      {markerKinds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="vl-eyebrow-ink">Events</span>
          {markerKinds.map(k => (
            <span key={k} className="inline-flex items-center gap-1 text-valence-muted">
              <span className={`h-1.5 w-1.5 rounded-full ${MARKER_KIND[k].dot}`} />{MARKER_KIND[k].label}
            </span>
          ))}
        </div>
      )}
      <div className="ml-auto flex flex-wrap items-center gap-3 text-valence-muted">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-slate-300 opacity-70" />Past</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-slate-200 ring-1 ring-slate-400" />Current</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-sm border border-dashed border-slate-400" />Future</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-px bg-valence-ink" />Target close</span>
      </div>
    </div>
  )
}
