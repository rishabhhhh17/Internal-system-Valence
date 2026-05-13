import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { HelpCircle, X, ArrowLeft, ArrowRight, Sparkles, Check } from 'lucide-react'
import { tutorialFor } from '../lib/tutorials.js'

// --------------------------------------------------------------------------------
// Anchored, spotlight-based tour.
//
// Each step in lib/tutorials.js may carry a `target` CSS selector and a
// `placement`. When a target exists on-screen, the overlay punches a hole
// around it ("spotlight") and floats the popover beside it with an arrow.
// When no target is found (or none was provided), the popover gracefully
// renders as a centered modal — so the tour never breaks if a page hasn't
// yet been instrumented with data-tour attributes.
//
// First-time arrival on any page auto-opens the tour once. Returning users
// see a quiet "Tour" pill at the top-right; the dot disappears after they've
// seen the page's tour.
// --------------------------------------------------------------------------------

const SEEN_KEY      = 'valence.tutorialsSeen.v2'
const FIRST_RUN_KEY = 'valence.tutorialFirstRun.v1'
const SPOTLIGHT_PAD = 10
const POPOVER_MAX_W = 360
const POPOVER_GAP   = 14
const ARROW_SZ      = 10
const SCREEN_PAD    = 16

function readSeen()     { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') } catch { return {} } }
function writeSeen(map) { try { localStorage.setItem(SEEN_KEY, JSON.stringify(map)) } catch {} }
function firstRunDone() { try { return Boolean(localStorage.getItem(FIRST_RUN_KEY)) } catch { return true } }
function markFirstRun() { try { localStorage.setItem(FIRST_RUN_KEY, '1') } catch {} }

function popoverWidth() {
  if (typeof window === 'undefined') return POPOVER_MAX_W
  return Math.min(POPOVER_MAX_W, window.innerWidth - SCREEN_PAD * 2)
}

function getTargetRect(selector) {
  if (!selector) return null
  try {
    const el = document.querySelector(selector)
    if (!el) return null
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) return null
    return { top: r.top, left: r.left, width: r.width, height: r.height, el }
  } catch { return null }
}

// Pick the best of 4 sides for the popover. Each candidate is clamped into
// the viewport; we pick the first that fits without clamping, and otherwise
// the one with the most natural space (smallest required clamp shift).
function placePopover(rect, preferred, popoverH, popoverW) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (!rect) return null

  const ideal = (p) => {
    if (p === 'bottom') return { top: rect.top + rect.height + POPOVER_GAP, left: rect.left + rect.width / 2 - popoverW / 2 }
    if (p === 'top')    return { top: rect.top - popoverH - POPOVER_GAP,    left: rect.left + rect.width / 2 - popoverW / 2 }
    if (p === 'right')  return { top: rect.top + rect.height / 2 - popoverH / 2, left: rect.left + rect.width + POPOVER_GAP }
    /* left */          return { top: rect.top + rect.height / 2 - popoverH / 2, left: rect.left - popoverW - POPOVER_GAP }
  }

  const clamp = (t, l) => ({
    top:  Math.max(SCREEN_PAD, Math.min(t, vh - popoverH - SCREEN_PAD)),
    left: Math.max(SCREEN_PAD, Math.min(l, vw - popoverW - SCREEN_PAD))
  })

  // Drop sides that don't have any room at all so we don't sit ON the target.
  const sideHasRoom = (p) => {
    if (p === 'bottom') return vh - (rect.top + rect.height) >= popoverH + POPOVER_GAP + SCREEN_PAD
    if (p === 'top')    return rect.top                       >= popoverH + POPOVER_GAP + SCREEN_PAD
    if (p === 'right')  return vw - (rect.left + rect.width) >= popoverW + POPOVER_GAP + SCREEN_PAD
    /* left */          return rect.left                       >= popoverW + POPOVER_GAP + SCREEN_PAD
  }

  const order = [preferred, oppositeOf(preferred), 'bottom', 'top', 'right', 'left']
    .filter((v, i, a) => v && a.indexOf(v) === i)

  // First pass: pick the first side with real room.
  for (const p of order) {
    if (sideHasRoom(p)) {
      const i = ideal(p)
      const c = clamp(i.top, i.left)
      return { ...c, placement: p }
    }
  }
  // Nothing fits beside the target — drop the popover into the bottom-most
  // free region of the viewport (above-or-below the target, whichever has
  // more room).
  const roomBelow = vh - (rect.top + rect.height)
  const roomAbove = rect.top
  if (roomBelow > roomAbove) {
    const i = ideal('bottom')
    return { ...clamp(i.top, i.left), placement: 'bottom' }
  }
  const i = ideal('top')
  return { ...clamp(i.top, i.left), placement: 'top' }
}

function oppositeOf(p) { return { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }[p] }

function scrollIntoViewSoft(el) {
  if (!el) return
  try { el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }) } catch {}
}

export default function TutorialButton() {
  const { pathname }      = useLocation()
  const [open, setOpen]   = useState(false)
  const [step, setStep]   = useState(0)
  const [seen, setSeen]   = useState(() => readSeen())
  const [rect, setRect]   = useState(null)
  const [pos,  setPos]    = useState(null)
  const [popH, setPopH]   = useState(220)
  const [popW, setPopW]   = useState(() => popoverWidth())
  const popRef            = useRef(null)

  const tour    = tutorialFor(pathname)
  const total   = tour.steps.length
  const current = tour.steps[step] || tour.steps[0]
  const isLast  = step === total - 1
  const beenSeenHere = Boolean(seen[pathname])

  useEffect(() => { setStep(0) }, [pathname])

  // Auto-open the very first time the app is opened.
  useEffect(() => {
    if (firstRunDone()) return
    const t = setTimeout(() => { setOpen(true); markFirstRun() }, 600)
    return () => clearTimeout(t)
  }, [])

  // Recompute target rect + popover position.
  const measure = useCallback(() => {
    if (!open) return
    const r = getTargetRect(current.target)
    if (r) {
      const vh = window.innerHeight
      if (r.top < SCREEN_PAD || r.top + r.height > vh - SCREEN_PAD) scrollIntoViewSoft(r.el)
    }
    const w = popoverWidth()
    setPopW(w)
    setRect(r)
    setPos(r ? placePopover(r, current.placement || 'bottom', popH, w) : null)
  }, [open, current, popH])

  // Observe the popover's actual rendered size — text wraps differently per
  // step, so the height we used for positioning may be wrong on first paint.
  useLayoutEffect(() => {
    if (!open || !popRef.current) return
    const el = popRef.current
    const obs = new ResizeObserver(() => {
      const h = el.offsetHeight
      if (h && Math.abs(h - popH) > 2) setPopH(h)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [open, step, popH])

  useLayoutEffect(() => {
    if (!open) return
    measure()
    const raf = requestAnimationFrame(measure)
    const t   = setTimeout(measure, 220)
    return () => { cancelAnimationFrame(raf); clearTimeout(t) }
  }, [open, step, pathname, popH, measure])

  useEffect(() => {
    if (!open) return
    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [open, measure])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape')     close(false)
      if (e.key === 'ArrowRight') setStep(s => Math.min(s + 1, total - 1))
      if (e.key === 'ArrowLeft')  setStep(s => Math.max(s - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, total])

  function close(markSeen) {
    if (markSeen) {
      const next = { ...seen, [pathname]: new Date().toISOString() }
      setSeen(next); writeSeen(next)
    }
    setOpen(false)
  }

  function nextStep() {
    if (isLast) { close(true); return }
    setStep(s => Math.min(s + 1, total - 1))
  }

  const hasSpotlight = Boolean(rect)
  const spot = rect ? {
    x: rect.left - SPOTLIGHT_PAD,
    y: rect.top  - SPOTLIGHT_PAD,
    w: rect.width  + SPOTLIGHT_PAD * 2,
    h: rect.height + SPOTLIGHT_PAD * 2
  } : null

  // For the arrow we want to know where to point. Use the un-clamped target
  // centre relative to the popover's clamped top/left.
  let arrowOffset = null
  if (hasSpotlight && pos && pos.placement !== 'center') {
    const targetCX = rect.left + rect.width / 2
    const targetCY = rect.top  + rect.height / 2
    if (pos.placement === 'top' || pos.placement === 'bottom') {
      arrowOffset = Math.max(20, Math.min(targetCX - pos.left, popW - 20))
    } else {
      arrowOffset = Math.max(20, Math.min(targetCY - pos.top,  popH - 20))
    }
  }

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
        data-tour="topbar-tour-button"
      >
        <HelpCircle className="h-3 w-3" />
        Tour
        {!beenSeenHere && <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-valence-blue shadow-[0_0_6px_#3399FF]" />}
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] overflow-hidden" role="dialog" aria-modal="true" aria-label={`Tour: ${tour.title}`}>
          {hasSpotlight ? (
            <svg
              className="absolute inset-0 w-full h-full"
              style={{ pointerEvents: 'auto' }}
              onClick={() => close(false)}
            >
              <defs>
                <mask id="vl-tour-mask">
                  <rect width="100%" height="100%" fill="white" />
                  <rect
                    x={spot.x} y={spot.y} width={spot.w} height={spot.h}
                    rx="10" ry="10" fill="black"
                  />
                </mask>
              </defs>
              <rect width="100%" height="100%" fill="rgba(11,15,32,0.55)" mask="url(#vl-tour-mask)" />
              <rect
                x={spot.x} y={spot.y} width={spot.w} height={spot.h}
                rx="10" ry="10"
                fill="none"
                stroke="#3399FF"
                strokeWidth="2"
                style={{ filter: 'drop-shadow(0 0 8px rgba(51,153,255,0.6))', pointerEvents: 'none' }}
              >
                <animate attributeName="stroke-opacity" values="1;0.4;1" dur="1.8s" repeatCount="indefinite" />
              </rect>
            </svg>
          ) : (
            <div className="absolute inset-0 bg-valence-ink/45 backdrop-blur-sm animate-fade-in" onClick={() => close(false)} />
          )}

          <div
            ref={popRef}
            className="absolute animate-slide-up rounded-2xl border border-valence-border bg-white shadow-valence-lg"
            style={
              pos
                ? { top: pos.top, left: pos.left, width: popW, maxHeight: 'calc(100vh - 32px)', overflow: 'hidden' }
                : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: popW, maxHeight: 'calc(100vh - 32px)', overflow: 'hidden' }
            }
            role="document"
          >
            {arrowOffset !== null && pos && (
              <ArrowMarker placement={pos.placement} offset={arrowOffset} popH={popH} popW={popW} />
            )}

            <div className="flex items-start justify-between gap-3 border-b border-valence-border px-5 py-3.5">
              <div className="min-w-0">
                <p className="vl-eyebrow-ink inline-flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-valence-blue" /> Tour · {tour.title}
                </p>
                <p className="mt-1 text-[11px] text-valence-muted line-clamp-2">{tour.blurb}</p>
              </div>
              <button onClick={() => close(false)} className="vl-btn-ghost shrink-0 -mr-2" aria-label="Close tour">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-4">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-valence-subtle">
                <span>Step {step + 1} of {total}</span>
                <span className="flex-1 h-1 rounded-full bg-valence-surface overflow-hidden">
                  <span className="block h-full bg-valence-blue transition-all" style={{ width: `${((step + 1) / total) * 100}%` }} />
                </span>
              </div>
              <h3 className="mt-3 font-display text-[15px] font-semibold leading-snug text-valence-text">
                {current.title}
              </h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-valence-muted">
                {current.body}
              </p>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-valence-border px-5 py-3">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setStep(s => Math.max(s - 1, 0))}
                  disabled={step === 0}
                  className="vl-btn-ghost text-[11px] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ArrowLeft className="h-3 w-3" /> Back
                </button>
                {!isLast && (
                  <button
                    onClick={() => close(true)}
                    className="text-[11px] font-medium text-valence-subtle hover:text-valence-muted transition"
                    title="Skip the rest of this tour"
                  >
                    Skip
                  </button>
                )}
              </div>

              <div className="hidden sm:flex items-center gap-1">
                {tour.steps.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setStep(i)}
                    className={`h-1.5 w-1.5 rounded-full transition ${i === step ? 'bg-valence-blue' : 'bg-valence-border hover:bg-valence-subtle'}`}
                    aria-label={`Step ${i + 1}`}
                  />
                ))}
              </div>

              <button onClick={nextStep} className="vl-btn-primary text-[11px]">
                {isLast ? <><Check className="h-3 w-3" /> Got it</> : <>Next <ArrowRight className="h-3 w-3" /></>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// Tiny triangle pointing at the spotlit target. The offset is computed so the
// tip lands on the target's centre even when the popover got clamped.
function ArrowMarker({ placement, offset, popH, popW }) {
  let style = {}
  if (placement === 'top' || placement === 'bottom') {
    style = {
      left: offset - ARROW_SZ,
      [placement === 'top' ? 'bottom' : 'top']: -ARROW_SZ,
      width: 0, height: 0,
      borderLeft:   `${ARROW_SZ}px solid transparent`,
      borderRight:  `${ARROW_SZ}px solid transparent`,
      [placement === 'top' ? 'borderTop' : 'borderBottom']: `${ARROW_SZ}px solid white`
    }
  } else {
    style = {
      top: offset - ARROW_SZ,
      [placement === 'left' ? 'right' : 'left']: -ARROW_SZ,
      width: 0, height: 0,
      borderTop:    `${ARROW_SZ}px solid transparent`,
      borderBottom: `${ARROW_SZ}px solid transparent`,
      [placement === 'left' ? 'borderLeft' : 'borderRight']: `${ARROW_SZ}px solid white`
    }
  }
  return <span aria-hidden="true" className="absolute" style={style} />
}
