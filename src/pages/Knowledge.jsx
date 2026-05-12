import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { format, formatDistanceToNow } from 'date-fns'
import {
  Plus, Search, BookOpen, Tag as TagIcon, Hash, Trash2, Table as TableIcon,
  Sparkles, Download, Briefcase, ExternalLink, Loader2,
  Filter as FilterIcon, File as FileIcon, FolderTree
} from 'lucide-react'
import { supabase, isSupabaseConfigured, subscribeTable } from '../lib/supabase.js'
import { searchKnowledge, groupResults, filePublicUrl, deleteKnowledgeFile } from '../lib/knowledge.js'
import { embeddingsEnabled } from '../lib/embeddings.js'
import { useAuth } from '../hooks/useAuth.js'
import ConfigBanner from '../components/ConfigBanner.jsx'
import Modal from '../components/Modal.jsx'
import Drawer from '../components/Drawer.jsx'
import EmptyState from '../components/EmptyState.jsx'
import KnowledgeUpload from '../components/KnowledgeUpload.jsx'
import AskChat from '../components/AskChat.jsx'
import { WikilinkTextarea, WikilinkContent, useWikilinkEntities } from '../components/Wikilink.jsx'
import { useToast } from '../components/Toast.jsx'
import { useConfirm } from '../components/ConfirmDialog.jsx'
import { Bot } from 'lucide-react'
import { MandatesPanel } from './KnowledgeMandates.jsx'

const SOURCE_LABELS = {
  document:  { label: 'Memo',       icon: BookOpen,   color: 'text-valence-blue' },
  file:      { label: 'File',       icon: FileIcon,   color: 'text-valence-blue' },
  comp:      { label: 'Comp',       icon: TableIcon,  color: 'text-valence-success' },
  deal:      { label: 'Deal',       icon: Briefcase,  color: 'text-valence-text' },
  deal_file: { label: 'Deal file',  icon: FileIcon,   color: 'text-valence-warning' }
}

export default function Knowledge() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'ask'
  const setTab = (t) => {
    const next = new URLSearchParams(params)
    if (t === 'ask') next.delete('tab'); else next.set('tab', t)
    setParams(next, { replace: true })
  }
  return (
    <div className="space-y-6">
      <ConfigBanner />

      <div>
        <p className="vl-eyebrow-ink">Knowledge</p>
        <h1 className="mt-2 font-display text-feature font-bold text-valence-text">Everything the firm knows.</h1>
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-valence-border bg-valence-surface p-1 w-fit overflow-x-auto">
        <TabButton active={tab === 'ask'}      onClick={() => setTab('ask')}      icon={Bot}>Ask</TabButton>
        <TabButton active={tab === 'search'}   onClick={() => setTab('search')}   icon={Sparkles}>Search</TabButton>
        <TabButton active={tab === 'memos'}    onClick={() => setTab('memos')}    icon={BookOpen}>Memos</TabButton>
        <TabButton active={tab === 'files'}    onClick={() => setTab('files')}    icon={FileIcon}>Files</TabButton>
        <TabButton active={tab === 'comps'}    onClick={() => setTab('comps')}    icon={TableIcon}>Comps</TabButton>
        <TabButton active={tab === 'mandates'} onClick={() => setTab('mandates')} icon={FolderTree}>Mandate notes</TabButton>
      </div>

      {tab === 'ask'      && <AskChat />}
      {tab === 'search'   && <SearchPortal onSelectTab={setTab} />}
      {tab === 'memos'    && <Documents />}
      {tab === 'files'    && <FilesSection />}
      {tab === 'comps'    && <Comps />}
      {tab === 'mandates' && <MandatesPanel />}
    </div>
  )
}

function TabButton({ active, onClick, children, icon: Icon }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap ${
        active ? 'bg-valence-blue-soft text-valence-text' : 'text-valence-muted hover:text-valence-text'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  )
}

// ============ UNIFIED SEARCH PORTAL ============
function SearchPortal({ onSelectTab }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [mode, setMode] = useState('lexical')
  const [loading, setLoading] = useState(false)
  const [source, setSource] = useState('all')
  const [error, setError] = useState('')
  const debounceRef = useRef(null)
  const reqIdRef = useRef(0)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => run(q, source), 220)
    return () => clearTimeout(debounceRef.current)
  }, [q, source])

  async function run(query, src) {
    if (!isSupabaseConfigured) return
    const myReq = ++reqIdRef.current
    setLoading(true); setError('')
    try {
      const { results, mode } = await searchKnowledge(query, {
        matchCount: 30,
        sourceFilter: src === 'all' ? null : [src]
      })
      if (myReq !== reqIdRef.current) return
      setResults(results)
      setMode(mode)
    } catch (e) {
      if (myReq !== reqIdRef.current) return
      setError(e.message || 'Search failed')
      setResults([])
    } finally {
      if (myReq === reqIdRef.current) setLoading(false)
    }
  }

  const grouped = useMemo(() => groupResults(results), [results])

  function openResult(r) {
    if (r.source_type === 'document') navigate(`/knowledge?tab=memos&open=${r.source_id}`)
    else if (r.source_type === 'deal' || r.source_type === 'deal_file')
      navigate(`/deals?open=${r.metadata?.deal_id || r.source_id}`)
    else if (r.source_type === 'file') {
      supabase.from('knowledge_files').select('path').eq('id', r.source_id).single().then(({ data }) => {
        if (data?.path) window.open(filePublicUrl(data.path), '_blank')
        else toast.error('File not found.')
      })
    } else if (r.source_type === 'comp') {
      onSelectTab?.('comps')
    }
  }

  return (
    <div className="space-y-5">
      {/* Hero search */}
      <section className="relative overflow-hidden rounded-2xl border border-valence-border bg-white vl-circles py-16 px-8 lg:py-24 lg:px-14">
        <div className="absolute inset-0 bg-valence-grid opacity-50" aria-hidden />
        <div className="relative max-w-3xl z-10">
          <p className="vl-eyebrow">Firm-wide search</p>
          <h1 className="mt-5 font-display text-display font-bold text-valence-text">
            Everything Valence knows, one search away.
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-valence-muted lg:text-base">
            Memos, uploaded files, deal notes, precedent comps — indexed across the firm. {embeddingsEnabled()
              ? 'The AI reads your intent, not just your keywords.'
              : 'Add a Gemini key to unlock semantic search across meaning, not just text.'}
          </p>

          <div className="mt-8 flex items-center gap-3 rounded-xl border border-valence-border bg-white px-4 py-3 focus-within:border-valence-blue focus-within:ring-2 focus-within:ring-valence-blue-ring transition shadow-valence">
            <Search className="h-4 w-4 text-valence-blue" />
            <input
              value={q} onChange={e => setQ(e.target.value)} autoFocus
              placeholder={mode === 'hybrid'
                ? 'Ask in plain English — "pharma consolidation Mumbai", "healthcare thesis Q2"…'
                : 'Search memos, files, deal notes, comps…'}
              className="flex-1 bg-transparent text-sm text-valence-text placeholder:text-valence-subtle outline-none"
            />
            {loading ? <Loader2 className="h-4 w-4 text-valence-muted animate-spin" /> : <span className="vl-kbd">Live</span>}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-valence-subtle">
              <FilterIcon className="inline h-3 w-3 mr-1" /> Show
            </span>
            {[
              ['all',      'Everything'],
              ['document', 'Memos'],
              ['file',     'Files'],
              ['comp',     'Comps'],
              ['deal',     'Deals'],
              ['deal_file','Deal files']
            ].map(([id, label]) => (
              <button
                key={id} onClick={() => setSource(id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                  source === id ? 'border-valence-blue/40 bg-valence-blue-soft text-valence-blue' : 'border-valence-border bg-valence-surface text-valence-muted hover:text-valence-text'
                }`}
              >
                {label}
              </button>
            ))}
            <span className="ml-auto text-[10px] text-valence-subtle">
              {mode === 'hybrid' ? 'Hybrid (AI + keyword)' : 'Keyword search'}
            </span>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-valence-danger/30 bg-valence-danger/10 px-4 py-3 text-sm text-valence-danger">
          {error}
        </div>
      )}

      {/* Results */}
      {loading && grouped.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-valence-surface animate-pulse" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title={q ? 'Nothing matched' : 'Start typing to search the firm'}
          description={q ? 'Try fewer, broader keywords — or upload more memos and files to the knowledge base.' : 'Every memo, file, comp and deal note is searchable from this one bar.'}
        />
      ) : (
        <ul className="space-y-2">
          {grouped.map(r => <ResultRow key={`${r.source_type}:${r.source_id}`} r={r} onOpen={openResult} />)}
        </ul>
      )}
    </div>
  )
}

function ResultRow({ r, onOpen }) {
  const meta = SOURCE_LABELS[r.source_type] || SOURCE_LABELS.document
  const Icon = meta.icon
  return (
    <li
      onClick={() => onOpen(r)}
      className="group cursor-pointer rounded-xl border border-valence-border bg-valence-surface px-4 py-3 transition hover:border-valence-border-strong hover:bg-valence-surface"
    >
      <div className="flex items-start gap-3">
        <div className={`grid h-9 w-9 place-items-center rounded-lg bg-valence-blue-soft ring-1 ring-valence-blue/20 shrink-0 ${meta.color}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="truncate text-sm font-semibold text-valence-text group-hover:text-valence-blue transition">{r.title || '(untitled)'}</p>
            <span className="vl-chip">{meta.label}</span>
            {r.metadata?.sector && <span className="vl-chip-blue">{r.metadata.sector}</span>}
            {r.matchCount > 1 && <span className="text-[10px] text-valence-subtle">{r.matchCount} matching sections</span>}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-valence-muted" dangerouslySetInnerHTML={{ __html: highlight(r.snippet) }} />
        </div>
        <ExternalLink className="h-3.5 w-3.5 text-valence-subtle opacity-0 group-hover:opacity-100 transition" />
      </div>
    </li>
  )
}

function highlight(html) {
  if (!html) return ''
  // Postgres returns <<match>> wrappers; convert to styled spans, everything
  // else is escaped to prevent injection from arbitrary document text.
  const escaped = String(html).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  return escaped
    .replace(/&lt;&lt;/g, '<mark class="rounded bg-valence-blue/20 px-0.5 text-valence-blue">')
    .replace(/&gt;&gt;/g, '</mark>')
}

// ============ MEMOS (existing documents UI, upgraded) ============
function Documents() {
  const toast = useToast()
  const confirm = useConfirm()
  const [params, setParams] = useSearchParams()
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [sector, setSector] = useState('All')
  const [tag, setTag] = useState('All')
  const [open, setOpen] = useState(null)
  const [modal, setModal] = useState(false)

  useEffect(() => { load() }, [])
  useEffect(() => {
    if (!isSupabaseConfigured) return
    return subscribeTable('documents', load)
  }, [])
  useEffect(() => {
    const id = params.get('open')
    if (!id || docs.length === 0) return
    const doc = docs.find(d => d.id === id)
    if (doc) {
      setOpen(doc)
      const next = new URLSearchParams(params); next.delete('open'); setParams(next, { replace: true })
    }
  }, [params, docs])

  async function load() {
    setLoading(true)
    if (!isSupabaseConfigured) { setDocs([]); setLoading(false); return }
    const { data, error } = await supabase.from('documents').select('*').order('created_at', { ascending: false })
    if (error) toast.error(error.message)
    setDocs(data || [])
    setLoading(false)
  }

  const sectors = useMemo(() => Array.from(new Set(docs.map(d => d.sector).filter(Boolean))).sort(), [docs])
  const tags    = useMemo(() => Array.from(new Set(docs.flatMap(d => d.tags || []))).sort(), [docs])
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return docs.filter(d =>
      (sector === 'All' || d.sector === sector) &&
      (tag === 'All' || (d.tags || []).includes(tag)) &&
      (!needle ||
        d.title.toLowerCase().includes(needle) ||
        d.content.toLowerCase().includes(needle) ||
        (d.tags || []).some(t => t.toLowerCase().includes(needle)))
    )
  }, [docs, q, sector, tag])

  async function saveDoc(payload) {
    const { error } = await supabase.from('documents').insert(payload)
    if (error) return toast.error(error.message)
    setModal(false); load(); toast.success('Memo published.')
  }

  async function deleteDoc(doc) {
    const ok = await confirm({ title: 'Delete memo?', body: `"${doc.title}" will be removed.`, destructive: true, confirmLabel: 'Delete' })
    if (!ok) return
    const { error } = await supabase.from('documents').delete().eq('id', doc.id)
    if (error) return toast.error(error.message)
    load(); setOpen(null); toast.success('Memo deleted.')
  }

  return (
    <div className="space-y-5">
      <div className="vl-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-1 min-w-[240px] items-center gap-2 rounded-lg border border-valence-border bg-valence-surface px-3 py-2">
            <Search className="h-4 w-4 text-valence-blue" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter memos…" className="flex-1 bg-transparent text-sm text-valence-text placeholder:text-valence-subtle outline-none" />
          </div>
          <Select label="Sector" value={sector} onChange={setSector} options={['All', ...sectors]} />
          {tags.length > 0 && <Select label="Tag" value={tag} onChange={setTag} options={['All', ...tags]} />}
          <button onClick={() => setModal(true)} className="vl-btn-primary"><Plus className="h-4 w-4" /> New memo</button>
        </div>
      </div>

      {loading ? (
        <GridSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState icon={BookOpen} title="No memos yet" description="Publish thesis memos, playbooks, templates — anything the team refers back to." action={<button onClick={() => setModal(true)} className="vl-btn-primary"><Plus className="h-4 w-4" /> New memo</button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(d => (
            <article key={d.id} onClick={() => setOpen(d)} className="vl-card vl-card-hover group cursor-pointer p-5">
              <div className="flex items-center justify-between">
                {d.sector && <span className="vl-chip-blue">{d.sector}</span>}
                <span className="text-[11px] text-valence-subtle">{format(new Date(d.created_at), 'd MMM')}</span>
              </div>
              <h3 className="mt-3 text-base font-semibold leading-snug text-valence-text group-hover:text-valence-blue transition">{d.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-valence-muted line-clamp-4">{d.content}</p>
              {(d.tags || []).length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {(d.tags || []).slice(0, 4).map(t => (
                    <span key={t} className="inline-flex items-center gap-1 rounded-md border border-valence-border bg-valence-surface px-1.5 py-0.5 text-[10px] font-medium text-valence-muted">
                      <Hash className="h-2.5 w-2.5" />{t}
                    </span>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <Drawer
        open={Boolean(open)}
        onClose={() => setOpen(null)}
        title={open?.title || ''}
        footer={open && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-valence-muted">Added {format(new Date(open.created_at), 'd MMM yyyy')}</span>
            <button onClick={() => deleteDoc(open)} className="vl-btn-ghost text-valence-danger hover:text-valence-danger">
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
        )}
      >
        {open && <MemoBody open={open} />}
      </Drawer>

      <Modal open={modal} onClose={() => setModal(false)} title="New memo" description="Write a memo, template, or playbook. It becomes searchable for the whole team instantly." size="lg">
        <DocForm onCancel={() => setModal(false)} onSubmit={saveDoc} />
      </Modal>
    </div>
  )
}

// ============ FILES ============
function FilesSection() {
  const toast = useToast()
  const confirm = useConfirm()
  const { profile } = useAuth()
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => { load() }, [])
  useEffect(() => {
    if (!isSupabaseConfigured) return
    return subscribeTable('knowledge_files', load)
  }, [])

  async function load() {
    setLoading(true)
    if (!isSupabaseConfigured) { setFiles([]); setLoading(false); return }
    const { data, error } = await supabase.from('knowledge_files').select('*').order('created_at', { ascending: false })
    if (error) toast.error(error.message)
    setFiles(data || [])
    setLoading(false)
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return files
    return files.filter(f =>
      f.name.toLowerCase().includes(needle) ||
      (f.sector || '').toLowerCase().includes(needle) ||
      (f.tags || []).some(t => t.toLowerCase().includes(needle))
    )
  }, [files, q])

  async function remove(f) {
    const ok = await confirm({ title: 'Delete file?', body: `"${f.name}" will be removed from the knowledge base.`, destructive: true, confirmLabel: 'Delete' })
    if (!ok) return
    try {
      await deleteKnowledgeFile(f)
      toast.success('File deleted.')
      load()
    } catch (e) { toast.error(e.message) }
  }

  return (
    <div className="space-y-5">
      <div className="vl-card p-5">
        <KnowledgeUpload uploadedBy={profile?.email || null} onUploaded={load} />
      </div>

      <div className="vl-card p-4">
        <div className="flex items-center gap-2 rounded-lg border border-valence-border bg-valence-surface px-3 py-2">
          <Search className="h-3.5 w-3.5 text-valence-subtle" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter files by name, sector, tag…" className="flex-1 bg-transparent text-sm text-valence-text placeholder:text-valence-subtle outline-none" />
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-valence-surface animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={FileIcon} title={q ? 'No files match' : 'No files uploaded yet'} description={q ? 'Try fewer keywords.' : 'Upload PDFs, decks, NDAs, memos — anything the team needs to reference.'} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(f => <FileCard key={f.id} file={f} onDelete={remove} />)}
        </div>
      )}
    </div>
  )
}

function FileCard({ file, onDelete }) {
  const url = filePublicUrl(file.path)
  return (
    <article className="vl-card vl-card-hover p-4 group relative">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="block cursor-pointer"
        title="Open in new tab"
      >
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-valence-blue-soft ring-1 ring-valence-blue/20 shrink-0">
            <FileIcon className="h-4 w-4 text-valence-blue" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-semibold text-valence-text group-hover:text-valence-blue transition" title={file.name}>{file.name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-valence-muted">
              {file.sector && <span className="vl-chip-blue">{file.sector}</span>}
              {file.char_count > 0 && <span>{Math.round(file.char_count / 1000)}k chars</span>}
              <span className="text-valence-subtle">·</span>
              <span>{formatDistanceToNow(new Date(file.created_at), { addSuffix: true })}</span>
            </div>
            {(file.tags || []).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {file.tags.slice(0, 4).map(t => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-md border border-valence-border bg-valence-surface px-1.5 py-0.5 text-[10px] font-medium text-valence-muted">
                    <Hash className="h-2.5 w-2.5" />{t}
                  </span>
                ))}
              </div>
            )}
            {file.summary && <p className="mt-2 text-[11px] leading-relaxed text-valence-muted line-clamp-3">{file.summary}</p>}
          </div>
        </div>
      </a>

      <div className="mt-3 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition">
        <a href={url} target="_blank" rel="noreferrer" className="vl-btn-ghost" aria-label="Open">
          <Download className="h-3.5 w-3.5" />
        </a>
        <button onClick={() => onDelete(file)} className="vl-btn-ghost text-valence-subtle hover:text-valence-danger" aria-label="Delete">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </article>
  )
}

// ============ COMPS (unchanged UX) ============
function Comps() {
  const toast = useToast()
  const confirm = useConfirm()
  const [comps, setComps] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [sector, setSector] = useState('All')
  const [type, setType] = useState('All')
  const [modal, setModal] = useState(false)

  useEffect(() => { load() }, [])
  useEffect(() => { if (isSupabaseConfigured) return subscribeTable('comps', load) }, [])

  async function load() {
    setLoading(true)
    if (!isSupabaseConfigured) { setComps([]); setLoading(false); return }
    const { data, error } = await supabase.from('comps').select('*').order('year', { ascending: false })
    if (error) toast.error(error.message)
    setComps(data || [])
    setLoading(false)
  }

  const sectors = useMemo(() => Array.from(new Set(comps.map(c => c.sector).filter(Boolean))).sort(), [comps])
  const types   = useMemo(() => Array.from(new Set(comps.map(c => c.deal_type).filter(Boolean))).sort(), [comps])
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return comps.filter(c =>
      (sector === 'All' || c.sector === sector) &&
      (type === 'All' || c.deal_type === type) &&
      (!needle || [c.target, c.acquirer, c.sector, c.notes].some(v => (v || '').toLowerCase().includes(needle)))
    )
  }, [comps, q, sector, type])

  async function saveComp(payload) {
    const { error } = await supabase.from('comps').insert(payload)
    if (error) return toast.error(error.message)
    setModal(false); load(); toast.success('Comp added.')
  }
  async function deleteComp(c) {
    const ok = await confirm({ title: 'Delete this comp?', body: `${c.target} will be removed.`, destructive: true, confirmLabel: 'Delete' })
    if (!ok) return
    const { error } = await supabase.from('comps').delete().eq('id', c.id)
    if (error) return toast.error(error.message)
    load(); toast.success('Comp deleted.')
  }

  return (
    <div className="space-y-5">
      <div className="vl-card p-4">
        <p className="text-sm font-semibold text-valence-text">Precedent transactions</p>
        <p className="mt-0.5 text-xs text-valence-muted">Your internal comps library. Feed it every relevant deal — it sets pricing conversations.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex flex-1 min-w-[240px] items-center gap-2 rounded-lg border border-valence-border bg-valence-surface px-3 py-2">
            <Search className="h-3.5 w-3.5 text-valence-subtle" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search target, acquirer, sector…" className="flex-1 bg-transparent text-sm text-valence-text placeholder:text-valence-subtle outline-none" />
          </div>
          <Select label="Sector" value={sector} onChange={setSector} options={['All', ...sectors]} />
          <Select label="Type"   value={type}   onChange={setType}   options={['All', ...types]} />
          <button onClick={() => setModal(true)} className="vl-btn-primary"><Plus className="h-4 w-4" /> Add comp</button>
        </div>
      </div>

      {loading ? (
        <div className="vl-card p-4 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 rounded-lg bg-valence-surface animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={TableIcon} title="No comps yet" description="Add precedent transactions to build your pricing reference." action={<button onClick={() => setModal(true)} className="vl-btn-primary"><Plus className="h-4 w-4" /> Add comp</button>} />
      ) : (
        <div className="vl-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-valence-border text-left text-[11px] font-semibold uppercase tracking-wider text-valence-muted">
                  <th className="px-5 py-3.5">Target</th>
                  <th className="px-5 py-3.5">Acquirer</th>
                  <th className="px-5 py-3.5">Year</th>
                  <th className="px-5 py-3.5">Sector</th>
                  <th className="px-5 py-3.5">Type</th>
                  <th className="px-5 py-3.5 text-right">EV (USD M)</th>
                  <th className="px-5 py-3.5 text-right">Rev x</th>
                  <th className="px-5 py-3.5 text-right">EBITDA x</th>
                  <th className="px-5 py-3.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-valence-border">
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-valence-surface transition">
                    <td className="px-5 py-3 text-sm font-semibold text-valence-text">{c.target}</td>
                    <td className="px-5 py-3 text-xs text-valence-muted">{c.acquirer || '—'}</td>
                    <td className="px-5 py-3 text-xs text-valence-muted tabular-nums">{c.year || '—'}</td>
                    <td className="px-5 py-3"><span className="vl-chip">{c.sector || '—'}</span></td>
                    <td className="px-5 py-3"><span className="vl-chip">{c.deal_type || '—'}</span></td>
                    <td className="px-5 py-3 text-right text-xs font-semibold text-valence-blue tabular-nums">{c.ev_usd_m ? `$${Number(c.ev_usd_m).toLocaleString()}M` : '—'}</td>
                    <td className="px-5 py-3 text-right text-xs text-valence-text tabular-nums">{c.revenue_multiple ? `${Number(c.revenue_multiple).toFixed(1)}x` : '—'}</td>
                    <td className="px-5 py-3 text-right text-xs text-valence-text tabular-nums">{c.ebitda_multiple ? `${Number(c.ebitda_multiple).toFixed(1)}x` : '—'}</td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => deleteComp(c)} className="vl-btn-ghost text-valence-subtle hover:text-valence-danger" aria-label="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Add precedent transaction" size="lg">
        <CompForm onCancel={() => setModal(false)} onSubmit={saveComp} />
      </Modal>
    </div>
  )
}

function Select({ value, onChange, label, options }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-valence-border bg-valence-surface pl-3 pr-2 py-2 text-xs font-medium text-valence-muted">
      <span className="text-[11px] uppercase tracking-wider">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="bg-transparent pr-1 text-sm font-semibold text-valence-text outline-none">
        {options.map(o => <option key={o} className="bg-valence-surface" value={o}>{o}</option>)}
      </select>
    </label>
  )
}

// Memo detail body — renders [[wikilinks]] as clickable chips + tag/sector
// chips up top. Pulled into its own component so we can hook the entity
// universe via useWikilinkEntities (a hook can't live inline in JSX).
function MemoBody({ open }) {
  const entities = useWikilinkEntities()
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {open.sector && <span className="vl-chip-blue">{open.sector}</span>}
        {(open.tags || []).map(t => <span key={t} className="vl-chip"><Hash className="h-3 w-3" />{t}</span>)}
      </div>
      <div className="rounded-lg border border-valence-border bg-valence-surface px-4 py-4 text-sm">
        <WikilinkContent body={open.content} entities={entities} />
      </div>
    </div>
  )
}

function DocForm({ onSubmit, onCancel }) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tagsStr, setTagsStr] = useState('')
  const [sector, setSector] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const entities = useWikilinkEntities()

  async function submit(e) {
    e.preventDefault()
    if (!title.trim() || !content.trim()) return
    setSubmitting(true)
    const tags = tagsStr.split(',').map(t => t.trim()).filter(Boolean)
    await onSubmit({ title: title.trim(), content: content.trim(), tags, sector: sector.trim() || null })
    setSubmitting(false)
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="vl-label">Title</label>
        <input className="vl-input" value={title} onChange={e => setTitle(e.target.value)} required autoFocus />
      </div>
      <div>
        <label className="vl-label">Content</label>
        <WikilinkTextarea
          value={content}
          onChange={setContent}
          entities={entities}
          minHeight={220}
          placeholder={'Write the memo. Type [[ to link to a person, fund, mandate, or another memo.\n\nExample: "Met [[ to autocomplete a name."'}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="vl-label">Sector</label>
          <input className="vl-input" value={sector} onChange={e => setSector(e.target.value)} placeholder="e.g. Healthcare" />
        </div>
        <div>
          <label className="vl-label">Tags <span className="text-valence-subtle normal-case tracking-normal">(comma separated)</span></label>
          <input className="vl-input" value={tagsStr} onChange={e => setTagsStr(e.target.value)} placeholder="thesis, Q2, memo" />
        </div>
      </div>
      <div className="flex items-center justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="vl-btn-secondary">Cancel</button>
        <button type="submit" disabled={submitting} className="vl-btn-primary">
          <TagIcon className="h-4 w-4" /> {submitting ? 'Saving…' : 'Publish'}
        </button>
      </div>
    </form>
  )
}

function CompForm({ onSubmit, onCancel }) {
  const [form, setForm] = useState({ target: '', acquirer: '', year: '', sector: '', deal_type: 'M&A', ev_usd_m: '', revenue_multiple: '', ebitda_multiple: '', notes: '' })
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))
  async function submit(e) {
    e.preventDefault()
    if (!form.target.trim()) return
    await onSubmit({
      target: form.target.trim(),
      acquirer: form.acquirer.trim() || null,
      year: form.year ? Number(form.year) : null,
      sector: form.sector.trim() || null,
      deal_type: form.deal_type || null,
      ev_usd_m: form.ev_usd_m === '' ? null : Number(form.ev_usd_m),
      revenue_multiple: form.revenue_multiple === '' ? null : Number(form.revenue_multiple),
      ebitda_multiple:  form.ebitda_multiple  === '' ? null : Number(form.ebitda_multiple),
      notes: form.notes.trim() || null
    })
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div><label className="vl-label">Target</label><input className="vl-input" value={form.target} onChange={e => set('target', e.target.value)} required autoFocus /></div>
        <div><label className="vl-label">Acquirer / Investor</label><input className="vl-input" value={form.acquirer} onChange={e => set('acquirer', e.target.value)} /></div>
        <div><label className="vl-label">Year</label><input className="vl-input" type="number" value={form.year} onChange={e => set('year', e.target.value)} /></div>
        <div>
          <label className="vl-label">Type</label>
          <select className="vl-input" value={form.deal_type} onChange={e => set('deal_type', e.target.value)}>
            {['M&A','ECM','PE/VC','DCM'].map(t => <option key={t} className="bg-valence-surface" value={t}>{t}</option>)}
          </select>
        </div>
        <div className="col-span-2"><label className="vl-label">Sector</label><input className="vl-input" value={form.sector} onChange={e => set('sector', e.target.value)} /></div>
        <div><label className="vl-label">EV (USD M)</label><input className="vl-input" type="number" value={form.ev_usd_m} onChange={e => set('ev_usd_m', e.target.value)} /></div>
        <div><label className="vl-label">Revenue multiple</label><input className="vl-input" type="number" step="0.1" value={form.revenue_multiple} onChange={e => set('revenue_multiple', e.target.value)} /></div>
        <div className="col-span-2"><label className="vl-label">EBITDA multiple</label><input className="vl-input" type="number" step="0.1" value={form.ebitda_multiple} onChange={e => set('ebitda_multiple', e.target.value)} /></div>
        <div className="col-span-2"><label className="vl-label">Notes</label><WikilinkTextarea value={form.notes} onChange={v => set('notes', v)} entities={entities} minHeight={80} placeholder="Type [[ to link people / funds / mandates" /></div>
      </div>
      <div className="flex items-center justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="vl-btn-secondary">Cancel</button>
        <button type="submit" className="vl-btn-primary">Add</button>
      </div>
    </form>
  )
}

function GridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="vl-card p-5 animate-pulse">
          <div className="h-4 w-20 rounded-full bg-valence-surface" />
          <div className="mt-4 h-4 w-3/4 rounded bg-valence-surface" />
          <div className="mt-3 space-y-2">
            <div className="h-3 w-full rounded bg-valence-surface" />
            <div className="h-3 w-5/6 rounded bg-valence-surface" />
          </div>
        </div>
      ))}
    </div>
  )
}
