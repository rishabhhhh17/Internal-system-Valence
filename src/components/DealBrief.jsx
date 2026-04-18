import { useState } from 'react'
import { Sparkles, Copy, Check, RefreshCw, Printer } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { generateDealBrief, isGeminiConfigured } from '../lib/gemini.js'
import { logActivity } from '../lib/activity.js'

export default function DealBrief({ deal }) {
  const [brief, setBrief] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function run() {
    if (!isGeminiConfigured) {
      setError('Add VITE_GEMINI_API_KEY to generate briefs.')
      return
    }
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

  async function copy() {
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
    const paragraphs = brief.split(/\n\n+/).map(p => {
      const m = p.match(/^(SITUATION|COMMERCIALS|COUNTERPARTIES|NEXT STEPS)\s*:\s*/i)
      if (!m) return `<p>${escape(p)}</p>`
      return `<p><span class="lbl">${m[1].toUpperCase()}</span><br/>${escape(p.slice(m[0].length))}</p>`
    }).join('')
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"/>
<title>${safeTitle} — Internal Brief</title>
<style>
  body { font-family: Inter, -apple-system, sans-serif; color: #0a0f1e; padding: 48px; max-width: 720px; margin: auto; line-height: 1.55; }
  header { border-bottom: 2px solid #3399FF; padding-bottom: 16px; margin-bottom: 28px; }
  h1 { font-size: 24px; margin: 0 0 4px; letter-spacing: -0.01em; }
  .sub { color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
  .chips { margin-top: 10px; font-size: 12px; color: #475569; }
  .chips span { display: inline-block; margin-right: 10px; padding: 2px 8px; background: #e0edff; color: #1a85ff; border-radius: 999px; font-weight: 600; }
  .lbl { font-size: 10px; font-weight: 700; color: #3399FF; letter-spacing: 0.18em; }
  p { margin: 0 0 14px; }
  footer { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 11px; color: #94a3b8; }
  @media print { body { padding: 24px; } }
</style></head>
<body>
  <header>
    <div class="sub">Valence Growth Partners · Internal brief</div>
    <h1>${safeTitle}</h1>
    <div class="chips">
      <span>${escape(deal.deal_type || '')}</span>
      <span>${escape(deal.stage || '')}</span>
      ${deal.sector ? `<span>${escape(deal.sector)}</span>` : ''}
      ${deal.ticket_size_usd_m ? `<span>$${Number(deal.ticket_size_usd_m).toLocaleString()}M EV</span>` : ''}
    </div>
  </header>
  ${paragraphs}
  <footer>Generated ${new Date().toLocaleString()} · ValanceOS</footer>
</body></html>`)
    win.document.close()
    setTimeout(() => { win.focus(); win.print() }, 120)
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-valence-border bg-gradient-to-br from-valence-blue/10 via-white/[0.02] to-transparent p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-valence-blue-soft ring-1 ring-valence-blue/30 shrink-0">
            <Sparkles className="h-4 w-4 text-valence-blue" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-valence-text">AI one-page brief</p>
            <p className="mt-0.5 text-[11px] text-valence-muted">
              Pulls deal data, counterparties, files, and timeline to generate a crisp internal one-pager.
            </p>
          </div>
          <button onClick={run} disabled={loading} className="vl-btn-primary shrink-0">
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? 'Generating…' : (brief ? 'Regenerate' : 'Generate brief')}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-valence-danger">{error}</p>}

      {brief && (
        <div className="vl-card p-5 relative">
          <div className="absolute right-3 top-3 flex items-center gap-1">
            <button onClick={printAsPDF} className="vl-btn-ghost" aria-label="Print">
              <Printer className="h-3.5 w-3.5" />
            </button>
            <button onClick={copy} className="vl-btn-ghost" aria-label="Copy">
              {copied ? <Check className="h-3.5 w-3.5 text-valence-success" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-valence-text">
            {renderBrief(brief)}
          </div>
        </div>
      )}
    </div>
  )
}

function escape(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))
}

function renderBrief(text) {
  // Style the SECTION labels produced by the prompt
  return text.split(/\n\n+/).map((para, i) => {
    const m = para.match(/^(SITUATION|COMMERCIALS|COUNTERPARTIES|NEXT STEPS)\s*:\s*/i)
    if (!m) return <p key={i} className="mb-3 last:mb-0">{para}</p>
    const body = para.slice(m[0].length)
    return (
      <p key={i} className="mb-3 last:mb-0">
        <span className="mr-2 inline-block text-[10px] font-semibold uppercase tracking-[0.18em] text-valence-blue">
          {m[1].toUpperCase()}
        </span>
        <br />
        {body}
      </p>
    )
  })
}
