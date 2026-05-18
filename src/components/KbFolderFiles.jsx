import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { Upload, FileText, Download, Trash2, Loader2 } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { uploadKbFile, deleteKbFile, kbFilePublicUrl, formatBytes } from '../lib/storage.js'
import { useToast } from './Toast.jsx'

// Files attached to a single kb_folder. Works for firm-library folders and
// mandate-scoped folders alike — the storage path is keyed by folder_id, not
// by mandate. Drag-and-drop or click to upload; each row gets download + delete.

export default function KbFolderFiles({ folder }) {
  const toast = useToast()
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!folder?.id) { setFiles([]); setLoading(false); return }
    load()
  }, [folder?.id])

  async function load() {
    setLoading(true)
    if (!isSupabaseConfigured) {
      // Demo: keep an in-memory store keyed by folder id.
      setFiles((demoStore.get(folder.id) || []).slice())
      setLoading(false)
      return
    }
    const { data, error } = await supabase
      .from('kb_files')
      .select('*')
      .eq('folder_id', folder.id)
      .order('created_at', { ascending: false })
    if (error) toast.error(error.message)
    setFiles(data || [])
    setLoading(false)
  }

  async function uploadMany(list) {
    if (!list || list.length === 0) return
    setUploading(true)
    let ok = 0, failed = 0
    for (const file of list) {
      try {
        if (!isSupabaseConfigured) {
          const row = { id: `local-${Date.now()}-${ok}`, folder_id: folder.id, name: file.name, path: `local://${file.name}`, size_bytes: file.size, mime_type: file.type || null, created_at: new Date().toISOString() }
          const existing = demoStore.get(folder.id) || []
          demoStore.set(folder.id, [row, ...existing])
          setFiles(prev => [row, ...prev])
        } else {
          const row = await uploadKbFile({ folderId: folder.id, file })
          setFiles(prev => [row, ...prev])
        }
        ok++
      } catch (err) {
        console.error(err)
        failed++
      }
    }
    setUploading(false)
    if (failed > 0) toast.error(`${failed} upload${failed > 1 ? 's' : ''} failed`)
    if (ok > 0) toast.success(`${ok} file${ok > 1 ? 's' : ''} uploaded`)
  }

  async function remove(row) {
    if (!confirm(`Delete "${row.name}"?`)) return
    if (!isSupabaseConfigured) {
      const existing = demoStore.get(folder.id) || []
      demoStore.set(folder.id, existing.filter(f => f.id !== row.id))
      setFiles(prev => prev.filter(f => f.id !== row.id))
      return
    }
    try {
      await deleteKbFile(row)
      setFiles(prev => prev.filter(f => f.id !== row.id))
    } catch (err) {
      toast.error(err.message)
    }
  }

  function onDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const list = Array.from(e.dataTransfer?.files || [])
    uploadMany(list)
  }

  if (!folder) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="vl-eyebrow-ink inline-flex items-center gap-1.5">
          <FileText className="h-3 w-3 text-valence-blue" /> Files
          {files.length > 0 && <span className="text-valence-subtle font-normal normal-case tracking-normal">· {files.length}</span>}
        </p>
        <button onClick={() => inputRef.current?.click()} disabled={uploading} className="vl-btn-secondary text-xs">
          {uploading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</> : <><Upload className="h-3.5 w-3.5" /> Upload</>}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={e => { uploadMany(Array.from(e.target.files || [])); e.target.value = '' }}
        />
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`rounded-lg border border-dashed px-4 py-6 text-center transition ${
          dragOver ? 'border-valence-blue bg-valence-blue-soft/60' : 'border-valence-border bg-valence-surface/40'
        }`}
      >
        <p className="text-xs text-valence-muted">
          Drag &amp; drop files here, or <button onClick={() => inputRef.current?.click()} className="font-semibold text-valence-blue hover:underline">browse</button>.
        </p>
        <p className="mt-0.5 text-[10px] text-valence-subtle">Anything goes — PDFs, decks, contracts, images.</p>
      </div>

      {loading ? (
        <p className="px-1 py-2 text-xs text-valence-muted">Loading files…</p>
      ) : files.length === 0 ? null : (
        <ul className="divide-y divide-valence-border/60 rounded-lg border border-valence-border bg-valence-elevated max-h-[50vh] overflow-y-auto">
          {files.map(f => {
            const openable = isSupabaseConfigured && f.path && !f.path.startsWith('local://')
            return (
              <li key={f.id} className="group flex items-center gap-3 px-3 py-2 hover:bg-valence-surface/60 transition">
                <FileText className="h-3.5 w-3.5 text-valence-subtle shrink-0" />
                <a
                  href={openable ? kbFilePublicUrl(f.path) : '#'}
                  target="_blank"
                  rel="noreferrer"
                  onClick={e => { if (!openable) e.preventDefault() }}
                  className={`flex-1 min-w-0 ${openable ? 'cursor-pointer' : 'cursor-default'}`}
                  title={openable ? 'Open in new tab' : 'Demo file — not persisted'}
                >
                  <p className={`truncate text-sm font-medium text-valence-text ${openable ? 'group-hover:text-valence-blue' : ''} transition`}>{f.name}</p>
                  <p className="text-[10px] text-valence-subtle tabular-nums truncate">
                    {formatBytes(f.size_bytes)}
                    {f.created_at && <> · {format(new Date(f.created_at), 'd MMM · HH:mm')}</>}
                  </p>
                </a>
                <button onClick={() => remove(f)} className="p-1.5 rounded-md text-valence-subtle hover:bg-valence-surface hover:text-valence-danger opacity-0 group-hover:opacity-100 transition shrink-0" title="Delete">
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// Tiny in-memory store for demo mode — survives within a single session so
// the user can play with uploads even without Supabase.
const demoStore = new Map()
