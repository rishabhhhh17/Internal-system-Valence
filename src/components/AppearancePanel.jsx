import { Sun, Moon, Monitor } from 'lucide-react'
import { useWorkspaceSetting } from '../hooks/useWorkspaceSetting.js'
import { WORKSPACE_KEYS, setWorkspaceSetting } from '../lib/workspace.js'
import { useToast } from './Toast.jsx'

const THEMES = [
  { id: 'light', label: 'Light',  icon: Sun,     hint: 'Bright surfaces, navy text.' },
  { id: 'dark',  label: 'Dark',   icon: Moon,    hint: 'Deep navy surfaces, bright text.' },
  { id: 'auto',  label: 'Auto',   icon: Monitor, hint: 'Follows your OS preference.' }
]

const DENSITIES = [
  { id: 'comfortable', label: 'Comfortable', hint: 'Default spacing.' },
  { id: 'compact',     label: 'Compact',     hint: 'Tighter cards, more rows visible.' }
]

export default function AppearancePanel() {
  const toast = useToast()
  const theme = useWorkspaceSetting(WORKSPACE_KEYS.theme)
  const density = useWorkspaceSetting(WORKSPACE_KEYS.density)

  function pickTheme(id) {
    const ok = setWorkspaceSetting(WORKSPACE_KEYS.theme, id)
    if (!ok) toast.error('Could not save theme — browser storage blocked.')
  }

  function pickDensity(id) {
    const ok = setWorkspaceSetting(WORKSPACE_KEYS.density, id)
    if (!ok) toast.error('Could not save density — browser storage blocked.')
  }

  return (
    <div className="vl-card p-6 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-valence-text">Appearance</h3>
        <p className="text-xs text-valence-muted mt-0.5">
          Theme and density. Saved locally in this browser. Auto follows your OS dark-mode preference and switches live if you flip it.
        </p>
      </div>

      <div className="space-y-2">
        <div className="vl-eyebrow-ink">Theme</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {THEMES.map(({ id, label, icon: Icon, hint }) => {
            const isActive = theme === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => pickTheme(id)}
                className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-left transition ${
                  isActive
                    ? 'border-valence-blue bg-valence-blue-soft'
                    : 'border-valence-border bg-valence-elevated hover:border-valence-ink/30 hover:bg-valence-surface'
                }`}
              >
                <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${isActive ? 'text-valence-blue-deep' : 'text-valence-muted'}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-valence-text">{label}</span>
                  <span className="block mt-0.5 text-[11px] leading-relaxed text-valence-muted">{hint}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-2">
        <div className="vl-eyebrow-ink">Density</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {DENSITIES.map(({ id, label, hint }) => {
            const isActive = density === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => pickDensity(id)}
                className={`flex flex-col gap-1 rounded-lg border px-3.5 py-3 text-left transition ${
                  isActive
                    ? 'border-valence-blue bg-valence-blue-soft'
                    : 'border-valence-border bg-valence-elevated hover:border-valence-ink/30 hover:bg-valence-surface'
                }`}
              >
                <span className="text-sm font-semibold text-valence-text">{label}</span>
                <span className="text-[11px] leading-relaxed text-valence-muted">{hint}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
