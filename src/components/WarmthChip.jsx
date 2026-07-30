// WarmthChip — small status chip showing a person's relationship score.
// Hover (or tap-and-hold on touch) reveals reasoning bullets pulled from
// the scorer. Sized for inline placement next to a name or company.
//
// Tone mapping:
//   warm     → green
//   engaged  → blue
//   cool     → muted grey
//   cold     → amber
//   dormant  → subtle outline only
//
// The component is purely presentational. The score itself is computed
// in src/lib/relationships.js — pass a `score` object from scorePerson
// or scoreAllPeople.

const TONE_CLASS = {
  success: 'bg-valence-success/10 text-valence-success border-valence-success/30',
  blue:    'bg-valence-blue-soft text-valence-blue-deep border-valence-blue/30',
  muted:   'bg-valence-surface text-valence-muted border-valence-border',
  warning: 'bg-valence-warning/10 text-valence-warning border-valence-warning/30',
  subtle:  'bg-transparent text-valence-subtle border-valence-border'
}

export default function WarmthChip({ score, compact = false, showScore = false }) {
  if (!score) return null
  const { warmth, score: n, reasons } = score
  const tone = TONE_CLASS[warmth.tone] || TONE_CLASS.muted

  const tooltip = (reasons && reasons.length)
    ? reasons.join(' · ')
    : 'No data yet'

  return (
    <span
      title={tooltip}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none tracking-[0.04em] ${tone}`}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {compact ? warmth.label.slice(0, 1) : warmth.label}
      {showScore && warmth.key !== 'dormant' && (
        <span className="opacity-60 font-normal">· {n}</span>
      )}
    </span>
  )
}
