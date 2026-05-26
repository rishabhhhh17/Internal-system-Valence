// IB tool — Fee Tracker.
//
// Reads the existing deal.fee_retainer_usd + deal.fee_success_pct
// columns and computes a forecast: retainer + (success% × ticket size).
// Inline-editable so partners can adjust mid-mandate.
//
// Pure UI over existing columns — no schema migration needed.

import { useState, useMemo, useEffect } from 'react'
import { Coins, Save, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useToast } from './Toast.jsx'
import { humanError } from '../lib/userError.js'
import MetricCard from './ui/MetricCard.jsx'

function fmtUSD(n) {
  if (n == null || isNaN(n)) return '—'
  if (n >= 1_000_000) return `$${(n/1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n/1_000).toFixed(0)}k`
  return `$${Math.round(n).toLocaleString()}`
}

export default function FeeTrackerPanel({ deal }) {
  const toast = useToast()
  const [retainer, setRetainer]   = useState(deal.fee_retainer_usd ?? '')
  const [successPct, setSuccessPct] = useState(deal.fee_success_pct ?? '')
  const [saving, setSaving]       = useState(false)

  useEffect(() => {
    setRetainer(deal.fee_retainer_usd ?? '')
    setSuccessPct(deal.fee_success_pct ?? '')
  }, [deal.id])

  // Ticket — for fundraise/M&A use the deal's primary size signal.
  const ticketUsdM = deal.ticket_size_usd_m
    ?? deal.target_raise_usd_m
    ?? deal.target_valuation_usd_m
    ?? deal.target_exit_usd_m
    ?? null

  const forecast = useMemo(() => {
    const r  = Number(retainer) || 0
    const sp = Number(successPct) || 0
    const successFee = ticketUsdM != null ? (Number(ticketUsdM) * 1_000_000 * sp / 100) : 0
    return { retainer: r, successFee, total: r + successFee }
  }, [retainer, successPct, ticketUsdM])

  async function save() {
    setSaving(true)
    try {
      const patch = {
        fee_retainer_usd: retainer === '' ? null : Number(retainer),
        fee_success_pct:  successPct === '' ? null : Number(successPct)
      }
      const { error } = await supabase.from('deals').update(patch).eq('id', deal.id)
      if (error) throw error
      toast.success('Fees updated.')
    } catch (e) {
      toast.error(humanError(e, 'Could not save fees.'))
    } finally {
      setSaving(false)
    }
  }

  const dirty =
    String(retainer)   !== String(deal.fee_retainer_usd ?? '') ||
    String(successPct) !== String(deal.fee_success_pct ?? '')

  return (
    <div className="vl-card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-valence-blue-soft p-2 text-valence-blue">
          <Coins className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-valence-text">Fee tracker</h3>
          <p className="text-xs text-valence-muted mt-0.5">
            Retainer plus success fee on a ticket of <span className="font-semibold text-valence-text">
              {ticketUsdM != null ? `${ticketUsdM} USD M` : 'not yet set'}
            </span>.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="Retainer"    value={fmtUSD(forecast.retainer)}   tone="default" />
        <MetricCard label="Success fee" value={fmtUSD(forecast.successFee)} tone="blue" sub={`${successPct || 0}% of ticket`} />
        <MetricCard label="Total forecast" value={fmtUSD(forecast.total)} tone="success" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1.5">
          <span className="vl-label">Retainer (USD)</span>
          <input type="number" min="0" className="vl-input text-sm" placeholder="e.g. 50000"
                 value={retainer} onChange={e => setRetainer(e.target.value)} />
        </label>
        <label className="space-y-1.5">
          <span className="vl-label">Success fee (% of ticket)</span>
          <input type="number" min="0" max="20" step="0.1" className="vl-input text-sm" placeholder="e.g. 2.5"
                 value={successPct} onChange={e => setSuccessPct(e.target.value)} />
        </label>
      </div>

      {dirty && (
        <div className="flex justify-end">
          <button onClick={save} disabled={saving} className="vl-btn-primary-sm">
            {saving ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</> : <><Save className="h-3 w-3" /> Save</>}
          </button>
        </div>
      )}
    </div>
  )
}
