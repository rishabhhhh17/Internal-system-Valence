import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  FolderOpen, Search, ExternalLink, RefreshCw, Sparkles, AlertTriangle,
  FileText, Image as ImageIcon, FileSpreadsheet, FileCode, File
} from 'lucide-react'
import { listDriveFiles, GoogleAuthExpired, signInWithGoogle } from '../lib/google.js'
import { useAuth } from '../hooks/useAuth.js'
import { formatBytes } from '../lib/storage.js'
import { useToast } from '../components/Toast.jsx'
import ConfigBanner from '../components/ConfigBanner.jsx'
import EmptyState from '../components/EmptyState.jsx'

export default function Drive() {
  const toast = useToast()
  const { googleConnected } = useAuth()
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    if (googleConnected) load(debounced)
    else { setFiles([]); setError('') }
  }, [googleConnected, debounced])

  async function load(query = '') {
    setLoading(true); setError('')
    try {
      const data = await listDriveFiles({ q: query })
      setFiles(data)
    } catch (e) {
      if (e instanceof GoogleAuthExpired) setError('Google session expired. Reconnect to continue.')
      else setError(e.message || 'Could not load Drive files')
    } finally {
      setLoading(false)
    }
  }

  if (!googleConnected) {
    return (
      <div className="space-y-6">
        <ConfigBanner />
        <section className="relative overflow-hidden rounded-2xl border border-valence-border bg-valence-hero p-8 lg:p-12">
          <div className="absolute inset-0 bg-valence-grid opacity-40" aria-hidden />
          <div className="relative flex flex-col items-start gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-valence-blue-soft ring-1 ring-valence-blue/30">
              <FolderOpen className="h-5 w-5 text-valence-blue" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-valence-blue">Google Drive</p>
              <h1 className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight text-valence-text lg:text-3xl">
                Your Drive, inside ValanceOS.
              </h1>
              <p className="mt-2 max-w-xl text-sm text-valence-muted">
                Connect your Google account once — search and open every file without leaving the app.
              </p>
            </div>
            <button onClick={() => signInWithGoogle().catch(e => toast.error(e.message))} className="vl-btn-primary">
              <Sparkles className="h-4 w-4" /> Connect Google
            </button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <ConfigBanner />

      <div className="vl-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-1 min-w-[260px] items-center gap-2 rounded-lg border border-valence-border bg-valence-surface px-3 py-2 focus-within:border-valence-blue focus-within:ring-2 focus-within:ring-valence-blue-ring transition">
            <Search className="h-4 w-4 text-valence-blue" />
            <input
              value={q} onChange={e => setQ(e.target.value)}
              placeholder="Search your Drive — file name, doc, sheet, PDF…"
              className="flex-1 bg-transparent text-sm text-valence-text placeholder:text-valence-subtle outline-none"
              autoFocus
            />
          </div>
          <button onClick={() => load(debounced)} disabled={loading} className="vl-btn-secondary">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-3 rounded-xl border border-valence-warning/30 bg-valence-warning/5 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-valence-warning" />
          <div className="text-sm flex-1">
            <p className="font-semibold text-valence-text">{error}</p>
            <button onClick={() => signInWithGoogle().catch(() => {})} className="mt-1 text-[11px] font-semibold text-valence-blue hover:text-valence-text">
              Reconnect Google →
            </button>
          </div>
        </div>
      ) : loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-valence-surface animate-pulse" />
          ))}
        </div>
      ) : files.length === 0 ? (
        <EmptyState icon={FolderOpen} title={debounced ? 'No files match' : 'Drive is empty'} description={debounced ? 'Try a different search.' : 'Files will appear here as they are added to your Drive.'} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {files.map(f => <DriveCard key={f.id} file={f} />)}
        </div>
      )}
    </div>
  )
}

function DriveCard({ file }) {
  const Icon = iconFor(file.mimeType)
  const typeLabel = typeFor(file.mimeType)
  return (
    <a
      href={file.webViewLink}
      target="_blank" rel="noreferrer"
      className="vl-card vl-card-hover group block p-4"
    >
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-valence-blue-soft ring-1 ring-valence-blue/20 shrink-0">
          <Icon className="h-4 w-4 text-valence-blue" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-valence-text group-hover:text-valence-blue transition" title={file.name}>
            {file.name}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-valence-muted">
            <span className="inline-flex items-center rounded-md border border-valence-border bg-valence-surface px-1.5 py-0.5 font-semibold text-valence-blue">
              {typeLabel}
            </span>
            {file.size && <span>{formatBytes(Number(file.size))}</span>}
            {file.modifiedTime && (
              <>
                <span className="text-valence-subtle">·</span>
                <span>{formatDistanceToNow(new Date(file.modifiedTime), { addSuffix: true })}</span>
              </>
            )}
          </div>
        </div>
        <ExternalLink className="h-3.5 w-3.5 text-valence-subtle opacity-0 group-hover:opacity-100 transition" />
      </div>
    </a>
  )
}

function iconFor(mime = '') {
  if (mime.includes('spreadsheet')) return FileSpreadsheet
  if (mime.startsWith('image/'))     return ImageIcon
  if (mime.includes('document'))     return FileText
  if (mime.includes('pdf'))          return FileText
  if (mime.includes('folder'))       return FolderOpen
  if (mime.includes('script') || mime.includes('code')) return FileCode
  return File
}

function typeFor(mime = '') {
  if (mime === 'application/vnd.google-apps.document')     return 'Doc'
  if (mime === 'application/vnd.google-apps.spreadsheet')  return 'Sheet'
  if (mime === 'application/vnd.google-apps.presentation') return 'Slides'
  if (mime === 'application/vnd.google-apps.folder')       return 'Folder'
  if (mime === 'application/pdf')                          return 'PDF'
  if (mime.startsWith('image/'))                           return 'Image'
  return mime.split('/').pop() || 'File'
}
