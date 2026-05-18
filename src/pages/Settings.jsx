import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Settings as SettingsIcon } from 'lucide-react'
import { SETTINGS_SECTIONS, findSection } from '../lib/settings.js'

function ComingSoon({ label }) {
  return (
    <div className="vl-card-subtle p-6 text-sm text-valence-muted">
      <div className="font-semibold text-valence-text mb-1">{label}</div>
      <div>Wiring up in the next Phase 2 sub-task.</div>
    </div>
  )
}

function SectionBody({ id }) {
  switch (id) {
    case 'workspace':
      return <ComingSoon label="Workspace settings" />
    case 'integrations':
      return <ComingSoon label="Integrations" />
    case 'data':
      return <ComingSoon label="Data" />
    case 'appearance':
      return <ComingSoon label="Appearance" />
    default:
      return null
  }
}

export default function Settings() {
  const [params, setParams] = useSearchParams()
  const initial = findSection(params.get('section')).id
  const [active, setActive] = useState(initial)

  useEffect(() => {
    const next = findSection(params.get('section')).id
    if (next !== active) setActive(next)
  }, [params])

  function selectSection(id) {
    setActive(id)
    const next = new URLSearchParams(params)
    next.set('section', id)
    setParams(next, { replace: true })
  }

  const current = findSection(active)

  return (
    <div className="space-y-8">
      <header className="flex items-start gap-4">
        <div className="rounded-xl bg-valence-surface p-3 text-valence-blue">
          <SettingsIcon className="h-5 w-5" />
        </div>
        <div>
          <div className="vl-eyebrow-ink">Preferences</div>
          <h1 className="vl-section-title mt-1">Settings</h1>
          <p className="vl-section-kicker max-w-2xl">
            Configure your firm’s workspace, integrations, data flows, and look-and-feel.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-6">
        <nav className="vl-card p-2 h-fit">
          {SETTINGS_SECTIONS.map(s => {
            const isActive = s.id === active
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => selectSection(s.id)}
                className={`w-full text-left rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-valence-ink text-white'
                    : 'text-valence-muted hover:bg-valence-surface hover:text-valence-text'
                }`}
              >
                {s.label}
              </button>
            )
          })}
        </nav>

        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-valence-text">{current.label}</h2>
            <p className="text-sm text-valence-muted mt-0.5">{current.description}</p>
          </div>
          <SectionBody id={current.id} />
        </section>
      </div>
    </div>
  )
}
