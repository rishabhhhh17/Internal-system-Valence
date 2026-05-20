// Settings registry — drives both the /settings page rail and any in-app
// links that deep-link to a specific section. Order here = order in the UI.
export const SETTINGS_SECTIONS = [
  {
    id: 'workspace',
    label: 'Workspace',
    description: 'Firm name, logo, brand color, currency, default scoring criteria.'
  },
  {
    id: 'integrations',
    label: 'Integrations',
    description: 'Meeting recorder, Google Workspace, Gemini API key.'
  },
  {
    id: 'data',
    label: 'Data',
    description: 'Contact import, drag-to-attach on People, sample data.'
  },
  {
    id: 'appearance',
    label: 'Appearance',
    description: 'Theme, density, sidebar position.'
  }
]

export function findSection(id) {
  return SETTINGS_SECTIONS.find(s => s.id === id) || SETTINGS_SECTIONS[0]
}

// ============ MEETING RECORDER INTEGRATION ============
// Lists the meeting-tool integrations a firm can wire into the Interactions
// pipeline. `status: 'configurable'` means a real handler exists today;
// `coming-soon` is intentionally inert and shown as disabled. The
// `pitchHidden` flag stays on the schema as a hook for any future tool
// whose code path is stripped on the customer-pitch build.
export const MEETING_TOOLS = [
  { id: 'read-ai',   label: 'Read.ai',   status: 'coming-soon' },
  { id: 'otter',     label: 'Otter',     status: 'coming-soon' },
  { id: 'fireflies', label: 'Fireflies', status: 'coming-soon' }
]

const STORAGE_KEY_MEETING_TOOL = 'valence.settings.meetingTool'

function safeLocalStorage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage
  } catch {
    return null
  }
}

export function getAvailableMeetingTools({ pitchMode = false } = {}) {
  return MEETING_TOOLS.filter(t => !(pitchMode && t.pitchHidden))
}

export function isValidMeetingTool(id, { pitchMode = false } = {}) {
  return getAvailableMeetingTools({ pitchMode }).some(t => t.id === id)
}

export function getMeetingTool({ pitchMode = false } = {}) {
  const store = safeLocalStorage()
  if (!store) return null
  const raw = store.getItem(STORAGE_KEY_MEETING_TOOL)
  if (!raw) return null
  return isValidMeetingTool(raw, { pitchMode }) ? raw : null
}

export function setMeetingTool(id, { pitchMode = false } = {}) {
  const store = safeLocalStorage()
  if (!store) return false
  if (id === null || id === undefined || id === '') {
    store.removeItem(STORAGE_KEY_MEETING_TOOL)
    return true
  }
  if (!isValidMeetingTool(id, { pitchMode })) return false
  const tool = MEETING_TOOLS.find(t => t.id === id)
  if (tool && tool.status !== 'configurable') return false
  store.setItem(STORAGE_KEY_MEETING_TOOL, id)
  return true
}
