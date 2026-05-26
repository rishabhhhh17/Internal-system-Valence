// /screen — Thesis-Fit Checker
//
// VC + PE counterpart to the IB Company⇄Fund matcher. Reuses the
// stored thesis criteria (sectors / geographies / EV band) that
// already drive the Mandate-Fit verdict on the Deal Status page,
// extends it with an AI rationale step over a free-form company
// description the user pastes.
//
// Flow:
//   1. Load this firm's default criteria from public.scoring_criteria
//      via the existing loadDefaultCriteria() helper. If none stored,
//      DEFAULT_CRITERIA (a sensible Indian / SEA growth-stage thesis)
//      fills in. Lets the user override criteria inline for the run.
//   2. User pastes a company description (deck text, founder email,
//      LinkedIn paragraph — anything).
//   3. We send {criteria, description} to Gemini and ask for a
//      per-criterion verdict + overall fit. Strict JSON output.
//   4. Render: overall verdict pill + per-criterion bullets + a
//      one-line rationale.
//
// Gated by the thesis_fit_checker feature flag at the router level.
// Sidebar entry "Thesis-Fit" only shows when the flag is on (default
// for VC + PE).

import { useEffect, useState } from 'react'
import { Sparkles, Loader2, Target, Check, X, AlertTriangle } from 'lucide-react'
import { loadDefaultCriteria, DEFAULT_CRITERIA } from '../lib/fit.js'
import { llmCall } from '../lib/gemini.js'
import { useToast } from '../components/Toast.jsx'
import { humanError } from '../lib/userError.js'

const VERDICT_TONE = {
  strong:  { label: 'Strong fit',   classes: 'bg-valence-success/15 text-valence-success border-valence-success/30' },
  partial: { label: 'Partial fit',  classes: 'bg-valence-blue-soft text-valence-blue-deep border-valence-blue/30' },
  no:      { label: 'No fit',       classes: 'bg-valence-faint text-valence-muted border-valence-border' },
  unsure:  { label: 'Need more info', classes: 'bg-valence-warning/15 text-valence-warning border-valence-warning/30' },
}

export default function ThesisFit() {
  const toast = useToast()
  const [criteria, setCriteria] = useState(DEFAULT_CRITERIA)
  const [criteriaLoaded, setCriteriaLoaded] = useState(false)
  const [description, setDescription]       = useState('')
  const [running, setRunning]                = useState(false)
  const [result, setResult]                  = useState(null)

  useEffect(() => {
    let alive = true
    loadDefaultCriteria()
      .then(c => { if (alive) { setCriteria(c || DEFAULT_CRITERIA); setCriteriaLoaded(true) } })
      .catch(() => { if (alive) setCriteriaLoaded(true) })
    return () => { alive = false }
  }, [])

  async function run() {
    const text = description.trim()
    if (!text) {
      toast.error('Paste a company description first.')
      return
    }
    setRunning(true)
    setResult(null)
    try {
      const prompt = buildPrompt({ criteria, description: text })
      const raw = await llmCall(prompt, {
        temperature: 0.15,
        maxOutputTokens: 700,
        actionType: 'thesis_fit_checker',
        responseMimeType: 'application/json'
      })
      const parsed = safeParse(raw)
      if (!parsed) throw new Error('Model returned an unexpected shape — try again.')
      setResult(parsed)
    } catch (e) {
      toast.error(humanError(e, 'Could not run the fit check.'))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="vl-eyebrow-ink">Thesis-Fit Checker</p>
        <h1 className="mt-2 font-display text-feature font-bold text-valence-text">
          Does this fit your thesis?
        </h1>
        <p className="mt-2 text-sm text-valence-muted">
          Paste a company description, a one-pager, or a founder email. We score
          it against your stored criteria and explain the verdict.
        </p>
      </div>

      {/* Thesis snapshot — the criteria we'll score against. Editable
          inline for one-off "what if I widened to Edtech?" runs without
          touching the saved settings. */}
      <ThesisSnapshot criteria={criteria} onChange={setCriteria} loaded={criteriaLoaded} />

      <div className="vl-card p-5 space-y-3">
        <label className="vl-label">Company description</label>
        <textarea
          className="vl-input min-h-[160px] text-sm leading-relaxed"
          placeholder="Paste a deck summary, a founder email, or your notes from the first call. The more concrete, the better the fit signal."
          value={description}
          onChange={e => setDescription(e.target.value)}
          disabled={running}
        />
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-valence-subtle">
            Nothing is stored. Each run is a one-shot Gemini call against your thesis.
          </p>
          <button
            onClick={run}
            disabled={running || !description.trim()}
            className="vl-btn-primary"
          >
            {running
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Scoring…</>
              : <><Sparkles className="h-4 w-4" /> Run fit check</>
            }
          </button>
        </div>
      </div>

      {result && <Verdict result={result} />}
    </div>
  )
}

function ThesisSnapshot({ criteria, onChange, loaded }) {
  return (
    <div className="vl-card p-5">
      <div className="flex items-start gap-3 mb-3">
        <div className="rounded-lg bg-valence-blue-soft p-2 text-valence-blue">
          <Target className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-valence-text">Your thesis</h3>
          <p className="text-xs text-valence-muted mt-0.5">
            {loaded
              ? 'Pulled from Settings → Advanced → Investment criteria. Edit here for a one-off run; changes don\'t persist.'
              : 'Loading your stored thesis…'}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SnapshotField label="Sectors" value={(criteria.sectors || []).join(', ')   || '—'} />
        <SnapshotField label="Geographies" value={(criteria.geographies || []).join(', ') || '—'} />
        <SnapshotField label="EV band (USD M)"
          value={`${criteria.ev_min_usd_m ?? '—'} – ${criteria.ev_max_usd_m ?? '—'}`} />
      </div>
      {(criteria.excluded_sectors?.length > 0) && (
        <p className="mt-3 text-[11px] text-valence-muted">
          <span className="font-semibold text-valence-text">Excluded:</span> {criteria.excluded_sectors.join(', ')}
        </p>
      )}
    </div>
  )
}

function SnapshotField({ label, value }) {
  return (
    <div className="rounded-lg border border-valence-border bg-valence-surface px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-valence-muted">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-valence-text">{value}</p>
    </div>
  )
}

function Verdict({ result }) {
  const tone = VERDICT_TONE[result.overall] || VERDICT_TONE.unsure
  return (
    <div className="vl-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="vl-eyebrow text-valence-muted">Overall</p>
          <div className={`mt-1 inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 ${tone.classes}`}>
            <span className="text-sm font-bold">{tone.label}</span>
          </div>
        </div>
        {typeof result.score === 'number' && (
          <div className="text-right">
            <p className="vl-eyebrow text-valence-muted">Score</p>
            <p className="mt-1 text-3xl font-bold text-valence-text tabular-nums">{result.score}<span className="text-base text-valence-muted">/100</span></p>
          </div>
        )}
      </div>

      {result.summary && (
        <p className="text-sm leading-relaxed text-valence-text bg-valence-surface/60 rounded-lg p-3.5">
          {result.summary}
        </p>
      )}

      {Array.isArray(result.criteria) && result.criteria.length > 0 && (
        <div className="space-y-2">
          <p className="vl-eyebrow text-valence-muted">Per-criterion verdict</p>
          {result.criteria.map((c, i) => (
            <CriterionRow key={i} item={c} />
          ))}
        </div>
      )}

      {Array.isArray(result.followups) && result.followups.length > 0 && (
        <div className="space-y-1.5">
          <p className="vl-eyebrow text-valence-muted">If you want to be sure, ask</p>
          <ul className="space-y-1">
            {result.followups.map((q, i) => (
              <li key={i} className="text-xs text-valence-text leading-relaxed before:content-['→'] before:text-valence-blue before:font-bold before:mr-2">{q}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function CriterionRow({ item }) {
  // Verdict comes from the prompt schema: 'match' | 'partial' | 'no' | 'unsure'.
  // Keep 'pass' as a legacy alias for 'no' (in case any cached response uses
  // the old vocabulary).
  const v = item.verdict
  const icon = (v === 'no' || v === 'pass')
    ? <X className="h-3.5 w-3.5 text-valence-danger" />
    : (v === 'partial' || v === 'unsure')
      ? <AlertTriangle className="h-3.5 w-3.5 text-valence-warning" />
      : <Check className="h-3.5 w-3.5 text-valence-success" />
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-valence-border bg-valence-surface/40 px-3 py-2.5">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-valence-text">{item.criterion}</p>
        {item.note && <p className="text-xs text-valence-muted leading-relaxed mt-0.5">{item.note}</p>}
      </div>
    </div>
  )
}

// ============ PROMPT BUILDER ============
function buildPrompt({ criteria, description }) {
  const sectors  = (criteria.sectors || []).join(', ') || '—'
  const excluded = (criteria.excluded_sectors || []).join(', ') || '—'
  const geos     = (criteria.geographies || []).join(', ') || '—'
  const evMin    = criteria.ev_min_usd_m ?? '—'
  const evMax    = criteria.ev_max_usd_m ?? '—'

  return `You are an investment-committee analyst at a Mumbai/London growth-equity firm. Score the company described below against the firm's stored thesis. Be ruthless about thesis fit — partners use this to filter, not to find a reason to say yes.

THESIS CRITERIA:
- Sectors of interest: ${sectors}
- Excluded sectors (hard pass): ${excluded}
- Geographies of interest: ${geos}
- Enterprise value band: ${evMin} – ${evMax} USD M

COMPANY DESCRIPTION:
"""
${description.slice(0, 4000)}
"""

Return a single JSON object with this shape and nothing else:

{
  "overall":   "strong" | "partial" | "no" | "unsure",
  "score":    <0-100 integer>,
  "summary":  "<one short sentence explaining the overall verdict, <= 30 words>",
  "criteria": [
    {"criterion": "Sector", "verdict": "match" | "partial" | "no" | "unsure", "note": "<one short sentence>"},
    {"criterion": "Geography", "verdict": "match" | "partial" | "no" | "unsure", "note": "<one short sentence>"},
    {"criterion": "EV band", "verdict": "match" | "partial" | "no" | "unsure", "note": "<one short sentence>"},
    {"criterion": "Stage / traction", "verdict": "match" | "partial" | "no" | "unsure", "note": "<one short sentence>"}
  ],
  "followups": ["<question to ask the founder if anything is unclear>"]
}

Strict rules:
- If the description doesn't say which sector / geography / size the company is in, set that criterion's verdict to "unsure" and ask a followup. Do not guess.
- If the sector is in the excluded list, return overall "no" regardless of other signals.
- "partial" means signal exists but is weak (e.g. company is consumer fintech and the thesis is fintech — close but not exact).
- Keep notes plain, no marketing language.`
}

function safeParse(text) {
  if (!text) return null
  const trimmed = String(text).trim()
  // Most common: model returned the JSON directly because of responseMimeType.
  try { return JSON.parse(trimmed) } catch { /* fall through */ }
  // Fallback: model wrapped JSON in ```json fences or prose.
  const m = trimmed.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) } catch { /* fall through */ } }
  return null
}
