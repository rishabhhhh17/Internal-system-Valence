import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import DailyNote from './pages/DailyNote.jsx'
import Deals from './pages/Deals.jsx'
import Mandates from './pages/Mandates.jsx'
import Timeline from './pages/Timeline.jsx'
import Funds from './pages/Funds.jsx'
import People from './pages/People.jsx'
import Screener from './pages/Screener.jsx'
import Intake from './pages/Intake.jsx'
import IntakeThanks from './pages/IntakeThanks.jsx'
import InboxIntake from './pages/InboxIntake.jsx'
import Interactions from './pages/Interactions.jsx'
import Knowledge from './pages/Knowledge.jsx'
import KnowledgeLanding from './pages/KnowledgeLanding.jsx'
import Planner from './pages/Planner.jsx'
import Calendar from './pages/Calendar.jsx'
import Drive from './pages/Drive.jsx'
import Team from './pages/Team.jsx'
import Analytics from './pages/Analytics.jsx'
import Feed from './pages/Feed.jsx'
import Share from './pages/Share.jsx'
import Login from './pages/Login.jsx'
import FitPreview from './pages/FitPreview.jsx'
import Settings from './pages/Settings.jsx'
import AdminBilling from './pages/AdminBilling.jsx'
import Terms from './pages/Terms.jsx'
import Privacy from './pages/Privacy.jsx'
import Onboarding from './pages/Onboarding.jsx'
import Welcome from './pages/Welcome.jsx'
import JoinTeam from './pages/JoinTeam.jsx'
import Import from './pages/Import.jsx'
import { useAuth } from './hooks/useAuth.js'
import { useSeat } from './hooks/useSeat.js'
import { isSupabaseConfigured } from './lib/supabase.js'
import { useWorkspaceSetting } from './hooks/useWorkspaceSetting.js'
import { WORKSPACE_KEYS, effectiveBrowserTitle, resolveTheme } from './lib/workspace.js'
import { startAiMeter } from './lib/aiMeter.js'

export default function App() {
  const { pathname } = useLocation()
  const { session, loading, authUnavailable } = useAuth()
  const { hasSeat, loading: seatLoading } = useSeat()
  const firmName = useWorkspaceSetting(WORKSPACE_KEYS.firmName)
  const browserTitleOverride = useWorkspaceSetting(WORKSPACE_KEYS.browserTitle)
  const density = useWorkspaceSetting(WORKSPACE_KEYS.density)
  const theme = useWorkspaceSetting(WORKSPACE_KEYS.theme)

  // Apply firm-customizable chrome: browser title + density data attribute.
  // Effect runs on every read so live edits in /settings reflect immediately.
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.title = effectiveBrowserTitle()
  }, [firmName, browserTitleOverride])

  // Start the AI meter once per app lifetime. It listens for Gemini
  // usage events and records billable ai_actions rows when there's an
  // active org/seat (set during onboarding). Safe no-op otherwise.
  useEffect(() => {
    const off = startAiMeter()
    return off
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.dataset.density = density || 'comfortable'
  }, [density])

  // Theme: write `.dark` on <html>. When pref is 'auto', resolve via OS
  // preference + listen for changes (user switching macOS dark mode etc.).
  useEffect(() => {
    if (typeof document === 'undefined') return
    const html = document.documentElement
    function apply() {
      const resolved = resolveTheme(theme)
      html.classList.toggle('dark', resolved === 'dark')
      html.dataset.theme = resolved
    }
    apply()
    if (theme !== 'auto') return
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => apply()
    if (mql.addEventListener) mql.addEventListener('change', handler)
    else if (mql.addListener) mql.addListener(handler)
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', handler)
      else if (mql.removeListener) mql.removeListener(handler)
    }
  }, [theme])

  // Public share pages render without chrome and without auth
  if (pathname.startsWith('/share/')) {
    return (
      <Routes>
        <Route path="/share/:code" element={<Share />} />
      </Routes>
    )
  }

  // Public intake routes render without chrome and without auth, like /share
  if (pathname === '/intake' || pathname === '/intake/thanks') {
    return (
      <Routes>
        <Route path="/intake" element={<Intake />} />
        <Route path="/intake/thanks" element={<IntakeThanks />} />
      </Routes>
    )
  }

  // Legal pages — public, no auth, no chrome.
  if (pathname === '/terms' || pathname === '/privacy') {
    return (
      <Routes>
        <Route path="/terms"   element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
      </Routes>
    )
  }

  // ============ AUTH + ONBOARDING GATE ============
  // The order of checks here matters:
  //   1. While auth is loading, show a splash (avoids flash of Login).
  //   2. If Supabase is unreachable (authUnavailable), fall through to the
  //      app — better to render demo state than to lock the user out of
  //      every page because of a transient network blip.
  //   3. No session → Login.
  //   4. Session but no seat → render Welcome / Onboarding / JoinTeam
  //      route group (chromeless). Any other URL bounces to /welcome.
  //   5. Session + seat → normal app.
  if (isSupabaseConfigured && !authUnavailable) {
    if (loading) return <BootSplash />
    if (!session) return <Login />

    // Have a session but no seat yet — gate every URL through the
    // onboarding route group. seatLoading shows a splash to avoid a
    // flash of "Welcome" right after a successful start_team RPC.
    if (!hasSeat) {
      if (seatLoading) return <BootSplash />
      const onboardingPaths = ['/welcome', '/onboarding', '/join']
      if (!onboardingPaths.includes(pathname)) {
        return <Navigate to="/welcome" replace />
      }
      return (
        <Routes>
          <Route path="/welcome"    element={<Welcome />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/join"       element={<JoinTeam />} />
        </Routes>
      )
    }
  }

  // Session + seat (or auth unavailable) — render the main app. If a
  // signed-in seated user lands on /welcome/onboarding/join, send them
  // home — they're past that step.
  if (session && hasSeat && ['/welcome', '/onboarding', '/join'].includes(pathname)) {
    return <Navigate to="/" replace />
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DailyNote />} />
        <Route path="/deals" element={<Deals />} />
        <Route path="/mandates" element={<Mandates />} />
        <Route path="/timeline" element={<Timeline />} />
        <Route path="/funds" element={<Funds />} />
        <Route path="/people" element={<People />} />
        <Route path="/screen" element={<Screener />} />
        <Route path="/inbox/intake" element={<InboxIntake />} />
        <Route path="/interactions" element={<Interactions />} />
        <Route path="/knowledge" element={<KnowledgeLanding />} />
        {/* Per-mandate folder tree was folded into the unified Knowledge surface.
            Keep the legacy URL working — and preserve any `?m=<mandateId>` deep link. */}
        <Route path="/knowledge/mandates" element={<MandatesRedirect />} />
        <Route path="/knowledge/shared" element={<Knowledge />} />
        <Route path="/knowledge/private" element={<Drive />} />
        <Route path="/drive" element={<Navigate to="/knowledge/private" replace />} />
        <Route path="/planner" element={<Planner />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/feed" element={<Feed />} />
        <Route path="/team" element={<Team />} />
        <Route path="/import" element={<Import />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/admin/billing" element={<AdminBilling />} />
        <Route path="/_fit-preview" element={<FitPreview />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

function MandatesRedirect() {
  const [params] = useSearchParams()
  const m = params.get('m')
  const target = m ? `/knowledge/shared?tab=mandates&m=${m}` : '/knowledge/shared?tab=mandates'
  return <Navigate to={target} replace />
}

function BootSplash() {
  return (
    <div className="min-h-screen grid place-items-center bg-valence-elevated">
      <div className="flex items-center gap-3 text-sm text-valence-muted">
        <span className="h-2 w-2 animate-pulse rounded-full bg-valence-blue" />
        Loading ValenceOS…
      </div>
    </div>
  )
}
