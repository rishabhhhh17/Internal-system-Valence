import { useMemo, useRef, useState } from 'react'
import { Briefcase, MoreHorizontal, Move } from 'lucide-react'
import { STAGES, STAGE_IDS, stageToneClasses } from '../lib/stages.js'

export default function DealKanban({ deals, onOpen, onStageChange }) {
  const [draggingId, setDraggingId] = useState(null)
  const [overStage, setOverStage]   = useState(null)
  const [stageMenu, setStageMenu]   = useState(null) // dealId for mobile stage picker

  // Build per-stage buckets. Any deal with an unknown stage gets safely bucketed
  // into 'Origination' so the funnel never silently loses cards.
  const byStage = useMemo(() => {
    const g = Object.fromEntries(STAGES.map(s => [s.id, []]))
    for (const d of deals) {
      const bucket = STAGE_IDS.includes(d.stage) ? d.stage : 'Origination'
      g[bucket].push(d)
    }
    return g
  }, [deals])

  return (
    <div className="vl-card p-4">
      <Legend />
      <div className="mt-4 flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
        {STAGES.map(stage => {
          const items = byStage[stage.id] || []
          const isOver = overStage === stage.id
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
              className={`shrink-0 snap-start w-[268px] rounded-xl border transition ${
                isOver
                  ? 'border-valence-blue bg-valence-blue-soft'
                  : 'border-valence-border bg-valence-surface'
              }`}
            >
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-valence-border">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotForTone(stage.tone)}`} />
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-valence-text truncate" title={stage.desc}>{stage.id}</p>
                </div>
                <span className="rounded-md border border-valence-border bg-valence-elevated px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-valence-muted">
                  {items.length}
                </span>
              </div>

              <div className="p-2 space-y-2 min-h-[72px]" title={stage.desc}>
                {items.length === 0 ? (
                  <p className="px-2 py-3 text-[11px] text-valence-subtle leading-relaxed">{stage.desc}</p>
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
      className="group relative cursor-pointer rounded-lg border border-valence-border bg-valence-elevated p-3 transition hover:border-valence-ink/20 hover:shadow-valence active:opacity-60"
    >
      <div className="flex items-start gap-2">
        <div className="grid h-7 w-7 place-items-center rounded-md bg-valence-blue-soft ring-1 ring-valence-blue/20 shrink-0">
          <Briefcase className="h-3.5 w-3.5 text-valence-blue" />
        </div>
        <p className="flex-1 min-w-0 truncate text-[13px] font-semibold text-valence-text">{d.client_name}</p>
        <button
          data-menu-trigger
          onClick={(e) => { e.stopPropagation(); setOpenMenu(!openMenu) }}
          className="-mr-1 -mt-1 grid h-6 w-6 place-items-center rounded text-valence-muted hover:bg-valence-surface hover:text-valence-text lg:opacity-0 lg:group-hover:opacity-100 transition"
          aria-label="Move stage"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
        {(Array.isArray(d.deal_types) ? d.deal_types : []).map(t => (
          <span key={t} className="inline-flex items-center rounded-md border border-valence-border bg-valence-surface px-1.5 py-0.5 font-semibold text-valence-muted capitalize">
            {t === 'm_and_a' ? 'M&A' : t}
          </span>
        ))}
        {d.deal_subtype && d.deal_types?.includes('transaction') && (
          <span className="inline-flex items-center rounded-md border border-valence-blue/30 bg-valence-blue-soft px-1.5 py-0.5 font-semibold text-valence-blue">
            {d.deal_subtype === 'm_and_a' ? 'M&A' : d.deal_subtype.replace(/_/g, ' ')}
          </span>
        )}
        {d.sector && (
          <span className="inline-flex items-center rounded-md border border-valence-border bg-valence-surface px-1.5 py-0.5 font-semibold text-valence-muted truncate max-w-[110px]">
            {d.sector}
          </span>
        )}
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

function Legend() {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-valence-blue-soft/40 border border-valence-blue/20 px-4 py-3">
      <div className="grid h-8 w-8 place-items-center rounded-lg bg-valence-blue-soft ring-1 ring-valence-blue/30 shrink-0">
        <Move className="h-3.5 w-3.5 text-valence-blue" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-valence-text">How the funnel works</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-valence-muted">
          Preliminary conversations sit in <b className="text-valence-text">Origination</b> and <b className="text-valence-text">Pitch</b>. Once engaged (<b className="text-valence-text">Mandate</b>) we build materials (<b className="text-valence-text">Preparation</b>), run <b className="text-valence-text">Marketing</b>, <b className="text-valence-text">Diligence</b> and <b className="text-valence-text">Negotiation</b>, and ship at <b className="text-valence-text">Closing</b>. Drag a card between columns, or tap the menu on a card to move on mobile.
        </p>
      </div>
    </div>
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
