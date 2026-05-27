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
import NotificationsPage from './pages/NotificationsPage.jsx'
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
import CompleteProfile from './pages/CompleteProfile.jsx'
import RelationshipTimeline from './pages/RelationshipTimeline.jsx'
import { useAuth } from './hooks/useAuth.js'
import { useSeat } from './hooks/useSeat.js'
import { isSupabaseConfigured } from './lib/supabase.js'
import { useWorkspaceSetting } from './hooks/useWorkspaceSetting.js'
import { WORKSPACE_KEYS, effectiveBrowserTitle, resolveTheme } from './lib/workspace.js'
import { startAiMeter } from './lib/aiMeter.js'

export default function App() {
  const { pathname } = useLocation()
  const { session, loading, authUnavailable } = useAuth()
  const { seat, org, hasSeat, loading: seatLoading } = useSeat()
  const profileComplete = Boolean(seat?.profile_completed_at)
  const firmName = useWorkspaceSetting(WORKSPACE_KEYS.firmName)
  const browserTitleOverride = useWorkspaceSetting(WORKSPACE_KEYS.browserTitle)
  const density = useWorkspaceSetting(WORKSPACE_KEYS.density)
  const theme = useWorkspaceSetting(WORKSPACE_KEYS.theme)

  // Apply firm-customizable chrome: browser title + density data attribute.
  // Effect runs on every read so live edits in /settings reflect immediately.
  // Title resolution order:
  //   1. Explicit /settings → Workspace → Browser tab title override (if set)
  //   2. The tenant's actual org.name (so "Pinnacle Advisory" not "ValenceOS")
  //   3. effectiveBrowserTitle() fallback — used for signed-out / unseated states
  useEffect(() => {
    if (typeof document === 'undefined') return
    const override = browserTitleOverride && String(browserTitleOverride).trim()
    if (override) {
      document.title = override
    } else if (org?.name) {
      document.title = org.name
    } else {
      document.title = effectiveBrowserTitle()
    }
  }, [firmName, browserTitleOverride, org?.name])

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
  //   2. No session → Login (regardless of authUnavailable — dumping an
  //      unauthed user into the main app with broken Supabase queries
  //      looked like "sign-in screen twice" to the user).
  //   3. Session but no seat → render Welcome / Onboarding / JoinTeam.
  //   4. Session + seat → normal app.
  // authUnavailable is now ONLY used to skip the seat-loading splash for
  // a signed-in user when Supabase is unreachable — we don't want them
  // stuck on the splash if the network drops mid-session. It's no longer
  // a license to fall through to the main app for unauthed users.
  if (isSupabaseConfigured) {
    if (loading) return <BootSplash />
    if (!session) return <Login />

    if (!authUnavailable) {

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

    // Have a seat but profile_completed_at is null — auto-claim path
    // landed them with a name (from Google) but no title/phone. Show
    // the one-shot completion screen, then never again. Once the user
    // saves or skips, the RPC stamps profile_completed_at = now() and
    // the gate falls through to the main app.
    if (hasSeat && !profileComplete) {
      if (pathname !== '/complete-profile') {
        return <Navigate to="/complete-profile" replace />
      }
      return (
        <Routes>
          <Route path="/complete-profile" element={<CompleteProfile />} />
        </Routes>
      )
    }
    } // end if (!authUnavailable)
  } // end if (isSupabaseConfigured)

  // Session + seat + completed profile — seated users can browse the
  // onboarding cluster freely. /welcome is always allowed (it renders
  // a "Welcome back · Continue to your firm" hero for seated users).
  // /onboarding and /join still let admins preview the screens — those
  // forms refuse server-side with the "user already belongs to a team"
  // blocking card so nothing duplicates.
  //
  // History: this used to redirect seated users straight from /welcome
  // → /, which made the onboarding flow invisible to anyone testing
  // with their own seat. The ?preview=1 escape hatch worked but was
  // hidden — partners kept hitting / and asking "where is Welcome?".
  // Letting Welcome render unconditionally fixes the visibility
  // problem and the page itself does the right thing per seat state.
  const onboardingRoutes = ['/welcome', '/onboarding', '/join', '/complete-profile']
  if (session && hasSeat && profileComplete && onboardingRoutes.includes(pathname)) {
    // First time the user hits /welcome this browser session, remember it
    // so we don't redirect them back here every navigation in the auth
    // gate below. Set on render rather than effect so the latch is in
    // place by the time the next pathname change re-runs the gate.
    try { sessionStorage.setItem('valence.welcome.shown', '1') } catch {}
    return (
      <Routes>
        <Route path="/welcome"          element={<Welcome />} />
        <Route path="/onboarding"       element={<Onboarding />} />
        <Route path="/join"             element={<JoinTeam />} />
        <Route path="/complete-profile" element={<CompleteProfile />} />
      </Routes>
    )
  }

  // FIRST-LOAD WELCOME LANDING
  // If a seated user lands at "/" without having visited /welcome yet
  // this browser session, redirect them to /welcome once. Once they've
  // clicked "Continue to your firm" → /, the sessionStorage flag is set
  // (above) and this redirect is a no-op for the rest of the session.
  //
  // Why this matters: the OAuth-callback redirect to /welcome only fires
  // on a fresh sign-in. Users with a persistent Supabase session from
  // before this code landed would keep going straight to / and miss the
  // Welcome screen entirely. This adds a session-scoped second chance.
  if (session && hasSeat && profileComplete && pathname === '/') {
    let welcomeShown = false
    try { welcomeShown = sessionStorage.getItem('valence.welcome.shown') === '1' } catch {}
    if (!welcomeShown) {
      return <Navigate to="/welcome" replace />
    }
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
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/import" element={<Import />} />
        <Route path="/timeline/:valenceId/:externalId" element={<RelationshipTimeline />} />
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
