import { useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles, Upload, Plus, ArrowRight, Check, Lock, Mic, Loader2 } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { extractText } from '../lib/fileParse.js'
import { isGeminiConfigured } from '../lib/gemini.js'
import { screenForFundsAI, screenMandateFit } from '../lib/screener.js'
import { pullLatestMeeting, isFathomConfigured } from '../lib/fathom.js'
import { DEMO_FUNDS, screenerModeForDeal, audienceLabelFor } from '../lib/funds.js'
import ConfigBanner from '../components/ConfigBanner.jsx'
import EmptyState from '../components/EmptyState.jsx'
import MandateFitVerdict from '../components/MandateFitVerdict.jsx'
import { useToast } from '../components/Toast.jsx'

const MODES = [
  { id: 'fund_match',   label: 'Fund-Match',   blurb: 'A client is raising / selling. Rank the universe.' },
  { id: 'mandate_fit',  label: 'Mandate-Fit',  blurb: 'Inbound teaser. Should we pursue?' }
]

const TOP_TYPES = [
  { id: 'transaction', label: 'Transaction' },
  { id: 'advisory',    label: 'Advisory' }
]
const SUBTYPES = [
  { id: 'fundraise', label: 'Fundraise' },
  { id: 'm_and_a',   label: 'M&A' },
  { id: 'exit',      label: 'Exit' }
]
const MA_SIDES = [
  { id: 'sell',      label: 'Sell-side' },
  { id: 'buy',       label: 'Buy-side' },
  { id: 'undecided', label: 'Side TBD' }
]

const initialManual = {
  client_name: '', sector: '', notes: '',
  deal_types: ['transaction'], deal_subtype: 'fundraise',
  // fundraise
  target_raise_usd_m: '', target_valuation_usd_m: '', company_stage: '',
  // m_and_a
  ma_side: 'sell', acquisition_brief: '',
  // exit
  target_exit_usd_m: '', target_exit_valuation_usd_m: '', exit_investor_name: ''
}

export default function Screener() {
  const toast = useToast()
  const [mode, setMode] = useState('fund_match')

  // Shared inputs
  const [pdfText, setPdfText]   = useState('')
  const [pdfName, setPdfName]   = useState('')
  const [parsing, setParsing]   = useState(false)
  const inputRef = useRef(null)

  // Fund-Match inputs
  const [deals, setDeals]       = useState([])
  const [funds, setFunds]       = useState([])
  const [selectedDealId, setSelectedDealId] = useState('')
  const [manual, setManual] = useState(initialManual)

  // Output
  const [running, setRunning] = useState(false)
  const [output, setOutput]   = useState(null)
  const [pingedFundIds, setPingedFundIds] = useState(new Set())

  // Fathom pull state — local to the Screener input section.
  const [pullingFathom, setPullingFathom] = useState(false)

  async function pullFromFathom() {
    if (pullingFathom) return
    setPullingFathom(true)
    try {
      const m = await pullLatestMeeting()
      // Compose a teaser-shaped paste from the meeting summary + transcript
      // so the Mandate-Fit screener has the same substance it'd get from a
      // pasted email teaser. Summary first, then transcript — keeps the
      // most useful signal at the top of the input.
      const header = `Pulled from Fathom · ${m.title || 'Meeting'}\n`
      const body = [
        m.summary    ? `SUMMARY\n${m.summary}` : '',
        m.transcript ? `TRANSCRIPT\n${m.transcript}` : '',
        Array.isArray(m.actionItems) && m.actionItems.length > 0
          ? `ACTION ITEMS\n${m.actionItems.map((a, i) => `${i + 1}. ${typeof a === 'string' ? a : (a.text || JSON.stringify(a))}`).join('\n')}`
          : ''
      ].filter(Boolean).join('\n\n')
      setManual(prev => ({ ...prev, notes: `${header}\n${body}` }))
      toast.success(`Pulled "${m.title || 'meeting'}" — ready to screen`)
    } catch (err) {
      toast.error(err?.message || 'Fathom pull failed')
    } finally {
      setPullingFathom(false)
    }
  }

  useEffect(() => {
    ;(async () => {
      if (!isSupabaseConfigured) { setFunds(DEMO_FUNDS); setDeals(DEMO_DEALS); return }
      const [d, f] = await Promise.all([
        supabase.from('deals').select('*').order('updated_at', { ascending: false }).limit(200),
        supabase.from('funds').select('*').order('name')
      ])
      setDeals(d.data || []); setFunds(f.data || [])
    })()
  }, [])

  const selectedDeal = useMemo(() => deals.find(d => d.id === selectedDealId) || null, [deals, selectedDealId])
  const composedDeal = useMemo(() => {
    if (selectedDeal) return selectedDeal
    return {
      client_name: manual.client_name || 'Untitled mandate',
      sector: manual.sector || null,
      deal_types: manual.deal_types,
      deal_subtype: manual.deal_types.includes('transaction') ? manual.deal_subtype : null,
      target_raise_usd_m: manual.target_raise_usd_m ? Number(manual.target_raise_usd_m) : null,
      target_valuation_usd_m: manual.target_valuation_usd_m ? Number(manual.target_valuation_usd_m) : null,
      company_stage: manual.company_stage || null,
      ma_side: manual.deal_subtype === 'm_and_a' ? manual.ma_side : null,
      acquisition_brief: manual.deal_subtype === 'm_and_a' ? (manual.acquisition_brief || null) : null,
      target_exit_usd_m: manual.target_exit_usd_m ? Number(manual.target_exit_usd_m) : null,
      target_exit_valuation_usd_m: manual.target_exit_valuation_usd_m ? Number(manual.target_exit_valuation_usd_m) : null,
      exit_investor_name: manual.exit_investor_name || null,
      notes: [manual.notes, pdfText].filter(Boolean).join('\n\n').slice(0, 4000) || null
    }
  }, [selectedDeal, manual, pdfText])

  const screenerMode = useMemo(() => screenerModeForDeal(composedDeal), [composedDeal])
  const audience     = useMemo(() => audienceLabelFor(screenerMode), [screenerMode])
  const isAdvisoryOnly = useMemo(() => {
    const types = composedDeal?.deal_types || []
    return types.includes('advisory') && !types.includes('transaction')
  }, [composedDeal])

  // Reset output when deal/mode/subtype changes so stale matches don't linger.
  useEffect(() => { setOutput(null) }, [selectedDealId, mode, manual.deal_types, manual.deal_subtype])

  function toggleType(id) {
    setManual(s => {
      const has = s.deal_types.includes(id)
      const next = has ? s.deal_types.filter(t => t !== id) : [...s.deal_types, id]
      return { ...s, deal_types: next.length ? next : s.deal_types }
    })
  }

  async function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setParsing(true); setPdfName(file.name)
    try {
      const { text } = await extractText(file)
      setPdfText(text || '')
    } catch (err) {
      toast.error(err?.message || 'Could not parse file')
      setPdfText('')
    } finally {
      setParsing(false)
    }
  }

  async function run() {
    setRunning(true); setOutput(null)
    try {
      let result
      if (mode === 'fund_match') {
        if (isAdvisoryOnly) {
          toast.error('Fund-Match is not applicable for advisory mandates.')
          return
        }
        result = await screenForFundsAI({ deal: composedDeal, funds, topN: 8 })
      } else {
        result = await screenMandateFit({ teaserText: [manual.notes, pdfText].filter(Boolean).join('\n\n') })
      }
      setOutput(result)
      if (isSupabaseConfigured) {
        await supabase.from('screener_runs').insert({
          mode,
          input_summary: composedDeal.client_name + ' · ' + (composedDeal.sector || '—'),
          pdf_filename:  pdfName || null,
          output:        result,
          deal_id:       selectedDealId || null
        })
      }
    } catch (err) {
      toast.error(err?.message || 'Screener run failed')
    } finally {
      setRunning(false)
    }
  }

  async function shortlistMatch(match) {
    if (!selectedDealId) {
      toast.error('Pick or convert to a deal before shortlisting')
      return
    }
    if (!match.fund_id) {
      toast.error('Fund could not be matched to a known fund row')
      return
    }
    if (!isSupabaseConfigured) {
      setPingedFundIds(prev => new Set(prev).add(match.fund_id))
      toast.success(`${match.fund_name} added to shortlist`)
      return
    }
    const { error } = await supabase.from('deal_fund_pings').insert({ deal_id: selectedDealId, fund_id: match.fund_id, status: 'shortlisted' })
    if (error) return toast.error(error.message)
    setPingedFundIds(prev => new Set(prev).add(match.fund_id))
    toast.success(`${match.fund_name} added to shortlist`)
  }

  function convertToOrigination() {
    const params = new URLSearchParams({
      new: '1',
      client_name: composedDeal.client_name,
      sector: composedDeal.sector || '',
      stage: 'Origination',
      notes: composedDeal.notes || ''
    })
    window.location.href = `/deals?${params.toString()}`
  }

  const runLabel = mode === 'mandate_fit'
    ? 'Get verdict'
    : isAdvisoryOnly
      ? 'Not applicable'
      : `Rank ${audience.plural}`

  return (
    <div className="space-y-6">
      <ConfigBanner />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="vl-eyebrow-ink">AI Quick Screener</p>
          <h1 className="mt-2 font-display text-feature font-bold text-valence-text">
            One paste, one verdict.
          </h1>
        </div>
        <div className="inline-flex items-center rounded-full border border-valence-border bg-white p-0.5">
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => { setMode(m.id); setOutput(null) }}
              className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${mode === m.id ? 'bg-valence-ink text-white' : 'text-valence-muted hover:text-valence-text'}`}
              title={m.blurb}
            >{m.label}</button>
          ))}
        </div>
      </div>

      {!isGeminiConfigured && (
        <div className="rounded-lg border border-valence-warning/30 bg-valence-warning/5 px-4 py-2.5 text-[12px] text-valence-warning">
          The assistant is offline — Fund-Match falls back to the heuristic ranking; Mandate-Fit will return a placeholder.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* Inputs */}
        <section className="vl-card p-5 space-y-4">
          <p className="vl-eyebrow-ink">Inputs</p>

          {mode === 'fund_match' && (
            <div>
              <label className="vl-label">Use existing deal</label>
              <select className="vl-input mt-1.5" value={selectedDealId} onChange={e => setSelectedDealId(e.target.value)}>
                <option value="">— Compose manually —</option>
                {deals.map(d => <option key={d.id} value={d.id}>{d.client_name} · {d.stage} · {d.sector || 'sector?'}</option>)}
              </select>
            </div>
          )}

          {/* Manual compose — only for Fund-Match. Mandate-Fit takes free-form teaser. */}
          {mode === 'fund_match' && !selectedDeal && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Client name">
                  <input className="vl-input" value={manual.client_name} onChange={e => setManual({ ...manual, client_name: e.target.value })} placeholder="e.g. Saffron Retail" />
                </Field>
                <Field label="Sector">
                  <input className="vl-input" value={manual.sector} onChange={e => setManual({ ...manual, sector: e.target.value })} placeholder="Consumer" />
                </Field>
              </div>

              <div>
                <label className="vl-label">Mandate type</label>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  {TOP_TYPES.map(t => {
                    const active = manual.deal_types.includes(t.id)
                    return (
                      <button
                        type="button"
                        key={t.id}
                        onClick={() => toggleType(t.id)}
                        aria-pressed={active}
                        className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                          active ? 'border-valence-blue/40 bg-valence-blue-soft text-valence-text' : 'border-valence-border bg-white text-valence-muted hover:text-valence-text'
                        }`}
                      >{t.label}</button>
                    )
                  })}
                </div>
              </div>

              {manual.deal_types.includes('transaction') && (
                <div className="space-y-3 rounded-xl border border-valence-blue/20 bg-valence-blue-soft/20 p-3">
                  <div>
                    <label className="vl-label">Sub-type</label>
                    <div className="mt-1.5 grid grid-cols-3 gap-2">
                      {SUBTYPES.map(s => {
                        const active = manual.deal_subtype === s.id
                        return (
                          <button
                            type="button"
                            key={s.id}
                            onClick={() => setManual(m => ({ ...m, deal_subtype: s.id }))}
                            className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition ${
                              active ? 'border-valence-blue/40 bg-white text-valence-text shadow-sm' : 'border-valence-border bg-white/60 text-valence-muted hover:text-valence-text'
                            }`}
                          >{s.label}</button>
                        )
                      })}
                    </div>
                  </div>

                  {manual.deal_subtype === 'fundraise' && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Target raise (USD M)"><input type="number" className="vl-input" value={manual.target_raise_usd_m} onChange={e => setManual({ ...manual, target_raise_usd_m: e.target.value })} placeholder="80" /></Field>
                      <Field label="Target valuation (USD M)"><input type="number" className="vl-input" value={manual.target_valuation_usd_m} onChange={e => setManual({ ...manual, target_valuation_usd_m: e.target.value })} placeholder="250" /></Field>
                      <div className="sm:col-span-2">
                        <Field label="Company stage"><input className="vl-input" value={manual.company_stage} onChange={e => setManual({ ...manual, company_stage: e.target.value })} placeholder="Series B · Growth · …" /></Field>
                      </div>
                    </div>
                  )}

                  {manual.deal_subtype === 'm_and_a' && (
                    <div className="space-y-3">
                      <div>
                        <label className="vl-label">M&A side</label>
                        <div className="mt-1.5 grid grid-cols-3 gap-2">
                          {MA_SIDES.map(s => {
                            const active = manual.ma_side === s.id
                            return (
                              <button
                                type="button"
                                key={s.id}
                                onClick={() => setManual(m => ({ ...m, ma_side: s.id }))}
                                className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition ${
                                  active ? 'border-valence-blue/40 bg-white text-valence-text shadow-sm' : 'border-valence-border bg-white/60 text-valence-muted hover:text-valence-text'
                                }`}
                              >{s.label}</button>
                            )
                          })}
                        </div>
                      </div>
                      <Field label="Acquisition brief">
                        <textarea
                          className="vl-input min-h-[100px] leading-relaxed"
                          value={manual.acquisition_brief}
                          onChange={e => setManual({ ...manual, acquisition_brief: e.target.value })}
                          placeholder='e.g. "$100M topline IT services co, $5–10M EBITDA, BFSI clients, NOT Web3."'
                        />
                      </Field>
                    </div>
                  )}

                  {manual.deal_subtype === 'exit' && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Target exit (USD M)"><input type="number" className="vl-input" value={manual.target_exit_usd_m} onChange={e => setManual({ ...manual, target_exit_usd_m: e.target.value })} placeholder="320" /></Field>
                      <Field label="Target exit valuation (USD M)"><input type="number" className="vl-input" value={manual.target_exit_valuation_usd_m} onChange={e => setManual({ ...manual, target_exit_valuation_usd_m: e.target.value })} placeholder="optional" /></Field>
                      <div className="sm:col-span-2">
                        <Field label="Investor being exited"><input className="vl-input" value={manual.exit_investor_name} onChange={e => setManual({ ...manual, exit_investor_name: e.target.value })} placeholder="e.g. Brookfield" /></Field>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <Field label={mode === 'fund_match' ? 'Notes (optional)' : 'Paste the teaser text'}>
            <textarea
              className="vl-input min-h-[140px] leading-relaxed"
              value={manual.notes}
              onChange={e => setManual({ ...manual, notes: e.target.value })}
              placeholder={mode === 'fund_match' ? 'Anything the model should weigh — exit timeline, asset quality, founders, prior bidders…' : 'Paste the inbound teaser here, or upload a PDF below.'}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-3">
            <input ref={inputRef} type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={onFile} />
            <button onClick={() => inputRef.current?.click()} disabled={parsing} className="vl-btn-secondary text-xs">
              <Upload className="h-3.5 w-3.5" /> {parsing ? 'Parsing…' : 'Upload PDF / DOCX'}
            </button>
            {/* Fathom pull — Mandate-Fit only. Drops the latest meeting
                transcript + summary into the teaser input so a partner
                can screen a call within ~30 seconds of hanging up. */}
            {mode === 'mandate_fit' && (
              <button
                onClick={pullFromFathom}
                disabled={pullingFathom}
                className="vl-btn-secondary text-xs"
                title="Pull latest Fathom meeting as the teaser"
              >
                {pullingFathom ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}
                {pullingFathom ? 'Pulling…' : 'Pull from Fathom'}
              </button>
            )}
            {pdfName && <span className="text-[11px] text-valence-muted truncate">{pdfName} · {Math.round(pdfText.length / 100) / 10}k chars</span>}
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={run}
              disabled={running || (mode === 'fund_match' && isAdvisoryOnly)}
              className="vl-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles className="h-4 w-4" /> {running ? 'Screening…' : runLabel}
            </button>
          </div>
        </section>

        {/* Output */}
        <section className="vl-card p-5 space-y-3">
          <p className="vl-eyebrow-ink">Output</p>
          {mode === 'fund_match' && isAdvisoryOnly ? (
            <AdvisoryNotApplicable />
          ) : !output ? (
            <EmptyState icon={Sparkles} title="No screener run yet" description="Fill the inputs and click the button to run the screener." />
          ) : mode === 'fund_match' ? (
            <FundMatchOutput output={output} funds={funds} pingedFundIds={pingedFundIds} onShortlist={shortlistMatch} canShortlist={Boolean(selectedDealId)} audience={audience} />
          ) : (
            <MandateFitOutput output={output} onConvert={convertToOrigination} />
          )}
        </section>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="vl-label">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

// Warmth → diligence-card color tokens. Hot = hot lead, walk in expecting
// a meeting; cold = relationship building still.
const WARMTH_TONE = {
  hot:     { pill: 'border-rose-300/50 bg-rose-50 text-rose-700',           ring: 'ring-rose-200/50',     bar: 'bg-rose-500',     track: 'bg-rose-100' },
  warm:    { pill: 'border-amber-300/50 bg-amber-50 text-amber-800',        ring: 'ring-amber-200/50',    bar: 'bg-amber-500',    track: 'bg-amber-100' },
  cold:    { pill: 'border-sky-300/50 bg-sky-50 text-sky-700',              ring: 'ring-sky-200/50',      bar: 'bg-sky-500',      track: 'bg-sky-100' },
  dormant: { pill: 'border-valence-border bg-valence-surface text-valence-muted', ring: 'ring-valence-border', bar: 'bg-valence-muted', track: 'bg-valence-surface' }
}

function FundMatchOutput({ output, funds, onShortlist, pingedFundIds, canShortlist, audience }) {
  const matches = output?.matches || []
  const heading = audience?.plural ? `Top ${audience.plural}` : 'Top matches'
  // Index funds by id and by normalised name so we can enrich AI matches
  // (which only carry fund_name + score) with warmth, persona notes, HQ
  // city, sectors, and check-size band for the card display.
  const byId   = new Map((funds || []).map(f => [f.id, f]))
  const byName = new Map((funds || []).map(f => [(f.name || '').toLowerCase().trim(), f]))
  const lookup = (m) => byId.get(m.fund_id) || byName.get((m.fund_name || '').toLowerCase().trim())

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-valence-muted">{heading}</p>
        {matches.length > 0 && <span className="text-[10px] tabular-nums text-valence-subtle">{matches.length} ranked</span>}
      </div>
      {output?.reasoning && (
        <p className="rounded-lg border border-valence-border bg-valence-surface/60 px-3 py-2 text-[12px] italic text-valence-muted leading-relaxed">
          {output.reasoning}
        </p>
      )}
      {matches.length === 0 ? (
        <p className="text-sm text-valence-muted">No matches returned.</p>
      ) : (
        <ul className="space-y-2.5">
          {matches.map((m, i) => {
            const fund    = lookup(m) || {}
            const already = m.fund_id && pingedFundIds.has(m.fund_id)
            const warmth  = (fund.warmth || 'dormant').toLowerCase()
            const tone    = WARMTH_TONE[warmth] || WARMTH_TONE.dormant
            const score   = Math.max(0, Math.min(100, Number(m.score) || 0))
            const sectors = (fund.sectors || []).slice(0, 3).join(' · ')
            const cheque  = (fund.check_size_min_usd_m || fund.check_size_max_usd_m)
              ? `$${fund.check_size_min_usd_m ?? '?'}–${fund.check_size_max_usd_m ?? '?'}M cheque`
              : null
            const persona = fund.persona_notes || ''
            const rank    = i + 1
            return (
              <li key={i} className={`vl-card p-3.5 ring-1 ${tone.ring}`}>
                <div className="flex items-start gap-3">
                  {/* Rank + score, stacked. The big number is the AI's score,
                      not the rank — partners read score first. */}
                  <div className="shrink-0 text-center w-14">
                    <div className="font-display text-[24px] font-semibold leading-none tabular-nums text-valence-text">{score}</div>
                    <div className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-valence-subtle">/ 100</div>
                    <div className={`mt-1.5 h-1 rounded-full overflow-hidden ${tone.track}`}>
                      <div className={`h-full ${tone.bar} transition-[width] duration-700 ease-out`} style={{ width: `${score}%` }} aria-hidden />
                    </div>
                    <div className="mt-1.5 text-[9px] uppercase tracking-[0.14em] text-valence-subtle">#{rank}</div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <p className="font-display text-[15px] font-semibold tracking-tight text-valence-text">{m.fund_name}</p>
                      {fund.fund_type && (
                        <span className="inline-flex items-center rounded-full border border-valence-border bg-valence-surface px-1.5 py-0 text-[10px] font-semibold text-valence-muted">
                          {fund.fund_type}
                        </span>
                      )}
                      {fund.warmth && (
                        <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-semibold uppercase tracking-[0.12em] ${tone.pill}`}>
                          {fund.warmth}
                        </span>
                      )}
                      {fund.hq_city && (
                        <span className="text-[10.5px] text-valence-muted">· {fund.hq_city}</span>
                      )}
                    </div>

                    {/* Persona one-liner — the firm's reason this fund is on
                        the radar. Pulled from the Fund record's persona_notes
                        (the "Sumant pays par" / "Pavninder tough on price"
                        line every IB partner writes). */}
                    {persona && (
                      <p className="mt-1.5 text-[12.5px] italic leading-relaxed text-valence-text/80">
                        “{persona}”
                      </p>
                    )}

                    {/* AI reasons as chips. Numbered so partners can
                        reference “point 2” in conversation. */}
                    {m.reasons?.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-1">
                        {m.reasons.slice(0, 5).map((r, j) => (
                          <li key={j} className="inline-flex items-center gap-1 rounded-md border border-valence-border bg-valence-surface px-1.5 py-0.5 text-[10.5px] text-valence-muted">
                            <span className="font-bold tabular-nums text-valence-blue">{j + 1}</span>
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Meta strip — sectors, cheque band. Quiet, partner can
                        scan without reading. */}
                    {(sectors || cheque) && (
                      <p className="mt-2 text-[10.5px] text-valence-subtle">
                        {sectors}{sectors && cheque ? ' · ' : ''}{cheque}
                      </p>
                    )}
                  </div>

                  {canShortlist ? (
                    <button
                      onClick={() => onShortlist(m)}
                      disabled={already}
                      className={`shrink-0 text-[11px] ${already ? 'vl-btn-ghost opacity-50 cursor-not-allowed' : 'vl-btn-primary'}`}
                    >
                      {already ? <><Check className="h-3 w-3" /> Added</> : <><Plus className="h-3 w-3" /> Shortlist</>}
                    </button>
                  ) : (
                    <span className="shrink-0 text-[10px] text-valence-subtle max-w-[80px] text-right">Pick a deal to shortlist</span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function MandateFitOutput({ output, onConvert }) {
  // Polished IB-diligence-style verdict block. The wrapper is intentionally
  // stripped down — MandateFitVerdict carries its own card chrome.
  return <MandateFitVerdict output={output} onConvert={onConvert} eyebrow="Quick Screener · Mandate-Fit" />
}

function AdvisoryNotApplicable() {
  return (
    <div className="rounded-xl border border-valence-warning/30 bg-valence-warning/5 p-5">
      <div className="flex items-start gap-3">
        <Lock className="h-4 w-4 mt-0.5 text-valence-warning shrink-0" />
        <div>
          <p className="text-sm font-semibold text-valence-text">Not applicable for advisory mandates</p>
          <p className="mt-1 text-[12px] leading-relaxed text-valence-muted">
            Advisory work — geography expansion, vertical entry, distribution — isn't fund-matchable. There's no investor universe to rank.
            Convert the engagement into a Transaction sub-type if it later moves to fundraising or M&A.
          </p>
        </div>
      </div>
    </div>
  )
}

const DEMO_DEALS = [
  {
    id: 'dl1', client_name: 'Saffron Retail', sector: 'Consumer',
    deal_types: ['transaction'], deal_subtype: 'm_and_a', ma_side: 'sell',
    acquisition_brief: null,
    notes: 'Family-owned premium consumer brand exploring partial sale.',
    stage: 'Pitching'
  },
  {
    id: 'dl2', client_name: 'Quantum Edge', sector: 'Fintech',
    deal_types: ['transaction'], deal_subtype: 'fundraise',
    target_raise_usd_m: 250, target_valuation_usd_m: 1200, company_stage: 'Pre-IPO',
    notes: 'Pre-IPO cap raise. Anchor book being built.',
    stage: 'Mandate'
  },
  {
    id: 'dl3', client_name: 'Solstice Solar', sector: 'Renewables',
    deal_types: ['transaction'], deal_subtype: 'fundraise',
    target_raise_usd_m: 90, target_valuation_usd_m: 320, company_stage: 'Series C',
    notes: 'Operating solar portfolio with PPAs in place.',
    stage: 'Mandate'
  }
]
