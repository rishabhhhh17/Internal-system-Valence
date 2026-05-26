// Settings → Advanced → Features.
//
// Lists every feature in the central registry (src/lib/features.js) with
// an on/off toggle and a "Recommended for your firm type" badge where
// applicable. Persists overrides to orgs.feature_flags via the
// set_feature_flag RPC.
//
// This panel is the user-facing surface of the per-firm-type defaults
// system: the org's firm_type sets the starting point, this UI lets the
// user override any of them.

import { useState, useEffect, useMemo } from 'react'
import { Sliders, Loader2, Check } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { useSeat } from '../hooks/useSeat.js'
import { useToast } from './Toast.jsx'
import { humanError } from '../lib/userError.js'
import {
  FEATURES, FIRM_TYPES, defaultFlagFor, isFeatureEnabled
} from '../lib/features.js'

export default function FeatureFlagsPanel() {
  const { org, refresh } = useSeat()
  const toast = useToast()
  // Local mirror of feature_flags so toggling feels instant. Synced
  // from `org` whenever the seat re-resolves.
  const [flags, setFlags] = useState(() => ({ ...(org?.feature_flags || {}) }))
  const [savingId, setSavingId] = useState(null)

  useEffect(() => {
    setFlags({ ...(org?.feature_flags || {}) })
  }, [org?.feature_flags])

  const firmType   = org?.firm_type || null
  const firmLabel  = useMemo(
    () => FIRM_TYPES.find(t => t.id === firmType)?.label || 'Unset',
    [firmType]
  )

  const grouped = useMemo(() => {
    const out = new Map()
    for (const f of FEATURES) {
      const key = f.category || 'Other'
      if (!out.has(key)) out.set(key, [])
      out.get(key).push(f)
    }
    return Array.from(out.entries())
  }, [])

  async function toggle(featureId, nextOn) {
    if (!isSupabaseConfigured) return
    // Optimistic update — flip locally first so the toggle feels instant.
    setFlags(prev => ({ ...prev, [featureId]: nextOn }))
    setSavingId(featureId)
    try {
      const { error } = await supabase.rpc('set_feature_flag', {
        p_feature_id: featureId,
        p_enabled:    nextOn
      })
      if (error) throw error
      await refresh()
    } catch (e) {
      // Roll back on failure
      setFlags(prev => {
        const copy = { ...prev }
        if (Object.prototype.hasOwnProperty.call(org?.feature_flags || {}, featureId)) {
          copy[featureId] = org.feature_flags[featureId]
        } else {
          delete copy[featureId]
        }
        return copy
      })
      toast.error(humanError(e, 'Could not save that toggle — try again.'))
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="vl-card p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-valence-blue-soft p-2 text-valence-blue">
          <Sliders className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-valence-text">Features</h3>
          <p className="text-xs text-valence-muted mt-0.5">
            Defaults are set for <span className="font-semibold text-valence-text">{firmLabel}</span>.
            Override anything below — the change applies immediately for everyone in your firm.
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {grouped.map(([category, list]) => (
          <section key={category} className="space-y-2">
            <p className="vl-eyebrow text-valence-subtle">{category}</p>
            <div className="space-y-2">
              {list.map(f => {
                const explicit = Object.prototype.hasOwnProperty.call(flags, f.id)
                  ? flags[f.id]
                  : undefined
                const effective = isFeatureEnabled(f.id, { firmType, flagsMap: flags })
                const recommended = defaultFlagFor(f.id, firmType)
                const overridden  = explicit !== undefined && explicit !== recommended
                const saving      = savingId === f.id

                return (
                  <div key={f.id}
                       className="flex items-start gap-3 rounded-lg border border-valence-border bg-valence-surface/50 px-3.5 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-valence-text">{f.label}</span>
                        {recommended && (
                          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] bg-valence-blue-soft text-valence-blue-deep rounded px-1.5 py-0.5">
                            Recommended
                          </span>
                        )}
                        {overridden && (
                          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] bg-valence-faint text-valence-muted rounded px-1.5 py-0.5">
                            Override
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-valence-muted leading-relaxed">{f.description}</p>
                      <p className="mt-0.5 text-[10px] text-valence-subtle">{f.surface}</p>
                    </div>

                    <Toggle
                      checked={effective}
                      busy={saving}
                      onChange={(nextOn) => toggle(f.id, nextOn)}
                    />
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      {!firmType && (
        <p className="text-[11px] text-valence-subtle italic">
          You haven't picked a firm type yet — every feature is on until you do.
        </p>
      )}
    </div>
  )
}

function Toggle({ checked, busy, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={busy}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition disabled:opacity-60 ${
        checked ? 'bg-valence-blue' : 'bg-valence-faint'
      }`}
    >
      {busy ? (
        <Loader2 className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" />
      ) : (
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition ${
            checked ? 'translate-x-4' : 'translate-x-1'
          }`}
        />
      )}
    </button>
  )
}
