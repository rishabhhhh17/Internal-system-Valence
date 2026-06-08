// Start-a-team flow — second screen after "Start a team" on /welcome.
//   Step 1: firm name + plan   Step 2: your profile
// Submit calls public.start_team() (atomic org + admin seat), then a
// best-effort plan update + first billing cycle. useSeat.refresh() runs
// BEFORE navigate so App.jsx doesn't bounce back to /welcome.

import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { Loader2, Check, Building2, Sparkles, KeyRound, ArrowLeft, ArrowRight, User } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { signOut } from '../lib/google.js'
import { openCycle, PLANS } from '../lib/billing.js'
import { useToast } from '../components/Toast.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { useSeat } from '../hooks/useSeat.js'
import { humanError } from '../lib/userError.js'
import OnboardingShell from '../components/OnboardingShell.jsx'

const PLAN_DETAILS = [
  {
    id: PLANS.WE_RUN_AI,
    title: 'We run the AI',
    blurb: 'We manage the model + keys. Each seat gets a monthly AI allowance.',
    icon: Sparkles,
    bestFor: 'Easiest to start',
    recommended: true,
  },
  {
    id: PLANS.BYO_KEY,
    title: 'Bring your own key',
    blurb: 'Use your own Gemini / OpenAI / Anthropic key. Seat fees only.',
    icon: KeyRound,
    bestFor: 'Existing AI procurement',
  },
]

export default function Onboarding() {
  const navigate = useNavigate()
  const toast    = useToast()
  const { profile } = useAuth()
  const [params] = useSearchParams()
  const isPreview = params.get('preview') === '1'
  const previewSuffix = isPreview ? '?preview=1' : ''
  const blockingErrorRef = useRef(null)
  const { refresh: refreshSeat } = useSeat()

  const [step, setStep]         = useState(1)
  const [firmName, setFirmName] = useState('')
  const [plan, setPlan]         = useState(PLANS.WE_RUN_AI)
  const [fullName, setFullName] = useState(profile?.name || '')
  const [title, setTitle]       = useState('')
  const [phone, setPhone]       = useState('')
  const [blockingError, setBlockingError] = useState(null)
  const [busy, setBusy]         = useState(false)

  useEffect(() => {
    if (!blockingError) return
    blockingErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [blockingError])

  function nextFromFirm() {
    if (!firmName.trim()) { toast.error('Enter your firm name first.'); return }
    setStep(2)
  }

  async function submit() {
    if (!isSupabaseConfigured) { toast.error('Supabase is not configured for this build.'); return }
    if (!fullName.trim()) { toast.error('Add your name so the team can see who you are.'); return }
    setBusy(true)
    try {
      const { data: newOrgId, error: rpcErr } = await supabase.rpc('start_team', {
        p_org_name:  firmName.trim(),
        p_full_name: fullName.trim(),
        p_title:     title.trim() || null,
        p_phone:     phone.trim() || null,
      })
      if (rpcErr) throw rpcErr

      try {
        const updates = plan !== PLANS.WE_RUN_AI
          ? { plan, cycle_anchor_day: new Date().getDate() }
          : { cycle_anchor_day: new Date().getDate() }
        const { error: planErr } = await supabase.from('orgs').update(updates).eq('id', newOrgId)
        if (planErr) console.warn('[onboarding] plan/anchor update failed (non-fatal):', planErr.message)
      } catch (e) { console.warn('[onboarding] plan/anchor update threw (non-fatal):', e?.message || e) }

      try { await openCycle(supabase, newOrgId) } catch (e) {
        console.warn('[onboarding] openCycle failed (non-fatal):', e?.message || e)
      }

      toast.success(`Welcome, ${firmName.trim()}.`)
      await refreshSeat()
      navigate('/', { replace: true })
    } catch (err) {
      const raw = String(err?.message || '')
      if (/user already belongs to a team/i.test(raw)) setBlockingError('alreadyOnTeam')
      else toast.error(humanError(err, 'Could not create your firm — try again.'))
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

  return (
    <OnboardingShell right={back} maxWidth="max-w-lg" steps={{ current: step, total: 2, labels: ['Firm', 'You'] }}>
      <div className="space-y-7">
        <header className="text-center">
          <p className="vl-eyebrow-ink">Start a team</p>
          <h1 className="mt-2 font-display text-3xl font-bold leading-tight text-valence-text">
            {step === 1 ? 'Tell us about your firm' : 'Tell us about you'}
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-valence-muted">
            {step === 1
              ? 'Two quick steps. Everything is editable in Settings later.'
              : 'This is what shows on your seat and on shared mandate pages.'}
          </p>
        </header>

        {blockingError === 'alreadyOnTeam' && (
          <div ref={blockingErrorRef} className="rounded-xl border-2 border-valence-warning/60 bg-valence-warning/15 p-5 space-y-3 shadow-lg shadow-valence-warning/10 animate-fade-in">
            <p className="text-sm font-semibold text-valence-text">You're already in a firm.</p>
            <p className="text-xs leading-relaxed text-valence-muted">
              This Google account already has a seat. To start a brand-new firm, sign out and use a different account.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={signOutAndRetry} className="vl-btn-primary text-xs">Sign out and start fresh</button>
              <Link to="/" className="vl-btn-ghost text-xs">Go to my current firm</Link>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6 animate-fade-in">
            <div className="vl-card p-5 space-y-2">
              <label className="vl-label inline-flex items-center gap-1.5">
                <Building2 className="h-3 w-3" /> Firm name
              </label>
              <input
                className="vl-input text-base"
                value={firmName}
                onChange={e => setFirmName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && nextFromFirm()}
                placeholder="Valence Growth Partners"
                autoFocus
              />
            </div>

            <div className="space-y-2.5">
              <p className="vl-eyebrow-ink">Pick a plan · changeable later</p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {PLAN_DETAILS.map(p => {
                  const Icon = p.icon
                  const selected = plan === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPlan(p.id)}
                      className={`relative rounded-xl border p-4 text-left transition ${
                        selected
                          ? 'border-valence-blue bg-valence-blue-soft shadow-valence'
                          : 'border-valence-border bg-valence-elevated hover:border-valence-blue/40'
                      }`}
                    >
                      {p.recommended && (
                        <span className="absolute right-2 top-2 rounded-full bg-valence-blue px-1.5 py-0.5 text-[9px] font-bold text-white">
                          RECOMMENDED
                        </span>
                      )}
                      <Icon className={`h-4 w-4 ${selected ? 'text-valence-blue-deep' : 'text-valence-muted'}`} />
                      <p className="mt-2 text-sm font-semibold text-valence-text">{p.title}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-valence-muted">{p.blurb}</p>
                      <p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-valence-subtle">{p.bestFor}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            <button onClick={nextFromFirm} disabled={!firmName.trim()} className="vl-btn-primary w-full justify-center">
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 animate-fade-in">
            <div className="vl-card p-5 space-y-4">
              <Field icon={<User className="h-3 w-3" />} label="Full name *">
                <input className="vl-input" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Doe" autoFocus={!fullName} />
              </Field>
              <Field label="Title / role">
                <input className="vl-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Managing Partner" />
              </Field>
              <Field label="Phone (optional)">
                <input className="vl-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+44 20 7946 0000" />
              </Field>
            </div>

            <div className="flex items-center justify-between">
              <button onClick={() => setStep(1)} disabled={busy} className="vl-btn-ghost">
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <button onClick={submit} disabled={busy || !fullName.trim()} className="vl-btn-primary">
                {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating firm…</> : <><Check className="h-3.5 w-3.5" /> Create firm</>}
              </button>
            </div>
          </div>
        )}
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
