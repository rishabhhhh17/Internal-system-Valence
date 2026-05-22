import { useRef, useState } from 'react'
import { Upload, Loader2, FileText, RefreshCw, Save, TrendingUp } from 'lucide-react'
import { extractText, fileTypeFor } from '../lib/fileParse.js'
import { extractFinancials, formatMoney } from '../lib/financials.js'
import { isGeminiConfigured } from '../lib/gemini.js'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { logActivity } from '../lib/activity.js'
import { humanError } from '../lib/userError.js'
import { useToast } from './Toast.jsx'

export default function FinancialsCard({ deal, onUpdated }) {
  const toast = useToast()
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [label, setLabel] = useState('')
  const [financials, setFinancials] = useState(deal?.financials || null)

  async function handle(file) {
    if (!file) return
    if (!fileTypeFor(file)) return toast.error('Unsupported file type.')
    if (!isGeminiConfigured) return toast.error('Add VITE_GEMINI_API_KEY to extract financials.')
    setBusy(true); setLabel('Reading file…')
    try {
      const text = await extractText(file, { onProgress: (_, l) => setLabel(l || 'Reading…') })
      setLabel('Extracting financials…')
      const data = await extractFinancials(text)
      setFinancials(data)
      if (isSupabaseConfigured && deal?.id) {
        const { error } = await supabase.from('deals').update({ financials: data }).eq('id', deal.id)
        if (error) throw error
        await logActivity({ dealId: deal.id, kind: 'file_upload', body: `Financials extracted from ${file.name}` })
      }
      toast.success('Financials extracted and saved.')
      onUpdated?.(data)
    } catch (e) {
      toast.error(humanError(e, 'Could not extract financials'))
    } finally {
      setBusy(false); setLabel('')
    }
  }

  async function clear() {
    if (!isSupabaseConfigured || !deal?.id) { setFinancials(null); return }
    try {
      await supabase.from('deals').update({ financials: null }).eq('id', deal.id)
      setFinancials(null)
      toast.success('Cleared.')
      onUpdated?.(null)
    } catch (e) {
      toast.error(humanError(e, 'Could not clear financials'))
    }
  }

  const unit = financials?.unit || 'millions'
  const ccy  = financials?.currency || 'USD'

  return (
    <div className="space-y-4">
      <div
        onClick={() => !busy && inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); if (!busy) handle(e.dataTransfer.files?.[0]) }}
        className={`rounded-xl border border-dashed px-5 py-5 cursor-pointer transition ${
          busy ? 'border-valence-blue/50 bg-valence-blue-soft/30' : 'border-valence-border bg-valence-surface hover:border-valence-blue/40'
        }`}
      >
        <input ref={inputRef} type="file" className="hidden" accept=".pdf,.docx,.txt" onChange={e => { const f = e.target.files?.[0]; e.target.value=''; handle(f) }} />
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-valence-blue-soft ring-1 ring-valence-blue/30 shrink-0">
            {busy ? <Loader2 className="h-4 w-4 text-valence-blue animate-spin" /> : <Upload className="h-4 w-4 text-valence-blue" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-valence-text">
              {busy ? label : (financials ? 'Replace financial snapshot' : 'Drop a 10-K, audit, or teaser to extract financials')}
            </p>
            <p className="mt-0.5 text-[11px] text-valence-muted">
              PDF, DOCX, or TXT. AI pulls revenue, EBITDA, margins, and growth from anywhere in the document.
            </p>
          </div>
        </div>
      </div>

      {financials && (
        <div className="vl-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="vl-eyebrow">Financial snapshot</p>
              {financials.source_summary && <p className="mt-1 text-[11px] text-valence-muted">{financials.source_summary}</p>}
            </div>
            <button onClick={clear} className="vl-btn-ghost text-valence-subtle hover:text-valence-danger">
              Clear
            </button>
          </div>

          {financials.ttm && (
            <div className="grid grid-cols-3 gap-px rounded-xl overflow-hidden border border-valence-border bg-valence-border">
              <TTMCell label="TTM Revenue"  value={formatMoney(financials.ttm.revenue, unit, ccy)} />
              <TTMCell label="TTM EBITDA"   value={formatMoney(financials.ttm.ebitda, unit, ccy)} />
              <TTMCell label="EBITDA margin" value={financials.ttm.ebitda_margin != null ? `${Number(financials.ttm.ebitda_margin).toFixed(1)}%` : '—'} />
            </div>
          )}

          {(financials.years || []).length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-valence-border text-left text-[10px] font-semibold uppercase tracking-wider text-valence-muted">
                    <th className="py-2 pr-4">Year</th>
                    <th className="py-2 pr-4 text-right">Revenue</th>
                    <th className="py-2 pr-4 text-right">EBITDA</th>
                    <th className="py-2 pr-4 text-right">EBITDA %</th>
                    <th className="py-2 pr-4 text-right">Gross %</th>
                    <th className="py-2 text-right">Net income</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-valence-border text-[13px]">
                  {financials.years.map(y => (
                    <tr key={y.year}>
                      <td className="py-2 pr-4 font-semibold text-valence-text">{y.year}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-valence-text">{formatMoney(y.revenue, unit, ccy)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-valence-text">{formatMoney(y.ebitda, unit, ccy)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-valence-muted">{y.ebitda_margin != null ? `${Number(y.ebitda_margin).toFixed(1)}%` : '—'}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-valence-muted">{y.gross_margin != null ? `${Number(y.gross_margin).toFixed(1)}%` : '—'}</td>
                      <td className="py-2 text-right tabular-nums text-valence-text">{formatMoney(y.net_income, unit, ccy)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {financials.growth_cagr_3y != null && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-valence-success/30 bg-valence-success-soft px-3 py-1 text-[12px] font-semibold text-valence-success">
                <TrendingUp className="h-3.5 w-3.5" /> 3-yr CAGR {Number(financials.growth_cagr_3y).toFixed(1)}%
              </span>
            )}
            {financials.headcount != null && (
              <span className="vl-chip">{financials.headcount.toLocaleString()} FTE</span>
            )}
            <span className="vl-chip">{ccy}{unit !== 'actual' ? ` · ${unit}` : ''}</span>
          </div>

          {financials.notes && (
            <p className="mt-3 text-[11px] leading-relaxed text-valence-muted italic">{financials.notes}</p>
          )}
        </div>
      )}
    </div>
  )
}

function TTMCell({ label, value }) {
  return (
    <div className="bg-valence-elevated p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-valence-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-valence-text">{value}</p>
    </div>
  )
}
