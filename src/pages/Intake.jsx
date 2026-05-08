import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, ArrowRight, Upload, ShieldCheck } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { screenMandateFit } from '../lib/screener.js'
import { extractText } from '../lib/fileParse.js'
import Logo from '../components/Logo.jsx'

const SOURCES = ['Referral', 'Found you online', 'Conference / Event', 'Existing relationship', 'Other']

const TOP_TYPES = [
  { id: 'transaction', label: 'Transaction', blurb: 'Fundraise, M&A, or exit — closing a deal.' },
  { id: 'advisory',    label: 'Advisory',    blurb: 'Geography entry, vertical play, distribution, etc.' }
]
const SUBTYPES = [
  { id: 'fundraise', label: 'Fundraise', blurb: 'Equity, fund, or project capital.' },
  { id: 'm_and_a',   label: 'M&A',       blurb: 'Buy-side or sell-side advisory.' },
  { id: 'exit',      label: 'Exit',      blurb: 'Liquidity for an existing investor.' }
]
const MA_SIDES = [
  { id: 'sell',      label: 'Sell-side' },
  { id: 'buy',       label: 'Buy-side' },
  { id: 'undecided', label: 'Not yet decided' }
]

const initialForm = {
  // universal
  company_name: '', contact_name: '', contact_email: '', contact_phone: '',
  sector: '', source: 'Referral', situation: '',
  // deal-type model
  deal_types: ['transaction'],
  deal_subtype: 'fundraise',
  // fundraise
  target_raise_usd_m: '',
  target_valuation_usd_m: '',
  company_stage: '',
  // m_and_a
  ma_side: 'sell',
  acquisition_brief: '',
  // exit
  target_exit_usd_m: '',
  target_exit_valuation_usd_m: '',
  exit_investor_name: '',
  // advisory
  engagement_brief: ''
}

export default function Intake() {
  const navigate = useNavigate()
  const [form, setForm] = useState(initialForm)
  const [deckFile, setDeckFile] = useState(null)
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState('')
  const inputRef = useRef(null)

  const isTransaction = form.deal_types.includes('transaction')
  const isAdvisory    = form.deal_types.includes('advisory')

  function update(patch) { setForm(f => ({ ...f, ...patch })) }

  function toggleType(id) {
    setForm(s => {
      const has = s.deal_types.includes(id)
      const next = has ? s.deal_types.filter(t => t !== id) : [...s.deal_types, id]
      return { ...s, deal_types: next.length ? next : s.deal_types }
    })
  }

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      let deck_url = null
      let teaserText = ''

      if (deckFile && isSupabaseConfigured) {
        const path = `intake/${Date.now()}-${slug(deckFile.name)}`
        const up = await supabase.storage.from('intake-decks').upload(path, deckFile, { upsert: false, contentType: deckFile.type })
        if (up.error) throw new Error(`Upload failed: ${up.error.message}`)
        const { data: pub } = supabase.storage.from('intake-decks').getPublicUrl(path)
        deck_url = pub?.publicUrl || null
        try { const t = await extractText(deckFile); teaserText = t.text || '' } catch { /* parser is optional */ }
      } else if (deckFile) {
        try { const t = await extractText(deckFile); teaserText = t.text || '' } catch { /* parser is optional */ }
      }

      const composedTeaser = composeTeaserFromForm(form, teaserText)

      let aiOutput = null
      try {
        aiOutput = await screenMandateFit({ teaserText: composedTeaser })
      } catch { /* the firm can still triage manually if Gemini is down */ }

      const num = (v) => v === '' || v == null ? null : Number(v)
      const txt = (v) => (v || '').trim() || null

      const payload = {
        // universal
        company_name:  form.company_name.trim(),
        contact_name:  form.contact_name.trim(),
        contact_email: form.contact_email.trim(),
        contact_phone: txt(form.contact_phone),
        sector:        txt(form.sector),
        situation:     txt(form.situation),
        source:        form.source,
        deck_url,
        ai_screener_output: aiOutput,
        // legacy mirror so the inbox queue still shows a coarse "side"
        deal_side:     legacySideFor(form),
        ev_ask_usd_m:  legacyEvFor(form),
        // new deal-type model
        deal_types:    form.deal_types,
        deal_subtype:  isTransaction ? form.deal_subtype : null,
        // fundraise-conditional
        target_raise_usd_m:           isTransaction && form.deal_subtype === 'fundraise' ? num(form.target_raise_usd_m) : null,
        target_valuation_usd_m:       isTransaction && form.deal_subtype === 'fundraise' ? num(form.target_valuation_usd_m) : null,
        company_stage:                isTransaction && form.deal_subtype === 'fundraise' ? txt(form.company_stage) : null,
        // m_and_a-conditional
        ma_side:                      isTransaction && form.deal_subtype === 'm_and_a' ? form.ma_side : null,
        acquisition_brief:            isTransaction && form.deal_subtype === 'm_and_a' ? txt(form.acquisition_brief) : null,
        // exit-conditional
        target_exit_usd_m:            isTransaction && form.deal_subtype === 'exit' ? num(form.target_exit_usd_m) : null,
        target_exit_valuation_usd_m:  isTransaction && form.deal_subtype === 'exit' ? num(form.target_exit_valuation_usd_m) : null,
        exit_investor_name:           isTransaction && form.deal_subtype === 'exit' ? txt(form.exit_investor_name) : null,
        // advisory-conditional
        engagement_brief:             isAdvisory ? txt(form.engagement_brief) : null
      }

      if (!isSupabaseConfigured) {
        // Demo mode — still surface success. The firm can wire Supabase whenever.
        navigate('/intake/thanks')
        return
      }
      const { error: insErr } = await supabase.from('intake_submissions').insert(payload)
      if (insErr) throw new Error(insErr.message)
      navigate('/intake/thanks')
    } catch (err) {
      setError(err?.message || 'Submission failed — please try again or email us directly.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-valence-ink text-white">
      <header className="border-b border-white/10 bg-valence-ink">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <Logo />
          <a href="https://valencegrowth.com" className="text-[11px] text-white/60 hover:text-white">valencegrowth.com</a>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-valence-blue">Submit a mandate</p>
        <h1 className="mt-3 font-display text-4xl font-bold leading-tight tracking-tight md:text-5xl">
          Tell us about the situation.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/70">
          Drop the basics and a teaser deck. We screen every submission within 48 hours and reply with either a meeting slot or a clear, useful pass.
        </p>

        <form onSubmit={submit} className="mt-10 space-y-6 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          {/* Universal contact + company */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name *">
              <input className="vl-input bg-white text-valence-text" required value={form.company_name} onChange={e => update({ company_name: e.target.value })} />
            </Field>
            <Field label="Sector">
              <input className="vl-input bg-white text-valence-text" value={form.sector} onChange={e => update({ sector: e.target.value })} placeholder="e.g. Healthcare, Fintech" />
            </Field>
            <Field label="Your name *">
              <input className="vl-input bg-white text-valence-text" required value={form.contact_name} onChange={e => update({ contact_name: e.target.value })} />
            </Field>
            <Field label="Your email *">
              <input type="email" className="vl-input bg-white text-valence-text" required value={form.contact_email} onChange={e => update({ contact_email: e.target.value })} />
            </Field>
            <Field label="Phone">
              <input className="vl-input bg-white text-valence-text" value={form.contact_phone} onChange={e => update({ contact_phone: e.target.value })} />
            </Field>
            <Field label="How did you hear about us">
              <select className="vl-input bg-white text-valence-text" value={form.source} onChange={e => update({ source: e.target.value })}>
                {SOURCES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          {/* Mandate type */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">Mandate type</label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {TOP_TYPES.map(t => {
                const active = form.deal_types.includes(t.id)
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => toggleType(t.id)}
                    aria-pressed={active}
                    className={`rounded-xl border px-3 py-2.5 text-left text-xs transition ${
                      active
                        ? 'border-valence-blue/60 bg-valence-blue/15 text-white'
                        : 'border-white/15 bg-white/5 text-white/70 hover:bg-white/10'
                    }`}
                  >
                    <p className="font-semibold">{t.label}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-white/60">{t.blurb}</p>
                  </button>
                )
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-white/50">A mandate can be one or both. Both is fine.</p>
          </div>

          {/* Transaction-conditional */}
          {isTransaction && (
            <div className="space-y-4 rounded-xl border border-valence-blue/30 bg-valence-blue/5 p-4">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">Transaction sub-type</label>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {SUBTYPES.map(s => {
                    const active = form.deal_subtype === s.id
                    return (
                      <button
                        type="button"
                        key={s.id}
                        onClick={() => update({ deal_subtype: s.id })}
                        aria-pressed={active}
                        className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                          active
                            ? 'border-white/40 bg-white text-valence-text shadow-sm'
                            : 'border-white/15 bg-white/10 text-white/70 hover:bg-white/15'
                        }`}
                      >
                        <p className="font-semibold">{s.label}</p>
                        <p className="mt-0.5 text-[11px] leading-snug opacity-80">{s.blurb}</p>
                      </button>
                    )
                  })}
                </div>
              </div>

              {form.deal_subtype === 'fundraise' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Target raise (USD M)">
                    <input type="number" className="vl-input bg-white text-valence-text" value={form.target_raise_usd_m} onChange={e => update({ target_raise_usd_m: e.target.value })} placeholder="e.g. 80" />
                  </Field>
                  <Field label="Target valuation (USD M)">
                    <input type="number" className="vl-input bg-white text-valence-text" value={form.target_valuation_usd_m} onChange={e => update({ target_valuation_usd_m: e.target.value })} placeholder="e.g. 250" />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Company stage">
                      <input className="vl-input bg-white text-valence-text" value={form.company_stage} onChange={e => update({ company_stage: e.target.value })} placeholder="Seed · Series A · Growth · Project finance · …" />
                    </Field>
                  </div>
                </div>
              )}

              {form.deal_subtype === 'm_and_a' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">M&A side</label>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      {MA_SIDES.map(s => {
                        const active = form.ma_side === s.id
                        return (
                          <button
                            type="button"
                            key={s.id}
                            onClick={() => update({ ma_side: s.id })}
                            aria-pressed={active}
                            className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                              active
                                ? 'border-white/40 bg-white text-valence-text shadow-sm'
                                : 'border-white/15 bg-white/10 text-white/70 hover:bg-white/15'
                            }`}
                          >
                            {s.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <Field label="Acquisition brief">
                    <textarea
                      className="vl-input bg-white text-valence-text min-h-[120px] leading-relaxed"
                      value={form.acquisition_brief}
                      onChange={e => update({ acquisition_brief: e.target.value })}
                      placeholder='e.g. "$100M topline IT services company, $5–10M EBITDA, financial services clients, NOT Web3, cybersecurity acceptable."'
                    />
                  </Field>
                  <p className="-mt-2 text-[11px] text-white/50">
                    M&A asks are usually a spec, not a number. Be specific about what you want.
                  </p>
                </div>
              )}

              {form.deal_subtype === 'exit' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Target exit (USD M)">
                    <input type="number" className="vl-input bg-white text-valence-text" value={form.target_exit_usd_m} onChange={e => update({ target_exit_usd_m: e.target.value })} placeholder="e.g. 320" />
                  </Field>
                  <Field label="Target exit valuation (USD M)">
                    <input type="number" className="vl-input bg-white text-valence-text" value={form.target_exit_valuation_usd_m} onChange={e => update({ target_exit_valuation_usd_m: e.target.value })} placeholder="optional" />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Investor being exited">
                      <input className="vl-input bg-white text-valence-text" value={form.exit_investor_name} onChange={e => update({ exit_investor_name: e.target.value })} placeholder="e.g. Brookfield" />
                    </Field>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Advisory-conditional */}
          {isAdvisory && (
            <div className="space-y-3 rounded-xl border border-valence-warning/30 bg-valence-warning/5 p-4">
              <Field label="Engagement brief">
                <textarea
                  className="vl-input bg-white text-valence-text min-h-[120px] leading-relaxed"
                  value={form.engagement_brief}
                  onChange={e => update({ engagement_brief: e.target.value })}
                  placeholder='e.g. "Help break into Dubai market — distribution + first-customer outreach. Also exploring vending-machine product line for premium Q-commerce dark stores."'
                />
              </Field>
              <p className="text-[11px] text-white/50">
                What do you actually need? Geography, vertical, product, distribution — describe it the way you'd describe it to a partner.
              </p>
            </div>
          )}

          {/* Situation + deck */}
          <Field label="The situation, in your own words">
            <textarea className="vl-input bg-white text-valence-text min-h-[160px] leading-relaxed" value={form.situation} onChange={e => update({ situation: e.target.value })} placeholder="What's the mandate, what triggered the need, what does success look like?" />
          </Field>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">Teaser / deck (optional)</label>
            <div className="mt-1.5 flex items-center gap-3">
              <input ref={inputRef} type="file" accept=".pdf,.docx" className="hidden" onChange={e => setDeckFile(e.target.files?.[0] || null)} />
              <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15">
                <Upload className="h-3.5 w-3.5" /> {deckFile ? 'Change file' : 'Upload PDF / DOCX'}
              </button>
              {deckFile && <span className="text-[11px] text-white/60 truncate">{deckFile.name}</span>}
            </div>
            <p className="mt-2 text-[11px] text-white/50">Stored privately. Only the Valence team can read it.</p>
          </div>

          {error && <p className="rounded-lg border border-valence-danger/50 bg-valence-danger/10 px-3 py-2 text-sm text-valence-danger">{error}</p>}

          <div className="flex items-center justify-between">
            <p className="inline-flex items-center gap-1.5 text-[11px] text-white/60">
              <ShieldCheck className="h-3 w-3 text-valence-blue" /> Confidential — for review by the Valence team only.
            </p>
            <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-valence-blue px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60">
              {busy ? 'Submitting…' : <>Submit <ArrowRight className="h-4 w-4" /></>}
            </button>
          </div>
        </form>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          <Tile icon={Building2} title="Who we are" body="Valence Growth Partners — boutique investment advisory across M&A, capital raises, and strategic consulting." />
          <Tile icon={ShieldCheck} title="What we read" body="Sectors: Healthcare, Fintech, Consumer, Infrastructure, Renewables, Logistics. Tickets USD 50–750M EV." />
          <Tile icon={ArrowRight} title="What happens next" body="48-hour screen. Either a meeting slot, or a clear pass with the reason." />
        </div>
      </main>

      <footer className="border-t border-white/10 px-6 py-6 text-center text-[11px] text-white/40">
        © {new Date().getFullYear()} Valence Growth Partners · Mumbai · London
      </footer>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

function Tile({ icon: Icon, title, body }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <Icon className="h-4 w-4 text-valence-blue" />
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-white/60">{body}</p>
    </div>
  )
}

function slug(s) { return (s || '').replace(/[^A-Za-z0-9._-]+/g, '_') }

// Compose the teaser string the AI Mandate-Fit screener reads. Mirrors the
// shape of the new deal-type model so Gemini sees the same structure the firm
// sees inside the inbox queue.
export function composeTeaserFromForm(form, deckText = '') {
  const isTransaction = form.deal_types.includes('transaction')
  const isAdvisory    = form.deal_types.includes('advisory')
  const lines = [
    `Company: ${form.company_name || '—'}`,
    `Sector: ${form.sector || '—'}`,
    `Mandate type: ${form.deal_types.join(' + ') || 'unspecified'}`
  ]
  if (isTransaction) {
    lines.push(`Sub-type: ${form.deal_subtype || '—'}`)
    if (form.deal_subtype === 'fundraise') {
      lines.push(`Target raise: USD ${form.target_raise_usd_m || '?'}M`)
      if (form.target_valuation_usd_m) lines.push(`Target valuation: USD ${form.target_valuation_usd_m}M`)
      if (form.company_stage) lines.push(`Company stage: ${form.company_stage}`)
    }
    if (form.deal_subtype === 'm_and_a') {
      lines.push(`M&A side: ${form.ma_side || '—'}`)
      if (form.acquisition_brief) lines.push(`Acquisition brief: ${form.acquisition_brief}`)
    }
    if (form.deal_subtype === 'exit') {
      lines.push(`Target exit: USD ${form.target_exit_usd_m || '?'}M`)
      if (form.target_exit_valuation_usd_m) lines.push(`Target exit valuation: USD ${form.target_exit_valuation_usd_m}M`)
      if (form.exit_investor_name) lines.push(`Investor being exited: ${form.exit_investor_name}`)
    }
  }
  if (isAdvisory && form.engagement_brief) {
    lines.push(`Engagement brief: ${form.engagement_brief}`)
  }
  if (form.situation) lines.push(`Situation: ${form.situation}`)
  if (deckText) lines.push(`\n--- DECK TEXT ---\n${deckText.slice(0, 6000)}`)
  return lines.filter(Boolean).join('\n')
}

// Preserve the legacy `deal_side` text column so existing inbox UI + the old
// "Convert to deal" param still has a sensible value to read. Nothing in the
// new model relies on this; it's a one-way mirror for backwards compatibility.
function legacySideFor(form) {
  if (!form.deal_types.includes('transaction')) return 'Strategic advisory'
  if (form.deal_subtype === 'fundraise') return 'Capital raise'
  if (form.deal_subtype === 'm_and_a') {
    if (form.ma_side === 'buy') return 'Buy-side'
    if (form.ma_side === 'sell') return 'Sell-side'
    return 'M&A'
  }
  if (form.deal_subtype === 'exit') return 'Sell-side'
  return null
}

// Surface a single representative number for the legacy `ev_ask_usd_m` column
// so the existing inbox card still has a "EV ask" chip when applicable.
function legacyEvFor(form) {
  if (!form.deal_types.includes('transaction')) return null
  if (form.deal_subtype === 'fundraise') return form.target_raise_usd_m ? Number(form.target_raise_usd_m) : null
  if (form.deal_subtype === 'exit')      return form.target_exit_usd_m  ? Number(form.target_exit_usd_m)  : null
  return null // M&A is a spec, not a number
}
