// firmIdentity — small helper to keep AI prompts, email templates, CIM
// headers, and any other firm-branded surface from hardcoding a single
// tenant name. Source of truth is the workspace setting `firmName`
// (set in Settings → Workspace). Falls back to a neutral string so
// templates render sanely for any tenant.
//
// Provides BOTH a synchronous getter (for lib/* files called from event
// handlers, AI prompt builders, etc — they're not React render paths)
// AND a React hook (for components that need live updates when the
// partner edits firm name in Settings).
//
// History: a long tail of templates / Gemini prompts had "Valence Growth
// Partners" baked in. On a multi-tenant demo where a different prospect
// is in the seat, those leak the original tenant's name into the AI
// summary, the email signature, the CIM cover — looked like a single-
// tenant product. This helper makes them tenant-aware.

import { useWorkspaceSetting } from '../hooks/useWorkspaceSetting.js'
import { getWorkspaceSetting, WORKSPACE_KEYS } from './workspace.js'

// Synchronous getter — safe to call from non-React contexts (lib/*).
// Returns the firmName workspace setting, or `fallback` if unset.
// Trim because users sometimes paste with stray whitespace.
export function firmDisplayName(fallback = 'your firm') {
  const raw = getWorkspaceSetting(WORKSPACE_KEYS.firmName, '')
  const cleaned = (raw || '').trim()
  return cleaned || fallback
}

// React hook variant — re-renders when the partner edits firm name in
// /settings. Use this inside React components; use the synchronous
// getter everywhere else.
export function useFirmDisplayName(fallback = 'your firm') {
  const raw = useWorkspaceSetting(WORKSPACE_KEYS.firmName)
  const cleaned = (raw || '').trim()
  return cleaned || fallback
}

// First-name helper for greetings ("Hi <first>,") in email templates.
// Pulls the first space-separated token. Falls back to 'there' so the
// generated copy still reads naturally when name is empty.
export function firstNameOf(person) {
  const name = (person && (person.full_name || person.name || person.fullName)) || ''
  const first = String(name).trim().split(/\s+/)[0] || ''
  return first || 'there'
}
