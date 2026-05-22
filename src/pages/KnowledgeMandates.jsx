import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { FilePlus, Search, FolderTree, Trash2, Globe2, Hash, X, Library } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { stageMeta } from '../lib/stages.js'
import { spawnMandateFolders, searchKbNotes, stripWikilinkTokens } from '../lib/kb.js'
import ConfigBanner from '../components/ConfigBanner.jsx'
import KbFolderTree from '../components/KbFolderTree.jsx'
import KbNoteEditor from '../components/KbNoteEditor.jsx'
import KbFolderFiles from '../components/KbFolderFiles.jsx'
import { useToast } from '../components/Toast.jsx'
import { humanError } from '../lib/userError.js'

// Three-pane layout — mandate picker (left), folder tree (middle), notes
// (right). Selection is reflected in the URL so links into a specific
// mandate / folder / note are share-able.
//
// Special sentinel `__firm__` on selectedMandateId switches the folder
// tree to the firm-wide library (kb_folders.mandate_id IS NULL) — a
// shared space for NDA templates, engagement letters, internal playbooks,
// anything that isn't tied to one mandate.

const FIRM_SCOPE = '__firm__'
//
// Exported as a named `MandatesPanel` so the unified Knowledge surface can
// embed it as a tab without re-rendering the global hero. The default
// export is a thin page wrapper that adds the hero + ConfigBanner for the
// standalone `/knowledge/mandates` route (kept as a redirect target).

export function MandatesPanel() {
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [mandates, setMandates] = useState([])
  const [loadingMandates, setLoadingMandates] = useState(true)
  const [mandateSearch, setMandateSearch] = useState('')
  const [selectedMandateId, setSelectedMandateId] = useState(params.get('m') || null)
  const [selectedFolder,    setSelectedFolder]    = useState(null)
  const [notes, setNotes] = useState([])
  const [selectedNote, setSelectedNote] = useState(null)

  // Hybrid search state — searches kb_notes via the search_kb_notes RPC.
  // Scope toggles between "this mandate" and "everything".
  const [searchQuery, setSearchQuery]     = useState('')
  const [searchScope, setSearchScope]     = useState('mandate')   // 'mandate' | 'global'
  const [searchResults, setSearchResults] = useState(null)        // null = idle
  const [searching, setSearching]         = useState(false)
  const [folderIdsForMandate, setFolderIdsForMandate] = useState([])

  // Tag filter — folder-local. Click chips to AND-filter the notes list.
  // Resets whenever the folder changes since tags don't carry across folders.
  const [activeTags, setActiveTags] = useState([])

  // ---------- Mandate list ----------
  useEffect(() => {
    if (!isSupabaseConfigured) {
      // Demo: just use a couple of fake mandates so the page renders
      setMandates([{ id: 'demo-1', client_name: 'HoV Mushrooms', stage: 'Mandate' }])
      setLoadingMandates(false)
      return
    }
    ;(async () => {
      const { data } = await supabase.from('deals').select('id, client_name, stage, deal_types, deal_subtype').order('updated_at', { ascending: false })
      setMandates(data || [])
      setLoadingMandates(false)
      // If nothing selected yet, pick the first non-terminal mandate.
      if (!params.get('m') && data && data.length > 0) {
        const firstActive = data.find(d => !stageMeta(d.stage).terminal) || data[0]
        setSelectedMandateId(firstActive.id)
      }
    })()
  }, [])

  // Sync selectedMandateId into the URL.
  useEffect(() => {
    if (!selectedMandateId) return
    const next = new URLSearchParams(params)
    next.set('m', selectedMandateId)
    setParams(next, { replace: true })
  }, [selectedMandateId])

  // Reset folder + note when mandate changes
  useEffect(() => {
    setSelectedFolder(null)
    setSelectedNote(null)
    setNotes([])
    setSearchResults(null)
    setSearchQuery('')
  }, [selectedMandateId])

  // Pull all folder IDs for the active scope so we can narrow search.
  // Mandate scope → folders for that mandate. Firm scope → folders with
  // mandate_id null (the shared library).
  useEffect(() => {
    if (!selectedMandateId || !isSupabaseConfigured) { setFolderIdsForMandate([]); return }
    ;(async () => {
      const q = supabase.from('kb_folders').select('id')
      const { data } = selectedMandateId === FIRM_SCOPE
        ? await q.is('mandate_id', null)
        : await q.eq('mandate_id', selectedMandateId)
      setFolderIdsForMandate((data || []).map(f => f.id))
    })()
  }, [selectedMandateId])

  // Run a search whenever the query changes (debounced).
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults(null); return }
    if (!isSupabaseConfigured) { setSearchResults([]); return }
    let cancelled = false
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const folderFilter = searchScope === 'mandate' && folderIdsForMandate.length > 0 ? folderIdsForMandate : null
        const rows = await searchKbNotes(supabase, searchQuery, { folderFilterIds: folderFilter, matchCount: 12 })
        if (!cancelled) setSearchResults(rows)
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [searchQuery, searchScope, folderIdsForMandate])

  async function openResult(row) {
    // Hopping to a search hit: switch the selected folder + note + auto-load notes list.
    if (!isSupabaseConfigured) return
    const { data: folder } = await supabase.from('kb_folders').select('*').eq('id', row.folder_id).single()
    if (folder) {
      // If this note belongs to a different mandate, switch mandates first.
      if (folder.mandate_id && folder.mandate_id !== selectedMandateId) {
        setSelectedMandateId(folder.mandate_id)
      }
      setSelectedFolder(folder)
      const { data: full } = await supabase.from('kb_notes').select('*').eq('id', row.id).single()
      if (full) setSelectedNote(full)
      setSearchResults(null)
      setSearchQuery('')
    }
  }

  // ---------- Notes for the selected folder ----------
  useEffect(() => {
    if (!selectedFolder) { setNotes([]); setSelectedNote(null); setActiveTags([]); return }
    if (!isSupabaseConfigured) { setNotes([]); return }
    ;(async () => {
      const { data } = await supabase.from('kb_notes').select('*').eq('folder_id', selectedFolder.id).order('updated_at', { ascending: false })
      setNotes(data || [])
      // Reset filter and auto-pick the most recent note when entering a folder.
      setActiveTags([])
      setSelectedNote((data || [])[0] || null)
    })()
  }, [selectedFolder?.id])

  // Tag counts derived from the unfiltered notes list — chips stay visible
  // even after the user starts filtering so they can deselect or pivot.
  // Sorted by count desc, then alphabetical for stable ordering.
  const tagCounts = useMemo(() => {
    const counts = new Map()
    for (const n of notes) {
      for (const t of (n.tags || [])) counts.set(t, (counts.get(t) || 0) + 1)
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [notes])

  // AND-filter the visible notes by every active tag. Empty filter = show all.
  const visibleNotes = useMemo(() => {
    if (activeTags.length === 0) return notes
    return notes.filter(n => {
      const set = new Set(n.tags || [])
      return activeTags.every(t => set.has(t))
    })
  }, [notes, activeTags])

  function toggleTag(tag) {
    setActiveTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  // ---------- Actions ----------
  async function newNote() {
    if (!selectedFolder) return toast.error('Pick a folder first')
    const draft = { title: 'Untitled note', body: '', folder_id: selectedFolder.id }
    if (!isSupabaseConfigured) {
      const local = { id: `local-${Date.now()}`, ...draft, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      setNotes(prev => [local, ...prev])
      setSelectedNote(local)
      return
    }
    const { data, error } = await supabase.from('kb_notes').insert(draft).select().single()
    if (error) return toast.error(humanError(error, 'Could not create note'))
    setNotes(prev => [data, ...prev])
    setSelectedNote(data)
  }

  async function deleteNote(note) {
    if (!confirm(`Delete "${note.title}"?`)) return
    setNotes(prev => prev.filter(n => n.id !== note.id))
    if (selectedNote?.id === note.id) setSelectedNote(null)
    if (!isSupabaseConfigured) return
    await supabase.from('kb_notes').delete().eq('id', note.id)
  }

  // Auto-spawn folders for a mandate that doesn't have any yet — useful for
  // demo-1 mandates created before Phase 2 went live.
  async function ensureFolders() {
    if (!selectedMandateId || !isSupabaseConfigured) return
    const deal = mandates.find(m => m.id === selectedMandateId)
    if (!deal) return
    const root = await spawnMandateFolders(supabase, deal)
    if (root) toast.success('Folder structure ready')
  }

  function onNoteSaved(updated) {
    setNotes(prev => prev.map(n => n.id === updated.id ? { ...n, ...updated } : n))
    setSelectedNote(prev => prev?.id === updated.id ? { ...prev, ...updated } : prev)
  }

  // ---------- Render ----------
  const filteredMandates = useMemo(() => {
    const q = mandateSearch.trim().toLowerCase()
    if (!q) return mandates
    return mandates.filter(m => (m.client_name || '').toLowerCase().includes(q))
  }, [mandates, mandateSearch])

  return (
    <div className="space-y-3">
      {/* Finder-style toolbar — slim, no card background. Search left,
          scope toggle middle, ensure-folders button right. */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-valence-subtle" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search notes"
            className="w-full h-8 pl-8 pr-3 text-[13px] rounded-md bg-valence-surface border border-valence-border text-valence-text placeholder:text-valence-subtle outline-none focus:border-valence-blue focus:bg-valence-elevated"
          />
          {searching && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-valence-muted">…</span>}
        </div>
        <div className="inline-flex items-center rounded-md bg-valence-surface border border-valence-border p-0.5 shrink-0">
          <button onClick={() => setSearchScope('mandate')} className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition ${searchScope === 'mandate' ? 'bg-valence-elevated text-valence-text shadow-sm' : 'text-valence-muted hover:text-valence-text'}`}>
            {selectedMandateId === FIRM_SCOPE
              ? <><Library className="h-3 w-3" /> Firm</>
              : <><FolderTree className="h-3 w-3" /> Scope</>}
          </button>
          <button onClick={() => setSearchScope('global')} className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition ${searchScope === 'global' ? 'bg-valence-elevated text-valence-text shadow-sm' : 'text-valence-muted hover:text-valence-text'}`}>
            <Globe2 className="h-3 w-3" /> All
          </button>
        </div>
        {selectedMandateId && selectedMandateId !== FIRM_SCOPE && (
          <button onClick={ensureFolders} className="inline-flex items-center gap-1.5 rounded-md bg-valence-surface border border-valence-border px-2.5 py-1 text-[11px] font-medium text-valence-muted hover:text-valence-text hover:border-valence-ink/30 transition shrink-0" title="Spawn the default folder template for this mandate">
            <FolderTree className="h-3 w-3" /> Ensure folders
          </button>
        )}
      </div>

      {/* Inline search results — pop below the toolbar, not in a separate card. */}
      {searchResults && searchResults.length > 0 && (
        <div className="rounded-lg border border-valence-border bg-valence-elevated overflow-hidden">
          <ul className="max-h-72 overflow-y-auto divide-y divide-valence-border/60">
            {searchResults.map(r => (
              <li key={r.id}>
                <button onClick={() => openResult(r)} className="block w-full text-left px-3 py-2 hover:bg-valence-surface transition">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-[13px] font-semibold text-valence-text">{r.title || 'Untitled note'}</p>
                    <span className="text-[10px] tabular-nums text-valence-subtle shrink-0">{r.total_score?.toFixed(2)}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-valence-muted">{stripWikilinkTokens(r.body || '').slice(0, 200)}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {searchResults && searchResults.length === 0 && searchQuery && !searching && (
        <p className="px-1 text-xs text-valence-muted">No notes match "{searchQuery}".</p>
      )}

      {/* macOS Finder–style three-column frame.
          One bordered rectangle, vertical dividers between columns, each column
          has its own slim header bar and scrolls independently. Capped at
          40vh so the note editor + files panel below stay visible in the
          same viewport — discoverability over Finder fidelity. */}
      <div className="rounded-lg border border-valence-border bg-valence-elevated overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-[240px_260px_1fr] divide-y lg:divide-y-0 lg:divide-x divide-valence-border h-[40vh] min-h-[320px]">

          {/* Column 1 — Sources */}
          <div className="flex flex-col min-h-0 bg-valence-surface/40">
            <div className="px-3 h-8 flex items-center justify-between border-b border-valence-border bg-valence-surface/60">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-valence-subtle">Sources</span>
              <span className="text-[10px] tabular-nums text-valence-subtle">{mandates.length + 1}</span>
            </div>
            <div className="px-2 pt-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-valence-subtle" />
                <input value={mandateSearch} onChange={e => setMandateSearch(e.target.value)} placeholder="Filter" className="w-full h-7 pl-7 pr-2 text-[12px] rounded bg-valence-elevated border border-valence-border text-valence-text placeholder:text-valence-subtle outline-none focus:border-valence-blue" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-1 py-1">
              <FinderRow
                selected={selectedMandateId === FIRM_SCOPE}
                onClick={() => setSelectedMandateId(FIRM_SCOPE)}
                icon={<Library className="h-3.5 w-3.5 text-valence-blue" />}
                label="Firm library"
                sub="NDA templates · playbooks"
              />
              <div className="my-1 mx-2 border-t border-valence-border/60" />
              {loadingMandates ? (
                <p className="px-3 py-2 text-[11px] text-valence-muted">Loading…</p>
              ) : filteredMandates.length === 0 ? (
                <p className="px-3 py-2 text-[11px] text-valence-muted">No mandates.</p>
              ) : (
                filteredMandates.map(m => (
                  <FinderRow
                    key={m.id}
                    selected={m.id === selectedMandateId}
                    onClick={() => setSelectedMandateId(m.id)}
                    icon={<FolderTree className="h-3.5 w-3.5 text-valence-muted" />}
                    label={m.client_name}
                    sub={m.stage}
                  />
                ))
              )}
            </div>
          </div>

          {/* Column 2 — Folders */}
          <div className="flex flex-col min-h-0">
            <div className="px-3 h-8 flex items-center justify-between border-b border-valence-border bg-valence-surface/60">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-valence-subtle">Folders</span>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-1">
              {selectedMandateId === FIRM_SCOPE ? (
                <KbFolderTree scope="firm" selectedFolderId={selectedFolder?.id} onSelect={setSelectedFolder} />
              ) : selectedMandateId ? (
                <KbFolderTree mandate={mandates.find(m => m.id === selectedMandateId)} mandateId={selectedMandateId} selectedFolderId={selectedFolder?.id} onSelect={setSelectedFolder} />
              ) : (
                <div className="px-3 py-6 text-[11px] text-valence-muted">Pick a source on the left.</div>
              )}
            </div>
          </div>

          {/* Column 3 — Notes (list + preview) */}
          <div className="flex flex-col min-h-0">
            <div className="px-3 h-8 flex items-center justify-between border-b border-valence-border bg-valence-surface/60">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-valence-subtle truncate">
                {selectedFolder ? selectedFolder.name : 'Notes'}
                {selectedFolder && notes.length > 0 && <span className="ml-1.5 text-valence-subtle/80 normal-case tracking-normal">· {notes.length}</span>}
              </span>
              {selectedFolder && (
                <button onClick={newNote} className="inline-flex items-center gap-1 rounded-md bg-valence-blue px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-valence-blue-hover transition">
                  <FilePlus className="h-3 w-3" /> New note
                </button>
              )}
            </div>
            {!selectedFolder ? (
              <div className="flex-1 flex items-center justify-center px-4">
                <p className="text-[12px] text-valence-muted">Pick a folder to see its notes.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto min-h-0">
                {/* Tag filter — slim row */}
                {tagCounts.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 px-3 py-1.5 border-b border-valence-border/60 bg-valence-surface/30">
                    {tagCounts.map(([tag, count]) => {
                      const on = activeTags.includes(tag)
                      return (
                        <button
                          key={tag}
                          onClick={() => toggleTag(tag)}
                          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition ${on ? 'bg-valence-blue text-white' : 'text-valence-muted hover:bg-valence-surface hover:text-valence-text'}`}
                        >
                          #{tag}<span className={on ? 'text-white/70' : 'text-valence-subtle'}>{count}</span>
                        </button>
                      )
                    })}
                    {activeTags.length > 0 && (
                      <button onClick={() => setActiveTags([])} className="inline-flex items-center text-[10px] text-valence-muted hover:text-valence-danger">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                )}

                {/* Notes list */}
                {notes.length === 0 ? (
                  <p className="px-4 py-8 text-center text-[12px] text-valence-muted">No notes. Click <span className="font-semibold text-valence-blue">New</span> to start.</p>
                ) : visibleNotes.length === 0 ? (
                  <p className="px-4 py-8 text-center text-[12px] text-valence-muted">No notes match — <button onClick={() => setActiveTags([])} className="font-semibold text-valence-blue hover:underline">clear filter</button>.</p>
                ) : (
                  <ul className="divide-y divide-valence-border/60">
                    {visibleNotes.map(n => {
                      const active = n.id === selectedNote?.id
                      return (
                        <li key={n.id}>
                          <div className={`group flex items-center gap-2 px-3 py-2 transition ${active ? 'bg-valence-blue-soft' : 'hover:bg-valence-surface/60'}`}>
                            <button onClick={() => setSelectedNote(n)} className="flex-1 min-w-0 text-left flex items-center gap-2">
                              <Hash className="h-3 w-3 text-valence-subtle/70 shrink-0" />
                              <span className={`truncate text-[12px] ${active ? 'font-semibold text-valence-text' : 'text-valence-text'}`}>{n.title || 'Untitled note'}</span>
                              <span className="ml-auto text-[10px] text-valence-subtle tabular-nums shrink-0">{n.updated_at ? format(new Date(n.updated_at), 'd MMM') : 'now'}</span>
                            </button>
                            <button onClick={() => deleteNote(n)} className="p-1 text-valence-subtle hover:text-valence-danger opacity-0 group-hover:opacity-100 transition" title="Delete"><Trash2 className="h-3 w-3" /></button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Editor + files panel — full-width below the Finder frame so the
          three columns stay clean and the editor gets the room it needs.
          Always visible when a folder is selected — discoverability for
          'where do I add things'. */}
      {selectedFolder ? (
        <div className="rounded-lg border border-valence-border bg-valence-elevated p-4 space-y-4">
          <div>
            <p className="vl-eyebrow-ink inline-flex items-center gap-1.5">
              <FilePlus className="h-3 w-3 text-valence-blue" /> Note editor
              {selectedNote && <span className="text-valence-subtle/80 font-normal normal-case tracking-normal">· {selectedNote.title || 'Untitled'}</span>}
            </p>
            {!selectedNote && notes.length === 0 && (
              <p className="text-[11px] text-valence-muted mt-1">Click <span className="font-semibold text-valence-blue">+ New note</span> in the Notes column above to start writing.</p>
            )}
            <div className="mt-2">
              <KbNoteEditor note={selectedNote} folder={selectedFolder} onSaved={onNoteSaved} />
            </div>
          </div>
          <div className="pt-3 border-t border-valence-border">
            <KbFolderFiles folder={selectedFolder} />
          </div>
        </div>
      ) : (
        <p className="px-1 text-[12px] text-valence-muted">Pick a folder to write notes or attach files.</p>
      )}
    </div>
  )
}

// Single-row item in a Finder column. Compact, selection-aware, icon + label
// + optional sub-label. Tight padding so we hit Finder-density (≈28px tall).
function FinderRow({ selected, onClick, icon, label, sub }) {
  return (
    <button
      onClick={onClick}
      className={`group w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition ${
        selected
          ? 'bg-valence-blue-soft'
          : 'hover:bg-valence-surface'
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[12px] ${selected ? 'font-semibold text-valence-text' : 'text-valence-text'}`}>{label}</span>
        {sub && <span className="block truncate text-[10px] text-valence-subtle">{sub}</span>}
      </span>
    </button>
  )
}

// Standalone page wrapper — kept so the legacy `/knowledge/mandates` route
// still resolves while old bookmarks redirect to `/knowledge/shared?tab=mandates`.
// Adds the page hero + ConfigBanner that MandatesPanel intentionally omits.
export default function KnowledgeMandates() {
  return (
    <div className="space-y-6">
      <ConfigBanner />
      <div>
        <p className="vl-eyebrow-ink">Knowledge · Mandate notes</p>
        <h1 className="mt-2 font-display text-feature font-bold text-valence-text">Per-mandate folders.</h1>
      </div>
      <MandatesPanel />
    </div>
  )
}
