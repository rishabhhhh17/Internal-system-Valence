// RelationshipChip — the single canonical chip for strong / warm / cool /
// cold buckets. Used in profile pages, the deal drawer's Best Intro
// Paths, the Network breakdown, and anywhere else a relationship state
// is shown.
//
// Tooltip on hover shows interaction count + last contact date in
// human-readable form. No numeric scores ever — spec rule.

const TONE = {
  strong: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/40 dark:text-emerald-300',
  warm:   'bg-amber-500/15  text-amber-700  border-amber-500/40  dark:text-amber-300',
  cool:   'bg-slate-400/20  text-slate-600  border-slate-400/40  dark:text-slate-300',
  cold:   'bg-slate-300/30  text-slate-500  border-slate-300/40  dark:text-slate-400'
}
const LABEL = { strong: 'Strong', warm: 'Warm', cool: 'Cool', cold: 'Cold' }

export default function RelationshipChip({ bucket, interactionCount, lastInteractionAt, compact = false }) {
  if (!bucket) return null
  const key = String(bucket).toLowerCase()
  const tone = TONE[key] || TONE.cold

  const tooltip = [
    LABEL[key] || bucket,
    interactionCount != null ? `${interactionCount} interaction${interactionCount === 1 ? '' : 's'}` : null,
    lastInteractionAt ? `Last contact ${humanDate(lastInteractionAt)}` : null
  ].filter(Boolean).join(' · ')

  return (
    <span
      title={tooltip}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none tracking-[0.04em] ${tone}`}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {compact ? (LABEL[key] || bucket).charAt(0) : (LABEL[key] || bucket)}
    </span>
  )
}

// Relative for recent dates, absolute for old. Matches the spec.
export function humanDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (days <= 0)   return 'today'
  if (days === 1)  return 'yesterday'
  if (days < 7)    return `${days} days ago`
  if (days < 14)   return 'last week'
  if (days < 30)   return `${Math.floor(days / 7)} weeks ago`
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
