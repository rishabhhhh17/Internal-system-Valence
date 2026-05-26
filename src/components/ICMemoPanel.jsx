// IB + PE tool — IC Memo Generator.
//
// One-click: synthesise an IC-ready memo from the deal's data — client,
// sector, financials, brief, notes, recent activity. Returns markdown
// the user can copy/paste into a doc. No DB write — pure derivation.

import { useState } from 'react'
import { FileText, Loader2, Copy, RefreshCw, Sparkles, Check } from 'lucide-react'
import { llmCall } from '../lib/gemini.js'
import { useToast } from './Toast.jsx'
import { humanError } from '../lib/userError.js'
import AIBadge from './ui/AIBadge.jsx'

export default function ICMemoPanel({ deal }) {
  const toast = useToast()
  const [memo, setMemo]       = useState('')
  const [generating, setGen]  = useState(false)
  const [copied, setCopied]   = useState(false)

  async function generate() {
    setGen(true)
    setMemo('')
    try {
      const prompt = buildPrompt(deal)
      const text = await llmCall(prompt, {
        temperature: 0.25,
        maxOutputTokens: 1500,
        actionType: 'ic_memo'
      })
      setMemo(String(text || '').trim())
    } catch (e) {
      toast.error(humanError(e, 'Could not generate IC memo.'))
    } finally {
      setGen(false)
    }
  }

  function copyMemo() {
    if (!memo) return
    try {
      navigator.clipboard?.writeText(memo)
      setCopied(true)
      toast.success('IC memo copied.')
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Clipboard blocked — select and copy by hand.')
    }
  }

  return (
    <div className="vl-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-valence-blue" />
            <h3 className="text-sm font-semibold text-valence-text">IC memo</h3>
            <AIBadge />
          </div>
          <p className="text-xs text-valence-muted mt-0.5">
            One-click memo from this deal's data — client, brief, financials, recent activity.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {memo && (
            <button onClick={copyMemo} className="vl-btn-secondary text-xs">
              {copied ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
            </button>
          )}
          <button onClick={generate} disabled={generating} className="vl-btn-primary-sm">
            {generating
              ? <><Loader2 className="h-3 w-3 animate-spin" /> Drafting…</>
              : memo ? <><RefreshCw className="h-3 w-3" /> Regenerate</>
                     : <><Sparkles className="h-3 w-3" /> Generate</>}
          </button>
        </div>
      </div>

      {!memo && !generating && (
        <div className="rounded-lg border border-dashed border-valence-border bg-valence-surface/30 py-8 text-center text-xs text-valence-muted">
          No memo yet. Click <span className="font-semibold text-valence-blue">Generate</span> to draft one.
        </div>
      )}

      {generating && (
        <div className="rounded-lg border border-valence-border bg-valence-surface/50 py-6 text-center text-xs text-valence-muted">
          <Loader2 className="h-4 w-4 animate-spin text-valence-blue mx-auto mb-2" />
          Composing the IC memo — usually under 10 seconds…
        </div>
      )}

      {memo && (
        <pre className="rounded-lg border border-valence-border bg-valence-surface/40 px-4 py-3 text-[12.5px] leading-relaxed text-valence-text whitespace-pre-wrap font-sans max-h-[480px] overflow-y-auto">
          {memo}
        </pre>
      )}
    </div>
  )
}

function buildPrompt(deal) {
  return `You are drafting an Investment Committee memo for a Mumbai/London advisory + investment firm. Write a tight, partner-ready memo on the mandate below. Use ONLY facts in the data block. No invented numbers, no marketing tone.

Output as plain markdown with these exact section headers (and no others):

# IC Memo · ${deal.client_name}

## Mandate
(2-3 sentences: what the firm is being asked to do.)

## Sector & geography
(1 line.)

## Key financials
(Bullet list of every number provided. If none, write "Not enough data logged yet.")

## Investment rationale
(3-4 sentences: why this deal is worth pursuing.)

## Risks & open questions
(Bullet list. If none stated, write "Not enough data logged yet.")

## Asks
(What the partner needs from the committee — approval, capital, dry-powder allocation, intro support.)

DATA:
- Client: ${deal.client_name}
- Sector: ${deal.sector || '—'}
- Geography: ${deal.geography || '—'}
- Stage: ${deal.stage || '—'}
- Deal type: ${deal.deal_type || deal.deal_subtype || '—'}
- M&A side: ${deal.ma_side || deal.side || '—'}
- Ticket: ${deal.ticket_size_usd_m || deal.target_raise_usd_m || '—'} USD M
- Target close: ${deal.target_close || '—'}
- Lead owner: ${deal.lead_owner || '—'}
- Notes: ${(deal.notes || '').slice(0, 600)}
- Acquisition brief: ${(deal.acquisition_brief || '').slice(0, 600)}
- Engagement brief: ${(deal.engagement_brief || '').slice(0, 400)}
- NDA status: ${deal.nda_status || '—'}

Strict: don't invent fund or buyer names. Don't quote numbers not above.`
}
