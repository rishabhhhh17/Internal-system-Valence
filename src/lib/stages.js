// Canonical Valence pipeline. Compressed from the previous 11-stage model
// to 7 stages that mirror how mandates actually progress at the firm. The
// old execution-phase stages (Preparation, Marketing, Diligence,
// Negotiation, Closing) collapse into "Mandate" — that work is captured in
// the activity log, not as separate pipeline stages.

export const STAGES = [
  {
    id: 'Origination',
    short: 'Prospect',
    desc: 'First few interactions. We have started talking. Nothing committed.',
    tone: 'slate',
    terminal: false
  },
  {
    id: 'Pitching',
    short: 'Pitching',
    desc: 'Actively hard-pitching the proposition. Not soft-pitching, not informal.',
    tone: 'slate',
    terminal: false
  },
  {
    id: 'Pre-Mandate',
    short: 'Pre-mandate',
    desc: 'Negotiating pricing, NDAs, engagement letter. Pre-contractual paperwork.',
    tone: 'blue',
    terminal: false
  },
  {
    id: 'Mandate',
    short: 'Engaged',
    desc: 'Fully working on the engagement. Active execution.',
    tone: 'blue-strong',
    terminal: false
  },
  {
    id: 'Closed',
    short: 'Closed',
    desc: 'Successfully completed mandate.',
    tone: 'success',
    terminal: true
  },
  {
    id: 'On Hold',
    short: 'Paused',
    desc: 'Holding the contract but not actively working — payment dispute, client emergency, force majeure.',
    tone: 'warning',
    terminal: true
  },
  {
    id: 'Lost',
    short: 'Lost',
    desc: 'Engagement ended abruptly. Not a successful close.',
    tone: 'danger',
    terminal: true
  }
]

export const ACTIVE_STAGES   = STAGES.filter(s => !s.terminal)
export const TERMINAL_STAGES = STAGES.filter(s =>  s.terminal)
export const STAGE_IDS       = STAGES.map(s => s.id)

// "Live mandate" stages — what the Live Mandates page and Timeline view show.
// Pre-Mandate + Mandate. Origination and Pitching are pre-pipeline (Interactions
// territory); the terminal three are after.
export const LIVE_MANDATE_STAGES = ['Pre-Mandate', 'Mandate']

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

// Progress percentage through active funnel (0..1). Useful for progress bars.
export function stageProgress(id) {
  const m = stageMeta(id)
  if (m.terminal) return m.id === 'Closed' ? 1 : 0
  const idx = ACTIVE_STAGES.findIndex(s => s.id === id)
  return (idx + 1) / ACTIVE_STAGES.length
}

// Map old stage names to new ones. Used at runtime when reading historical
// data that hasn't been migrated yet (the SQL migration covers the durable
// case; this catches in-memory data and demo arrays).
export function migrateStage(old) {
  if (!old) return 'Origination'
  if (old === 'Pitch') return 'Pitching'
  if (['Preparation', 'Marketing', 'Diligence', 'Negotiation', 'Closing'].includes(old)) return 'Mandate'
  if (STAGE_IDS.includes(old)) return old
  return 'Origination'
}
