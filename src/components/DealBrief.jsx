import { useState } from 'react'
import {
  Sparkles, Copy, Check, RefreshCw, Printer, Loader2,
  Target, Users2, AlertTriangle, ArrowRight
} from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { generateDealBrief, isGeminiConfigured } from '../lib/gemini.js'
import { logActivity } from '../lib/activity.js'
import { firmDisplayName } from '../lib/firmIdentity.js'
import { dealTypeLabel } from '../lib/dealLabels.js'

// Polished AI Brief for the Deal drawer.
//
// The previous version put the prose in a plain card; this rewrite:
//   1. Shows the mandate economics as chips at the top (stage, NDA, EV,
//      fees, target close, lead) so the prose can stay focused on
//      judgement.
//   2. Renders the LLM's four labelled sections (THESIS / COUNTERPARTIES /
//      RISKS / NEXT MOVES) as visually distinct blocks with per-section
//      icons + accent colours — reads like a diligence one-pager, not a
//      chat reply.
//   3. Keeps Copy + Print as one-tap actions in a sticky footer.

const SECTION_META = [
  { key: 'THESIS',        label: 'Thesis',        icon: Target,         accent: 'blue' },
  { key: 'COUNTERPARTIES',label: 'Counterparties',icon: Users2,         accent: 'violet' },
  { key: 'RISKS',         label: 'Risks',         icon: AlertTriangle,  accent: 'amber' },
  { key: 'NEXT MOVES',    label: 'Next moves',    icon: ArrowRight,     accent: 'emerald' },
  // Legacy fallbacks — the old prompt emitted these labels. Keep them
  // recognised so any pre-existing briefs still render structured.
  { key: 'SITUATION',     label: 'Situation',     icon: Target,         accent: 'blue' },
  { key: 'COMMERCIALS',   label: 'Commercials',   icon: Target,         accent: 'blue' },
  { key: 'NEXT STEPS',    label: 'Next moves',    icon: ArrowRight,     accent: 'emerald' }
]

const ACCENT_TONE = {
  blue:    { ring: 'ring-valence-blue/30',  iconBg: 'bg-valence-blue-soft text-valence-blue',   eyebrow: 'text-valence-blue' },
  violet:  { ring: 'ring-violet-300/40',    iconBg: 'bg-violet-50 text-violet-700',             eyebrow: 'text-violet-700' },
  amber:   { ring: 'ring-amber-300/40',     iconBg: 'bg-amber-50 text-amber-700',               eyebrow: 'text-amber-700' },
  emerald: { ring: 'ring-emerald-300/40',   iconBg: 'bg-emerald-50 text-emerald-700',           eyebrow: 'text-emerald-700' }
}

export default function DealBrief({ deal }) {
  const [brief, setBrief] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function run() {
    // Heuristic fallback runs when no Gemini key — the generator returns a
    // deterministic brief in the same shape, so the renderer doesn't need
    // to branch. We just flag the mode in the header so partners know.
    setLoading(true); setError(''); setBrief('')
    try {
      let contacts = [], files = [], activities = []
      if (isSupabaseConfigured && deal?.id) {
        const [c, f, a] = await Promise.all([
          supabase.from('contacts').select('*').eq('deal_id', deal.id),
          supabase.from('deal_files').select('*').eq('deal_id', deal.id),
          supabase.from('activities').select('*').eq('deal_id', deal.id).order('created_at', { ascending: false })
        ])
        contacts   = c.data || []
        files      = f.data || []
        activities = a.data || []
      }
      const text = await generateDealBrief({ deal, contacts, files, activities })
      setBrief(text)
      await logActivity({ dealId: deal.id, kind: 'brief_generated', body: 'Internal one-pager generated.' })
    } catch (err) {
      setError(err.message || 'Could not generate brief')
    } finally {
      setLoading(false)
    }
  }

  async function copyBrief() {
    if (!brief) return
    await navigator.clipboard.writeText(brief)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function printAsPDF() {
    if (!brief) return
    const win = window.open('', '_blank', 'width=900,height=1000')
    if (!win) return
    const safeTitle = (deal.client_name || 'Deal').replace(/[<>&]/g, '')
    const sections = parseSections(brief)
    const body = sections.map(s => `
      <section>
        <div class="lbl">${escape(s.label)}</div>
        <p>${escape(s.body)}</p>
      </section>`).join('')
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"/>
<title>${safeTitle} — Internal Brief</title>
<style>
  body { font-family: Inter, -apple-system, sans-serif; color: #0a0f1e; padding: 48px; max-width: 720px; margin: auto; line-height: 1.55; }
  header { border-bottom: 2px solid #3399FF; padding-bottom: 16px; margin-bottom: 28px; }
  h1 { font-size: 24px; margin: 0 0 4px; letter-spacing: -0.01em; }
  .sub { color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
  .chips { margin-top: 10px; font-size: 12px; color: #475569; }
  .chips span { display: inline-block; margin-right: 8px; padding: 2px 8px; background: #e0edff; color: #1a85ff; border-radius: 999px; font-weight: 600; }
  section { margin: 0 0 20px; }
  .lbl { font-size: 10px; font-weight: 700; color: #3399FF; letter-spacing: 0.18em; text-transform: uppercase; margin-bottom: 4px; }
  p { margin: 0; }
  footer { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 11px; color: #94a3b8; }
  @media print { body { padding: 24px; } }
</style></head>
<body>
  <header>
    <div class="sub">${escape(firmDisplayName('Your firm'))} · Internal brief</div>
    <h1>${safeTitle}</h1>
    <div class="chips">
      <span>${escape(dealTypeLabel(deal) || '')}</span>
      <span>${escape(deal.stage || '')}</span>
      ${deal.sector ? `<span>${escape(deal.sector)}</span>` : ''}
      ${deal.ticket_size_usd_m ? `<span>$${Number(deal.ticket_size_usd_m).toLocaleString()}M EV</span>` : ''}
    </div>
  </header>
  ${body}
  <footer>Generated ${new Date().toLocaleString()} · ValenceOS</footer>
</body></html>`)
    win.document.close()
    setTimeout(() => { win.focus(); win.print() }, 120)
  }

  const sections = brief ? parseSections(brief) : []
  const chips = buildChips(deal)

  return (
    <div className="space-y-4">
      {/* Header card — explains what this is, with the generate / regenerate
          action. Stays visible even when the brief hasn't been run yet. */}
      <div className="rounded-xl border border-valence-border bg-gradient-to-br from-valence-blue/10 via-valence-elevated/[0.02] to-transparent p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-valence-blue-soft ring-1 ring-valence-blue/30 shrink-0">
            <Sparkles className="h-4 w-4 text-valence-blue" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-valence-text">AI one-page brief</p>
              {!isGeminiConfigured && (
                <span
                  className="inline-flex items-center rounded-full border border-amber-300/50 bg-amber-50 px-1.5 py-0 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-amber-700"
                  title="Heuristic mode — Gemini key not configured. Connect a key to switch to the AI-generated brief."
                >
                  Heuristic mode
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-valence-muted leading-relaxed">
              Crisp, partner-grade read of this mandate. Pulls live data, counterparties, files and recent activity into four sections: Thesis · Counterparties · Risks · Next moves.
            </p>
          </div>
          <button onClick={run} disabled={loading} className="vl-btn-primary shrink-0">
            {loading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating</>
              : <><Sparkles className="h-4 w-4" /> {brief ? 'Regenerate' : 'Generate brief'}</>}
          </button>
        </div>

        {/* Chip strip — economics, status. Visible from the moment the
            drawer opens so a partner sees the shape of the deal without
            waiting for the LLM. */}
        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {chips.map((c, i) => (
              <span
                key={i}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${c.tone}`}
                title={c.title}
              >
                {c.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-valence-danger/30 bg-valence-danger/10 px-3 py-2 text-[12px] text-valence-danger">
          {error}
        </p>
      )}

      {sections.length > 0 && (
        <div className="space-y-3">
          {sections.map((s, i) => {
            const meta = SECTION_META.find(m => m.key === s.label.toUpperCase())
            const tone = ACCENT_TONE[meta?.accent || 'blue']
            const Icon = meta?.icon || Target
            const displayLabel = meta?.label || s.label
            return (
              <div key={i} className={`vl-card p-4 ring-1 ${tone.ring}`}>
                <div className="flex items-start gap-3">
                  <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone.iconBg}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${tone.eyebrow}`}>{displayLabel}</p>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-valence-text whitespace-pre-wrap">{s.body}</p>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Footer actions — Copy / Print. Sticky-feeling at the bottom of
              the brief, not the drawer, so partners reach for them after
              reading. */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button onClick={copyBrief} className="vl-btn-secondary text-[12px]">
              {copied ? <><Check className="h-3.5 w-3.5 text-valence-success" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
            </button>
            <button onClick={printAsPDF} className="vl-btn-secondary text-[12px]">
              <Printer className="h-3.5 w-3.5" /> Print / PDF
            </button>
            <button onClick={run} disabled={loading} className="vl-btn-ghost text-[12px]">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Regenerate
            </button>
          </div>
        </div>
      )}

      {/* Empty state when no brief has been generated yet AND no error —
          gives the partner a one-line hint instead of dead space. */}
      {!brief && !loading && !error && (
        <div className="rounded-xl border border-dashed border-valence-border bg-valence-surface/40 px-4 py-6 text-center">
          <p className="text-[12px] text-valence-muted">
            Click <span className="font-semibold text-valence-text">Generate brief</span> to produce the partner-grade read of this mandate.
          </p>
        </div>
      )}
    </div>
  )
}

// Parse the LLM output into structured sections by splitting on the labels.
// Tolerant to label casing, optional colons and lone newlines between paras.
function parseSections(text) {
  if (!text) return []
  const KNOWN = SECTION_META.map(m => m.key).join('|')
  const re = new RegExp(`(?:^|\\n)\\s*(${KNOWN})\\s*:\\s*`, 'gi')
  const matches = []
  let m
  while ((m = re.exec(text)) !== null) {
    matches.push({ label: m[1].toUpperCase(), start: m.index + m[0].length, headerStart: m.index })
  }
  if (matches.length === 0) {
    // Fall back to a single "Brief" block so even unstructured output renders.
    return [{ label: 'THESIS', body: text.trim() }]
  }
  const out = []
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i]
    const end = i + 1 < matches.length ? matches[i + 1].headerStart : text.length
    out.push({ label: cur.label, body: text.slice(cur.start, end).trim() })
  }
  return out
}

// Build the chip strip from the deal record. Each chip carries an optional
// tooltip so partners can disambiguate (e.g. is "Mandate" the stage or a
// deal type?).
function buildChips(deal) {
  const chips = []
  if (deal.stage)
    chips.push({ label: deal.stage, tone: 'border-valence-blue/30 bg-valence-blue-soft text-valence-blue', title: 'Stage' })
  const topTypes = (deal.deal_types || []).map(cap).join(' + ')
  if (topTypes)
    chips.push({ label: topTypes, tone: 'border-valence-border bg-valence-surface text-valence-muted', title: 'Deal type' })
  if (deal.deal_subtype)
    chips.push({ label: cap(String(deal.deal_subtype).replace(/_/g, ' ')), tone: 'border-valence-border bg-valence-surface text-valence-muted', title: 'Sub-type' })
  if (deal.sector)
    chips.push({ label: deal.sector, tone: 'border-violet-200 bg-violet-50 text-violet-700', title: 'Sector' })
  if (deal.ticket_size_usd_m)
    chips.push({ label: `USD ${deal.ticket_size_usd_m}M EV`, tone: 'border-emerald-200 bg-emerald-50 text-emerald-800', title: 'Enterprise value' })
  if (deal.target_raise_usd_m)
    chips.push({ label: `USD ${deal.target_raise_usd_m}M raise`, tone: 'border-emerald-200 bg-emerald-50 text-emerald-800', title: 'Target raise' })
  if (deal.fee_retainer_usd)
    chips.push({ label: `Retainer $${Number(deal.fee_retainer_usd).toLocaleString()}`, tone: 'border-amber-200 bg-amber-50 text-amber-800', title: 'Retainer' })
  if (deal.fee_success_pct)
    chips.push({ label: `${deal.fee_success_pct}% success`, tone: 'border-amber-200 bg-amber-50 text-amber-800', title: 'Success fee' })
  if (deal.nda_status && deal.nda_status !== 'Not Required')
    chips.push({ label: `NDA ${deal.nda_status}`, tone: 'border-valence-border bg-valence-surface text-valence-muted', title: 'NDA status' })
  if (deal.target_close)
    chips.push({ label: `Target close ${String(deal.target_close).slice(0, 10)}`, tone: 'border-rose-200 bg-rose-50 text-rose-800', title: 'Target close' })
  if (deal.lead_owner)
    chips.push({ label: `Lead: ${deal.lead_owner}`, tone: 'border-valence-border bg-valence-surface text-valence-muted', title: 'Lead banker' })
  return chips
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s }
function escape(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))
}
