// Start-a-team flow — the second screen a freshly signed-in user sees if
// they picked "Start a team" on /welcome. Two steps:
//   1. Firm name + plan
//   2. Your profile: name, title, phone
//
// On submit, calls the public.start_team() RPC which atomically creates
// the org and the admin seat in one transaction. After it succeeds we
// open the first billing cycle and the seat-aware redirect logic in
// App.jsx bounces us into the main app.
//
// All inserts are gated by the multi-tenant RLS rewrite — every seat
// belongs to exactly one org, and every customer-data table is scoped to
// org_id = current_user_org_id() on read + write.

import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { Loader2, Check, Building2, Sparkles, KeyRound, ArrowLeft, ArrowRight, User } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { signOut } from '../lib/google.js'
import { openCycle, PLANS } from '../lib/billing.js'
import { useToast } from '../components/Toast.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { useSeat } from '../hooks/useSeat.js'
import Logo from '../components/Logo.jsx'
import { humanError } from '../lib/userError.js'

// Two plan choices on the onboarding screen. "Own your key" was a third
// option that was functionally identical to "Bring your own key" with
// different wording for procurement teams — folded into BYO so the
// picker isn't visually three duplicate buttons.
const PLAN_DETAILS = [
  {
    id: PLANS.WE_RUN_AI,
    title: 'We run the AI',
    blurb: 'We manage the model and the API keys. Each seat gets a monthly AI allowance; opt in for overage if you exceed it.',
    icon: Sparkles,
    bestFor: 'Easiest to get started',
    recommended: true
  },
  {
    id: PLANS.BYO_KEY,
    title: 'Bring your own key',
    blurb: 'You provide your own Gemini / OpenAI / Anthropic key. We charge seat fees only; AI usage is on your bill.',
    icon: KeyRound,
    bestFor: 'Firms with existing AI procurement'
  }
]

export default function Onboarding() {
  const navigate = useNavigate()
  const toast    = useToast()
  const { profile } = useAuth()
  const [params] = useSearchParams()
  const isPreview = params.get('preview') === '1'
  const previewSuffix = isPreview ? '?preview=1' : ''
  // Anchor for scrollIntoView when the blocking-error card appears —
  // the user-reported "Start a team isn't working" symptom is actually
  // the card mounting below the fold and being missed entirely.
  const blockingErrorRef = useRef(null)
  // refresh() forces useSeat to re-query after start_team succeeds. Without
  // it, App.jsx still sees hasSeat=false at the navigate('/') hop and
  // bounces the user right back to /welcome — looked like an infinite
  // "fill the form, end up at the same screen" loop. Same fix that
  // CompleteProfile.jsx has been doing since day one.
  // hasSeat lets us pre-block the form for users who already belong to a
  // firm. Submitting would 4xx anyway with "user already belongs to a
  // team" (we have a yellow card for it), but disabling the button up
  // front avoids the form-fill-then-reject jank.
  const { refresh: refreshSeat, hasSeat } = useSeat()

  const [step, setStep]         = useState(1) // 1 = firm, 2 = profile
  const [firmName, setFirmName] = useState('')
  const [plan, setPlan]         = useState(PLANS.WE_RUN_AI)
  const [fullName, setFullName] = useState(profile?.name || '')
  const [title, setTitle]       = useState('')
  const [phone, setPhone]       = useState('')
  const [blockingError, setBlockingError] = useState(null)
  const [busy, setBusy]         = useState(false)

  // When the blocking-error card appears, scroll it into view + flash it
  // into the page so the user can't miss it. Without this the card
  // sometimes mounts below the fold (small viewports, dev tools open)
  // and the user thinks the submit did nothing.
  useEffect(() => {
    if (!blockingError) return
    blockingErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [blockingError])

  function nextFromFirm() {
    if (!firmName.trim()) {
      toast.error('Enter your firm name first.')
      return
    }
    setStep(2)
  }

  async function submit() {
    if (!isSupabaseConfigured) {
      toast.error('Supabase is not configured for this build.')
      return
    }
    if (!fullName.trim()) {
      toast.error('Add your name so the team can see who you are.')
      return
    }
    setBusy(true)
    try {
      // STEP 1 (REQUIRED) — atomic RPC creates the org + admin seat in
      // one transaction. If this fails, the whole onboarding fails and
      // the user sees an error. Nothing else has run yet, so nothing to
      // roll back.
      const { data: newOrgId, error: rpcErr } = await supabase.rpc('start_team', {
        p_org_name:  firmName.trim(),
        p_full_name: fullName.trim(),
        p_title:     title.trim() || null,
        p_phone:     phone.trim() || null
      })
      if (rpcErr) throw rpcErr

      // STEP 2 (BEST-EFFORT) — apply the plan choice + cycle anchor.
      // start_team already defaults to plan='we_run_ai' and cycle_anchor_day=1.
      // If this update fails (network blip, RLS hiccup) the user just keeps
      // the default plan and can change it in Settings later. NOT a reason
      // to block them at onboarding. Same logic for the cycle_anchor_day
      // bump — having it default to 1 is sensible if today's update fails.
      try {
        const updates = plan !== PLANS.WE_RUN_AI
          ? { plan, cycle_anchor_day: new Date().getDate() }
          : { cycle_anchor_day: new Date().getDate() }
        const { error: planErr } = await supabase.from('orgs').update(updates).eq('id', newOrgId)
        if (planErr) console.warn('[onboarding] plan/anchor update failed (non-fatal):', planErr.message)
      } catch (e) {
        console.warn('[onboarding] plan/anchor update threw (non-fatal):', e?.message || e)
      }

      // STEP 3 (BEST-EFFORT) — open the first billing cycle so the AI
      // meter has somewhere to record. If this fails, billing.js' lazy
      // openCycle is also called from the first meter write, so the
      // cycle still gets created at first AI use. NOT a reason to block.
      try { await openCycle(supabase, newOrgId) } catch (e) {
        console.warn('[onboarding] openCycle failed (non-fatal):', e?.message || e)
      }

      toast.success(`Welcome, ${firmName.trim()}.`)

      // CRITICAL: refresh useSeat BEFORE navigating. The seat was created
      // on the server but React/useSeat still thinks the user has none.
      // Without this await, App.jsx renders / with stale hasSeat=false
      // and redirects right back to /welcome — the user-reported
      // "I fill the form and land back at the same screen" loop.
      await refreshSeat()
      navigate('/', { replace: true })
    } catch (err) {
      // Common case: signed-in user already has a seat (typically a dev
      // testing the flow without signing out). The toast is too transient
      // for this — surface it as a prominent inline card with a direct
      // Sign-out button so the path forward is obvious.
      const raw = String(err?.message || '')
      if (/user already belongs to a team/i.test(raw)) {
        setBlockingError('alreadyOnTeam')
      } else {
        toast.error(humanError(err, 'Could not create your firm — try again.'))
      }
    } finally {
      setBusy(false)
    }
  }

  async function signOutAndRetry() {
    try { await signOut() } catch { /* render will route */ }
    // signOut() clears Supabase session + valence.* localStorage → App.jsx
    // re-renders, no session, renders Login.
  }

  return (
    <div className="min-h-screen bg-valence-bg">
      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-10">
        <header className="flex items-center justify-between">
          <Link to={`/welcome${previewSuffix}`} className="text-xs text-valence-muted hover:text-valence-text inline-flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Back
          </Link>
          <Logo />
        </header>

        <main className="flex flex-1 items-center">
          <div className="w-full space-y-8">
            <div>
              <p className="vl-eyebrow-ink">Step {step} of 2 · Start a team</p>
              <h1 className="font-display text-3xl font-bold text-valence-text mt-2">
                {step === 1 ? "Tell us about your firm." : "Tell us about you."}
              </h1>
              <p className="text-sm text-valence-muted mt-1.5 max-w-lg">
                {step === 1
                  ? 'Two quick steps. You can change everything in Settings later.'
                  : 'This is what shows up on your seat and on shared deal pages.'}
              </p>
            </div>

            {blockingError === 'alreadyOnTeam' && (
              <div ref={blockingErrorRef} className="rounded-xl border-2 border-valence-warning/60 bg-valence-warning/15 p-5 space-y-3 shadow-lg shadow-valence-warning/10 animate-fade-in">
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold text-valence-text">You're already in a firm.</p>
                  <p className="text-xs text-valence-muted leading-relaxed">
                    Your current Google account already has a seat in a Valence workspace. To start a brand-new firm,
                    sign out and sign back in with a different Google account, or use the &quot;Use a different account&quot; option.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={signOutAndRetry} className="vl-btn-primary text-xs">
                    Sign out and start fresh
                  </button>
                  <Link to="/" className="vl-btn-ghost text-xs">Go to my current firm</Link>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-5">
                <div className="vl-card p-5 space-y-2">
                  <label className="vl-label inline-flex items-center gap-1.5">
                    <Building2 className="h-3 w-3" /> Firm name
                  </label>
                  <input
                    className="vl-input"
                    value={firmName}
                    onChange={e => setFirmName(e.target.value)}
                    placeholder="Valence Growth Partners"
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
                  <p className="vl-eyebrow-ink">Pick a plan (changeable later)</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {PLAN_DETAILS.map(p => {
                      const Icon = p.icon
                      const selected = plan === p.id
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setPlan(p.id)}
                          className={`text-left p-4 rounded-xl border transition relative ${
                            selected
                              ? 'border-valence-blue bg-valence-blue-soft'
                              : 'border-valence-border bg-valence-elevated hover:border-valence-ink/30'
                          }`}
                        >
                          {p.recommended && (
                            <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-valence-blue text-white text-[9px] font-bold px-1.5 py-0.5">
                              RECOMMENDED
                            </span>
                          )}
                          <Icon className={`h-4 w-4 ${selected ? 'text-valence-blue-deep' : 'text-valence-muted'}`} />
                          <p className="mt-2 text-sm font-semibold text-valence-text">{p.title}</p>
                          <p className="mt-1 text-[11px] leading-relaxed text-valence-muted">{p.blurb}</p>
                          <p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-valence-subtle">
                            Best for: {p.bestFor}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-end">
                  <button onClick={nextFromFirm} disabled={!firmName.trim()} className="vl-btn-primary">
                    Continue <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div className="vl-card p-5 space-y-4">
                  <ProfileField icon={<User className="h-3 w-3" />} label="Full name *">
                    <input className="vl-input" value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      placeholder="Jane Doe"
                      autoFocus={!fullName} />
                  </ProfileField>
                  <ProfileField label="Title / role">
                    <input className="vl-input" value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder="Managing Partner" />
                  </ProfileField>
                  <ProfileField label="Phone (optional)">
                    <input className="vl-input" value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="+44 20 7946 0000" />
                  </ProfileField>
                </div>

                <div className="flex items-center justify-between">
                  <button onClick={() => setStep(1)} disabled={busy} className="vl-btn-ghost">
                    <ArrowLeft className="h-4 w-4" /> Back
                  </button>
                  <button
                    onClick={submit}
                    disabled={busy || !fullName.trim() || hasSeat}
                    className="vl-btn-primary"
                  >
                    {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating firm…</> : hasSeat ? <>Already on a team</> : <><Check className="h-3.5 w-3.5" /> Create firm</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>

        <footer className="text-[11px] text-valence-subtle text-center pt-8">
          By continuing you agree to the <a className="text-valence-blue hover:underline" href="/terms">Terms</a> and <a className="text-valence-blue hover:underline" href="/privacy">Privacy Policy</a>.
        </footer>
      </div>
    </div>
  )
}

function ProfileField({ icon, label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="vl-label inline-flex items-center gap-1.5">
        {icon} {label}
      </label>
      {children}
    </div>
  )
}
