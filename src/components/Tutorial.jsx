import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { HelpCircle, X, ArrowLeft, ArrowRight, Sparkles, Check } from 'lucide-react'
import { tutorialFor } from '../lib/tutorials.js'

const SEEN_KEY = 'valence.tutorialsSeen.v1'
function readSeen() { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') } catch { return {} } }
function writeSeen(map) { try { localStorage.setItem(SEEN_KEY, JSON.stringify(map)) } catch {} }

// Floating help button + step-by-step overlay. Context-aware: pulls steps for
// the current pathname every time it opens. Switching routes while open
// auto-loads the new page's tour from step 1.

export default function TutorialButton() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [seen, setSeen] = useState(() => readSeen())

  const tour = tutorialFor(pathname)
  const total = tour.steps.length

  // Reset to step 0 whenever route changes (so the tour follows the user).
  useEffect(() => { setStep(0) }, [pathname])

  // Close on Escape; arrow-key navigation when open.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
      if (e.key === 'ArrowRight') setStep(s => Math.min(s + 1, total - 1))
      if (e.key === 'ArrowLeft')  setStep(s => Math.max(s - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, total])

  function close(markSeen = false) {
    if (markSeen) {
      const next = { ...seen, [pathname]: new Date().toISOString() }
      setSeen(next); writeSeen(next)
    }
    setOpen(false)
  }

  const isLast = step === total - 1
  const beenSeenHere = Boolean(seen[pathname])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`relative inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
          beenSeenHere
            ? 'border-valence-border bg-white text-valence-muted hover:text-valence-text'
            : 'border-valence-blue/40 bg-valence-blue-soft text-valence-blue hover:bg-valence-blue-soft/80'
        }`}
        title="Show me how this page works"
      >
        <HelpCircle className="h-3 w-3" />
        Tour
        {!beenSeenHere && <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-valence-blue shadow-[0_0_6px_#3399FF]" />}
      </button>

      {open && (
        <div className="fixed inset-0 z-[70]">
          <div className="absolute inset-0 bg-valence-ink/40 backdrop-blur-sm animate-fade-in" onClick={() => close(false)} />
          <div className="relative mx-auto mt-[18vh] w-full max-w-md animate-slide-up rounded-2xl border border-valence-border bg-white shadow-valence-lg">
            <div className="flex items-start justify-between gap-3 border-b border-valence-border px-5 py-4">
              <div className="min-w-0">
                <p className="vl-eyebrow-ink inline-flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-valence-blue" /> Tour · {tour.title}
                </p>
                <p className="mt-1.5 text-[11px] text-valence-muted">{tour.blurb}</p>
              </div>
              <button onClick={() => close(false)} className="vl-btn-ghost shrink-0 -mr-2" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-5">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-valence-subtle">
                <span>Step {step + 1} of {total}</span>
                <span className="flex-1 h-1 rounded-full bg-valence-surface overflow-hidden">
                  <span className="block h-full bg-valence-blue transition-all" style={{ width: `${((step + 1) / total) * 100}%` }} />
                </span>
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold text-valence-text">{tour.steps[step].title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-valence-muted">{tour.steps[step].body}</p>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-valence-border px-5 py-3">
              <button
                onClick={() => setStep(s => Math.max(s - 1, 0))}
                disabled={step === 0}
                className="vl-btn-ghost text-[11px] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ArrowLeft className="h-3 w-3" /> Back
              </button>
              <div className="flex items-center gap-1">
                {tour.steps.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setStep(i)}
                    className={`h-1.5 w-1.5 rounded-full transition ${i === step ? 'bg-valence-blue' : 'bg-valence-border hover:bg-valence-subtle'}`}
                    aria-label={`Step ${i + 1}`}
                  />
                ))}
              </div>
              {isLast ? (
                <button onClick={() => close(true)} className="vl-btn-primary text-[11px]">
                  <Check className="h-3 w-3" /> Got it
                </button>
              ) : (
                <button onClick={() => setStep(s => Math.min(s + 1, total - 1))} className="vl-btn-primary text-[11px]">
                  Next <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
