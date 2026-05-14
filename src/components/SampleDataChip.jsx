import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Database, Loader2, RefreshCw, Trash2, X, Check, AlertTriangle } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { seedSampleFirm, resetSampleFirm } from '../lib/demoSeed.js'
import { useToast } from './Toast.jsx'

// Topbar pill that lets the user (or a customer running a demo) seed
// sample data or wipe everything. Self-hides if Supabase isn't configured.
//
// Two modes:
//   Empty firm  → "Load sample"    button (one-click seed)
//   Has data    → "Sample data"    pill with menu (re-seed missing tables / reset everything)

function ToBody({ children }) {
  if (typeof document === 'undefined') return null
  return createPortal(children, document.body)
}

export default function SampleDataChip() {
  const toast = useToast()
  const [counts, setCounts]   = useState(null)
  const [open, setOpen]       = useState(false)
  const [busy, setBusy]       = useState(null)        // 'seed' | 'reset' | null
  const [confirmReset, setConfirmReset] = useState(false)

  // Best-effort counts so the chip can label itself ("Empty" / "Sample").
  // Failures (network / RLS) just leave counts as null and the chip stays
  // out of the way.
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
        /* swallow */
      }
    })()
    return () => { cancelled = true }
  }, [busy])

  if (!isSupabaseConfigured) return null

  // Render-state machine: `counts` is null until Supabase responds. We use
  // three explicit states (loading / empty / hasData) so the label + title
  // branches never read `counts.funds` on null.
  const loadingCounts = counts === null
  const isEmpty       = !loadingCounts && counts.deals === 0 && counts.funds === 0 && counts.people === 0
  const hasData       = !loadingCounts && (counts.deals > 0 || counts.funds > 0 || counts.people > 0)
  const totalRows     = loadingCounts ? 0 : (counts.funds + counts.people + counts.deals)

  async function onSeed() {
    setBusy('seed')
    try {
      const result = await seedSampleFirm(supabase)
      toast.success(`Seeded — ${result.totalInserted} rows`)
      setOpen(false)
      setTimeout(() => window.location.reload(), 500)
    } catch (err) {
      toast.error(err?.message || 'Seed failed')
      setBusy(null)
    }
  }

  async function onReset() {
    setBusy('reset')
    try {
      await resetSampleFirm(supabase)
      toast.success('Firm wiped')
      setConfirmReset(false)
      setOpen(false)
      setTimeout(() => window.location.reload(), 500)
    } catch (err) {
      toast.error(err?.message || 'Reset failed')
      setBusy(null)
    }
  }

  // Closed-state chip: one button when empty, info pill when populated.
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
          isEmpty
            ? 'border-valence-blue/40 bg-valence-blue-soft text-valence-blue hover:bg-valence-blue-soft/80'
            : 'border-valence-border bg-white text-valence-muted hover:text-valence-text'
        }`}
        title={
          loadingCounts ? 'Checking firm state…'
        : isEmpty       ? 'Load sample firm'
        :                 `Manage sample data · ${counts.funds} funds · ${counts.people} people · ${counts.deals} mandates`
        }
      >
        <Database className="h-3 w-3" />
        {loadingCounts
          ? 'Sample data'
          : isEmpty
            ? 'Load sample'
            : <>Sample · <span className="tabular-nums opacity-70">{totalRows}</span></>}
      </button>

      {open && (
        <ToBody>
          <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[12vh] px-4" role="dialog" aria-modal="true" aria-label="Sample data">
            <div className="absolute inset-0 bg-valence-ink/45 backdrop-blur-sm animate-fade-in" onClick={() => !busy && setOpen(false)} />
            <div className="relative w-full max-w-md animate-slide-up rounded-2xl border border-valence-border bg-white shadow-valence-lg overflow-hidden">
              <div className="flex items-start justify-between gap-3 border-b border-valence-border px-5 py-3.5">
                <div>
                  <p className="vl-eyebrow-ink inline-flex items-center gap-1.5">
                    <Database className="h-3 w-3 text-valence-blue" /> Sample data
                  </p>
                  <p className="mt-1 text-[12px] text-valence-muted">
                    {counts ? `${counts.funds} funds · ${counts.people} people · ${counts.deals} mandates` : 'Loading…'}
                  </p>
                </div>
                <button onClick={() => !busy && setOpen(false)} className="vl-btn-ghost shrink-0 -mr-2" aria-label="Close" disabled={Boolean(busy)}>
                  <X className="h-4 w-4" />
                </button>
              </div>

              {confirmReset ? (
                <div className="p-5 space-y-4">
                  <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-900">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <p>This wipes every deal, fund, person, note and interaction in the connected Supabase project. Cannot be undone.</p>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => setConfirmReset(false)} className="vl-btn-secondary text-[12px]" disabled={Boolean(busy)}>
                      Cancel
                    </button>
                    <button onClick={onReset} className="vl-btn-primary text-[12px] bg-valence-danger hover:bg-valence-danger/90 border-valence-danger" disabled={Boolean(busy)}>
                      {busy === 'reset' ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Wiping…</> : <><Trash2 className="h-3.5 w-3.5" /> Wipe firm</>}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-5 space-y-2.5">
                  <ActionRow
                    icon={Database}
                    title="Load sample firm"
                    sub="Populates ~50 rows — Kedaara, Bain, Renuka, Sumant etc. Skips tables that already have data."
                    onClick={onSeed}
                    busy={busy === 'seed'}
                    busyLabel="Seeding…"
                    primary
                  />
                  {hasData && (
                    <ActionRow
                      icon={RefreshCw}
                      title="Top up missing tables"
                      sub="Same action, idempotent — only inserts into tables that are still empty."
                      onClick={onSeed}
                      busy={busy === 'seed'}
                      busyLabel="Topping up…"
                    />
                  )}
                  {hasData && (
                    <ActionRow
                      icon={Trash2}
                      title="Wipe the firm"
                      sub="Delete every row across deals, funds, people, interactions, notes."
                      onClick={() => setConfirmReset(true)}
                      busy={false}
                      destructive
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </ToBody>
      )}
    </>
  )
}

function ActionRow({ icon: Icon, title, sub, onClick, busy, busyLabel, primary, destructive }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`group flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition disabled:opacity-60 disabled:cursor-wait ${
        primary
          ? 'border-valence-blue/30 bg-valence-blue-soft/50 hover:bg-valence-blue-soft hover:border-valence-blue/50'
          : destructive
            ? 'border-valence-border bg-white hover:border-valence-danger/30 hover:bg-red-50/40'
            : 'border-valence-border bg-white hover:border-valence-ink/30 hover:bg-valence-surface'
      }`}
    >
      <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
        primary
          ? 'border-valence-blue/30 bg-white text-valence-blue'
          : destructive
            ? 'border-valence-border bg-valence-surface text-valence-danger'
            : 'border-valence-border bg-valence-surface text-valence-muted'
      }`}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="font-display text-sm font-semibold tracking-tight text-valence-text">{busy ? busyLabel : title}</span>
        <span className="block mt-0.5 text-[11px] leading-relaxed text-valence-muted">{sub}</span>
      </span>
      {!busy && primary && <Check className="h-3.5 w-3.5 text-valence-blue/60 group-hover:text-valence-blue transition shrink-0 mt-1.5" />}
    </button>
  )
}
