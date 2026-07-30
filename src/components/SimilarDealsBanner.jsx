// =============================================================================
// SimilarDealsBanner — Phase 23 duplicate-detection UI
// =============================================================================
// Lives above the new-deal form. As the user types into Client name (and
// optionally Website), debounces a call to the find_similar_deals RPC
// and shows any matches inline. Distinct from <ConflictBanner /> which
// flags conflict-of-interest concerns — same shape, different signal.
//
// Each match row links to the existing deal so the user can "use existing
// instead" without re-typing. The banner is purely advisory — the user
// can still hit Save and create a duplicate if they really want to (no
// hard block).
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Loader2, ExternalLink } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'

const MIN_NAME_LENGTH = 3   // Below this, ilike/trigram returns too much noise
const DEBOUNCE_MS = 350

export default function SimilarDealsBanner({ clientName, website, onUseExisting }) {
  const [matches, setMatches]     = useState([])
  const [checking, setChecking]   = useState(false)
  const [checked, setChecked]     = useState(false)
  const timerRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    clearTimeout(timerRef.current)
    const name = (clientName || '').trim()
    const site = (website || '').trim()

    // Skip if name too short AND no website to match on. Either signal is
    // enough to fire — useful when the user pastes a website first.
    if (name.length < MIN_NAME_LENGTH && site.length < 4) {
      setMatches([])
      setChecking(false)
      setChecked(false)
      return
    }

    setChecking(true)
    timerRef.current = setTimeout(async () => {
      if (!isSupabaseConfigured) {
        setChecking(false); setChecked(true); setMatches([])
        return
      }
      try {
        const { data } = await supabase.rpc('find_similar_deals', {
          search_name:    name || '',
          search_website: site || null
        })
        setMatches(Array.isArray(data) ? data : [])
        setChecking(false)
        setChecked(true)
      } catch {
        // Don't block deal creation on dedup errors — degrade silently.
        setMatches([])
        setChecking(false)
        setChecked(true)
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timerRef.current)
  }, [clientName, website])

  // Until the user types enough or the first check completes, render
  // nothing. No "checking…" state when nothing's typed.
  if (!checked && !checking) return null

  if (checking && matches.length === 0) {
    return (
      <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-valence-border bg-valence-surface px-4 py-2.5 text-xs text-valence-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking for similar deals…
      </div>
    )
  }

  // No matches → silent. We don't show a green "all clear" here because
  // <ConflictBanner /> already does that and two stacked banners is noise.
  if (matches.length === 0) return null

  // Pick a tone: any match ≥90% score → warning red; otherwise yellow.
  const hasHighConfidence = matches.some(m => (m.similarity_score || 0) >= 0.9)
  const toneClasses = hasHighConfidence
    ? 'border-valence-warning/40 bg-valence-warning/10'
    : 'border-valence-blue/30 bg-valence-blue-soft/40'

  return (
    <div className={`mb-4 rounded-lg border px-4 py-3 ${toneClasses}`}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <AlertTriangle className={`h-4 w-4 ${hasHighConfidence ? 'text-valence-warning' : 'text-valence-blue'}`} />
        <span className={hasHighConfidence ? 'text-valence-warning' : 'text-valence-blue-deep'}>
          {matches.length} similar deal{matches.length === 1 ? '' : 's'} already in your system
        </span>
      </div>

      <ul className="mt-2.5 space-y-1.5">
        {matches.map(m => {
          const pct = Math.round((m.similarity_score || 0) * 100)
          return (
            <li key={m.id} className="flex items-center justify-between gap-3 rounded border border-valence-border/40 bg-valence-elevated/40 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-valence-text truncate">{m.client_name}</p>
                <p className="mt-0.5 text-[11px] text-valence-muted">
                  {[m.stage, m.sector, m.owner_name && `· Owner: ${m.owner_name}`].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="rounded-full bg-valence-surface px-2 py-0.5 text-[10px] font-semibold tabular-nums text-valence-text">
                  {pct}%
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onUseExisting?.()                    // close any parent dialog
                    navigate(`/deals?open=${m.id}`)
                  }}
                  className="inline-flex items-center gap-1 rounded border border-valence-border bg-valence-elevated px-2 py-0.5 text-[11px] font-semibold text-valence-blue hover:bg-valence-blue-soft transition"
                  title="Open the existing deal instead of creating a duplicate"
                >
                  Open <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      <p className="mt-2 text-[11px] text-valence-muted italic">
        Advisory — you can still save and create this deal. Click <strong>Open</strong> to use an existing one instead.
      </p>
    </div>
  )
}
