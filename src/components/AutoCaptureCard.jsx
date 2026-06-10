import { useCallback, useEffect, useRef, useState } from 'react'
import { Sparkles, RefreshCw, Loader2, Calendar, Mail } from 'lucide-react'
import { captureFromGoogle, countRecentCaptures } from '../lib/autoCapture.js'
import { isSupabaseConfigured } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.js'
import { GoogleAuthExpired, signInWithGoogle } from '../lib/google.js'
import { humanError } from '../lib/userError.js'
import { useToast } from './Toast.jsx'

// Surfaces auto-capture: how many interactions were logged from Gmail +
// Calendar lately, with a "Sync now" button. Also runs a quiet auto-sync on
// mount (throttled to every 6h via localStorage) so it feels passive — the
// closest a client-only app gets to Affinity's always-on capture without a
// server daemon.
const LAST_RUN_KEY = 'valence.autocapture.lastRun'
const THROTTLE_MS = 6 * 60 * 60 * 1000

export default function AutoCaptureCard({ onCaptured }) {
  const toast = useToast()
  const { googleConnected, profile } = useAuth()
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [counts, setCounts] = useState({ total: 0, calendar: 0, gmail: 0 })
  const ranAuto = useRef(false)

  const refreshCounts = useCallback(async () => {
    try { setCounts(await countRecentCaptures({ days: 7 })) } catch { /* non-fatal */ }
  }, [])

  const run = useCallback(async ({ silent = false } = {}) => {
    if (busy) return
    setBusy(true); setProgress('')
    try {
      const r = await captureFromGoogle({
        selfEmail: profile?.email || '',
        onProgress: ({ label }) => setProgress(label || '')
      })
      if (r.reason && !silent) toast.info(r.reason)
      else if (r.added > 0) {
        toast.success(`${r.added} interaction${r.added === 1 ? '' : 's'} captured (${r.calendar.added} calendar · ${r.gmail.added} email).`)
        onCaptured?.()
      } else if (!silent) {
        toast.info('No new interactions found in your inbox or calendar.')
      }
      try { localStorage.setItem(LAST_RUN_KEY, String(Date.now())) } catch { /* private mode */ }
      refreshCounts()
    } catch (err) {
      if (err instanceof GoogleAuthExpired) {
        if (!silent) { toast.error('Google session expired — reconnecting…'); signInWithGoogle().catch(() => {}) }
      } else if (!silent) {
        toast.error(humanError(err, 'Auto-capture failed — try again.'))
      }
    } finally {
      setBusy(false); setProgress('')
    }
  }, [busy, profile, toast, onCaptured, refreshCounts])

  useEffect(() => { refreshCounts() }, [refreshCounts])

  // Quiet auto-sync on mount, throttled, only when Google is connected.
  useEffect(() => {
    if (!isSupabaseConfigured || !googleConnected || ranAuto.current) return
    let last = 0
    try { last = Number(localStorage.getItem(LAST_RUN_KEY)) || 0 } catch { /* ignore */ }
    if (Date.now() - last < THROTTLE_MS) return
    ranAuto.current = true
    run({ silent: true })
  }, [googleConnected, run])

  if (!isSupabaseConfigured) return null

  return (
    <div className="vl-card flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="flex items-start gap-3 min-w-0">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-valence-blue-soft text-valence-blue ring-1 ring-valence-blue/20">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-valence-text">Auto-captured from Gmail &amp; Calendar</p>
          {googleConnected ? (
            <p className="mt-0.5 text-[11px] text-valence-muted">
              {counts.total > 0
                ? <><span className="font-semibold text-valence-text tabular-nums">{counts.total}</span> interaction{counts.total === 1 ? '' : 's'} logged this week — no typing.
                    <span className="inline-flex items-center gap-1 ml-1.5"><Calendar className="h-3 w-3" /> {counts.calendar}</span>
                    <span className="inline-flex items-center gap-1 ml-1.5"><Mail className="h-3 w-3" /> {counts.gmail}</span></>
                : 'Meetings and emails log themselves to the right contact.'}
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] text-valence-muted">Connect Google (top right) to auto-log meetings &amp; emails.</p>
          )}
        </div>
      </div>
      <button
        onClick={() => run()}
        disabled={busy || !googleConnected}
        className="vl-btn-secondary shrink-0 disabled:opacity-50"
        title={googleConnected ? 'Scan Gmail + Calendar now' : 'Connect Google first'}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {busy ? (progress || 'Syncing…') : 'Sync now'}
      </button>
    </div>
  )
}
