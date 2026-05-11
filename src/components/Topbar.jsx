import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Search, Bell } from 'lucide-react'
import Logo from './Logo.jsx'
import GoogleButton from './GoogleButton.jsx'
import CurrencyToggle from './CurrencyToggle.jsx'
import NotificationCenter, { useNotifications } from './NotificationCenter.jsx'
import TutorialButton from './Tutorial.jsx'

// Title + subtitle per route. Keep titles in lockstep with the sidebar
// labels so the topbar / sidebar / page hero never disagree about what
// page the user is on. Anything missing here falls back to the generic
// "ValenceOS" — which the user will read as a bug, so add an entry for
// every route Layout actually renders.
const titles = {
  '/':                  { title: 'Today',           sub: 'Your morning briefing.' },
  '/deals':             { title: 'Deal Logger',     sub: 'Every live mandate, tracked with institutional rigour.' },
  '/mandates':          { title: 'Live Mandates',   sub: 'Active book — engaged through closing.' },
  '/timeline':          { title: 'Timeline',        sub: 'Every active mandate, laid out in time.' },
  '/interactions':      { title: 'Interactions',    sub: 'The pre-mandate funnel — every touchpoint logged.' },
  '/people':            { title: 'People',          sub: 'Persona-driven CRM. Who they are, what they care about.' },
  '/funds':             { title: 'Firm',            sub: 'Funds and family offices — who writes the cheques.' },
  '/screen':            { title: 'Quick Screener',  sub: 'AI fund-match and mandate-fit, one paste away.' },
  '/inbox/intake':      { title: 'Intake inbox',    sub: 'Inbound mandate submissions, AI-triaged.' },
  '/knowledge':         { title: 'Knowledge',       sub: 'Firm-shared or private — pick a track.' },
  '/knowledge/shared':  { title: 'Knowledge',       sub: 'Ask, search, memos, files, comps, and per-mandate notes — one surface.' },
  '/knowledge/private': { title: 'Private',         sub: 'Your personal Google Drive. Private to you.' },
  '/planner':           { title: 'Day Planner',     sub: 'Walk into your day prepared. Propose times in a tap.' },
  '/calendar':          { title: 'Team Calendar',   sub: 'Everyone\'s week, in one view. Find a free slot in seconds.' },
  '/analytics':         { title: 'Analytics',       sub: 'Pipeline, conversion, fees, velocity — the firm in numbers.' },
  '/team':              { title: 'Team',            sub: 'Coverage across sectors and geographies.' }
}

const KHINT_KEY = 'valence.ranKHint'

export default function Topbar() {
  const { pathname } = useLocation()
  const meta = titles[pathname] || { title: 'ValenceOS', sub: '' }

  const [notifOpen, setNotifOpen] = useState(false)
  const notifs = useNotifications({ live: true })

  // First-run ⌘K hint — shows once, dismissible, persisted in localStorage.
  const [showHint, setShowHint] = useState(false)
  useEffect(() => {
    try {
      if (!localStorage.getItem(KHINT_KEY)) {
        const t = setTimeout(() => setShowHint(true), 1200)
        return () => clearTimeout(t)
      }
    } catch {}
  }, [])
  function dismissHint() {
    setShowHint(false)
    try { localStorage.setItem(KHINT_KEY, new Date().toISOString()) } catch {}
  }

  function openPalette() {
    dismissHint()
    const ev = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })
    window.dispatchEvent(ev)
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-valence-border vl-glass-bar px-5 lg:px-8">
        <div className="flex items-center gap-3 lg:hidden">
          <Logo compact />
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-semibold tracking-tight text-valence-text">{meta.title}</h1>
          <p className="hidden truncate text-xs text-valence-muted sm:block">{meta.sub}</p>
        </div>

        <div className="relative">
          <button
            onClick={openPalette}
            className="hidden md:flex items-center gap-2 rounded-lg border border-valence-border bg-white px-3 py-1.5 text-sm text-valence-muted w-72 hover:border-valence-ink/30 transition text-left"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="flex-1 text-valence-subtle">Search deals, memos, people…</span>
            <span className="vl-kbd">⌘K</span>
          </button>
          {showHint && (
            <div className="absolute right-0 top-full mt-2 z-40 hidden md:block animate-fade-in">
              <div className="relative w-72 rounded-xl border border-valence-border-strong bg-valence-ink text-white shadow-valence-lg p-3">
                <span className="absolute -top-1.5 right-10 h-3 w-3 rotate-45 bg-valence-ink border-l border-t border-valence-border-strong" aria-hidden />
                <p className="text-[11px] font-semibold text-valence-blue">Tip</p>
                <p className="mt-1 text-xs leading-relaxed">
                  Press <span className="vl-kbd bg-white/10 text-white">⌘K</span> anywhere to jump to any deal, memo or meeting.
                </p>
                <button onClick={dismissHint} className="mt-2 text-[11px] font-semibold text-valence-blue hover:text-white transition">
                  Got it →
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => setNotifOpen(true)}
          className="relative grid h-9 w-9 place-items-center rounded-lg border border-valence-border bg-white text-valence-muted hover:text-valence-text hover:border-valence-ink/30 transition"
          aria-label={notifs.unread > 0 ? `${notifs.unread} unread notifications` : 'Notifications'}
        >
          <Bell className="h-4 w-4" />
          {notifs.unread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-valence-blue text-white text-[10px] font-bold ring-2 ring-white shadow-[0_0_8px_rgba(51,153,255,0.4)]">
              {notifs.unread > 9 ? '9+' : notifs.unread}
            </span>
          )}
        </button>

        <TutorialButton />
        <CurrencyToggle />
        <GoogleButton />
      </header>

      <NotificationCenter
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        {...notifs}
      />
    </>
  )
}
