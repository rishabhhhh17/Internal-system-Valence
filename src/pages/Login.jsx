import { useState } from 'react'
import { Sparkles, ArrowRight, Shield } from 'lucide-react'
import { signInWithGoogle } from '../lib/google.js'

export default function Login() {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  async function connect() {
    setErr(null); setBusy(true)
    try { await signInWithGoogle() }
    catch (e) { setErr(e.message || 'Sign-in failed'); setBusy(false) }
  }

  return (
    <div className="min-h-screen bg-white vl-circles">
      <div className="absolute inset-0 bg-valence-grid opacity-40 pointer-events-none" aria-hidden />
      <div className="relative mx-auto flex min-h-screen max-w-[1280px] flex-col">
        <header className="px-8 pt-8 lg:px-16">
          <span className="vl-eyebrow">Valence Growth Partners · ValenceOS</span>
        </header>

        <main className="flex flex-1 items-center px-8 lg:px-16">
          <div className="grid w-full gap-12 lg:grid-cols-2 lg:gap-20 items-center">
            <div>
              <h1 className="font-display text-hero font-bold text-valence-text leading-[1.05]">
                The operating layer for the firm.
              </h1>
              <p className="mt-6 max-w-lg text-base leading-relaxed text-valence-muted lg:text-lg">
                Sign in with your Valence Google account to unlock the pipeline, the firm's knowledge, and the planner.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <button
                  onClick={connect}
                  disabled={busy}
                  className="vl-btn-primary"
                >
                  <GoogleGlyph className="h-4 w-4" />
                  {busy ? 'Connecting…' : 'Continue with Google'}
                  <ArrowRight className="h-4 w-4" />
                </button>
                <span className="inline-flex items-center gap-1.5 text-xs text-valence-muted">
                  <Shield className="h-3.5 w-3.5" />
                  Only accounts your admin has authorised can sign in.
                </span>
              </div>
              {err && (
                <p className="mt-6 rounded-lg border border-valence-danger/30 bg-valence-danger/5 px-4 py-2.5 text-xs text-valence-danger">
                  {err}
                </p>
              )}
            </div>

            <div className="vl-card p-8 space-y-5">
              <p className="vl-eyebrow-ink">What you unlock</p>
              <Item title="Deal Logger" body="Every mandate across Origination → Closed, with stage-gate checklists and deal-team economics." />
              <Item title="Knowledge" body="Ask plain-English questions. Memos, files, and comps indexed and cited." />
              <Item title="Day Planner" body="Your real Google Calendar, free-slot meeting proposals, and drafted follow-ups." />
              <Item title="Audit-grade" body="Every action stamped with your identity. RLS scopes every query to authenticated users only." />
            </div>
          </div>
        </main>

        <footer className="px-8 pb-8 pt-16 text-[11px] text-valence-subtle lg:px-16">
          Mumbai · London · © {new Date().getFullYear()} Valence Growth Partners
        </footer>
      </div>
    </div>
  )
}

function Item({ title, body }) {
  return (
    <div className="flex items-start gap-3">
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-valence-blue" />
      <div>
        <p className="text-sm font-semibold text-valence-text">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-valence-muted">{body}</p>
      </div>
    </div>
  )
}

function GoogleGlyph({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.28-.97 2.36-2.06 3.08v2.56h3.33c1.95-1.79 3.07-4.43 3.07-7.58 0-.74-.07-1.44-.19-2.11H12z"/>
      <path fill="#34A853" d="M12 21.5c2.76 0 5.07-.91 6.76-2.46l-3.33-2.56c-.92.62-2.1.99-3.43.99-2.64 0-4.88-1.78-5.68-4.18H2.86v2.63C4.54 19.09 7.99 21.5 12 21.5z"/>
      <path fill="#FBBC05" d="M6.32 13.29c-.2-.6-.32-1.24-.32-1.9s.11-1.3.32-1.9V6.86H2.86C2.31 7.94 2 9.17 2 10.5s.31 2.56.86 3.64l3.46-2.65z"/>
      <path fill="#4285F4" d="M12 5.5c1.5 0 2.85.52 3.91 1.54l2.94-2.94C17.07 2.39 14.76 1.5 12 1.5 7.99 1.5 4.54 3.91 2.86 6.86l3.46 2.63C7.12 7.28 9.36 5.5 12 5.5z"/>
    </svg>
  )
}
