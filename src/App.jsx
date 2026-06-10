import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import Layout from './components/Layout.jsx'

// Two routes stay eager — the partner lands on Today, and Login is what an
// unauthed visitor sees first. Everything else lazy-loads so the initial
// bundle drops from ~1.5 MB to the rough size of Today + Layout. Each
// chunk is named via the /* @vite-ignore */-free dynamic-import path so
// Rollup gives the partner-readable filenames in the dist.
import Home from './pages/Home.jsx'
import Login from './pages/Login.jsx'

const Deals               = lazy(() => import('./pages/Deals.jsx'))
const Mandates            = lazy(() => import('./pages/Mandates.jsx'))
const Timeline            = lazy(() => import('./pages/Timeline.jsx'))
const Funds               = lazy(() => import('./pages/Funds.jsx'))
const People              = lazy(() => import('./pages/People.jsx'))
const Screener            = lazy(() => import('./pages/Screener.jsx'))
const Intake              = lazy(() => import('./pages/Intake.jsx'))
const IntakeThanks        = lazy(() => import('./pages/IntakeThanks.jsx'))
const InboxIntake         = lazy(() => import('./pages/InboxIntake.jsx'))
const Interactions        = lazy(() => import('./pages/Interactions.jsx'))
const Knowledge           = lazy(() => import('./pages/Knowledge.jsx'))
const KnowledgeLanding    = lazy(() => import('./pages/KnowledgeLanding.jsx'))
const Workspace           = lazy(() => import('./pages/Workspace.jsx'))
const Drive               = lazy(() => import('./pages/Drive.jsx'))
const Team                = lazy(() => import('./pages/Team.jsx'))
const Analytics           = lazy(() => import('./pages/Analytics.jsx'))
const Feed                = lazy(() => import('./pages/Feed.jsx'))
const NotificationsPage   = lazy(() => import('./pages/NotificationsPage.jsx'))
const AgingReport         = lazy(() => import('./pages/AgingReport.jsx'))
const Share               = lazy(() => import('./pages/Share.jsx'))
const FitPreview          = lazy(() => import('./pages/FitPreview.jsx'))
const Settings            = lazy(() => import('./pages/Settings.jsx'))
const AdminBilling        = lazy(() => import('./pages/AdminBilling.jsx'))
const Terms               = lazy(() => import('./pages/Terms.jsx'))
const Privacy             = lazy(() => import('./pages/Privacy.jsx'))
const Onboarding          = lazy(() => import('./pages/Onboarding.jsx'))
const Welcome             = lazy(() => import('./pages/Welcome.jsx'))
const JoinTeam            = lazy(() => import('./pages/JoinTeam.jsx'))
const Import              = lazy(() => import('./pages/Import.jsx'))
const CompleteProfile     = lazy(() => import('./pages/CompleteProfile.jsx'))
const RelationshipTimeline = lazy(() => import('./pages/RelationshipTimeline.jsx'))
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
      <Suspense fallback={<BootSplash />}>
      <Routes>
        <Route path="/share/:code" element={<Share />} />
      </Routes>
      </Suspense>
    )
  }

  // Public intake routes render without chrome and without auth, like /share
  if (pathname === '/intake' || pathname === '/intake/thanks') {
    return (
      <Suspense fallback={<BootSplash />}>
      <Routes>
        <Route path="/intake" element={<Intake />} />
        <Route path="/intake/thanks" element={<IntakeThanks />} />
      </Routes>
      </Suspense>
    )
  }

  // Legal pages — public, no auth, no chrome.
  if (pathname === '/terms' || pathname === '/privacy') {
    return (
      <Suspense fallback={<BootSplash />}>
      <Routes>
        <Route path="/terms"   element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
      </Routes>
      </Suspense>
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
      <Suspense fallback={<BootSplash />}>
      <Routes>
        <Route path="/welcome"          element={<Welcome />} />
        <Route path="/onboarding"       element={<Onboarding />} />
        <Route path="/join"             element={<JoinTeam />} />
        <Route path="/complete-profile" element={<CompleteProfile />} />
      </Routes>
      </Suspense>
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
      <Suspense fallback={<BootSplash />}>
      <Routes>
        <Route path="/" element={<Home />} />
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
        {/* Workspace folds the old Today / Day Planner / Team Calendar into
            one tab. Legacy paths still resolve into the matching segment. */}
        <Route path="/workspace" element={<Workspace />} />
        <Route path="/today" element={<Workspace />} />
        <Route path="/planner" element={<Workspace />} />
        <Route path="/calendar" element={<Workspace />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/feed" element={<Feed />} />
        <Route path="/team" element={<Team />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/reports/aging" element={<AgingReport />} />
        <Route path="/import" element={<Import />} />
        <Route path="/timeline/:valenceId/:externalId" element={<RelationshipTimeline />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/admin/billing" element={<AdminBilling />} />
        <Route path="/_fit-preview" element={<FitPreview />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
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
