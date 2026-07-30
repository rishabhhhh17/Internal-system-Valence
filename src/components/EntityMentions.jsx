import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { FileText, FolderTree, ArrowUpRight, Plus, X, Loader2, Calendar, MessageSquare } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { createQuickNoteForEntity } from '../lib/kb.js'
import { humanError } from '../lib/userError.js'
import { useToast } from './Toast.jsx'
import WikilinkTextarea from './WikilinkTextarea.jsx'

// Lists every place this entity is wikilinked from — KB notes, Daily notes,
// and Interaction notes — so opening Sivaan's drawer shows "Sivaan is on
// HoB" (from a daily note) AND every meeting where his name was tagged.
//
// Used by PersonDrawer, FundDrawer, and DealDrawer. Sources are queried in
// parallel and merged into a single timeline; KB notes still group by
// mandate folder for the read-the-mandate flow.

export default function EntityMentions({ entityType, entityId, entityName }) {
  const toast = useToast()
  const [rows, setRows] = useState([])                    // KB notes (legacy shape)
  const [dailyNotes, setDailyNotes] = useState([])        // Daily notes mentioning this entity
  const [interactions, setInteractions] = useState([])    // Interactions mentioning this entity
  const [folders, setFolders] = useState({})  // folder_id → folder row
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  // Inline composer state
  const [composerOpen, setComposerOpen] = useState(false)
  const [draftTitle, setDraftTitle]     = useState('')
  const [draftBody, setDraftBody]       = useState('')
  const [saving, setSaving]             = useState(false)

  useEffect(() => {
    if (!entityType || !entityId) { setRows([]); setLoading(false); return }
    if (!isSupabaseConfigured) {
      setRows([]); setDailyNotes([]); setInteractions([]); setFolders({}); setLoading(false); return
    }
    // The token that identifies this entity inside any wikilink body. We
    // match the canonical [[type:id form so noisy substring hits in plain
    // prose don't surface ("hob" the abbreviation, vs the actual mandate).
    const linkToken = `[[${entityType}:${entityId}`

    ;(async () => {
      setLoading(true)
      // Run all three sources in parallel.
      const [kbMentionsRes, dailyRes, interactionsRes] = await Promise.all([
        supabase
          .from('kb_mentions')
          .select('id, note_id, kb_notes(id, title, body, folder_id, updated_at)')
          .eq('entity_type', entityType)
          .eq('entity_id', entityId),
        // Daily notes — scan the body column for the canonical wikilink
        // pattern. Cheap ILIKE because the column carries the [[type:id…
        // marker only when the user actually linked something.
        supabase
          .from('daily_notes')
          .select('user_id, date, body, updated_at')
          .ilike('body', `%${linkToken}%`)
          .order('date', { ascending: false })
          .limit(25),
        supabase
          .from('interactions')
          .select('id, counterparty_name, counterparty_company, type, outcome, notes, deal_id, person_id, created_at')
          .ilike('notes', `%${linkToken}%`)
          .order('created_at', { ascending: false })
          .limit(25)
      ])

      const noteRows = (kbMentionsRes.data || [])
        .map(m => m.kb_notes)
        .filter(Boolean)

      // Folder + mandate context for KB-note grouping.
      const folderIds = Array.from(new Set(noteRows.map(n => n.folder_id).filter(Boolean)))
      let folderMap = {}
      let mandateMap = {}
      if (folderIds.length > 0) {
        const { data: folderRows } = await supabase
          .from('kb_folders')
          .select('id, name, mandate_id, parent_id')
          .in('id', folderIds)
        for (const f of folderRows || []) folderMap[f.id] = f
        const mandateIds = Array.from(new Set((folderRows || []).map(f => f.mandate_id).filter(Boolean)))
        if (mandateIds.length > 0) {
          const { data: deals } = await supabase
            .from('deals').select('id, client_name').in('id', mandateIds)
          for (const d of deals || []) mandateMap[d.id] = d.client_name
        }
      }
      setFolders({ ...folderMap, _mandates: mandateMap })
      setRows(noteRows)
      setDailyNotes(dailyRes.data || [])
      setInteractions(interactionsRes.data || [])
      setLoading(false)
    })()
  }, [entityType, entityId, reloadKey])

  async function saveQuickNote() {
    const title = draftTitle.trim()
    const body  = draftBody.trim()
    if (!title && !body) return toast.error('Add a title or some text first')
    if (!isSupabaseConfigured) {
      // Demo: just close the composer with a friendly message.
      toast.success('Note saved (demo mode — connect Supabase to persist)')
      setComposerOpen(false); setDraftTitle(''); setDraftBody('')
      return
    }
    setSaving(true)
    try {
      await createQuickNoteForEntity(supabase, {
        entityType, entityId, entityName,
        title: title || (body.slice(0, 60) || 'Untitled note'),
        body
      })
      toast.success('Note saved')
      setComposerOpen(false); setDraftTitle(''); setDraftBody('')
      setReloadKey(k => k + 1)
    } catch (err) {
      toast.error(humanError(err, 'Could not save the note'))
    } finally {
      setSaving(false)
    }
  }

  const grouped = useMemo(() => {
    const map = new Map()
    const mandateMap = folders._mandates || {}
    for (const note of rows) {
      const folder = folders[note.folder_id]
      const mandateId = folder?.mandate_id
      const mandateName = mandateId ? (mandateMap[mandateId] || 'Deal') : 'Firm-wide'
      const key = mandateId || 'firm'
      if (!map.has(key)) map.set(key, { mandateId, mandateName, notes: [] })
      map.get(key).notes.push({ ...note, folderName: folder?.name })
    }
    return Array.from(map.values()).sort((a, b) => b.notes.length - a.notes.length)
  }, [rows, folders])

  return (
    <div className="space-y-4">
      {/* Inline quick-note composer — always available */}
      {composerOpen ? (
        <div className="rounded-xl border border-valence-blue/30 bg-valence-blue-soft/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="vl-eyebrow-ink inline-flex items-center gap-1.5">
              <Plus className="h-3 w-3 text-valence-blue" /> New note about {entityName || `this ${entityType}`}
            </p>
            <button onClick={() => { setComposerOpen(false); setDraftTitle(''); setDraftBody('') }} className="grid h-6 w-6 place-items-center text-valence-subtle hover:text-valence-text">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <input
            value={draftTitle}
            onChange={e => setDraftTitle(e.target.value)}
            placeholder="Title (optional — first line of body becomes the title if blank)"
            className="vl-input bg-valence-elevated"
            autoFocus
          />
          <WikilinkTextarea
            value={draftBody}
            onChange={setDraftBody}
            placeholder={`Just start typing. The wikilink to ${entityName || 'this ' + entityType} is added automatically. Use [[ for other people / funds / mandates and #tag for folder-local concepts.`}
            className="vl-input min-h-[160px] leading-relaxed bg-valence-elevated font-mono text-[13px]"
          />
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-valence-muted">Saves into the firm-wide <span className="font-semibold text-valence-text">Quick notes</span> folder. Cross-links to {entityName || `this ${entityType}`}.</p>
            <button onClick={saveQuickNote} disabled={saving} className="vl-btn-primary text-xs">
              {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : 'Save note'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-valence-muted">
            {loading ? 'Loading mentions…' : summaryLine(rows, dailyNotes, interactions, grouped)}
          </p>
          <button onClick={() => setComposerOpen(true)} className="vl-btn-primary text-xs">
            <Plus className="h-3.5 w-3.5" /> Add note
          </button>
        </div>
      )}

      {loading && !composerOpen && (
        <div className="rounded-lg border border-dashed border-valence-border bg-valence-surface px-5 py-6 text-center text-sm text-valence-muted">Loading mentions…</div>
      )}
      {!loading && rows.length === 0 && dailyNotes.length === 0 && interactions.length === 0 && !composerOpen && (
        <div className="rounded-lg border border-dashed border-valence-border bg-valence-surface px-5 py-6 text-center text-sm text-valence-muted">
          No mentions of this {entityType} yet. Write <span className="vl-kbd">[[</span>{entityName || entityType}<span className="vl-kbd">]]</span> anywhere — daily notes, interaction notes, KB — and it'll surface here.
        </div>
      )}

      {/* Daily-note mentions: a partner wrote "[[Sivaan]] is on [[HoB]]"
          on Today; that surfaces here whenever Sivaan / HoB's drawer
          opens. Newest first. */}
      {dailyNotes.length > 0 && (
        <div className="rounded-xl border border-valence-border bg-valence-elevated">
          <header className="flex items-center justify-between border-b border-valence-border px-4 py-2.5 bg-valence-surface">
            <p className="vl-eyebrow-ink inline-flex items-center gap-1.5">
              <Calendar className="h-3 w-3 text-valence-blue" /> Daily notes
            </p>
            <span className="text-[10px] tabular-nums text-valence-muted">{dailyNotes.length} day{dailyNotes.length === 1 ? '' : 's'}</span>
          </header>
          <ul className="divide-y divide-valence-border/60">
            {dailyNotes.map(d => (
              <li key={`${d.user_id}-${d.date}`} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <Calendar className="h-3.5 w-3.5 mt-0.5 text-valence-subtle shrink-0" />
                  <div className="min-w-0 flex-1">
                    <Link to="/" className="text-sm font-semibold text-valence-text hover:text-valence-blue inline-flex items-center gap-1">
                      Daily note · {format(new Date(d.date), 'd MMM yyyy')}
                      <ArrowUpRight className="h-3 w-3" />
                    </Link>
                    <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-valence-muted">
                      {snippetAround(d.body, entityType, entityId)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Interaction mentions: meeting notes that wikilinked this entity. */}
      {interactions.length > 0 && (
        <div className="rounded-xl border border-valence-border bg-valence-elevated">
          <header className="flex items-center justify-between border-b border-valence-border px-4 py-2.5 bg-valence-surface">
            <p className="vl-eyebrow-ink inline-flex items-center gap-1.5">
              <MessageSquare className="h-3 w-3 text-valence-blue" /> Interactions
            </p>
            <span className="text-[10px] tabular-nums text-valence-muted">{interactions.length}</span>
          </header>
          <ul className="divide-y divide-valence-border/60">
            {interactions.map(i => (
              <li key={i.id} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <MessageSquare className="h-3.5 w-3.5 mt-0.5 text-valence-subtle shrink-0" />
                  <div className="min-w-0 flex-1">
                    <Link
                      to={i.deal_id ? `/deals?open=${i.deal_id}` : '/interactions'}
                      className="text-sm font-semibold text-valence-text hover:text-valence-blue inline-flex items-center gap-1"
                    >
                      {i.counterparty_name || i.counterparty_company || 'Interaction'}
                      <ArrowUpRight className="h-3 w-3" />
                    </Link>
                    <p className="mt-0.5 text-[11px] text-valence-muted">
                      {[i.type, i.outcome].filter(Boolean).join(' · ')}
                      {i.created_at && ` · ${formatDistanceToNowStrict(new Date(i.created_at), { addSuffix: true })}`}
                    </p>
                    {i.notes && (
                      <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-valence-muted">
                        {snippetAround(i.notes, entityType, entityId)}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {grouped.map(g => (
        <div key={g.mandateId || 'firm'} className="rounded-xl border border-valence-border bg-valence-elevated">
          <header className="flex items-center justify-between border-b border-valence-border px-4 py-2.5 bg-valence-surface">
            <p className="vl-eyebrow-ink inline-flex items-center gap-1.5">
              <FolderTree className="h-3 w-3 text-valence-blue" /> {g.mandateName}
            </p>
            <span className="text-[10px] tabular-nums text-valence-muted">{g.notes.length} note{g.notes.length === 1 ? '' : 's'}</span>
          </header>
          <ul className="divide-y divide-valence-border/60">
            {g.notes.map(n => (
              <li key={n.id} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <FileText className="h-3.5 w-3.5 mt-0.5 text-valence-subtle shrink-0" />
                  <div className="min-w-0 flex-1">
                    <Link
                      to={g.mandateId ? `/knowledge/shared?tab=mandates&m=${g.mandateId}` : '/knowledge'}
                      className="text-sm font-semibold text-valence-text hover:text-valence-blue inline-flex items-center gap-1"
                    >
                      {n.title || 'Untitled note'}
                      <ArrowUpRight className="h-3 w-3" />
                    </Link>
                    <p className="mt-0.5 text-[11px] text-valence-muted">
                      {n.folderName ? `${n.folderName} · ` : ''}
                      {n.updated_at ? format(new Date(n.updated_at), 'd MMM yyyy') : ''}
                    </p>
                    {n.body && <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-valence-muted">{snippet(n.body)}</p>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

// Strip [[type:id|name]] tokens for the inline preview snippet — show the
// display name instead of the raw token.
function snippet(body) {
  return body
    .replace(/\[\[(?:person|fund|mandate|note):[^|\]\s]+(?:\|([^\]]+))?\]\]/gi, (_, name) => name || '@')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220)
}

// Pull a ~220-char window AROUND the wikilink mention of this entity, so
// the partner sees the actual sentence ("Sivaan is on HoB this week") not
// some random opening line of the note. Falls back to a normal snippet
// when the token isn't found (defensive — shouldn't happen since the
// query ILIKE'd on this exact token).
function snippetAround(body, entityType, entityId) {
  if (!body) return ''
  const token = `[[${entityType}:${entityId}`
  const idx = body.toLowerCase().indexOf(token.toLowerCase())
  if (idx < 0) return snippet(body)
  const start = Math.max(0, idx - 80)
  const end   = Math.min(body.length, idx + 200)
  const slice = (start > 0 ? '…' : '') + body.slice(start, end) + (end < body.length ? '…' : '')
  return snippet(slice)
}

// Pluralise + tally across all three sources for the header line.
function summaryLine(kb, daily, inter, grouped) {
  const parts = []
  if (kb.length > 0)    parts.push(`${kb.length} KB note${kb.length === 1 ? '' : 's'}${grouped.length > 1 ? ` across ${grouped.length} deals` : ''}`)
  if (daily.length > 0) parts.push(`${daily.length} daily note${daily.length === 1 ? '' : 's'}`)
  if (inter.length > 0) parts.push(`${inter.length} interaction${inter.length === 1 ? '' : 's'}`)
  if (parts.length === 0) return 'No mentions yet.'
  return parts.join(' · ')
}
