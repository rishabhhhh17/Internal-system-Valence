// IB tool — Closing Checklist.
//
// Stage-aware to-dos that bind to the deal's current stage. Items are
// stored locally (deal.closing_checklist isn't a column — we use the
// activity log + a deterministic template per stage). This deliberately
// avoids a new schema migration; the template lives in code and user
// state lives in localStorage keyed by deal.id. Good enough for the
// first release; can be promoted to its own table later if usage warrants.

import { useEffect, useState } from 'react'
import { CheckSquare, Square, ClipboardCheck } from 'lucide-react'

const TEMPLATES = {
  'Mandate':     ['Engagement letter signed', 'Fee structure agreed', 'NDA exchanged with all parties'],
  'Marketing':   ['Teaser approved by client', 'CIM finalised', 'Investor list signed off', 'Outreach started'],
  'Diligence':   ['VDR populated', 'Management Q&A sent', 'Site visits scheduled', 'Financial DD completed'],
  'Negotiation': ['Term sheet drafted', 'Definitive agreement under review', 'Reps & warranties negotiated', 'Conditions precedent listed'],
  'Closing':     ['Regulatory clearances received', 'Escrow agreement signed', 'Signing pack circulated', 'Funds flow confirmed', 'Press release approved', 'Fee invoice issued'],
}

function storageKey(dealId) { return `valence.closing-checklist.${dealId}` }

export default function ClosingChecklistPanel({ deal }) {
  const [checked, setChecked] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey(deal.id)) || '{}') }
    catch { return {} }
  })
  useEffect(() => {
    try { localStorage.setItem(storageKey(deal.id), JSON.stringify(checked)) } catch {}
  }, [checked, deal.id])

  const items = TEMPLATES[deal.stage] || []
  const done  = items.filter(i => checked[i]).length

  return (
    <div className="vl-card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-valence-blue-soft p-2 text-valence-blue">
          <ClipboardCheck className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-valence-text">Closing checklist</h3>
            {items.length > 0 && (
              <span className="text-xs text-valence-muted">{done} / {items.length} done</span>
            )}
          </div>
          <p className="text-xs text-valence-muted mt-0.5">
            Stage-aware to-dos for <span className="font-semibold text-valence-text">{deal.stage || 'this stage'}</span>. Items reset each time the stage changes.
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-valence-border bg-valence-surface/30 py-6 text-center text-xs text-valence-muted">
          No checklist for this stage yet. Move the deal to Mandate / Marketing / Diligence / Negotiation / Closing to populate.
        </div>
      ) : (
        <div className="space-y-1">
          {items.map(item => {
            const isDone = !!checked[item]
            return (
              <button
                key={item}
                onClick={() => setChecked(prev => ({ ...prev, [item]: !prev[item] }))}
                className="w-full flex items-start gap-2.5 text-left rounded-lg px-3 py-2 hover:bg-valence-surface/60 transition"
              >
                {isDone
                  ? <CheckSquare className="h-4 w-4 text-valence-success shrink-0 mt-0.5" />
                  : <Square className="h-4 w-4 text-valence-subtle shrink-0 mt-0.5" />}
                <span className={`text-sm leading-snug ${isDone ? 'text-valence-muted line-through' : 'text-valence-text'}`}>
                  {item}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {items.length > 0 && done === items.length && (
        <div className="rounded-lg bg-valence-success/10 border border-valence-success/30 px-3 py-2.5 text-xs text-valence-success">
          All items checked. Ready to move to the next stage.
        </div>
      )}
    </div>
  )
}
