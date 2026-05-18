import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  HelpCircle, X, ArrowLeft, ArrowRight, Sparkles, Check,
  Zap, Compass, Rocket, ChevronRight
} from 'lucide-react'
import { tutorialFor, QUICK_TRIAL, ADVANCED_TRIAL } from '../lib/tutorials.js'

// Portal helper. The Tour button is mounted inside the Topbar, which uses
// `backdrop-filter` — that creates a new containing block for any
// `position: fixed` descendant, so `fixed inset-0` would only cover the
// topbar (a 60px-tall strip) instead of the viewport. Rendering via a
// portal to <body> escapes that containing block.
function ToBody({ children }) {
  if (typeof document === 'undefined') return null
  return createPortal(children, document.body)
}

// --------------------------------------------------------------------------------
// Tour center. Three modes off one entry point:
//   menu      — the launcher cards (default when the pill is clicked)
//   quick     — per-page spotlight tour from tutorialFor(pathname)
//   trial     — multi-page scripted hands-on (QUICK_TRIAL)
//   advanced  — deeper multi-page scripted walk-through (ADVANCED_TRIAL)
//
// `trial` and `advanced` reuse the same spotlight runner as `quick` — the only
// difference is that each step also carries a `route`, and we auto-navigate
// across the firm as the user clicks Next.
// --------------------------------------------------------------------------------

const SEEN_KEY      = 'valence.tutorialsSeen.v2'
const FIRST_RUN_KEY = 'valence.tutorialFirstRun.v1'
const SPOTLIGHT_PAD = 10
const POPOVER_MAX_W = 360
const POPOVER_GAP   = 14
const ARROW_SZ      = 10
const SCREEN_PAD    = 16
const ROUTE_WAIT_MS = 350           // after a navigate(), give the page time to paint

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

function placePopover(rect, preferred, popoverH, popoverW) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (!rect) return null

  const ideal = (p) => {
    if (p === 'bottom') return { top: rect.top + rect.height + POPOVER_GAP, left: rect.left + rect.width / 2 - popoverW / 2 }
    if (p === 'top')    return { top: rect.top - popoverH - POPOVER_GAP,    left: rect.left + rect.width / 2 - popoverW / 2 }
    if (p === 'right')  return { top: rect.top + rect.height / 2 - popoverH / 2, left: rect.left + rect.width + POPOVER_GAP }
    return                     { top: rect.top + rect.height / 2 - popoverH / 2, left: rect.left - popoverW - POPOVER_GAP }
  }
  const clamp = (t, l) => ({
    top:  Math.max(SCREEN_PAD, Math.min(t, vh - popoverH - SCREEN_PAD)),
    left: Math.max(SCREEN_PAD, Math.min(l, vw - popoverW - SCREEN_PAD))
  })
  const sideHasRoom = (p) => {
    if (p === 'bottom') return vh - (rect.top + rect.height) >= popoverH + POPOVER_GAP + SCREEN_PAD
    if (p === 'top')    return rect.top                       >= popoverH + POPOVER_GAP + SCREEN_PAD
    if (p === 'right')  return vw - (rect.left + rect.width) >= popoverW + POPOVER_GAP + SCREEN_PAD
    return                     rect.left                       >= popoverW + POPOVER_GAP + SCREEN_PAD
  }

  const order = [preferred, oppositeOf(preferred), 'bottom', 'top', 'right', 'left']
    .filter((v, i, a) => v && a.indexOf(v) === i)

  for (const p of order) {
    if (sideHasRoom(p)) {
      const i = ideal(p)
      return { ...clamp(i.top, i.left), placement: p }
    }
  }
  const roomBelow = vh - (rect.top + rect.height)
  const roomAbove = rect.top
  const p = roomBelow > roomAbove ? 'bottom' : 'top'
  const i = ideal(p)
  return { ...clamp(i.top, i.left), placement: p }
}

function oppositeOf(p) { return { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }[p] }

function scrollIntoViewSoft(el) {
  if (!el) return
  try { el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }) } catch {}
}

// ─── Public entry point ─────────────────────────────────────────────────────────

export default function TutorialButton() {
  const { pathname } = useLocation()
  const [mode, setMode]  = useState(null)         // null | 'menu' | 'quick' | 'video' | 'trial' | 'advanced'
  const [seen, setSeen]  = useState(() => readSeen())
  // `engaged` = has the user ever opened the Tour Center on this browser?
  // Drives the pulsing attention-glow on the topbar pill. Once they click
  // even once, the pulse stops permanently — repeats would feel naggy.
  const [engaged, setEngaged] = useState(() => firstRunDone())
  const beenSeenHere     = Boolean(seen[pathname])

  // No auto-open. The Tour pill in the topbar pulses on first visit (see
  // animation classes below) until the user clicks it themselves — much
  // calmer first impression than a modal that ambushes them on landing.

  // The welcome overlay (or any other surface) can still dispatch
  // `valence:start-tour` with detail.mode = 'menu'|'quick'|'trial'|'advanced'
  // to open the tour explicitly.
  useEffect(() => {
    const onExternal = (e) => {
      const next = e?.detail?.mode || 'menu'
      setMode(next)
      markFirstRun()
    }
    window.addEventListener('valence:start-tour', onExternal)
    return () => window.removeEventListener('valence:start-tour', onExternal)
  }, [])

  function onClose(markSeenForPath) {
    if (markSeenForPath) {
      const next = { ...seen, [markSeenForPath]: new Date().toISOString() }
      setSeen(next); writeSeen(next)
    }
    setMode(null)
  }

  return (
    <>
      <button
        onClick={() => { setMode('menu'); if (!engaged) { markFirstRun(); setEngaged(true) } }}
        className={`relative inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
          engaged
            ? 'border-valence-border bg-valence-elevated text-valence-muted hover:text-valence-text'
            : 'border-valence-blue/50 bg-valence-blue-soft text-valence-blue hover:bg-valence-blue-soft/80 animate-attention-glow'
        }`}
        title="Tour the product"
        data-tour="topbar-tour-button"
      >
        {/* Expanding ring + pulsing dot — only on first ever visit. Stops the
            moment the partner clicks the pill, so it never feels naggy. */}
        {!engaged && (
          <span
            aria-hidden
            className="absolute inset-0 rounded-full border border-valence-blue/60 animate-attention-ring pointer-events-none"
          />
        )}
        <HelpCircle className="h-3 w-3" />
        Tour
        {!engaged && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-valence-blue shadow-[0_0_6px_#3399FF] animate-pulse-soft"
          />
        )}
      </button>

      {mode === 'menu'     && <TourMenu       onPick={setMode} onClose={() => setMode(null)} />}
      {mode === 'quick'    && <SpotlightRunner kind="quick"    pathname={pathname} onClose={onClose} />}
      {mode === 'trial'    && <SpotlightRunner kind="trial"    pathname={pathname} onClose={onClose} />}
      {mode === 'advanced' && <SpotlightRunner kind="advanced" pathname={pathname} onClose={onClose} />}
    </>
  )
}

// ─── Tour menu — four big cards ────────────────────────────────────────────────

function TourMenu({ onPick, onClose }) {
  return (
    <ToBody>
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Tour ValenceOS">
      <div className="absolute inset-0 bg-valence-ink/45 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative mx-auto mt-[10vh] w-[min(680px,calc(100vw-32px))] animate-slide-up rounded-2xl border border-valence-border bg-valence-elevated shadow-valence-lg">
        <div className="flex items-start justify-between gap-3 border-b border-valence-border px-6 py-4">
          <div>
            <p className="vl-eyebrow-ink inline-flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-valence-blue" /> Tour ValenceOS
            </p>
            <h2 className="mt-1 font-display text-lg font-semibold tracking-tight text-valence-text">
              Pick how you want to walk through
            </h2>
            <p className="mt-1 text-[12px] text-valence-muted">
              Built for boutique IB firms — Mandate · Pre-Mandate · teaser · IM · LOI · SPA. Not a CRM.
            </p>
          </div>
          <button onClick={onClose} className="vl-btn-ghost shrink-0 -mr-2" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-6">
          <TourCard
            icon={Zap}
            tone="blue"
            title="Quick tour"
            sub="60-second spotlight"
            body="A handful of pointers around this page. The fastest way to see what's where."
            onClick={() => onPick('quick')}
          />
          <TourCard
            icon={Compass}
            tone="green"
            title="Guided trial"
            sub="5-min · 8 pages"
            body="We walk you across the firm — Today, Deals, Funds, People, Screener, Knowledge. Click Next at your own pace."
            onClick={() => onPick('trial')}
            recommended
          />
          <TourCard
            icon={Rocket}
            tone="amber"
            title="Advanced trial"
            sub="10-min · 10 pages"
            body="The same loop, plus the AI surfaces — Mandate Screener, Intake triage, Knowledge Ask, Team Calendar slot finder."
            onClick={() => onPick('advanced')}
          />
        </div>

        <div className="border-t border-valence-border px-6 py-3 flex items-center justify-between text-[11px] text-valence-subtle">
          <span>Press <span className="vl-kbd">Esc</span> any time to exit a tour.</span>
          <span>Built by Rishabh — questions: <a className="text-valence-blue hover:underline" href="mailto:rishabh@valencegrowth.com">rishabh@valencegrowth.com</a></span>
        </div>
      </div>
    </div>
    </ToBody>
  )
}

function TourCard({ icon: Icon, tone, title, sub, body, onClick, recommended }) {
  const tones = {
    blue:   'border-valence-blue/30 bg-valence-blue-soft text-valence-blue',
    violet: 'border-violet-300/40 bg-violet-50 text-violet-600',
    green:  'border-emerald-300/40 bg-emerald-50 text-emerald-600',
    amber:  'border-amber-300/40 bg-amber-50 text-amber-700'
  }
  return (
    <button
      onClick={onClick}
      className="group relative rounded-xl border border-valence-border bg-valence-elevated p-4 text-left transition hover:border-valence-ink/30 hover:shadow-valence"
    >
      {recommended && (
        <span className="absolute -top-2 right-3 inline-flex items-center rounded-full bg-valence-ink px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white">
          Recommended
        </span>
      )}
      <div className="flex items-start gap-3">
        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="font-display font-semibold tracking-tight text-valence-text">{title}</p>
            <ChevronRight className="h-3.5 w-3.5 text-valence-subtle group-hover:text-valence-text transition" />
          </div>
          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-valence-subtle">{sub}</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-valence-muted">{body}</p>
        </div>
      </div>
    </button>
  )
}

// ─── Spotlight runner — used by quick / trial / advanced ───────────────────────

function SpotlightRunner({ kind, pathname, onClose }) {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState(null)
  const [pos,  setPos]  = useState(null)
  const [popH, setPopH] = useState(220)
  const [popW, setPopW] = useState(() => popoverWidth())
  const [retry, setRetry] = useState(0)        // bumps when target isn't ready yet
  const popRef = useRef(null)

  // Pick the right script.
  const tour =
    kind === 'trial'    ? QUICK_TRIAL
  : kind === 'advanced' ? ADVANCED_TRIAL
  :                       tutorialFor(pathname)

  const total   = tour.steps.length
  const current = tour.steps[step] || tour.steps[0]
  const isLast  = step === total - 1
  const scripted = kind === 'trial' || kind === 'advanced'

  // For scripted tours: auto-navigate when the step's route differs from the
  // current one. The route change re-renders Layout; we then retry measure
  // until the target shows up (or fall through to a centered modal step).
  useEffect(() => {
    if (!scripted) return
    const want = current.route
    if (want && want !== pathname) {
      navigate(want)
    }
  }, [scripted, step, current.route, pathname, navigate])

  // Measure target + position popover.
  const measure = useCallback(() => {
    const r = getTargetRect(current.target)
    if (r) {
      const vh = window.innerHeight
      if (r.top < SCREEN_PAD || r.top + r.height > vh - SCREEN_PAD) scrollIntoViewSoft(r.el)
    }
    const w = popoverWidth()
    setPopW(w)
    setRect(r)
    setPos(r ? placePopover(r, current.placement || 'bottom', popH, w) : null)
  }, [current, popH])

  // ResizeObserver tracks the popover's actual rendered height — step copy
  // varies in length so a single estimate would let some steps clip.
  useLayoutEffect(() => {
    if (!popRef.current) return
    const el = popRef.current
    const obs = new ResizeObserver(() => {
      const h = el.offsetHeight
      if (h && Math.abs(h - popH) > 2) setPopH(h)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [step, popH])

  // Measure on step / pathname / height / retry change.
  useLayoutEffect(() => {
    measure()
    const raf = requestAnimationFrame(measure)
    const t1  = setTimeout(measure, ROUTE_WAIT_MS)
    const t2  = setTimeout(measure, ROUTE_WAIT_MS + 300)
    return () => { cancelAnimationFrame(raf); clearTimeout(t1); clearTimeout(t2) }
  }, [step, pathname, popH, retry, measure])

  // If we're in a scripted tour, the target may not exist yet — retry every
  // 150ms for up to 1.5s before giving up and showing the centered version.
  useEffect(() => {
    if (!current.target) return
    if (rect) return
    if (retry > 10) return
    const t = setTimeout(() => setRetry(r => r + 1), 150)
    return () => clearTimeout(t)
  }, [current.target, rect, retry])

  useEffect(() => { setRetry(0) }, [step])

  useEffect(() => {
    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [measure])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape')     onClose(scripted ? null : pathname)
      if (e.key === 'ArrowRight') setStep(s => Math.min(s + 1, total - 1))
      if (e.key === 'ArrowLeft')  setStep(s => Math.max(s - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [total, onClose, scripted, pathname])

  function nextStep() {
    if (isLast) { onClose(scripted ? null : pathname); return }
    setStep(s => Math.min(s + 1, total - 1))
  }

  const hasSpotlight = Boolean(rect)
  const spot = rect ? {
    x: rect.left - SPOTLIGHT_PAD,
    y: rect.top  - SPOTLIGHT_PAD,
    w: rect.width  + SPOTLIGHT_PAD * 2,
    h: rect.height + SPOTLIGHT_PAD * 2
  } : null

  let arrowOffset = null
  if (hasSpotlight && pos) {
    const targetCX = rect.left + rect.width / 2
    const targetCY = rect.top  + rect.height / 2
    if (pos.placement === 'top' || pos.placement === 'bottom') {
      arrowOffset = Math.max(20, Math.min(targetCX - pos.left, popW - 20))
    } else {
      arrowOffset = Math.max(20, Math.min(targetCY - pos.top,  popH - 20))
    }
  }

  return (
    <ToBody>
    <div className="fixed inset-0 z-[70] overflow-hidden" role="dialog" aria-modal="true" aria-label={`Tour: ${tour.title}`}>
      {hasSpotlight ? (
        <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'auto' }} onClick={() => onClose(scripted ? null : pathname)}>
          <defs>
            <mask id="vl-tour-mask">
              <rect width="100%" height="100%" fill="white" />
              <rect x={spot.x} y={spot.y} width={spot.w} height={spot.h} rx="10" ry="10" fill="black" />
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(11,15,32,0.55)" mask="url(#vl-tour-mask)" />
          <rect
            x={spot.x} y={spot.y} width={spot.w} height={spot.h}
            rx="10" ry="10"
            fill="none" stroke="#3399FF" strokeWidth="2"
            style={{ filter: 'drop-shadow(0 0 8px rgba(51,153,255,0.6))', pointerEvents: 'none' }}
          >
            <animate attributeName="stroke-opacity" values="1;0.4;1" dur="1.8s" repeatCount="indefinite" />
          </rect>
        </svg>
      ) : (
        <div className="absolute inset-0 bg-valence-ink/45 backdrop-blur-sm animate-fade-in" onClick={() => onClose(scripted ? null : pathname)} />
      )}

      <div
        ref={popRef}
        className="absolute animate-slide-up rounded-2xl border border-valence-border bg-valence-elevated shadow-valence-lg"
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
              <Sparkles className="h-3 w-3 text-valence-blue" /> {scripted ? tour.title : `Tour · ${tour.title}`}
            </p>
            <p className="mt-1 text-[11px] text-valence-muted line-clamp-2">{tour.blurb}</p>
          </div>
          <button onClick={() => onClose(scripted ? null : pathname)} className="vl-btn-ghost shrink-0 -mr-2" aria-label="Close tour">
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
                onClick={() => onClose(scripted ? null : pathname)}
                className="text-[11px] font-medium text-valence-subtle hover:text-valence-muted transition"
                title="Skip the rest"
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
    </ToBody>
  )
}

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
