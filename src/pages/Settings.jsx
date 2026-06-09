import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Settings as SettingsIcon, Video, Check } from 'lucide-react'
import {
  SETTINGS_SECTIONS,
  findSection,
  sectionsByTier,
  MEETING_TOOLS,
  getAvailableMeetingTools,
  getMeetingTool,
  setMeetingTool
} from '../lib/settings.js'
import { PITCH_MODE } from '../lib/featureFlags.js'
import GoogleWorkspacePanel from '../components/GoogleWorkspacePanel.jsx'
import SampleDataPanel from '../components/SampleDataPanel.jsx'
import LlmProviderPanel from '../components/LlmProviderPanel.jsx'
import TeamPanel from '../components/TeamPanel.jsx'
import CsvContactImport from '../components/CsvContactImport.jsx'
import ScoringCriteriaPanel from '../components/ScoringCriteriaPanel.jsx'
import BulkAddPeoplePanel from '../components/BulkAddPeoplePanel.jsx'
import WorkspacePreferencesPanel from '../components/WorkspacePreferencesPanel.jsx'
import AppearancePanel from '../components/AppearancePanel.jsx'

function MeetingToolPicker() {
  const available = getAvailableMeetingTools({ pitchMode: PITCH_MODE })
  const [selected, setSelected] = useState(() => getMeetingTool({ pitchMode: PITCH_MODE }))
  const [savedFlash, setSavedFlash] = useState(false)

  // Don't render a panel full of disabled "Coming soon" tools — if nothing
  // is actually wired up, the whole card reads as vaporware. Show it only
  // once at least one recorder is configurable.
  if (!available.some(t => t.status === 'configurable')) return null

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
                  : 'border-valence-border bg-valence-elevated hover:border-valence-ink/30 hover:bg-valence-surface'
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

    </div>
  )
}

function IntegrationsSection() {
  return (
    <div className="space-y-4">
      <MeetingToolPicker />
      <GoogleWorkspacePanel />
      <LlmProviderPanel />
    </div>
  )
}

function DataSection() {
  return (
    <div className="space-y-4">
      <BulkAddPeoplePanel />
      <CsvContactImport />
      <SampleDataPanel />
    </div>
  )
}

function WorkspaceSection() {
  // ScoringCriteriaPanel used to be inlined here. It moved to its own
  // Advanced section ('scoring' / "Investment criteria") so prospects
  // don't see thesis-level config on their first /settings open.
  return (
    <div className="space-y-4">
      <WorkspacePreferencesPanel />
    </div>
  )
}

function ScoringSection() {
  return (
    <div className="space-y-4">
      <ScoringCriteriaPanel />
    </div>
  )
}

function SectionBody({ id }) {
  switch (id) {
    case 'workspace':
      return <WorkspaceSection />
    case 'team':
      return <TeamPanel />
    case 'scoring':
      return <ScoringSection />
    case 'integrations':
      return <IntegrationsSection />
    case 'data':
      return <DataSection />
    case 'appearance':
      return <AppearancePanel />
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

      <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-6">
        <nav className="vl-card p-2 h-fit space-y-2">
          <NavGroup
            heading="Simple"
            sublabel="Day-to-day"
            sections={sectionsByTier('simple')}
            active={active}
            onSelect={selectSection}
          />
          <div className="h-px bg-valence-border/60 mx-2" />
          <NavGroup
            heading="Advanced"
            sublabel="Admin setup"
            sections={sectionsByTier('advanced')}
            active={active}
            onSelect={selectSection}
          />
        </nav>

        <section className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-valence-text">{current.label}</h2>
              <p className="text-sm text-valence-muted mt-0.5">{current.description}</p>
            </div>
            {current.tier === 'advanced' && (
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-valence-warning bg-valence-warning/10 border border-valence-warning/30 rounded-full px-2 py-0.5">
                Advanced
              </span>
            )}
          </div>
          <SectionBody id={current.id} />
        </section>
      </div>
    </div>
  )
}

// Grouped rail. The heading is small + uppercase so the rail still
// reads as one navigation rather than two competing menus, and the
// active row stays prominent enough that the section split doesn't
// fight for attention with the section content.
function NavGroup({ heading, sublabel, sections, active, onSelect }) {
  return (
    <div>
      <div className="px-3 pt-1 pb-1.5 flex items-baseline gap-2">
        <p className="vl-eyebrow text-valence-subtle">{heading}</p>
        {sublabel && (
          <span className="text-[10px] text-valence-faint">· {sublabel}</span>
        )}
      </div>
      {sections.map(s => {
        const isActive = s.id === active
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
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
    </div>
  )
}
