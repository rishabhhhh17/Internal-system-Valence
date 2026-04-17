import { useRef, useState } from 'react'
import { Upload, FileText, X, Loader2, CheckCircle2 } from 'lucide-react'
import { uploadKnowledgeFile } from '../lib/knowledge.js'
import { fileTypeFor } from '../lib/fileParse.js'
import { embeddingsEnabled } from '../lib/embeddings.js'
import { useToast } from './Toast.jsx'

export default function KnowledgeUpload({ onUploaded, uploadedBy }) {
  const toast = useToast()
  const inputRef = useRef(null)
  const [queue, setQueue] = useState([])
  const [busy, setBusy] = useState(false)
  const [sector, setSector] = useState('')
  const [tagsStr, setTagsStr] = useState('')

  function onPick(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    addToQueue(files)
  }

  function addToQueue(files) {
    const valid = []
    for (const f of files) {
      if (!fileTypeFor(f)) {
        toast.error(`Skipped: ${f.name} — unsupported file type`)
        continue
      }
      if (f.size > 25 * 1024 * 1024) {
        toast.error(`Skipped: ${f.name} — over 25 MB`)
        continue
      }
      valid.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        file: f,
        pct: 0,
        label: 'Queued',
        status: 'queued'
      })
    }
    if (valid.length) setQueue(q => [...q, ...valid])
  }

  async function processQueue() {
    if (busy) return
    setBusy(true)
    const tags = tagsStr.split(',').map(t => t.trim()).filter(Boolean)
    const sec = sector.trim() || null

    for (const item of queue) {
      if (item.status === 'done') continue
      updateItem(item.id, { status: 'uploading', label: 'Starting' })
      try {
        await uploadKnowledgeFile({
          file: item.file,
          tags, sector: sec,
          uploadedBy,
          onProgress: ({ pct, label }) => updateItem(item.id, { pct, label })
        })
        updateItem(item.id, { status: 'done', pct: 1, label: 'Indexed' })
      } catch (err) {
        updateItem(item.id, { status: 'error', label: err.message || 'Failed' })
        toast.error(`${item.file.name}: ${err.message}`)
      }
    }
    setBusy(false)
    toast.success('Upload batch complete.')
    onUploaded?.()
  }

  function updateItem(id, patch) {
    setQueue(q => q.map(x => x.id === id ? { ...x, ...patch } : x))
  }

  function removeItem(id) {
    setQueue(q => q.filter(x => x.id !== id))
  }

  return (
    <div className="space-y-4">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); addToQueue(Array.from(e.dataTransfer.files || [])) }}
        className="cursor-pointer rounded-xl border border-dashed border-valence-border hover:border-valence-blue/40 bg-white/[0.02] px-6 py-8 text-center transition"
      >
        <input
          ref={inputRef} type="file" className="hidden"
          multiple onChange={onPick}
          accept=".pdf,.docx,.doc,.txt,.md,.csv,.html,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
        />
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-valence-blue-soft ring-1 ring-valence-blue/30 mb-3">
          <Upload className="h-5 w-5 text-valence-blue" />
        </div>
        <p className="text-sm font-semibold text-white">Drop files to add to the knowledge base</p>
        <p className="mt-1 text-[11px] text-valence-muted">
          PDF, DOCX, TXT, MD, CSV, HTML · up to 25 MB each · text is extracted and made searchable for the whole team
          {embeddingsEnabled() && ' · AI semantic search ON'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="vl-label">Sector <span className="normal-case tracking-normal text-valence-subtle">(optional)</span></label>
          <input className="vl-input" value={sector} onChange={e => setSector(e.target.value)} placeholder="e.g. Healthcare" />
        </div>
        <div>
          <label className="vl-label">Tags <span className="normal-case tracking-normal text-valence-subtle">(comma-separated)</span></label>
          <input className="vl-input" value={tagsStr} onChange={e => setTagsStr(e.target.value)} placeholder="memo, thesis, Q2" />
        </div>
      </div>

      {queue.length > 0 && (
        <div className="space-y-2">
          {queue.map(item => (
            <div key={item.id} className="rounded-lg border border-valence-border bg-white/[0.02] px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-valence-blue-soft ring-1 ring-valence-blue/20 shrink-0">
                  {item.status === 'done'
                    ? <CheckCircle2 className="h-4 w-4 text-valence-success" />
                    : item.status === 'error'
                    ? <X className="h-4 w-4 text-valence-danger" />
                    : item.status === 'uploading'
                    ? <Loader2 className="h-4 w-4 text-valence-blue animate-spin" />
                    : <FileText className="h-4 w-4 text-valence-blue" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{item.file.name}</p>
                  <p className="text-[11px] text-valence-muted">{item.label}</p>
                </div>
                {item.status !== 'uploading' && (
                  <button onClick={() => removeItem(item.id)} className="vl-btn-ghost" aria-label="Remove">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/[0.05]">
                <div
                  className={`h-full rounded-full transition-all ${item.status === 'error' ? 'bg-valence-danger' : 'bg-valence-blue'}`}
                  style={{ width: `${Math.max(2, Math.round((item.pct || 0) * 100))}%` }}
                />
              </div>
            </div>
          ))}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button onClick={() => setQueue([])} disabled={busy} className="vl-btn-secondary">Clear</button>
            <button onClick={processQueue} disabled={busy || queue.every(i => i.status === 'done')} className="vl-btn-primary">
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Indexing…</> : <><Upload className="h-4 w-4" /> Index all</>}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
