// Central feature registry.
//
// Every feature that can be toggled per-org lives here. The shape is:
//
//   {
//     id:           stable string id, used as the orgs.feature_flags key
//     label:        short human label for the toggle UI
//     description:  one-liner describing what enabling unlocks
//     surface:      where in the app the feature shows up (free-form,
//                   shown in the toggle UI under the label)
//     default_for:  array of firm types where the feature is ON by default
//                   on a brand-new org. Empty array == off everywhere by
//                   default; the user has to flip it on in Settings.
//   }
//
// Resolution rule:
//   1. Look up orgs.feature_flags[id]
//   2. If true/false explicitly set, use that
//   3. Otherwise fall back to: default_for.includes(org.firm_type)
//   4. If org has no firm_type yet, treat as ON (legacy behaviour — we
//      don't want to silently disable existing surfaces for orgs that
//      haven't completed the firm-type onboarding step).
//
// Adding a new feature: append to FEATURES, plumb useFeatureFlag('your_id')
// at the call site, and ship. The Settings → Advanced → Features panel
// picks it up automatically.

export const FIRM_TYPES = [
  {
    id: 'ib',
    label: 'Investment Bank / Advisory',
    blurb: 'M&A and capital raises for clients. You run mandates.',
  },
  {
    id: 'pe',
    label: 'Private Equity',
    blurb: 'You invest the firm\'s own capital and manage a portfolio.',
  },
  {
    id: 'vc',
    label: 'Venture Capital',
    blurb: 'Early / growth equity. Thesis-led sourcing.',
  },
]

// Every feature in the system. Group them lightly so the Settings UI can
// section them — `category` is purely cosmetic.
//
// `planned: true` marks features whose UX is registered but the
// implementation hasn't shipped yet. The Settings → Features panel
// renders these with a "Coming soon" badge and the toggle is disabled.
// Why bother registering them now: it surfaces the roadmap to the
// partner the moment they pick a firm type, so they see what's around
// the corner. Removing `planned` is what flips the feature live.
export const FEATURES = [
  // ── Pipeline surfaces ──────────────────────────────────────────────
  {
    id: 'deal_status',
    label: 'Deal Status',
    description: 'Pipeline page with Board / Table / Gantt views.',
    surface: 'Sidebar · /deals',
    category: 'Pipeline',
    default_for: ['ib', 'pe', 'vc'],
  },
  {
    id: 'live_mandates_filter',
    label: 'Live mandates filter',
    description: 'All-deals ⇄ Live-mandates segmented control on Deal Status.',
    surface: 'Deal Status header',
    category: 'Pipeline',
    default_for: ['ib'],
  },
  {
    id: 'timeline',
    label: 'Timeline',
    description: 'Firm-wide Gantt + activity table.',
    surface: 'Sidebar · /timeline',
    category: 'Pipeline',
    default_for: ['ib', 'pe', 'vc'],
  },
  // ── AI tools — already built ───────────────────────────────────────
  {
    id: 'company_fund_matcher',
    label: 'Match company ⇄ fund',
    description: 'Suggest funds for a mandate, or deals in your pipeline that fit a fund.',
    surface: 'Deal detail + People (fund) detail',
    category: 'AI tools',
    default_for: ['ib'],
  },
  {
    id: 'thesis_fit_checker',
    label: 'Thesis-fit checker',
    description: 'Paste a company → Strong / Partial / No-fit against your stated thesis, with per-criterion reasoning.',
    surface: 'Sidebar · /screen',
    category: 'AI tools',
    default_for: ['vc', 'pe'],
  },
  {
    id: 'cim_drafter',
    label: 'CIM / teaser drafter',
    description: 'Generate sell-side teaser + CIM drafts grounded in the deal\'s data room.',
    surface: 'Deal detail · CIM tab',
    category: 'AI tools',
    default_for: ['ib'],
  },
  // ── AI tools — planned (showing roadmap) ───────────────────────────
  {
    id: 'target_list_builder',
    label: 'Target list builder',
    description: 'AI seeds 12 plausible acquirers / investors per mandate; track each by status + warmth.',
    surface: 'Deal detail · Targets tab',
    category: 'AI tools',
    default_for: ['ib'],
  },
  {
    id: 'deck_summariser',
    label: 'Deck summariser',
    description: 'Paste a pitch deck → AI extracts company, sector, stage, ARR, ask. Plus open questions.',
    surface: 'Sidebar · /deck',
    category: 'AI tools',
    default_for: ['vc', 'pe'],
  },
  // ── Relationship surfaces ──────────────────────────────────────────
  {
    id: 'people_crm',
    label: 'People CRM',
    description: 'Contact roster with warmth, interactions, and intro paths.',
    surface: 'Sidebar · /people',
    category: 'Relationships',
    default_for: ['ib', 'pe', 'vc'],
  },
  {
    id: 'interactions_feed',
    label: 'Interactions feed',
    description: 'Chronological log of meetings, calls, emails, WhatsApp.',
    surface: 'Sidebar · /interactions',
    category: 'Relationships',
    default_for: ['ib', 'pe', 'vc'],
  },
  // ── Workflow / planning ────────────────────────────────────────────
  {
    id: 'day_planner',
    label: 'Day Planner',
    description: 'AI-summarised free slots, meeting prep, intro drafts.',
    surface: 'Sidebar · /planner',
    category: 'Workflow',
    default_for: ['ib', 'pe', 'vc'],
  },
  {
    id: 'team_calendar',
    label: 'Team Calendar',
    description: 'Shared week view that pulls each teammate\'s Google Calendar.',
    surface: 'Sidebar · /calendar',
    category: 'Workflow',
    default_for: ['ib', 'pe', 'vc'],
  },
  {
    id: 'intake_inbox',
    label: 'Intake inbox',
    description: 'External deal-submission form + triage.',
    surface: 'Sidebar · /inbox/intake',
    category: 'Workflow',
    default_for: ['ib'],
  },
  // ── PE-specific ───────────────────────────────────────────────────
  {
    id: 'portfolio_tracker',
    label: 'Portfolio company tracker',
    description: 'Companies you own: ownership %, board seats, current valuation, NAV, status.',
    surface: 'Sidebar · /portfolio',
    category: 'PE',
    default_for: ['pe', 'vc'],
  },
  {
    id: 'diligence_workstreams',
    label: 'Diligence workstreams',
    description: 'Per-deal grid: commercial / financial / legal / operational. Status, owner, providers, document links.',
    surface: 'Deal detail · Diligence tab',
    category: 'PE',
    default_for: ['pe'],
  },
  {
    id: 'value_creation_plan',
    label: '100-day & value-creation plan',
    description: 'Track post-close milestones, hires, board priorities, exit readiness.',
    surface: 'Portfolio company detail',
    category: 'PE',
    default_for: ['pe'],
    planned: true,
  },
  {
    id: 'lp_reporting',
    label: 'LP reporting pack',
    description: 'One-click quarterly LP letter draft from your active portfolio.',
    surface: 'Sidebar · /lp-pack',
    category: 'PE',
    default_for: ['pe'],
  },
  // ── VC-specific ───────────────────────────────────────────────────
  {
    id: 'pass_tracker',
    label: 'Pass tracker',
    description: 'Log every pass + the reason. Pattern-mining surfaces sourcing biases over the year.',
    surface: 'Sidebar · /passes',
    category: 'VC',
    default_for: ['vc'],
  },
  {
    id: 'follow_on_tracker',
    label: 'Follow-on tracker',
    description: 'Portfolio cos signalling a new round. Pro-rata math, lead investor, action needed.',
    surface: 'Portfolio detail',
    category: 'VC',
    default_for: ['vc'],
  },
  {
    id: 'anti_portfolio',
    label: 'Anti-portfolio',
    description: 'Passed deals that became outsized winners. Cheap learning, painful reading.',
    surface: '/passes · Anti-portfolio tab',
    category: 'VC',
    default_for: ['vc'],
  },
  // ── IB-specific ───────────────────────────────────────────────────
  {
    id: 'fee_tracker',
    label: 'Mandate fee tracker',
    description: 'Retainer + success-fee structure per mandate; live forecast on ticket size.',
    surface: 'Deal detail · Financials',
    category: 'IB',
    default_for: ['ib'],
  },
  {
    id: 'bake_off_mode',
    label: 'Bake-off mode',
    description: 'Track competing advisors + decision date when pitching for a mandate.',
    surface: 'Deal detail',
    category: 'IB',
    default_for: ['ib'],
  },
  {
    id: 'ic_memo',
    label: 'IC memo generator',
    description: 'One-click IC memo from deal data: rationale, financials, risks, asks.',
    surface: 'Deal detail · IC Memo',
    category: 'IB',
    default_for: ['ib', 'pe'],
  },
  {
    id: 'closing_checklist',
    label: 'Closing checklist',
    description: 'Stage-aware to-dos: signing pack, escrow, regulatory, fee invoice.',
    surface: 'Deal detail',
    category: 'IB',
    default_for: ['ib'],
  },
]

// Quick lookups
export const FEATURES_BY_ID = Object.fromEntries(FEATURES.map(f => [f.id, f]))

export function defaultFlagFor(featureId, firmType) {
  const f = FEATURES_BY_ID[featureId]
  if (!f) return false
  // Pre-onboarding (no firm_type yet): everything ON. Don't surprise
  // legacy orgs with disabled features the moment this code ships.
  if (!firmType) return true
  return f.default_for.includes(firmType)
}

// Resolve a single feature for an org. flagsMap is the orgs.feature_flags
// jsonb as a plain object. Returns true/false.
export function isFeatureEnabled(featureId, { firmType, flagsMap } = {}) {
  const explicit = flagsMap && Object.prototype.hasOwnProperty.call(flagsMap, featureId)
    ? flagsMap[featureId]
    : undefined
  if (explicit === true || explicit === false) return explicit
  return defaultFlagFor(featureId, firmType)
}

// Resolve the full feature → enabled map for an org. Useful for the
// Settings page so we can render all toggles with their current state.
export function resolveAllFeatures({ firmType, flagsMap } = {}) {
  const out = {}
  for (const f of FEATURES) {
    out[f.id] = isFeatureEnabled(f.id, { firmType, flagsMap })
  }
  return out
}
