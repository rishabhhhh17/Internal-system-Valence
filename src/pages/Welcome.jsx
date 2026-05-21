// Welcome — first thing a freshly signed-in user sees if they don't yet
// belong to a team. Two paths:
//
//   1. Start a team   → /onboarding         (creates a new org, becomes admin)
//   2. Join a team    → /join               (enters an invite code, claims a seat)
//
// Branded landing with the same chrome as Login so the OAuth-to-onboarding
// hop feels like one continuous flow.

import { Link } from 'react-router-dom'
import { Building2, KeyRound, Sparkles, ArrowRight, Shield } from 'lucide-react'
import { useAuth } from '../hooks/useAuth.js'
import { signOut } from '../lib/google.js'
import Logo from '../components/Logo.jsx'

export default function Welcome() {
  const { profile, loading } = useAuth()
  // Only show a personalised greeting once the profile has actually loaded —
  // otherwise we render "Welcome, there." for half a second which looks broken.
  const firstName = (profile?.name || '').split(' ')[0]

  return (
    <div className="min-h-screen bg-valence-bg">
      <div className="relative mx-auto flex min-h-screen max-w-[1280px] flex-col">
        <header className="flex items-center justify-between px-8 pt-8 lg:px-16">
          <Logo />
          <button
            type="button"
            onClick={() => signOut()}
            className="text-xs text-valence-muted hover:text-valence-text"
          >
            Sign out
          </button>
        </header>

        <main className="flex flex-1 items-center px-8 lg:px-16">
          <div className="grid w-full gap-12 lg:grid-cols-2 lg:gap-20 items-start">
            <div className="pt-4">
              <p className="vl-eyebrow-ink mb-3">
                {firstName ? `Welcome, ${firstName}` : loading ? 'Loading…' : 'Welcome'}
              </p>
              <h1 className="font-display text-display font-bold text-valence-text leading-[1.08]">
                Let's get your firm set up.
              </h1>
              <p className="mt-5 max-w-md text-base leading-relaxed text-valence-muted">
                Every deal, every relationship, every interaction — in one place.
                Choose how you'd like to start.
              </p>
              <div className="mt-8 flex items-center gap-2 text-xs text-valence-muted">
                <Shield className="h-3.5 w-3.5" />
                Your firm's data is isolated to your team only. Nothing crosses tenants.
              </div>
            </div>

            <div className="space-y-3">
              <ChoiceCard
                to="/onboarding"
                icon={<Building2 className="h-5 w-5" />}
                eyebrow="New team"
                title="Start a team"
                body="Create a fresh workspace for your firm. You become the admin and can invite the rest of the team after onboarding."
              />
              <ChoiceCard
                to="/join"
                icon={<KeyRound className="h-5 w-5" />}
                eyebrow="Have an invite"
                title="Join a team"
                body="Paste the 8-character invite code from your firm's admin. You'll set up your profile and be added to their workspace."
              />

              <div className="mt-4 rounded-xl border border-valence-border bg-valence-elevated p-4">
                <p className="vl-eyebrow-ink mb-2">What you unlock</p>
                <Item icon={<Sparkles className="h-3.5 w-3.5" />}
                  body="Live pipeline of every mandate · counterparty CRM with personas · per-mandate knowledge base · AI-drafted briefs, emails, and CIMs · day planner pulling your real Google Calendar." />
              </div>
            </div>
          </div>
        </main>

        <footer className="px-8 pb-8 pt-16 text-[11px] text-valence-subtle lg:px-16">
          © {new Date().getFullYear()} ValenceOS · <Link to="/privacy" className="hover:text-valence-muted">Privacy</Link> · <Link to="/terms" className="hover:text-valence-muted">Terms</Link>
        </footer>
      </div>
    </div>
  )
}

function ChoiceCard({ to, icon, eyebrow, title, body }) {
  return (
    <Link
      to={to}
      className="group block vl-card p-5 transition hover:border-valence-blue/40 hover:shadow-valence"
    >
      <div className="flex items-start gap-4">
        <div className="rounded-xl bg-valence-blue-soft p-2.5 text-valence-blue group-hover:bg-valence-blue group-hover:text-white transition">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="vl-eyebrow-ink">{eyebrow}</p>
          <h3 className="text-lg font-semibold text-valence-text mt-0.5">{title}</h3>
          <p className="text-sm text-valence-muted mt-1.5 leading-relaxed">{body}</p>
        </div>
        <ArrowRight className="h-4 w-4 text-valence-subtle group-hover:text-valence-blue group-hover:translate-x-0.5 transition shrink-0 mt-2" />
      </div>
    </Link>
  )
}

function Item({ icon, body }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-valence-blue">{icon}</span>
      <p className="text-xs leading-relaxed text-valence-muted">{body}</p>
    </div>
  )
}
