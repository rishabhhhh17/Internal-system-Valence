import { useMemo, useRef, useEffect, useState } from 'react'
import { format, parseISO, differenceInCalendarDays, addDays, startOfMonth, addMonths } from 'date-fns'
import { Flag, Info } from 'lucide-react'
import { activeStagesForMode, stageLabel } from '../lib/stages.js'

// Per-sector palette. IB-grade treatment: bars are uniformly slate /
// neutral. Sector identity shows only via a thin 3-px coloured left rail
// on the row + a coloured dot on the meta pills + a coloured dot on the
// legend. Hue does NOT bleed across the body of the bar — that's what
// made the page read as a Kanban board ("candy chips") instead of a
// professional firm pipeline.
//
// `accent` (Tailwind bg-) is the only saturated colour each sector
// surfaces. `dot` is a hex equivalent used inside hex-only contexts
// (kept lightweight — no second palette to maintain).
const SECTOR_PALETTE = {
  Healthcare:     { accent: 'bg-emerald-600',  dot: '#059669' },
  Fintech:        { accent: 'bg-violet-600',   dot: '#7c3aed' },
  Consumer:       { accent: 'bg-amber-600',    dot: '#d97706' },
  Infrastructure: { accent: 'bg-slate-500',    dot: '#64748b' },
  Renewables:     { accent: 'bg-lime-600',     dot: '#65a30d' },
  Logistics:      { accent: 'bg-orange-600',   dot: '#ea580c' },
  'Real Estate':  { accent: 'bg-rose-600',     dot: '#e11d48' },
  EdTech:         { accent: 'bg-cyan-700',     dot: '#0e7490' },
  Mobility:       { accent: 'bg-indigo-600',   dot: '#4f46e5' },
  Hospitality:    { accent: 'bg-fuchsia-600',  dot: '#c026d3' },
  Media:          { accent: 'bg-pink-600',     dot: '#db2777' }
}
const SECTOR_FALLBACK = { accent: 'bg-slate-500', dot: '#64748b' }

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

// Default per-stage durations, in days, across the active pre-diligence
// funnel. Used to project future segments when there's no explicit close
// date to scale against.
export const STAGE_DEFAULT_DAYS = {
  'Sourced':              10,
  'Information Received':  10,
  'Analyst Call':         14,
  'Partner Call':         14,
  'Memo':                 21,
  'LP Sourced':           10,
  'LP Introduced':        10,
  'LP Meeting':           14,
  'LP Due Diligence':     21,
  'LP Soft Circle':       14
}

// The ordered list of active stages a deal progresses through — derived per
// pipeline mode (company vs LP funnel). Used to derive past / current /
// future segments deterministically.

const ZOOMS = {
  weeks:    { px: 12,  monthLabel: false, weekLabel: true,  monthsRange: { back: 6, fwd: 9 } },
  months:   { px: 4,   monthLabel: true,  weekLabel: false, monthsRange: { back: 6, fwd: 9 } },
  quarters: { px: 1.5, monthLabel: true,  weekLabel: false, monthsRange: { back: 6, fwd: 9 } }
}

// Build the past/current/future segments for a single deal. activitiesByDeal is
// a Map<dealId, [stage_change activities sorted ascending by created_at]>.
function buildSegments(deal, activitiesByDeal, today, stageOrder) {
  const acts = activitiesByDeal.get(deal.id) || []
  const stageStartByStage = new Map()

  // Initial stage starts at deal.created_at (or today if missing).
  let cursor = deal.created_at ? new Date(deal.created_at) : new Date(today)
  let lastStage = stageOrder[0]
  stageStartByStage.set(lastStage, cursor)

  for (const a of acts) {
    if (a.kind && a.kind !== 'stage_change') continue
    const t = new Date(a.created_at)
    if (a.body) {
      // Activity body is "Sourced → Analyst Call" style. Pull the destination.
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

export default function TimelineGantt({ deals, activities, zoom = 'months', mode = 'company', onOpenDeal }) {
  const stageOrder = useMemo(() => activeStagesForMode(mode).map(s => s.id), [mode])
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
    segments: buildSegments(d, activitiesByDeal, today, stageOrder),
    markers:  buildMarkers(d, activitiesByDeal, range)
  })), [deals, activitiesByDeal, today, range, stageOrder])

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
      {/* Tucked legend — opens on hover/click, doesn't steal vertical space. */}
      <LegendBar rows={rows} />

      <div className="vl-card overflow-hidden shadow-sm">
        <div className="grid grid-cols-[260px_1fr]">
          {/* Sticky left column — mandate list */}
          <div className="border-r border-valence-border bg-valence-elevated">
            <div className="h-12 border-b border-valence-border px-4 flex items-end pb-2">
              <span className="vl-eyebrow-ink">{mode === 'lp' ? 'LP' : 'Company'}</span>
            </div>
            {rows.map(({ deal }, idx) => {
              const p = paletteFor(deal)
              return (
                <div
                  key={deal.id}
                  className={`group relative h-14 border-b border-valence-border/60 px-4 py-2 transition-colors hover:bg-valence-surface/60 ${idx % 2 === 1 ? 'bg-valence-surface/20' : ''}`}
                >
                  <span className={`absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full ${p.accent} opacity-90 group-hover:opacity-100 transition-opacity`} aria-hidden />
                  <button onClick={() => onOpenDeal?.(deal)} className="w-full text-left pl-2">
                    <p className="truncate text-sm font-semibold text-valence-text">{deal.client_name}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-valence-muted">
                      {deal.sector && (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.06em] text-valence-muted">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.dot }} />
                          {deal.sector}
                        </span>
                      )}
                      {deal.side && (
                        <span className="text-[10px] uppercase tracking-[0.06em] text-valence-subtle">
                          {normalizeSide(deal.side)}
                        </span>
                      )}
                      {deal.lead_owner && <span className="text-valence-subtle truncate">{deal.lead_owner}</span>}
                    </div>
                  </button>
                </div>
              )
            })}
          </div>

          {/* Scrollable timeline area */}
          <div ref={scrollerRef} className="overflow-x-auto bg-gradient-to-b from-valence-elevated to-valence-surface/40">
            <div className="relative" style={{ width: totalPx }}>
              {/* Month axis — sticky header. Uses gradient backdrop for a glassy feel. */}
              <div className="sticky top-0 z-10 h-12 border-b border-valence-border bg-white/85 backdrop-blur-md">
                {monthMarks.map(m => (
                  <div key={m.date.toISOString()} className="absolute top-0 h-full" style={{ left: m.x }}>
                    <div className="h-full border-l border-valence-border/40" />
                    <span className="absolute top-2 left-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-valence-muted whitespace-nowrap">
                      {format(m.date, cfg.px >= 4 ? 'MMM yyyy' : "MMM ''yy")}
                    </span>
                  </div>
                ))}
                {/* Today marker — gradient line + glow pill */}
                <div className="absolute top-0 h-full pointer-events-none" style={{ left: todayX }}>
                  <div className="h-full w-px bg-gradient-to-b from-valence-blue via-valence-blue to-valence-blue/40" />
                  <span className="absolute top-2 left-1.5 inline-flex items-center gap-1 rounded-full bg-valence-blue text-white px-2 py-0.5 text-[10px] font-bold tracking-wide shadow-[0_0_12px_rgba(51,153,255,0.55)] ring-1 ring-white/40">
                    <span className="h-1.5 w-1.5 rounded-full bg-valence-elevated animate-pulse" /> Today
                  </span>
                </div>
              </div>

              {/* Rows */}
              {rows.map(({ deal, segments, markers }, idx) => {
                const p = paletteFor(deal)
                const closeIso = deal.expected_close_date || deal.target_close
                const closeDate = closeIso ? parseISO(String(closeIso).slice(0, 10)) : null
                const closeX = closeDate ? differenceInCalendarDays(closeDate, range.start) * cfg.px : null

                return (
                  <div
                    key={deal.id}
                    className={`group/row relative h-14 border-b border-valence-border/60 transition-colors hover:bg-valence-blue-soft/15 ${idx % 2 === 1 ? 'bg-valence-surface/20' : ''}`}
                  >
                    {/* Faint month grid in row */}
                    {monthMarks.map(m => (
                      <div key={m.date.toISOString()} className="absolute top-0 bottom-0 w-px bg-valence-border/30" style={{ left: m.x }} />
                    ))}
                    {/* Today line within the row — subtle */}
                    <div className="absolute top-0 bottom-0 w-px bg-valence-blue/40 pointer-events-none" style={{ left: todayX }} />

                    {/* Stage segments — gradient fills with depth. */}
                    {segments.map((seg, i) => {
                      const x = Math.max(0, differenceInCalendarDays(seg.start, range.start)) * cfg.px
                      const w = Math.max(2, differenceInCalendarDays(seg.end, seg.start)) * cfg.px
                      return (
                        <div key={i} className="absolute top-2 h-7" style={{ left: x, width: w }}>
                          <button
                            onClick={() => onOpenDeal?.(deal)}
                            title={`${deal.client_name} · ${stageLabel(seg.stage, mode)} · ${format(seg.start, 'd MMM')} → ${format(seg.end, 'd MMM')}`}
                            className={`relative h-full w-full rounded-md text-[10px] font-semibold tracking-tight transition-all duration-150 hover:scale-[1.02] hover:brightness-105 ${segmentClass(seg, p)}`}
                          >
                            {w > 60 && <span className="px-2 truncate block leading-7">{stageLabel(seg.stage, mode)}</span>}
                          </button>
                        </div>
                      )
                    })}

                    {/* Activity markers — slightly larger dots, ringed for visibility */}
                    {markers.map((m, i) => {
                      const x = differenceInCalendarDays(m.when, range.start) * cfg.px
                      const def = MARKER_KIND[m.kind]
                      if (!def) return null
                      return (
                        <span
                          key={`m-${i}`}
                          title={`${def.label} · ${format(m.when, 'd MMM')}${m.body ? ' — ' + m.body : ''}`}
                          className={`absolute top-[42px] h-2 w-2 -translate-x-1/2 rounded-full ${def.dot} ring-2 ring-white shadow-sm transition-transform hover:scale-150`}
                          style={{ left: x }}
                        />
                      )
                    })}

                    {/* Target close flag — clean chip with icon, no jagged glyph */}
                    {closeX != null && closeX >= 0 && closeX <= totalPx && (
                      <span
                        title={`Target close: ${format(closeDate, 'd MMM yyyy')}`}
                        className="absolute top-1 h-12 w-px bg-valence-ink/70 pointer-events-auto"
                        style={{ left: closeX }}
                      >
                        <span className="absolute top-0 -translate-x-1/2 inline-flex items-center gap-1 rounded-md bg-valence-ink text-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] whitespace-nowrap shadow-[0_2px_8px_rgba(8,16,40,0.25)]">
                          <Flag className="h-2.5 w-2.5" /> Close
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

function segmentClass(seg /* , palette */) {
  // All bars share one neutral palette. Past/current/future is encoded
  // by tone + ring, not hue — colour identity comes from the row's left
  // rail (sector accent). Makes the page read as a finance pipeline,
  // not a Kanban board.
  if (seg.kind === 'past') {
    return 'bg-slate-100 text-slate-700 border border-slate-200 shadow-sm'
  }
  if (seg.kind === 'current') {
    // Current is the visual centre of the chart — slight elevation, a
    // subtle inner ring in the firm blue.
    return 'bg-white text-slate-900 border border-slate-300 ring-1 ring-valence-blue/30 shadow-md'
  }
  // Future — outlined, dashed, low chroma. Reads as projection.
  return 'bg-valence-elevated border border-dashed border-slate-300 text-slate-500'
}

function normalizeSide(side) {
  if (!side) return null
  if (/^buy/i.test(side)) return 'Buy'
  if (/^sell/i.test(side)) return 'Sell'
  return side
}

// Compact legend strip — one line. Sector pills inline (only those visible on
// this view); a small "Legend" pill on the right reveals everything else
// (state tokens + event glyphs) in a hover popover. The old fat block stole
// vertical space and never earned it.
function LegendBar({ rows }) {
  const sectors = useMemo(() => Array.from(new Set(rows.map(r => r.deal.sector).filter(Boolean))), [rows])
  const markerKinds = useMemo(() => Array.from(new Set(rows.flatMap(r => r.markers.map(m => m.kind)))), [rows])
  const [open, setOpen] = useState(false)

  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      {sectors.length > 0 && (
        <>
          {sectors.map(s => {
            const p = SECTOR_PALETTE[s] || SECTOR_FALLBACK
            // Outline-only chip with a coloured dot. Reads as a data-viz
            // legend marker, not a marketing pill.
            return (
              <span key={s} className="inline-flex items-center gap-1.5 rounded-full border border-valence-border bg-valence-elevated px-2.5 py-0.5 text-[10px] font-medium text-valence-muted">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.dot }} />{s}
              </span>
            )
          })}
        </>
      )}

      <div className="relative ml-auto">
        <button
          onClick={() => setOpen(o => !o)}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className="inline-flex items-center gap-1.5 rounded-full border border-valence-border bg-valence-elevated px-2.5 py-1 text-[10px] font-semibold text-valence-muted hover:text-valence-text hover:border-valence-ink/30 transition"
          aria-expanded={open}
        >
          <Info className="h-3 w-3" /> Legend
        </button>
        {open && (
          <div
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            className="absolute right-0 top-full mt-1 z-20 w-72 rounded-xl border border-valence-border bg-valence-elevated shadow-valence-lg p-3 space-y-3"
          >
            <div>
              <p className="vl-eyebrow-ink mb-1.5">States</p>
              <div className="grid grid-cols-2 gap-1.5 text-[10px] text-valence-muted">
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-gradient-to-br from-slate-50 to-slate-100 opacity-75" />Past</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-gradient-to-br from-slate-50 to-slate-100 ring-1 ring-slate-400" />Current</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm border border-dashed border-slate-400" />Future</span>
                <span className="inline-flex items-center gap-1.5"><Flag className="h-2.5 w-2.5" /> Target close</span>
              </div>
            </div>
            {markerKinds.length > 0 && (
              <div>
                <p className="vl-eyebrow-ink mb-1.5">Events on the row</p>
                <div className="grid grid-cols-2 gap-1 text-[10px] text-valence-muted">
                  {markerKinds.map(k => (
                    <span key={k} className="inline-flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${MARKER_KIND[k].dot} ring-1 ring-white shadow-sm`} />
                      {MARKER_KIND[k].label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
