// Welcome — post-sign-in landing for a freshly authenticated user who
// doesn't yet have a seat. Two paths:
//
//   1. Start a team   → /onboarding         (creates a new org, becomes admin)
//   2. Join a team    → /join               (enters an invite code, claims a seat)
//
// Visual treatment is intentionally restrained — this is an executive
// decision point ("are you setting up a firm or joining one?"), not a
// sign-up form. Big confident headline, two clearly differentiated
// cards (primary visually heavier than secondary), one row of feature
// pills below to set context, security trust line, clean footer.
//
// "Use a different account" sits in the top-right header — replaces the
// bare "Sign out" so the account-switch path is explicit. Pairs with
// the prompt:select_account fix in lib/google.js — sign out, sign back
// in, real account picker comes up.
import { Link } from 'react-router-dom'
import {
  Building2, KeyRound, ArrowRight, Shield, MessageSquare, CalendarDays,
  Briefcase, BookOpen, Sparkles, Users
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth.js'
import { signOut } from '../lib/google.js'
import Logo from '../components/Logo.jsx'

const FEATURES = [
  { icon: Briefcase,     label: 'Deal Logger',         body: 'Every mandate, every stage, in one pipeline.' },
  { icon: Users,         label: 'People CRM',          body: 'Personas, warmth, and who knows who.' },
  { icon: MessageSquare, label: 'Auto-capture',        body: 'Gmail + Calendar flow in via the Chrome extension.' },
  { icon: BookOpen,      label: 'Knowledge base',      body: 'Files, memos, and AI-searched firm notes.' },
  { icon: CalendarDays,  label: 'Day planner',         body: 'Free-slot finder, meeting prep, intro drafts.' },
  { icon: Sparkles,      label: 'Ask',                 body: 'Plain-English chat over the whole firm.' }
]

export default function Welcome() {
  const { profile, loading } = useAuth()
  const firstName = (profile?.name || '').split(' ')[0]

  async function switchAccount() {
    // signOut() clears Supabase session + every valence.* localStorage key
    // (see PR #141). Browser redirects to Login automatically on the next
    // App.jsx render because !session → render <Login/>.
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
          {/* Hero block — big confident headline */}
          <section className="max-w-3xl">
            <p className="vl-eyebrow-ink mb-4">
              {firstName ? `Welcome, ${firstName}` : loading ? 'Loading…' : 'Welcome'}
            </p>
            <h1 className="font-display text-display font-bold text-valence-text leading-[1.05]">
              The operating layer
              <br />
              for the firm.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-valence-muted">
              Every deal, every relationship, every interaction — one workspace your team
              actually uses. Pick how you'd like to start.
            </p>
          </section>

          {/* Two choice cards — primary (start) heavier than secondary (join) */}
          <section className="mt-12 grid gap-4 sm:grid-cols-2 max-w-4xl">
            <PrimaryChoice
              to="/onboarding"
              icon={Building2}
              eyebrow="New firm"
              title="Start a team"
              body="Create a fresh workspace. You become the admin and invite the rest of the firm after onboarding."
            />
            <SecondaryChoice
              to="/join"
              icon={KeyRound}
              eyebrow="Have an invite"
              title="Join a team"
              body="Paste the 8-character code your firm's admin sent you."
            />
          </section>

          {/* Feature pills — small, glanceable, replaces the paragraph blob */}
          <section className="mt-16 max-w-4xl">
            <p className="vl-eyebrow text-valence-muted mb-4">What you unlock</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {FEATURES.map(f => (
                <FeaturePill key={f.label} icon={f.icon} label={f.label} body={f.body} />
              ))}
            </div>
          </section>

          {/* Trust line — security promise, not a footer */}
          <section className="mt-14 max-w-2xl">
            <div className="flex items-start gap-3 rounded-xl border border-valence-border bg-valence-elevated/40 px-4 py-3.5">
              <Shield className="h-4 w-4 text-valence-blue shrink-0 mt-0.5" />
              <p className="text-xs text-valence-muted leading-relaxed">
                Your firm's data is fully isolated. Row-level security in the database
                guarantees nothing crosses tenants — every team's deals, people, and
                interactions are visible only to their seats.
              </p>
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

function FeaturePill({ icon: Icon, label, body }) {
  return (
    <div className="rounded-xl border border-valence-border bg-valence-elevated/50 p-3.5">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className="h-3.5 w-3.5 text-valence-blue shrink-0" />
        <span className="text-sm font-semibold text-valence-text">{label}</span>
      </div>
      <p className="text-[11px] text-valence-muted leading-relaxed">{body}</p>
    </div>
  )
}
