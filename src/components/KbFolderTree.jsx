import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Folder, FolderOpen, FilePlus, Plus, Pencil, Trash2, Sparkles, Loader2, Library } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { spawnMandateFolders, defaultTemplateFor } from '../lib/kb.js'
import { useToast } from './Toast.jsx'

// Folder browser. Two scopes:
//   - scope='mandate' (default): tree rooted at one mandate's mandate_root,
//     scoped to mandate_id = <mandateId>.
//   - scope='firm': mandate-less library shared across the firm
//     (kb_folders.mandate_id IS NULL, folder_type='firm_wide' at top level).
//     For things like NDA templates, engagement letters, internal SOPs.
//
// Inline actions per folder: add child, rename, delete. Mandate-root is the
// only undeletable node. Everything else (including firm-wide tops) can be
// renamed or removed.

export default function KbFolderTree({ mandate, mandateId, scope = 'mandate', selectedFolderId, onSelect }) {
  const toast = useToast()
  const isFirm = scope === 'firm'
  const effectiveMandateId = mandateId || mandate?.id
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(new Set())
  const [renaming, setRenaming]   = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [creatingUnder, setCreatingUnder] = useState(null)
  const [createValue, setCreateValue] = useState('')
  const [creatingTop, setCreatingTop] = useState(false)
  const [topValue, setTopValue] = useState('')
  const [spawning, setSpawning] = useState(false)

  useEffect(() => {
    if (isFirm) { load(); return }
    if (!effectiveMandateId) { setFolders([]); setLoading(false); return }
    load()
  }, [effectiveMandateId, isFirm])

  async function load(autoSelectFirstActivity = false) {
    setLoading(true)
    if (!isSupabaseConfigured) { setLoading(false); return }
    const query = supabase.from('kb_folders').select('*').order('sort_order')
    const { data, error } = isFirm
      ? await query.is('mandate_id', null)
      : await query.eq('mandate_id', effectiveMandateId)
    if (error) toast.error(error.message)
    const rows = data || []
    setFolders(rows)
    // Expand the root (mandate scope) or every top-level firm folder (firm scope) by default.
    const next = new Set()
    if (isFirm) {
      for (const f of rows) if (!f.parent_id) next.add(f.id)
    } else {
      const root = rows.find(f => f.folder_type === 'mandate_root')
      if (root) {
        next.add(root.id)
        for (const f of rows) if (f.parent_id === root.id) next.add(f.id)
      }
    }
    setExpanded(next)
    setLoading(false)
    // After a fresh spawn, auto-select the first activity so the right pane
    // shows a useful "no notes yet, hit + New note" state instead of "Pick a
    // folder" — saves the user one click on a brand-new mandate.
    if (autoSelectFirstActivity && rows.length > 0) {
      const firstActivity = rows.find(f => f.folder_type === 'activity') || rows.find(f => f.folder_type !== 'mandate_root')
      if (firstActivity) onSelect?.(firstActivity)
    }
  }

  // Spawn the default folder template for this mandate. Works against
  // Supabase (real persistence) and against local state (demo mode) so
  // the empty-state button is never a dead end.
  async function setupDefaults() {
    if (spawning) return
    if (!mandate) { toast.error('Pick a mandate first'); return }
    setSpawning(true)
    try {
      if (!isSupabaseConfigured) {
        // Demo mode: synthesize the template tree in-memory. Same shape as
        // what spawnMandateFolders would have inserted into kb_folders.
        const tree = defaultTemplateFor(mandate)
        const rootId = `local-root-${mandate.id}`
        const out = [{ id: rootId, parent_id: null, mandate_id: mandate.id, name: mandate.client_name || 'Mandate', folder_type: 'mandate_root', sort_order: 0 }]
        tree.forEach((node, i) => {
          const activityId = `local-act-${i}`
          out.push({ id: activityId, parent_id: rootId, mandate_id: mandate.id, name: node.name, folder_type: 'activity', sort_order: (i + 1) * 10 })
          ;(node.children || []).forEach((child, j) => {
            out.push({ id: `local-cat-${i}-${j}`, parent_id: activityId, mandate_id: mandate.id, name: child.name, folder_type: 'category', sort_order: (j + 1) * 10 })
          })
        })
        setFolders(out)
        setExpanded(new Set([rootId, ...out.filter(f => f.parent_id === rootId).map(f => f.id)]))
        const firstActivity = out.find(f => f.folder_type === 'activity')
        if (firstActivity) onSelect?.(firstActivity)
        toast.success('Default folders ready (demo mode — not persisted)')
        return
      }
      await spawnMandateFolders(supabase, mandate)
      await load(true)
      toast.success('Default folders ready')
    } catch (err) {
      toast.error(err?.message || 'Could not set up default folders')
    } finally {
      setSpawning(false)
    }
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
      const local = { id: `local-${Date.now()}`, parent_id: parent.id, mandate_id: isFirm ? null : mandateId, name, folder_type: 'category', sort_order: 999 }
      setFolders(prev => [...prev, local])
      setCreateValue(''); setCreatingUnder(null)
      setExpanded(prev => new Set(prev).add(parent.id))
      return
    }
    const { data, error } = await supabase.from('kb_folders').insert({
      parent_id: parent.id,
      mandate_id: isFirm ? null : mandateId,
      name,
      folder_type: parent.folder_type === 'mandate_root' ? 'activity' : 'category',
      sort_order: 999
    }).select().single()
    setCreateValue(''); setCreatingUnder(null)
    if (error) return toast.error(error.message)
    setFolders(prev => [...prev, data])
    setExpanded(prev => new Set(prev).add(parent.id))
  }

  // Create a new top-level firm-library folder (no parent, no mandate).
  // Only callable in firm scope — mandate scope uses the mandate_root.
  async function createTopLevelFirm() {
    const name = topValue.trim()
    if (!name) { setCreatingTop(false); return }
    if (!isSupabaseConfigured) {
      const local = { id: `local-${Date.now()}`, parent_id: null, mandate_id: null, name, folder_type: 'firm_wide', sort_order: 999 }
      setFolders(prev => [...prev, local])
      setTopValue(''); setCreatingTop(false)
      setExpanded(prev => new Set(prev).add(local.id))
      return
    }
    const { data, error } = await supabase.from('kb_folders').insert({
      parent_id: null,
      mandate_id: null,
      name,
      folder_type: 'firm_wide',
      sort_order: 999
    }).select().single()
    setTopValue(''); setCreatingTop(false)
    if (error) return toast.error(error.message)
    setFolders(prev => [...prev, data])
    setExpanded(prev => new Set(prev).add(data.id))
    onSelect?.(data)
  }

  // Seed the firm library with a sensible default set when it's empty.
  async function seedFirmDefaults() {
    if (spawning) return
    setSpawning(true)
    const seeds = [
      { name: 'NDA templates',       sort: 10 },
      { name: 'Engagement letters',  sort: 20 },
      { name: 'Internal playbooks',  sort: 30 },
      { name: 'Misc',                sort: 40 }
    ]
    try {
      if (!isSupabaseConfigured) {
        const now = Date.now()
        const out = seeds.map((s, i) => ({ id: `local-firm-${now}-${i}`, parent_id: null, mandate_id: null, name: s.name, folder_type: 'firm_wide', sort_order: s.sort }))
        setFolders(out)
        setExpanded(new Set(out.map(f => f.id)))
        onSelect?.(out[0])
        toast.success('Firm library ready (demo mode — not persisted)')
        return
      }
      const { data, error } = await supabase.from('kb_folders').insert(
        seeds.map(s => ({ parent_id: null, mandate_id: null, name: s.name, folder_type: 'firm_wide', sort_order: s.sort }))
      ).select()
      if (error) return toast.error(error.message)
      setFolders(data || [])
      setExpanded(new Set((data || []).map(f => f.id)))
      if (data && data[0]) onSelect?.(data[0])
      toast.success('Firm library ready')
    } finally {
      setSpawning(false)
    }
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

  // ---- Firm-library scope ----
  if (isFirm) {
    const tops = (childrenByParent.get('ROOT') || []).filter(f => !f.mandate_id)
    if (tops.length === 0 && !creatingTop) {
      return (
        <div className="rounded-xl border border-dashed border-valence-blue/30 bg-valence-blue-soft/30 px-4 py-6 text-center space-y-3">
          <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-valence-blue-soft ring-1 ring-valence-blue/30">
            <Library className="h-4 w-4 text-valence-blue" />
          </div>
          <div>
            <p className="text-sm font-semibold text-valence-text">No folders yet</p>
            <p className="mt-1 text-[11px] leading-relaxed text-valence-muted max-w-xs mx-auto">
              Create whatever folders you like — templates, playbooks, anything cross-mandate. Files and notes both live inside.
            </p>
          </div>
          <button onClick={() => { setCreatingTop(true); setTopValue('') }} className="vl-btn-primary text-xs">
            <Plus className="h-3.5 w-3.5" /> New folder
          </button>
        </div>
      )
    }
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between px-1 pb-1 mb-1 border-b border-valence-border">
          <p className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Library className="h-3 w-3 text-valence-blue" /> Firm library</p>
          <button
            onClick={() => { setCreatingTop(true); setTopValue('') }}
            className="inline-flex items-center gap-1 rounded-md border border-valence-blue/30 bg-valence-blue-soft px-2 py-0.5 text-[11px] font-semibold text-valence-blue hover:bg-valence-blue hover:text-white transition"
            title="New top-level folder"
          >
            <Plus className="h-3 w-3" /> New folder
          </button>
        </div>
        {creatingTop && (
          <div className="flex items-center gap-1 py-1 px-1">
            <Folder className="h-3.5 w-3.5 text-valence-blue shrink-0" />
            <input
              autoFocus
              className="flex-1 bg-white border border-valence-blue/40 rounded px-1 py-0 text-sm outline-none focus:ring-2 focus:ring-valence-blue-ring"
              value={topValue}
              onChange={e => setTopValue(e.target.value)}
              placeholder="Folder name…"
              onBlur={createTopLevelFirm}
              onKeyDown={e => {
                if (e.key === 'Enter') createTopLevelFirm()
                if (e.key === 'Escape') { setTopValue(''); setCreatingTop(false) }
              }}
            />
          </div>
        )}
        <ul className="text-sm">
          {tops.map(t => renderNode(t))}
        </ul>
      </div>
    )
  }

  // ---- Mandate scope ----
  if (!root) return (
    <div className="rounded-xl border border-dashed border-valence-blue/30 bg-valence-blue-soft/30 px-4 py-6 text-center space-y-3">
      <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-valence-blue-soft ring-1 ring-valence-blue/30">
        <Sparkles className="h-4 w-4 text-valence-blue" />
      </div>
      <div>
        <p className="text-sm font-semibold text-valence-text">No folders yet</p>
        <p className="mt-1 text-[11px] leading-relaxed text-valence-muted max-w-xs mx-auto">
          Spawn the default folder template for this mandate — meetings, diligence, internal notes — based on its deal type.
        </p>
      </div>
      <button
        onClick={setupDefaults}
        disabled={spawning || !mandate}
        className="vl-btn-primary text-xs"
      >
        {spawning ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Setting up…</> : <><Sparkles className="h-3.5 w-3.5" /> Set up default folders</>}
      </button>
    </div>
  )

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
