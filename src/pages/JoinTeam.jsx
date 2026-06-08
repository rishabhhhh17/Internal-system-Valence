// Join-a-team flow — paste the 8-char invite code, fill profile, submit.
// Calls public.join_team() (validates code, creates seat, claims invite).
// While typing, peek_invite() previews which firm the code lands you in.

import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { Loader2, KeyRound, Check, ArrowLeft, User, Building2, ArrowRight } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { signOut } from '../lib/google.js'
import { humanError } from '../lib/userError.js'
import { useToast } from '../components/Toast.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { useSeat } from '../hooks/useSeat.js'
import OnboardingShell from '../components/OnboardingShell.jsx'

export default function JoinTeam() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const toast = useToast()
  const { profile } = useAuth()
  const { refresh: refreshSeat } = useSeat()
  const isPreview = params.get('preview') === '1'
  const previewSuffix = isPreview ? '?preview=1' : ''
  const blockingErrorRef = useRef(null)

  const [code,     setCode]     = useState(params.get('code') || '')
  const [fullName, setFullName] = useState(profile?.name || '')
  const [title,    setTitle]    = useState('')
  const [phone,    setPhone]    = useState('')
  const [busy,     setBusy]     = useState(false)
  const [blockingError, setBlockingError] = useState(null)
  const [previewState, setPreviewState] = useState(null)

  useEffect(() => {
    if (!blockingError) return
    blockingErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [blockingError])

  useEffect(() => {
    if (!isSupabaseConfigured) return
    if (code.length !== 8) { setPreviewState(null); return }
    let cancelled = false
    setPreviewState('loading')
    const t = setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc('peek_invite', { p_invite_code: code })
        if (cancelled) return
        if (error || !data || data.length === 0) setPreviewState('invalid')
        else setPreviewState({ orgName: data[0].org_name, role: data[0].role })
      } catch { if (!cancelled) setPreviewState('invalid') }
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [code])

  function onCodeChange(v) {
    setCode(String(v || '').toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 8))
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
        p_phone:       phone.trim() || null,
      })
      if (error) throw error
      if (!data) throw new Error('Invite not found or expired')
      toast.success('Joined. Welcome aboard.')
      await refreshSeat()
      navigate('/', { replace: true })
    } catch (err) {
      const raw = String(err?.message || '')
      if (/user already belongs to a team/i.test(raw)) setBlockingError('alreadyOnTeam')
      else toast.error(humanError(err, 'Could not join — check the code and try again.'))
    } finally {
      setBusy(false)
    }
  }

  async function signOutAndRetry() {
    try { await signOut() } catch { /* render will route */ }
  }

  const back = (
    <Link to={`/welcome${previewSuffix}`} className="inline-flex items-center gap-1 text-xs font-medium text-valence-muted hover:text-valence-text">
      <ArrowLeft className="h-3 w-3" /> Back
    </Link>
  )

  const validPreview = previewState && typeof previewState === 'object'

  return (
    <OnboardingShell right={back} maxWidth="max-w-lg">
      <div className="space-y-7">
        <header className="text-center">
          <p className="vl-eyebrow-ink">Join your team</p>
          <h1 className="mt-2 font-display text-3xl font-bold leading-tight text-valence-text">
            Got an invite code?
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-valence-muted">
            Paste the 8-character code your firm's admin sent you — we'll drop you straight into their workspace.
          </p>
        </header>

        {blockingError === 'alreadyOnTeam' && (
          <div ref={blockingErrorRef} className="rounded-xl border-2 border-valence-warning/60 bg-valence-warning/15 p-5 space-y-3 shadow-lg shadow-valence-warning/10 animate-fade-in">
            <p className="text-sm font-semibold text-valence-text">You're already in a firm.</p>
            <p className="text-xs leading-relaxed text-valence-muted">
              This Google account already has a seat. To join a different firm, sign out and use a different account.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={signOutAndRetry} className="vl-btn-primary text-xs">Sign out and try a different account</button>
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
              className="vl-input text-center font-mono text-2xl tracking-[0.4em] uppercase"
              value={code}
              onChange={e => onCodeChange(e.target.value)}
              placeholder="ABCD2345"
              maxLength={8}
              autoFocus
            />
            <p className="text-[11px] text-valence-subtle">8 letters / digits · case-insensitive · no I, O, 0, or 1.</p>

            {previewState === 'loading' && (
              <div className="mt-2 inline-flex items-center gap-2 text-[12px] text-valence-muted">
                <Loader2 className="h-3 w-3 animate-spin" /> Checking code…
              </div>
            )}
            {previewState === 'invalid' && (
              <div className="mt-2 rounded-lg border border-valence-danger/30 bg-valence-danger/5 px-3 py-2 text-[12px] text-valence-danger animate-fade-in">
                That code isn't valid or has been claimed. Ask your admin for a fresh one.
              </div>
            )}
            {validPreview && (
              <div className="mt-2 flex items-start gap-3 rounded-lg border border-valence-blue/30 bg-valence-blue-soft/40 px-3.5 py-3 animate-fade-in">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-valence-blue text-white shadow-sm">
                  <Building2 className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-valence-blue-deep">You're joining</p>
                  <p className="mt-0.5 truncate text-sm font-semibold text-valence-text">{previewState.orgName}</p>
                  <p className="mt-0.5 text-[11px] text-valence-muted">
                    Added as <span className="font-semibold text-valence-text">{previewState.role}</span>. Fill in your details below.
                  </p>
                </div>
              </div>
            )}
          </div>

          <Field icon={<User className="h-3 w-3" />} label="Full name *">
            <input className="vl-input" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Doe" />
          </Field>
          <Field label="Title / role">
            <input className="vl-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Senior Associate" />
          </Field>
          <Field label="Phone (optional)">
            <input className="vl-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+44 20 7946 0000" />
          </Field>
        </div>

        <div className="flex items-center justify-between gap-3">
          <Link to={`/onboarding${previewSuffix}`} className="text-xs text-valence-muted hover:text-valence-text">
            No invite? Start a team →
          </Link>
          <button
            onClick={submit}
            disabled={busy || code.length !== 8 || !fullName.trim() || previewState === 'invalid'}
            className="vl-btn-primary"
          >
            {busy
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Joining…</>
              : validPreview
                ? <><Check className="h-3.5 w-3.5" /> Join {previewState.orgName}</>
                : <><Check className="h-3.5 w-3.5" /> Join team</>}
          </button>
        </div>
      </div>
    </OnboardingShell>
  )
}

function Field({ icon, label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="vl-label inline-flex items-center gap-1.5">{icon} {label}</label>
      {children}
    </div>
  )
}
