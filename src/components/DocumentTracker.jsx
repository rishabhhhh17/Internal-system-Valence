import { format, parseISO } from 'date-fns'
import { FileCheck2 } from 'lucide-react'
import {
  docsForMode, docState, docStatusMeta, nextDocStatus, docCompletion
} from '../lib/diligenceDocs.js'

// Document tracker for the Active Deals page. One row per (deal × document):
// the fund can see at a glance which documents each company / LP has shared and
// which are still outstanding. Click a status pill to cycle
// Received → Pending → N/A. Marking a doc Received stamps today's date.
//
// `deals`   — the active deals already loaded by the page (respects its filters)
// `mode`    — pipeline mode ('company' → Founders docs, 'lp' → LP docs)
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
                ? 'What has been shared with each LP — and what still needs to go out.'
                : 'Which diligence documents each company has shared for evaluation.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-valence-subtle">
          <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-valence-success" /> Received</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-valence-danger" /> Pending</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-valence-subtle" /> N/A</span>
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-valence-border text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-valence-subtle">
              <th className="px-5 py-2.5 font-semibold">{nameHeader}</th>
              <th className="px-3 py-2.5 font-semibold">Document</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-5 py-2.5 font-semibold">Date received</th>
            </tr>
          </thead>
          <tbody>
            {deals.map(deal => {
              const { received, applicable } = docCompletion(deal, mode)
              return docs.map((doc, di) => {
                const { status, date } = docState(deal, doc.key)
                const meta = docStatusMeta(status)
                return (
                  <tr key={`${deal.id}-${doc.key}`} className={`border-t border-valence-border/60 ${di === 0 ? 'border-t-valence-border' : ''}`}>
                    {di === 0 && (
                      <td rowSpan={docs.length} className="px-5 py-3 align-top border-r border-valence-border/60 bg-valence-surface/40">
                        <p className="font-semibold text-valence-text">{deal.client_name}</p>
                        <p className="mt-0.5 text-[11px] tabular-nums text-valence-muted">{received}/{applicable} received</p>
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-valence-text">{doc.label}</td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => onCycle?.(deal.id, doc.key, nextDocStatus(status))}
                        title="Click to change status"
                        className="inline-flex items-center gap-1.5 rounded-full border border-valence-border bg-valence-elevated px-2.5 py-1 text-[11px] font-semibold transition hover:border-valence-ink/30"
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                        <span className={meta.text}>{meta.label}</span>
                      </button>
                    </td>
                    <td className="px-5 py-2.5 tabular-nums text-valence-muted">
                      {status === 'received' && date ? format(parseISO(String(date).slice(0, 10)), 'd MMM yyyy') : '—'}
                    </td>
                  </tr>
                )
              })
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
