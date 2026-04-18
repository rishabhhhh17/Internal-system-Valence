import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Overview from './pages/Overview.jsx'
import Deals from './pages/Deals.jsx'
import Knowledge from './pages/Knowledge.jsx'
import Planner from './pages/Planner.jsx'
import Drive from './pages/Drive.jsx'
import Team from './pages/Team.jsx'
import Share from './pages/Share.jsx'

export default function App() {
  const { pathname } = useLocation()
  // Public share pages render without the sidebar/topbar chrome
  if (pathname.startsWith('/share/')) {
    return (
      <Routes>
        <Route path="/share/:code" element={<Share />} />
      </Routes>
    )
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
