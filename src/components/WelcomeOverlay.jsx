import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Compass, ArrowRight, Loader2, Database, X, Check, Building2, Users, Briefcase } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { seedSampleFirm } from '../lib/demoSeed.js'
import { useToast } from './Toast.jsx'
import { PITCH_MODE } from '../lib/featureFlags.js'

// ------------------------------------------------------------------------------
// First-run welcome.
//
// A cold IB partner clicking the demo URL lands on an empty firm — no deals,
// no funds, no people — and would walk away. This overlay detects that state
// once and offers three paths: load a sample firm, take the guided tour, or
// start empty. After they pick, we never show it again on this browser.
//
// The same code is safe on Rishabh's real production deployment — when the
// firm has data, the overlay self-disables, so it never bothers anyone with
// a populated instance.
// ------------------------------------------------------------------------------

const DISMISSED_KEY = 'valence.welcomeDismissed.v1'
const SEEDED_KEY    = 'valence.sampleSeeded.v1'

function dismissed() { try { return Boolean(localStorage.getItem(DISMISSED_KEY)) } catch { return true } }
function dismiss()   { try { localStorage.setItem(DISMISSED_KEY, '1') } catch {} }
function markSeeded(){ try { localStorage.setItem(SEEDED_KEY, '1') } catch {} }

function ToBody({ children }) {
  if (typeof document === 'undefined') return null
  return createPortal(children, document.body)
}

export default function WelcomeOverlay() {
  const navigate = useNavigate()
  const toast    = useToast()
  const [open, setOpen]     = useState(false)
  const [busy, setBusy]     = useState(false)
  const [done, setDone]     = useState(false)

  // Detect cold-start: empty deals AND empty funds AND empty people. If all
  // three are 0, the firm hasn't been used — show the welcome. If any has
  // data, the user has been working and we stay out of their way.
  useEffect(() => {
    if (!isSupabaseConfigured)   return
    if (dismissed())             return
    // Never auto-open in pitch mode — partners shouldn't see "Try a
    // sample firm" mid-walkthrough. They can still reach sample data
    // from Settings on the production deploy.
    if (PITCH_MODE)              return
    let cancelled = false
    ;(async () => {
      try {
        const [d, f, p] = await Promise.all([
          supabase.from('deals').select('id', { count: 'exact', head: true }),
          supabase.from('funds').select('id', { count: 'exact', head: true }),
          supabase.from('people').select('id', { count: 'exact', head: true })
        ])
        const empty = (d.count ?? 0) === 0 && (f.count ?? 0) === 0 && (p.count ?? 0) === 0
        if (!cancelled && empty) setOpen(true)
      } catch {
        /* swallow — overlay just stays closed */
      }
    })()
    return () => { cancelled = true }
  }, [])

  async function onLoadSample() {
    if (busy) return
    setBusy(true)
    try {
      const result = await seedSampleFirm(supabase)
      markSeeded()
      setDone(true)
      toast.success(`Loaded sample firm — ${result.totalInserted} rows`)
      // Hand control back to the page after a short success beat so the
      // partner sees the confirmation before everything reloads.
      setTimeout(() => {
        dismiss()
        setOpen(false)
        window.location.reload()
      }, 900)
    } catch (err) {
      toast.error(err?.message || 'Sample load failed — try the SQL pack')
      setBusy(false)
    }
  }

  function onStartTour() {
    dismiss()
    setOpen(false)
    // Signal the Tour Center to open in Guided trial mode. The Topbar
    // listens for the same event so this works from anywhere.
    window.dispatchEvent(new CustomEvent('valence:start-tour', { detail: { mode: 'trial' } }))
  }

  function onSkip() {
    dismiss()
    setOpen(false)
  }

  if (!open) return null

  return (
    <ToBody>
      <div className="fixed inset-0 z-[80] flex items-center justify-center px-4" role="dialog" aria-modal="true" aria-label="Welcome">
        <div className="absolute inset-0 bg-valence-ink/55 backdrop-blur-sm animate-fade-in" />
        <div className="relative w-full max-w-[640px] animate-slide-up rounded-2xl border border-valence-border bg-valence-elevated shadow-valence-lg overflow-hidden">
          <button
            onClick={onSkip}
            className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded text-valence-subtle hover:text-valence-text hover:bg-valence-surface transition"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="px-7 pt-7 pb-2">
            <p className="vl-eyebrow-ink inline-flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-valence-blue" /> Welcome to ValenceOS
            </p>
            <h2 className="mt-2 font-display text-[22px] font-semibold tracking-tight text-valence-text leading-tight">
              The operating system for boutique investment banks
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-valence-muted">
              Mandate pipeline · persona-driven fund CRM · per-mandate knowledge base · AI screener · team calendar — built for IB workflows, not retrofitted from a generic CRM.
            </p>
          </div>

          {/* Stat chips that hint at depth without requiring a click */}
          <div className="px-7">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat icon={Briefcase} label="Live mandates" value="end-to-end" />
              <Stat icon={Users}     label="Persona CRM"   value="not a rolodex" />
              <Stat icon={Building2} label="Fund universe" value="warmth + match" />
            </div>
          </div>

          <div className="px-7 pt-5 pb-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-valence-subtle">Pick how you want to start</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-7 pb-7">
            <button
              onClick={onLoadSample}
              disabled={busy}
              className="group relative rounded-xl border border-valence-blue/30 bg-valence-blue-soft/60 p-4 text-left transition hover:bg-valence-blue-soft hover:border-valence-blue/50 disabled:opacity-60 disabled:cursor-wait"
            >
              <span className="absolute -top-2 right-3 inline-flex items-center rounded-full bg-valence-ink px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white">
                Recommended
              </span>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-valence-blue/30 bg-valence-elevated text-valence-blue">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : done ? <Check className="h-4 w-4 text-valence-success" /> : <Database className="h-4 w-4" />}
              </span>
              <p className="mt-3 font-display font-semibold tracking-tight text-valence-text">
                {done ? 'Loading…' : busy ? 'Seeding…' : 'Try a sample firm'}
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-valence-muted">
                12 funds, 14 personas, 6 live mandates, 7 interactions, 3 inbound submissions — already routed through the AI screener.
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-valence-blue">
                Load <ArrowRight className="h-3 w-3" />
              </span>
            </button>

            <button
              onClick={onStartTour}
              className="group rounded-xl border border-valence-border bg-valence-elevated p-4 text-left transition hover:border-valence-ink/30 hover:shadow-valence"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-300/40 bg-emerald-50 text-emerald-600">
                <Compass className="h-4 w-4" />
              </span>
              <p className="mt-3 font-display font-semibold tracking-tight text-valence-text">
                Guided trial
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-valence-muted">
                5-minute scripted walk across Today, Deals, Funds, People, Screener and Knowledge. Auto-navigates.
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                Start tour <ArrowRight className="h-3 w-3" />
              </span>
            </button>

            <button
              onClick={onSkip}
              className="group rounded-xl border border-valence-border bg-valence-elevated p-4 text-left transition hover:border-valence-ink/30 hover:shadow-valence"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-valence-border bg-valence-surface text-valence-muted">
                <Sparkles className="h-4 w-4" />
              </span>
              <p className="mt-3 font-display font-semibold tracking-tight text-valence-text">
                Start empty
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-valence-muted">
                Skip the sample data and add your own — first deal, first persona, first fund. You can always load samples later from the topbar.
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-valence-muted">
                Skip <ArrowRight className="h-3 w-3" />
              </span>
            </button>
          </div>

          <div className="border-t border-valence-border px-7 py-3 flex items-center justify-between text-[11px] text-valence-subtle">
            <span>Loading sample data inserts ~50 rows into your Supabase. Reset any time from the topbar.</span>
            <span>Built by Rishabh · <a className="text-valence-blue hover:underline" href="mailto:rishabh@valencegrowth.com">rishabh@valencegrowth.com</a></span>
          </div>
        </div>
      </div>
    </ToBody>
  )
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-valence-border bg-valence-surface px-3 py-2">
      <Icon className="h-3.5 w-3.5 text-valence-blue mx-auto" />
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-valence-subtle">{label}</p>
      <p className="mt-0.5 text-[11px] font-medium text-valence-text">{value}</p>
    </div>
  )
}
