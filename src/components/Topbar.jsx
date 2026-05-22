import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Search, Bell, PanelLeftClose, PanelLeftOpen, RotateCcw } from 'lucide-react'
import Logo from './Logo.jsx'
import GoogleButton from './GoogleButton.jsx'
import CurrencyToggle from './CurrencyToggle.jsx'
import NotificationCenter, { useNotifications } from './NotificationCenter.jsx'
import Tutorial from './Tutorial.jsx'
import { useWorkspaceSetting } from '../hooks/useWorkspaceSetting.js'
import { WORKSPACE_KEYS, setWorkspaceSetting } from '../lib/workspace.js'
import { signOut } from '../lib/google.js'

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
  '/team':              { title: 'Team',            sub: 'Coverage across sectors and geographies.' },
  '/admin/billing':     { title: 'Consumption · admin', sub: 'What every customer is burning.' }
}


export default function Topbar() {
  const { pathname } = useLocation()
  const meta = titles[pathname] || { title: 'ValenceOS', sub: '' }

  const [notifOpen, setNotifOpen] = useState(false)
  const notifs = useNotifications({ live: true })
  const sidebarCollapsed = useWorkspaceSetting(WORKSPACE_KEYS.sidebarCollapsed) === 'true'

  function openPalette() {
    const ev = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })
    window.dispatchEvent(ev)
  }

  function toggleSidebar() {
    setWorkspaceSetting(WORKSPACE_KEYS.sidebarCollapsed, sidebarCollapsed ? '' : 'true')
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 sm:h-16 items-center gap-2 sm:gap-3 lg:gap-4 border-b border-valence-border vl-glass-bar px-3 sm:px-5 lg:px-8">
        <button
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
          title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
          className="hidden lg:inline-flex vl-icon-btn shrink-0"
        >
          {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
        <div className="flex items-center gap-3 lg:hidden">
          <Logo compact />
        </div>
        {sidebarCollapsed && (
          <div className="hidden lg:flex items-center gap-2 shrink-0">
            <Logo compact />
          </div>
        )}

        <div className="min-w-0 flex-1 flex items-center gap-2">
          <h1 className="truncate text-[15px] font-semibold tracking-tight text-valence-text">{meta.title}</h1>
          <BranchBadge />
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

        <button
          onClick={() => setNotifOpen(true)}
          className="relative vl-icon-btn"
          aria-label={notifs.unread > 0 ? `${notifs.unread} unread notifications` : 'Notifications'}
          title="Notifications"
        >
          <Bell className="h-4 w-4" />
          {notifs.unread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-valence-blue text-white text-[10px] font-bold ring-2 ring-white shadow-[0_0_8px_rgba(51,153,255,0.4)]">
              {notifs.unread > 9 ? '9+' : notifs.unread}
            </span>
          )}
        </button>

        {/* Topbar order: sidebar toggle, page title, search, bell, Tour,
            currency cycle, Google avatar. The Tour pill auto-glows on a
            new user's first visit and quietens once engaged — it's the
            cheapest way to get a new team member productive. */}
        <Tutorial />
        <DemoResetButton />
        <div className="hidden lg:block"><CurrencyToggle /></div>
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

// Visible branch indicator — renders only on non-main deploys so the
// developer can confirm at a glance which Vercel preview is live in
// the tab. Production (`main`) and local dev (no branch env) stay
// invisible; preview branches show a small coloured pill next to the
// page title. Removes the "am I on production or on rishabh-testing?"
// guessing problem when the URL is hidden under a long subdomain.
// "Reset demo" — only renders on demo deploys (VITE_DEMO_MODE='true').
// One click: signs the current user out + clears every valence.* key
// in this origin's localStorage, then reloads. The next render shows
// Login fresh, the way a prospect opening the URL for the first time
// would see it.
//
// SCOPE: localStorage is per-origin in browsers. Clicking this on the
// demo deploy only touches the demo's storage — production and
// rishabh-testing sessions on other Vercel subdomains are untouched.
// Safe to click as a pre-send "QA the fresh-visitor flow" check.
function DemoResetButton() {
  const isDemo = import.meta.env.VITE_DEMO_MODE === 'true'
  const [busy, setBusy] = useState(false)
  if (!isDemo) return null

  async function reset() {
    if (busy) return
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(
        'Reset the demo to a fresh-visitor view? This will sign you out and clear the demo session in this browser. Your sessions on valenceos.vercel.app and the testing URL are not affected.'
      )
      if (!confirmed) return
    }
    setBusy(true)
    try {
      await signOut() // clears Supabase session + all valence.* localStorage
      // signOut already strips localStorage in this origin only; reload
      // so the next render starts from Login with no in-memory state.
      window.location.replace('/')
    } catch {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={reset}
      disabled={busy}
      title="Sign out + clear this browser's demo session — what a fresh prospect would see"
      aria-label="Reset demo session"
      className="hidden md:inline-flex shrink-0 items-center gap-1.5 rounded-full border border-valence-warning/50 bg-valence-warning/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-valence-warning hover:bg-valence-warning/20 transition disabled:opacity-60"
    >
      <RotateCcw className="h-3 w-3" />
      {busy ? 'Resetting…' : 'Reset demo'}
    </button>
  )
}

function BranchBadge() {
  const branch = import.meta.env.VITE_BRANCH
  if (!branch || branch === 'main') return null
  const isTesting = branch === 'rishabh-testing'
  return (
    <span
      title={`Deployed from branch: ${branch}`}
      className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] ${
        isTesting
          ? 'border-valence-warning/50 bg-valence-warning/15 text-valence-warning'
          : 'border-valence-border bg-valence-elevated text-valence-muted'
      }`}
    >
      {isTesting ? '⚠ Testing' : branch}
    </span>
  )
}
