import { useMemo, useState } from 'react'
import { Briefcase, Info, TrendingUp } from 'lucide-react'
import { STAGES, stageMeta, stageToneClasses } from '../lib/stages.js'

export default function DealKanban({ deals, onOpen, onStageChange }) {
  const [draggingId, setDraggingId] = useState(null)
  const [overStage, setOverStage]   = useState(null)

  const byStage = useMemo(() => {
    const g = Object.fromEntries(STAGES.map(s => [s.id, []]))
    for (const d of deals) (g[d.stage] || (g[d.stage] = [])).push(d)
    return g
  }, [deals])

  return (
    <div className="vl-card p-4">
      <Legend />
      <div className="mt-4 flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
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
              className={`shrink-0 w-[260px] rounded-xl border transition ${
                isOver ? 'border-valence-blue/50 bg-valence-blue-soft/40' : 'border-valence-border bg-valence-surface'
              }`}
            >
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-valence-border">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`h-1.5 w-1.5 rounded-full ${dotForTone(stage.tone)}`} />
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-valence-text truncate" title={stage.desc}>{stage.id}</p>
                </div>
                <span className="rounded-md border border-valence-border bg-valence-surface px-1.5 py-0.5 text-[10px] font-semibold text-valence-muted">
                  {items.length}
                </span>
              </div>

              <div className="p-2 space-y-2 min-h-[60px]" title={stage.desc}>
                {items.length === 0 ? (
                  <p className="px-2 py-3 text-[11px] text-valence-subtle leading-relaxed">{stage.desc}</p>
                ) : items.map(d => (
                  <article
                    key={d.id}
                    draggable
                    onDragStart={(e) => {
                      setDraggingId(d.id)
                      e.dataTransfer.setData('text/deal-id', d.id)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragEnd={() => { setDraggingId(null); setOverStage(null) }}
                    onClick={() => onOpen?.(d)}
                    className="group cursor-pointer rounded-lg border border-valence-border bg-valence-surface/80 p-3 transition hover:border-valence-border-strong hover:bg-valence-surface active:opacity-60"
                  >
                    <div className="flex items-center gap-2">
                      <div className="grid h-7 w-7 place-items-center rounded-md bg-valence-blue-soft ring-1 ring-valence-blue/20">
                        <Briefcase className="h-3.5 w-3.5 text-valence-blue" />
                      </div>
                      <p className="truncate text-[13px] font-semibold text-valence-text">{d.client_name}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
                      <span className="inline-flex items-center rounded-md border border-valence-border bg-valence-surface px-1.5 py-0.5 font-semibold text-valence-muted">
                        {d.deal_type}
                      </span>
                      {d.side && (
                        <span className="inline-flex items-center rounded-md border border-valence-border bg-valence-surface px-1.5 py-0.5 font-semibold text-valence-muted">
                          {d.side}
                        </span>
                      )}
                      {d.sector && (
                        <span className="inline-flex items-center rounded-md border border-valence-border bg-valence-surface px-1.5 py-0.5 font-semibold text-valence-muted truncate max-w-[110px]">
                          {d.sector}
                        </span>
                      )}
                    </div>
                    {d.ticket_size_usd_m != null && (
                      <div className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-valence-blue">
                        <TrendingUp className="h-3 w-3" /> ${Number(d.ticket_size_usd_m).toLocaleString()}M
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Legend() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-valence-border bg-valence-surface px-4 py-3">
      <div className="grid h-8 w-8 place-items-center rounded-lg bg-valence-blue-soft ring-1 ring-valence-blue/20 shrink-0">
        <Info className="h-4 w-4 text-valence-blue" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-valence-text">The Valence funnel</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-valence-muted">
          Preliminary conversations sit in <b className="text-valence-text">Origination</b> and <b className="text-valence-text">Pitch</b>. Once we're engaged (<b className="text-valence-text">Mandate</b>) we build materials (<b className="text-valence-text">Preparation</b>), market the deal (<b className="text-valence-text">Marketing</b>), run <b className="text-valence-text">Diligence</b> and <b className="text-valence-text">Negotiation</b>, and ship at <b className="text-valence-text">Closing</b>. Hover any column for the full definition, or drag a card to move a deal.
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
    case 'success':     return 'bg-valence-success shadow-[0_0_6px_#34d399]'
    case 'warning':     return 'bg-valence-warning'
    case 'danger':      return 'bg-valence-danger'
    default:            return 'bg-valence-subtle'
  }
}
