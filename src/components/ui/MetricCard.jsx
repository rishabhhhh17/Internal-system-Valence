// Single big-number metric card used at the top of feature pages.
// Reads like a brief, not a dashboard widget — tight type, no chartjunk.

export default function MetricCard({ label, value, sub = null, tone = 'default', icon: Icon = null }) {
  const valueTone =
    tone === 'success' ? 'text-valence-success' :
    tone === 'warning' ? 'text-valence-warning' :
    tone === 'danger'  ? 'text-valence-danger'  :
    tone === 'blue'    ? 'text-valence-blue'    :
                         'text-valence-text'
  return (
    <div className="rounded-xl border border-valence-border bg-valence-elevated/60 p-4">
      <div className="flex items-center gap-1.5 mb-2">
        {Icon && <Icon className="h-3 w-3 text-valence-subtle" />}
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-valence-muted">{label}</p>
      </div>
      <p className={`text-2xl font-bold tabular-nums leading-none ${valueTone}`}>{value}</p>
      {sub && <p className="mt-1.5 text-[11px] text-valence-subtle leading-snug">{sub}</p>}
    </div>
  )
}
