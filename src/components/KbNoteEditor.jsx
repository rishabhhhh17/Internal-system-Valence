import { useEffect, useMemo, useRef, useState } from 'react'
import { Bold, Italic, List, Link2, Loader2, Check, AtSign, Hash } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { parseTags, syncMentions, renderMentionToken } from '../lib/kb.js'
import { useToast } from './Toast.jsx'

// Note editor — title + textarea body + small toolbar.
// Body uses a minimal markdown-ish convention:
//   **bold**          /  *italic*
//   - line            (bulleted list)
//   [text](url)       (link)
//   [[type:id|name]]  (global wikilink — autocompletes from People / Funds / Mandates)
//   #tag              (folder-local tag, harvested into kb_notes.tags)
//
// We deliberately do not ship a markdown live preview. The textarea is the
// editor and the source. A read-only renderer (KbNoteView) shows the same
// body with tokens swapped for live entity names + click-through links.

export default function KbNoteEditor({ note, folder, onSaved }) {
  const toast = useToast()
  const [title, setTitle]     = useState('')
  const [body,  setBody]      = useState('')
  const [saving, setSaving]   = useState(false)
  const [savedAt, setSavedAt] = useState(0)

  // Wikilink autocomplete state
  const textareaRef = useRef(null)
  const [linkOpen, setLinkOpen]     = useState(false)
  const [linkQuery, setLinkQuery]   = useState('')
  const [linkAnchor, setLinkAnchor] = useState(0)
  const [entities, setEntities]     = useState({ people: [], funds: [], mandates: [] })

  // Reset form when the note prop changes.
  useEffect(() => {
    setTitle(note?.title || '')
    setBody(note?.body  || '')
    setSavedAt(0)
  }, [note?.id])

  // Pull entity universe for the [[autocomplete. People + Funds + active
  // Mandates only — terminal-stage deals aren't useful suggestions.
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setEntities({ people: [], funds: [], mandates: [] })
      return
    }
    ;(async () => {
      const [p, f, d] = await Promise.all([
        supabase.from('people').select('id, full_name, company').limit(500),
        supabase.from('funds').select('id, name, fund_type').limit(500),
        supabase.from('deals').select('id, client_name, stage').limit(500)
      ])
      setEntities({ people: p.data || [], funds: f.data || [], mandates: d.data || [] })
    })()
  }, [])

  // Debounced auto-save. 700 ms of idle and we save.
  useEffect(() => {
    if (!note || saving) return
    if (title === note.title && body === note.body) return
    const t = setTimeout(() => save(), 700)
    return () => clearTimeout(t)
  }, [title, body])

  async function save() {
    if (!note || saving) return
    if (!title.trim()) return
    setSaving(true)
    try {
      const tags = parseTags(body)
      if (!isSupabaseConfigured) {
        // Demo mode: just bubble up the new state via onSaved.
        onSaved?.({ ...note, title, body, tags })
        setSavedAt(Date.now())
        return
      }
      const { error } = await supabase.from('kb_notes').update({
        title: title.trim(),
        body,
        tags,
        updated_at: new Date().toISOString()
      }).eq('id', note.id)
      if (error) throw error
      // Sync wikilink mentions in the background — failures don't block save.
      try { await syncMentions(supabase, note.id, body) } catch (e) { console.warn('mentions sync failed', e) }
      onSaved?.({ ...note, title, body, tags })
      setSavedAt(Date.now())
    } catch (err) {
      toast.error(err?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // Wraps the current selection with the given prefix/suffix (e.g. ** for bold).
  function wrap(prefix, suffix = prefix) {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end   = ta.selectionEnd
    const next  = body.slice(0, start) + prefix + body.slice(start, end) + suffix + body.slice(end)
    setBody(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(start + prefix.length, end + prefix.length)
    })
  }

  function insertBullet() {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const before = body.slice(0, start)
    const lineStart = before.lastIndexOf('\n') + 1
    const next = body.slice(0, lineStart) + '- ' + body.slice(lineStart)
    setBody(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(start + 2, start + 2)
    })
  }

  // Listen for [[ to trigger autocomplete and # for tag hint surfaces.
  function onBodyChange(e) {
    const value = e.target.value
    setBody(value)

    const ta = e.target
    const cursor = ta.selectionStart
    // Look back for an unclosed [[ in the current line.
    const before = value.slice(0, cursor)
    const lastOpen = before.lastIndexOf('[[')
    const lastClose = before.lastIndexOf(']]')
    if (lastOpen > lastClose) {
      const inner = before.slice(lastOpen + 2)
      // No newline means we're still inside the link.
      if (!inner.includes('\n')) {
        setLinkOpen(true)
        setLinkQuery(inner)
        setLinkAnchor(lastOpen)
        return
      }
    }
    setLinkOpen(false)
  }

  // Filter entities by the typed [[query]]. Cap at 8 per kind.
  const linkSuggestions = useMemo(() => {
    const q = linkQuery.trim().toLowerCase()
    if (!linkOpen) return []
    const out = []
    if (!q) {
      // Show recent entities: top 4 of each kind, prefixed with their type label.
      out.push(...entities.people.slice(0, 4).map(p => ({ type: 'person',  id: p.id, label: p.full_name, sub: p.company })))
      out.push(...entities.funds.slice(0, 4).map(f  => ({ type: 'fund',    id: f.id, label: f.name,      sub: f.fund_type })))
      out.push(...entities.mandates.slice(0, 4).map(m => ({ type: 'mandate', id: m.id, label: m.client_name, sub: m.stage })))
      return out.slice(0, 12)
    }
    for (const p of entities.people)   if (p.full_name?.toLowerCase().includes(q))   out.push({ type: 'person',  id: p.id, label: p.full_name, sub: p.company })
    for (const f of entities.funds)    if (f.name?.toLowerCase().includes(q))        out.push({ type: 'fund',    id: f.id, label: f.name,      sub: f.fund_type })
    for (const m of entities.mandates) if (m.client_name?.toLowerCase().includes(q)) out.push({ type: 'mandate', id: m.id, label: m.client_name, sub: m.stage })
    return out.slice(0, 12)
  }, [linkOpen, linkQuery, entities])

  // Pick a suggestion → splice [[type:id|label]] into the body where the [[ started.
  function pickLink(s) {
    const ta = textareaRef.current
    if (!ta) return
    const before = body.slice(0, linkAnchor)
    const after  = body.slice(ta.selectionStart)
    const token  = `[[${s.type}:${s.id}|${s.label}]]`
    const next   = before + token + after
    setBody(next)
    setLinkOpen(false)
    requestAnimationFrame(() => {
      ta.focus()
      const pos = (before + token).length
      ta.setSelectionRange(pos, pos)
    })
  }

  if (!note) return (
    <div className="rounded-lg border border-dashed border-valence-border bg-valence-surface px-5 py-12 text-center text-sm text-valence-muted">
      Select a note to start writing — or use the "+ Note" button to create one in this folder.
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Untitled note"
          className="flex-1 bg-transparent text-xl font-semibold tracking-tight text-valence-text outline-none placeholder:text-valence-subtle"
        />
        <span className="text-[11px] text-valence-subtle inline-flex items-center gap-1.5 shrink-0">
          {saving ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>
            : savedAt ? <><Check className="h-3 w-3 text-valence-success" /> Saved</>
            : null}
        </span>
      </div>

      {folder && (
        <p className="text-[11px] text-valence-muted">
          In folder · <span className="font-semibold text-valence-text">{folder.name}</span>
        </p>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-valence-border pb-2">
        <ToolbarBtn onClick={() => wrap('**')} title="Bold (wraps **selection**)"><Bold className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => wrap('*')}  title="Italic (wraps *selection*)"><Italic className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={insertBullet}     title="Bullet line"><List className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => wrap('[', '](https://)')} title="Link"><Link2 className="h-3.5 w-3.5" /></ToolbarBtn>
        <span className="ml-2 text-[11px] text-valence-subtle inline-flex items-center gap-1"><AtSign className="h-3 w-3" /> Type <span className="vl-kbd">[[</span> to link a person, fund, or mandate</span>
        <span className="ml-2 text-[11px] text-valence-subtle inline-flex items-center gap-1"><Hash className="h-3 w-3" /> Use <span className="vl-kbd">#tag</span> for folder-local tags</span>
      </div>

      {/* Editor */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={onBodyChange}
          placeholder="Write the note… reference people / funds / mandates with [[ and tag scoped concepts with #."
          className="vl-input min-h-[420px] leading-relaxed font-mono text-[13px] bg-white"
        />

        {linkOpen && linkSuggestions.length > 0 && (
          <ul className="absolute z-10 mt-1 w-72 max-h-64 overflow-y-auto rounded-lg border border-valence-border bg-white shadow-valence">
            {linkSuggestions.map(s => (
              <li key={`${s.type}-${s.id}`}>
                <button onMouseDown={e => e.preventDefault()} onClick={() => pickLink(s)} className="block w-full px-3 py-2 text-left hover:bg-valence-blue-soft">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-valence-blue">{s.type}</p>
                  <p className="text-sm font-semibold text-valence-text">{s.label}</p>
                  {s.sub && <p className="text-[11px] text-valence-muted">{s.sub}</p>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Tag preview pulled from the body */}
      {parseTags(body).length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Hash className="h-3 w-3" /> Folder tags</span>
          {parseTags(body).map(t => (
            <span key={t} className="rounded-full border border-valence-border bg-valence-surface px-2 py-0.5 text-[10px] font-semibold text-valence-muted">#{t}</span>
          ))}
          <span className="text-[10px] text-valence-subtle">— scoped to this folder; won't leak to other mandates</span>
        </div>
      )}
    </div>
  )
}

function ToolbarBtn({ onClick, title, children }) {
  return (
    <button type="button" onClick={onClick} title={title} className="grid h-7 w-7 place-items-center rounded text-valence-muted hover:bg-valence-surface hover:text-valence-text transition">
      {children}
    </button>
  )
}

// Read-only renderer that swaps [[type:id|name]] tokens for live entity
// names from the lookups map. Used by entity Mentions tabs and any other
// surface that displays a saved note body without the editor.
export function renderNoteBody(body, lookups) {
  if (!body) return ''
  return body.replace(/\[\[(person|fund|mandate):([0-9a-f-]{36})(?:\|([^\]]+))?\]\]/gi, (_, type, id, fallback) => {
    return renderMentionToken(type.toLowerCase(), id.toLowerCase(), lookups) || fallback || `${type}:${id.slice(0, 8)}`
  })
}
