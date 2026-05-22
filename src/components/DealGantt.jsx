// Hand-rolled SVG Gantt view for the Deal Status page.
//
// Layout:
//   ┌──────────────────────┬──────────────────────────────────────────┐
//   │  client name + stage │  ────── bar from created_at to target ── │
//   ├──────────────────────┼──────────────────────────────────────────┤
//   │  client name + stage │      ──── bar ─────                      │
//   └──────────────────────┴──────────────────────────────────────────┘
//
// - Rows are sorted by target_close (soonest first).
// - The x-axis spans `min(created_at)` → `max(target_close)`, clamped to
//   a minimum 90-day window so a single deal still gets a sensible scale.
// - "Today" is a dashed vertical line so the user can see what's overdue.
// - Bar fill matches the stage tone class so the Gantt reads the same
//   colour language as the Board / Table views.
// - Click a bar → onOpen(deal) — fires the same drawer the table uses.
//
// No external libraries. The chart is pure React + inline SVG so it
// doesn't add to the bundle and stays themable via Tailwind classes.

import { useMemo, useRef, useState } from 'react'
import { format, differenceInDays, addDays, max as dateMax, min as dateMin } from 'date-fns'
import { stageToneClasses, stageMeta } from '../lib/stages.js'

const LABEL_W = 240       // left-column width for client + stage label
const ROW_H   = 36
const BAR_H   = 18
const PAD_T   = 36        // top padding for axis labels
const PAD_B   = 12

const STAGE_FILL = {
  'Origination':  '#94a3b8',  // slate-400
  'Pre-Mandate':  '#a78bfa',  // violet-400
  'Mandate':      '#60a5fa',  // blue-400
  'Preparation':  '#38bdf8',  // sky-400
  'Marketing':    '#22d3ee',  // cyan-400
  'Diligence':    '#34d399',  // emerald-400
  'Negotiation':  '#fbbf24',  // amber-400
  'Closing':      '#f97316',  // orange-500
  'Closed':       '#10b981',  // emerald-500
  'Lost':         '#9ca3af',  // gray-400
  'On Hold':      '#d1d5db'   // gray-300
}

function safeDate(value, fallback) {
  if (!value) return fallback
  const d = new Date(value)
  return isNaN(d.getTime()) ? fallback : d
}

export default function DealGantt({ deals, onOpen }) {
  const containerRef = useRef(null)
  const [hover, setHover]   = useState(null)   // { deal, x, y } | null
  const [width, setWidth]   = useState(900)

  // Measure once and listen for resize so the chart spans the container.
  useMemo(() => {
    if (typeof window === 'undefined') return
    const node = containerRef.current
    if (!node) return
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setWidth(Math.max(480, e.contentRect.width))
    })
    ro.observe(node)
    return () => ro.disconnect()
  }, [containerRef.current])

  const { rows, axis, today } = useMemo(() => {
    const now = new Date()
    // Build rows. For each deal, derive a [start, end] window from the
    // best signals we have: created_at → target_close. Falls back to a
    // 60-day forward window if either is missing so the bar still renders.
    const built = deals.map(d => {
      const start = safeDate(d.created_at, now)
      const end   = safeDate(d.target_close, addDays(start, 60))
      // Always make end ≥ start so the bar has a positive width.
      const finalEnd = end < start ? addDays(start, 14) : end
      return { deal: d, start, end: finalEnd }
    })

    // Sort by end ascending (most-urgent first).
    built.sort((a, b) => a.end - b.end)

    // Axis domain. Use the dataset's extremes, but pad both sides and
    // enforce a minimum 90-day window so single-deal Gantts don't squish.
    if (built.length === 0) {
      return { rows: [], axis: { start: now, end: addDays(now, 90) }, today: now }
    }
    let axisStart = dateMin(built.map(r => r.start))
    let axisEnd   = dateMax(built.map(r => r.end))
    if (axisStart > now)  axisStart = now
    if (axisEnd   < now)  axisEnd   = now
    const span = Math.max(differenceInDays(axisEnd, axisStart), 90)
    axisEnd = addDays(axisStart, span)
    // 7-day left pad so the leftmost bar doesn't kiss the label column.
    axisStart = addDays(axisStart, -7)
    return { rows: built, axis: { start: axisStart, end: axisEnd }, today: now }
  }, [deals])

  if (rows.length === 0) {
    return (
      <div className="vl-card p-10 text-center text-sm text-valence-muted">
        Nothing to chart yet — add deals with a target close date to see the timeline.
      </div>
    )
  }

  const chartW    = Math.max(width - LABEL_W - 24, 320)
  const chartH    = PAD_T + rows.length * ROW_H + PAD_B
  const dayTotal  = differenceInDays(axis.end, axis.start) || 1
  const xFor      = (date) => (differenceInDays(date, axis.start) / dayTotal) * chartW

  // Month tick marks across the top axis. One label per calendar month
  // boundary; skipped if the chart is too narrow to fit them legibly.
  const monthTicks = useMemo(() => {
    const ticks = []
    const cursor = new Date(axis.start.getFullYear(), axis.start.getMonth(), 1)
    while (cursor <= axis.end) {
      ticks.push(new Date(cursor))
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return ticks
  }, [axis.start, axis.end])

  return (
    <div ref={containerRef} className="vl-card overflow-hidden">
      <div className="flex" style={{ minHeight: chartH }}>

        {/* LEFT COLUMN — client + stage labels */}
        <div className="shrink-0 border-r border-valence-border" style={{ width: LABEL_W }}>
          <div className="h-[36px] border-b border-valence-border bg-valence-surface/40 px-3 flex items-end pb-1">
            <span className="text-[10px] uppercase tracking-[0.15em] text-valence-subtle">Deal</span>
          </div>
          {rows.map((row, i) => (
            <button
              key={row.deal.id}
              onClick={() => onOpen?.(row.deal)}
              className="w-full text-left px-3 hover:bg-valence-surface/50 border-b border-valence-border/40 transition flex items-center"
              style={{ height: ROW_H }}
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-valence-text">{row.deal.client_name}</p>
                <p className="truncate text-[10px] uppercase tracking-wide text-valence-subtle">
                  {row.deal.stage || '—'} {row.deal.sector ? `· ${row.deal.sector}` : ''}
                </p>
              </div>
            </button>
          ))}
        </div>

        {/* RIGHT COLUMN — SVG chart */}
        <div className="relative flex-1 overflow-x-auto">
          <svg width={chartW} height={chartH} className="block">
            {/* Top axis backdrop */}
            <rect x={0} y={0} width={chartW} height={PAD_T} className="fill-valence-surface/40" />

            {/* Month tick labels + verticals */}
            {monthTicks.map((t, i) => {
              const x = xFor(t)
              if (x < 0 || x > chartW) return null
              return (
                <g key={i}>
                  <line x1={x} y1={PAD_T} x2={x} y2={chartH - PAD_B}
                        className="stroke-valence-border/40" strokeWidth={1} />
                  <text x={x + 4} y={PAD_T - 12} className="fill-valence-subtle"
                        style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    {format(t, 'MMM yyyy')}
                  </text>
                </g>
              )
            })}

            {/* Today line */}
            {today >= axis.start && today <= axis.end && (
              <g>
                <line
                  x1={xFor(today)} y1={PAD_T - 4}
                  x2={xFor(today)} y2={chartH - PAD_B}
                  className="stroke-valence-blue" strokeWidth={1.5} strokeDasharray="4 4"
                />
                <text x={xFor(today) + 4} y={PAD_T - 22} className="fill-valence-blue"
                      style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em' }}>
                  TODAY
                </text>
              </g>
            )}

            {/* Deal bars */}
            {rows.map((row, i) => {
              const x  = xFor(row.start)
              const x2 = xFor(row.end)
              const w  = Math.max(x2 - x, 4)
              const y  = PAD_T + i * ROW_H + (ROW_H - BAR_H) / 2
              const fill = STAGE_FILL[row.deal.stage] || '#94a3b8'
              const terminal = stageMeta(row.deal.stage)?.terminal
              return (
                <g key={row.deal.id}
                   onMouseEnter={(e) => setHover({ deal: row.deal, x: x + w / 2, y: y - 8, start: row.start, end: row.end })}
                   onMouseLeave={() => setHover(null)}
                   onClick={() => onOpen?.(row.deal)}
                   style={{ cursor: 'pointer' }}
                >
                  <rect
                    x={x} y={y} width={w} height={BAR_H}
                    rx={6}
                    fill={fill}
                    opacity={terminal ? 0.55 : 0.95}
                  />
                  {w > 80 && (
                    <text
                      x={x + 8} y={y + BAR_H / 2 + 4}
                      style={{ fontSize: 11, fontWeight: 600, fill: 'white' }}
                    >
                      {row.deal.client_name}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>

          {/* Hover tooltip — positioned absolutely above the hovered bar */}
          {hover && (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-valence-border bg-valence-elevated px-3 py-2 shadow-valence text-[11px]"
              style={{ left: hover.x, top: hover.y }}
            >
              <p className="font-semibold text-valence-text">{hover.deal.client_name}</p>
              <p className="text-valence-muted mt-0.5">
                {hover.deal.stage} · {format(hover.start, 'd MMM yyyy')} → {format(hover.end, 'd MMM yyyy')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
