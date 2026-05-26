// Settings registry — drives both the /settings page rail and any in-app
// links that deep-link to a specific section. Sections are split into two
// tiers ('simple' / 'advanced'). The rail renders two grouped lists with
// eyebrow headers — Simple is what a new partner touches in the first
// week (firm identity, teammates, look-and-feel); Advanced is for the
// admin doing the deeper setup (investment thesis, AI provider keys,
// bulk data import).
//
// Investment criteria used to live inside the Workspace section as a
// secondary card. Prospects taking their first look at /settings would
// see the scoring panel and bounce — too much firm-specific config
// before they'd even decided to start using the product. Now it's its
// own Advanced section, out of the first-impression path.
export const SETTINGS_SECTIONS = [
  // ---------- SIMPLE ----------
  {
    id: 'workspace',
    tier: 'simple',
    label: 'Workspace',
    description: 'Firm name, logo, brand color, currency, and browser title.'
  },
  {
    id: 'team',
    tier: 'simple',
    label: 'Team',
    description: 'Members of your firm + invite codes for new partners.'
  },
  {
    id: 'appearance',
    tier: 'simple',
    label: 'Appearance',
    description: 'Theme, density, sidebar position.'
  },
  // ---------- ADVANCED ----------
  {
    id: 'scoring',
    tier: 'advanced',
    label: 'Investment criteria',
    description: 'Define the deal types, sectors, ticket sizes, and geographies your firm is actively screening for. AI surfaces use this to score inbound mandates.'
  },
  {
    id: 'integrations',
    tier: 'advanced',
    label: 'Integrations',
    description: 'AI provider, meeting recorder, Google Workspace.'
  },
  {
    id: 'data',
    tier: 'advanced',
    label: 'Data',
    description: 'AI-assisted import, CSV upload, drag-to-attach on People, sample data.'
  },
  {
    id: 'features',
    tier: 'advanced',
    label: 'Features',
    description: 'Turn individual features on or off for your firm. Sensible defaults are picked from your firm type (IB / PE / VC); override anything here.'
  }
]

export function findSection(id) {
  return SETTINGS_SECTIONS.find(s => s.id === id) || SETTINGS_SECTIONS[0]
}

// Convenience selectors used by the Settings page rail to render two
// grouped lists. Order within each tier matches array order above.
export function sectionsByTier(tier) {
  return SETTINGS_SECTIONS.filter(s => s.tier === tier)
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
