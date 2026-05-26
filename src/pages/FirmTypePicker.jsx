// /onboarding/firm-type — second onboarding step.
//
// Shown to any seated user whose org has firm_type IS NULL. Three big
// cards: IB / PE / VC. Choice is persisted via the set_org_firm_type
// RPC. The downstream useFeatureFlag hook then unlocks the feature set
// curated for that firm type (see src/lib/features.js).
//
// The page is intentionally minimal — no marketing copy, one decision,
// one click. After save, useSeat refreshes and App.jsx routes back to /.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Briefcase, Rocket, ArrowRight, Loader2 } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { useSeat } from '../hooks/useSeat.js'
import { useToast } from '../components/Toast.jsx'
import { humanError } from '../lib/userError.js'
import { FIRM_TYPES } from '../lib/features.js'
import Logo from '../components/Logo.jsx'

const ICONS = {
  ib: Briefcase,
  pe: Building2,
  vc: Rocket,
}

export default function FirmTypePicker() {
  const { org, refresh } = useSeat()
  const navigate = useNavigate()
  const toast = useToast()
  const [busy, setBusy] = useState(null)   // 'ib' | 'pe' | 'vc' | null

  async function pick(firmType) {
    if (!isSupabaseConfigured) {
      toast.error('Supabase not configured.')
      return
    }
    setBusy(firmType)
    try {
      const { error } = await supabase.rpc('set_org_firm_type', { p_firm_type: firmType })
      if (error) throw error
      await refresh()
      // Explicit redirect home. The App.jsx gate STOPS firing for this
      // url the moment firm_type is set, but the main Layout's <Routes>
      // doesn't register /onboarding/firm-type — without this navigate
      // the user would land on a blank screen between gates.
      navigate('/', { replace: true })
    } catch (e) {
      toast.error(humanError(e, 'Could not save your firm type — try again.'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="min-h-screen bg-valence-bg">
      <div className="mx-auto flex min-h-screen max-w-[1100px] flex-col px-8 py-10 lg:px-14 lg:py-14">
        <header className="flex items-center justify-between">
          <Logo />
        </header>

        <main className="mt-16 max-w-3xl">
          <p className="vl-eyebrow-ink mb-4">Step 2 of 2</p>
          <h1 className="font-display text-display font-bold text-valence-text leading-[1.05]">
            What kind of firm is{' '}
            <span className="text-valence-blue">{org?.name || 'this'}</span>?
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-valence-muted">
            Pick one. We use this to enable the right tools — you can change anything
            from Settings → Advanced later.
          </p>
        </main>

        <section className="mt-12 grid gap-4 sm:grid-cols-3 max-w-4xl">
          {FIRM_TYPES.map(t => {
            const Icon = ICONS[t.id]
            const isBusy = busy === t.id
            return (
              <button
                key={t.id}
                onClick={() => pick(t.id)}
                disabled={busy !== null}
                className="group relative block overflow-hidden rounded-2xl border border-valence-border bg-valence-elevated p-6 text-left transition hover:border-valence-blue hover:shadow-valence disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="rounded-xl bg-valence-blue-soft p-3 text-valence-blue-deep">
                    <Icon className="h-5 w-5" />
                  </div>
                  {isBusy
                    ? <Loader2 className="h-4 w-4 text-valence-muted animate-spin" />
                    : <ArrowRight className="h-4 w-4 text-valence-subtle opacity-60 group-hover:opacity-100 group-hover:translate-x-1 transition" />
                  }
                </div>
                <p className="mt-5 vl-eyebrow-ink">{t.id.toUpperCase()}</p>
                <h3 className="mt-1 text-lg font-bold text-valence-text leading-tight">{t.label}</h3>
                <p className="mt-2 text-xs text-valence-muted leading-relaxed">{t.blurb}</p>
              </button>
            )
          })}
        </section>

        <footer className="mt-auto pt-16 text-[11px] text-valence-subtle">
          Picking the right one now means the right features show up by default.
          You can flip any feature on or off in Settings later.
        </footer>
      </div>
    </div>
  )
}
