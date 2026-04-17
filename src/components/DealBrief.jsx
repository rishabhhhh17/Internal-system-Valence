import { useState } from 'react'
import { Sparkles, Copy, Check, RefreshCw } from 'lucide-react'
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

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-valence-border bg-gradient-to-br from-valence-blue/10 via-white/[0.02] to-transparent p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-valence-blue-soft ring-1 ring-valence-blue/30 shrink-0">
            <Sparkles className="h-4 w-4 text-valence-blue" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">AI one-page brief</p>
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
          <button onClick={copy} className="absolute right-3 top-3 vl-btn-ghost" aria-label="Copy">
            {copied ? <Check className="h-3.5 w-3.5 text-valence-success" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-valence-text">
            {renderBrief(brief)}
          </div>
        </div>
      )}
    </div>
  )
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
