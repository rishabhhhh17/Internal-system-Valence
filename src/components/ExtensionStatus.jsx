// ExtensionStatus — dashboard card that detects the ValenceOS Capture
// Chrome extension and either shows install instructions or confirms it's
// connected.
//
// Detection: bridge.js (v0.1.1+) sets data-valenceos-capture="<version>"
// on <html> when it loads on valenceos.vercel.app, and also dispatches a
// 'valenceos-capture:ready' CustomEvent on window. We check the attribute
// on mount, then listen for the event in case the extension loads after
// the React tree (race condition during the first ~100ms after a fresh
// install).
//
// Mounted on DailyNote next to StaleRelationships. Stays out of the way
// once installed — small "Connected" pill so it's clear the firm's
// captures are flowing, without nagging.

import { useEffect, useState } from 'react'
import { Chrome, Check, Download, ArrowUpRight, X } from 'lucide-react'

const DISMISS_KEY = 'valenceos:extension-install-card-dismissed'
const EXTENSION_REPO_URL = 'https://github.com/rishabhhhh17/valenceos/tree/main/chrome-extension/valenceos-capture'

function detectExtensionVersion() {
  if (typeof document === 'undefined') return null
  return document.documentElement.getAttribute('data-valenceos-capture') || null
}

export default function ExtensionStatus() {
  const [version, setVersion] = useState(() => detectExtensionVersion())
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage?.getItem(DISMISS_KEY) === '1'
  })

  useEffect(() => {
    // Race-window catch: re-check on mount in case bridge.js hadn't run yet,
    // then listen for the ready event.
    const recheck = () => {
      const v = detectExtensionVersion()
      if (v) setVersion(v)
    }
    recheck()

    function onReady(e) {
      setVersion(e?.detail?.version || detectExtensionVersion() || 'unknown')
    }
    window.addEventListener('valenceos-capture:ready', onReady)

    // Also re-check after a short delay — content scripts sometimes inject
    // after document_idle on slow connections.
    const t = setTimeout(recheck, 600)

    return () => {
      window.removeEventListener('valenceos-capture:ready', onReady)
      clearTimeout(t)
    }
  }, [])

  function dismiss() {
    setDismissed(true)
    try { window.localStorage?.setItem(DISMISS_KEY, '1') } catch { /* private mode */ }
  }

  // Installed → small confirmation pill, dismissable later.
  if (version) {
    return (
      <section className="vl-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="vl-eyebrow-ink inline-flex items-center gap-1.5">
              <Chrome className="h-3 w-3" /> Capture extension
            </p>
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
              <Check className="h-3.5 w-3.5" />
              Connected
              <span className="text-[10px] font-normal text-valence-muted">v{version}</span>
            </p>
            <p className="mt-1 text-[11px] text-valence-muted">
              Save a Gmail thread or Calendar event by clicking the chip on the page.
              Captures flow into your People + Interactions automatically.
            </p>
          </div>
        </div>
      </section>
    )
  }

  // Dismissed (user explicitly closed the install card) → render nothing.
  // They can still install later, the chip just doesn't nag them on every load.
  if (dismissed) return null

  // Not installed → install card.
  return (
    <section className="vl-card p-5 relative">
      <button
        onClick={dismiss}
        title="Dismiss"
        className="absolute right-3 top-3 text-valence-subtle hover:text-valence-muted"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-valence-blue-soft p-2 text-valence-blue shrink-0">
          <Chrome className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="vl-eyebrow-ink">Auto-capture from Gmail + Calendar</p>
          <p className="mt-1 text-sm text-valence-text">
            Install the <span className="font-semibold">ValenceOS Capture</span> Chrome
            extension to save email threads and meetings with one click — no manual
            entry, every interaction feeds the relationship layer overnight.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href={EXTENSION_REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="vl-btn-primary inline-flex items-center gap-1.5"
            >
              <Download className="h-3.5 w-3.5" /> Get install instructions
              <ArrowUpRight className="h-3 w-3" />
            </a>
            <span className="text-[11px] text-valence-muted">
              5-minute setup. Reads only the pages you're actively on.
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
