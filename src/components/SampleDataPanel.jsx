import { useEffect, useState } from 'react'
import { Database, Loader2, RefreshCw, Trash2, AlertTriangle } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { seedSampleFirm, resetSampleFirm } from '../lib/demoSeed.js'
import { humanError } from '../lib/userError.js'
import { useToast } from './Toast.jsx'

// Settings → Data panel for loading or wiping the demo dataset. Replaces
// the topbar SampleDataChip on the pitch branch — Settings is the
// single home for destructive firm-state actions.
export default function SampleDataPanel() {
  const toast = useToast()
  const [counts, setCounts] = useState(null)
  const [busy, setBusy] = useState(null)
  const [confirmReset, setConfirmReset] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let cancelled = false
    ;(async () => {
      try {
        const [d, f, p] = await Promise.all([
          supabase.from('deals').select('id', { count: 'exact', head: true }),
          supabase.from('funds').select('id', { count: 'exact', head: true }),
          supabase.from('people').select('id', { count: 'exact', head: true })
        ])
        if (!cancelled) setCounts({ deals: d.count ?? 0, funds: f.count ?? 0, people: p.count ?? 0 })
      } catch {
        /* swallow — counts stay null, UI shows "Loading…" */
      }
    })()
    return () => { cancelled = true }
  }, [busy])

  if (!isSupabaseConfigured) {
    return (
      <div className="vl-card p-6 text-sm text-valence-muted">
        <div className="font-semibold text-valence-text mb-1 flex items-center gap-2">
          <Database className="h-4 w-4 text-valence-blue" /> Sample data
        </div>
        <p>Supabase is not configured for this build, so seeding is disabled.</p>
      </div>
    )
  }

  const loadingCounts = counts === null
  const isEmpty = !loadingCounts && counts.deals === 0 && counts.funds === 0 && counts.people === 0
  const hasData = !loadingCounts && (counts.deals > 0 || counts.funds > 0 || counts.people > 0)

  async function onSeed() {
    setBusy('seed')
    try {
      const result = await seedSampleFirm(supabase)
      toast.success(`Seeded — ${result.totalInserted} rows`)
      setTimeout(() => window.location.reload(), 500)
    } catch (err) {
      toast.error(humanError(err, 'Could not seed sample firm'))
      setBusy(null)
    }
  }

  async function onReset() {
    setBusy('reset')
    try {
      await resetSampleFirm(supabase)
      toast.success('Firm wiped')
      setConfirmReset(false)
      setTimeout(() => window.location.reload(), 500)
    } catch (err) {
      toast.error(humanError(err, 'Could not reset sample firm'))
      setBusy(null)
    }
  }

  return (
    <div className="vl-card p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-valence-blue-soft p-2 text-valence-blue">
          <Database className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-valence-text">Sample data</h3>
          <p className="text-xs text-valence-muted mt-0.5">
            {loadingCounts
              ? 'Reading current firm state…'
              : isEmpty
              ? 'No firm data yet — load a sample to explore every surface end-to-end.'
              : `${counts.funds} funds · ${counts.people} people · ${counts.deals} deals.`}
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        <ActionRow
          icon={isEmpty ? Database : RefreshCw}
          title={isEmpty ? 'Load sample firm' : 'Top up missing tables'}
          sub={
            isEmpty
              ? 'Populates ~50 rows — Kedaara, Bain, Renuka, Sumant etc.'
              : 'Idempotent — only inserts into tables that are still empty.'
          }
          onClick={onSeed}
          busy={busy === 'seed'}
          busyLabel={isEmpty ? 'Seeding…' : 'Topping up…'}
          primary
          disabled={Boolean(busy)}
        />
        {hasData && !confirmReset && (
          <ActionRow
            icon={Trash2}
            title="Wipe the firm"
            sub="Delete every row across deals, funds, people, interactions, notes."
            onClick={() => setConfirmReset(true)}
            destructive
            disabled={Boolean(busy)}
          />
        )}
      </div>

      {confirmReset && (
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-2 text-[12px] text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>This wipes every deal, fund, person, note and interaction in the connected Supabase project. Cannot be undone.</p>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setConfirmReset(false)} className="vl-btn-secondary-sm" disabled={Boolean(busy)}>
              Cancel
            </button>
            <button
              onClick={onReset}
              disabled={Boolean(busy)}
              className="vl-btn-primary-sm bg-valence-danger hover:bg-valence-danger/90"
            >
              {busy === 'reset' ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Wiping…</> : <><Trash2 className="h-3.5 w-3.5" /> Wipe firm</>}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ActionRow({ icon: Icon, title, sub, onClick, busy, busyLabel, primary, destructive, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition disabled:opacity-60 disabled:cursor-not-allowed ${
        primary
          ? 'border-valence-blue/30 bg-valence-blue-soft/50 hover:bg-valence-blue-soft hover:border-valence-blue/50'
          : destructive
            ? 'border-valence-border bg-valence-elevated hover:border-valence-danger/30 hover:bg-red-50/40'
            : 'border-valence-border bg-valence-elevated hover:border-valence-ink/30 hover:bg-valence-surface'
      }`}
    >
      <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
        primary
          ? 'border-valence-blue/30 bg-valence-elevated text-valence-blue'
          : destructive
            ? 'border-valence-border bg-valence-surface text-valence-danger'
            : 'border-valence-border bg-valence-surface text-valence-muted'
      }`}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-display text-sm font-semibold tracking-tight text-valence-text">{busy ? busyLabel : title}</span>
        <span className="block mt-0.5 text-[11px] leading-relaxed text-valence-muted">{sub}</span>
      </span>
    </button>
  )
}
