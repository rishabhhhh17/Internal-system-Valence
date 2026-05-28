import { useMemo, useRef, useState } from 'react'
import { MoreHorizontal, MoveRight } from 'lucide-react'
import { STAGES, STAGE_IDS } from '../lib/stages.js'
import { useCurrency } from '../hooks/useCurrency.jsx'

// Soft column-background tint per stage tone — inspired by the DealVisor
// marketing-site pipeline aesthetic. Glance-able sense of funnel position
// without forcing the user to read the stage label.
function columnBgForTone(tone) {
  switch (tone) {
    case 'slate':       return 'bg-amber-50/40 dark:bg-amber-500/5'
    case 'blue':        return 'bg-violet-50/50 dark:bg-violet-500/5'
    case 'blue-strong': return 'bg-indigo-50/60 dark:bg-indigo-500/10'
    case 'success':     return 'bg-emerald-50/60 dark:bg-emerald-500/10'
    case 'warning':     return 'bg-amber-50/70 dark:bg-amber-500/10'
    case 'danger':      return 'bg-rose-50/50 dark:bg-rose-500/10'
    default:            return 'bg-valence-surface'
  }
}

export default function DealKanban({ deals, onOpen, onStageChange }) {
  const [draggingId, setDraggingId] = useState(null)
  const [overStage, setOverStage]   = useState(null)
  const [stageMenu, setStageMenu]   = useState(null) // dealId for mobile stage picker

  // Build per-stage buckets. Any deal with an unknown stage gets safely
  // bucketed into 'Origination' so the funnel never silently loses cards.
  const byStage = useMemo(() => {
    const g = Object.fromEntries(STAGES.map(s => [s.id, []]))
    for (const d of deals) {
      const bucket = STAGE_IDS.includes(d.stage) ? d.stage : 'Origination'
      g[bucket].push(d)
    }
    return g
  }, [deals])

  const totalCount  = deals.length
  const stagesShown = STAGES.length

  return (
    <div className="vl-card p-4">
      {/* Compact summary + drag hint — replaces the multi-line Legend.
          Stage descriptions still live in tooltips on each column header. */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-sm text-valence-muted">
          <span className="font-semibold text-valence-text tabular-nums">{totalCount}</span> mandate{totalCount === 1 ? '' : 's'} across <span className="font-semibold text-valence-text tabular-nums">{stagesShown}</span> stages
        </p>
        <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-valence-border bg-valence-elevated px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-valence-subtle">
          <MoveRight className="h-3 w-3" /> Drag to advance
        </span>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
        {STAGES.map(stage => {
          const items  = byStage[stage.id] || []
          const isOver = overStage === stage.id
          const colBg  = columnBgForTone(stage.tone)
          return (
            <div
              key={stage.id}
              onDragOver={(e) => { e.preventDefault(); if (draggingId) setOverStage(stage.id) }}
              onDragLeave={() => setOverStage(prev => prev === stage.id ? null : prev)}
              onDrop={(e) => {
                e.preventDefault()
                setOverStage(null)
                const id = e.dataTransfer.getData('text/deal-id')
                if (id && onStageChange) onStageChange(id, stage.id)
              }}
              className={`shrink-0 snap-start w-[244px] rounded-xl border transition ${
                isOver
                  ? 'border-valence-blue bg-valence-blue-soft ring-2 ring-valence-blue/30'
                  : `border-valence-border ${colBg}`
              }`}
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-valence-border/60">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotForTone(stage.tone)}`} />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-valence-text truncate" title={stage.desc}>{stage.id}</p>
                </div>
                <span className="rounded-md border border-valence-border bg-valence-elevated px-1.5 py-0 text-[10px] font-semibold tabular-nums text-valence-muted">
                  {items.length}
                </span>
              </div>

              <div className="p-1.5 space-y-1.5 min-h-[60px]" title={stage.desc}>
                {items.length === 0 ? (
                  <p className="px-2 py-2 text-[10px] text-valence-subtle leading-relaxed italic">Empty</p>
                ) : items.map(d => (
                  <Card
                    key={d.id}
                    deal={d}
                    onOpen={onOpen}
                    onStageChange={onStageChange}
                    setDraggingId={setDraggingId}
                    setOverStage={setOverStage}
                    openMenu={stageMenu === d.id}
                    setOpenMenu={(open) => setStageMenu(open ? d.id : null)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Card({ deal: d, onOpen, onStageChange, setDraggingId, setOverStage, openMenu, setOpenMenu }) {
  const ref = useRef(null)
  const { money } = useCurrency()
  // EV signal — prefer ticket_size, then any of the type-specific
  // value fields the schema carries. Cards stay minimal: name + value.
  const ev = d.ticket_size_usd_m
    ?? d.target_raise_usd_m
    ?? d.target_valuation_usd_m
    ?? d.target_exit_usd_m
    ?? null
  return (
    <article
      ref={ref}
      draggable
      onDragStart={(e) => {
        setDraggingId(d.id)
        e.dataTransfer.setData('text/deal-id', d.id)
        e.dataTransfer.effectAllowed = 'move'
        if (ref.current) {
          try { e.dataTransfer.setDragImage(ref.current, 20, 20) } catch {}
        }
      }}
      onDragEnd={() => { setDraggingId(null); setOverStage(null) }}
      onClick={(e) => {
        if (e.target.closest('[data-menu-trigger]')) return
        onOpen?.(d)
      }}
      className="group relative cursor-pointer rounded-lg border border-valence-border/60 bg-valence-elevated px-3 py-2 transition hover:border-valence-ink/30 hover:shadow-sm active:opacity-60"
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="truncate text-[13px] font-semibold text-valence-text">{d.client_name}</p>
          {ev != null && (
            <p className="mt-0.5 text-[11px] text-valence-muted tabular-nums">{money(ev)}</p>
          )}
        </div>
        <button
          data-menu-trigger
          onClick={(e) => { e.stopPropagation(); setOpenMenu(!openMenu) }}
          className="-mr-1 -mt-1 grid h-5 w-5 place-items-center rounded text-valence-subtle hover:bg-valence-surface hover:text-valence-text lg:opacity-0 lg:group-hover:opacity-100 transition shrink-0"
          aria-label="Move stage"
        >
          <MoreHorizontal className="h-3 w-3" />
        </button>
      </div>

      {openMenu && (
        <div
          data-menu-trigger
          onClick={(e) => e.stopPropagation()}
          className="absolute right-2 top-10 z-20 w-44 rounded-lg border border-valence-border-strong bg-valence-elevated shadow-valence-lg overflow-hidden animate-slide-up"
        >
          <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-valence-subtle">Move to</p>
          <ul className="pb-1 max-h-60 overflow-y-auto">
            {STAGES.map(s => (
              <li key={s.id}>
                <button
                  disabled={s.id === d.stage}
                  onClick={() => { onStageChange?.(d.id, s.id); setOpenMenu(false) }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition ${
                    s.id === d.stage
                      ? 'bg-valence-surface text-valence-subtle cursor-default'
                      : 'text-valence-text hover:bg-valence-blue-soft'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${dotForTone(s.tone)}`} />
                  {s.id}
                  {s.id === d.stage && <span className="ml-auto text-[9px] text-valence-subtle">current</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  )
}

function dotForTone(tone) {
  switch (tone) {
    case 'slate':       return 'bg-valence-subtle'
    case 'blue':        return 'bg-valence-blue/70 shadow-[0_0_6px_#3399FF]'
    case 'blue-strong': return 'bg-valence-blue shadow-[0_0_8px_#3399FF]'
    case 'success':     return 'bg-valence-success shadow-[0_0_6px_#059669]'
    case 'warning':     return 'bg-valence-warning'
    case 'danger':      return 'bg-valence-danger'
    default:            return 'bg-valence-subtle'
  }
}
