// Canonical pre-diligence pipeline for an investor (VC / PE / family office).
// This tool tracks a potential portfolio company from first contact up to the
// point formal due diligence begins — "Diligence" is the final tracked stage
// (a graduation/handoff out of the tool), and "Passed" is the drop-off.
//
// The funnel:
//   Sourced → Information Received → Analyst Call → Partner Call → Memo → Diligence
//   (Passed = dropped at any point)

export const STAGES = [
  {
    id: 'Sourced',
    short: 'Sourced',
    desc: 'On the radar. Identified but not yet evaluated — no info in yet.',
    tone: 'slate',
    terminal: false
  },
  {
    id: 'Information Received',
    short: 'Info in',
    desc: 'Deck or materials received (inbound, intro, or outreach). Awaiting a first look.',
    tone: 'slate',
    terminal: false
  },
  {
    id: 'Analyst Call',
    short: 'Analyst call',
    desc: 'Worth evaluating further — first analyst call done or scheduled.',
    tone: 'blue',
    terminal: false
  },
  {
    id: 'Partner Call',
    short: 'Partner call',
    desc: 'Escalated past the analyst — partner has taken or scheduled a call.',
    tone: 'blue',
    terminal: false
  },
  {
    id: 'Memo',
    short: 'Memo',
    desc: 'Investment / opportunity memo being prepared for IC. Last step before diligence.',
    tone: 'blue-strong',
    terminal: false
  },
  {
    id: 'Diligence',
    short: 'Diligence',
    desc: 'Due diligence has begun. Graduates out of the pre-diligence pipeline.',
    tone: 'success',
    terminal: true
  },
  {
    id: 'Passed',
    short: 'Passed',
    desc: 'We passed (or lost the allocation). Out of the pipeline.',
    tone: 'danger',
    terminal: true
  }
]

export const ACTIVE_STAGES   = STAGES.filter(s => !s.terminal)
export const TERMINAL_STAGES = STAGES.filter(s =>  s.terminal)
export const STAGE_IDS       = STAGES.map(s => s.id)

// "Active pipeline" — deals being actively worked (post first-contact,
// pre-diligence). Drives the Active Deals view and the sidebar badge.
export const LIVE_PIPELINE_STAGES = ['Analyst Call', 'Partner Call', 'Memo']
// Back-compat alias (older imports referenced LIVE_MANDATE_STAGES).
export const LIVE_MANDATE_STAGES = LIVE_PIPELINE_STAGES

export function stageMeta(id) {
  return STAGES.find(s => s.id === id) || STAGES[0]
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

// Progress percentage through the active funnel (0..1). Useful for progress bars.
export function stageProgress(id) {
  const m = stageMeta(id)
  if (m.terminal) return m.id === 'Diligence' ? 1 : 0
  const idx = ACTIVE_STAGES.findIndex(s => s.id === id)
  return (idx + 1) / ACTIVE_STAGES.length
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
