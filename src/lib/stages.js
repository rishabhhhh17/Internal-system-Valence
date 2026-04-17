// Canonical Valence deal funnel. Every stage is defined with a short
// description so anyone on the team — analyst to MD — knows exactly what
// it means. Hover tooltips across the UI use these descriptions.

export const STAGES = [
  {
    id: 'Origination',
    short: 'Prospect',
    desc: 'Preliminary conversations. A potential client or target is identified but no mandate is in place yet.',
    tone: 'slate',
    terminal: false
  },
  {
    id: 'Pitch',
    short: 'Pitching',
    desc: 'Actively pitching for the mandate — credentials, approach, indicative economics being discussed.',
    tone: 'slate',
    terminal: false
  },
  {
    id: 'Mandate',
    short: 'Engaged',
    desc: 'Engagement letter signed. Valence is formally retained; scope, fees, and timeline are locked.',
    tone: 'blue',
    terminal: false
  },
  {
    id: 'Preparation',
    short: 'Prepping',
    desc: 'Building the materials — teaser, IM/management presentation, financial model, data room, investor list.',
    tone: 'blue',
    terminal: false
  },
  {
    id: 'Marketing',
    short: 'Outreach',
    desc: 'Teaser released. NDAs flowing. Counterparties (buyers, investors, strategics) being engaged.',
    tone: 'blue',
    terminal: false
  },
  {
    id: 'Diligence',
    short: 'Diligence',
    desc: 'Counterparties are in the data room. Management meetings, Q&A, and site visits underway.',
    tone: 'blue-strong',
    terminal: false
  },
  {
    id: 'Negotiation',
    short: 'LOI / Terms',
    desc: 'LOIs, term sheets, or pricing under discussion. Shortlisted counterparty being selected.',
    tone: 'blue-strong',
    terminal: false
  },
  {
    id: 'Closing',
    short: 'Closing',
    desc: 'Definitive documentation, regulatory approvals, signing and funds flow.',
    tone: 'blue-strong',
    terminal: false
  },
  {
    id: 'Closed',
    short: 'Closed',
    desc: 'Mandate successfully completed. Success fee recognised.',
    tone: 'success',
    terminal: true
  },
  {
    id: 'On Hold',
    short: 'Paused',
    desc: 'Paused awaiting a specific trigger (financials, market window, counterparty decision).',
    tone: 'warning',
    terminal: true
  },
  {
    id: 'Lost',
    short: 'Lost',
    desc: 'Dead. Counterparty walked, mandate withdrawn, or lost in a competitive process.',
    tone: 'danger',
    terminal: true
  }
]

export const ACTIVE_STAGES   = STAGES.filter(s => !s.terminal)
export const TERMINAL_STAGES = STAGES.filter(s =>  s.terminal)
export const STAGE_IDS       = STAGES.map(s => s.id)

export function stageMeta(id) {
  return STAGES.find(s => s.id === id) || STAGES[0]
}

export function stageToneClasses(id) {
  const tone = stageMeta(id).tone
  switch (tone) {
    case 'slate':       return 'bg-white/5 text-valence-muted border-valence-border'
    case 'blue':        return 'bg-valence-blue/10 text-valence-blue border-valence-blue/30'
    case 'blue-strong': return 'bg-valence-blue-soft text-white border-valence-blue/50'
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
