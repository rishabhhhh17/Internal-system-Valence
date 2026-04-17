import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Overview from './pages/Overview.jsx'
import Deals from './pages/Deals.jsx'
import Knowledge from './pages/Knowledge.jsx'
import Planner from './pages/Planner.jsx'
import Drive from './pages/Drive.jsx'
import Team from './pages/Team.jsx'

export default function App() {
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
