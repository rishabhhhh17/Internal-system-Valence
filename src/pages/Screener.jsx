import { useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles, Upload, Building2, FileText, Plus, ArrowRight, Check } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { extractText } from '../lib/fileParse.js'
import { isGeminiConfigured } from '../lib/gemini.js'
import { screenForFundsAI, screenMandateFit } from '../lib/screener.js'
import { DEMO_FUNDS, warmthTone, fundTypeLabel } from '../lib/funds.js'
import ConfigBanner from '../components/ConfigBanner.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { useToast } from '../components/Toast.jsx'

const MODES = [
  { id: 'fund_match',   label: 'Fund-Match',   blurb: 'A client is raising. Rank our funds.' },
  { id: 'mandate_fit',  label: 'Mandate-Fit',  blurb: 'Inbound teaser. Should we pursue?' }
]

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
  const [manual, setManual] = useState({ client_name: '', sector: '', side: 'Sell-side', stage: 'Marketing', ticket_size_usd_m: '', notes: '' })

  // Output
  const [running, setRunning] = useState(false)
  const [output, setOutput]   = useState(null)
  const [pingedFundIds, setPingedFundIds] = useState(new Set())

  useEffect(() => {
    ;(async () => {
      if (!isSupabaseConfigured) { setFunds(DEMO_FUNDS); setDeals(DEMO_DEALS); return }
      const [d, f] = await Promise.all([
        supabase.from('deals').select('id, client_name, sector, side, stage, ticket_size_usd_m, notes').order('updated_at', { ascending: false }).limit(200),
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
      side:   manual.side,
      stage:  manual.stage,
      ticket_size_usd_m: manual.ticket_size_usd_m ? Number(manual.ticket_size_usd_m) : null,
      notes:  [manual.notes, pdfText].filter(Boolean).join('\n\n').slice(0, 4000) || null
    }
  }, [selectedDeal, manual, pdfText])

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
        result = await screenForFundsAI({ deal: composedDeal, funds, topN: 8 })
      } else {
        result = await screenMandateFit({ teaserText: [manual.notes, pdfText].filter(Boolean).join('\n\n') })
      }
      setOutput(result)
      // Persist a row for the audit log when Supabase is wired up.
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
      side: composedDeal.side || 'Sell-side',
      notes: composedDeal.notes || ''
    })
    window.location.href = `/deals?${params.toString()}`
  }

  return (
    <div className="space-y-6">
      <ConfigBanner />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="vl-eyebrow-ink">AI Quick Screener</p>
          <h1 className="mt-2 font-display text-feature font-bold text-valence-text">
            One paste, one verdict.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-valence-muted">
            {mode === 'fund_match'
              ? 'Drop in deal info — Valence ranks our fund universe by sector, stage, and cheque-size fit. Reasoning included.'
              : 'Paste an inbound teaser — Valence delivers a 5-line verdict against our standing mandate criteria.'}
          </p>
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

          {!selectedDeal && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Client name"><input className="vl-input" value={manual.client_name} onChange={e => setManual({ ...manual, client_name: e.target.value })} placeholder="e.g. Saffron Retail" /></Field>
              <Field label="Sector"><input className="vl-input" value={manual.sector} onChange={e => setManual({ ...manual, sector: e.target.value })} placeholder="Consumer" /></Field>
              <Field label="Side">
                <select className="vl-input" value={manual.side} onChange={e => setManual({ ...manual, side: e.target.value })}>
                  <option>Sell-side</option><option>Buy-side</option><option>Advisory</option>
                </select>
              </Field>
              <Field label="Stage">
                <select className="vl-input" value={manual.stage} onChange={e => setManual({ ...manual, stage: e.target.value })}>
                  {['Origination','Pitch','Mandate','Preparation','Marketing','Diligence','Negotiation','Closing'].map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Ticket size (USD M)"><input type="number" className="vl-input" value={manual.ticket_size_usd_m} onChange={e => setManual({ ...manual, ticket_size_usd_m: e.target.value })} placeholder="180" /></Field>
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

          <div className="flex items-center gap-3">
            <input ref={inputRef} type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={onFile} />
            <button onClick={() => inputRef.current?.click()} disabled={parsing} className="vl-btn-secondary text-xs">
              <Upload className="h-3.5 w-3.5" /> {parsing ? 'Parsing…' : 'Upload PDF / DOCX'}
            </button>
            {pdfName && <span className="text-[11px] text-valence-muted truncate">{pdfName} · {Math.round(pdfText.length / 100) / 10}k chars</span>}
          </div>

          <div className="pt-2 flex justify-end">
            <button onClick={run} disabled={running} className="vl-btn-primary">
              <Sparkles className="h-4 w-4" /> {running ? 'Screening…' : (mode === 'fund_match' ? 'Rank funds' : 'Get verdict')}
            </button>
          </div>
        </section>

        {/* Output */}
        <section className="vl-card p-5 space-y-3">
          <p className="vl-eyebrow-ink">Output</p>
          {!output ? (
            <EmptyState icon={Sparkles} title="No screener run yet" description="Fill the inputs and click the button to run the screener." />
          ) : mode === 'fund_match' ? (
            <FundMatchOutput output={output} pingedFundIds={pingedFundIds} onShortlist={shortlistMatch} canShortlist={Boolean(selectedDealId)} />
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

function FundMatchOutput({ output, onShortlist, pingedFundIds, canShortlist }) {
  const matches = output?.matches || []
  return (
    <div className="space-y-3">
      {output?.reasoning && <p className="text-xs italic text-valence-muted leading-relaxed">{output.reasoning}</p>}
      {matches.length === 0 ? (
        <p className="text-sm text-valence-muted">No matches returned.</p>
      ) : (
        <ul className="space-y-2">
          {matches.map((m, i) => {
            const already = m.fund_id && pingedFundIds.has(m.fund_id)
            return (
              <li key={i} className="flex items-start gap-3 rounded-lg border border-valence-border bg-white px-3 py-2.5">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-valence-blue-soft text-[11px] font-bold tabular-nums text-valence-blue shrink-0">{m.score ?? '?'}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-valence-text">{m.fund_name}</p>
                  {m.reasons?.length > 0 && <p className="mt-1 text-[11px] text-valence-muted leading-relaxed">{m.reasons.slice(0, 4).join(' · ')}</p>}
                </div>
                {canShortlist ? (
                  <button onClick={() => onShortlist(m)} disabled={already} className={`vl-btn-ghost text-[11px] shrink-0 ${already ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    {already ? <><Check className="h-3 w-3" /> Added</> : <><Plus className="h-3 w-3" /> Add to shortlist</>}
                  </button>
                ) : (
                  <span className="text-[10px] text-valence-subtle">Pick a deal to shortlist</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function MandateFitOutput({ output, onConvert }) {
  const verdict = output?.verdict || 'watch'
  const tone = ({ pursue: 'border-valence-success/30 bg-valence-success/10 text-valence-success', pass: 'border-valence-danger/30 bg-valence-danger/10 text-valence-danger', watch: 'border-valence-warning/30 bg-valence-warning/10 text-valence-warning' })[verdict] || 'border-valence-border bg-valence-surface text-valence-muted'
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${tone}`}>{verdict}</span>
        {typeof output?.score === 'number' && <span className="text-[11px] text-valence-muted">Score · <b className="text-valence-text tabular-nums">{output.score}</b>/100</span>}
      </div>
      {output?.one_line && <p className="text-sm text-valence-text leading-relaxed">{output.one_line}</p>}
      <ol className="space-y-2 text-sm leading-relaxed text-valence-muted list-decimal pl-5">
        {(output?.lines || []).slice(0, 5).map((l, i) => l ? <li key={i}>{l}</li> : null)}
      </ol>
      {verdict === 'pursue' && (
        <div className="pt-2 flex justify-end">
          <button onClick={onConvert} className="vl-btn-primary text-xs">
            <ArrowRight className="h-4 w-4" /> Convert to origination deal
          </button>
        </div>
      )}
    </div>
  )
}

const DEMO_DEALS = [
  { id: 'dl1', client_name: 'Saffron Retail',   sector: 'Consumer',   side: 'Sell-side', stage: 'Marketing', ticket_size_usd_m: 160, notes: 'Family-owned premium consumer brand exploring partial sale.' },
  { id: 'dl2', client_name: 'Quantum Edge',     sector: 'Fintech',    side: 'Sell-side', stage: 'Marketing', ticket_size_usd_m: 250, notes: 'Pre-IPO cap raise. Anchor book being built.' },
  { id: 'dl3', client_name: 'Solstice Solar',   sector: 'Renewables', side: 'Sell-side', stage: 'Mandate',   ticket_size_usd_m:  90, notes: 'Series C — operating solar portfolio with PPAs in place.' }
]
