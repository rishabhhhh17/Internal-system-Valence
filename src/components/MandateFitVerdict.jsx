import { Sparkles, CheckCircle2, AlertTriangle, XCircle, ArrowRight, Check, AlertCircle } from 'lucide-react'
import { isGeminiConfigured } from '../lib/gemini.js'

// Polished verdict block shared between the Quick Screener (live result)
// and the Intake inbox (cached AI output on the submission row).
//
// Replaces the previous flat "small chip + one-liner + list" render with
// an IB-diligence-style card: large color-coded verdict badge, big
// score-out-of-100, lead one-liner, numbered reasoning chips, optional
// convert CTA.
//
// Shape:
//   output = {
//     verdict: 'pursue' | 'review' | 'watch' | 'pass',
//     score:   0..100,
//     one_line: string,
//     lines:    string[]
//   }

const VERDICT_META = {
  pursue: {
    label: 'Pursue',
    icon: CheckCircle2,
    accent: 'emerald',
    blurb: 'Aligns with the firm\'s sweet spot — recommend taking a first meeting.'
  },
  review: {
    label: 'Review',
    icon: AlertTriangle,
    accent: 'amber',
    blurb: 'Borderline — worth a partner read before responding.'
  },
  // alias — the legacy intake column used "watch" instead of "review"
  watch: {
    label: 'Review',
    icon: AlertTriangle,
    accent: 'amber',
    blurb: 'Borderline — worth a partner read before responding.'
  },
  pass: {
    label: 'Pass',
    icon: XCircle,
    accent: 'rose',
    blurb: 'Outside the firm\'s coverage — recommend a polite decline.'
  }
}

const ACCENT_TONE = {
  emerald: {
    pill:    'border-emerald-300/50 bg-emerald-50 text-emerald-700',
    ring:    'ring-emerald-300/40',
    bar:     'bg-emerald-500',
    track:   'bg-emerald-100',
    chipBg:  'bg-emerald-50/60 border-emerald-200/60 text-emerald-900',
    accent:  'text-emerald-700',
    num:     'bg-emerald-600 text-white'
  },
  amber: {
    pill:    'border-amber-300/50 bg-amber-50 text-amber-800',
    ring:    'ring-amber-300/40',
    bar:     'bg-amber-500',
    track:   'bg-amber-100',
    chipBg:  'bg-amber-50/60 border-amber-200/60 text-amber-900',
    accent:  'text-amber-800',
    num:     'bg-amber-600 text-white'
  },
  rose: {
    pill:    'border-rose-300/50 bg-rose-50 text-rose-700',
    ring:    'ring-rose-300/40',
    bar:     'bg-rose-500',
    track:   'bg-rose-100',
    chipBg:  'bg-rose-50/60 border-rose-200/60 text-rose-900',
    accent:  'text-rose-700',
    num:     'bg-rose-600 text-white'
  }
}

export default function MandateFitVerdict({ output, onConvert, dense = false, eyebrow = 'AI Mandate-Fit' }) {
  if (!output) return null
  const verdict = (output.verdict || 'review').toLowerCase()
  const meta = VERDICT_META[verdict] || VERDICT_META.review
  const tone = ACCENT_TONE[meta.accent]
  const Icon = meta.icon
  const score = Math.max(0, Math.min(100, Number(output.score) || 0))
  const lines = (output.lines || []).filter(Boolean).slice(0, 5)

  return (
    <div className={`vl-card relative overflow-hidden ${dense ? 'p-4' : 'p-5'} ring-1 ${tone.ring}`}>
      {/* Subtle gradient bloom behind the verdict for a premium feel — not
          a hard color block, just enough to set the IB-diligence tone. */}
      <div
        className={`absolute -right-10 -top-10 h-32 w-32 rounded-full ${tone.track} opacity-50 blur-2xl`}
        aria-hidden
      />

      <div className="relative">
        {/* Eyebrow */}
        <div className="flex items-center justify-between gap-2">
          <p className="vl-eyebrow-ink inline-flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-valence-blue" /> {eyebrow}
            {!isGeminiConfigured && (
              <span
                className="inline-flex items-center rounded-full border border-amber-300/50 bg-amber-50 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-700"
                title="Heuristic mode — Gemini key not configured. Verdict produced by keyword-scored rules."
              >
                Heuristic
              </span>
            )}
          </p>
          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] ${tone.pill}`}>
            <Icon className="h-3 w-3" /> {meta.label}
          </span>
        </div>

        {/* Score line — big tabular number with the score-out-of-100 bar
            beneath it. Reads like a diligence rating. */}
        <div className="mt-3 flex items-baseline gap-3">
          <span className={`font-display text-[40px] font-semibold leading-none tabular-nums ${tone.accent}`}>
            {score}
          </span>
          <span className="text-[12px] text-valence-muted">/ 100</span>
        </div>
        <div className={`mt-2 h-1.5 w-full rounded-full overflow-hidden ${tone.track}`}>
          <div
            className={`h-full ${tone.bar} transition-[width] duration-700 ease-out`}
            style={{ width: `${score}%` }}
            aria-hidden
          />
        </div>

        {/* Lead one-liner */}
        {output.one_line && (
          <p className="mt-4 text-[14px] leading-relaxed text-valence-text">
            {output.one_line}
          </p>
        )}

        {/* Reasoning chips — numbered so partners can reference "point 3" in
            conversation. Each line carries a ✓ or ⚠ marker depending on
            whether it reads as supporting evidence or a caution. Lets a
            partner scan the *shape* of the reasoning before reading. */}
        {lines.length > 0 && (
          <ol className="mt-3 space-y-1.5">
            {lines.map((l, i) => {
              const signal = signalFor(l)
              const SignalIcon = signal === 'positive' ? Check : signal === 'caution' ? AlertCircle : null
              return (
                <li key={i} className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 text-[12.5px] leading-relaxed ${tone.chipBg}`}>
                  <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold tabular-nums ${tone.num}`}>
                    {i + 1}
                  </span>
                  {SignalIcon && (
                    <SignalIcon
                      className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${signal === 'positive' ? 'text-emerald-600' : 'text-amber-700'}`}
                      aria-label={signal === 'positive' ? 'Supporting' : 'Caution'}
                    />
                  )}
                  <span>{l}</span>
                </li>
              )
            })}
          </ol>
        )}

        {/* Footnote + CTA */}
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-valence-border pt-3">
          <p className="text-[11px] text-valence-subtle">{meta.blurb}</p>
          {verdict === 'pursue' && onConvert && (
            <button onClick={onConvert} className="vl-btn-primary text-[11px] shrink-0">
              Convert to mandate <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Heuristic classifier for a reasoning line. Returns 'positive' for lines
// that read as supporting evidence ("Sector match...", "...sits inside the
// firm's band"), 'caution' for lines that read as risks ("hard exclude",
// "below the firm's floor"), 'neutral' otherwise. Cheap pattern match —
// good enough to colour a chip without an LLM call.
const POSITIVE_PHRASES = [
  'match', 'aligns', 'aligned', 'inside', 'fits', 'in band', 'in the band',
  'within', 'familiar', 'sweet spot', 'comfortably', 'precedent', 'crossover',
  'mission-aligned'
]
const CAUTION_PHRASES = [
  'unclear', 'not disclosed', 'no firm-coverage', 'no match', 'outside',
  'exceeds', 'below', 'not on the radar', 'hard exclude',
  'recommend a polite decline', 'borderline', 'adjacent', 'specialist'
]
function signalFor(line) {
  if (!line) return 'neutral'
  const t = String(line).toLowerCase()
  if (CAUTION_PHRASES.some(p => t.includes(p))) return 'caution'
  if (POSITIVE_PHRASES.some(p => t.includes(p))) return 'positive'
  return 'neutral'
}
