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
