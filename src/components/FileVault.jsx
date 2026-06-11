import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Upload, FileText, Trash2, Paperclip, AlertTriangle, Droplets, Link2, ShieldCheck } from 'lucide-react'
import { format } from 'date-fns'
import { supabase, isSupabaseConfigured, checkDealFilesBucket, resetBucketStatus } from '../lib/supabase.js'
import { uploadDealFile, publicUrlFor, deleteDealFile, formatBytes } from '../lib/storage.js'
import { logActivity } from '../lib/activity.js'
import { humanError } from '../lib/userError.js'
import { useWorkspaceSetting } from '../hooks/useWorkspaceSetting.js'
import { WORKSPACE_KEYS } from '../lib/workspace.js'
import { useToast } from './Toast.jsx'
import { useConfirm } from './ConfirmDialog.jsx'

const isLink = (p) => typeof p === 'string' && /^https?:\/\//i.test(p)

const CATEGORIES = ['Pitch deck','NDA','Data room','Deck','Term sheet','Diligence','Side letter','Other']

export default function FileVault({ dealId }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [category, setCategory] = useState('Pitch deck')
  const [bucket, setBucket] = useState(null) // 'ok' | 'missing' | 'error' | 'unconfigured'
  const inputRef = useRef(null)
  // Reference-only is the secure default: sensitive files stay in the firm's
  // Drive; we store a link + status, never the file itself.
  const docMode = useWorkspaceSetting(WORKSPACE_KEYS.documentHandling, 'reference')
  const [linkName, setLinkName] = useState('')
  const [linkUrl, setLinkUrl] = useState('')

  useEffect(() => {
    if (!dealId) return
    if (!isSupabaseConfigured) { setFiles([]); setLoading(false); return }
    load()
    ;(async () => setBucket(await checkDealFilesBucket()))()
  }, [dealId])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('deal_files').select('*').eq('deal_id', dealId).order('created_at', { ascending: false })
    if (error) toast.error(humanError(error, 'Could not load files'))
    setFiles(data || [])
    setLoading(false)
  }

  async function handleFile(file) {
    if (!file) return
    if (!isSupabaseConfigured) return toast.error('Connect Supabase to upload files.')
    if (bucket === 'missing') {
      return toast.error('Create the "deal-files" Storage bucket in Supabase first.', { title: 'Storage bucket missing' })
    }
    if (file.size > 25 * 1024 * 1024) {
      return toast.error('File is larger than 25 MB.')
    }
    setUploading(true)
    try {
      const row = await uploadDealFile({ dealId, file, category })
      await logActivity({ dealId, kind: 'file_upload', body: `${category}: ${file.name}` })
      setFiles(f => [row, ...f])
      toast.success(`Uploaded ${file.name}`)
    } catch (err) {
      toast.error(humanError(err, 'Could not upload file'))
    } finally {
      setUploading(false)
    }
  }

  async function onPick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    handleFile(file)
  }

  // Reference-only: record a link to where the document already lives (Drive,
  // data room) — no file is copied into the platform.
  async function addLink(e) {
    e?.preventDefault?.()
    const url = linkUrl.trim()
    const name = linkName.trim() || url
    if (!isLink(url)) return toast.error('Paste a valid https:// link.')
    if (!isSupabaseConfigured) return toast.error('Connect Supabase to add references.')
    setUploading(true)
    try {
      const { data, error } = await supabase.from('deal_files')
        .insert({ deal_id: dealId, name, path: url, category }).select().single()
      if (error) throw error
      await logActivity({ dealId, kind: 'file_upload', body: `${category} (link): ${name}` })
      setFiles(f => [data, ...f])
      setLinkName(''); setLinkUrl('')
      toast.success('Reference added.')
    } catch (err) {
      toast.error(humanError(err, 'Could not add reference'))
    } finally {
      setUploading(false)
    }
  }

  async function toggleWatermark(f) {
    const next = !f.watermark_enabled
    setFiles(prev => prev.map(x => x.id === f.id ? { ...x, watermark_enabled: next } : x))
    if (!isSupabaseConfigured) return
    const { error } = await supabase.from('deal_files').update({ watermark_enabled: next }).eq('id', f.id)
    if (error) {
      setFiles(prev => prev.map(x => x.id === f.id ? { ...x, watermark_enabled: !next } : x))
      toast.error(humanError(error, 'Could not update watermark'))
    } else {
      toast.success(next ? 'Watermark on when shared' : 'Watermark off')
    }
  }

  async function remove(f) {
    const ok = await confirm({ title: 'Delete this file?', body: `"${f.name}" will be permanently removed from the data room.`, destructive: true, confirmLabel: 'Delete' })
    if (!ok) return
    try {
      if (isLink(f.path)) {
        // Reference rows have no stored object — just drop the DB row.
        if (isSupabaseConfigured) {
          const { error } = await supabase.from('deal_files').delete().eq('id', f.id)
          if (error) throw error
        }
      } else {
        await deleteDealFile(f)
      }
      setFiles(prev => prev.filter(x => x.id !== f.id))
      toast.success(isLink(f.path) ? 'Reference removed.' : 'File deleted.')
    } catch (err) {
      toast.error(humanError(err, 'Could not delete file'))
    }
  }

  return (
    <div className="space-y-4">
      {bucket === 'missing' && docMode !== 'reference' && (
        <div className="flex items-start gap-3 rounded-xl border border-valence-warning/30 bg-valence-warning/5 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-valence-warning" />
          <div className="text-sm flex-1">
            <p className="font-semibold text-valence-text">Storage bucket not found</p>
            <p className="mt-0.5 text-[11px] text-valence-muted leading-relaxed">
              Go to Supabase Studio → Storage → New bucket → name it <span className="vl-kbd">deal-files</span>, make it public, save.
            </p>
          </div>
          <button
            onClick={async () => { resetBucketStatus(); setBucket(await checkDealFilesBucket()) }}
            className="vl-btn-ghost text-xs"
          >
            Recheck
          </button>
        </div>
      )}

      {docMode === 'reference' ? (
        /* Reference-only: link to the doc in the firm's own Drive — nothing
           sensitive is copied into the platform. */
        <form onSubmit={addLink} className="rounded-xl border border-valence-border bg-valence-surface px-5 py-4">
          <div className="flex items-center gap-2 text-[11px] text-valence-muted">
            <ShieldCheck className="h-3.5 w-3.5 text-valence-blue" />
            <span>Reference-only mode — files stay in your Drive. Paste a link; the document is never stored here. <Link to="/settings?section=security" className="font-semibold text-valence-blue hover:text-valence-blue-hover">Change</Link></span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
            <input value={linkName} onChange={e => setLinkName(e.target.value)} placeholder="Label (e.g. NDA)" className="vl-input h-9 text-sm" />
            <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://drive.google.com/…" className="vl-input h-9 text-sm" />
            <button type="submit" disabled={uploading} className="vl-btn-primary-sm shrink-0"><Link2 className="h-4 w-4" /> {uploading ? 'Adding…' : 'Add link'}</button>
          </div>
          <div className="mt-2">
            <select value={category} onChange={e => setCategory(e.target.value)} className="rounded-lg border border-valence-border bg-valence-elevated px-2.5 py-1 text-[11px] font-semibold text-valence-text outline-none">
              {CATEGORIES.map(c => <option key={c} className="bg-valence-surface" value={c}>{c}</option>)}
            </select>
          </div>
        </form>
      ) : (
        /* Upload dropzone */
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={async (e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]) }}
          className="relative cursor-pointer rounded-xl border border-dashed border-valence-border hover:border-valence-blue/40 bg-valence-surface px-5 py-6 text-center transition"
        >
          <input ref={inputRef} type="file" className="hidden" onChange={onPick} />
          <div className="mx-auto grid h-10 w-10 place-items-center rounded-lg bg-valence-blue-soft ring-1 ring-valence-blue/30 mb-3">
            <Upload className="h-4 w-4 text-valence-blue" />
          </div>
          <p className="text-sm font-semibold text-valence-text">
            {uploading ? 'Uploading…' : 'Drop a file or click to upload'}
          </p>
          <p className="mt-0.5 text-[11px] text-valence-muted">
            Tag type first — pitch deck, NDA, data room, deck, term sheet, diligence, side letter…
          </p>
          <div className="mt-3 flex items-center justify-center gap-2">
            <select
              value={category} onChange={e => { e.stopPropagation(); setCategory(e.target.value) }}
              onClick={e => e.stopPropagation()}
              className="rounded-lg border border-valence-border bg-valence-surface px-2.5 py-1 text-[11px] font-semibold text-valence-text outline-none"
            >
              {CATEGORIES.map(c => <option key={c} className="bg-valence-surface" value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* File list */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-valence-surface animate-pulse" />
          ))}
        </div>
      ) : files.length === 0 ? (
        <div className="rounded-lg border border-valence-border bg-valence-surface px-5 py-6 text-center">
          <Paperclip className="mx-auto h-4 w-4 text-valence-subtle" />
          <p className="mt-2 text-sm text-valence-muted">No files yet. Everything related to this deal lives here.</p>
        </div>
      ) : (
        <ul className="divide-y divide-valence-border/60 rounded-lg border border-valence-border bg-valence-elevated max-h-[60vh] overflow-y-auto">
          {files.map(f => (
            <li key={f.id} className="group flex items-center gap-3 px-3 py-2 hover:bg-valence-surface/60 transition">
              {isLink(f.path) ? <Link2 className="h-3.5 w-3.5 text-valence-blue shrink-0" /> : <FileText className="h-3.5 w-3.5 text-valence-subtle shrink-0" />}
              <a
                href={isLink(f.path) ? f.path : publicUrlFor(f.path)}
                target="_blank"
                rel="noreferrer"
                className="flex-1 min-w-0"
                title="Open in new tab"
              >
                <p className="truncate text-sm font-medium text-valence-text group-hover:text-valence-blue transition">{f.name}</p>
                <p className="text-[10px] text-valence-subtle tabular-nums truncate">
                  {f.category || 'Other'} · {isLink(f.path) ? 'Drive link · not stored' : formatBytes(f.size_bytes)} · {format(new Date(f.created_at), 'd MMM yyyy')}
                </p>
              </a>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition shrink-0">
                {!isLink(f.path) && (
                  <button
                    onClick={() => toggleWatermark(f)}
                    title={f.watermark_enabled ? 'Watermark on when shared' : 'Watermark off'}
                    className={`p-1.5 rounded-md hover:bg-valence-surface ${f.watermark_enabled ? 'text-valence-blue' : 'text-valence-subtle hover:text-valence-blue'}`}
                    aria-label="Toggle watermark"
                  >
                    <Droplets className="h-3 w-3" />
                  </button>
                )}
                <button onClick={() => remove(f)} className="p-1.5 rounded-md text-valence-subtle hover:bg-valence-surface hover:text-valence-danger" aria-label="Delete">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
