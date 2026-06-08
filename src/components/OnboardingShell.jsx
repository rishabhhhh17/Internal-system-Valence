// Shared chrome for the whole onboarding flow (Login → Welcome →
// Start/Join → Firm type → Profile). One shell so every step reads as a
// single, cohesive, YC-grade flow instead of six slightly-different pages.
//
// Visual language:
//   - Full-bleed aurora background (the design-system `valence-aurora`
//     radial mesh) over the base bg, very subtle, premium.
//   - A single centred column, content rises in with `animate-slide-up`.
//   - Logo top-left, an optional action slot top-right (account switch,
//     step counter, org name).
//   - Optional numbered Stepper under the header.
//   - Quiet legal footer.
//
// Exports: default OnboardingShell, Stepper, ChoiceCard, GoogleGlyph.

import { Link } from 'react-router-dom'
import Logo from './Logo.jsx'

export default function OnboardingShell({
  children,
  right = null,           // top-right slot (e.g. "Use a different account")
  steps = null,           // { current, total, labels?: string[] } → renders Stepper
  maxWidth = 'max-w-xl',  // content column width
  showFooter = true,
  split = null,           // optional left showcase panel (Login only)
}) {
  // Split layout: brand/value panel on the left, action column on the
  // right. Used by Login to give the very first screen real presence.
  if (split) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-valence-bg">
        <AuroraBg />
        <div className="relative mx-auto grid min-h-screen max-w-[1240px] grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
          {/* Left — brand + value, hidden on small screens */}
          <div className="hidden lg:flex flex-col justify-between border-r border-valence-border/60 px-12 py-10 xl:px-16">
            <Logo />
            <div className="max-w-md animate-slide-up">{split}</div>
            <Footer minimal />
          </div>
          {/* Right — the action column */}
          <div className="flex flex-col px-7 py-8 sm:px-12 lg:px-14 lg:py-10">
            <div className="flex items-center justify-between lg:hidden">
              <Logo />
              {right}
            </div>
            <div className="hidden lg:flex justify-end">{right}</div>
            <main className="flex flex-1 items-center">
              <div className="w-full animate-slide-up">{children}</div>
            </main>
            {showFooter && <div className="lg:hidden"><Footer /></div>}
          </div>
        </div>
      </div>
    )
  }

  // Default — single centred column.
  return (
    <div className="relative min-h-screen overflow-hidden bg-valence-bg">
      <AuroraBg />
      <div className={`relative mx-auto flex min-h-screen w-full flex-col px-6 py-8 sm:px-8 ${maxWidth}`}>
        <header className="flex items-center justify-between">
          <Logo />
          {right}
        </header>

        {steps && (
          <div className="mt-8">
            <Stepper current={steps.current} total={steps.total} labels={steps.labels} />
          </div>
        )}

        <main className="flex flex-1 items-center py-10">
          <div className="w-full animate-slide-up">{children}</div>
        </main>

        {showFooter && <Footer />}
      </div>
    </div>
  )
}

// Subtle aurora wash. Pointer-events-none so it never eats clicks.
function AuroraBg() {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 bg-valence-aurora opacity-70" aria-hidden />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-valence-blue/40 to-transparent"
        aria-hidden
      />
    </>
  )
}

function Footer({ minimal = false }) {
  if (minimal) {
    return (
      <p className="text-[11px] text-valence-subtle">
        © {new Date().getFullYear()} ValenceOS
      </p>
    )
  }
  return (
    <footer className="pt-8 text-center text-[11px] text-valence-subtle">
      By continuing you agree to the{' '}
      <Link to="/terms" className="text-valence-muted hover:text-valence-text">Terms</Link>
      {' '}and{' '}
      <Link to="/privacy" className="text-valence-muted hover:text-valence-text">Privacy</Link>.
    </footer>
  )
}

// Numbered progress stepper. Filled + ring for the current step, check
// for completed, quiet for upcoming. A connecting line runs behind.
export function Stepper({ current, total, labels = [] }) {
  const steps = Array.from({ length: total }, (_, i) => i + 1)
  return (
    <div className="flex items-center justify-center gap-0">
      {steps.map((n, i) => {
        const done = n < current
        const active = n === current
        return (
          <div key={n} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold transition-all ${
                  active
                    ? 'bg-valence-blue text-white ring-4 ring-valence-blue/20'
                    : done
                      ? 'bg-valence-blue/15 text-valence-blue-deep'
                      : 'bg-valence-surface text-valence-subtle ring-1 ring-valence-border'
                }`}
              >
                {done ? '✓' : n}
              </div>
              {labels[i] && (
                <span className={`text-[10px] font-medium tracking-tight ${active ? 'text-valence-text' : 'text-valence-subtle'}`}>
                  {labels[i]}
                </span>
              )}
            </div>
            {i < steps.length - 1 && (
              <div className={`mx-2 h-px w-10 sm:w-16 ${n < current ? 'bg-valence-blue/40' : 'bg-valence-border'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// Big tactile choice card — used for Start/Join and IB/PE/VC. Lifts on
// hover, blue ring when selected/primary.
export function ChoiceCard({ icon: Icon, eyebrow, title, body, onClick, to, primary = false, selected = false, busy = false, disabled = false, footer = null }) {
  const cls = `group relative flex h-full flex-col overflow-hidden rounded-2xl border p-6 text-left transition-all duration-200 ${
    selected || primary
      ? 'border-valence-blue/50 bg-gradient-to-br from-valence-blue-soft/70 to-valence-elevated shadow-valence'
      : 'border-valence-border bg-valence-elevated hover:border-valence-blue/40 hover:shadow-valence'
  } ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:-translate-y-0.5'}`

  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className={`grid h-11 w-11 place-items-center rounded-xl ${primary || selected ? 'bg-valence-blue text-white shadow-lg shadow-valence-blue/25' : 'bg-valence-blue-soft text-valence-blue-deep'}`}>
          {busy
            ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            : Icon ? <Icon className="h-5 w-5" /> : null}
        </div>
        <span className="translate-x-0 text-valence-subtle transition group-hover:translate-x-0.5 group-hover:text-valence-blue">→</span>
      </div>
      {eyebrow && <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.14em] text-valence-blue-deep">{eyebrow}</p>}
      <h3 className="mt-1 text-lg font-bold leading-tight text-valence-text">{title}</h3>
      {body && <p className="mt-2 text-[13px] leading-relaxed text-valence-muted">{body}</p>}
      {footer && <div className="mt-auto pt-4">{footer}</div>}
    </>
  )

  if (to) return <Link to={to} className={cls}>{inner}</Link>
  return <button type="button" onClick={onClick} disabled={disabled || busy} className={cls}>{inner}</button>
}

export function GoogleGlyph({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.28-.97 2.36-2.06 3.08v2.56h3.33c1.95-1.79 3.07-4.43 3.07-7.58 0-.74-.07-1.44-.19-2.11H12z"/>
      <path fill="#34A853" d="M12 21.5c2.76 0 5.07-.91 6.76-2.46l-3.33-2.56c-.92.62-2.1.99-3.43.99-2.64 0-4.88-1.78-5.68-4.18H2.86v2.63C4.54 19.09 7.99 21.5 12 21.5z"/>
      <path fill="#FBBC05" d="M6.32 13.29c-.2-.6-.32-1.24-.32-1.9s.11-1.3.32-1.9V6.86H2.86C2.31 7.94 2 9.17 2 10.5s.31 2.56.86 3.64l3.46-2.65z"/>
      <path fill="#4285F4" d="M12 5.5c1.5 0 2.85.52 3.91 1.54l2.94-2.94C17.07 2.39 14.76 1.5 12 1.5 7.99 1.5 4.54 3.91 2.86 6.86l3.46 2.63C7.12 7.28 9.36 5.5 12 5.5z"/>
    </svg>
  )
}
