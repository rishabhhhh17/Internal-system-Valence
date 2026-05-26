// VC tool — Deck Summariser.
//
// Paste a pitch deck's text (or copy/paste a one-pager) and Gemini
// extracts the structured info a VC partner needs at a glance:
// company, sector, stage, ARR, founders, ask. Saves the model from
// reading 30 slides to know if it's interesting.

import { useState } from 'react'
import { Sparkles, Loader2, Copy, Check, FileUp } from 'lucide-react'
import { llmCall } from '../lib/gemini.js'
import { useToast } from '../components/Toast.jsx'
import { humanError } from '../lib/userError.js'
import SectionHeader from '../components/ui/SectionHeader.jsx'
import AIBadge from '../components/ui/AIBadge.jsx'

export default function DeckSummariser() {
  const toast = useToast()
  const [raw, setRaw]       = useState('')
  const [result, setResult] = useState(null)
  const [running, setRunning] = useState(false)
  const [copied, setCopied] = useState(false)

  async function run() {
    if (!raw.trim()) return
    setRunning(true); setResult(null)
    try {
      const text = await llmCall(buildPrompt(raw), {
        temperature: 0.15, maxOutputTokens: 700, actionType: 'deck_summariser',
        responseMimeType: 'application/json'
      })
      const parsed = safeParse(text)
      if (!parsed) throw new Error('Model returned an unexpected shape.')
      setResult(parsed)
    } catch (e) {
      toast.error(humanError(e, 'Could not summarise.'))
    } finally { setRunning(false) }
  }

  function copySummary() {
    if (!result) return
    const md = renderMd(result)
    try {
      navigator.clipboard?.writeText(md)
      setCopied(true); toast.success('Summary copied.')
      setTimeout(() => setCopied(false), 1500)
    } catch { toast.error('Clipboard blocked.') }
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        eyebrow="Deck Summariser"
        title="Paste a deck. Get the headline."
        sub="Strip the noise from a pitch deck or one-pager. Gemini returns company, sector, stage, ARR, founders, ask — no fluff."
      />

      <div className="vl-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <FileUp className="h-4 w-4 text-valence-blue" />
          <label className="vl-label">Deck text</label>
          <AIBadge />
        </div>
        <textarea
          className="vl-input min-h-[200px] text-sm leading-relaxed"
          placeholder="Paste the deck text here. Copy from PDF, Notion, email, etc. Slide titles + bullet points are enough."
          value={raw} onChange={e => setRaw(e.target.value)}
          disabled={running}
        />
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-valence-subtle">
            We don't store this. Single Gemini call, structured JSON back.
          </p>
          <button onClick={run} disabled={running || !raw.trim()} className="vl-btn-primary">
            {running ? <><Loader2 className="h-4 w-4 animate-spin" /> Reading…</>
                     : <><Sparkles className="h-4 w-4" /> Summarise</>}
          </button>
        </div>
      </div>

      {result && (
        <div className="vl-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-valence-text">Summary</h3>
            <button onClick={copySummary} className="vl-btn-secondary text-xs">
              {copied ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <Field label="Company" value={result.company} />
            <Field label="Sector"  value={result.sector} />
            <Field label="Stage"   value={result.stage} />
            <Field label="ARR / Revenue" value={result.arr} />
            <Field label="Ask (USD)"     value={result.ask} />
            <Field label="Geography"     value={result.geography} />
          </div>
          {result.founders && (
            <div className="rounded-lg border border-valence-border bg-valence-surface/50 px-4 py-3">
              <p className="vl-label">Founders</p>
              <p className="mt-1 text-sm text-valence-text">{result.founders}</p>
            </div>
          )}
          {result.one_liner && (
            <div className="rounded-lg border border-valence-blue/30 bg-valence-blue-soft/50 px-4 py-3">
              <p className="vl-label text-valence-blue-deep">One-liner</p>
              <p className="mt-1 text-sm text-valence-text leading-relaxed">{result.one_liner}</p>
            </div>
          )}
          {result.what_we_dont_know?.length > 0 && (
            <div>
              <p className="vl-label text-valence-muted">What the deck doesn't say</p>
              <ul className="mt-2 space-y-1">
                {result.what_we_dont_know.map((q, i) => (
                  <li key={i} className="text-xs text-valence-text leading-relaxed before:content-['?'] before:text-valence-warning before:font-bold before:mr-2">{q}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Field({ label, value }) {
  return (
    <div className="rounded-lg border border-valence-border bg-valence-surface px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-valence-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-valence-text">{value || '—'}</p>
    </div>
  )
}

function buildPrompt(raw) {
  return `You're a VC analyst reading a pitch deck. Extract structured info only. Don't add commentary. Don't invent.

DECK TEXT:
"""
${raw.slice(0, 6000)}
"""

Return a single JSON object with this exact shape:

{
  "company":    "<company name as stated>",
  "sector":     "<single sector>",
  "stage":      "<Seed | Series A | Series B | Series C | Growth | Other>",
  "arr":        "<ARR / revenue with currency, or '—' if not stated>",
  "ask":        "<round size with currency, or '—'>",
  "geography":  "<primary market, or '—'>",
  "founders":   "<name + 1-line background each, semicolon-separated; or '—'>",
  "one_liner":  "<one short sentence describing the business>",
  "what_we_dont_know": ["<short question>", "<short question>"]
}

Strict rules:
- If a field isn't in the deck, use "—" (em dash), not "N/A" or "Unknown".
- Don't paraphrase or improve — extract what the deck says.
- what_we_dont_know lists at most 3 questions a partner would want answered before a first call.`
}

function safeParse(s) {
  if (!s) return null
  try { return JSON.parse(s) } catch {}
  const m = String(s).match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) } catch {} }
  return null
}

function renderMd(r) {
  const lines = [
    `# ${r.company || '—'}`,
    `**Sector**: ${r.sector || '—'} · **Stage**: ${r.stage || '—'} · **Geography**: ${r.geography || '—'}`,
    '',
    `**ARR / Revenue**: ${r.arr || '—'}`,
    `**Ask**: ${r.ask || '—'}`,
    '',
    r.founders ? `**Founders**: ${r.founders}` : '',
    r.one_liner ? `\n${r.one_liner}\n` : '',
    r.what_we_dont_know?.length ? `\n**Open questions:**\n${r.what_we_dont_know.map(q => `- ${q}`).join('\n')}` : ''
  ]
  return lines.filter(Boolean).join('\n')
}
