import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Check, Building2, Sparkles, KeyRound } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { openCycle, PLANS } from '../lib/billing.js'
import { useToast } from '../components/Toast.jsx'

// First-run onboarding for a new customer firm. Two steps:
//   1. Firm name
//   2. Plan (BYO Key · Own Key · We Run AI)
// On submit:
//   - Insert orgs row
//   - Insert seats row linking the signed-in user
//   - openCycle() to materialise the first billing cycle
// Then bounces to /. The real auth gate (App.jsx) will eventually require
// org membership before letting anyone hit a route other than this one.

const PLAN_DETAILS = [
  {
    id: PLANS.BYO_KEY,
    title: 'Bring your own key',
    blurb: 'You provide a Gemini API key in Settings → Integrations. AI usage is on your Google bill; we only charge seat fees.',
    icon: KeyRound,
    bestFor: 'Firms with an existing AI budget'
  },
  {
    id: PLANS.WE_RUN_AI,
    title: 'We run the AI',
    blurb: 'We manage the model, the key, and the cost. Each seat gets an included allowance every month; explicit opt-in for overage.',
    icon: Sparkles,
    bestFor: 'Easiest to get started',
    recommended: true
  },
  {
    id: PLANS.OWN_KEY,
    title: 'Own your key',
    blurb: 'Same as bring-your-own — you supply the key, you own the model usage. Different label, same seat-only billing.',
    icon: KeyRound,
    bestFor: 'Firms with vendor-procurement rules'
  }
]

export default function Onboarding() {
  const navigate = useNavigate()
  const toast = useToast()
  const [firmName, setFirmName] = useState('')
  const [plan, setPlan]         = useState(PLANS.WE_RUN_AI)
  const [busy, setBusy]         = useState(false)

  async function submit() {
    if (!firmName.trim()) {
      toast.error('Enter your firm name first.')
      return
    }
    if (!isSupabaseConfigured) {
      toast.error('Supabase is not configured for this build.')
      return
    }
    setBusy(true)
    try {
      // 1. Create the org
      const { data: org, error: orgErr } = await supabase
        .from('orgs')
        .insert({ name: firmName.trim(), plan, cycle_anchor_day: new Date().getDate() })
        .select()
        .single()
      if (orgErr) throw orgErr

      // 2. Try to get current auth user (auth gate is off in demo —
      //    this may be null, in which case the seat goes in unlinked).
      const { data: sess } = await supabase.auth.getSession()
      const user = sess?.session?.user || null

      // 3. Create the first seat
      const { error: seatErr } = await supabase
        .from('seats')
        .insert({
          org_id: org.id,
          user_id: user?.id || null,
          email:   user?.email || null,
          billable_from: new Date().toISOString().slice(0, 10)
        })
      if (seatErr) throw seatErr

      // 4. Open the first billing cycle
      await openCycle(supabase, org.id)

      toast.success(`Welcome, ${firmName.trim()}.`)
      navigate('/')
    } catch (err) {
      toast.error(err?.message || 'Onboarding failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-valence-bg px-6 py-10">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center">
          <p className="vl-eyebrow-ink">First-time setup</p>
          <h1 className="font-display text-2xl font-bold text-valence-text mt-2">Set up your firm.</h1>
          <p className="text-sm text-valence-muted mt-1">
            Two steps. You can change everything later in Settings.
          </p>
        </div>

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
          <p className="vl-eyebrow-ink">Pick a plan</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
          <button
            onClick={submit}
            disabled={busy || !firmName.trim()}
            className="vl-btn-primary"
          >
            {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Setting up…</> : <><Check className="h-3.5 w-3.5" /> Create firm</>}
          </button>
        </div>

        <p className="text-[11px] text-valence-subtle text-center">
          By continuing you agree to the <a className="text-valence-blue hover:underline" href="/terms">Terms</a> and <a className="text-valence-blue hover:underline" href="/privacy">Privacy Policy</a>.
        </p>
      </div>
    </div>
  )
}
