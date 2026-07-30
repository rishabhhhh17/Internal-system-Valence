import { useEffect, useMemo, useState } from 'react'
import { Sparkles, Plus, Check, Building2 } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { matchFundsForDeal, warmthTone, fundTypeLabel, DEMO_FUNDS, screenerModeForDeal, audienceLabelFor } from '../lib/funds.js'
import { humanError } from '../lib/userError.js'
import { useToast } from './Toast.jsx'

export default function FundShortlist({ deal }) {
  const toast = useToast()
  const [funds, setFunds]       = useState([])
  const [pings, setPings]       = useState([])  // current shortlist for this deal
  const [showMatches, setShowMatches] = useState(false)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (!deal?.id) return
    ;(async () => {
      setLoading(true)
      if (!isSupabaseConfigured) {
        setFunds(DEMO_FUNDS); setPings([]); setLoading(false); return
      }
      const [f, p] = await Promise.all([
        supabase.from('funds').select('*').order('name'),
        supabase.from('deal_fund_pings').select('*, funds(name)').eq('deal_id', deal.id).order('pinged_at', { ascending: false })
      ])
      setFunds(f.data || [])
      setPings(p.data || [])
      setLoading(false)
    })()
  }, [deal?.id])

  const screenerMode = useMemo(() => screenerModeForDeal(deal), [deal])
  const audience     = useMemo(() => audienceLabelFor(screenerMode), [screenerMode])
  const matches = useMemo(() => matchFundsForDeal(funds, deal, { limit: 10, mode: screenerMode }), [funds, deal, screenerMode])
  const pingedFundIds = useMemo(() => new Set(pings.map(p => p.fund_id)), [pings])

  async function shortlist(fund) {
    if (!isSupabaseConfigured) {
      setPings(prev => [{ id: `local-${Date.now()}`, fund_id: fund.id, status: 'shortlisted', pinged_at: new Date().toISOString(), funds: { name: fund.name } }, ...prev])
      toast.success(`${fund.name} added to shortlist`)
      return
    }
    const { data, error } = await supabase.from('deal_fund_pings').insert({ deal_id: deal.id, fund_id: fund.id, status: 'shortlisted' }).select('*, funds(name)').single()
    if (error) return toast.error(humanError(error, 'Could not add to shortlist'))
    setPings(prev => [data, ...prev])
    toast.success(`${fund.name} added to shortlist`)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="vl-eyebrow-ink">Shortlisted {audience.plural}</p>
          <p className="text-[11px] text-valence-muted mt-0.5">{audience.plural[0].toUpperCase() + audience.plural.slice(1)} we've put in front of {deal?.client_name || 'this mandate'}.</p>
        </div>
        {screenerMode && (
          <button onClick={() => setShowMatches(v => !v)} className="vl-btn-primary text-xs">
            <Sparkles className="h-3.5 w-3.5" /> {showMatches ? 'Hide matches' : `Find matching ${audience.plural}`}
          </button>
        )}
      </div>

      {!screenerMode && (
        <div className="rounded-lg border border-valence-warning/30 bg-valence-warning/5 px-4 py-3 text-[12px] text-valence-warning">
          Fund-match isn't applicable for advisory-only mandates. Add a Transaction sub-type if this engagement later moves to fundraising or M&A.
        </div>
      )}

      {pings.length === 0 ? (
        <div className="rounded-lg border border-dashed border-valence-border bg-valence-surface px-5 py-6 text-center text-sm text-valence-muted">
          No funds shortlisted yet. Click <span className="font-semibold text-valence-text">Find matching funds</span> for an AI-assisted starting point.
        </div>
      ) : (
        <ul className="divide-y divide-valence-border/60 rounded-xl border border-valence-border bg-valence-elevated">
          {pings.map(p => (
            <li key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <Building2 className="h-3.5 w-3.5 text-valence-subtle shrink-0" />
                <span className="truncate font-semibold text-valence-text">{p.funds?.name || 'Fund'}</span>
              </div>
              <span className="text-[11px] text-valence-muted capitalize">{p.status?.replace(/_/g, ' ')}</span>
            </li>
          ))}
        </ul>
      )}

      {showMatches && (
        <div className="rounded-xl border border-valence-blue/30 bg-valence-blue-soft/30 p-4">
          <p className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Sparkles className="h-3 w-3 text-valence-blue" /> Top matches</p>
          {loading ? (
            <p className="mt-3 text-sm text-valence-muted">Scoring funds against this mandate…</p>
          ) : matches.length === 0 ? (
            <p className="mt-3 text-sm text-valence-muted">No strong {audience.plural} matched yet — add sector + sub-type detail on the mandate to improve scoring.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {matches.map(m => {
                const already = pingedFundIds.has(m.fund.id)
                return (
                  <li key={m.fund.id} className="flex items-start gap-3 rounded-lg border border-valence-border bg-valence-elevated px-3 py-2.5">
                    <div className="grid h-9 w-9 place-items-center rounded-lg bg-valence-surface border border-valence-border shrink-0 text-[11px] font-bold tabular-nums text-valence-blue">{m.score}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <p className="text-sm font-semibold text-valence-text">{m.fund.name}</p>
                        <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-semibold capitalize ${warmthTone(m.fund.warmth)}`}>{m.fund.warmth}</span>
                        <span className="text-[10px] text-valence-muted">{fundTypeLabel(m.fund.fund_type)} · {[m.fund.hq_city, m.fund.hq_country].filter(Boolean).join(', ')}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-valence-muted leading-relaxed">{m.reasons.slice(0, 3).join(' · ')}</p>
                    </div>
                    <button
                      disabled={already}
                      onClick={() => shortlist(m.fund)}
                      className={`vl-btn-ghost text-[11px] shrink-0 ${already ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {already ? <><Check className="h-3 w-3" /> Added</> : <><Plus className="h-3 w-3" /> Add to shortlist</>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
