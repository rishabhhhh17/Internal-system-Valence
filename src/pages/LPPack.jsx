// PE-specific page — LP Pack draft generator.
//
// One-click: pull every active portfolio company + recent updates and
// hand them to Gemini to draft a quarterly LP letter. The output is
// markdown the user copies into the firm's branded template.

import { useEffect, useState } from 'react'
import { FileText, Loader2, Copy, Check, Sparkles } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { llmCall } from '../lib/gemini.js'
import { useToast } from '../components/Toast.jsx'
import { humanError } from '../lib/userError.js'
import SectionHeader from '../components/ui/SectionHeader.jsx'
import AIBadge from '../components/ui/AIBadge.jsx'
import MetricCard from '../components/ui/MetricCard.jsx'

export default function LPPack() {
  const toast = useToast()
  const [portcos, setPortcos] = useState([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft]     = useState('')
  const [generating, setGen]  = useState(false)
  const [copied, setCopied]   = useState(false)

  useEffect(() => { load() }, [])
  async function load() {
    if (!isSupabaseConfigured) { setLoading(false); return }
    try {
      const { data, error } = await supabase
        .from('portfolio_companies').select('*').eq('status', 'active').order('invested_at', { ascending: true })
      if (error) throw error
      setPortcos(data || [])
    } catch (e) {
      toast.error(humanError(e, 'Could not load portfolio.'))
    } finally { setLoading(false) }
  }

  async function generate() {
    setGen(true); setDraft('')
    try {
      const prompt = buildPrompt(portcos)
      const text = await llmCall(prompt, {
        temperature: 0.3, maxOutputTokens: 1800, actionType: 'lp_pack'
      })
      setDraft(String(text || '').trim())
    } catch (e) {
      toast.error(humanError(e, 'Could not draft LP letter.'))
    } finally { setGen(false) }
  }

  function copyDraft() {
    if (!draft) return
    try {
      navigator.clipboard?.writeText(draft)
      setCopied(true); toast.success('LP letter copied.')
      setTimeout(() => setCopied(false), 1500)
    } catch { toast.error('Clipboard blocked.') }
  }

  const totalNav = portcos.reduce((s, r) =>
    s + (Number(r.current_valuation_usd_m) || 0) * (Number(r.ownership_pct) || 0) / 100, 0)

  return (
    <div className="space-y-5">
      <SectionHeader
        eyebrow="LP Pack"
        title="Quarterly LP letter — draft"
        sub="Generate a partner-ready letter summarising portfolio progress. Output is markdown; copy into your branded template."
        right={
          <button onClick={generate} disabled={generating || portcos.length === 0} className="vl-btn-primary">
            {generating
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Drafting…</>
              : <><Sparkles className="h-4 w-4" /> Generate</>}
          </button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MetricCard label="Active portcos" value={portcos.length} />
        <MetricCard label="NAV (USD M)" value={totalNav ? totalNav.toFixed(1) : '—'} tone="blue"
                    sub="Ownership × current valuation" />
        <MetricCard label="With recent update"
                    value={portcos.filter(r => r.last_update_at).length}
                    sub={`${portcos.length - portcos.filter(r => r.last_update_at).length} need refresh`} />
      </div>

      {loading ? (
        <div className="vl-card p-8 text-center text-xs text-valence-muted">Loading portfolio…</div>
      ) : portcos.length === 0 ? (
        <div className="vl-card p-10 text-center">
          <FileText className="h-8 w-8 text-valence-subtle mx-auto mb-3" />
          <p className="text-sm font-semibold text-valence-text">No active portfolio yet</p>
          <p className="text-xs text-valence-muted mt-1">Add companies on the Portfolio page first.</p>
        </div>
      ) : (
        <div className="vl-card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-valence-blue" />
              <h3 className="text-sm font-semibold text-valence-text">Draft</h3>
              <AIBadge />
            </div>
            {draft && (
              <button onClick={copyDraft} className="vl-btn-secondary text-xs">
                {copied ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
              </button>
            )}
          </div>
          {generating && (
            <div className="text-center py-8 text-xs text-valence-muted">
              <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2 text-valence-blue" />
              Synthesising letter…
            </div>
          )}
          {!generating && !draft && (
            <div className="text-center py-10 text-xs text-valence-muted">
              No draft yet. Hit <span className="font-semibold text-valence-blue">Generate</span> to create one from the {portcos.length} active portfolio companies above.
            </div>
          )}
          {draft && (
            <pre className="rounded-lg border border-valence-border bg-valence-surface/40 px-4 py-3 text-[12.5px] leading-relaxed text-valence-text whitespace-pre-wrap font-sans max-h-[600px] overflow-y-auto">
              {draft}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

function buildPrompt(portcos) {
  const lines = portcos.map((p, i) => (
    `${i + 1}. ${p.company_name} — ${p.sector || '—'} (${p.geography || '—'})
   Ownership: ${p.ownership_pct ?? '—'}%   Valuation: ${p.current_valuation_usd_m ?? '—'} USD M   Board seats: ${p.board_seats ?? 0}
   Thesis: ${p.thesis_brief || '—'}
   Last update: ${p.last_update_at || 'none logged'}`
  )).join('\n\n')

  return `You're drafting a quarterly LP letter for a private equity firm. Write a partner-grade letter using ONLY the portfolio data below. Do not invent valuations, market commentary, or specifics not in the data.

Output as plain markdown with these exact section headers:

# Quarterly LP Update

## Letter from the partner
(2-3 sentences setting the tone of the quarter. Keep generic if no signals available.)

## Portfolio overview
(One short paragraph naming the size of the active portfolio and aggregate NAV if computable.)

## Portfolio company updates
(One short paragraph per company. Lead with company name in bold. State sector + geography + ownership + thesis status. Mention valuation only if explicit. If "Last update" is "none logged", write "Update pending.")

## Liquidity events this quarter
(If any companies are status=exited, mention them. Otherwise write "No exits this quarter.")

## Outlook
(One short paragraph. No predictions — restate what the firm is focused on.)

PORTFOLIO DATA:
${lines}`
}
