import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Sun, CalendarDays, CalendarRange } from 'lucide-react'
import DailyNote from './DailyNote.jsx'
import Planner from './Planner.jsx'
import Calendar from './Calendar.jsx'

// Workspace — the single day-management tab. Folds the old Today, Day Planner
// and Team Calendar into one surface with a segmented switcher, so the sidebar
// carries one "Workspace" entry instead of three. Each segment renders the
// existing page unchanged (no functionality lost); the initial segment is
// chosen from the path so legacy deep links (/planner, /calendar) still land
// in the right place.
const SEGMENTS = [
  { id: 'briefing', label: 'Briefing',      icon: Sun },
  { id: 'planner',  label: 'Planner',       icon: CalendarDays },
  { id: 'calendar', label: 'Team calendar', icon: CalendarRange }
]

export default function Workspace() {
  const { pathname } = useLocation()
  const initial = pathname.startsWith('/planner') ? 'planner'
    : pathname.startsWith('/calendar') ? 'calendar'
    : 'briefing'
  const [seg, setSeg] = useState(initial)

  return (
    <div className="space-y-5">
      <div className="inline-flex items-center rounded-lg border border-valence-border bg-valence-elevated p-0.5" role="group" aria-label="Workspace view">
        {SEGMENTS.map(s => (
          <button
            key={s.id}
            onClick={() => setSeg(s.id)}
            aria-pressed={seg === s.id}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              seg === s.id ? 'bg-valence-ink text-white shadow-sm' : 'text-valence-muted hover:text-valence-text'
            }`}
          >
            <s.icon className="h-3.5 w-3.5" /> {s.label}
          </button>
        ))}
      </div>

      {seg === 'briefing' && <DailyNote />}
      {seg === 'planner'  && <Planner />}
      {seg === 'calendar' && <Calendar />}
    </div>
  )
}
