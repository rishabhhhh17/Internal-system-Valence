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

import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Loader2, Check, Building2, Sparkles, KeyRound, ArrowLeft, ArrowRight, User } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { openCycle, PLANS } from '../lib/billing.js'
import { useToast } from '../components/Toast.jsx'
import { useAuth } from '../hooks/useAuth.js'
import Logo from '../components/Logo.jsx'

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

  const [step, setStep]         = useState(1) // 1 = firm, 2 = profile
  const [firmName, setFirmName] = useState('')
  const [plan, setPlan]         = useState(PLANS.WE_RUN_AI)
  const [fullName, setFullName] = useState(profile?.name || '')
  const [title, setTitle]       = useState('')
  const [phone, setPhone]       = useState('')
  const [busy, setBusy]         = useState(false)

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
      // RPC creates the org and our admin seat in one transaction. Avoids
      // the chicken-and-egg of "user has no seat yet, so RLS blocks the
      // inserts into orgs/seats."
      const { data: newOrgId, error: rpcErr } = await supabase.rpc('start_team', {
        p_org_name:  firmName.trim(),
        p_full_name: fullName.trim(),
        p_title:     title.trim() || null,
        p_phone:     phone.trim() || null
      })
      if (rpcErr) throw rpcErr

      // If the user picked a different plan, update the org (RLS now lets
      // us — we just created the seat). Cycle anchor is today so the first
      // cycle starts now rather than rolling forward to next month.
      if (plan !== PLANS.WE_RUN_AI) {
        await supabase.from('orgs')
          .update({ plan, cycle_anchor_day: new Date().getDate() })
          .eq('id', newOrgId)
      } else {
        await supabase.from('orgs')
          .update({ cycle_anchor_day: new Date().getDate() })
          .eq('id', newOrgId)
      }

      // Open the first billing cycle so the meter has somewhere to record.
      try { await openCycle(supabase, newOrgId) } catch (e) { console.warn('openCycle failed (non-fatal)', e) }

      toast.success(`Welcome, ${firmName.trim()}.`)
      // The useSeat hook will pick up the new seat on its next refresh —
      // navigate to the app root and App.jsx routes us in.
      navigate('/', { replace: true })
    } catch (err) {
      toast.error(err?.message || 'Onboarding failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-valence-bg">
      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-10">
        <header className="flex items-center justify-between">
          <Link to="/welcome" className="text-xs text-valence-muted hover:text-valence-text inline-flex items-center gap-1">
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
                  : 'This is what shows up on your seat and on shared mandate pages.'}
              </p>
            </div>

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
                    disabled={busy || !fullName.trim()}
                    className="vl-btn-primary"
                  >
                    {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating firm…</> : <><Check className="h-3.5 w-3.5" /> Create firm</>}
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
