import { Link } from 'react-router-dom'

// Display-side companion to WikilinkTextarea.
// Takes plain note text containing [[type:uuid|Display Name]] tokens and
// renders it with each token replaced by a CLICKABLE chip — clicking a
// chip opens the entity (person drawer / fund drawer / deal drawer / KB
// notes view) via URL deep-links.
//
// The underlying string in the database stays in the canonical
// [[type:id|name]] form; only the display swaps to chips.
//
// Usage:
//   <WikilinkText>{deal.notes}</WikilinkText>
//   <WikilinkText className="text-sm">{interaction.notes}</WikilinkText>

const TOKEN_RE = /\[\[(person|fund|mandate|note):([0-9a-f-]{36})(?:\|([^\]]+))?\]\]/gi

const TYPE_CLASS = {
  person:  'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100',
  fund:    'bg-violet-50 text-violet-800 border-violet-200 hover:bg-violet-100',
  mandate: 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100',
  note:    'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
}

// Where each entity type lives in the routing tree. Deep-link param `open`
// is the convention used by /deals; /people and /funds support it too
// (added in the same PR that ships clickable chips).
function hrefFor(entityType, entityId) {
  switch (entityType) {
    case 'person':  return `/people?open=${entityId}`
    case 'fund':    return `/funds?open=${entityId}`
    case 'mandate': return `/deals?open=${entityId}`
    case 'note':    return `/knowledge/shared?tab=mandates`  // no per-note deep link yet
    default:        return '/'
  }
}

export default function WikilinkText({ children, className = '' }) {
  const text = typeof children === 'string' ? children : ''
  if (!text) return null
  const segments = parseSegments(text)
  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.kind === 'token' ? (
          <Link
            key={i}
            to={hrefFor(seg.entityType, seg.entityId)}
            title={`Open ${seg.entityType}: ${seg.label}`}
            onClick={e => e.stopPropagation()}
            className={`inline-flex items-center rounded px-1 py-0 text-[11px] font-semibold border transition-colors ${TYPE_CLASS[seg.entityType] || TYPE_CLASS.person}`}
          >
            {seg.label}
          </Link>
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
      entityId:   m[2].toLowerCase(),
      label:      m[3] || `${m[1]}…`
    })
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < text.length) out.push({ kind: 'text', text: text.slice(lastIndex) })
  return out
}
