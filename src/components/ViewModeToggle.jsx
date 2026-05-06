import { Layers, LayoutDashboard } from 'lucide-react'
import { useViewMode } from '../hooks/useViewMode.jsx'

// Pill toggle that lives in a page header. Two modes:
//   simple   — calm overview, fewer fields, less density
//   detailed — every column, every chart, full IB density

export default function ViewModeToggle({ pageKey, simpleLabel = 'Simple', detailedLabel = 'Detailed' }) {
  const { mode, setMode } = useViewMode(pageKey)
  return (
    <div className="inline-flex items-center rounded-full border border-valence-border bg-white p-0.5" role="radiogroup" aria-label="View mode">
      <button
        type="button"
        onClick={() => setMode('simple')}
        aria-pressed={mode === 'simple'}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${mode === 'simple' ? 'bg-valence-ink text-white' : 'text-valence-muted hover:text-valence-text'}`}
      >
        <LayoutDashboard className="h-3 w-3" /> {simpleLabel}
      </button>
      <button
        type="button"
        onClick={() => setMode('detailed')}
        aria-pressed={mode === 'detailed'}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${mode === 'detailed' ? 'bg-valence-ink text-white' : 'text-valence-muted hover:text-valence-text'}`}
      >
        <Layers className="h-3 w-3" /> {detailedLabel}
      </button>
    </div>
  )
}
