// Display-side companion to WikilinkTextarea.
// Takes plain note text containing [[type:uuid|Display Name]] tokens and
// renders it with each token replaced by a chip showing just the display
// name. Non-destructive — the underlying string in the database stays in
// the canonical [[type:id|name]] form so the input editor still works.
//
// Usage:
//   <WikilinkText>{deal.notes}</WikilinkText>
//   <WikilinkText className="text-sm">{interaction.notes}</WikilinkText>

const TOKEN_RE = /\[\[(person|fund|mandate):[0-9a-f-]{36}(?:\|([^\]]+))?\]\]/gi

const TYPE_CLASS = {
  person:  'bg-blue-50 text-blue-800 border-blue-200',
  fund:    'bg-violet-50 text-violet-800 border-violet-200',
  mandate: 'bg-emerald-50 text-emerald-800 border-emerald-200'
}

export default function WikilinkText({ children, className = '' }) {
  const text = typeof children === 'string' ? children : ''
  if (!text) return null
  const segments = parseSegments(text)
  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.kind === 'token' ? (
          <span
            key={i}
            className={`inline-flex items-center rounded px-1 py-0 text-[11px] font-medium border ${TYPE_CLASS[seg.entityType] || TYPE_CLASS.person}`}
            title={`${seg.entityType}`}
          >
            {seg.label}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </span>
  )
}

function parseSegments(text) {
  const out = []
  let lastIndex = 0
  let m
  TOKEN_RE.lastIndex = 0
  while ((m = TOKEN_RE.exec(text)) !== null) {
    if (m.index > lastIndex) out.push({ kind: 'text', text: text.slice(lastIndex, m.index) })
    out.push({
      kind: 'token',
      entityType: m[1].toLowerCase(),
      label: m[2] || `${m[1]}…`
    })
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < text.length) out.push({ kind: 'text', text: text.slice(lastIndex) })
  return out
}
