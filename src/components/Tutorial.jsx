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

const SEEN_KEY        = 'valence.tutorialsSeen.v2'
const FIRST_RUN_KEY   = 'valence.tutorialFirstRun.v1'
const SPOTLIGHT_PAD   = 10           // visible padding around the target inside the cutout
const POPOVER_W       = 360          // fixed width — keeps math simple
const POPOVER_GAP     = 14           // gap between target and popover
const ARROW_SZ        = 10           // arrow side-length in px
const SCREEN_PAD      = 16           // viewport padding when clamping
const AUTO_OPEN_DELAY = 450          // let the page paint before spotlighting

function readSeen()      { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') } catch { return {} } }
function writeSeen(map)  { try { localStorage.setItem(SEEN_KEY, JSON.stringify(map)) } catch {} }
function firstRunDone()  { try { return Boolean(localStorage.getItem(FIRST_RUN_KEY)) } catch { return true } }
function markFirstRun()  { try { localStorage.setItem(FIRST_RUN_KEY, '1') } catch {} }

function getTargetRect(selector) {
  if (!selector) return null
  try {
    const el = document.querySelector(selector)
    if (!el) return null
    // Make sure the target is in view before we measure.
    const r = el.getBoundingClientRect()
    return { top: r.top, left: r.left, width: r.width, height: r.height, el }
  } catch { return null }
}

// Compute popover position relative to a target rect. Tries the preferred
// placement first; if the popover would clip the viewport, flips to the
// opposite side; if still no fit, drops to the side with the most room.
function placePopover(rect, placement, popoverH) {
  const vw = window.innerWidth, vh = window.innerHeight
  if (!rect) return null

  const candidates = ['bottom', 'top', 'right', 'left'].filter(p => p !== placement)
  const order = [placement, oppositeOf(placement), ...candidates].filter(Boolean)

  for (const p of order) {
    const pos = tryPlace(rect, p, popoverH, vw, vh)
    if (pos.fits) return { ...pos, placement: p }
  }
  // Last resort — pick the one with the most room.
  const scored = order.map(p => tryPlace(rect, p, popoverH, vw, vh))
  scored.sort((a, b) => b.score - a.score)
  return { ...scored[0], placement: scored[0].placement }
}

function oppositeOf(p) { return { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }[p] || 'bottom' }

function tryPlace(rect, p, h, vw, vh) {
  let top, left, score = 0
  if (p === 'bottom') {
    top  = rect.top + rect.height + POPOVER_GAP
    left = rect.left + rect.width / 2 - POPOVER_W / 2
    score = vh - top
  } else if (p === 'top') {
    top  = rect.top - h - POPOVER_GAP
    left = rect.left + rect.width / 2 - POPOVER_W / 2
    score = rect.top
  } else if (p === 'right') {
    top  = rect.top + rect.height / 2 - h / 2
    left = rect.left + rect.width + POPOVER_GAP
    score = vw - left
  } else {
    // left
    top  = rect.top + rect.height / 2 - h / 2
    left = rect.left - POPOVER_W - POPOVER_GAP
    score = rect.left
  }
  // Clamp into viewport
  const clampedLeft = Math.max(SCREEN_PAD, Math.min(left, vw - POPOVER_W - SCREEN_PAD))
  const clampedTop  = Math.max(SCREEN_PAD, Math.min(top,  vh - h        - SCREEN_PAD))
  const fits =
    clampedTop  >= SCREEN_PAD &&
    clampedTop + h <= vh - SCREEN_PAD &&
    clampedLeft >= SCREEN_PAD &&
    clampedLeft + POPOVER_W <= vw - SCREEN_PAD
  // Track where the arrow needs to point relative to the (un-clamped) ideal so
  // it still lands on the target even when the popover got clamped.
  return { top: clampedTop, left: clampedLeft, placement: p, fits, score, rect }
}

function scrollIntoViewSoft(el) {
  if (!el) return
  try { el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }) } catch {}
}

export default function TutorialButton() {
  const { pathname } = useLocation()
  const [open, setOpen]   = useState(false)
  const [step, setStep]   = useState(0)
  const [seen, setSeen]   = useState(() => readSeen())
  const [rect, setRect]   = useState(null)              // target rect
  const [pos,  setPos]    = useState(null)              // popover {top,left,placement}
  const popRef            = useRef(null)

  const tour    = tutorialFor(pathname)
  const total   = tour.steps.length
  const current = tour.steps[step] || tour.steps[0]
  const isLast  = step === total - 1
  const beenSeenHere = Boolean(seen[pathname])

  // Reset to step 0 whenever route changes.
  useEffect(() => { setStep(0) }, [pathname])

  // Auto-open on first-ever app load: drop the user straight into Today's tour.
  useEffect(() => {
    if (firstRunDone()) return
    const t = setTimeout(() => {
      setOpen(true)
      markFirstRun()
    }, 600)
    return () => clearTimeout(t)
  }, [])

  // Recompute target rect + popover position whenever the step changes or
  // the window resizes/scrolls.
  const measure = useCallback(() => {
    if (!open) return
    const r = getTargetRect(current.target)
    if (r) {
      // Scroll the target into view if it's off-screen.
      const vh = window.innerHeight
      if (r.top < 0 || r.top + r.height > vh) scrollIntoViewSoft(r.el)
    }
    setRect(r)
    const popH = popRef.current?.offsetHeight || 220
    const placement = current.placement || 'bottom'
    setPos(r ? placePopover(r, placement, popH) : null)
  }, [open, current])

  useLayoutEffect(() => {
    if (!open) return
    // Measure twice — once now, once after the next paint, so we catch
    // animated mounts and lazy-rendered targets.
    measure()
    const raf = requestAnimationFrame(measure)
    const t = setTimeout(measure, 200)
    return () => { cancelAnimationFrame(raf); clearTimeout(t) }
  }, [open, step, pathname, measure])

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

  // Keyboard: Escape, arrow keys.
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

  // ---- Spotlight rectangle (with padding) — only when we have a target ----
  const hasSpotlight = Boolean(rect)
  const spot = rect ? {
    x: rect.left - SPOTLIGHT_PAD,
    y: rect.top  - SPOTLIGHT_PAD,
    w: rect.width  + SPOTLIGHT_PAD * 2,
    h: rect.height + SPOTLIGHT_PAD * 2
  } : null

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
        <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={`Tour: ${tour.title}`}>
          {/* Spotlight overlay: SVG mask cuts a rounded rectangle around the
              target. When there's no target, falls back to a full-screen dim. */}
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
              <rect
                width="100%" height="100%"
                fill="rgba(11,15,32,0.55)"
                mask="url(#vl-tour-mask)"
              />
              {/* Animated ring around the spotlight to draw the eye. */}
              <rect
                x={spot.x} y={spot.y} width={spot.w} height={spot.h}
                rx="10" ry="10"
                fill="none"
                stroke="#3399FF"
                strokeWidth="2"
                style={{
                  filter: 'drop-shadow(0 0 8px rgba(51,153,255,0.6))',
                  pointerEvents: 'none'
                }}
              >
                <animate attributeName="stroke-opacity" values="1;0.4;1" dur="1.8s" repeatCount="indefinite" />
              </rect>
            </svg>
          ) : (
            <div className="absolute inset-0 bg-valence-ink/45 backdrop-blur-sm animate-fade-in" onClick={() => close(false)} />
          )}

          {/* Popover — anchored to target if we have one, otherwise centered. */}
          <div
            ref={popRef}
            className="absolute animate-slide-up rounded-2xl border border-valence-border bg-white shadow-valence-lg"
            style={
              pos
                ? { top: pos.top, left: pos.left, width: POPOVER_W }
                : {
                    top: '50%', left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: POPOVER_W
                  }
            }
            role="document"
          >
            {/* Arrow — visible only when we're actually anchored to a target. */}
            {hasSpotlight && pos && pos.placement !== 'center' && (
              <ArrowMarker placement={pos.placement} rect={rect} pos={pos} />
            )}

            <div className="flex items-start justify-between gap-3 border-b border-valence-border px-5 py-3.5">
              <div className="min-w-0">
                <p className="vl-eyebrow-ink inline-flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-valence-blue" /> Tour · {tour.title}
                </p>
                <p className="mt-1 text-[11px] text-valence-muted">{tour.blurb}</p>
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

// ─── Arrow ──────────────────────────────────────────────────────────────────────
// Renders a small triangle on the side of the popover facing the target.
// Positions itself along the popover edge so it visually points at the
// element's centre — even when the popover has been clamped to the viewport.

function ArrowMarker({ placement, rect, pos }) {
  if (!rect || !pos) return null
  const targetCenterX = rect.left + rect.width / 2
  const targetCenterY = rect.top  + rect.height / 2

  // Where along the popover edge should the arrow sit?
  let style = {}
  if (placement === 'top' || placement === 'bottom') {
    // Arrow on horizontal edge
    const localX = Math.max(20, Math.min(targetCenterX - pos.left, POPOVER_W - 20))
    style = {
      left: localX - ARROW_SZ,
      [placement === 'top' ? 'bottom' : 'top']: -ARROW_SZ,
      width: ARROW_SZ * 2,
      height: ARROW_SZ,
      borderLeft:   `${ARROW_SZ}px solid transparent`,
      borderRight:  `${ARROW_SZ}px solid transparent`,
      [placement === 'top' ? 'borderTop' : 'borderBottom']: `${ARROW_SZ}px solid white`
    }
  } else {
    // Arrow on vertical edge
    const popH = (popRefSafe() || 200)
    const localY = Math.max(20, Math.min(targetCenterY - pos.top, popH - 20))
    style = {
      top: localY - ARROW_SZ,
      [placement === 'left' ? 'right' : 'left']: -ARROW_SZ,
      width: ARROW_SZ,
      height: ARROW_SZ * 2,
      borderTop:    `${ARROW_SZ}px solid transparent`,
      borderBottom: `${ARROW_SZ}px solid transparent`,
      [placement === 'left' ? 'borderLeft' : 'borderRight']: `${ARROW_SZ}px solid white`
    }
  }
  return <span aria-hidden="true" className="absolute" style={style} />
}

// Best-effort lookup of popover height for vertical-edge arrow placement.
// (We can't useRef from inside the helper without prop-drilling; this is a
// pragmatic fallback that matches the typical rendered height.)
function popRefSafe() { return 220 }
