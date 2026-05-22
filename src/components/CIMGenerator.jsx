import { useEffect, useRef, useState } from 'react'
import { Sparkles, Copy, Check, RefreshCw, Printer, Save, Loader2 } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { generateCIM, parseCIM, CIM_SECTIONS } from '../lib/cim.js'
import { isGeminiConfigured } from '../lib/gemini.js'
import { logActivity } from '../lib/activity.js'
import { useToast } from './Toast.jsx'
import { firmDisplayName } from '../lib/firmIdentity.js'

export default function CIMGenerator({ deal }) {
  const toast = useToast()
  const [draft, setDraft] = useState(deal?.cim_draft || '')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState(CIM_SECTIONS.map(s => s.id))

  useEffect(() => {
    setDraft(deal?.cim_draft || '')
  }, [deal?.id])

  async function run() {
    if (!isGeminiConfigured) { setError('Add VITE_GEMINI_API_KEY to draft a CIM.'); return }
    setError(''); setStreaming(true); setDraft('')

    // Fetch attached context in parallel
    let contacts = [], files = [], activities = [], financials = deal?.financials || null
    if (isSupabaseConfigured && deal?.id) {
      const [c, f, a] = await Promise.all([
        supabase.from('contacts').select('*').eq('deal_id', deal.id),
        supabase.from('deal_files').select('*').eq('deal_id', deal.id),
        supabase.from('activities').select('*').eq('deal_id', deal.id).order('created_at', { ascending: false }).limit(20)
      ])
      contacts = c.data || []; files = f.data || []; activities = a.data || []
    }
    const sections = CIM_SECTIONS.filter(s => selected.includes(s.id))

    try {
      await generateCIM({
        deal, contacts, files, activities, financials, sections,
        onChunk: (_, full) => setDraft(full),
        onDone: async () => {
          if (deal?.id) await logActivity({ dealId: deal.id, kind: 'brief_generated', body: 'CIM draft generated.' })
        },
        onError: (e) => setError(e.message || 'Generation failed')
      })
    } catch (e) {
      setError(e.message || 'Generation failed')
    } finally {
      setStreaming(false)
    }
  }

  async function save() {
    if (!isSupabaseConfigured || !deal?.id) return
    setSaving(true)
    try {
      const { error } = await supabase.from('deals').update({ cim_draft: draft }).eq('id', deal.id)
      if (error) throw error
      toast.success('CIM draft saved to the deal.')
    } catch (e) {
      toast.error(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function copy() {
    if (!draft) return
    await navigator.clipboard.writeText(draft)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  function printAsPDF() {
    if (!draft) return
    const win = window.open('', '_blank', 'width=980,height=1100')
    if (!win) return
    const safe = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))
    const sections = parseCIM(draft).map(b =>
      `<section><h2>${safe(b.title)}</h2>${b.body.split(/\n\n+/).map(p => `<p>${safe(p)}</p>`).join('')}</section>`
    ).join('')
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"/>
<title>${safe(deal?.client_name || 'Deal')} — CIM Draft</title>
<style>
  body { font-family: Inter, -apple-system, sans-serif; color: #0a0f1e; padding: 56px; max-width: 760px; margin: auto; line-height: 1.6; }
  header { border-bottom: 2px solid #3399FF; padding-bottom: 18px; margin-bottom: 36px; }
  h1 { font-size: 28px; margin: 0 0 6px; letter-spacing: -0.015em; font-family: Fraunces, Georgia, serif; }
  .sub { color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; }
  section { page-break-inside: avoid; margin-top: 28px; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.14em; color: #3399FF; margin: 0 0 10px; font-weight: 700; }
  p { margin: 0 0 14px; font-size: 13px; }
  footer { margin-top: 48px; border-top: 1px solid #e2e8f0; padding-top: 14px; font-size: 10px; color: #94a3b8; }
  @media print { body { padding: 32px; } }
</style></head>
<body>
  <header>
    <div class="sub">Confidential — ${safe(firmDisplayName('your firm'))} · CIM draft</div>
    <h1>${safe(deal?.client_name || 'Untitled Mandate')}</h1>
    <div class="sub" style="margin-top:6px;">${safe(deal?.deal_type || '')} · ${safe(deal?.side || '')} · ${safe(deal?.sector || '')}</div>
  </header>
  ${sections}
  <footer>Generated ${new Date().toLocaleString()} · ValenceOS · draft for internal review</footer>
</body></html>`)
    win.document.close()
    setTimeout(() => { win.focus(); win.print() }, 120)
  }

  function toggleSection(id) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  const blocks = parseCIM(draft)

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-valence-border bg-gradient-to-br from-valence-blue-soft via-valence-elevated to-valence-elevated p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-valence-blue-soft ring-1 ring-valence-blue/30 shrink-0">
            <Sparkles className="h-4 w-4 text-valence-blue" />
          </div>
          <div className="flex-1">
            <p className="font-display text-lg font-semibold text-valence-text">CIM draft</p>
            <p className="mt-1 text-xs text-valence-muted leading-relaxed">
              A first pass at a confidential information memorandum — drawn from your deal facts, attached files, comps, and sector memos. Review, rewrite, and ship.
            </p>
          </div>
          <button onClick={run} disabled={streaming} className="vl-btn-accent shrink-0">
            {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {streaming ? 'Drafting…' : (draft ? 'Regenerate' : 'Draft CIM')}
          </button>
        </div>

        {/* Section toggles */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {CIM_SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => toggleSection(s.id)}
              disabled={streaming}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                selected.includes(s.id)
                  ? 'border-valence-blue/40 bg-valence-blue-soft text-valence-blue-deep'
                  : 'border-valence-border bg-valence-elevated text-valence-muted hover:border-valence-ink/20'
              }`}
              title={s.hint}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-valence-danger/30 bg-valence-danger/5 px-4 py-3 text-sm text-valence-danger">
          {error}
        </div>
      )}

      {/* Draft display */}
      {(streaming || draft) && (
        <div className="vl-card relative">
          <div className="absolute right-3 top-3 z-10 flex items-center gap-1">
            <button onClick={printAsPDF} disabled={!draft} className="vl-btn-ghost" aria-label="Print">
              <Printer className="h-3.5 w-3.5" />
            </button>
            <button onClick={copy} disabled={!draft} className="vl-btn-ghost" aria-label="Copy">
              {copied ? <Check className="h-3.5 w-3.5 text-valence-success" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            <button onClick={save} disabled={!draft || saving || streaming} className="vl-btn-ghost" aria-label="Save to deal">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            </button>
          </div>

          <div className="p-6 pr-20 space-y-5">
            {blocks.length === 0 && streaming ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-3 w-2/3 rounded bg-valence-surface" />
                <div className="h-3 w-full rounded bg-valence-surface" />
                <div className="h-3 w-11/12 rounded bg-valence-surface" />
                <div className="h-3 w-4/5 rounded bg-valence-surface" />
              </div>
            ) : blocks.length === 0 ? (
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-valence-text">{draft}</pre>
            ) : blocks.map((b, i) => (
              <section key={i}>
                <p className="vl-eyebrow">{b.title}</p>
                <div className="mt-2 space-y-3 text-sm leading-relaxed text-valence-text">
                  {b.body.split(/\n\n+/).map((p, j) => (
                    <p key={j}>{p}{streaming && i === blocks.length - 1 && j === b.body.split(/\n\n+/).length - 1 && <span className="inline-block h-4 w-1.5 ml-0.5 bg-valence-blue/80 animate-pulse align-middle rounded-sm" />}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
