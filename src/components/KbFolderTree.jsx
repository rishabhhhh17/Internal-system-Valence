import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Folder, FolderOpen, FilePlus, Plus, Pencil, Trash2 } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { useToast } from './Toast.jsx'

// Per-mandate folder browser. Renders a collapsible tree of kb_folders
// rows scoped to one mandate_id. Selecting a folder calls onSelect with
// the folder row; the parent page renders the notes list for that folder.
//
// Inline actions per folder: add child, rename, delete. Mandate-root and
// the auto-spawned activity / category levels are all editable — the user
// can rename "Investor Meetings" to "Backers" if they want.

export default function KbFolderTree({ mandateId, selectedFolderId, onSelect }) {
  const toast = useToast()
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(new Set())
  const [renaming, setRenaming]   = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [creatingUnder, setCreatingUnder] = useState(null)
  const [createValue, setCreateValue] = useState('')

  useEffect(() => {
    if (!mandateId) { setFolders([]); setLoading(false); return }
    load()
  }, [mandateId])

  async function load() {
    setLoading(true)
    if (!isSupabaseConfigured) { setFolders([]); setLoading(false); return }
    const { data, error } = await supabase
      .from('kb_folders')
      .select('*')
      .eq('mandate_id', mandateId)
      .order('sort_order')
    if (error) toast.error(error.message)
    setFolders(data || [])
    // Expand the root + first level by default.
    const root = (data || []).find(f => f.folder_type === 'mandate_root')
    const next = new Set()
    if (root) {
      next.add(root.id)
      for (const f of data || []) if (f.parent_id === root.id) next.add(f.id)
    }
    setExpanded(next)
    setLoading(false)
  }

  // Build a map from parent_id → array of children for cheap recursion.
  const childrenByParent = useMemo(() => {
    const map = new Map()
    for (const f of folders) {
      const key = f.parent_id || 'ROOT'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(f)
    }
    for (const arr of map.values()) arr.sort((a, b) => a.sort_order - b.sort_order)
    return map
  }, [folders])

  const root = folders.find(f => f.folder_type === 'mandate_root')

  function toggle(id) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function createUnder(parent) {
    const name = createValue.trim()
    if (!name) { setCreatingUnder(null); return }
    if (!isSupabaseConfigured) {
      const local = { id: `local-${Date.now()}`, parent_id: parent.id, mandate_id: mandateId, name, folder_type: 'category', sort_order: 999 }
      setFolders(prev => [...prev, local])
      setCreateValue(''); setCreatingUnder(null)
      setExpanded(prev => new Set(prev).add(parent.id))
      return
    }
    const { data, error } = await supabase.from('kb_folders').insert({
      parent_id: parent.id,
      mandate_id: mandateId,
      name,
      folder_type: parent.folder_type === 'mandate_root' ? 'activity' : 'category',
      sort_order: 999
    }).select().single()
    setCreateValue(''); setCreatingUnder(null)
    if (error) return toast.error(error.message)
    setFolders(prev => [...prev, data])
    setExpanded(prev => new Set(prev).add(parent.id))
  }

  async function renameFolder(folder) {
    const next = renameValue.trim()
    if (!next || next === folder.name) { setRenaming(null); return }
    setFolders(prev => prev.map(f => f.id === folder.id ? { ...f, name: next } : f))
    setRenaming(null)
    if (!isSupabaseConfigured) return
    const { error } = await supabase.from('kb_folders').update({ name: next }).eq('id', folder.id)
    if (error) {
      toast.error(error.message)
      load()  // reconcile from server
    }
  }

  async function deleteFolder(folder) {
    if (folder.folder_type === 'mandate_root') return toast.error('Can\'t delete the mandate root.')
    if (!confirm(`Delete "${folder.name}" and all its sub-folders + notes?`)) return
    if (!isSupabaseConfigured) {
      setFolders(prev => prev.filter(f => f.id !== folder.id && f.parent_id !== folder.id))
      return
    }
    const { error } = await supabase.from('kb_folders').delete().eq('id', folder.id)
    if (error) return toast.error(error.message)
    setFolders(prev => prev.filter(f => f.id !== folder.id))
  }

  if (loading) return <div className="px-3 py-6 text-xs text-valence-muted">Loading folders…</div>
  if (!root)   return <div className="rounded-lg border border-dashed border-valence-border bg-valence-surface px-4 py-6 text-center text-xs text-valence-muted">No folders yet for this mandate.</div>

  return (
    <ul className="text-sm">
      {renderNode(root)}
    </ul>
  )

  function renderNode(folder, depth = 0) {
    const kids = childrenByParent.get(folder.id) || []
    const isOpen = expanded.has(folder.id)
    const isSelected = folder.id === selectedFolderId

    return (
      <li key={folder.id}>
        <div
          className={`group flex items-center gap-1 px-1 py-1 rounded transition cursor-pointer ${
            isSelected ? 'bg-valence-blue-soft' : 'hover:bg-valence-surface'
          }`}
          style={{ paddingLeft: 8 + depth * 14 }}
        >
          {kids.length > 0 ? (
            <button onClick={() => toggle(folder.id)} className="grid h-4 w-4 place-items-center text-valence-subtle hover:text-valence-text shrink-0">
              <ChevronRight className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
            </button>
          ) : <span className="w-4 shrink-0" />}

          {isOpen ? <FolderOpen className="h-3.5 w-3.5 text-valence-blue shrink-0" /> : <Folder className="h-3.5 w-3.5 text-valence-muted shrink-0" />}

          {renaming === folder.id ? (
            <input
              autoFocus
              className="flex-1 bg-white border border-valence-blue/40 rounded px-1 py-0 text-sm outline-none focus:ring-2 focus:ring-valence-blue-ring"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onBlur={() => renameFolder(folder)}
              onKeyDown={e => {
                if (e.key === 'Enter') renameFolder(folder)
                if (e.key === 'Escape') setRenaming(null)
              }}
            />
          ) : (
            <button onClick={() => onSelect?.(folder)} className={`flex-1 text-left truncate ${isSelected ? 'font-semibold text-valence-text' : 'text-valence-text'}`}>
              {folder.name}
            </button>
          )}

          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition shrink-0">
            <button onClick={() => { setCreatingUnder(folder.id); setCreateValue('') }} className="p-1 text-valence-subtle hover:text-valence-blue" title="Add sub-folder"><Plus className="h-3 w-3" /></button>
            <button onClick={() => { setRenaming(folder.id); setRenameValue(folder.name) }} className="p-1 text-valence-subtle hover:text-valence-blue" title="Rename"><Pencil className="h-3 w-3" /></button>
            {folder.folder_type !== 'mandate_root' && (
              <button onClick={() => deleteFolder(folder)} className="p-1 text-valence-subtle hover:text-valence-danger" title="Delete"><Trash2 className="h-3 w-3" /></button>
            )}
          </div>
        </div>

        {creatingUnder === folder.id && (
          <div className="flex items-center gap-1 py-1" style={{ paddingLeft: 8 + (depth + 1) * 14 }}>
            <FilePlus className="h-3 w-3 text-valence-blue shrink-0" />
            <input
              autoFocus
              className="flex-1 bg-white border border-valence-blue/40 rounded px-1 py-0 text-sm outline-none focus:ring-2 focus:ring-valence-blue-ring"
              value={createValue}
              onChange={e => setCreateValue(e.target.value)}
              placeholder="Folder name…"
              onBlur={() => createUnder(folder)}
              onKeyDown={e => {
                if (e.key === 'Enter') createUnder(folder)
                if (e.key === 'Escape') { setCreateValue(''); setCreatingUnder(null) }
              }}
            />
          </div>
        )}

        {isOpen && kids.length > 0 && (
          <ul>{kids.map(k => renderNode(k, depth + 1))}</ul>
        )}
      </li>
    )
  }
}
