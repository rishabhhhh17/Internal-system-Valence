import { useEffect, useState } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { Search, Bell, Activity as ActivityIcon } from 'lucide-react'
import Logo from './Logo.jsx'
import GoogleButton from './GoogleButton.jsx'
import CurrencyToggle from './CurrencyToggle.jsx'
import NotificationCenter, { useNotifications } from './NotificationCenter.jsx'
import TutorialButton from './Tutorial.jsx'
import { PITCH_MODE } from '../lib/featureFlags.js'

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
  '/feed':              { title: 'Firm pulse',      sub: 'Everything the team did, in order — interactions, mandates, inbound, daily notes.' },
  '/analytics':         { title: 'Analytics',       sub: 'Pipeline, conversion, fees, velocity — the firm in numbers.' },
  '/team':              { title: 'Team',            sub: 'Coverage across sectors and geographies.' }
}


export default function Topbar() {
  const { pathname } = useLocation()
  const meta = titles[pathname] || { title: 'ValenceOS', sub: '' }

  const [notifOpen, setNotifOpen] = useState(false)
  const notifs = useNotifications({ live: true })

  function openPalette() {
    const ev = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })
    window.dispatchEvent(ev)
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 sm:h-16 items-center gap-2 sm:gap-3 lg:gap-4 border-b border-valence-border vl-glass-bar px-3 sm:px-5 lg:px-8">
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
            data-tour="topbar-search"
            className="hidden md:flex items-center gap-2 rounded-lg border border-valence-border bg-valence-elevated px-3 py-1.5 text-sm text-valence-muted w-72 hover:border-valence-ink/30 transition text-left"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="flex-1 text-valence-subtle">Search deals, memos, people…</span>
            <span className="vl-kbd">⌘K</span>
          </button>
        </div>

        {/* Firm pulse — small icon-only entry into the firm-wide activity
            feed. Lives in the topbar (not the main sidebar) because it's
            a glance-at-it surface, not a route partners come back to
            daily. Same visual weight as the notification bell. */}
        <Link
          to="/feed"
          className={`relative grid h-9 w-9 place-items-center rounded-lg border transition ${
            pathname === '/feed'
              ? 'border-valence-blue/40 bg-valence-blue-soft text-valence-blue'
              : 'border-valence-border bg-valence-elevated text-valence-muted hover:text-valence-text hover:border-valence-ink/30'
          }`}
          aria-label="Firm pulse"
          title="Firm pulse — everything the team did"
        >
          <ActivityIcon className="h-4 w-4" />
        </Link>

        <button
          onClick={() => setNotifOpen(true)}
          className="relative grid h-9 w-9 place-items-center rounded-lg border border-valence-border bg-valence-elevated text-valence-muted hover:text-valence-text hover:border-valence-ink/30 transition"
          aria-label={notifs.unread > 0 ? `${notifs.unread} unread notifications` : 'Notifications'}
        >
          <Bell className="h-4 w-4" />
          {notifs.unread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-valence-blue text-white text-[10px] font-bold ring-2 ring-white shadow-[0_0_8px_rgba(51,153,255,0.4)]">
              {notifs.unread > 9 ? '9+' : notifs.unread}
            </span>
          )}
        </button>

        {/* Visibility tiers on the trailing chips so the topbar doesn't
            overflow on narrow viewports. Mobile (<sm) keeps only the
            pulse + bell + avatar — everything else lives one tap away
            in the command palette / settings.
            PITCH_MODE hides demo-ish chrome (Tour / Currency) entirely.
            Sample-data + Google scope detail moved to /settings in
            Phase 2.3 — keep the topbar lean. */}
        {!PITCH_MODE && <div className="hidden md:flex"><TutorialButton /></div>}
        {!PITCH_MODE && <div className="hidden lg:flex"><CurrencyToggle /></div>}
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
