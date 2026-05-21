// Join-a-team flow — for users who clicked "Join a team" on /welcome.
// They paste the 8-character invite code their firm's admin generated and
// fill in their profile in the same step. Calls the public.join_team()
// RPC which atomically validates the code, creates their seat, and marks
// the invite as claimed.

import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { Loader2, KeyRound, Check, ArrowLeft, User } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { signOut } from '../lib/google.js'
import { humanError } from '../lib/userError.js'
import { useToast } from '../components/Toast.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { useSeat } from '../hooks/useSeat.js'
import Logo from '../components/Logo.jsx'

export default function JoinTeam() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const toast = useToast()
  const { profile } = useAuth()
  const { refresh: refreshSeat } = useSeat()
  const isPreview = params.get('preview') === '1'
  const previewSuffix = isPreview ? '?preview=1' : ''
  // Scroll the blocking-error card into view when it appears — same fix
  // as Onboarding.jsx, see comment there.
  const blockingErrorRef = useRef(null)

  const [code,     setCode]     = useState(params.get('code') || '')
  const [fullName, setFullName] = useState(profile?.name || '')
  const [title,    setTitle]    = useState('')
  const [phone,    setPhone]    = useState('')
  const [busy,     setBusy]     = useState(false)
  const [blockingError, setBlockingError] = useState(null)

  useEffect(() => {
    if (!blockingError) return
    blockingErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [blockingError])

  // Auto-uppercase, allow only the alphabet we use in codes (no I/O/0/1).
  function onCodeChange(v) {
    const cleaned = String(v || '')
      .toUpperCase()
      .replace(/[^A-Z2-9]/g, '')
      .slice(0, 8)
    setCode(cleaned)
  }

  async function submit() {
    if (!isSupabaseConfigured) { toast.error('Supabase is not configured.'); return }
    if (code.length !== 8)      { toast.error('Invite code is 8 characters.'); return }
    if (!fullName.trim())       { toast.error('Add your name.'); return }

    setBusy(true)
    try {
      const { data, error } = await supabase.rpc('join_team', {
        p_invite_code: code,
        p_full_name:   fullName.trim(),
        p_title:       title.trim() || null,
        p_phone:       phone.trim() || null
      })
      if (error) throw error
      if (!data) throw new Error('Invite not found or expired')

      toast.success('Joined. Welcome aboard.')

      // Refresh useSeat BEFORE navigating — otherwise App.jsx still sees
      // hasSeat=false and bounces back to /welcome. Without this await,
      // the user filled the form, the server gave them a seat, but the
      // client redirected them to start the same flow over again.
      await refreshSeat()
      navigate('/', { replace: true })
    } catch (err) {
      // Same pattern as Onboarding — if the user already has a seat,
      // surface a prominent inline error with a Sign-out button. The
      // toast alone is too easy to miss.
      const raw = String(err?.message || '')
      if (/user already belongs to a team/i.test(raw)) {
        setBlockingError('alreadyOnTeam')
      } else {
        toast.error(humanError(err, 'Could not join — check the code and try again.'))
      }
    } finally {
      setBusy(false)
    }
  }

  async function signOutAndRetry() {
    try { await signOut() } catch { /* render will route */ }
  }

  return (
    <div className="min-h-screen bg-valence-bg">
      <div className="relative mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-10">
        <header className="flex items-center justify-between">
          <Link to={`/welcome${previewSuffix}`} className="text-xs text-valence-muted hover:text-valence-text inline-flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Back
          </Link>
          <Logo />
        </header>

        <main className="flex flex-1 items-center">
          <div className="w-full space-y-8">
            <div>
              <p className="vl-eyebrow-ink">Join your team</p>
              <h1 className="font-display text-3xl font-bold text-valence-text mt-2">
                Got an invite code?
              </h1>
              <p className="text-sm text-valence-muted mt-1.5 max-w-md">
                Paste the 8-character code your firm's admin sent you. We'll add you to their workspace.
              </p>
            </div>

            {blockingError === 'alreadyOnTeam' && (
              <div ref={blockingErrorRef} className="rounded-xl border-2 border-valence-warning/60 bg-valence-warning/15 p-5 space-y-3 shadow-lg shadow-valence-warning/10 animate-fade-in">
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold text-valence-text">You're already in a firm.</p>
                  <p className="text-xs text-valence-muted leading-relaxed">
                    Your current Google account already has a seat in a Valence workspace. To join a different firm,
                    sign out and sign back in with a different Google account.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={signOutAndRetry} className="vl-btn-primary text-xs">
                    Sign out and try a different account
                  </button>
                  <Link to="/" className="vl-btn-ghost text-xs">Go to my current firm</Link>
                </div>
              </div>
            )}

            <div className="vl-card p-5 space-y-5">
              <div className="space-y-1.5">
                <label className="vl-label inline-flex items-center gap-1.5">
                  <KeyRound className="h-3 w-3" /> Invite code
                </label>
                <input
                  className="vl-input font-mono text-lg tracking-[0.25em] uppercase"
                  value={code}
                  onChange={e => onCodeChange(e.target.value)}
                  placeholder="ABCD2345"
                  maxLength={8}
                  autoFocus
                />
                <p className="text-[11px] text-valence-subtle">8 letters / digits. Case-insensitive. No I, O, 0, or 1.</p>
              </div>

              <div className="space-y-1.5">
                <label className="vl-label inline-flex items-center gap-1.5">
                  <User className="h-3 w-3" /> Full name *
                </label>
                <input className="vl-input" value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Jane Doe" />
              </div>

              <div className="space-y-1.5">
                <label className="vl-label">Title / role</label>
                <input className="vl-input" value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Senior Associate" />
              </div>

              <div className="space-y-1.5">
                <label className="vl-label">Phone (optional)</label>
                <input className="vl-input" value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+44 20 7946 0000" />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Link to={`/onboarding${previewSuffix}`} className="text-xs text-valence-muted hover:text-valence-text">
                No invite? Start a new team instead →
              </Link>
              <button
                onClick={submit}
                disabled={busy || code.length !== 8 || !fullName.trim()}
                className="vl-btn-primary"
              >
                {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Joining…</> : <><Check className="h-3.5 w-3.5" /> Join team</>}
              </button>
            </div>
          </div>
        </main>

        <footer className="text-[11px] text-valence-subtle text-center pt-8">
          By continuing you agree to the <a className="text-valence-blue hover:underline" href="/terms">Terms</a> and <a className="text-valence-blue hover:underline" href="/privacy">Privacy Policy</a>.
        </footer>
      </div>
    </div>
  )
}
