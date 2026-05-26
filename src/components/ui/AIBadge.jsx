// Tiny "AI" chip we drop next to feature names that involve a Gemini
// call — visual cue that the user can expect the output to be model-
// generated, not deterministic.

import { Sparkles } from 'lucide-react'

export default function AIBadge({ label = 'AI', className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-valence-blue-soft text-valence-blue-deep px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] ${className}`}>
      <Sparkles className="h-2.5 w-2.5" />
      {label}
    </span>
  )
}
