// /onboarding/firm-type — the firm-type gate. Shown to any seated user
// whose org has firm_type IS NULL. One decision: IB / PE / VC. The choice
// is persisted via set_org_firm_type and unlocks the curated feature set
// for that firm type (see src/lib/features.js). After save we navigate
// home explicitly (the App.jsx gate stops matching this URL the moment
// firm_type is set, and the main Layout doesn't register the route).

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Briefcase, Rocket } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { useSeat } from '../hooks/useSeat.js'
import { useToast } from '../components/Toast.jsx'
import { humanError } from '../lib/userError.js'
import { FIRM_TYPES } from '../lib/features.js'
import OnboardingShell, { ChoiceCard } from '../components/OnboardingShell.jsx'

const ICONS = { ib: Briefcase, pe: Building2, vc: Rocket }

export default function FirmTypePicker() {
  const { org, refresh } = useSeat()
  const navigate = useNavigate()
  const toast = useToast()
  const [busy, setBusy] = useState(null)

  async function pick(firmType) {
    if (!isSupabaseConfigured) { toast.error('Supabase not configured.'); return }
    setBusy(firmType)
    try {
      const { error } = await supabase.rpc('set_org_firm_type', { p_firm_type: firmType })
      if (error) throw error
      await refresh()
      navigate('/', { replace: true })
    } catch (e) {
      toast.error(humanError(e, 'Could not save your firm type — try again.'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <OnboardingShell maxWidth="max-w-4xl">
      <div className="space-y-10">
        <header className="text-center">
          <p className="vl-eyebrow-ink">One last thing</p>
          <h1 className="mx-auto mt-3 max-w-2xl font-display text-4xl font-bold leading-[1.05] text-valence-text sm:text-5xl text-balance">
            What kind of firm is{' '}
            <span className="text-valence-blue">{org?.name || 'this'}</span>?
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-valence-muted">
            We use this to switch on the right tools by default. Change any
            feature later in Settings → Advanced.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-3">
          {FIRM_TYPES.map(t => (
            <ChoiceCard
              key={t.id}
              icon={ICONS[t.id]}
              eyebrow={t.id.toUpperCase()}
              title={t.label}
              body={t.blurb}
              onClick={() => pick(t.id)}
              busy={busy === t.id}
              disabled={busy !== null}
            />
          ))}
        </div>

        <p className="text-center text-[11px] text-valence-subtle">
          Picking the right one now means the right features show up by default. Nothing is locked in.
        </p>
      </div>
    </OnboardingShell>
  )
}
