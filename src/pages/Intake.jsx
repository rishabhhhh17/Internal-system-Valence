import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, ArrowRight, Upload, ShieldCheck } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { screenMandateFit } from '../lib/screener.js'
import { extractText } from '../lib/fileParse.js'
import Logo from '../components/Logo.jsx'

const SIDES = ['Sell-side', 'Buy-side', 'Capital raise', 'Strategic advisory']
const SOURCES = ['Referral', 'Found you online', 'Conference / Event', 'Existing relationship', 'Other']

export default function Intake() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    company_name: '', contact_name: '', contact_email: '', contact_phone: '',
    sector: '', deal_side: 'Sell-side', ev_ask_usd_m: '',
    situation: '', source: 'Referral'
  })
  const [deckFile, setDeckFile] = useState(null)
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState('')
  const inputRef = useRef(null)

  function update(patch) { setForm(f => ({ ...f, ...patch })) }

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

      const composedTeaser = [
        `Company: ${form.company_name}`,
        `Sector: ${form.sector}`,
        `Side: ${form.deal_side}`,
        `EV ask: USD ${form.ev_ask_usd_m || '?'}M`,
        `Situation: ${form.situation}`,
        teaserText ? `\n--- DECK TEXT ---\n${teaserText.slice(0, 6000)}` : ''
      ].filter(Boolean).join('\n')

      let aiOutput = null
      try {
        aiOutput = await screenMandateFit({ teaserText: composedTeaser })
      } catch { /* the firm can still triage manually if Gemini is down */ }

      const payload = {
        company_name:  form.company_name.trim(),
        contact_name:  form.contact_name.trim(),
        contact_email: form.contact_email.trim(),
        contact_phone: form.contact_phone.trim() || null,
        sector:        form.sector.trim() || null,
        deal_side:     form.deal_side,
        ev_ask_usd_m:  form.ev_ask_usd_m ? Number(form.ev_ask_usd_m) : null,
        situation:     form.situation.trim() || null,
        source:        form.source,
        deck_url,
        ai_screener_output: aiOutput
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
            <Field label="Mandate type">
              <select className="vl-input bg-white text-valence-text" value={form.deal_side} onChange={e => update({ deal_side: e.target.value })}>
                {SIDES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="EV ask (USD M)">
              <input type="number" className="vl-input bg-white text-valence-text" value={form.ev_ask_usd_m} onChange={e => update({ ev_ask_usd_m: e.target.value })} placeholder="180" />
            </Field>
          </div>

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
