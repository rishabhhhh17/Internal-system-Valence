import { useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { DEMO_PEOPLE } from '../lib/people.js'
import { DEMO_FUNDS } from '../lib/funds.js'

// Obsidian-style wikilink input that renders pills INLINE while editing —
// not raw [[type:uuid|Name]] tokens. Backed by a contentEditable div so
// pills can sit next to plain text in the same line, the way Notion /
// Linear / Slack inputs do.
//
// External API is identical to the old <textarea>-based version:
//   <WikilinkTextarea value={x} onChange={setX} className="vl-input ..." />
//
// Internally:
//   - `value` (canonical string with [[type:uuid|name]] tokens) is rendered
//     to HTML: tokens become non-editable <span class="vl-pill"> chips with
//     data-* attrs, everything else is plain text nodes.
//   - User typing fires onInput; we serialize the DOM back to canonical
//     form and call onChange. Cursor position is preserved across the
//     round-trip via a char-offset save/restore.
//   - Typing `[[` opens the picker anchored at the caret. Picking inserts
//     a pill <span> and advances the cursor past it.
//   - Backspace at the right edge of a pill removes the whole pill via the
//     browser's native contenteditable=false handling.

// Token regex matches the canonical form. Wider than lib/kb.js's UUID-only
// regex on purpose — local/demo ids look like "p1" / "f2", real ids are UUIDs,
// and both need to round-trip through the editor without losing pill-ness.
const TOKEN_RE = /\[\[(person|fund|mandate|note):([^:|\]\s]+)(?:\|([^\]]+))?\]\]/gi

// Per-type pill colour. Same palette as WikilinkText for visual consistency.
const PILL_CLASS = {
  person:  'bg-blue-50 text-blue-800 border-blue-200',
  fund:    'bg-violet-50 text-violet-800 border-violet-200',
  mandate: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  note:    'bg-amber-50 text-amber-800 border-amber-200'
}

const PILL_CLASSNAME = 'vl-pill inline-flex items-center rounded px-1 py-0 text-[11px] font-semibold border align-baseline mx-px select-none'

function escapeHTML(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
function escapeAttr(s) {
  return escapeHTML(s).replace(/"/g, '&quot;')
}

// Build the HTML representation of a value. Tokens become <span> pills with
// data-* attrs encoding the canonical form so we can serialise back without
// loss. Text between tokens stays as text — newlines preserved (the wrapper
// has white-space:pre-wrap so they render).
function valueToHTML(value) {
  if (!value) return ''
  let out = ''
  let last = 0
  TOKEN_RE.lastIndex = 0
  let m
  while ((m = TOKEN_RE.exec(value)) !== null) {
    if (m.index > last) out += escapeHTML(value.slice(last, m.index))
    const type    = m[1].toLowerCase()
    const id      = m[2].toLowerCase()
    const display = m[3] || `${type}…`
    const cls = `${PILL_CLASSNAME} ${PILL_CLASS[type] || PILL_CLASS.person}`
    out += `<span class="${cls}" contenteditable="false" data-token="1" data-type="${type}" data-id="${id}" data-display="${escapeAttr(display)}">${escapeHTML(display)}</span>`
    last = m.index + m[0].length
  }
  if (last < value.length) out += escapeHTML(value.slice(last))
  return out
}

// Walk the contentEditable DOM and serialise back to canonical form. Text
// nodes pass through verbatim; pill spans become `[[type:id|display]]`.
function serialize(root) {
  let out = ''
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.nodeValue
      return
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.dataset && node.dataset.token === '1') {
        const t = node.dataset.type
        const i = node.dataset.id
        const d = node.dataset.display || t
        out += `[[${t}:${i}|${d}]]`
        return
      }
      const tag = node.tagName
      if (tag === 'BR') { out += '\n'; return }
      const isBlock = (tag === 'DIV' || tag === 'P')
      const before = out
      for (const child of node.childNodes) walk(child)
      if (isBlock && out !== before && !out.endsWith('\n')) out += '\n'
    }
  }
  for (const child of root.childNodes) walk(child)
  return out
}

// Save the caret as a flat character offset into the serialised value, so
// it survives a full innerHTML re-render after we insert/edit pills.
function getCaretOffset(root) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (!root.contains(range.endContainer)) return null

  let offset = 0
  let found = false
  const visit = (node) => {
    if (found) return
    if (node === range.endContainer) {
      if (node.nodeType === Node.TEXT_NODE) {
        offset += range.endOffset
        found = true
        return
      }
      // Element container: endOffset is the child index up to which we count.
      for (let i = 0; i < range.endOffset; i++) {
        visit(node.childNodes[i])
        if (found) return
      }
      found = true
      return
    }
    if (node.nodeType === Node.TEXT_NODE) {
      offset += node.nodeValue.length
      return
    }
    if (node.dataset && node.dataset.token === '1') {
      const d = node.dataset.display || node.dataset.type || ''
      const t = node.dataset.type || ''
      const i = node.dataset.id || ''
      offset += `[[${t}:${i}|${d}]]`.length
      return
    }
    if (node.tagName === 'BR') { offset += 1; return }
    for (const child of node.childNodes) {
      visit(child)
      if (found) return
    }
  }

  for (const child of root.childNodes) {
    visit(child)
    if (found) break
  }
  return offset
}

function setCaretFromOffset(root, charOffset) {
  if (charOffset == null) return
  let remaining = charOffset
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()

  const tryPlace = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.nodeValue.length
      if (remaining <= len) {
        range.setStart(node, remaining)
        range.collapse(true)
        return true
      }
      remaining -= len
      return false
    }
    if (node.dataset && node.dataset.token === '1') {
      const d = node.dataset.display || node.dataset.type || ''
      const t = node.dataset.type || ''
      const i = node.dataset.id || ''
      const len = `[[${t}:${i}|${d}]]`.length
      if (remaining <= len) {
        // Caret would fall inside a pill — place right after it instead.
        const parent = node.parentNode
        const index = Array.prototype.indexOf.call(parent.childNodes, node)
        range.setStart(parent, index + 1)
        range.collapse(true)
        return true
      }
      remaining -= len
      return false
    }
    if (node.tagName === 'BR') {
      if (remaining <= 1) {
        const parent = node.parentNode
        const index = Array.prototype.indexOf.call(parent.childNodes, node)
        range.setStart(parent, index + 1)
        range.collapse(true)
        return true
      }
      remaining -= 1
      return false
    }
    for (const child of node.childNodes) {
      if (tryPlace(child)) return true
    }
    return false
  }

  for (const child of root.childNodes) {
    if (tryPlace(child)) {
      sel.removeAllRanges()
      sel.addRange(range)
      return
    }
  }
  // Fallback: caret at end
  range.selectNodeContents(root)
  range.collapse(false)
  sel.removeAllRanges()
  sel.addRange(range)
}

// Locate the `[[query` immediately before the caret. Returns null when the
// caret isn't inside an unclosed [[… zone, otherwise the start offset, query.
function findOpenLink(root) {
  const offset = getCaretOffset(root)
  if (offset == null) return null
  const value = serialize(root)
  const before = value.slice(0, offset)
  const lastOpen  = before.lastIndexOf('[[')
  const lastClose = before.lastIndexOf(']]')
  if (lastOpen > lastClose) {
    const inner = before.slice(lastOpen + 2)
    if (!inner.includes('\n')) {
      return { start: lastOpen, query: inner, caretOffset: offset, value }
    }
  }
  return null
}

export default function WikilinkTextarea({
  value,
  onChange,
  className = 'vl-input min-h-[100px] resize-y',
  placeholder,
  autoFocus,
  ...rest
}) {
  const editorRef = useRef(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const [pickerStart, setPickerStart] = useState(0)
  const [activeIdx, setActiveIdx] = useState(0)
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0, flipUp: false })
  const [entities, setEntities] = useState({ people: [], funds: [], mandates: [], notes: [] })
  const [isFocused, setIsFocused] = useState(false)

  // One-shot universe pull (Supabase, or demo data when not configured).
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

  // Mount-time: seed innerHTML from initial value.
  useLayoutEffect(() => {
    const el = editorRef.current
    if (!el) return
    el.innerHTML = valueToHTML(value || '')
    if (autoFocus) el.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync incoming `value` prop INTO the DOM when it changes from outside
  // (parent reset, autosave reload). Skip when current serialised content
  // already matches to avoid clobbering the user mid-edit.
  useLayoutEffect(() => {
    const el = editorRef.current
    if (!el) return
    const current = serialize(el)
    if (current === (value || '')) return
    const offset = document.activeElement === el ? getCaretOffset(el) : null
    el.innerHTML = valueToHTML(value || '')
    if (offset != null) setCaretFromOffset(el, offset)
  }, [value])

  function handleInput() {
    const el = editorRef.current
    if (!el) return
    const next = serialize(el)
    onChange?.(next)

    const open = findOpenLink(el)
    if (open) {
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0).cloneRange()
        range.collapse(true)
        const rect = range.getBoundingClientRect()
        const containerRect = el.getBoundingClientRect()
        const top  = rect.bottom - containerRect.top + 4
        const left = rect.left   - containerRect.left
        const flipUp = (rect.bottom + 280) > (window.innerHeight - 12)
        setPickerPos({ top: flipUp ? rect.top - containerRect.top - 8 : top, left, flipUp })
      }
      setPickerOpen(true)
      setPickerQuery(open.query)
      setPickerStart(open.start)
      setActiveIdx(0)
    } else {
      setPickerOpen(false)
    }
  }

  function currentSuggestions(q) {
    const out = []
    if (!q) {
      entities.people.slice(0, 3).forEach(p => out.push({ type: 'person',  id: p.id, label: p.full_name,                  sub: p.company }))
      entities.funds.slice(0, 3).forEach(f  => out.push({ type: 'fund',    id: f.id, label: f.name,                       sub: f.fund_type }))
      entities.mandates.slice(0, 3).forEach(m => out.push({ type: 'mandate', id: m.id, label: m.client_name,              sub: m.stage }))
      entities.notes.slice(0, 3).forEach(n  => out.push({ type: 'note',    id: n.id, label: n.title || 'Untitled note',  sub: 'note' }))
    } else {
      for (const p of entities.people)   if (p.full_name?.toLowerCase().includes(q))    out.push({ type: 'person',  id: p.id, label: p.full_name,    sub: p.company })
      for (const f of entities.funds)    if (f.name?.toLowerCase().includes(q))         out.push({ type: 'fund',    id: f.id, label: f.name,         sub: f.fund_type })
      for (const m of entities.mandates) if (m.client_name?.toLowerCase().includes(q))  out.push({ type: 'mandate', id: m.id, label: m.client_name, sub: m.stage })
      for (const n of entities.notes)    if (n.title?.toLowerCase().includes(q))        out.push({ type: 'note',    id: n.id, label: n.title,        sub: 'note' })
    }
    return out.slice(0, 12)
  }

  const suggestions = useMemo(() => {
    if (!pickerOpen) return []
    return currentSuggestions((pickerQuery || '').trim().toLowerCase())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerOpen, pickerQuery, entities])

  function pick(s) {
    const el = editorRef.current
    if (!el) return
    const current = serialize(el)
    const caret = getCaretOffset(el) ?? current.length
    const before = current.slice(0, pickerStart)
    const after  = current.slice(caret)
    const token  = `[[${s.type}:${s.id}|${s.label}]] `
    const next   = before + token + after
    onChange?.(next)
    setPickerOpen(false)
    // Re-render HTML for the new value and position caret right after the token.
    requestAnimationFrame(() => {
      const root = editorRef.current
      if (!root) return
      root.innerHTML = valueToHTML(next)
      setCaretFromOffset(root, (before + token).length)
      root.focus()
    })
  }

  function handleKeyDown(e) {
    // Keep Enter inserting a plain newline; contenteditable's default is to
    // wrap subsequent input in <div> blocks which trip our serializer.
    if (e.key === 'Enter') {
      e.preventDefault()
      document.execCommand('insertText', false, '\n')
      return
    }

    if (!pickerOpen) return
    if (suggestions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => (i + 1) % suggestions.length); return }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => (i - 1 + suggestions.length) % suggestions.length); return }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      pick(suggestions[activeIdx])
      return
    }
    if (e.key === 'Escape')    { e.preventDefault(); setPickerOpen(false); return }
  }

  const isEmpty = !(value && value.length > 0)

  return (
    <div className="relative">
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        spellCheck
        className={`${className} whitespace-pre-wrap break-words outline-none`}
        {...rest}
      />
      {isEmpty && !isFocused && placeholder && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-3 top-2.5 text-sm text-valence-subtle"
        >
          {placeholder}
        </span>
      )}

      {pickerOpen && suggestions.length > 0 && (
        <ul
          style={{ top: pickerPos.top, left: pickerPos.left, transform: pickerPos.flipUp ? 'translateY(-100%)' : 'none' }}
          className="absolute z-30 w-72 max-h-64 overflow-y-auto rounded-lg border border-valence-border bg-valence-elevated shadow-valence"
        >
          {suggestions.map((s, i) => (
            <li key={`${s.type}-${s.id}`}>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => pick(s)}
                className={`block w-full px-3 py-2 text-left ${i === activeIdx ? 'bg-valence-blue-soft' : 'hover:bg-valence-blue-soft'}`}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-valence-blue">{s.type}</p>
                <p className="text-sm font-semibold text-valence-text">{s.label}</p>
                {s.sub && <p className="text-[11px] text-valence-muted">{s.sub}</p>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {pickerOpen && suggestions.length === 0 && (
        <div
          style={{ top: pickerPos.top, left: pickerPos.left, transform: pickerPos.flipUp ? 'translateY(-100%)' : 'none' }}
          className="absolute z-30 w-72 rounded-lg border border-valence-border bg-valence-elevated shadow-valence px-3 py-2 text-xs text-valence-muted"
        >
          No people, funds, mandates, or notes match “{pickerQuery}”.
        </div>
      )}
    </div>
  )
}
