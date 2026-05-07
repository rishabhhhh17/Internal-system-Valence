import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
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
import KnowledgeMandates from './pages/KnowledgeMandates.jsx'
import Planner from './pages/Planner.jsx'
import Drive from './pages/Drive.jsx'
import Team from './pages/Team.jsx'
import Analytics from './pages/Analytics.jsx'
import Share from './pages/Share.jsx'
import Login from './pages/Login.jsx'
import { useAuth } from './hooks/useAuth.js'
import { isSupabaseConfigured } from './lib/supabase.js'

export default function App() {
  const { pathname } = useLocation()
  const { session, loading, authUnavailable } = useAuth()

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

  // Demo mode: auth gate is OFF for now. The workspace renders without a
  // session — pages fall back to demo data when Supabase RLS blocks anon
  // reads. To re-enable Google sign-in, restore the gate below and wire
  // OAuth in Supabase + Google Cloud Console.
  if (false && isSupabaseConfigured && !authUnavailable) {
    if (loading) return <BootSplash />
    if (!session) return <Login />
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
        <Route path="/knowledge/mandates" element={<KnowledgeMandates />} />
        <Route path="/knowledge/shared" element={<Knowledge />} />
        <Route path="/knowledge/private" element={<Drive />} />
        <Route path="/drive" element={<Navigate to="/knowledge/private" replace />} />
        <Route path="/planner" element={<Planner />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/team" element={<Team />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

function BootSplash() {
  return (
    <div className="min-h-screen grid place-items-center bg-white">
      <div className="flex items-center gap-3 text-sm text-valence-muted">
        <span className="h-2 w-2 animate-pulse rounded-full bg-valence-blue" />
        Loading ValenceOS…
      </div>
    </div>
  )
}
