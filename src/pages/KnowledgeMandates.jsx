import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { FilePlus, Search, FolderTree, Trash2, Globe2, ArrowRight } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { stageMeta } from '../lib/stages.js'
import { spawnMandateFolders, searchKbNotes } from '../lib/kb.js'
import ConfigBanner from '../components/ConfigBanner.jsx'
import EmptyState from '../components/EmptyState.jsx'
import KbFolderTree from '../components/KbFolderTree.jsx'
import KbNoteEditor from '../components/KbNoteEditor.jsx'
import { useToast } from '../components/Toast.jsx'

// Three-pane layout — mandate picker (left), folder tree (middle), notes
// (right). Selection is reflected in the URL so links into a specific
// mandate / folder / note are share-able.

export default function KnowledgeMandates() {
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

  // Pull all folder IDs for the active mandate so we can scope search to them.
  useEffect(() => {
    if (!selectedMandateId || !isSupabaseConfigured) { setFolderIdsForMandate([]); return }
    ;(async () => {
      const { data } = await supabase.from('kb_folders').select('id').eq('mandate_id', selectedMandateId)
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
    if (!selectedFolder) { setNotes([]); setSelectedNote(null); return }
    if (!isSupabaseConfigured) { setNotes([]); return }
    ;(async () => {
      const { data } = await supabase.from('kb_notes').select('*').eq('folder_id', selectedFolder.id).order('updated_at', { ascending: false })
      setNotes(data || [])
      // Auto-pick the most recent note when entering a folder.
      setSelectedNote((data || [])[0] || null)
    })()
  }, [selectedFolder?.id])

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
    if (error) return toast.error(error.message)
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
    <div className="space-y-4">
      <ConfigBanner />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="vl-eyebrow-ink">Knowledge · Mandate notes</p>
          <h1 className="mt-2 font-display text-feature font-bold text-valence-text">Per-mandate folders.</h1>
          <p className="mt-2 max-w-2xl text-sm text-valence-muted">
            Each mandate gets its own structured folder tree. Tag people and funds with <span className="vl-kbd">[[</span> for cross-mandate links; use <span className="vl-kbd">#tag</span> for folder-local concepts.
          </p>
        </div>
        {selectedMandateId && (
          <button onClick={ensureFolders} className="vl-btn-secondary text-xs">
            <FolderTree className="h-3.5 w-3.5" /> Ensure default folders
          </button>
        )}
      </div>

      {/* Hybrid search — keyword + vector + recency, optionally scoped to one mandate */}
      <div className="vl-card p-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-valence-subtle" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search notes — combines keyword, semantic similarity, and recency"
              className="vl-input h-9 w-full pl-9 text-sm"
            />
            {searching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-valence-muted">Searching…</span>}
          </div>
          <div className="inline-flex items-center rounded-full border border-valence-border bg-white p-0.5 shrink-0">
            <button onClick={() => setSearchScope('mandate')} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${searchScope === 'mandate' ? 'bg-valence-ink text-white' : 'text-valence-muted hover:text-valence-text'}`}><FolderTree className="h-3 w-3" /> This mandate</button>
            <button onClick={() => setSearchScope('global')}  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${searchScope === 'global'  ? 'bg-valence-ink text-white' : 'text-valence-muted hover:text-valence-text'}`}><Globe2 className="h-3 w-3" /> All mandates</button>
          </div>
        </div>
        {searchResults && searchResults.length > 0 && (
          <ul className="mt-3 space-y-1 max-h-72 overflow-y-auto">
            {searchResults.map(r => (
              <li key={r.id}>
                <button onClick={() => openResult(r)} className="block w-full text-left rounded-lg border border-valence-border bg-white px-3 py-2 hover:border-valence-blue/40 transition">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-semibold text-valence-text">{r.title || 'Untitled note'}</p>
                    <span className="text-[10px] tabular-nums text-valence-subtle shrink-0">score {r.total_score?.toFixed(2)}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-valence-muted">{(r.body || '').slice(0, 240)}</p>
                  <p className="mt-1 text-[10px] text-valence-subtle inline-flex items-center gap-1">Open <ArrowRight className="h-3 w-3" /></p>
                </button>
              </li>
            ))}
          </ul>
        )}
        {searchResults && searchResults.length === 0 && searchQuery && !searching && (
          <p className="mt-3 px-1 text-xs text-valence-muted">No notes match "{searchQuery}".</p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_280px_1fr] min-h-[600px]">
        {/* Mandate picker */}
        <aside className="vl-card p-3 space-y-2 lg:max-h-[80vh] lg:overflow-y-auto">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-valence-subtle" />
            <input value={mandateSearch} onChange={e => setMandateSearch(e.target.value)} placeholder="Search mandates" className="vl-input h-8 pl-8 text-xs" />
          </div>
          {loadingMandates ? (
            <p className="px-2 py-2 text-xs text-valence-muted">Loading…</p>
          ) : filteredMandates.length === 0 ? (
            <p className="px-2 py-2 text-xs text-valence-muted">No mandates match.</p>
          ) : (
            <ul className="space-y-0.5">
              {filteredMandates.map(m => {
                const active = m.id === selectedMandateId
                return (
                  <li key={m.id}>
                    <button onClick={() => setSelectedMandateId(m.id)} className={`block w-full text-left rounded px-2 py-1.5 text-xs transition ${active ? 'bg-valence-blue-soft text-valence-text font-semibold' : 'text-valence-muted hover:bg-valence-surface hover:text-valence-text'}`}>
                      <p className="truncate">{m.client_name}</p>
                      <p className="mt-0.5 text-[10px] text-valence-subtle">{m.stage}</p>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>

        {/* Folder tree */}
        <aside className="vl-card p-3 lg:max-h-[80vh] lg:overflow-y-auto">
          {selectedMandateId ? (
            <KbFolderTree mandateId={selectedMandateId} selectedFolderId={selectedFolder?.id} onSelect={setSelectedFolder} />
          ) : (
            <div className="px-3 py-6 text-xs text-valence-muted">Pick a mandate.</div>
          )}
        </aside>

        {/* Notes column */}
        <section className="vl-card p-5 space-y-4 lg:max-h-[80vh] lg:overflow-y-auto">
          {!selectedFolder ? (
            <EmptyState icon={FolderTree} title="Pick a folder" description="Choose a folder from the tree to see its notes." />
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="vl-eyebrow-ink">Folder</p>
                  <p className="text-sm font-semibold text-valence-text">{selectedFolder.name}</p>
                </div>
                <button onClick={newNote} className="vl-btn-primary text-xs">
                  <FilePlus className="h-3.5 w-3.5" /> New note
                </button>
              </div>

              {/* Notes list */}
              <ul className="grid gap-2">
                {notes.length === 0 ? (
                  <li className="rounded-lg border border-dashed border-valence-border bg-valence-surface px-4 py-6 text-center text-xs text-valence-muted">
                    No notes in this folder yet. Click "+ New note" to start.
                  </li>
                ) : notes.map(n => {
                  const active = n.id === selectedNote?.id
                  return (
                    <li key={n.id}>
                      <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition ${active ? 'border-valence-blue/40 bg-valence-blue-soft' : 'border-valence-border bg-white hover:bg-valence-surface'}`}>
                        <button onClick={() => setSelectedNote(n)} className="flex-1 min-w-0 text-left">
                          <p className="truncate text-sm font-semibold text-valence-text">{n.title || 'Untitled note'}</p>
                          <p className="text-[10px] text-valence-muted">{n.updated_at ? `Updated ${format(new Date(n.updated_at), 'd MMM · HH:mm')}` : 'Just now'}</p>
                        </button>
                        <button onClick={() => deleteNote(n)} className="p-1 text-valence-subtle hover:text-valence-danger" title="Delete"><Trash2 className="h-3 w-3" /></button>
                      </div>
                    </li>
                  )
                })}
              </ul>

              <div className="pt-3 border-t border-valence-border">
                <KbNoteEditor note={selectedNote} folder={selectedFolder} onSaved={onNoteSaved} />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
