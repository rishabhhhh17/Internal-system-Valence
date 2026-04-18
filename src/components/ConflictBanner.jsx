import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ShieldAlert, ShieldCheck, Loader2 } from 'lucide-react'
import { checkConflicts } from '../lib/conflicts.js'

// Inline banner shown above the new-deal form. Debounces on client_name change,
// re-runs the conflicts check, and surfaces any matches.
export default function ConflictBanner({ clientName, sector, side }) {
  const [state, setState] = useState({ hits: [], checking: false, checked: false })
  const timerRef = useRef(null)

  useEffect(() => {
    clearTimeout(timerRef.current)
    const name = (clientName || '').trim()
    if (name.length < 3) { setState({ hits: [], checking: false, checked: false }); return }
    setState(s => ({ ...s, checking: true }))
    timerRef.current = setTimeout(async () => {
      try {
        const { hits } = await checkConflicts({ clientName: name, sector, side })
        setState({ hits, checking: false, checked: true })
      } catch {
        setState({ hits: [], checking: false, checked: true })
      }
    }, 450)
    return () => clearTimeout(timerRef.current)
  }, [clientName, sector, side])

  if (!state.checked && !state.checking) return null

  if (state.checking) {
    return (
      <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-valence-border bg-valence-surface px-4 py-2.5 text-xs text-valence-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking for conflicts…
      </div>
    )
  }

  if (state.hits.length === 0) {
    return (
      <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-valence-success/30 bg-valence-success-soft px-4 py-2.5 text-xs text-valence-success">
        <ShieldCheck className="h-3.5 w-3.5" />
        No obvious conflicts detected.
      </div>
    )
  }

  const hasHigh = state.hits.some(h => h.severity === 'high')
  const tone = hasHigh ? 'danger' : 'warning'

  return (
    <div className={`mb-4 rounded-lg border px-4 py-3 ${
      tone === 'danger'
        ? 'border-valence-danger/30 bg-valence-danger-soft'
        : 'border-valence-warning/30 bg-valence-warning-soft'
    }`}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        {hasHigh
          ? <ShieldAlert className="h-4 w-4 text-valence-danger" />
          : <AlertTriangle className="h-4 w-4 text-valence-warning" />}
        <span className={hasHigh ? 'text-valence-danger' : 'text-valence-warning'}>
          {state.hits.length} potential conflict{state.hits.length === 1 ? '' : 's'} detected
        </span>
      </div>
      <ul className="mt-2 space-y-1.5 text-xs leading-relaxed">
        {state.hits.map((h, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className={`mt-1 inline-block h-1.5 w-1.5 rounded-full shrink-0 ${
              h.severity === 'high' ? 'bg-valence-danger' :
              h.severity === 'warn' ? 'bg-valence-warning' : 'bg-valence-muted'
            }`} />
            <div>
              <p className="font-semibold text-valence-text">{h.title}</p>
              <p className="text-valence-muted">{h.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-valence-muted italic">
        Review before taking the mandate. You can still proceed — this is advisory.
      </p>
    </div>
  )
}
