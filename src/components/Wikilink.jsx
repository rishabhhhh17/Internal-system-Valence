import { useEffect, useMemo, useRef, useState } from 'react'
import { Link as LinkIcon, UserCircle, Building2, Briefcase, FileText } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'

// ============================================================================
// Wikilink — Obsidian-style [[type:id|name]] tokens used across ValenceOS.
// Two pieces:
//   <WikilinkTextarea>     — textarea with autocomplete on `[[`
//   <WikilinkContent>      — read-only renderer (text + clickable chips)
// Both share the same regex + entity universe so what you write is what
// you read back, and renames in the source-of-truth (People / Funds /
// Mandates / Memos) reflect immediately in every memo that references them.
// ============================================================================

// Allowed entity types in a wikilink. Keep this in sync with the regex below
// and with the kb_mentions CHECK constraint in supabase/schema.sql.
const ENTITY_TYPES = ['person', 'fund', 'mandate', 'memo']
const WIKILINK_RE = /\[\[(person|fund|mandate|memo):([0-9a-f-]{36})(?:\|([^\]]+))?\]\]/gi

// Where each entity type opens to. Matches the routes registered in App.jsx.
const ROUTE_FOR = {
  person:  id => `/people?open=${id}`,
  fund:    id => `/funds?open=${id}`,
  mandate: id => `/deals?open=${id}`,
  memo:    id => `/knowledge/shared?open=${id}`
}

const ICON_FOR = {
  person:  UserCircle,
  fund:    Building2,
  mandate: Briefcase,
  memo:    FileText
}

// ============================================================================
// Hook — pulls the entity universe used by both the editor and the renderer.
// People + Funds + active Mandates + firm-shared Memos. Cached for the life
// of the component using it.
// ============================================================================
export function useWikilinkEntities() {
  const [entities, setEntities] = useState({ people: [], funds: [], mandates: [], memos: [] })
  useEffect(() => {
    if (!isSupabaseConfigured) return
    let active = true
    ;(async () => {
      const [p, f, d, m] = await Promise.all([
        supabase.from('people').select('id, full_name, company').limit(500),
        supabase.from('funds').select('id, name, fund_type').limit(500),
        supabase.from('deals').select('id, client_name, stage').limit(500),
        supabase.from('documents').select('id, title').limit(500)
      ])
      if (!active) return
      setEntities({
        people:   p.data || [],
        funds:    f.data || [],
        mandates: d.data || [],
        memos:    m.data || []
      })
    })()
    return () => { active = false }
  }, [])
  return entities
}

// Build a fast lookup map from entity rows so the renderer can resolve
// {type, id} → display name in O(1).
export function buildLookups(entities) {
  const lookups = { person: {}, fund: {}, mandate: {}, memo: {} }
  for (const p of entities.people   || []) lookups.person[p.id]  = p.full_name
  for (const f of entities.funds    || []) lookups.fund[f.id]    = f.name
  for (const m of entities.mandates || []) lookups.mandate[m.id] = m.client_name
  for (const x of entities.memos    || []) lookups.memo[x.id]    = x.title
  return lookups
}

// ============================================================================
// <WikilinkContent> — reads a string body and renders text with [[…]] tokens
// replaced by clickable chips. Backwards-compatible: any unresolvable token
// renders as a soft "person:abcd1234…" placeholder so the document never
// errors out if an entity has been deleted.
// ============================================================================
export function WikilinkContent({ body, entities, className = '' }) {
  const lookups = useMemo(() => buildLookups(entities || {}), [entities])

  const segments = useMemo(() => {
    if (!body) return []
    const out = []
    let i = 0
    let m
    const re = new RegExp(WIKILINK_RE)
    while ((m = re.exec(body)) !== null) {
      if (m.index > i) out.push({ type: 'text', text: body.slice(i, m.index) })
      out.push({
        type: 'link',
        entityType: m[1].toLowerCase(),
        entityId: m[2].toLowerCase(),
        fallback: m[3]
      })
      i = m.index + m[0].length
    }
    if (i < body.length) out.push({ type: 'text', text: body.slice(i) })
    return out
  }, [body])

  return (
    <div className={`whitespace-pre-wrap leading-relaxed text-valence-text ${className}`}>
      {segments.map((seg, idx) => {
        if (seg.type === 'text') return <span key={idx}>{seg.text}</span>
        const Icon = ICON_FOR[seg.entityType] || LinkIcon
        const name = lookups[seg.entityType]?.[seg.entityId] || seg.fallback || `${seg.entityType}:${seg.entityId.slice(0, 8)}…`
        const route = ROUTE_FOR[seg.entityType]?.(seg.entityId) || '#'
        return (
          <Link
            key={idx}
            to={route}
            className="inline-flex items-center gap-1 rounded-md border border-valence-blue/30 bg-valence-blue-soft px-1.5 py-0.5 text-[12px] font-medium text-valence-blue-deep hover:bg-valence-blue/15 transition no-underline"
            title={`${seg.entityType}: ${name}`}
          >
            <Icon className="h-3 w-3" />
            {name}
          </Link>
        )
      })}
    </div>
  )
}

// ============================================================================
// <WikilinkTextarea> — controlled textarea that opens an autocomplete popup
// when the user types `[[`. Selecting a suggestion inserts a properly-formed
// `[[type:id|display name]]` token at the caret.
// ============================================================================
export function WikilinkTextarea({ value, onChange, entities, placeholder, rows = 8, className = '', minHeight }) {
  const taRef = useRef(null)
  const [linkOpen, setLinkOpen]   = useState(false)
  const [linkQuery, setLinkQuery] = useState('')
  const [linkAnchor, setLinkAnchor] = useState(0)
  const [activeIdx, setActiveIdx] = useState(0)

  function handleChange(e) {
    const next = e.target.value
    onChange(next)

    const ta = e.target
    const cursor = ta.selectionStart
    const before = next.slice(0, cursor)
    const lastOpen = before.lastIndexOf('[[')
    const lastClose = before.lastIndexOf(']]')
    if (lastOpen > lastClose) {
      const inner = before.slice(lastOpen + 2)
      if (!inner.includes('\n')) {
        setLinkOpen(true)
        setLinkQuery(inner)
        setLinkAnchor(lastOpen)
        setActiveIdx(0)
        return
      }
    }
    setLinkOpen(false)
  }

  const suggestions = useMemo(() => {
    if (!linkOpen) return []
    const q = (linkQuery || '').trim().toLowerCase()
    const all = []
    for (const p of entities?.people   || []) all.push({ type: 'person',  id: p.id, label: p.full_name,   sub: p.company })
    for (const f of entities?.funds    || []) all.push({ type: 'fund',    id: f.id, label: f.name,        sub: f.fund_type })
    for (const m of entities?.mandates || []) all.push({ type: 'mandate', id: m.id, label: m.client_name, sub: m.stage })
    for (const x of entities?.memos    || []) all.push({ type: 'memo',    id: x.id, label: x.title,       sub: 'memo' })
    if (!q) return all.slice(0, 12)
    return all.filter(x => (x.label || '').toLowerCase().includes(q)).slice(0, 12)
  }, [linkOpen, linkQuery, entities])

  function pick(s) {
    const ta = taRef.current
    if (!ta) return
    const before = value.slice(0, linkAnchor)
    const after  = value.slice(ta.selectionStart)
    const token  = `[[${s.type}:${s.id}|${s.label}]]`
    const next   = before + token + after
    onChange(next)
    setLinkOpen(false)
    requestAnimationFrame(() => {
      ta.focus()
      const pos = (before + token).length
      ta.setSelectionRange(pos, pos)
    })
  }

  function handleKeyDown(e) {
    if (!linkOpen || suggestions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => (i + 1) % suggestions.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => (i - 1 + suggestions.length) % suggestions.length) }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(suggestions[activeIdx]) }
    else if (e.key === 'Escape') { e.preventDefault(); setLinkOpen(false) }
  }

  return (
    <div className="relative">
      <textarea
        ref={taRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className={`vl-input ${className}`}
        style={minHeight ? { minHeight } : undefined}
      />
      <p className="mt-1 text-[10px] text-valence-subtle">
        Type <span className="vl-kbd">[[</span> to link a person, fund, mandate, or memo.
      </p>
      {linkOpen && suggestions.length > 0 && (
        <div className="absolute left-3 right-3 z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-valence-border bg-white shadow-valence-lg">
          {suggestions.map((s, i) => {
            const Icon = ICON_FOR[s.type] || LinkIcon
            return (
              <button
                key={`${s.type}:${s.id}`}
                type="button"
                onClick={() => pick(s)}
                onMouseEnter={() => setActiveIdx(i)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm border-b border-valence-border/60 last:border-b-0 ${
                  i === activeIdx ? 'bg-valence-blue-soft' : 'hover:bg-valence-surface'
                }`}
              >
                <Icon className="h-3.5 w-3.5 text-valence-blue shrink-0" />
                <span className="flex-1 truncate">
                  <span className="font-semibold text-valence-text">{s.label}</span>
                  {s.sub && <span className="ml-1.5 text-[11px] text-valence-muted">{s.sub}</span>}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-valence-subtle shrink-0">{s.type}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
