import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Settings as SettingsIcon, Video, Check } from 'lucide-react'
import {
  SETTINGS_SECTIONS,
  findSection,
  MEETING_TOOLS,
  getAvailableMeetingTools,
  getMeetingTool,
  setMeetingTool
} from '../lib/settings.js'
import { PITCH_MODE } from '../lib/featureFlags.js'
import GoogleWorkspacePanel from '../components/GoogleWorkspacePanel.jsx'
import SampleDataPanel from '../components/SampleDataPanel.jsx'
import GeminiKeyPanel from '../components/GeminiKeyPanel.jsx'
import CsvContactImport from '../components/CsvContactImport.jsx'
import ScoringCriteriaPanel from '../components/ScoringCriteriaPanel.jsx'

function ComingSoon({ label }) {
  return (
    <div className="vl-card-subtle p-6 text-sm text-valence-muted">
      <div className="font-semibold text-valence-text mb-1">{label}</div>
      <div>Wiring up in the next Phase 2 sub-task.</div>
    </div>
  )
}

function MeetingToolPicker() {
  const available = getAvailableMeetingTools({ pitchMode: PITCH_MODE })
  const [selected, setSelected] = useState(() => getMeetingTool({ pitchMode: PITCH_MODE }))
  const [savedFlash, setSavedFlash] = useState(false)

  function selectTool(id) {
    const tool = MEETING_TOOLS.find(t => t.id === id)
    if (!tool || tool.status !== 'configurable') return
    const ok = setMeetingTool(id, { pitchMode: PITCH_MODE })
    if (!ok) return
    setSelected(id)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1200)
  }

  function clearTool() {
    setMeetingTool(null, { pitchMode: PITCH_MODE })
    setSelected(null)
  }

  return (
    <div className="vl-card p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-valence-blue-soft p-2 text-valence-blue">
          <Video className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-valence-text">Meeting recorder</h3>
            {savedFlash && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-valence-blue">
                <Check className="h-3 w-3" /> Saved
              </span>
            )}
          </div>
          <p className="text-xs text-valence-muted mt-0.5">
            Pick the tool you use to record client meetings. Transcripts can attach to interactions once configured.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {available.map(tool => {
          const disabled = tool.status !== 'configurable'
          const isSelected = selected === tool.id
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => selectTool(tool.id)}
              disabled={disabled}
              className={`flex items-center justify-between gap-3 rounded-lg border px-3.5 py-3 text-left transition ${
                isSelected
                  ? 'border-valence-blue bg-valence-blue-soft'
                  : disabled
                  ? 'border-valence-border bg-valence-surface/50 cursor-not-allowed opacity-60'
                  : 'border-valence-border bg-white hover:border-valence-ink/30 hover:bg-valence-surface'
              }`}
            >
              <span className="text-sm font-medium text-valence-text">{tool.label}</span>
              {disabled ? (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-valence-subtle">Coming soon</span>
              ) : isSelected ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-valence-blue-deep">
                  <Check className="h-3 w-3" /> Selected
                </span>
              ) : (
                <span className="text-[11px] font-medium text-valence-muted">Select</span>
              )}
            </button>
          )
        })}
      </div>

      {selected && (
        <div className="flex items-center justify-between rounded-lg bg-valence-surface px-3.5 py-2.5">
          <span className="text-xs text-valence-muted">
            Currently using <span className="font-semibold text-valence-text">{MEETING_TOOLS.find(t => t.id === selected)?.label}</span>.
          </span>
          <button
            type="button"
            onClick={clearTool}
            className="text-xs font-medium text-valence-muted hover:text-valence-text"
          >
            Disconnect
          </button>
        </div>
      )}

      {PITCH_MODE && (
        <p className="text-[11px] text-valence-subtle italic">
          Pitch mode: meeting-tool wiring activates once your firm’s build is provisioned.
        </p>
      )}
    </div>
  )
}

function IntegrationsSection() {
  return (
    <div className="space-y-4">
      <MeetingToolPicker />
      <GoogleWorkspacePanel />
      <GeminiKeyPanel />
    </div>
  )
}

function DataSection() {
  return (
    <div className="space-y-4">
      <CsvContactImport />
      <SampleDataPanel />
      <ComingSoon label="Drag-to-attach contacts on People" />
    </div>
  )
}

function WorkspaceSection() {
  return (
    <div className="space-y-4">
      <ScoringCriteriaPanel />
      <ComingSoon label="Firm name · logo · brand color · default currency" />
    </div>
  )
}

function SectionBody({ id }) {
  switch (id) {
    case 'workspace':
      return <WorkspaceSection />
    case 'integrations':
      return <IntegrationsSection />
    case 'data':
      return <DataSection />
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
