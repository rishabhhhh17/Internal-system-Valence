import { format, parseISO } from 'date-fns'
import { Check, Minus, FileCheck2, Send } from 'lucide-react'
import {
  docsForMode, docState, nextDocStatus, docCompletion
} from '../lib/diligenceDocs.js'
import { openGmailCompose } from '../lib/google.js'

// Document tracker, matrix view. One row per company / LP, one column per
// document — so the fund can read across a single row to see who's missing
// what, instead of scrolling a long per-document list. Each cell is a status
// toggle (click cycles Pending → Received → N/A); hover for the doc name + date.
//
// `deals`   — the active deals loaded by the page
// `mode`    — 'company' (Founders docs) | 'lp' (LP docs)
// `onCycle` — (dealId, docKey, nextStatus) => void; persists the change
export default function DocumentTracker({ deals = [], mode = 'company', onCycle }) {
  const docs = docsForMode(mode)
  const isLp = mode === 'lp'
  const nameHeader = isLp ? 'LP' : 'Company'

  if (!deals.length) return null

  return (
    <section className="vl-card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-valence-border px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-valence-blue-soft text-valence-blue ring-1 ring-valence-blue/20">
            <FileCheck2 className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-valence-text">Document tracker</h2>
            <p className="text-[11px] text-valence-muted">
              {isLp
                ? 'What has been shared with each LP — read across a row.'
                : 'Which diligence documents each company has shared — read across a row.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-valence-subtle">
          <span className="inline-flex items-center gap-1.5"><span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-valence-success/15 text-valence-success"><Check className="h-2.5 w-2.5" /></span> Received</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-valence-danger" /> Pending</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-valence-border" /> N/A</span>
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-valence-border text-[10px] font-semibold uppercase tracking-[0.1em] text-valence-subtle">
              <th className="sticky left-0 z-10 bg-valence-elevated px-5 py-3 text-left font-semibold">{nameHeader}</th>
              {docs.map(d => (
                <th key={d.key} title={d.label} className="px-2 py-3 text-center font-semibold whitespace-nowrap">{d.short}</th>
              ))}
              <th className="px-4 py-3 text-right font-semibold whitespace-nowrap">Complete</th>
              <th className="px-4 py-3" aria-label="Request" />
            </tr>
          </thead>
          <tbody>
            {deals.map(deal => {
              const { received, applicable, complete } = docCompletion(deal, mode)
              return (
                <tr key={deal.id} className="border-t border-valence-border/60 hover:bg-valence-surface/40">
                  <td className="sticky left-0 z-10 bg-valence-elevated px-5 py-3 font-semibold text-valence-text whitespace-nowrap">
                    {deal.client_name}
                  </td>
                  {docs.map(doc => {
                    const { status, date } = docState(deal, doc.key)
                    const tip = `${doc.label}: ${status === 'received' ? `Received${date ? ' · ' + format(parseISO(String(date).slice(0, 10)), 'd MMM yyyy') : ''}` : status === 'na' ? 'N/A' : 'Pending'}`
                    return (
                      <td key={doc.key} className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => onCycle?.(deal.id, doc.key, nextDocStatus(status))}
                          title={`${tip} — click to change`}
                          aria-label={tip}
                          className="grid h-7 w-7 mx-auto place-items-center rounded-full transition hover:ring-2 hover:ring-valence-blue/30"
                        >
                          <StatusMark status={status} />
                        </button>
                      </td>
                    )
                  })}
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                      complete
                        ? 'bg-valence-success/10 text-valence-success'
                        : 'bg-valence-danger/10 text-valence-danger'
                    }`}>
                      {complete && <Check className="h-3 w-3" />}
                      {received}/{applicable}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {applicable - received > 0 && (
                      <button
                        type="button"
                        onClick={() => requestDocs(deal, docs)}
                        title="Email the founder the outstanding documents"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-valence-blue hover:text-valence-blue-hover"
                      >
                        <Send className="h-3 w-3" /> Request
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// One-click "request outstanding docs": drafts a Gmail message listing exactly
// the pending documents for this deal. Opens a compose window — the user
// reviews and sends (we never auto-send).
function requestDocs(deal, docs) {
  const outstanding = docs.filter(d => docState(deal, d.key).status === 'pending')
  if (!outstanding.length) return
  const lines = outstanding.map(d => `• ${d.label}`).join('\n')
  const subject = `Outstanding documents — ${deal.client_name}`
  const body = `Hi,\n\nThanks for the time so far. To keep things moving on our side, could you share the following outstanding items for the data room when you get a chance?\n\n${lines}\n\nHappy to hop on a quick call if that's easier.\n\nBest regards,`
  openGmailCompose({ subject, body })
}

// The per-cell status glyph: green check = received, red dot = pending
// (outstanding), grey dash = not applicable.
function StatusMark({ status }) {
  if (status === 'received') {
    return (
      <span className="grid h-5 w-5 place-items-center rounded-full bg-valence-success/15 text-valence-success">
        <Check className="h-3.5 w-3.5" />
      </span>
    )
  }
  if (status === 'na') {
    return <Minus className="h-3.5 w-3.5 text-valence-subtle" />
  }
  // pending / outstanding
  return <span className="h-2.5 w-2.5 rounded-full bg-valence-danger" />
}
