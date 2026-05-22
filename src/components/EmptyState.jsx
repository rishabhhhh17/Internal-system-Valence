import { useState } from 'react'
import { Sparkles, Database, Loader2 } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { seedSampleFirm } from '../lib/demoSeed.js'
import { PITCH_MODE } from '../lib/featureFlags.js'
import { humanError } from '../lib/userError.js'
import { useToast } from './Toast.jsx'

// Centred empty-state card used across list pages (/people, /funds, /deals,
// /interactions, etc.). Two improvements over the original:
//
//   1. The primary action stays the same (e.g. "+ Log interaction").
//   2. A new SECONDARY link offers "Load sample firm" — one click seeds
//      the connected Supabase project with persona data. This is the
//      breakthrough for cold customer demos: every empty page now has a
//      ten-second path to a populated product, not just the homepage.
//
// The "Load sample" affordance only renders when the firm is genuinely
// blank (sampleEligible prop or auto-detect via empty allowance). On a
// populated production instance it stays hidden.

export default function EmptyState({
  title,
  description,
  icon: Icon = Sparkles,
  action,
  // Show the "Load sample firm" link. Default true so any cold-start view
  // gets the path; pass `sampleEligible={false}` to hide it (e.g. for
  // filtered-no-results states where seeding wouldn't help).
  sampleEligible = true
}) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  async function onLoadSample() {
    if (!isSupabaseConfigured || busy) return
    setBusy(true)
    try {
      const result = await seedSampleFirm(supabase)
      toast.success(`Loaded sample firm — ${result.totalInserted} rows`)
      setTimeout(() => window.location.reload(), 500)
    } catch (err) {
      toast.error(humanError(err, 'Could not load sample firm'))
      setBusy(false)
    }
  }

  // Hide the "Load sample firm" affordance on production builds and in
  // PITCH_MODE. Reasoning: a real customer-facing prod empty state with
  // a "load sample data" link reads as "this is a sandbox" rather than
  // "this is your workspace." Admins who genuinely want to seed sample
  // data still have the dedicated Settings → Data → Sample firm panel.
  // Dev / local builds keep it for one-click iteration.
  const showSampleLink =
    sampleEligible && isSupabaseConfigured && !PITCH_MODE && import.meta.env.DEV

  return (
    <div className="vl-card flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-valence-blue-soft ring-1 ring-valence-blue/30">
        <Icon className="h-5 w-5 text-valence-blue" />
      </div>
      <h3 className="text-base font-semibold text-valence-text">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-valence-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
      {showSampleLink && (
        <button
          onClick={onLoadSample}
          disabled={busy}
          className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-valence-blue hover:text-valence-blue/80 transition disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Database className="h-3 w-3" />}
          {busy ? 'Seeding sample firm…' : 'or load a sample firm to explore'}
        </button>
      )}
    </div>
  )
}
