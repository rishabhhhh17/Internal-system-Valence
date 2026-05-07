import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { FileText, FolderTree, ArrowUpRight } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'

// Lists every kb_note that mentions this entity, grouped by mandate folder
// so the user sees "Physis was mentioned in: Green Protein (3), HoV (1)".
// Used by PersonDrawer Notes tab and FundDrawer Mentions section.

export default function EntityMentions({ entityType, entityId }) {
  const [rows, setRows] = useState([])
  const [folders, setFolders] = useState({})  // folder_id → folder row
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!entityType || !entityId) { setRows([]); setLoading(false); return }
    if (!isSupabaseConfigured) {
      setRows([]); setFolders({}); setLoading(false); return
    }
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
  }, [entityType, entityId])

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

  if (loading) return <div className="rounded-lg border border-dashed border-valence-border bg-valence-surface px-5 py-8 text-center text-sm text-valence-muted">Loading mentions…</div>

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-valence-border bg-valence-surface px-5 py-8 text-center text-sm text-valence-muted">
        No notes mention this {entityType} yet. Use <span className="vl-kbd">[[</span> in any KB note to link them — they'll surface here automatically.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-valence-muted">
        {rows.length} note{rows.length === 1 ? '' : 's'} across {grouped.length} mandate{grouped.length === 1 ? '' : 's'}.
      </p>
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
    .replace(/\[\[(?:person|fund|mandate):[0-9a-f-]{36}(?:\|([^\]]+))?\]\]/gi, (_, name) => name || '@')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220)
}
