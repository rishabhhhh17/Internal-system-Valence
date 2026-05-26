// Standard page header for the new feature pages. Eyebrow + H1 + sub
// + optional right-aligned action. Keeps every page using the same
// vertical rhythm so the app reads as one product, not a stack of
// disparate screens.

export default function SectionHeader({ eyebrow, title, sub = null, right = null, children = null }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="vl-eyebrow-ink">{eyebrow}</p>}
        <h1 className="mt-2 font-display text-feature font-bold text-valence-text leading-[1.05]">
          {title}
        </h1>
        {sub && <p className="mt-2 max-w-2xl text-sm text-valence-muted leading-relaxed">{sub}</p>}
        {children}
      </div>
      {right && <div className="shrink-0 flex items-center gap-2">{right}</div>}
    </div>
  )
}
