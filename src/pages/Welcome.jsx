// Welcome — first screen any authenticated user lands on. Two states:
//
//   1. SEATED user (already belongs to a firm)
//        → big "Continue to your firm" CTA + small "Or browse the
//          onboarding flow" section below so admins can preview the
//          Start / Join screens without signing out.
//
//   2. SEATLESS user (just signed up, no firm yet)
//        → primary "Start a team" + secondary "Join a team" cards.
//          Same paths the original onboarding flow always offered.
//
// Welcome is REACHABLE to seated users by design. App.jsx used to redirect
// seated users from /welcome → / which made the onboarding flow effectively
// invisible to anyone testing with their own account. Now /welcome renders
// unconditionally and decides what to show based on seat state — partners
// can always come back here, click "Continue to your firm" → /, or QA the
// onboarding cards.
//
// "Use a different account" stays in the header so the account-switch
// path is always one click away.

import { Link } from 'react-router-dom'
import {
  Building2, KeyRound, ArrowRight, MessageSquare, CalendarDays,
  Briefcase, BookOpen, Sparkles, Users, Eye, Home
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth.js'
import { useSeat } from '../hooks/useSeat.js'
import { signOut } from '../lib/google.js'
import Logo from '../components/Logo.jsx'

// Plain feature labels — no marketing copy underneath. Pills exist just
// to remind the user what's inside, not to sell.
const FEATURES = [
  { icon: Briefcase,     label: 'Deal Status' },
  { icon: Users,         label: 'People' },
  { icon: MessageSquare, label: 'Interactions' },
  { icon: BookOpen,      label: 'Knowledge' },
  { icon: CalendarDays,  label: 'Day Planner' },
  { icon: Sparkles,      label: 'Ask' }
]

export default function Welcome() {
  const { profile, loading } = useAuth()
  const { hasSeat, org } = useSeat()
  const firstName = (profile?.name || '').split(' ')[0]

  async function switchAccount() {
    // signOut() clears Supabase session + every valence.* localStorage key.
    // Browser redirects to Login automatically on the next App.jsx render.
    try { await signOut() } catch { /* swallowed — render will route */ }
  }

  return (
    <div className="min-h-screen bg-valence-bg">
      <div className="relative mx-auto flex min-h-screen max-w-[1200px] flex-col">

        {/* Header — logo left, account-switch right */}
        <header className="flex items-center justify-between px-8 pt-8 lg:px-14">
          <Logo />
          <div className="flex items-center gap-4">
            {profile?.email && (
              <span className="hidden sm:inline text-[11px] text-valence-muted">
                Signed in as <span className="text-valence-text font-semibold">{profile.email}</span>
              </span>
            )}
            <button
              type="button"
              onClick={switchAccount}
              className="text-xs text-valence-muted hover:text-valence-text transition"
            >
              Use a different account
            </button>
          </div>
        </header>

        <main className="flex-1 px-8 pt-12 pb-16 lg:px-14 lg:pt-20">

          {hasSeat ? (
            // ============================================================
            // SEATED — user already belongs to a firm. Prominent "continue"
            // CTA. Onboarding cards still rendered below for admin preview.
            // ============================================================
            <>
              <section className="max-w-3xl">
                <p className="vl-eyebrow-ink mb-4">
                  {firstName ? `Welcome back, ${firstName}` : loading ? 'Loading…' : 'Welcome back'}
                </p>
                <h1 className="font-display text-display font-bold text-valence-text leading-[1.05]">
                  {org?.name ? <>You're in <span className="text-valence-blue">{org.name}</span>.</> : "You're signed in."}
                </h1>
              </section>

              {/* PRIMARY CTA — continue to the dashboard. Stripped the
                  flowery "Today's note, priorities..." subtitle — the
                  card title says it all. */}
              <section className="mt-10 max-w-2xl">
                <Link
                  to="/"
                  className="group flex items-center justify-between gap-6 rounded-2xl border border-valence-blue/40 bg-gradient-to-br from-valence-blue-soft/70 to-valence-elevated p-6 transition hover:border-valence-blue hover:shadow-valence"
                >
                  <div className="flex items-start gap-4">
                    <div className="rounded-xl bg-valence-blue p-3 text-white shadow-lg shadow-valence-blue/20">
                      <Home className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="vl-eyebrow-ink text-valence-blue-deep">Dashboard</p>
                      <h3 className="mt-1 text-xl font-bold text-valence-text leading-tight">
                        Continue to {org?.name || 'your firm'}
                      </h3>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-valence-blue opacity-60 group-hover:opacity-100 group-hover:translate-x-1 transition shrink-0" />
                </Link>
              </section>

              {/* SECONDARY — onboarding-preview cards left visible so the
                  current user can QA the new-partner experience. */}
              <section className="mt-14 max-w-4xl">
                <div className="flex items-start gap-3 rounded-xl border border-valence-border bg-valence-elevated/40 px-4 py-3 mb-5">
                  <Eye className="h-4 w-4 text-valence-muted shrink-0 mt-0.5" />
                  <p className="text-xs text-valence-muted leading-relaxed">
                    <span className="font-semibold text-valence-text">Onboarding preview.</span>{' '}
                    What a new teammate sees on first sign-in.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <PrimaryChoice
                    to="/onboarding"
                    icon={Building2}
                    eyebrow="New firm"
                    title="Start a team"
                    body="Create a workspace and invite teammates."
                  />
                  <SecondaryChoice
                    to="/join"
                    icon={KeyRound}
                    eyebrow="Have an invite"
                    title="Join a team"
                    body="Paste the 8-character code from your admin."
                  />
                </div>
              </section>
            </>
          ) : (
            // ============================================================
            // SEATLESS — first-time user. Show the canonical onboarding
            // decision: Start a team OR Join a team.
            // ============================================================
            <>
              <section className="max-w-3xl">
                <p className="vl-eyebrow-ink mb-4">
                  {firstName ? `Welcome, ${firstName}` : loading ? 'Loading…' : 'Welcome'}
                </p>
                <h1 className="font-display text-display font-bold text-valence-text leading-[1.05]">
                  Start or join a firm.
                </h1>
              </section>

              <section className="mt-12 grid gap-4 sm:grid-cols-2 max-w-4xl">
                <PrimaryChoice
                  to="/onboarding"
                  icon={Building2}
                  eyebrow="New firm"
                  title="Start a team"
                  body="Create a workspace and invite teammates."
                />
                <SecondaryChoice
                  to="/join"
                  icon={KeyRound}
                  eyebrow="Have an invite"
                  title="Join a team"
                  body="Paste the 8-character code from your admin."
                />
              </section>
            </>
          )}

          {/* Feature pills — glanceable list of what's inside. No sales copy. */}
          <section className="mt-16 max-w-4xl">
            <p className="vl-eyebrow text-valence-muted mb-4">Inside</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {FEATURES.map(f => (
                <FeaturePill key={f.label} icon={f.icon} label={f.label} />
              ))}
            </div>
          </section>
        </main>

        {/* Footer — clean, just legal */}
        <footer className="px-8 pb-8 lg:px-14 text-[11px] text-valence-subtle">
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-valence-border/40 pt-6">
            <span>© {new Date().getFullYear()} ValenceOS</span>
            <div className="flex items-center gap-4">
              <Link to="/privacy" className="hover:text-valence-muted">Privacy</Link>
              <Link to="/terms" className="hover:text-valence-muted">Terms</Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}

// Primary card — heavier visual weight, blue accent, larger title.
// The card a typical first-time partner clicks.
function PrimaryChoice({ to, icon: Icon, eyebrow, title, body }) {
  return (
    <Link
      to={to}
      className="group relative block overflow-hidden rounded-2xl border border-valence-blue/40 bg-gradient-to-br from-valence-blue-soft/60 to-valence-elevated p-6 transition hover:border-valence-blue hover:shadow-valence"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="rounded-xl bg-valence-blue p-3 text-white shadow-lg shadow-valence-blue/20">
          <Icon className="h-5 w-5" />
        </div>
        <ArrowRight className="h-4 w-4 text-valence-blue opacity-60 group-hover:opacity-100 group-hover:translate-x-1 transition" />
      </div>
      <p className="mt-5 vl-eyebrow-ink text-valence-blue-deep">{eyebrow}</p>
      <h3 className="mt-1 text-xl font-bold text-valence-text leading-tight">{title}</h3>
      <p className="mt-2 text-sm text-valence-muted leading-relaxed">{body}</p>
    </Link>
  )
}

// Secondary card — visually quieter so users naturally gravitate toward
// the primary. Same shape so the page reads as two parallel options.
function SecondaryChoice({ to, icon: Icon, eyebrow, title, body }) {
  return (
    <Link
      to={to}
      className="group relative block overflow-hidden rounded-2xl border border-valence-border bg-valence-elevated p-6 transition hover:border-valence-border-strong hover:bg-valence-elevated/80"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="rounded-xl bg-valence-surface p-3 text-valence-muted">
          <Icon className="h-5 w-5" />
        </div>
        <ArrowRight className="h-4 w-4 text-valence-subtle opacity-60 group-hover:opacity-100 group-hover:translate-x-1 transition" />
      </div>
      <p className="mt-5 vl-eyebrow-ink">{eyebrow}</p>
      <h3 className="mt-1 text-xl font-semibold text-valence-text leading-tight">{title}</h3>
      <p className="mt-2 text-sm text-valence-muted leading-relaxed">{body}</p>
    </Link>
  )
}

function FeaturePill({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-valence-border bg-valence-elevated/50 px-3 py-2">
      <Icon className="h-3.5 w-3.5 text-valence-blue shrink-0" />
      <span className="text-xs font-semibold text-valence-text truncate">{label}</span>
    </div>
  )
}
