import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { DEMO_PEOPLE } from '../lib/people.js'
import { DEMO_FUNDS } from '../lib/funds.js'
import { caretCoordinates } from '../lib/caretCoordinates.js'

// Obsidian-style wikilink autocomplete on a plain <textarea>.
// Type `[[` to open the picker, search across People / Funds / Mandates,
// pick → splices `[[type:uuid|Display Name]]` at the cursor.
// The renderer (renderMentionToken in lib/kb.js) replaces tokens with live
// names + click-throughs in display contexts. The picker is the only thing
// users touch directly.
//
// The picker is positioned at the caret itself — not at the textarea's
// bottom edge — using a hidden mirror div to measure where the `[[` token
// sits inside the rendered text. Means it pops up right under the line
// you're typing on, the way Notion / Obsidian / Linear do it.
//
// Drop-in replacement for any controlled <textarea>:
//   <WikilinkTextarea value={x} onChange={setX} className="vl-input min-h-[100px]" />
export default function WikilinkTextarea({
  value,
  onChange,
  className = 'vl-input min-h-[100px] resize-y',
  placeholder,
  rows,
  ...rest
}) {
  const taRef = useRef(null)
  const [linkOpen, setLinkOpen]     = useState(false)
  const [linkQuery, setLinkQuery]   = useState('')
  const [linkAnchor, setLinkAnchor] = useState(0)
  const [activeIdx, setActiveIdx]   = useState(0)
  const [pickerPos, setPickerPos]   = useState({ top: 0, left: 0, flipUp: false })
  const [entities, setEntities]     = useState({ people: [], funds: [], mandates: [], notes: [] })

  // One-shot universe pull — same set the KB editor uses.
  // Demo mode (no Supabase): fall back to the bundled demo people + funds so
  // the picker is testable. Mandates + notes aren't in shared demo arrays.
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setEntities({
        people:   DEMO_PEOPLE.map(p => ({ id: p.id, full_name: p.full_name, company: p.company })),
        funds:    DEMO_FUNDS.map(f  => ({ id: f.id, name: f.name,           fund_type: f.fund_type })),
        mandates: [],
        notes:    []
      })
      return
    }
    let cancelled = false
    ;(async () => {
      const [p, f, d, n] = await Promise.all([
        supabase.from('people').select('id, full_name, company').limit(500),
        supabase.from('funds').select('id, name, fund_type').limit(500),
        supabase.from('deals').select('id, client_name, stage').limit(500),
        supabase.from('kb_notes').select('id, title').order('updated_at', { ascending: false }).limit(500)
      ])
      if (!cancelled) {
        setEntities({
          people:   p.data || [],
          funds:    f.data || [],
          mandates: d.data || [],
          notes:    n.data || []
        })
      }
    })()
    return () => { cancelled = true }
  }, [])

  function handleChange(e) {
    const next = e.target.value
    onChange?.(next)
    refreshPicker(next, e.target.selectionStart)
  }

  // Look back from the cursor for an unclosed `[[`. Anchor the picker at the
  // measured caret position so it appears right under the line being typed,
  // not stranded at the textarea's bottom edge.
  function refreshPicker(text, cursor) {
    const before = text.slice(0, cursor)
    const lastOpen  = before.lastIndexOf('[[')
    const lastClose = before.lastIndexOf(']]')
    if (lastOpen > lastClose) {
      const inner = before.slice(lastOpen + 2)
      if (!inner.includes('\n')) {
        const ta = taRef.current
        const coords = ta ? caretCoordinates(ta, lastOpen) : { top: 0, left: 0, lineHeight: 18 }
        // Position the picker on the line just below the [[ caret. Account
        // for the textarea's scroll offset so the picker tracks the visible
        // caret, not the buffer position.
        const top  = coords.top  + coords.lineHeight - (ta?.scrollTop || 0) + 4
        const left = coords.left - (ta?.scrollLeft || 0)
        // If the picker would extend below the viewport, flip it above the
        // line. ~280px is the picker's max height; small slack for breathing.
        const taRect = ta?.getBoundingClientRect()
        const absBottom = taRect ? taRect.top + top + 280 : 0
        const flipUp = taRect ? absBottom > window.innerHeight - 12 : false
        setPickerPos({ top: flipUp ? coords.top - (ta?.scrollTop || 0) - 8 : top, left, flipUp })
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
    const q = linkQuery.trim().toLowerCase()
    const out = []
    if (!q) {
      out.push(...entities.people.slice(0, 3).map(p => ({ type: 'person',  id: p.id, label: p.full_name,   sub: p.company })))
      out.push(...entities.funds.slice(0, 3).map(f  => ({ type: 'fund',    id: f.id, label: f.name,        sub: f.fund_type })))
      out.push(...entities.mandates.slice(0, 3).map(m => ({ type: 'mandate', id: m.id, label: m.client_name, sub: m.stage })))
      out.push(...(entities.notes || []).slice(0, 3).map(n => ({ type: 'note', id: n.id, label: n.title || 'Untitled note', sub: 'note' })))
      return out.slice(0, 12)
    }
    for (const p of entities.people)   if (p.full_name?.toLowerCase().includes(q))   out.push({ type: 'person',  id: p.id, label: p.full_name,   sub: p.company })
    for (const f of entities.funds)    if (f.name?.toLowerCase().includes(q))        out.push({ type: 'fund',    id: f.id, label: f.name,        sub: f.fund_type })
    for (const m of entities.mandates) if (m.client_name?.toLowerCase().includes(q)) out.push({ type: 'mandate', id: m.id, label: m.client_name, sub: m.stage })
    for (const n of (entities.notes || [])) if (n.title?.toLowerCase().includes(q))  out.push({ type: 'note',    id: n.id, label: n.title,        sub: 'note' })
    return out.slice(0, 12)
  }, [linkOpen, linkQuery, entities])

  function pick(s) {
    const ta = taRef.current
    if (!ta) return
    const before = (value || '').slice(0, linkAnchor)
    const after  = (value || '').slice(ta.selectionStart)
    const token  = `[[${s.type}:${s.id}|${s.label}]]`
    const next   = before + token + after
    onChange?.(next)
    setLinkOpen(false)
    requestAnimationFrame(() => {
      ta.focus()
      const pos = (before + token).length
      ta.setSelectionRange(pos, pos)
    })
  }

  function handleKeyDown(e) {
    if (!linkOpen || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => (i - 1 + suggestions.length) % suggestions.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      pick(suggestions[activeIdx])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setLinkOpen(false)
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={taRef}
        value={value || ''}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className={className}
        {...rest}
      />
      {linkOpen && suggestions.length > 0 && (
        <ul
          style={{ top: pickerPos.top, left: pickerPos.left, transform: pickerPos.flipUp ? 'translateY(-100%)' : 'none' }}
          className="absolute z-30 w-72 max-h-64 overflow-y-auto rounded-lg border border-valence-border bg-white shadow-valence"
        >
          {suggestions.map((s, i) => (
            <li key={`${s.type}-${s.id}`}>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => pick(s)}
                className={`block w-full px-3 py-2 text-left ${i === activeIdx ? 'bg-valence-blue-soft' : 'hover:bg-valence-blue-soft'}`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-valence-blue">{s.type}</p>
                <p className="text-sm font-semibold text-valence-text">{s.label}</p>
                {s.sub && <p className="text-[11px] text-valence-muted">{s.sub}</p>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {linkOpen && suggestions.length === 0 && (
        <div
          style={{ top: pickerPos.top, left: pickerPos.left, transform: pickerPos.flipUp ? 'translateY(-100%)' : 'none' }}
          className="absolute z-30 w-72 rounded-lg border border-valence-border bg-white shadow-valence px-3 py-2 text-xs text-valence-muted"
        >
          No people, funds, mandates, or notes match “{linkQuery}”.
        </div>
      )}
    </div>
  )
}
