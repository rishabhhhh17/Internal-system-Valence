// Drop-in status pill. One component for every "Done / In progress /
// Blocked" indicator across the new feature pages so the colour
// language stays consistent.
//
// Usage:
//   <StatusPill tone="success">Done</StatusPill>
//   <StatusPill tone="progress">In diligence</StatusPill>
//   <StatusPill tone="warning">Blocked</StatusPill>
//   <StatusPill tone="neutral">Not started</StatusPill>
//   <StatusPill tone="ink" subtle>Stretch fit</StatusPill>

import { Check, Loader2, AlertTriangle, Circle, X } from 'lucide-react'

const TONES = {
  success:  { cls: 'bg-valence-success/15 text-valence-success border-valence-success/30', icon: Check },
  progress: { cls: 'bg-valence-blue-soft text-valence-blue-deep border-valence-blue/30',   icon: Loader2 },
  warning:  { cls: 'bg-valence-warning/15 text-valence-warning border-valence-warning/30', icon: AlertTriangle },
  danger:   { cls: 'bg-valence-danger/15 text-valence-danger border-valence-danger/30',    icon: X },
  neutral:  { cls: 'bg-valence-faint text-valence-muted border-valence-border',            icon: Circle },
  ink:      { cls: 'bg-valence-ink text-white border-valence-ink',                         icon: null },
}

export default function StatusPill({ tone = 'neutral', children, icon = null, subtle = false, className = '' }) {
  const t = TONES[tone] || TONES.neutral
  const Icon = icon === null ? t.icon : icon
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border ${t.cls} ${subtle ? 'px-2 py-0' : 'px-2.5 py-0.5'} text-[10px] font-semibold uppercase tracking-[0.06em] ${className}`}>
      {Icon && <Icon className={`${tone === 'progress' ? 'animate-spin' : ''} h-3 w-3`} />}
      {children}
    </span>
  )
}
