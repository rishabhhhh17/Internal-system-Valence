// useFeatureFlag — read whether a feature is on for the current user's org.
//
// Resolution mirrors src/lib/features.js:isFeatureEnabled — explicit
// per-org override wins, falls back to per-firm-type defaults, falls
// back to "on" if the org hasn't picked a firm type yet (legacy safety).
//
// Usage:
//   const enabled = useFeatureFlag('company_fund_matcher')
//   if (!enabled) return null
//
// While the seat is still loading we return `true` so we don't briefly
// hide UI that the user will see a tick later — the flag flips to its
// real value on the next render once the org is resolved.

import { useSeat } from './useSeat.js'
import { isFeatureEnabled, resolveAllFeatures } from '../lib/features.js'

export function useFeatureFlag(featureId) {
  const { org, loading } = useSeat()
  if (loading) return true
  return isFeatureEnabled(featureId, {
    firmType: org?.firm_type || null,
    flagsMap: org?.feature_flags || {}
  })
}

// Bulk variant — handy for Settings UI and conditional sidebars that
// reference many flags in one render. Returns { [featureId]: boolean }.
export function useAllFeatureFlags() {
  const { org, loading } = useSeat()
  if (loading) return {}
  return resolveAllFeatures({
    firmType: org?.firm_type || null,
    flagsMap: org?.feature_flags || {}
  })
}
