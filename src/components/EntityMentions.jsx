import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { FileText, FolderTree, ArrowUpRight, Plus, X, Loader2 } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { createQuickNoteForEntity } from '../lib/kb.js'
import { useToast } from './Toast.jsx'
import WikilinkTextarea from './WikilinkTextarea.jsx'

// Lists every kb_note that mentions this entity, grouped by mandate folder
// so the user sees "Physis was mentioned in: Green Protein (3), HoV (1)".
// Used by PersonDrawer Notes tab and FundDrawer Mentions section.

export default function EntityMentions({ entityType, entityId, entityName }) {
  const toast = useToast()
  const [rows, setRows] = useState([])
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
      setRows([]); setFolders({}); setLoading(false); return
    }
    // reloadKey is incremented after a quick-note is saved so the list refreshes.
    ;(async () => {
      setLoading(true)
      // Step 1: pull mention rows for this entity, joined to the note.
      const { data: mentions } = await supabase
        .from('kb_mentions')
        .select('id, note_id, kb_notes(id, title, body, folder_id, updated_at)')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)

      const noteRows = (mentions || [])
        .map(m => m.kb_notes)
        .filter(Boolean)

      // Step 2: pull the folder rows for these notes so we can group by mandate.
      const folderIds = Array.from(new Set(noteRows.map(n => n.folder_id).filter(Boolean)))
      let folderMap = {}
      let mandateMap = {}
      if (folderIds.length > 0) {
        const { data: folderRows } = await supabase
          .from('kb_folders')
          .select('id, name, mandate_id, parent_id')
          .in('id', folderIds)
        for (const f of folderRows || []) folderMap[f.id] = f

        // Get mandate names for grouping.
        const mandateIds = Array.from(new Set((folderRows || []).map(f => f.mandate_id).filter(Boolean)))
        if (mandateIds.length > 0) {
          const { data: deals } = await supabase
            .from('deals').select('id, client_name').in('id', mandateIds)
          for (const d of deals || []) mandateMap[d.id] = d.client_name
        }
      }
      setFolders({ ...folderMap, _mandates: mandateMap })
      setRows(noteRows)
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
      toast.error(err?.message || 'Could not save the note')
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
      const mandateName = mandateId ? (mandateMap[mandateId] || 'Mandate') : 'Firm-wide'
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
            className="vl-input bg-white"
            autoFocus
          />
          <WikilinkTextarea
            value={draftBody}
            onChange={setDraftBody}
            placeholder={`Just start typing. The wikilink to ${entityName || 'this ' + entityType} is added automatically. Use [[ for other people / funds / mandates and #tag for folder-local concepts.`}
            className="vl-input min-h-[160px] leading-relaxed bg-white font-mono text-[13px]"
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
            {loading ? 'Loading mentions…' : (rows.length === 0
              ? `No notes mention this ${entityType} yet.`
              : `${rows.length} note${rows.length === 1 ? '' : 's'} across ${grouped.length} mandate${grouped.length === 1 ? '' : 's'}.`)}
          </p>
          <button onClick={() => setComposerOpen(true)} className="vl-btn-primary text-xs">
            <Plus className="h-3.5 w-3.5" /> Add note
          </button>
        </div>
      )}

      {loading && !composerOpen && (
        <div className="rounded-lg border border-dashed border-valence-border bg-valence-surface px-5 py-6 text-center text-sm text-valence-muted">Loading mentions…</div>
      )}
      {!loading && rows.length === 0 && !composerOpen && (
        <div className="rounded-lg border border-dashed border-valence-border bg-valence-surface px-5 py-6 text-center text-sm text-valence-muted">
          No notes mention this {entityType} yet. Use <span className="vl-kbd">[[</span> in any KB note to link them — or click <span className="font-semibold text-valence-text">Add note</span> above.
        </div>
      )}

      {grouped.map(g => (
        <div key={g.mandateId || 'firm'} className="rounded-xl border border-valence-border bg-white">
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
                      to={g.mandateId ? `/knowledge/mandates?m=${g.mandateId}` : '/knowledge'}
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
    .replace(/\[\[(?:person|fund|mandate|note):[0-9a-f-]{36}(?:\|([^\]]+))?\]\]/gi, (_, name) => name || '@')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220)
}
