import { overrideFor, stageOverrideKey } from './labels.js'

// Canonical pre-diligence pipeline for an investor (VC / PE / family office).
// This tool tracks a potential portfolio company from first contact up to the
// point formal due diligence begins — "Diligence" is the final tracked stage
// (a graduation/handoff out of the tool), and "Passed" is the drop-off.
//
// The funnel:
//   Sourced → Information Received → Analyst Call → Partner Call → Memo → Diligence
//   (Passed = dropped at any point)

// `label` is what the UI shows; `id` is what's stored in the DB / activity
// log. For the company funnel they're identical (kept that way so the
// company UI never changes). The LP funnel below reuses the two terminal
// *ids* ('Diligence', 'Passed') so all the terminal-aware analytics keep
// working unchanged, but relabels them ('Committed') for fundraising.
export const STAGES = [
  {
    id: 'Sourced',
    label: 'Sourced',
    short: 'Sourced',
    desc: 'On the radar. Identified but not yet evaluated — no info in yet.',
    tone: 'slate',
    terminal: false
  },
  {
    id: 'Information Received',
    label: 'Information Received',
    short: 'Info in',
    desc: 'Deck or materials received (inbound, intro, or outreach). Awaiting a first look.',
    tone: 'slate',
    terminal: false
  },
  {
    id: 'Analyst Call',
    label: 'Analyst Call',
    short: 'Analyst call',
    desc: 'Worth evaluating further — first analyst call done or scheduled.',
    tone: 'blue',
    terminal: false
  },
  {
    id: 'Partner Call',
    label: 'Partner Call',
    short: 'Partner call',
    desc: 'Escalated past the analyst — partner has taken or scheduled a call.',
    tone: 'blue',
    terminal: false
  },
  {
    id: 'Memo',
    label: 'Memo',
    short: 'Memo',
    desc: 'Investment / opportunity memo being prepared for IC. Last step before diligence.',
    tone: 'blue-strong',
    terminal: false
  },
  {
    id: 'Diligence',
    label: 'Diligence',
    short: 'Diligence',
    desc: 'Due diligence has begun. Graduates out of the pre-diligence pipeline.',
    tone: 'success',
    terminal: true
  },
  {
    id: 'Passed',
    label: 'Passed',
    short: 'Passed',
    desc: 'We passed (or lost the allocation). Out of the pipeline.',
    tone: 'danger',
    terminal: true
  }
]

// LP fundraising-conversation funnel (kind = 'lp'). An LP is sourced, warmed
// up, pitched, runs their own diligence on the fund, soft-circles, then
// commits. The two terminals deliberately share ids with the company funnel
// ('Diligence' = the success graduation, relabelled 'Committed'; 'Passed' =
// the drop) so every terminal-keyed analytic (drop-off, win-rate, KPIs)
// works across both pipelines without branching.
export const LP_STAGES = [
  {
    id: 'LP Sourced',
    label: 'Identified',
    short: 'Identified',
    desc: 'Potential LP identified — not yet contacted.',
    tone: 'slate',
    terminal: false
  },
  {
    id: 'LP Introduced',
    label: 'Introduced',
    short: 'Introduced',
    desc: 'Warm intro made or first contact established. Relationship opened.',
    tone: 'slate',
    terminal: false
  },
  {
    id: 'LP Meeting',
    label: 'Meeting',
    short: 'Meeting',
    desc: 'Pitch meeting held or scheduled — the fund has been presented.',
    tone: 'blue',
    terminal: false
  },
  {
    id: 'LP Due Diligence',
    label: 'Fund DD',
    short: 'Fund DD',
    desc: 'The LP is running diligence on the fund — data room, references, track record.',
    tone: 'blue',
    terminal: false
  },
  {
    id: 'LP Soft Circle',
    label: 'Soft-circled',
    short: 'Soft-circled',
    desc: 'Verbal or soft commitment given. Allocation indicated, papers pending.',
    tone: 'blue-strong',
    terminal: false
  },
  {
    id: 'Diligence',
    label: 'Committed',
    short: 'Committed',
    desc: 'The LP has formally committed capital. Closed-won.',
    tone: 'success',
    terminal: true
  },
  {
    id: 'Passed',
    label: 'Passed',
    short: 'Passed',
    desc: 'The LP passed (or went cold). Out of the fundraising pipeline.',
    tone: 'danger',
    terminal: true
  }
]

export const ACTIVE_STAGES   = STAGES.filter(s => !s.terminal)
export const TERMINAL_STAGES = STAGES.filter(s =>  s.terminal)
export const STAGE_IDS       = STAGES.map(s => s.id)

export const LP_ACTIVE_STAGES = LP_STAGES.filter(s => !s.terminal)
export const LP_STAGE_IDS     = LP_STAGES.map(s => s.id)

// "Active pipeline" — deals being actively worked (post first-contact,
// pre-diligence). Drives the Active Deals view and the sidebar badge.
export const LIVE_PIPELINE_STAGES = ['Analyst Call', 'Partner Call', 'Memo']
// Back-compat alias (older imports referenced LIVE_MANDATE_STAGES).
export const LIVE_MANDATE_STAGES = LIVE_PIPELINE_STAGES
// LP equivalent — the actively-worked middle of the fundraising funnel.
export const LIVE_LP_STAGES = ['LP Meeting', 'LP Due Diligence', 'LP Soft Circle']

// Both funnels graduate into 'Diligence' and drop into 'Passed' (shared ids).
export const TERMINAL_STAGE_IDS = ['Diligence', 'Passed']

// ── Mode-aware accessors ─────────────────────────────────────────────────
// `mode` is the pipeline mode 'company' | 'lp' (also accepts a deal's `kind`,
// which is the same vocabulary). Anything that isn't 'lp' falls back to the
// company funnel, so undefined/legacy callers stay on the company stages.
const isLp = (mode) => mode === 'lp'

export function stagesForMode(mode)        { return isLp(mode) ? LP_STAGES        : STAGES }
export function activeStagesForMode(mode)  { return isLp(mode) ? LP_ACTIVE_STAGES : ACTIVE_STAGES }
export function stageIdsForMode(mode)      { return isLp(mode) ? LP_STAGE_IDS     : STAGE_IDS }
export function liveStagesForMode(mode)    { return isLp(mode) ? LIVE_LP_STAGES   : LIVE_PIPELINE_STAGES }
export function terminalIdsForMode()       { return TERMINAL_STAGE_IDS }

// The stage a brand-new deal lands in for a given mode — the "first contact /
// materials in" step, not the cold 'identified' top of funnel.
export function defaultNewStage(mode) { return isLp(mode) ? 'LP Introduced' : 'Information Received' }

// Resolve a stage id to its human label for a given mode/kind. The two
// terminal ids are shared, so the mode disambiguates 'Diligence' →
// 'Committed' (LP) vs 'Diligence' (company). A per-firm rename (label
// override) wins over the built-in label.
export function stageLabel(id, mode) {
  const ov = overrideFor(stageOverrideKey(mode, id))
  if (ov) return ov
  const set = stagesForMode(mode)
  const m = set.find(s => s.id === id)
  return m ? (m.label || m.id) : id
}

// stageMeta searches the company funnel first, then the LP-only stages, so a
// bare id resolves regardless of mode. The shared terminal ids resolve to the
// company entry (use stageLabel(id, mode) when the LP label is needed).
export function stageMeta(id) {
  return STAGES.find(s => s.id === id)
    || LP_STAGES.find(s => s.id === id)
    || STAGES[0]
}

export function stageToneClasses(id) {
  const tone = stageMeta(id).tone
  switch (tone) {
    case 'slate':       return 'bg-white/5 text-valence-muted border-valence-border'
    case 'blue':        return 'bg-valence-blue/10 text-valence-blue border-valence-blue/30'
    case 'blue-strong': return 'bg-valence-blue-soft text-valence-blue border-valence-blue/50'
    case 'success':     return 'bg-valence-success/10 text-valence-success border-valence-success/30'
    case 'warning':     return 'bg-valence-warning/10 text-valence-warning border-valence-warning/30'
    case 'danger':      return 'bg-valence-danger/10 text-valence-danger border-valence-danger/30'
    default:            return 'bg-white/5 text-valence-muted border-valence-border'
  }
}

// Progress percentage through the active funnel (0..1). Useful for progress
// bars. Works for either funnel — looks the id up in whichever active set it
// belongs to (company first, then LP).
export function stageProgress(id) {
  const m = stageMeta(id)
  if (m.terminal) return m.id === 'Diligence' ? 1 : 0
  const active = ACTIVE_STAGES.some(s => s.id === id) ? ACTIVE_STAGES : LP_ACTIVE_STAGES
  const idx = active.findIndex(s => s.id === id)
  return idx < 0 ? 0 : (idx + 1) / active.length
}

// Map legacy / un-migrated stage names to the new pre-diligence funnel. Used at
// runtime for in-memory data and demo arrays; the SQL migration covers durable
// rows. Old IB pipeline → new investor funnel:
//   Origination → Information Received   Pitching → Analyst Call
//   Pre-Mandate → Partner Call           Mandate  → Memo
//   Closed → Diligence (graduated)       Lost → Passed   On Hold → Sourced
export function migrateStage(old) {
  if (!old) return 'Sourced'
  if (STAGE_IDS.includes(old)) return old
  const map = {
    Origination: 'Information Received',
    Pitch: 'Analyst Call',
    Pitching: 'Analyst Call',
    'Pre-Mandate': 'Partner Call',
    Preparation: 'Memo',
    Marketing: 'Memo',
    Negotiation: 'Memo',
    Closing: 'Memo',
    Mandate: 'Memo',
    Closed: 'Diligence',
    'On Hold': 'Sourced',
    Lost: 'Passed'
  }
  return map[old] || 'Sourced'
}
