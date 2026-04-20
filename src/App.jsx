import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Overview from './pages/Overview.jsx'
import Deals from './pages/Deals.jsx'
import Knowledge from './pages/Knowledge.jsx'
import Planner from './pages/Planner.jsx'
import Drive from './pages/Drive.jsx'
import Team from './pages/Team.jsx'
import Share from './pages/Share.jsx'
import Login from './pages/Login.jsx'
import { useAuth } from './hooks/useAuth.js'
import { isSupabaseConfigured } from './lib/supabase.js'

export default function App() {
  const { pathname } = useLocation()
  const { session, loading } = useAuth()

  // Public share pages render without chrome and without auth
  if (pathname.startsWith('/share/')) {
    return (
      <Routes>
        <Route path="/share/:code" element={<Share />} />
      </Routes>
    )
  }

  // If Supabase isn't configured, fall through to the workspace so the
  // ConfigBanner can tell the user what to set. Otherwise require a session.
  if (isSupabaseConfigured) {
    if (loading) return <BootSplash />
    if (!session) return <Login />
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/deals" element={<Deals />} />
        <Route path="/knowledge" element={<Knowledge />} />
        <Route path="/planner" element={<Planner />} />
        <Route path="/drive" element={<Drive />} />
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
