// =============================================================================
// counterpartyColors.js — single source of truth for the founder / investor /
// general visual scheme. Phase 26 ask from the partner call: glance-able
// time-allocation cue across Calendar, Interactions, and Team views.
// =============================================================================
// Three semantic colors. Tailwind classes — no hex codes in components —
// so the design tokens stay swappable.
//
//   founder  → emerald   (clients we're advising — the "growth" side)
//   investor → indigo    (funds / buyers — the "money" side)
//   general  → slate     (lawyers, networking, internal, anything else)
// =============================================================================

export const COUNTERPARTY_TYPES = ['founder', 'investor', 'general']

// Used for the left-rail accent on Interaction rows and Calendar event
// chips. 4px solid border in the type's color.
export function railClass(type) {
  switch (type) {
    case 'founder':  return 'border-l-[3px] border-l-emerald-500'
    case 'investor': return 'border-l-[3px] border-l-indigo-500'
    case 'general':  return 'border-l-[3px] border-l-slate-400'
    default:         return 'border-l-[3px] border-l-valence-border'
  }
}

// Small filled chip / pill. Used in card headers + filter UI.
export function chipClass(type) {
  switch (type) {
    case 'founder':  return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30'
    case 'investor': return 'bg-indigo-50  text-indigo-700  border-indigo-200  dark:bg-indigo-500/10  dark:text-indigo-300  dark:border-indigo-500/30'
    case 'general':  return 'bg-slate-100  text-slate-700   border-slate-200   dark:bg-slate-500/10   dark:text-slate-300   dark:border-slate-500/30'
    default:         return 'bg-valence-surface text-valence-muted border-valence-border'
  }
}

// Bar-fill colour for the per-member distribution bar on the Team page.
// Plain Tailwind utility so the segment widths can be inline-styled.
export function barFillClass(type) {
  switch (type) {
    case 'founder':  return 'bg-emerald-500'
    case 'investor': return 'bg-indigo-500'
    case 'general':  return 'bg-slate-400'
    default:         return 'bg-valence-border'
  }
}

// Display label. Kept lowercase so consumers can decide between Title Case
// (UI) and uppercase (chip eyebrow).
export function labelFor(type) {
  switch (type) {
    case 'founder':  return 'Founder'
    case 'investor': return 'Investor'
    case 'general':  return 'General'
    default:         return 'Unclassified'
  }
}

// Convenience for legends: returns an array of { type, label, dotClass } that
// the caller can iterate over to render a colour key.
export const COUNTERPARTY_LEGEND = COUNTERPARTY_TYPES.map(t => ({
  type:     t,
  label:    labelFor(t),
  dotClass: barFillClass(t)
}))
