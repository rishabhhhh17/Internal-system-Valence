// Welcome — first screen any authenticated user lands on. Two states:
//   1. SEATED user → big "Continue to your firm" CTA + onboarding preview.
//   2. SEATLESS user → "Start a team" / "Join a team" choice cards.
// Renders unconditionally for seated users by design (App.jsx routes here
// post-sign-in); the page decides what to show from seat state.

import { Link } from 'react-router-dom'
import {
  Building2, KeyRound, ArrowRight, MessageSquare, CalendarDays,
  Briefcase, BookOpen, Sparkles, Users, Eye, Home
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth.js'
import { useSeat } from '../hooks/useSeat.js'
import { signOut } from '../lib/google.js'
import OnboardingShell, { ChoiceCard } from '../components/OnboardingShell.jsx'

const FEATURES = [
  { icon: Briefcase,     label: 'Deal Status' },
  { icon: Users,         label: 'People' },
  { icon: MessageSquare, label: 'Interactions' },
  { icon: BookOpen,      label: 'Knowledge' },
  { icon: CalendarDays,  label: 'Day Planner' },
  { icon: Sparkles,      label: 'Ask' },
]

export default function Welcome() {
  const { profile, loading } = useAuth()
  const { hasSeat, org } = useSeat()
  const firstName = (profile?.name || '').split(' ')[0]

  async function switchAccount() {
    try { await signOut() } catch { /* render will route */ }
  }

  const right = (
    <div className="flex items-center gap-3">
      {profile?.email && (
        <span className="hidden sm:inline text-[11px] text-valence-muted">
          {profile.email}
        </span>
      )}
      <button
        type="button"
        onClick={switchAccount}
        className="text-xs font-medium text-valence-muted hover:text-valence-text transition"
      >
        Use a different account
      </button>
    </div>
  )

  return (
    <OnboardingShell right={right} maxWidth="max-w-3xl" showFooter={false}>
      <div className="space-y-10">
        {hasSeat ? (
          <>
            <header className="text-center">
              <p className="vl-eyebrow-ink">
                {firstName ? `Welcome back, ${firstName}` : loading ? 'Loading…' : 'Welcome back'}
              </p>
              <h1 className="mt-3 font-display text-4xl font-bold leading-[1.05] text-valence-text sm:text-5xl text-balance">
                {org?.name ? <>You're in <span className="text-valence-blue">{org.name}</span>.</> : "You're signed in."}
              </h1>
            </header>

            {/* PRIMARY — continue to the dashboard */}
            <Link
              to="/"
              className="group mx-auto flex max-w-xl items-center justify-between gap-6 rounded-2xl border border-valence-blue/40 bg-gradient-to-br from-valence-blue-soft/70 to-valence-elevated p-6 shadow-valence transition hover:-translate-y-0.5 hover:border-valence-blue"
            >
              <div className="flex items-center gap-4">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-valence-blue text-white shadow-lg shadow-valence-blue/25">
                  <Home className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-valence-blue-deep">Dashboard</p>
                  <h3 className="mt-0.5 text-xl font-bold leading-tight text-valence-text">
                    Continue to {org?.name || 'your firm'}
                  </h3>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-valence-blue opacity-60 transition group-hover:translate-x-1 group-hover:opacity-100" />
            </Link>

            {/* Onboarding preview for the seated user to QA */}
            <div className="space-y-4">
              <div className="mx-auto flex max-w-xl items-center gap-2.5 rounded-xl border border-valence-border bg-valence-elevated/40 px-4 py-2.5">
                <Eye className="h-3.5 w-3.5 shrink-0 text-valence-muted" />
                <p className="text-[11px] leading-relaxed text-valence-muted">
                  <span className="font-semibold text-valence-text">Onboarding preview</span> — what a new teammate sees on first sign-in.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <ChoiceCard to="/onboarding" icon={Building2} eyebrow="New firm" title="Start a team" body="Create a workspace and invite teammates." primary />
                <ChoiceCard to="/join" icon={KeyRound} eyebrow="Have an invite" title="Join a team" body="Paste the 8-character code from your admin." />
              </div>
            </div>
          </>
        ) : (
          <>
            <header className="text-center">
              <p className="vl-eyebrow-ink">
                {firstName ? `Welcome, ${firstName}` : loading ? 'Loading…' : 'Welcome'}
              </p>
              <h1 className="mt-3 font-display text-4xl font-bold leading-[1.05] text-valence-text sm:text-5xl">
                Start or join a firm
              </h1>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-valence-muted">
                Spin up a brand-new workspace, or hop into your firm's with an invite code. Takes under a minute.
              </p>
            </header>

            <div className="grid gap-4 sm:grid-cols-2">
              <ChoiceCard to="/onboarding" icon={Building2} eyebrow="New firm" title="Start a team" body="Create a workspace, pick your firm type, invite teammates." primary />
              <ChoiceCard to="/join" icon={KeyRound} eyebrow="Have an invite" title="Join a team" body="Paste the 8-character code your admin sent you." />
            </div>
          </>
        )}

        {/* Feature pills */}
        <div>
          <p className="mb-3 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-valence-subtle">What's inside</p>
          <div className="mx-auto grid max-w-2xl grid-cols-3 gap-2 sm:grid-cols-6">
            {FEATURES.map(f => {
              const Icon = f.icon
              return (
                <div key={f.label} className="flex flex-col items-center gap-1.5 rounded-xl border border-valence-border bg-valence-elevated/50 px-2 py-3 text-center">
                  <Icon className="h-4 w-4 text-valence-blue" />
                  <span className="text-[10px] font-semibold leading-tight text-valence-text">{f.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </OnboardingShell>
  )
}
