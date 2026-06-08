import { useState } from 'react'
import { ArrowRight, Shield, Briefcase, BookOpen, CalendarDays, Sparkles } from 'lucide-react'
import { signInWithGoogle } from '../lib/google.js'
import { humanError } from '../lib/userError.js'
import OnboardingShell, { GoogleGlyph } from '../components/OnboardingShell.jsx'

export default function Login() {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  async function connect() {
    setErr(null); setBusy(true)
    try {
      // Always route Google's OAuth callback back to /welcome — the first
      // surface every signed-in user should see. Welcome decides what to
      // render based on seat state.
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      await signInWithGoogle({ redirectTo: `${origin}/welcome` })
    } catch (e) {
      setErr(humanError(e, 'Sign-in failed — try again'))
      setBusy(false)
    }
  }

  const showcase = (
    <div className="space-y-8">
      <h1 className="font-display text-hero font-bold leading-[1.04] text-valence-text text-balance">
        The operating layer for your firm.
      </h1>
      <p className="max-w-md text-base leading-relaxed text-valence-muted">
        Every mandate, relationship, and interaction — one workspace your
        team actually uses.
      </p>
      <div className="space-y-3">
        <Feature icon={Briefcase}    label="Deal Status"   body="Board, table, and Gantt across the whole pipeline." />
        <Feature icon={BookOpen}     label="Knowledge"     body="Ask plain-English questions, cited from your data." />
        <Feature icon={CalendarDays} label="Day Planner"   body="Your real calendar, free-slot finder, drafted follow-ups." />
        <Feature icon={Sparkles}     label="AI throughout" body="Matcher, thesis-fit, IC memos — tuned to your firm type." />
      </div>
    </div>
  )

  return (
    <OnboardingShell split={showcase}>
      <div className="mx-auto w-full max-w-sm space-y-7">
        <div>
          <p className="vl-eyebrow-ink">Welcome</p>
          <h2 className="mt-2 font-display text-3xl font-bold leading-tight text-valence-text">
            Sign in to ValenceOS
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-valence-muted">
            Continue with Google to start a new firm or join one with an
            invite code.
          </p>
        </div>

        <button
          onClick={connect}
          disabled={busy}
          className="group flex w-full items-center justify-center gap-3 rounded-xl border border-valence-border bg-valence-elevated px-5 py-3.5 text-sm font-semibold text-valence-text shadow-valence transition hover:border-valence-blue/40 hover:-translate-y-0.5 disabled:opacity-60 disabled:translate-y-0"
        >
          {busy
            ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-valence-blue border-t-transparent" />
            : <GoogleGlyph className="h-5 w-5" />}
          {busy ? 'Connecting…' : 'Continue with Google'}
          {!busy && <ArrowRight className="h-4 w-4 text-valence-subtle transition group-hover:translate-x-0.5 group-hover:text-valence-blue" />}
        </button>

        {err && (
          <p className="rounded-lg border border-valence-danger/30 bg-valence-danger/5 px-4 py-2.5 text-xs text-valence-danger">
            {err}
          </p>
        )}

        <div className="flex items-center gap-2 rounded-lg border border-valence-border bg-valence-surface/50 px-3.5 py-2.5">
          <Shield className="h-3.5 w-3.5 shrink-0 text-valence-blue" />
          <p className="text-[11px] leading-relaxed text-valence-muted">
            Your firm's data is fully isolated — row-level security scopes
            every query to your team.
          </p>
        </div>
      </div>
    </OnboardingShell>
  )
}

function Feature({ icon: Icon, label, body }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-valence-blue-soft text-valence-blue-deep">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-sm font-semibold text-valence-text">{label}</p>
        <p className="text-xs leading-relaxed text-valence-muted">{body}</p>
      </div>
    </div>
  )
}
